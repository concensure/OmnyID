//! Authenticated, account-scoped Wedding review status and withdrawal.
//!
//! These routes expose lifecycle metadata only. Review narrative stays in the
//! tenant-private AFP message; evidence identifiers and moderator identities
//! are not returned from status/history projections.

use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    enforce_rate_limit,
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{sync::Arc, time::Duration};
use ulid::Ulid;

const MAX_STATUS_ITEMS: i64 = 50;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/reviews/status", get(list_status_http))
        .route(
            "/wedding/reviews/{review_id}/status",
            get(review_status_http),
        )
        .route(
            "/wedding/reviews/{review_id}/draft",
            get(review_draft_http),
        )
        .route(
            "/wedding/reviews/{review_id}/withdraw",
            post(withdraw_review_http),
        )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_REVIEWS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "Wedding review is not available.".into(),
    )
}

fn bad(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn conflict(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(
        error_kind = %error
            .as_database_error()
            .map(|value| format!("{:?}", value.kind()))
            .unwrap_or_else(|| "storage".into()),
        "Wedding review author lifecycle action failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Review status could not be updated just now.".into(),
    )
}

fn valid_id(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

#[derive(Debug, Deserialize)]
struct StatusQuery {
    wedding_plan_id: String,
}

#[derive(Clone, Debug, Serialize)]
struct ReviewStatusItem {
    review_id: String,
    subject_kind: String,
    vendor_id: Option<String>,
    status: String,
    verification_state: String,
    verification_version: u64,
    current_revision: u64,
    published_revision: Option<u64>,
    audience: String,
    experience_kind: String,
    experience_status: String,
    rating: Option<i16>,
    event_month: Option<String>,
    invitation_origin: String,
    evidence_pending: i64,
    evidence_accepted: i64,
    evidence_rejected: i64,
    evidence_purge_scheduled: i64,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct ReviewStatusListReply {
    wedding_plan_id: String,
    items: Vec<ReviewStatusItem>,
}

#[derive(Debug, Serialize)]
struct ReviewHistoryItem {
    event_kind: String,
    actor_role: String,
    revision: Option<u64>,
    reason_code: Option<String>,
    occurred_at: String,
}

#[derive(Debug, Serialize)]
struct ReviewStatusReply {
    review: ReviewStatusItem,
    history: Vec<ReviewHistoryItem>,
}

#[derive(Debug, Serialize)]
struct ReviewDraftReply {
    review_id: String,
    revision: u64,
    title: String,
    body: String,
    next_couple_question: Option<String>,
    context_tags: Vec<String>,
    display_mode: String,
}

fn status_item(row: &sqlx::postgres::PgRow) -> ReviewStatusItem {
    ReviewStatusItem {
        review_id: row.get("review_id"),
        subject_kind: row.get("subject_kind"),
        vendor_id: row.try_get("vendor_id").ok().flatten(),
        status: row.get("status"),
        verification_state: row.get("verification_state"),
        verification_version: row.get::<i64, _>("verification_version") as u64,
        current_revision: row.get::<i64, _>("current_revision") as u64,
        published_revision: row
            .try_get::<i64, _>("published_revision")
            .ok()
            .map(|value| value as u64),
        audience: row.get("audience"),
        experience_kind: row.get("experience_kind"),
        experience_status: row.get("experience_status"),
        rating: row.try_get("rating").ok().flatten(),
        event_month: row.try_get("event_month").ok(),
        invitation_origin: row.get("invitation_origin"),
        evidence_pending: row.get("evidence_pending"),
        evidence_accepted: row.get("evidence_accepted"),
        evidence_rejected: row.get("evidence_rejected"),
        evidence_purge_scheduled: row.get("evidence_purge_scheduled"),
        updated_at: row.get("updated_at"),
    }
}

const STATUS_SELECT: &str = r#"
    SELECT review.review_id,review.subject_kind,review.vendor_id,review.status,
           review.verification_state,review.verification_version,
           review.current_revision,review.published_revision,
           review.invitation_origin,review.updated_at::text,
           revision.audience,revision.experience_kind,revision.experience_status,
           revision.rating,revision.event_month::text,
           COUNT(evidence.evidence_ref_id) FILTER (WHERE evidence.status='pending')::bigint AS evidence_pending,
           COUNT(evidence.evidence_ref_id) FILTER (WHERE evidence.status='accepted')::bigint AS evidence_accepted,
           COUNT(evidence.evidence_ref_id) FILTER (WHERE evidence.status='rejected')::bigint AS evidence_rejected,
           COUNT(evidence.evidence_ref_id) FILTER (WHERE evidence.status='purge_scheduled')::bigint AS evidence_purge_scheduled
      FROM wedding_reviews review
      JOIN wedding_review_revisions revision
        ON revision.review_id=review.review_id AND revision.revision=review.current_revision
      LEFT JOIN wedding_review_evidence_refs evidence
        ON evidence.review_id=review.review_id AND evidence.revision=review.current_revision
"#;

const STATUS_GROUP: &str = r#"
    GROUP BY review.review_id,revision.revision_id
"#;

async fn list_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<StatusQuery>,
) -> Result<Json<ReviewStatusListReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_status", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() {
        return Err(unavailable());
    }
    let wedding_plan_id = query.wedding_plan_id.trim();
    if !valid_id(wedding_plan_id, 180) {
        return Err(bad("Choose a valid wedding plan."));
    }
    let sql = format!(
        "{STATUS_SELECT}
         WHERE review.wedding_plan_id=$1
           AND ((review.owner_user_id=$2 AND EXISTS(
                       SELECT 1 FROM wedding_user_onboarding_state owner
                       WHERE owner.user_id=$2 AND owner.wedding_plan_id=review.wedding_plan_id))
                OR EXISTS(SELECT 1 FROM wedding_plan_memberships member
                          WHERE member.member_user_id=$2 AND member.wedding_plan_id=review.wedding_plan_id
                            AND member.response_workspace_id=review.response_workspace_id
                            AND member.wedding_owner_user_id=review.owner_user_id AND member.status='active'))
         {STATUS_GROUP}
         ORDER BY review.updated_at DESC,review.review_id
         LIMIT $3"
    );
    let rows = sqlx::query(&sql)
        .bind(wedding_plan_id)
        .bind(&user.id)
        .bind(MAX_STATUS_ITEMS)
        .fetch_all(&state.db.pool)
        .await
        .map_err(store_error)?;
    Ok(Json(ReviewStatusListReply {
        wedding_plan_id: wedding_plan_id.to_string(),
        items: rows.iter().map(status_item).collect(),
    }))
}

async fn review_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
) -> Result<Json<ReviewStatusReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_status_detail", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() || !valid_id(&review_id, 200) {
        return Err(unavailable());
    }
    let sql = format!(
        "{STATUS_SELECT}
         WHERE review.review_id=$1
           AND ((review.owner_user_id=$2 AND EXISTS(
                       SELECT 1 FROM wedding_user_onboarding_state owner
                       WHERE owner.user_id=$2 AND owner.wedding_plan_id=review.wedding_plan_id))
                OR EXISTS(SELECT 1 FROM wedding_plan_memberships member
                          WHERE member.member_user_id=$2 AND member.wedding_plan_id=review.wedding_plan_id
                            AND member.response_workspace_id=review.response_workspace_id
                            AND member.wedding_owner_user_id=review.owner_user_id AND member.status='active'))
         {STATUS_GROUP}"
    );
    let row = sqlx::query(&sql)
        .bind(&review_id)
        .bind(&user.id)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(store_error)?
        .ok_or_else(unavailable)?;
    let events = sqlx::query(
        "SELECT event_kind,actor_role,revision,reason_code,occurred_at::text
         FROM wedding_review_events WHERE review_id=$1
         ORDER BY occurred_at,event_id LIMIT 100",
    )
    .bind(&review_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(store_error)?
    .into_iter()
    .map(|event| ReviewHistoryItem {
        event_kind: event.get("event_kind"),
        actor_role: event.get("actor_role"),
        revision: event
            .try_get::<i64, _>("revision")
            .ok()
            .map(|value| value as u64),
        reason_code: event.try_get("reason_code").ok().flatten(),
        occurred_at: event.get("occurred_at"),
    })
    .collect();
    Ok(Json(ReviewStatusReply {
        review: status_item(&row),
        history: events,
    }))
}

async fn review_draft_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
) -> Result<Json<ReviewDraftReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_author_draft", &headers),
        RateLimitPolicy { max_requests: 30, window: Duration::from_secs(60) },
    ).await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() || !valid_id(&review_id, 200) { return Err(unavailable()); }
    let row = sqlx::query(
        "SELECT review.current_revision,review.current_afp_message_id,
                revision.authored_by_user_id
         FROM wedding_reviews review
         JOIN wedding_review_revisions revision
           ON revision.review_id=review.review_id AND revision.revision=review.current_revision
         WHERE review.review_id=$1
           AND ((review.owner_user_id=$2 AND EXISTS(
                       SELECT 1 FROM wedding_user_onboarding_state owner
                       WHERE owner.user_id=$2 AND owner.wedding_plan_id=review.wedding_plan_id))
                OR EXISTS(SELECT 1 FROM wedding_plan_memberships member
                          WHERE member.member_user_id=$2 AND member.wedding_plan_id=review.wedding_plan_id
                            AND member.response_workspace_id=review.response_workspace_id
                            AND member.wedding_owner_user_id=review.owner_user_id AND member.status='active'))",
    )
    .bind(&review_id).bind(&user.id)
    .fetch_optional(&state.db.pool).await.map_err(store_error)?
    .ok_or_else(unavailable)?;
    let revision: i64 = row.get("current_revision");
    let authored_by: String = row.get("authored_by_user_id");
    if authored_by != user.id {
        return Err((StatusCode::FORBIDDEN, "Only the author can edit this revision.".into()));
    }
    let content = state.db.wedding_review_revision_content(
        &authored_by, row.get("current_afp_message_id"), &review_id, revision,
    ).await.map_err(store_error)?.ok_or_else(unavailable)?;
    let text = |key: &str, max: usize| content.get(key).and_then(serde_json::Value::as_str)
        .map(str::trim).filter(|value| value.chars().count() <= max).unwrap_or("").to_string();
    Ok(Json(ReviewDraftReply {
        review_id,
        revision: revision as u64,
        title: text("title", 180),
        body: text("body", 8_000),
        next_couple_question: content.get("next_couple_question").and_then(serde_json::Value::as_str)
            .map(str::trim).filter(|value| !value.is_empty() && value.chars().count() <= 500).map(str::to_string),
        context_tags: content.get("context_tags").and_then(serde_json::Value::as_array)
            .map(|values| values.iter().filter_map(serde_json::Value::as_str).take(12).map(str::to_string).collect()).unwrap_or_default(),
        display_mode: text("display_mode", 60),
    }))
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct WithdrawRequest {
    expected_revision: u64,
    idempotency_key: String,
    reason_code: String,
}

#[derive(Clone, Debug, Serialize)]
struct WithdrawReply {
    review_id: String,
    status: String,
    revision: u64,
    affected_publications: u64,
    scheduled_evidence: u64,
    replayed: bool,
}

fn withdrawal_hash(request: &WithdrawRequest) -> String {
    hex::encode(Sha256::digest(
        serde_json::to_vec(request).unwrap_or_default(),
    ))
}

async fn withdraw_review_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Json(request): Json<WithdrawRequest>,
) -> Result<Json<WithdrawReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_withdraw", &headers),
        RateLimitPolicy {
            max_requests: 15,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let key = request.idempotency_key.trim();
    let reason = request.reason_code.trim().to_ascii_lowercase();
    if !enabled()
        || !valid_id(&review_id, 200)
        || !(8..=180).contains(&key.len())
        || !valid_id(key, 180)
        || !["author_request", "privacy_request"].contains(&reason.as_str())
    {
        return Err(bad("Choose a valid review withdrawal request."));
    }
    let hash = withdrawal_hash(&request);
    let mut transaction = state.db.pool.begin().await.map_err(store_error)?;
    if let Some(receipt) = sqlx::query(
        "SELECT review_id,revision,result_status,affected_publications,
                scheduled_evidence,request_hash
         FROM wedding_review_lifecycle_receipts
         WHERE actor_user_id=$1 AND idempotency_key=$2 FOR UPDATE",
    )
    .bind(&user.id)
    .bind(key)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_error)?
    {
        if receipt.get::<String, _>("request_hash") != hash
            || receipt.get::<String, _>("review_id") != review_id
        {
            return Err(conflict(
                "That retry key was already used for another review command.",
            ));
        }
        let reply = WithdrawReply {
            review_id,
            status: receipt.get("result_status"),
            revision: receipt.get::<i64, _>("revision") as u64,
            affected_publications: receipt.get::<i32, _>("affected_publications") as u64,
            scheduled_evidence: receipt.get::<i32, _>("scheduled_evidence") as u64,
            replayed: true,
        };
        transaction.commit().await.map_err(store_error)?;
        return Ok(Json(reply));
    }
    let review = sqlx::query(
        "SELECT review.owner_user_id,review.wedding_plan_id,review.response_workspace_id,review.status,
                review.current_revision,revision.authored_by_user_id
         FROM wedding_reviews review
         JOIN wedding_review_revisions revision
           ON revision.review_id=review.review_id AND revision.revision=review.current_revision
         WHERE review.review_id=$1 FOR UPDATE",
    )
    .bind(&review_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let owns_plan: bool = sqlx::query_scalar(
        "SELECT ($1=$4 AND EXISTS(SELECT 1 FROM wedding_user_onboarding_state
                                  WHERE user_id=$1 AND wedding_plan_id=$2))
                OR EXISTS(SELECT 1 FROM wedding_plan_memberships
                          WHERE member_user_id=$1 AND wedding_plan_id=$2
                            AND response_workspace_id=$3 AND wedding_owner_user_id=$4
                            AND status='active')",
    )
    .bind(&user.id)
    .bind(review.get::<String, _>("wedding_plan_id"))
    .bind(review.get::<String, _>("response_workspace_id"))
    .bind(review.get::<String, _>("owner_user_id"))
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_error)?;
    if !owns_plan {
        return Err(unavailable());
    }
    let revision: i64 = review.get("current_revision");
    if request.expected_revision != revision as u64 {
        return Err(conflict(
            "The review changed. Refresh before withdrawing it.",
        ));
    }
    if review.get::<String, _>("status") == "withdrawn" {
        return Err(conflict("This review is already withdrawn."));
    }
    let publications = sqlx::query(
        "UPDATE wedding_review_publications SET status='withdrawn',updated_at=NOW()
         WHERE review_id=$1 AND status='published'",
    )
    .bind(&review_id)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?
    .rows_affected();
    let evidence = sqlx::query(
        "UPDATE wedding_review_evidence_refs
         SET status='purge_scheduled',expires_at=LEAST(COALESCE(expires_at,NOW()),NOW())
         WHERE review_id=$1 AND created_by_user_id=$2
           AND status <> 'purged' AND purged_at IS NULL",
    )
    .bind(&review_id)
    .bind(&user.id)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?
    .rows_affected();
    sqlx::query(
        "UPDATE wedding_reviews SET status='withdrawn',withdrawn_at=NOW(),updated_at=NOW()
         WHERE review_id=$1",
    )
    .bind(&review_id)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,revision,
             reason_code,dedupe_key,metadata)
         VALUES ($1,$2,'withdrawn','author',$3,$4,$5,$6,$7)
         ON CONFLICT (review_id,event_kind,dedupe_key) DO NOTHING",
    )
    .bind(format!("review-event-{}", Ulid::new()))
    .bind(&review_id)
    .bind(&user.id)
    .bind(revision)
    .bind(&reason)
    .bind(key)
    .bind(serde_json::json!({"schema_version":1,"reason_code":reason,"result":"withdrawn"}))
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    sqlx::query(
        "INSERT INTO wedding_review_lifecycle_receipts
            (receipt_id,review_id,actor_user_id,command,idempotency_key,request_hash,
             revision,result_status,affected_publications,scheduled_evidence)
         VALUES ($1,$2,$3,'withdraw',$4,$5,$6,'withdrawn',$7,$8)",
    )
    .bind(format!("review-lifecycle-receipt-{}", Ulid::new()))
    .bind(&review_id)
    .bind(&user.id)
    .bind(key)
    .bind(&hash)
    .bind(revision)
    .bind(i32::try_from(publications).unwrap_or(i32::MAX))
    .bind(i32::try_from(evidence).unwrap_or(i32::MAX))
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    transaction.commit().await.map_err(store_error)?;
    Ok(Json(WithdrawReply {
        review_id,
        status: "withdrawn".into(),
        revision: revision as u64,
        affected_publications: publications,
        scheduled_evidence: evidence,
        replayed: false,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn author_status_projection_is_bounded() {
        assert_eq!(MAX_STATUS_ITEMS, 50);
        assert!(!STATUS_SELECT.contains("public_snapshot"));
        assert!(!STATUS_SELECT.contains("attachment_id"));
    }

    #[test]
    fn withdrawal_receipt_changes_with_reason_or_revision() {
        let first = WithdrawRequest {
            expected_revision: 1,
            idempotency_key: "withdraw-0001".into(),
            reason_code: "author_request".into(),
        };
        let second = WithdrawRequest {
            expected_revision: 2,
            ..WithdrawRequest {
                expected_revision: first.expected_revision,
                idempotency_key: first.idempotency_key.clone(),
                reason_code: first.reason_code.clone(),
            }
        };
        assert_ne!(withdrawal_hash(&first), withdrawal_hash(&second));
    }
}
