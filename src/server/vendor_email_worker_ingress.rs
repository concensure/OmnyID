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
    let encryption_key = ingress_encryption_key().map_err(IngressError::http)?;
    let aad = json!({
        "provider": PROVIDER,
        "event_id": envelope.event_id,
        "recipient_identity_id": route.identity_id,
        "payload_digest": envelope.body_digest,
    });
    let plaintext = json!({
        "schema": "omnyid.vendor_email_ingress.raw.v1",
        "raw_rfc822_base64": STANDARD.encode(&body),
    });
    let ciphertext = crate::crypto::encrypt_content(&plaintext, &aad, &encryption_key);
    let duplicate = persist_quarantine(&state, &envelope, &route, &ciphertext).await?;
    if !duplicate {
        state.metrics.inc_gateway_inbound_emails();
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": if duplicate { "duplicate" } else { "quarantined" },
            "event_id": envelope.event_id,
        })),
    ))
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
        r#"SELECT identity.identity_id, identity.vendor_id, identity.owner_user_id
             FROM wedding_vendor_sender_identities identity
             JOIN wedding_vendors vendor ON vendor.vendor_id = identity.vendor_id
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
    Ok(RecipientRoute {
        identity_id: row.get("identity_id"),
        vendor_id: row.get("vendor_id"),
        owner_user_id: row.get("owner_user_id"),
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
            "SELECT payload_digest FROM wedding_vendor_email_provider_events WHERE provider = $1 AND provider_event_id = $2",
        )
        .bind(PROVIDER)
        .bind(&envelope.event_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(database_failure)?;
        tx.rollback().await.map_err(database_failure)?;
        return match existing.as_deref() {
            Some(digest) if digest == envelope.body_digest => Ok(true),
            _ => Err((StatusCode::CONFLICT, "event_conflict".to_string())),
        };
    }

    sqlx::query(
        r#"INSERT INTO wedding_vendor_email_ingress_quarantine
             (quarantine_id, provider, provider_event_id, recipient_identity_id,
              vendor_id, owner_user_id, payload_digest, raw_size_bytes,
              ciphertext_envelope, processing_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'awaiting_scan')"#,
    )
    .bind(format!("emailq_{}", Ulid::new().to_string().to_lowercase()))
    .bind(PROVIDER)
    .bind(&envelope.event_id)
    .bind(&route.identity_id)
    .bind(&route.vendor_id)
    .bind(&route.owner_user_id)
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

fn ingress_encryption_key() -> Result<[u8; 32], IngressError> {
    let encoded = crate::secret_manager::read_process_secret_trimmed(
        "OMNYID_VENDOR_MAIL_INGRESS_ENCRYPTION_KEY",
    )
    .ok_or_else(|| IngressError::new(StatusCode::SERVICE_UNAVAILABLE, "encryption_unavailable"))?;
    hex::decode(encoded)
        .ok()
        .and_then(|bytes| bytes.try_into().ok())
        .ok_or_else(|| IngressError::new(StatusCode::SERVICE_UNAVAILABLE, "encryption_unavailable"))
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
}
