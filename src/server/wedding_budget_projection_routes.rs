//! Canonical couple-side Wedding budget projections.
//!
//! Budget allocations and contributions remain the existing AFP decision
//! messages. This route only selects the canonical Wedding ledger and rejects
//! every other message shape.

use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    enforce_rate_limit, proto_to_app, status_to_http, store_private_app_message,
    wedding_scope::resolve_wedding_scope,
};
use crate::message::AFPMessage;
use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::{sync::Arc, time::Duration};

const BUDGET_TAG: &str = "wedding_budget";
const ALLOCATION_ARTIFACT_ID: &str = "wedding-budget-allocation";
const CONTRIBUTION_ARTIFACT_PREFIX: &str = "wedding-budget-contribution:";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/budget/projections",
        get(list_http).post(store_http),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BudgetProjectionQuery {
    wedding_plan_id: String,
    response_workspace_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BudgetProjectionRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    expected_revision: i64,
    message: AFPMessage,
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.to_string())
}

fn storage_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(error_kind = ?error.as_database_error().map(|value| value.kind()), "Wedding budget projection storage failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Wedding budget changes could not be checked just now.".into(),
    )
}

fn string<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str).map(str::trim)
}

fn budget_artifact_id(message: &AFPMessage) -> Option<&str> {
    string(&message.content, "artifact_id").filter(|value| !value.is_empty())
}

fn budget_revision(message: &AFPMessage) -> Option<i64> {
    let metadata = message.metadata.as_ref()?;
    metadata
        .get("budgetRevision")
        .or_else(|| metadata.get("budget_revision"))
        .and_then(Value::as_i64)
        .filter(|revision| *revision > 0)
}

fn current_artifact_revision(messages: &[AFPMessage], artifact_id: &str) -> i64 {
    messages
        .iter()
        .filter(|message| budget_artifact_id(message) == Some(artifact_id))
        .map(|message| budget_revision(message).unwrap_or(1))
        .max()
        .unwrap_or(0)
}

fn exact_scope(value: &Value, plan: &str, workspace: &str) -> bool {
    let value_plan = string(value, "wedding_plan_id").or_else(|| string(value, "weddingPlanId"));
    let value_workspace =
        string(value, "response_workspace_id").or_else(|| string(value, "responseWorkspaceId"));
    value_plan == Some(plan) && value_workspace == Some(workspace)
}

fn is_budget_projection(message: &AFPMessage, plan: &str, workspace: &str) -> bool {
    let content = &message.content;
    let metadata = message.metadata.as_ref().unwrap_or(&Value::Null);
    let artifact_id = string(content, "artifact_id").unwrap_or_default();
    let selected_option_id = content
        .get("selected_option")
        .and_then(|value| string(value, "id"))
        .unwrap_or_default();
    let allocation = artifact_id == ALLOCATION_ARTIFACT_ID && selected_option_id == "total-budget";
    let contribution = artifact_id.starts_with(CONTRIBUTION_ARTIFACT_PREFIX)
        && selected_option_id == "budget-contribution";

    message.subtype.as_deref() == Some("wedding_decision_selection")
        && string(content, "kind") == Some("wedding_decision_selection")
        && string(content, "artifact_kind") == Some("budget_sheet")
        && (allocation || contribution)
        && exact_scope(content, plan, workspace)
        && exact_scope(metadata, plan, workspace)
        && message.supertags.iter().any(|tag| tag == BUDGET_TAG)
}

fn attributed_metadata(
    current: Option<Value>,
    owner_user_id: &str,
    actor_user_id: &str,
    artifact_id: &str,
    revision: i64,
) -> Value {
    let mut metadata = current
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_else(Map::new);
    metadata.insert("ownerUserId".into(), Value::String(owner_user_id.into()));
    metadata.insert("actorUserId".into(), Value::String(actor_user_id.into()));
    metadata.insert("budgetArtifactId".into(), Value::String(artifact_id.into()));
    metadata.insert("budgetRevision".into(), Value::Number(revision.into()));
    Value::Object(metadata)
}

async fn list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<BudgetProjectionQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let actor = authenticated_user(&state.db, &headers).await?;
    let scope = resolve_wedding_scope(
        &state.db,
        &actor.id,
        &query.wedding_plan_id,
        &query.response_workspace_id,
    )
    .await?;
    state
        .db
        .ensure_user_private_schema(&scope.owner_user_id)
        .await
        .map_err(storage_error)?;
    let tag = vec![BUDGET_TAG.to_string()];
    let messages = state
        .db
        .list_private_messages_by_supertags(&scope.owner_user_id, &tag, None, true, 101, 0)
        .await
        .map_err(storage_error)?;
    let has_more = messages.len() > 100;
    let messages = messages
        .into_iter()
        .map(proto_to_app)
        .filter(|message| {
            is_budget_projection(
                message,
                &scope.wedding_plan_id,
                &scope.response_workspace_id,
            )
        })
        .take(100)
        .collect::<Vec<_>>();
    let count = messages.len();
    Ok(Json(json!({
        "messages": messages,
        "count": count,
        "limit": 100,
        "offset": 0,
        "next_offset": if has_more { Some(100) } else { None },
        "has_more": has_more,
        "tags": [BUDGET_TAG],
        "resolved_tags": [BUDGET_TAG],
        "match": "all",
        "hierarchy_requested": false,
        "hierarchy_expanded": false
    })))
}

async fn store_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut request): Json<BudgetProjectionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_budget_projection", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let actor = authenticated_user(&state.db, &headers).await?;
    let scope = resolve_wedding_scope(
        &state.db,
        &actor.id,
        &request.wedding_plan_id,
        &request.response_workspace_id,
    )
    .await?;
    if !is_budget_projection(
        &request.message,
        &scope.wedding_plan_id,
        &scope.response_workspace_id,
    ) {
        return Err(bad_request(
            "Only this Wedding's budget allocation or contribution can be saved here.",
        ));
    }
    if request.expected_revision < 0 {
        return Err(bad_request("Budget expected revision cannot be negative."));
    }
    let artifact_id = budget_artifact_id(&request.message)
        .ok_or_else(|| bad_request("A budget artifact id is required."))?
        .to_string();
    state
        .db
        .ensure_user_private_schema(&scope.owner_user_id)
        .await
        .map_err(storage_error)?;
    let lock_key = format!(
        "wedding-budget:{}:{}:{}:{}",
        scope.owner_user_id, scope.wedding_plan_id, scope.response_workspace_id, artifact_id
    );
    let mut lock = state.db.pool.begin().await.map_err(storage_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(&lock_key)
        .execute(&mut *lock)
        .await
        .map_err(storage_error)?;
    let messages = state
        .db
        .list_private_messages_by_supertags(
            &scope.owner_user_id,
            &[BUDGET_TAG.to_string()],
            None,
            true,
            1000,
            0,
        )
        .await
        .map_err(storage_error)?
        .into_iter()
        .map(proto_to_app)
        .filter(|message| {
            is_budget_projection(
                message,
                &scope.wedding_plan_id,
                &scope.response_workspace_id,
            )
        })
        .collect::<Vec<_>>();
    let current_revision = current_artifact_revision(&messages, &artifact_id);
    if request.expected_revision != current_revision {
        return Err((
            StatusCode::CONFLICT,
            format!(
                "wedding_budget_revision_conflict: expected {}, current {}. This shared budget changed elsewhere; refresh and review it before saving again.",
                request.expected_revision, current_revision
            ),
        ));
    }
    let next_revision = current_revision + 1;
    request.message.metadata = Some(attributed_metadata(
        request.message.metadata,
        &scope.owner_user_id,
        &actor.id,
        &artifact_id,
        next_revision,
    ));
    let message_id = request.message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &scope.owner_user_id,
        request.message,
    )
    .await
    .map_err(status_to_http)?;
    lock.commit().await.map_err(storage_error)?;
    Ok(Json(json!({
        "success": true,
        "message_id": message_id,
        "owner_user_id": scope.owner_user_id,
        "actor_user_id": actor.id,
        "revision": next_revision
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(artifact_id: &str, option_id: &str) -> AFPMessage {
        AFPMessage {
            subtype: Some("wedding_decision_selection".into()),
            supertags: vec![BUDGET_TAG.into()],
            content: json!({
                "kind":"wedding_decision_selection",
                "artifact_id":artifact_id,
                "artifact_kind":"budget_sheet",
                "selected_option":{"id":option_id},
                "wedding_plan_id":"plan-one",
                "response_workspace_id":"workspace-one"
            }),
            metadata: Some(json!({
                "wedding_plan_id":"plan-one",
                "response_workspace_id":"workspace-one"
            })),
            ..AFPMessage::default()
        }
    }

    #[test]
    fn accepts_only_existing_budget_decision_shapes_in_the_exact_scope() {
        assert!(is_budget_projection(
            &message(ALLOCATION_ARTIFACT_ID, "total-budget"),
            "plan-one",
            "workspace-one"
        ));
        assert!(is_budget_projection(
            &message(
                "wedding-budget-contribution:workspace-one:alex",
                "budget-contribution"
            ),
            "plan-one",
            "workspace-one"
        ));
        assert!(!is_budget_projection(
            &message(
                "wedding-budget-contribution:workspace-one:alex",
                "budget-contribution"
            ),
            "plan-one",
            "guessed"
        ));
        assert!(!is_budget_projection(
            &message("vendor-comparison", "venue-a"),
            "plan-one",
            "workspace-one"
        ));
    }

    #[test]
    fn derives_legacy_and_explicit_revisions_per_budget_artifact() {
        let legacy = message(ALLOCATION_ARTIFACT_ID, "total-budget");
        let mut revision_two = message(ALLOCATION_ARTIFACT_ID, "total-budget");
        revision_two.metadata.as_mut().unwrap()["budgetRevision"] = json!(2);
        let contribution = message(
            "wedding-budget-contribution:workspace-one:alex",
            "budget-contribution",
        );

        assert_eq!(current_artifact_revision(&[], ALLOCATION_ARTIFACT_ID), 0);
        assert_eq!(
            current_artifact_revision(&[legacy.clone()], ALLOCATION_ARTIFACT_ID),
            1
        );
        assert_eq!(
            current_artifact_revision(
                &[legacy, revision_two, contribution],
                ALLOCATION_ARTIFACT_ID
            ),
            2
        );
    }
}
