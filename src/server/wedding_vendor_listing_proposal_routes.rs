//! Private proposal path for vendors whose business is absent from the directory.
//!
//! A proposal creates a hidden canonical vendor row and an ordinary ownership
//! claim. It cannot enter public search until ownership is verified and an
//! operator explicitly publishes it.

use std::{net::IpAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/wedding/vendor/listing-proposals",
            post(create_proposal),
        )
        .route(
            "/api/wedding/vendor/listing-proposals/capabilities",
            get(proposal_capabilities),
        )
        .route(
            "/admin/wedding/vendor/listing-proposals/{proposal_id}/decision",
            post(decide_proposal),
        )
}

async fn proposal_capabilities(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _ = authenticated_user(&state.db, &headers).await?;
    Ok(Json(json!({"listing_proposals_enabled": enabled()})))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposalRequest {
    business_name: String,
    category: String,
    service_area: String,
    website_url: String,
    business_email: String,
    declared_role: String,
}

#[derive(Debug, Serialize)]
struct ProposalResponse {
    proposal_id: String,
    claim_id: String,
    vendor_slug: String,
    status: String,
    requires_agent_card: bool,
    expected_agent_id: String,
    ownership_verified: bool,
    expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposalDecision {
    decision: String,
    note: String,
}

#[derive(Debug, Deserialize)]
struct ProposalPath {
    proposal_id: String,
}

async fn create_proposal(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ProposalRequest>,
) -> Result<Json<ProposalResponse>, (StatusCode, String)> {
    if !enabled() {
        return Err(not_found());
    }
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_listing_proposal", &headers),
        RateLimitPolicy {
            max_requests: 3,
            window: std::time::Duration::from_secs(24 * 60 * 60),
        },
    )
    .await?;
    let business_name = bounded_text(&body.business_name, 2, 180, "business name")?;
    let category = bounded_text(&body.category, 2, 80, "category")?;
    let service_area = bounded_text(&body.service_area, 2, 180, "service area")?;
    let website_url = valid_business_url(&body.website_url)?;
    let business_email = valid_email(&body.business_email)?;
    let declared_role = valid_role(&body.declared_role)?;
    let fingerprint = proposal_fingerprint(
        &business_name,
        &category,
        &service_area,
        &website_url,
        &business_email,
    );

    if let Some(existing) = existing_owned_proposal(&state, &user.id, &fingerprint).await? {
        append_proposal_afp(&state, &user.id, &existing).await?;
        return Ok(Json(existing));
    }
    reject_directory_duplicate(&state, &business_name, &website_url, &business_email).await?;

    let proposal_id = format!("vendorproposal_{}", Ulid::new().to_string().to_lowercase());
    let vendor_id = format!("vendor_{}", Ulid::new().to_string().to_lowercase());
    let claim_id = Ulid::new().to_string();
    let afp_message_id = Ulid::new().to_string();
    let vendor_slug = unique_hidden_slug(&state, &business_name).await?;
    let expires_at = (chrono::Utc::now() + chrono::Duration::hours(72)).to_rfc3339();
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    sqlx::query(
        r#"INSERT INTO wedding_vendors
             (vendor_id, vendor_slug, vendor_name, category, service_area, website_url,
              contact_email, source_label, status, claim_status, evidence,
              created_by_user_id, updated_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Vendor proposed', 'hidden',
                   'claim_pending', $8, $9, $9)"#,
    )
    .bind(&vendor_id)
    .bind(&vendor_slug)
    .bind(&business_name)
    .bind(&category)
    .bind(&service_area)
    .bind(&website_url)
    .bind(&business_email)
    .bind(json!({"kind": "vendor_listing_proposal", "proposal_id": proposal_id}))
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    sqlx::query(
        r#"INSERT INTO wedding_vendor_claims
             (claim_id, vendor_id, user_id, status, declared_role, step_state, expires_at)
           VALUES ($1, $2, $3, 'started', $4,
                   jsonb_build_object('listing_proposal_id', $5::text), $6::timestamptz)"#,
    )
    .bind(&claim_id)
    .bind(&vendor_id)
    .bind(&user.id)
    .bind(&declared_role)
    .bind(&proposal_id)
    .bind(&expires_at)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    sqlx::query(
        r#"INSERT INTO wedding_vendor_listing_proposals
             (proposal_id, vendor_id, claim_id, claimant_user_id, proposal_fingerprint,
              afp_message_id)
           VALUES ($1, $2, $3, $4, $5, $6)"#,
    )
    .bind(&proposal_id)
    .bind(&vendor_id)
    .bind(&claim_id)
    .bind(&user.id)
    .bind(&fingerprint)
    .bind(&afp_message_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        if is_unique_violation(&error) {
            (
                StatusCode::CONFLICT,
                "an equivalent listing proposal is already under review".to_string(),
            )
        } else {
            database_failure(error)
        }
    })?;
    tx.commit().await.map_err(database_failure)?;

    let response = ProposalResponse {
        proposal_id,
        claim_id,
        vendor_slug: vendor_slug.clone(),
        status: "started".to_string(),
        requires_agent_card: false,
        expected_agent_id: expected_agent_id(&vendor_slug, &user.id),
        ownership_verified: false,
        expires_at: Some(expires_at),
    };
    append_proposal_afp(&state, &user.id, &response).await?;
    Ok(Json(response))
}

async fn decide_proposal(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<ProposalPath>,
    Json(body): Json<ProposalDecision>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !enabled() {
        return Err(not_found());
    }
    let (operator, session) =
        super::auth::authenticated_user_and_session(&state.db, &headers).await?;
    super::auth::require_recent_high_risk_session(&session)?;
    if !super::cost_controls::operator_access_allowed(&operator.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_listing_proposal_decision", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: std::time::Duration::from_secs(60 * 60),
        },
    )
    .await?;
    let proposal_id = bounded_identifier(&path.proposal_id, "proposal id")?;
    let decision = body.decision.trim().to_ascii_lowercase();
    if !matches!(decision.as_str(), "publish" | "reject") {
        return Err((
            StatusCode::BAD_REQUEST,
            "decision must be publish or reject".to_string(),
        ));
    }
    let note = bounded_text(&body.note, 10, 1_000, "review note")?;
    let evidence = json!({
        "operator_user_id": operator.id,
        "note": note,
        "decided_at": chrono::Utc::now().to_rfc3339(),
    });
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let row = sqlx::query(
        r#"SELECT proposal.vendor_id, proposal.claim_id, proposal.claimant_user_id,
                  proposal.status, claim.status AS claim_status,
                  vendor.claim_status AS vendor_claim_status, vendor.claimed_by_user_id
             FROM wedding_vendor_listing_proposals proposal
             JOIN wedding_vendor_claims claim ON claim.claim_id = proposal.claim_id
             JOIN wedding_vendors vendor ON vendor.vendor_id = proposal.vendor_id
            WHERE proposal.proposal_id = $1
            FOR UPDATE OF proposal, claim, vendor"#,
    )
    .bind(&proposal_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or_else(not_found)?;
    let current: String = row.get("status");
    if matches!(current.as_str(), "published" | "rejected") {
        return Err((
            StatusCode::CONFLICT,
            "this proposal already has a final decision".to_string(),
        ));
    }
    let vendor_id: String = row.get("vendor_id");
    let claim_id: String = row.get("claim_id");
    let claimant: String = row.get("claimant_user_id");
    if decision == "publish" {
        let claim_status: String = row.get("claim_status");
        let vendor_claim_status: String = row.get("vendor_claim_status");
        let owner: Option<String> = row.try_get("claimed_by_user_id").ok().flatten();
        if claim_status != "verified"
            || vendor_claim_status != "verified"
            || owner.as_deref() != Some(claimant.as_str())
        {
            return Err((
                StatusCode::CONFLICT,
                "verify this claimant's ownership before publishing the listing".to_string(),
            ));
        }
        sqlx::query("UPDATE wedding_vendors SET status = 'active', updated_at = NOW(), updated_by_user_id = $2 WHERE vendor_id = $1 AND status = 'hidden'")
            .bind(&vendor_id).bind(&operator.id).execute(&mut *tx).await.map_err(database_failure)?;
        sqlx::query("UPDATE wedding_vendor_listing_proposals SET status = 'published', review_evidence = $2, updated_at = NOW(), decided_at = NOW() WHERE proposal_id = $1")
            .bind(&proposal_id).bind(&evidence).execute(&mut *tx).await.map_err(database_failure)?;
    } else {
        sqlx::query("UPDATE wedding_vendors SET status = 'archived', claim_status = 'unclaimed', claimed_by_user_id = NULL, updated_at = NOW(), updated_by_user_id = $2 WHERE vendor_id = $1 AND status = 'hidden'")
            .bind(&vendor_id).bind(&operator.id).execute(&mut *tx).await.map_err(database_failure)?;
        sqlx::query("UPDATE wedding_vendor_claims SET status = 'revoked', updated_at = NOW() WHERE claim_id = $1 AND status IN ('started', 'verified')")
            .bind(&claim_id).execute(&mut *tx).await.map_err(database_failure)?;
        sqlx::query("UPDATE wedding_vendor_listing_proposals SET status = 'rejected', review_evidence = $2, updated_at = NOW(), decided_at = NOW() WHERE proposal_id = $1")
            .bind(&proposal_id).bind(&evidence).execute(&mut *tx).await.map_err(database_failure)?;
    }
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(json!({
        "proposal_id": proposal_id,
        "decision": decision,
        "status": if decision == "publish" { "published" } else { "rejected" },
    })))
}

async fn existing_owned_proposal(
    state: &AppState,
    user_id: &str,
    fingerprint: &str,
) -> Result<Option<ProposalResponse>, (StatusCode, String)> {
    let row = sqlx::query(
        r#"SELECT proposal.proposal_id, proposal.claim_id, proposal.afp_message_id,
                  claim.status, claim.expires_at::text AS expires_at, vendor.vendor_slug
             FROM wedding_vendor_listing_proposals proposal
             JOIN wedding_vendor_claims claim ON claim.claim_id = proposal.claim_id
             JOIN wedding_vendors vendor ON vendor.vendor_id = proposal.vendor_id
            WHERE proposal.claimant_user_id = $1
              AND proposal.proposal_fingerprint = $2
              AND proposal.status IN ('awaiting_ownership', 'awaiting_review')
            LIMIT 1"#,
    )
    .bind(user_id)
    .bind(fingerprint)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?;
    Ok(row.map(|row| {
        let vendor_slug: String = row.get("vendor_slug");
        let status: String = row.get("status");
        ProposalResponse {
            proposal_id: row.get("proposal_id"),
            claim_id: row.get("claim_id"),
            expected_agent_id: expected_agent_id(&vendor_slug, user_id),
            vendor_slug,
            requires_agent_card: status == "verified",
            ownership_verified: status == "verified",
            status,
            expires_at: row.try_get("expires_at").ok().flatten(),
        }
    }))
}

async fn reject_directory_duplicate(
    state: &AppState,
    name: &str,
    website: &str,
    email: &str,
) -> Result<(), (StatusCode, String)> {
    let row = sqlx::query(
        r#"SELECT vendor_slug, status
             FROM wedding_vendors
            WHERE lower(vendor_name) = lower($1)
               OR lower(COALESCE(website_url, '')) = lower($2)
               OR lower(COALESCE(contact_email, '')) = lower($3)
            LIMIT 1"#,
    )
    .bind(name)
    .bind(website)
    .bind(email)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?;
    if let Some(row) = row {
        let status: String = row.get("status");
        let message = if status == "active" {
            format!(
                "a matching listing already exists; choose {} from the suggestions",
                row.get::<String, _>("vendor_slug")
            )
        } else {
            "a matching listing is already under review".to_string()
        };
        return Err((StatusCode::CONFLICT, message));
    }
    Ok(())
}

async fn unique_hidden_slug(state: &AppState, name: &str) -> Result<String, (StatusCode, String)> {
    let base = slug_base(name);
    let fallback_suffix = Ulid::new().to_string();
    for suffix in [None, Some(&fallback_suffix[..6])] {
        let candidate = suffix.map_or_else(|| base.clone(), |value| format!("{base}-{value}"));
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM wedding_vendors WHERE vendor_slug = $1)",
        )
        .bind(&candidate)
        .fetch_one(&state.db.pool)
        .await
        .map_err(database_failure)?;
        if !exists {
            return Ok(candidate.to_ascii_lowercase());
        }
    }
    Err((
        StatusCode::CONFLICT,
        "a matching vendor handle already exists".to_string(),
    ))
}

fn slug_base(name: &str) -> String {
    let value = name
        .chars()
        .flat_map(char::to_lowercase)
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if value.is_empty() {
        "vendor".to_string()
    } else {
        value.chars().take(90).collect()
    }
}

async fn append_proposal_afp(
    state: &Arc<AppState>,
    user_id: &str,
    response: &ProposalResponse,
) -> Result<(), (StatusCode, String)> {
    let message_id = sqlx::query_scalar::<_, String>(
        "SELECT afp_message_id FROM wedding_vendor_listing_proposals WHERE proposal_id = $1 AND claimant_user_id = $2",
    )
    .bind(&response.proposal_id)
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(not_found)?;
    let content = json!({
        "kind": "wedding_vendor_listing_proposed",
        "proposal_id": response.proposal_id,
        "claim_id": response.claim_id,
        "vendor_slug": response.vendor_slug,
        "status": "private_pending_review",
        "authority": "listing_management",
    });
    let message = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: message_id,
        thread_id: format!("wedding-vendor-listing-proposal:{}", response.proposal_id),
        parent_id: String::new(),
        from: "agent:vendor-listing-review@omnyid.com".to_string(),
        to: vec![user_id.to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "wedding_vendor_listing_proposed".to_string(),
        kind: Some("wedding_vendor_listing_proposal".to_string()),
        supertags: vec!["wedding".to_string(), "vendor-listing".to_string()],
        content: content.to_string(),
        views: "[]".to_string(),
        attachments: "[]".to_string(),
        references: "[]".to_string(),
        encryption: "{}".to_string(),
        signature: String::new(),
        store_in_relational: true,
        subtype: "listing_proposed".to_string(),
        metadata: json!({"store": true, "privacy": "private", "proposal_id": response.proposal_id})
            .to_string(),
    };
    state
        .db
        .store_private_message(user_id, &message, content)
        .await
        .map(|_| ())
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "the listing was saved but its private receipt is not ready; retry safely"
                    .to_string(),
            )
        })
}

fn proposal_fingerprint(name: &str, category: &str, area: &str, url: &str, email: &str) -> String {
    hex::encode(Sha256::digest(
        [name, category, area, url, email]
            .map(|value| value.trim().to_ascii_lowercase())
            .join("\n")
            .as_bytes(),
    ))
}

fn expected_agent_id(vendor_slug: &str, user_id: &str) -> String {
    let fingerprint = hex::encode(Sha256::digest(
        format!("{vendor_slug}:{user_id}").as_bytes(),
    ));
    format!(
        "agent:vendor-{vendor_slug}-{}@omnyid.com",
        &fingerprint[..12]
    )
}

fn bounded_text(
    value: &str,
    minimum: usize,
    maximum: usize,
    label: &str,
) -> Result<String, (StatusCode, String)> {
    let value = value.trim();
    let length = value.chars().count();
    if length < minimum || length > maximum || value.chars().any(char::is_control) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{label} must be {minimum}-{maximum} characters"),
        ));
    }
    Ok(value.to_string())
}

fn bounded_identifier(value: &str, label: &str) -> Result<String, (StatusCode, String)> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 180
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err((StatusCode::BAD_REQUEST, format!("invalid {label}")));
    }
    Ok(value.to_string())
}

fn valid_email(value: &str) -> Result<String, (StatusCode, String)> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() > 254
        || value.contains([',', ';', '\r', '\n', '\0', ' '])
        || !value
            .rsplit_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "a valid business email is required".to_string(),
        ));
    }
    Ok(value)
}

fn valid_business_url(value: &str) -> Result<String, (StatusCode, String)> {
    let url = reqwest::Url::parse(value.trim()).map_err(|_| invalid_website())?;
    let host = url
        .host_str()
        .ok_or_else(invalid_website)?
        .to_ascii_lowercase();
    let address_host = host.trim_start_matches('[').trim_end_matches(']');
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || host == "localhost"
        || host.ends_with(".local")
        || address_host
            .parse::<IpAddr>()
            .ok()
            .is_some_and(non_public_ip)
    {
        return Err(invalid_website());
    }
    Ok(url.to_string())
}

fn non_public_ip(value: IpAddr) -> bool {
    match value {
        IpAddr::V4(value) => {
            value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_broadcast()
                || value.is_unspecified()
                || value.is_multicast()
        }
        IpAddr::V6(value) => {
            value.is_loopback()
                || value.is_unspecified()
                || value.is_unique_local()
                || value.is_unicast_link_local()
                || value.is_multicast()
        }
    }
}

fn invalid_website() -> (StatusCode, String) {
    (
        StatusCode::BAD_REQUEST,
        "a public HTTPS business website is required".to_string(),
    )
}

fn valid_role(value: &str) -> Result<String, (StatusCode, String)> {
    match value.trim() {
        "owner" | "manager" | "marketing" | "other" => Ok(value.trim().to_string()),
        _ => Err((
            StatusCode::BAD_REQUEST,
            "declared role is not supported".to_string(),
        )),
    }
}

fn enabled() -> bool {
    std::env::var("OMNYID_VENDOR_LISTING_PROPOSALS_ENABLED")
        .ok()
        .as_deref()
        == Some("true")
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|error| error.code())
        .is_some_and(|code| code == "23505")
}

fn not_found() -> (StatusCode, String) {
    (StatusCode::NOT_FOUND, "not_found".to_string())
}

fn database_failure(_: sqlx::Error) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "vendor listing proposal is temporarily unavailable".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proposal_inputs_reject_ssrf_and_unsafe_addresses() {
        assert!(valid_business_url("https://example.com/services").is_ok());
        assert!(valid_business_url("http://example.com").is_err());
        assert!(valid_business_url("https://127.0.0.1/private").is_err());
        assert!(valid_business_url("https://[::1]/private").is_err());
        assert!(valid_email("hello@example.com").is_ok());
        assert!(valid_email("first@example.com,second@example.com").is_err());
    }

    #[test]
    fn proposal_identity_is_stable_and_safe() {
        assert_eq!(slug_base(" Blooms & Co. "), "blooms-co");
        assert_eq!(
            proposal_fingerprint("A", "B", "C", "https://example.com/", "d@example.com"),
            proposal_fingerprint("a", "b", "c", "https://example.com/", "D@example.com")
        );
        assert!(bounded_identifier("../proposal", "proposal id").is_err());
    }
}
