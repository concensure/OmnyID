/*
 * @module-id: rust.server.federation-retry-routes
 * @primary-capability: rust.server-federation-retry
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

#[derive(serde::Deserialize)]
pub(super) struct FederationRetryRequest {
    attempted_message_id: String,
}

pub(super) fn stored_federated_outbound_message(
    payload: Value,
) -> Result<AFPMessage, (StatusCode, String)> {
    let message = serde_json::from_value::<AFPMessage>(payload).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "stored message is not a valid AFP message".to_string(),
        )
    })?;
    if message.subtype.as_deref() != Some("federated_outbound") {
        return Err((
            StatusCode::BAD_REQUEST,
            "only federated outbound messages can be retried".to_string(),
        ));
    }
    if message
        .to
        .first()
        .and_then(|recipient| crate::federation::parse_agent_id(recipient))
        .is_none()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "federated outbound message is missing a valid recipient agent id".to_string(),
        ));
    }
    Ok(message)
}

pub(super) fn has_successful_federation_delivery_receipt(
    messages: &[AFPMessage],
    attempted_message_id: &str,
) -> bool {
    messages.iter().any(|message| {
        if message.subtype.as_deref() != Some("federated_delivery_sent") {
            return false;
        }
        let content_attempt = message
            .content
            .get("attempted_message_id")
            .and_then(Value::as_str);
        let metadata_attempt = message
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("attempted_message_id"))
            .and_then(Value::as_str);
        content_attempt == Some(attempted_message_id)
            || metadata_attempt == Some(attempted_message_id)
    })
}

pub(super) async fn dispatch_federated_message_with_receipt(
    state: &Arc<AppState>,
    user_id: &str,
    message: &AFPMessage,
    recipient_agent_id: &str,
    own_domain: &str,
    signing_key: &[u8; 32],
) -> Result<(), (StatusCode, String)> {
    if let Err(err) = crate::federation::dispatch_relay(
        serde_json::to_value(message).map_err(internal_http_error)?,
        recipient_agent_id,
        own_domain,
        &hex::encode(signing_key),
    )
    .await
    {
        let err_text = federation_delivery_error_summary(&err.to_string());
        let mut failure_message = build_federated_delivery_failure_message(message, &err_text);
        sign_message(&mut failure_message, signing_key);
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            user_id,
            failure_message,
        )
        .await
        .map_err(status_to_http)?;
        return Err((StatusCode::BAD_GATEWAY, err_text));
    }

    let mut sent_message = build_federated_delivery_sent_message(message);
    sign_message(&mut sent_message, signing_key);
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        user_id,
        sent_message,
    )
    .await
    .map_err(status_to_http)?;
    Ok(())
}

/// POST /federation/retry
///
/// Authenticated UI endpoint for retrying a previously stored federated
/// outbound AFP message. The original signed message is re-relayed and a fresh
/// delivery receipt is appended to the same thread.
pub(super) async fn federation_retry_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<FederationRetryRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("federation_retry", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;

    let attempted_message_id = req.attempted_message_id.trim();
    if attempted_message_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "attempted_message_id is required".to_string(),
        ));
    }

    let payload = state
        .db
        .get_private_message_payload(&user.id, attempted_message_id)
        .await
        .map_err(internal_http_error)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "federated outbound message not found".to_string(),
            )
        })?;
    let message = stored_federated_outbound_message(payload)?;
    let recipient_agent_id = message.to.first().cloned().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "federated outbound message is missing a recipient agent id".to_string(),
        )
    })?;

    let existing_thread_messages = state
        .db
        .get_private_thread(&user.id, &message.thread_id)
        .await
        .map_err(internal_http_error)?
        .into_iter()
        .map(proto_to_app)
        .collect::<Vec<_>>();
    if has_successful_federation_delivery_receipt(&existing_thread_messages, &message.id) {
        return Ok(Json(serde_json::json!({
            "success": true,
            "retried": false,
            "message_id": message.id,
            "thread_id": message.thread_id,
            "recipient_agent_id": recipient_agent_id,
            "delivery_status": "already_accepted",
        })));
    }

    let local_card = AgentCard::from_env();
    let Some((_, own_domain)) = crate::federation::parse_agent_id(&local_card.agent_id) else {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            "OMNYID_AGENT_ID must be a valid agent id before federation can retry".to_string(),
        ));
    };
    if message.from != local_card.agent_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "only outbound messages from this homeserver agent can be retried".to_string(),
        ));
    }
    let signing_key = env_hex_32("OMNYID_SIGNING_KEY_HEX")
        .map_err(|err| (StatusCode::PRECONDITION_FAILED, err))?
        .ok_or_else(|| {
            (
                StatusCode::PRECONDITION_FAILED,
                "OMNYID_SIGNING_KEY_HEX is required for signed federation retry".to_string(),
            )
        })?;

    dispatch_federated_message_with_receipt(
        &state,
        &user.id,
        &message,
        &recipient_agent_id,
        own_domain,
        &signing_key,
    )
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "retried": true,
        "message_id": message.id,
        "thread_id": message.thread_id,
        "recipient_agent_id": recipient_agent_id,
    })))
}
