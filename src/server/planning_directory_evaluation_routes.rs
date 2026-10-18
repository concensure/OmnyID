use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::planning_intelligence::{
    ConstraintEvaluation, ConstraintEvaluationPresentation, DirectoryAttributeEvidence,
    DirectoryCandidateEvidence, PlanningIntelligenceFeatureFlags, evaluate_active_constraints,
    project_constraint_messages, project_directory_candidate_snapshot,
};

use super::{AppState, auth::authenticated_user, proto_to_app};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/planning/directory-constraint-evaluations",
        post(evaluate_directory_constraints_http),
    )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EvaluateDirectoryConstraintsRequest {
    thread_id: String,
    plan_id: String,
    vendor_id: String,
}

#[derive(Debug, Serialize)]
struct DirectoryEvaluationItem {
    evaluation: ConstraintEvaluation,
    presentation: ConstraintEvaluationPresentation,
}

#[derive(Debug, Serialize)]
struct EvaluateDirectoryConstraintsResponse {
    candidate_revision_ref: String,
    evaluations: Vec<DirectoryEvaluationItem>,
}

async fn evaluate_directory_constraints_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<EvaluateDirectoryConstraintsRequest>,
) -> Result<Json<EvaluateDirectoryConstraintsResponse>, (StatusCode, String)> {
    require_enabled()?;
    valid_request(&request)?;
    let user = authenticated_user(&state.db, &headers).await?;
    let messages = state
        .db
        .get_private_thread(&user.id, &request.thread_id)
        .await
        .map_err(store_error)?;
    if messages.is_empty() {
        return Err((StatusCode::NOT_FOUND, "thread not found".to_string()));
    }
    let messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let ledger = project_constraint_messages(&messages, &request.plan_id)
        .map_err(|_| bad_request("planning constraints are not evaluable"))?;
    let constraints = ledger
        .active
        .iter()
        .map(|projected| projected.constraint.clone())
        .collect::<Vec<_>>();
    let vendor = state
        .db
        .list_active_wedding_vendors_for_user(&user.id, 2, Some(&request.vendor_id))
        .await
        .map_err(store_error)?
        .into_iter()
        .find(|vendor| vendor.vendor_id == request.vendor_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            "directory candidate not found".to_string(),
        ))?;
    let attributes = state
        .db
        .list_wedding_vendor_attributes(std::slice::from_ref(&vendor.vendor_id))
        .await
        .map_err(store_error)?
        .remove(&vendor.vendor_id)
        .unwrap_or_default()
        .into_iter()
        .map(|attribute| DirectoryAttributeEvidence {
            key: attribute.attribute_key,
            value: attribute.value,
            status: attribute.status,
            authority: attribute.authority,
            retrieved_at: attribute.retrieved_at,
            valid_until: attribute.valid_until,
        })
        .collect();
    let source = DirectoryCandidateEvidence {
        candidate_ref: vendor.vendor_id,
        category: vendor.category,
        service_area: vendor.service_area,
        updated_at: vendor.updated_at,
        attributes,
    };
    let snapshot = project_directory_candidate_snapshot(
        &constraints,
        &source,
        &chrono::Utc::now().to_rfc3339(),
    )
    .map_err(|_| bad_request("directory evidence cannot be evaluated"))?;
    let evaluations = evaluate_active_constraints(&constraints, &snapshot)
        .map_err(|_| bad_request("planning constraints cannot be evaluated"))?
        .into_iter()
        .map(|(evaluation, presentation)| DirectoryEvaluationItem {
            evaluation,
            presentation,
        })
        .collect();
    Ok(Json(EvaluateDirectoryConstraintsResponse {
        candidate_revision_ref: snapshot.revision_ref,
        evaluations,
    }))
}

fn require_enabled() -> Result<(), (StatusCode, String)> {
    let flags = PlanningIntelligenceFeatureFlags::from_env();
    (flags.constraint_ledger && flags.evaluation)
        .then_some(())
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "planning evaluation unavailable".to_string(),
            )
        })
}

fn valid_request(
    request: &EvaluateDirectoryConstraintsRequest,
) -> Result<(), (StatusCode, String)> {
    for value in [&request.thread_id, &request.plan_id, &request.vendor_id] {
        if value.trim().is_empty() || value.len() > 180 || value.chars().any(char::is_control) {
            return Err(bad_request("invalid directory evaluation request"));
        }
    }
    Ok(())
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.to_string())
}

fn store_error(_: impl ToString) -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "directory evaluation source is unavailable".to_string(),
    )
}
