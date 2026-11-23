use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::{
    message::AFPMessage,
    planning_intelligence::{
        ConstraintEvaluation, ConstraintEvaluationPresentation, PlanningIntelligenceFeatureFlags,
        evaluate_active_constraints, project_constraint_messages,
        project_ranked_quotation_candidate_snapshot,
    },
    quotation::replay_quotation_messages,
};

use super::{AppState, auth::authenticated_user, proto_to_app};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/planning/constraint-evaluations",
        post(evaluate_constraints_http),
    )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EvaluateConstraintsRequest {
    thread_id: String,
    plan_id: String,
    comparison_id: String,
    quotation_version_id: String,
}

#[derive(Debug, Serialize)]
struct EvaluationItem {
    evaluation: ConstraintEvaluation,
    presentation: ConstraintEvaluationPresentation,
}

#[derive(Debug, Serialize)]
struct EvaluateConstraintsResponse {
    candidate_revision_ref: String,
    evaluations: Vec<EvaluationItem>,
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

async fn evaluate_constraints_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<EvaluateConstraintsRequest>,
) -> Result<Json<EvaluateConstraintsResponse>, (StatusCode, String)> {
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
    let replay = replay_quotation_messages(&messages);
    let quotation = replay
        .versions
        .get(&request.quotation_version_id)
        .filter(|quotation| {
            replay
                .active_version_by_quotation
                .get(&quotation.identity.quotation_id)
                == Some(&quotation.identity.version_id)
        })
        .ok_or((
            StatusCode::CONFLICT,
            "quotation revision is stale or unavailable".to_string(),
        ))?;
    let comparison = replay
        .active_comparisons
        .get(&request.comparison_id)
        .ok_or((
            StatusCode::CONFLICT,
            "quotation comparison is stale or unavailable".to_string(),
        ))?;
    let candidate = comparison
        .candidates
        .iter()
        .find(|candidate| candidate.version_id == request.quotation_version_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            "quotation candidate not found".to_string(),
        ))?;
    let comparison_message_id = replay
        .comparison_message_ids
        .get(&request.comparison_id)
        .ok_or((
            StatusCode::CONFLICT,
            "quotation comparison evidence is unavailable".to_string(),
        ))?;
    let observed_at = message_time(&messages, comparison_message_id).ok_or((
        StatusCode::CONFLICT,
        "quotation comparison evidence is unavailable".to_string(),
    ))?;
    let snapshot = project_ranked_quotation_candidate_snapshot(
        &constraints,
        quotation,
        candidate,
        comparison_message_id,
        observed_at,
    )
    .map_err(|_| bad_request("quotation evidence cannot be evaluated"))?;
    let evaluations = evaluate_active_constraints(&constraints, &snapshot)
        .map_err(|_| bad_request("planning constraints cannot be evaluated"))?
        .into_iter()
        .map(|(evaluation, presentation)| EvaluationItem {
            evaluation,
            presentation,
        })
        .collect();
    Ok(Json(EvaluateConstraintsResponse {
        candidate_revision_ref: snapshot.revision_ref,
        evaluations,
    }))
}

fn valid_request(request: &EvaluateConstraintsRequest) -> Result<(), (StatusCode, String)> {
    for value in [
        &request.thread_id,
        &request.plan_id,
        &request.comparison_id,
        &request.quotation_version_id,
    ] {
        if value.trim().is_empty() || value.len() > 180 || value.chars().any(char::is_control) {
            return Err(bad_request("invalid planning evaluation request"));
        }
    }
    Ok(())
}

fn message_time<'a>(messages: &'a [AFPMessage], message_id: &str) -> Option<&'a str> {
    messages
        .iter()
        .find(|message| message.id == message_id)
        .map(|message| message.timestamp.as_str())
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.to_string())
}

fn store_error(_: impl ToString) -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "planning evaluation source is unavailable".to_string(),
    )
}
