//! Canonical couple-side Wedding seating projections.
//!
//! Seating constraints, optimisation results and draft archive lifecycle
//! events remain the existing AFP messages. This route only selects the
//! canonical Wedding ledger, applies optimistic revisions and rejects every
//! other message shape.

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

const SEATING_TAG: &str = "wedding_seating";
const PLAN_ARTIFACT_ID: &str = "wedding-seating-current-plan";
const CONSTRAINT_ARTIFACT_PREFIX: &str = "wedding-seating-constraint:";
const ARCHIVE_ARTIFACT_PREFIX: &str = "wedding-seating-draft-archive:";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/seating/projections",
        get(list_http).post(store_http),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SeatingProjectionQuery {
    wedding_plan_id: String,
    response_workspace_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SeatingProjectionRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    expected_revision: i64,
    message: AFPMessage,
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.to_string())
}

fn storage_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(error_kind = ?error.as_database_error().map(|value| value.kind()), "Wedding seating projection storage failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Wedding seating changes could not be checked just now.".into(),
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

fn reference_matches(message: &AFPMessage, reference_type: &str, target: &str) -> bool {
    message.references.iter().any(|reference| {
        string(reference, "type") == Some(reference_type)
            && string(reference, "target") == Some(target)
    })
}

fn seating_artifact_id(message: &AFPMessage) -> Option<String> {
    let kind = message.kind.as_deref().or(message.subtype.as_deref())?;
    match kind {
        "wedding_seating_optimization" => Some(PLAN_ARTIFACT_ID.into()),
        "wedding_seating_constraint" => string(&message.content, "constraint_id")
            .filter(|value| !value.is_empty())
            .map(|value| format!("{CONSTRAINT_ARTIFACT_PREFIX}{value}")),
        "wedding_seating_draft_archive" => string(&message.content, "seating_draft_fingerprint")
            .filter(|value| !value.is_empty())
            .map(|value| format!("{ARCHIVE_ARTIFACT_PREFIX}{value}")),
        _ => None,
    }
}

fn seating_revision(message: &AFPMessage) -> Option<i64> {
    let metadata = message.metadata.as_ref()?;
    metadata
        .get("seatingRevision")
        .or_else(|| metadata.get("seating_revision"))
        .and_then(Value::as_i64)
        .filter(|revision| *revision > 0)
}

fn current_artifact_revision(messages: &[AFPMessage], artifact_id: &str) -> i64 {
    messages
        .iter()
        .filter(|message| seating_artifact_id(message).as_deref() == Some(artifact_id))
        .map(|message| seating_revision(message).unwrap_or(1))
        .max()
        .unwrap_or(0)
}

fn is_seating_projection(message: &AFPMessage, plan: &str, workspace: &str) -> bool {
    let Some(kind) = message.kind.as_deref().or(message.subtype.as_deref()) else {
        return false;
    };
    if message.kind.as_deref() != Some(kind)
        || message.subtype.as_deref() != Some(kind)
        || string(&message.content, "ledger_kind") != Some(kind)
        || !matches!(
            kind,
            "wedding_seating_constraint"
                | "wedding_seating_optimization"
                | "wedding_seating_draft_archive"
        )
        || !message.supertags.iter().any(|tag| tag == SEATING_TAG)
        || !exact_scope(
            message.metadata.as_ref().unwrap_or(&Value::Null),
            plan,
            workspace,
        )
        || !reference_matches(message, "wedding_plan", plan)
        || !reference_matches(message, "response_workspace", workspace)
    {
        return false;
    }

    match kind {
        "wedding_seating_constraint" => {
            string(&message.content, "constraint_id").is_some()
                && string(&message.content, "constraint_kind").is_some()
                && string(&message.content, "instruction").is_some()
        }
        "wedding_seating_optimization" => {
            string(&message.content, "assignment_fingerprint").is_some()
                && message
                    .content
                    .get("assignments")
                    .and_then(Value::as_array)
                    .is_some_and(|assignments| !assignments.is_empty())
        }
        "wedding_seating_draft_archive" => {
            let action = string(&message.content, "archive_action").unwrap_or("hide");
            string(&message.content, "seating_draft_fingerprint").is_some()
                && matches!(action, "hide" | "restore")
        }
        _ => false,
    }
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
    metadata.insert(
        "seatingArtifactId".into(),
        Value::String(artifact_id.into()),
    );
    metadata.insert("seatingRevision".into(), Value::Number(revision.into()));
    Value::Object(metadata)
}

async fn canonical_messages(
    state: &AppState,
    owner_user_id: &str,
    plan: &str,
    workspace: &str,
    limit: i64,
) -> Result<Vec<AFPMessage>, (StatusCode, String)> {
    state
        .db
        .list_private_messages_by_supertags(
            owner_user_id,
            &[SEATING_TAG.to_string()],
            None,
            true,
            limit,
            0,
        )
        .await
        .map_err(storage_error)
        .map(|messages| {
            messages
                .into_iter()
                .map(proto_to_app)
                .filter(|message| is_seating_projection(message, plan, workspace))
                .collect()
        })
}

async fn list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<SeatingProjectionQuery>,
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
    let messages = canonical_messages(
        &state,
        &scope.owner_user_id,
        &scope.wedding_plan_id,
        &scope.response_workspace_id,
        251,
    )
    .await?;
    let has_more = messages.len() > 250;
    let messages = messages.into_iter().take(250).collect::<Vec<_>>();
    let count = messages.len();
    Ok(Json(json!({
        "messages": messages,
        "count": count,
        "limit": 250,
        "offset": 0,
        "next_offset": if has_more { Some(250) } else { None },
        "has_more": has_more,
        "tags": [SEATING_TAG],
        "resolved_tags": [SEATING_TAG],
        "match": "all",
        "hierarchy_requested": false,
        "hierarchy_expanded": false
    })))
}

async fn store_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut request): Json<SeatingProjectionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_seating_projection", &headers),
        RateLimitPolicy {
            max_requests: 45,
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
    if !is_seating_projection(
        &request.message,
        &scope.wedding_plan_id,
        &scope.response_workspace_id,
    ) {
        return Err(bad_request(
            "Only this Wedding's seating constraints, plans or draft archive changes can be saved here.",
        ));
    }
    if request.expected_revision < 0 {
        return Err(bad_request("Seating expected revision cannot be negative."));
    }
    let artifact_id = seating_artifact_id(&request.message)
        .ok_or_else(|| bad_request("A seating artifact id is required."))?;
    state
        .db
        .ensure_user_private_schema(&scope.owner_user_id)
        .await
        .map_err(storage_error)?;
    let lock_key = format!(
        "wedding-seating:{}:{}:{}:{}",
        scope.owner_user_id, scope.wedding_plan_id, scope.response_workspace_id, artifact_id
    );
    let mut lock = state.db.pool.begin().await.map_err(storage_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(&lock_key)
        .execute(&mut *lock)
        .await
        .map_err(storage_error)?;
    let messages = canonical_messages(
        &state,
        &scope.owner_user_id,
        &scope.wedding_plan_id,
        &scope.response_workspace_id,
        1000,
    )
    .await?;
    let current_revision = current_artifact_revision(&messages, &artifact_id);
    if request.expected_revision != current_revision {
        return Err((
            StatusCode::CONFLICT,
            format!(
                "wedding_seating_revision_conflict: expected {}, current {}. This shared seating plan changed elsewhere; refresh and review it before saving again.",
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
    // The AFP validator requires a ULID message id. Mint it server-side so
    // applying an older draft again always appends instead of replaying its
    // original deterministic client id.
    request.message.id = ulid::Ulid::new().to_string();
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
        "artifact_id": artifact_id,
        "revision": next_revision
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn message(kind: &str) -> AFPMessage {
        let content = match kind {
            "wedding_seating_constraint" => json!({
                "ledger_kind": kind,
                "constraint_id": "keep-apart-one-two",
                "constraint_kind": "keep_apart",
                "instruction": "Keep one away from two"
            }),
            "wedding_seating_draft_archive" => json!({
                "ledger_kind": kind,
                "seating_draft_fingerprint": "one:table-1",
                "archive_action": "hide"
            }),
            _ => json!({
                "ledger_kind": kind,
                "assignment_fingerprint": "one:table-1",
                "assignments": [{"personId":"one","tableId":"table-1"}]
            }),
        };
        AFPMessage {
            kind: Some(kind.into()),
            subtype: Some(kind.into()),
            supertags: vec![SEATING_TAG.into()],
            content,
            metadata: Some(json!({
                "weddingPlanId":"plan-one",
                "responseWorkspaceId":"workspace-one"
            })),
            references: vec![
                json!({"type":"wedding_plan","target":"plan-one"}),
                json!({"type":"response_workspace","target":"workspace-one"}),
            ],
            ..AFPMessage::default()
        }
    }

    #[test]
    fn accepts_only_existing_seating_shapes_in_the_exact_scope() {
        for kind in [
            "wedding_seating_constraint",
            "wedding_seating_optimization",
            "wedding_seating_draft_archive",
        ] {
            assert!(is_seating_projection(
                &message(kind),
                "plan-one",
                "workspace-one"
            ));
            assert!(!is_seating_projection(
                &message(kind),
                "plan-one",
                "guessed"
            ));
        }
        assert!(!is_seating_projection(
            &message("wedding_decision_selection"),
            "plan-one",
            "workspace-one"
        ));
    }

    #[test]
    fn derives_revisions_per_seating_artifact() {
        let legacy = message("wedding_seating_optimization");
        let mut revision_two = message("wedding_seating_optimization");
        revision_two.metadata.as_mut().unwrap()["seatingRevision"] = json!(2);
        let archive = message("wedding_seating_draft_archive");
        assert_eq!(current_artifact_revision(&[], PLAN_ARTIFACT_ID), 0);
        assert_eq!(
            current_artifact_revision(&[legacy.clone()], PLAN_ARTIFACT_ID),
            1
        );
        assert_eq!(
            current_artifact_revision(&[legacy, revision_two, archive], PLAN_ARTIFACT_ID),
            2
        );
    }
}
