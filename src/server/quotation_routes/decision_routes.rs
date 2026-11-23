use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::Deserialize;

use crate::quotation::{
    CandidateDisposition, ClosureState, ClosureTransition, QUOTATION_CLOSURE_TRANSITION_KIND,
    QUOTATION_VENDOR_SELECTED_KIND, QuotationFeatureFlags, QuotationSelection,
    apply_closure_transition, quotation_closure_transition_message, quotation_selection_message,
    replay_quotation_messages, validate_selection,
};

use super::{StoredResponse, store_error, visible_messages};
use crate::server::{
    AppState,
    auth::{authenticated_user, store_private_app_message},
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/quotation/decisions", post(store_selection_http))
}

#[derive(Debug, Deserialize)]
struct StoreSelectionRequest {
    thread_id: String,
    selection_id: String,
    comparison_id: String,
    expected_comparison_revision: String,
    quotation_id: String,
    quotation_version_id: String,
    vendor_id: String,
    #[serde(default)]
    expected_selection_id: Option<String>,
    idempotency_key: String,
    user_authority: bool,
}

fn feature_disabled() -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "quotation closure is not enabled".to_string(),
    )
}

fn message_kind(message: &crate::message::AFPMessage) -> &str {
    message
        .kind
        .as_deref()
        .or(message.subtype.as_deref())
        .unwrap_or_default()
}

fn idempotency_key(message: &crate::message::AFPMessage) -> Option<&str> {
    message
        .metadata
        .as_ref()
        .and_then(|value| value.get("idempotency_key"))
        .and_then(serde_json::Value::as_str)
}

fn request_matches(
    selection: &QuotationSelection,
    request: &StoreSelectionRequest,
    actor: &str,
) -> bool {
    selection.selection_id == request.selection_id
        && selection.comparison_id == request.comparison_id
        && selection.comparison_revision == request.expected_comparison_revision
        && selection.quotation_id == request.quotation_id
        && selection.quotation_version_id == request.quotation_version_id
        && selection.vendor_id == request.vendor_id
        && selection.supersedes_selection_id == request.expected_selection_id
        && selection.actor_id == actor
        && selection.user_authority == request.user_authority
        && selection.idempotency_key == request.idempotency_key
}

fn matching_existing_selection<'a>(
    messages: &'a [crate::message::AFPMessage],
    request: &StoreSelectionRequest,
    actor: &str,
) -> Result<Option<(&'a crate::message::AFPMessage, QuotationSelection)>, (StatusCode, String)> {
    let Some(message) = messages.iter().find(|message| {
        message_kind(message) == QUOTATION_VENDOR_SELECTED_KIND
            && idempotency_key(message) == Some(request.idempotency_key.as_str())
    }) else {
        return Ok(None);
    };
    let selection = message
        .content
        .get("selection")
        .cloned()
        .and_then(|value| serde_json::from_value::<QuotationSelection>(value).ok())
        .filter(|selection| request_matches(selection, request, actor))
        .ok_or((
            StatusCode::CONFLICT,
            "idempotency key is already in use".to_string(),
        ))?;
    Ok(Some((message, selection)))
}

fn closure_for_selection<'a>(
    messages: &'a [crate::message::AFPMessage],
    selection_id: &str,
) -> Option<&'a crate::message::AFPMessage> {
    let event_id = format!("selection_closure:{selection_id}");
    messages.iter().find(|message| {
        message_kind(message) == QUOTATION_CLOSURE_TRANSITION_KIND
            && message
                .content
                .get("transition")
                .and_then(|value| value.get("event_id"))
                .and_then(serde_json::Value::as_str)
                == Some(event_id.as_str())
    })
}

fn selection_closure(selection: &QuotationSelection) -> ClosureTransition {
    ClosureTransition {
        event_id: format!("selection_closure:{}", selection.selection_id),
        quotation_id: selection.quotation_id.clone(),
        quotation_version_id: selection.quotation_version_id.clone(),
        expected_state: None,
        target_state: ClosureState::Selected,
        actor_id: selection.actor_id.clone(),
        user_authority: true,
        occurred_at: selection.occurred_at.clone(),
        evidence_sources: Vec::new(),
        contract_changes: Vec::new(),
        contract_changes_reviewed: false,
        deposit: None,
        deadline_at: None,
    }
}

async fn store_initial_closure(
    state: &AppState,
    user_id: &str,
    thread_id: &str,
    selection_message_id: &str,
    selection: &QuotationSelection,
) -> Result<String, (StatusCode, String)> {
    let transition = selection_closure(selection);
    apply_closure_transition(None, &transition).map_err(|_| {
        (
            StatusCode::CONFLICT,
            "quotation selection could not start closure".to_string(),
        )
    })?;
    let message = quotation_closure_transition_message(
        &transition,
        &format!("{}:closure", selection.idempotency_key),
        thread_id,
        selection_message_id,
    );
    let id = message.id.clone();
    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, user_id, message)
        .await
        .map_err(|_| store_error())?;
    Ok(id)
}

async fn store_selection_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<StoreSelectionRequest>,
) -> Result<Json<StoredResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !QuotationFeatureFlags::from_env().closure {
        return Err(feature_disabled());
    }
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    if let Some((stored, selection)) = matching_existing_selection(&messages, &request, &user.id)? {
        let closure_id =
            if let Some(closure) = closure_for_selection(&messages, &selection.selection_id) {
                closure.id.clone()
            } else {
                store_initial_closure(&state, &user.id, &request.thread_id, &stored.id, &selection)
                    .await?
            };
        return Ok(Json(StoredResponse {
            message_ids: vec![stored.id.clone(), closure_id],
        }));
    }

    let replay = replay_quotation_messages(&messages);
    let comparison = replay
        .active_comparisons
        .get(&request.comparison_id)
        .filter(|_| {
            replay.comparison_message_ids.get(&request.comparison_id)
                == Some(&request.expected_comparison_revision)
        })
        .ok_or((
            StatusCode::CONFLICT,
            "quotation decision revision is stale".to_string(),
        ))?;
    let candidate = comparison
        .candidates
        .iter()
        .find(|candidate| {
            candidate.quotation_id == request.quotation_id
                && candidate.version_id == request.quotation_version_id
                && candidate.vendor_id == request.vendor_id
                && candidate.disposition != CandidateDisposition::Excluded
        })
        .ok_or((
            StatusCode::NOT_FOUND,
            "quotation decision is unavailable".to_string(),
        ))?;
    if replay
        .active_version_by_quotation
        .get(&candidate.quotation_id)
        != Some(&candidate.version_id)
    {
        return Err((
            StatusCode::CONFLICT,
            "quotation decision revision is stale".to_string(),
        ));
    }
    let current_selection = replay.active_selections.get(&request.comparison_id);
    if current_selection.map(|selection| selection.selection_id.as_str())
        != request.expected_selection_id.as_deref()
    {
        return Err((
            StatusCode::CONFLICT,
            "quotation selection is stale".to_string(),
        ));
    }
    let selection = QuotationSelection {
        selection_id: request.selection_id.clone(),
        comparison_id: request.comparison_id.clone(),
        comparison_revision: request.expected_comparison_revision.clone(),
        quotation_id: request.quotation_id.clone(),
        quotation_version_id: request.quotation_version_id.clone(),
        vendor_id: request.vendor_id.clone(),
        supersedes_selection_id: request.expected_selection_id.clone(),
        actor_id: user.id.clone(),
        user_authority: request.user_authority,
        occurred_at: chrono::Utc::now().to_rfc3339(),
        idempotency_key: request.idempotency_key.clone(),
    };
    validate_selection(&selection).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "invalid quotation selection".to_string(),
        )
    })?;
    let parent_message_id = current_selection
        .and_then(|current| {
            messages.iter().find(|message| {
                message_kind(message) == QUOTATION_VENDOR_SELECTED_KIND
                    && message
                        .content
                        .get("selection")
                        .and_then(|value| value.get("selection_id"))
                        .and_then(serde_json::Value::as_str)
                        == Some(current.selection_id.as_str())
            })
        })
        .map(|message| message.id.as_str())
        .unwrap_or(request.expected_comparison_revision.as_str());
    let selection_message =
        quotation_selection_message(&selection, &request.thread_id, parent_message_id);
    let selection_message_id = selection_message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        selection_message,
    )
    .await
    .map_err(|_| store_error())?;
    let closure_id = store_initial_closure(
        &state,
        &user.id,
        &request.thread_id,
        &selection_message_id,
        &selection,
    )
    .await?;
    Ok(Json(StoredResponse {
        message_ids: vec![selection_message_id, closure_id],
    }))
}
