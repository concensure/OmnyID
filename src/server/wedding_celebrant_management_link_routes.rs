//! Expiring, vendor-scoped links for managing celebrant consultation availability.
//!
//! These capabilities deliberately exclude callback requests, phone numbers,
//! profile publication and account access. An operator can issue independent links
//! per vendor. New links preserve prior grants; explicit revocation consumes sessions.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, Query, Request, State},
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

mod admin;
use admin::*;

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
            "/admin/wedding/vendor-calendar/vendors",
            get(admin::calendar_vendors_http),
        )
        .route(
            "/admin/wedding/celebrant-management/links",
            post(create_link_http),
        )
        .route(
            "/admin/wedding/celebrant-management/links/batch",
            post(create_links_batch_http),
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
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
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

async fn authenticated_body<T: for<'de> Deserialize<'de>>(
    request: Request,
) -> Result<T, (StatusCode, String)> {
    let bytes = axum::body::to_bytes(request.into_body(), 32 * 1024)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid request body.".into()))?;
    serde_json::from_slice(&bytes).map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Invalid request body.".into(),
        )
    })
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
    let scoped_vendor = sqlx::query_scalar::<_,String>("SELECT vendor_id FROM wedding_celebrant_management_grants WHERE token_prefix=$1 AND token_digest=$2")
        .bind(&prefix).bind(&digest).fetch_optional(&mut *tx).await.map_err(|_|unavailable())?.ok_or_else(unavailable)?;
    let eligible = sqlx::query("SELECT v.vendor_id FROM wedding_vendors v WHERE v.vendor_id=$1 AND v.status='active' AND NOT EXISTS(SELECT 1 FROM wedding_celebrant_outreach o WHERE o.vendor_id=v.vendor_id AND o.status='opted_out') FOR SHARE")
        .bind(&scoped_vendor).fetch_optional(&mut *tx).await.map_err(|_|unavailable())?;
    if eligible.is_none() {
        return Err(unavailable());
    }
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
    let renewed_expiry = Utc::now() + ChronoDuration::days(MAX_GRANT_DAYS);
    let session_expiry = Utc::now() + ChronoDuration::minutes(SESSION_MINUTES);
    sqlx::query("UPDATE wedding_celebrant_management_grants SET status='exchanged',exchanged_at=COALESCE(exchanged_at,NOW()),expires_at=$2 WHERE grant_id=$1")
        .bind(&grant_id).bind(renewed_expiry).execute(&mut *tx).await.map_err(|_|unavailable())?;
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
    session_digest: String,
    grant_id: String,
    vendor_id: String,
    created_by_user_id: String,
    capability_scopes: Vec<String>,
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
    let row=sqlx::query("SELECT g.grant_id,g.vendor_id,g.created_by_user_id,g.capability_scopes,s.csrf_token_digest FROM wedding_celebrant_management_sessions s JOIN wedding_celebrant_management_grants g ON g.grant_id=s.grant_id JOIN wedding_vendors v ON v.vendor_id=g.vendor_id AND v.status='active' WHERE s.session_token_digest=$1 AND s.consumed_at IS NULL AND s.expires_at>NOW() AND g.status='exchanged' AND g.revoked_at IS NULL AND g.expires_at>NOW()")
        .bind(&digest).fetch_optional(&state.db.pool).await.map_err(|_|unavailable())?.ok_or_else(unavailable)?;
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
        session_digest: digest,
        grant_id: row.get("grant_id"),
        vendor_id: row.get("vendor_id"),
        created_by_user_id: row.get("created_by_user_id"),
        capability_scopes: row.get("capability_scopes"),
    })
}

async fn ensure_wedding_date_offer(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    vendor_id: &str,
    actor_user_id: &str,
) -> Result<String, (StatusCode, String)> {
    if let Some(offer_id) = sqlx::query_scalar::<_, String>(
        "SELECT offer_id FROM wedding_vendor_special_offers WHERE vendor_id=$1 AND creation_idempotency_key='celebrant-unified-calendar-v1' FOR UPDATE",
    )
    .bind(vendor_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    {
        return Ok(offer_id);
    }
    let offer_id = Ulid::new().to_string();
    let valid_from = Utc::now().date_naive();
    let valid_until = valid_from + ChronoDuration::days(730);
    sqlx::query(
        r#"INSERT INTO wedding_vendor_special_offers
           (offer_id,vendor_id,creation_idempotency_key,category,title,summary,offer_type,
            publication_state,approved_by_user_id,approved_at,approved_revision,created_by_user_id,
            valid_from,valid_until)
           VALUES($1,$2,'celebrant-unified-calendar-v1',(SELECT category FROM wedding_vendors WHERE vendor_id=$2),'Wedding-date availability',
                  'Vendor-maintained wedding-date availability. Dates remain indicative until the vendor confirms the couple-specific enquiry.',
                  'incentive_only','active',$3,NOW(),1,$3,$4,$5)"#,
    )
    .bind(&offer_id)
    .bind(vendor_id)
    .bind(actor_user_id)
    .bind(valid_from)
    .bind(valid_until)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    for (kind, dedupe) in [
        ("created", "unified-calendar-created"),
        ("approved", "unified-calendar-approved"),
        ("published", "unified-calendar-published"),
    ] {
        sqlx::query("INSERT INTO wedding_vendor_special_offer_events(event_id,vendor_id,offer_id,event_kind,actor_kind,actor_user_id,source_ref,dedupe_key,metadata) VALUES($1,$2,$3,$4,'operator',$5,'celebrant_management_link',$6,$7)")
            .bind(Ulid::new().to_string()).bind(vendor_id).bind(&offer_id).bind(kind)
            .bind(actor_user_id).bind(dedupe).bind(json!({"event_version":"wedding_vendor_special_offer_event.v1","unified_management_link":true}))
            .execute(&mut **tx).await.map_err(db_error)?;
    }
    Ok(offer_id)
}

async fn dashboard(
    state: &AppState,
    vendor_id: &str,
    grant_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let vendor=sqlx::query("SELECT vendor_slug,vendor_name,service_area FROM wedding_vendors WHERE vendor_id=$1 AND status='active'")
        .bind(vendor_id).fetch_one(&state.db.pool).await.map_err(db_error)?;
    let profile=sqlx::query("SELECT register_status,register_checked_at,(business_phone_ciphertext IS NOT NULL) phone_configured,participation_status,participation_updated_at,callback_phone_confirmed FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1")
        .bind(vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?;
    let windows=sqlx::query("SELECT window_id,window_kind,weekday,local_date,starts_at,ends_at,revision FROM wedding_celebrant_consultation_windows WHERE vendor_id=$1 AND enabled ORDER BY COALESCE(local_date,'9999-12-31'),weekday,starts_at")
        .bind(vendor_id).fetch_all(&state.db.pool).await.map_err(db_error)?;
    let live=sqlx::query("SELECT session_id,expires_at,call_cap,paused_at,revision FROM wedding_celebrant_live_sessions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1")
        .bind(vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?;
    let capability_scopes = sqlx::query_scalar::<_, Vec<String>>(
        "SELECT capability_scopes FROM wedding_celebrant_management_grants WHERE grant_id=$1 AND vendor_id=$2",
    )
    .bind(grant_id)
    .bind(vendor_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(db_error)?;
    let date_offer = sqlx::query_scalar::<_, String>(
        "SELECT offer_id FROM wedding_vendor_special_offers WHERE vendor_id=$1 AND creation_idempotency_key='celebrant-unified-calendar-v1' ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(vendor_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(db_error)?;
    let date_slots = if let Some(offer_id) = date_offer.as_deref() {
        sqlx::query("SELECT slot_id,local_date,space_label,state,hold_expires_at,last_confirmed_at,confirmation_expires_at,revision FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND vendor_id=$2 AND state<>'withdrawn' ORDER BY local_date")
            .bind(offer_id).bind(vendor_id).fetch_all(&state.db.pool).await.map_err(db_error)?
    } else {
        Vec::new()
    };
    let request_summary = sqlx::query(
        r#"SELECT COUNT(*)::bigint AS total,
                  COUNT(*) FILTER (WHERE status IN ('waiting_acceptance','scheduled'))::bigint AS awaiting_approval,
                  COUNT(*) FILTER (WHERE status='accepted')::bigint AS accepted
             FROM wedding_celebrant_callback_requests
            WHERE selected_vendor_id=$1"#,
    )
    .bind(vendor_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(db_error)?;
    let wedding_date_scope = capability_scopes
        .iter()
        .any(|scope| scope == "wedding_date_availability");
    let mut payload = json!({"vendor":{"slug":vendor.get::<String,_>("vendor_slug"),"name":vendor.get::<String,_>("vendor_name"),"service_area":vendor.get::<String,_>("service_area")},
      "profile":profile.map(|r|json!({"register_status":r.get::<String,_>("register_status"),"register_checked_at":r.get::<Option<DateTime<Utc>>,_>("register_checked_at").map(|v|v.to_rfc3339()),"phone_configured":r.get::<bool,_>("phone_configured"),"participation_status":r.get::<String,_>("participation_status"),"participation_updated_at":r.get::<Option<DateTime<Utc>>,_>("participation_updated_at").map(|v|v.to_rfc3339()),"callback_phone_confirmed":r.get::<bool,_>("callback_phone_confirmed")})),
      "capabilities":{
        "granted":capability_scopes,
        "consultation_availability":capability_scopes.iter().any(|scope|scope=="consultation_availability"),
        "wedding_date_availability":wedding_date_scope,
        "separate_wedding_date_calendar":true,
        "notice":"This link opens two separate, vendor-scoped calendars: wedding-date evidence and ten-minute consultation hours. One never proves the other."
      },
      "request_summary":{
        "total":request_summary.get::<i64,_>("total"),
        "awaiting_approval":request_summary.get::<i64,_>("awaiting_approval"),
        "accepted":request_summary.get::<i64,_>("accepted"),
        "privacy_notice":"This link shows counts only. Sign in to the claimed vendor account to see and act on request details."
      },
      "date_slots":date_slots.into_iter().map(|r|json!({"slot_id":r.get::<String,_>("slot_id"),"local_date":r.get::<NaiveDate,_>("local_date").to_string(),"space_label":r.get::<String,_>("space_label"),"state":r.get::<String,_>("state"),"hold_expires_at":r.get::<Option<DateTime<Utc>>,_>("hold_expires_at").map(|v|v.to_rfc3339()),"last_confirmed_at":r.get::<DateTime<Utc>,_>("last_confirmed_at").to_rfc3339(),"confirmation_expires_at":r.get::<DateTime<Utc>,_>("confirmation_expires_at").to_rfc3339(),"revision":r.get::<i64,_>("revision")})).collect::<Vec<_>>(),
      "windows":windows.into_iter().map(|r|json!({"window_id":r.get::<String,_>("window_id"),"kind":r.get::<String,_>("window_kind"),"weekday":r.get::<Option<i16>,_>("weekday"),"local_date":r.get::<Option<NaiveDate>,_>("local_date").map(|v|v.to_string()),"starts_at":r.get::<NaiveTime,_>("starts_at").format("%H:%M").to_string(),"ends_at":r.get::<NaiveTime,_>("ends_at").format("%H:%M").to_string(),"revision":r.get::<i64,_>("revision")})).collect::<Vec<_>>(),
      "live":live.map(|r|json!({"session_id":r.get::<String,_>("session_id"),"expires_at":r.get::<DateTime<Utc>,_>("expires_at").to_rfc3339(),"call_cap":r.get::<i32,_>("call_cap"),"paused":r.get::<Option<DateTime<Utc>>,_>("paused_at").is_some(),"revision":r.get::<i64,_>("revision")}))});
    if !capability_scopes
        .iter()
        .any(|scope| scope == "consultation_availability")
    {
        payload["profile"] = Value::Null;
        payload["windows"] = json!([]);
        payload["live"] = Value::Null;
        payload["request_summary"] = json!({"total":0,"awaiting_approval":0,"accepted":0,"privacy_notice":"Consultation access is not included."});
        payload["capabilities"]["notice"] =
            json!("This link controls only this vendor's wedding-date availability.");
    }
    Ok(payload)
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
    dashboard(&state, &authority.vendor_id, &authority.grant_id)
        .await
        .map(Json)
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
    participation_status: Option<String>,
    callback_phone_confirmed: Option<bool>,
    date_state: Option<String>,
    expected_revision: Option<i64>,
    space_label: Option<String>,
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
    let date_operation = matches!(
        request.operation.as_str(),
        "date_slot_upsert" | "date_slot_remove"
    );
    let required_scope = if date_operation {
        "wedding_date_availability"
    } else {
        "consultation_availability"
    };
    if !authority
        .capability_scopes
        .iter()
        .any(|scope| scope == required_scope)
    {
        return Err((
            StatusCode::FORBIDDEN,
            "This link does not include that calendar permission.".into(),
        ));
    }
    let dedupe = clean(&request.idempotency_key, 180);
    if dedupe.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "A stable action key is required.".into(),
        ));
    }
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    // All vendor mutations and opt-outs use vendor -> grant ordering. This
    // also serializes the first date-calendar creation across independent links.
    let vendor = sqlx::query(
        "SELECT vendor_id FROM wedding_vendors WHERE vendor_id=$1 AND status='active' FOR UPDATE",
    )
    .bind(&authority.vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    if vendor.is_none() {
        return Err(unavailable());
    }
    let valid = sqlx::query("SELECT g.grant_id FROM wedding_celebrant_management_grants g JOIN wedding_vendors v ON v.vendor_id=g.vendor_id WHERE g.grant_id=$1 AND g.vendor_id=$2 AND g.status='exchanged' AND g.revoked_at IS NULL AND g.expires_at>NOW() AND v.status='active' AND EXISTS(SELECT 1 FROM wedding_celebrant_management_sessions s WHERE s.grant_id=g.grant_id AND s.session_token_digest=$4 AND s.consumed_at IS NULL AND s.expires_at>NOW()) AND $3=ANY(g.capability_scopes) AND ($3<>'consultation_availability' OR lower(trim(v.category))='celebrant') AND NOT EXISTS(SELECT 1 FROM wedding_celebrant_outreach o WHERE o.vendor_id=v.vendor_id AND o.status='opted_out') FOR UPDATE OF g")
        .bind(&authority.grant_id).bind(&authority.vendor_id).bind(required_scope).bind(&authority.session_digest)
        .fetch_optional(&mut *tx).await.map_err(db_error)?;
    if valid.is_none() {
        return Err(unavailable());
    }
    if sqlx::query(
        "SELECT 1 FROM wedding_celebrant_management_events WHERE event_kind=$1 AND dedupe_key=$2",
    )
    .bind(match request.operation.as_str() {
        "window_add" => "window_added",
        "window_remove" => "window_removed",
        "live_start" => "live_started",
        "live_pause" => "live_paused",
        "participation_update" => "participation_updated",
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
        "date_slot_upsert" => {
            let date =
                NaiveDate::parse_from_str(request.local_date.as_deref().unwrap_or(""), "%Y-%m-%d")
                    .map_err(|_| {
                        (
                            StatusCode::BAD_REQUEST,
                            "Use YYYY-MM-DD for the wedding date.".into(),
                        )
                    })?;
            if date < Utc::now().date_naive() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Choose today or a future wedding date.".into(),
                ));
            }
            let state_value = request
                .date_state
                .as_deref()
                .filter(|value| {
                    matches!(
                        *value,
                        "available" | "provisional_hold" | "booked" | "paused"
                    )
                })
                .ok_or((
                    StatusCode::BAD_REQUEST,
                    "Choose calendar open, temporary hold, confirmed booking or unavailable."
                        .into(),
                ))?;
            let offer_id = ensure_wedding_date_offer(
                &mut tx,
                &authority.vendor_id,
                &authority.created_by_user_id,
            )
            .await?;
            let event_kind = match state_value {
                "provisional_hold" => "hold_created",
                "booked" => "booked",
                "paused" => "paused",
                _ => "reconfirmed",
            };
            if sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM wedding_vendor_special_offer_events WHERE offer_id=$1 AND event_kind=$2 AND dedupe_key=$3)")
                .bind(&offer_id).bind(event_kind).bind(&dedupe).fetch_one(&mut *tx).await.map_err(db_error)? {
                tx.commit().await.map_err(db_error)?;
                return Ok(Json(json!({"replayed":true})));
            }
            let space_label = clean(request.space_label.as_deref().unwrap_or(""), 160);
            let existing = sqlx::query("SELECT slot_id,revision FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND vendor_id=$2 AND local_date=$3 AND space_label=$4 AND session_label='' FOR UPDATE")
                .bind(&offer_id).bind(&authority.vendor_id).bind(date).bind(&space_label).fetch_optional(&mut *tx).await.map_err(db_error)?;
            let hold_expires =
                (state_value == "provisional_hold").then(|| Utc::now() + ChronoDuration::hours(48));
            let confirmation_expires = Utc::now() + ChronoDuration::days(90);
            let slot_id = if let Some(row) = existing {
                let revision = row.get::<i64, _>("revision");
                if request
                    .expected_revision
                    .is_some_and(|expected| expected != revision)
                {
                    return Err((
                        StatusCode::CONFLICT,
                        "This date changed. Refresh before updating it.".into(),
                    ));
                }
                let slot_id = row.get::<String, _>("slot_id");
                sqlx::query("UPDATE wedding_vendor_special_offer_slots SET state=$1,hold_expires_at=$2,last_confirmed_at=NOW(),confirmation_expires_at=$3,revision=revision+1,updated_at=NOW(),source_ref=$4 WHERE slot_id=$5 AND vendor_id=$6")
                    .bind(state_value).bind(hold_expires).bind(confirmation_expires).bind(format!("celebrant_management:{}",authority.grant_id)).bind(&slot_id).bind(&authority.vendor_id)
                    .execute(&mut *tx).await.map_err(db_error)?;
                slot_id
            } else {
                let slot_id = Ulid::new().to_string();
                sqlx::query("INSERT INTO wedding_vendor_special_offer_slots(slot_id,offer_id,vendor_id,local_date,timezone,space_label,session_label,state,hold_expires_at,last_confirmed_at,confirmation_expires_at,source_ref) VALUES($1,$2,$3,$4,'Australia/Sydney',$5,'',$6,$7,NOW(),$8,$9)")
                    .bind(&slot_id).bind(&offer_id).bind(&authority.vendor_id).bind(date).bind(&space_label).bind(state_value).bind(hold_expires).bind(confirmation_expires).bind(format!("celebrant_management:{}",authority.grant_id))
                    .execute(&mut *tx).await.map_err(db_error)?;
                slot_id
            };
            sqlx::query("INSERT INTO wedding_vendor_special_offer_events(event_id,vendor_id,offer_id,slot_id,event_kind,actor_kind,source_ref,dedupe_key,metadata) VALUES($1,$2,$3,$4,$5,'management_capability',$6,$7,$8)")
                .bind(Ulid::new().to_string()).bind(&authority.vendor_id).bind(&offer_id).bind(&slot_id).bind(event_kind)
                .bind(format!("celebrant_management:{}",authority.grant_id)).bind(&dedupe).bind(json!({"event_version":"wedding_vendor_special_offer_event.v1","state":state_value,"local_date":date,"vendor_scoped":true}))
                .execute(&mut *tx).await.map_err(db_error)?;
        }
        "date_slot_remove" => {
            let slot_id = clean(request.window_id.as_deref().unwrap_or(""), 40);
            let offer_id = ensure_wedding_date_offer(
                &mut tx,
                &authority.vendor_id,
                &authority.created_by_user_id,
            )
            .await?;
            if sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM wedding_vendor_special_offer_events WHERE offer_id=$1 AND event_kind='withdrawn' AND dedupe_key=$2)")
                .bind(&offer_id).bind(&dedupe).fetch_one(&mut *tx).await.map_err(db_error)? {
                tx.commit().await.map_err(db_error)?;
                return Ok(Json(json!({"replayed":true})));
            }
            let changed=sqlx::query("UPDATE wedding_vendor_special_offer_slots SET state='withdrawn',hold_expires_at=NULL,revision=revision+1,updated_at=NOW() WHERE slot_id=$1 AND offer_id=$2 AND vendor_id=$3 AND state<>'withdrawn'")
                .bind(&slot_id).bind(&offer_id).bind(&authority.vendor_id).execute(&mut *tx).await.map_err(db_error)?;
            if changed.rows_affected() != 1 {
                return Err((StatusCode::NOT_FOUND, "Wedding date not found.".into()));
            }
            sqlx::query("INSERT INTO wedding_vendor_special_offer_events(event_id,vendor_id,offer_id,slot_id,event_kind,actor_kind,source_ref,dedupe_key,metadata) VALUES($1,$2,$3,$4,'withdrawn','management_capability',$5,$6,$7)")
                .bind(Ulid::new().to_string()).bind(&authority.vendor_id).bind(&offer_id).bind(&slot_id).bind(format!("celebrant_management:{}",authority.grant_id)).bind(&dedupe).bind(json!({"event_version":"wedding_vendor_special_offer_event.v1","vendor_scoped":true}))
                .execute(&mut *tx).await.map_err(db_error)?;
        }
        "window_add" => {
            let participation = sqlx::query_scalar::<_, String>(
                "SELECT participation_status FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1",
            )
            .bind(&authority.vendor_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
            if participation.as_deref() != Some("accepted") {
                return Err((
                    StatusCode::CONFLICT,
                    "Accept consultation participation before publishing hours.".into(),
                ));
            }
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
            let profile=sqlx::query("SELECT register_status,(business_phone_ciphertext IS NOT NULL) phone_configured,participation_status,callback_phone_confirmed FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1")
            .bind(&authority.vendor_id).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"Save the claimed profile's phone settings first.".into()))?;
            if profile.get::<String, _>("register_status") != "verified"
                || !profile.get::<bool, _>("phone_configured")
                || profile.get::<String, _>("participation_status") != "accepted"
                || !profile.get::<bool, _>("callback_phone_confirmed")
            {
                return Err((StatusCode::CONFLICT,"Accepted participation, official register verification and a confirmed nominated callback phone are required before going live.".into()));
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
        "participation_update" => {
            let status = request
                .participation_status
                .as_deref()
                .filter(|value| matches!(*value, "accepted" | "declined" | "paused"))
                .ok_or((
                    StatusCode::BAD_REQUEST,
                    "Choose accepted, declined or paused participation.".into(),
                ))?;
            let callback_phone_confirmed = request.callback_phone_confirmed.unwrap_or(false);
            let profile = sqlx::query(
                "SELECT (business_phone_ciphertext IS NOT NULL) phone_configured FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1 FOR UPDATE",
            )
            .bind(&authority.vendor_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or((StatusCode::CONFLICT, "This celebrant profile is not ready for consultation setup.".into()))?;
            if callback_phone_confirmed && !profile.get::<bool, _>("phone_configured") {
                return Err((
                    StatusCode::CONFLICT,
                    "A claimed owner must add the nominated callback phone before it can be confirmed.".into(),
                ));
            }
            sqlx::query(
                "UPDATE wedding_celebrant_pilot_profiles SET participation_status=$2,participation_updated_at=NOW(),callback_phone_confirmed=$3,revision=revision+1,updated_at=NOW() WHERE vendor_id=$1",
            )
            .bind(&authority.vendor_id)
            .bind(status)
            .bind(callback_phone_confirmed)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            if matches!(status, "declined" | "paused") {
                sqlx::query("UPDATE wedding_celebrant_live_sessions SET paused_at=COALESCE(paused_at,NOW()),revision=revision+1 WHERE vendor_id=$1 AND paused_at IS NULL")
                    .bind(&authority.vendor_id).execute(&mut *tx).await.map_err(db_error)?;
            }
            record_event(
                &mut tx,
                Some(&authority.grant_id),
                &authority.vendor_id,
                "participation_updated",
                &dedupe,
                json!({"status":status,"callback_phone_confirmed":callback_phone_confirmed}),
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

    #[test]
    fn batch_ids_are_trimmed_deduplicated_and_bounded() {
        let ids = normalize_batch_vendor_ids(&[
            " celebrant-b ".into(),
            "celebrant-a".into(),
            "celebrant-b".into(),
            "".into(),
        ])
        .expect("valid batch");
        assert_eq!(
            ids.into_iter().collect::<Vec<_>>(),
            vec!["celebrant-a", "celebrant-b"]
        );
        assert!(normalize_batch_vendor_ids(&[]).is_err());
        assert!(normalize_batch_vendor_ids(&vec!["vendor".into(); 101]).is_ok());
        let unique = (0..101)
            .map(|index| format!("vendor-{index}"))
            .collect::<Vec<_>>();
        assert!(normalize_batch_vendor_ids(&unique).is_err());
    }
}
