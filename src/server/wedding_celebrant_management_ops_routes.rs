//! Operator-only, content-light celebrant onboarding operations.
//!
//! These routes reuse the canonical vendor, register and management-link
//! authorities. They never store social-message bodies or bearer URLs.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

const OFFICIAL_REGISTER_URL: &str =
    "https://www.ag.gov.au/families-and-marriage/marriage/find-marriage-celebrant";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/admin/wedding/celebrant-management/outreach",
            post(update_outreach_http),
        )
        .route(
            "/admin/wedding/celebrant-management/listings/preview",
            post(preview_listing_http),
        )
        .route(
            "/admin/wedding/celebrant-management/listings",
            post(create_listing_http),
        )
}

fn db_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(%error, "celebrant onboarding operation failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Celebrant onboarding could not be updated just now.".into(),
    )
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

async fn operator(
    state: &AppState,
    headers: &HeaderMap,
    action: &str,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    let user = authenticated_user(&state.db, headers).await?;
    if !super::cost_controls::operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access is required.".into()));
    }
    enforce_rate_limit(
        state,
        authenticated_rate_limit_key(action, headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    Ok(user)
}

async fn body<T: for<'de> Deserialize<'de>>(request: Request) -> Result<T, (StatusCode, String)> {
    let bytes = axum::body::to_bytes(request.into_body(), 32 * 1024)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid request body.".into()))?;
    serde_json::from_slice(&bytes).map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Invalid request body.".into(),
        )
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OutreachRequest {
    vendor_id: String,
    channel: String,
    status: String,
    sent_at: Option<String>,
    follow_up_due_at: Option<String>,
}

fn optional_time(
    value: Option<&str>,
    label: &str,
) -> Result<Option<DateTime<Utc>>, (StatusCode, String)> {
    value
        .filter(|value| !value.trim().is_empty())
        .map(|value| DateTime::parse_from_rfc3339(value).map(|value| value.with_timezone(&Utc)))
        .transpose()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                format!("{label} must be an ISO-8601 date and time."),
            )
        })
}

async fn update_outreach_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers, "celebrant-outreach-update").await?;
    let request: OutreachRequest = body(request).await?;
    let vendor_id = clean(&request.vendor_id, 160);
    let channel = clean(&request.channel.to_ascii_lowercase(), 24);
    let status = clean(&request.status.to_ascii_lowercase(), 32);
    if !matches!(channel.as_str(), "email" | "instagram" | "phone" | "other") {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a supported outreach channel.".into(),
        ));
    }
    if !matches!(
        status.as_str(),
        "planned" | "sent" | "follow_up_due" | "responded" | "opted_out"
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a supported outreach status.".into(),
        ));
    }
    let sent_at = optional_time(request.sent_at.as_deref(), "Sent at")?
        .or_else(|| (status == "sent").then(Utc::now));
    let follow_up_due_at = optional_time(request.follow_up_due_at.as_deref(), "Follow-up due")?;
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    let vendor = sqlx::query(
        "SELECT vendor_name FROM wedding_vendors WHERE vendor_id=$1 AND lower(category)='celebrant' AND status IN ('active','hidden') FOR UPDATE",
    )
    .bind(&vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Celebrant listing not found.".into()))?;
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT status FROM wedding_celebrant_outreach WHERE vendor_id=$1 FOR UPDATE",
    )
    .bind(&vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    if existing.as_deref() == Some("opted_out") && status != "opted_out" {
        return Err((
            StatusCode::CONFLICT,
            "This celebrant opted out. A fresh, independently recorded consent is required before outreach can resume.".into(),
        ));
    }
    let opted_out_at = (status == "opted_out").then(Utc::now);
    let revision = sqlx::query_scalar::<_, i64>(
        r#"INSERT INTO wedding_celebrant_outreach
             (vendor_id,channel,status,sent_at,follow_up_due_at,opted_out_at,updated_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (vendor_id) DO UPDATE SET
             channel=EXCLUDED.channel,status=EXCLUDED.status,
             sent_at=COALESCE(EXCLUDED.sent_at,wedding_celebrant_outreach.sent_at),
             follow_up_due_at=EXCLUDED.follow_up_due_at,
             opted_out_at=COALESCE(EXCLUDED.opted_out_at,wedding_celebrant_outreach.opted_out_at),
             updated_by_user_id=EXCLUDED.updated_by_user_id,
             revision=wedding_celebrant_outreach.revision+1,updated_at=NOW()
           RETURNING revision"#,
    )
    .bind(&vendor_id)
    .bind(&channel)
    .bind(&status)
    .bind(sent_at)
    .bind(follow_up_due_at)
    .bind(opted_out_at)
    .bind(&user.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let mut revoked_links = 0;
    if status == "opted_out" {
        let revoked = sqlx::query(
            "UPDATE wedding_celebrant_management_grants SET status='revoked',revoked_at=NOW() WHERE vendor_id=$1 AND status IN ('active','exchanged')",
        )
        .bind(&vendor_id)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        revoked_links = revoked.rows_affected();
        sqlx::query(
            "UPDATE wedding_celebrant_management_sessions SET consumed_at=COALESCE(consumed_at,NOW()) WHERE grant_id IN (SELECT grant_id FROM wedding_celebrant_management_grants WHERE vendor_id=$1)",
        )
        .bind(&vendor_id)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    }
    sqlx::query(
        "INSERT INTO wedding_celebrant_management_events(event_id,vendor_id,event_kind,dedupe_key,metadata) VALUES($1,$2,'outreach_updated',$3,$4)",
    )
    .bind(Ulid::new().to_string())
    .bind(&vendor_id)
    .bind(format!("outreach-{vendor_id}-{revision}"))
    .bind(json!({
        "channel": channel,
        "status": status,
        "sent_at": sent_at.map(|value| value.to_rfc3339()),
        "follow_up_due_at": follow_up_due_at.map(|value| value.to_rfc3339()),
        "revision": revision
    }))
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(json!({
        "vendor_id": vendor_id,
        "vendor_name": vendor.get::<String,_>("vendor_name"),
        "status": status,
        "revision": revision,
        "revoked_links": revoked_links
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ListingRequest {
    business_name: String,
    source_url: String,
    service_area: Option<String>,
    confirm_unpublished: Option<bool>,
}

fn listing_input(
    request: &ListingRequest,
) -> Result<(String, String, String), (StatusCode, String)> {
    let name = clean(&request.business_name, 180);
    if name.chars().count() < 2 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Enter the celebrant's business name.".into(),
        ));
    }
    let source = clean(&request.source_url, 500);
    let parsed = reqwest::Url::parse(&source).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "Enter a valid public source URL.".into(),
        )
    })?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Enter an HTTP or HTTPS source URL.".into(),
        ));
    }
    let area = request
        .service_area
        .as_deref()
        .map(|value| clean(value, 180))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Australia — confirm service area".into());
    Ok((name, parsed.to_string(), area))
}

async fn duplicates(
    state: &AppState,
    name: &str,
    source: &str,
) -> Result<Vec<Value>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"SELECT vendor_id,vendor_slug,vendor_name,category,service_area,status,website_url
             FROM wedding_vendors
            WHERE lower(vendor_name)=lower($1)
               OR lower(trim(trailing '/' from COALESCE(website_url,'')))=lower(trim(trailing '/' from $2))
               OR lower(trim(trailing '/' from COALESCE(source_url,'')))=lower(trim(trailing '/' from $2))
            ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,vendor_name
            LIMIT 10"#,
    )
    .bind(name)
    .bind(source)
    .fetch_all(&state.db.pool)
    .await
    .map_err(db_error)?;
    Ok(rows
        .into_iter()
        .map(|row| {
            json!({
                "vendor_id":row.get::<String,_>("vendor_id"),
                "vendor_slug":row.get::<String,_>("vendor_slug"),
                "vendor_name":row.get::<String,_>("vendor_name"),
                "category":row.get::<String,_>("category"),
                "service_area":row.get::<String,_>("service_area"),
                "status":row.get::<String,_>("status"),
                "website_url":row.get::<Option<String>,_>("website_url")
            })
        })
        .collect())
}

fn slug_base(name: &str) -> String {
    let mut slug = String::new();
    let mut dash = false;
    for character in name.to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    format!(
        "celebrant-{}",
        if slug.is_empty() { "listing" } else { slug }
    )
}

async fn preview_listing_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers, "celebrant-listing-preview").await?;
    let request: ListingRequest = body(request).await?;
    let (name, source, area) = listing_input(&request)?;
    let duplicates = duplicates(&state, &name, &source).await?;
    Ok(Json(json!({
        "candidate":{
            "vendor_name":name,"category":"Celebrant","service_area":area,
            "source_url":source,"status":"hidden","claim_status":"unclaimed"
        },
        "duplicates":duplicates,
        "can_create":duplicates.is_empty(),
        "official_register_url":OFFICIAL_REGISTER_URL,
        "previewed_by":user.id,
        "notice":"This is a minimal unpublished preview. It does not verify, claim or publish the celebrant."
    })))
}

async fn create_listing_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers, "celebrant-listing-create").await?;
    let request: ListingRequest = body(request).await?;
    if request.confirm_unpublished != Some(true) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Confirm the unpublished listing preview first.".into(),
        ));
    }
    let (name, source, area) = listing_input(&request)?;
    let lock_key = format!(
        "celebrant-listing:{}:{}",
        name.to_ascii_lowercase(),
        source.to_ascii_lowercase()
    );
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(&lock_key)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let duplicate = sqlx::query_scalar::<_, String>(
        "SELECT vendor_id FROM wedding_vendors WHERE lower(vendor_name)=lower($1) OR lower(trim(trailing '/' from COALESCE(website_url,'')))=lower(trim(trailing '/' from $2)) OR lower(trim(trailing '/' from COALESCE(source_url,'')))=lower(trim(trailing '/' from $2)) LIMIT 1",
    )
    .bind(&name)
    .bind(&source)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    if duplicate.is_some() {
        return Err((
            StatusCode::CONFLICT,
            "A matching vendor already exists. Open that record instead.".into(),
        ));
    }
    let vendor_id = format!("vendor_{}", Ulid::new().to_string().to_ascii_lowercase());
    let slug = format!(
        "{}-{}",
        slug_base(&name),
        &Ulid::new().to_string().to_ascii_lowercase()[..6]
    );
    sqlx::query(
        r#"INSERT INTO wedding_vendors
             (vendor_id,vendor_slug,vendor_name,category,service_area,website_url,source_url,
              source_label,status,claim_status,evidence,created_by_user_id,updated_by_user_id)
           VALUES($1,$2,$3,'Celebrant',$4,$5,$5,'Operator-provided source','hidden','unclaimed',$6,$7,$7)"#,
    )
    .bind(&vendor_id)
    .bind(&slug)
    .bind(&name)
    .bind(&area)
    .bind(&source)
    .bind(json!({
        "kind":"minimal_celebrant_listing",
        "source_url":source,
        "publication_status":"unpublished",
        "register_status":"pending"
    }))
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "INSERT INTO wedding_celebrant_pilot_profiles(vendor_id) VALUES($1) ON CONFLICT DO NOTHING",
    )
    .bind(&vendor_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "INSERT INTO wedding_celebrant_management_events(event_id,vendor_id,event_kind,dedupe_key,metadata) VALUES($1,$2,'listing_created',$3,$4)",
    )
    .bind(Ulid::new().to_string())
    .bind(&vendor_id)
    .bind(format!("listing-created-{vendor_id}"))
    .bind(json!({"status":"hidden","source_url":source}))
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(json!({
        "vendor_id":vendor_id,"vendor_slug":slug,"vendor_name":name,
        "status":"hidden","claim_status":"unclaimed","register_status":"pending",
        "notice":"The minimal listing is unpublished. Verification, claim and publication remain separate decisions."
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimal_slug_is_bounded_to_a_celebrant_namespace() {
        assert_eq!(slug_base("  Alex & Sam!  "), "celebrant-alex-sam");
        assert_eq!(slug_base("!!!"), "celebrant-listing");
    }
}
