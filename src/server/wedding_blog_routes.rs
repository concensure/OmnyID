/*
 * @module-id: rust.server.wedding-blog-routes
 * @primary-capability: durable-sanitized-wedding-blog-publishing
 * @locs-version: 1.0
 * @stability: draft
 * @owner: omnyid
 */

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::DefaultBodyLimit,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Html,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::{
    AppState, auth::authenticated_user, cost_controls::operator_access_allowed,
    readiness_error_to_http,
};

const MAX_HTML_BYTES: usize = 256 * 1024;
const CATEGORIES: &[&str] = &[
    "planning",
    "budget",
    "legal",
    "ai-trust",
    "vendors",
    "etiquette",
    "real-weddings",
];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/admin/wedding/blog-publications",
            post(admin_publish_http).layer(DefaultBodyLimit::max(MAX_HTML_BYTES + 32 * 1024)),
        )
        .route("/wedding/blog-publications", get(public_list_http))
        .route("/wedding/published/{slug}", get(public_article_http))
}

#[derive(Deserialize)]
struct PublishRequest {
    slug: String,
    title: String,
    summary: String,
    category: String,
    html: String,
    status: Option<String>,
}

fn clean_field(value: String, max: usize) -> String {
    let normalized = value
        .trim()
        .replace(['\r', '\n'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    normalized.chars().take(max).collect()
}

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

fn sanitized_article_fragment(input: &str) -> String {
    ammonia::Builder::default()
        .link_rel(Some("noopener noreferrer"))
        .clean(input)
        .to_string()
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

async fn admin_publish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PublishRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator = authenticated_user(&state.db, &headers).await?;
    if !operator_access_allowed(&operator.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let slug = request.slug.trim().to_ascii_lowercase();
    let title = clean_field(request.title, 140);
    let summary = clean_field(request.summary, 320);
    let category = request.category.trim().to_ascii_lowercase();
    let status = request.status.as_deref().unwrap_or("published").trim();
    if !valid_slug(&slug)
        || title.len() < 3
        || summary.len() < 10
        || !CATEGORIES.contains(&category.as_str())
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Check the slug, title, summary and category.".to_string(),
        ));
    }
    if !matches!(status, "draft" | "published") {
        return Err((
            StatusCode::BAD_REQUEST,
            "status must be draft or published".to_string(),
        ));
    }
    if request.html.trim().is_empty() || request.html.len() > MAX_HTML_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "HTML must be between 1 byte and 256 KiB.".to_string(),
        ));
    }
    let safe_html = sanitized_article_fragment(&request.html);
    if safe_html.trim().len() < 20 {
        return Err((
            StatusCode::BAD_REQUEST,
            "The article has no safe publishable content.".to_string(),
        ));
    }
    let content_sha256 = hex::encode(Sha256::digest(safe_html.as_bytes()));
    let record = state
        .db
        .upsert_wedding_blog_publication(
            &slug,
            &title,
            &summary,
            &category,
            &safe_html,
            &content_sha256,
            status,
            &operator.id,
        )
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!({
        "publication": record,
        "public_url": if status == "published" { Some(format!("/wedding/published/{slug}")) } else { None },
        "sanitization": "active content, event handlers and unsafe URLs removed",
    })))
}

async fn public_list_http(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let publications = state
        .db
        .list_published_wedding_blog_publications()
        .await
        .map_err(readiness_error_to_http)?;
    let items = publications
        .into_iter()
        .map(|item| {
            json!({
                "slug": item.slug,
                "title": item.title,
                "summary": item.summary,
                "category": item.category,
                "published_at": item.published_at,
                "revision": item.revision,
                "url": format!("/wedding/published/{}", item.slug),
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "publications": items })))
}

async fn public_article_http(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
) -> Result<Html<String>, (StatusCode, String)> {
    if !valid_slug(&slug) {
        return Err((StatusCode::NOT_FOUND, "Not found".to_string()));
    }
    let article = state
        .db
        .get_published_wedding_blog_publication(&slug)
        .await
        .map_err(readiness_error_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Not found".to_string()))?;
    let title = escape_html(&article.title);
    let summary = escape_html(&article.summary);
    Ok(Html(format!(
        r##"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — OmnyID Weddings</title><meta name="description" content="{summary}"><link rel="icon" href="/wedding/assets/logo/omnyid-mark.png"><link rel="stylesheet" href="/wedding/assets/css/style.css"></head><body><a class="skip-link" href="#main">Skip to main content</a><header class="site-header"><div class="container header-inner"><a href="/wedding/" class="logo"><img class="logo-img" src="/wedding/assets/logo/omnyid-logo.png" alt="" width="102" height="40"><span>Weddings</span></a><nav class="nav-links" aria-label="Main"><a href="/wedding/">Home</a><a href="/wedding/blog.html">Blog</a><a href="/wedding/disclosures.html">Disclosures</a></nav></div></header><main id="main"><article class="container article-body"><p class="eyebrow">{}</p><h1>{title}</h1><p class="lead">{summary}</p>{}</article></main></body></html>"##,
        escape_html(&article.category),
        article.sanitized_html
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_is_strict_and_path_safe() {
        assert!(valid_slug("how-to-plan-a-wedding"));
        assert!(!valid_slug("../admin"));
        assert!(!valid_slug("UPPER"));
        assert!(!valid_slug("two--dashes"));
    }

    #[test]
    fn sanitization_removes_active_content_and_handlers() {
        let safe = sanitized_article_fragment(
            r#"<h2>Hello</h2><img src="javascript:alert(1)" onerror="alert(2)"><script>alert(3)</script><p>Body copy</p>"#,
        );
        assert!(safe.contains("<h2>Hello</h2>"));
        assert!(safe.contains("Body copy"));
        assert!(!safe.contains("script"));
        assert!(!safe.contains("onerror"));
        assert!(!safe.contains("javascript:"));
    }
}
