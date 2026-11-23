use std::{collections::BTreeSet, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    message::AFPMessage,
    planning_intelligence::{
        AnchoredTerm, MoneyRange, PlanningIntelligenceFeatureFlags, VendorChange,
        VendorChangeBudgetEvidence, VendorChangeBudgetFit, VendorChangeEventEvidence,
        VendorChangeInterpretation, VendorChangeKind, VendorChangeReview, VendorChangeReviewInput,
        build_vendor_change_review, interpret_vendor_response_change, project_constraint_messages,
    },
    quotation::{
        EMAIL_VENDOR_RESPONSE_KIND, InclusionState, Money, NormalisedQuotation,
        QUOTATION_REVIEW_KIND, QuotationReviewAction, QuotationReviewCommand,
        QuotationVendorResponse, SourceAnchor, apply_review_action, quotation_material_fingerprint,
        replay_quotation_messages, vendor_response_fingerprint,
    },
};

use super::{
    AppState,
    auth::authenticated_user,
    proto_to_app,
    quotation_routes::{parent_message_for_version, persist_review},
};

const COST_EVIDENCE_KIND: &str = "planning_cost_evidence";
const COST_EVIDENCE_SCHEMA: &str = "planning.cost_evidence.v1";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/planning/vendor-changes/prepare", post(prepare_http))
        .route("/planning/vendor-changes/accept", post(accept_http))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct VendorChangeRequest {
    thread_id: String,
    plan_id: String,
    response_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AcceptVendorChangeRequest {
    preparation: VendorChangeRequest,
    review_id: String,
    option_ref: String,
    idempotency_key: String,
}

#[derive(Debug, Serialize)]
struct AcceptVendorChangeResponse {
    inserted: bool,
    message_ids: Vec<String>,
    planning_review_id: String,
    option_ref: String,
    quotation_version_id: String,
    booking_created: bool,
    payment_executed: bool,
}

struct PreparedVendorChange {
    response: QuotationVendorResponse,
    quotation: NormalisedQuotation,
    interpretation: VendorChangeInterpretation,
    review: VendorChangeReview,
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
    let prepared = prepare_from_messages(&messages, &request, flags)?;
    Ok(Json(prepared.review))
}

fn prepare_from_messages(
    messages: &[AFPMessage],
    request: &VendorChangeRequest,
    flags: PlanningIntelligenceFeatureFlags,
) -> Result<PreparedVendorChange, (StatusCode, String)> {
    let response = current_response(messages, &request.response_id)?;
    if response.thread_id != request.thread_id {
        return Err(conflict("vendor response is stale or unavailable"));
    }
    let replay = replay_quotation_messages(messages);
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
    let ledger = project_constraint_messages(messages, &request.plan_id)
        .map_err(|_| conflict("planning evidence is unavailable"))?;
    let constraints = ledger
        .active
        .into_iter()
        .map(|value| value.constraint)
        .collect::<Vec<_>>();
    let budget = flags
        .cost_tradeoffs
        .then(|| current_budget(messages, &request.plan_id))
        .transpose()?
        .flatten();
    let event = current_event_date(messages, &request.plan_id);
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
    Ok(PreparedVendorChange {
        response,
        quotation: quotation.clone(),
        interpretation,
        review,
    })
}

async fn accept_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AcceptVendorChangeRequest>,
) -> Result<Json<AcceptVendorChangeResponse>, (StatusCode, String)> {
    let flags = require_enabled()?;
    validate_request(&request.preparation)?;
    for value in [
        &request.review_id,
        &request.option_ref,
        &request.idempotency_key,
    ] {
        validate_identifier(value)?;
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let acceptance_ref = acceptance_ref(
        &user.id,
        &request.preparation.thread_id,
        &request.idempotency_key,
    );
    let lock_key = format!(
        "planning-vendor-change:{}:{}:{}",
        user.id, request.preparation.thread_id, request.review_id
    );
    let mut serial = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(lock_key)
        .execute(&mut *serial)
        .await
        .map_err(store_error)?;
    let stored = state
        .db
        .get_private_thread(&user.id, &request.preparation.thread_id)
        .await
        .map_err(store_error)?;
    if stored.is_empty() {
        return Err(not_found("vendor change review unavailable"));
    }
    let messages = stored.into_iter().map(proto_to_app).collect::<Vec<_>>();
    if let Some(existing) = existing_acceptance(&messages, &acceptance_ref)? {
        if existing.planning_review_ref != request.review_id
            || existing.option_ref != request.option_ref
        {
            return Err(conflict("vendor change acceptance key is already in use"));
        }
        if existing.actor_id != user.id {
            return Err(conflict("stored vendor change acceptance is invalid"));
        }
        let replay = replay_quotation_messages(&messages);
        let quotation = replay
            .versions
            .get(&existing.parent_version_id)
            .ok_or_else(|| conflict("stored vendor change acceptance is invalid"))?;
        let reconstructed = apply_review_action(
            quotation,
            QuotationReviewCommand {
                command_id: acceptance_ref.clone(),
                expected_version_id: existing.parent_version_id.clone(),
                expected_material_fingerprint: quotation_material_fingerprint(quotation),
                actor_id: existing.actor_id.clone(),
                reviewed_at: existing.reviewed_at.clone(),
                action: existing.action.clone(),
            },
        )
        .map_err(|_| conflict("stored vendor change acceptance is invalid"))?;
        if reconstructed.review_id != existing.quotation_review_id
            || reconstructed.version_id != existing.version_id
            || reconstructed.material_fingerprint != existing.material_fingerprint
        {
            return Err(conflict("stored vendor change acceptance is invalid"));
        }
        let message_ids = if let Some(successor_message) =
            parent_message_for_version(&messages, &existing.version_id)
        {
            if replay.versions.get(&existing.version_id) != reconstructed.quotation.as_ref() {
                return Err(conflict("stored vendor change acceptance is invalid"));
            }
            vec![existing.review_message_id, successor_message.id.clone()]
        } else {
            let parent = parent_message_for_version(&messages, &existing.parent_version_id)
                .ok_or_else(|| conflict("stored vendor change acceptance is invalid"))?;
            persist_review(
                &state,
                &user.id,
                &request.preparation.thread_id,
                quotation,
                parent,
                reconstructed,
            )
            .await?
            .0
            .message_ids
        };
        serial.commit().await.map_err(store_error)?;
        return Ok(Json(AcceptVendorChangeResponse {
            inserted: false,
            message_ids,
            planning_review_id: existing.planning_review_ref,
            option_ref: existing.option_ref,
            quotation_version_id: existing.version_id,
            booking_created: false,
            payment_executed: false,
        }));
    }

    let prepared = prepare_from_messages(&messages, &request.preparation, flags)?;
    if prepared.review.review_id != request.review_id || !prepared.review.blockers.is_empty() {
        return Err(conflict("vendor change review is stale or blocked"));
    }
    let option = prepared
        .review
        .options
        .iter()
        .find(|option| option.option_ref == request.option_ref)
        .ok_or_else(|| conflict("vendor change option is unavailable"))?;
    if option.hard_conflict || option.budget_fit == VendorChangeBudgetFit::ExceedsBudget {
        return Err(conflict("vendor change option needs further review"));
    }
    let change = prepared
        .interpretation
        .changes
        .iter()
        .find(|change| change.change_id == option.change_ref)
        .ok_or_else(|| conflict("vendor change option is unavailable"))?;
    let action = acceptance_action(
        &acceptance_ref,
        &request.review_id,
        &request.option_ref,
        change,
        &option.replacement,
        &prepared.response,
        &prepared.quotation,
    )?;
    let command = QuotationReviewCommand {
        command_id: acceptance_ref,
        expected_version_id: prepared.quotation.identity.version_id.clone(),
        expected_material_fingerprint: quotation_material_fingerprint(&prepared.quotation),
        actor_id: user.id.clone(),
        reviewed_at: chrono::Utc::now().to_rfc3339(),
        action,
    };
    let successor = apply_review_action(&prepared.quotation, command)
        .map_err(|_| conflict("vendor change acceptance was rejected"))?;
    let version_id = successor.version_id.clone();
    let parent = parent_message_for_version(&messages, &prepared.quotation.identity.version_id)
        .ok_or_else(|| conflict("quotation revision is unavailable"))?;
    let stored = persist_review(
        &state,
        &user.id,
        &request.preparation.thread_id,
        &prepared.quotation,
        parent,
        successor,
    )
    .await?;
    serial.commit().await.map_err(store_error)?;
    Ok(Json(AcceptVendorChangeResponse {
        inserted: true,
        message_ids: stored.0.message_ids,
        planning_review_id: request.review_id,
        option_ref: request.option_ref,
        quotation_version_id: version_id,
        booking_created: false,
        payment_executed: false,
    }))
}

struct ExistingAcceptance {
    review_message_id: String,
    quotation_review_id: String,
    planning_review_ref: String,
    option_ref: String,
    parent_version_id: String,
    version_id: String,
    material_fingerprint: String,
    actor_id: String,
    reviewed_at: String,
    action: QuotationReviewAction,
}

fn existing_acceptance(
    messages: &[AFPMessage],
    acceptance_ref: &str,
) -> Result<Option<ExistingAcceptance>, (StatusCode, String)> {
    for message in messages.iter().filter(|message| {
        message.kind.as_deref().or(message.subtype.as_deref()) == Some(QUOTATION_REVIEW_KIND)
    }) {
        let Some(action_value) = message.content.get("action") else {
            continue;
        };
        let Ok(action) = serde_json::from_value::<QuotationReviewAction>(action_value.clone())
        else {
            continue;
        };
        let (stored_ref, planning_review_ref, option_ref) = match &action {
            QuotationReviewAction::AcceptVendorLineChange {
                acceptance_ref,
                planning_review_ref,
                option_ref,
                ..
            }
            | QuotationReviewAction::AcceptVendorTermChange {
                acceptance_ref,
                planning_review_ref,
                option_ref,
                ..
            } => (acceptance_ref, planning_review_ref, option_ref),
            _ => continue,
        };
        if stored_ref != acceptance_ref {
            continue;
        }
        let field = |name: &str| {
            message
                .content
                .get(name)
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .ok_or_else(|| conflict("stored vendor change acceptance is invalid"))
        };
        let quotation_review_id = field("review_id")?;
        let parent_version_id = field("parent_version_id")?;
        let version_id = message
            .content
            .get("version_id")
            .and_then(|value| value.as_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| conflict("stored vendor change acceptance is invalid"))?;
        return Ok(Some(ExistingAcceptance {
            review_message_id: message.id.clone(),
            quotation_review_id,
            planning_review_ref: planning_review_ref.clone(),
            option_ref: option_ref.clone(),
            parent_version_id,
            version_id: version_id.to_string(),
            material_fingerprint: field("material_fingerprint")?,
            actor_id: field("actor_id")?,
            reviewed_at: field("reviewed_at")?,
            action,
        }));
    }
    Ok(None)
}

fn acceptance_action(
    acceptance_ref: &str,
    planning_review_ref: &str,
    option_ref: &str,
    change: &VendorChange,
    replacement: &AnchoredTerm,
    response: &QuotationVendorResponse,
    quotation: &NormalisedQuotation,
) -> Result<QuotationReviewAction, (StatusCode, String)> {
    if !change
        .replacement_options
        .iter()
        .any(|candidate| candidate == replacement)
    {
        return Err(conflict("vendor change option is unavailable"));
    }
    let source_version_id = replacement
        .source_anchor
        .source_version_id
        .as_deref()
        .ok_or_else(|| conflict("vendor change evidence is unavailable"))?;
    let source = response
        .sources
        .iter()
        .find(|source| {
            source.source_id == replacement.source_anchor.message_id
                && source.source_version_id == source_version_id
        })
        .cloned()
        .ok_or_else(|| conflict("vendor change evidence is unavailable"))?;
    let anchor = SourceAnchor {
        source_id: replacement.source_anchor.message_id.clone(),
        source_version_id: source_version_id.to_string(),
        locator: replacement.source_anchor.locator.clone(),
        exact_excerpt: replacement.source_anchor.exact_excerpt.clone(),
    };
    let fields = (
        acceptance_ref.to_string(),
        planning_review_ref.to_string(),
        response.response_id.clone(),
        vendor_response_fingerprint(response)
            .map_err(|_| conflict("vendor change evidence is unavailable"))?,
        option_ref.to_string(),
    );
    if let Some(line_id) = change.affected_object_ref.strip_prefix("line_item:") {
        let mut line = quotation
            .line_items
            .iter()
            .find(|line| line.line_id == line_id)
            .cloned()
            .ok_or_else(|| conflict("quotation revision is unavailable"))?;
        match change.change_kind {
            VendorChangeKind::PriceChanged => {
                let (currency, amount_minor) = parse_money(&replacement.value)
                    .ok_or_else(|| conflict("vendor change option is unavailable"))?;
                line.unit_price = Some(Money {
                    amount_minor,
                    currency: currency.to_string(),
                });
            }
            VendorChangeKind::ScopeChanged => {
                line.inclusion = parse_inclusion(&replacement.value)
                    .ok_or_else(|| conflict("vendor change option is unavailable"))?;
            }
            VendorChangeKind::Substituted => line.label = replacement.value.clone(),
            VendorChangeKind::Unavailable | VendorChangeKind::TimingChanged => {
                return Err(conflict("vendor change option is unavailable"));
            }
        }
        return Ok(QuotationReviewAction::AcceptVendorLineChange {
            acceptance_ref: fields.0,
            planning_review_ref: fields.1,
            line_id: line_id.to_string(),
            replacement: line,
            correction_anchor: anchor,
            source,
            response_ref: fields.2,
            response_fingerprint: fields.3,
            option_ref: fields.4,
        });
    }
    if let Some(term_id) = change.affected_object_ref.strip_prefix("commercial_term:") {
        if change.change_kind != VendorChangeKind::TimingChanged
            || chrono::DateTime::parse_from_rfc3339(&replacement.value).is_err()
        {
            return Err(conflict("vendor change option is unavailable"));
        }
        let mut term = quotation
            .commercial_terms
            .iter()
            .find(|term| term.term_id == term_id)
            .cloned()
            .ok_or_else(|| conflict("quotation revision is unavailable"))?;
        term.due_at = Some(replacement.value.clone());
        return Ok(QuotationReviewAction::AcceptVendorTermChange {
            acceptance_ref: fields.0,
            planning_review_ref: fields.1,
            term_id: term_id.to_string(),
            replacement: term,
            correction_anchor: anchor,
            source,
            response_ref: fields.2,
            response_fingerprint: fields.3,
            option_ref: fields.4,
        });
    }
    Err(conflict("vendor change option is unavailable"))
}

fn acceptance_ref(user_id: &str, thread_id: &str, idempotency_key: &str) -> String {
    let digest = Sha256::digest(
        crate::crypto::canonical_json_string(&serde_json::json!({
            "user_id": user_id,
            "thread_id": thread_id,
            "idempotency_key": idempotency_key,
        }))
        .as_bytes(),
    );
    format!("vendor_change_acceptance:{}", &hex::encode(digest)[..32])
}

fn parse_money(value: &str) -> Option<(&str, i64)> {
    let (currency, amount) = value.split_once(':')?;
    (currency.len() == 3 && currency.chars().all(|value| value.is_ascii_uppercase()))
        .then(|| amount.parse::<i64>().ok())
        .flatten()
        .filter(|amount| *amount >= 0)
        .map(|amount| (currency, amount))
}

fn parse_inclusion(value: &str) -> Option<InclusionState> {
    match value {
        "included" => Some(InclusionState::Included),
        "required" => Some(InclusionState::Required),
        "optional" => Some(InclusionState::Optional),
        "excluded" => Some(InclusionState::Excluded),
        "conditional" => Some(InclusionState::Conditional),
        "unknown" => Some(InclusionState::Unknown),
        _ => None,
    }
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

fn validate_identifier(value: &str) -> Result<(), (StatusCode, String)> {
    if value.is_empty()
        || value.len() > 180
        || value.contains('@')
        || value.chars().any(char::is_whitespace)
        || value.chars().any(char::is_control)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid vendor change acceptance request".to_string(),
        ));
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
