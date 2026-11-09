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
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ulid::Ulid;

use crate::agentcard::AgentCard;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

const MAX_QUERY_LENGTH: usize = 120;
const DIRECTORY_PAGE_SIZE: i64 = 24;
const DIRECTORY_MAX_PAGE_SIZE: i64 = 500;
const CLAIM_SUGGESTION_LIMIT: usize = 8;
pub(super) const PHOTO_LICENCE_VERSION: &str = "vendor-image-licence-2026-11-09";
pub(super) const PHOTO_LICENCE_SHA256: &str =
    "03b1fa11efedc62062d5fa1ca7e6afe680af3aa83596ebb96c2a69a348274838";
const PHOTO_LICENCE_CONSENT: &str = "I confirm that I have read and agree to the Vendor Image Licence Agreement, and that I am authorised to grant the licence above for all Images submitted.";

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
        .route(
            "/api/wedding/vendor/suggestions",
            get(vendor_claim_suggestions_http),
        )
        .route(
            "/api/wedding/vendor/agent-card",
            post(vendor_agent_card_publish_http),
        )
        .route(
            "/api/wedding/vendor/photo-licence",
            get(photo_licence_document_http).post(photo_licence_accept_http),
        )
        .route(
            "/.well-known/afp/agents/{agent_id}/card",
            get(public_vendor_agent_card_http),
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
struct VendorSuggestionQuery {
    q: String,
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
    expected_agent_id: String,
    ownership_verified: bool,
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct VendorAgentCardRequest {
    vendor_slug: String,
    card: AgentCard,
}

#[derive(Serialize)]
struct VendorAgentCardResponse {
    agent_id: String,
    card_url: String,
}

#[derive(Deserialize)]
struct VendorAgentCardPath {
    agent_id: String,
}

#[derive(Deserialize)]
struct PhotoLicenceAcceptanceRequest {
    vendor_slug: String,
    accepted: bool,
    agreement_version: Option<String>,
}

#[derive(Serialize)]
struct PhotoLicenceDocumentResponse {
    agreement_version: &'static str,
    agreement_sha256: &'static str,
    agreement_url: &'static str,
    consent_label: &'static str,
}

#[derive(Serialize)]
struct PhotoLicenceAcceptanceResponse {
    photo_licence_id: String,
    accepted_at: String,
    agreement_version: &'static str,
}

async fn public_directory_http(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DirectoryQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let q = clean_optional(query.q)?;
    let category = clean_optional(query.category)?;
    let location = clean_optional(query.location)?;
    let limit = query
        .limit
        .unwrap_or(DIRECTORY_PAGE_SIZE)
        .clamp(1, DIRECTORY_MAX_PAGE_SIZE);
    let rows = sqlx::query(
        r#"
        SELECT
            v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
            v.website_url, v.claim_status, link.agent_id AS linked_agent_id,
            COALESCE(p.description, '') AS owner_description,
            COALESCE(p.price_tier, '') AS price_tier,
            COALESCE(p.capacity_min, 0) AS capacity_min,
            COALESCE(p.capacity_max, 0) AS capacity_max,
            COALESCE(p.styles, ARRAY[]::TEXT[]) AS styles,
            COALESCE(p.flags, ARRAY[]::TEXT[]) AS flags,
            COALESCE(p.public_contact, '{}'::jsonb) AS public_contact,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', photo_url, 'alt_text', alt_text, 'source_label', source_label
                ) ORDER BY slot)
                FROM wedding_vendor_photos photo
                WHERE photo.vendor_id = v.vendor_id
            ), '[]'::jsonb) AS photos
            ,COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', '/api/public/wedding/vendor/photos/' || asset_id || '/medium',
                    'alt_text', COALESCE(alt_text, v.vendor_name || ' vendor photo'),
                    'source_label', 'Vendor supplied'
                ) ORDER BY is_cover DESC, position ASC)
                FROM wedding_vendor_owner_assets asset
                WHERE asset.vendor_id = v.vendor_id
                  AND asset.status = 'live'
                  AND v.claim_status = 'verified'
            ), '[]'::jsonb) AS owner_photos
        FROM wedding_vendors v
        LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
        LEFT JOIN wedding_vendor_agent_links link ON link.vendor_id = v.vendor_id
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

async fn vendor_claim_suggestions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorSuggestionQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_claim_suggestions", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: std::time::Duration::from_secs(60),
        },
    )
    .await?;
    let query = clean_claim_search(&query.q)?;
    if query.chars().count() < 2 {
        return Ok(Json(json!({ "items": [] })));
    }
    let rows = sqlx::query(
        r#"SELECT vendor_slug, vendor_name, category, service_area
           FROM wedding_vendors
           WHERE status = 'active'
           ORDER BY vendor_name ASC
           LIMIT 500"#,
    )
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let mut items = rows
        .into_iter()
        .filter_map(|row| {
            let name: String = row.get("vendor_name");
            fuzzy_claim_score(&query, &name).map(|score| {
                (
                    score,
                    name.clone(),
                    json!({
                        "vendor_slug": row.get::<String, _>("vendor_slug"),
                        "vendor_name": name,
                        "category": row.get::<String, _>("category"),
                        "service_area": row.get::<String, _>("service_area"),
                    }),
                )
            })
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.to_lowercase().cmp(&right.1.to_lowercase()))
    });
    Ok(Json(json!({
        "items": items.into_iter().take(CLAIM_SUGGESTION_LIMIT).map(|(_, _, item)| item).collect::<Vec<_>>()
    })))
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
            v.website_url, v.claim_status, link.agent_id AS linked_agent_id,
            COALESCE(p.description, '') AS owner_description,
            COALESCE(p.price_tier, '') AS price_tier,
            COALESCE(p.capacity_min, 0) AS capacity_min,
            COALESCE(p.capacity_max, 0) AS capacity_max,
            COALESCE(p.styles, ARRAY[]::TEXT[]) AS styles,
            COALESCE(p.flags, ARRAY[]::TEXT[]) AS flags,
            COALESCE(p.public_contact, '{}'::jsonb) AS public_contact,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', photo_url, 'alt_text', alt_text, 'source_label', source_label
                ) ORDER BY slot)
                FROM wedding_vendor_photos photo
                WHERE photo.vendor_id = v.vendor_id
            ), '[]'::jsonb) AS photos
            ,COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'url', '/api/public/wedding/vendor/photos/' || asset_id || '/medium',
                    'alt_text', COALESCE(alt_text, v.vendor_name || ' vendor photo'),
                    'source_label', 'Vendor supplied'
                ) ORDER BY is_cover DESC, position ASC)
                FROM wedding_vendor_owner_assets asset
                WHERE asset.vendor_id = v.vendor_id
                  AND asset.status = 'live'
                  AND v.claim_status = 'verified'
            ), '[]'::jsonb) AS owner_photos
        FROM wedding_vendors v
        LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
        LEFT JOIN wedding_vendor_agent_links link ON link.vendor_id = v.vendor_id
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
    sqlx::query(
        "UPDATE wedding_vendor_claims SET status = 'abandoned', updated_at = NOW() WHERE user_id = $1 AND status = 'started' AND expires_at <= NOW()",
    )
    .bind(&user.id)
    .execute(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let claim = sqlx::query(
        r#"
        SELECT c.claim_id, c.status, c.expires_at::text AS expires_at, v.vendor_slug
        FROM wedding_vendor_claims c
        JOIN wedding_vendors v ON v.vendor_id = c.vendor_id
        WHERE c.user_id = $1 AND v.vendor_slug = $2
        ORDER BY c.created_at DESC
        LIMIT 1
        "#,
    )
    .bind(&user.id)
    .bind(slug)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?;
    Ok(Json(
        json!({ "claim": claim.map(|row| claim_status_from_row(row, &user.id)) }),
    ))
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

    if matches!(claim_status.as_str(), "claimed" | "verified" | "disputed")
        && owner.as_deref() != Some(user.id.as_str())
    {
        return Err((
            StatusCode::CONFLICT,
            "this listing is already being claimed".to_string(),
        ));
    }

    sqlx::query(
        "UPDATE wedding_vendor_claims SET status = 'abandoned', updated_at = NOW() WHERE vendor_id = $1 AND user_id = $2 AND status = 'started' AND expires_at <= NOW()",
    )
    .bind(&vendor_id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;

    if let Some(existing) = sqlx::query(
        "SELECT claim_id, status, expires_at::text AS expires_at FROM wedding_vendor_claims WHERE vendor_id = $1 AND user_id = $2 AND status = 'started' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&vendor_id)
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)? {
        tx.commit().await.map_err(database_failure)?;
        return Ok(Json(VendorIntakeResponse {
            claim_id: existing.get("claim_id"),
            expected_agent_id: expected_vendor_agent_id(&slug, &user.id),
            vendor_slug: slug,
            status: existing.get("status"),
            requires_agent_card: false,
            ownership_verified: false,
            expires_at: existing.get("expires_at"),
        }));
    }

    let claim_id = Ulid::new().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::hours(72)).to_rfc3339();
    sqlx::query(
        r#"INSERT INTO wedding_vendor_claims
            (claim_id, vendor_id, user_id, status, declared_role, step_state, expires_at)
           VALUES ($1, $2, $3, 'started', $4, jsonb_build_object('nominated_agent_id', $5::text), $6::timestamptz)"#,
    )
    .bind(&claim_id)
    .bind(&vendor_id)
    .bind(&user.id)
    .bind(declared_role)
    .bind(nominated_agent_id)
    .bind(&expires_at)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;

    Ok(Json(VendorIntakeResponse {
        claim_id,
        expected_agent_id: expected_vendor_agent_id(&slug, &user.id),
        vendor_slug: slug,
        status: "started".to_string(),
        requires_agent_card: false,
        ownership_verified: false,
        expires_at: Some(expires_at),
    }))
}

async fn vendor_agent_card_publish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<VendorAgentCardRequest>,
) -> Result<Json<VendorAgentCardResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_agent_card", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: std::time::Duration::from_secs(60 * 60),
        },
    )
    .await?;

    let slug = valid_slug(&body.vendor_slug)?;
    let expected_agent_id = expected_vendor_agent_id(&slug, &user.id);
    validate_vendor_agent_card(&body.card, &expected_agent_id)?;

    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let listing = sqlx::query(
        r#"SELECT vendor_id, vendor_name, claim_status, claimed_by_user_id
           FROM wedding_vendors
           WHERE vendor_slug = $1 AND status = 'active'
           FOR UPDATE"#,
    )
    .bind(&slug)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            "vendor listing not found".to_string(),
        )
    })?;
    let vendor_id: String = listing.get("vendor_id");
    let vendor_name: String = listing.get("vendor_name");
    let claim_status: String = listing.get("claim_status");
    let owner: Option<String> = listing.get("claimed_by_user_id");
    if claim_status != "verified" || owner.as_deref() != Some(user.id.as_str()) {
        return Err((
            StatusCode::CONFLICT,
            "verify ownership before publishing an AgentCard".to_string(),
        ));
    }

    if let Some(existing_owner) =
        sqlx::query("SELECT owner_user_id FROM managed_agents WHERE agent_id = $1 FOR UPDATE")
            .bind(&expected_agent_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(database_failure)?
    {
        let existing_owner: String = existing_owner.get("owner_user_id");
        if existing_owner != user.id {
            return Err((
                StatusCode::CONFLICT,
                "that managed agent is owned by another account".to_string(),
            ));
        }
    }

    let metadata = json!({
        "origin": "wedding_vendor_claim",
        "vendor_slug": slug,
        "key_id": body.card.key_id,
    });
    sqlx::query(
        r#"INSERT INTO managed_agents
            (id, owner_user_id, agent_id, label, email, kind, created_at, metadata)
           VALUES ($1, $2, $3, $4, $5, 'wedding_vendor', NOW(), $6)
           ON CONFLICT (agent_id) DO UPDATE SET
             label = EXCLUDED.label,
             email = EXCLUDED.email,
             kind = EXCLUDED.kind,
             metadata = EXCLUDED.metadata"#,
    )
    .bind(Ulid::new().to_string())
    .bind(&user.id)
    .bind(&expected_agent_id)
    .bind(format!("{} enquiries", vendor_name))
    .bind(&user.email)
    .bind(metadata)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;

    if let Some(existing_agent_id) = sqlx::query(
        "SELECT agent_id FROM wedding_vendor_agent_links WHERE vendor_id = $1 FOR UPDATE",
    )
    .bind(&vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    {
        let existing_agent_id: String = existing_agent_id.get("agent_id");
        if existing_agent_id != expected_agent_id {
            return Err((
                StatusCode::CONFLICT,
                "this listing is already linked to another managed agent".to_string(),
            ));
        }
    }

    sqlx::query(
        r#"INSERT INTO wedding_vendor_agent_links
            (vendor_id, agent_id, agent_card, card_verified_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (vendor_id) DO UPDATE SET
             agent_id = EXCLUDED.agent_id,
             agent_card = EXCLUDED.agent_card,
             card_verified_at = EXCLUDED.card_verified_at"#,
    )
    .bind(&vendor_id)
    .bind(&expected_agent_id)
    .bind(serde_json::to_value(&body.card).map_err(|_| invalid_agent_card())?)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;

    Ok(Json(VendorAgentCardResponse {
        card_url: vendor_agent_card_url(&expected_agent_id),
        agent_id: expected_agent_id,
    }))
}

async fn photo_licence_document_http() -> Json<PhotoLicenceDocumentResponse> {
    Json(PhotoLicenceDocumentResponse {
        agreement_version: PHOTO_LICENCE_VERSION,
        agreement_sha256: PHOTO_LICENCE_SHA256,
        agreement_url: "/wedding/vendor-image-licence.html",
        consent_label: PHOTO_LICENCE_CONSENT,
    })
}

async fn photo_licence_accept_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PhotoLicenceAcceptanceRequest>,
) -> Result<Json<PhotoLicenceAcceptanceResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_photo_licence", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: std::time::Duration::from_secs(24 * 60 * 60),
        },
    )
    .await?;
    if !body.accepted {
        return Err((
            StatusCode::BAD_REQUEST,
            "photo licence consent is required before publishing images".to_string(),
        ));
    }
    if body
        .agreement_version
        .as_deref()
        .is_some_and(|version| version.trim() != PHOTO_LICENCE_VERSION)
    {
        return Err((
            StatusCode::CONFLICT,
            "the photo licence has changed; review and accept the current version".to_string(),
        ));
    }

    let slug = valid_slug(&body.vendor_slug)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let listing = sqlx::query(
        r#"SELECT vendor_id, claim_status, claimed_by_user_id
           FROM wedding_vendors
           WHERE vendor_slug = $1 AND status = 'active'
           FOR UPDATE"#,
    )
    .bind(&slug)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            "vendor listing not found".to_string(),
        )
    })?;
    let vendor_id: String = listing.get("vendor_id");
    let claim_status: String = listing.get("claim_status");
    let owner: Option<String> = listing.get("claimed_by_user_id");
    if owner.as_deref() != Some(user.id.as_str()) || claim_status != "verified" {
        return Err((
            StatusCode::FORBIDDEN,
            "verify ownership before accepting the photo licence".to_string(),
        ));
    }

    let photo_licence_id = Ulid::new().to_string();
    let accepted_at = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        r#"INSERT INTO wedding_vendor_photo_licences
            (photo_licence_id, vendor_id, user_id, agreement_version, agreement_sha256,
             consent_copy, accepted_at, accepted_ip_hash, accepted_user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)"#,
    )
    .bind(&photo_licence_id)
    .bind(&vendor_id)
    .bind(&user.id)
    .bind(PHOTO_LICENCE_VERSION)
    .bind(PHOTO_LICENCE_SHA256)
    .bind(PHOTO_LICENCE_CONSENT)
    .bind(&accepted_at)
    .bind(request_ip_hash(&headers))
    .bind(request_user_agent(&headers))
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;

    Ok(Json(PhotoLicenceAcceptanceResponse {
        photo_licence_id,
        accepted_at,
        agreement_version: PHOTO_LICENCE_VERSION,
    }))
}

async fn public_vendor_agent_card_http(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(path): axum::extract::Path<VendorAgentCardPath>,
) -> Result<Json<AgentCard>, (StatusCode, String)> {
    let agent_id = path.agent_id.trim();
    if agent_id.is_empty() || agent_id.len() > 160 {
        return Err((StatusCode::NOT_FOUND, "agent card not found".to_string()));
    }
    let card_value = sqlx::query(
        r#"SELECT link.agent_card
           FROM wedding_vendor_agent_links link
           JOIN wedding_vendors vendor ON vendor.vendor_id = link.vendor_id
           WHERE link.agent_id = $1
             AND vendor.status = 'active'
             AND vendor.claim_status = 'verified'"#,
    )
    .bind(agent_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "agent card not found".to_string()))?
    .get::<Value, _>("agent_card");
    let card: AgentCard = serde_json::from_value(card_value)
        .map_err(|_| (StatusCode::NOT_FOUND, "agent card not found".to_string()))?;
    if !card.verify() || !valid_encryption_public_key(&card.encryption_public_key_hex) {
        return Err((StatusCode::NOT_FOUND, "agent card not found".to_string()));
    }
    Ok(Json(card))
}

fn public_vendor_from_row(row: sqlx::postgres::PgRow) -> Value {
    let claim_status: String = row.get("claim_status");
    let has_public_agent_card = claim_status == "verified";
    let agent_id = row
        .try_get::<Option<String>, _>("linked_agent_id")
        .ok()
        .flatten();
    let owner_photos: Value = row.get("owner_photos");
    let display_photos = owner_photos
        .as_array()
        .is_some_and(|photos| !photos.is_empty())
        .then_some(owner_photos)
        .unwrap_or_else(|| row.get("photos"));
    json!({
        "slug": row.get::<String, _>("vendor_slug"),
        "name": row.get::<String, _>("vendor_name"),
        "category": row.get::<String, _>("category"),
        "service_area": row.get::<String, _>("service_area"),
        "address": row.try_get::<Option<String>, _>("address").ok().flatten(),
        "website_url": row.try_get::<Option<String>, _>("website_url").ok().flatten(),
        "claim_status": claim_status,
        "claim_cta": row.get::<String, _>("claim_status") != "verified",
        "verified_badge": row.get::<String, _>("claim_status") == "verified",
        "agent_card_url": if has_public_agent_card {
            agent_id.as_deref().map(vendor_agent_card_url)
        } else {
            None
        },
        "description": row.get::<String, _>("owner_description"),
        "price_tier": row.get::<String, _>("price_tier"),
        "capacity_min": row.get::<i32, _>("capacity_min"),
        "capacity_max": row.get::<i32, _>("capacity_max"),
        "styles": row.get::<Vec<String>, _>("styles"),
        "flags": row.get::<Vec<String>, _>("flags"),
        "public_contact": row.get::<Value, _>("public_contact"),
        "photos": display_photos,
    })
}

fn claim_status_from_row(row: sqlx::postgres::PgRow, user_id: &str) -> Value {
    let status: String = row.get("status");
    let vendor_slug: String = row.get("vendor_slug");
    let expected_agent_id = expected_vendor_agent_id(&vendor_slug, user_id);
    json!({
        "claim_id": row.get::<String, _>("claim_id"),
        "status": status,
        "vendor_slug": vendor_slug,
        "ownership_verified": status == "verified",
        "requires_agent_card": status == "verified",
        "expected_agent_id": expected_agent_id,
        "expires_at": row.try_get::<Option<String>, _>("expires_at").ok().flatten(),
    })
}

fn clean_claim_search(raw: &str) -> Result<String, (StatusCode, String)> {
    let value = raw.trim();
    if value.chars().count() > MAX_QUERY_LENGTH {
        return Err((StatusCode::BAD_REQUEST, "search is too long".to_string()));
    }
    Ok(value.to_string())
}

fn claim_search_key(raw: &str) -> String {
    raw.chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn bounded_levenshtein(left: &str, right: &str, maximum: usize) -> Option<usize> {
    let left = left.chars().collect::<Vec<_>>();
    let right = right.chars().collect::<Vec<_>>();
    if left.len().abs_diff(right.len()) > maximum {
        return None;
    }
    let mut previous = (0..=right.len()).collect::<Vec<_>>();
    for (left_index, left_character) in left.iter().enumerate() {
        let mut current = vec![left_index + 1];
        let mut row_minimum = current[0];
        for (right_index, right_character) in right.iter().enumerate() {
            let substitution =
                previous[right_index] + usize::from(left_character != right_character);
            let value = (previous[right_index + 1] + 1)
                .min(current[right_index] + 1)
                .min(substitution);
            row_minimum = row_minimum.min(value);
            current.push(value);
        }
        if row_minimum > maximum {
            return None;
        }
        previous = current;
    }
    (previous[right.len()] <= maximum).then_some(previous[right.len()])
}

fn fuzzy_claim_score(query: &str, vendor_name: &str) -> Option<u16> {
    let query = claim_search_key(query);
    let name = claim_search_key(vendor_name);
    if query.is_empty() || name.is_empty() {
        return None;
    }
    if query == name {
        return Some(1_000);
    }
    if name.starts_with(&query) {
        return Some(900_u16.saturating_sub((name.len() - query.len()) as u16));
    }
    if name.contains(&query) {
        return Some(800_u16.saturating_sub((name.len() - query.len()) as u16));
    }
    let query_tokens = query.split_whitespace().collect::<Vec<_>>();
    let name_tokens = name.split_whitespace().collect::<Vec<_>>();
    let matched_tokens = query_tokens
        .iter()
        .filter(|query_token| {
            name_tokens.iter().any(|name_token| {
                name_token.starts_with(**query_token)
                    || bounded_levenshtein(query_token, name_token, 1).is_some()
            })
        })
        .count();
    if matched_tokens == query_tokens.len() && matched_tokens > 0 {
        return Some(700 + matched_tokens as u16);
    }
    let maximum = if query.chars().count() >= 8 { 2 } else { 1 };
    bounded_levenshtein(&query, &name, maximum)
        .map(|distance| 600_u16.saturating_sub(distance as u16 * 50))
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

pub(super) fn valid_slug(raw: &str) -> Result<String, (StatusCode, String)> {
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

fn expected_vendor_agent_id(vendor_slug: &str, user_id: &str) -> String {
    let fingerprint = hex::encode(Sha256::digest(
        format!("{vendor_slug}:{user_id}").as_bytes(),
    ));
    format!(
        "agent:vendor-{vendor_slug}-{}@omnyid.com",
        &fingerprint[..12]
    )
}

fn vendor_agent_card_url(agent_id: &str) -> String {
    format!("/.well-known/afp/agents/{agent_id}/card")
}

fn validate_vendor_agent_card(
    card: &AgentCard,
    expected_agent_id: &str,
) -> Result<(), (StatusCode, String)> {
    if card.agent_id != expected_agent_id
        || !card.verify()
        || !valid_encryption_public_key(&card.encryption_public_key_hex)
    {
        return Err(invalid_agent_card());
    }
    for capability in ["wedding_enquiry", "wedding_enquiry_response"] {
        if !card
            .capabilities
            .iter()
            .any(|entry| entry.name == capability)
        {
            return Err(invalid_agent_card());
        }
    }
    Ok(())
}

fn valid_encryption_public_key(value: &Option<String>) -> bool {
    value
        .as_deref()
        .and_then(|hex_value| hex::decode(hex_value).ok())
        .is_some_and(|key| key.len() == 32)
}

fn invalid_agent_card() -> (StatusCode, String) {
    (
        StatusCode::BAD_REQUEST,
        "a signed AgentCard with the required enquiry capabilities and X25519 public key is required"
            .to_string(),
    )
}

fn request_ip_hash(headers: &HeaderMap) -> Option<String> {
    let client_ip = headers
        .get("x-forwarded-for")?
        .to_str()
        .ok()?
        .split(',')
        .next()?
        .trim();
    if client_ip.is_empty() {
        return None;
    }
    Some(hex::encode(Sha256::digest(client_ip.as_bytes())))
}

fn request_user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get("user-agent")?
        .to_str()
        .ok()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(512).collect())
}

fn database_failure(_: sqlx::Error) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "vendor directory is temporarily unavailable".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::{
        PHOTO_LICENCE_CONSENT, PHOTO_LICENCE_SHA256, PHOTO_LICENCE_VERSION, fuzzy_claim_score,
        valid_declared_role, valid_slug,
    };
    use axum::http::StatusCode;
    use sha2::{Digest, Sha256};

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

    #[test]
    fn claim_suggestions_allow_small_business_name_typos_but_not_unrelated_names() {
        assert!(fuzzy_claim_score("Bejewled Jewellery", "Bejewelled Jewellery").is_some());
        assert!(fuzzy_claim_score("Bejewelled Mosman", "Bejewelled Jewellery").is_none());
        assert!(fuzzy_claim_score("creek street photo", "Creek Street Photography").is_some());
    }

    #[test]
    fn photo_licence_receipt_is_pinned_to_the_current_document() {
        assert_eq!(PHOTO_LICENCE_VERSION, "vendor-image-licence-2026-11-09");
        assert_eq!(
            format!(
                "{:x}",
                Sha256::digest(include_bytes!("../../wedding/vendor-image-licence.html"))
            ),
            PHOTO_LICENCE_SHA256
        );
        assert!(PHOTO_LICENCE_CONSENT.starts_with("I confirm that I have read"));
        assert!(PHOTO_LICENCE_CONSENT.contains("authorised to grant the licence"));
    }
}
