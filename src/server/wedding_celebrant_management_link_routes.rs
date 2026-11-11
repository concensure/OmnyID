//! Expiring, vendor-scoped links for managing celebrant consultation availability.
//!
//! These capabilities deliberately exclude callback requests, phone numbers,
//! profile publication and account access. An operator can issue one active link
//! per celebrant; rotation and revocation consume every associated session.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration as ChronoDuration, NaiveDate, NaiveTime, Utc};
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::Sha256;
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState, RateLimitPolicy,
    auth::{
        authenticated_rate_limit_key, authenticated_user, enforce_rate_limit, public_rate_limit_key,
    },
};
use crate::wedding_celebrant_consultation::live_session_end;

const PEPPER_ENV: &str = "OMNYID_WEDDING_VENDOR_SPECIALS_CAPABILITY_PEPPER";
const TOKEN_BYTES: usize = 32;
const TOKEN_PREFIX_LEN: usize = 16;
const MAX_GRANT_DAYS: i64 = 14;
const SESSION_MINUTES: i64 = 30;
const COOKIE_NAME: &str = "omnyid_wcc_session";
const UNAVAILABLE: &str = "This celebrant calendar link is unavailable.";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/admin/wedding/celebrant-management",
            get(admin_dashboard_http),
        )
        .route(
            "/admin/wedding/celebrant-management/links",
            post(create_link_http),
        )
        .route(
            "/admin/wedding/celebrant-management/links/{grant_id}/revoke",
            post(revoke_link_http),
        )
        .route(
            "/api/public/wedding/celebrants/manage/exchange",
            post(exchange_http),
        )
        .route(
            "/api/public/wedding/celebrants/manage/session",
            get(session_http),
        )
        .route(
            "/api/public/wedding/celebrants/manage/command",
            post(command_http),
        )
}

fn unavailable() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, UNAVAILABLE.into())
}

fn db_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(%error, "celebrant management link database operation failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Celebrant availability could not be updated just now.".into(),
    )
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn pepper() -> Option<Vec<u8>> {
    let value = crate::secret_manager::read_process_secret_trimmed(PEPPER_ENV)?;
    let bytes = URL_SAFE_NO_PAD.decode(value.trim()).ok()?;
    (bytes.len() >= TOKEN_BYTES).then_some(bytes)
}

fn mac(pepper: &[u8], value: &str) -> Option<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper).ok()?;
    mac.update(b"celebrant-calendar-v1\0");
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
    mac.update(b"celebrant-calendar-v1\0");
    mac.update(value.as_bytes());
    mac.verify_slice(&expected).is_ok()
}

fn fresh_secret(label: &str) -> String {
    let mut entropy = [0_u8; TOKEN_BYTES];
    rand::rng().fill_bytes(&mut entropy);
    format!("{label}_{}", URL_SAFE_NO_PAD.encode(entropy))
}

fn token_prefix(token: &str, label: &str) -> Option<String> {
    let token = token.trim();
    let encoded = token.strip_prefix(&format!("{label}_"))?;
    (URL_SAFE_NO_PAD.decode(encoded).ok()?.len() == TOKEN_BYTES && token.len() >= TOKEN_PREFIX_LEN)
        .then(|| token[..TOKEN_PREFIX_LEN].to_string())
}

fn management_base_url() -> String {
    let value = std::env::var("OMNYID_BASE_URL").unwrap_or_else(|_| "https://omnyid.com".into());
    let value = value.trim().trim_end_matches('/');
    if value.starts_with("https://")
        || value.starts_with("http://127.0.0.1")
        || value.starts_with("http://localhost")
    {
        value.to_string()
    } else {
        "https://omnyid.com".into()
    }
}

async fn operator(
    state: &AppState,
    headers: &HeaderMap,
    scope: &str,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    enforce_rate_limit(
        state,
        authenticated_rate_limit_key(scope, headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, headers).await?;
    if !super::cost_controls::operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access is required.".into()));
    }
    Ok(user)
}

async fn record_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    grant_id: Option<&str>,
    vendor_id: &str,
    kind: &str,
    dedupe: &str,
    metadata: Value,
) -> Result<(), (StatusCode, String)> {
    sqlx::query("INSERT INTO wedding_celebrant_management_events(event_id,grant_id,vendor_id,event_kind,dedupe_key,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_kind,dedupe_key) DO NOTHING")
        .bind(Ulid::new().to_string()).bind(grant_id).bind(vendor_id).bind(kind).bind(clean(dedupe,180)).bind(metadata)
        .execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

async fn admin_dashboard_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers, "celebrant-management-dashboard").await?;
    let rows = sqlx::query(
        r#"SELECT v.vendor_id,v.vendor_slug,v.vendor_name,v.service_area,v.claim_status,
                  p.register_status,p.register_checked_at,
                  COUNT(g.grant_id)::bigint generated_links,
                  COUNT(g.grant_id) FILTER (WHERE g.exchanged_at IS NOT NULL)::bigint opened_links,
                  MAX(g.exchanged_at) latest_opened_at,
                  MAX(g.grant_id) FILTER (WHERE g.status IN ('active','exchanged')) active_grant_id,
                  MAX(g.expires_at) FILTER (WHERE g.status IN ('active','exchanged')) active_link_expires_at
             FROM wedding_vendors v
             LEFT JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id
             LEFT JOIN wedding_celebrant_management_grants g ON g.vendor_id=v.vendor_id
            WHERE v.status='active' AND lower(v.category)='celebrant'
            GROUP BY v.vendor_id,v.vendor_slug,v.vendor_name,v.service_area,v.claim_status,p.register_status,p.register_checked_at
            ORDER BY v.vendor_name"#,
    )
    .fetch_all(&state.db.pool).await.map_err(db_error)?;
    Ok(Json(json!({"vendors":rows.into_iter().map(|row|json!({
        "vendor_id":row.get::<String,_>("vendor_id"),"vendor_slug":row.get::<String,_>("vendor_slug"),
        "vendor_name":row.get::<String,_>("vendor_name"),"service_area":row.get::<String,_>("service_area"),
        "claim_status":row.get::<String,_>("claim_status"),"register_status":row.get::<Option<String>,_>("register_status").unwrap_or_else(||"pending".into()),
        "register_checked_at":row.get::<Option<DateTime<Utc>>,_>("register_checked_at").map(|v|v.to_rfc3339()),
        "generated_links":row.get::<i64,_>("generated_links"),"opened_links":row.get::<i64,_>("opened_links"),
        "latest_opened_at":row.get::<Option<DateTime<Utc>>,_>("latest_opened_at").map(|v|v.to_rfc3339()),
        "active_grant_id":row.get::<Option<String>,_>("active_grant_id"),
        "active_link_expires_at":row.get::<Option<DateTime<Utc>>,_>("active_link_expires_at").map(|v|v.to_rfc3339())
    })).collect::<Vec<_>>() })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateLinkRequest {
    vendor_id: String,
    expires_in_days: Option<i64>,
}

async fn create_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers, "celebrant-management-link-create").await?;
    let days = request.expires_in_days.unwrap_or(14);
    if !(1..=MAX_GRANT_DAYS).contains(&days) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Expiry must be between 1 and 14 days.".into(),
        ));
    }
    let pepper = pepper().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Secure vendor links are not configured.".into(),
    ))?;
    let vendor_id = clean(&request.vendor_id, 160);
    let vendor = sqlx::query("SELECT vendor_slug,vendor_name FROM wedding_vendors WHERE vendor_id=$1 AND status='active' AND lower(category)='celebrant'")
        .bind(&vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?.ok_or((StatusCode::NOT_FOUND,"Celebrant listing not found.".into()))?;
    let token = fresh_secret("wcc");
    let prefix = token_prefix(&token, "wcc").ok_or_else(unavailable)?;
    let digest = mac(&pepper, &token).ok_or_else(unavailable)?;
    let grant_id = format!("wcc_grant_{}", Ulid::new());
    let expires_at = Utc::now() + ChronoDuration::days(days);
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    let generation = sqlx::query_scalar::<_, i64>("SELECT COALESCE(MAX(generation),0)+1 FROM wedding_celebrant_management_grants WHERE vendor_id=$1")
        .bind(&vendor_id).fetch_one(&mut *tx).await.map_err(db_error)?;
    let rotated = sqlx::query_scalar::<_, String>("UPDATE wedding_celebrant_management_grants SET status='rotated',revoked_at=NOW() WHERE vendor_id=$1 AND status IN ('active','exchanged') RETURNING grant_id")
        .bind(&vendor_id).fetch_all(&mut *tx).await.map_err(db_error)?;
    if !rotated.is_empty() {
        sqlx::query("UPDATE wedding_celebrant_management_sessions SET consumed_at=COALESCE(consumed_at,NOW()) WHERE grant_id=ANY($1)")
            .bind(&rotated).execute(&mut *tx).await.map_err(db_error)?;
    }
    sqlx::query("INSERT INTO wedding_celebrant_management_grants(grant_id,vendor_id,token_prefix,token_digest,generation,expires_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)")
        .bind(&grant_id).bind(&vendor_id).bind(prefix).bind(digest).bind(generation).bind(expires_at).bind(&user.id)
        .execute(&mut *tx).await.map_err(db_error)?;
    record_event(
        &mut tx,
        Some(&grant_id),
        &vendor_id,
        "link_created",
        &format!("link-{grant_id}"),
        json!({"generation":generation,"rotated":rotated.len()}),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(json!({
        "grant_id":grant_id,"vendor_slug":vendor.get::<String,_>("vendor_slug"),"vendor_name":vendor.get::<String,_>("vendor_name"),
        "management_url":format!("{}/workspace/vendor.html#celebrant_management={token}",management_base_url()),
        "expires_at":expires_at.to_rfc3339(),"generation":generation,"rotated_previous_links":!rotated.is_empty(),
        "notice":"This private link is shown once and manages only this celebrant's consultation availability."
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RevokeRequest {
    vendor_id: String,
}

async fn revoke_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
    Json(request): Json<RevokeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers, "celebrant-management-link-revoke").await?;
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    let vendor_id = clean(&request.vendor_id, 160);
    let changed=sqlx::query("UPDATE wedding_celebrant_management_grants SET status='revoked',revoked_at=NOW() WHERE grant_id=$1 AND vendor_id=$2 AND status IN ('active','exchanged')")
        .bind(clean(&grant_id,160)).bind(&vendor_id).execute(&mut *tx).await.map_err(db_error)?;
    if changed.rows_affected() != 1 {
        return Err((StatusCode::NOT_FOUND, "Active link not found.".into()));
    }
    sqlx::query("UPDATE wedding_celebrant_management_sessions SET consumed_at=COALESCE(consumed_at,NOW()) WHERE grant_id=$1")
        .bind(&grant_id).execute(&mut *tx).await.map_err(db_error)?;
    record_event(
        &mut tx,
        Some(&grant_id),
        &vendor_id,
        "link_revoked",
        &format!("revoke-{grant_id}"),
        json!({}),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(json!({"status":"revoked"})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExchangeRequest {
    token: String,
}

async fn exchange_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ExchangeRequest>,
) -> Result<Response, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("celebrant-management-exchange", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let pepper = pepper().ok_or_else(unavailable)?;
    let token = request.token.trim();
    let prefix = token_prefix(token, "wcc").ok_or_else(unavailable)?;
    let digest = mac(&pepper, token).ok_or_else(unavailable)?;
    let session_secret = fresh_secret("wccs");
    let csrf_secret = fresh_secret("wccc");
    let session_digest = mac(&pepper, &session_secret).ok_or_else(unavailable)?;
    let csrf_digest = mac(&pepper, &csrf_secret).ok_or_else(unavailable)?;
    let session_id = format!("wcc_session_{}", Ulid::new());
    let mut tx = state.db.pool.begin().await.map_err(|_| unavailable())?;
    let grant=sqlx::query("SELECT grant_id,vendor_id,generation,status,revoked_at,expires_at FROM wedding_celebrant_management_grants WHERE token_prefix=$1 AND token_digest=$2 FOR UPDATE")
        .bind(prefix).bind(digest).fetch_optional(&mut *tx).await.map_err(|_|unavailable())?.ok_or_else(unavailable)?;
    let status = grant.get::<String, _>("status");
    let revoked = grant.get::<Option<DateTime<Utc>>, _>("revoked_at");
    let grant_expiry = grant.get::<DateTime<Utc>, _>("expires_at");
    if !matches!(status.as_str(), "active" | "exchanged")
        || revoked.is_some()
        || grant_expiry <= Utc::now()
    {
        return Err(unavailable());
    }
    let grant_id = grant.get::<String, _>("grant_id");
    let vendor_id = grant.get::<String, _>("vendor_id");
    let session_expiry = (Utc::now() + ChronoDuration::minutes(SESSION_MINUTES)).min(grant_expiry);
    sqlx::query("UPDATE wedding_celebrant_management_grants SET status='exchanged',exchanged_at=COALESCE(exchanged_at,NOW()) WHERE grant_id=$1")
        .bind(&grant_id).execute(&mut *tx).await.map_err(|_|unavailable())?;
    sqlx::query("INSERT INTO wedding_celebrant_management_sessions(session_id,grant_id,session_token_digest,csrf_token_digest,expires_at) VALUES($1,$2,$3,$4,$5)")
        .bind(&session_id).bind(&grant_id).bind(session_digest).bind(csrf_digest).bind(session_expiry).execute(&mut *tx).await.map_err(|_|unavailable())?;
    record_event(
        &mut tx,
        Some(&grant_id),
        &vendor_id,
        "link_exchanged",
        &format!("exchange-{session_id}"),
        json!({"generation":grant.get::<i64,_>("generation")}),
    )
    .await?;
    tx.commit().await.map_err(|_| unavailable())?;
    let cookie = format!(
        "{COOKIE_NAME}={session_secret}; Path=/api/public/wedding/celebrants/manage; Max-Age={}; HttpOnly; Secure; SameSite=Strict",
        SESSION_MINUTES * 60
    );
    let mut response=Json(json!({"csrf_token":csrf_secret,"expires_at":session_expiry.to_rfc3339(),"account_access":false})).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| unavailable())?,
    );
    Ok(response)
}

struct Authority {
    grant_id: String,
    vendor_id: String,
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
) -> Result<Authority, (StatusCode, String)> {
    let pepper = pepper().ok_or_else(unavailable)?;
    let secret = cookie(headers).ok_or_else(unavailable)?;
    token_prefix(secret, "wccs").ok_or_else(unavailable)?;
    let digest = mac(&pepper, secret).ok_or_else(unavailable)?;
    let row=sqlx::query("SELECT g.grant_id,g.vendor_id,s.csrf_token_digest FROM wedding_celebrant_management_sessions s JOIN wedding_celebrant_management_grants g ON g.grant_id=s.grant_id JOIN wedding_vendors v ON v.vendor_id=g.vendor_id AND v.status='active' AND lower(v.category)='celebrant' WHERE s.session_token_digest=$1 AND s.consumed_at IS NULL AND s.expires_at>NOW() AND g.status='exchanged' AND g.revoked_at IS NULL AND g.expires_at>NOW()")
        .bind(digest).fetch_optional(&state.db.pool).await.map_err(|_|unavailable())?.ok_or_else(unavailable)?;
    if require_csrf {
        let csrf = headers
            .get("x-csrf-token")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(unavailable)?;
        if !mac_matches(&pepper, csrf, &row.get::<String, _>("csrf_token_digest")) {
            return Err(unavailable());
        }
    }
    Ok(Authority {
        grant_id: row.get("grant_id"),
        vendor_id: row.get("vendor_id"),
    })
}

async fn dashboard(state: &AppState, vendor_id: &str) -> Result<Value, (StatusCode, String)> {
    let vendor=sqlx::query("SELECT vendor_slug,vendor_name,service_area FROM wedding_vendors WHERE vendor_id=$1 AND status='active' AND lower(category)='celebrant'")
        .bind(vendor_id).fetch_one(&state.db.pool).await.map_err(db_error)?;
    let profile=sqlx::query("SELECT register_status,register_checked_at,(business_phone_ciphertext IS NOT NULL) phone_configured FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1")
        .bind(vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?;
    let windows=sqlx::query("SELECT window_id,window_kind,weekday,local_date,starts_at,ends_at,revision FROM wedding_celebrant_consultation_windows WHERE vendor_id=$1 AND enabled ORDER BY COALESCE(local_date,'9999-12-31'),weekday,starts_at")
        .bind(vendor_id).fetch_all(&state.db.pool).await.map_err(db_error)?;
    let live=sqlx::query("SELECT session_id,expires_at,call_cap,paused_at,revision FROM wedding_celebrant_live_sessions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1")
        .bind(vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?;
    Ok(
        json!({"vendor":{"slug":vendor.get::<String,_>("vendor_slug"),"name":vendor.get::<String,_>("vendor_name"),"service_area":vendor.get::<String,_>("service_area")},
      "profile":profile.map(|r|json!({"register_status":r.get::<String,_>("register_status"),"register_checked_at":r.get::<Option<DateTime<Utc>>,_>("register_checked_at").map(|v|v.to_rfc3339()),"phone_configured":r.get::<bool,_>("phone_configured")})),
      "windows":windows.into_iter().map(|r|json!({"window_id":r.get::<String,_>("window_id"),"kind":r.get::<String,_>("window_kind"),"weekday":r.get::<Option<i16>,_>("weekday"),"local_date":r.get::<Option<NaiveDate>,_>("local_date").map(|v|v.to_string()),"starts_at":r.get::<NaiveTime,_>("starts_at").format("%H:%M").to_string(),"ends_at":r.get::<NaiveTime,_>("ends_at").format("%H:%M").to_string(),"revision":r.get::<i64,_>("revision")})).collect::<Vec<_>>(),
      "live":live.map(|r|json!({"session_id":r.get::<String,_>("session_id"),"expires_at":r.get::<DateTime<Utc>,_>("expires_at").to_rfc3339(),"call_cap":r.get::<i32,_>("call_cap"),"paused":r.get::<Option<DateTime<Utc>>,_>("paused_at").is_some(),"revision":r.get::<i64,_>("revision")}))}),
    )
}

async fn session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("celebrant-management-session", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let authority = session_authority(&state, &headers, false).await?;
    dashboard(&state, &authority.vendor_id).await.map(Json)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CommandRequest {
    operation: String,
    idempotency_key: String,
    window_id: Option<String>,
    kind: Option<String>,
    weekday: Option<i16>,
    local_date: Option<String>,
    starts_at: Option<String>,
    ends_at: Option<String>,
    duration_minutes: Option<i64>,
    call_cap: Option<i32>,
}

async fn command_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("celebrant-management-command", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let authority = session_authority(&state, &headers, true).await?;
    let dedupe = clean(&request.idempotency_key, 180);
    if dedupe.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "A stable action key is required.".into(),
        ));
    }
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    if sqlx::query(
        "SELECT 1 FROM wedding_celebrant_management_events WHERE event_kind=$1 AND dedupe_key=$2",
    )
    .bind(match request.operation.as_str() {
        "window_add" => "window_added",
        "window_remove" => "window_removed",
        "live_start" => "live_started",
        "live_pause" => "live_paused",
        _ => "",
    })
    .bind(&dedupe)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .is_some()
    {
        tx.commit().await.map_err(db_error)?;
        return Ok(Json(json!({"replayed":true})));
    }
    match request.operation.as_str() {
        "window_add" => {
            let kind = request
                .kind
                .as_deref()
                .filter(|v| matches!(*v, "recurring" | "exception_open" | "exception_closed"))
                .ok_or((
                    StatusCode::BAD_REQUEST,
                    "Choose recurring, open-date or unavailable-date availability.".into(),
                ))?;
            let start =
                NaiveTime::parse_from_str(request.starts_at.as_deref().unwrap_or(""), "%H:%M")
                    .map_err(|_| {
                        (
                            StatusCode::BAD_REQUEST,
                            "Use HH:MM for the start time.".into(),
                        )
                    })?;
            let end = NaiveTime::parse_from_str(request.ends_at.as_deref().unwrap_or(""), "%H:%M")
                .map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "Use HH:MM for the end time.".into(),
                    )
                })?;
            if start >= end {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "End time must be later than start time.".into(),
                ));
            }
            let date = request
                .local_date
                .as_deref()
                .map(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d"))
                .transpose()
                .map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "Use YYYY-MM-DD for the date.".into(),
                    )
                })?;
            if (kind == "recurring" && (request.weekday.is_none() || date.is_some()))
                || (kind != "recurring" && (request.weekday.is_some() || date.is_none()))
            {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Choose either a recurring weekday or one specific date.".into(),
                ));
            }
            if request.weekday.is_some_and(|v| !(1..=7).contains(&v)) {
                return Err((StatusCode::BAD_REQUEST, "Weekday must be 1 to 7.".into()));
            }
            let window_id = Ulid::new().to_string();
            sqlx::query("INSERT INTO wedding_celebrant_consultation_windows(window_id,vendor_id,window_kind,weekday,local_date,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7)")
            .bind(&window_id).bind(&authority.vendor_id).bind(kind).bind(request.weekday).bind(date).bind(start).bind(end).execute(&mut *tx).await.map_err(db_error)?;
            record_event(
                &mut tx,
                Some(&authority.grant_id),
                &authority.vendor_id,
                "window_added",
                &dedupe,
                json!({"window_id":window_id,"kind":kind}),
            )
            .await?;
        }
        "window_remove" => {
            let window_id = clean(request.window_id.as_deref().unwrap_or(""), 40);
            let changed=sqlx::query("UPDATE wedding_celebrant_consultation_windows SET enabled=FALSE,revision=revision+1,updated_at=NOW() WHERE window_id=$1 AND vendor_id=$2 AND enabled")
            .bind(&window_id).bind(&authority.vendor_id).execute(&mut *tx).await.map_err(db_error)?;
            if changed.rows_affected() != 1 {
                return Err((
                    StatusCode::NOT_FOUND,
                    "Availability window not found.".into(),
                ));
            }
            record_event(
                &mut tx,
                Some(&authority.grant_id),
                &authority.vendor_id,
                "window_removed",
                &dedupe,
                json!({"window_id":window_id}),
            )
            .await?;
        }
        "live_start" => {
            let profile=sqlx::query("SELECT register_status,(business_phone_ciphertext IS NOT NULL) phone_configured FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1")
            .bind(&authority.vendor_id).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"Save the claimed profile's phone settings first.".into()))?;
            if profile.get::<String, _>("register_status") != "verified"
                || !profile.get::<bool, _>("phone_configured")
            {
                return Err((StatusCode::CONFLICT,"Official register verification and a nominated business phone are required before going live.".into()));
            }
            let cap = request.call_cap.unwrap_or(3);
            if !(1..=20).contains(&cap) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Call cap must be between 1 and 20.".into(),
                ));
            }
            sqlx::query("UPDATE wedding_celebrant_live_sessions SET paused_at=NOW(),revision=revision+1 WHERE vendor_id=$1 AND paused_at IS NULL").bind(&authority.vendor_id).execute(&mut *tx).await.map_err(db_error)?;
            let session_id = Ulid::new().to_string();
            let expires = live_session_end(Utc::now(), request.duration_minutes.unwrap_or(60));
            sqlx::query("INSERT INTO wedding_celebrant_live_sessions(session_id,vendor_id,expires_at,call_cap) VALUES($1,$2,$3,$4)").bind(&session_id).bind(&authority.vendor_id).bind(expires).bind(cap).execute(&mut *tx).await.map_err(db_error)?;
            record_event(
                &mut tx,
                Some(&authority.grant_id),
                &authority.vendor_id,
                "live_started",
                &dedupe,
                json!({"session_ref":session_id,"call_cap":cap,"expires_at":expires}),
            )
            .await?;
        }
        "live_pause" => {
            sqlx::query("UPDATE wedding_celebrant_live_sessions SET paused_at=NOW(),revision=revision+1 WHERE vendor_id=$1 AND paused_at IS NULL").bind(&authority.vendor_id).execute(&mut *tx).await.map_err(db_error)?;
            record_event(
                &mut tx,
                Some(&authority.grant_id),
                &authority.vendor_id,
                "live_paused",
                &dedupe,
                json!({}),
            )
            .await?;
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "Unsupported calendar action.".into(),
            ));
        }
    }
    tx.commit().await.map_err(db_error)?;
    Ok(Json(json!({"saved":true})))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tokens_are_protocol_scoped_and_high_entropy() {
        let token = fresh_secret("wcc");
        assert!(token.starts_with("wcc_"));
        assert!(token.len() > 40);
        assert_ne!(token, fresh_secret("wcc"));
        assert!(token_prefix(&token, "wcc").is_some());
        assert!(token_prefix(&token, "wvs").is_none());
    }
}
