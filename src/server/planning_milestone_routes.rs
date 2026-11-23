use std::{collections::BTreeMap, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::{NaiveDate, TimeZone, Utc};
use serde::Deserialize;

use crate::{
    message::AFPMessage,
    planning_intelligence::{
        MilestoneEvidence, MilestoneEvidenceSourceKind, MilestonePlanProjection,
        ObservedMilestoneState, PlanningIntelligenceFeatureFlags, project_wedding_milestones,
    },
};

use super::{AppState, auth::authenticated_user, proto_to_app};

const WEDDING_TAG: &str = "wedding";
const MAX_SOURCE_MESSAGES: i64 = 500;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/planning/milestones/project", post(project_http))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct MilestoneProjectionRequest {
    plan_id: String,
}

#[derive(Clone)]
struct SourceEvidence {
    observed_at: String,
    message_id: String,
    evidence: MilestoneEvidence,
}

async fn project_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<MilestoneProjectionRequest>,
) -> Result<Json<MilestonePlanProjection>, (StatusCode, String)> {
    require_enabled()?;
    validate_identifier(&request.plan_id)?;
    let user = authenticated_user(&state.db, &headers).await?;
    let tags = vec![WEDDING_TAG.to_string()];
    let (tasks, calendar, decisions) = tokio::try_join!(
        state.db.list_private_messages_by_supertags(
            &user.id,
            &tags,
            Some("task"),
            false,
            MAX_SOURCE_MESSAGES,
            0,
        ),
        state.db.list_private_messages_by_supertags(
            &user.id,
            &tags,
            Some("event"),
            false,
            MAX_SOURCE_MESSAGES,
            0,
        ),
        state.db.list_private_messages_by_supertags(
            &user.id,
            &tags,
            Some("note"),
            false,
            MAX_SOURCE_MESSAGES,
            0,
        ),
    )
    .map_err(|_| unavailable("planning timeline unavailable"))?;
    let tasks = tasks.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let calendar = calendar.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let decisions = decisions.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let event_at = current_wedding_date(&request.plan_id, &calendar, &decisions);
    let evidence = current_milestone_evidence(&request.plan_id, &tasks, &calendar);
    let anchor = Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("midnight is valid")
        .and_utc()
        .to_rfc3339();
    let projection =
        project_wedding_milestones(&request.plan_id, &anchor, event_at.as_deref(), evidence)
            .map_err(|_| conflict("milestone projection could not be prepared"))?;
    Ok(Json(projection))
}

fn require_enabled() -> Result<(), (StatusCode, String)> {
    PlanningIntelligenceFeatureFlags::from_env()
        .critical_path
        .then_some(())
        .ok_or_else(|| unavailable("milestone guidance unavailable"))
}

fn current_wedding_date(
    plan_id: &str,
    calendar: &[AFPMessage],
    decisions: &[AFPMessage],
) -> Option<String> {
    let mut candidates = Vec::<(String, String, String)>::new();
    for message in decisions {
        let content = object(&message.content);
        if string(content, "wedding_plan_id") != Some(plan_id)
            || string(content, "kind") != Some("wedding_decision_selection")
            || !string(content, "artifact_id")
                .is_some_and(|value| value.starts_with("wedding_date:"))
        {
            continue;
        }
        let selected = content
            .get("selected_option")
            .and_then(|value| value.as_object());
        let selected_id = selected.and_then(|value| string(value, "id"));
        let Some(date) = selected_id.and_then(|value| value.strip_prefix("wedding-date-")) else {
            continue;
        };
        if valid_date(date) {
            candidates.push((
                message.timestamp.clone(),
                message.id.clone(),
                format!("{date}T09:00:00Z"),
            ));
        }
    }
    for message in calendar {
        let content = object(&message.content);
        if string(content, "wedding_plan_id") != Some(plan_id)
            || !string(content, "wedding_schedule_item_id")
                .is_some_and(|value| value.starts_with("wedding_date:"))
        {
            continue;
        }
        let Some(start_at) = string(content, "start_at") else {
            continue;
        };
        if chrono::DateTime::parse_from_rfc3339(start_at).is_ok() {
            candidates.push((
                message.timestamp.clone(),
                message.id.clone(),
                start_at.to_string(),
            ));
        }
    }
    candidates.sort();
    candidates.pop().map(|(_, _, value)| value)
}

fn current_milestone_evidence(
    plan_id: &str,
    tasks: &[AFPMessage],
    calendar: &[AFPMessage],
) -> Vec<MilestoneEvidence> {
    let mut current = BTreeMap::<(String, String), SourceEvidence>::new();
    for (message, source_kind) in tasks
        .iter()
        .map(|message| (message, MilestoneEvidenceSourceKind::Task))
        .chain(
            calendar
                .iter()
                .map(|message| (message, MilestoneEvidenceSourceKind::Calendar)),
        )
    {
        let content = object(&message.content);
        if string(content, "wedding_plan_id") != Some(plan_id) {
            continue;
        }
        let Some(key) = milestone_key(content) else {
            continue;
        };
        let source_ref = match source_kind {
            MilestoneEvidenceSourceKind::Task => {
                string(content, "task_id").or_else(|| string(content, "wedding_task_item_id"))
            }
            MilestoneEvidenceSourceKind::Calendar => {
                string(content, "event_id").or_else(|| string(content, "wedding_schedule_item_id"))
            }
        }
        .unwrap_or(&message.id)
        .to_string();
        let status = string(content, "status").unwrap_or("");
        let state = observed_state(status, &source_kind);
        let manual_due_at = match source_kind {
            MilestoneEvidenceSourceKind::Task => {
                string(content, "due_at").or_else(|| string(content, "due_date"))
            }
            MilestoneEvidenceSourceKind::Calendar => string(content, "start_at"),
        }
        .filter(|value| chrono::DateTime::parse_from_rfc3339(value).is_ok())
        .map(str::to_string);
        let evidence = MilestoneEvidence {
            milestone_id: format!("milestone:{plan_id}:{key}"),
            source_ref: source_ref.clone(),
            source_revision_ref: message.id.clone(),
            source_kind: source_kind.clone(),
            state,
            manual_date_source_ref: manual_due_at.as_ref().map(|_| message.id.clone()),
            manual_due_at,
        };
        let candidate = SourceEvidence {
            observed_at: message.timestamp.clone(),
            message_id: message.id.clone(),
            evidence,
        };
        let map_key = (source_kind_label(&source_kind).to_string(), source_ref);
        let replace = current.get(&map_key).is_none_or(|existing| {
            (&candidate.observed_at, &candidate.message_id)
                > (&existing.observed_at, &existing.message_id)
        });
        if replace {
            current.insert(map_key, candidate);
        }
    }
    let mut evidence = current
        .into_values()
        .map(|value| value.evidence)
        .collect::<Vec<_>>();
    evidence.sort_by(|left, right| {
        (
            &left.milestone_id,
            &left.source_ref,
            &left.source_revision_ref,
        )
            .cmp(&(
                &right.milestone_id,
                &right.source_ref,
                &right.source_revision_ref,
            ))
    });
    evidence
}

fn milestone_key(content: &serde_json::Map<String, serde_json::Value>) -> Option<&str> {
    let value = string(content, "wedding_milestone_key")?;
    matches!(
        value,
        "guest_count_draft"
            | "accommodation_blocks"
            | "stationery_details"
            | "invitations_ready"
            | "invitations_sent"
            | "guest_count_final"
            | "vendor_final_counts"
            | "event_ready"
    )
    .then_some(value)
}

fn observed_state(
    status: &str,
    source_kind: &MilestoneEvidenceSourceKind,
) -> ObservedMilestoneState {
    match status.trim().to_ascii_lowercase().as_str() {
        "complete" | "completed" | "done" => ObservedMilestoneState::Complete,
        "waived" | "cancelled" | "canceled" | "archived" => ObservedMilestoneState::Waived,
        "active" | "in_progress" | "in-progress" | "executing" => ObservedMilestoneState::Active,
        "blocked" => ObservedMilestoneState::Blocked,
        "open" | "pending" | "not_started" | "not-started" | "todo" => {
            ObservedMilestoneState::NotStarted
        }
        "confirmed" | "tentative" if *source_kind == MilestoneEvidenceSourceKind::Calendar => {
            ObservedMilestoneState::NotStarted
        }
        _ => ObservedMilestoneState::Unknown,
    }
}

fn source_kind_label(value: &MilestoneEvidenceSourceKind) -> &'static str {
    match value {
        MilestoneEvidenceSourceKind::Task => "task",
        MilestoneEvidenceSourceKind::Calendar => "calendar",
    }
}

fn object(value: &serde_json::Value) -> &serde_json::Map<String, serde_json::Value> {
    value.as_object().unwrap_or_else(|| empty_object())
}

fn empty_object() -> &'static serde_json::Map<String, serde_json::Value> {
    static EMPTY: std::sync::OnceLock<serde_json::Map<String, serde_json::Value>> =
        std::sync::OnceLock::new();
    EMPTY.get_or_init(serde_json::Map::new)
}

fn string<'a>(value: &'a serde_json::Map<String, serde_json::Value>, key: &str) -> Option<&'a str> {
    value.get(key).and_then(serde_json::Value::as_str)
}

fn valid_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
        && NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .ok()
            .and_then(|date| {
                Utc.from_local_datetime(&date.and_hms_opt(9, 0, 0)?)
                    .single()
            })
            .is_some()
}

fn validate_identifier(value: &str) -> Result<(), (StatusCode, String)> {
    if value.trim().is_empty()
        || value.len() > 180
        || value.contains('@')
        || value.chars().any(char::is_whitespace)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid milestone request".to_string(),
        ));
    }
    Ok(())
}

fn conflict(message: &str) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.to_string())
}

fn unavailable(message: &str) -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, message.to_string())
}
