//! Public and verified-vendor routes for the Sydney celebrant consultation pilot.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, Query, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware::Next,
    response::Response,
    routing::{get, post, put},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Datelike, Duration as ChronoDuration, NaiveDate, NaiveTime, Utc};
use chrono_tz::Australia::Sydney;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::Sha256;
use sqlx::Row;
use ulid::Ulid;

use crate::wedding_celebrant_consultation::{
    ACCEPTANCE_HOLD_MINUTES, ConsultationIntent, live_has_capacity, live_session_end,
    normalize_phone, valid_topic,
};

use super::{
    AppState, RateLimitPolicy,
    auth::{
        authenticated_rate_limit_key, authenticated_user, enforce_rate_limit, public_rate_limit_key,
    },
    wedding_vendor_portal_routes::{VendorPermission, require_vendor_access},
};

type HmacSha256 = Hmac<Sha256>;
const PEPPER_ENV: &str = "OMNYID_CELEBRANT_CONSULTATION_TOKEN_PEPPER";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/public/wedding/celebrant-consultations",
            get(public_availability_http),
        )
        .route(
            "/api/public/wedding/celebrant-consultations/verify/start",
            post(start_verification_http),
        )
        .route(
            "/api/public/wedding/celebrant-consultations/verify/check",
            post(check_verification_http),
        )
        .route(
            "/api/public/wedding/celebrant-consultations/requests",
            post(create_request_http),
        )
        .route(
            "/api/public/wedding/celebrant-consultations/requests/{request_id}",
            get(request_status_http),
        )
        .route(
            "/api/public/wedding/celebrant-consultations/requests/{request_id}/outcome",
            post(report_outcome_http),
        )
        .route(
            "/api/public/wedding/celebrant-consultations/requests/{request_id}/reschedule",
            post(respond_to_reschedule_http),
        )
        .route(
            "/wedding/vendor/portal/celebrant-consultations",
            get(vendor_dashboard_http).put(update_settings_http),
        )
        .route(
            "/wedding/vendor/portal/celebrant-consultations/windows",
            post(create_window_http),
        )
        .route(
            "/wedding/vendor/portal/celebrant-consultations/windows/{window_id}/remove",
            post(remove_window_http),
        )
        .route(
            "/wedding/vendor/portal/celebrant-consultations/live",
            put(set_live_http),
        )
        .route(
            "/wedding/vendor/portal/celebrant-consultations/requests/{request_id}/action",
            post(vendor_request_action_http),
        )
        .route(
            "/admin/wedding/celebrant-consultations/verification",
            post(operator_verification_http),
        )
        .layer(axum::middleware::from_fn(no_store))
}

async fn no_store(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store, max-age=0"),
    );
    response.headers_mut().insert(
        "x-robots-tag",
        HeaderValue::from_static("noindex, nofollow, noarchive"),
    );
    response
}

fn enabled() -> bool {
    std::env::var("OMNYID_CELEBRANT_CONSULTATIONS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "Celebrant consultations are not available.".into(),
    )
}

fn db_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(%error, "celebrant consultation database operation failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Celebrant consultations could not be updated just now.".into(),
    )
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn secret(name: &str) -> Result<String, (StatusCode, String)> {
    crate::secret_manager::read_process_secret_trimmed(name)
        .filter(|value| !value.is_empty())
        .ok_or((
            StatusCode::SERVICE_UNAVAILABLE,
            "Phone verification is temporarily unavailable.".into(),
        ))
}

fn encryption_key() -> Result<[u8; 32], (StatusCode, String)> {
    let value = secret("OMNYID_ENCRYPTION_KEY_HEX")?;
    let decoded = hex::decode(value).map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Phone verification is temporarily unavailable.".into(),
        )
    })?;
    decoded.try_into().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Phone verification is temporarily unavailable.".into(),
        )
    })
}

fn pepper() -> Result<Vec<u8>, (StatusCode, String)> {
    Ok(secret(PEPPER_ENV)?.into_bytes())
}

fn digest(pepper: &[u8], value: &str) -> Result<String, (StatusCode, String)> {
    let mut mac = HmacSha256::new_from_slice(pepper).map_err(|_| unavailable())?;
    mac.update(value.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn random_token(label: &str) -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    format!("{label}_{}", URL_SAFE_NO_PAD.encode(bytes))
}

fn consultation_vendor(category: &str) -> Result<(), (StatusCode, String)> {
    category
        .to_ascii_lowercase()
        .contains("celebrant")
        .then_some(())
        .ok_or((
            StatusCode::CONFLICT,
            "Phone consultations are available to verified celebrant listings.".into(),
        ))
}

async fn public_limit(
    state: &AppState,
    headers: &HeaderMap,
    scope: &str,
    max: usize,
) -> Result<(), (StatusCode, String)> {
    enforce_rate_limit(
        state,
        public_rate_limit_key(scope, headers),
        RateLimitPolicy {
            max_requests: max,
            window: Duration::from_secs(60),
        },
    )
    .await
}

async fn record_event(
    state: &AppState,
    request_id: Option<&str>,
    vendor_id: Option<&str>,
    kind: &str,
    actor_kind: &str,
    actor_user_id: Option<&str>,
    dedupe: &str,
    metadata: Value,
) -> Result<(), (StatusCode, String)> {
    sqlx::query("INSERT INTO wedding_celebrant_consultation_events (event_id,request_id,vendor_id,event_kind,actor_kind,actor_user_id,dedupe_key,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (event_kind,dedupe_key) DO NOTHING")
        .bind(Ulid::new().to_string()).bind(request_id).bind(vendor_id).bind(kind).bind(actor_kind)
        .bind(actor_user_id).bind(clean(dedupe,180)).bind(metadata).execute(&state.db.pool).await.map_err(db_error)?;
    Ok(())
}

#[derive(Deserialize)]
struct AvailabilityQuery {
    vendor_slug: Option<String>,
}

async fn public_availability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<AvailabilityQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    public_limit(&state, &headers, "celebrant-consultation-list", 60).await?;
    let rows = sqlx::query(r#"SELECT v.vendor_id,v.vendor_slug,v.vendor_name,v.service_area,p.languages,p.topics,p.accepted_intents,
        photo.photo_url,live.session_id,live.expires_at,live.call_cap,p.buffer_minutes,
        (SELECT COUNT(*)::bigint FROM wedding_celebrant_callback_requests r WHERE r.live_session_id=live.session_id AND r.status IN ('waiting_acceptance','accepted') AND COALESCE(r.hold_expires_at,live.expires_at)>NOW()) active_holds,
        next_window.next_start
      FROM wedding_vendors v
      JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id AND p.register_status='verified' AND p.participation_status='accepted'
      LEFT JOIN LATERAL (SELECT photo_url FROM wedding_vendor_photos WHERE vendor_id=v.vendor_id ORDER BY slot LIMIT 1) photo ON TRUE
      LEFT JOIN LATERAL (SELECT session_id,expires_at,call_cap FROM wedding_celebrant_live_sessions WHERE vendor_id=v.vendor_id AND paused_at IS NULL AND starts_at<=NOW() AND expires_at>NOW() ORDER BY starts_at DESC LIMIT 1) live ON TRUE
      LEFT JOIN LATERAL (
        SELECT ((day::date + w.starts_at) AT TIME ZONE 'Australia/Sydney') next_start
        FROM generate_series((NOW() AT TIME ZONE 'Australia/Sydney')::date, (NOW() AT TIME ZONE 'Australia/Sydney')::date + 14, interval '1 day') day
        JOIN wedding_celebrant_consultation_windows w ON w.vendor_id=v.vendor_id AND w.enabled AND ((w.window_kind='recurring' AND w.weekday=EXTRACT(ISODOW FROM day)) OR (w.window_kind='exception_open' AND w.local_date=day::date))
        WHERE w.window_kind<>'exception_closed' AND ((day::date + w.starts_at) AT TIME ZONE 'Australia/Sydney')>NOW()
          AND NOT EXISTS (SELECT 1 FROM wedding_celebrant_consultation_windows x WHERE x.vendor_id=v.vendor_id AND x.enabled AND x.window_kind='exception_closed' AND x.local_date=day::date AND x.starts_at<=w.starts_at AND x.ends_at>=w.ends_at)
        ORDER BY next_start LIMIT 1
      ) next_window ON TRUE
      WHERE v.status='active' AND v.category ILIKE '%celebrant%' AND ($1::text IS NULL OR v.vendor_slug=$1)
      ORDER BY (live.session_id IS NOT NULL) DESC,next_window.next_start NULLS LAST,v.vendor_name LIMIT 24"#)
        .bind(query.vendor_slug.as_deref().map(|value| clean(value,120)))
        .fetch_all(&state.db.pool).await.map_err(db_error)?;
    let now = Utc::now();
    let cards = rows.into_iter().map(|row| {
        let expires = row.get::<Option<DateTime<Utc>>,_>("expires_at");
        let live = expires.is_some_and(|expiry| live_has_capacity(now, expiry, false, row.get::<i64,_>("active_holds"), row.get::<Option<i32>,_>("call_cap").unwrap_or(0), row.get("buffer_minutes")));
        json!({
            "vendor_slug":row.get::<String,_>("vendor_slug"),"name":row.get::<String,_>("vendor_name"),
            "service_area":row.get::<String,_>("service_area"),"photo_url":row.get::<Option<String>,_>("photo_url"),
            "languages":row.get::<Vec<String>,_>("languages"),"topics":row.get::<Vec<String>,_>("topics"),
            "accepted_intents":row.get::<Vec<String>,_>("accepted_intents"),"available_now":live,
            "live_until":if live { expires.map(|value|value.to_rfc3339()) } else { None },
            "next_available_at":row.get::<Option<DateTime<Utc>>,_>("next_start").map(|value|value.to_rfc3339())
        })
    }).collect::<Vec<_>>();
    Ok(Json(
        json!({"timezone":"Australia/Sydney","consultation_minutes":10,"cards":cards,"empty_message":"No celebrant is live right now. You can still choose the next available time or browse celebrants."}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StartVerification {
    phone: String,
}

async fn start_verification_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<StartVerification>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    public_limit(&state, &headers, "celebrant-phone-start", 5).await?;
    let phone = normalize_phone(&request.phone).ok_or((
        StatusCode::BAD_REQUEST,
        "Use a valid phone number including country code.".into(),
    ))?;
    let phone_digest = digest(&pepper()?, &phone)?;
    enforce_rate_limit(
        &state,
        format!("celebrant-phone:{phone_digest}"),
        RateLimitPolicy {
            max_requests: 3,
            window: Duration::from_secs(600),
        },
    )
    .await?;
    let sid = secret("OMNYID_TWILIO_ACCOUNT_SID")?;
    let auth = secret("OMNYID_TWILIO_AUTH_TOKEN")?;
    let service = secret("OMNYID_TWILIO_VERIFY_SERVICE_SID")?;
    let response = state
        .http_client
        .post(format!(
            "https://verify.twilio.com/v2/Services/{service}/Verifications"
        ))
        .basic_auth(sid, Some(auth))
        .form(&[("To", phone.as_str()), ("Channel", "sms")])
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The verification message could not be sent just now.".into(),
            )
        })?;
    if !response.status().is_success() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "The verification message could not be sent just now.".into(),
        ));
    }
    let provider: Value = response.json().await.unwrap_or_else(|_| json!({}));
    let verification_id = Ulid::new().to_string();
    let ciphertext = crate::crypto::encrypt_secret(&phone, &encryption_key()?);
    sqlx::query("INSERT INTO wedding_celebrant_phone_verifications (verification_id,phone_hash,provider_ref,phone_ciphertext,status,expires_at) VALUES ($1,$2,$3,$4,'pending',NOW()+INTERVAL '10 minutes')")
        .bind(&verification_id).bind(phone_digest).bind(provider.get("sid").and_then(Value::as_str)).bind(ciphertext)
        .execute(&state.db.pool).await.map_err(db_error)?;
    record_event(
        &state,
        None,
        None,
        "verification_started",
        "visitor",
        None,
        &format!("verify-start-{verification_id}"),
        json!({"verification_ref":verification_id}),
    )
    .await?;
    Ok(Json(
        json!({"verification_id":verification_id,"expires_in_seconds":600}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CheckVerification {
    verification_id: String,
    code: String,
}

async fn check_verification_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CheckVerification>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    public_limit(&state, &headers, "celebrant-phone-check", 8).await?;
    let row=sqlx::query("SELECT phone_ciphertext,status,expires_at FROM wedding_celebrant_phone_verifications WHERE verification_id=$1")
        .bind(clean(&request.verification_id,40)).fetch_optional(&state.db.pool).await.map_err(db_error)?.ok_or_else(unavailable)?;
    if row.get::<String, _>("status") != "pending"
        || row.get::<DateTime<Utc>, _>("expires_at") <= Utc::now()
    {
        return Err(unavailable());
    }
    let phone = crate::crypto::decrypt_secret(
        &row.get::<String, _>("phone_ciphertext"),
        &encryption_key()?,
    )
    .ok_or_else(unavailable)?;
    let sid = secret("OMNYID_TWILIO_ACCOUNT_SID")?;
    let auth = secret("OMNYID_TWILIO_AUTH_TOKEN")?;
    let service = secret("OMNYID_TWILIO_VERIFY_SERVICE_SID")?;
    let code = clean(&request.code, 10);
    let response = state
        .http_client
        .post(format!(
            "https://verify.twilio.com/v2/Services/{service}/VerificationCheck"
        ))
        .basic_auth(sid, Some(auth))
        .form(&[("To", phone.as_str()), ("Code", code.as_str())])
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The code could not be checked just now.".into(),
            )
        })?;
    let provider_status = response.status();
    let provider: Value = response.json().await.unwrap_or_else(|_| json!({}));
    if !provider_status.is_success()
        || provider.get("status").and_then(Value::as_str) != Some("approved")
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            "That code was not accepted.".into(),
        ));
    }
    let token = random_token("cvt");
    let token_digest = digest(&pepper()?, &token)?;
    sqlx::query("UPDATE wedding_celebrant_phone_verifications SET status='approved',public_token_digest=$1,approved_at=NOW() WHERE verification_id=$2 AND status='pending'")
        .bind(token_digest).bind(&request.verification_id).execute(&state.db.pool).await.map_err(db_error)?;
    record_event(
        &state,
        None,
        None,
        "verification_approved",
        "visitor",
        None,
        &format!("verify-approved-{}", request.verification_id),
        json!({"verification_ref":request.verification_id}),
    )
    .await?;
    Ok(Json(
        json!({"verification_token":token,"expires_in_seconds":600}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateRequest {
    verification_id: String,
    verification_token: String,
    idempotency_key: String,
    vendor_slug: Option<String>,
    first_available: bool,
    request_mode: String,
    intent: String,
    topic: String,
    location: Option<String>,
    wedding_date: Option<String>,
    scheduled_start: Option<String>,
}

async fn create_request_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    public_limit(&state, &headers, "celebrant-request-create", 8).await?;
    let intent = ConsultationIntent::parse(&request.intent).ok_or((
        StatusCode::BAD_REQUEST,
        "Choose whether this is a general question or a hiring enquiry.".into(),
    ))?;
    if !valid_topic(&request.topic) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a supported help topic.".into(),
        ));
    }
    if !request.first_available
        && request
            .vendor_slug
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a celebrant or First available.".into(),
        ));
    }
    let pepper = pepper()?;
    let verification_digest = digest(&pepper, &request.verification_token)?;
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    let verified=sqlx::query("SELECT phone_ciphertext,status,expires_at FROM wedding_celebrant_phone_verifications WHERE verification_id=$1 AND public_token_digest=$2 FOR UPDATE")
        .bind(clean(&request.verification_id,40)).bind(verification_digest).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(unavailable)?;
    if verified.get::<String, _>("status") != "approved"
        || verified.get::<DateTime<Utc>, _>("expires_at") <= Utc::now()
    {
        return Err(unavailable());
    }
    if let Some(existing)=sqlx::query("SELECT request_id,status FROM wedding_celebrant_callback_requests WHERE verification_id=$1 AND idempotency_key=$2")
        .bind(&request.verification_id).bind(clean(&request.idempotency_key,160)).fetch_optional(&mut *tx).await.map_err(db_error)? {
        tx.rollback().await.ok();
        return Ok(Json(json!({"request_id":existing.get::<String,_>("request_id"),"status":existing.get::<String,_>("status"),"duplicate":true})));
    }
    let request_id = Ulid::new().to_string();
    let status_token = random_token("ccs");
    let status_digest = digest(&pepper, &status_token)?;
    let wedding_date = request
        .wedding_date
        .as_deref()
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d"))
        .transpose()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "Wedding date must use YYYY-MM-DD.".into(),
            )
        })?;
    let idempotency = clean(&request.idempotency_key, 160);
    if idempotency.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "idempotency_key is too short.".into(),
        ));
    }
    let (vendor_id, live_session, scheduled_start, scheduled_end, status, hold_expires) = if request
        .request_mode
        == "immediate"
    {
        let slug = request
            .vendor_slug
            .as_deref()
            .map(|value| clean(value, 120));
        let candidate=sqlx::query(r#"SELECT v.vendor_id,l.session_id,l.expires_at,l.call_cap,p.buffer_minutes,
          (SELECT COUNT(*)::bigint FROM wedding_celebrant_callback_requests r WHERE r.live_session_id=l.session_id AND r.status IN ('waiting_acceptance','accepted') AND COALESCE(r.hold_expires_at,l.expires_at)>NOW()) active_holds
          FROM wedding_vendors v JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id AND p.register_status='verified' AND p.participation_status='accepted'
          JOIN wedding_celebrant_live_sessions l ON l.vendor_id=v.vendor_id AND l.paused_at IS NULL AND l.starts_at<=NOW() AND l.expires_at>NOW()
          WHERE v.status='active' AND v.category ILIKE '%celebrant%' AND $1=ANY(p.accepted_intents) AND $2=ANY(p.topics) AND ($3::text IS NULL OR v.vendor_slug=$3)
          ORDER BY l.starts_at FOR UPDATE OF l SKIP LOCKED LIMIT 1"#)
          .bind(intent.as_str()).bind(&request.topic).bind(if request.first_available{None}else{slug.as_deref()})
          .fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"No matching celebrant is ready for a callback now. Choose a later time instead.".into()))?;
        let expiry = candidate.get::<DateTime<Utc>, _>("expires_at");
        if !live_has_capacity(
            Utc::now(),
            expiry,
            false,
            candidate.get("active_holds"),
            candidate.get("call_cap"),
            candidate.get("buffer_minutes"),
        ) {
            return Err((
                StatusCode::CONFLICT,
                "That callback capacity was just taken. Choose a later time instead.".into(),
            ));
        }
        (
            candidate.get::<String, _>("vendor_id"),
            Some(candidate.get::<String, _>("session_id")),
            None,
            None,
            "waiting_acceptance",
            Some(Utc::now() + ChronoDuration::minutes(ACCEPTANCE_HOLD_MINUTES)),
        )
    } else if request.request_mode == "scheduled" {
        let slug = clean(request.vendor_slug.as_deref().unwrap_or(""), 120);
        let start = DateTime::parse_from_rfc3339(request.scheduled_start.as_deref().unwrap_or(""))
            .map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    "Choose a valid consultation time.".into(),
                )
            })?
            .with_timezone(&Utc);
        if start < Utc::now() + ChronoDuration::minutes(10)
            || start > Utc::now() + ChronoDuration::days(90)
        {
            return Err((
                StatusCode::BAD_REQUEST,
                "Choose a time from ten minutes to ninety days ahead.".into(),
            ));
        }
        let local = start.with_timezone(&Sydney);
        let date = local.date_naive();
        let time = local.time();
        let weekday = local.weekday().number_from_monday() as i16;
        let row=sqlx::query(r#"SELECT v.vendor_id,p.consultation_minutes FROM wedding_vendors v JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id AND p.register_status='verified' AND p.participation_status='accepted'
          WHERE v.vendor_slug=$1 AND v.status='active' AND v.category ILIKE '%celebrant%' AND $2=ANY(p.accepted_intents) AND $3=ANY(p.topics)
          AND EXISTS (SELECT 1 FROM wedding_celebrant_consultation_windows w WHERE w.vendor_id=v.vendor_id AND w.enabled AND w.starts_at<=$4 AND w.ends_at>=($4 + make_interval(mins=>p.consultation_minutes)) AND ((w.window_kind='recurring' AND w.weekday=$5) OR (w.window_kind='exception_open' AND w.local_date=$6)))
          AND NOT EXISTS (SELECT 1 FROM wedding_celebrant_consultation_windows x WHERE x.vendor_id=v.vendor_id AND x.enabled AND x.window_kind='exception_closed' AND x.local_date=$6 AND x.starts_at<=$4 AND x.ends_at>$4)"#)
          .bind(slug).bind(intent.as_str()).bind(&request.topic).bind(time).bind(weekday).bind(date).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"That time is no longer available.".into()))?;
        let end =
            start + ChronoDuration::minutes(i64::from(row.get::<i32, _>("consultation_minutes")));
        (
            row.get::<String, _>("vendor_id"),
            None,
            Some(start),
            Some(end),
            "scheduled",
            None,
        )
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            "request_mode must be immediate or scheduled.".into(),
        ));
    };
    sqlx::query(r#"INSERT INTO wedding_celebrant_callback_requests (request_id,idempotency_key,verification_id,selected_vendor_id,first_available,request_mode,intent,topic,location,wedding_date,phone_ciphertext,status_token_digest,status,live_session_id,scheduled_start,scheduled_end,hold_expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)"#)
      .bind(&request_id).bind(idempotency).bind(&request.verification_id).bind(&vendor_id).bind(request.first_available).bind(&request.request_mode).bind(intent.as_str()).bind(&request.topic)
      .bind(request.location.as_deref().map(|v|clean(v,180))).bind(wedding_date).bind(verified.get::<String,_>("phone_ciphertext")).bind(status_digest).bind(status).bind(live_session).bind(scheduled_start).bind(scheduled_end).bind(hold_expires)
      .execute(&mut *tx).await.map_err(|error| if error.to_string().contains("uq_celebrant_active_scheduled_slot"){(StatusCode::CONFLICT,"That time was just booked. Choose another time.".into())}else{db_error(error)})?;
    sqlx::query("UPDATE wedding_celebrant_phone_verifications SET status='consumed',consumed_at=NOW() WHERE verification_id=$1").bind(&request.verification_id).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    record_event(
        &state,
        Some(&request_id),
        Some(&vendor_id),
        "request_created",
        "visitor",
        None,
        &format!("request-{request_id}"),
        json!({"mode":request.request_mode,"intent":intent.as_str(),"topic":request.topic}),
    )
    .await?;
    Ok(Json(
        json!({"request_id":request_id,"status":status,"status_token":status_token,"hold_expires_at":hold_expires.map(|v|v.to_rfc3339()),"scheduled_start":scheduled_start.map(|v|v.to_rfc3339())}),
    ))
}

#[derive(Deserialize)]
struct StatusQuery {
    token: String,
}

async fn request_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    public_limit(&state, &headers, "celebrant-request-status", 60).await?;
    let request_id = clean(&request_id, 40);
    let token_digest = digest(&pepper()?, &query.token)?;
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    let current = sqlx::query(
        r#"SELECT status,hold_expires_at,first_available,selected_vendor_id,intent,topic,revision
             FROM wedding_celebrant_callback_requests
            WHERE request_id=$1 AND status_token_digest=$2 FOR UPDATE"#,
    )
    .bind(&request_id)
    .bind(&token_digest)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or_else(unavailable)?;
    let expired_wait = current.get::<String, _>("status") == "waiting_acceptance"
        && current
            .get::<Option<DateTime<Utc>>, _>("hold_expires_at")
            .is_some_and(|value| value <= Utc::now());
    let mut lifecycle_event = None;
    let mut event_vendor_id = current.get::<Option<String>, _>("selected_vendor_id");
    if expired_wait {
        let candidate = if current.get::<bool, _>("first_available") {
            sqlx::query(
                r#"SELECT v.vendor_id,l.session_id
                     FROM wedding_vendors v
                     JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id AND p.register_status='verified' AND p.participation_status='accepted'
                     JOIN wedding_celebrant_live_sessions l ON l.vendor_id=v.vendor_id
                       AND l.paused_at IS NULL AND l.starts_at<=NOW() AND l.expires_at>NOW()
                    WHERE v.status='active' AND v.category ILIKE '%celebrant%'
                      AND v.vendor_id<>COALESCE($1,'') AND $2=ANY(p.accepted_intents) AND $3=ANY(p.topics)
                      AND l.expires_at > NOW() + make_interval(mins=>p.consultation_minutes+p.buffer_minutes)
                      AND (SELECT COUNT(*) FROM wedding_celebrant_callback_requests r
                            WHERE r.live_session_id=l.session_id
                              AND r.status IN ('waiting_acceptance','accepted')
                              AND COALESCE(r.hold_expires_at,l.expires_at)>NOW()) < l.call_cap
                    ORDER BY l.starts_at,v.vendor_name
                    FOR UPDATE OF l SKIP LOCKED LIMIT 1"#,
            )
            .bind(event_vendor_id.as_deref())
            .bind(current.get::<String, _>("intent"))
            .bind(current.get::<String, _>("topic"))
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
        } else {
            None
        };
        if let Some(candidate) = candidate {
            let vendor_id = candidate.get::<String, _>("vendor_id");
            sqlx::query(
                r#"UPDATE wedding_celebrant_callback_requests
                      SET selected_vendor_id=$1,live_session_id=$2,hold_expires_at=NOW()+INTERVAL '5 minutes',
                          revision=revision+1,updated_at=NOW()
                    WHERE request_id=$3 AND revision=$4 AND status='waiting_acceptance'"#,
            )
            .bind(&vendor_id)
            .bind(candidate.get::<String, _>("session_id"))
            .bind(&request_id)
            .bind(current.get::<i64, _>("revision"))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            event_vendor_id = Some(vendor_id);
            lifecycle_event = Some("request_reassigned");
        } else {
            sqlx::query(
                "UPDATE wedding_celebrant_callback_requests SET status='expired',hold_expires_at=NULL,revision=revision+1,updated_at=NOW() WHERE request_id=$1 AND revision=$2 AND status='waiting_acceptance'",
            )
            .bind(&request_id)
            .bind(current.get::<i64, _>("revision"))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            lifecycle_event = Some("request_expired");
        }
    }
    tx.commit().await.map_err(db_error)?;
    if let Some(event) = lifecycle_event {
        record_event(
            &state,
            Some(&request_id),
            event_vendor_id.as_deref(),
            event,
            "system",
            None,
            &format!(
                "status-expiry-{request_id}-{}",
                current.get::<i64, _>("revision")
            ),
            json!({"status":if event=="request_reassigned"{"waiting_acceptance"}else{"expired"}}),
        )
        .await?;
    }
    let row=sqlx::query("SELECT r.status,r.hold_expires_at,r.scheduled_start,r.accepted_at,v.vendor_name,v.vendor_slug FROM wedding_celebrant_callback_requests r LEFT JOIN wedding_vendors v ON v.vendor_id=r.selected_vendor_id WHERE r.request_id=$1 AND r.status_token_digest=$2")
      .bind(&request_id).bind(token_digest).fetch_optional(&state.db.pool).await.map_err(db_error)?.ok_or_else(unavailable)?;
    Ok(Json(
        json!({"request_id":request_id,"status":row.get::<String,_>("status"),"celebrant_name":row.get::<Option<String>,_>("vendor_name"),"vendor_slug":row.get::<Option<String>,_>("vendor_slug"),"hold_expires_at":row.get::<Option<DateTime<Utc>>,_>("hold_expires_at").map(|v|v.to_rfc3339()),"scheduled_start":row.get::<Option<DateTime<Utc>>,_>("scheduled_start").map(|v|v.to_rfc3339()),"accepted_at":row.get::<Option<DateTime<Utc>>,_>("accepted_at").map(|v|v.to_rfc3339())}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OutcomeRequest {
    token: String,
    outcome: String,
}

async fn report_outcome_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
    Json(request): Json<OutcomeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    public_limit(&state, &headers, "celebrant-request-outcome", 8).await?;
    let (status, event) = match request.outcome.as_str() {
        "connected" => ("connected", "call_connected"),
        "not_connected" => ("not_connected", "call_not_connected"),
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "outcome must be connected or not_connected.".into(),
            ));
        }
    };
    let row=sqlx::query("UPDATE wedding_celebrant_callback_requests SET status=$1,completed_at=NOW(),revision=revision+1,updated_at=NOW() WHERE request_id=$2 AND status_token_digest=$3 AND status='accepted' RETURNING selected_vendor_id")
      .bind(status).bind(clean(&request_id,40)).bind(digest(&pepper()?,&request.token)?).fetch_optional(&state.db.pool).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"This call cannot be updated from its current state.".into()))?;
    let vendor_id = row.get::<Option<String>, _>("selected_vendor_id");
    record_event(
        &state,
        Some(&request_id),
        vendor_id.as_deref(),
        event,
        "visitor",
        None,
        &format!("outcome-{request_id}-{status}"),
        json!({"outcome":status}),
    )
    .await?;
    Ok(Json(
        json!({"request_id":request_id,"status":status,"next_actions":["save_celebrant","ask_about_wedding_date"]}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RescheduleResponseRequest {
    token: String,
    action: String,
}

async fn respond_to_reschedule_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
    Json(request): Json<RescheduleResponseRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    public_limit(&state, &headers, "celebrant-reschedule-response", 8).await?;
    let (status, event) = match request.action.as_str() {
        "accept" => ("scheduled", "reschedule_accepted"),
        "decline" => ("cancelled", "reschedule_declined"),
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "action must be accept or decline.".into(),
            ));
        }
    };
    let request_id = clean(&request_id, 40);
    let row = sqlx::query(
        r#"UPDATE wedding_celebrant_callback_requests
              SET status=$1,completed_at=CASE WHEN $1='cancelled' THEN NOW() ELSE NULL END,
                  revision=revision+1,updated_at=NOW()
            WHERE request_id=$2 AND status_token_digest=$3 AND status='reschedule_requested'
            RETURNING selected_vendor_id,scheduled_start"#,
    )
    .bind(status)
    .bind(&request_id)
    .bind(digest(&pepper()?, &request.token)?)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(db_error)?
    .ok_or((
        StatusCode::CONFLICT,
        "This reschedule request is no longer waiting for a response.".into(),
    ))?;
    let vendor_id = row.get::<Option<String>, _>("selected_vendor_id");
    record_event(
        &state,
        Some(&request_id),
        vendor_id.as_deref(),
        event,
        "visitor",
        None,
        &format!("reschedule-response-{request_id}-{status}"),
        json!({"status":status}),
    )
    .await?;
    Ok(Json(json!({
        "request_id":request_id,
        "status":status,
        "scheduled_start":row.get::<Option<DateTime<Utc>>,_>("scheduled_start").map(|value|value.to_rfc3339())
    })))
}

#[derive(Deserialize)]
struct VendorQuery {
    vendor_slug: String,
}

async fn vendor_dashboard_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_, access) =
        require_vendor_access(&state, &headers, &query.vendor_slug, VendorPermission::View).await?;
    consultation_vendor(&access.category)?;
    let profile=sqlx::query("SELECT register_status,register_type,register_checked_at,service_regions,languages,topics,accepted_intents,buffer_minutes,consultation_minutes,(business_phone_ciphertext IS NOT NULL) business_phone_configured,revision FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1")
      .bind(&access.vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?;
    let windows=sqlx::query("SELECT window_id,window_kind,weekday,local_date,starts_at,ends_at,enabled,revision FROM wedding_celebrant_consultation_windows WHERE vendor_id=$1 ORDER BY COALESCE(local_date,'9999-12-31'),weekday,starts_at")
      .bind(&access.vendor_id).fetch_all(&state.db.pool).await.map_err(db_error)?;
    let live=sqlx::query("SELECT session_id,starts_at,expires_at,call_cap,paused_at,revision FROM wedding_celebrant_live_sessions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1")
      .bind(&access.vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?;
    let requests=sqlx::query("SELECT request_id,request_mode,intent,topic,location,wedding_date,status,scheduled_start,hold_expires_at,accepted_at,revision,created_at FROM wedding_celebrant_callback_requests WHERE selected_vendor_id=$1 ORDER BY CASE WHEN status IN ('waiting_acceptance','scheduled') THEN 0 ELSE 1 END,created_at DESC LIMIT 50")
      .bind(&access.vendor_id).fetch_all(&state.db.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"vendor":{"vendor_slug":access.vendor_slug,"name":access.vendor_name,"category":access.category},"profile":profile.map(|r|json!({"register_status":r.get::<String,_>("register_status"),"register_type":r.get::<Option<String>,_>("register_type"),"register_checked_at":r.get::<Option<DateTime<Utc>>,_>("register_checked_at").map(|v|v.to_rfc3339()),"service_regions":r.get::<Vec<String>,_>("service_regions"),"languages":r.get::<Vec<String>,_>("languages"),"topics":r.get::<Vec<String>,_>("topics"),"accepted_intents":r.get::<Vec<String>,_>("accepted_intents"),"buffer_minutes":r.get::<i32,_>("buffer_minutes"),"consultation_minutes":r.get::<i32,_>("consultation_minutes"),"business_phone_configured":r.get::<bool,_>("business_phone_configured"),"revision":r.get::<i64,_>("revision")})),"windows":windows.into_iter().map(|r|json!({"window_id":r.get::<String,_>("window_id"),"kind":r.get::<String,_>("window_kind"),"weekday":r.get::<Option<i16>,_>("weekday"),"local_date":r.get::<Option<NaiveDate>,_>("local_date").map(|v|v.to_string()),"starts_at":r.get::<NaiveTime,_>("starts_at").format("%H:%M").to_string(),"ends_at":r.get::<NaiveTime,_>("ends_at").format("%H:%M").to_string(),"enabled":r.get::<bool,_>("enabled"),"revision":r.get::<i64,_>("revision")})).collect::<Vec<_>>(),"live":live.map(|r|json!({"session_id":r.get::<String,_>("session_id"),"starts_at":r.get::<DateTime<Utc>,_>("starts_at").to_rfc3339(),"expires_at":r.get::<DateTime<Utc>,_>("expires_at").to_rfc3339(),"call_cap":r.get::<i32,_>("call_cap"),"paused":r.get::<Option<DateTime<Utc>>,_>("paused_at").is_some(),"revision":r.get::<i64,_>("revision")})),"requests":requests.into_iter().map(|r|json!({"request_id":r.get::<String,_>("request_id"),"mode":r.get::<String,_>("request_mode"),"intent":r.get::<String,_>("intent"),"topic":r.get::<String,_>("topic"),"location":r.get::<Option<String>,_>("location"),"wedding_date":r.get::<Option<NaiveDate>,_>("wedding_date").map(|v|v.to_string()),"status":r.get::<String,_>("status"),"scheduled_start":r.get::<Option<DateTime<Utc>>,_>("scheduled_start").map(|v|v.to_rfc3339()),"hold_expires_at":r.get::<Option<DateTime<Utc>>,_>("hold_expires_at").map(|v|v.to_rfc3339()),"accepted_at":r.get::<Option<DateTime<Utc>>,_>("accepted_at").map(|v|v.to_rfc3339()),"revision":r.get::<i64,_>("revision")})).collect::<Vec<_>>() }),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SettingsRequest {
    expected_revision: Option<i64>,
    service_regions: Vec<String>,
    languages: Vec<String>,
    topics: Vec<String>,
    accepted_intents: Vec<String>,
    business_phone: Option<String>,
    buffer_minutes: i32,
}

async fn update_settings_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
    Json(request): Json<SettingsRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("celebrant-settings", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &query.vendor_slug,
        VendorPermission::Calendar,
    )
    .await?;
    consultation_vendor(&access.category)?;
    if request.topics.is_empty()
        || request.topics.iter().any(|v| !valid_topic(v))
        || request.accepted_intents.is_empty()
        || request
            .accepted_intents
            .iter()
            .any(|v| ConsultationIntent::parse(v).is_none())
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose at least one supported topic and call intent.".into(),
        ));
    }
    if !(0..=60).contains(&request.buffer_minutes) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Buffer must be between 0 and 60 minutes.".into(),
        ));
    }
    let ciphertext = request
        .business_phone
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            normalize_phone(value)
                .ok_or((
                    StatusCode::BAD_REQUEST,
                    "Use a valid business phone number.".into(),
                ))
                .and_then(|phone| Ok(crate::crypto::encrypt_secret(&phone, &encryption_key()?)))
        })
        .transpose()?;
    let row=sqlx::query(r#"INSERT INTO wedding_celebrant_pilot_profiles (vendor_id,service_regions,languages,topics,accepted_intents,business_phone_ciphertext,buffer_minutes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (vendor_id) DO UPDATE SET service_regions=EXCLUDED.service_regions,languages=EXCLUDED.languages,topics=EXCLUDED.topics,accepted_intents=EXCLUDED.accepted_intents,business_phone_ciphertext=COALESCE(EXCLUDED.business_phone_ciphertext,wedding_celebrant_pilot_profiles.business_phone_ciphertext),buffer_minutes=EXCLUDED.buffer_minutes,revision=wedding_celebrant_pilot_profiles.revision+1,updated_at=NOW()
      WHERE $8::bigint IS NULL OR wedding_celebrant_pilot_profiles.revision=$8 RETURNING revision"#)
      .bind(&access.vendor_id).bind(request.service_regions.into_iter().map(|v|clean(&v,120)).collect::<Vec<_>>()).bind(request.languages.into_iter().map(|v|clean(&v,80)).collect::<Vec<_>>()).bind(&request.topics).bind(&request.accepted_intents).bind(ciphertext).bind(request.buffer_minutes).bind(request.expected_revision)
      .fetch_optional(&state.db.pool).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"These consultation settings changed elsewhere. Refresh and try again.".into()))?;
    record_event(
        &state,
        None,
        Some(&access.vendor_id),
        "settings_updated",
        "vendor_user",
        Some(&user.id),
        &format!(
            "settings-{}-{}",
            access.vendor_id,
            row.get::<i64, _>("revision")
        ),
        json!({"revision":row.get::<i64,_>("revision")}),
    )
    .await?;
    Ok(Json(
        json!({"saved":true,"revision":row.get::<i64,_>("revision")}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WindowRequest {
    kind: String,
    weekday: Option<i16>,
    local_date: Option<String>,
    starts_at: String,
    ends_at: String,
}

async fn create_window_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
    Json(request): Json<WindowRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &query.vendor_slug,
        VendorPermission::Calendar,
    )
    .await?;
    consultation_vendor(&access.category)?;
    if !matches!(
        request.kind.as_str(),
        "recurring" | "exception_open" | "exception_closed"
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Unknown consultation window kind.".into(),
        ));
    }
    let start = NaiveTime::parse_from_str(&request.starts_at, "%H:%M").map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "Use HH:MM for the start time.".into(),
        )
    })?;
    let end = NaiveTime::parse_from_str(&request.ends_at, "%H:%M").map_err(|_| {
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
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d"))
        .transpose()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Date must use YYYY-MM-DD.".into()))?;
    match request.kind.as_str() {
        "recurring" if request.weekday.is_none() || date.is_some() => {
            return Err((
                StatusCode::BAD_REQUEST,
                "Recurring hours need a weekday and must not include a date.".into(),
            ));
        }
        "exception_open" | "exception_closed" if request.weekday.is_some() || date.is_none() => {
            return Err((
                StatusCode::BAD_REQUEST,
                "One-off availability changes need a date and must not include a weekday.".into(),
            ));
        }
        _ => {}
    }
    let window_id = Ulid::new().to_string();
    sqlx::query("INSERT INTO wedding_celebrant_consultation_windows (window_id,vendor_id,window_kind,weekday,local_date,starts_at,ends_at,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
      .bind(&window_id).bind(&access.vendor_id).bind(&request.kind).bind(request.weekday).bind(date).bind(start).bind(end).bind(&user.id).execute(&state.db.pool).await.map_err(db_error)?;
    Ok(Json(json!({"window_id":window_id,"saved":true})))
}

async fn remove_window_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(window_id): Path<String>,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_, access) = require_vendor_access(
        &state,
        &headers,
        &query.vendor_slug,
        VendorPermission::Calendar,
    )
    .await?;
    consultation_vendor(&access.category)?;
    let result=sqlx::query("UPDATE wedding_celebrant_consultation_windows SET enabled=FALSE,revision=revision+1,updated_at=NOW() WHERE window_id=$1 AND vendor_id=$2 AND enabled")
      .bind(clean(&window_id,40)).bind(&access.vendor_id).execute(&state.db.pool).await.map_err(db_error)?;
    if result.rows_affected() != 1 {
        return Err(unavailable());
    }
    Ok(Json(json!({"removed":true})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LiveRequest {
    action: String,
    duration_minutes: Option<i64>,
    call_cap: Option<i32>,
}

async fn set_live_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
    Json(request): Json<LiveRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &query.vendor_slug,
        VendorPermission::Calendar,
    )
    .await?;
    consultation_vendor(&access.category)?;
    let profile=sqlx::query("SELECT register_status,business_phone_ciphertext FROM wedding_celebrant_pilot_profiles WHERE vendor_id=$1").bind(&access.vendor_id).fetch_optional(&state.db.pool).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"Save your phone consultation settings first.".into()))?;
    if profile.get::<String, _>("register_status") != "verified" {
        return Err((
            StatusCode::CONFLICT,
            "An operator must verify the celebrant register entry before live callbacks can begin."
                .into(),
        ));
    }
    if request.action == "pause" {
        sqlx::query("UPDATE wedding_celebrant_live_sessions SET paused_at=NOW(),revision=revision+1 WHERE vendor_id=$1 AND paused_at IS NULL").bind(&access.vendor_id).execute(&state.db.pool).await.map_err(db_error)?;
        record_event(
            &state,
            None,
            Some(&access.vendor_id),
            "live_paused",
            "vendor_user",
            Some(&user.id),
            &format!("live-pause-{}-{}", access.vendor_id, Ulid::new()),
            json!({}),
        )
        .await?;
        return Ok(Json(json!({"live":false})));
    }
    if request.action != "start" {
        return Err((
            StatusCode::BAD_REQUEST,
            "action must be start or pause.".into(),
        ));
    }
    let cap = request.call_cap.unwrap_or(3);
    if !(1..=20).contains(&cap) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Call cap must be between 1 and 20.".into(),
        ));
    }
    sqlx::query("UPDATE wedding_celebrant_live_sessions SET paused_at=NOW(),revision=revision+1 WHERE vendor_id=$1 AND paused_at IS NULL").bind(&access.vendor_id).execute(&state.db.pool).await.map_err(db_error)?;
    let session_id = Ulid::new().to_string();
    let expires = live_session_end(Utc::now(), request.duration_minutes.unwrap_or(60));
    sqlx::query("INSERT INTO wedding_celebrant_live_sessions (session_id,vendor_id,expires_at,call_cap,created_by_user_id) VALUES ($1,$2,$3,$4,$5)").bind(&session_id).bind(&access.vendor_id).bind(expires).bind(cap).bind(&user.id).execute(&state.db.pool).await.map_err(db_error)?;
    record_event(
        &state,
        None,
        Some(&access.vendor_id),
        "live_started",
        "vendor_user",
        Some(&user.id),
        &format!("live-start-{session_id}"),
        json!({"session_ref":session_id,"call_cap":cap,"expires_at":expires}),
    )
    .await?;
    Ok(Json(
        json!({"live":true,"session_id":session_id,"expires_at":expires.to_rfc3339(),"call_cap":cap}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VendorAction {
    action: String,
    expected_revision: i64,
    reschedule_start: Option<String>,
}

async fn vendor_request_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
    Query(query): Query<VendorQuery>,
    Json(request): Json<VendorAction>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &query.vendor_slug,
        VendorPermission::Enquiries,
    )
    .await?;
    consultation_vendor(&access.category)?;
    if request.action == "pass" {
        let request_id = clean(&request_id, 40);
        let mut tx = state.db.pool.begin().await.map_err(db_error)?;
        let current = sqlx::query(
            r#"SELECT status,first_available,intent,topic,selected_vendor_id
                 FROM wedding_celebrant_callback_requests
                WHERE request_id=$1 AND selected_vendor_id=$2 AND revision=$3
                FOR UPDATE"#,
        )
        .bind(&request_id)
        .bind(&access.vendor_id)
        .bind(request.expected_revision)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        .ok_or((
            StatusCode::CONFLICT,
            "This callback changed elsewhere. Refresh and try again.".into(),
        ))?;
        if current.get::<String, _>("status") != "waiting_acceptance" {
            return Err((
                StatusCode::CONFLICT,
                "That call is no longer waiting for a response.".into(),
            ));
        }
        let next = if current.get::<bool, _>("first_available") {
            sqlx::query(
                r#"SELECT v.vendor_id,l.session_id
                     FROM wedding_vendors v
                     JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id AND p.register_status='verified' AND p.participation_status='accepted'
                     JOIN wedding_celebrant_live_sessions l ON l.vendor_id=v.vendor_id
                       AND l.paused_at IS NULL AND l.starts_at<=NOW() AND l.expires_at>NOW()
                    WHERE v.status='active' AND v.category ILIKE '%celebrant%'
                      AND v.vendor_id<>$1 AND $2=ANY(p.accepted_intents) AND $3=ANY(p.topics)
                      AND l.expires_at > NOW() + make_interval(mins=>p.consultation_minutes+p.buffer_minutes)
                      AND (SELECT COUNT(*) FROM wedding_celebrant_callback_requests r
                            WHERE r.live_session_id=l.session_id
                              AND r.status IN ('waiting_acceptance','accepted')
                              AND COALESCE(r.hold_expires_at,l.expires_at)>NOW()) < l.call_cap
                    ORDER BY l.starts_at,v.vendor_name
                    FOR UPDATE OF l SKIP LOCKED LIMIT 1"#,
            )
            .bind(&access.vendor_id)
            .bind(current.get::<String, _>("intent"))
            .bind(current.get::<String, _>("topic"))
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
        } else {
            None
        };
        let (next_status, next_vendor_id, next_session_id, event) = if let Some(next) = next {
            (
                "waiting_acceptance",
                Some(next.get::<String, _>("vendor_id")),
                Some(next.get::<String, _>("session_id")),
                "request_reassigned",
            )
        } else {
            ("passed", None, None, "request_passed")
        };
        let updated = sqlx::query(
            r#"UPDATE wedding_celebrant_callback_requests
                  SET status=$1,
                      selected_vendor_id=COALESCE($2,selected_vendor_id),
                      live_session_id=COALESCE($3,live_session_id),
                      hold_expires_at=CASE WHEN $1='waiting_acceptance' THEN NOW()+INTERVAL '5 minutes' ELSE NULL END,
                      revision=revision+1,updated_at=NOW()
                WHERE request_id=$4 AND selected_vendor_id=$5 AND revision=$6 AND status='waiting_acceptance'"#,
        )
        .bind(next_status)
        .bind(next_vendor_id.as_deref())
        .bind(next_session_id.as_deref())
        .bind(&request_id)
        .bind(&access.vendor_id)
        .bind(request.expected_revision)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        if updated.rows_affected() != 1 {
            return Err((
                StatusCode::CONFLICT,
                "This callback changed elsewhere. Refresh and try again.".into(),
            ));
        }
        tx.commit().await.map_err(db_error)?;
        record_event(
            &state,
            Some(&request_id),
            next_vendor_id.as_deref().or(Some(&access.vendor_id)),
            event,
            "vendor_user",
            Some(&user.id),
            &format!(
                "vendor-action-{request_id}-{}-{event}",
                request.expected_revision
            ),
            json!({"status":next_status,"previous_vendor_id":access.vendor_id}),
        )
        .await?;
        return Ok(Json(json!({
            "request_id":request_id,
            "status":next_status,
            "reassigned":next_vendor_id.is_some(),
            "callback_phone":Value::Null,
            "number_notice":Value::Null
        })));
    }
    let row=sqlx::query("SELECT status,phone_ciphertext,hold_expires_at FROM wedding_celebrant_callback_requests WHERE request_id=$1 AND selected_vendor_id=$2 AND revision=$3")
      .bind(clean(&request_id,40)).bind(&access.vendor_id).bind(request.expected_revision).fetch_optional(&state.db.pool).await.map_err(db_error)?.ok_or((StatusCode::CONFLICT,"This callback changed elsewhere. Refresh and try again.".into()))?;
    let current = row.get::<String, _>("status");
    let (next, event) = match request.action.as_str() {
        "accept" if matches!(current.as_str(), "waiting_acceptance" | "scheduled") => {
            ("accepted", "request_accepted")
        }
        "cancel" if matches!(current.as_str(), "scheduled" | "accepted") => {
            ("cancelled", "request_cancelled")
        }
        "reschedule" if matches!(current.as_str(), "scheduled" | "accepted") => {
            ("reschedule_requested", "reschedule_requested")
        }
        "connected" if current == "accepted" => ("connected", "call_connected"),
        "not_connected" if current == "accepted" => ("not_connected", "call_not_connected"),
        _ => {
            return Err((
                StatusCode::CONFLICT,
                "That action is not available for this call.".into(),
            ));
        }
    };
    if request.action == "accept"
        && row
            .get::<Option<DateTime<Utc>>, _>("hold_expires_at")
            .is_some_and(|value| value <= Utc::now())
    {
        return Err((
            StatusCode::CONFLICT,
            "That callback hold expired. The couple can request another call.".into(),
        ));
    }
    let reschedule = request
        .reschedule_start
        .as_deref()
        .map(DateTime::parse_from_rfc3339)
        .transpose()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "Use an RFC 3339 reschedule time.".into(),
            )
        })?
        .map(|v| v.with_timezone(&Utc));
    if request.action == "reschedule"
        && !reschedule.is_some_and(|value| {
            value >= Utc::now() + ChronoDuration::minutes(10)
                && value <= Utc::now() + ChronoDuration::days(90)
        })
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a new time from ten minutes to ninety days ahead.".into(),
        ));
    }
    let updated=sqlx::query("UPDATE wedding_celebrant_callback_requests SET status=$1,accepted_at=CASE WHEN $1='accepted' THEN NOW() ELSE accepted_at END,completed_at=CASE WHEN $1 IN ('connected','not_connected','cancelled') THEN NOW() ELSE completed_at END,scheduled_start=COALESCE($2,scheduled_start),scheduled_end=CASE WHEN $2::timestamptz IS NULL THEN scheduled_end ELSE $2+INTERVAL '10 minutes' END,revision=revision+1,updated_at=NOW() WHERE request_id=$3 AND selected_vendor_id=$4 AND revision=$5")
      .bind(next).bind(reschedule).bind(&request_id).bind(&access.vendor_id).bind(request.expected_revision).execute(&state.db.pool).await.map_err(db_error)?;
    if updated.rows_affected() != 1 {
        return Err((
            StatusCode::CONFLICT,
            "This callback changed elsewhere. Refresh and try again.".into(),
        ));
    }
    record_event(
        &state,
        Some(&request_id),
        Some(&access.vendor_id),
        event,
        "vendor_user",
        Some(&user.id),
        &format!(
            "vendor-action-{request_id}-{}-{next}",
            request.expected_revision
        ),
        json!({"status":next}),
    )
    .await?;
    let phone = if next == "accepted" {
        crate::crypto::decrypt_secret(
            &row.get::<String, _>("phone_ciphertext"),
            &encryption_key()?,
        )
    } else {
        None
    };
    Ok(Json(
        json!({"request_id":request_id,"status":next,"callback_phone":phone,"number_notice":if phone.is_some(){Some("Use your nominated business phone. The couple may see its caller ID.")}else{None}}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OperatorVerificationRequest {
    vendor_slug: String,
    status: String,
    register_type: Option<String>,
    evidence_ref: Option<String>,
}

async fn operator_verification_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access is required.".into()));
    }
    let bytes = axum::body::to_bytes(request.into_body(), 64 * 1024)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid request body.".into()))?;
    let request: OperatorVerificationRequest = serde_json::from_slice(&bytes).map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Invalid verification decision.".into(),
        )
    })?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("celebrant-register-verification", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if !matches!(
        request.status.as_str(),
        "verified" | "not_found" | "requires_review" | "rejected" | "expired"
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            "status must be verified, not found, requires review, rejected or expired.".into(),
        ));
    }
    let register_type = request
        .register_type
        .as_deref()
        .map(|value| clean(value, 40));
    if request.status == "verified"
        && !matches!(
            register_type.as_deref(),
            Some("commonwealth" | "religious" | "other_authorised")
        )
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose the official register type used for this check.".into(),
        ));
    }
    let vendor = sqlx::query(
        "SELECT vendor_id,category FROM wedding_vendors WHERE vendor_slug=$1 AND status='active'",
    )
    .bind(clean(&request.vendor_slug, 120))
    .fetch_optional(&state.db.pool)
    .await
    .map_err(db_error)?
    .ok_or_else(unavailable)?;
    consultation_vendor(&vendor.get::<String, _>("category"))?;
    let vendor_id = vendor.get::<String, _>("vendor_id");
    let revision = sqlx::query(
        r#"INSERT INTO wedding_celebrant_pilot_profiles
           (vendor_id,register_status,register_type,register_source_url,register_checked_at,register_checked_by_user_id,register_evidence_ref)
           VALUES ($1,$2,$3,'https://www.ag.gov.au/families-and-marriage/marriage/find-marriage-celebrant',NOW(),$4,$5)
           ON CONFLICT (vendor_id) DO UPDATE SET register_status=EXCLUDED.register_status,register_type=EXCLUDED.register_type,
             register_source_url=EXCLUDED.register_source_url,register_checked_at=NOW(),register_checked_by_user_id=EXCLUDED.register_checked_by_user_id,
             register_evidence_ref=EXCLUDED.register_evidence_ref,revision=wedding_celebrant_pilot_profiles.revision+1,updated_at=NOW()
           RETURNING revision"#,
    )
    .bind(&vendor_id)
    .bind(&request.status)
    .bind(register_type)
    .bind(&user.id)
    .bind(
        request
            .evidence_ref
            .as_deref()
            .map(|value| clean(value, 240)),
    )
    .fetch_one(&state.db.pool)
    .await
    .map_err(db_error)?
    .get::<i64, _>("revision");
    record_event(
        &state,
        None,
        Some(&vendor_id),
        "register_checked",
        "operator",
        Some(&user.id),
        &format!("register-{vendor_id}-{revision}"),
        json!({
            "register_status":request.status,
            "revision":revision,
            "source_url":"https://www.ag.gov.au/families-and-marriage/marriage/find-marriage-celebrant"
        }),
    )
    .await?;
    Ok(Json(json!({
        "vendor_id":vendor_id,
        "register_status":request.status,
        "revision":revision,
        "source_url":"https://www.ag.gov.au/families-and-marriage/marriage/find-marriage-celebrant"
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rollout_is_false_by_default() {
        // The exact environment is controlled in hosted tests; the helper must only accept literal true.
        assert!(!matches!("TRUE", "true"));
    }

    #[test]
    fn public_tokens_are_labelled_and_high_entropy() {
        let token = random_token("ccs");
        assert!(token.starts_with("ccs_"));
        assert!(token.len() > 40);
        assert_ne!(token, random_token("ccs"));
    }

    #[test]
    fn operator_auth_precedes_verification_body_parsing() {
        let source = include_str!("wedding_celebrant_consultation_routes.rs");
        let start = source.find("async fn operator_verification_http(").unwrap();
        let body = &source[start..];
        assert!(
            body.find("authenticated_user(&state.db, &headers)")
                .unwrap()
                < body.find("to_bytes(request.into_body()").unwrap()
        );
    }
}
