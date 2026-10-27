/*
 * @module-id: rust.server.vendor-email-worker-ingress
 * @primary-capability: authenticated-encrypted-email-worker-ingress
 * @locs-version: 1.0
 * @stability: draft
 * @owner: omnyid
 */

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ulid::Ulid;

use super::{AppState, RateLimitPolicy, enforce_rate_limit};

const MAX_RAW_BYTES: usize = 10 * 1024 * 1024;
const MAX_CLOCK_SKEW_SECS: i64 = 300;
const PROVIDER: &str = "cloudflare_email_worker";
const CONTRACT_VERSION: &str = "1";
const CONTRACT_DOMAIN: &str = "omnyid-email-worker-v1";
const CROCKFORD_BASE32_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/integrations/vendor-email/cloudflare/inbound",
            post(cloudflare_email_inbound_http),
        )
        .layer(DefaultBodyLimit::max(MAX_RAW_BYTES))
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct VerifiedEnvelope {
    event_id: String,
    from: String,
    to: String,
    body_digest: String,
    raw_size: usize,
}

#[derive(Clone, Debug)]
struct RecipientRoute {
    identity_id: String,
    vendor_id: String,
    owner_user_id: String,
    agent_id: String,
    recipient_key_id: String,
    recipient_public_key_hex: String,
}

#[derive(Debug)]
struct IngressError {
    status: StatusCode,
    code: &'static str,
}

impl IngressError {
    const fn new(status: StatusCode, code: &'static str) -> Self {
        Self { status, code }
    }

    fn http(self) -> (StatusCode, String) {
        (self.status, self.code.to_string())
    }
}

async fn cloudflare_email_inbound_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    if !env_enabled("OMNYID_VENDOR_MAIL_INGRESS_ENABLED")
        || !env_enabled("OMNYID_VENDOR_MAIL_ENABLED")
        || !env_enabled("OMNYID_VENDOR_SENDER_MASK_ENABLED")
    {
        return Err((StatusCode::NOT_FOUND, "not_found".to_string()));
    }
    if !valid_content_type(&headers) {
        return Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "invalid_contract".to_string(),
        ));
    }
    enforce_rate_limit(
        &state,
        "vendor_email_worker_ingress".to_string(),
        RateLimitPolicy {
            max_requests: 600,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let secret = crate::secret_manager::read_process_secret_trimmed(
        "OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET",
    )
    .filter(|value| value.as_bytes().len() >= 32)
    .ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "ingress_auth_unavailable".to_string(),
        )
    })?;
    let key_id = std::env::var("OMNYID_VENDOR_MAIL_WORKER_KEY_ID")
        .unwrap_or_else(|_| "primary-v1".to_string());
    let envelope = verify_envelope(
        &headers,
        &body,
        &key_id,
        secret.as_bytes(),
        Utc::now().timestamp(),
        configured_max_bytes().map_err(IngressError::http)?,
    )
    .map_err(IngressError::http)?;
    let route = resolve_recipient(&state, &envelope.to).await?;
    let recipient_rate_key = hex::encode(Sha256::digest(envelope.to.as_bytes()));
    enforce_rate_limit(
        &state,
        format!("vendor_email_worker_recipient:{recipient_rate_key}"),
        RateLimitPolicy {
            max_requests: 90,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if prior_event_is_complete(&state, &envelope).await? {
        return Ok((
            StatusCode::ACCEPTED,
            Json(json!({ "status": "duplicate", "event_id": envelope.event_id })),
        ));
    }
    match crate::gateway::clamav::scan_bytes(&body).await {
        Ok(Some(result)) if !result.is_infected => {}
        Ok(Some(_)) => {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                "malware_rejected".to_string(),
            ));
        }
        Ok(None) | Err(_) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                "scanner_unavailable".to_string(),
            ));
        }
    }
    let aad = json!({
        "provider": PROVIDER,
        "event_id": envelope.event_id,
        "recipient_identity_id": route.identity_id,
        "recipient_agent_id": route.agent_id,
        "recipient_key_id": route.recipient_key_id,
        "owner_user_id": route.owner_user_id,
        "payload_digest": envelope.body_digest,
    });
    let plaintext = json!({
        "schema": "omnyid.vendor_email_ingress.raw.v1",
        "raw_rfc822_base64": STANDARD.encode(&body),
    });
    let ciphertext = crate::crypto::encrypt_content_for_recipient(
        &plaintext,
        &aad,
        &route.recipient_public_key_hex,
        &route.recipient_key_id,
    )
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "recipient_encryption_unavailable".to_string(),
        )
    })?;
    let existing_quarantine = persist_quarantine(&state, &envelope, &route, &ciphertext).await?;
    let parsed = crate::gateway::smtp_in::parse_incoming_email_source(&body);
    if parsed.attachments_blocked || !parsed.attachments.is_empty() {
        mark_quarantined(&state, &envelope, "attachment_processing_pending").await?;
        return Ok((
            StatusCode::ACCEPTED,
            Json(json!({ "status": "quarantined", "event_id": envelope.event_id })),
        ));
    }
    let message = build_recipient_afp_message(&envelope, &route, &parsed).map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "recipient_encryption_unavailable".to_string(),
        )
    })?;
    let message_id = message.id.clone();
    let inserted = super::auth::store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &route.owner_user_id,
        message,
    )
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "afp_persistence_unavailable".to_string(),
        )
    })?;
    complete_processing(&state, &envelope, &message_id).await?;
    if inserted {
        state.metrics.inc_gateway_inbound_emails();
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": if existing_quarantine && !inserted { "duplicate" } else { "accepted" },
            "event_id": envelope.event_id,
            "afp_message_id": message_id,
        })),
    ))
}

fn deterministic_pseudo_ulid(label: &str) -> String {
    Sha256::digest(label.as_bytes())
        .iter()
        .take(26)
        .map(|byte| CROCKFORD_BASE32_ALPHABET[(*byte % 32) as usize] as char)
        .collect()
}

fn build_recipient_afp_message(
    envelope: &VerifiedEnvelope,
    route: &RecipientRoute,
    parsed: &crate::gateway::smtp_in::IncomingEmailSource,
) -> Result<crate::message::AFPMessage, String> {
    let message_id = deterministic_pseudo_ulid(&format!("{PROVIDER}:{}", envelope.event_id));
    let thread_id = deterministic_pseudo_ulid(&format!(
        "{PROVIDER}:{}:{}",
        route.identity_id, parsed.summary.external_conversation_key
    ));
    let timestamp = Utc::now().to_rfc3339();
    let metadata = json!({
        "schema": "wedding_vendor_email/v1",
        "channel": "email",
        "transport": PROVIDER,
        "provider_event_id": envelope.event_id,
        "source_digest": envelope.body_digest,
        "vendor_id": route.vendor_id,
        "recipient_identity_id": route.identity_id,
        "recipient_agent_id": route.agent_id,
        "recipient_key_id": route.recipient_key_id,
        "idempotency_key": format!("{PROVIDER}:{}", envelope.event_id),
    });
    let plaintext = json!({
        "schema": "wedding_vendor_email/v1",
        "subject": parsed.summary.subject,
        "body": parsed.body,
        "body_media_type": parsed.body_media_type,
        "from": envelope.from,
        "to": envelope.to,
        "smtp_message_id": parsed.summary.smtp_message_id,
        "in_reply_to": parsed.summary.in_reply_to,
        "smtp_references": parsed.summary.reference_targets,
        "external_conversation_key": parsed.summary.external_conversation_key,
    });
    let from = "agent://cloudflare-email-worker".to_string();
    let to = vec![route.agent_id.clone()];
    let aad = json!({
        "protocol": "afp-v1",
        "id": message_id,
        "thread_id": thread_id,
        "from": from,
        "to": to,
        "timestamp": timestamp,
        "type": "email",
        "subtype": "wedding_vendor_email_received",
        "metadata": metadata,
    });
    let encryption = crate::crypto::encrypt_content_for_recipient(
        &plaintext,
        &aad,
        &route.recipient_public_key_hex,
        &route.recipient_key_id,
    )?;
    let mut message = crate::message::AFPMessage {
        protocol: "afp-v1".to_string(),
        id: message_id,
        thread_id,
        parent_id: None,
        from,
        to,
        timestamp,
        r#type: "email".to_string(),
        kind: Some("wedding_vendor_email_received".to_string()),
        supertags: vec![
            "template:wedding_planning".to_string(),
            "wedding_vendor_email".to_string(),
        ],
        subtype: Some("wedding_vendor_email_received".to_string()),
        content: json!({
            "omnyid_encrypted": true,
            "scheme": "omnyid-envelope-v1",
            "source": PROVIDER,
        }),
        metadata: Some(metadata),
        signature: String::new(),
        encryption: Some(encryption),
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    };
    super::sign_server_generated_message(&mut message)?;
    Ok(message)
}

fn verify_envelope(
    headers: &HeaderMap,
    body: &[u8],
    expected_key_id: &str,
    secret: &[u8],
    now_secs: i64,
    max_bytes: usize,
) -> Result<VerifiedEnvelope, IngressError> {
    if body.is_empty() || body.len() > max_bytes {
        return Err(IngressError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "invalid_size",
        ));
    }
    let version = header(headers, "x-omnyid-email-version")?;
    let key_id = header(headers, "x-omnyid-email-key-id")?;
    let timestamp = header(headers, "x-omnyid-email-timestamp")?;
    let nonce = header(headers, "x-omnyid-email-nonce")?;
    let event_id = header(headers, "x-omnyid-email-event-id")?;
    let from_encoded = header(headers, "x-omnyid-email-from")?;
    let to_encoded = header(headers, "x-omnyid-email-to")?;
    let supplied_digest = header(headers, "x-omnyid-email-body-sha256")?;
    let supplied_size = header(headers, "x-omnyid-email-raw-size")?;
    let signature = header(headers, "x-omnyid-email-signature")?;

    if version != CONTRACT_VERSION || key_id != expected_key_id || !safe_key_id(key_id) {
        return Err(IngressError::new(StatusCode::UNAUTHORIZED, "invalid_auth"));
    }
    let timestamp_secs = timestamp
        .parse::<i64>()
        .ok()
        .filter(|value| value.to_string() == timestamp)
        .ok_or_else(|| IngressError::new(StatusCode::UNAUTHORIZED, "invalid_auth"))?;
    if now_secs.abs_diff(timestamp_secs) > MAX_CLOCK_SKEW_SECS as u64 {
        return Err(IngressError::new(StatusCode::UNAUTHORIZED, "invalid_auth"));
    }
    if !lower_hex(nonce, 32)
        || !lower_hex(event_id, 64)
        || !lower_hex(supplied_digest, 64)
        || !lower_hex(signature, 64)
    {
        return Err(IngressError::new(
            StatusCode::BAD_REQUEST,
            "invalid_contract",
        ));
    }
    let raw_size = supplied_size
        .parse::<usize>()
        .ok()
        .filter(|value| value.to_string() == supplied_size && *value == body.len())
        .ok_or_else(|| IngressError::new(StatusCode::BAD_REQUEST, "invalid_size"))?;
    let body_digest = hex::encode(Sha256::digest(body));
    if body_digest != supplied_digest {
        return Err(IngressError::new(StatusCode::BAD_REQUEST, "invalid_digest"));
    }
    let canonical = [
        CONTRACT_DOMAIN,
        key_id,
        timestamp,
        nonce,
        event_id,
        from_encoded,
        to_encoded,
        supplied_digest,
        supplied_size,
    ]
    .join("\n");
    let signature_bytes = hex::decode(signature)
        .ok()
        .filter(|value| value.len() == 32)
        .ok_or_else(|| IngressError::new(StatusCode::UNAUTHORIZED, "invalid_auth"))?;
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).map_err(|_| {
        IngressError::new(StatusCode::SERVICE_UNAVAILABLE, "ingress_auth_unavailable")
    })?;
    mac.update(canonical.as_bytes());
    mac.verify_slice(&signature_bytes)
        .map_err(|_| IngressError::new(StatusCode::UNAUTHORIZED, "invalid_auth"))?;

    let from = decode_address(from_encoded)?;
    let to = decode_address(to_encoded)?;
    Ok(VerifiedEnvelope {
        event_id: event_id.to_string(),
        from,
        to,
        body_digest,
        raw_size,
    })
}

async fn resolve_recipient(
    state: &AppState,
    recipient: &str,
) -> Result<RecipientRoute, (StatusCode, String)> {
    let (local_part, _) = recipient
        .rsplit_once('@')
        .filter(|(_, domain)| *domain == "omnyid.com")
        .ok_or_else(not_found)?;
    let row = sqlx::query(
        r#"SELECT identity.identity_id, identity.vendor_id, identity.owner_user_id,
                   link.agent_id, link.agent_card
             FROM wedding_vendor_sender_identities identity
             JOIN wedding_vendors vendor ON vendor.vendor_id = identity.vendor_id
             JOIN wedding_vendor_agent_links link ON link.vendor_id = identity.vendor_id
            WHERE lower(identity.mask_local_part) = lower($1)
              AND identity.mask_domain = 'omnyid.com'
              AND identity.status = 'active'
              AND identity.selected_kind = 'omnyid_mask'
              AND vendor.status = 'active'
              AND vendor.claim_status = 'verified'
              AND vendor.claimed_by_user_id = identity.owner_user_id"#,
    )
    .bind(local_part)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(not_found)?;
    let agent_id: String = row.get("agent_id");
    let card: crate::agentcard::AgentCard =
        serde_json::from_value(row.get("agent_card")).map_err(|_| not_found())?;
    let recipient_public_key_hex = card
        .encryption_public_key_hex
        .as_deref()
        .filter(|value| {
            hex::decode(value)
                .ok()
                .is_some_and(|decoded| decoded.len() == 32)
        })
        .ok_or_else(not_found)?
        .to_string();
    if !card.verify() || card.agent_id != agent_id {
        return Err(not_found());
    }
    Ok(RecipientRoute {
        identity_id: row.get("identity_id"),
        vendor_id: row.get("vendor_id"),
        owner_user_id: row.get("owner_user_id"),
        agent_id,
        recipient_key_id: card.key_id,
        recipient_public_key_hex,
    })
}

async fn persist_quarantine(
    state: &AppState,
    envelope: &VerifiedEnvelope,
    route: &RecipientRoute,
    ciphertext: &Value,
) -> Result<bool, (StatusCode, String)> {
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let inserted = sqlx::query(
        r#"INSERT INTO wedding_vendor_email_provider_events
             (provider, provider_event_id, event_kind, payload_digest,
              signature_verified_at, processing_status, attempt_count)
           VALUES ($1, $2, 'inbound', $3, NOW(), 'accepted', 1)
           ON CONFLICT (provider, provider_event_id) DO NOTHING"#,
    )
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .bind(&envelope.body_digest)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?
    .rows_affected();
    if inserted == 0 {
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT payload_digest FROM wedding_vendor_email_provider_events WHERE provider = $1 AND provider_event_id = $2 FOR UPDATE",
        )
        .bind(PROVIDER)
        .bind(&envelope.event_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(database_failure)?;
        match existing.as_deref() {
            Some(digest) if digest == envelope.body_digest => {
                sqlx::query(
                    "UPDATE wedding_vendor_email_provider_events SET attempt_count = attempt_count + 1 WHERE provider = $1 AND provider_event_id = $2",
                )
                .bind(PROVIDER)
                .bind(&envelope.event_id)
                .execute(&mut *tx)
                .await
                .map_err(database_failure)?;
                tx.commit().await.map_err(database_failure)?;
                return Ok(true);
            }
            _ => {
                tx.rollback().await.map_err(database_failure)?;
                return Err((StatusCode::CONFLICT, "event_conflict".to_string()));
            }
        }
    }

    sqlx::query(
        r#"INSERT INTO wedding_vendor_email_ingress_quarantine
             (quarantine_id, provider, provider_event_id, recipient_identity_id,
              vendor_id, owner_user_id, recipient_agent_id, recipient_key_id,
              payload_digest, raw_size_bytes, ciphertext_envelope, processing_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'quarantined')"#,
    )
    .bind(format!("emailq_{}", Ulid::new().to_string().to_lowercase()))
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .bind(&route.identity_id)
    .bind(&route.vendor_id)
    .bind(&route.owner_user_id)
    .bind(&route.agent_id)
    .bind(&route.recipient_key_id)
    .bind(&envelope.body_digest)
    .bind(
        i32::try_from(envelope.raw_size)
            .map_err(|_| (StatusCode::PAYLOAD_TOO_LARGE, "invalid_size".to_string()))?,
    )
    .bind(ciphertext)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;
    Ok(false)
}

async fn mark_quarantined(
    state: &AppState,
    envelope: &VerifiedEnvelope,
    reason: &str,
) -> Result<(), (StatusCode, String)> {
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    sqlx::query(
        "UPDATE wedding_vendor_email_provider_events SET processing_status = 'quarantined', error_code = $3, processed_at = NOW() WHERE provider = $1 AND provider_event_id = $2 AND payload_digest = $4",
    )
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .bind(reason)
    .bind(&envelope.body_digest)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    sqlx::query(
        "UPDATE wedding_vendor_email_ingress_quarantine SET processing_status = 'quarantined', error_code = $3, processed_at = NOW() WHERE provider = $1 AND provider_event_id = $2 AND payload_digest = $4",
    )
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .bind(reason)
    .bind(&envelope.body_digest)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)
}

async fn complete_processing(
    state: &AppState,
    envelope: &VerifiedEnvelope,
    afp_message_id: &str,
) -> Result<(), (StatusCode, String)> {
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let provider_rows = sqlx::query(
        "UPDATE wedding_vendor_email_provider_events SET processing_status = 'completed', afp_message_id = $3, error_code = NULL, processed_at = NOW() WHERE provider = $1 AND provider_event_id = $2 AND payload_digest = $4",
    )
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .bind(afp_message_id)
    .bind(&envelope.body_digest)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?
    .rows_affected();
    let quarantine_rows = sqlx::query(
        "UPDATE wedding_vendor_email_ingress_quarantine SET processing_status = 'accepted', error_code = NULL, processed_at = NOW() WHERE provider = $1 AND provider_event_id = $2 AND payload_digest = $3",
    )
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .bind(&envelope.body_digest)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?
    .rows_affected();
    if provider_rows != 1 || quarantine_rows != 1 {
        tx.rollback().await.map_err(database_failure)?;
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "afp_persistence_unavailable".to_string(),
        ));
    }
    tx.commit().await.map_err(database_failure)
}

/// Avoid spending scanner capacity on a completed authenticated replay. A
/// matching unfinished event is retried so an interrupted AFP/finalize step is
/// repairable; `persist_quarantine` remains the race-safe authority.
async fn prior_event_is_complete(
    state: &AppState,
    envelope: &VerifiedEnvelope,
) -> Result<bool, (StatusCode, String)> {
    let existing = sqlx::query(
        "SELECT payload_digest, processing_status, afp_message_id FROM wedding_vendor_email_provider_events WHERE provider = $1 AND provider_event_id = $2",
    )
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?;
    match existing {
        None => Ok(false),
        Some(row) if row.get::<String, _>("payload_digest") == envelope.body_digest => {
            Ok(row.get::<String, _>("processing_status") == "completed"
                && row.get::<Option<String>, _>("afp_message_id").is_some())
        }
        Some(_) => Err((StatusCode::CONFLICT, "event_conflict".to_string())),
    }
}

fn valid_content_type(headers: &HeaderMap) -> bool {
    headers
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("message/rfc822"))
}

fn header<'a>(headers: &'a HeaderMap, name: &'static str) -> Result<&'a str, IngressError> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty() && value.len() <= 1024)
        .ok_or_else(|| IngressError::new(StatusCode::BAD_REQUEST, "invalid_contract"))
}

fn decode_address(encoded: &str) -> Result<String, IngressError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| IngressError::new(StatusCode::BAD_REQUEST, "invalid_contract"))?;
    let value = String::from_utf8(bytes)
        .map_err(|_| IngressError::new(StatusCode::BAD_REQUEST, "invalid_contract"))?;
    let normalized = value.trim().to_ascii_lowercase();
    let valid = normalized.len() <= 320
        && !normalized
            .chars()
            .any(|value| value.is_control() || value.is_whitespace())
        && normalized
            .rsplit_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && !domain.is_empty());
    if !valid || normalized != value {
        return Err(IngressError::new(
            StatusCode::BAD_REQUEST,
            "invalid_contract",
        ));
    }
    Ok(normalized)
}

fn safe_key_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32
        && value
            .as_bytes()
            .first()
            .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
        })
}

fn lower_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn env_enabled(name: &str) -> bool {
    std::env::var(name).is_ok_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )
    })
}

fn configured_max_bytes() -> Result<usize, IngressError> {
    match std::env::var("OMNYID_VENDOR_MAIL_INGRESS_MAX_BYTES") {
        Err(std::env::VarError::NotPresent) => Ok(MAX_RAW_BYTES),
        Ok(value) => value
            .trim()
            .parse::<usize>()
            .ok()
            .filter(|value| *value > 0 && *value <= MAX_RAW_BYTES)
            .ok_or_else(|| {
                IngressError::new(StatusCode::SERVICE_UNAVAILABLE, "ingress_config_invalid")
            }),
        Err(std::env::VarError::NotUnicode(_)) => Err(IngressError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "ingress_config_invalid",
        )),
    }
}

fn not_found() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, "not_found".to_string())
}

fn database_failure(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(error = %error, "vendor email ingress database operation failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "ingress_unavailable".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signed_headers(body: &[u8], timestamp: i64, secret: &[u8]) -> HeaderMap {
        let digest = hex::encode(Sha256::digest(body));
        let from = URL_SAFE_NO_PAD.encode("sender@example.com");
        let to = URL_SAFE_NO_PAD.encode("vendor_mosman@omnyid.com");
        let timestamp = timestamp.to_string();
        let event_id = "b".repeat(64);
        let raw_size = body.len().to_string();
        let fields = [
            CONTRACT_DOMAIN,
            "primary-v1",
            &timestamp,
            "aabbccddeeff00112233445566778899",
            &event_id,
            &from,
            &to,
            &digest,
            &raw_size,
        ];
        let canonical = fields.join("\n");
        let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("hmac key");
        mac.update(canonical.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());
        let mut headers = HeaderMap::new();
        for (name, value) in [
            ("x-omnyid-email-version", CONTRACT_VERSION.to_string()),
            ("x-omnyid-email-key-id", "primary-v1".to_string()),
            ("x-omnyid-email-timestamp", timestamp.to_string()),
            (
                "x-omnyid-email-nonce",
                "aabbccddeeff00112233445566778899".to_string(),
            ),
            ("x-omnyid-email-event-id", "b".repeat(64)),
            ("x-omnyid-email-from", from),
            ("x-omnyid-email-to", to),
            ("x-omnyid-email-body-sha256", digest),
            ("x-omnyid-email-raw-size", body.len().to_string()),
            ("x-omnyid-email-signature", signature),
        ] {
            headers.insert(
                axum::http::HeaderName::from_bytes(name.as_bytes()).expect("header name"),
                value.parse().expect("header value"),
            );
        }
        headers
    }

    #[test]
    fn valid_envelope_round_trips_without_content_metadata() {
        let body = b"Subject: Test\r\n\r\nHello";
        let now = 1_792_890_000;
        let secret = b"0123456789abcdef0123456789abcdef";
        let verified = verify_envelope(
            &signed_headers(body, now, secret),
            body,
            "primary-v1",
            secret,
            now,
            MAX_RAW_BYTES,
        )
        .expect("valid envelope");
        assert_eq!(verified.to, "vendor_mosman@omnyid.com");
        assert_eq!(verified.raw_size, body.len());
    }

    #[test]
    fn stale_and_altered_envelopes_fail_closed() {
        let body = b"Subject: Test\r\n\r\nHello";
        let now = 1_792_890_000;
        let secret = b"0123456789abcdef0123456789abcdef";
        let headers = signed_headers(body, now, secret);
        assert_eq!(
            verify_envelope(
                &headers,
                body,
                "primary-v1",
                secret,
                now + 301,
                MAX_RAW_BYTES
            )
            .expect_err("stale")
            .status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            verify_envelope(
                &headers,
                b"changed",
                "primary-v1",
                secret,
                now,
                MAX_RAW_BYTES
            )
            .expect_err("altered")
            .code,
            "invalid_size"
        );
    }

    #[test]
    fn wrong_key_and_noncanonical_address_fail_closed() {
        let body = b"Subject: Test\r\n\r\nHello";
        let now = 1_792_890_000;
        let secret = b"0123456789abcdef0123456789abcdef";
        let headers = signed_headers(body, now, secret);
        assert_eq!(
            verify_envelope(&headers, body, "next-v2", secret, now, MAX_RAW_BYTES)
                .expect_err("wrong key")
                .status,
            StatusCode::UNAUTHORIZED
        );
        assert!(decode_address(&URL_SAFE_NO_PAD.encode("Vendor@omnyid.com")).is_err());
    }

    #[test]
    fn ingress_accepts_only_raw_email_content_type() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::CONTENT_TYPE,
            "message/rfc822".parse().unwrap(),
        );
        assert!(valid_content_type(&headers));
        headers.insert(
            axum::http::header::CONTENT_TYPE,
            "message/rfc822; charset=binary".parse().unwrap(),
        );
        assert!(valid_content_type(&headers));
        headers.insert(
            axum::http::header::CONTENT_TYPE,
            "application/json".parse().unwrap(),
        );
        assert!(!valid_content_type(&headers));
    }
}
