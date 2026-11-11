//! Operator-only, claim-specific Wedding review eligibility evaluation.
//!
//! This consumes canonical content-light records plus evidence already opened
//! for eligibility. It does not read proof bytes or expose private match facts
//! to couple, vendor or public responses.

use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    cost_controls::operator_access_allowed, enforce_rate_limit,
};
use crate::wedding_reviews::{
    ReviewEligibilitySignals, ReviewExperienceKind, ReviewSubjectKind, ReviewVerificationState,
    evaluate_review_eligibility,
};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use std::{collections::BTreeSet, sync::Arc, time::Duration};
use ulid::Ulid;

const MAX_EVIDENCE_DECISIONS: usize = 25;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/admin/wedding/reviews/{review_id}/eligibility",
        post(evaluate_eligibility_http),
    )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_REVIEWS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "Wedding reviews are not available.".into(),
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
        "Wedding review eligibility action failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Review eligibility could not be evaluated just now.".into(),
    )
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
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

fn enum_value<T: Serialize>(value: T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default()
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum EvidenceDecision {
    Accept,
    Reject,
}

impl EvidenceDecision {
    fn status(self) -> &'static str {
        match self {
            Self::Accept => "accepted",
            Self::Reject => "rejected",
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct EvidenceDecisionInput {
    evidence_ref_id: String,
    decision: EvidenceDecision,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct EligibilityRequest {
    expected_revision: u64,
    expected_verification_version: u64,
    idempotency_key: String,
    #[serde(default)]
    evidence_decisions: Vec<EvidenceDecisionInput>,
}

#[derive(Clone, Debug, Serialize)]
struct EligibilityReply {
    assessment_id: String,
    review_id: String,
    revision: u64,
    verification_version: u64,
    verification_state: String,
    review_status: String,
    reason_codes: Vec<String>,
    signal_codes: Vec<String>,
    probable_duplicate: bool,
    replayed: bool,
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

fn request_hash(request: &EligibilityRequest) -> Result<String, (StatusCode, String)> {
    let bytes = serde_json::to_vec(request).map_err(|_| bad("Invalid eligibility request."))?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

async fn replay(
    transaction: &mut Transaction<'_, Postgres>,
    review_id: &str,
    idempotency_key: &str,
    hash: &str,
) -> Result<Option<EligibilityReply>, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT assessment_id,revision,verification_version,verification_state,
                reason_codes,signal_codes,probable_duplicate,request_hash
         FROM wedding_review_eligibility_assessments
         WHERE review_id=$1 AND idempotency_key=$2",
    )
    .bind(review_id)
    .bind(idempotency_key)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_error)?;
    let Some(row) = row else { return Ok(None) };
    if row.get::<String, _>("request_hash") != hash {
        return Err(conflict(
            "That retry key was already used for a different eligibility decision.",
        ));
    }
    let review_status: String =
        sqlx::query_scalar("SELECT status FROM wedding_reviews WHERE review_id=$1")
            .bind(review_id)
            .fetch_one(&mut **transaction)
            .await
            .map_err(store_error)?;
    Ok(Some(EligibilityReply {
        assessment_id: row.get("assessment_id"),
        review_id: review_id.to_string(),
        revision: row.get::<i64, _>("revision") as u64,
        verification_version: row.get::<i64, _>("verification_version") as u64,
        verification_state: row.get("verification_state"),
        review_status,
        reason_codes: row.get("reason_codes"),
        signal_codes: row.get("signal_codes"),
        probable_duplicate: row.get("probable_duplicate"),
        replayed: true,
    }))
}

async fn decide_evidence(
    transaction: &mut Transaction<'_, Postgres>,
    review_id: &str,
    revision: i64,
    operator_user_id: &str,
    decisions: &[EvidenceDecisionInput],
) -> Result<(), (StatusCode, String)> {
    let mut unique = BTreeSet::new();
    if decisions.len() > MAX_EVIDENCE_DECISIONS
        || decisions.iter().any(|item| {
            !valid_id(item.evidence_ref_id.trim())
                || !unique.insert(item.evidence_ref_id.trim().to_string())
        })
    {
        return Err(bad("Choose up to 25 distinct review evidence references."));
    }
    for item in decisions {
        let evidence_ref_id = item.evidence_ref_id.trim();
        let row = sqlx::query(
            "SELECT status,EXISTS(
                SELECT 1 FROM wedding_review_evidence_access_log access
                WHERE access.evidence_ref_id=e.evidence_ref_id
                  AND access.review_id=e.review_id
                  AND access.operator_user_id=$4
                  AND access.purpose_code IN ('eligibility','evidence')
                  AND access.accessed_at >= NOW()-INTERVAL '24 hours'
             ) AS reviewed
             FROM wedding_review_evidence_refs e
             WHERE e.evidence_ref_id=$1 AND e.review_id=$2 AND e.revision=$3
             FOR UPDATE",
        )
        .bind(evidence_ref_id)
        .bind(review_id)
        .bind(revision)
        .bind(operator_user_id)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(store_error)?
        .ok_or_else(unavailable)?;
        if !row.get::<bool, _>("reviewed") {
            return Err(conflict(
                "Open this proof for the eligibility purpose before deciding it.",
            ));
        }
        let status: String = row.get("status");
        let intended = item.decision.status();
        if status != "pending" && status != intended {
            return Err(conflict("That proof already has a different decision."));
        }
        sqlx::query(
            "UPDATE wedding_review_evidence_refs SET status=$2
             WHERE evidence_ref_id=$1 AND status='pending'",
        )
        .bind(evidence_ref_id)
        .bind(intended)
        .execute(&mut **transaction)
        .await
        .map_err(store_error)?;
    }
    Ok(())
}

async fn canonical_signals(
    transaction: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    wedding_plan_id: &str,
    vendor_id: Option<&str>,
) -> Result<(bool, bool, bool), (StatusCode, String)> {
    let planner_activity: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM wedding_runsheet_projection_commits commit
            JOIN wedding_user_onboarding_state owner
              ON owner.user_id=commit.owner_user_id
             AND owner.wedding_plan_id=commit.wedding_plan_id
            WHERE commit.wedding_plan_id=$1
              AND (commit.owner_user_id=$2 OR owner.wedding_plan_id=$1)
        )",
    )
    .bind(wedding_plan_id)
    .bind(owner_user_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_error)?;
    let Some(vendor_id) = vendor_id else {
        return Ok((planner_activity, false, false));
    };
    let enquiry: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM wedding_vendor_availability availability
            JOIN wedding_user_onboarding_state owner
              ON owner.user_id=availability.user_id
             AND owner.wedding_plan_id=availability.wedding_plan_id
            WHERE availability.wedding_plan_id=$1 AND availability.vendor_id=$2
              AND availability.state IN (
                'enquiry_sent','awaiting_response','confirmed_available',
                'confirmed_unavailable','temporary_hold','booked'
              )
            UNION ALL
            SELECT 1 FROM wedding_vendor_special_offer_enquiries enquiry
            JOIN wedding_vendor_special_offers offer ON offer.offer_id=enquiry.offer_id
            JOIN wedding_user_onboarding_state owner
              ON owner.user_id=enquiry.owner_user_id
             AND owner.wedding_plan_id=enquiry.wedding_plan_id
            WHERE enquiry.wedding_plan_id=$1 AND offer.vendor_id=$2
        )",
    )
    .bind(wedding_plan_id)
    .bind(vendor_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_error)?;
    let booking: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM wedding_vendor_availability availability
            JOIN wedding_user_onboarding_state owner
              ON owner.user_id=availability.user_id
             AND owner.wedding_plan_id=availability.wedding_plan_id
            WHERE availability.wedding_plan_id=$1 AND availability.vendor_id=$2
              AND availability.state='booked'
            UNION ALL
            SELECT 1 FROM wedding_vendor_special_offer_outcome_projection outcome
            JOIN wedding_vendor_special_offers offer ON offer.offer_id=outcome.offer_id
            JOIN wedding_user_onboarding_state owner
              ON owner.user_id=outcome.owner_user_id
             AND owner.wedding_plan_id=outcome.wedding_plan_id
            WHERE outcome.wedding_plan_id=$1 AND offer.vendor_id=$2
              AND outcome.outcome='booking'
        )",
    )
    .bind(wedding_plan_id)
    .bind(vendor_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_error)?;
    Ok((planner_activity, enquiry, booking))
}

async fn evaluate_eligibility_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Json(request): Json<EligibilityRequest>,
) -> Result<Json<EligibilityReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_eligibility", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = operator(&state, &headers).await?;
    let idempotency_key = request.idempotency_key.trim();
    if !valid_id(&review_id)
        || !(8..=180).contains(&idempotency_key.len())
        || !valid_id(idempotency_key)
    {
        return Err(bad("Choose a valid review and retry key."));
    }
    let hash = request_hash(&request)?;
    let mut transaction = state.db.pool.begin().await.map_err(store_error)?;
    if let Some(reply) = replay(&mut transaction, &review_id, idempotency_key, &hash).await? {
        transaction.commit().await.map_err(store_error)?;
        return Ok(Json(reply));
    }
    let review = sqlx::query(
        "SELECT owner_user_id,wedding_plan_id,subject_kind,vendor_id,status,
                current_revision,verification_version
         FROM wedding_reviews WHERE review_id=$1 FOR UPDATE",
    )
    .bind(&review_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let current_revision: i64 = review.get("current_revision");
    let verification_version: i64 = review.get("verification_version");
    if request.expected_revision != current_revision as u64
        || request.expected_verification_version != verification_version as u64
    {
        return Err(conflict(
            "Review eligibility changed. Refresh before deciding it.",
        ));
    }
    let current_status: String = review.get("status");
    if ![
        "submitted",
        "evidence_requested",
        "moderation_pending",
        "edit_pending",
    ]
    .contains(&current_status.as_str())
    {
        return Err(conflict(
            "Only a submitted review can have eligibility decided.",
        ));
    }
    decide_evidence(
        &mut transaction,
        &review_id,
        current_revision,
        &user.id,
        &request.evidence_decisions,
    )
    .await?;

    let revision = sqlx::query(
        "SELECT experience_kind,event_month
         FROM wedding_review_revisions WHERE review_id=$1 AND revision=$2",
    )
    .bind(&review_id)
    .bind(current_revision)
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_error)?;
    let subject = parse_subject(&review.get::<String, _>("subject_kind"))
        .ok_or_else(|| conflict("Review subject is not supported."))?;
    let experience = parse_experience(&revision.get::<String, _>("experience_kind"))
        .ok_or_else(|| conflict("Review experience is not supported."))?;
    let owner_user_id: String = review.get("owner_user_id");
    let wedding_plan_id: String = review.get("wedding_plan_id");
    let vendor_id: Option<String> = review.try_get("vendor_id").ok().flatten();
    let (planner_activity, enquiry, booking) = canonical_signals(
        &mut transaction,
        &owner_user_id,
        &wedding_plan_id,
        vendor_id.as_deref(),
    )
    .await?;
    let accepted: Vec<String> = sqlx::query_scalar(
        "SELECT evidence_kind FROM wedding_review_evidence_refs
         WHERE review_id=$1 AND revision=$2 AND status='accepted' AND purged_at IS NULL",
    )
    .bind(&review_id)
    .bind(current_revision)
    .fetch_all(&mut *transaction)
    .await
    .map_err(store_error)?;
    let event_month = revision.try_get::<chrono::NaiveDate, _>("event_month").ok();
    let now = Utc::now().date_naive();
    let current_month =
        chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1).expect("valid current month");
    let probable_duplicate: bool = if event_month.is_some() {
        sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1 FROM wedding_reviews other
                JOIN wedding_review_revisions other_revision
                  ON other_revision.review_id=other.review_id
                 AND other_revision.revision=other.current_revision
                WHERE other.review_id<>$1 AND other.owner_user_id=$2
                  AND other.subject_kind=$3
                  AND other.vendor_id IS NOT DISTINCT FROM $4
                  AND other.status NOT IN ('rejected','withdrawn')
                  AND other_revision.event_month=$5
            )",
        )
        .bind(&review_id)
        .bind(&owner_user_id)
        .bind(enum_value(subject))
        .bind(vendor_id.as_deref())
        .bind(event_month)
        .fetch_one(&mut *transaction)
        .await
        .map_err(store_error)?
    } else {
        false
    };
    let has = |kind: &str| accepted.iter().any(|value| value == kind);
    let outcome = evaluate_review_eligibility(
        subject,
        experience,
        ReviewEligibilitySignals {
            canonical_planner_activity: planner_activity,
            canonical_enquiry_or_tour: enquiry,
            canonical_booking: booking,
            accepted_planner_activity: has("planner_activity"),
            accepted_enquiry_or_tour: has("enquiry") || has("tour"),
            accepted_booking: has("contract") || has("payment"),
            accepted_post_event_delivery: has("post_event_invoice")
                || has("post_event_correspondence"),
            event_month_wholly_past: event_month.is_some_and(|date| date < current_month),
            probable_duplicate,
            conflicting_evidence: false,
        },
    );
    let verification_state = enum_value(outcome.verification);
    let next_status = match outcome.verification {
        ReviewVerificationState::VerifiedActivity
        | ReviewVerificationState::VerifiedBooking
        | ReviewVerificationState::VerifiedWeddingHeld
        | ReviewVerificationState::Conflicted => "moderation_pending",
        _ => "evidence_requested",
    };
    let next_version = verification_version + 1;
    let assessment_id = format!("review-eligibility-{}", Ulid::new());
    let reason_codes = outcome
        .reason_codes
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    let signal_codes = outcome
        .signal_codes
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    sqlx::query(
        "INSERT INTO wedding_review_eligibility_assessments
            (assessment_id,review_id,revision,verification_version,verification_state,
             request_hash,probable_duplicate,reason_codes,signal_codes,assessed_by_user_id,
             idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    )
    .bind(&assessment_id)
    .bind(&review_id)
    .bind(current_revision)
    .bind(next_version)
    .bind(&verification_state)
    .bind(&hash)
    .bind(probable_duplicate)
    .bind(&reason_codes)
    .bind(&signal_codes)
    .bind(&user.id)
    .bind(idempotency_key)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    sqlx::query(
        "UPDATE wedding_reviews SET verification_state=$2,verification_version=$3,
                status=$4,updated_at=NOW()
         WHERE review_id=$1 AND current_revision=$5 AND verification_version=$6",
    )
    .bind(&review_id)
    .bind(&verification_state)
    .bind(next_version)
    .bind(next_status)
    .bind(current_revision)
    .bind(verification_version)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,revision,
             reason_code,dedupe_key,metadata)
         VALUES ($1,$2,'eligibility_decided','operator',$3,$4,$5,$6,$7)
         ON CONFLICT (review_id,event_kind,dedupe_key) DO NOTHING",
    )
    .bind(format!("review-event-{}", Ulid::new()))
    .bind(&review_id)
    .bind(&user.id)
    .bind(current_revision)
    .bind(reason_codes.first())
    .bind(idempotency_key)
    .bind(json!({
        "schema_version": 1,
        "verification_state": verification_state,
        "policy_outcome": if probable_duplicate { "reconcile" } else { "evaluated" },
        "reason_code": reason_codes.first(),
    }))
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    transaction.commit().await.map_err(store_error)?;
    Ok(Json(EligibilityReply {
        assessment_id,
        review_id,
        revision: current_revision as u64,
        verification_version: next_version as u64,
        verification_state,
        review_status: next_status.into(),
        reason_codes,
        signal_codes,
        probable_duplicate,
        replayed: false,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evidence_decisions_are_bounded_and_explicit() {
        assert_eq!(MAX_EVIDENCE_DECISIONS, 25);
        assert_eq!(EvidenceDecision::Accept.status(), "accepted");
        assert_eq!(EvidenceDecision::Reject.status(), "rejected");
    }

    #[test]
    fn retry_identifiers_cannot_contain_contact_text() {
        assert!(valid_id("eligibility-review_123"));
        assert!(!valid_id("contains a contact@example.test"));
    }
}
