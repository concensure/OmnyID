/*
 * @module-id: rust.server.wedding-vendor-sender-identity-routes
 * @primary-capability: verified-vendor-response-sender-choice
 * @locs-version: 1.0
 * @stability: draft
 * @owner: omnyid
 */

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

const MASK_DOMAIN: &str = "omnyid.com";
const MASK_COLLISION_WORDS: &[&str] = &[
    "harbour", "garden", "meadow", "orchard", "coast", "fern", "cedar", "willow",
];
const RESERVED_LOCAL_PARTS: &[&str] = &[
    "abuse",
    "admin",
    "billing",
    "contact",
    "hello",
    "info",
    "mailer_daemon",
    "no_reply",
    "noreply",
    "postmaster",
    "privacy",
    "security",
    "support",
    "webmaster",
    "wedding",
];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/api/wedding/vendor/sender-identity",
        get(sender_identity_http).put(select_sender_identity_http),
    )
}

#[derive(Deserialize)]
struct SenderIdentityQuery {
    vendor_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SelectSenderIdentityRequest {
    vendor_id: String,
    kind: String,
}

struct VendorSenderContext {
    vendor_id: String,
    vendor_name: String,
    service_area: String,
}

struct StoredSenderIdentity {
    identity_id: String,
    mask_local_part: String,
    selected_kind: Option<String>,
    revision: i32,
}

#[derive(Clone, Debug)]
pub(super) struct AuthorizedVendorSenderIdentity {
    pub identity_id: String,
    pub kind: String,
}

async fn sender_identity_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<SenderIdentityQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let context = verified_vendor_context(&state, &user.id, &query.vendor_id).await?;
    let connected_email = connected_gmail_address(&state, &user.id).await?;
    let stored = stored_identity(&state, &user.id, &context.vendor_id).await?;
    let mask_local_part = match stored.as_ref() {
        Some(identity) => identity.mask_local_part.clone(),
        None => available_mask_local_part(&state, &context).await?,
    };
    Ok(Json(identity_payload(
        &context,
        stored.as_ref(),
        connected_email.as_deref(),
        &mask_local_part,
    )))
}

async fn select_sender_identity_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SelectSenderIdentityRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_sender_identity", &headers),
        super::RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60 * 60),
        },
    )
    .await?;
    let kind = request.kind.trim();
    if !matches!(kind, "connected_email" | "omnyid_mask") {
        return Err((
            StatusCode::BAD_REQUEST,
            "choose an available sender option".to_string(),
        ));
    }
    let context = verified_vendor_context(&state, &user.id, &request.vendor_id).await?;
    let connected_email = connected_gmail_address(&state, &user.id).await?;
    if kind == "connected_email" && connected_email.is_none() {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            "connect and verify a business Gmail address before selecting it".to_string(),
        ));
    }

    let mut transaction = state.db.pool.begin().await.map_err(database_failure)?;
    let locked = sqlx::query(
        r#"SELECT vendor_id FROM wedding_vendors
            WHERE vendor_id = $1 AND status = 'active' AND claim_status = 'verified'
              AND claimed_by_user_id = $2 FOR UPDATE"#,
    )
    .bind(&context.vendor_id)
    .bind(&user.id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(database_failure)?;
    if locked.is_none() {
        return Err(ownership_required());
    }

    if let Some(previous) = sqlx::query(
        r#"SELECT identity_id, owner_user_id FROM wedding_vendor_sender_identities
            WHERE vendor_id = $1 AND status = 'active' FOR UPDATE"#,
    )
    .bind(&context.vendor_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(database_failure)?
    {
        let previous_owner: String = previous.get("owner_user_id");
        if previous_owner != user.id {
            sqlx::query(
                "UPDATE wedding_vendor_sender_identities SET status = 'archived', archived_at = NOW(), updated_at = NOW() WHERE identity_id = $1",
            )
            .bind(previous.get::<String, _>("identity_id"))
            .execute(&mut *transaction)
            .await
            .map_err(database_failure)?;
        }
    }

    let active = sqlx::query(
        r#"SELECT identity_id, mask_local_part, selected_kind, revision
             FROM wedding_vendor_sender_identities
            WHERE vendor_id = $1 AND owner_user_id = $2 AND status = 'active'"#,
    )
    .bind(&context.vendor_id)
    .bind(&user.id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(database_failure)?;

    let identity_id = if let Some(row) = active {
        let identity_id: String = row.get("identity_id");
        sqlx::query(
            r#"UPDATE wedding_vendor_sender_identities
                  SET revision = CASE WHEN selected_kind IS DISTINCT FROM $2 THEN revision + 1 ELSE revision END,
                      selected_kind = $2, updated_at = NOW()
                WHERE identity_id = $1"#,
        )
        .bind(&identity_id)
        .bind(kind)
        .execute(&mut *transaction)
        .await
        .map_err(database_failure)?;
        identity_id
    } else {
        reserve_identity(&mut transaction, &context, &user.id, kind).await?
    };
    transaction.commit().await.map_err(database_failure)?;

    let stored = stored_identity(&state, &user.id, &context.vendor_id)
        .await?
        .ok_or_else(database_unavailable)?;
    append_sender_identity_receipt(&state, &user.id, &context, &stored, kind).await?;
    debug_assert_eq!(identity_id, stored.identity_id);
    Ok(Json(identity_payload(
        &context,
        Some(&stored),
        connected_email.as_deref(),
        &stored.mask_local_part,
    )))
}

pub(super) async fn authorize_selected_sender_identity(
    state: &AppState,
    user_id: &str,
    vendor_id: &str,
    identity_id: &str,
) -> Result<AuthorizedVendorSenderIdentity, (StatusCode, String)> {
    if !safe_id(identity_id) {
        return Err(ownership_required());
    }
    let row = sqlx::query(
        r#"SELECT identity.identity_id, identity.selected_kind
             FROM wedding_vendor_sender_identities identity
             JOIN wedding_vendors vendor ON vendor.vendor_id = identity.vendor_id
            WHERE identity.identity_id = $1 AND identity.vendor_id = $2
              AND identity.owner_user_id = $3 AND identity.status = 'active'
              AND vendor.status = 'active' AND vendor.claim_status = 'verified'
              AND vendor.claimed_by_user_id = $3"#,
    )
    .bind(identity_id)
    .bind(vendor_id)
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(ownership_required)?;
    let kind: String = row.try_get("selected_kind").map_err(database_failure)?;
    if kind == "connected_email" && connected_gmail_address_ref(state, user_id).await?.is_none() {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            "the selected business mailbox is no longer connected".to_string(),
        ));
    }
    Ok(AuthorizedVendorSenderIdentity {
        identity_id: row.get("identity_id"),
        kind,
    })
}

async fn verified_vendor_context(
    state: &Arc<AppState>,
    user_id: &str,
    vendor_id: &str,
) -> Result<VendorSenderContext, (StatusCode, String)> {
    if !safe_id(vendor_id) {
        return Err(ownership_required());
    }
    sqlx::query(
        r#"SELECT vendor_id, vendor_name, service_area FROM wedding_vendors
            WHERE vendor_id = $1 AND status = 'active' AND claim_status = 'verified'
              AND claimed_by_user_id = $2"#,
    )
    .bind(vendor_id.trim())
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .map(|row| VendorSenderContext {
        vendor_id: row.get("vendor_id"),
        vendor_name: row.get("vendor_name"),
        service_area: row.get("service_area"),
    })
    .ok_or_else(ownership_required)
}

async fn stored_identity(
    state: &Arc<AppState>,
    user_id: &str,
    vendor_id: &str,
) -> Result<Option<StoredSenderIdentity>, (StatusCode, String)> {
    sqlx::query(
        r#"SELECT identity_id, mask_local_part, selected_kind, revision
             FROM wedding_vendor_sender_identities
            WHERE vendor_id = $1 AND owner_user_id = $2 AND status = 'active'"#,
    )
    .bind(vendor_id)
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)
    .map(|row| {
        row.map(|row| StoredSenderIdentity {
            identity_id: row.get("identity_id"),
            mask_local_part: row.get("mask_local_part"),
            selected_kind: row
                .try_get::<Option<String>, _>("selected_kind")
                .ok()
                .flatten(),
            revision: row.get("revision"),
        })
    })
}

async fn connected_gmail_address(
    state: &Arc<AppState>,
    user_id: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    connected_gmail_address_ref(state.as_ref(), user_id).await
}

async fn connected_gmail_address_ref(
    state: &AppState,
    user_id: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    state
        .db
        .get_gmail_token(user_id)
        .await
        .map_err(database_failure)
        .map(|token| {
            token
                .and_then(|value| {
                    value
                        .get("gmail_email")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .map(|value| value.trim().to_ascii_lowercase())
                .filter(|value| valid_email(value))
        })
}

async fn available_mask_local_part(
    state: &Arc<AppState>,
    context: &VendorSenderContext,
) -> Result<String, (StatusCode, String)> {
    for candidate in mask_candidates(&context.vendor_name, &context.service_area)? {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM wedding_vendor_sender_identities WHERE lower(mask_local_part) = lower($1) AND mask_domain = $2)",
        )
        .bind(&candidate)
        .bind(MASK_DOMAIN)
        .fetch_one(&state.db.pool)
        .await
        .map_err(database_failure)?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err((
        StatusCode::CONFLICT,
        "a sender address could not be reserved for this listing".to_string(),
    ))
}

async fn reserve_identity(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    context: &VendorSenderContext,
    user_id: &str,
    kind: &str,
) -> Result<String, (StatusCode, String)> {
    for candidate in mask_candidates(&context.vendor_name, &context.service_area)? {
        let identity_id = Ulid::new().to_string();
        let inserted = sqlx::query_scalar::<_, String>(
            r#"INSERT INTO wedding_vendor_sender_identities
                  (identity_id, vendor_id, owner_user_id, mask_local_part, mask_domain, selected_kind)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING RETURNING identity_id"#,
        )
        .bind(&identity_id)
        .bind(&context.vendor_id)
        .bind(user_id)
        .bind(candidate)
        .bind(MASK_DOMAIN)
        .bind(kind)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(database_failure)?;
        if inserted.is_some() {
            return Ok(identity_id);
        }
    }
    Err((
        StatusCode::CONFLICT,
        "a sender address could not be reserved for this listing".to_string(),
    ))
}

fn identity_payload(
    context: &VendorSenderContext,
    stored: Option<&StoredSenderIdentity>,
    connected_email: Option<&str>,
    mask_local_part: &str,
) -> Value {
    let mask_address = format!("{mask_local_part}@{MASK_DOMAIN}");
    let selected_kind = stored.and_then(|identity| identity.selected_kind.as_deref());
    json!({
        "vendor_id": context.vendor_id,
        "vendor_name": context.vendor_name,
        "identity_id": stored.map(|identity| identity.identity_id.as_str()),
        "revision": stored.map(|identity| identity.revision),
        "selected_kind": selected_kind,
        "relay_delivery_enabled": mask_delivery_enabled(),
        "options": [
            {
                "kind": "connected_email",
                "label": "My connected business email",
                "address": connected_email,
                "available": connected_email.is_some(),
                "selected": selected_kind == Some("connected_email"),
                "detail": if connected_email.is_some() {
                    "Use the verified Gmail address connected to this OmnyID account."
                } else {
                    "Connect a business Gmail address before choosing this option."
                },
            },
            {
                "kind": "omnyid_mask",
                "label": "OmnyID business address",
                "address": mask_address,
                "available": true,
                "selected": selected_kind == Some("omnyid_mask"),
                "detail": if mask_delivery_enabled() {
                    "Use your business-named OmnyID address for this response."
                } else {
                    "Use this identity inside OmnyID. External email replies remain off until the relay review is complete."
                },
            }
        ]
    })
}

fn mask_delivery_enabled() -> bool {
    let selected = std::env::var("OMNYID_VENDOR_SENDER_MASK_ENABLED").is_ok_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )
    });
    let provider_ready = crate::gateway::vendor_mail_provider::VendorMailConfig::from_env()
        .is_ok_and(|config| config.readiness().ready);
    selected && provider_ready
}

fn mask_candidates(name: &str, service_area: &str) -> Result<Vec<String>, (StatusCode, String)> {
    let name = mask_segment(name);
    let location = mask_segment(&locality(service_area));
    if name.is_empty() || location.is_empty() {
        return Err((
            StatusCode::CONFLICT,
            "the listing needs a business name and locality before a sender address can be reserved"
                .to_string(),
        ));
    }
    let base = joined_mask(&name, &location, None);
    if RESERVED_LOCAL_PARTS.contains(&base.as_str()) {
        return Err((
            StatusCode::CONFLICT,
            "this sender address is reserved".to_string(),
        ));
    }
    let mut candidates = vec![base];
    candidates.extend(
        MASK_COLLISION_WORDS
            .iter()
            .map(|word| joined_mask(&name, &location, Some(word))),
    );
    Ok(candidates)
}

fn joined_mask(name: &str, location: &str, suffix: Option<&str>) -> String {
    let suffix_len = suffix.map_or(0, |value| value.len() + 1);
    let location_budget = location.len().min(20);
    let name_budget = 64usize
        .saturating_sub(location_budget + suffix_len + 1)
        .max(1);
    let name = trim_segment(name, name_budget);
    let location = trim_segment(location, location_budget);
    let mut value = format!("{name}_{location}");
    if let Some(suffix) = suffix {
        value.push('_');
        value.push_str(suffix);
    }
    value
}

fn trim_segment(value: &str, max: usize) -> &str {
    value
        .get(..value.len().min(max))
        .unwrap_or(value)
        .trim_matches('_')
}

fn locality(service_area: &str) -> String {
    const STATE_CODES: &[&str] = &["act", "nsw", "nt", "qld", "sa", "tas", "vic", "wa"];
    service_area
        .split(',')
        .next()
        .unwrap_or(service_area)
        .split_whitespace()
        .filter(|part| {
            let lower = part.to_ascii_lowercase();
            !STATE_CODES.contains(&lower.as_str())
                && !lower.chars().all(|character| character.is_ascii_digit())
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn mask_segment(value: &str) -> String {
    let mut output = String::new();
    let mut separator = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            if separator && !output.is_empty() {
                output.push('_');
            }
            output.push(character.to_ascii_lowercase());
            separator = false;
        } else if character == '&' {
            if !output.is_empty() && !output.ends_with('_') {
                output.push('_');
            }
            output.push_str("and");
            separator = true;
        } else {
            separator = true;
        }
    }
    output.trim_matches('_').to_string()
}

async fn append_sender_identity_receipt(
    state: &Arc<AppState>,
    user_id: &str,
    context: &VendorSenderContext,
    identity: &StoredSenderIdentity,
    kind: &str,
) -> Result<(), (StatusCode, String)> {
    let address = if kind == "omnyid_mask" {
        format!("{}@{}", identity.mask_local_part, MASK_DOMAIN)
    } else {
        connected_gmail_address(state, user_id)
            .await?
            .unwrap_or_default()
    };
    let content = json!({
        "kind": "wedding_vendor_sender_identity_selected",
        "vendor_id": context.vendor_id,
        "identity_id": identity.identity_id,
        "sender_kind": kind,
        "address_sha256": hex::encode(Sha256::digest(address.as_bytes())),
        "revision": identity.revision,
        "external_email_sent": false,
    });
    let message_id = deterministic_receipt_id(&identity.identity_id, identity.revision);
    let message = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: message_id,
        thread_id: format!("wedding-vendor-sender:{}", context.vendor_id),
        parent_id: String::new(),
        from: "agent:vendor-identity@omnyid.com".to_string(),
        to: vec![user_id.to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "wedding_vendor_sender_identity_selected".to_string(),
        kind: Some("wedding_vendor_sender_identity".to_string()),
        supertags: vec!["wedding".to_string(), "vendor-identity".to_string()],
        content: content.to_string(),
        views: "[]".to_string(),
        attachments: "[]".to_string(),
        references: "[]".to_string(),
        encryption: "{}".to_string(),
        signature: String::new(),
        store_in_relational: true,
        subtype: "sender_identity_selected".to_string(),
        metadata: json!({"store": true, "privacy": "private"}).to_string(),
    };
    state
        .db
        .store_private_message(user_id, &message, content)
        .await
        .map_err(|_| database_unavailable())?;
    Ok(())
}

fn deterministic_receipt_id(identity_id: &str, revision: i32) -> String {
    let digest = Sha256::digest(format!(
        "wedding-vendor-sender-identity\0{identity_id}\0{revision}"
    ));
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ulid::from_bytes(bytes).to_string()
}

fn safe_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && value.len() <= 180 && !value.chars().any(char::is_control)
}

fn valid_email(value: &str) -> bool {
    value.len() <= 254
        && value.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && !domain.is_empty()
                && domain.contains('.')
                && !value.contains(char::is_whitespace)
        })
}

fn ownership_required() -> (StatusCode, String) {
    (
        StatusCode::FORBIDDEN,
        "verified listing ownership is required".to_string(),
    )
}

fn database_unavailable() -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "sender choices are temporarily unavailable".to_string(),
    )
}

fn database_failure(_: sqlx::Error) -> (StatusCode, String) {
    database_unavailable()
}

#[cfg(test)]
mod tests {
    use super::{deterministic_receipt_id, locality, mask_candidates, mask_segment};

    #[test]
    fn builds_requested_vendor_and_locality_mask() {
        let masks = mask_candidates("Bejewelled Jewellery", "Mosman NSW 2088").unwrap();
        assert_eq!(masks[0], "bejewelled_jewellery_mosman");
        assert_eq!(masks[1], "bejewelled_jewellery_mosman_harbour");
        assert!(masks.iter().all(|value| value.len() <= 64));
    }

    #[test]
    fn normalises_without_exposing_punctuation_or_ids() {
        assert_eq!(mask_segment("Mia & Co. Weddings"), "mia_and_co_weddings");
        assert_eq!(locality("Bondi Beach, NSW 2026"), "Bondi Beach");
    }

    #[test]
    fn rejects_missing_public_identity_parts() {
        assert!(mask_candidates("Business", "---").is_err());
        assert!(mask_candidates("---", "Mosman").is_err());
    }

    #[test]
    fn audit_receipt_id_is_replay_stable_per_revision() {
        assert_eq!(
            deterministic_receipt_id("identity-1", 2),
            deterministic_receipt_id("identity-1", 2)
        );
        assert_ne!(
            deterministic_receipt_id("identity-1", 2),
            deterministic_receipt_id("identity-1", 3)
        );
    }
}
