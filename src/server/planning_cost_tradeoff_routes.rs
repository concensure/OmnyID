use std::{collections::BTreeSet, sync::Arc};

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
        CandidateCostEstimate, CategoryCostEvidence, CostAdviceInput, CostTradeoffAdvice,
        CurrentCostAdviceRevisions, MoneyRange, PlanningIntelligenceFeatureFlags,
        UnresolvedCostDriver, build_cost_acknowledgement, build_cost_tradeoff_advice,
        cost_acknowledgement_from_message, cost_acknowledgement_id, cost_acknowledgement_message,
        cost_advice_allows_advance, project_constraint_messages,
    },
    quotation::{TotalStatus, replay_quotation_messages},
};

use super::{
    AppState,
    auth::{authenticated_user, store_private_app_message},
    proto_to_app,
};

const COST_EVIDENCE_KIND: &str = "planning_cost_evidence";
const COST_EVIDENCE_SCHEMA: &str = "planning.cost_evidence.v1";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/planning/cost-tradeoffs/prepare", post(prepare_http))
        .route(
            "/planning/cost-tradeoffs/acknowledge",
            post(acknowledge_http),
        )
        .route("/planning/cost-tradeoffs/feedback", post(feedback_http))
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CostTradeoffRequest {
    thread_id: String,
    plan_id: String,
    budget_revision_ref: String,
    comparison_id: String,
    quotation_version_id: String,
    candidate_category_ref: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AcknowledgeRequest {
    preparation: CostTradeoffRequest,
    idempotency_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FeedbackRequest {
    outcome: CostFeedbackOutcome,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CostFeedbackOutcome {
    Accepted,
    Corrected,
}

#[derive(Debug, Serialize)]
struct AcknowledgeResponse {
    inserted: bool,
    message_id: String,
    acknowledgement: crate::planning_intelligence::CostAcknowledgement,
    advice: CostTradeoffAdvice,
    advance_allowed: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CostEvidenceEnvelope {
    schema_version: String,
    plan_id: String,
    currency: String,
    budget_target: MoneyRange,
    forecast_before: MoneyRange,
    categories: Vec<CategoryCostEvidence>,
    unresolved_fee_drivers: Vec<UnresolvedCostDriver>,
}

struct PreparedAdvice {
    advice: CostTradeoffAdvice,
    candidate_revision_ref: String,
    budget_revision_ref: String,
    constraint_revision_refs: Vec<String>,
    source_revision_refs: Vec<String>,
}

impl PreparedAdvice {
    fn current(&self) -> CurrentCostAdviceRevisions<'_> {
        CurrentCostAdviceRevisions {
            candidate_revision_ref: &self.candidate_revision_ref,
            budget_revision_ref: &self.budget_revision_ref,
            constraint_revision_refs: &self.constraint_revision_refs,
            source_revision_refs: &self.source_revision_refs,
        }
    }
}

fn require_enabled() -> Result<(), (StatusCode, String)> {
    let flags = PlanningIntelligenceFeatureFlags::from_env();
    (flags.constraint_ledger && flags.cost_tradeoffs)
        .then_some(())
        .ok_or_else(|| unavailable("cost advice unavailable"))
}

async fn prepare_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CostTradeoffRequest>,
) -> Result<Json<CostTradeoffAdvice>, (StatusCode, String)> {
    let prepared = prepare(&state, &headers, &request).await?;
    Ok(Json(prepared.advice))
}

async fn prepare(
    state: &Arc<AppState>,
    headers: &HeaderMap,
    request: &CostTradeoffRequest,
) -> Result<PreparedAdvice, (StatusCode, String)> {
    require_enabled()?;
    validate_request(request)?;
    let user = authenticated_user(&state.db, headers).await?;
    let messages = state
        .db
        .get_private_thread(&user.id, &request.thread_id)
        .await
        .map_err(|_| unavailable("cost evidence unavailable"))?;
    if messages.is_empty() {
        return Err((StatusCode::NOT_FOUND, "thread not found".to_string()));
    }
    let messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let evidence = current_cost_evidence(&messages, request)?;
    let ledger = project_constraint_messages(&messages, &request.plan_id)
        .map_err(|_| bad_request("planning priorities are not available"))?;
    let constraints = ledger
        .active
        .iter()
        .map(|item| item.constraint.clone())
        .collect::<Vec<_>>();
    let replay = replay_quotation_messages(&messages);
    let comparison = replay
        .active_comparisons
        .get(&request.comparison_id)
        .ok_or_else(|| conflict("quotation comparison is stale or unavailable"))?;
    let comparison_revision = replay
        .comparison_message_ids
        .get(&request.comparison_id)
        .ok_or_else(|| conflict("quotation comparison evidence is unavailable"))?;
    let candidate = comparison
        .candidates
        .iter()
        .find(|candidate| candidate.version_id == request.quotation_version_id)
        .ok_or_else(|| conflict("quotation candidate is stale or unavailable"))?;
    let quotation = replay
        .versions
        .get(&request.quotation_version_id)
        .filter(|quotation| {
            replay
                .active_version_by_quotation
                .get(&quotation.identity.quotation_id)
                == Some(&quotation.identity.version_id)
        })
        .ok_or_else(|| conflict("quotation revision is stale or unavailable"))?;
    if candidate.total.currency != evidence.currency
        || quotation.currency != evidence.currency
        || candidate.quotation_id != quotation.identity.quotation_id
    {
        return Err(conflict("budget and quotation currencies do not match"));
    }

    let candidate_cost = if candidate.total.status == TotalStatus::Complete {
        CandidateCostEstimate::Exact {
            amount_minor: candidate
                .total
                .total_minor
                .ok_or_else(|| conflict("quotation total is unavailable"))?,
            currency: candidate.total.currency.clone(),
            evidence_ref: comparison_revision.clone(),
        }
    } else {
        let mut driver_refs = candidate
            .total
            .gaps
            .iter()
            .map(|gap| format!("quotation_gap:{}", safe_code(&gap.code)))
            .collect::<Vec<_>>();
        if driver_refs.is_empty() {
            driver_refs.push("quotation_gap:total_unavailable".to_string());
        }
        CandidateCostEstimate::Unknown { driver_refs }
    };
    let active_versions = replay
        .active_version_by_quotation
        .values()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let active_comparison_revisions = replay
        .active_comparisons
        .keys()
        .filter_map(|id| replay.comparison_message_ids.get(id))
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let message_ids = messages
        .iter()
        .map(|message| message.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut source_revision_refs = vec![
        request.budget_revision_ref.clone(),
        request.quotation_version_id.clone(),
        comparison_revision.clone(),
    ];
    source_revision_refs.extend(
        evidence
            .categories
            .iter()
            .map(|category| category.source_revision_ref.clone()),
    );
    source_revision_refs.extend(
        evidence
            .unresolved_fee_drivers
            .iter()
            .map(|driver| driver.source_revision_ref.clone()),
    );
    source_revision_refs.sort();
    source_revision_refs.dedup();
    if source_revision_refs.iter().any(|revision| {
        !message_ids.contains(revision.as_str())
            && !active_versions.contains(revision.as_str())
            && !active_comparison_revisions.contains(revision.as_str())
    }) {
        return Err(conflict("cost evidence contains a stale source revision"));
    }
    for range in [&evidence.budget_target, &evidence.forecast_before] {
        if !range
            .evidence_refs
            .iter()
            .any(|reference| reference == &request.budget_revision_ref)
        {
            return Err(conflict("budget figures are not bound to this revision"));
        }
    }
    let input = CostAdviceInput {
        candidate_decision_ref: request.comparison_id.clone(),
        candidate_revision_ref: request.quotation_version_id.clone(),
        candidate_category_ref: request.candidate_category_ref.clone(),
        budget_revision_ref: request.budget_revision_ref.clone(),
        currency: evidence.currency,
        budget_target: evidence.budget_target,
        forecast_before: evidence.forecast_before,
        candidate_cost,
        categories: evidence.categories,
        unresolved_fee_drivers: evidence.unresolved_fee_drivers,
        current_source_revision_refs: source_revision_refs.clone(),
    };
    let advice = build_cost_tradeoff_advice(&input, &constraints)
        .map_err(|_| bad_request("cost advice could not be prepared"))?;
    Ok(PreparedAdvice {
        candidate_revision_ref: advice.bindings.candidate_revision_ref.clone(),
        budget_revision_ref: advice.bindings.budget_revision_ref.clone(),
        constraint_revision_refs: advice.bindings.constraint_revision_refs.clone(),
        source_revision_refs: advice.bindings.source_revision_refs.clone(),
        advice,
    })
}

async fn acknowledge_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AcknowledgeRequest>,
) -> Result<Json<AcknowledgeResponse>, (StatusCode, String)> {
    validate_identifier(&request.idempotency_key)?;
    let prepared = prepare(&state, &headers, &request.preparation).await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let expected_id = cost_acknowledgement_id(
        &request.preparation.thread_id,
        &prepared.advice.tradeoff.tradeoff_id,
        &request.idempotency_key,
    )
    .map_err(|_| bad_request("invalid cost acknowledgement request"))?;
    let lock_key = format!("planning-cost-ack:{}:{expected_id}", user.id);
    let mut serial = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(lock_key)
        .execute(&mut *serial)
        .await
        .map_err(store_error)?;
    let messages = state
        .db
        .get_private_thread(&user.id, &request.preparation.thread_id)
        .await
        .map_err(store_error)?;
    if let Some(existing) = messages
        .into_iter()
        .map(proto_to_app)
        .find(|message| message.id == expected_id)
    {
        let acknowledgement = cost_acknowledgement_from_message(&existing)
            .map_err(|_| conflict("stored cost acknowledgement is invalid"))?
            .ok_or_else(|| conflict("cost acknowledgement key is already in use"))?;
        if !cost_advice_allows_advance(
            &prepared.advice,
            &prepared.current(),
            Some(&acknowledgement),
        ) {
            return Err(conflict("cost acknowledgement key is already in use"));
        }
        serial.commit().await.map_err(store_error)?;
        return Ok(Json(AcknowledgeResponse {
            inserted: false,
            message_id: existing.id,
            acknowledgement,
            advice: prepared.advice,
            advance_allowed: true,
        }));
    }
    let acknowledgement = build_cost_acknowledgement(
        &request.preparation.thread_id,
        &prepared.advice,
        &prepared.current(),
        &request.idempotency_key,
        &chrono::Utc::now().to_rfc3339(),
    )
    .map_err(|_| conflict("cost advice is stale or does not require acknowledgement"))?;
    let message = cost_acknowledgement_message(
        &request.preparation.thread_id,
        &format!("user://{}", user.id),
        &acknowledgement,
    )
    .map_err(|_| bad_request("cost acknowledgement could not be recorded"))?;
    let inserted = store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message.clone(),
    )
    .await
    .map_err(|_| store_error("cost acknowledgement persistence failed"))?;
    serial.commit().await.map_err(store_error)?;
    if inserted {
        state.metrics.inc_planning_cost_advice_accepted();
    }
    Ok(Json(AcknowledgeResponse {
        inserted,
        message_id: message.id,
        acknowledgement,
        advice: prepared.advice,
        advance_allowed: true,
    }))
}

async fn feedback_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<FeedbackRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_enabled()?;
    authenticated_user(&state.db, &headers).await?;
    match request.outcome {
        CostFeedbackOutcome::Accepted => state.metrics.inc_planning_cost_advice_accepted(),
        CostFeedbackOutcome::Corrected => state.metrics.inc_planning_cost_advice_corrected(),
    }
    Ok(StatusCode::NO_CONTENT)
}

fn current_cost_evidence(
    messages: &[AFPMessage],
    request: &CostTradeoffRequest,
) -> Result<CostEvidenceEnvelope, (StatusCode, String)> {
    let mut matching = messages
        .iter()
        .filter(|message| message.kind.as_deref() == Some(COST_EVIDENCE_KIND))
        .filter_map(|message| {
            let evidence =
                serde_json::from_value::<CostEvidenceEnvelope>(message.content.clone()).ok()?;
            (evidence.schema_version == COST_EVIDENCE_SCHEMA && evidence.plan_id == request.plan_id)
                .then_some((message, evidence))
        })
        .collect::<Vec<_>>();
    matching.sort_by(|left, right| {
        (left.0.timestamp.as_str(), left.0.id.as_str())
            .cmp(&(right.0.timestamp.as_str(), right.0.id.as_str()))
    });
    let (message, evidence) = matching
        .last()
        .ok_or_else(|| conflict("current budget evidence is unavailable"))?;
    if message.id != request.budget_revision_ref {
        return Err(conflict("budget revision is stale"));
    }
    Ok(evidence.clone())
}

fn validate_request(request: &CostTradeoffRequest) -> Result<(), (StatusCode, String)> {
    for value in [
        &request.thread_id,
        &request.plan_id,
        &request.budget_revision_ref,
        &request.comparison_id,
        &request.quotation_version_id,
        &request.candidate_category_ref,
    ] {
        validate_identifier(value)?;
    }
    Ok(())
}

fn validate_identifier(value: &str) -> Result<(), (StatusCode, String)> {
    if value.trim().is_empty()
        || value.len() > 180
        || value.contains('@')
        || value.chars().any(char::is_whitespace)
    {
        return Err(bad_request("invalid cost advice request"));
    }
    Ok(())
}

fn safe_code(value: &str) -> String {
    let value = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
        .collect::<String>();
    if value.is_empty() {
        "unknown".to_string()
    } else {
        value
    }
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.to_string())
}

fn conflict(message: &str) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.to_string())
}

fn unavailable(message: &str) -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, message.to_string())
}

fn store_error(_: impl ToString) -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "cost acknowledgement persistence is unavailable".to_string(),
    )
}
