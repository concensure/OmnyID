//! Operator moderation and bounded Wedding review publication.
//!
//! Operators see only the authored fields that could become public. Opening a
//! preview is audited and a decision must follow a recent preview of the same
//! revision. Evidence, account identifiers and private duplicate signals never
//! enter the publication snapshot.

use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    cost_controls::operator_access_allowed, enforce_rate_limit,
};
use crate::wedding_reviews::{
    ReviewAudience, ReviewExperienceKind, ReviewPolicyInput, ReviewSubjectKind,
    ReviewVerificationState, validate_policy,
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use std::{sync::Arc, time::Duration};
use ulid::Ulid;

const MAX_QUEUE_ITEMS: i64 = 100;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/admin/wedding/reviews/moderation", get(queue_http))
        .route(
            "/admin/wedding/reviews/{review_id}/moderation",
            get(preview_http).post(decide_http),
        )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_REVIEWS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "Wedding review moderation is not available.".into(),
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
        "Wedding review moderation action failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Review moderation could not be completed just now.".into(),
    )
}

async fn operator(
    state: &Arc<AppState>,
    headers: &HeaderMap,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    let user = authenticated_user(&state.db, headers).await?;
    if !operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "operator access required".into()));
    }
    if !enabled() {
        return Err(unavailable());
    }
    Ok(user)
}

fn valid_id(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn enum_value<T: Serialize>(value: T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default()
}

fn parse_subject(value: &str) -> Option<ReviewSubjectKind> {
    match value {
        "planner" => Some(ReviewSubjectKind::Planner),
        "vendor" => Some(ReviewSubjectKind::Vendor),
        _ => None,
    }
}

fn parse_experience(value: &str) -> Option<ReviewExperienceKind> {
    match value {
        "planner_task" => Some(ReviewExperienceKind::PlannerTask),
        "resource" => Some(ReviewExperienceKind::Resource),
        "wedding_held" => Some(ReviewExperienceKind::WeddingHeld),
        "booking" => Some(ReviewExperienceKind::Booking),
        "enquiry_tour" => Some(ReviewExperienceKind::EnquiryTour),
        _ => None,
    }
}

fn parse_verification(value: &str) -> Option<ReviewVerificationState> {
    match value {
        "unreviewed" => Some(ReviewVerificationState::Unreviewed),
        "pending" => Some(ReviewVerificationState::Pending),
        "verified_activity" => Some(ReviewVerificationState::VerifiedActivity),
        "verified_booking" => Some(ReviewVerificationState::VerifiedBooking),
        "verified_wedding_held" => Some(ReviewVerificationState::VerifiedWeddingHeld),
        "insufficient" => Some(ReviewVerificationState::Insufficient),
        "conflicted" => Some(ReviewVerificationState::Conflicted),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
struct QueueQuery {
    status: Option<String>,
}

#[derive(Debug, Serialize)]
struct QueueItem {
    review_id: String,
    subject_kind: String,
    vendor_id: Option<String>,
    status: String,
    verification_state: String,
    verification_version: u64,
    current_revision: u64,
    experience_kind: String,
    experience_status: String,
    rating: Option<u8>,
    event_month: Option<String>,
    evidence_count: u64,
    probable_duplicate: bool,
    reason_codes: Vec<String>,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct QueueReply {
    items: Vec<QueueItem>,
}

async fn queue_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<QueueQuery>,
) -> Result<Json<QueueReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_moderation_queue", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    operator(&state, &headers).await?;
    let status = query.status.as_deref().unwrap_or("open").trim();
    let allowed = match status {
        "open" => vec![
            "submitted",
            "evidence_requested",
            "moderation_pending",
            "edit_pending",
            "restricted",
        ],
        "moderation_pending" => vec!["moderation_pending"],
        "edit_pending" => vec!["edit_pending"],
        "restricted" => vec!["restricted"],
        _ => return Err(bad("Choose a valid moderation queue.")),
    };
    let rows = sqlx::query(
        "SELECT review.review_id,review.subject_kind,review.vendor_id,review.status,
                review.verification_state,review.verification_version,
                review.current_revision,review.updated_at::text,
                revision.experience_kind,revision.experience_status,revision.rating,
                revision.event_month::text,
                (SELECT COUNT(*) FROM wedding_review_evidence_refs evidence
                  WHERE evidence.review_id=review.review_id
                    AND evidence.purged_at IS NULL)::bigint AS evidence_count,
                COALESCE(assessment.probable_duplicate,FALSE) AS probable_duplicate,
                COALESCE(assessment.reason_codes,ARRAY[]::text[]) AS reason_codes
         FROM wedding_reviews review
         JOIN wedding_review_revisions revision
           ON revision.review_id=review.review_id
          AND revision.revision=review.current_revision
         LEFT JOIN LATERAL (
             SELECT probable_duplicate,reason_codes
             FROM wedding_review_eligibility_assessments eligibility
             WHERE eligibility.review_id=review.review_id
               AND eligibility.revision=review.current_revision
             ORDER BY eligibility.created_at DESC LIMIT 1
         ) assessment ON TRUE
         WHERE review.status=ANY($1)
         ORDER BY review.updated_at,review.review_id
         LIMIT $2",
    )
    .bind(&allowed)
    .bind(MAX_QUEUE_ITEMS)
    .fetch_all(&state.db.pool)
    .await
    .map_err(store_error)?;
    let items = rows
        .into_iter()
        .map(|row| QueueItem {
            review_id: row.get("review_id"),
            subject_kind: row.get("subject_kind"),
            vendor_id: row.try_get("vendor_id").ok(),
            status: row.get("status"),
            verification_state: row.get("verification_state"),
            verification_version: row.get::<i64, _>("verification_version") as u64,
            current_revision: row.get::<i64, _>("current_revision") as u64,
            experience_kind: row.get("experience_kind"),
            experience_status: row.get("experience_status"),
            rating: row
                .try_get::<i16, _>("rating")
                .ok()
                .map(|value| value as u8),
            event_month: row.try_get("event_month").ok(),
            evidence_count: row.get::<i64, _>("evidence_count") as u64,
            probable_duplicate: row.get("probable_duplicate"),
            reason_codes: row.get("reason_codes"),
            updated_at: row.get("updated_at"),
        })
        .collect();
    Ok(Json(QueueReply { items }))
}

#[derive(Debug, Deserialize)]
struct PreviewQuery {
    purpose: String,
}

#[derive(Debug, Serialize)]
struct ModerationPreview {
    review_id: String,
    revision: u64,
    subject_kind: String,
    vendor_id: Option<String>,
    status: String,
    verification_state: String,
    verification_version: u64,
    audience: String,
    experience_kind: String,
    experience_status: String,
    rating: Option<u8>,
    event_month: Option<String>,
    display_mode: String,
    context_tags: Vec<String>,
    title: String,
    body: String,
    next_couple_question: Option<String>,
}

fn valid_purpose(value: &str) -> bool {
    ["moderation", "privacy", "appeal", "duplicate", "conflict"].contains(&value)
}

fn authored_text(content: &Value, key: &str, max: usize) -> Result<String, (StatusCode, String)> {
    let value = content
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.chars().count() <= max)
        .ok_or_else(|| conflict("The current authored revision cannot be safely previewed."))?;
    Ok(value.to_string())
}

fn optional_authored_text(
    content: &Value,
    key: &str,
    max: usize,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(value) = content.get(key) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    let text = value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.chars().count() <= max)
        .ok_or_else(|| conflict("The current authored revision cannot be safely previewed."))?;
    Ok(Some(text.to_string()))
}

async fn load_preview(
    state: &Arc<AppState>,
    review_id: &str,
) -> Result<(ModerationPreview, String), (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT review.subject_kind,review.vendor_id,review.status,
                review.verification_state,review.verification_version,
                review.current_revision,revision.afp_message_id,
                revision.authored_by_user_id,revision.audience,
                revision.experience_kind,revision.experience_status,revision.rating,
                revision.event_month::text,revision.display_mode,revision.context_tags
         FROM wedding_reviews review
         JOIN wedding_review_revisions revision
           ON revision.review_id=review.review_id
          AND revision.revision=review.current_revision
         WHERE review.review_id=$1",
    )
    .bind(review_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let revision: i64 = row.get("current_revision");
    let authored_by: String = row.get("authored_by_user_id");
    let afp_message_id: String = row.get("afp_message_id");
    let content = state
        .db
        .wedding_review_revision_content(&authored_by, &afp_message_id, review_id, revision)
        .await
        .map_err(store_error)?
        .ok_or_else(|| conflict("The current authored revision is unavailable."))?;
    let preview = ModerationPreview {
        review_id: review_id.to_string(),
        revision: revision as u64,
        subject_kind: row.get("subject_kind"),
        vendor_id: row.try_get("vendor_id").ok(),
        status: row.get("status"),
        verification_state: row.get("verification_state"),
        verification_version: row.get::<i64, _>("verification_version") as u64,
        audience: row.get("audience"),
        experience_kind: row.get("experience_kind"),
        experience_status: row.get("experience_status"),
        rating: row
            .try_get::<i16, _>("rating")
            .ok()
            .map(|value| value as u8),
        event_month: row.try_get("event_month").ok(),
        display_mode: row.get("display_mode"),
        context_tags: row.get("context_tags"),
        title: authored_text(&content, "title", 180)?,
        body: authored_text(&content, "body", 8_000)?,
        next_couple_question: optional_authored_text(&content, "next_couple_question", 500)?,
    };
    Ok((preview, authored_by))
}

async fn preview_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Query(query): Query<PreviewQuery>,
) -> Result<Json<ModerationPreview>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_moderation_preview", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = operator(&state, &headers).await?;
    let purpose = query.purpose.trim().to_ascii_lowercase();
    if !valid_id(&review_id, 200) || !valid_purpose(&purpose) {
        return Err(bad("Choose a valid review and moderation purpose."));
    }
    let (preview, _) = load_preview(&state, &review_id).await?;
    sqlx::query(
        "INSERT INTO wedding_review_moderation_access_log
            (access_id,review_id,revision,operator_user_id,purpose_code)
         VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(format!("review-moderation-access-{}", Ulid::new()))
    .bind(&review_id)
    .bind(preview.revision as i64)
    .bind(&user.id)
    .bind(&purpose)
    .execute(&state.db.pool)
    .await
    .map_err(store_error)?;
    Ok(Json(preview))
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum ModerationDecision {
    RequestEvidence,
    Approve,
    Reject,
    Restrict,
    Restore,
    ReturnForCorrection,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ModerationRequest {
    expected_revision: u64,
    expected_verification_version: u64,
    decision: ModerationDecision,
    reason_code: String,
    idempotency_key: String,
}

#[derive(Clone, Debug, Serialize)]
struct ModerationReply {
    review_id: String,
    revision: u64,
    decision: ModerationDecision,
    result_status: String,
    publication_id: Option<String>,
    replayed: bool,
}

fn decision_value(decision: ModerationDecision) -> &'static str {
    match decision {
        ModerationDecision::RequestEvidence => "request_evidence",
        ModerationDecision::Approve => "approve",
        ModerationDecision::Reject => "reject",
        ModerationDecision::Restrict => "restrict",
        ModerationDecision::Restore => "restore",
        ModerationDecision::ReturnForCorrection => "return_for_correction",
    }
}

fn valid_reason(decision: ModerationDecision, reason: &str) -> bool {
    let allowed: &[&str] = match decision {
        ModerationDecision::Approve => &["eligibility", "policy_other"],
        ModerationDecision::RequestEvidence => &["evidence", "unsupported_claim"],
        ModerationDecision::Reject => &[
            "duplicate",
            "conflict",
            "abuse",
            "unsupported_claim",
            "policy_other",
        ],
        ModerationDecision::Restrict => {
            &["personal_information", "abuse", "conflict", "policy_other"]
        }
        ModerationDecision::Restore => &["eligibility", "policy_other", "correction_required"],
        ModerationDecision::ReturnForCorrection => &[
            "correction_required",
            "personal_information",
            "unsupported_claim",
        ],
    };
    allowed.contains(&reason)
}

fn request_hash(request: &ModerationRequest) -> Result<String, (StatusCode, String)> {
    let bytes = serde_json::to_vec(request).map_err(|_| bad("Invalid moderation request."))?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

async fn replay_receipt(
    transaction: &mut Transaction<'_, Postgres>,
    expected_review_id: &str,
    moderator_user_id: &str,
    idempotency_key: &str,
    hash: &str,
) -> Result<Option<ModerationReply>, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT review_id,revision,decision,result_status,publication_id,request_hash
         FROM wedding_review_moderation_receipts
         WHERE moderator_user_id=$1 AND idempotency_key=$2",
    )
    .bind(moderator_user_id)
    .bind(idempotency_key)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_error)?;
    let Some(row) = row else { return Ok(None) };
    if row.get::<String, _>("review_id") != expected_review_id
        || row.get::<String, _>("request_hash") != hash
    {
        return Err(conflict(
            "That retry key was already used for another decision.",
        ));
    }
    let decision = match row.get::<String, _>("decision").as_str() {
        "request_evidence" => ModerationDecision::RequestEvidence,
        "approve" => ModerationDecision::Approve,
        "reject" => ModerationDecision::Reject,
        "restrict" => ModerationDecision::Restrict,
        "restore" => ModerationDecision::Restore,
        "return_for_correction" => ModerationDecision::ReturnForCorrection,
        _ => return Err(conflict("The saved moderation receipt is invalid.")),
    };
    Ok(Some(ModerationReply {
        review_id: row.get("review_id"),
        revision: row.get::<i64, _>("revision") as u64,
        decision,
        result_status: row.get("result_status"),
        publication_id: row.try_get("publication_id").ok(),
        replayed: true,
    }))
}

fn public_snapshot(preview: &ModerationPreview) -> Result<(Value, bool), (StatusCode, String)> {
    if preview.display_mode != "omnyid_couple" {
        return Err(conflict(
            "This display choice needs an explicit public couple label before publication.",
        ));
    }
    let subject = parse_subject(&preview.subject_kind)
        .ok_or_else(|| conflict("The review subject is invalid."))?;
    let experience = parse_experience(&preview.experience_kind)
        .ok_or_else(|| conflict("The review experience is invalid."))?;
    let verification = parse_verification(&preview.verification_state)
        .ok_or_else(|| conflict("The review verification is invalid."))?;
    let policy = validate_policy(ReviewPolicyInput {
        subject,
        experience,
        verification,
        audience: ReviewAudience::PublicReview,
        rating: preview.rating,
    })
    .map_err(conflict)?;
    let snapshot = json!({
        "schema_version": 1,
        "display_label": "An OmnyID couple",
        "display_mode": preview.display_mode,
        "title": preview.title,
        "body": preview.body,
        "next_couple_question": preview.next_couple_question,
        "context_tags": preview.context_tags,
        "event_month": preview.event_month,
        "experience_status": preview.experience_status,
        "rating": preview.rating
    });
    Ok((snapshot, policy.aggregate_eligible))
}

async fn decide_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Json(request): Json<ModerationRequest>,
) -> Result<Json<ModerationReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_moderation_decide", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = operator(&state, &headers).await?;
    let reason = request.reason_code.trim().to_ascii_lowercase();
    let key = request.idempotency_key.trim();
    if !valid_id(&review_id, 200)
        || !valid_id(key, 180)
        || key.len() < 8
        || !valid_reason(request.decision, &reason)
    {
        return Err(bad(
            "Choose a valid moderation decision, reason and retry key.",
        ));
    }
    let hash = request_hash(&request)?;
    let mut transaction = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(format!("{}:{key}", user.id))
        .execute(&mut *transaction)
        .await
        .map_err(store_error)?;
    if let Some(reply) = replay_receipt(&mut transaction, &review_id, &user.id, key, &hash).await? {
        transaction.commit().await.map_err(store_error)?;
        return Ok(Json(reply));
    }
    let review = sqlx::query(
        "SELECT status,verification_state,verification_version,current_revision,
                subject_kind,vendor_id,published_revision
         FROM wedding_reviews WHERE review_id=$1 FOR UPDATE",
    )
    .bind(&review_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let revision = review.get::<i64, _>("current_revision");
    let verification_version = review.get::<i64, _>("verification_version");
    if request.expected_revision != revision as u64
        || request.expected_verification_version != verification_version as u64
    {
        return Err(conflict("The review changed. Refresh it before deciding."));
    }
    let recently_opened: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM wedding_review_moderation_access_log access
            WHERE access.review_id=$1 AND access.revision=$2
              AND access.operator_user_id=$3
              AND access.accessed_at >= NOW() - INTERVAL '24 hours'
         )",
    )
    .bind(&review_id)
    .bind(revision)
    .bind(&user.id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_error)?;
    if !recently_opened {
        return Err(conflict(
            "Open the current review preview before deciding it.",
        ));
    }
    let current_status: String = review.get("status");
    let valid_transition = match request.decision {
        ModerationDecision::Approve => {
            ["moderation_pending", "edit_pending"].contains(&current_status.as_str())
        }
        ModerationDecision::RequestEvidence => {
            ["submitted", "moderation_pending"].contains(&current_status.as_str())
        }
        ModerationDecision::Reject | ModerationDecision::ReturnForCorrection => [
            "submitted",
            "evidence_requested",
            "moderation_pending",
            "edit_pending",
        ]
        .contains(&current_status.as_str()),
        ModerationDecision::Restrict => {
            ["published", "edit_pending", "restored"].contains(&current_status.as_str())
        }
        ModerationDecision::Restore => current_status == "restricted",
    };
    if !valid_transition {
        return Err(conflict(
            "That decision is not available for the current review state.",
        ));
    }
    let (preview, _) = load_preview(&state, &review_id).await?;
    if preview.revision != revision as u64 || preview.audience != "public_review" {
        return Err(conflict(
            "Only the current public-review revision can be moderated.",
        ));
    }
    let decision_id = format!("review-moderation-decision-{}", Ulid::new());
    let mut publication_id = None;
    let mut published_revision = review.try_get::<i64, _>("published_revision").ok();
    let result_status = match request.decision {
        ModerationDecision::Approve => {
            let (snapshot, aggregate_eligible) = public_snapshot(&preview)?;
            sqlx::query(
                "UPDATE wedding_review_publications SET status='superseded',updated_at=NOW()
                 WHERE review_id=$1 AND status='published'",
            )
            .bind(&review_id)
            .execute(&mut *transaction)
            .await
            .map_err(store_error)?;
            let id = format!("review-publication-{}", Ulid::new());
            sqlx::query(
                "INSERT INTO wedding_review_publications
                    (publication_id,review_id,revision,subject_kind,vendor_id,
                     experience_kind,verification_state,aggregate_eligible,rating,
                     public_snapshot,published_by_user_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            )
            .bind(&id)
            .bind(&review_id)
            .bind(revision)
            .bind(&preview.subject_kind)
            .bind(preview.vendor_id.as_deref())
            .bind(&preview.experience_kind)
            .bind(&preview.verification_state)
            .bind(aggregate_eligible)
            .bind(preview.rating.map(i16::from))
            .bind(snapshot)
            .bind(&user.id)
            .execute(&mut *transaction)
            .await
            .map_err(store_error)?;
            publication_id = Some(id);
            published_revision = Some(revision);
            "published"
        }
        ModerationDecision::RequestEvidence => "evidence_requested",
        ModerationDecision::Reject | ModerationDecision::ReturnForCorrection => "rejected",
        ModerationDecision::Restrict => {
            let id: String = sqlx::query_scalar(
                "UPDATE wedding_review_publications SET status='restricted',updated_at=NOW()
                 WHERE review_id=$1 AND status='published' RETURNING publication_id",
            )
            .bind(&review_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(store_error)?
            .ok_or_else(|| conflict("There is no current publication to restrict."))?;
            publication_id = Some(id);
            "restricted"
        }
        ModerationDecision::Restore => {
            let publication = sqlx::query(
                "UPDATE wedding_review_publications SET status='published',updated_at=NOW()
                 WHERE publication_id=(
                    SELECT publication_id FROM wedding_review_publications
                    WHERE review_id=$1 AND status='restricted'
                    ORDER BY updated_at DESC LIMIT 1
                 ) RETURNING publication_id,revision",
            )
            .bind(&review_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(store_error)?
            .ok_or_else(|| conflict("There is no restricted publication to restore."))?;
            let id: String = publication.get("publication_id");
            publication_id = Some(id);
            published_revision = Some(publication.get("revision"));
            "restored"
        }
    };
    sqlx::query(
        "INSERT INTO wedding_review_moderation_decisions
            (decision_id,review_id,revision,decision,reason_code,moderator_user_id)
         VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(&decision_id)
    .bind(&review_id)
    .bind(revision)
    .bind(decision_value(request.decision))
    .bind(&reason)
    .bind(&user.id)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    sqlx::query(
        "UPDATE wedding_reviews SET status=$2,published_revision=$3,
                updated_at=NOW()
         WHERE review_id=$1",
    )
    .bind(&review_id)
    .bind(result_status)
    .bind(published_revision)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    let event_kind = match request.decision {
        ModerationDecision::Approve => "published",
        ModerationDecision::Restrict => "restricted",
        ModerationDecision::Restore => "restored",
        _ => "moderation_decided",
    };
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,revision,
             reason_code,dedupe_key,metadata)
         VALUES ($1,$2,$3,'operator',$4,$5,$6,$7,$8)",
    )
    .bind(format!("review-event-{}", Ulid::new()))
    .bind(&review_id)
    .bind(event_kind)
    .bind(&user.id)
    .bind(revision)
    .bind(&reason)
    .bind(key)
    .bind(json!({
        "schema_version": 1,
        "policy_outcome": decision_value(request.decision),
        "result": result_status,
        "reason_code": reason
    }))
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    sqlx::query(
        "INSERT INTO wedding_review_moderation_receipts
            (receipt_id,review_id,revision,moderator_user_id,idempotency_key,
             request_hash,decision,result_status,publication_id,decision_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(format!("review-moderation-receipt-{}", Ulid::new()))
    .bind(&review_id)
    .bind(revision)
    .bind(&user.id)
    .bind(key)
    .bind(&hash)
    .bind(decision_value(request.decision))
    .bind(result_status)
    .bind(publication_id.as_deref())
    .bind(&decision_id)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    transaction.commit().await.map_err(store_error)?;
    Ok(Json(ModerationReply {
        review_id,
        revision: revision as u64,
        decision: request.decision,
        result_status: result_status.into(),
        publication_id,
        replayed: false,
    }))
}
