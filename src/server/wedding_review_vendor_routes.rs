//! Authenticated vendor review boundary.
//!
//! Vendors receive only already-public review fields plus their own workflow
//! state. Reply and report narrative is written to the acting member's
//! tenant-private AFP store; it never enters a lifecycle event or report row.

use super::{
    AppState,
    auth::store_private_app_message,
    status_to_http,
    wedding_vendor_portal_routes::{VendorPermission, require_vendor_access},
};
use crate::message::AFPMessage;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::sync::Arc;
use ulid::Ulid;

const MAX_REPLY_CHARS: usize = 4_000;
const MAX_REPORT_CHARS: usize = 2_000;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/vendor/{vendor_slug}/reviews",
            get(list_vendor_reviews_http),
        )
        .route(
            "/wedding/vendor/{vendor_slug}/reviews/{publication_id}/reply",
            post(reply_http),
        )
        .route(
            "/wedding/vendor/{vendor_slug}/reviews/{publication_id}/report",
            post(report_http),
        )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_REVIEWS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, "Wedding review is not available.".into())
}

fn bad(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn conflict(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(error_kind=%error, "Wedding vendor review action failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "The review action could not be saved just now.".into(),
    )
}

fn valid_id(value: &str) -> bool {
    (8..=200).contains(&value.len())
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn clean_body(value: &str, limit: usize) -> Result<String, (StatusCode, String)> {
    let body = value.trim();
    if body.is_empty()
        || body.chars().count() > limit
        || body.chars().any(|character| character.is_control() && character != '\n')
    {
        return Err(bad("Keep this message within the form limits."));
    }
    Ok(body.to_string())
}

fn request_hash<T: Serialize>(value: &T) -> String {
    hex::encode(Sha256::digest(
        serde_json::to_vec(value).unwrap_or_default(),
    ))
}

fn deterministic_ulid(namespace: &str, value: &str) -> String {
    let digest = Sha256::digest(format!("{namespace}\0{value}").as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ulid::from(u128::from_be_bytes(bytes)).to_string()
}

#[derive(Debug, Serialize)]
struct VendorReviewItem {
    publication_id: String,
    public_snapshot: Value,
    published_at: String,
    reply_id: Option<String>,
    reply_revision: Option<u64>,
    reply_status: Option<String>,
    open_report: bool,
}

#[derive(Debug, Serialize)]
struct VendorReviewListReply {
    vendor_id: String,
    vendor_name: String,
    items: Vec<VendorReviewItem>,
}

async fn list_vendor_reviews_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_slug): Path<String>,
) -> Result<Json<VendorReviewListReply>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    let (_, access) =
        require_vendor_access(&state, &headers, &vendor_slug, VendorPermission::View).await?;
    let rows = sqlx::query(
        r#"SELECT publication.publication_id,publication.public_snapshot,
                  publication.published_at::text,
                  reply.reply_id,reply.revision,reply.status,
                  EXISTS(SELECT 1 FROM wedding_review_reports report
                         WHERE report.review_id=publication.review_id
                           AND report.vendor_id=publication.vendor_id
                           AND report.status='open') AS open_report
           FROM wedding_review_publications publication
           LEFT JOIN LATERAL (
             SELECT reply_id,revision,status
             FROM wedding_review_vendor_replies
             WHERE review_id=publication.review_id AND vendor_id=publication.vendor_id
             ORDER BY revision DESC LIMIT 1
           ) reply ON TRUE
           WHERE publication.vendor_id=$1 AND publication.status='published'
           ORDER BY publication.published_at DESC,publication.publication_id"#,
    )
    .bind(&access.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(store_error)?;
    Ok(Json(VendorReviewListReply {
        vendor_id: access.vendor_id,
        vendor_name: access.vendor_name,
        items: rows
            .into_iter()
            .map(|row| VendorReviewItem {
                publication_id: row.get("publication_id"),
                public_snapshot: row.get("public_snapshot"),
                published_at: row.get("published_at"),
                reply_id: row.try_get("reply_id").ok().flatten(),
                reply_revision: row
                    .try_get::<i64, _>("revision")
                    .ok()
                    .map(|value| value as u64),
                reply_status: row.try_get("status").ok().flatten(),
                open_report: row.get("open_report"),
            })
            .collect(),
    }))
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ReplyRequest {
    body: String,
    expected_revision: u64,
    idempotency_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ReportRequest {
    reason_code: String,
    detail: String,
    idempotency_key: String,
}

#[derive(Debug, Serialize)]
struct VendorCommandReply {
    result_id: String,
    status: String,
    replayed: bool,
}

async fn publication_review(
    state: &AppState,
    publication_id: &str,
    vendor_id: &str,
) -> Result<String, (StatusCode, String)> {
    if !valid_id(publication_id) {
        return Err(unavailable());
    }
    sqlx::query_scalar(
        "SELECT review_id FROM wedding_review_publications WHERE publication_id=$1 AND vendor_id=$2 AND status='published'",
    )
    .bind(publication_id)
    .bind(vendor_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)
}

async fn replay(
    state: &AppState,
    actor: &str,
    vendor: &str,
    key: &str,
    hash: &str,
    kind: &str,
    review: &str,
) -> Result<Option<VendorCommandReply>, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT request_hash,command_kind,review_id,result_id,result_status,completed_at FROM wedding_review_vendor_command_receipts WHERE actor_user_id=$1 AND vendor_id=$2 AND idempotency_key=$3",
    )
    .bind(actor)
    .bind(vendor)
    .bind(key)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?;
    let Some(row) = row else { return Ok(None) };
    if row.get::<String, _>("request_hash") != hash
        || row.get::<String, _>("command_kind") != kind
        || row.get::<String, _>("review_id") != review
    {
        return Err(conflict("That retry key was already used for another action."));
    }
    if row.try_get::<chrono::DateTime<Utc>, _>("completed_at").is_err() {
        return Err(conflict("That action is already in progress."));
    }
    Ok(Some(VendorCommandReply {
        result_id: row.get("result_id"),
        status: row.get("result_status"),
        replayed: true,
    }))
}

fn vendor_message(
    user_id: &str,
    vendor_id: &str,
    review_id: &str,
    message_id: &str,
    subtype: &str,
    content: Value,
) -> AFPMessage {
    AFPMessage {
        protocol: "afp-v1".into(),
        id: message_id.into(),
        thread_id: deterministic_ulid("wedding-review-vendor-thread", review_id),
        parent_id: None,
        from: format!("user://{user_id}"),
        to: vec!["agent://wedding-vendor-portal".into()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "ledger".into(),
        kind: Some("observation".into()),
        supertags: vec!["wedding".into(), "review".into(), "vendor".into()],
        subtype: Some(subtype.into()),
        content,
        metadata: Some(json!({
            "store":true,
            "origin":"server_wedding_review_vendor_boundary",
            "reviewId":review_id,
            "vendorId":vendor_id
        })),
        signature: "server:wedding-review-vendor-boundary:v1".into(),
        encryption: None,
        views: vec![],
        references: vec![
            json!({"type":"wedding_review","target":review_id,"label":"Wedding review"}),
            json!({"type":"wedding_vendor","target":vendor_id,"label":"Vendor"}),
        ],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    }
}

async fn reply_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((vendor_slug, publication_id)): Path<(String, String)>,
    Json(request): Json<ReplyRequest>,
) -> Result<Json<VendorCommandReply>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    let (user, access) =
        require_vendor_access(&state, &headers, &vendor_slug, VendorPermission::Publish).await?;
    let review_id = publication_review(&state, &publication_id, &access.vendor_id).await?;
    let body = clean_body(&request.body, MAX_REPLY_CHARS)?;
    let key = request.idempotency_key.trim();
    if !valid_id(key) {
        return Err(bad("Provide a valid retry key."));
    }
    let hash = request_hash(&request);
    if let Some(reply) = replay(&state, &user.id, &access.vendor_id, key, &hash, "reply", &review_id).await? {
        return Ok(Json(reply));
    }
    let current = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT MAX(revision) FROM wedding_review_vendor_replies WHERE review_id=$1 AND vendor_id=$2",
    )
    .bind(&review_id)
    .bind(&access.vendor_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(store_error)?
    .unwrap_or_default();
    if current != request.expected_revision as i64 {
        return Err(conflict(format!("This reply changed elsewhere. Reload revision {current}.")));
    }
    let receipt_id = format!("review-vendor-receipt-{}", Ulid::new());
    let claimed = sqlx::query("INSERT INTO wedding_review_vendor_command_receipts (receipt_id,actor_user_id,vendor_id,idempotency_key,request_hash,command_kind,review_id) VALUES ($1,$2,$3,$4,$5,'reply',$6) ON CONFLICT (actor_user_id,vendor_id,idempotency_key) DO NOTHING")
        .bind(&receipt_id).bind(&user.id).bind(&access.vendor_id).bind(key).bind(&hash).bind(&review_id)
        .execute(&state.db.pool).await.map_err(store_error)?.rows_affected() == 1;
    if !claimed {
        return replay(&state, &user.id, &access.vendor_id, key, &hash, "reply", &review_id).await?
            .map(Json).ok_or_else(|| conflict("That reply save is already in progress."));
    }
    state.db.ensure_user_private_schema(&user.id).await.map_err(store_error)?;
    let revision = current + 1;
    let reply_id = format!("review-reply-{}", Ulid::new());
    let message_id = deterministic_ulid("wedding-review-vendor-reply", &format!("{}:{key}", user.id));
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        vendor_message(
            &user.id,
            &access.vendor_id,
            &review_id,
            &message_id,
            "wedding_review_vendor_reply",
            json!({"schema_version":1,"review_id":review_id,"vendor_id":access.vendor_id,"revision":revision,"body":body}),
        ),
    )
    .await
    .map_err(status_to_http)?;
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("INSERT INTO wedding_review_vendor_replies (reply_id,review_id,vendor_id,revision,afp_message_id,status,authored_by_user_id) VALUES ($1,$2,$3,$4,$5,'submitted',$6)")
        .bind(&reply_id).bind(&review_id).bind(&access.vendor_id).bind(revision).bind(&message_id).bind(&user.id)
        .execute(&mut *tx).await.map_err(store_error)?;
    sqlx::query("INSERT INTO wedding_review_events (event_id,review_id,event_kind,actor_role,actor_user_id,revision,dedupe_key,metadata) VALUES ($1,$2,'vendor_reply_submitted','vendor_manager',$3,$4,$5,$6) ON CONFLICT DO NOTHING")
        .bind(format!("review-event-{}", Ulid::new())).bind(&review_id).bind(&user.id).bind(revision).bind(key)
        .bind(json!({"schema_version":1,"vendor_id":access.vendor_id,"result":"submitted"}))
        .execute(&mut *tx).await.map_err(store_error)?;
    sqlx::query("UPDATE wedding_review_vendor_command_receipts SET result_id=$4,result_status='submitted',completed_at=NOW() WHERE actor_user_id=$1 AND vendor_id=$2 AND idempotency_key=$3")
        .bind(&user.id).bind(&access.vendor_id).bind(key).bind(&reply_id)
        .execute(&mut *tx).await.map_err(store_error)?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(VendorCommandReply { result_id: reply_id, status: "submitted".into(), replayed: false }))
}

async fn report_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((vendor_slug, publication_id)): Path<(String, String)>,
    Json(request): Json<ReportRequest>,
) -> Result<Json<VendorCommandReply>, (StatusCode, String)> {
    if !enabled() {
        return Err(unavailable());
    }
    let (user, access) =
        require_vendor_access(&state, &headers, &vendor_slug, VendorPermission::Publish).await?;
    let review_id = publication_review(&state, &publication_id, &access.vendor_id).await?;
    let reason = request.reason_code.trim().to_ascii_lowercase();
    if !["personal_information", "abuse", "unsupported_claim", "conflict", "policy_other"].contains(&reason.as_str()) {
        return Err(bad("Choose a valid report reason."));
    }
    let detail = clean_body(&request.detail, MAX_REPORT_CHARS)?;
    let key = request.idempotency_key.trim();
    if !valid_id(key) {
        return Err(bad("Provide a valid retry key."));
    }
    let hash = request_hash(&request);
    if let Some(reply) = replay(&state, &user.id, &access.vendor_id, key, &hash, "report", &review_id).await? {
        return Ok(Json(reply));
    }
    if sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM wedding_review_reports WHERE review_id=$1 AND vendor_id=$2 AND status='open')")
        .bind(&review_id).bind(&access.vendor_id).fetch_one(&state.db.pool).await.map_err(store_error)? {
        return Err(conflict("This review already has an open report."));
    }
    let receipt_id = format!("review-vendor-receipt-{}", Ulid::new());
    let claimed = sqlx::query("INSERT INTO wedding_review_vendor_command_receipts (receipt_id,actor_user_id,vendor_id,idempotency_key,request_hash,command_kind,review_id) VALUES ($1,$2,$3,$4,$5,'report',$6) ON CONFLICT (actor_user_id,vendor_id,idempotency_key) DO NOTHING")
        .bind(&receipt_id).bind(&user.id).bind(&access.vendor_id).bind(key).bind(&hash).bind(&review_id)
        .execute(&state.db.pool).await.map_err(store_error)?.rows_affected() == 1;
    if !claimed {
        return replay(&state, &user.id, &access.vendor_id, key, &hash, "report", &review_id).await?
            .map(Json).ok_or_else(|| conflict("That report save is already in progress."));
    }
    state.db.ensure_user_private_schema(&user.id).await.map_err(store_error)?;
    let report_id = format!("review-report-{}", Ulid::new());
    let message_id = deterministic_ulid("wedding-review-vendor-report", &format!("{}:{key}", user.id));
    store_private_app_message(
        &state.db, &state.metrics, &state.relay_tx, &user.id,
        vendor_message(
            &user.id, &access.vendor_id, &review_id, &message_id,
            "wedding_review_vendor_report",
            json!({"schema_version":1,"review_id":review_id,"vendor_id":access.vendor_id,"report_id":report_id,"reason_code":reason,"detail":detail}),
        ),
    ).await.map_err(status_to_http)?;
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("INSERT INTO wedding_review_reports (report_id,review_id,vendor_id,reported_by_user_id,afp_message_id,reason_code) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(&report_id).bind(&review_id).bind(&access.vendor_id).bind(&user.id).bind(&message_id).bind(&reason)
        .execute(&mut *tx).await.map_err(store_error)?;
    sqlx::query("INSERT INTO wedding_review_events (event_id,review_id,event_kind,actor_role,actor_user_id,reason_code,dedupe_key,metadata) VALUES ($1,$2,'report_created','vendor_manager',$3,$4,$5,$6) ON CONFLICT DO NOTHING")
        .bind(format!("review-event-{}", Ulid::new())).bind(&review_id).bind(&user.id).bind(&reason).bind(key)
        .bind(json!({"schema_version":1,"vendor_id":access.vendor_id,"result":"open"}))
        .execute(&mut *tx).await.map_err(store_error)?;
    sqlx::query("UPDATE wedding_review_vendor_command_receipts SET result_id=$4,result_status='open',completed_at=NOW() WHERE actor_user_id=$1 AND vendor_id=$2 AND idempotency_key=$3")
        .bind(&user.id).bind(&access.vendor_id).bind(key).bind(&report_id)
        .execute(&mut *tx).await.map_err(store_error)?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(VendorCommandReply { result_id: report_id, status: "open".into(), replayed: false }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendor_body_bounds_and_ids_fail_closed() {
        assert!(clean_body("A clear factual reply", MAX_REPLY_CHARS).is_ok());
        assert!(clean_body("\u{0000}", MAX_REPLY_CHARS).is_err());
        assert!(valid_id("review-retry-123"));
        assert!(!valid_id("short"));
    }
}
