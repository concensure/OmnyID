/*
 * @module-id: rust.server.wedding-binder-routes
 * @primary-capability: wedding.binder-delivery
 * @locs-version: 2.0
 * @stability: draft
 * @owner: omnyid
 */

use std::{collections::HashMap, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode},
    response::Html,
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::db::WeddingBinderAcquisition;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, enforce_rate_limit, public_rate_limit_key},
    cost_controls::operator_access_allowed,
    is_plausible_email, readiness_error_to_http,
};

const MAX_EMAIL_CHARS: usize = 254;
const MAX_BODY_BYTES: usize = 4 * 1024;
const CONSENT_VERSION: &str = "wedding-binder-tips-v1";
const FILLABLE_URL: &str = "https://omnyid.com/wedding/downloads/wedding-day-binder-fillable.pdf";
const PRINT_URL: &str = "https://omnyid.com/wedding/downloads/wedding-day-binder-print.pdf";
const COVER_URL: &str = "https://omnyid.com/wedding/downloads/binder-cover.jpg";
const PRIVACY_URL: &str = "https://omnyid.com/wedding/privacy.html";
const CONTINUE_URL: &str = "https://omnyid.com/workspace/?auth=register&source=wedding";
const TEXT_TEMPLATE: &str = include_str!("../../wedding/email/binder-email.txt");
const HTML_TEMPLATE: &str = include_str!("../../wedding/email/binder-email.html");

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/binder",
            get(binder_status_http).post(binder_request_http),
        )
        .route("/wedding/binder/confirm", get(binder_confirm_http))
        .route("/admin/wedding/binder", get(admin_binder_list_http))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

#[derive(Deserialize)]
struct BinderRequest {
    email: String,
    #[serde(default)]
    marketing_opt_in: bool,
    #[serde(default)]
    company: String,
    utm_source: Option<String>,
    utm_medium: Option<String>,
    utm_campaign: Option<String>,
    intent: Option<String>,
    referrer_class: Option<String>,
    device_class: Option<String>,
}

fn binder_enabled() -> bool {
    std::env::var("OMNYID_WEDDING_BINDER_ENABLED")
        .ok()
        .is_some_and(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true"))
}

fn bounded_campaign(value: Option<&str>) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 40
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b" _-".contains(&byte)
        })
    {
        return None;
    }
    Some(value)
}

fn allowlisted(value: Option<&str>, allowed: &[&str]) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    allowed.contains(&value.as_str()).then_some(value)
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn remove_or_unwrap_block(
    template: &str,
    start_marker: &str,
    end_marker: &str,
    include: bool,
) -> String {
    let Some(start) = template.find(start_marker) else {
        return template.to_string();
    };
    let Some(relative_end) = template[start..].find(end_marker) else {
        return template.to_string();
    };
    let end = start + relative_end + end_marker.len();
    if include {
        return format!(
            "{}{}{}",
            &template[..start],
            &template[start + start_marker.len()..start + relative_end],
            &template[end..]
        );
    }
    format!("{}{}", &template[..start], &template[end..])
}

fn render_binder_email(
    marketing_opt_in: bool,
    confirmation_token: Option<&str>,
) -> (String, String) {
    let confirm_url = confirmation_token
        .map(|token| {
            format!(
                "https://omnyid.com/wedding/binder/confirm?token={}",
                urlencoding::encode(token)
            )
        })
        .unwrap_or_default();
    let text = remove_or_unwrap_block(
        TEXT_TEMPLATE,
        "[MARKETING:START - include only if the visitor ticked \"planning tips\"]",
        "[MARKETING:END]",
        marketing_opt_in,
    );
    let html = remove_or_unwrap_block(
        HTML_TEMPLATE,
        "<!-- MARKETING:START (include only if the visitor ticked \"planning tips\") -->",
        "<!-- MARKETING:END -->",
        marketing_opt_in,
    );
    let replace = |template: String| {
        let mut rendered = template
            .replace("{{COVER_URL}}", COVER_URL)
            .replace("{{FILLABLE_URL}}", FILLABLE_URL)
            .replace("{{PRINT_URL}}", PRINT_URL)
            .replace("{{PRIVACY_URL}}", PRIVACY_URL)
            .replace("{{CONTINUE_URL}}", CONTINUE_URL)
            .replace("{{CONFIRM_URL}}", &confirm_url);
        for (index, link) in crate::wedding_quote_reading::VENUE_QUOTE_READING_LINKS
            .iter()
            .enumerate()
        {
            let number = index + 1;
            rendered = rendered
                .replace(&format!("{{{{READING_TITLE_{number}}}}}"), link.title)
                .replace(&format!("{{{{READING_URL_{number}}}}}"), link.url);
        }
        rendered
    };
    (replace(text), replace(html))
}

fn binder_response(email_status: &str, message: &str) -> Json<Value> {
    Json(json!({
        "status": "downloads_ready",
        "email_status": email_status,
        "message": message,
        "downloads": {
            "fillable": FILLABLE_URL,
            "print": PRINT_URL,
        },
        "continue_url": CONTINUE_URL,
    }))
}

async fn binder_status_http() -> Json<Value> {
    Json(json!({ "enabled": binder_enabled() }))
}

async fn binder_request_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<BinderRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !binder_enabled() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Binder email delivery is not available yet.".to_string(),
        ));
    }
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_binder", &headers),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if !request.company.trim().is_empty() {
        return Ok(Json(json!({ "status": "accepted" })));
    }
    let email = request.email.trim().to_ascii_lowercase();
    if email.len() > MAX_EMAIL_CHARS || !is_plausible_email(&email) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Please enter a valid email address.".to_string(),
        ));
    }

    let confirmation_token = request
        .marketing_opt_in
        .then(|| format!("{}{}", ulid::Ulid::new(), ulid::Ulid::new()).to_lowercase());
    let confirmation_hash = confirmation_token.as_deref().map(token_hash);
    let utm_source = bounded_campaign(request.utm_source.as_deref());
    let utm_medium = bounded_campaign(request.utm_medium.as_deref());
    let utm_campaign = bounded_campaign(request.utm_campaign.as_deref());
    let intent = allowlisted(
        request.intent.as_deref(),
        &["starting", "vendors", "guests", "final", "quiz", "dayof"],
    );
    let referrer_class = allowlisted(
        request.referrer_class.as_deref(),
        &["direct", "search", "social", "email", "internal", "other"],
    );
    let device_class = allowlisted(
        request.device_class.as_deref(),
        &["mobile", "tablet", "desktop"],
    );
    let prepared = state
        .db
        .prepare_wedding_binder_request(
            &email,
            request.marketing_opt_in,
            CONSENT_VERSION,
            confirmation_hash.as_deref(),
            WeddingBinderAcquisition {
                utm_source: utm_source.as_deref(),
                utm_medium: utm_medium.as_deref(),
                utm_campaign: utm_campaign.as_deref(),
                intent: intent.as_deref(),
                referrer_class: referrer_class.as_deref(),
                device_class: device_class.as_deref(),
            },
        )
        .await
        .map_err(readiness_error_to_http)?;
    let mut email_status = "recently_accepted";
    let mut message =
        "Your Binder links are ready below. A recent email request is already on its way.";
    if prepared.should_send {
        let (text_body, html_body) =
            render_binder_email(request.marketing_opt_in, confirmation_token.as_deref());
        let delivered = crate::gateway::smtp_out::send_transactional_multipart_email(
            &email,
            "Your Wedding Day Binder (free download)",
            &text_body,
            &html_body,
        )
        .await
        .is_ok();
        if let Some(request_id) = prepared.request_id {
            state
                .db
                .finish_wedding_binder_delivery(&request_id, delivered)
                .await
                .map_err(readiness_error_to_http)?;
        }
        if delivered {
            email_status = "provider_accepted";
            message =
                "Your Binder links are ready below, and the email provider accepted your message.";
        } else {
            email_status = "unavailable";
            message = "Your Binder links are ready below. We could not confirm the email send, so use these links now or try again.";
        }
    }
    Ok(binder_response(email_status, message))
}

async fn binder_confirm_http(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Html<String>, (StatusCode, String)> {
    let token = query.get("token").map(String::as_str).unwrap_or_default();
    if token.len() != 52 || !token.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
        return Err((
            StatusCode::NOT_FOUND,
            "Confirmation link not recognised.".to_string(),
        ));
    }
    let confirmed = state
        .db
        .confirm_wedding_binder_tips(&token_hash(token))
        .await
        .map_err(readiness_error_to_http)?;
    if !confirmed {
        return Err((
            StatusCode::NOT_FOUND,
            "Confirmation link not recognised.".to_string(),
        ));
    }
    Ok(Html(
        "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Planning tips confirmed</title><main style=\"max-width:38rem;margin:12vh auto;padding:2rem;font:18px/1.6 system-ui\"><h1>You’re confirmed</h1><p>We’ll send occasional wedding planning tips. You can unsubscribe from any message.</p><p><a href=\"/wedding/\">Return to OmnyID Weddings</a></p></main>".to_string(),
    ))
}

async fn admin_binder_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator = authenticated_user(&state.db, &headers).await?;
    if !operator_access_allowed(&operator.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let requests = state
        .db
        .list_wedding_binder_requests(5000)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!({ "requests": requests })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn campaign_values_are_bounded() {
        assert_eq!(
            bounded_campaign(Some(" Paid_Social ")).as_deref(),
            Some("paid_social")
        );
        assert!(bounded_campaign(Some("https://example.com/?secret=1")).is_none());
        assert!(bounded_campaign(Some(&"a".repeat(41))).is_none());
    }

    #[test]
    fn marketing_block_is_conditional_and_templates_are_complete() {
        let (plain, html) = render_binder_email(false, None);
        assert!(!plain.contains("confirm so we know"));
        assert!(!html.contains("Yes, send me planning tips"));
        assert!(!plain.contains("{{"));
        assert!(!html.contains("{{"));
        assert!(plain.contains("Continue in OmnyID Wedding"));
        assert!(html.contains("Continue in OmnyID Wedding"));
        for link in crate::wedding_quote_reading::VENUE_QUOTE_READING_LINKS {
            assert_eq!(plain.matches(link.url).count(), 1);
            assert_eq!(html.matches(link.url).count(), 1);
        }

        let (plain, html) = render_binder_email(true, Some(&"a".repeat(52)));
        assert!(plain.contains("confirm so we know"));
        assert!(html.contains("Yes, send me planning tips"));
        assert!(plain.contains("binder/confirm?token="));
        assert!(html.contains(&format!("binder/confirm?token={}", "a".repeat(52))));
        assert!(!html.contains("SAMPLE-TOKEN"));
    }

    #[test]
    fn confirmation_tokens_are_hashed_before_storage() {
        let token = "a".repeat(52);
        let digest = token_hash(&token);
        assert_eq!(digest.len(), 64);
        assert!(!digest.contains(&token));
    }
}
