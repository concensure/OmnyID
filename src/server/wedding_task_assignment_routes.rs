// @module-id: server.wedding-task-assignment-routes
// @primary-capability: explicit-idempotent-research-aware-task-delivery
// @locs-version: 1.0

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{sync::Arc, time::Duration};

use crate::{
    gateway::smtp_out::{OutgoingEmailAttachment, OutgoingEmailRequest, send_outgoing_email},
    message::AFPMessage,
};

use super::{
    AppState, RateLimitPolicy, app_to_proto,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_scope::resolve_wedding_scope,
};

#[derive(Deserialize)]
struct DeliveryRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    task_id: String,
    task_title: String,
    #[serde(default)]
    task_brief: String,
    #[serde(default)]
    due_label: String,
    assignee_name: String,
    assignee_email: String,
}

struct ResearchDocument {
    input_hash: String,
    recommendation: String,
    markdown: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/task-assignment/deliver", post(deliver_http))
        .layer(DefaultBodyLimit::max(32 * 1024))
}

fn bounded(value: &str, max: usize) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && value.chars().count() <= max).then(|| value.to_string())
}

fn plausible_email(value: &str) -> bool {
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !value.chars().any(char::is_whitespace)
        && value.len() <= 320
}

fn digest(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn assignment_fingerprint(
    owner_id: &str,
    request: &DeliveryRequest,
    research_hash: &str,
) -> String {
    digest(&format!(
        "{owner_id}\n{}\n{}\n{}\n{}\n{}\n{}\n{research_hash}",
        request.wedding_plan_id.trim(),
        request.response_workspace_id.trim(),
        request.task_id.trim(),
        request.task_title.trim(),
        request.assignee_name.trim(),
        request.assignee_email.trim().to_ascii_lowercase(),
    ))
}

fn email_body(
    sender: &str,
    request: &DeliveryRequest,
    research: Option<&ResearchDocument>,
) -> String {
    let brief = request.task_brief.trim();
    let due = request.due_label.trim();
    let mut paragraphs = vec![
        format!("Hello {},", request.assignee_name.trim()),
        format!(
            "{sender} assigned you this wedding planning task: {}.",
            request.task_title.trim()
        ),
    ];
    if !brief.is_empty() {
        paragraphs.push(format!("Task brief\n{brief}"));
    }
    paragraphs.push(format!(
        "Due\n{}",
        if due.is_empty() {
            "No due date has been set."
        } else {
            due
        }
    ));
    if let Some(research) = research {
        paragraphs.push(format!(
            "Relevant research\n{}\n\nThe complete evidence-backed research note is attached as a Markdown document.",
            research.recommendation
        ));
    }
    paragraphs.push("This assignment does not give access to the couple's private Wedding workspace. Ask the couple before sharing it with anyone else.".to_string());
    paragraphs.push("Warmly,\nOmnyID Wedding".to_string());
    paragraphs.join("\n\n")
}

fn assignment_message(
    id: &str,
    sender: &str,
    request: &DeliveryRequest,
    research: Option<&ResearchDocument>,
) -> AFPMessage {
    let recommendation = research.map(|item| item.recommendation.clone());
    let markdown = research.map(|item| item.markdown.clone());
    AFPMessage {
        id: id.to_string(),
        thread_id: format!("wedding-task-assignment:{}", request.task_id.trim()),
        from: "agent://wedding-planning".to_string(),
        to: vec![
            "agent://tasks".to_string(),
            "agent://wedding-planning".to_string(),
        ],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "delegation".to_string(),
        kind: Some("wedding_task_assignment_received".to_string()),
        subtype: Some("wedding_task_assignment_with_research".to_string()),
        supertags: vec![
            "template:wedding_planning".to_string(),
            "agent_to_agent".to_string(),
            "wedding_task_assignment".to_string(),
        ],
        content: json!({
            "kind": "wedding_task_assignment_received",
            "task_title": request.task_title.trim(),
            "task_brief": request.task_brief.trim(),
            "due_label": request.due_label.trim(),
            "assigned_by": sender,
            "research_recommendation": recommendation,
            "research_markdown": markdown,
            "access_granted": false,
            "summary": format!("{sender} assigned: {}", request.task_title.trim()),
        }),
        metadata: Some(json!({
            "origin": "wedding_task_assignment",
            "store": true,
            "recipient_private": true,
            "storage_scope": "recipient_tenant",
            "source_workspace_access_granted": false,
        })),
        views: vec![json!({
            "format": "a2ui",
            "priority": 1,
            "content": {
                "title": "Wedding task assigned to you",
                "summary": request.task_title.trim(),
                "status": "open",
                "rows": [
                    {"label": "Assigned by", "value": sender},
                    {"label": "Due", "value": request.due_label.trim()},
                    {"label": "Research", "value": if research.is_some() { "Attached" } else { "No linked research" }},
                ]
            }
        })],
        store_in_relational: true,
        ..Default::default()
    }
}

async fn latest_research(
    state: &AppState,
    user_id: &str,
    plan_id: &str,
    task_id: &str,
) -> Result<Option<ResearchDocument>, (StatusCode, String)> {
    let row = sqlx::query("SELECT input_hash,recommendation,report_markdown FROM wedding_decision_research_cache WHERE user_id=$1 AND wedding_plan_id=$2 AND task_id=$3 ORDER BY created_at DESC LIMIT 1")
        .bind(user_id).bind(plan_id).bind(task_id)
        .fetch_optional(&state.db.pool).await
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    Ok(row.map(|row| ResearchDocument {
        input_hash: row.get("input_hash"),
        recommendation: row.get("recommendation"),
        markdown: row.get("report_markdown"),
    }))
}

async fn store_recipient_handoff(
    state: &AppState,
    recipient_user_id: &str,
    message: AFPMessage,
) -> Result<bool, (StatusCode, String)> {
    state
        .db
        .ensure_user_private_schema(recipient_user_id)
        .await
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    let content = message.content.clone();
    state
        .db
        .store_private_message(recipient_user_id, &app_to_proto(message), content)
        .await
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
}

async fn deliver_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DeliveryRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let actor = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_task_assignment_delivery", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(3_600),
        },
    )
    .await?;
    let plan_id = bounded(&request.wedding_plan_id, 160).ok_or((
        StatusCode::BAD_REQUEST,
        "Wedding plan is required.".to_string(),
    ))?;
    let workspace_id = bounded(&request.response_workspace_id, 160).ok_or((
        StatusCode::BAD_REQUEST,
        "Wedding workspace is required.".to_string(),
    ))?;
    let scope = resolve_wedding_scope(&state.db, &actor.id, &plan_id, &workspace_id).await?;
    bounded(&request.task_id, 200)
        .ok_or((StatusCode::BAD_REQUEST, "Task is required.".to_string()))?;
    bounded(&request.task_title, 240).ok_or((
        StatusCode::BAD_REQUEST,
        "Task title is required.".to_string(),
    ))?;
    bounded(&request.assignee_name, 120)
        .ok_or((StatusCode::BAD_REQUEST, "Assignee is required.".to_string()))?;
    let recipient_email = request.assignee_email.trim().to_ascii_lowercase();
    if !plausible_email(&recipient_email) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Add a valid assignee email before sending the task.".to_string(),
        ));
    }
    if request.task_brief.chars().count() > 4_000 || request.due_label.chars().count() > 160 {
        return Err((
            StatusCode::BAD_REQUEST,
            "The assignment is too large.".to_string(),
        ));
    }

    let research = latest_research(
        &state,
        &scope.owner_user_id,
        &scope.wedding_plan_id,
        request.task_id.trim(),
    )
    .await?;
    let research_hash = research
        .as_ref()
        .map(|item| item.input_hash.as_str())
        .unwrap_or("none");
    let fingerprint = assignment_fingerprint(&scope.owner_user_id, &request, research_hash);
    let delivery_id = format!("wedding-task-delivery-{}", &fingerprint[..24]);
    let email_digest = digest(&recipient_email);
    let recipient = state
        .db
        .find_user_by_email(&recipient_email)
        .await
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
        .filter(|user| user.id != actor.id);
    let existing = sqlx::query("SELECT status,provider_message_id,agent_message_id FROM wedding_task_assignment_deliveries WHERE owner_user_id=$1 AND assignment_fingerprint=$2")
        .bind(&scope.owner_user_id).bind(&fingerprint).fetch_optional(&state.db.pool).await
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    if let Some(row) = existing {
        if row.get::<String, _>("status") == "sent" {
            return Ok(Json(json!({
                "sent": true,
                "already_delivered": true,
                "research_attached": research.is_some(),
                "agent_delivered": row.get::<Option<String>, _>("agent_message_id").is_some(),
                "provider_message_id": row.get::<Option<String>, _>("provider_message_id"),
            })));
        }
    }
    sqlx::query("INSERT INTO wedding_task_assignment_deliveries (delivery_id,owner_user_id,actor_user_id,recipient_email_digest,recipient_user_id,wedding_plan_id,response_workspace_id,task_id,assignment_fingerprint,research_input_hash,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'prepared') ON CONFLICT (owner_user_id,assignment_fingerprint) DO NOTHING")
        .bind(&delivery_id).bind(&scope.owner_user_id).bind(&actor.id).bind(&email_digest).bind(recipient.as_ref().map(|user| user.id.as_str()))
        .bind(&scope.wedding_plan_id).bind(&scope.response_workspace_id).bind(request.task_id.trim())
        .bind(&fingerprint).bind(research.as_ref().map(|item| item.input_hash.as_str()))
        .execute(&state.db.pool).await.map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    let claimed = sqlx::query_scalar::<_, String>("UPDATE wedding_task_assignment_deliveries SET status='sending',last_error=NULL,updated_at=NOW() WHERE owner_user_id=$1 AND assignment_fingerprint=$2 AND (status IN ('prepared','failed') OR (status='sending' AND updated_at < NOW() - INTERVAL '5 minutes')) RETURNING delivery_id")
        .bind(&scope.owner_user_id).bind(&fingerprint).fetch_optional(&state.db.pool).await
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    if claimed.is_none() {
        return Ok(Json(json!({
            "sent": false,
            "already_delivered": false,
            "research_attached": research.is_some(),
            "agent_delivered": false,
            "message": "This assignment is already being delivered. Wait a moment before trying again.",
        })));
    }

    let agent_message_id = if let Some(recipient) = &recipient {
        let message_id = format!("wedding-task-agent-{}", &fingerprint[..24]);
        let stored = store_recipient_handoff(
            &state,
            &recipient.id,
            assignment_message(
                &message_id,
                &actor.display_name,
                &request,
                research.as_ref(),
            ),
        )
        .await?;
        (stored || !message_id.is_empty()).then_some(message_id)
    } else {
        None
    };

    let message_id = format!("wedding-task-email-{}", &fingerprint[..24]);
    let attachments = research
        .as_ref()
        .map(|document| {
            vec![OutgoingEmailAttachment {
                attachment_id: format!("research-{}", &document.input_hash[..16]),
                file_name: "wedding-task-research.md".to_string(),
                media_type: "text/markdown; charset=utf-8".to_string(),
                bytes: document.markdown.as_bytes().to_vec(),
            }]
        })
        .unwrap_or_default();
    let outgoing = OutgoingEmailRequest {
        thread_id: format!("wedding-task-assignment:{}", request.task_id.trim()),
        message_id: message_id.clone(),
        parent_id: None,
        to: vec![recipient_email],
        subject: format!(
            "{} assigned you: {}",
            actor.display_name,
            request.task_title.trim()
        ),
        body: email_body(&actor.display_name, &request, research.as_ref()),
        in_reply_to: None,
        references: vec![],
        attachments,
    };
    match send_outgoing_email(&outgoing).await {
        Ok(()) => {
            sqlx::query("UPDATE wedding_task_assignment_deliveries SET status='sent',provider_message_id=$1,agent_message_id=$2,last_error=NULL,updated_at=NOW() WHERE delivery_id=$3")
                .bind(&message_id).bind(&agent_message_id).bind(&delivery_id).execute(&state.db.pool).await
                .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
            Ok(Json(json!({
                "sent": true,
                "already_delivered": false,
                "research_attached": research.is_some(),
                "agent_delivered": agent_message_id.is_some(),
                "provider_message_id": message_id,
            })))
        }
        Err(error) => {
            let safe_error = error.chars().take(500).collect::<String>();
            sqlx::query("UPDATE wedding_task_assignment_deliveries SET status='failed',agent_message_id=$1,last_error=$2,updated_at=NOW() WHERE delivery_id=$3")
                .bind(&agent_message_id).bind(&safe_error).bind(&delivery_id).execute(&state.db.pool).await
                .map_err(|db_error| (StatusCode::INTERNAL_SERVER_ERROR, db_error.to_string()))?;
            Ok(Json(json!({
                "sent": false,
                "already_delivered": false,
                "research_attached": research.is_some(),
                "agent_delivered": agent_message_id.is_some(),
                "message": "The assignment was saved, but its email could not be sent. Try Assign again.",
            })))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> DeliveryRequest {
        DeliveryRequest {
            wedding_plan_id: "plan-1".into(),
            response_workspace_id: "workspace-1".into(),
            task_id: "task-1".into(),
            task_title: "Confirm transport".into(),
            task_brief: "Check accessible arrival and return travel.".into(),
            due_label: "1 December 2027".into(),
            assignee_name: "Alex".into(),
            assignee_email: "alex@example.com".into(),
        }
    }

    #[test]
    fn assignment_fingerprint_changes_with_research_revision() {
        let first = assignment_fingerprint("owner", &request(), "research-a");
        let second = assignment_fingerprint("owner", &request(), "research-b");
        assert_ne!(first, second);
        assert_eq!(first.len(), 64);
    }

    #[test]
    fn email_mentions_attachment_only_when_research_exists() {
        let research = ResearchDocument {
            input_hash: "a".repeat(64),
            recommendation: "Confirm the accessible pickup point.".into(),
            markdown: "# Research".into(),
        };
        assert!(
            email_body("Mia", &request(), Some(&research))
                .contains("complete evidence-backed research note is attached")
        );
        assert!(!email_body("Mia", &request(), None).contains("research note is attached"));
    }

    #[test]
    fn recipient_message_grants_no_workspace_access() {
        let message = assignment_message("message-1", "Mia", &request(), None);
        assert_eq!(message.content["access_granted"], false);
        assert_eq!(
            message.metadata.as_ref().unwrap()["source_workspace_access_granted"],
            false
        );
        assert_eq!(
            message.metadata.as_ref().unwrap()["storage_scope"],
            "recipient_tenant"
        );
        assert!(!message.content.to_string().contains("workspace-1"));
    }
}
