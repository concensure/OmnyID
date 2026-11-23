/*
 * @module-id: rust.server.wedding-vendor-ownership-routes
 * @primary-capability: verified-vendor-ownership-and-prefilled-profile
 * @locs-version: 1.0
 * @stability: draft
 * @owner: omnyid
 */

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ulid::Ulid;

use crate::gateway::rest_adapter::validate_public_http_url;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_vendor_claim_routes::valid_slug,
    wedding_vendor_portal_routes::{VendorPermission, require_vendor_access},
};

const CLAIM_LIFETIME_HOURS: i64 = 72;
const PROOF_LIFETIME_MINUTES: i64 = 30;
const MAX_PROOF_ATTEMPTS: i32 = 5;
const MAX_PROOF_BODY_BYTES: usize = 256 * 1024;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/admin/wedding/vendor/ownership/decision",
            post(ownership_admin_decision_http),
        )
        .route("/api/wedding/vendor/ownership", get(ownership_status_http))
        .route(
            "/api/wedding/vendor/ownership/release",
            post(ownership_release_http),
        )
        .route(
            "/api/wedding/vendor/ownership/challenge",
            post(ownership_challenge_http),
        )
        .route(
            "/api/wedding/vendor/ownership/verify",
            post(ownership_verify_http),
        )
        .route(
            "/api/wedding/vendor/profile",
            get(vendor_profile_http).put(vendor_profile_update_http),
        )
}

#[derive(Deserialize)]
struct VendorSlugQuery {
    vendor_slug: String,
}

#[derive(Deserialize)]
struct OwnershipRequest {
    vendor_slug: String,
    method: String,
    token: Option<String>,
}

#[derive(Deserialize)]
struct VendorProfileUpdate {
    description: Option<String>,
    contact_email: Option<String>,
    contact_phone: Option<String>,
    website_url: Option<String>,
    instagram_url: Option<String>,
    facebook_url: Option<String>,
}

#[derive(Deserialize)]
struct OwnershipAdminDecision {
    claim_id: String,
    decision: String,
    note: String,
}

struct OwnershipContext {
    claim_id: String,
    claim_status: String,
    expires_at: String,
    vendor_id: String,
    vendor_slug: String,
    vendor_name: String,
    category: String,
    service_area: String,
    website_url: Option<String>,
    contact_email: Option<String>,
    listing_status: String,
    owner_user_id: Option<String>,
}

async fn ownership_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorSlugQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let slug = valid_slug(&query.vendor_slug)?;
    expire_started_claims(&state, &user.id).await?;
    let context = ownership_context(&state, &user.id, &slug).await?;
    let email_verified = state
        .db
        .is_user_email_verified(&user.id)
        .await
        .map_err(database_failure)?;
    let verified = context.claim_status == "verified"
        && context.listing_status == "verified"
        && context.owner_user_id.as_deref() == Some(user.id.as_str());
    let user_domain = email_domain(&user.email);
    let domains = listing_domains(&context.contact_email, &context.website_url);
    let email_match = email_verified
        && user_domain.as_deref().is_some_and(|domain| {
            !is_public_mail_domain(domain) && domains.iter().any(|item| item == domain)
        });
    let website_origin = context.website_url.as_deref().and_then(website_origin);

    Ok(Json(json!({
        "claim": {
            "claim_id": context.claim_id,
            "status": context.claim_status,
            "expires_at": context.expires_at,
            "ownership_verified": verified,
        },
        "listing": {
            "vendor_slug": context.vendor_slug,
            "vendor_name": context.vendor_name,
            "category": context.category,
            "service_area": context.service_area,
            "website_url": context.website_url,
        },
        "methods": [
            {
                "id": "email_domain",
                "label": "Verified work email",
                "available": email_match,
                "instant": true,
                "detail": if email_match { "Your verified account email matches this business." } else { "Sign in with an email on the business website domain." },
            },
            {
                "id": "website_meta",
                "label": "Business website",
                "available": website_origin.is_some(),
                "instant": true,
                "detail": "Add a short verification tag or well-known text file to the listed website.",
                "target": website_origin,
            },
            {
                "id": "social_business",
                "label": "Instagram or Facebook Business",
                "available": false,
                "instant": true,
                "detail": "Available after an official business-page connection is configured; no social ownership is inferred from a profile URL.",
            }
        ]
    })))
}

async fn ownership_challenge_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<OwnershipRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    limit(&state, &headers, "vendor_ownership_challenge", 8).await?;
    if body.method.trim() != "website_meta" {
        return Err((
            StatusCode::BAD_REQUEST,
            "website_meta is the supported challenge method".to_string(),
        ));
    }
    let slug = valid_slug(&body.vendor_slug)?;
    expire_started_claims(&state, &user.id).await?;
    let context = ownership_context(&state, &user.id, &slug).await?;
    require_open_claim(&context)?;
    let target = context
        .website_url
        .as_deref()
        .and_then(website_origin)
        .ok_or_else(|| {
            (
                StatusCode::CONFLICT,
                "this listing has no verifiable business website".to_string(),
            )
        })?;
    let target_host = reqwest::Url::parse(&target)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .ok_or_else(|| {
            (
                StatusCode::CONFLICT,
                "this listing has no verifiable business website".to_string(),
            )
        })?;
    let token = format!("omnyid-claim-{}", Ulid::new());
    let proof_id = Ulid::new().to_string();
    let expires_at =
        (chrono::Utc::now() + chrono::Duration::minutes(PROOF_LIFETIME_MINUTES)).to_rfc3339();
    sqlx::query("UPDATE wedding_vendor_ownership_proofs SET status = 'cancelled', updated_at = NOW() WHERE claim_id = $1 AND method = 'website_meta' AND status = 'pending'")
        .bind(&context.claim_id)
        .execute(&state.db.pool).await.map_err(database_failure)?;
    sqlx::query(
        "INSERT INTO wedding_vendor_ownership_proofs (proof_id, claim_id, method, token_hash, target, expires_at) VALUES ($1, $2, 'website_meta', $3, $4, $5::timestamptz)",
    )
    .bind(&proof_id)
    .bind(&context.claim_id)
    .bind(sha256(&token))
    .bind(&target)
    .bind(&expires_at)
    .execute(&state.db.pool).await.map_err(database_failure)?;

    Ok(Json(json!({
        "proof_id": proof_id,
        "method": "website_meta",
        "target": target,
        "token": token,
        "meta_tag": format!(r#"<meta name="omnyid-vendor-verification" content="{token}">"#),
        "well_known_path": "/.well-known/omnyid-vendor-claim.txt",
        "dns_record_name": format!("_omnyid-claim.{target_host}"),
        "dns_record_value": token,
        "expires_at": expires_at,
    })))
}

async fn ownership_verify_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<OwnershipRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    limit(&state, &headers, "vendor_ownership_verify", 10).await?;
    let slug = valid_slug(&body.vendor_slug)?;
    expire_started_claims(&state, &user.id).await?;
    let context = ownership_context(&state, &user.id, &slug).await?;
    require_open_claim(&context)?;
    let email_verified = state
        .db
        .is_user_email_verified(&user.id)
        .await
        .map_err(database_failure)?;
    let method = body.method.trim();
    let evidence = match method {
        "email_domain" => verify_email_domain(&context, &user.email, email_verified)?,
        "website_meta" => verify_website_meta(&state, &context, body.token.as_deref()).await?,
        "social_business" => return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "social business verification is not configured; choose work email or website proof"
                .to_string(),
        )),
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "unsupported ownership proof method".to_string(),
            ));
        }
    };
    finalize_ownership(&state, &user.id, &context, method, evidence.clone()).await?;
    append_ownership_afp(&state, &user.id, &context, method).await;
    maybe_send_claim_welcome(&state, &user.id, &user.email, &context).await;
    Ok(Json(json!({
        "vendor_slug": context.vendor_slug,
        "status": "verified",
        "ownership_verified": true,
        "method": method,
        "verified_badge": true,
    })))
}

async fn ownership_release_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<VendorSlugQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    limit(&state, &headers, "vendor_ownership_release", 8).await?;
    let slug = valid_slug(&body.vendor_slug)?;
    let context = ownership_context(&state, &user.id, &slug).await?;
    require_open_claim(&context)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    sqlx::query("UPDATE wedding_vendor_ownership_proofs SET status = 'cancelled', updated_at = NOW() WHERE claim_id = $1 AND status = 'pending'")
        .bind(&context.claim_id).execute(&mut *tx).await.map_err(database_failure)?;
    let released = sqlx::query("UPDATE wedding_vendor_claims SET status = 'abandoned', updated_at = NOW() WHERE claim_id = $1 AND user_id = $2 AND status = 'started'")
        .bind(&context.claim_id).bind(&user.id).execute(&mut *tx).await.map_err(database_failure)?;
    if released.rows_affected() != 1 {
        return Err((
            StatusCode::CONFLICT,
            "this claim is no longer awaiting ownership proof".to_string(),
        ));
    }
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(json!({ "released": true, "vendor_slug": slug })))
}

async fn ownership_admin_decision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<OwnershipAdminDecision>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (operator, session) =
        super::auth::authenticated_user_and_session(&state.db, &headers).await?;
    super::auth::require_recent_high_risk_session(&session)?;
    if !super::cost_controls::operator_access_allowed(&operator.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    limit(&state, &headers, "vendor_ownership_admin_decision", 20).await?;
    let claim_id = body.claim_id.trim();
    let note = body.note.trim();
    if claim_id.is_empty() || note.len() < 10 || note.len() > 1_000 {
        return Err((
            StatusCode::BAD_REQUEST,
            "claim_id and a 10-1000 character review note are required".to_string(),
        ));
    }
    let decision = body.decision.trim().to_ascii_lowercase();
    if !matches!(decision.as_str(), "verified" | "disputed" | "rejected") {
        return Err((
            StatusCode::BAD_REQUEST,
            "decision must be verified, disputed, or rejected".to_string(),
        ));
    }
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let claim = sqlx::query("SELECT c.vendor_id, c.user_id, c.status, v.claim_status AS listing_status, v.claimed_by_user_id FROM wedding_vendor_claims c JOIN wedding_vendors v ON v.vendor_id = c.vendor_id WHERE c.claim_id = $1 FOR UPDATE OF c, v")
        .bind(claim_id).fetch_optional(&mut *tx).await.map_err(database_failure)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "vendor claim not found".to_string()))?;
    let vendor_id: String = claim.get("vendor_id");
    let claimant_id: String = claim.get("user_id");
    let listing_status: String = claim.get("listing_status");
    let existing_owner: Option<String> = claim.try_get("claimed_by_user_id").ok().flatten();
    if decision == "verified"
        && matches!(listing_status.as_str(), "claimed" | "verified" | "disputed")
        && existing_owner.as_deref() != Some(claimant_id.as_str())
    {
        return Err((
            StatusCode::CONFLICT,
            "resolve the existing ownership dispute before verifying this claim".to_string(),
        ));
    }
    let evidence = json!({ "operator_user_id": operator.id, "note": note, "decided_at": chrono::Utc::now().to_rfc3339() });
    match decision.as_str() {
        "verified" => {
            sqlx::query("UPDATE wedding_vendor_claims SET status = 'verified', verification_method = 'admin', verification_evidence = $2, verified_at = NOW(), updated_at = NOW() WHERE claim_id = $1")
                .bind(claim_id).bind(&evidence).execute(&mut *tx).await.map_err(database_failure)?;
            sqlx::query("UPDATE wedding_vendor_claims SET status = 'abandoned', updated_at = NOW() WHERE vendor_id = $1 AND claim_id <> $2 AND status = 'started'")
                .bind(&vendor_id).bind(claim_id).execute(&mut *tx).await.map_err(database_failure)?;
            sqlx::query("UPDATE wedding_vendors SET claim_status = 'verified', claimed_by_user_id = $1, claimed_at = COALESCE(claimed_at, NOW()), verified_at = NOW(), updated_at = NOW() WHERE vendor_id = $2")
                .bind(&claimant_id).bind(&vendor_id).execute(&mut *tx).await.map_err(database_failure)?;
            sqlx::query("UPDATE wedding_vendor_listing_proposals SET status = 'awaiting_review', updated_at = NOW() WHERE claim_id = $1 AND status = 'awaiting_ownership'")
                .bind(claim_id).execute(&mut *tx).await.map_err(database_failure)?;
            sqlx::query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'vendor') ON CONFLICT DO NOTHING")
                .bind(&claimant_id).execute(&mut *tx).await.map_err(database_failure)?;
        }
        "disputed" => {
            sqlx::query("UPDATE wedding_vendor_claims SET status = 'disputed', verification_evidence = verification_evidence || $2, updated_at = NOW() WHERE claim_id = $1")
                .bind(claim_id).bind(&evidence).execute(&mut *tx).await.map_err(database_failure)?;
            sqlx::query("UPDATE wedding_vendors SET claim_status = 'disputed', updated_at = NOW() WHERE vendor_id = $1")
                .bind(&vendor_id).execute(&mut *tx).await.map_err(database_failure)?;
        }
        _ => {
            sqlx::query("UPDATE wedding_vendor_claims SET status = 'revoked', verification_evidence = verification_evidence || $2, updated_at = NOW() WHERE claim_id = $1")
                .bind(claim_id).bind(&evidence).execute(&mut *tx).await.map_err(database_failure)?;
            sqlx::query("UPDATE wedding_vendors SET claim_status = 'unclaimed', claimed_by_user_id = NULL, claimed_at = NULL, verified_at = NULL, updated_at = NOW() WHERE vendor_id = $1 AND claimed_by_user_id = $2")
                .bind(&vendor_id).bind(&claimant_id).execute(&mut *tx).await.map_err(database_failure)?;
        }
    }
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({ "claim_id": claim_id, "decision": decision, "status": "recorded" }),
    ))
}

async fn vendor_profile_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorSlugQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let slug = valid_slug(&query.vendor_slug)?;
    let (_user, access) =
        require_vendor_access(&state, &headers, &slug, VendorPermission::View).await?;
    let row = profile_row_by_vendor_id(&state, &access.vendor_id).await?;
    Ok(Json(profile_json(&row)))
}

async fn vendor_profile_update_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorSlugQuery>,
    Json(body): Json<VendorProfileUpdate>,
) -> Result<Json<Value>, (StatusCode, String)> {
    limit(&state, &headers, "vendor_profile_update", 20).await?;
    let slug = valid_slug(&query.vendor_slug)?;
    let (_user, access) =
        require_vendor_access(&state, &headers, &slug, VendorPermission::Publish).await?;
    let row = profile_row_by_vendor_id(&state, &access.vendor_id).await?;
    let vendor_id: String = row.get("vendor_id");
    let description = bounded(body.description, 4_000, "description")?;
    let contact_email = validated_contact_email(body.contact_email)?;
    let contact_phone = bounded(body.contact_phone, 80, "contact phone")?;
    let website_url = validated_https_url(body.website_url, None, "website")?;
    let instagram_url = validated_https_url(
        body.instagram_url,
        Some(&["instagram.com", "www.instagram.com"]),
        "Instagram",
    )?;
    let facebook_url = validated_https_url(
        body.facebook_url,
        Some(&["facebook.com", "www.facebook.com"]),
        "Facebook",
    )?;
    let public_contact = json!({
        "email": contact_email,
        "phone": contact_phone,
        "website_url": website_url,
        "instagram_url": instagram_url,
        "facebook_url": facebook_url,
    });
    sqlx::query(
        r#"INSERT INTO wedding_vendor_owner_profile (vendor_id, description, public_contact, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (vendor_id) DO UPDATE SET description = EXCLUDED.description,
             public_contact = EXCLUDED.public_contact,
             draft_revision = wedding_vendor_owner_profile.draft_revision + 1,
             updated_at = NOW()"#,
    )
    .bind(&vendor_id).bind(description).bind(public_contact)
    .execute(&state.db.pool).await.map_err(database_failure)?;
    let refreshed = profile_row_by_vendor_id(&state, &vendor_id).await?;
    Ok(Json(profile_json(&refreshed)))
}

async fn ownership_context(
    state: &Arc<AppState>,
    user_id: &str,
    slug: &str,
) -> Result<OwnershipContext, (StatusCode, String)> {
    let row = sqlx::query(
        r#"SELECT c.claim_id, c.status AS claim_status, c.expires_at::text AS expires_at,
                  v.vendor_id, v.vendor_slug, v.vendor_name, v.category, v.service_area,
                  v.website_url, v.contact_email, v.claim_status AS listing_status,
                  v.claimed_by_user_id
           FROM wedding_vendor_claims c
           JOIN wedding_vendors v ON v.vendor_id = c.vendor_id
           WHERE c.user_id = $1 AND v.vendor_slug = $2 AND c.status IN ('started', 'verified')
           ORDER BY CASE c.status WHEN 'verified' THEN 0 ELSE 1 END, c.created_at DESC LIMIT 1"#,
    )
    .bind(user_id)
    .bind(slug)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| {
        (
            StatusCode::CONFLICT,
            "start this listing claim before choosing ownership proof".to_string(),
        )
    })?;
    Ok(OwnershipContext {
        claim_id: row.get("claim_id"),
        claim_status: row.get("claim_status"),
        expires_at: row.try_get("expires_at").unwrap_or_default(),
        vendor_id: row.get("vendor_id"),
        vendor_slug: row.get("vendor_slug"),
        vendor_name: row.get("vendor_name"),
        category: row.get("category"),
        service_area: row.get("service_area"),
        website_url: row.try_get("website_url").ok().flatten(),
        contact_email: row.try_get("contact_email").ok().flatten(),
        listing_status: row.get("listing_status"),
        owner_user_id: row.try_get("claimed_by_user_id").ok().flatten(),
    })
}

fn require_open_claim(context: &OwnershipContext) -> Result<(), (StatusCode, String)> {
    if context.claim_status != "started" {
        return Err((
            StatusCode::CONFLICT,
            "this claim is not awaiting ownership proof".to_string(),
        ));
    }
    Ok(())
}

fn verify_email_domain(
    context: &OwnershipContext,
    user_email: &str,
    email_verified: bool,
) -> Result<Value, (StatusCode, String)> {
    if !email_verified {
        return Err((
            StatusCode::CONFLICT,
            "verify your account email before using work-email ownership proof".to_string(),
        ));
    }
    let domain = email_domain(user_email).ok_or_else(|| {
        (
            StatusCode::CONFLICT,
            "account email has no verifiable domain".to_string(),
        )
    })?;
    if is_public_mail_domain(&domain)
        || !listing_domains(&context.contact_email, &context.website_url).contains(&domain)
    {
        return Err((
            StatusCode::CONFLICT,
            "your verified account email does not match this business domain".to_string(),
        ));
    }
    Ok(json!({ "matched_domain_sha256": sha256(&domain) }))
}

async fn verify_website_meta(
    state: &Arc<AppState>,
    context: &OwnershipContext,
    token: Option<&str>,
) -> Result<Value, (StatusCode, String)> {
    let token = token
        .map(str::trim)
        .filter(|value| value.starts_with("omnyid-claim-") && value.len() <= 80)
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "the current website verification token is required".to_string(),
            )
        })?;
    let proof = sqlx::query(
        r#"UPDATE wedding_vendor_ownership_proofs
           SET attempts = attempts + 1, updated_at = NOW()
           WHERE claim_id = $1 AND method = 'website_meta' AND token_hash = $2
             AND status = 'pending' AND expires_at > NOW() AND attempts < $3
           RETURNING proof_id, target, attempts"#,
    )
    .bind(&context.claim_id)
    .bind(sha256(token))
    .bind(MAX_PROOF_ATTEMPTS)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| {
        (
            StatusCode::CONFLICT,
            "the website challenge is missing or expired".to_string(),
        )
    })?;
    let proof_id: String = proof.get("proof_id");
    let target: String = proof.get("target");
    let attempts: i32 = proof.get("attempts");
    let found_at = fetch_website_proof(&target, token).await;
    match found_at {
        Ok(location) => {
            sqlx::query("UPDATE wedding_vendor_ownership_proofs SET status = 'verified', verified_at = NOW(), updated_at = NOW(), evidence = jsonb_build_object('location', $2::text) WHERE proof_id = $1 AND status = 'pending'")
                .bind(&proof_id).bind(&location).execute(&state.db.pool).await.map_err(database_failure)?;
            Ok(
                json!({ "proof_id": proof_id, "location": location, "target_host_sha256": sha256(&target) }),
            )
        }
        Err(message) => {
            let terminal = attempts >= MAX_PROOF_ATTEMPTS;
            sqlx::query("UPDATE wedding_vendor_ownership_proofs SET status = CASE WHEN $2 THEN 'failed' ELSE status END, updated_at = NOW() WHERE proof_id = $1")
                .bind(&proof_id).bind(terminal).execute(&state.db.pool).await.map_err(database_failure)?;
            Err((StatusCode::CONFLICT, message))
        }
    }
}

async fn fetch_website_proof(origin: &str, token: &str) -> Result<String, String> {
    if let Some(location) = fetch_dns_proof(origin, token).await {
        return Ok(location);
    }
    let urls = [
        format!("{origin}/.well-known/omnyid-vendor-claim.txt"),
        format!("{origin}/"),
    ];
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "website verification is temporarily unavailable".to_string())?;
    for url in urls {
        validate_public_http_url(&url).await.map_err(|_| {
            "the listed website cannot be used for automated verification".to_string()
        })?;
        let Ok(mut response) = client
            .get(&url)
            .header(reqwest::header::ACCEPT, "text/plain,text/html")
            .send()
            .await
        else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "the verification response could not be read".to_string())?
        {
            if body.len() + chunk.len() > MAX_PROOF_BODY_BYTES {
                break;
            }
            body.extend_from_slice(&chunk);
        }
        if String::from_utf8_lossy(&body).contains(token) {
            return Ok(url);
        }
    }
    Err("ownership proof not found yet; publish the website tag, well-known file, or DNS TXT record and try again".to_string())
}

async fn fetch_dns_proof(origin: &str, token: &str) -> Option<String> {
    let host = reqwest::Url::parse(origin).ok()?.host_str()?.to_string();
    let record_name = format!("_omnyid-claim.{host}.");
    let resolver = hickory_resolver::TokioResolver::builder_tokio()
        .ok()?
        .build()
        .ok()?;
    let lookup = tokio::time::timeout(
        Duration::from_secs(8),
        resolver.txt_lookup(record_name.clone()),
    )
    .await
    .ok()?
    .ok()?;
    lookup
        .answers()
        .iter()
        .any(|record| record.data.to_string().contains(token))
        .then(|| format!("dns:{}", record_name.trim_end_matches('.')))
}

async fn finalize_ownership(
    state: &Arc<AppState>,
    user_id: &str,
    context: &OwnershipContext,
    method: &str,
    evidence: Value,
) -> Result<(), (StatusCode, String)> {
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let claim = sqlx::query("SELECT status, expires_at > NOW() AS current FROM wedding_vendor_claims WHERE claim_id = $1 AND user_id = $2 FOR UPDATE")
        .bind(&context.claim_id).bind(user_id).fetch_optional(&mut *tx).await.map_err(database_failure)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "vendor claim not found".to_string()))?;
    if claim.get::<String, _>("status") != "started" || !claim.get::<bool, _>("current") {
        return Err((
            StatusCode::CONFLICT,
            "this claim has expired or is no longer awaiting proof".to_string(),
        ));
    }
    let listing = sqlx::query("SELECT claim_status, claimed_by_user_id FROM wedding_vendors WHERE vendor_id = $1 FOR UPDATE")
        .bind(&context.vendor_id).fetch_one(&mut *tx).await.map_err(database_failure)?;
    let listing_status: String = listing.get("claim_status");
    let existing_owner: Option<String> = listing.try_get("claimed_by_user_id").ok().flatten();
    if matches!(listing_status.as_str(), "claimed" | "verified" | "disputed")
        && existing_owner.as_deref() != Some(user_id)
    {
        return Err((
            StatusCode::CONFLICT,
            "this listing has already been verified or disputed".to_string(),
        ));
    }
    sqlx::query("UPDATE wedding_vendor_claims SET status = 'verified', verification_method = $2, verification_evidence = $3, declaration_accepted_at = NOW(), verified_at = NOW(), updated_at = NOW() WHERE claim_id = $1")
        .bind(&context.claim_id).bind(method).bind(evidence).execute(&mut *tx).await.map_err(database_failure)?;
    sqlx::query("UPDATE wedding_vendor_claims SET status = 'abandoned', updated_at = NOW() WHERE vendor_id = $1 AND claim_id <> $2 AND status = 'started'")
        .bind(&context.vendor_id).bind(&context.claim_id).execute(&mut *tx).await.map_err(database_failure)?;
    sqlx::query("UPDATE wedding_vendors SET claim_status = 'verified', claimed_by_user_id = $1, claimed_at = COALESCE(claimed_at, NOW()), verified_at = NOW(), updated_at = NOW() WHERE vendor_id = $2")
        .bind(user_id).bind(&context.vendor_id).execute(&mut *tx).await.map_err(database_failure)?;
    sqlx::query("UPDATE wedding_vendor_listing_proposals SET status = 'awaiting_review', updated_at = NOW() WHERE claim_id = $1 AND status = 'awaiting_ownership'")
        .bind(&context.claim_id).execute(&mut *tx).await.map_err(database_failure)?;
    sqlx::query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, 'vendor') ON CONFLICT DO NOTHING",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)
}

async fn append_ownership_afp(
    state: &Arc<AppState>,
    user_id: &str,
    context: &OwnershipContext,
    method: &str,
) {
    let message_id = Ulid::new().to_string();
    let content = json!({
        "kind": "wedding_vendor_ownership_verified",
        "claim_id": context.claim_id,
        "vendor_slug": context.vendor_slug,
        "verification_method": method,
        "authority": "listing_management",
    });
    let message = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: message_id.clone(),
        thread_id: format!("wedding-vendor-claim:{}", context.vendor_id),
        parent_id: String::new(),
        from: "agent:vendor-verification@omnyid.com".to_string(),
        to: vec![user_id.to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "wedding_vendor_ownership_verified".to_string(),
        kind: Some("wedding_vendor_ownership".to_string()),
        supertags: vec!["wedding".to_string(), "vendor-ownership".to_string()],
        content: content.to_string(),
        views: "[]".to_string(),
        attachments: "[]".to_string(),
        references: "[]".to_string(),
        encryption: "{}".to_string(),
        signature: String::new(),
        store_in_relational: true,
        subtype: "ownership_verified".to_string(),
        metadata: json!({"store": true, "privacy": "private", "claim_id": context.claim_id})
            .to_string(),
    };
    match state
        .db
        .store_private_message(user_id, &message, content)
        .await
    {
        Ok(true) => {
            let _ = sqlx::query(
                "UPDATE wedding_vendor_claims SET afp_message_id = $2 WHERE claim_id = $1",
            )
            .bind(&context.claim_id)
            .bind(message_id)
            .execute(&state.db.pool)
            .await;
        }
        Ok(false) => {
            tracing::warn!(claim_id = %context.claim_id, "vendor ownership AFP receipt replayed")
        }
        Err(error) => {
            tracing::error!(claim_id = %context.claim_id, %error, "vendor ownership AFP receipt could not be stored")
        }
    }
}

async fn maybe_send_claim_welcome(
    state: &Arc<AppState>,
    user_id: &str,
    email: &str,
    context: &OwnershipContext,
) {
    if !std::env::var("OMNYID_VENDOR_CLAIM_WELCOME_EMAIL_ENABLED").is_ok_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    }) {
        return;
    }
    let Ok(row) = verified_profile_row(state, user_id, &context.vendor_slug).await else {
        return;
    };
    let profile = profile_json(&row);
    let completion = profile
        .get("completion_percent")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let photo_count = profile
        .get("photo_count")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let remaining = (3 - photo_count).max(0);
    let body = format!(
        "Your {} listing is verified.\n\nYour profile is {}% complete. {}\n\nOpen your vendor portal: https://omnyid.com/workspace/vendor.html?vendor_slug={}",
        context.vendor_name,
        completion,
        if remaining > 0 {
            format!(
                "Add {remaining} more gallery photo{} to help couples evaluate your work.",
                if remaining == 1 { "" } else { "s" }
            )
        } else {
            "Your first three gallery photos are in place.".to_string()
        },
        context.vendor_slug,
    );
    if let Err(error) = crate::gateway::smtp_out::send_transactional_email(
        email,
        "Your OmnyID vendor listing is verified",
        &body,
    )
    .await
    {
        tracing::warn!(claim_id = %context.claim_id, %error, "vendor claim welcome email was not delivered");
    }
}

async fn verified_profile_row(
    state: &Arc<AppState>,
    user_id: &str,
    slug: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    sqlx::query(
        r#"SELECT v.vendor_id, v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
                  v.website_url AS source_website_url, v.contact_email AS source_contact_email,
                  v.contact_phone AS source_contact_phone, v.claim_status,
                  COALESCE(p.description, '') AS description, COALESCE(p.public_contact, '{}'::jsonb) AS public_contact,
                  (SELECT COUNT(*) FROM wedding_vendor_owner_assets a WHERE a.vendor_id = v.vendor_id AND a.status = 'live') AS photo_count
           FROM wedding_vendors v LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
           WHERE v.vendor_slug = $1 AND v.status = 'active' AND v.claim_status = 'verified' AND v.claimed_by_user_id = $2"#,
    )
    .bind(slug).bind(user_id).fetch_optional(&state.db.pool).await.map_err(database_failure)?
    .ok_or_else(|| (StatusCode::FORBIDDEN, "verified listing ownership is required".to_string()))
}

async fn profile_row_by_vendor_id(
    state: &Arc<AppState>,
    vendor_id: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    sqlx::query(
        r#"SELECT v.vendor_id, v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
                  v.website_url AS source_website_url, v.contact_email AS source_contact_email,
                  v.contact_phone AS source_contact_phone, v.claim_status,
                  COALESCE(p.description, '') AS description, COALESCE(p.public_contact, '{}'::jsonb) AS public_contact,
                  COALESCE(p.draft_revision, 1) AS draft_revision,p.published_revision,
                  (SELECT COUNT(*) FROM wedding_vendor_owner_assets a WHERE a.vendor_id = v.vendor_id AND a.status = 'live') AS photo_count
           FROM wedding_vendors v LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
           WHERE v.vendor_id=$1 AND v.status='active' AND v.claim_status='verified'"#,
    ).bind(vendor_id).fetch_optional(&state.db.pool).await.map_err(database_failure)?
      .ok_or_else(||(StatusCode::FORBIDDEN,"verified listing access is required".to_string()))
}

fn profile_json(row: &sqlx::postgres::PgRow) -> Value {
    let public_contact: Value = row.get("public_contact");
    let description: String = row.get("description");
    let photo_count: i64 = row.get("photo_count");
    let source_email: Option<String> = row.try_get("source_contact_email").ok().flatten();
    let source_phone: Option<String> = row.try_get("source_contact_phone").ok().flatten();
    let source_website: Option<String> = row.try_get("source_website_url").ok().flatten();
    let effective = |key: &str, fallback: Option<String>| {
        public_contact
            .get(key)
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|v| !v.is_empty())
            .or(fallback)
    };
    let email = effective("email", source_email);
    let phone = effective("phone", source_phone);
    let website_url = effective("website_url", source_website);
    let completed = [
        !description.is_empty(),
        email.is_some() || phone.is_some(),
        website_url.is_some(),
        photo_count >= 3,
    ]
    .into_iter()
    .filter(|value| *value)
    .count();
    json!({
        "vendor_slug": row.get::<String, _>("vendor_slug"), "vendor_name": row.get::<String, _>("vendor_name"),
        "category": row.get::<String, _>("category"), "service_area": row.get::<String, _>("service_area"),
        "address": row.try_get::<Option<String>, _>("address").ok().flatten(), "description": description,
        "contact_email": email, "contact_phone": phone, "website_url": website_url,
        "instagram_url": effective("instagram_url", None), "facebook_url": effective("facebook_url", None),
        "photo_count": photo_count, "completion_percent": completed * 25, "verified_badge": true,
        "draft_revision": row.try_get::<i64,_>("draft_revision").unwrap_or(1),
        "published_revision": row.try_get::<Option<i64>,_>("published_revision").ok().flatten(),
    })
}

async fn expire_started_claims(
    state: &Arc<AppState>,
    user_id: &str,
) -> Result<(), (StatusCode, String)> {
    sqlx::query("UPDATE wedding_vendor_claims SET status = 'abandoned', updated_at = NOW() WHERE user_id = $1 AND status = 'started' AND expires_at <= NOW()")
        .bind(user_id).execute(&state.db.pool).await.map_err(database_failure)?;
    sqlx::query("UPDATE wedding_vendor_ownership_proofs p SET status = 'expired', updated_at = NOW() FROM wedding_vendor_claims c WHERE p.claim_id = c.claim_id AND c.user_id = $1 AND p.status = 'pending' AND p.expires_at <= NOW()")
        .bind(user_id).execute(&state.db.pool).await.map_err(database_failure)?;
    Ok(())
}

async fn limit(
    state: &Arc<AppState>,
    headers: &HeaderMap,
    key: &str,
    max: usize,
) -> Result<(), (StatusCode, String)> {
    enforce_rate_limit(
        state,
        authenticated_rate_limit_key(key, headers),
        RateLimitPolicy {
            max_requests: max,
            window: Duration::from_secs(60 * 60),
        },
    )
    .await
}

fn email_domain(value: &str) -> Option<String> {
    let domain = value
        .rsplit_once('@')?
        .1
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    (!domain.is_empty() && domain.contains('.')).then_some(domain)
}

fn website_origin(value: &str) -> Option<String> {
    let url = reqwest::Url::parse(value.trim()).ok()?;
    if url.scheme() != "https" || url.username() != "" || url.password().is_some() {
        return None;
    }
    let host = url
        .host_str()?
        .trim_start_matches("www.")
        .to_ascii_lowercase();
    Some(format!(
        "https://{host}{}",
        url.port()
            .map(|port| format!(":{port}"))
            .unwrap_or_default()
    ))
}

fn listing_domains(email: &Option<String>, website: &Option<String>) -> Vec<String> {
    let mut result = Vec::new();
    if let Some(domain) = email.as_deref().and_then(email_domain) {
        result.push(domain);
    }
    if let Some(origin) = website
        .as_deref()
        .and_then(website_origin)
        .and_then(|value| reqwest::Url::parse(&value).ok())
        .and_then(|url| url.host_str().map(str::to_string))
    {
        result.push(origin.trim_start_matches("www.").to_string());
    }
    result.sort();
    result.dedup();
    result
}

fn is_public_mail_domain(domain: &str) -> bool {
    matches!(
        domain,
        "gmail.com"
            | "googlemail.com"
            | "outlook.com"
            | "hotmail.com"
            | "live.com"
            | "icloud.com"
            | "me.com"
            | "yahoo.com"
            | "proton.me"
            | "protonmail.com"
    )
}

fn bounded(
    value: Option<String>,
    max: usize,
    label: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    value
        .map(|raw| {
            let clean = raw.trim();
            if clean.len() > max {
                Err((StatusCode::BAD_REQUEST, format!("{label} is too long")))
            } else {
                Ok(clean.to_string())
            }
        })
        .transpose()
        .map(|item| item.filter(|value| !value.is_empty()))
}

fn validated_contact_email(value: Option<String>) -> Result<Option<String>, (StatusCode, String)> {
    let value = bounded(value, 254, "contact email")?;
    if value
        .as_deref()
        .is_some_and(|email| email_domain(email).is_none() || email.contains(char::is_whitespace))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "contact email is invalid".to_string(),
        ));
    }
    Ok(value)
}

fn validated_https_url(
    value: Option<String>,
    hosts: Option<&[&str]>,
    label: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(value) = bounded(value, 500, label)? else {
        return Ok(None);
    };
    let url = reqwest::Url::parse(&value)
        .map_err(|_| (StatusCode::BAD_REQUEST, format!("{label} URL is invalid")))?;
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if url.scheme() != "https"
        || url.username() != ""
        || url.password().is_some()
        || hosts.is_some_and(|allowed| !allowed.contains(&host.as_str()))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{label} must use an approved HTTPS URL"),
        ));
    }
    Ok(Some(url.to_string()))
}

fn sha256(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}
fn database_failure(_: sqlx::Error) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "vendor ownership is temporarily unavailable".to_string(),
    )
}

#[cfg(test)]
#[path = "wedding_vendor_ownership_routes_tests.rs"]
mod tests;
