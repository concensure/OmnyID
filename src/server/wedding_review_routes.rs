//! Authenticated Wedding review draft and submission writeback.
//!
//! Narrative is written to the existing tenant-private AFP message authority.
//! Public tables receive lifecycle facts and pointers only. Publication,
//! verification and moderation remain separate later commands.

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, store_private_app_message},
    authenticated_rate_limit_key, enforce_rate_limit,
};
use crate::{
    message::AFPMessage,
    wedding_reviews::{
        ReviewAudience, ReviewExperienceKind, ReviewPolicyInput, ReviewSubjectKind,
        ReviewVerificationState, review_supertags, validate_policy,
    },
};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use std::{collections::BTreeSet, sync::Arc, time::Duration};
use ulid::Ulid;

const MAX_TITLE_CHARS: usize = 180;
const MAX_BODY_CHARS: usize = 8_000;
const MAX_CONTEXT_TAGS: usize = 12;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/wedding/reviews/revisions", post(save_revision_http))
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
        "Wedding review persistence failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "The review could not be saved just now. Your text is still in this form.".into(),
    )
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn bounded(value: &str, max: usize) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control))
        .then(|| value.to_string())
}

fn enum_value<T: Serialize>(value: T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default()
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum RevisionAction {
    #[default]
    SaveDraft,
    Submit,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SaveRevisionRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    subject_kind: ReviewSubjectKind,
    #[serde(default)]
    vendor_id: Option<String>,
    #[serde(default)]
    venue_space_ref: Option<String>,
    audience: ReviewAudience,
    experience_kind: ReviewExperienceKind,
    experience_status: String,
    #[serde(default)]
    rating: Option<u8>,
    #[serde(default)]
    event_month: Option<String>,
    display_mode: String,
    title: String,
    body: String,
    #[serde(default)]
    next_couple_question: Option<String>,
    #[serde(default)]
    context_tags: Vec<String>,
    #[serde(default)]
    invitation_origin: Option<String>,
    expected_revision: u64,
    idempotency_key: String,
    #[serde(default)]
    action: RevisionAction,
}

#[derive(Clone, Debug, Serialize)]
struct RevisionReply {
    review_id: String,
    revision: u64,
    afp_message_id: String,
    status: String,
    replayed: bool,
}

#[derive(Debug)]
struct ValidatedRevision {
    plan: String,
    workspace: String,
    vendor_id: Option<String>,
    venue_space_ref: Option<String>,
    experience_status: String,
    event_month: Option<String>,
    display_mode: String,
    title: String,
    body: String,
    next_couple_question: Option<String>,
    context_tags: Vec<String>,
    invitation_origin: String,
    idempotency_key: String,
}

fn validate_request(
    request: &SaveRevisionRequest,
) -> Result<ValidatedRevision, (StatusCode, String)> {
    let plan = bounded(&request.wedding_plan_id, 180)
        .filter(|value| valid_id(value))
        .ok_or_else(|| bad("Choose a valid wedding plan."))?;
    let workspace = bounded(&request.response_workspace_id, 180)
        .filter(|value| valid_id(value))
        .ok_or_else(|| bad("Choose a valid Wedding workspace."))?;
    let vendor_id = request
        .vendor_id
        .as_deref()
        .map(|value| {
            bounded(value, 180)
                .filter(|value| valid_id(value))
                .ok_or_else(|| bad("Choose a valid venue."))
        })
        .transpose()?;
    match request.subject_kind {
        ReviewSubjectKind::Planner if vendor_id.is_some() => {
            return Err(bad("Planner feedback cannot name a venue."));
        }
        ReviewSubjectKind::Vendor if vendor_id.is_none() => {
            return Err(bad("Choose the venue being reviewed."));
        }
        _ => {}
    }
    validate_policy(ReviewPolicyInput {
        subject: request.subject_kind,
        experience: request.experience_kind,
        verification: ReviewVerificationState::Unreviewed,
        audience: request.audience,
        rating: request.rating,
    })
    .map_err(bad)?;
    let experience_status = request.experience_status.trim().to_ascii_lowercase();
    if ![
        "completed",
        "upcoming",
        "cancelled",
        "refunded",
        "changed",
        "other",
    ]
    .contains(&experience_status.as_str())
    {
        return Err(bad("Choose a valid experience status."));
    }
    let display_mode = request.display_mode.trim().to_ascii_lowercase();
    if !["first_names", "first_name_and_initial", "omnyid_couple"].contains(&display_mode.as_str())
    {
        return Err(bad(
            "Choose how your name should appear if this review is published.",
        ));
    }
    let title =
        bounded(&request.title, MAX_TITLE_CHARS).ok_or_else(|| bad("Add a short review title."))?;
    let body = bounded(&request.body, MAX_BODY_CHARS)
        .ok_or_else(|| bad("Add your own review before saving."))?;
    if request.action == RevisionAction::Submit && body.chars().count() < 20 {
        return Err(bad(
            "Add a little more detail before submitting this review.",
        ));
    }
    let next_couple_question = request
        .next_couple_question
        .as_deref()
        .map(|value| {
            bounded(value, 500)
                .ok_or_else(|| bad("Keep the suggested question under 500 characters."))
        })
        .transpose()?;
    let venue_space_ref = request
        .venue_space_ref
        .as_deref()
        .map(|value| {
            bounded(value, 180)
                .filter(|value| valid_id(value))
                .ok_or_else(|| bad("Choose a valid venue space."))
        })
        .transpose()?;
    let event_month = request
        .event_month
        .as_deref()
        .map(|value| {
            let parsed = NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
                .map_err(|_| bad("Use the first day of the event month."))?;
            if parsed.day() != 1 {
                return Err(bad("Use the first day of the event month."));
            }
            Ok(parsed.format("%Y-%m-%d").to_string())
        })
        .transpose()?;
    let mut seen = BTreeSet::new();
    let context_tags = request
        .context_tags
        .iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value.chars().count() > 60 || value.chars().any(char::is_control) {
                return Err(bad("Keep review context tags short."));
            }
            Ok(value)
        })
        .collect::<Result<Vec<_>, _>>()?;
    if context_tags.len() > MAX_CONTEXT_TAGS
        || context_tags.iter().any(|value| !seen.insert(value.clone()))
    {
        return Err(bad("Use no more than 12 different context tags."));
    }
    let invitation_origin = request
        .invitation_origin
        .as_deref()
        .unwrap_or("profile_direct")
        .trim()
        .to_ascii_lowercase();
    if ![
        "in_app",
        "operator",
        "vendor_standard_link",
        "profile_direct",
        "off_platform",
    ]
    .contains(&invitation_origin.as_str())
    {
        return Err(bad("Choose a valid review invitation origin."));
    }
    let idempotency_key = bounded(&request.idempotency_key, 180)
        .filter(|value| value.len() >= 8 && valid_id(value))
        .ok_or_else(|| bad("Provide a valid idempotency key."))?;
    Ok(ValidatedRevision {
        plan,
        workspace,
        vendor_id,
        venue_space_ref,
        experience_status,
        event_month,
        display_mode,
        title,
        body,
        next_couple_question,
        context_tags,
        invitation_origin,
        idempotency_key,
    })
}

fn request_hash(request: &SaveRevisionRequest) -> String {
    hex::encode(Sha256::digest(
        serde_json::to_vec(request).unwrap_or_default(),
    ))
}

fn deterministic_ulid(namespace: &str, value: &str) -> String {
    let digest = Sha256::digest(format!("{namespace}\0{value}").as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ulid::from(u128::from_be_bytes(bytes)).to_string()
}

async fn replay_receipt(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    key: &str,
    hash: &str,
) -> Result<RevisionReply, (StatusCode, String)> {
    let row = sqlx::query("SELECT request_hash,review_id,revision,afp_message_id,result_status,completed_at FROM wedding_review_command_receipts WHERE owner_user_id=$1 AND idempotency_key=$2 FOR UPDATE")
        .bind(owner_user_id)
        .bind(key)
        .fetch_one(&mut **tx)
        .await
        .map_err(store_error)?;
    if row.get::<String, _>("request_hash") != hash {
        return Err(conflict(
            "That retry key was already used for different review content.",
        ));
    }
    let completed_at: Option<chrono::DateTime<Utc>> = row.try_get("completed_at").ok();
    if completed_at.is_none() {
        return Err(conflict("That review save is already in progress."));
    }
    Ok(RevisionReply {
        review_id: row.get("review_id"),
        revision: u64::try_from(row.get::<i64, _>("revision")).unwrap_or_default(),
        afp_message_id: row.get("afp_message_id"),
        status: row.get("result_status"),
        replayed: true,
    })
}

async fn save_revision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SaveRevisionRequest>,
) -> Result<Json<RevisionReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_revision", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() {
        return Err(unavailable());
    }
    let validated = validate_request(&request)?;
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let hash = request_hash(&request);
    let receipt_id = format!("review-receipt-{}", Ulid::new());
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let claimed = sqlx::query("INSERT INTO wedding_review_command_receipts (receipt_id,owner_user_id,idempotency_key,request_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (owner_user_id,idempotency_key) DO NOTHING")
        .bind(&receipt_id)
        .bind(&user.id)
        .bind(&validated.idempotency_key)
        .bind(&hash)
        .execute(&mut *tx)
        .await
        .map_err(store_error)?
        .rows_affected()
        == 1;
    if !claimed {
        let reply = replay_receipt(&mut tx, &user.id, &validated.idempotency_key, &hash).await?;
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(reply));
    }
    let owns_plan = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM wedding_user_onboarding_state WHERE user_id=$1 AND wedding_plan_id=$2)")
        .bind(&user.id)
        .bind(&validated.plan)
        .fetch_one(&mut *tx)
        .await
        .map_err(store_error)?;
    if !owns_plan {
        return Err((
            StatusCode::FORBIDDEN,
            "This review does not belong to this account's wedding.".into(),
        ));
    }
    if let Some(vendor_id) = &validated.vendor_id {
        let vendor_exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM wedding_vendors WHERE vendor_id=$1)",
        )
        .bind(vendor_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(store_error)?;
        if !vendor_exists {
            return Err(bad("That venue is not in the Wedding vendor directory."));
        }
    }
    let proposed_review_id = format!("review-{}", Ulid::new());
    sqlx::query("INSERT INTO wedding_reviews (review_id,owner_user_id,wedding_plan_id,response_workspace_id,subject_kind,vendor_id,venue_space_ref,invitation_origin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING")
        .bind(&proposed_review_id)
        .bind(&user.id)
        .bind(&validated.plan)
        .bind(&validated.workspace)
        .bind(enum_value(request.subject_kind))
        .bind(&validated.vendor_id)
        .bind(&validated.venue_space_ref)
        .bind(&validated.invitation_origin)
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    let review = sqlx::query("SELECT review_id,owner_user_id,current_revision,status FROM wedding_reviews WHERE wedding_plan_id=$1 AND response_workspace_id=$2 AND subject_kind=$3 AND vendor_id IS NOT DISTINCT FROM $4 FOR UPDATE")
        .bind(&validated.plan)
        .bind(&validated.workspace)
        .bind(enum_value(request.subject_kind))
        .bind(&validated.vendor_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(store_error)?;
    let review_id: String = review.get("review_id");
    let current_revision: i64 = review.get("current_revision");
    if current_revision != i64::try_from(request.expected_revision).unwrap_or(i64::MAX) {
        return Err(conflict(format!(
            "This review changed elsewhere. Reload revision {current_revision} before saving."
        )));
    }
    let current_status: String = review.get("status");
    if !["draft", "rejected"].contains(&current_status.as_str()) {
        return Err(conflict(
            "This review is already being handled. Open its current status before editing.",
        ));
    }
    let revision = current_revision + 1;
    let status = if request.action == RevisionAction::Submit {
        "submitted"
    } else {
        "draft"
    };
    let message_id = deterministic_ulid(
        "wedding-review-message",
        &format!("{}:{}", user.id, validated.idempotency_key),
    );
    let thread_id = deterministic_ulid("wedding-review-thread", &review_id);
    let references = [
        Some(json!({"type":"wedding_plan","target":validated.plan,"label":"Wedding plan"})),
        Some(json!({"type":"response_workspace","target":validated.workspace,"label":"Wedding workspace"})),
        Some(json!({"type":"wedding_review","target":review_id,"label":"Wedding review"})),
        validated.vendor_id.as_ref().map(|vendor_id| {
            json!({"type":"wedding_vendor","target":vendor_id,"label":"Reviewed venue"})
        }),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();
    let message = AFPMessage {
        protocol: "afp-v1".into(),
        id: message_id.clone(),
        thread_id,
        parent_id: None,
        from: format!("user://{}", user.id),
        to: vec!["agent://wedding-planning".into()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "ledger".into(),
        kind: Some("observation".into()),
        supertags: review_supertags(&review_id, request.subject_kind),
        subtype: Some("wedding_review_revision".into()),
        content: json!({
            "schema_version":1,
            "review_id":review_id,
            "revision":revision,
            "subject_kind":request.subject_kind,
            "vendor_id":validated.vendor_id,
            "venue_space_ref":validated.venue_space_ref,
            "audience":request.audience,
            "experience_kind":request.experience_kind,
            "experience_status":validated.experience_status,
            "rating":request.rating,
            "event_month":validated.event_month,
            "display_mode":validated.display_mode,
            "title":validated.title,
            "body":validated.body,
            "next_couple_question":validated.next_couple_question,
            "context_tags":validated.context_tags,
            "action":request.action
        }),
        metadata: Some(json!({
            "store":true,
            "weddingPlanId":validated.plan,
            "responseWorkspaceId":validated.workspace,
            "origin":"server_wedding_reviews",
            "reviewId":review_id,
            "revision":revision
        })),
        signature: "server:wedding-reviews:v1".into(),
        encryption: None,
        views: vec![],
        references,
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    };
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message,
    )
    .await
    .map_err(super::status_to_http)?;
    let revision_id = format!("review-revision-{}", Ulid::new());
    sqlx::query("INSERT INTO wedding_review_revisions (revision_id,review_id,revision,afp_message_id,authored_by_user_id,audience,experience_kind,experience_status,rating,event_month,display_mode,context_tags,submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,CASE WHEN $13 THEN NOW() ELSE NULL END)")
        .bind(&revision_id)
        .bind(&review_id)
        .bind(revision)
        .bind(&message_id)
        .bind(&user.id)
        .bind(enum_value(request.audience))
        .bind(enum_value(request.experience_kind))
        .bind(&validated.experience_status)
        .bind(request.rating.map(i16::from))
        .bind(&validated.event_month)
        .bind(&validated.display_mode)
        .bind(&validated.context_tags)
        .bind(request.action == RevisionAction::Submit)
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    sqlx::query("UPDATE wedding_reviews SET current_revision=$2,current_afp_message_id=$3,status=$4,venue_space_ref=$5,updated_at=NOW() WHERE review_id=$1")
        .bind(&review_id)
        .bind(revision)
        .bind(&message_id)
        .bind(status)
        .bind(&validated.venue_space_ref)
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    let actor_role = if review.get::<String, _>("owner_user_id") == user.id {
        "author"
    } else {
        "partner"
    };
    sqlx::query("INSERT INTO wedding_review_events (event_id,review_id,event_kind,actor_role,actor_user_id,revision,dedupe_key,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (review_id,event_kind,dedupe_key) DO NOTHING")
        .bind(format!("review-event-{}", Ulid::new()))
        .bind(&review_id)
        .bind(if status == "submitted" { "submitted" } else { "draft_saved" })
        .bind(actor_role)
        .bind(&user.id)
        .bind(revision)
        .bind(&validated.idempotency_key)
        .bind(json!({"schema_version":1,"subject_kind":enum_value(request.subject_kind),"result":status}))
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    sqlx::query("UPDATE wedding_review_command_receipts SET review_id=$3,revision=$4,afp_message_id=$5,result_status=$6,completed_at=NOW() WHERE owner_user_id=$1 AND idempotency_key=$2")
        .bind(&user.id)
        .bind(&validated.idempotency_key)
        .bind(&review_id)
        .bind(revision)
        .bind(&message_id)
        .bind(status)
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(RevisionReply {
        review_id,
        revision: u64::try_from(revision).unwrap_or_default(),
        afp_message_id: message_id,
        status: status.into(),
        replayed: false,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> SaveRevisionRequest {
        SaveRevisionRequest {
            wedding_plan_id: "plan-1".into(),
            response_workspace_id: "workspace-1".into(),
            subject_kind: ReviewSubjectKind::Vendor,
            vendor_id: Some("vendor-1".into()),
            venue_space_ref: None,
            audience: ReviewAudience::PublicReview,
            experience_kind: ReviewExperienceKind::WeddingHeld,
            experience_status: "completed".into(),
            rating: Some(5),
            event_month: Some("2026-11-01".into()),
            display_mode: "omnyid_couple".into(),
            title: "Clear communication".into(),
            body: "The venue team explained the wet-weather plan clearly.".into(),
            next_couple_question: Some("Ask when the backup room decision is made.".into()),
            context_tags: vec!["wet-weather".into()],
            invitation_origin: None,
            expected_revision: 0,
            idempotency_key: "review-save-0001".into(),
            action: RevisionAction::SaveDraft,
        }
    }

    #[test]
    fn public_enquiry_feedback_is_rejected_before_storage() {
        let mut value = request();
        value.experience_kind = ReviewExperienceKind::EnquiryTour;
        assert_eq!(
            validate_request(&value).unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn submit_requires_meaningful_authored_text() {
        let mut value = request();
        value.action = RevisionAction::Submit;
        value.body = "Too short".into();
        assert_eq!(
            validate_request(&value).unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn message_ids_converge_for_same_actor_and_retry_key() {
        assert_eq!(
            deterministic_ulid("wedding-review-message", "user:key"),
            deterministic_ulid("wedding-review-message", "user:key")
        );
        assert_ne!(
            deterministic_ulid("wedding-review-message", "user:key"),
            deterministic_ulid("wedding-review-message", "other:key")
        );
    }

    #[test]
    fn request_hash_changes_when_private_narrative_changes() {
        let first = request();
        let mut second = request();
        second.body.push_str(" More detail.");
        assert_ne!(request_hash(&first), request_hash(&second));
    }
}
