use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, TimeZone, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    db::StoredQuotationResponseCapability,
    message::AFPMessage,
    quotation::{
        CONTEXT_GRANT_KIND, CONTEXT_GRANT_REVOKED_KIND, ClosureState, ContextGrantAction,
        ContextGrantScope, QuotationFeatureFlags, ResponseCapabilityAccess,
        ResponseCapabilityAuthority, ResponseCapabilityBinding, ResponseCapabilityIssue,
        ResponseCapabilityRateDecision, ResponseCapabilityRatePolicy,
        ResponseCapabilityRateSnapshot, ResponseCapabilityRevocationReason,
        ResponseSubmissionProof, VendorContextGrant, VendorContextProjection,
        VendorContextRevocation, consume_response_capability,
        exchange_response_capability_with_entropy, issue_response_capability,
        persisted_vendor_context_projection_valid, replay_quotation_messages,
        response_capability_audit_event, response_capability_rate_decision,
        response_capability_secret_mac, response_capability_token_prefix,
        revoke_response_capability, rotate_response_capability_with_entropy,
    },
};

use super::{
    AppState,
    auth::{authenticated_user, thread_messages_for_headers},
    proto_to_app,
};

const PEPPER_ENV: &str = "OMNYID_QUOTATION_RESPONSE_CAPABILITY_PEPPER";
const UNAVAILABLE: &str = "response unavailable";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/quotation/response-capabilities", post(issue_http))
        .route(
            "/quotation/response-capabilities/{capability_id}/revoke",
            post(revoke_http),
        )
        .route(
            "/quotation/response-capabilities/{capability_id}/rotate",
            post(rotate_http),
        )
        .route("/quotation/vendor-response/exchange", post(exchange_http))
        .route("/quotation/vendor-response/consume", post(consume_http))
}

#[derive(Deserialize)]
struct IssueRequest {
    thread_id: String,
    grant_message_id: String,
}

#[derive(Serialize)]
struct IssuedResponse {
    capability_id: String,
    response_token: String,
    expires_at: String,
}

#[derive(Deserialize)]
struct ExchangeRequest {
    response_token: String,
    vendor_id: String,
    response_recipient_id: String,
    quotation_id: String,
    quotation_version_id: String,
    thread_id: String,
    projection_fingerprint: String,
}

#[derive(Deserialize)]
struct ConsumeRequest {
    submission_nonce: String,
    action: ContextGrantAction,
}

pub(super) struct GrantEnvelope {
    pub(super) grant: VendorContextGrant,
    pub(super) projection: VendorContextProjection,
}

struct AuthoritySnapshot {
    grant_active: bool,
    quotation_active: bool,
    claim_disputed: bool,
    closure_terminal: bool,
    projection: VendorContextProjection,
}

impl AuthoritySnapshot {
    fn authority(&self) -> ResponseCapabilityAuthority<'_> {
        ResponseCapabilityAuthority {
            grant_active: self.grant_active,
            quotation_active: self.quotation_active,
            claim_disputed: self.claim_disputed,
            closure_terminal: self.closure_terminal,
            active_projection_fingerprint: &self.projection.projection_fingerprint,
        }
    }
}

fn feature_enabled() -> bool {
    QuotationFeatureFlags::from_env().vendor_response_capabilities
}

fn pepper() -> Option<Vec<u8>> {
    let encoded = std::env::var(PEPPER_ENV).ok()?;
    let decoded = URL_SAFE_NO_PAD.decode(encoded.trim()).ok()?;
    (decoded.len() >= 32).then_some(decoded)
}

fn unavailable() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, UNAVAILABLE.to_string())
}

fn service_unavailable() -> (StatusCode, String) {
    (StatusCode::SERVICE_UNAVAILABLE, UNAVAILABLE.to_string())
}

fn valid_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= 180 && !value.chars().any(char::is_control)
}

pub(super) fn grant_envelope(message: &AFPMessage) -> Option<GrantEnvelope> {
    if message.kind.as_deref().or(message.subtype.as_deref()) != Some(CONTEXT_GRANT_KIND) {
        return None;
    }
    let grant = serde_json::from_value(message.content.get("grant")?.clone()).ok()?;
    let projection = serde_json::from_value(message.content.get("projection")?.clone()).ok()?;
    persisted_vendor_context_projection_valid(&grant, &projection)
        .then_some(GrantEnvelope { grant, projection })
}

pub(super) fn grant_revoked(messages: &[AFPMessage], grant_id: &str) -> bool {
    messages.iter().any(|message| {
        message.kind.as_deref().or(message.subtype.as_deref()) == Some(CONTEXT_GRANT_REVOKED_KIND)
            && message
                .content
                .get("revocation")
                .cloned()
                .and_then(|value| serde_json::from_value::<VendorContextRevocation>(value).ok())
                .is_some_and(|revocation| revocation.grant_id == grant_id)
    })
}

pub(super) fn approved_receipt_visible(
    messages: &[AFPMessage],
    grant: &VendorContextGrant,
) -> bool {
    let Some(server_public_key) = super::env_hex_32("OMNYID_SIGNING_KEY_HEX")
        .ok()
        .flatten()
        .map(|seed| {
            hex::encode(
                ed25519_dalek::SigningKey::from_bytes(&seed)
                    .verifying_key()
                    .to_bytes(),
            )
        })
    else {
        return false;
    };
    messages.iter().any(|message| {
        message.id == grant.approval_receipt_ref
            && message.thread_id == grant.thread_id
            && message.subtype.as_deref() == Some("approval_decision")
            && message.content.get("decision").and_then(Value::as_str) == Some("approved")
            && message
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("origin"))
                .and_then(Value::as_str)
                == Some("human_approval")
            && crate::crypto::verify_signature(message)
            && crate::crypto::signature_matches_public_key(&message.signature, &server_public_key)
    })
}

pub(super) async fn owner_messages(
    state: &AppState,
    owner_user_id: &str,
    thread_id: &str,
) -> Result<Vec<AFPMessage>, ()> {
    let private = state
        .db
        .get_private_thread(owner_user_id, thread_id)
        .await
        .map_err(|_| ())?;
    if private.is_empty() {
        return Err(());
    }
    let public = state.db.get_thread(thread_id).await.map_err(|_| ())?;
    let mut seen = std::collections::BTreeSet::new();
    let mut messages = private
        .into_iter()
        .chain(public)
        .filter(|message| seen.insert(message.id.clone()))
        .map(proto_to_app)
        .collect::<Vec<_>>();
    messages.sort_by(|left, right| {
        left.timestamp
            .cmp(&right.timestamp)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(messages)
}

async fn authority_snapshot(
    state: &AppState,
    stored: &StoredQuotationResponseCapability,
) -> Result<AuthoritySnapshot, ()> {
    let record = &stored.record;
    let messages = owner_messages(state, &stored.owner_user_id, &record.binding.thread_id).await?;
    let grant_message = messages
        .iter()
        .find(|message| message.id == stored.grant_message_id)
        .ok_or(())?;
    let envelope = grant_envelope(grant_message).ok_or(())?;
    let grant = &envelope.grant;
    let binding_matches = grant.granted_by_user_id == stored.owner_user_id
        && grant_message.parent_id.as_deref() == Some(grant.approval_receipt_ref.as_str())
        && approved_receipt_visible(&messages, grant)
        && grant.grant_id == record.binding.grant_id
        && grant.target_vendor_id == record.binding.vendor_id
        && grant.response_recipient_id == record.binding.response_recipient_id
        && grant.quotation_id == record.binding.quotation_id
        && grant.quotation_version_id == record.binding.quotation_version_id
        && grant.thread_id == record.binding.thread_id
        && grant.projection_fingerprint == record.binding.projection_fingerprint
        && grant.allowed_actions == record.binding.allowed_actions
        && grant.allowed_question_ids == record.binding.allowed_question_ids;
    if !binding_matches {
        return Err(());
    }
    let replay = replay_quotation_messages(&messages);
    let quotation_active = replay
        .active_version_by_quotation
        .get(&grant.quotation_id)
        .is_some_and(|version| version == &grant.quotation_version_id)
        && replay
            .versions
            .get(&grant.quotation_version_id)
            .is_some_and(|quotation| quotation.identity.vendor_id == grant.target_vendor_id);
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
    let claim_status = sqlx::query_scalar::<_, String>(
        "SELECT claim_status FROM wedding_vendors WHERE vendor_id = $1 LIMIT 1",
    )
    .bind(&grant.target_vendor_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| ())?;
    Ok(AuthoritySnapshot {
        grant_active: !grant_revoked(&messages, &grant.grant_id),
        quotation_active,
        claim_disputed: claim_status.as_deref() == Some("disputed"),
        closure_terminal,
        projection: envelope.projection,
    })
}

fn binding_from_grant(grant: &VendorContextGrant) -> ResponseCapabilityBinding {
    ResponseCapabilityBinding {
        grant_id: grant.grant_id.clone(),
        vendor_id: grant.target_vendor_id.clone(),
        response_recipient_id: grant.response_recipient_id.clone(),
        quotation_id: grant.quotation_id.clone(),
        quotation_version_id: grant.quotation_version_id.clone(),
        thread_id: grant.thread_id.clone(),
        projection_fingerprint: grant.projection_fingerprint.clone(),
        allowed_actions: grant.allowed_actions.clone(),
        allowed_question_ids: grant.allowed_question_ids.clone(),
        not_before: grant.not_before.clone(),
        expires_at: grant.expires_at.clone(),
    }
}

async fn issue_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<IssueRequest>,
) -> Result<Json<IssuedResponse>, (StatusCode, String)> {
    if !feature_enabled() {
        return Err(service_unavailable());
    }
    let pepper = pepper().ok_or_else(service_unavailable)?;
    if !valid_id(&request.thread_id) || !valid_id(&request.grant_message_id) {
        return Err((StatusCode::BAD_REQUEST, "invalid request".to_string()));
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let messages = thread_messages_for_headers(&state.db, &headers, &request.thread_id).await?;
    let messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let grant_message = messages
        .iter()
        .find(|message| message.id == request.grant_message_id)
        .ok_or_else(unavailable)?;
    let envelope = grant_envelope(grant_message).ok_or_else(unavailable)?;
    let grant = &envelope.grant;
    if grant.granted_by_user_id != user.id
        || grant.thread_id != request.thread_id
        || grant_message.parent_id.as_deref() != Some(grant.approval_receipt_ref.as_str())
        || !approved_receipt_visible(&messages, grant)
        || grant_revoked(&messages, &grant.grant_id)
    {
        return Err(unavailable());
    }
    if grant.scope == ContextGrantScope::SingleUse
        && state
            .db
            .quotation_response_grant_was_consumed(
                &user.id,
                &request.grant_message_id,
                &grant.target_vendor_id,
            )
            .await
            .map_err(|_| service_unavailable())?
    {
        return Err(unavailable());
    }
    let now = Utc::now();
    let existing = state
        .db
        .active_quotation_response_capabilities_for_grant(
            &user.id,
            &request.grant_message_id,
            &grant.target_vendor_id,
        )
        .await
        .map_err(|_| service_unavailable())?;
    for stored in existing {
        let expired = DateTime::parse_from_rfc3339(&stored.record.binding.expires_at)
            .ok()
            .is_none_or(|expiry| now >= expiry);
        if !expired {
            return Err(unavailable());
        }
        let mut updated = stored.record.clone();
        let audit = revoke_response_capability(
            &mut updated,
            ResponseCapabilityRevocationReason::Expired,
            now,
        )
        .map_err(|_| unavailable())?;
        if !state
            .db
            .revoke_quotation_response_capability(&stored, &updated, &audit)
            .await
            .map_err(|_| service_unavailable())?
        {
            return Err(unavailable());
        }
    }
    let replay = replay_quotation_messages(&messages);
    if replay.active_version_by_quotation.get(&grant.quotation_id)
        != Some(&grant.quotation_version_id)
        || replay
            .versions
            .get(&grant.quotation_version_id)
            .is_none_or(|quotation| quotation.identity.vendor_id != grant.target_vendor_id)
    {
        return Err(unavailable());
    }
    let issued_at = now.to_rfc3339();
    let issued = issue_response_capability(
        ResponseCapabilityIssue {
            capability_id: format!("qrc_{}", Ulid::new()),
            binding: binding_from_grant(grant),
            issued_at,
        },
        &pepper,
    )
    .map_err(|_| unavailable())?;
    let stored = StoredQuotationResponseCapability {
        owner_user_id: user.id.clone(),
        grant_message_id: request.grant_message_id.clone(),
        record: issued.record.clone(),
    };
    let authority = authority_snapshot(&state, &stored)
        .await
        .map_err(|_| unavailable())?;
    if automatic_revocation(&stored, &authority, Utc::now()).is_some() {
        return Err(unavailable());
    }
    let response = IssuedResponse {
        capability_id: issued.record.capability_id.clone(),
        response_token: issued.token.expose(),
        expires_at: issued.record.binding.expires_at.clone(),
    };
    state
        .db
        .store_quotation_response_capability(
            &user.id,
            &request.grant_message_id,
            &issued.record,
            &issued.audit,
        )
        .await
        .map_err(|_| service_unavailable())?;
    Ok(Json(response))
}

fn request_ip(headers: &HeaderMap) -> &str {
    headers
        .get("cf-connecting-ip")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 64)
        .unwrap_or("unknown")
}

async fn rate_allowed(
    state: &AppState,
    values: [(&str, &str); 4],
    pepper: &[u8],
) -> Result<bool, ()> {
    let now = Utc::now();
    let window = Utc
        .timestamp_opt((now.timestamp() / 60) * 60, 0)
        .single()
        .ok_or(())?;
    let mut counts = [0_u32; 4];
    for (index, (dimension, value)) in values.iter().enumerate() {
        let key =
            response_capability_secret_mac(pepper, &format!("{dimension}:{value}")).ok_or(())?;
        counts[index] = state
            .db
            .increment_quotation_response_rate_attempt(dimension, &key, window)
            .await
            .map_err(|_| ())?;
    }
    let decision = response_capability_rate_decision(
        &ResponseCapabilityRateSnapshot {
            token_prefix_attempts: counts[0],
            ip_hash_attempts: counts[1],
            vendor_attempts: counts[2],
            thread_attempts: counts[3],
        },
        &ResponseCapabilityRatePolicy {
            token_prefix_limit: 10,
            ip_hash_limit: 30,
            vendor_limit: 20,
            thread_limit: 20,
            retry_after_seconds: 60,
        },
    );
    Ok(matches!(decision, ResponseCapabilityRateDecision::Allowed))
}

fn automatic_revocation(
    stored: &StoredQuotationResponseCapability,
    authority: &AuthoritySnapshot,
    now: DateTime<Utc>,
) -> Option<ResponseCapabilityRevocationReason> {
    if DateTime::parse_from_rfc3339(&stored.record.binding.expires_at)
        .ok()
        .is_none_or(|expiry| now >= expiry)
    {
        Some(ResponseCapabilityRevocationReason::Expired)
    } else if !authority.grant_active {
        Some(ResponseCapabilityRevocationReason::GrantRevoked)
    } else if !authority.quotation_active {
        Some(ResponseCapabilityRevocationReason::QuotationSuperseded)
    } else if authority.claim_disputed {
        Some(ResponseCapabilityRevocationReason::ClaimDisputed)
    } else if authority.closure_terminal {
        Some(ResponseCapabilityRevocationReason::ClosureTerminal)
    } else {
        None
    }
}

async fn terminalize_if_needed(
    state: &AppState,
    stored: &StoredQuotationResponseCapability,
    authority: &AuthoritySnapshot,
    now: DateTime<Utc>,
) {
    let Some(reason) = automatic_revocation(stored, authority, now) else {
        return;
    };
    let mut updated = stored.record.clone();
    if let Ok(audit) = revoke_response_capability(&mut updated, reason, now) {
        let _ = state
            .db
            .revoke_quotation_response_capability(stored, &updated, &audit)
            .await;
    }
}

async fn exchange_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ExchangeRequest>,
) -> Result<Response, (StatusCode, String)> {
    if !feature_enabled() {
        return Err(unavailable());
    }
    let pepper = pepper().ok_or_else(unavailable)?;
    let prefix =
        response_capability_token_prefix(&request.response_token).ok_or_else(unavailable)?;
    let candidates = state
        .db
        .quotation_response_capabilities_by_prefix(&prefix)
        .await
        .map_err(|_| unavailable())?;
    for stored in candidates {
        if !rate_allowed(
            &state,
            [
                ("token_prefix", &prefix),
                ("ip_hash", request_ip(&headers)),
                ("vendor", &stored.record.binding.vendor_id),
                ("thread", &stored.record.binding.thread_id),
            ],
            &pepper,
        )
        .await
        .map_err(|_| unavailable())?
        {
            return Err((StatusCode::TOO_MANY_REQUESTS, UNAVAILABLE.to_string()));
        }
        let Ok(authority) = authority_snapshot(&state, &stored).await else {
            continue;
        };
        let now = Utc::now();
        if automatic_revocation(&stored, &authority, now).is_some() {
            terminalize_if_needed(&state, &stored, &authority, now).await;
            continue;
        }
        let access = ResponseCapabilityAccess {
            vendor_id: &request.vendor_id,
            response_recipient_id: &request.response_recipient_id,
            quotation_id: &request.quotation_id,
            quotation_version_id: &request.quotation_version_id,
            thread_id: &request.thread_id,
            projection_fingerprint: &request.projection_fingerprint,
        };
        let mut updated = stored.record.clone();
        let mut entropy = [[0_u8; 32]; 3];
        for value in &mut entropy {
            rand::rng().fill_bytes(value);
        }
        let Ok(session) = exchange_response_capability_with_entropy(
            &mut updated,
            &request.response_token,
            &pepper,
            &access,
            &authority.authority(),
            now,
            entropy[0],
            entropy[1],
            entropy[2],
        ) else {
            continue;
        };
        let cookie = session.secrets.cookie_header();
        let body = json!({
            "session_id": session.record.session_id,
            "expires_at": session.record.expires_at,
            "csrf_token": session.secrets.csrf_token(),
            "submission_nonce": session.secrets.submission_nonce(),
            "account_access": false,
            "projection": authority.projection,
        });
        if !state
            .db
            .exchange_quotation_response_capability(
                &stored,
                &updated,
                &session.record,
                &session.audit,
            )
            .await
            .map_err(|_| unavailable())?
        {
            continue;
        }
        let mut response = Json(body).into_response();
        response.headers_mut().insert(
            header::SET_COOKIE,
            HeaderValue::from_str(&cookie).map_err(|_| unavailable())?,
        );
        return Ok(response);
    }
    Err(unavailable())
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| {
            let (key, value) = part.trim().split_once('=')?;
            (key == name).then_some(value)
        })
}

async fn consume_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ConsumeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !feature_enabled() {
        return Err(unavailable());
    }
    let pepper = pepper().ok_or_else(unavailable)?;
    let session_token = cookie_value(&headers, crate::quotation::RESPONSE_SESSION_COOKIE_NAME)
        .ok_or_else(unavailable)?;
    let csrf = headers
        .get("x-csrf-token")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(unavailable)?;
    let session_mac =
        response_capability_secret_mac(&pepper, session_token).ok_or_else(unavailable)?;
    let (stored, mut session) = state
        .db
        .quotation_response_session_by_mac(&session_mac)
        .await
        .map_err(|_| unavailable())?
        .ok_or_else(unavailable)?;
    let authority = authority_snapshot(&state, &stored)
        .await
        .map_err(|_| unavailable())?;
    let now = Utc::now();
    if automatic_revocation(&stored, &authority, now).is_some() {
        terminalize_if_needed(&state, &stored, &authority, now).await;
        return Err(unavailable());
    }
    let mut updated = stored.record.clone();
    let proof = ResponseSubmissionProof {
        session_token,
        csrf_token: csrf,
        submission_nonce: &request.submission_nonce,
        action: request.action,
    };
    let audit = consume_response_capability(
        &mut updated,
        &mut session,
        &proof,
        &pepper,
        &authority.authority(),
        now,
    )
    .map_err(|_| unavailable())?;
    if !state
        .db
        .consume_quotation_response_capability(&stored, &updated, &session, &audit)
        .await
        .map_err(|_| unavailable())?
    {
        return Err(unavailable());
    }
    Ok(Json(json!({"status": "consumed"})))
}

async fn revoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(capability_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !feature_enabled() {
        return Err(service_unavailable());
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let stored = state
        .db
        .quotation_response_capability_for_owner(&user.id, &capability_id)
        .await
        .map_err(|_| service_unavailable())?
        .ok_or_else(unavailable)?;
    let mut updated = stored.record.clone();
    let audit = revoke_response_capability(
        &mut updated,
        ResponseCapabilityRevocationReason::UserRevoked,
        Utc::now(),
    )
    .map_err(|_| unavailable())?;
    if !state
        .db
        .revoke_quotation_response_capability(&stored, &updated, &audit)
        .await
        .map_err(|_| service_unavailable())?
    {
        return Err(unavailable());
    }
    Ok(Json(json!({"status": "revoked"})))
}

async fn rotate_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(capability_id): Path<String>,
) -> Result<Json<IssuedResponse>, (StatusCode, String)> {
    if !feature_enabled() {
        return Err(service_unavailable());
    }
    let pepper = pepper().ok_or_else(service_unavailable)?;
    let user = authenticated_user(&state.db, &headers).await?;
    let stored = state
        .db
        .quotation_response_capability_for_owner(&user.id, &capability_id)
        .await
        .map_err(|_| service_unavailable())?
        .ok_or_else(unavailable)?;
    let authority = authority_snapshot(&state, &stored)
        .await
        .map_err(|_| unavailable())?;
    let now = Utc::now();
    if automatic_revocation(&stored, &authority, now).is_some() {
        terminalize_if_needed(&state, &stored, &authority, now).await;
        return Err(unavailable());
    }
    let mut rotated = stored.record.clone();
    let mut entropy = [0_u8; 32];
    rand::rng().fill_bytes(&mut entropy);
    let next = rotate_response_capability_with_entropy(
        &mut rotated,
        format!("qrc_{}", Ulid::new()),
        now.to_rfc3339(),
        &pepper,
        entropy,
    )
    .map_err(|_| unavailable())?;
    let rotation_audit = response_capability_audit_event(
        &rotated.capability_id,
        crate::quotation::ResponseCapabilityAuditKind::Rotated,
        &now.to_rfc3339(),
    );
    if !state
        .db
        .rotate_quotation_response_capability(
            &stored,
            &rotated,
            &rotation_audit,
            &next.record,
            &next.audit,
        )
        .await
        .map_err(|_| service_unavailable())?
    {
        return Err(unavailable());
    }
    Ok(Json(IssuedResponse {
        capability_id: next.record.capability_id,
        response_token: next.token.expose(),
        expires_at: next.record.binding.expires_at,
    }))
}
