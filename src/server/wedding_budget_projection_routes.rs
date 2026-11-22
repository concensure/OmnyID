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

fn attributed_metadata(current: Option<Value>, owner_user_id: &str, actor_user_id: &str) -> Value {
    let mut metadata = current
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_else(Map::new);
    metadata.insert("ownerUserId".into(), Value::String(owner_user_id.into()));
    metadata.insert("actorUserId".into(), Value::String(actor_user_id.into()));
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
    request.message.metadata = Some(attributed_metadata(
        request.message.metadata,
        &scope.owner_user_id,
        &actor.id,
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
    Ok(Json(json!({
        "success": true,
        "message_id": message_id,
        "owner_user_id": scope.owner_user_id,
        "actor_user_id": actor.id
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
}
