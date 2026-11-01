/*
 * @module-id: rust.server.wedding-site-measurement-routes
 * @primary-capability: wedding.site-measurement
 * @locs-version: 2.0
 * @stability: draft
 * @owner: omnyid
 */

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::{Duration as ChronoDuration, Utc};
use serde::Deserialize;
use serde_json::{Map, Value};

use crate::db::{WeddingSiteEventWrite, WeddingSiteSessionWrite};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, enforce_rate_limit, public_rate_limit_key},
    cost_controls::operator_access_allowed,
    readiness_error_to_http,
};

const MAX_BODY_BYTES: usize = 4 * 1024;
const MAX_EVENTS: usize = 32;
const EVENTS: &[&str] = &[
    "wedding_landing_view",
    "wedding_context_selected",
    "wedding_context_changed",
    "wedding_demo_viewed",
    "wedding_demo_interacted",
    "wedding_demo_completed",
    "wedding_proof_expanded",
    "wedding_trust_detail_opened",
    "wedding_cta_clicked",
    "wedding_scroll_depth",
    "wedding_section_viewed",
    "wedding_binder_form_started",
    "wedding_binder_submitted",
    "wedding_binder_error",
    "wedding_newsletter_submitted",
    "wedding_signup_clicked",
    "wedding_quiz_entry_clicked",
    "wedding_engaged_time",
    "quiz_started",
    "quiz_completed",
    "quiz_shared",
    "partner_invite_accepted",
    "quiz_import_accepted",
    "suggestion_accepted",
];
const PROP_KEYS: &[&str] = &[
    "cta_id",
    "context",
    "error_type",
    "depth",
    "section_id",
    "seconds_bucket",
    "quiz_version",
    "animal_id",
    "suggestion_kind",
];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/e", post(measurement_ingest_http))
        .route("/admin/wedding/site-stats", get(admin_site_stats_http))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

#[derive(Deserialize)]
struct MeasurementBatch {
    visit_id: String,
    session: MeasurementSession,
    events: Vec<MeasurementEvent>,
}

#[derive(Deserialize)]
struct MeasurementSession {
    utm_source: Option<String>,
    utm_medium: Option<String>,
    utm_campaign: Option<String>,
    utm_content: Option<String>,
    utm_term: Option<String>,
    intent: Option<String>,
    #[serde(default)]
    ad_click_present: bool,
    referrer_class: Option<String>,
    referrer_host: Option<String>,
    device_class: Option<String>,
    language: Option<String>,
    landing_path: String,
}

#[derive(Deserialize)]
struct MeasurementEvent {
    event: String,
    page: String,
    #[serde(default)]
    props: Map<String, Value>,
}

#[derive(Deserialize)]
struct StatsQuery {
    from: Option<String>,
    to: Option<String>,
}

fn measurement_enabled() -> bool {
    std::env::var("OMNYID_WEDDING_MEASUREMENT_ENABLED")
        .ok()
        .is_some_and(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true"))
}

fn privacy_signal(headers: &HeaderMap) -> bool {
    ["dnt", "sec-gpc"].iter().any(|name| {
        headers
            .get(*name)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.trim() == "1")
    })
}

fn known_bot(headers: &HeaderMap) -> bool {
    let agent = headers
        .get("user-agent")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    ["bot", "crawler", "spider", "slurp"]
        .iter()
        .any(|needle| agent.contains(needle))
}

fn bounded_campaign(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    (!value.is_empty()
        && value.len() <= 40
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b" _-".contains(&byte)
        }))
    .then_some(value)
}

fn allowlisted(value: Option<String>, allowed: &[&str]) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    allowed.contains(&value.as_str()).then_some(value)
}

fn bounded_path(value: &str) -> Option<String> {
    let value = value.trim();
    (value.starts_with("/wedding")
        && value.len() <= 120
        && !value.contains('?')
        && !value.contains('#'))
    .then(|| value.to_string())
}

fn bounded_host(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    (!value.is_empty()
        && value.len() <= 100
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b".-".contains(&byte)
        }))
    .then_some(value)
}

fn validated_props(props: Map<String, Value>) -> Option<Value> {
    if props.len() > 6 || props.keys().any(|key| !PROP_KEYS.contains(&key.as_str())) {
        return None;
    }
    for value in props.values() {
        match value {
            Value::String(value) if value.len() <= 40 => {}
            Value::Number(value) if value.as_u64().is_some_and(|number| number <= 300) => {}
            Value::Bool(_) => {}
            _ => return None,
        }
    }
    Some(Value::Object(props))
}

fn validate_batch(
    batch: MeasurementBatch,
) -> Option<(WeddingSiteSessionWrite, Vec<WeddingSiteEventWrite>)> {
    if batch.visit_id.len() != 12
        || !batch
            .visit_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric())
        || batch.events.is_empty()
        || batch.events.len() > MAX_EVENTS
    {
        return None;
    }
    let landing_path = bounded_path(&batch.session.landing_path)?;
    let mut events = Vec::with_capacity(batch.events.len());
    for event in batch.events {
        if !EVENTS.contains(&event.event.as_str()) {
            return None;
        }
        events.push(WeddingSiteEventWrite {
            event: event.event,
            page: bounded_path(&event.page)?,
            props: validated_props(event.props)?,
        });
    }
    let session = WeddingSiteSessionWrite {
        visit_id: batch.visit_id,
        utm_source: bounded_campaign(batch.session.utm_source),
        utm_medium: bounded_campaign(batch.session.utm_medium),
        utm_campaign: bounded_campaign(batch.session.utm_campaign),
        utm_content: bounded_campaign(batch.session.utm_content),
        utm_term: bounded_campaign(batch.session.utm_term),
        intent: allowlisted(
            batch.session.intent,
            &["starting", "vendors", "guests", "final", "quiz", "dayof"],
        ),
        ad_click_present: batch.session.ad_click_present,
        referrer_class: allowlisted(
            batch.session.referrer_class,
            &["direct", "search", "social", "email", "internal", "other"],
        ),
        referrer_host: bounded_host(batch.session.referrer_host),
        device_class: allowlisted(batch.session.device_class, &["mobile", "tablet", "desktop"]),
        language: batch.session.language.and_then(|value| {
            let value = value.trim().to_ascii_lowercase();
            (value.len() == 2 && value.bytes().all(|byte| byte.is_ascii_lowercase()))
                .then_some(value)
        }),
        landing_path,
    };
    Some((session, events))
}

async fn measurement_ingest_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(batch): Json<MeasurementBatch>,
) -> Result<StatusCode, (StatusCode, String)> {
    if !measurement_enabled() || privacy_signal(&headers) || known_bot(&headers) {
        return Ok(StatusCode::NO_CONTENT);
    }
    let Some((session, events)) = validate_batch(batch) else {
        return Ok(StatusCode::NO_CONTENT);
    };
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_measurement", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    state
        .db
        .record_wedding_site_events(&session, &events)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn admin_site_stats_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<StatsQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator = authenticated_user(&state.db, &headers).await?;
    if !operator_access_allowed(&operator.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let to = query.to.unwrap_or_else(|| Utc::now().to_rfc3339());
    let from = query
        .from
        .unwrap_or_else(|| (Utc::now() - ChronoDuration::days(30)).to_rfc3339());
    if chrono::DateTime::parse_from_rfc3339(&from).is_err()
        || chrono::DateTime::parse_from_rfc3339(&to).is_err()
    {
        return Err((StatusCode::BAD_REQUEST, "Use RFC 3339 dates.".to_string()));
    }
    let stats = state
        .db
        .wedding_site_stats(&from, &to)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(stats))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_rejects_unknown_or_personal_properties() {
        let mut props = Map::new();
        props.insert(
            "email".to_string(),
            Value::String("person@example.com".to_string()),
        );
        assert!(validated_props(props).is_none());
    }

    #[test]
    fn campaign_fields_drop_urls_and_click_values() {
        assert_eq!(
            bounded_campaign(Some(" Paid_Social ".into())).as_deref(),
            Some("paid_social")
        );
        assert!(bounded_campaign(Some("https://example.com/?gclid=secret".into())).is_none());
    }

    #[test]
    fn event_allowlist_contains_only_bounded_quiz_events() {
        for event in [
            "quiz_started",
            "quiz_completed",
            "quiz_shared",
            "partner_invite_accepted",
            "quiz_import_accepted",
            "suggestion_accepted",
        ] {
            assert!(EVENTS.contains(&event));
        }
        assert!(!EVENTS.contains(&"quiz_answered"));
    }
}
