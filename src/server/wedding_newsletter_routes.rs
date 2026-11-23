/*
 * @module-id: rust.server.wedding-newsletter-routes
 * @primary-capability: wedding.newsletter-subscription
 * @locs-version: 2.0
 * @stability: draft
 * @owner: omnyid
 */

//! Public newsletter signup and one-click unsubscribe for the wedding marketing site,
//! plus the operator list used to email new blog posts to subscribers.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, enforce_rate_limit, public_rate_limit_key},
    cost_controls::operator_access_allowed,
    is_plausible_email, readiness_error_to_http,
};

const MAX_EMAIL_CHARS: usize = 254;
const TOKEN_CHARS: usize = 52;
const ADMIN_LIST_LIMIT: i64 = 5000;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/newsletter", post(newsletter_subscribe_http))
        .route(
            "/wedding/newsletter/unsubscribe",
            post(newsletter_unsubscribe_http),
        )
        .route("/admin/wedding/newsletter", get(admin_newsletter_list_http))
}

#[derive(Deserialize)]
struct NewsletterSubscribeRequest {
    email: String,
    source: Option<String>,
}

#[derive(Deserialize)]
struct NewsletterUnsubscribeRequest {
    token: String,
}

fn normalized_source(source: Option<&str>) -> &'static str {
    match source.map(str::trim) {
        Some("blog") => "wedding_blog",
        Some("home") => "wedding_home",
        _ => "wedding_site",
    }
}

fn valid_newsletter_email(email: &str) -> bool {
    email.len() <= MAX_EMAIL_CHARS && is_plausible_email(email)
}

fn valid_unsubscribe_token(token: &str) -> bool {
    token.len() == TOKEN_CHARS && token.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

async fn newsletter_subscribe_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<NewsletterSubscribeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_newsletter", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    if !valid_newsletter_email(&email) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Please enter a valid email address.".to_string(),
        ));
    }
    state
        .db
        .subscribe_wedding_newsletter(&email, normalized_source(request.source.as_deref()))
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!({ "status": "subscribed" })))
}

async fn newsletter_unsubscribe_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<NewsletterUnsubscribeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_newsletter_unsubscribe", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let token = request.token.trim();
    let found = valid_unsubscribe_token(token)
        && state
            .db
            .unsubscribe_wedding_newsletter(token)
            .await
            .map_err(readiness_error_to_http)?;
    if !found {
        return Err((
            StatusCode::NOT_FOUND,
            "This unsubscribe link was not recognised. Use the link from your latest email, or contact hello@omnyid.com."
                .to_string(),
        ));
    }
    Ok(Json(json!({ "status": "unsubscribed" })))
}

async fn admin_newsletter_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let list = state
        .db
        .list_wedding_newsletter_subscribers(ADMIN_LIST_LIMIT)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!(list)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_is_allowlisted() {
        assert_eq!(normalized_source(Some("blog")), "wedding_blog");
        assert_eq!(normalized_source(Some(" home ")), "wedding_home");
        assert_eq!(normalized_source(Some("<script>")), "wedding_site");
        assert_eq!(normalized_source(None), "wedding_site");
    }

    #[test]
    fn email_length_and_shape_are_checked() {
        assert!(valid_newsletter_email("a@b.co"));
        assert!(!valid_newsletter_email("not-an-email"));
        assert!(!valid_newsletter_email(&format!(
            "{}@example.com",
            "a".repeat(250)
        )));
    }

    #[test]
    fn unsubscribe_token_matches_generated_shape() {
        let generated = format!("{}{}", ulid::Ulid::new(), ulid::Ulid::new()).to_lowercase();
        assert!(valid_unsubscribe_token(&generated));
        assert!(!valid_unsubscribe_token("short"));
        assert!(!valid_unsubscribe_token(&"!".repeat(TOKEN_CHARS)));
    }
}
