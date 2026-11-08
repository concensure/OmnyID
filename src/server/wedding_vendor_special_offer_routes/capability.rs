//! One-time vendor management links for date-specific offers.

use std::collections::BTreeSet;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration as ChronoDuration, Utc};
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::Sha256;
use sqlx::Row;
use ulid::Ulid;

use super::*;
use crate::server::auth::public_rate_limit_key;

const PEPPER_ENV: &str = "OMNYID_WEDDING_VENDOR_SPECIALS_CAPABILITY_PEPPER";
const TOKEN_BYTES: usize = 32;
const TOKEN_PREFIX_LEN: usize = 16;
const SESSION_MINUTES: i64 = 30;
const MAX_GRANT_DAYS: i64 = 14;
const UNAVAILABLE: &str = "This management link is unavailable.";
const COOKIE_NAME: &str = "omnyid_wvs_session";

pub(super) const ALL_OPERATIONS: [&str; 14] = [
    "offer_edit",
    "offer_publish",
    "offer_pause",
    "offer_withdraw",
    "offer_reconfirm",
    "slot_record_enquiry",
    "slot_calendar_open",
    "slot_confirm_availability",
    "slot_place_hold",
    "slot_mark_booked",
    "slot_reopen_cancelled_booking",
    "slot_pause",
    "slot_withdraw",
    "slot_reconfirm",
];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/vendor/special-offers/{offer_id}/management-links",
            post(create_grant_http),
        )
        .route(
            "/wedding/vendor/special-offers/{offer_id}/management-links/{grant_id}/revoke",
            post(revoke_grant_http),
        )
        .route(
            "/api/public/wedding/vendor-specials/manage/exchange",
            post(exchange_http),
        )
        .route(
            "/api/public/wedding/vendor-specials/manage/session",
            get(read_session_http),
        )
        .route(
            "/api/public/wedding/vendor-specials/manage/command",
            post(command_http),
        )
        .route(
            "/wedding/vendor-specials/manage/attribute-signup",
            post(attribute_signup_http),
        )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateGrantRequest {
    vendor_slug: String,
    allowed_operations: Vec<String>,
    expires_in_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RevokeGrantRequest {
    vendor_slug: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ExchangeRequest {
    token: String,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CapabilityOperation {
    OfferEdit,
    OfferPublish,
    OfferPause,
    OfferWithdraw,
    OfferReconfirm,
    SlotRecordEnquiry,
    SlotCalendarOpen,
    SlotConfirmAvailability,
    SlotPlaceHold,
    SlotMarkBooked,
    SlotReopenCancelledBooking,
    SlotPause,
    SlotWithdraw,
    SlotReconfirm,
}

impl CapabilityOperation {
    fn name(self) -> &'static str {
        match self {
            Self::OfferEdit => "offer_edit",
            Self::OfferPublish => "offer_publish",
            Self::OfferPause => "offer_pause",
            Self::OfferWithdraw => "offer_withdraw",
            Self::OfferReconfirm => "offer_reconfirm",
            Self::SlotRecordEnquiry => "slot_record_enquiry",
            Self::SlotCalendarOpen => "slot_calendar_open",
            Self::SlotConfirmAvailability => "slot_confirm_availability",
            Self::SlotPlaceHold => "slot_place_hold",
            Self::SlotMarkBooked => "slot_mark_booked",
            Self::SlotReopenCancelledBooking => "slot_reopen_cancelled_booking",
            Self::SlotPause => "slot_pause",
            Self::SlotWithdraw => "slot_withdraw",
            Self::SlotReconfirm => "slot_reconfirm",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CapabilityCommandRequest {
    operation: CapabilityOperation,
    expected_revision: u64,
    idempotency_key: String,
    slot_id: Option<String>,
    hold_expires_at: Option<String>,
    confirmation_expires_at: Option<String>,
    reason: Option<String>,
    edit: Option<CapabilityEditRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CapabilityEditRequest {
    title: String,
    summary: String,
    slot_revision: u64,
    local_date: String,
    timezone: String,
    starts_at: Option<String>,
    ends_at: Option<String>,
    space_label: Option<String>,
    session_label: Option<String>,
    maximum_capacity: Option<u32>,
    minimum_spend_cents: Option<i64>,
    indicative_per_head_cents: Option<i64>,
    inclusions: Vec<String>,
    public_conditions: Option<String>,
}

struct SessionAuthority {
    grant_id: String,
    vendor_id: String,
    offer_id: String,
    generation: i32,
    allowed_operations: BTreeSet<String>,
}

fn unavailable() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, UNAVAILABLE.into())
}

fn pepper() -> Option<Vec<u8>> {
    let value = crate::secret_manager::read_process_secret_trimmed(PEPPER_ENV)?;
    let bytes = URL_SAFE_NO_PAD.decode(value.trim()).ok()?;
    (bytes.len() >= TOKEN_BYTES).then_some(bytes)
}

fn mac(pepper: &[u8], value: &str) -> Option<String> {
    if pepper.len() < TOKEN_BYTES {
        return None;
    }
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper).ok()?;
    mac.update(value.as_bytes());
    Some(hex::encode(mac.finalize().into_bytes()))
}

fn mac_matches(pepper: &[u8], value: &str, expected: &str) -> bool {
    let Ok(expected) = hex::decode(expected) else {
        return false;
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(pepper) else {
        return false;
    };
    mac.update(value.as_bytes());
    mac.verify_slice(&expected).is_ok()
}

fn secret(label: &str, entropy: [u8; TOKEN_BYTES]) -> String {
    format!("{label}_{}", URL_SAFE_NO_PAD.encode(entropy))
}

fn fresh_secret(label: &str) -> String {
    let mut entropy = [0_u8; TOKEN_BYTES];
    rand::rng().fill_bytes(&mut entropy);
    secret(label, entropy)
}

fn token_prefix(token: &str, label: &str) -> Option<String> {
    let token = token.trim();
    let encoded = token.strip_prefix(&format!("{label}_"))?;
    let decoded = URL_SAFE_NO_PAD.decode(encoded).ok()?;
    if decoded.len() != TOKEN_BYTES || token.len() < TOKEN_PREFIX_LEN {
        return None;
    }
    Some(token[..TOKEN_PREFIX_LEN].to_string())
}

fn validated_operations(values: Vec<String>) -> Result<Vec<String>, (StatusCode, String)> {
    let operations = values
        .into_iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<BTreeSet<_>>();
    if operations.is_empty()
        || operations.len() > ALL_OPERATIONS.len()
        || operations
            .iter()
            .any(|value| !ALL_OPERATIONS.contains(&value.as_str()))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose one or more supported management actions.".into(),
        ));
    }
    Ok(operations.into_iter().collect())
}

fn grant_exchange_allowed(
    status: &str,
    revoked_at: Option<chrono::DateTime<Utc>>,
    expires_at: chrono::DateTime<Utc>,
    now: chrono::DateTime<Utc>,
) -> bool {
    matches!(status, "active" | "exchanged") && revoked_at.is_none() && expires_at > now
}

fn management_base_url() -> String {
    let value = std::env::var("OMNYID_BASE_URL").unwrap_or_else(|_| "https://omnyid.com".into());
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.starts_with("https://")
        || trimmed.starts_with("http://127.0.0.1")
        || trimmed.starts_with("http://localhost")
    {
        trimmed.to_string()
    } else {
        "https://omnyid.com".into()
    }
}

async fn grant_issuer_authority(
    state: &AppState,
    headers: &HeaderMap,
    vendor_slug: &str,
    offer_id: &str,
) -> Result<(crate::db::UserRecord, String), (StatusCode, String)> {
    enforce_rate_limit(
        state,
        authenticated_rate_limit_key("wedding-vendor-special-grant", headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, headers).await?;
    if !rollout_allowed(&user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "Limited-date offer management is not enabled for this account.".into(),
        ));
    }
    let row = sqlx::query(
        "SELECT v.vendor_id,v.claimed_by_user_id,v.claim_status FROM wedding_vendors v JOIN wedding_vendor_special_offers o ON o.vendor_id=v.vendor_id WHERE v.vendor_slug=$1 AND o.offer_id=$2",
    )
    .bind(clean(vendor_slug, 160))
    .bind(offer_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Offer not found.".into()))?;
    let vendor_id: String = row.get("vendor_id");
    let claimed_by: Option<String> = row.get("claimed_by_user_id");
    let claim_status: String = row.get("claim_status");
    let verified_owner = claim_status == "verified" && claimed_by.as_deref() == Some(&user.id);
    let operator = super::super::cost_controls::operator_access_allowed(&user.email);
    if !verified_owner && !operator {
        return Err((
            StatusCode::FORBIDDEN,
            "Vendor authority is required.".into(),
        ));
    }
    Ok((user, vendor_id))
}

async fn create_grant_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(offer_id): Path<String>,
    Json(request): Json<CreateGrantRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor_id) =
        grant_issuer_authority(&state, &headers, &request.vendor_slug, &offer_id).await?;
    issue_grant(
        &state,
        &user.id,
        &vendor_id,
        &offer_id,
        request.allowed_operations,
        request.expires_in_days.unwrap_or(7),
    )
    .await
    .map(Json)
}

pub(super) async fn issue_grant(
    state: &AppState,
    created_by_user_id: &str,
    vendor_id: &str,
    offer_id: &str,
    requested_operations: Vec<String>,
    days: i64,
) -> Result<Value, (StatusCode, String)> {
    let pepper = pepper().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Secure management links are not configured.".into(),
    ))?;
    let operations = validated_operations(requested_operations)?;
    if !(1..=MAX_GRANT_DAYS).contains(&days) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Expiry must be between 1 and {MAX_GRANT_DAYS} days."),
        ));
    }
    let token = fresh_secret("wvs");
    let prefix = token_prefix(&token, "wvs").ok_or_else(unavailable)?;
    let digest = mac(&pepper, &token).ok_or_else(unavailable)?;
    let expires_at = Utc::now() + ChronoDuration::days(days);
    let grant_id = format!("wvs_grant_{}", Ulid::new());
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let generation = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(generation),0)+1 FROM wedding_vendor_special_offer_grants WHERE vendor_id=$1 AND offer_id=$2",
    )
    .bind(&vendor_id)
    .bind(&offer_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(database_failure)?;
    let rotated = sqlx::query_scalar::<_, String>(
        "UPDATE wedding_vendor_special_offer_grants SET status='rotated',revoked_at=NOW() WHERE vendor_id=$1 AND offer_id=$2 AND status IN ('active','exchanged') RETURNING grant_id",
    )
    .bind(&vendor_id)
    .bind(&offer_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(database_failure)?;
    if !rotated.is_empty() {
        sqlx::query(
            "UPDATE wedding_vendor_special_offer_sessions SET consumed_at=COALESCE(consumed_at,NOW()) WHERE grant_id=ANY($1)",
        )
        .bind(&rotated)
        .execute(&mut *tx)
        .await
        .map_err(database_failure)?;
    }
    sqlx::query(
        "INSERT INTO wedding_vendor_special_offer_grants (grant_id,vendor_id,offer_id,token_prefix,token_digest,allowed_operations,generation,expires_at,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(&grant_id)
    .bind(&vendor_id)
    .bind(&offer_id)
    .bind(&prefix)
    .bind(&digest)
    .bind(json!(operations))
    .bind(generation)
    .bind(expires_at)
    .bind(created_by_user_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;
    Ok(json!({
        "grant_id":grant_id,
        "management_url":format!("{}/workspace/vendor.html#special_management={token}", management_base_url()),
        "allowed_operations":operations,
        "generation":generation,
        "expires_at":expires_at.to_rfc3339(),
        "rotated_previous_links":!rotated.is_empty(),
        "notice":"This private link is shown once. It can be reopened to manage only this offer until it expires, is rotated or is revoked."
    }))
}

async fn revoke_grant_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((offer_id, grant_id)): Path<(String, String)>,
    Json(request): Json<RevokeGrantRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_user, vendor_id) =
        grant_issuer_authority(&state, &headers, &request.vendor_slug, &offer_id).await?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let updated = sqlx::query_scalar::<_, String>(
        "UPDATE wedding_vendor_special_offer_grants SET status='revoked',revoked_at=NOW() WHERE grant_id=$1 AND offer_id=$2 AND vendor_id=$3 AND status IN ('active','exchanged') RETURNING grant_id",
    )
    .bind(&grant_id)
    .bind(&offer_id)
    .bind(&vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Management link not found.".into()))?;
    sqlx::query(
        "UPDATE wedding_vendor_special_offer_sessions SET consumed_at=COALESCE(consumed_at,NOW()) WHERE grant_id=$1",
    )
    .bind(&updated)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(json!({"status":"revoked"})))
}

async fn exchange_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ExchangeRequest>,
) -> Result<Response, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding-vendor-special-exchange", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let pepper = pepper().ok_or_else(unavailable)?;
    let token = request.token.trim();
    let prefix = token_prefix(token, "wvs").ok_or_else(unavailable)?;
    let digest = mac(&pepper, token).ok_or_else(unavailable)?;
    let session_secret = fresh_secret("wvss");
    let csrf_secret = fresh_secret("wvsc");
    let session_digest = mac(&pepper, &session_secret).ok_or_else(unavailable)?;
    let csrf_digest = mac(&pepper, &csrf_secret).ok_or_else(unavailable)?;
    let session_id = format!("wvs_session_{}", Ulid::new());
    let expires_at = Utc::now() + ChronoDuration::minutes(SESSION_MINUTES);
    let mut tx = state.db.pool.begin().await.map_err(|_| unavailable())?;
    let grant = sqlx::query(
        "SELECT grant_id,generation,status,revoked_at,expires_at FROM wedding_vendor_special_offer_grants WHERE token_prefix=$1 AND token_digest=$2 FOR UPDATE",
    )
    .bind(&prefix)
    .bind(&digest)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| unavailable())?
    .ok_or_else(unavailable)?;
    let grant_id: String = grant.get("grant_id");
    let grant_expiry: chrono::DateTime<Utc> = grant.get("expires_at");
    let now = Utc::now();
    if !grant_exchange_allowed(
        &grant.get::<String, _>("status"),
        grant.get("revoked_at"),
        grant_expiry,
        now,
    ) {
        if matches!(
            grant.get::<String, _>("status").as_str(),
            "active" | "exchanged"
        ) && grant_expiry <= now
        {
            sqlx::query(
                "UPDATE wedding_vendor_special_offer_grants SET status='expired' WHERE grant_id=$1 AND status IN ('active','exchanged')",
            )
            .bind(&grant_id)
            .execute(&mut *tx)
            .await
            .map_err(|_| unavailable())?;
            tx.commit().await.map_err(|_| unavailable())?;
        }
        return Err(unavailable());
    }
    let session_expiry = expires_at.min(grant_expiry);
    let exchanged = sqlx::query(
        "UPDATE wedding_vendor_special_offer_grants SET status='exchanged',exchanged_at=COALESCE(exchanged_at,NOW()) WHERE grant_id=$1 AND status IN ('active','exchanged')",
    )
    .bind(&grant_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| unavailable())?;
    if exchanged.rows_affected() != 1 {
        return Err(unavailable());
    }
    sqlx::query(
        "INSERT INTO wedding_vendor_special_offer_sessions (session_id,grant_id,session_token_digest,csrf_token_digest,expires_at) VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(&session_id)
    .bind(&grant_id)
    .bind(&session_digest)
    .bind(&csrf_digest)
    .bind(session_expiry)
    .execute(&mut *tx)
    .await
    .map_err(|_| unavailable())?;
    tx.commit().await.map_err(|_| unavailable())?;
    let cookie = format!(
        "{COOKIE_NAME}={session_secret}; Path=/api/public/wedding/vendor-specials/manage; Max-Age={}; HttpOnly; Secure; SameSite=Strict",
        SESSION_MINUTES * 60
    );
    let mut response = Json(json!({
        "session_id":session_id,
        "referral_grant_id":grant_id,
        "csrf_token":csrf_secret,
        "expires_at":session_expiry.to_rfc3339(),
        "generation":grant.get::<i32,_>("generation"),
        "account_access":false
    }))
    .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| unavailable())?,
    );
    Ok(response)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AttributionRequest {
    grant_id: String,
}

async fn attribute_signup_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AttributionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor-special-attribution", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let row = sqlx::query(
        r#"SELECT g.vendor_id,c.claim_id
        FROM wedding_vendor_special_offer_grants g
        JOIN users u ON u.id=$2 AND u.created_at>=g.created_at
        JOIN wedding_vendor_claims c ON c.vendor_id=g.vendor_id AND c.user_id=u.id AND c.created_at>=g.created_at
        WHERE g.grant_id=$1 AND g.exchanged_at IS NOT NULL
          AND c.status IN ('started','published','verified')
        ORDER BY c.created_at DESC LIMIT 1"#,
    )
    .bind(clean(&request.grant_id, 160))
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::CONFLICT,
        "Complete or resume this vendor's listing claim before attribution.".into(),
    ))?;
    let vendor_id: String = row.get("vendor_id");
    let claim_id: String = row.get("claim_id");
    sqlx::query("INSERT INTO wedding_vendor_special_offer_grant_attributions (grant_id,vendor_id,user_id,claim_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING")
        .bind(&request.grant_id).bind(&vendor_id).bind(&user.id).bind(&claim_id)
        .execute(&state.db.pool).await.map_err(database_failure)?;
    Ok(Json(json!({"attributed":true,"grant_id":request.grant_id})))
}

fn cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|part| part.strip_prefix(&format!("{COOKIE_NAME}=")))
}

async fn session_authority(
    state: &AppState,
    headers: &HeaderMap,
    require_csrf: bool,
) -> Result<SessionAuthority, (StatusCode, String)> {
    let pepper = pepper().ok_or_else(unavailable)?;
    let secret = cookie(headers).ok_or_else(unavailable)?;
    token_prefix(secret, "wvss").ok_or_else(unavailable)?;
    let digest = mac(&pepper, secret).ok_or_else(unavailable)?;
    let row = sqlx::query(
        "SELECT g.grant_id,g.vendor_id,g.offer_id,g.generation,g.allowed_operations,s.csrf_token_digest FROM wedding_vendor_special_offer_sessions s JOIN wedding_vendor_special_offer_grants g ON g.grant_id=s.grant_id JOIN wedding_vendor_special_offers o ON o.offer_id=g.offer_id AND o.vendor_id=g.vendor_id WHERE s.session_token_digest=$1 AND s.consumed_at IS NULL AND s.expires_at>NOW() AND g.status='exchanged' AND g.revoked_at IS NULL AND g.expires_at>NOW()",
    )
    .bind(&digest)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| unavailable())?
    .ok_or_else(unavailable)?;
    if require_csrf {
        let csrf = headers
            .get("x-csrf-token")
            .and_then(|value| value.to_str().ok())
            .ok_or_else(unavailable)?;
        if !mac_matches(&pepper, csrf, &row.get::<String, _>("csrf_token_digest")) {
            return Err(unavailable());
        }
    }
    let operations: Value = row.get("allowed_operations");
    let operations = serde_json::from_value::<Vec<String>>(operations)
        .map_err(|_| unavailable())?
        .into_iter()
        .collect();
    Ok(SessionAuthority {
        grant_id: row.get("grant_id"),
        vendor_id: row.get("vendor_id"),
        offer_id: row
            .get::<Option<String>, _>("offer_id")
            .ok_or_else(unavailable)?,
        generation: row.get("generation"),
        allowed_operations: operations,
    })
}

async fn read_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding-vendor-special-read", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let authority = session_authority(&state, &headers, false).await?;
    let offer = sqlx::query(
        "SELECT offer_id,title,summary,publication_state,currency,revision,updated_at FROM wedding_vendor_special_offers WHERE offer_id=$1 AND vendor_id=$2",
    )
    .bind(&authority.offer_id)
    .bind(&authority.vendor_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|_| unavailable())?;
    let slots = sqlx::query(
        "SELECT slot.*,(SELECT COUNT(*) FROM wedding_vendor_special_offer_enquiries enquiry WHERE enquiry.slot_id=slot.slot_id) AS affected_enquiry_count FROM wedding_vendor_special_offer_slots slot WHERE offer_id=$1 AND vendor_id=$2 ORDER BY local_date,starts_at NULLS FIRST",
    )
    .bind(&authority.offer_id)
    .bind(&authority.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|_| unavailable())?
    .into_iter()
    .map(|row| json!({
        "slot_id":row.get::<String,_>("slot_id"),
        "local_date":row.get::<NaiveDate,_>("local_date").to_string(),
        "timezone":row.get::<String,_>("timezone"),
        "space_label":row.get::<String,_>("space_label"),
        "session_label":row.get::<String,_>("session_label"),
        "state":row.get::<String,_>("state"),
        "availability_scope":row.get::<String,_>("availability_scope"),
        "availability_scope_updated_at":row.get::<chrono::DateTime<Utc>,_>("availability_scope_updated_at").to_rfc3339(),
        "maximum_capacity":row.get::<Option<i32>,_>("maximum_capacity"),
        "minimum_spend_cents":row.get::<Option<i64>,_>("minimum_spend_cents"),
        "indicative_per_head_cents":row.get::<Option<i64>,_>("indicative_per_head_cents"),
        "inclusions":row.get::<Vec<String>,_>("inclusions"),
        "public_conditions":row.get::<Option<String>,_>("public_conditions"),
        "revision":row.get::<i64,_>("revision"),
        "affected_enquiry_count":row.get::<i64,_>("affected_enquiry_count"),
        "operator_warning":if matches!(row.get::<String,_>("state").as_str(), "stale" | "paused" | "withdrawn") && row.get::<i64,_>("affected_enquiry_count") > 0 { Some("This date is hidden from discovery and has affected enquiries to review.") } else { None::<&str> }
    }))
    .collect::<Vec<_>>();
    Ok(Json(json!({
        "grant_id":authority.grant_id,
        "generation":authority.generation,
        "allowed_operations":authority.allowed_operations,
        "offer":{
            "offer_id":offer.get::<String,_>("offer_id"),
            "title":offer.get::<String,_>("title"),
            "summary":offer.get::<String,_>("summary"),
            "publication_state":offer.get::<String,_>("publication_state"),
            "currency":offer.get::<String,_>("currency"),
            "inclusions":offer.get::<Vec<String>,_>("inclusions"),
            "public_conditions":offer.get::<Option<String>,_>("public_conditions"),
            "revision":offer.get::<i64,_>("revision"),
            "slots":slots
        },
        "account_access":false
    })))
}

async fn command_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CapabilityCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding-vendor-special-command", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let authority = session_authority(&state, &headers, true).await?;
    if !authority
        .allowed_operations
        .contains(request.operation.name())
    {
        return Err(unavailable());
    }
    let actor = CommandActor {
        kind: "management_capability",
        user_id: None,
        source: "vendor_special_management_link",
    };
    let value = match request.operation {
        CapabilityOperation::OfferEdit => {
            let slot_id = request.slot_id.as_deref().ok_or((
                StatusCode::BAD_REQUEST,
                "Choose an available date to edit.".into(),
            ))?;
            let edit = request.edit.ok_or((
                StatusCode::BAD_REQUEST,
                "Add the updated offer details.".into(),
            ))?;
            let title = required(&edit.title, "title", 160)?;
            let summary = required(&edit.summary, "summary", 1_200)?;
            let slot = validate_slot_request(DateSlotDraftRequest {
                local_date: edit.local_date,
                timezone: edit.timezone,
                starts_at: edit.starts_at,
                ends_at: edit.ends_at,
                space_label: edit.space_label,
                session_label: edit.session_label,
                maximum_capacity: edit.maximum_capacity,
                minimum_spend_cents: edit.minimum_spend_cents,
                indicative_per_head_cents: edit.indicative_per_head_cents,
                inclusions: edit.inclusions,
                public_conditions: edit.public_conditions,
            })?;
            commands::edit_offer(
                &state,
                &authority.vendor_id,
                &authority.offer_id,
                slot_id,
                request.expected_revision,
                edit.slot_revision,
                title,
                summary,
                slot,
                &request.idempotency_key,
                actor,
            )
            .await?
        }
        CapabilityOperation::OfferPublish => {
            commands::publish_offer(
                &state,
                &authority.vendor_id,
                &authority.offer_id,
                request.expected_revision,
                &request.idempotency_key,
                actor,
            )
            .await?
        }
        CapabilityOperation::OfferPause
        | CapabilityOperation::OfferWithdraw
        | CapabilityOperation::OfferReconfirm => {
            let action = match request.operation {
                CapabilityOperation::OfferPause => OfferAction::Pause,
                CapabilityOperation::OfferWithdraw => OfferAction::Withdraw,
                CapabilityOperation::OfferReconfirm => OfferAction::Reconfirm,
                _ => unreachable!(),
            };
            commands::change_offer_state(
                &state,
                &authority.vendor_id,
                &authority.offer_id,
                request.expected_revision,
                action,
                &request.idempotency_key,
                actor,
            )
            .await?
        }
        operation => {
            let slot_id = request.slot_id.as_deref().ok_or((
                StatusCode::BAD_REQUEST,
                "Choose an available date for this action.".into(),
            ))?;
            let action = match operation {
                CapabilityOperation::SlotRecordEnquiry => VendorSlotAction::RecordEnquiry,
                CapabilityOperation::SlotCalendarOpen => VendorSlotAction::CalendarOpen,
                CapabilityOperation::SlotConfirmAvailability => {
                    VendorSlotAction::ConfirmAvailability
                }
                CapabilityOperation::SlotPlaceHold => VendorSlotAction::PlaceHold,
                CapabilityOperation::SlotMarkBooked => VendorSlotAction::MarkBooked,
                CapabilityOperation::SlotReopenCancelledBooking => {
                    VendorSlotAction::ReopenCancelledBooking
                }
                CapabilityOperation::SlotPause => VendorSlotAction::Pause,
                CapabilityOperation::SlotWithdraw => VendorSlotAction::Withdraw,
                CapabilityOperation::SlotReconfirm => VendorSlotAction::Reconfirm,
                CapabilityOperation::OfferEdit => unreachable!(),
                _ => unreachable!(),
            };
            let slot_request = SlotCommandRequest {
                vendor_slug: String::new(),
                idempotency_key: request.idempotency_key,
                expected_revision: request.expected_revision,
                action,
                hold_expires_at: request.hold_expires_at,
                confirmation_expires_at: request.confirmation_expires_at,
                reason: request.reason,
            };
            commands::change_slot_state(
                &state,
                &authority.vendor_id,
                &authority.offer_id,
                slot_id,
                &slot_request,
                actor,
            )
            .await?
        }
    };
    Ok(Json(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pepper() -> [u8; TOKEN_BYTES] {
        [7; TOKEN_BYTES]
    }

    #[test]
    fn management_secrets_have_full_entropy_and_keyed_digests() {
        let token = secret("wvs", [9; TOKEN_BYTES]);
        assert_eq!(
            URL_SAFE_NO_PAD
                .decode(token.trim_start_matches("wvs_"))
                .unwrap()
                .len(),
            32
        );
        assert_eq!(token_prefix(&token, "wvs").unwrap().len(), TOKEN_PREFIX_LEN);
        let digest = mac(&test_pepper(), &token).unwrap();
        assert_eq!(digest.len(), 64);
        assert!(!digest.contains(&token));
    }

    #[test]
    fn grant_operations_deny_unknown_or_empty_scope() {
        assert!(validated_operations(vec![]).is_err());
        assert!(validated_operations(vec!["admin_delete_vendor".into()]).is_err());
        assert_eq!(
            validated_operations(vec!["slot_pause".into(), "slot_pause".into()]).unwrap(),
            vec!["slot_pause"]
        );
    }

    #[test]
    fn malformed_or_wrongly_labelled_tokens_fail_closed() {
        assert!(token_prefix("wvs_short", "wvs").is_none());
        let session = secret("wvss", [3; TOKEN_BYTES]);
        assert!(token_prefix(&session, "wvs").is_none());
        assert!(token_prefix(&session, "wvss").is_some());
    }

    #[test]
    fn csrf_mac_check_rejects_forgery() {
        let expected = mac(&test_pepper(), "csrf-secret").unwrap();
        assert!(mac_matches(&test_pepper(), "csrf-secret", &expected));
        assert!(!mac_matches(&test_pepper(), "forged", &expected));
        assert!(!mac_matches(&test_pepper(), "csrf-secret", "not-hex"));
    }

    #[test]
    fn command_scope_cannot_be_supplied_by_the_link_holder() {
        let attempted = serde_json::json!({
            "operation":"offer_pause",
            "expected_revision":1,
            "idempotency_key":"attempted-scope-swap",
            "vendor_id":"another-vendor",
            "offer_id":"another-offer"
        });
        assert!(serde_json::from_value::<CapabilityCommandRequest>(attempted).is_err());
    }

    #[test]
    fn active_or_reopened_grants_work_only_before_expiry_or_revocation() {
        let now = Utc::now();
        assert!(grant_exchange_allowed(
            "active",
            None,
            now + ChronoDuration::minutes(1),
            now
        ));
        assert!(!grant_exchange_allowed(
            "active",
            None,
            now - ChronoDuration::seconds(1),
            now
        ));
        assert!(!grant_exchange_allowed(
            "active",
            Some(now),
            now + ChronoDuration::minutes(1),
            now
        ));
        assert!(grant_exchange_allowed(
            "exchanged",
            None,
            now + ChronoDuration::minutes(1),
            now
        ));
        assert!(!grant_exchange_allowed(
            "rotated",
            None,
            now + ChronoDuration::minutes(1),
            now
        ));
    }
}
