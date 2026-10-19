//! Authenticated persistence and replay routes for template-neutral quotations.

mod clarification_routes;
mod closure_evidence_routes;
mod closure_routes;
mod decision_routes;

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};

use crate::quotation::{
    ComparableScenario, ComparisonCandidate, NormalisedQuotation, QuotationReviewCommand,
    QuotationReviewSuccessor, RequirementAssessment, apply_review_action,
    calculate_comparable_total, compare_quotations, normalised_quotation_message,
    quotation_comparison_message, quotation_review_message, replay_quotation_messages,
    validate_normalised_quotation,
};

use super::{
    AppState,
    auth::{authenticated_user, store_private_app_message, thread_messages_for_headers},
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/quotation/normalisations", post(store_normalisation_http))
        .route("/quotation/reviews", post(store_review_http))
        .route("/quotation/comparisons", post(store_comparison_http))
        .route("/quotation/state", get(quotation_state_http))
        .merge(decision_routes::routes())
        .merge(closure_evidence_routes::routes())
        .merge(closure_routes::routes())
        .merge(clarification_routes::routes())
}

#[derive(Deserialize)]
struct StoreNormalisationRequest {
    thread_id: String,
    quotation: NormalisedQuotation,
    #[serde(default)]
    parent_message_id: Option<String>,
}

#[derive(Deserialize)]
struct StoreReviewRequest {
    thread_id: String,
    command: QuotationReviewCommand,
}

#[derive(Deserialize)]
struct ComparisonInput {
    version_id: String,
    #[serde(default)]
    requirements: Vec<RequirementAssessment>,
}

#[derive(Deserialize)]
struct StoreComparisonRequest {
    thread_id: String,
    comparison_id: String,
    scenario: ComparableScenario,
    inputs: Vec<ComparisonInput>,
}

#[derive(Deserialize)]
struct StateQuery {
    thread_id: String,
}

#[derive(Serialize)]
pub(super) struct StoredResponse {
    pub(super) message_ids: Vec<String>,
}

fn valid_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && value.len() <= 180 && !value.chars().any(char::is_control)
}

async fn visible_messages(
    state: &AppState,
    headers: &HeaderMap,
    thread_id: &str,
) -> Result<Vec<crate::message::AFPMessage>, (StatusCode, String)> {
    if !valid_id(thread_id) {
        return Err((StatusCode::BAD_REQUEST, "invalid thread_id".to_string()));
    }
    thread_messages_for_headers(&state.db, headers, thread_id)
        .await
        .map(|messages| messages.into_iter().map(super::proto_to_app).collect())
}

fn store_error() -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "quotation event was not stored".to_string(),
    )
}

pub(super) fn parent_message_for_version<'a>(
    messages: &'a [crate::message::AFPMessage],
    version_id: &str,
) -> Option<&'a crate::message::AFPMessage> {
    messages.iter().find(|message| {
        message
            .content
            .get("quotation")
            .and_then(|value| value.get("identity"))
            .and_then(|value| value.get("version_id"))
            .and_then(serde_json::Value::as_str)
            == Some(version_id)
    })
}

fn requirement_sources_valid(
    requirements: &[RequirementAssessment],
    quotation: &NormalisedQuotation,
) -> bool {
    let sources = quotation
        .sources
        .iter()
        .map(|source| (source.source_id.as_str(), source.source_version_id.as_str()))
        .collect::<std::collections::BTreeSet<_>>();
    requirements.iter().all(|requirement| {
        if matches!(
            requirement.evidence.state,
            crate::quotation::EvidenceState::Confirmed | crate::quotation::EvidenceState::Inferred
        ) && requirement.evidence.anchors.is_empty()
        {
            return false;
        }
        requirement.evidence.anchors.iter().all(|anchor| {
            !anchor.exact_excerpt.trim().is_empty()
                && sources.contains(&(anchor.source_id.as_str(), anchor.source_version_id.as_str()))
        })
    })
}

async fn store_normalisation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<StoreNormalisationRequest>,
) -> Result<Json<StoredResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    let issues = validate_normalised_quotation(&request.quotation);
    if !issues.is_empty() {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "quotation validation failed".to_string(),
        ));
    }
    let visible_ids = messages
        .iter()
        .map(|message| message.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if request
        .quotation
        .sources
        .iter()
        .any(|source| !visible_ids.contains(source.source_id.as_str()))
        || request
            .parent_message_id
            .as_deref()
            .is_some_and(|id| !visible_ids.contains(id))
        || request
            .quotation
            .identity
            .supersedes_version_id
            .as_deref()
            .is_some_and(|version| parent_message_for_version(&messages, version).is_none())
    {
        return Err((
            StatusCode::NOT_FOUND,
            "quotation source unavailable".to_string(),
        ));
    }
    let message = normalised_quotation_message(
        &request.quotation,
        &request.thread_id,
        request.parent_message_id.as_deref(),
        &chrono::Utc::now().to_rfc3339(),
        &user.id,
    );
    let id = message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message,
    )
    .await
    .map_err(|_| store_error())?;
    Ok(Json(StoredResponse {
        message_ids: vec![id],
    }))
}

async fn store_review_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<StoreReviewRequest>,
) -> Result<Json<StoredResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if matches!(
        &request.command.action,
        crate::quotation::QuotationReviewAction::AcceptVendorLineChange { .. }
            | crate::quotation::QuotationReviewAction::AcceptVendorTermChange { .. }
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            "vendor changes require the guarded review flow".to_string(),
        ));
    }
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    let replay = replay_quotation_messages(&messages);
    let quotation = replay
        .versions
        .get(&request.command.expected_version_id)
        .filter(|quotation| {
            replay
                .active_version_by_quotation
                .get(&quotation.identity.quotation_id)
                == Some(&quotation.identity.version_id)
        })
        .ok_or((
            StatusCode::CONFLICT,
            "quotation revision is stale".to_string(),
        ))?;
    let parent = parent_message_for_version(&messages, &quotation.identity.version_id).ok_or((
        StatusCode::CONFLICT,
        "quotation revision is unavailable".to_string(),
    ))?;
    let review = apply_review_action(quotation, request.command).map_err(|_| {
        (
            StatusCode::CONFLICT,
            "quotation review was rejected".to_string(),
        )
    })?;
    persist_review(
        &state,
        &user.id,
        &request.thread_id,
        quotation,
        parent,
        review,
    )
    .await
}

pub(super) async fn persist_review(
    state: &AppState,
    user_id: &str,
    thread_id: &str,
    quotation: &NormalisedQuotation,
    parent: &crate::message::AFPMessage,
    review: QuotationReviewSuccessor,
) -> Result<Json<StoredResponse>, (StatusCode, String)> {
    let review_message = quotation_review_message(
        &review,
        &quotation.identity.quotation_id,
        thread_id,
        &parent.id,
        user_id,
    );
    let mut ids = vec![review_message.id.clone()];
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        user_id,
        review_message,
    )
    .await
    .map_err(|_| store_error())?;
    if let Some(successor) = &review.quotation {
        let successor_message = normalised_quotation_message(
            successor,
            thread_id,
            Some(&ids[0]),
            &review.reviewed_at,
            user_id,
        );
        ids.push(successor_message.id.clone());
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            user_id,
            successor_message,
        )
        .await
        .map_err(|_| store_error())?;
    }
    Ok(Json(StoredResponse { message_ids: ids }))
}

async fn store_comparison_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<StoreComparisonRequest>,
) -> Result<Json<StoredResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&request.comparison_id) || request.inputs.is_empty() || request.inputs.len() > 20 {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid comparison request".to_string(),
        ));
    }
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    let replay = replay_quotation_messages(&messages);
    let active_versions = replay
        .active_version_by_quotation
        .values()
        .map(String::as_str)
        .collect::<std::collections::BTreeSet<_>>();
    let mut seen = std::collections::BTreeSet::new();
    let mut candidates = Vec::with_capacity(request.inputs.len());
    for input in request.inputs {
        if !seen.insert(input.version_id.clone())
            || !active_versions.contains(input.version_id.as_str())
        {
            return Err((
                StatusCode::CONFLICT,
                "comparison references a stale quotation".to_string(),
            ));
        }
        let quotation = &replay.versions[&input.version_id];
        if !requirement_sources_valid(&input.requirements, quotation) {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                "requirement evidence is invalid".to_string(),
            ));
        }
        candidates.push(ComparisonCandidate {
            quotation_id: quotation.identity.quotation_id.clone(),
            version_id: quotation.identity.version_id.clone(),
            vendor_id: quotation.identity.vendor_id.clone(),
            total: calculate_comparable_total(quotation, &request.scenario),
            requirements: input.requirements,
        });
    }
    let mut comparison = compare_quotations(
        request.comparison_id,
        request.scenario.scenario_id,
        candidates,
    );
    if !crate::quotation::QuotationFeatureFlags::from_env().recommendation {
        comparison.recommended_quotation_id = None;
        comparison.recommendation_reason = Some(
            "Quotation recommendations are disabled until release evidence is verified."
                .to_string(),
        );
    }
    let message = quotation_comparison_message(
        &comparison,
        &request.thread_id,
        None,
        &chrono::Utc::now().to_rfc3339(),
        &user.id,
    );
    let id = message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message,
    )
    .await
    .map_err(|_| store_error())?;
    Ok(Json(StoredResponse {
        message_ids: vec![id],
    }))
}

async fn quotation_state_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<StateQuery>,
) -> Result<Json<crate::quotation::QuotationReplayState>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let messages = visible_messages(&state, &headers, &query.thread_id).await?;
    let mut replay = replay_quotation_messages(&messages);
    if !crate::quotation::QuotationFeatureFlags::from_env().closure {
        replay.active_selections.clear();
        replay.active_closures.clear();
    }
    Ok(Json(replay))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_identifiers_are_bounded() {
        assert!(valid_id("quote-1"));
        assert!(!valid_id(""));
        assert!(!valid_id("bad\nvalue"));
    }
}
