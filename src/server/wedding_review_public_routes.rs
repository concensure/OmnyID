//! Public Wedding review projection for canonical vendors.
//!
//! This route reads only the explicit publication table. It cannot reach an
//! author's private AFP revision or evidence, and review availability never
//! changes vendor discovery or ranking.

use super::{AppState, RateLimitPolicy, auth::public_rate_limit_key, enforce_rate_limit};
use crate::wedding_reviews::aggregate_eligible_scores;
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::{sync::Arc, time::Duration};

const MAX_PUBLIC_REVIEWS: i64 = 50;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/public/wedding/vendors/{vendor_id}/reviews",
        get(vendor_reviews_http),
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

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(
        error_kind = %error
            .as_database_error()
            .map(|value| format!("{:?}", value.kind()))
            .unwrap_or_else(|| "storage".into()),
        "Public Wedding review projection failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Wedding reviews could not be loaded just now.".into(),
    )
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

#[derive(Debug, Deserialize)]
struct PublicReviewQuery {
    sort: Option<String>,
}

#[derive(Debug, Serialize)]
struct PublicReviewAggregate {
    eligible_review_count: usize,
    average_tenths: Option<u16>,
    average_display: Option<String>,
    show_compact_score: bool,
}

#[derive(Debug, Serialize)]
struct PublicVendorReply {
    public_snapshot: Value,
    published_at: String,
}

#[derive(Debug, Serialize)]
struct PublicReviewItem {
    publication_id: String,
    experience_kind: String,
    verification_state: String,
    aggregate_eligible: bool,
    rating: Option<u8>,
    public_snapshot: Value,
    published_at: String,
    vendor_reply: Option<PublicVendorReply>,
}

#[derive(Debug, Serialize)]
struct PublicReviewReply {
    vendor_id: String,
    published_review_count: usize,
    aggregate: PublicReviewAggregate,
    reviews: Vec<PublicReviewItem>,
}

async fn vendor_reviews_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_id): Path<String>,
    Query(query): Query<PublicReviewQuery>,
) -> Result<Json<PublicReviewReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("public_wedding_vendor_reviews", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if !enabled() || !valid_id(&vendor_id) {
        return Err(unavailable());
    }
    let sort = query.sort.as_deref().unwrap_or("recent").trim();
    if !["recent", "rating_low", "rating_high"].contains(&sort) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a valid review order.".into(),
        ));
    }
    let vendor_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM wedding_vendors
            WHERE vendor_id=$1 AND status='active'
         )",
    )
    .bind(&vendor_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(store_error)?;
    if !vendor_exists {
        return Err(unavailable());
    }
    let rows = sqlx::query(
        "SELECT publication.publication_id,publication.experience_kind,
                publication.verification_state,publication.aggregate_eligible,
                publication.rating,publication.public_snapshot,
                publication.published_at::text,
                reply.public_snapshot AS reply_snapshot,
                reply.updated_at::text AS reply_published_at
         FROM wedding_review_publications publication
         LEFT JOIN LATERAL (
             SELECT public_snapshot,updated_at
             FROM wedding_review_vendor_replies vendor_reply
             WHERE vendor_reply.review_id=publication.review_id
               AND vendor_reply.vendor_id=publication.vendor_id
               AND vendor_reply.status='published'
             ORDER BY vendor_reply.revision DESC LIMIT 1
         ) reply ON TRUE
         WHERE publication.vendor_id=$1 AND publication.status='published'
         ORDER BY
           CASE WHEN $2='rating_low' THEN publication.rating END ASC NULLS LAST,
           CASE WHEN $2='rating_high' THEN publication.rating END DESC NULLS LAST,
           publication.published_at DESC,publication.publication_id
         LIMIT $3",
    )
    .bind(&vendor_id)
    .bind(sort)
    .bind(MAX_PUBLIC_REVIEWS)
    .fetch_all(&state.db.pool)
    .await
    .map_err(store_error)?;
    let scores = rows
        .iter()
        .filter(|row| row.get::<bool, _>("aggregate_eligible"))
        .filter_map(|row| row.try_get::<i16, _>("rating").ok())
        .map(|rating| rating as u8)
        .collect::<Vec<_>>();
    let aggregate = aggregate_eligible_scores(&scores).map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Wedding review totals could not be calculated just now.".into(),
        )
    })?;
    let reviews = rows
        .into_iter()
        .map(|row| {
            let reply_snapshot = row.try_get::<Value, _>("reply_snapshot").ok();
            let reply_published_at = row.try_get::<String, _>("reply_published_at").ok();
            PublicReviewItem {
                publication_id: row.get("publication_id"),
                experience_kind: row.get("experience_kind"),
                verification_state: row.get("verification_state"),
                aggregate_eligible: row.get("aggregate_eligible"),
                rating: row
                    .try_get::<i16, _>("rating")
                    .ok()
                    .map(|value| value as u8),
                public_snapshot: row.get("public_snapshot"),
                published_at: row.get("published_at"),
                vendor_reply: reply_snapshot.zip(reply_published_at).map(
                    |(public_snapshot, published_at)| PublicVendorReply {
                        public_snapshot,
                        published_at,
                    },
                ),
            }
        })
        .collect::<Vec<_>>();
    Ok(Json(PublicReviewReply {
        vendor_id,
        published_review_count: reviews.len(),
        aggregate: PublicReviewAggregate {
            eligible_review_count: aggregate.count,
            average_tenths: aggregate.average_tenths,
            average_display: aggregate
                .average_tenths
                .map(|value| format!("{}.{:01}", value / 10, value % 10)),
            show_compact_score: aggregate.show_compact_score,
        },
        reviews,
    }))
}
