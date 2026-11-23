// @module-id: server.public-contact-routes
// @primary-capability: bounded-public-contact-delivery
// @locs-version: 1.0

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};

use super::{
    AppState, RateLimitPolicy,
    auth::{enforce_rate_limit, public_rate_limit_key},
};

#[derive(Deserialize)]
struct ContactRequest {
    title: String,
    content: String,
    #[serde(default)]
    company: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/public/contact", post(contact_http))
        .layer(DefaultBodyLimit::max(8 * 1024))
}

fn clean(value: &str, limit: usize) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()
        && value.chars().count() <= limit
        && !value
            .chars()
            .any(|ch| ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t'))
    .then(|| value.to_string())
}

async fn contact_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ContactRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("public_contact", &headers),
        RateLimitPolicy {
            max_requests: 3,
            window: Duration::from_secs(10 * 60),
        },
    )
    .await?;
    if !request.company.trim().is_empty() {
        return Ok(Json(json!({"accepted": true})));
    }
    let title = clean(&request.title, 160)
        .ok_or((StatusCode::BAD_REQUEST, "Enter a short title.".to_string()))?;
    let content = clean(&request.content, 5_000)
        .filter(|value| value.chars().count() >= 10)
        .ok_or((
            StatusCode::BAD_REQUEST,
            "Enter at least 10 characters in the message.".to_string(),
        ))?;
    crate::gateway::smtp_out::send_transactional_email(
        "hello@omnyid.com",
        &format!("[OmnyID website] {title}"),
        &format!("Website contact form\n\nTitle: {title}\n\n{content}"),
    )
    .await
    .map_err(|error| {
        tracing::warn!(%error, "public contact delivery failed");
        (
            StatusCode::BAD_GATEWAY,
            "We could not send this message yet. Please try again shortly.".to_string(),
        )
    })?;
    Ok(Json(
        json!({"accepted": true, "message": "Your message was sent to OmnyID."}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contact_fields_are_bounded() {
        assert_eq!(clean(" Hello ", 20).as_deref(), Some("Hello"));
        assert!(clean(&"x".repeat(21), 20).is_none());
    }
}
