use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;

use crate::{
    agentcard::AgentCard,
    crypto::sign_message,
    db::{StoredVendorTransport, VendorTransportStoreOutcome, VendorTransportWrite},
    message::AFPMessage,
    quotation::{
        ActiveVendorGrant, ChannelReconciliationDecision, ClaimedVendorAuthority, ClosureState,
        ContextGrantAction, ContextGrantScope, QuotationFeatureFlags, QuotationVendorResponse,
        VendorTransportFailure, VendorTransportReceipt, WEDDING_ENQUIRY_RESPONSE_TYPE,
        WEDDING_ENQUIRY_TYPE, afp_transport_accepted_message, afp_vendor_response_message,
        channel_reconciled_message, envelope_bytes, envelope_digest,
        reconcile_verified_afp_response, replay_quotation_messages, routing_metadata,
        valid_vendor_encrypted_envelope, validate_claimed_vendor_response,
        vendor_transport_receipt,
    },
};

use super::{
    AppState,
    auth::{authenticated_user, store_private_app_message, thread_messages_for_headers},
    proto_to_app,
    quotation_response_capability_routes::{
        approved_receipt_visible, grant_envelope, grant_revoked, owner_messages,
    },
};

const UNAVAILABLE: &str = "vendor transaction unavailable";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/quotation/vendor-transactions/invitations",
            post(create_invitation_http),
        )
        .route(
            "/quotation/vendor-transactions/inbox",
            get(vendor_inbox_http),
        )
        .route(
            "/quotation/vendor-transactions/responses",
            post(submit_response_http),
        )
        .route(
            "/quotation/vendor-transactions/responses/converge",
            post(converge_response_http),
        )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInvitationRequest {
    thread_id: String,
    grant_message_id: String,
    request_id: String,
    nonce: String,
    expires_at: String,
    encryption: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SubmitResponseRequest {
    request_id: String,
    invitation_message_id: String,
    message: AFPMessage,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConvergeResponseRequest {
    transport_message_id: String,
    response: QuotationVendorResponse,
}

#[derive(Serialize)]
struct ConvergeResponseResult {
    status: &'static str,
    response_id: String,
    replayed: bool,
}

#[derive(Serialize)]
struct VendorInboxItem {
    invitation_message_id: String,
    vendor_id: String,
    grant_id: String,
    quotation_id: String,
    quotation_version_id: String,
    projection_fingerprint: String,
    expires_at: String,
    envelope: AFPMessage,
}

#[derive(Serialize)]
struct VendorInboxResponse {
    transactions: Vec<VendorInboxItem>,
}

struct VendorAgentSnapshot {
    vendor_id: String,
    claim_status: String,
    agent_id: String,
    card: AgentCard,
}

fn enabled() -> bool {
    QuotationFeatureFlags::from_env().claimed_vendor_responses
}

fn service_unavailable() -> (StatusCode, String) {
    (StatusCode::SERVICE_UNAVAILABLE, UNAVAILABLE.to_string())
}

fn unavailable() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, UNAVAILABLE.to_string())
}

fn database_failure(_: sqlx::Error) -> (StatusCode, String) {
    service_unavailable()
}

fn valid_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= 180 && !value.chars().any(char::is_control)
}

fn parsed_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn deterministic_message_id(namespace: &str, fields: &[&str]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(namespace.as_bytes());
    for field in fields {
        hasher.update([0]);
        hasher.update(field.as_bytes());
    }
    let digest = hasher.finalize();
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    ulid::Ulid::from_bytes(bytes).to_string()
}

fn response_capable(card: &AgentCard) -> bool {
    card.verify()
        && card
            .capabilities
            .iter()
            .any(|capability| capability.name == WEDDING_ENQUIRY_RESPONSE_TYPE)
        && card
            .encryption_public_key_hex
            .as_deref()
            .and_then(|value| hex::decode(value).ok())
            .is_some_and(|value| value.len() == 32)
}

async fn vendor_agent_for_user(
    state: &AppState,
    user_id: &str,
    vendor_id: &str,
) -> Result<VendorAgentSnapshot, (StatusCode, String)> {
    let row = sqlx::query(
        r#"SELECT v.vendor_id, v.claim_status, l.agent_id, l.agent_card
             FROM wedding_vendors v
             JOIN wedding_vendor_agent_links l ON l.vendor_id = v.vendor_id
            WHERE v.vendor_id = $1 AND v.claimed_by_user_id = $2
              AND v.status = 'active' AND v.claim_status IN ('claimed','verified')"#,
    )
    .bind(vendor_id)
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(unavailable)?;
    let card: AgentCard =
        serde_json::from_value(row.get("agent_card")).map_err(|_| unavailable())?;
    let snapshot = VendorAgentSnapshot {
        vendor_id: row.get("vendor_id"),
        claim_status: row.get("claim_status"),
        agent_id: row.get("agent_id"),
        card,
    };
    if snapshot.card.agent_id != snapshot.agent_id || !response_capable(&snapshot.card) {
        return Err(unavailable());
    }
    Ok(snapshot)
}

fn store_outcome(
    outcome: VendorTransportStoreOutcome,
) -> Result<Json<VendorTransportReceipt>, (StatusCode, String)> {
    match outcome {
        VendorTransportStoreOutcome::Stored(receipt)
        | VendorTransportStoreOutcome::Retry(receipt) => Ok(Json(receipt)),
        VendorTransportStoreOutcome::RequestConflict
        | VendorTransportStoreOutcome::NonceConflict => Err((
            StatusCode::CONFLICT,
            "request could not be replayed".to_string(),
        )),
    }
}

async fn create_invitation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateInvitationRequest>,
) -> Result<Json<VendorTransportReceipt>, (StatusCode, String)> {
    if !enabled() {
        return Err(service_unavailable());
    }
    if !valid_id(&request.thread_id)
        || !valid_id(&request.grant_message_id)
        || !valid_id(&request.request_id)
        || !valid_id(&request.nonce)
        || !valid_vendor_encrypted_envelope(&request.encryption)
    {
        return Err((StatusCode::BAD_REQUEST, "invalid request".to_string()));
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let messages = thread_messages_for_headers(&state.db, &headers, &request.thread_id).await?;
    let messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let grant_message = messages
        .iter()
        .find(|message| message.id == request.grant_message_id)
        .ok_or_else(unavailable)?;
    let grant_bundle = grant_envelope(grant_message).ok_or_else(unavailable)?;
    let grant = &grant_bundle.grant;
    let now = Utc::now();
    let expires_at = parsed_time(&request.expires_at).ok_or_else(unavailable)?;
    let grant_expiry = parsed_time(&grant.expires_at).ok_or_else(unavailable)?;
    let replay = replay_quotation_messages(&messages);
    if grant.granted_by_user_id != user.id
        || grant.thread_id != request.thread_id
        || grant_message.parent_id.as_deref() != Some(grant.approval_receipt_ref.as_str())
        || !approved_receipt_visible(&messages, grant)
        || grant_revoked(&messages, &grant.grant_id)
        || expires_at <= now
        || expires_at > grant_expiry
        || expires_at - now > chrono::Duration::days(7)
        || !grant
            .allowed_actions
            .contains(&ContextGrantAction::AnswerQuestions)
        || replay.active_version_by_quotation.get(&grant.quotation_id)
            != Some(&grant.quotation_version_id)
    {
        return Err(unavailable());
    }
    let target_agent_id = grant.target_agent_id.as_deref().ok_or_else(unavailable)?;
    let agent = sqlx::query(
        r#"SELECT v.claim_status, l.agent_id, l.agent_card
             FROM wedding_vendors v
             JOIN wedding_vendor_agent_links l ON l.vendor_id = v.vendor_id
            WHERE v.vendor_id = $1 AND v.status = 'active'
              AND v.claim_status IN ('claimed','verified')"#,
    )
    .bind(&grant.target_vendor_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(unavailable)?;
    let agent_id: String = agent.get("agent_id");
    let card: AgentCard =
        serde_json::from_value(agent.get("agent_card")).map_err(|_| unavailable())?;
    if agent_id != target_agent_id || card.agent_id != agent_id || !response_capable(&card) {
        return Err(unavailable());
    }
    let message_id = deterministic_message_id(
        "quotation-vendor-invitation",
        &[&user.id, &grant.grant_id, &request.request_id],
    );
    let mut message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: message_id.clone(),
        thread_id: grant.thread_id.clone(),
        parent_id: Some(grant_message.id.clone()),
        from: grant.response_recipient_id.clone(),
        to: vec![agent_id.clone()],
        timestamp: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        r#type: WEDDING_ENQUIRY_TYPE.to_string(),
        kind: Some("quotation_vendor_response_invited".to_string()),
        supertags: vec!["quotation".to_string(), "ciphertext_only".to_string()],
        subtype: Some("quotation_vendor_response_invited".to_string()),
        content: Value::Null,
        metadata: Some(json!({
            "schema_version": "quotation.vendor_invitation_transport.v1",
            "grant_message_id": grant_message.id,
            "grant_id": grant.grant_id,
            "vendor_id": grant.target_vendor_id,
            "quotation_id": grant.quotation_id,
            "quotation_version_id": grant.quotation_version_id,
            "projection_fingerprint": grant.projection_fingerprint,
            "nonce": request.nonce,
            "agent_card_key_id": card.key_id,
            "expires_at": request.expires_at,
        })),
        signature: String::new(),
        encryption: Some(request.encryption),
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    };
    let signing_seed = super::env_hex_32("OMNYID_SIGNING_KEY_HEX")
        .map_err(|_| service_unavailable())?
        .ok_or_else(service_unavailable)?;
    sign_message(&mut message, &signing_seed);
    let envelope = envelope_bytes(&message).ok_or_else(unavailable)?;
    let request_digest = envelope_digest(&message).ok_or_else(unavailable)?;
    let receipt = vendor_transport_receipt(
        &grant.target_vendor_id,
        &request.request_id,
        &request_digest,
        Ok(&message.id),
        now,
    );
    let write = VendorTransportWrite {
        owner_user_id: user.id,
        vendor_id: grant.target_vendor_id.clone(),
        message_id,
        thread_id: grant.thread_id.clone(),
        from_agent_id: grant.response_recipient_id.clone(),
        to_agent_id: agent_id,
        direction: "to_vendor".to_string(),
        afp_type: WEDDING_ENQUIRY_TYPE.to_string(),
        envelope,
        expires_at,
        grant_message_id: grant_message.id.clone(),
        grant_id: grant.grant_id.clone(),
        quotation_id: grant.quotation_id.clone(),
        quotation_version_id: grant.quotation_version_id.clone(),
        projection_fingerprint: grant.projection_fingerprint.clone(),
        response_id: None,
        response_fingerprint: None,
        transport_nonce: request.nonce,
        agent_card_key_id: card.key_id,
        request_id: request.request_id,
        request_digest,
    };
    let outcome = state
        .db
        .store_vendor_transport(&write, &receipt)
        .await
        .map_err(database_failure)?;
    store_outcome(outcome)
}

async fn vendor_inbox_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<VendorInboxResponse>, (StatusCode, String)> {
    if !enabled() {
        return Err(service_unavailable());
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let stored = state
        .db
        .vendor_transport_inbox(&user.id)
        .await
        .map_err(database_failure)?;
    let mut transactions = Vec::new();
    for transport in stored {
        if vendor_agent_for_user(&state, &user.id, &transport.vendor_id)
            .await
            .is_err()
        {
            continue;
        }
        let Ok(envelope) = serde_json::from_slice::<AFPMessage>(&transport.envelope) else {
            continue;
        };
        if envelope.content.is_null()
            && envelope.r#type == WEDDING_ENQUIRY_TYPE
            && envelope.id == transport.message_id
        {
            transactions.push(inbox_item(transport, envelope));
        }
    }
    Ok(Json(VendorInboxResponse { transactions }))
}

fn inbox_item(transport: StoredVendorTransport, envelope: AFPMessage) -> VendorInboxItem {
    VendorInboxItem {
        invitation_message_id: transport.message_id,
        vendor_id: transport.vendor_id,
        grant_id: transport.grant_id,
        quotation_id: transport.quotation_id,
        quotation_version_id: transport.quotation_version_id,
        projection_fingerprint: transport.projection_fingerprint,
        expires_at: transport
            .expires_at
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        envelope,
    }
}

async fn submit_response_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SubmitResponseRequest>,
) -> Result<Json<VendorTransportReceipt>, (StatusCode, String)> {
    if !enabled() {
        return Err(service_unavailable());
    }
    if !valid_id(&request.request_id) || !valid_id(&request.invitation_message_id) {
        return Err((StatusCode::BAD_REQUEST, "invalid request".to_string()));
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let invitation = state
        .db
        .claimed_vendor_invitation(&user.id, &request.invitation_message_id)
        .await
        .map_err(database_failure)?
        .ok_or_else(unavailable)?;
    let agent = vendor_agent_for_user(&state, &user.id, &invitation.vendor_id).await?;
    let messages = owner_messages(&state, &invitation.owner_user_id, &invitation.thread_id)
        .await
        .map_err(|_| unavailable())?;
    let grant_message = messages
        .iter()
        .find(|message| message.id == invitation.grant_message_id)
        .ok_or_else(unavailable)?;
    let bundle = grant_envelope(grant_message).ok_or_else(unavailable)?;
    let grant = &bundle.grant;
    if grant.granted_by_user_id != invitation.owner_user_id
        || grant.grant_id != invitation.grant_id
        || grant.target_vendor_id != invitation.vendor_id
        || grant.quotation_id != invitation.quotation_id
        || grant.quotation_version_id != invitation.quotation_version_id
        || grant.thread_id != invitation.thread_id
        || !grant
            .projection_fingerprint
            .eq_ignore_ascii_case(&invitation.projection_fingerprint)
        || grant_message.parent_id.as_deref() != Some(grant.approval_receipt_ref.as_str())
    {
        return Err(unavailable());
    }
    let replay = replay_quotation_messages(&messages);
    let closure_terminal = replay
        .active_closures
        .get(&grant.quotation_id)
        .is_some_and(|closure| {
            matches!(
                closure.state,
                ClosureState::BookingConfirmed
                    | ClosureState::Cancelled
                    | ClosureState::Refunded
                    | ClosureState::Superseded
            )
        });
    let current_key =
        crate::crypto::signature_public_key_hex(&agent.card.signature).ok_or_else(unavailable)?;
    let authority = ClaimedVendorAuthority {
        vendor_id: &agent.vendor_id,
        agent_id: &agent.agent_id,
        agent_card_key_id: &agent.card.key_id,
        signing_public_key_hex: current_key,
        claim_status: &agent.claim_status,
        agent_card_valid: agent.card.verify(),
        response_capability: response_capable(&agent.card),
    };
    let active_grant = ActiveVendorGrant {
        grant_message_id: &invitation.grant_message_id,
        grant_id: &invitation.grant_id,
        vendor_id: &invitation.vendor_id,
        target_agent_id: grant.target_agent_id.as_deref().unwrap_or_default(),
        response_recipient_id: &grant.response_recipient_id,
        quotation_id: &invitation.quotation_id,
        quotation_version_id: &invitation.quotation_version_id,
        thread_id: &invitation.thread_id,
        projection_fingerprint: &invitation.projection_fingerprint,
        expires_at: &grant.expires_at,
        active: approved_receipt_visible(&messages, grant)
            && !grant_revoked(&messages, &grant.grant_id),
        quotation_active: replay.active_version_by_quotation.get(&grant.quotation_id)
            == Some(&grant.quotation_version_id),
        closure_terminal,
        answer_questions_allowed: grant
            .allowed_actions
            .contains(&ContextGrantAction::AnswerQuestions),
    };
    let now = Utc::now();
    let digest = envelope_digest(&request.message).unwrap_or_else(|| {
        hex::encode(Sha256::digest(
            serde_json::to_vec(&request.message).unwrap_or_default(),
        ))
    });
    let metadata =
        match validate_claimed_vendor_response(&request.message, &authority, &active_grant, now) {
            Ok(metadata)
                if request.message.parent_id.as_deref() == Some(invitation.message_id.as_str()) =>
            {
                metadata
            }
            Ok(_) => {
                return rejected_response(
                    &state,
                    &invitation,
                    &request.request_id,
                    &digest,
                    VendorTransportFailure::BindingMismatch,
                    now,
                )
                .await;
            }
            Err(failure) => {
                return rejected_response(
                    &state,
                    &invitation,
                    &request.request_id,
                    &digest,
                    failure,
                    now,
                )
                .await;
            }
        };
    let envelope = envelope_bytes(&request.message).ok_or_else(unavailable)?;
    let receipt = vendor_transport_receipt(
        &invitation.vendor_id,
        &request.request_id,
        &digest,
        Ok(&request.message.id),
        now,
    );
    let write = VendorTransportWrite {
        owner_user_id: invitation.owner_user_id,
        vendor_id: invitation.vendor_id,
        message_id: request.message.id.clone(),
        thread_id: invitation.thread_id,
        from_agent_id: agent.agent_id,
        to_agent_id: grant.response_recipient_id.clone(),
        direction: "to_couple".to_string(),
        afp_type: WEDDING_ENQUIRY_RESPONSE_TYPE.to_string(),
        envelope,
        expires_at: parsed_time(&metadata.expires_at).ok_or_else(unavailable)?,
        grant_message_id: invitation.grant_message_id,
        grant_id: invitation.grant_id,
        quotation_id: invitation.quotation_id,
        quotation_version_id: invitation.quotation_version_id,
        projection_fingerprint: invitation.projection_fingerprint,
        response_id: Some(metadata.response_id),
        response_fingerprint: Some(metadata.response_fingerprint),
        transport_nonce: metadata.nonce,
        agent_card_key_id: agent.card.key_id,
        request_id: request.request_id,
        request_digest: digest,
    };
    let outcome = state
        .db
        .store_vendor_transport(&write, &receipt)
        .await
        .map_err(database_failure)?;
    match outcome {
        VendorTransportStoreOutcome::Stored(receipt)
        | VendorTransportStoreOutcome::Retry(receipt) => {
            let accepted = afp_transport_accepted_message(
                &receipt,
                &write.thread_id,
                &write.grant_message_id,
                &write.vendor_id,
                &write.quotation_id,
                &write.quotation_version_id,
                write.response_id.as_deref().unwrap_or_default(),
                write.response_fingerprint.as_deref().unwrap_or_default(),
                &write.owner_user_id,
            );
            // Transport storage is already committed. A private AFP projection is
            // replay-safe and best-effort; failure cannot misreport the provider receipt.
            let _ = store_private_app_message(
                &state.db,
                &state.metrics,
                &state.relay_tx,
                &write.owner_user_id,
                accepted,
            )
            .await;
            Ok(Json(receipt))
        }
        VendorTransportStoreOutcome::RequestConflict
        | VendorTransportStoreOutcome::NonceConflict => Err((
            StatusCode::CONFLICT,
            "request could not be replayed".to_string(),
        )),
    }
}

async fn converge_response_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ConvergeResponseRequest>,
) -> Result<Json<ConvergeResponseResult>, (StatusCode, String)> {
    if !enabled() || !valid_id(&request.transport_message_id) {
        return Err(service_unavailable());
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let stored = state
        .db
        .vendor_response_transport_for_owner(&user.id, &request.transport_message_id)
        .await
        .map_err(database_failure)?
        .ok_or_else(unavailable)?;
    let envelope =
        serde_json::from_slice::<AFPMessage>(&stored.envelope).map_err(|_| unavailable())?;
    let routing = routing_metadata(&envelope).map_err(|_| unavailable())?;
    if envelope.id != stored.message_id
        || request.response.thread_id != stored.thread_id
        || request.response.attestation.attested_by != stored.from_agent_id
        || routing.grant_message_id != stored.grant_message_id
        || routing.grant_id != stored.grant_id
        || routing.vendor_id != stored.vendor_id
        || routing.quotation_id != stored.quotation_id
        || routing.quotation_version_id != stored.quotation_version_id
        || !routing
            .projection_fingerprint
            .eq_ignore_ascii_case(&stored.projection_fingerprint)
        || stored.response_id.as_deref() != Some(routing.response_id.as_str())
        || stored.response_fingerprint.as_deref() != Some(routing.response_fingerprint.as_str())
    {
        return Err(unavailable());
    }
    let messages = owner_messages(&state, &user.id, &stored.thread_id)
        .await
        .map_err(|_| unavailable())?;
    let grant_message = messages
        .iter()
        .find(|message| message.id == stored.grant_message_id)
        .ok_or_else(unavailable)?;
    let bundle = grant_envelope(grant_message).ok_or_else(unavailable)?;
    let grant = &bundle.grant;
    let replay = replay_quotation_messages(&messages);
    let closure_terminal = replay
        .active_closures
        .get(&grant.quotation_id)
        .is_some_and(|closure| {
            matches!(
                closure.state,
                ClosureState::BookingConfirmed
                    | ClosureState::Cancelled
                    | ClosureState::Refunded
                    | ClosureState::Superseded
            )
        });
    if grant.granted_by_user_id != user.id
        || grant.grant_id != stored.grant_id
        || grant.target_vendor_id != stored.vendor_id
        || grant.quotation_id != stored.quotation_id
        || grant.quotation_version_id != stored.quotation_version_id
        || grant.thread_id != stored.thread_id
        || grant.projection_fingerprint != stored.projection_fingerprint
        || grant_message.parent_id.as_deref() != Some(grant.approval_receipt_ref.as_str())
        || !approved_receipt_visible(&messages, grant)
        || grant_revoked(&messages, &grant.grant_id)
        || closure_terminal
        || replay.active_version_by_quotation.get(&grant.quotation_id)
            != Some(&grant.quotation_version_id)
    {
        return Err(unavailable());
    }
    let existing = messages
        .iter()
        .filter_map(|message| message.content.get("response"))
        .filter_map(|value| serde_json::from_value::<QuotationVendorResponse>(value.clone()).ok())
        .collect::<Vec<_>>();
    let incoming = request.response;
    let response_id = incoming.response_id.clone();
    let decision = reconcile_verified_afp_response(&existing, incoming.clone(), &routing)
        .map_err(|_| unavailable())?;
    if grant.scope == ContextGrantScope::SingleUse
        && !existing.is_empty()
        && !matches!(decision, ChannelReconciliationDecision::Duplicate { .. })
    {
        return Err(unavailable());
    }
    let (message, replayed) = match decision {
        ChannelReconciliationDecision::New(response)
        | ChannelReconciliationDecision::Successor(response) => (
            afp_vendor_response_message(&response, &stored.grant_message_id, &stored.message_id)
                .map_err(|_| unavailable())?,
            false,
        ),
        ChannelReconciliationDecision::Duplicate {
            existing_response_id,
            fingerprint,
        } => (
            channel_reconciled_message(
                &incoming,
                &existing_response_id,
                &fingerprint,
                &stored.message_id,
            ),
            true,
        ),
    };
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message,
    )
    .await
    .map_err(|_| unavailable())?;
    Ok(Json(ConvergeResponseResult {
        status: "review_required",
        response_id,
        replayed,
    }))
}

async fn rejected_response(
    state: &AppState,
    invitation: &StoredVendorTransport,
    request_id: &str,
    digest: &str,
    failure: VendorTransportFailure,
    now: DateTime<Utc>,
) -> Result<Json<VendorTransportReceipt>, (StatusCode, String)> {
    let receipt =
        vendor_transport_receipt(&invitation.vendor_id, request_id, digest, Err(failure), now);
    let outcome = state
        .db
        .store_rejected_vendor_transport_receipt(
            &invitation.owner_user_id,
            &invitation.vendor_id,
            &receipt,
        )
        .await
        .map_err(database_failure)?;
    store_outcome(outcome)
}
