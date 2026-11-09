/*
 * @module-id: rust.server.wedding-invite-proposal-opportunity-routes
 * @primary-capability: category proposal opportunities and scoped vendor replies
 * @locs-version: 1.0
 */

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chacha20poly1305::aead::{OsRng, rand_core::RngCore};
use chrono::{DateTime, Duration as ChronoDuration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use ulid::Ulid;

use crate::db::tenant_schema_name;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_invite_proposal_opportunity_ledger::{
        OpportunityLedgerEvent, append_opportunity_ledger_event, sanitized_context,
    },
};

const MAX_BRIEF_CHARS: usize = 8_000;
const MAX_RESPONSE_CHARS: usize = 12_000;
const OPPORTUNITY_DAYS: i64 = 45;
const SHARE_DAYS: i64 = 14;
const VENDOR_FEED_DAYS: i64 = 30;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/invite-proposals/opportunities",
            get(couple_opportunities_http).post(publish_opportunity_http),
        )
        .route(
            "/wedding/invite-proposals/opportunities/{opportunity_id}/share-link",
            post(create_share_link_http),
        )
        .route(
            "/wedding/invite-proposals/opportunities/{opportunity_id}/close",
            post(close_opportunity_http),
        )
        .route(
            "/wedding/vendor/proposal-opportunities",
            get(claimed_vendor_opportunities_http),
        )
        .route(
            "/wedding/vendor/proposal-opportunities/{opportunity_id}/responses",
            post(claimed_vendor_response_http),
        )
        .route(
            "/wedding/vendor/proposal-lead-link",
            post(claimed_vendor_feed_link_http),
        )
        .route(
            "/wedding/vendor/proposal-lead-link/revoke",
            post(claimed_vendor_feed_revoke_http),
        )
        .route(
            "/api/public/wedding/proposal-opportunities/{token}",
            get(public_opportunity_http).post(public_response_http),
        )
        .route(
            "/api/public/wedding/proposal-leads/{token}",
            get(public_vendor_feed_http),
        )
        .route(
            "/api/public/wedding/proposal-leads/{token}/{opportunity_id}/responses",
            post(public_vendor_feed_response_http),
        )
        .route(
            "/admin/wedding/proposal-opportunities",
            get(admin_opportunity_metrics_http),
        )
        .route(
            "/admin/wedding/proposal-lead-link",
            post(admin_vendor_feed_link_http),
        )
        .route(
            "/admin/wedding/proposal-lead-link/revoke",
            post(admin_vendor_feed_revoke_http),
        )
}

#[derive(Debug, Deserialize)]
struct PublishRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    brief_id: String,
    category: String,
    location: Option<String>,
    brief_text: String,
    shared_context: Value,
}

#[derive(Debug, Deserialize)]
struct VendorQuery {
    vendor_slug: String,
}

#[derive(Debug, Deserialize)]
struct ClaimedResponseRequest {
    vendor_slug: String,
    message: String,
    amount: Option<f64>,
    currency: Option<String>,
    valid_until: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PublicResponseRequest {
    business_name: String,
    business_email: String,
    message: String,
    amount: Option<f64>,
    currency: Option<String>,
    valid_until: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VendorFeedLinkRequest {
    vendor_slug: String,
}

#[derive(Debug, Deserialize)]
struct VendorFeedResponseRequest {
    response_kind: String,
    message: String,
    available_date: Option<String>,
    amount: Option<f64>,
    currency: Option<String>,
    valid_until: Option<String>,
}

#[derive(Debug, Serialize)]
struct OpportunityView {
    opportunity_id: String,
    category: String,
    location: Option<String>,
    brief_text: String,
    shared_context: Value,
    status: String,
    expires_at: String,
    response_count: i64,
    claimed_vendor_view_count: i64,
    share_count: i64,
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn digest(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn valid_email(value: &str) -> bool {
    let value = value.trim();
    value.len() <= 320
        && !value.contains(['\r', '\n', ' ', '<', '>'])
        && value.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        })
}

fn valid_iso_date(value: &str) -> bool {
    value.len() == 10
        && value.as_bytes().get(4) == Some(&b'-')
        && value.as_bytes().get(7) == Some(&b'-')
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| index == 4 || index == 7 || character.is_ascii_digit())
}

fn category_group(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    for (group, terms) in [
        ("venue", ["venue", "reception", "event space"].as_slice()),
        ("photo_video", ["photo", "video"].as_slice()),
        ("celebrant", ["celebrant", "officiant"].as_slice()),
        (
            "flowers_decor",
            ["flower", "florist", "decor", "styling"].as_slice(),
        ),
        ("catering", ["cater", "food", "beverage"].as_slice()),
        (
            "entertainment",
            ["band", "music", "dj", "entertainment"].as_slice(),
        ),
        ("planner", ["planner", "coordinator"].as_slice()),
        ("cake", ["cake", "dessert"].as_slice()),
    ] {
        if terms.iter().any(|term| value.contains(term)) {
            return group.to_string();
        }
    }
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect()
}

fn location_compatible(service_area: &str, location: Option<&str>) -> bool {
    let Some(location) = location.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };
    let area = service_area.trim().to_ascii_lowercase();
    let requested = location.to_ascii_lowercase();
    area.is_empty()
        || area.contains("australia")
        || area.contains("nationwide")
        || area.contains("remote")
        || area.contains(&requested)
        || requested.contains(&area)
        || ["nsw", "vic", "qld", "sa", "wa", "tas", "act", "nt"]
            .iter()
            .any(|state| area.contains(state) && requested.contains(state))
}

fn rollout_allowed(email: &str) -> bool {
    if std::env::var("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED").as_deref() != Ok("true") {
        return false;
    }
    std::env::var("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST")
        .unwrap_or_default()
        .split(',')
        .map(|value| value.trim().to_ascii_lowercase())
        .any(|value| !value.is_empty() && value == email.trim().to_ascii_lowercase())
}

async fn owns_plan(
    state: &AppState,
    user_id: &str,
    wedding_plan_id: &str,
) -> Result<bool, (StatusCode, String)> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM wedding_user_onboarding_state WHERE user_id=$1 AND wedding_plan_id=$2)",
    )
    .bind(user_id)
    .bind(wedding_plan_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Wedding ownership could not be checked.".into()))
}

async fn event(
    tx: &mut Transaction<'_, Postgres>,
    opportunity_id: &str,
    kind: &str,
    vendor_id: Option<&str>,
    dedupe_key: &str,
) -> Result<(), (StatusCode, String)> {
    sqlx::query(
        "INSERT INTO wedding_invite_proposal_events (event_id,opportunity_id,event_kind,vendor_id,dedupe_key) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (opportunity_id,event_kind,dedupe_key) DO NOTHING",
    )
    .bind(format!("proposal-event-{}", Ulid::new()))
    .bind(opportunity_id)
    .bind(kind)
    .bind(vendor_id)
    .bind(dedupe_key)
    .execute(&mut **tx)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The proposal activity could not be recorded.".into()))?;
    Ok(())
}

async fn publish_opportunity_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PublishRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_proposal_publish", &headers),
        RateLimitPolicy {
            max_requests: 8,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !rollout_allowed(&user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "Invite Proposals is not enabled for this account.".into(),
        ));
    }
    let wedding_plan_id = clean(&request.wedding_plan_id, 240);
    let workspace_id = clean(&request.response_workspace_id, 240);
    let brief_id = clean(&request.brief_id, 240);
    let category = clean(&request.category, 120);
    let brief_text = clean(&request.brief_text, MAX_BRIEF_CHARS);
    if wedding_plan_id.is_empty()
        || workspace_id.is_empty()
        || brief_id.is_empty()
        || category.is_empty()
        || brief_text.is_empty()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Wedding, category and proposal brief are required.".into(),
        ));
    }
    if !owns_plan(&state, &user.id, &wedding_plan_id).await? {
        return Err((
            StatusCode::FORBIDDEN,
            "That wedding does not belong to this account.".into(),
        ));
    }
    let opportunity_id = format!("proposal-opportunity-{}", Ulid::new());
    let shared_context = sanitized_context(&request.shared_context);
    let expires_at = Utc::now() + ChronoDuration::days(OPPORTUNITY_DAYS);
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The couple's private ledger is unavailable.".into(),
            )
        })?;
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal could not be started.".into(),
        )
    })?;
    let saved_id = sqlx::query_scalar::<_, String>(
        r#"INSERT INTO wedding_invite_proposal_opportunities
           (opportunity_id,owner_user_id,wedding_plan_id,response_workspace_id,brief_id,category,location,brief_text,shared_context,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (owner_user_id,brief_id) DO UPDATE SET category=EXCLUDED.category,location=EXCLUDED.location,
             brief_text=EXCLUDED.brief_text,shared_context=EXCLUDED.shared_context,status='open',
             expires_at=EXCLUDED.expires_at,updated_at=NOW()
           RETURNING opportunity_id"#,
    )
    .bind(&opportunity_id).bind(&user.id).bind(&wedding_plan_id).bind(&workspace_id)
    .bind(&brief_id).bind(&category).bind(request.location.as_deref().map(|value| clean(value, 240)))
    .bind(&brief_text).bind(&shared_context).bind(expires_at)
    .fetch_one(&mut *tx).await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The proposal opportunity could not be saved.".into()))?;
    sqlx::query("UPDATE wedding_invite_proposal_share_grants SET revoked_at=NOW() WHERE opportunity_id=$1 AND revoked_at IS NULL")
        .bind(&saved_id).execute(&mut *tx).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Earlier secure links could not be revoked.".into()))?;
    event(
        &mut tx,
        &saved_id,
        "published",
        None,
        &digest(&format!("{}:{}", user.id, brief_id)),
    )
    .await?;
    append_opportunity_ledger_event(
        &mut tx,
        OpportunityLedgerEvent {
            owner_user_id: &user.id,
            opportunity_id: &saved_id,
            wedding_plan_id: &wedding_plan_id,
            response_workspace_id: &workspace_id,
            category: &category,
            status: "open",
            event_kind: "published",
            shared_context: &shared_context,
            expires_at,
        },
    )
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The private proposal event could not be saved.".into(),
        )
    })?;
    tx.commit().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal opportunity could not be committed.".into(),
        )
    })?;
    Ok(Json(
        json!({"opportunity_id":saved_id,"status":"open","expires_at":expires_at.to_rfc3339()}),
    ))
}

async fn couple_opportunities_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rows = sqlx::query(
        r#"SELECT o.opportunity_id,o.category,o.location,o.brief_text,o.shared_context,
             CASE WHEN o.status='open' AND o.expires_at<=NOW() THEN 'expired' ELSE o.status END status,o.expires_at::text,
             COUNT(DISTINCT r.response_id)::bigint response_count,
             COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_kind='claimed_vendor_view')::bigint claimed_vendor_view_count,
             COUNT(DISTINCT s.grant_id)::bigint share_count
           FROM wedding_invite_proposal_opportunities o
           LEFT JOIN wedding_invite_proposal_responses r ON r.opportunity_id=o.opportunity_id
           LEFT JOIN wedding_invite_proposal_events e ON e.opportunity_id=o.opportunity_id
           LEFT JOIN wedding_invite_proposal_share_grants s ON s.opportunity_id=o.opportunity_id
          WHERE o.owner_user_id=$1
          GROUP BY o.opportunity_id ORDER BY o.created_at DESC LIMIT 40"#,
    ).bind(&user.id).fetch_all(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Proposal opportunities could not be loaded.".into()))?;
    let opportunities = rows
        .into_iter()
        .map(|row| OpportunityView {
            opportunity_id: row.get("opportunity_id"),
            category: row.get("category"),
            location: row.get("location"),
            brief_text: row.get("brief_text"),
            shared_context: row.get("shared_context"),
            status: row.get("status"),
            expires_at: row.get("expires_at"),
            response_count: row.get("response_count"),
            claimed_vendor_view_count: row.get("claimed_vendor_view_count"),
            share_count: row.get("share_count"),
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({"opportunities":opportunities})))
}

async fn create_share_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(opportunity_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let owned = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM wedding_invite_proposal_opportunities WHERE opportunity_id=$1 AND owner_user_id=$2 AND status='open' AND expires_at>NOW())",
    ).bind(&opportunity_id).bind(&user.id).fetch_one(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The proposal opportunity could not be checked.".into()))?;
    if !owned {
        return Err((
            StatusCode::NOT_FOUND,
            "That open proposal opportunity was not found.".into(),
        ));
    }
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);
    let token = URL_SAFE_NO_PAD.encode(entropy);
    let grant_id = format!("proposal-share-{}", Ulid::new());
    let expires_at = Utc::now() + ChronoDuration::days(SHARE_DAYS);
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The secure link could not be started.".into(),
        )
    })?;
    sqlx::query("INSERT INTO wedding_invite_proposal_share_grants (grant_id,opportunity_id,owner_user_id,token_digest,expires_at) VALUES ($1,$2,$3,$4,$5)")
        .bind(&grant_id).bind(&opportunity_id).bind(&user.id).bind(digest(&token)).bind(expires_at)
        .execute(&mut *tx).await.map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The secure link could not be saved.".into()))?;
    event(
        &mut tx,
        &opportunity_id,
        "share_link_created",
        None,
        &grant_id,
    )
    .await?;
    tx.commit().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The secure link could not be committed.".into(),
        )
    })?;
    Ok(Json(json!({
        "url": format!("https://omnyid.com/workspace/vendor.html?proposal={token}"),
        "expires_at": expires_at.to_rfc3339(),
        "notice": "Anyone with this private link can submit one proposal until it expires. Revoke it by closing the opportunity."
    })))
}

async fn close_opportunity_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(opportunity_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The couple's private ledger is unavailable.".into(),
            )
        })?;
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal opportunity could not be closed.".into(),
        )
    })?;
    let updated = sqlx::query(
        "UPDATE wedding_invite_proposal_opportunities SET status='closed',updated_at=NOW() WHERE opportunity_id=$1 AND owner_user_id=$2 AND status='open' RETURNING wedding_plan_id,response_workspace_id,category,shared_context,expires_at",
    )
    .bind(&opportunity_id)
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal opportunity could not be closed.".into(),
        )
    })?
    .ok_or((
        StatusCode::NOT_FOUND,
        "That open proposal opportunity was not found.".into(),
    ))?;
    sqlx::query(
        "UPDATE wedding_invite_proposal_share_grants SET revoked_at=NOW() WHERE opportunity_id=$1 AND owner_user_id=$2 AND revoked_at IS NULL",
    )
    .bind(&opportunity_id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The secure vendor links could not be revoked.".into(),
        )
    })?;
    event(
        &mut tx,
        &opportunity_id,
        "opportunity_closed",
        None,
        &user.id,
    )
    .await?;
    let updated_plan: String = updated.get("wedding_plan_id");
    let updated_workspace: String = updated.get("response_workspace_id");
    let updated_category: String = updated.get("category");
    let updated_context: Value = updated.get("shared_context");
    append_opportunity_ledger_event(
        &mut tx,
        OpportunityLedgerEvent {
            owner_user_id: &user.id,
            opportunity_id: &opportunity_id,
            wedding_plan_id: &updated_plan,
            response_workspace_id: &updated_workspace,
            category: &updated_category,
            status: "closed",
            event_kind: "closed",
            shared_context: &updated_context,
            expires_at: updated.get::<DateTime<Utc>, _>("expires_at"),
        },
    )
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The private proposal closure could not be saved.".into(),
        )
    })?;
    tx.commit().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal opportunity closure could not be committed.".into(),
        )
    })?;
    Ok(Json(json!({"closed":true,"links_revoked":true})))
}

async fn share_authority(
    state: &AppState,
    token: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    if URL_SAFE_NO_PAD
        .decode(token.trim())
        .ok()
        .filter(|bytes| bytes.len() == 32)
        .is_none()
    {
        return Err((
            StatusCode::NOT_FOUND,
            "This proposal link is not available.".into(),
        ));
    }
    sqlx::query(
        r#"SELECT o.opportunity_id,o.owner_user_id,o.wedding_plan_id,o.response_workspace_id,
                  o.category,o.location,o.brief_text,o.shared_context,o.expires_at::text
             FROM wedding_invite_proposal_share_grants g
             JOIN wedding_invite_proposal_opportunities o ON o.opportunity_id=g.opportunity_id
            WHERE g.token_digest=$1 AND g.revoked_at IS NULL AND g.expires_at>NOW()
              AND o.status='open' AND o.expires_at>NOW()"#,
    )
    .bind(digest(token.trim()))
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal link could not be checked.".into(),
        )
    })?
    .ok_or((
        StatusCode::NOT_FOUND,
        "This proposal link has expired or is no longer available.".into(),
    ))
}

fn no_store_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, private, max-age=0"),
    );
    headers.insert(
        "x-robots-tag",
        HeaderValue::from_static("noindex, nofollow, noarchive"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers
}

async fn public_opportunity_http(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        format!("proposal-link-view:{}", digest(token.trim())),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(3600),
        },
    )
    .await?;
    let row = share_authority(&state, &token).await?;
    let opportunity_id: String = row.get("opportunity_id");
    sqlx::query("UPDATE wedding_invite_proposal_share_grants SET last_viewed_at=NOW() WHERE token_digest=$1")
        .bind(digest(token.trim())).execute(&state.db.pool).await.ok();
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal view could not be recorded.".into(),
        )
    })?;
    event(
        &mut tx,
        &opportunity_id,
        "secure_link_view",
        None,
        &Ulid::new().to_string(),
    )
    .await?;
    tx.commit().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal view could not be committed.".into(),
        )
    })?;
    Ok((
        no_store_headers(),
        Json(json!({
            "opportunity_id": opportunity_id,
            "category": row.get::<String,_>("category"),
            "location": row.get::<Option<String>,_>("location"),
            "brief_text": row.get::<String,_>("brief_text"),
            "shared_context": row.get::<Value,_>("shared_context"),
            "expires_at": row.get::<String,_>("expires_at")
        })),
    ))
}

async fn vendor_authority(
    state: &AppState,
    user_id: &str,
    slug: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    sqlx::query(
        "SELECT vendor_id,vendor_name,category,service_area FROM wedding_vendors WHERE vendor_slug=$1 AND claimed_by_user_id=$2 AND claim_status='verified' AND status='active'",
    ).bind(slug).bind(user_id).fetch_optional(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Vendor ownership could not be checked.".into()))?
        .ok_or((StatusCode::FORBIDDEN, "A verified claimed listing is required.".into()))
}

async fn active_vendor_by_slug(
    state: &AppState,
    slug: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    sqlx::query(
        "SELECT vendor_id,vendor_slug,vendor_name,category,service_area,contact_email FROM wedding_vendors WHERE vendor_slug=$1 AND status='active'",
    )
    .bind(slug)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The vendor listing could not be checked.".into()))?
    .ok_or((StatusCode::NOT_FOUND, "That active vendor listing was not found.".into()))
}

async fn create_vendor_feed_link(
    state: &AppState,
    vendor: &sqlx::postgres::PgRow,
    issuer_user_id: &str,
    authority: &str,
) -> Result<Value, (StatusCode, String)> {
    let vendor_id: String = vendor.get("vendor_id");
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);
    let token = URL_SAFE_NO_PAD.encode(entropy);
    let grant_id = format!("proposal-feed-{}", Ulid::new());
    let expires_at = Utc::now() + ChronoDuration::days(VENDOR_FEED_DAYS);
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The vendor lead link could not be started.".into(),
        )
    })?;
    sqlx::query(
        "UPDATE wedding_invite_proposal_vendor_feed_grants SET revoked_at=NOW() WHERE vendor_id=$1 AND revoked_at IS NULL",
    )
    .bind(&vendor_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The earlier vendor lead link could not be revoked.".into()))?;
    sqlx::query(
        "INSERT INTO wedding_invite_proposal_vendor_feed_grants (grant_id,vendor_id,issued_by_user_id,authority,token_digest,expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(&grant_id)
    .bind(&vendor_id)
    .bind(issuer_user_id)
    .bind(authority)
    .bind(digest(&token))
    .bind(expires_at)
    .execute(&mut *tx)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The vendor lead link could not be saved.".into()))?;
    tx.commit().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The vendor lead link could not be committed.".into(),
        )
    })?;
    Ok(json!({
        "url": format!("https://omnyid.com/workspace/vendor.html#proposal_feed={token}"),
        "vendor_id": vendor_id,
        "vendor_name": vendor.get::<String,_>("vendor_name"),
        "expires_at": expires_at.to_rfc3339(),
        "notice": "This private link is bound to one vendor listing. Creating another link revokes it."
    }))
}

async fn revoke_vendor_feed_link(
    state: &AppState,
    vendor_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let revoked = sqlx::query(
        "UPDATE wedding_invite_proposal_vendor_feed_grants SET revoked_at=NOW() WHERE vendor_id=$1 AND revoked_at IS NULL RETURNING grant_id",
    )
    .bind(vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The vendor lead link could not be revoked.".into()))?;
    Ok(json!({"revoked":true,"revoked_count":revoked.len()}))
}

async fn claimed_vendor_feed_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<VendorFeedLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let vendor = vendor_authority(&state, &user.id, &clean(&request.vendor_slug, 160)).await?;
    Ok(Json(
        create_vendor_feed_link(&state, &vendor, &user.id, "claimed_vendor").await?,
    ))
}

async fn claimed_vendor_feed_revoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<VendorFeedLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let vendor = vendor_authority(&state, &user.id, &clean(&request.vendor_slug, 160)).await?;
    Ok(Json(
        revoke_vendor_feed_link(&state, vendor.get::<String, _>("vendor_id").as_str()).await?,
    ))
}

async fn admin_vendor_feed_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<VendorFeedLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access is required.".into()));
    }
    let vendor = active_vendor_by_slug(&state, &clean(&request.vendor_slug, 160)).await?;
    Ok(Json(
        create_vendor_feed_link(&state, &vendor, &user.id, "operator").await?,
    ))
}

async fn admin_vendor_feed_revoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<VendorFeedLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access is required.".into()));
    }
    let vendor = active_vendor_by_slug(&state, &clean(&request.vendor_slug, 160)).await?;
    Ok(Json(
        revoke_vendor_feed_link(&state, vendor.get::<String, _>("vendor_id").as_str()).await?,
    ))
}

async fn vendor_feed_authority(
    state: &AppState,
    token: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    if URL_SAFE_NO_PAD
        .decode(token.trim())
        .ok()
        .filter(|bytes| bytes.len() == 32)
        .is_none()
    {
        return Err((
            StatusCode::NOT_FOUND,
            "This vendor lead link is not available.".into(),
        ));
    }
    sqlx::query(
        r#"SELECT g.grant_id,g.vendor_id,v.vendor_slug,v.vendor_name,v.category,v.service_area,
                  v.contact_email,g.expires_at::text
             FROM wedding_invite_proposal_vendor_feed_grants g
             JOIN wedding_vendors v ON v.vendor_id=g.vendor_id
            WHERE g.token_digest=$1 AND g.revoked_at IS NULL AND g.expires_at>NOW()
              AND v.status='active'"#,
    )
    .bind(digest(token.trim()))
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The vendor lead link could not be checked.".into(),
        )
    })?
    .ok_or((
        StatusCode::NOT_FOUND,
        "This vendor lead link has expired or was revoked.".into(),
    ))
}

async fn matching_vendor_feed_opportunities(
    state: &AppState,
    vendor: &sqlx::postgres::PgRow,
) -> Result<Vec<Value>, (StatusCode, String)> {
    let category: String = vendor.get("category");
    let service_area: String = vendor.get("service_area");
    let rows = sqlx::query(
        r#"SELECT o.opportunity_id,o.category,o.location,o.brief_text,o.shared_context,o.expires_at::text,
                  COUNT(r.response_id)::bigint response_count
             FROM wedding_invite_proposal_opportunities o
             LEFT JOIN wedding_invite_proposal_responses r ON r.opportunity_id=o.opportunity_id AND r.vendor_id=$1
            WHERE o.status='open' AND o.expires_at>NOW()
            GROUP BY o.opportunity_id ORDER BY o.created_at DESC LIMIT 100"#,
    )
    .bind(vendor.get::<String,_>("vendor_id"))
    .fetch_all(&state.db.pool)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Proposal leads could not be loaded.".into()))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let row_category: String = row.get("category");
            let location: Option<String> = row.get("location");
            if category_group(&row_category) != category_group(&category)
                || !location_compatible(&service_area, location.as_deref())
            {
                return None;
            }
            Some(json!({
                "opportunity_id":row.get::<String,_>("opportunity_id"),"category":row_category,
                "location":location,"brief_text":row.get::<String,_>("brief_text"),
                "shared_context":row.get::<Value,_>("shared_context"),
                "expires_at":row.get::<String,_>("expires_at"),
                "response_count":row.get::<i64,_>("response_count")
            }))
        })
        .collect())
}

async fn public_vendor_feed_http(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        format!("proposal-feed-view:{}", digest(token.trim())),
        RateLimitPolicy {
            max_requests: 40,
            window: Duration::from_secs(3600),
        },
    )
    .await?;
    let vendor = vendor_feed_authority(&state, &token).await?;
    let opportunities = matching_vendor_feed_opportunities(&state, &vendor).await?;
    sqlx::query("UPDATE wedding_invite_proposal_vendor_feed_grants SET last_viewed_at=NOW() WHERE token_digest=$1")
        .bind(digest(token.trim())).execute(&state.db.pool).await.ok();
    Ok((
        no_store_headers(),
        Json(json!({
            "vendor_id":vendor.get::<String,_>("vendor_id"),
            "vendor_name":vendor.get::<String,_>("vendor_name"),
            "expires_at":vendor.get::<String,_>("expires_at"),
            "opportunities":opportunities
        })),
    ))
}

async fn claimed_vendor_opportunities_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let vendor = vendor_authority(&state, &user.id, &clean(&query.vendor_slug, 160)).await?;
    let vendor_id: String = vendor.get("vendor_id");
    let category: String = vendor.get("category");
    let service_area: String = vendor.get("service_area");
    let rows = sqlx::query(
        "SELECT opportunity_id,category,location,brief_text,shared_context,expires_at::text FROM wedding_invite_proposal_opportunities WHERE status='open' AND expires_at>NOW() ORDER BY created_at DESC LIMIT 100",
    ).fetch_all(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Proposal opportunities could not be loaded.".into()))?;
    let mut opportunities = Vec::new();
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Proposal views could not be started.".into(),
        )
    })?;
    for row in rows {
        let row_category: String = row.get("category");
        let location: Option<String> = row.get("location");
        if category_group(&row_category) != category_group(&category)
            || !location_compatible(&service_area, location.as_deref())
        {
            continue;
        }
        let opportunity_id: String = row.get("opportunity_id");
        event(
            &mut tx,
            &opportunity_id,
            "claimed_vendor_view",
            Some(&vendor_id),
            &vendor_id,
        )
        .await?;
        opportunities.push(json!({
            "opportunity_id":opportunity_id,"category":row_category,"location":location,
            "brief_text":row.get::<String,_>("brief_text"),"shared_context":row.get::<Value,_>("shared_context"),
            "expires_at":row.get::<String,_>("expires_at")
        }));
    }
    tx.commit().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Proposal views could not be committed.".into(),
        )
    })?;
    Ok(Json(
        json!({"vendor_id":vendor_id,"opportunities":opportunities}),
    ))
}

async fn store_response(
    state: &AppState,
    row: &sqlx::postgres::PgRow,
    vendor_id: Option<&str>,
    vendor_name: &str,
    business_email: Option<&str>,
    channel: &str,
    response_kind: &str,
    available_date: Option<&str>,
    message: &str,
    amount: Option<f64>,
    currency: Option<&str>,
    valid_until: Option<&str>,
) -> Result<Value, (StatusCode, String)> {
    let opportunity_id: String = row.get("opportunity_id");
    let owner_user_id: String = row.get("owner_user_id");
    let wedding_plan_id: String = row.get("wedding_plan_id");
    let workspace_id: String = row.get("response_workspace_id");
    let category: String = row.get("category");
    let message = clean(message, MAX_RESPONSE_CHARS);
    let vendor_name = clean(vendor_name, 240);
    if message.is_empty() || vendor_name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Business name and proposal details are required.".into(),
        ));
    }
    let amount =
        amount.filter(|value| value.is_finite() && *value >= 0.0 && *value <= 100_000_000.0);
    let currency = clean(currency.unwrap_or("AUD"), 3).to_ascii_uppercase();
    let valid_until = valid_until
        .map(|value| clean(value, 10))
        .filter(|value| valid_iso_date(value));
    let response_kind = match response_kind {
        "available_date" => "available_date",
        "notify_couple" => "notify_couple",
        _ => "proposal",
    };
    let available_date = available_date
        .map(|value| clean(value, 10))
        .filter(|value| valid_iso_date(value));
    let available_date_db = available_date
        .as_deref()
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
    if response_kind == "available_date" && available_date_db.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose the suitable date being offered.".into(),
        ));
    }
    let email_digest = business_email.map(|value| digest(&value.trim().to_ascii_lowercase()));
    let fingerprint = digest(
        &json!([
            opportunity_id,
            vendor_id,
            vendor_name,
            email_digest,
            message,
            amount,
            currency,
            valid_until,
            response_kind,
            available_date
        ])
        .to_string(),
    );
    let response_id = format!("proposal-response-{}", Ulid::new());
    state
        .db
        .ensure_user_private_schema(&owner_user_id)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The couple's private ledger is unavailable.".into(),
            )
        })?;
    let table = format!("\"{}\".messages", tenant_schema_name(&owner_user_id));
    let response_title = match response_kind {
        "available_date" => format!("Available date from {vendor_name}"),
        "notify_couple" => format!("Follow-up request from {vendor_name}"),
        _ => format!("Proposal from {vendor_name}"),
    };
    let markdown = [
        format!("# {response_title}"),
        String::new(),
        format!("**Category:** {category}"),
        amount
            .map(|value| format!("**Indicative total:** {currency} {value:.2}"))
            .unwrap_or_default(),
        valid_until
            .as_ref()
            .map(|value| format!("**Valid until:** {value}"))
            .unwrap_or_default(),
        available_date
            .as_ref()
            .map(|value| format!("**Suitable available date:** {value}"))
            .unwrap_or_default(),
        String::new(),
        message.clone(),
    ]
    .into_iter()
    .collect::<Vec<_>>()
    .join("\n");
    let now = Utc::now();
    let content = json!({
        "kind":"wedding_vendor_proposal_response","artifact_id":response_id,
        "artifact_kind":"vendor_table","title":response_title,
        "markdown":markdown,"vendor_id":vendor_id,"vendor_name":vendor_name,
        "category":category,"amount":amount,"currency":currency,"valid_until":valid_until,
        "response_kind":response_kind,"available_date":available_date,
        "notification_requested":response_kind == "notify_couple",
        "business_email":business_email,"opportunity_id":opportunity_id,
        "wedding_plan_id":wedding_plan_id,"response_workspace_id":workspace_id,
        "source_labels":["Vendor proposal"],"approval_state":"review",
    });
    let metadata = json!({
        "template":"wedding_planning","weddingPlanId":wedding_plan_id,
        "responseWorkspaceId":workspace_id,"origin":"wedding_invite_proposal",
        "vendor_id":vendor_id,"vendor_name":vendor_name,"opportunity_id":opportunity_id,
        "model_calls":0,"privacy_scope":"tenant_private",
        "notification_requested":response_kind == "notify_couple"
    });
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal response could not be started.".into(),
        )
    })?;
    let inserted = sqlx::query_scalar::<_, String>(
        "INSERT INTO wedding_invite_proposal_responses (response_id,opportunity_id,owner_user_id,vendor_id,channel,response_kind,available_date,response_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (opportunity_id,response_fingerprint) DO NOTHING RETURNING response_id",
    ).bind(&response_id).bind(&opportunity_id).bind(&owner_user_id).bind(vendor_id).bind(channel).bind(response_kind).bind(available_date_db).bind(&fingerprint)
        .fetch_optional(&mut *tx).await.map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The proposal response could not be saved.".into()))?;
    if inserted.is_some() {
        let query = format!(
            "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata,\"references\",supertags) VALUES ($1,$2,$3,$4,$5,'document','wedding_vendor_proposal_response','wedding_artifact',$6,'server:wedding-invite-proposal:v1',TRUE,$7,$8,$9)"
        );
        sqlx::query(&query)
            .bind(&response_id).bind(format!("wedding-proposal:{workspace_id}:{opportunity_id}"))
            .bind("system://wedding-vendor-proposal").bind(json!(["agent://wedding-planning","agent://knowledge-graph"]))
            .bind(now).bind(&content).bind(&metadata)
            .bind(json!([{"type":"proposal_opportunity","target":opportunity_id,"label":"Invite Proposals opportunity"}]))
            .bind(if response_kind == "notify_couple" {
                vec!["template:wedding_planning","wedding_vendor_proposal","vendor_response","wedding_vendor_notify_request"]
            } else {
                vec!["template:wedding_planning","wedding_vendor_proposal","vendor_response"]
            })
            .execute(&mut *tx).await.map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The private proposal document could not be saved.".into()))?;
        event(
            &mut tx,
            &opportunity_id,
            "response_received",
            vendor_id,
            &response_id,
        )
        .await?;
    }
    tx.commit().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The proposal response could not be committed.".into(),
        )
    })?;
    let replayed = inserted.is_none();
    Ok(
        json!({"response_id":inserted.unwrap_or(response_id),"replayed":replayed,"status":"received"}),
    )
}

async fn claimed_vendor_response_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(opportunity_id): Path<String>,
    Json(request): Json<ClaimedResponseRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let vendor = vendor_authority(&state, &user.id, &clean(&request.vendor_slug, 160)).await?;
    let row = sqlx::query("SELECT opportunity_id,owner_user_id,wedding_plan_id,response_workspace_id,category,location FROM wedding_invite_proposal_opportunities WHERE opportunity_id=$1 AND status='open' AND expires_at>NOW()")
        .bind(&opportunity_id).fetch_optional(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The proposal opportunity could not be loaded.".into()))?
        .ok_or((StatusCode::NOT_FOUND, "This proposal opportunity is no longer open.".into()))?;
    if category_group(row.get::<String, _>("category").as_str())
        != category_group(vendor.get::<String, _>("category").as_str())
        || !location_compatible(
            vendor.get::<String, _>("service_area").as_str(),
            row.get::<Option<String>, _>("location").as_deref(),
        )
    {
        return Err((
            StatusCode::FORBIDDEN,
            "This opportunity does not match the claimed listing.".into(),
        ));
    }
    Ok(Json(
        store_response(
            &state,
            &row,
            Some(vendor.get::<String, _>("vendor_id").as_str()),
            vendor.get::<String, _>("vendor_name").as_str(),
            None,
            "claimed_vendor",
            "proposal",
            None,
            &request.message,
            request.amount,
            request.currency.as_deref(),
            request.valid_until.as_deref(),
        )
        .await?,
    ))
}

async fn public_response_http(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
    Json(request): Json<PublicResponseRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        format!("proposal-link-response:{}", digest(token.trim())),
        RateLimitPolicy {
            max_requests: 8,
            window: Duration::from_secs(3600),
        },
    )
    .await?;
    if !valid_email(&request.business_email) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Enter a valid business email.".into(),
        ));
    }
    let row = share_authority(&state, &token).await?;
    let result = store_response(
        &state,
        &row,
        None,
        &request.business_name,
        Some(request.business_email.trim()),
        "secure_referral",
        "proposal",
        None,
        &request.message,
        request.amount,
        request.currency.as_deref(),
        request.valid_until.as_deref(),
    )
    .await?;
    Ok((no_store_headers(), Json(result)))
}

async fn public_vendor_feed_response_http(
    State(state): State<Arc<AppState>>,
    Path((token, opportunity_id)): Path<(String, String)>,
    Json(request): Json<VendorFeedResponseRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        format!("proposal-feed-response:{}", digest(token.trim())),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(3600),
        },
    )
    .await?;
    let vendor = vendor_feed_authority(&state, &token).await?;
    let row = sqlx::query(
        "SELECT opportunity_id,owner_user_id,wedding_plan_id,response_workspace_id,category,location FROM wedding_invite_proposal_opportunities WHERE opportunity_id=$1 AND status='open' AND expires_at>NOW()",
    )
    .bind(&opportunity_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The proposal lead could not be loaded.".into()))?
    .ok_or((StatusCode::NOT_FOUND, "This proposal lead is no longer open.".into()))?;
    if category_group(row.get::<String, _>("category").as_str())
        != category_group(vendor.get::<String, _>("category").as_str())
        || !location_compatible(
            vendor.get::<String, _>("service_area").as_str(),
            row.get::<Option<String>, _>("location").as_deref(),
        )
    {
        return Err((
            StatusCode::FORBIDDEN,
            "This lead does not match this vendor link.".into(),
        ));
    }
    let result = store_response(
        &state,
        &row,
        Some(vendor.get::<String, _>("vendor_id").as_str()),
        vendor.get::<String, _>("vendor_name").as_str(),
        vendor.get::<Option<String>, _>("contact_email").as_deref(),
        "vendor_feed",
        &request.response_kind,
        request.available_date.as_deref(),
        &request.message,
        request.amount,
        request.currency.as_deref(),
        request.valid_until.as_deref(),
    )
    .await?;
    Ok((no_store_headers(), Json(result)))
}

async fn admin_opportunity_metrics_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access is required.".into()));
    }
    let rows = sqlx::query(
        r#"SELECT o.category,
             COUNT(DISTINCT o.opportunity_id) FILTER (WHERE o.status='open' AND o.expires_at>NOW())::bigint opportunities,
             COUNT(DISTINCT r.response_id)::bigint replies,
             COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_kind='claimed_vendor_view')::bigint claimed_vendor_views,
             COUNT(DISTINCT s.grant_id)::bigint shares
           FROM wedding_invite_proposal_opportunities o
           LEFT JOIN wedding_invite_proposal_responses r ON r.opportunity_id=o.opportunity_id
           LEFT JOIN wedding_invite_proposal_events e ON e.opportunity_id=o.opportunity_id
           LEFT JOIN wedding_invite_proposal_share_grants s ON s.opportunity_id=o.opportunity_id
          GROUP BY o.category ORDER BY opportunities DESC,o.category"#,
    ).fetch_all(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Proposal metrics could not be loaded.".into()))?;
    let categories = rows.into_iter().map(|row| json!({
        "category":row.get::<String,_>("category"),"opportunities":row.get::<i64,_>("opportunities"),
        "replies":row.get::<i64,_>("replies"),"claimed_vendor_views":row.get::<i64,_>("claimed_vendor_views"),
        "shares":row.get::<i64,_>("shares")
    })).collect::<Vec<_>>();
    let opportunity_rows = sqlx::query(
        r#"SELECT o.opportunity_id,o.category,o.location,o.brief_text,o.shared_context,
                  CASE WHEN o.status='open' AND o.expires_at<=NOW() THEN 'expired' ELSE o.status END status,
                  o.expires_at::text,o.created_at::text,u.email,
                  COUNT(DISTINCT r.response_id)::bigint response_count,
                  COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_kind IN ('claimed_vendor_view','secure_link_view'))::bigint vendor_view_count
             FROM wedding_invite_proposal_opportunities o
             JOIN users u ON u.id=o.owner_user_id
             LEFT JOIN wedding_invite_proposal_responses r ON r.opportunity_id=o.opportunity_id
             LEFT JOIN wedding_invite_proposal_events e ON e.opportunity_id=o.opportunity_id
            GROUP BY o.opportunity_id,u.email
            ORDER BY o.created_at DESC LIMIT 250"#,
    )
    .fetch_all(&state.db.pool)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Proposal intents could not be loaded.".into()))?;
    let opportunities = opportunity_rows
        .into_iter()
        .map(|row| {
            json!({
                "opportunity_id":row.get::<String,_>("opportunity_id"),
                "couple_email":row.get::<String,_>("email"),
                "category":row.get::<String,_>("category"),
                "location":row.get::<Option<String>,_>("location"),
                "brief_text":row.get::<String,_>("brief_text"),
                "shared_context":row.get::<Value,_>("shared_context"),
                "status":row.get::<String,_>("status"),
                "created_at":row.get::<String,_>("created_at"),
                "expires_at":row.get::<String,_>("expires_at"),
                "response_count":row.get::<i64,_>("response_count"),
                "vendor_view_count":row.get::<i64,_>("vendor_view_count")
            })
        })
        .collect::<Vec<_>>();
    let vendor_rows = sqlx::query(
        r#"SELECT v.vendor_id,v.vendor_slug,v.vendor_name,v.category,v.service_area,v.claim_status,
                  g.expires_at::text feed_expires_at,g.revoked_at::text feed_revoked_at,g.last_viewed_at::text feed_last_viewed_at
             FROM wedding_vendors v
             LEFT JOIN LATERAL (
                 SELECT expires_at,revoked_at,last_viewed_at
                   FROM wedding_invite_proposal_vendor_feed_grants
                  WHERE vendor_id=v.vendor_id ORDER BY created_at DESC LIMIT 1
             ) g ON TRUE
            WHERE v.status='active' ORDER BY v.vendor_name LIMIT 500"#,
    )
    .fetch_all(&state.db.pool)
    .await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Vendor link choices could not be loaded.".into()))?;
    let vendors = vendor_rows.into_iter().map(|row| json!({
        "vendor_id":row.get::<String,_>("vendor_id"),"vendor_slug":row.get::<String,_>("vendor_slug"),
        "vendor_name":row.get::<String,_>("vendor_name"),"category":row.get::<String,_>("category"),
        "service_area":row.get::<String,_>("service_area"),"claim_status":row.get::<String,_>("claim_status"),
        "feed_expires_at":row.get::<Option<String>,_>("feed_expires_at"),
        "feed_revoked_at":row.get::<Option<String>,_>("feed_revoked_at"),
        "feed_last_viewed_at":row.get::<Option<String>,_>("feed_last_viewed_at")
    })).collect::<Vec<_>>();
    Ok((
        no_store_headers(),
        Json(json!({
            "categories":categories,"opportunities":opportunities,"vendors":vendors
        })),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_and_location_matching_stay_conservative() {
        assert_eq!(category_group("Wedding photographers"), "photo_video");
        assert_eq!(category_group("Videography"), "photo_video");
        assert_ne!(
            category_group("Wedding venues"),
            category_group("Photographers")
        );
        assert!(location_compatible("Sydney NSW", Some("NSW")));
        assert!(!location_compatible("Melbourne VIC", Some("Sydney NSW")));
    }

    #[test]
    fn shared_context_excludes_unapproved_fields() {
        let value = sanitized_context(
            &json!({"location":"Sydney","phone":"0400","allow_phone_contact":false}),
        );
        assert_eq!(value["location"], "Sydney");
        assert!(value.get("phone").is_none());
    }
}
