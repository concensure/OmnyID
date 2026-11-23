use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    message::AFPMessage,
    planning_intelligence::{
        ConstraintAuthority, ConstraintLedgerProjection, ConstraintStatus, PlanningConstraint,
        PlanningIntelligenceFeatureFlags, planning_constraint_message, project_constraint_messages,
        validate_constraint_ingress, validate_constraint_ledger_policy,
        validate_constraint_successor,
    },
};

use super::{
    AppState,
    auth::{authenticated_user, store_private_app_message},
    proto_to_app,
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/planning/constraints",
        get(list_constraints_http).post(append_constraint_http),
    )
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum AppendAuthority {
    Proposal,
    UserConfirmed,
    UserRemoval,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AppendConstraintRequest {
    thread_id: String,
    authority: AppendAuthority,
    constraint: PlanningConstraint,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ListConstraintsQuery {
    thread_id: String,
    plan_id: String,
}

#[derive(Debug, Serialize)]
struct AppendConstraintResponse {
    inserted: bool,
    message_id: String,
    projection: ConstraintLedgerProjection,
}

fn require_enabled() -> Result<(), (StatusCode, String)> {
    PlanningIntelligenceFeatureFlags::from_env()
        .constraint_ledger
        .then_some(())
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "planning constraint ledger unavailable".to_string(),
            )
        })
}

async fn list_constraints_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ListConstraintsQuery>,
) -> Result<Json<ConstraintLedgerProjection>, (StatusCode, String)> {
    require_enabled()?;
    let user = authenticated_user(&state.db, &headers).await?;
    let messages = state
        .db
        .get_private_thread(&user.id, &query.thread_id)
        .await
        .map_err(internal_store_error)?;
    if messages.is_empty() {
        return Err((StatusCode::NOT_FOUND, "thread not found".to_string()));
    }
    let messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let projection = project_constraint_messages(&messages, &query.plan_id).map_err(bad_request)?;
    Ok(Json(projection))
}

async fn append_constraint_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AppendConstraintRequest>,
) -> Result<Json<AppendConstraintResponse>, (StatusCode, String)> {
    require_enabled()?;
    let user = authenticated_user(&state.db, &headers).await?;
    let lock_key = format!(
        "planning-constraint:{}:{}:{}",
        user.id, request.thread_id, request.constraint.plan_id
    );
    let mut serial = state.db.pool.begin().await.map_err(internal_store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(lock_key)
        .execute(&mut *serial)
        .await
        .map_err(internal_store_error)?;
    let messages = state
        .db
        .get_private_thread(&user.id, &request.thread_id)
        .await
        .map_err(internal_store_error)?;
    if messages.is_empty() {
        return Err((StatusCode::NOT_FOUND, "thread not found".to_string()));
    }
    let mut messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    validate_constraint_ledger_policy(&request.constraint).map_err(bad_request)?;
    validate_append_authority(&request).map_err(bad_request)?;
    validate_source_binding(&messages, &request.constraint).map_err(bad_request)?;

    if let Some(predecessor_id) = request.constraint.supersedes.as_deref() {
        let predecessor = messages
            .iter()
            .filter_map(|message| {
                crate::planning_intelligence::constraint_from_message(message)
                    .ok()
                    .flatten()
            })
            .find(|constraint| constraint.constraint_id == predecessor_id)
            .ok_or_else(|| bad_request("constraint predecessor is missing from ledger"))?;
        validate_constraint_successor(&predecessor, &request.constraint, true)
            .map_err(bad_request)?;
    }

    let message = planning_constraint_message(
        &request.thread_id,
        &format!("user://{}", user.id),
        &request.constraint,
    );
    messages.push(message.clone());
    let projection =
        project_constraint_messages(&messages, &request.constraint.plan_id).map_err(bad_request)?;
    let inserted = store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message.clone(),
    )
    .await
    .map_err(|status| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            status.message().to_string(),
        )
    })?;
    serial.commit().await.map_err(internal_store_error)?;
    Ok(Json(AppendConstraintResponse {
        inserted,
        message_id: message.id,
        projection,
    }))
}

fn validate_append_authority(request: &AppendConstraintRequest) -> Result<(), String> {
    match request.authority {
        AppendAuthority::Proposal => {
            validate_constraint_ingress(&request.constraint, &request.constraint.plan_id, false)?;
            if !matches!(
                request.constraint.authority,
                ConstraintAuthority::Imported | ConstraintAuthority::Deterministic
            ) || request.constraint.status != ConstraintStatus::Proposed
            {
                return Err("proposal ingress cannot claim confirmation authority".to_string());
            }
        }
        AppendAuthority::UserConfirmed => {
            validate_constraint_ingress(&request.constraint, &request.constraint.plan_id, true)?;
            if request.constraint.authority != ConstraintAuthority::User
                || request.constraint.status != ConstraintStatus::Confirmed
            {
                return Err(
                    "user confirmation must be explicit in the canonical record".to_string()
                );
            }
        }
        AppendAuthority::UserRemoval => {
            validate_constraint_ingress(&request.constraint, &request.constraint.plan_id, true)?;
            if request.constraint.authority != ConstraintAuthority::User
                || request.constraint.status != ConstraintStatus::Removed
                || request.constraint.supersedes.is_none()
            {
                return Err("removal must be a user-authorized successor tombstone".to_string());
            }
        }
    }
    Ok(())
}

fn validate_source_binding(
    messages: &[AFPMessage],
    constraint: &PlanningConstraint,
) -> Result<(), String> {
    let source = messages
        .iter()
        .find(|message| message.id == constraint.source_ref)
        .ok_or_else(|| "constraint source is not present in the owned thread".to_string())?;
    if !value_contains_exact_text(&source.content, &constraint.source_anchor.exact_excerpt) {
        return Err("constraint excerpt is not present in the exact source message".to_string());
    }
    if let Some(expected_version) = constraint.source_anchor.source_version_id.as_deref() {
        let stored_version = source
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("source_version_id"))
            .or_else(|| source.content.get("source_version_id"))
            .and_then(Value::as_str);
        if stored_version != Some(expected_version) {
            return Err("constraint source version binding mismatch".to_string());
        }
    }
    Ok(())
}

fn value_contains_exact_text(value: &Value, expected: &str) -> bool {
    match value {
        Value::String(text) => text.contains(expected),
        Value::Array(values) => values
            .iter()
            .any(|value| value_contains_exact_text(value, expected)),
        Value::Object(values) => values
            .values()
            .any(|value| value_contains_exact_text(value, expected)),
        _ => false,
    }
}

fn bad_request(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

fn internal_store_error(_: impl ToString) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "constraint ledger persistence failed".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::value_contains_exact_text;

    #[test]
    fn source_excerpt_searches_text_leaves_but_not_keys() {
        let value = json!({"body": "The entrance must stay step-free.", "nested": ["other"]});
        assert!(value_contains_exact_text(&value, "must stay step-free"));
        assert!(!value_contains_exact_text(&value, "nested"));
    }
}
