use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::{
    planning_intelligence::{
        ConstraintConflictIntervention, InterventionDecision, PlanningIntelligenceFeatureFlags,
        QuotationConflictBinding, build_constraint_conflict_intervention,
        build_intervention_decision, evaluate_constraint_against_candidate,
        intervention_decision_from_message, intervention_decision_id,
        intervention_decision_message, project_constraint_messages,
        project_ranked_quotation_candidate_snapshot,
    },
    quotation::{ContextGrantAction, clarification_draft_message, replay_quotation_messages},
};

use super::{
    AppState,
    auth::{authenticated_user, store_private_app_message},
    proto_to_app,
    quotation_response_capability_routes::{grant_envelope, grant_revoked},
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/planning/constraint-interventions/prepare",
            post(prepare_intervention_http),
        )
        .route(
            "/planning/constraint-interventions/select",
            post(select_intervention_http),
        )
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PrepareInterventionRequest {
    thread_id: String,
    plan_id: String,
    constraint_id: String,
    comparison_id: String,
    quotation_version_id: String,
    recipient: String,
    #[serde(default)]
    grant_message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SelectInterventionRequest {
    preparation: PrepareInterventionRequest,
    selected_option_id: String,
    idempotency_key: String,
}

#[derive(Debug, Serialize)]
struct SelectInterventionResponse {
    inserted: bool,
    message_id: String,
    decision: InterventionDecision,
    intervention: ConstraintConflictIntervention,
    clarification_draft_message_id: Option<String>,
}

fn require_enabled() -> Result<(), (StatusCode, String)> {
    let flags = PlanningIntelligenceFeatureFlags::from_env();
    (flags.constraint_ledger && flags.evaluation && flags.interventions)
        .then_some(())
        .ok_or_else(|| unavailable("planning intervention unavailable"))
}

async fn prepare_intervention_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PrepareInterventionRequest>,
) -> Result<Json<ConstraintConflictIntervention>, (StatusCode, String)> {
    require_enabled()?;
    validate_request(&request)?;
    let user = authenticated_user(&state.db, &headers).await?;
    let messages = state
        .db
        .get_private_thread(&user.id, &request.thread_id)
        .await
        .map_err(|_| unavailable("planning intervention source unavailable"))?;
    if messages.is_empty() {
        return Err((StatusCode::NOT_FOUND, "thread not found".to_string()));
    }
    let messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let ledger = project_constraint_messages(&messages, &request.plan_id)
        .map_err(|_| bad_request("planning constraints are not available"))?;
    let constraint = ledger
        .active
        .iter()
        .map(|item| &item.constraint)
        .find(|constraint| constraint.constraint_id == request.constraint_id)
        .ok_or((
            StatusCode::CONFLICT,
            "planning requirement is stale or unavailable".to_string(),
        ))?;

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
    let comparison_revision = replay
        .comparison_message_ids
        .get(&request.comparison_id)
        .ok_or((
            StatusCode::CONFLICT,
            "quotation comparison evidence is unavailable".to_string(),
        ))?;
    let observed_at = messages
        .iter()
        .find(|message| message.id == *comparison_revision)
        .map(|message| message.timestamp.as_str())
        .ok_or((
            StatusCode::CONFLICT,
            "quotation comparison evidence is unavailable".to_string(),
        ))?;
    let snapshot = project_ranked_quotation_candidate_snapshot(
        std::slice::from_ref(constraint),
        quotation,
        candidate,
        comparison_revision,
        observed_at,
    )
    .map_err(|_| bad_request("quotation evidence cannot be evaluated"))?;
    let (evaluation, presentation) = evaluate_constraint_against_candidate(constraint, &snapshot)
        .map_err(|_| {
        bad_request("planning requirement cannot be evaluated against this quotation")
    })?;
    if !candidate
        .hard_conflict_ids
        .iter()
        .any(|id| id == &constraint.constraint_id)
    {
        return Err((
            StatusCode::CONFLICT,
            "planning requirement is not a current quotation conflict".to_string(),
        ));
    }

    let grant_revision = validate_optional_grant(
        &messages,
        &request,
        &quotation.identity.quotation_id,
        &candidate.vendor_id,
    )?;
    let evidence_label = format!(
        "{} Current comparison evidence: hard requirement conflict.",
        presentation.evidence_label
    );
    let binding = QuotationConflictBinding {
        quotation_id: quotation.identity.quotation_id.clone(),
        quotation_version_id: quotation.identity.version_id.clone(),
        comparison_id: request.comparison_id,
        comparison_revision: comparison_revision.clone(),
        grant_revision,
        recipient: request.recipient,
        subject: "Question about your quotation".to_string(),
        created_at: snapshot.observed_at.clone(),
    };
    let projection =
        build_constraint_conflict_intervention(constraint, &evaluation, &evidence_label, &binding)
            .map_err(|_| bad_request("planning intervention could not be prepared"))?;
    Ok(Json(projection))
}

async fn select_intervention_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SelectInterventionRequest>,
) -> Result<Json<SelectInterventionResponse>, (StatusCode, String)> {
    let thread_id = request.preparation.thread_id.clone();
    let projection = prepare_intervention_http(
        State(state.clone()),
        headers.clone(),
        Json(request.preparation),
    )
    .await?
    .0;
    let expected_id = intervention_decision_id(
        &thread_id,
        &projection.intervention.intervention_id,
        &request.idempotency_key,
    )
    .map_err(|_| bad_request("invalid intervention decision request"))?;
    let user = authenticated_user(&state.db, &headers).await?;
    let lock_key = format!("planning-intervention:{}:{expected_id}", user.id);
    let mut serial = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(lock_key)
        .execute(&mut *serial)
        .await
        .map_err(store_error)?;
    let messages = state
        .db
        .get_private_thread(&user.id, &thread_id)
        .await
        .map_err(store_error)?;
    if let Some(existing) = messages
        .into_iter()
        .map(proto_to_app)
        .find(|message| message.id == expected_id)
    {
        let decision = intervention_decision_from_message(&existing)
            .map_err(|_| conflict("stored intervention decision is invalid"))?
            .ok_or_else(|| conflict("intervention idempotency key is already in use"))?;
        if decision.intervention_ref != projection.intervention.intervention_id
            || decision.selected_option_id != request.selected_option_id
            || decision.bindings != projection.bindings
        {
            return Err(conflict("intervention idempotency key is already in use"));
        }
        let clarification_draft_message_id =
            decision.prepared_clarification_draft_ref.as_ref().map(|_| {
                clarification_draft_message(
                    &projection.clarification_draft,
                    &existing.thread_id,
                    "user://replay",
                )
                .id
            });
        serial.commit().await.map_err(store_error)?;
        return Ok(Json(SelectInterventionResponse {
            inserted: false,
            message_id: existing.id,
            decision,
            intervention: projection,
            clarification_draft_message_id,
        }));
    }

    let decision = build_intervention_decision(
        &thread_id,
        &projection,
        &request.selected_option_id,
        &request.idempotency_key,
        &chrono::Utc::now().to_rfc3339(),
    )
    .map_err(|_| bad_request("selected intervention option is unavailable"))?;
    let message =
        intervention_decision_message(&thread_id, &format!("user://{}", user.id), &decision)
            .map_err(|_| bad_request("intervention decision could not be recorded"))?;
    if message.id != expected_id {
        return Err(bad_request("intervention decision identity mismatch"));
    }
    let clarification_draft_message_id = if request.selected_option_id == "ask_vendor" {
        let draft_message = clarification_draft_message(
            &projection.clarification_draft,
            &thread_id,
            &format!("user://{}", user.id),
        );
        let draft_message_id = draft_message.id.clone();
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            &user.id,
            draft_message,
        )
        .await
        .map_err(|_| store_error("clarification draft persistence failed"))?;
        Some(draft_message_id)
    } else {
        None
    };
    let inserted = store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message.clone(),
    )
    .await
    .map_err(|_| store_error("decision persistence failed"))?;
    serial.commit().await.map_err(store_error)?;
    Ok(Json(SelectInterventionResponse {
        inserted,
        message_id: message.id,
        decision,
        intervention: projection,
        clarification_draft_message_id,
    }))
}

fn validate_optional_grant(
    messages: &[crate::message::AFPMessage],
    request: &PrepareInterventionRequest,
    quotation_id: &str,
    vendor_id: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(message_id) = request.grant_message_id.as_deref() else {
        return Ok(None);
    };
    let message = messages
        .iter()
        .find(|message| message.id == message_id)
        .ok_or_else(|| bad_request("approved vendor context is unavailable"))?;
    let envelope = grant_envelope(message)
        .ok_or_else(|| bad_request("approved vendor context is unavailable"))?;
    let grant = envelope.grant;
    let allowed = grant.thread_id == request.thread_id
        && grant.quotation_id == quotation_id
        && grant.quotation_version_id == request.quotation_version_id
        && grant.target_vendor_id == vendor_id
        && grant
            .allowed_actions
            .contains(&ContextGrantAction::AnswerQuestions)
        && grant
            .allowed_question_ids
            .iter()
            .any(|id| id == &request.constraint_id)
        && !grant_revoked(messages, &grant.grant_id);
    allowed
        .then(|| Some(message_id.to_string()))
        .ok_or_else(|| bad_request("approved vendor context does not cover this question"))
}

fn validate_request(request: &PrepareInterventionRequest) -> Result<(), (StatusCode, String)> {
    for value in [
        &request.thread_id,
        &request.plan_id,
        &request.constraint_id,
        &request.comparison_id,
        &request.quotation_version_id,
    ] {
        if value.trim().is_empty() || value.len() > 180 || value.chars().any(char::is_control) {
            return Err(bad_request("invalid planning intervention request"));
        }
    }
    let recipient = request.recipient.trim();
    if recipient.len() < 3
        || recipient.len() > 320
        || !recipient.contains('@')
        || recipient.chars().any(char::is_control)
    {
        return Err(bad_request("invalid clarification recipient"));
    }
    if request.grant_message_id.as_ref().is_some_and(|value| {
        value.trim().is_empty() || value.len() > 180 || value.chars().any(char::is_whitespace)
    }) {
        return Err(bad_request("invalid vendor context revision"));
    }
    Ok(())
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.to_string())
}

fn conflict(message: &str) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.to_string())
}

fn store_error(_: impl ToString) -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "planning intervention persistence is unavailable".to_string(),
    )
}

fn unavailable(message: &str) -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, message.to_string())
}
