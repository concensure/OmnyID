//! Protected review-evidence references over the existing upload authority.
//!
//! This route never copies file bytes or storage URLs into public/control
//! tables. It proves the attachment belongs to the authenticated author's
//! tenant and links only the author's current review revision.

use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    enforce_rate_limit,
};
use crate::db::tenant_schema_name;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::{Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::{sync::Arc, time::Duration};
use ulid::Ulid;

const PROOF_RETENTION_DAYS: i64 = 90;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/reviews/{review_id}/evidence",
        post(link_evidence_http),
    )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_REVIEWS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "Review evidence is not available.".into(),
    )
}

fn bad(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(
        error_kind = %error
            .as_database_error()
            .map(|value| format!("{:?}", value.kind()))
            .unwrap_or_else(|| "storage".into()),
        "Wedding review evidence persistence failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "The evidence link could not be saved just now.".into(),
    )
}

fn valid_id(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn valid_evidence_kind(value: &str) -> bool {
    [
        "planner_activity",
        "contract",
        "payment",
        "post_event_invoice",
        "post_event_correspondence",
        "enquiry",
        "tour",
        "operator_note",
        "other",
    ]
    .contains(&value)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LinkEvidenceRequest {
    revision: u64,
    attachment_id: String,
    evidence_kind: String,
}

#[derive(Debug, Serialize)]
struct EvidenceReply {
    evidence_ref_id: String,
    review_id: String,
    revision: u64,
    evidence_kind: String,
    status: String,
    expires_at: String,
    replayed: bool,
}

async fn link_evidence_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Json(request): Json<LinkEvidenceRequest>,
) -> Result<Json<EvidenceReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_evidence", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() {
        return Err(unavailable());
    }
    let evidence_kind = request.evidence_kind.trim().to_ascii_lowercase();
    if !valid_id(&review_id, 200)
        || request.revision == 0
        || !valid_id(request.attachment_id.trim(), 128)
        || !valid_evidence_kind(&evidence_kind)
    {
        return Err(bad(
            "Choose a valid current review and uploaded proof file.",
        ));
    }
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let attachments_table = format!("\"{}\".attachments", tenant_schema_name(&user.id));
    let attachment_exists = sqlx::query_scalar::<_, bool>(&format!(
        "SELECT EXISTS(SELECT 1 FROM {attachments_table} WHERE id=$1)"
    ))
    .bind(request.attachment_id.trim())
    .fetch_one(&state.db.pool)
    .await
    .map_err(store_error)?;
    if !attachment_exists {
        return Err(unavailable());
    }
    let revision = i64::try_from(request.revision)
        .map_err(|_| bad("Choose a valid current review revision."))?;
    let author_can_link = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
            SELECT 1 FROM wedding_review_revisions rr
            JOIN wedding_reviews r ON r.review_id=rr.review_id
            JOIN wedding_user_onboarding_state s ON s.user_id=$1 AND s.wedding_plan_id=r.wedding_plan_id
            WHERE rr.review_id=$2 AND rr.revision=$3 AND rr.authored_by_user_id=$1
              AND r.current_revision=$3 AND r.status IN ('draft','submitted','evidence_requested','moderation_pending')
        )",
    )
    .bind(&user.id)
    .bind(&review_id)
    .bind(revision)
    .fetch_one(&state.db.pool)
    .await
    .map_err(store_error)?;
    if !author_can_link {
        return Err(unavailable());
    }
    let evidence_ref_id = format!("review-evidence-{}", Ulid::new());
    let expires_at = Utc::now() + ChronoDuration::days(PROOF_RETENTION_DAYS);
    let inserted = sqlx::query(
        "INSERT INTO wedding_review_evidence_refs
            (evidence_ref_id,review_id,revision,attachment_id,evidence_kind,created_by_user_id,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (review_id,revision,attachment_id) DO NOTHING",
    )
    .bind(&evidence_ref_id)
    .bind(&review_id)
    .bind(revision)
    .bind(request.attachment_id.trim())
    .bind(&evidence_kind)
    .bind(&user.id)
    .bind(expires_at)
    .execute(&state.db.pool)
    .await
    .map_err(store_error)?
    .rows_affected()
        == 1;
    let row = sqlx::query(
        "SELECT evidence_ref_id,evidence_kind,status,expires_at::text
         FROM wedding_review_evidence_refs
         WHERE review_id=$1 AND revision=$2 AND attachment_id=$3 AND created_by_user_id=$4",
    )
    .bind(&review_id)
    .bind(revision)
    .bind(request.attachment_id.trim())
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    Ok(Json(EvidenceReply {
        evidence_ref_id: row.get("evidence_ref_id"),
        review_id,
        revision: request.revision,
        evidence_kind: row.get("evidence_kind"),
        status: row.get("status"),
        expires_at: row.get("expires_at"),
        replayed: !inserted,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proof_types_are_explicit_and_bounded() {
        assert!(valid_evidence_kind("contract"));
        assert!(valid_evidence_kind("post_event_correspondence"));
        assert!(!valid_evidence_kind("identity_document"));
    }

    #[test]
    fn proof_retention_is_a_bounded_product_default() {
        assert_eq!(PROOF_RETENTION_DAYS, 90);
    }
}
