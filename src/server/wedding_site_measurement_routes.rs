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
const MEASUREMENT_SCHEMA_VERSION: &str = "public-measurement.v1";
const EVENTS: &[&str] = &[
    "omnyid_landing_view",
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
    "public_page_performance",
    "public_page_interruption",
    "quiz_started",
    "quiz_completed",
    "quiz_shared",
    "partner_invite_accepted",
    "quiz_import_accepted",
    "suggestion_accepted",
    "profile_prefill_used",
    "import_fields_offered",
    "import_fields_accepted",
    "first_run_questions_skipped",
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
    "fields_offered",
    "fields_accepted",
    "fields_prefilled",
    "questions_skipped",
    "load_bucket",
    "lcp_bucket",
    "cls_bucket",
    "interruption_type",
];
const COUNT_PROP_KEYS: &[&str] = &[
    "fields_offered",
    "fields_accepted",
    "fields_prefilled",
    "questions_skipped",
];
const PERFORMANCE_BUCKETS: &[&str] = &["good", "needs_attention", "slow", "unknown"];
const INTERRUPTION_TYPES: &[&str] = &["script_error", "promise_rejection"];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/e", post(measurement_ingest_http))
        .route("/admin/wedding/site-stats", get(admin_site_stats_http))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

#[derive(Clone, Deserialize)]
struct MeasurementBatch {
    schema_version: String,
    visit_id: String,
    session: MeasurementSession,
    events: Vec<MeasurementEvent>,
}

#[derive(Clone, Deserialize)]
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

#[derive(Clone, Deserialize)]
struct MeasurementEvent {
    event_id: String,
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
    ((value == "/" || value == "/wedding" || value.starts_with("/wedding/"))
        && value.len() <= 120
        && !value.contains('?')
        && !value.contains('#'))
    .then(|| value.to_string())
}

fn bounded_event_id(value: &str) -> Option<String> {
    let value = value.trim();
    ((16..=32).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_alphanumeric()))
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
    for (key, value) in &props {
        if matches!(key.as_str(), "load_bucket" | "lcp_bucket" | "cls_bucket")
            && !matches!(value, Value::String(value) if PERFORMANCE_BUCKETS.contains(&value.as_str()))
        {
            return None;
        }
        if key == "interruption_type"
            && !matches!(value, Value::String(value) if INTERRUPTION_TYPES.contains(&value.as_str()))
        {
            return None;
        }
        if COUNT_PROP_KEYS.contains(&key.as_str())
            && !matches!(value, Value::Number(number) if number.as_u64().is_some_and(|count| count <= 300))
        {
            return None;
        }
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
    if batch.schema_version != MEASUREMENT_SCHEMA_VERSION
        || batch.visit_id.len() != 12
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
            event_id: bounded_event_id(&event.event_id)?,
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

    fn valid_batch() -> MeasurementBatch {
        MeasurementBatch {
            schema_version: MEASUREMENT_SCHEMA_VERSION.to_string(),
            visit_id: "a1b2c3d4e5f6".to_string(),
            session: MeasurementSession {
                utm_source: None,
                utm_medium: None,
                utm_campaign: None,
                utm_content: None,
                utm_term: None,
                intent: None,
                ad_click_present: false,
                referrer_class: Some("direct".to_string()),
                referrer_host: None,
                device_class: Some("mobile".to_string()),
                language: Some("en".to_string()),
                landing_path: "/".to_string(),
            },
            events: vec![MeasurementEvent {
                event_id: "a1b2c3d4e5f6g7h8".to_string(),
                event: "omnyid_landing_view".to_string(),
                page: "/".to_string(),
                props: Map::new(),
            }],
        }
    }

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

    #[test]
    fn measurement_contract_requires_stable_ids_and_approved_paths() {
        assert_eq!(MEASUREMENT_SCHEMA_VERSION, "public-measurement.v1");
        assert!(bounded_event_id("a1b2c3d4e5f6g7h8").is_some());
        assert!(bounded_event_id("too-short").is_none());
        assert!(bounded_event_id("personal@example.com").is_none());
        assert_eq!(bounded_path("/").as_deref(), Some("/"));
        assert_eq!(
            bounded_path("/wedding/blog/example.html").as_deref(),
            Some("/wedding/blog/example.html")
        );
        assert!(bounded_path("/pricing.html").is_none());
        assert!(bounded_path("/weddingevil").is_none());
    }

    #[test]
    fn batch_validation_fails_closed_on_schema_ids_paths_and_size() {
        assert!(validate_batch(valid_batch()).is_some());

        let mut wrong_schema = valid_batch();
        wrong_schema.schema_version = "public-measurement.v0".to_string();
        assert!(validate_batch(wrong_schema).is_none());

        let mut invalid_id = valid_batch();
        invalid_id.events[0].event_id = "short".to_string();
        assert!(validate_batch(invalid_id).is_none());

        let mut invalid_path = valid_batch();
        invalid_path.events[0].page = "/workspace/".to_string();
        assert!(validate_batch(invalid_path).is_none());

        let mut oversized = valid_batch();
        oversized.events = vec![oversized.events[0].clone(); MAX_EVENTS + 1];
        assert!(validate_batch(oversized).is_none());
    }

    #[test]
    fn privacy_and_bot_signals_remain_suppressed() {
        let mut privacy_headers = HeaderMap::new();
        privacy_headers.insert("sec-gpc", "1".parse().unwrap());
        assert!(privacy_signal(&privacy_headers));

        let mut bot_headers = HeaderMap::new();
        bot_headers.insert("user-agent", "ExampleCrawler/1.0".parse().unwrap());
        assert!(known_bot(&bot_headers));
    }

    #[test]
    fn profile_import_measurement_accepts_counts_and_rejects_fact_values() {
        for event in [
            "profile_prefill_used",
            "import_fields_offered",
            "import_fields_accepted",
            "first_run_questions_skipped",
        ] {
            assert!(EVENTS.contains(&event));
        }
        let mut counts = Map::new();
        counts.insert("fields_accepted".to_string(), Value::from(4));
        assert!(validated_props(counts).is_some());

        let mut leaked_fact = Map::new();
        leaked_fact.insert(
            "fields_accepted".to_string(),
            Value::String("wedding_date=2027-11-20".to_string()),
        );
        assert!(validated_props(leaked_fact).is_none());
    }

    #[test]
    fn performance_measurement_accepts_only_coarse_non_identifying_buckets() {
        let mut props = Map::new();
        props.insert("load_bucket".to_string(), Value::String("good".to_string()));
        props.insert(
            "lcp_bucket".to_string(),
            Value::String("needs_attention".to_string()),
        );
        props.insert("cls_bucket".to_string(), Value::String("slow".to_string()));
        assert!(validated_props(props).is_some());

        let mut leak = Map::new();
        leak.insert(
            "interruption_type".to_string(),
            Value::String("user@example.com".to_string()),
        );
        assert!(validated_props(leak).is_none());
    }
}
