//! Audited operator handling for vendor replies and vendor reports.
//!
//! Opening private vendor-authored narrative is explicit and audited. A reply
//! can be published or rejected, never silently rewritten. Reports can resolve
//! workflow state but cannot directly suppress a review; restriction remains
//! a separate reasoned review-moderation decision.

use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    cost_controls::operator_access_allowed, enforce_rate_limit,
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{sync::Arc, time::Duration};
use ulid::Ulid;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/admin/wedding/reviews/replies/{reply_id}/moderation",
            get(reply_preview_http).post(reply_decide_http),
        )
        .route(
            "/admin/wedding/reviews/reports/{report_id}/resolve",
            post(resolve_report_http),
        )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_REVIEWS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, "Wedding review item is not available.".into())
}

fn bad(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn conflict(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(error_kind=%error, "Wedding review vendor moderation failed");
    (StatusCode::SERVICE_UNAVAILABLE, "That moderation action could not be saved just now.".into())
}

async fn operator(
    state: &Arc<AppState>,
    headers: &HeaderMap,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    let user = authenticated_user(&state.db, headers).await?;
    if !enabled() || !operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "operator access required".into()));
    }
    Ok(user)
}

fn valid_id(value: &str) -> bool {
    (8..=200).contains(&value.len())
        && value.chars().all(|c| c.is_ascii_alphanumeric() || "_:./-".contains(c))
}

#[derive(Debug, Deserialize)]
struct PreviewQuery {
    purpose: String,
}

#[derive(Debug, Serialize)]
struct ReplyPreview {
    reply_id: String,
    review_id: String,
    revision: u64,
    vendor_id: String,
    vendor_name: String,
    status: String,
    body: String,
}

async fn load_reply(
    state: &AppState,
    reply_id: &str,
) -> Result<ReplyPreview, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT reply.reply_id,reply.review_id,reply.revision,reply.vendor_id,
                reply.status,reply.afp_message_id,reply.authored_by_user_id,
                vendor.vendor_name
         FROM wedding_review_vendor_replies reply
         JOIN wedding_vendors vendor ON vendor.vendor_id=reply.vendor_id
         WHERE reply.reply_id=$1",
    )
    .bind(reply_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let review_id: String = row.get("review_id");
    let content = state
        .db
        .wedding_review_vendor_content(
            row.get("authored_by_user_id"),
            row.get("afp_message_id"),
            "wedding_review_vendor_reply",
            &review_id,
        )
        .await
        .map_err(store_error)?
        .ok_or_else(|| conflict("The private reply revision is unavailable."))?;
    let body = content.get("body").and_then(Value::as_str).unwrap_or("").trim();
    if body.is_empty() || body.chars().count() > 4_000 {
        return Err(conflict("The private reply revision cannot be safely previewed."));
    }
    Ok(ReplyPreview {
        reply_id: row.get("reply_id"),
        review_id,
        revision: row.get::<i64, _>("revision") as u64,
        vendor_id: row.get("vendor_id"),
        vendor_name: row.get("vendor_name"),
        status: row.get("status"),
        body: body.to_string(),
    })
}

async fn reply_preview_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(reply_id): Path<String>,
    Query(query): Query<PreviewQuery>,
) -> Result<Json<ReplyPreview>, (StatusCode, String)> {
    enforce_rate_limit(&state, authenticated_rate_limit_key("wedding_review_reply_preview", &headers), RateLimitPolicy { max_requests: 30, window: Duration::from_secs(60) }).await?;
    let user = operator(&state, &headers).await?;
    if !valid_id(&reply_id) || !["moderation", "appeal", "privacy"].contains(&query.purpose.as_str()) {
        return Err(bad("Choose a valid reply and access purpose."));
    }
    let preview = load_reply(&state, &reply_id).await?;
    sqlx::query("INSERT INTO wedding_review_reply_access_log (access_id,reply_id,revision,operator_user_id,purpose) VALUES ($1,$2,$3,$4,$5)")
        .bind(format!("review-reply-access-{}", Ulid::new())).bind(&reply_id).bind(preview.revision as i64).bind(&user.id).bind(&query.purpose)
        .execute(&state.db.pool).await.map_err(store_error)?;
    Ok(Json(preview))
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ReplyDecisionRequest {
    expected_revision: u64,
    decision: String,
    reason_code: String,
    idempotency_key: String,
}

#[derive(Debug, Serialize)]
struct ReplyDecisionReply {
    reply_id: String,
    status: String,
    replayed: bool,
}

async fn reply_decide_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(reply_id): Path<String>,
    Json(request): Json<ReplyDecisionRequest>,
) -> Result<Json<ReplyDecisionReply>, (StatusCode, String)> {
    enforce_rate_limit(&state, authenticated_rate_limit_key("wedding_review_reply_decision", &headers), RateLimitPolicy { max_requests: 20, window: Duration::from_secs(60) }).await?;
    let user = operator(&state, &headers).await?;
    let decision = request.decision.trim().to_ascii_lowercase();
    let reason = request.reason_code.trim().to_ascii_lowercase();
    let key = request.idempotency_key.trim();
    let valid_reason = match decision.as_str() {
        "approve" => reason == "approved",
        "reject" => ["personal_information", "abuse", "unsupported_claim", "correction_required", "policy_other"].contains(&reason.as_str()),
        _ => false,
    };
    if !valid_id(&reply_id) || !valid_id(key) || !valid_reason {
        return Err(bad("Choose a valid reply decision, reason and retry key."));
    }
    let hash = hex::encode(Sha256::digest(serde_json::to_vec(&request).unwrap_or_default()));
    if let Some(row) = sqlx::query("SELECT request_hash,reply_id,result_status,completed_at FROM wedding_review_reply_moderation_receipts WHERE operator_user_id=$1 AND idempotency_key=$2")
        .bind(&user.id).bind(key).fetch_optional(&state.db.pool).await.map_err(store_error)? {
        if row.get::<String,_>("request_hash") != hash || row.get::<String,_>("reply_id") != reply_id {
            return Err(conflict("That retry key was already used for another decision."));
        }
        if row.try_get::<chrono::DateTime<Utc>,_>("completed_at").is_err() {
            return Err(conflict("That decision is already in progress."));
        }
        return Ok(Json(ReplyDecisionReply { reply_id, status: row.get("result_status"), replayed: true }));
    }
    let preview = load_reply(&state, &reply_id).await?;
    if preview.revision != request.expected_revision || preview.status != "submitted" {
        return Err(conflict("The reply changed. Refresh it before deciding."));
    }
    let opened: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM wedding_review_reply_access_log WHERE reply_id=$1 AND revision=$2 AND operator_user_id=$3 AND accessed_at >= NOW() - INTERVAL '24 hours')")
        .bind(&reply_id).bind(preview.revision as i64).bind(&user.id).fetch_one(&state.db.pool).await.map_err(store_error)?;
    if !opened { return Err(conflict("Open the current reply preview before deciding it.")); }
    let status = if decision == "approve" { "published" } else { "rejected" };
    let snapshot = (decision == "approve").then(|| json!({
        "schema_version":1,
        "attribution":preview.vendor_name,
        "body":preview.body
    }));
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("INSERT INTO wedding_review_reply_moderation_receipts (receipt_id,operator_user_id,idempotency_key,request_hash,reply_id,revision) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(format!("review-reply-moderation-{}", Ulid::new())).bind(&user.id).bind(key).bind(&hash).bind(&reply_id).bind(preview.revision as i64)
        .execute(&mut *tx).await.map_err(store_error)?;
    sqlx::query("UPDATE wedding_review_vendor_replies SET status=$2,public_snapshot=$3,moderated_by_user_id=$4,moderation_reason=$5,updated_at=NOW() WHERE reply_id=$1 AND status='submitted'")
        .bind(&reply_id).bind(status).bind(snapshot).bind(&user.id).bind(&reason)
        .execute(&mut *tx).await.map_err(store_error)?;
    if status == "published" {
        sqlx::query("INSERT INTO wedding_review_events (event_id,review_id,event_kind,actor_role,actor_user_id,revision,dedupe_key,metadata) VALUES ($1,$2,'vendor_reply_published','operator',$3,$4,$5,$6) ON CONFLICT DO NOTHING")
            .bind(format!("review-event-{}", Ulid::new())).bind(&preview.review_id).bind(&user.id).bind(preview.revision as i64).bind(key)
            .bind(json!({"schema_version":1,"vendor_id":preview.vendor_id,"result":"published"}))
            .execute(&mut *tx).await.map_err(store_error)?;
    }
    sqlx::query("UPDATE wedding_review_reply_moderation_receipts SET result_status=$3,completed_at=NOW() WHERE operator_user_id=$1 AND idempotency_key=$2")
        .bind(&user.id).bind(key).bind(status).execute(&mut *tx).await.map_err(store_error)?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(ReplyDecisionReply { reply_id, status: status.into(), replayed: false }))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ResolveReportRequest {
    resolution: String,
}

#[derive(Debug, Serialize)]
struct ResolveReportReply {
    report_id: String,
    status: String,
}

async fn resolve_report_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(report_id): Path<String>,
    Json(request): Json<ResolveReportRequest>,
) -> Result<Json<ResolveReportReply>, (StatusCode, String)> {
    let user = operator(&state, &headers).await?;
    let resolution = request.resolution.trim().to_ascii_lowercase();
    if !valid_id(&report_id) || !["review_restricted", "review_corrected", "no_policy_breach", "duplicate_report", "other"].contains(&resolution.as_str()) {
        return Err(bad("Choose a valid report resolution."));
    }
    let status = if ["no_policy_breach", "duplicate_report"].contains(&resolution.as_str()) { "dismissed" } else { "resolved" };
    let changed = sqlx::query("UPDATE wedding_review_reports SET status=$2,resolution_reason=$3,handled_by_user_id=$4,resolved_at=NOW(),updated_at=NOW() WHERE report_id=$1 AND status='open'")
        .bind(&report_id).bind(status).bind(&resolution).bind(&user.id).execute(&state.db.pool).await.map_err(store_error)?.rows_affected();
    if changed != 1 { return Err(conflict("That report is no longer open.")); }
    Ok(Json(ResolveReportReply { report_id, status: status.into() }))
}
