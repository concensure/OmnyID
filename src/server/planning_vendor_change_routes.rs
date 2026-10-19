use std::{collections::BTreeSet, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::Deserialize;

use crate::{
    message::AFPMessage,
    planning_intelligence::{
        MoneyRange, PlanningIntelligenceFeatureFlags, VendorChangeBudgetEvidence,
        VendorChangeEventEvidence, VendorChangeReview, VendorChangeReviewInput,
        build_vendor_change_review, interpret_vendor_response_change, project_constraint_messages,
    },
    quotation::{
        EMAIL_VENDOR_RESPONSE_KIND, QuotationVendorResponse, replay_quotation_messages,
        vendor_response_fingerprint,
    },
};

use super::{AppState, auth::authenticated_user, proto_to_app};

const COST_EVIDENCE_KIND: &str = "planning_cost_evidence";
const COST_EVIDENCE_SCHEMA: &str = "planning.cost_evidence.v1";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/planning/vendor-changes/prepare", post(prepare_http))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct VendorChangeRequest {
    thread_id: String,
    plan_id: String,
    response_id: String,
}

#[derive(Clone, Debug, Deserialize)]
struct CostEvidenceEnvelope {
    schema_version: String,
    plan_id: String,
    currency: String,
    budget_target: MoneyRange,
    forecast_before: MoneyRange,
}

async fn prepare_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<VendorChangeRequest>,
) -> Result<Json<VendorChangeReview>, (StatusCode, String)> {
    let flags = require_enabled()?;
    validate_request(&request)?;
    let user = authenticated_user(&state.db, &headers).await?;
    let messages = state
        .db
        .get_private_thread(&user.id, &request.thread_id)
        .await
        .map_err(store_error)?;
    if messages.is_empty() {
        return Err(not_found("planning review unavailable"));
    }
    let messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let response = current_response(&messages, &request.response_id)?;
    if response.thread_id != request.thread_id {
        return Err(conflict("vendor response is stale or unavailable"));
    }
    let replay = replay_quotation_messages(&messages);
    let quotation = replay
        .versions
        .get(&response.quotation_version_id)
        .filter(|quotation| {
            quotation.identity.quotation_id == response.quotation_id
                && replay
                    .active_version_by_quotation
                    .get(&quotation.identity.quotation_id)
                    == Some(&quotation.identity.version_id)
        })
        .ok_or_else(|| conflict("quotation revision is stale or unavailable"))?;
    let ledger = project_constraint_messages(&messages, &request.plan_id)
        .map_err(|_| conflict("planning evidence is unavailable"))?;
    let constraints = ledger
        .active
        .into_iter()
        .map(|value| value.constraint)
        .collect::<Vec<_>>();
    let budget = flags
        .cost_tradeoffs
        .then(|| current_budget(&messages, &request.plan_id))
        .transpose()?
        .flatten();
    let event = current_event_date(&messages, &request.plan_id);
    let fingerprint = vendor_response_fingerprint(&response)
        .map_err(|_| conflict("vendor response is unavailable"))?;
    let interpretation = interpret_vendor_response_change(&response, quotation);
    let review = build_vendor_change_review(&VendorChangeReviewInput {
        interpretation: &interpretation,
        current_response_ref: &response.response_id,
        current_response_fingerprint: &fingerprint,
        current_quotation_version_ref: &quotation.identity.version_id,
        constraints: &constraints,
        evaluations: &[],
        budget: budget.as_ref(),
        event: event.as_ref(),
        as_of: &response.submitted_at,
    });
    Ok(Json(review))
}

fn require_enabled() -> Result<PlanningIntelligenceFeatureFlags, (StatusCode, String)> {
    let flags = PlanningIntelligenceFeatureFlags::from_env();
    (flags.vendor_changes && flags.constraint_ledger && flags.evaluation)
        .then_some(flags)
        .ok_or_else(|| not_found("vendor change review unavailable"))
}

fn current_response(
    messages: &[AFPMessage],
    requested_id: &str,
) -> Result<QuotationVendorResponse, (StatusCode, String)> {
    let mut responses = messages
        .iter()
        .filter(|message| {
            message.kind.as_deref().or(message.subtype.as_deref())
                == Some(EMAIL_VENDOR_RESPONSE_KIND)
        })
        .filter_map(|message| {
            serde_json::from_value::<QuotationVendorResponse>(
                message.content.get("response")?.clone(),
            )
            .ok()
        })
        .filter_map(|response| {
            let fingerprint = vendor_response_fingerprint(&response).ok()?;
            Some((response, fingerprint))
        })
        .collect::<Vec<_>>();
    let requested_fingerprint = responses
        .iter()
        .find(|(response, _)| response.response_id == requested_id)
        .map(|(_, fingerprint)| fingerprint.clone())
        .ok_or_else(|| not_found("vendor response unavailable"))?;
    let equivalent_ids = responses
        .iter()
        .filter(|(_, fingerprint)| fingerprint == &requested_fingerprint)
        .map(|(response, _)| response.response_id.as_str())
        .collect::<BTreeSet<_>>();
    if responses.iter().any(|(response, fingerprint)| {
        fingerprint != &requested_fingerprint
            && response
                .parent_response_id
                .as_deref()
                .is_some_and(|parent| equivalent_ids.contains(parent))
    }) {
        return Err(conflict("vendor response is stale or unavailable"));
    }
    responses.sort_by(|left, right| left.0.response_id.cmp(&right.0.response_id));
    responses
        .into_iter()
        .find(|(_, fingerprint)| fingerprint == &requested_fingerprint)
        .map(|(response, _)| response)
        .ok_or_else(|| not_found("vendor response unavailable"))
}

fn current_budget(
    messages: &[AFPMessage],
    plan_id: &str,
) -> Result<Option<VendorChangeBudgetEvidence>, (StatusCode, String)> {
    let mut candidates = messages
        .iter()
        .filter(|message| message.kind.as_deref() == Some(COST_EVIDENCE_KIND))
        .filter_map(|message| {
            let evidence =
                serde_json::from_value::<CostEvidenceEnvelope>(message.content.clone()).ok()?;
            (evidence.schema_version == COST_EVIDENCE_SCHEMA && evidence.plan_id == plan_id)
                .then_some((message, evidence))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        (left.0.timestamp.as_str(), left.0.id.as_str())
            .cmp(&(right.0.timestamp.as_str(), right.0.id.as_str()))
    });
    let Some((message, evidence)) = candidates.pop() else {
        return Ok(None);
    };
    if evidence.currency != evidence.budget_target.currency
        || evidence.currency != evidence.forecast_before.currency
        || evidence.currency.len() != 3
        || !evidence
            .currency
            .chars()
            .all(|value| value.is_ascii_uppercase())
        || evidence.budget_target.minimum_minor < 0
        || evidence.budget_target.maximum_minor < evidence.budget_target.minimum_minor
        || evidence.forecast_before.minimum_minor < 0
        || evidence.forecast_before.maximum_minor < evidence.forecast_before.minimum_minor
        || !evidence
            .budget_target
            .evidence_refs
            .iter()
            .any(|reference| reference == &message.id)
        || !evidence
            .forecast_before
            .evidence_refs
            .iter()
            .any(|reference| reference == &message.id)
    {
        return Err(conflict("budget evidence is unavailable"));
    }
    let minimum_minor = evidence
        .budget_target
        .minimum_minor
        .checked_sub(evidence.forecast_before.maximum_minor)
        .ok_or_else(|| conflict("budget evidence is unavailable"))?
        .max(0);
    let maximum_minor = evidence
        .budget_target
        .maximum_minor
        .checked_sub(evidence.forecast_before.minimum_minor)
        .ok_or_else(|| conflict("budget evidence is unavailable"))?
        .max(0);
    let mut evidence_refs = evidence.budget_target.evidence_refs;
    evidence_refs.extend(evidence.forecast_before.evidence_refs);
    evidence_refs.push(message.id.clone());
    evidence_refs.sort();
    evidence_refs.dedup();
    Ok(Some(VendorChangeBudgetEvidence {
        budget_revision_ref: message.id.clone(),
        available_headroom: MoneyRange {
            minimum_minor,
            maximum_minor: maximum_minor.max(minimum_minor),
            currency: evidence.currency,
            evidence_refs,
        },
    }))
}

fn current_event_date(messages: &[AFPMessage], plan_id: &str) -> Option<VendorChangeEventEvidence> {
    let mut candidates = Vec::new();
    for message in messages {
        let Some(content) = message.content.as_object() else {
            continue;
        };
        if content
            .get("wedding_plan_id")
            .and_then(|value| value.as_str())
            != Some(plan_id)
        {
            continue;
        }
        if content.get("kind").and_then(|value| value.as_str())
            == Some("wedding_decision_selection")
            && content
                .get("artifact_id")
                .and_then(|value| value.as_str())
                .is_some_and(|value| value.starts_with("wedding_date:"))
        {
            let date = content
                .get("selected_option")
                .and_then(|value| value.get("id"))
                .and_then(|value| value.as_str())
                .and_then(|value| value.strip_prefix("wedding-date-"));
            if let Some(date) = date.filter(|value| valid_date(value)) {
                candidates.push((
                    message.timestamp.clone(),
                    message.id.clone(),
                    format!("{date}T09:00:00Z"),
                ));
            }
        } else if content
            .get("wedding_schedule_item_id")
            .and_then(|value| value.as_str())
            .is_some_and(|value| value.starts_with("wedding_date:"))
        {
            let start_at = content.get("start_at").and_then(|value| value.as_str());
            if let Some(start_at) =
                start_at.filter(|value| chrono::DateTime::parse_from_rfc3339(value).is_ok())
            {
                candidates.push((
                    message.timestamp.clone(),
                    message.id.clone(),
                    start_at.to_string(),
                ));
            }
        }
    }
    candidates.sort();
    candidates.pop().map(
        |(_, source_revision_ref, event_at)| VendorChangeEventEvidence {
            event_at,
            source_revision_ref,
        },
    )
}

fn valid_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn validate_request(request: &VendorChangeRequest) -> Result<(), (StatusCode, String)> {
    for value in [&request.thread_id, &request.plan_id, &request.response_id] {
        if value.is_empty()
            || value.len() > 180
            || value.contains('@')
            || value.chars().any(char::is_whitespace)
        {
            return Err((
                StatusCode::BAD_REQUEST,
                "invalid vendor change request".to_string(),
            ));
        }
    }
    Ok(())
}

fn not_found(message: &str) -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, message.to_string())
}

fn conflict(message: &str) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.to_string())
}

fn store_error(_: impl ToString) -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "vendor change evidence is unavailable".to_string(),
    )
}
