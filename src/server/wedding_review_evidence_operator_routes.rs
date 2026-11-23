//! Operator-only access and purge execution for protected review evidence.
//!
//! Access uses the existing short-lived attachment capability. Audit rows keep
//! only actor, purpose, review and evidence-reference IDs; storage coordinates,
//! contacts and evidence content never enter the shared review event ledger.

use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    cost_controls::operator_access_allowed, enforce_rate_limit, file_upload_routes,
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::{sync::Arc, time::Duration};
use ulid::Ulid;

const MAX_PURGE_BATCH: i64 = 25;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/admin/wedding/reviews/{review_id}/evidence",
            get(list_operator_evidence_http),
        )
        .route(
            "/admin/wedding/reviews/evidence/{evidence_ref_id}/schedule-purge",
            post(schedule_purge_http),
        )
        .route(
            "/admin/wedding/reviews/evidence/purge-due",
            post(purge_due_http),
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

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(
        error_kind = %error
            .as_database_error()
            .map(|value| format!("{:?}", value.kind()))
            .unwrap_or_else(|| "storage".into()),
        "Wedding review evidence operator action failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Review evidence could not be handled just now.".into(),
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

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn valid_purpose(value: &str) -> bool {
    [
        "eligibility",
        "evidence",
        "duplicate",
        "conflict",
        "personal_information",
        "appeal",
    ]
    .contains(&value)
}

#[derive(Debug, Deserialize)]
struct EvidenceAccessQuery {
    purpose: String,
}

#[derive(Debug, Serialize)]
struct OperatorEvidenceItem {
    evidence_ref_id: String,
    evidence_kind: String,
    status: String,
    expires_at: Option<String>,
    file_name: String,
    mime_type: String,
    size_bytes: i64,
    access_url: String,
}

#[derive(Debug, Serialize)]
struct OperatorEvidenceReply {
    review_id: String,
    purpose: String,
    items: Vec<OperatorEvidenceItem>,
}

async fn list_operator_evidence_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Query(query): Query<EvidenceAccessQuery>,
) -> Result<Json<OperatorEvidenceReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_operator_evidence", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = operator(&state, &headers).await?;
    let purpose = query.purpose.trim().to_ascii_lowercase();
    if !valid_id(&review_id) || !valid_purpose(&purpose) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a valid review and access purpose.".into(),
        ));
    }
    let rows = sqlx::query(
        "SELECT e.evidence_ref_id,e.attachment_id,e.evidence_kind,e.status,e.expires_at::text,
                e.created_by_user_id
         FROM wedding_review_evidence_refs e
         WHERE e.review_id=$1 AND e.status <> 'purged' AND e.purged_at IS NULL
         ORDER BY e.created_at,e.evidence_ref_id",
    )
    .bind(&review_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(store_error)?;
    if rows.is_empty() {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM wedding_reviews WHERE review_id=$1)",
        )
        .bind(&review_id)
        .fetch_one(&state.db.pool)
        .await
        .map_err(store_error)?;
        if !exists {
            return Err(unavailable());
        }
    }
    let mut items = Vec::with_capacity(rows.len());
    let mut transaction = state.db.pool.begin().await.map_err(store_error)?;
    for row in rows {
        let evidence_ref_id: String = row.get("evidence_ref_id");
        let attachment_id: String = row.get("attachment_id");
        let owner_user_id: String = row.get("created_by_user_id");
        let Some(attachment) = state
            .db
            .private_attachment_by_id(&owner_user_id, &attachment_id)
            .await
            .map_err(store_error)?
        else {
            continue;
        };
        let access_url = file_upload_routes::build_download_url(
            &attachment.id,
            &attachment.storage_backend,
            &attachment.storage_key,
            &attachment.name,
            &attachment.mime_type,
        )?;
        sqlx::query(
            "INSERT INTO wedding_review_evidence_access_log
                (access_id,evidence_ref_id,review_id,operator_user_id,purpose_code)
             VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(format!("review-evidence-access-{}", Ulid::new()))
        .bind(&evidence_ref_id)
        .bind(&review_id)
        .bind(&user.id)
        .bind(&purpose)
        .execute(&mut *transaction)
        .await
        .map_err(store_error)?;
        items.push(OperatorEvidenceItem {
            evidence_ref_id,
            evidence_kind: row.get("evidence_kind"),
            status: row.get("status"),
            expires_at: row.try_get("expires_at").ok(),
            file_name: attachment.name,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
            access_url,
        });
    }
    transaction.commit().await.map_err(store_error)?;
    Ok(Json(OperatorEvidenceReply {
        review_id,
        purpose,
        items,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SchedulePurgeRequest {
    reason_code: String,
}

#[derive(Debug, Serialize)]
struct SchedulePurgeReply {
    evidence_ref_id: String,
    status: String,
    scheduled: bool,
}

async fn schedule_purge_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(evidence_ref_id): Path<String>,
    Json(request): Json<SchedulePurgeRequest>,
) -> Result<Json<SchedulePurgeReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_evidence_purge_schedule", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    operator(&state, &headers).await?;
    let reason = request.reason_code.trim().to_ascii_lowercase();
    if !valid_id(&evidence_ref_id)
        || ![
            "retention_expired",
            "author_withdrawal",
            "appeal_resolved",
            "privacy_request",
        ]
        .contains(&reason.as_str())
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a valid evidence reference and purge reason.".into(),
        ));
    }
    let changed = sqlx::query(
        "UPDATE wedding_review_evidence_refs
         SET status='purge_scheduled',expires_at=LEAST(COALESCE(expires_at,NOW()),NOW())
         WHERE evidence_ref_id=$1 AND status <> 'purged' AND purged_at IS NULL",
    )
    .bind(&evidence_ref_id)
    .execute(&state.db.pool)
    .await
    .map_err(store_error)?
    .rows_affected()
        == 1;
    if !changed {
        return Err(unavailable());
    }
    tracing::info!(evidence_ref_id = %evidence_ref_id, reason_code = %reason, "Wedding review evidence purge scheduled");
    Ok(Json(SchedulePurgeReply {
        evidence_ref_id,
        status: "purge_scheduled".into(),
        scheduled: true,
    }))
}

#[derive(Debug, Serialize)]
struct PurgeDueReply {
    selected: usize,
    purged: usize,
    retry_required: usize,
}

async fn purge_due_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<PurgeDueReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_evidence_purge_due", &headers),
        RateLimitPolicy {
            max_requests: 5,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    operator(&state, &headers).await?;
    let rows = sqlx::query(
        "SELECT evidence_ref_id,attachment_id,created_by_user_id
         FROM wedding_review_evidence_refs
         WHERE status='purge_scheduled' AND purged_at IS NULL AND expires_at <= NOW()
         ORDER BY expires_at,evidence_ref_id
         LIMIT $1",
    )
    .bind(MAX_PURGE_BATCH)
    .fetch_all(&state.db.pool)
    .await
    .map_err(store_error)?;
    let selected = rows.len();
    let mut purged = 0;
    for row in rows {
        let evidence_ref_id: String = row.get("evidence_ref_id");
        let attachment_id: String = row.get("attachment_id");
        let owner_user_id: String = row.get("created_by_user_id");
        let attachment = state
            .db
            .private_attachment_by_id(&owner_user_id, &attachment_id)
            .await
            .map_err(store_error)?;
        if let Some(attachment) = attachment {
            if let Err(error) = file_upload_routes::delete_uploaded_file(
                &attachment.storage_backend,
                &attachment.storage_key,
            )
            .await
            {
                tracing::warn!(evidence_ref_id = %evidence_ref_id, error = %error, "Wedding review proof purge will be retried");
                continue;
            }
            state
                .db
                .delete_private_attachment_by_id(&owner_user_id, &attachment_id)
                .await
                .map_err(store_error)?;
        }
        let affected = sqlx::query(
            "UPDATE wedding_review_evidence_refs
             SET status='purged',purged_at=NOW()
             WHERE attachment_id=$1 AND created_by_user_id=$2 AND purged_at IS NULL",
        )
        .bind(&attachment_id)
        .bind(&owner_user_id)
        .execute(&state.db.pool)
        .await
        .map_err(store_error)?
        .rows_affected();
        if affected > 0 {
            purged += 1;
        }
    }
    Ok(Json(PurgeDueReply {
        selected,
        purged,
        retry_required: selected.saturating_sub(purged),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_purpose_is_explicit_and_content_free() {
        assert!(valid_purpose("eligibility"));
        assert!(valid_purpose("appeal"));
        assert!(!valid_purpose("read everything"));
    }

    #[test]
    fn purge_batch_is_bounded() {
        assert_eq!(MAX_PURGE_BATCH, 25);
    }
}
