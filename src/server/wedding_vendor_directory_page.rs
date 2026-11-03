/*
 * @module-id: rust.server.wedding-vendor-directory-page
 * @primary-capability: wedding.public-vendor-directory-html
 * @locs-version: 1.0
 * @stability: active
 * @owner: omnyid
 */

//! Crawlable public Wedding vendor pages backed by the canonical vendor tables.
//! Client JavaScript may enhance these pages, but it is not the content authority.

use std::sync::Arc;

use axum::{
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::Html,
    routing::get,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use super::AppState;

const DIRECTORY_TEMPLATE: &str = include_str!("../../wedding/vendors.html");
const DIRECTORY_PLACEHOLDER: &str = "<!-- omnyid-server-vendors:start --><p class=\"vendor-empty\">Vendor profiles are loaded from OmnyID's live directory.</p><!-- omnyid-server-vendors:end -->";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/vendors.html", get(directory_page_http))
        .route("/wedding/directory/{slug}", get(vendor_page_http))
}

#[derive(Debug, Deserialize)]
struct DirectoryPageQuery {
    q: Option<String>,
}

#[derive(Debug)]
struct PublicVendorPageRow {
    slug: String,
    name: String,
    category: String,
    service_area: String,
    address: Option<String>,
    website_url: Option<String>,
    claim_status: String,
    description: String,
    price_tier: String,
    capacity_min: i32,
    capacity_max: i32,
}

async fn directory_page_http(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DirectoryPageQuery>,
) -> Result<Html<String>, (StatusCode, String)> {
    let search = query
        .q
        .map(|value| value.trim().chars().take(120).collect::<String>())
        .filter(|value| !value.is_empty());
    let rows = directory_rows(&state, search.as_deref()).await?;
    let cards = if rows.is_empty() {
        "<p class=\"vendor-empty\">No vendors matched that search yet. Try a business name, category or suburb.</p>".to_string()
    } else {
        rows.iter()
            .map(directory_card)
            .collect::<Vec<_>>()
            .join("\n")
    };
    let result_label = if rows.len() == 1 {
        "1 vendor found.".to_string()
    } else {
        format!("{} vendors found.", rows.len())
    };
    let html = DIRECTORY_TEMPLATE
        .replace(DIRECTORY_PLACEHOLDER, &cards)
        .replace("Loading vendors…", &escape_html(&result_label));
    Ok(Html(html))
}

async fn vendor_page_http(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
) -> Result<Html<String>, (StatusCode, String)> {
    if !valid_slug(&slug) {
        return Err((
            StatusCode::NOT_FOUND,
            "vendor listing not found".to_string(),
        ));
    }
    let row = vendor_row(&state, &slug).await?;
    Ok(Html(render_vendor_page(&row)))
}

async fn directory_rows(
    state: &AppState,
    search: Option<&str>,
) -> Result<Vec<PublicVendorPageRow>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
               v.website_url, v.claim_status,
               COALESCE(p.description, '') AS owner_description,
               COALESCE(p.price_tier, '') AS price_tier,
               COALESCE(p.capacity_min, 0) AS capacity_min,
               COALESCE(p.capacity_max, 0) AS capacity_max
        FROM wedding_vendors v
        LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
        WHERE v.status = 'active'
          AND ($1::TEXT IS NULL OR lower(v.vendor_name) LIKE '%' || lower($1) || '%'
               OR lower(v.category) LIKE '%' || lower($1) || '%'
               OR lower(v.service_area) LIKE '%' || lower($1) || '%')
        ORDER BY CASE v.claim_status WHEN 'verified' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END,
                 v.vendor_name ASC
        LIMIT 500
        "#,
    )
    .bind(search)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    Ok(rows.into_iter().map(page_row).collect())
}

async fn vendor_row(
    state: &AppState,
    slug: &str,
) -> Result<PublicVendorPageRow, (StatusCode, String)> {
    sqlx::query(
        r#"
        SELECT v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
               v.website_url, v.claim_status,
               COALESCE(p.description, '') AS owner_description,
               COALESCE(p.price_tier, '') AS price_tier,
               COALESCE(p.capacity_min, 0) AS capacity_min,
               COALESCE(p.capacity_max, 0) AS capacity_max
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
    .map(page_row)
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            "vendor listing not found".to_string(),
        )
    })
}

fn page_row(row: sqlx::postgres::PgRow) -> PublicVendorPageRow {
    PublicVendorPageRow {
        slug: row.get("vendor_slug"),
        name: row.get("vendor_name"),
        category: row.get("category"),
        service_area: row.get("service_area"),
        address: row.try_get("address").ok().flatten(),
        website_url: row.try_get("website_url").ok().flatten(),
        claim_status: row.get("claim_status"),
        description: row.get("owner_description"),
        price_tier: row.get("price_tier"),
        capacity_min: row.get("capacity_min"),
        capacity_max: row.get("capacity_max"),
    }
}

fn directory_card(vendor: &PublicVendorPageRow) -> String {
    let status = match vendor.claim_status.as_str() {
        "verified" => "Verified owner",
        "claimed" => "Claimed by owner",
        _ => "Unclaimed listing",
    };
    let description = if vendor.description.trim().is_empty() {
        String::new()
    } else {
        format!(
            "<p class=\"vendor-meta\">{}</p>",
            escape_html(&vendor.description)
        )
    };
    format!(
        "<article class=\"vendor-card\"><div class=\"vendor-card-body\"><span class=\"vendor-badge\">{}</span><h3>{}</h3><p class=\"vendor-meta\">{} · {}</p>{}<a class=\"btn btn-outline\" href=\"/wedding/directory/{}\">View vendor details</a></div></article>",
        status,
        escape_html(&vendor.name),
        escape_html(&vendor.category),
        escape_html(&vendor.service_area),
        description,
        escape_html(&vendor.slug),
    )
}

fn render_vendor_page(vendor: &PublicVendorPageRow) -> String {
    let canonical = format!("https://omnyid.com/wedding/directory/{}", vendor.slug);
    let description = if vendor.description.trim().is_empty() {
        format!(
            "{} is listed as a {} serving {}.",
            vendor.name, vendor.category, vendor.service_area
        )
    } else {
        vendor.description.clone()
    };
    let capacity = match (vendor.capacity_min, vendor.capacity_max) {
        (min, max) if min > 0 && max >= min => format!("{}–{} guests", min, max),
        _ => "Ask the vendor to confirm capacity".to_string(),
    };
    let price = if vendor.price_tier.trim().is_empty() {
        "Ask for current, date-specific pricing"
    } else {
        vendor.price_tier.as_str()
    };
    let address = vendor
        .address
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let website = vendor
        .website_url
        .as_deref()
        .filter(|value| safe_public_url(value));
    let schema = json!({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": vendor.name,
        "description": description,
        "areaServed": vendor.service_area,
        "address": address,
        "url": canonical,
        "sameAs": website,
    })
    .to_string()
    .replace('<', "\\u003c");
    let address_html = address
        .map(|value| format!("<dt>Address</dt><dd>{}</dd>", escape_html(value)))
        .unwrap_or_default();
    let website_html = website
        .map(|value| format!("<a class=\"btn btn-outline\" href=\"{}\" rel=\"nofollow noopener\">Visit business website</a>", escape_html(value)))
        .unwrap_or_default();
    format!(
        r##"<!doctype html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{name} | OmnyID Weddings</title><meta name="description" content="{description}"><link rel="canonical" href="{canonical}"><meta property="og:type" content="website"><meta property="og:locale" content="en_AU"><meta property="og:url" content="{canonical}"><meta property="og:title" content="{name} | OmnyID Weddings"><meta property="og:description" content="{description}"><link rel="stylesheet" href="/wedding/assets/css/style.css"><link rel="stylesheet" href="/wedding/assets/css/directory.css"><script type="application/ld+json">{schema}</script></head><body><a class="skip-link" href="#main">Skip to main content</a><header class="site-header"><div class="container header-inner"><a href="/wedding/" class="logo"><img class="logo-img" src="/wedding/assets/logo/omnyid-logo.png" alt="" width="102" height="40"><span>Weddings</span></a><a class="btn btn-outline" href="/wedding/vendors.html">All vendors</a></div></header><main id="main"><section class="directory-hero"><div class="container"><p class="eyebrow">{category} · {area}</p><h1>{name}</h1><p>{description}</p></div></section><section class="directory-results"><div class="container"><dl class="vendor-facts">{address}<dt>Capacity</dt><dd>{capacity}</dd><dt>Pricing</dt><dd>{price}</dd></dl><div class="hero-cta">{website}<a class="btn btn-primary" href="/workspace/?auth=register&amp;source=wedding_enquiry&amp;vendor={slug}">Start an enquiry</a><a class="btn btn-outline" href="/workspace/vendor.html?source=vendor_claim&amp;vendor_slug={slug}">Own this business? Claim this listing</a></div><p class="vendor-directory-note">Business identity does not prove availability, price or suitability. Confirm the date, capacity, package and terms directly before booking.</p></div></section></main></body></html>"##,
        name = escape_html(&vendor.name),
        description = escape_html(&description),
        canonical = canonical,
        schema = schema,
        category = escape_html(&vendor.category),
        area = escape_html(&vendor.service_area),
        address = address_html,
        capacity = escape_html(&capacity),
        price = escape_html(price),
        website = website_html,
        slug = escape_html(&vendor.slug),
    )
}

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn safe_public_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn database_failure(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(error = %error, "public Wedding vendor page query failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "vendor directory is temporarily unavailable".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_database_content_before_rendering() {
        assert_eq!(
            escape_html("<script>'x'</script>"),
            "&lt;script&gt;&#39;x&#39;&lt;/script&gt;"
        );
    }

    #[test]
    fn accepts_only_normalised_public_slugs_and_urls() {
        assert!(valid_slug("bejewelled-jewellery-mosman"));
        assert!(!valid_slug("../private"));
        assert!(safe_public_url("https://example.com/vendor"));
        assert!(!safe_public_url("javascript:alert(1)"));
    }
}
