/*
 * @module-id: rust.server.wedding-vendor-claim-routes
 * @primary-capability: wedding.vendor-directory-and-claim-intake
 * @locs-version: 2.0
 * @stability: draft
 * @owner: omnyid
 */

//! Public wedding-directory and authenticated vendor-claim entry points.
//!
//! This module intentionally contains no message body handling. The later enquiry
//! protocol accepts only signed, encrypted envelopes; the claim endpoint merely
//! establishes a rate-limited, auditable ownership-intake record.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

const MAX_QUERY_LENGTH: usize = 120;
const DIRECTORY_PAGE_SIZE: i64 = 24;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/public/wedding/vendors", get(public_directory_http))
        .route(
            "/api/public/wedding/vendors/{slug}",
            get(public_vendor_http),
        )
        .route(
            "/api/wedding/vendor/intake",
            get(vendor_intake_status_http).post(vendor_intake_start_http),
        )
}

#[derive(Debug, Deserialize)]
struct DirectoryQuery {
    q: Option<String>,
    category: Option<String>,
    location: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct VendorPath {
    slug: String,
}

#[derive(Debug, Deserialize)]
struct IntakeStatusQuery {
    vendor_slug: String,
}

#[derive(Debug, Deserialize)]
struct VendorIntakeRequest {
    vendor_slug: String,
    declared_role: String,
    /// A vendor may nominate an existing Agent ID now; it is not linked until the
    /// signed AgentCard challenge in WED-168 has verified ownership.
    agent_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct VendorIntakeResponse {
    claim_id: String,
    vendor_slug: String,
    status: String,
    requires_agent_card: bool,
}

async fn public_directory_http(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DirectoryQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let q = clean_optional(query.q)?;
    let category = clean_optional(query.category)?;
    let location = clean_optional(query.location)?;
    let limit = query.limit.unwrap_or(DIRECTORY_PAGE_SIZE).clamp(1, 48);
    let rows = sqlx::query(
        r#"
        SELECT
            v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
            v.website_url, v.claim_status,
            COALESCE(p.description, '') AS owner_description,
            COALESCE(p.price_tier, '') AS price_tier,
            COALESCE(p.capacity_min, 0) AS capacity_min,
            COALESCE(p.capacity_max, 0) AS capacity_max,
            COALESCE(p.styles, ARRAY[]::TEXT[]) AS styles,
            COALESCE(p.flags, ARRAY[]::TEXT[]) AS flags,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', photo_url, 'alt_text', alt_text, 'source_label', source_label
                ) ORDER BY slot)
                FROM wedding_vendor_photos photo
                WHERE photo.vendor_id = v.vendor_id
            ), '[]'::jsonb) AS photos
        FROM wedding_vendors v
        LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
        WHERE v.status = 'active'
          AND ($1::TEXT IS NULL OR lower(v.vendor_name) LIKE '%' || lower($1) || '%'
               OR lower(v.category) LIKE '%' || lower($1) || '%'
               OR lower(v.service_area) LIKE '%' || lower($1) || '%')
          AND ($2::TEXT IS NULL OR lower(v.category) = lower($2))
          AND ($3::TEXT IS NULL OR lower(v.service_area) LIKE '%' || lower($3) || '%')
        ORDER BY
            CASE v.claim_status WHEN 'verified' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END,
            v.vendor_name ASC
        LIMIT $4
        "#,
    )
    .bind(q)
    .bind(category)
    .bind(location)
    .bind(limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;

    let items = rows
        .into_iter()
        .map(public_vendor_from_row)
        .collect::<Vec<_>>();
    Ok(Json(json!({ "items": items, "next_cursor": Value::Null })))
}

async fn public_vendor_http(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(path): axum::extract::Path<VendorPath>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let slug = valid_slug(&path.slug)?;
    let row = sqlx::query(
        r#"
        SELECT
            v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
            v.website_url, v.claim_status,
            COALESCE(p.description, '') AS owner_description,
            COALESCE(p.price_tier, '') AS price_tier,
            COALESCE(p.capacity_min, 0) AS capacity_min,
            COALESCE(p.capacity_max, 0) AS capacity_max,
            COALESCE(p.styles, ARRAY[]::TEXT[]) AS styles,
            COALESCE(p.flags, ARRAY[]::TEXT[]) AS flags,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', photo_url, 'alt_text', alt_text, 'source_label', source_label
                ) ORDER BY slot)
                FROM wedding_vendor_photos photo
                WHERE photo.vendor_id = v.vendor_id
            ), '[]'::jsonb) AS photos
        FROM wedding_vendors v
        LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
        WHERE v.status = 'active' AND v.vendor_slug = $1
        LIMIT 1
        "#,
    )
    .bind(slug)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            "vendor listing not found".to_string(),
        )
    })?;
    Ok(Json(json!({ "item": public_vendor_from_row(row) })))
}

async fn vendor_intake_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<IntakeStatusQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let slug = valid_slug(&query.vendor_slug)?;
    let claim = sqlx::query(
        r#"
        SELECT c.claim_id, c.status, v.vendor_slug
        FROM wedding_vendor_claims c
        JOIN wedding_vendors v ON v.vendor_id = c.vendor_id
        WHERE c.user_id = $1 AND v.vendor_slug = $2
        ORDER BY c.created_at DESC
        LIMIT 1
        "#,
    )
    .bind(user.id)
    .bind(slug)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?;
    Ok(Json(json!({ "claim": claim.map(claim_status_from_row) })))
}

async fn vendor_intake_start_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<VendorIntakeRequest>,
) -> Result<Json<VendorIntakeResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_intake", &headers),
        RateLimitPolicy {
            max_requests: 3,
            window: std::time::Duration::from_secs(24 * 60 * 60),
        },
    )
    .await?;

    let slug = valid_slug(&body.vendor_slug)?;
    let declared_role = valid_declared_role(&body.declared_role)?;
    let nominated_agent_id = body
        .agent_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if nominated_agent_id.is_some_and(|value| value.len() > 160) {
        return Err((StatusCode::BAD_REQUEST, "agent_id is too long".to_string()));
    }

    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let listing = sqlx::query(
        "SELECT vendor_id, claim_status, claimed_by_user_id FROM wedding_vendors WHERE vendor_slug = $1 AND status = 'active' FOR UPDATE",
    )
    .bind(&slug)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "vendor listing not found".to_string()))?;
    let vendor_id: String = listing.get("vendor_id");
    let claim_status: String = listing.get("claim_status");
    let owner: Option<String> = listing.get("claimed_by_user_id");

    if claim_status != "unclaimed" && owner.as_deref() != Some(user.id.as_str()) {
        return Err((
            StatusCode::CONFLICT,
            "this listing is already being claimed".to_string(),
        ));
    }

    sqlx::query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, 'vendor') ON CONFLICT DO NOTHING",
    )
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;

    if let Some(existing) = sqlx::query(
        "SELECT claim_id, status FROM wedding_vendor_claims WHERE vendor_id = $1 AND user_id = $2 AND status = 'started' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&vendor_id)
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)? {
        tx.commit().await.map_err(database_failure)?;
        return Ok(Json(VendorIntakeResponse {
            claim_id: existing.get("claim_id"), vendor_slug: slug, status: existing.get("status"), requires_agent_card: true,
        }));
    }

    let claim_id = Ulid::new().to_string();
    sqlx::query(
        r#"INSERT INTO wedding_vendor_claims
            (claim_id, vendor_id, user_id, status, declared_role, step_state)
           VALUES ($1, $2, $3, 'started', $4, jsonb_build_object('nominated_agent_id', $5::text))"#,
    )
    .bind(&claim_id)
    .bind(&vendor_id)
    .bind(&user.id)
    .bind(declared_role)
    .bind(nominated_agent_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    sqlx::query(
        "UPDATE wedding_vendors SET claim_status = 'claim_pending', claimed_by_user_id = $1, claimed_at = NOW(), updated_at = NOW() WHERE vendor_id = $2",
    )
    .bind(&user.id)
    .bind(&vendor_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;

    Ok(Json(VendorIntakeResponse {
        claim_id,
        vendor_slug: slug,
        status: "started".to_string(),
        requires_agent_card: true,
    }))
}

fn public_vendor_from_row(row: sqlx::postgres::PgRow) -> Value {
    let claim_status: String = row.get("claim_status");
    json!({
        "slug": row.get::<String, _>("vendor_slug"),
        "name": row.get::<String, _>("vendor_name"),
        "category": row.get::<String, _>("category"),
        "service_area": row.get::<String, _>("service_area"),
        "address": row.try_get::<Option<String>, _>("address").ok().flatten(),
        "website_url": row.try_get::<Option<String>, _>("website_url").ok().flatten(),
        "claim_status": claim_status,
        "claim_cta": row.get::<String, _>("claim_status") == "unclaimed",
        "description": row.get::<String, _>("owner_description"),
        "price_tier": row.get::<String, _>("price_tier"),
        "capacity_min": row.get::<i32, _>("capacity_min"),
        "capacity_max": row.get::<i32, _>("capacity_max"),
        "styles": row.get::<Vec<String>, _>("styles"),
        "flags": row.get::<Vec<String>, _>("flags"),
        "photos": row.get::<Value, _>("photos"),
    })
}

fn claim_status_from_row(row: sqlx::postgres::PgRow) -> Value {
    json!({
        "claim_id": row.get::<String, _>("claim_id"),
        "status": row.get::<String, _>("status"),
        "vendor_slug": row.get::<String, _>("vendor_slug"),
    })
}

fn clean_optional(value: Option<String>) -> Result<Option<String>, (StatusCode, String)> {
    value
        .map(|raw| {
            let clean = raw.trim();
            if clean.len() > MAX_QUERY_LENGTH {
                Err((
                    StatusCode::BAD_REQUEST,
                    "search value is too long".to_string(),
                ))
            } else {
                Ok(clean.to_string())
            }
        })
        .transpose()
        .map(|value| value.filter(|value| !value.is_empty()))
}

fn valid_slug(raw: &str) -> Result<String, (StatusCode, String)> {
    let value = raw.trim().to_ascii_lowercase();
    if value.is_empty()
        || value.len() > MAX_QUERY_LENGTH
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "valid vendor_slug is required".to_string(),
        ));
    }
    Ok(value)
}

fn valid_declared_role(raw: &str) -> Result<&str, (StatusCode, String)> {
    match raw.trim() {
        "owner" | "manager" | "marketing" | "other" => Ok(raw.trim()),
        _ => Err((
            StatusCode::BAD_REQUEST,
            "declared_role must be owner, manager, marketing, or other".to_string(),
        )),
    }
}

fn database_failure(_: sqlx::Error) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "vendor directory is temporarily unavailable".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::{valid_declared_role, valid_slug};
    use axum::http::StatusCode;

    #[test]
    fn accepts_safe_listing_slugs_only() {
        assert_eq!(valid_slug(" Harbour-Ridge-1 ").unwrap(), "harbour-ridge-1");
        assert_eq!(
            valid_slug("../../admin").unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn restricts_ownership_declarations_to_known_values() {
        assert_eq!(valid_declared_role("owner").unwrap(), "owner");
        assert_eq!(
            valid_declared_role("administrator").unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
    }
}
