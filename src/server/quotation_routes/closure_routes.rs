use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::Deserialize;
use serde_json::json;

use crate::quotation::{
    ClosureState, ClosureTransition, DepositRecord, MaterialChange,
    QUOTATION_CLOSURE_TRANSITION_KIND, QuotationFeatureFlags, SourceReference,
    apply_closure_transition, quotation_closure_transition_message, replay_quotation_messages,
};

use super::{StoredResponse, store_error, visible_messages};
use crate::server::{
    AppState,
    auth::{authenticated_user, store_private_app_message},
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/quotation/closure-transitions",
        post(store_closure_transition_http),
    )
}

#[derive(Debug, Deserialize)]
struct StoreClosureTransitionRequest {
    thread_id: String,
    event_id: String,
    quotation_id: String,
    quotation_version_id: String,
    comparison_id: String,
    expected_comparison_revision: String,
    expected_state: ClosureState,
    target_state: ClosureState,
    user_authority: bool,
    #[serde(default)]
    evidence_sources: Vec<SourceReference>,
    #[serde(default)]
    contract_changes: Vec<MaterialChange>,
    #[serde(default)]
    contract_changes_reviewed: bool,
    #[serde(default)]
    deposit: Option<DepositRecord>,
    #[serde(default)]
    deadline_at: Option<String>,
    idempotency_key: String,
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

fn stored_comparison_matches(
    message: &crate::message::AFPMessage,
    request: &StoreClosureTransitionRequest,
) -> bool {
    message.metadata.as_ref().is_some_and(|metadata| {
        metadata
            .get("comparison_id")
            .and_then(serde_json::Value::as_str)
            == Some(request.comparison_id.as_str())
            && metadata
                .get("comparison_revision")
                .and_then(serde_json::Value::as_str)
                == Some(request.expected_comparison_revision.as_str())
    })
}

fn request_matches(
    transition: &ClosureTransition,
    request: &StoreClosureTransitionRequest,
    actor: &str,
) -> bool {
    transition.event_id == request.event_id
        && transition.quotation_id == request.quotation_id
        && transition.quotation_version_id == request.quotation_version_id
        && transition.expected_state == Some(request.expected_state)
        && transition.target_state == request.target_state
        && transition.actor_id == actor
        && transition.user_authority == request.user_authority
        && transition.evidence_sources == request.evidence_sources
        && transition.contract_changes == request.contract_changes
        && transition.contract_changes_reviewed == request.contract_changes_reviewed
        && transition.deposit == request.deposit
        && transition.deadline_at == request.deadline_at
}

fn existing_transition<'a>(
    messages: &'a [crate::message::AFPMessage],
    request: &StoreClosureTransitionRequest,
    actor: &str,
) -> Result<Option<&'a crate::message::AFPMessage>, (StatusCode, String)> {
    let Some(message) = messages.iter().find(|message| {
        message_kind(message) == QUOTATION_CLOSURE_TRANSITION_KIND
            && idempotency_key(message) == Some(request.idempotency_key.as_str())
    }) else {
        return Ok(None);
    };
    let matches = message
        .content
        .get("transition")
        .cloned()
        .and_then(|value| serde_json::from_value::<ClosureTransition>(value).ok())
        .is_some_and(|transition| request_matches(&transition, request, actor))
        && stored_comparison_matches(message, request);
    if !matches {
        return Err((
            StatusCode::CONFLICT,
            "idempotency key is already in use".to_string(),
        ));
    }
    Ok(Some(message))
}

fn parent_closure_message<'a>(
    messages: &'a [crate::message::AFPMessage],
    last_event_id: &str,
) -> Option<&'a crate::message::AFPMessage> {
    messages.iter().find(|message| {
        message_kind(message) == QUOTATION_CLOSURE_TRANSITION_KIND
            && message
                .content
                .get("transition")
                .and_then(|value| value.get("event_id"))
                .and_then(serde_json::Value::as_str)
                == Some(last_event_id)
    })
}

async fn store_closure_transition_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<StoreClosureTransitionRequest>,
) -> Result<Json<StoredResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !QuotationFeatureFlags::from_env().closure {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "quotation closure is not enabled".to_string(),
        ));
    }
    if request.target_state == ClosureState::Selected {
        return Err((
            StatusCode::BAD_REQUEST,
            "selection must use the quotation decision route".to_string(),
        ));
    }
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    if let Some(message) = existing_transition(&messages, &request, &user.id)? {
        return Ok(Json(StoredResponse {
            message_ids: vec![message.id.clone()],
        }));
    }

    let replay = replay_quotation_messages(&messages);
    if replay
        .active_version_by_quotation
        .get(&request.quotation_id)
        != Some(&request.quotation_version_id)
    {
        return Err((
            StatusCode::CONFLICT,
            "quotation closure revision is stale".to_string(),
        ));
    }
    let selection = replay
        .active_selections
        .get(&request.comparison_id)
        .filter(|selection| {
            selection.comparison_revision == request.expected_comparison_revision
                && selection.quotation_id == request.quotation_id
                && selection.quotation_version_id == request.quotation_version_id
        })
        .ok_or((
            StatusCode::NOT_FOUND,
            "quotation closure is unavailable".to_string(),
        ))?;
    let current = replay
        .active_closures
        .get(&request.quotation_id)
        .filter(|snapshot| snapshot.quotation_version_id == request.quotation_version_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            "quotation closure is unavailable".to_string(),
        ))?;
    if current.state != request.expected_state {
        return Err((
            StatusCode::CONFLICT,
            "quotation closure state is stale".to_string(),
        ));
    }
    let visible_ids = messages
        .iter()
        .map(|message| message.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if request
        .evidence_sources
        .iter()
        .any(|source| !visible_ids.contains(source.source_id.as_str()))
    {
        return Err((
            StatusCode::NOT_FOUND,
            "quotation closure evidence is unavailable".to_string(),
        ));
    }
    let transition = ClosureTransition {
        event_id: request.event_id.clone(),
        quotation_id: request.quotation_id.clone(),
        quotation_version_id: request.quotation_version_id.clone(),
        expected_state: Some(request.expected_state),
        target_state: request.target_state,
        actor_id: user.id.clone(),
        user_authority: request.user_authority,
        occurred_at: chrono::Utc::now().to_rfc3339(),
        evidence_sources: request.evidence_sources.clone(),
        contract_changes: request.contract_changes.clone(),
        contract_changes_reviewed: request.contract_changes_reviewed,
        deposit: request.deposit.clone(),
        deadline_at: request.deadline_at.clone(),
    };
    apply_closure_transition(Some(current), &transition).map_err(|_| {
        (
            StatusCode::CONFLICT,
            "quotation closure transition was rejected".to_string(),
        )
    })?;
    let parent = parent_closure_message(&messages, &current.last_event_id).ok_or((
        StatusCode::CONFLICT,
        "quotation closure predecessor is unavailable".to_string(),
    ))?;
    let mut message = quotation_closure_transition_message(
        &transition,
        &request.idempotency_key,
        &request.thread_id,
        &parent.id,
    );
    if let Some(metadata) = message
        .metadata
        .as_mut()
        .and_then(serde_json::Value::as_object_mut)
    {
        metadata.insert("comparison_id".to_string(), json!(request.comparison_id));
        metadata.insert(
            "comparison_revision".to_string(),
            json!(request.expected_comparison_revision),
        );
    }
    message.references.push(json!({
        "type": "comparison",
        "target": selection.comparison_id,
        "metadata": {"revision": selection.comparison_revision},
    }));
    message.typed_refs = message.references.clone();
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
