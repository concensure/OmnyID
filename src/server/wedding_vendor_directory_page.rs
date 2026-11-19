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
    category: Option<String>,
}

#[derive(Debug)]
struct PublicVendorPageRow {
    vendor_id: String,
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
    contact_phone: Option<String>,
    contact_email: Option<String>,
    strengths: Vec<String>,
    ceremony_types: Vec<String>,
    photo_url: Option<String>,
    photo_alt: Option<String>,
    register_status: String,
    consultation_live: bool,
    consultation_next_date: Option<chrono::NaiveDate>,
    consultation_next_weekday: Option<i16>,
    consultation_next_time: Option<chrono::NaiveTime>,
    review_count: i64,
    scored_review_count: i64,
    review_average: Option<String>,
}

async fn directory_page_http(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DirectoryPageQuery>,
) -> Result<Html<String>, (StatusCode, String)> {
    let search = query
        .q
        .map(|value| value.trim().chars().take(120).collect::<String>())
        .filter(|value| !value.is_empty());
    let category = query
        .category
        .map(|value| value.trim().chars().take(80).collect::<String>())
        .filter(|value| !value.is_empty());
    let rows = directory_rows(&state, search.as_deref(), category.as_deref()).await?;
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
    category: Option<&str>,
) -> Result<Vec<PublicVendorPageRow>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT v.vendor_id,v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
               CASE WHEN v.claim_status IN ('claimed','verified')
                    THEN CASE WHEN COALESCE((p.publication_visibility->>'website_url')::boolean,FALSE)
                              THEN NULLIF(p.published_public_contact->>'website_url','') END
                    ELSE COALESCE(NULLIF(p.published_public_contact->>'website_url',''),v.website_url) END AS website_url, v.claim_status,
               COALESCE(NULLIF(p.published_description,''),v.evidence #>> '{celebrant_profile,editorial_summary}','') AS owner_description,
               COALESCE(p.price_tier, '') AS price_tier,
               COALESCE(p.capacity_min, 0) AS capacity_min,
               COALESCE(p.capacity_max, 0) AS capacity_max,
               CASE WHEN v.claim_status IN ('claimed','verified')
                    THEN CASE WHEN COALESCE((p.publication_visibility->>'phone')::boolean,FALSE)
                              THEN NULLIF(p.published_public_contact->>'phone','') END
                    ELSE COALESCE(NULLIF(p.published_public_contact->>'phone',''),v.contact_phone) END AS contact_phone,
               CASE WHEN v.claim_status IN ('claimed','verified')
                    THEN CASE WHEN COALESCE((p.publication_visibility->>'email')::boolean,FALSE)
                              THEN NULLIF(p.published_public_contact->>'email','') END
                    ELSE COALESCE(NULLIF(p.published_public_contact->>'email',''),v.contact_email) END AS contact_email,
               ARRAY(SELECT jsonb_array_elements_text(COALESCE(v.evidence #> '{celebrant_profile,strengths}','[]'::jsonb))) AS strengths,
               ARRAY(SELECT jsonb_array_elements_text(COALESCE(v.evidence #> '{celebrant_profile,ceremony_types}','[]'::jsonb))) AS ceremony_types,
               photo.photo_url,photo.alt_text AS photo_alt,
               COALESCE(cp.register_status,'pending') AS register_status,
               EXISTS(SELECT 1 FROM wedding_celebrant_live_sessions live WHERE live.vendor_id=v.vendor_id AND live.paused_at IS NULL AND live.expires_at>NOW()+make_interval(mins=>COALESCE(cp.consultation_minutes,10)+COALESCE(cp.buffer_minutes,5)) AND (SELECT COUNT(*) FROM wedding_celebrant_callback_requests request WHERE request.live_session_id=live.session_id AND request.status IN ('waiting_acceptance','accepted') AND COALESCE(request.hold_expires_at,live.expires_at)>NOW())<live.call_cap) AS consultation_live,
               next_window.local_date AS consultation_next_date,next_window.weekday AS consultation_next_weekday,next_window.starts_at AS consultation_next_time
               ,(SELECT COUNT(*)::bigint FROM wedding_review_publications review WHERE review.vendor_id=v.vendor_id AND review.status='published') AS review_count
               ,(SELECT COUNT(*)::bigint FROM wedding_review_publications review WHERE review.vendor_id=v.vendor_id AND review.status='published' AND review.aggregate_eligible AND review.rating IS NOT NULL) AS scored_review_count
               ,(SELECT ROUND(AVG(review.rating)::numeric,1)::text FROM wedding_review_publications review WHERE review.vendor_id=v.vendor_id AND review.status='published' AND review.aggregate_eligible AND review.rating IS NOT NULL) AS review_average
        FROM wedding_vendors v
        LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
        LEFT JOIN wedding_celebrant_pilot_profiles cp ON cp.vendor_id=v.vendor_id
        LEFT JOIN LATERAL (SELECT photo_url,alt_text FROM wedding_vendor_photos WHERE vendor_id=v.vendor_id ORDER BY slot LIMIT 1) photo ON TRUE
        LEFT JOIN LATERAL (
          SELECT w.local_date,w.weekday,w.starts_at FROM wedding_celebrant_consultation_windows w
          WHERE w.vendor_id=v.vendor_id AND w.enabled AND w.window_kind IN ('recurring','exception_open') AND (w.local_date IS NULL OR w.local_date >= (NOW() AT TIME ZONE 'Australia/Sydney')::date)
          ORDER BY COALESCE(w.local_date,(NOW() AT TIME ZONE 'Australia/Sydney')::date + ((w.weekday-EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'Australia/Sydney')::int+7)%7)),w.starts_at LIMIT 1
        ) next_window ON TRUE
        WHERE v.status = 'active'
          AND ($1::TEXT IS NULL OR strpos(lower(v.vendor_name),lower($1))>0
               OR strpos(lower(v.category),lower($1))>0
               OR strpos(lower(v.service_area),lower($1))>0)
          AND ($1::TEXT IS NOT NULL OR lower(trim(v.category))<>'celebrant'
               OR v.claim_status IN ('claimed','verified')
               OR lower(concat_ws(' ',p.published_description,array_to_string(p.styles,' '),
                    v.evidence #>> '{celebrant_profile,editorial_summary}',
                    v.evidence #>> '{celebrant_profile,strengths}',
                    v.evidence #>> '{celebrant_profile,ceremony_types}')) ~ '(elop|micro[ -]?wedding)')
          AND ($2::TEXT IS NULL OR lower(v.category)=lower($2))
        ORDER BY CASE v.claim_status WHEN 'verified' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END,
                 v.vendor_name ASC
        LIMIT 500
        "#,
    )
    .bind(search)
    .bind(category)
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
        SELECT v.vendor_id,v.vendor_slug, v.vendor_name, v.category, v.service_area, v.address,
               CASE WHEN v.claim_status IN ('claimed','verified')
                    THEN CASE WHEN COALESCE((p.publication_visibility->>'website_url')::boolean,FALSE)
                              THEN NULLIF(p.published_public_contact->>'website_url','') END
                    ELSE COALESCE(NULLIF(p.published_public_contact->>'website_url',''),v.website_url) END AS website_url, v.claim_status,
               COALESCE(NULLIF(p.published_description,''),v.evidence #>> '{celebrant_profile,editorial_summary}','') AS owner_description,
               COALESCE(p.price_tier, '') AS price_tier,
               COALESCE(p.capacity_min, 0) AS capacity_min,
               COALESCE(p.capacity_max, 0) AS capacity_max,
               CASE WHEN v.claim_status IN ('claimed','verified')
                    THEN CASE WHEN COALESCE((p.publication_visibility->>'phone')::boolean,FALSE)
                              THEN NULLIF(p.published_public_contact->>'phone','') END
                    ELSE COALESCE(NULLIF(p.published_public_contact->>'phone',''),v.contact_phone) END AS contact_phone,
               CASE WHEN v.claim_status IN ('claimed','verified')
                    THEN CASE WHEN COALESCE((p.publication_visibility->>'email')::boolean,FALSE)
                              THEN NULLIF(p.published_public_contact->>'email','') END
                    ELSE COALESCE(NULLIF(p.published_public_contact->>'email',''),v.contact_email) END AS contact_email,
               ARRAY(SELECT jsonb_array_elements_text(COALESCE(v.evidence #> '{celebrant_profile,strengths}','[]'::jsonb))) AS strengths,
               ARRAY(SELECT jsonb_array_elements_text(COALESCE(v.evidence #> '{celebrant_profile,ceremony_types}','[]'::jsonb))) AS ceremony_types,
               photo.photo_url,photo.alt_text AS photo_alt,
               COALESCE(cp.register_status,'pending') AS register_status,
               EXISTS(SELECT 1 FROM wedding_celebrant_live_sessions live WHERE live.vendor_id=v.vendor_id AND live.paused_at IS NULL AND live.expires_at>NOW()+make_interval(mins=>COALESCE(cp.consultation_minutes,10)+COALESCE(cp.buffer_minutes,5)) AND (SELECT COUNT(*) FROM wedding_celebrant_callback_requests request WHERE request.live_session_id=live.session_id AND request.status IN ('waiting_acceptance','accepted') AND COALESCE(request.hold_expires_at,live.expires_at)>NOW())<live.call_cap) AS consultation_live,
               next_window.local_date AS consultation_next_date,next_window.weekday AS consultation_next_weekday,next_window.starts_at AS consultation_next_time
               ,(SELECT COUNT(*)::bigint FROM wedding_review_publications review WHERE review.vendor_id=v.vendor_id AND review.status='published') AS review_count
               ,(SELECT COUNT(*)::bigint FROM wedding_review_publications review WHERE review.vendor_id=v.vendor_id AND review.status='published' AND review.aggregate_eligible AND review.rating IS NOT NULL) AS scored_review_count
               ,(SELECT ROUND(AVG(review.rating)::numeric,1)::text FROM wedding_review_publications review WHERE review.vendor_id=v.vendor_id AND review.status='published' AND review.aggregate_eligible AND review.rating IS NOT NULL) AS review_average
        FROM wedding_vendors v
        LEFT JOIN wedding_vendor_owner_profile p ON p.vendor_id = v.vendor_id
        LEFT JOIN wedding_celebrant_pilot_profiles cp ON cp.vendor_id=v.vendor_id
        LEFT JOIN LATERAL (SELECT photo_url,alt_text FROM wedding_vendor_photos WHERE vendor_id=v.vendor_id ORDER BY slot LIMIT 1) photo ON TRUE
        LEFT JOIN LATERAL (
          SELECT w.local_date,w.weekday,w.starts_at FROM wedding_celebrant_consultation_windows w
          WHERE w.vendor_id=v.vendor_id AND w.enabled AND w.window_kind IN ('recurring','exception_open') AND (w.local_date IS NULL OR w.local_date >= (NOW() AT TIME ZONE 'Australia/Sydney')::date)
          ORDER BY COALESCE(w.local_date,(NOW() AT TIME ZONE 'Australia/Sydney')::date + ((w.weekday-EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'Australia/Sydney')::int+7)%7)),w.starts_at LIMIT 1
        ) next_window ON TRUE
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
        vendor_id: row.get("vendor_id"),
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
        contact_phone: row.try_get("contact_phone").ok().flatten(),
        contact_email: row.try_get("contact_email").ok().flatten(),
        strengths: row.get("strengths"),
        ceremony_types: row.get("ceremony_types"),
        photo_url: row.try_get("photo_url").ok().flatten(),
        photo_alt: row.try_get("photo_alt").ok().flatten(),
        register_status: row.get("register_status"),
        consultation_live: row.get("consultation_live"),
        consultation_next_date: row.try_get("consultation_next_date").ok().flatten(),
        consultation_next_weekday: row.try_get("consultation_next_weekday").ok().flatten(),
        consultation_next_time: row.try_get("consultation_next_time").ok().flatten(),
        review_count: row.get("review_count"),
        scored_review_count: row.get("scored_review_count"),
        review_average: row.try_get("review_average").ok().flatten(),
    }
}

fn directory_card(vendor: &PublicVendorPageRow) -> String {
    let status = match vendor.claim_status.as_str() {
        "verified" => "Verified owner",
        "claimed" => "Claimed by owner",
        _ => "Unclaimed listing",
    };
    let description = (!vendor.description.trim().is_empty())
        .then(|| {
            format!(
                "<p class=\"vendor-summary\">{}</p>",
                escape_html(&vendor.description)
            )
        })
        .unwrap_or_default();
    let strengths = chips(&vendor.strengths, 3, "Strength");
    let ceremonies = chips(&vendor.ceremony_types, 4, "Ceremony type");
    let consultation = vendor
        .category
        .eq_ignore_ascii_case("celebrant")
        .then(|| {
            format!(
                "<p class=\"consultation-status\">{}</p>",
                escape_html(&consultation_label(vendor))
            )
        })
        .unwrap_or_default();
    let talk = vendor.category.eq_ignore_ascii_case("celebrant").then(|| format!(
        "<a class=\"btn btn-outline\" href=\"/wedding/talk-to-a-celebrant.html?vendor={}\">Talk for 10 minutes</a>",escape_html(&vendor.slug)
    )).unwrap_or_default();
    let reviews = review_summary(vendor);
    format!(
        "<article class=\"vendor-card\">{}<div class=\"vendor-card-body\"><span class=\"vendor-badge\">{}</span><h3>{}</h3><p class=\"vendor-meta\">{} · {}</p>{}<div class=\"vendor-chip-list\">{}{}</div>{}<p class=\"vendor-review-line\">{}</p><p class=\"vendor-price-line\"><strong>Pricing:</strong> Ask for a current, date-specific quote</p><div class=\"vendor-card-actions\"><a class=\"btn btn-primary\" href=\"/wedding/directory/{}\">View details</a>{}</div></div></article>",
        profile_media(vendor),
        status,
        escape_html(&vendor.name),
        escape_html(&vendor.category),
        escape_html(&vendor.service_area),
        description,
        strengths,
        ceremonies,
        consultation,
        escape_html(&reviews),
        escape_html(&vendor.slug),
        talk,
    )
}

fn review_summary(vendor: &PublicVendorPageRow) -> String {
    if vendor.review_count == 0 {
        return "No wedding reviews on OmnyID yet".into();
    }
    if vendor.scored_review_count >= 3 {
        if let Some(average) = vendor.review_average.as_deref() {
            return format!(
                "{average} out of 5 · {} wedding review{}",
                vendor.review_count,
                if vendor.review_count == 1 { "" } else { "s" }
            );
        }
    }
    format!(
        "{} wedding review{} · score shown after 3 eligible reviews",
        vendor.review_count,
        if vendor.review_count == 1 { "" } else { "s" }
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
    let telephone = vendor
        .contact_phone
        .as_deref()
        .and_then(crate::wedding_celebrant_consultation::phone_tel_href)
        .and_then(|value| value.strip_prefix("tel:").map(str::to_string));
    let schema = json!({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": vendor.name,
        "description": description,
        "areaServed": vendor.service_area,
        "address": address,
        "url": canonical,
        "sameAs": website,
        "telephone": telephone,
    })
    .to_string()
    .replace('<', "\\u003c");
    let address_html = address
        .map(|value| format!("<dt>Address</dt><dd>{}</dd>", escape_html(value)))
        .unwrap_or_default();
    let website_html = website
        .map(|value| format!("<a class=\"btn btn-outline\" href=\"{}\" rel=\"nofollow noopener\">Visit business website</a>", escape_html(value)))
        .unwrap_or_default();
    let phone_html = vendor
        .contact_phone
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            match crate::wedding_celebrant_consultation::phone_tel_href(value) {
                Some(href) => format!(
                    "<dt>Phone</dt><dd><a class=\"vendor-phone-link\" href=\"{}\" aria-label=\"Call {}\">{}</a></dd>",
                    escape_html(&href),
                    escape_html(&vendor.name),
                    escape_html(value)
                ),
                None => format!("<dt>Phone</dt><dd>{}</dd>", escape_html(value)),
            }
        })
        .unwrap_or_default();
    let email_html = vendor
        .contact_email
        .as_deref()
        .filter(|value| safe_public_email(value))
        .map(|value| {
            format!(
                "<dt>Email</dt><dd><a href=\"mailto:{}\">{}</a></dd>",
                escape_html(value),
                escape_html(value)
            )
        })
        .unwrap_or_default();
    let contact_actions = direct_contact_actions(vendor);
    let celebrant_details = vendor.category.eq_ignore_ascii_case("celebrant").then(|| format!(
        "<section class=\"vendor-profile-section\"><h2>Celebrant strengths</h2><div class=\"vendor-chip-list\">{}</div><h2>Ceremony types</h2><div class=\"vendor-chip-list\">{}</div><div class=\"consultation-panel\"><h2>10-minute phone consultation</h2><p>{}</p><a class=\"btn btn-primary\" href=\"/wedding/talk-to-a-celebrant.html?vendor={}\">Check consultation times</a></div></section>",
        chips(&vendor.strengths,12,"Strength"),chips(&vendor.ceremony_types,12,"Ceremony type"),escape_html(&consultation_label(vendor)),escape_html(&vendor.slug)
    )).unwrap_or_default();
    format!(
        r##"<!doctype html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{name} | OmnyID Weddings</title><meta name="description" content="{description}"><link rel="canonical" href="{canonical}"><meta property="og:type" content="website"><meta property="og:locale" content="en_AU"><meta property="og:url" content="{canonical}"><meta property="og:title" content="{name} | OmnyID Weddings"><meta property="og:description" content="{description}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{name} | OmnyID Weddings"><meta name="twitter:description" content="{description}"><link rel="stylesheet" href="/wedding/assets/css/style.css"><link rel="stylesheet" href="/wedding/assets/css/directory.css"><script type="application/ld+json">{schema}</script><script src="/wedding/assets/js/vendor-reviews.js" defer></script></head><body><a class="skip-link" href="#main">Skip to main content</a><header class="site-header"><div class="container header-inner"><a href="/wedding/" class="logo"><img class="logo-img" src="/wedding/assets/logo/omnyid-logo.png" alt="" width="102" height="40"><span>Weddings</span></a><a class="btn btn-outline" href="/wedding/vendors.html?category={category_query}">All {category_plural}</a></div></header><main id="main"><section class="directory-hero"><div class="container"><p class="eyebrow">{category} · {area}</p><div class="vendor-profile-hero">{media}<div><h1>{name}</h1><p>{description}</p></div></div></div></section><section class="directory-results"><div class="container vendor-profile-layout"><div><dl class="vendor-facts">{address}<dt>Service area</dt><dd>{area}</dd><dt>Capacity or coverage</dt><dd>{capacity}</dd><dt>Pricing basis</dt><dd>{price}</dd>{phone}{email}</dl>{celebrant_details}</div><aside><div class="hero-cta">{website}{contact_actions}<a class="btn btn-outline" href="/workspace/vendor.html?source=vendor_claim&amp;vendor_slug={slug}">Own this business? Claim this listing</a></div></aside></div><section id="weddingReviews" class="vendor-review-section" data-vendor-id="{vendor_id}" aria-labelledby="weddingReviewsHeading"><div class="vendor-review-heading"><h2 id="weddingReviewsHeading">Wedding reviews</h2><label>Order <select id="weddingReviewOrder"><option value="recent">Most recent</option><option value="rating_high">Rating: high to low</option><option value="rating_low">Rating: low to high</option></select></label></div><p id="weddingReviewStatus">{review_summary}</p><div id="weddingReviewList"></div></section><p class="vendor-directory-note">Profile details are an evidence-backed starting point, not a compatibility score. Confirm the date, fee, inclusions and terms directly before booking. Photographs appear only after the vendor or rights holder grants OmnyID permission.</p></div></section></main><script src="/wedding/assets/js/wedding-agent.js?v=20261119-377" defer></script></body></html>"##,
        name = escape_html(&vendor.name),
        description = escape_html(&description),
        canonical = canonical,
        schema = schema,
        category = escape_html(&vendor.category),
        category_query = escape_html(&vendor.category),
        category_plural = if vendor.category.eq_ignore_ascii_case("celebrant") {
            "celebrants"
        } else {
            "vendors"
        },
        area = escape_html(&vendor.service_area),
        media = profile_media(vendor),
        address = address_html,
        capacity = escape_html(&capacity),
        price = escape_html(price),
        website = website_html,
        contact_actions = contact_actions,
        phone = phone_html,
        email = email_html,
        celebrant_details = celebrant_details,
        slug = escape_html(&vendor.slug),
        vendor_id = escape_html(&vendor.vendor_id),
        review_summary = escape_html(&review_summary(vendor)),
    )
}

fn direct_contact_actions(vendor: &PublicVendorPageRow) -> String {
    let mut actions = Vec::new();
    if let Some(email) = vendor
        .contact_email
        .as_deref()
        .filter(|value| safe_public_email(value))
    {
        actions.push(format!(
            "<a class=\"btn btn-primary\" href=\"mailto:{}?subject=Wedding%20enquiry%20via%20OmnyID\">Start an email enquiry</a>",
            escape_html(email)
        ));
    }
    if let Some(href) = vendor
        .contact_phone
        .as_deref()
        .and_then(crate::wedding_celebrant_consultation::phone_tel_href)
    {
        actions.push(format!(
            "<a class=\"btn btn-outline\" href=\"{}\" aria-label=\"Call {}\">Call directly</a>",
            escape_html(&href),
            escape_html(&vendor.name)
        ));
    }
    if actions.is_empty() {
        return "<p class=\"vendor-directory-note\">This vendor has not published a direct email address or callable number. Use their business website if one is shown.</p>".to_string();
    }
    format!(
        "<p class=\"vendor-directory-note\">OmnyID enquiries are not open yet. Contact this vendor directly using their published details.</p>{}",
        actions.join("")
    )
}

fn chips(values: &[String], limit: usize, label: &str) -> String {
    values
        .iter()
        .filter(|value| !value.trim().is_empty())
        .take(limit)
        .map(|value| {
            format!(
                "<span class=\"vendor-chip\" title=\"{}\">{}</span>",
                escape_html(label),
                escape_html(value)
            )
        })
        .collect::<Vec<_>>()
        .join("")
}

fn initials(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|part| part.chars().next())
        .take(2)
        .flat_map(char::to_uppercase)
        .collect()
}

fn profile_media(vendor: &PublicVendorPageRow) -> String {
    match vendor
        .photo_url
        .as_deref()
        .filter(|value| safe_public_url(value))
    {
        Some(url) => {
            let fallback_alt = format!("{} profile", vendor.name);
            format!(
                "<img class=\"vendor-card-image\" src=\"{}\" alt=\"{}\" loading=\"lazy\">",
                escape_html(url),
                escape_html(vendor.photo_alt.as_deref().unwrap_or(&fallback_alt))
            )
        }
        None => format!(
            "<div class=\"vendor-card-placeholder\" role=\"img\" aria-label=\"{} has not supplied a licensed profile photograph yet\"><span>{}</span><small>Photo available after owner approval</small></div>",
            escape_html(&vendor.name),
            escape_html(&initials(&vendor.name))
        ),
    }
}

fn consultation_label(vendor: &PublicVendorPageRow) -> String {
    let enabled = std::env::var("OMNYID_CELEBRANT_CONSULTATIONS_ENABLED").as_deref() == Ok("true");
    if !enabled || vendor.register_status != "verified" {
        return "10-minute consultations are not open through OmnyID yet".into();
    }
    if vendor.consultation_live {
        return "Available now for a 10-minute phone consultation".into();
    }
    let time = vendor
        .consultation_next_time
        .map(|value| value.format("%-I:%M %p").to_string());
    match (
        vendor.consultation_next_date,
        vendor.consultation_next_weekday,
        time,
    ) {
        (Some(date), _, Some(time)) => format!(
            "Next 10-minute consultation: {} at {time}",
            date.format("%-d %b %Y")
        ),
        (_, Some(day), Some(time)) => format!(
            "Next listed 10-minute consultation: {} at {time}",
            [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday"
            ]
            .get((day - 1) as usize)
            .unwrap_or(&"A future day")
        ),
        _ => "No consultation time is listed yet".into(),
    }
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

fn safe_public_email(value: &str) -> bool {
    let value = value.trim();
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '@' | '.' | '_' | '+' | '-')
        })
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

    fn celebrant_with_contacts() -> PublicVendorPageRow {
        PublicVendorPageRow {
            vendor_id: "vendor-1".into(),
            slug: "sample-celebrant".into(),
            name: "Sample Celebrant".into(),
            category: "Celebrant".into(),
            service_area: "Sydney NSW".into(),
            address: None,
            website_url: Some("https://example.com".into()),
            claim_status: "verified".into(),
            description: "A sample public profile.".into(),
            price_tier: String::new(),
            capacity_min: 0,
            capacity_max: 0,
            contact_phone: Some("0491 570 006".into()),
            contact_email: Some("hello@example.com".into()),
            strengths: vec![],
            ceremony_types: vec![],
            photo_url: None,
            photo_alt: None,
            register_status: "pending".into(),
            consultation_live: false,
            consultation_next_date: None,
            consultation_next_weekday: None,
            consultation_next_time: None,
            review_count: 0,
            scored_review_count: 0,
            review_average: None,
        }
    }

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
        assert!(safe_public_email("hello+directory@example.com"));
        assert!(!safe_public_email("hello@example.com?subject=spoof"));
        assert!(!safe_public_email("hello\r\n@example.com"));
    }

    #[test]
    fn interim_enquiry_uses_published_email_and_portable_phone_actions() {
        let html = direct_contact_actions(&celebrant_with_contacts());
        assert!(html.contains("mailto:hello@example.com?subject=Wedding%20enquiry%20via%20OmnyID"));
        assert!(html.contains("href=\"tel:+61491570006\""));
        assert!(!html.contains("/workspace/"));
        assert!(html.contains("OmnyID enquiries are not open yet"));
    }

    #[test]
    fn interim_enquiry_is_truthful_when_no_contact_is_published() {
        let mut vendor = celebrant_with_contacts();
        vendor.contact_phone = None;
        vendor.contact_email = None;
        let html = direct_contact_actions(&vendor);
        assert!(html.contains("has not published"));
        assert!(!html.contains("Start an enquiry"));
    }
}
