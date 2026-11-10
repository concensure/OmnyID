/*
 * @module-id: rust.server.wedding-vendor-search-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(super) mod attribute_catalog;
mod canonical_resolution;
mod directory;
mod entity_merge;
mod photo_proxy;
mod providers;
mod receipt;
mod source_classification;
mod source_policy;
mod special_offer_evidence;

use super::*;
use crate::admin_tool_secrets::{
    BRAVE_SEARCH_SPEC, EXA_SEARCH_SPEC, GOOGLE_MAPS_SPEC, GOOGLE_PLACES_SPEC, WEATHER_API_SPEC,
    admin_tool_secret_status, resolve_admin_tool_secret,
};
use crate::db::{Db, WeddingVendorPhotoUpsertRecord, WeddingVendorUpsertRecord};
use crate::map_service::{MapService, PROVIDER_GOOGLE_MAPS, PROVIDER_OSM};
use crate::wedding_shared_tool_metering::{
    WeddingSharedToolFeature, WeddingSharedToolProvider, WeddingSharedToolUsageInput,
    record_wedding_shared_tool_usage,
};
use attribute_catalog::PendingAttribute;
use canonical_resolution::{EnrichInput, enrich_vendor_sources, write_pending_attributes};
use chrono::NaiveDate;
use directory::{directory_sources_cover_query, search_wedding_vendor_directory};
use photo_proxy::wedding_google_place_photo_http;
use providers::{search_brave, search_exa, search_google_places};
use receipt::merge_receipt;
use serde_json::Value;
use source_policy::WeddingVendorSourcePolicy;

#[derive(serde::Deserialize)]
struct WeddingVendorSearchRequest {
    workspace_id: Option<String>,
    wedding_plan_id: Option<String>,
    queries: Vec<WeddingVendorSearchQueryRequest>,
    max_results_per_query: Option<usize>,
    source_policy: Option<String>,
    material_fingerprint: Option<String>,
    ranking_policy_version: Option<String>,
    selected_date: Option<String>,
    guest_count: Option<u32>,
}

#[derive(serde::Deserialize, Clone)]
struct WeddingVendorSearchQueryRequest {
    provider_kind: String,
    category: Option<String>,
    query: String,
    google_place_types: Option<Vec<String>>,
    overpass_tags: Option<Vec<String>>,
}

#[derive(serde::Serialize, Clone, Default)]
struct WeddingVendorSearchSource {
    title: String,
    url: String,
    snippet: Option<String>,
    provider: String,
    website_url: Option<String>,
    map_url: Option<String>,
    photo_url: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    instagram_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vendor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    official_site_confidence: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    review_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    place_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attributes: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    availability: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rooms: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    limited_special: Option<Value>,
    #[serde(skip)]
    vendor_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    category: Option<String>,
    #[serde(skip)]
    service_area: Option<String>,
    #[serde(skip)]
    pending_attributes: Vec<PendingAttribute>,
}

#[derive(serde::Serialize)]
struct WeddingVendorSearchResponse {
    ok: bool,
    status: String,
    external_search_performed: bool,
    provider_label: Option<String>,
    query_count: usize,
    source_count: usize,
    queries: Vec<String>,
    sources: Vec<WeddingVendorSearchSource>,
    message: String,
    receipt_metadata: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct WeddingLiveEvidenceRequest {
    workspace_id: Option<String>,
    locations: Vec<String>,
    forecast_days: Option<u8>,
    include_weather: Option<bool>,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/vendor-search", post(wedding_vendor_search_http))
        .route(
            "/wedding/vendor-photo/google",
            get(wedding_google_place_photo_http),
        )
        .route("/wedding/live-evidence", post(wedding_live_evidence_http))
        .route(
            "/wedding/provider-capabilities",
            get(wedding_provider_capabilities_http),
        )
}

async fn wedding_provider_capabilities_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_provider_capabilities", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let _user = authenticated_user(&state.db, &headers).await?;
    Ok(Json(wedding_provider_capabilities_payload()))
}

fn wedding_provider_capabilities_payload() -> serde_json::Value {
    let brave = admin_tool_secret_status(BRAVE_SEARCH_SPEC);
    let exa = admin_tool_secret_status(EXA_SEARCH_SPEC);
    let places = admin_tool_secret_status(GOOGLE_PLACES_SPEC);
    let maps = admin_tool_secret_status(GOOGLE_MAPS_SPEC);
    let weatherapi = admin_tool_secret_status(WEATHER_API_SPEC);
    let brave_policy_enabled = admin_shared_tool_policy_enabled("brave-search-api");
    let exa_policy_enabled = admin_shared_tool_policy_enabled("exa-search-api");
    let places_policy_enabled = admin_shared_tool_policy_enabled("google-places-api");
    let maps_policy_enabled = admin_shared_tool_policy_enabled("google-maps-platform");
    let weatherapi_policy_enabled = admin_shared_tool_policy_enabled("weatherapi");
    let overpass_configured = std::env::var("OMNYID_OVERPASS_API_URL")
        .ok()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(true);
    let providers = vec![
        json!({
            "kind": "brave_search",
            "connectedAppId": "brave-search-api",
            "label": brave.label,
            "credentialRequired": true,
            "credentialConfigured": brave.configured,
            "sharedCreditEnabled": brave_policy_enabled,
            "configured": brave.configured && brave_policy_enabled,
            "verificationStatus": if brave.configured && brave_policy_enabled { "unverified" } else { "not_configured" },
            "diagnosticLabel": if brave.configured && brave_policy_enabled { Some("Configured server-side; verified when a live search runs.") } else { None },
            "sourceLabel": brave.source_label,
        }),
        json!({
            "kind": "exa_search",
            "connectedAppId": "exa-search-api",
            "label": exa.label,
            "credentialRequired": true,
            "credentialConfigured": exa.configured,
            "sharedCreditEnabled": exa_policy_enabled,
            "configured": exa.configured && exa_policy_enabled,
            "verificationStatus": if exa.configured && exa_policy_enabled { "unverified" } else { "not_configured" },
            "diagnosticLabel": if exa.configured && exa_policy_enabled { Some("Configured server-side as a semantic web-search fallback; verified when a live search runs.") } else { None },
            "sourceLabel": exa.source_label,
        }),
        json!({
            "kind": "google_places",
            "connectedAppId": "google-places-api",
            "label": places.label,
            "credentialRequired": true,
            "credentialConfigured": places.configured,
            "sharedCreditEnabled": places_policy_enabled,
            "configured": places.configured && places_policy_enabled,
            "verificationStatus": if places.configured && places_policy_enabled { "unverified" } else { "not_configured" },
            "diagnosticLabel": if places.configured && places_policy_enabled { Some("Configured server-side; if Google reports referer blocking, use a server-compatible Places key.") } else { None },
            "sourceLabel": places.source_label,
        }),
        json!({
            "kind": "google_maps",
            "connectedAppId": "google-maps-platform",
            "label": maps.label,
            "credentialRequired": true,
            "credentialConfigured": maps.configured,
            "sharedCreditEnabled": maps_policy_enabled,
            "configured": maps.configured && maps_policy_enabled,
            "verificationStatus": if maps.configured && maps_policy_enabled { "unverified" } else { "not_configured" },
            "diagnosticLabel": if maps.configured && maps_policy_enabled { Some("Configured server-side; verified when live evidence or map actions run.") } else { None },
            "sourceLabel": maps.source_label,
        }),
        json!({
            "kind": "weatherapi",
            "connectedAppId": "weatherapi",
            "label": weatherapi.label,
            "credentialRequired": true,
            "credentialConfigured": weatherapi.configured,
            "sharedCreditEnabled": weatherapi_policy_enabled,
            "configured": weatherapi.configured && weatherapi_policy_enabled,
            "verificationStatus": if weatherapi.configured && weatherapi_policy_enabled { "unverified" } else { "not_configured" },
            "diagnosticLabel": if weatherapi.configured && weatherapi_policy_enabled { Some("Configured server-side; verified when weather evidence runs.") } else { None },
            "sourceLabel": weatherapi.source_label,
        }),
        json!({
            "kind": "overpass",
            "connectedAppId": "overpass-api",
            "label": "OSM / Overpass API",
            "credentialRequired": false,
            "configured": overpass_configured,
            "sharedCreditEnabled": true,
            "verificationStatus": if overpass_configured { "unverified" } else { "not_configured" },
            "diagnosticLabel": if overpass_configured { Some("Open fallback configured; records may be sparse and are verified when search runs.") } else { None },
            "sourceLabel": if overpass_configured { Some("server-configured-or-public-default") } else { None },
        }),
    ];
    let connected_app_ids = providers
        .iter()
        .filter(|provider| provider["configured"].as_bool().unwrap_or(false))
        .filter_map(|provider| provider["connectedAppId"].as_str().map(str::to_string))
        .collect::<Vec<_>>();
    json!({
        "providers": providers,
        "connectedAppIds": connected_app_ids,
        "guardrails": [
            "Planner API keys are resolved server-side from admin/deployment secrets only.",
            "The browser receives redacted provider readiness and source receipts, never raw keys.",
            "Each admin-funded provider call is metered as wedding planner shared-tool usage."
        ],
    })
}

async fn wedding_live_evidence_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<WeddingLiveEvidenceRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_live_evidence", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let locations = req
        .locations
        .iter()
        .map(|location| location.trim())
        .filter(|location| !location.is_empty())
        .take(8)
        .collect::<Vec<_>>();
    if locations.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "at least one location is required".to_string(),
        ));
    }

    let google_maps_enabled = admin_shared_tool_policy_enabled("google-maps-platform");
    let map_service = MapService::from_env(Some(if google_maps_enabled {
        PROVIDER_GOOGLE_MAPS
    } else {
        PROVIDER_OSM
    }));
    let mut geocodes = Vec::new();
    let mut failures = Vec::new();
    if !google_maps_enabled {
        failures.push(
            "Google Maps Platform is not enabled for admin-funded wedding planner use; using OSM geocoding fallback."
                .to_string(),
        );
    }
    for location in &locations {
        match map_service.geocode(location).await {
            Ok(results) => {
                geocodes.push(json!({
                    "query": location,
                    "provider": map_service.provider_id(),
                    "results": results.into_iter().take(3).collect::<Vec<_>>(),
                    "sourceLabel": if map_service.provider_id() == PROVIDER_GOOGLE_MAPS {
                        admin_tool_secret_status(GOOGLE_MAPS_SPEC).source_label
                    } else {
                        Some("osm-public-provider".to_string())
                    },
                }));
            }
            Err(message) => failures.push(format!("{location}: {message}")),
        }
    }

    if map_service.provider_id() == PROVIDER_GOOGLE_MAPS && !geocodes.is_empty() {
        let _ = record_wedding_shared_tool_usage(
            &state.db,
            WeddingSharedToolUsageInput {
                user_id: user.id.clone(),
                provider: WeddingSharedToolProvider::GoogleMapsPlatform,
                feature: WeddingSharedToolFeature::MapsTravel,
                quantity: geocodes.len() as f64,
                estimated_cost_usd: 0.0,
                usage_unit: Some("requests".to_string()),
                wedding_plan_id: req.workspace_id.clone(),
                operation: Some("wedding_location_geocode".to_string()),
                provider_request_id: None,
                occurred_at: Some(chrono::Utc::now().to_rfc3339()),
            },
        )
        .await;
    }

    let mut weather = Vec::new();
    if req.include_weather.unwrap_or(true) {
        if !admin_shared_tool_policy_enabled("weatherapi") {
            failures.push(
                "WeatherAPI is not enabled for admin-funded wedding planner use.".to_string(),
            );
        } else if let Some(secret) = resolve_admin_tool_secret(WEATHER_API_SPEC) {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(12))
                .user_agent("OmnyID-WeddingPlanner/1.0")
                .build()
                .map_err(internal_http_error)?;
            let days = req.forecast_days.unwrap_or(3).clamp(1, 10).to_string();
            for location in &locations {
                match fetch_weatherapi_forecast(&client, &secret.secret, location, &days).await {
                    Ok(value) => weather.push(value),
                    Err(message) => failures.push(format!("{location}: {message}")),
                }
            }
            if !weather.is_empty() {
                let _ = record_wedding_shared_tool_usage(
                    &state.db,
                    WeddingSharedToolUsageInput {
                        user_id: user.id.clone(),
                        provider: WeddingSharedToolProvider::WeatherApi,
                        feature: WeddingSharedToolFeature::WeatherContingency,
                        quantity: weather.len() as f64,
                        estimated_cost_usd: 0.0,
                        usage_unit: Some("requests".to_string()),
                        wedding_plan_id: req.workspace_id.clone(),
                        operation: Some("wedding_weather_forecast".to_string()),
                        provider_request_id: None,
                        occurred_at: Some(chrono::Utc::now().to_rfc3339()),
                    },
                )
                .await;
            }
        } else {
            failures.push("WeatherAPI key is not configured.".to_string());
        }
    }

    Ok(Json(json!({
        "ok": !geocodes.is_empty() || !weather.is_empty(),
        "status": if failures.is_empty() { "verified" } else if !geocodes.is_empty() || !weather.is_empty() { "partial" } else { "blocked" },
        "locationsRequested": locations.len(),
        "geocodes": geocodes,
        "weather": weather,
        "failures": failures,
        "receiptMetadata": {
            "receipt_id": format!(
                "wedding_live_evidence:{}:{}",
                req.workspace_id.as_deref().unwrap_or("workspace"),
                Ulid::new()
            ),
            "workspace_id": req.workspace_id,
            "location_count": locations.len(),
            "geocode_count": geocodes.len(),
            "weather_count": weather.len(),
            "providers": [
                map_service.provider_id(),
                if req.include_weather.unwrap_or(true) { "weatherapi" } else { "weather_skipped" },
            ],
            "generated_at": chrono::Utc::now().to_rfc3339(),
        },
        "guardrails": [
            "Map and weather provider keys are resolved server-side from admin/deployment secrets only.",
            "Forecasts are evidence with timestamps, not guarantees.",
            "Travel times and geocodes must be rechecked near the event date before acting."
        ],
    })))
}

async fn fetch_weatherapi_forecast(
    client: &reqwest::Client,
    key: &str,
    location: &str,
    days: &str,
) -> Result<serde_json::Value, String> {
    let response = client
        .get("https://api.weatherapi.com/v1/forecast.json")
        .query(&[
            ("key", key),
            ("q", location),
            ("days", days),
            ("aqi", "no"),
            ("alerts", "yes"),
        ])
        .send()
        .await
        .map_err(|err| format!("WeatherAPI request failed: {err}"))?;
    if !response.status().is_success() {
        return Err(format!("WeatherAPI returned {}", response.status()));
    }
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("WeatherAPI response parse failed: {err}"))?;
    Ok(json!({
        "query": location,
        "provider": "weatherapi",
        "sourceLabel": admin_tool_secret_status(WEATHER_API_SPEC).source_label,
        "location": value.get("location").cloned().unwrap_or_else(|| json!({})),
        "current": value.get("current").cloned().unwrap_or_else(|| json!({})),
        "forecast": value
            .get("forecast")
            .and_then(|forecast| forecast.get("forecastday"))
            .cloned()
            .unwrap_or_else(|| json!([])),
        "alerts": value
            .get("alerts")
            .and_then(|alerts| alerts.get("alert"))
            .cloned()
            .unwrap_or_else(|| json!([])),
    }))
}

async fn wedding_vendor_search_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<WeddingVendorSearchRequest>,
) -> Result<Json<WeddingVendorSearchResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_vendor_search", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let requested_source_policy = WeddingVendorSourcePolicy::parse(req.source_policy.as_deref())
        .map_err(|message| (StatusCode::BAD_REQUEST, message.to_string()))?;
    let online_fallback_enabled = std::env::var("OMNYID_WEDDING_ONLINE_FALLBACK_ENABLED")
        .map(|value| {
            !matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "0" | "false" | "no" | "off"
            )
        })
        .unwrap_or(true);
    let source_policy = if online_fallback_enabled {
        requested_source_policy
    } else {
        WeddingVendorSourcePolicy::DirectoryOnly
    };
    let limit = req.max_results_per_query.unwrap_or(5).clamp(1, 8);
    let planned_queries = req
        .queries
        .into_iter()
        .filter(|query| !query.query.trim().is_empty())
        .take(8)
        .collect::<Vec<_>>();

    if planned_queries.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "at least one query is required".to_string(),
        ));
    }

    let categories = planned_queries
        .iter()
        .filter_map(|query| {
            query
                .category
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    let claim = req
        .material_fingerprint
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|fingerprint| {
            (
                req.wedding_plan_id.as_deref().map(str::trim).unwrap_or(""),
                categories
                    .iter()
                    .next()
                    .map(String::as_str)
                    .unwrap_or("uncategorised"),
                fingerprint,
                req.ranking_policy_version
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("1"),
            )
        });
    if let Some((plan_id, category, fingerprint, policy_version)) = claim {
        if plan_id.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                "wedding_plan_id is required with material_fingerprint".to_string(),
            ));
        }
        let acquired = state
            .db
            .claim_wedding_vendor_shortlist_run(
                &user.id,
                plan_id,
                category,
                fingerprint,
                policy_version,
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        if !acquired {
            return Err((StatusCode::CONFLICT, "This wedding vendor shortlist is already running or complete for the same material inputs.".to_string()));
        }
    }

    let mut sources = Vec::new();
    let mut provider_kinds = BTreeSet::new();
    let mut failed_messages = Vec::new();
    let mut provider_labels = BTreeSet::new();
    let mut metered_providers = BTreeSet::new();
    let mut external_search_performed = false;
    let mut paid_provider_queries_skipped_due_to_cache = 0usize;
    let mut attempted_provider_queries = BTreeSet::new();
    let mut provider_kinds_blocked_for_run = BTreeSet::new();
    let mut closed_places_filtered = 0usize;

    match search_wedding_vendor_directory(&state.db, &user.id, &planned_queries, limit).await {
        Ok(items) if !items.is_empty() => {
            provider_labels.insert("Admin vendor database".to_string());
            sources.extend(items);
        }
        Ok(_) => {}
        Err(err) => failed_messages.push(format!("Admin vendor database lookup failed: {err}")),
    }

    let selected_date = req
        .selected_date
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d"))
        .transpose()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "selected_date must use YYYY-MM-DD.".to_string(),
            )
        })?;
    let mut limited_special_count = 0usize;
    if let Some(date) = selected_date
        && special_offer_evidence::discovery_rollout_allowed(&user.email)
    {
        match special_offer_evidence::attach_active_special_evidence(
            &state.db,
            &mut sources,
            date,
            req.guest_count,
        )
        .await
        {
            Ok(count) => limited_special_count = count,
            Err(error) => {
                tracing::warn!(%error, "Limited-date Wedding evidence lookup failed");
                failed_messages
                    .push("Limited-date availability could not be checked just now.".to_string());
            }
        }
    }

    if source_policy == WeddingVendorSourcePolicy::DirectoryOnly {
        let directory_count = sources.len();
        if let Some((plan_id, category, fingerprint, policy_version)) = claim {
            state
                .db
                .complete_wedding_vendor_shortlist_run(
                    &user.id,
                    plan_id,
                    category,
                    fingerprint,
                    policy_version,
                    directory_count > 0,
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        return Ok(Json(WeddingVendorSearchResponse {
            ok: directory_count > 0,
            status: "cached".to_string(),
            external_search_performed: false,
            provider_label: if directory_count > 0 {
                Some("Admin vendor database".to_string())
            } else {
                None
            },
            query_count: planned_queries.len(),
            source_count: directory_count,
            queries: planned_queries
                .iter()
                .map(|query| query.query.clone())
                .collect(),
            sources,
            message: format!(
                "Directory-only vendor search returned {directory_count} source{}; online providers were not called.",
                if directory_count == 1 { "" } else { "s" }
            ),
            receipt_metadata: json!({
                "receipt_id": format!("wedding_vendor_search:directory:{}:{}", req.workspace_id.as_deref().unwrap_or("workspace"), Ulid::new()),
                "vendor_search_mode": "live",
                "vendor_search_status": "cached",
                "source_policy": source_policy.receipt_label(),
                "requested_source_policy": requested_source_policy.receipt_label(),
                "online_fallback_enabled": online_fallback_enabled,
                "directory_count": directory_count,
                "paid_calls_skipped": true,
                "fallback_reason": if directory_count >= 3 { "directory_pass_complete_or_requires_client_suitability_check" } else { "directory_shortfall_requires_client_orchestrated_online_pass" },
                "vendor_categories": categories.iter().cloned().collect::<Vec<_>>(),
                "external_search_performed": false,
                "failed_messages": failed_messages,
                "limited_special_evidence_count": limited_special_count,
            }),
        }));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("OmnyID-WeddingPlanner/1.0")
        .build()
        .map_err(internal_http_error)?;

    let mut tagged_upto = sources.len();
    let mut previous_query = None;
    for query in &planned_queries {
        tag_new_sources(&mut sources, &mut tagged_upto, previous_query);
        previous_query = Some(query);
        provider_kinds.insert(query.provider_kind.clone());
        if is_paid_vendor_search_provider(&query.provider_kind)
            && directory_sources_cover_query(&sources, query, limit)
        {
            paid_provider_queries_skipped_due_to_cache += 1;
            continue;
        }
        if provider_kinds_blocked_for_run.contains(&query.provider_kind) {
            continue;
        }
        if !attempted_provider_queries.insert(provider_query_attempt_key(
            &query.provider_kind,
            &query.query,
        )) {
            continue;
        }
        match query.provider_kind.as_str() {
            "google_places" if admin_shared_tool_policy_enabled("google-places-api") => {
                external_search_performed = true;
                match search_google_places(&client, query, limit, &mut closed_places_filtered).await
                {
                    Ok(items) => {
                        provider_labels.insert("Google Places API".to_string());
                        metered_providers.insert("google_places");
                        if items.is_empty() && sources.len() < limit {
                            if admin_shared_tool_policy_enabled("brave-search-api") {
                                let mut fallback_query = query.clone();
                                fallback_query.provider_kind = "brave_search".to_string();
                                if attempted_provider_queries.insert(provider_query_attempt_key(
                                    &fallback_query.provider_kind,
                                    &fallback_query.query,
                                )) {
                                    provider_kinds.insert(fallback_query.provider_kind.clone());
                                    match search_brave(&client, &fallback_query, limit, &mut failed_messages).await {
                                        Ok(fallback_items) => {
                                            provider_labels.insert("Brave Search".to_string());
                                            metered_providers.insert("brave_search");
                                            sources.extend(fallback_items);
                                        }
                                        Err(message) => failed_messages.push(format!(
                                            "Brave Search fallback after empty Google Places results failed: {message}"
                                        )),
                                    }
                                }
                            }
                            run_exa_vendor_search_fallback(
                                &client,
                                query,
                                limit,
                                &mut attempted_provider_queries,
                                &mut provider_kinds,
                                &mut provider_labels,
                                &mut metered_providers,
                                &mut sources,
                                &mut failed_messages,
                                "empty Google Places results",
                            )
                            .await;
                            run_overpass_vendor_search_fallback(
                                &client,
                                query,
                                limit,
                                &mut attempted_provider_queries,
                                &mut provider_kinds,
                                &mut provider_labels,
                                &mut sources,
                                &mut failed_messages,
                                "empty Google Places results",
                            )
                            .await;
                        }
                        sources.extend(items);
                    }
                    Err(message) => {
                        if provider_error_blocks_remaining_run_queries(&message) {
                            provider_kinds_blocked_for_run.insert(query.provider_kind.clone());
                        }
                        failed_messages.push(message);
                        if sources.len() < limit
                            && admin_shared_tool_policy_enabled("brave-search-api")
                        {
                            let mut fallback_query = query.clone();
                            fallback_query.provider_kind = "brave_search".to_string();
                            if attempted_provider_queries.insert(provider_query_attempt_key(
                                &fallback_query.provider_kind,
                                &fallback_query.query,
                            )) {
                                provider_kinds.insert(fallback_query.provider_kind.clone());
                                match search_brave(
                                    &client,
                                    &fallback_query,
                                    limit,
                                    &mut failed_messages,
                                )
                                .await
                                {
                                    Ok(items) => {
                                        provider_labels.insert("Brave Search".to_string());
                                        metered_providers.insert("brave_search");
                                        sources.extend(items);
                                    }
                                    Err(message) => failed_messages.push(format!(
                                        "Brave Search fallback also failed: {message}"
                                    )),
                                }
                            }
                        }
                        run_exa_vendor_search_fallback(
                            &client,
                            query,
                            limit,
                            &mut attempted_provider_queries,
                            &mut provider_kinds,
                            &mut provider_labels,
                            &mut metered_providers,
                            &mut sources,
                            &mut failed_messages,
                            "Google Places failure",
                        )
                        .await;
                        run_overpass_vendor_search_fallback(
                            &client,
                            query,
                            limit,
                            &mut attempted_provider_queries,
                            &mut provider_kinds,
                            &mut provider_labels,
                            &mut sources,
                            &mut failed_messages,
                            "Google Places failure",
                        )
                        .await;
                    }
                }
            }
            "google_places" => failed_messages.push(
                "Google Places API is not enabled for admin-funded wedding planner use."
                    .to_string(),
            ),
            "brave_search" if admin_shared_tool_policy_enabled("brave-search-api") => {
                external_search_performed = true;
                match search_brave(&client, query, limit, &mut failed_messages).await {
                    Ok(items) => {
                        provider_labels.insert("Brave Search".to_string());
                        metered_providers.insert("brave_search");
                        if items.is_empty() && sources.len() < limit {
                            run_exa_vendor_search_fallback(
                                &client,
                                query,
                                limit,
                                &mut attempted_provider_queries,
                                &mut provider_kinds,
                                &mut provider_labels,
                                &mut metered_providers,
                                &mut sources,
                                &mut failed_messages,
                                "empty Brave Search results",
                            )
                            .await;
                            run_overpass_vendor_search_fallback(
                                &client,
                                query,
                                limit,
                                &mut attempted_provider_queries,
                                &mut provider_kinds,
                                &mut provider_labels,
                                &mut sources,
                                &mut failed_messages,
                                "empty Brave Search results",
                            )
                            .await;
                        }
                        sources.extend(items);
                    }
                    Err(message) => {
                        if provider_error_blocks_remaining_run_queries(&message) {
                            provider_kinds_blocked_for_run.insert(query.provider_kind.clone());
                        }
                        failed_messages.push(message);
                        run_exa_vendor_search_fallback(
                            &client,
                            query,
                            limit,
                            &mut attempted_provider_queries,
                            &mut provider_kinds,
                            &mut provider_labels,
                            &mut metered_providers,
                            &mut sources,
                            &mut failed_messages,
                            "Brave Search failure",
                        )
                        .await;
                        run_overpass_vendor_search_fallback(
                            &client,
                            query,
                            limit,
                            &mut attempted_provider_queries,
                            &mut provider_kinds,
                            &mut provider_labels,
                            &mut sources,
                            &mut failed_messages,
                            "Brave Search failure",
                        )
                        .await;
                    }
                }
            }
            "brave_search" => failed_messages.push(
                "Brave Search API is not enabled for admin-funded wedding planner use.".to_string(),
            ),
            "exa_search" if admin_shared_tool_policy_enabled("exa-search-api") => {
                external_search_performed = true;
                match search_exa(&client, query, limit).await {
                    Ok(items) => {
                        provider_labels.insert("EXA Search API".to_string());
                        metered_providers.insert("exa_search");
                        if items.is_empty() && sources.len() < limit {
                            run_overpass_vendor_search_fallback(
                                &client,
                                query,
                                limit,
                                &mut attempted_provider_queries,
                                &mut provider_kinds,
                                &mut provider_labels,
                                &mut sources,
                                &mut failed_messages,
                                "empty EXA Search results",
                            )
                            .await;
                        }
                        sources.extend(items);
                    }
                    Err(message) => {
                        if provider_error_blocks_remaining_run_queries(&message) {
                            provider_kinds_blocked_for_run.insert(query.provider_kind.clone());
                        }
                        failed_messages.push(message);
                        run_overpass_vendor_search_fallback(
                            &client,
                            query,
                            limit,
                            &mut attempted_provider_queries,
                            &mut provider_kinds,
                            &mut provider_labels,
                            &mut sources,
                            &mut failed_messages,
                            "EXA Search failure",
                        )
                        .await;
                    }
                }
            }
            "exa_search" => failed_messages.push(
                "EXA Search API is not enabled for admin-funded wedding planner use.".to_string(),
            ),
            "overpass" => {
                external_search_performed = true;
                match search_overpass(&client, query, limit).await {
                    Ok(items) => {
                        provider_labels.insert("OSM / Overpass API".to_string());
                        sources.extend(items);
                    }
                    Err(message) => failed_messages.push(message),
                }
            }
            other => failed_messages.push(format!("Unsupported vendor-search provider: {other}")),
        }
    }

    tag_new_sources(&mut sources, &mut tagged_upto, previous_query);
    let enriched = enrich_vendor_sources(
        EnrichInput {
            db: &state.db,
            client: &client,
            user_id: &user.id,
            workspace_id: req.workspace_id.as_deref(),
            wedding_plan_id: req.wedding_plan_id.as_deref(),
            queries: &planned_queries,
            blocked_provider_kinds: &provider_kinds_blocked_for_run,
        },
        sources,
        &mut failed_messages,
    )
    .await;
    let (mut sources, persisted_source_count, enrichment_receipt) =
        (enriched.sources, enriched.persisted_count, enriched.receipt);
    if let Some(date) = selected_date
        && special_offer_evidence::discovery_rollout_allowed(&user.email)
    {
        match special_offer_evidence::attach_active_special_evidence(
            &state.db,
            &mut sources,
            date,
            req.guest_count,
        )
        .await
        {
            Ok(count) => limited_special_count = count,
            Err(error) => {
                tracing::warn!(%error, "Limited-date Wedding evidence refresh failed");
                failed_messages
                    .push("Limited-date availability could not be refreshed just now.".to_string());
            }
        }
    }
    let provider_label = if provider_labels.is_empty() {
        None
    } else {
        Some(
            provider_labels
                .iter()
                .cloned()
                .collect::<Vec<_>>()
                .join(" + "),
        )
    };
    let status = if sources.is_empty() {
        "failed"
    } else if external_search_performed {
        "executed"
    } else {
        "cached"
    };
    let message = if sources.is_empty() {
        vendor_search_empty_result_message(
            &failed_messages,
            &provider_labels,
            &planned_queries,
            external_search_performed,
        )
    } else if !external_search_performed && paid_provider_queries_skipped_due_to_cache > 0 {
        format!(
            "Admin vendor database returned {} reusable source{}; paid live search was skipped to save admin API credits.",
            sources.len(),
            if sources.len() == 1 { "" } else { "s" }
        )
    } else {
        format!(
            "Vendor search completed with {} source{}.",
            sources.len(),
            if sources.len() == 1 { "" } else { "s" }
        )
    };

    for provider in metered_providers {
        let shared_provider = match provider {
            "google_places" => WeddingSharedToolProvider::GooglePlaces,
            "brave_search" => WeddingSharedToolProvider::BraveSearch,
            "exa_search" => WeddingSharedToolProvider::ExaSearch,
            _ => continue,
        };
        let quantity = planned_queries
            .iter()
            .filter(|query| query.provider_kind == provider)
            .count()
            .max(1) as f64;
        let _ = record_wedding_shared_tool_usage(
            &state.db,
            WeddingSharedToolUsageInput {
                user_id: user.id.clone(),
                provider: shared_provider,
                feature: WeddingSharedToolFeature::VendorDiscovery,
                quantity,
                estimated_cost_usd: 0.0,
                usage_unit: Some("requests".to_string()),
                wedding_plan_id: req.workspace_id.clone(),
                operation: Some("live_vendor_search".to_string()),
                provider_request_id: None,
                occurred_at: Some(chrono::Utc::now().to_rfc3339()),
            },
        )
        .await;
    }

    let response = WeddingVendorSearchResponse {
        ok: !sources.is_empty(),
        status: status.to_string(),
        external_search_performed,
        provider_label,
        query_count: planned_queries.len(),
        source_count: sources.len(),
        queries: planned_queries
            .iter()
            .map(|query| query.query.clone())
            .collect(),
        sources: sources.clone(),
        message,
        receipt_metadata: merge_receipt(
            json!({
                "receipt_id": format!(
                    "wedding_vendor_search:live:{}:{}",
                    req.workspace_id.as_deref().unwrap_or("workspace"),
                    Ulid::new()
                ),
                "vendor_search_mode": "live",
                "vendor_search_status": status,
                "provider_kinds": provider_kinds.iter().cloned().collect::<Vec<_>>(),
                "vendor_categories": categories.iter().cloned().collect::<Vec<_>>(),
                "external_search_performed": external_search_performed,
                "admin_vendor_database_used": sources.iter().any(|source| source.provider == "Admin vendor database"),
                "admin_vendor_database_persisted_source_count": persisted_source_count,
                "paid_provider_queries_skipped_due_to_admin_cache": paid_provider_queries_skipped_due_to_cache,
                "query_count": planned_queries.len(),
                "source_count": sources.len(),
                "source_urls": sources.iter().map(|source| source.url.clone()).take(20).collect::<Vec<_>>(),
                "source_provider_labels": provider_labels.iter().cloned().collect::<Vec<_>>(),
                "failed_messages": failed_messages,
                "closed_places_filtered": closed_places_filtered,
                "limited_special_evidence_count": limited_special_count,
            }),
            enrichment_receipt,
        ),
    };
    if let Some((plan_id, category, fingerprint, policy_version)) = claim {
        state
            .db
            .complete_wedding_vendor_shortlist_run(
                &user.id,
                plan_id,
                category,
                fingerprint,
                policy_version,
                response.ok,
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }
    Ok(Json(response))
}

/// Sources collected since the last call came from `query`, so they inherit its category and
/// service area; persistence and per-category attributes then stay correct in mixed searches.
fn tag_new_sources(
    sources: &mut [WeddingVendorSearchSource],
    tagged_upto: &mut usize,
    query: Option<&WeddingVendorSearchQueryRequest>,
) {
    if let Some(query) = query {
        let category = query
            .category
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(canonical_wedding_vendor_category);
        let service_area = infer_vendor_service_area(&query.query);
        for source in sources.iter_mut().skip(*tagged_upto) {
            source.category = source.category.take().or_else(|| category.clone());
            source.service_area = source.service_area.take().or_else(|| service_area.clone());
        }
    }
    *tagged_upto = sources.len();
}

fn canonical_wedding_vendor_category(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "photography" | "photo" | "photographer" => "photographer".to_string(),
        "venue" | "venues" => "venue".to_string(),
        "floristry" | "flowers" | "florist" => "florist".to_string(),
        "catering" | "caterer" => "caterer".to_string(),
        // Celebrants and officiants are intentionally distinct services.
        other => other.to_string(),
    }
}

fn provider_query_attempt_key(provider_kind: &str, query: &str) -> String {
    format!(
        "{}|{}",
        provider_kind.trim().to_ascii_lowercase(),
        query
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_lowercase()
    )
}

fn vendor_search_empty_result_message(
    failed_messages: &[String],
    provider_labels: &BTreeSet<String>,
    planned_queries: &[WeddingVendorSearchQueryRequest],
    external_search_performed: bool,
) -> String {
    if !failed_messages.is_empty() {
        let details = failed_messages
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<_>>()
            .join(" ");
        return format!("No live vendor sources were returned. {details}");
    }
    if external_search_performed {
        let providers = if provider_labels.is_empty() {
            "the configured vendor-search provider".to_string()
        } else {
            provider_labels
                .iter()
                .cloned()
                .collect::<Vec<_>>()
                .join(" + ")
        };
        let query_count = planned_queries.len();
        return format!(
            "{providers} ran {query_count} vendor-search quer{} but returned no usable source URLs. Try a more specific category and location, or check the provider dashboard for quota and regional availability.",
            if query_count == 1 { "y" } else { "ies" }
        );
    }
    "No live vendor sources were returned. Try a more specific vendor type and location, or review the provider receipt for setup, quota, or regional availability details.".to_string()
}

fn discovery_context(queries: &[WeddingVendorSearchQueryRequest]) -> (String, String) {
    let Some(primary_query) = queries.first() else {
        return ("wedding vendor".to_string(), String::new());
    };
    let category = primary_query
        .category
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(canonical_wedding_vendor_category)
        .unwrap_or_else(|| "wedding vendor".to_string());
    let service_area = infer_vendor_service_area(&primary_query.query)
        .unwrap_or_else(|| primary_query.query.trim().to_string())
        .chars()
        .take(180)
        .collect::<String>();
    (category, service_area)
}

fn source_vendor_slug(
    source: &WeddingVendorSearchSource,
    category: &str,
    service_area: &str,
) -> String {
    source
        .vendor_slug
        .clone()
        .unwrap_or_else(|| wedding_vendor_slug(&source.title, category, service_area))
}

async fn persist_live_vendor_sources(
    db: &Db,
    user_id: &str,
    queries: &[WeddingVendorSearchQueryRequest],
    sources: &mut [WeddingVendorSearchSource],
) -> usize {
    let Some(primary_query) = queries.first() else {
        return 0;
    };
    let (default_category, default_area) = discovery_context(queries);
    let checked_at = chrono::Utc::now().date_naive().to_string();
    let mut persisted = 0;
    for source in sources.iter_mut() {
        let non_vendor = matches!(
            source.source_kind.as_deref(),
            Some("listicle") | Some("editorial")
        );
        if non_vendor || source.title.trim().is_empty() || source.url.trim().is_empty() {
            continue;
        }
        // Operator-curated vendors are never rewritten by live search; they only gain evidence.
        if let Some(vendor_id) = source.vendor_id.clone() {
            write_pending_attributes(db, user_id, &vendor_id, source).await;
            continue;
        }
        let category = source
            .category
            .clone()
            .unwrap_or_else(|| default_category.clone());
        let service_area = source
            .service_area
            .clone()
            .map(|area| area.chars().take(180).collect::<String>())
            .unwrap_or_else(|| default_area.clone());
        let website_is_official =
            source.source_kind.as_deref() == Some("official") && source.website_url.is_some();
        let input = WeddingVendorUpsertRecord {
            vendor_slug: source_vendor_slug(source, &category, &service_area),
            vendor_name: source.title.trim().chars().take(180).collect(),
            category: category.clone(),
            service_area: service_area.clone(),
            address: source
                .address
                .as_deref()
                .map(|address| address.chars().take(260).collect()),
            website_url: source.website_url.clone().filter(|_| website_is_official),
            contact_phone: source.phone.clone(),
            contact_email: None,
            source_url: Some(source.map_url.clone().unwrap_or_else(|| source.url.clone())),
            source_label: Some(source.provider.clone()),
            source_checked_at: Some(checked_at.clone()),
            status: "hidden".to_string(),
            notes: Some(
                "Discovered from a live wedding vendor search and cached as a candidate for reuse."
                    .to_string(),
            ),
            evidence: json!({
                "source": "live_vendor_search",
                "provider": source.provider,
                "query": primary_query.query,
                "category": category,
                "service_area": service_area,
                "url": source.url,
                "source_kind": source.source_kind,
                "official_site_confidence": source.official_site_confidence,
                "website_url": source.website_url,
                "map_url": source.map_url,
                "photo_url": source.photo_url,
                "address": source.address,
                "phone": source.phone,
                "email": source.email,
                "instagram_url": source.instagram_url,
                "snippet": source.snippet,
                "cached_at": chrono::Utc::now().to_rfc3339(),
            }),
            caveat_labels: vec![
                "live-search-cached".to_string(),
                "verify-before-booking".to_string(),
            ],
            photos: source
                .photo_url
                .as_deref()
                .filter(|url| is_couple_facing_vendor_photo_url(url))
                .map(|url| WeddingVendorPhotoUpsertRecord {
                    slot: 1,
                    photo_url: url.to_string(),
                    alt_text: Some(format!("{} venue image", source.title.trim())),
                    source_label: Some(source.provider.clone()),
                    source_url: Some(source.url.clone()),
                    retrieved_at: None,
                    licence_metadata: serde_json::json!({}),
                })
                .into_iter()
                .collect(),
        };
        match db
            .upsert_discovered_wedding_vendor(&input, user_id, website_is_official)
            .await
        {
            Ok(vendor_id) => {
                write_pending_attributes(db, user_id, &vendor_id, source).await;
                source.vendor_id = Some(vendor_id);
                persisted += 1;
            }
            Err(err) => tracing::warn!(
                %err,
                vendor = %source.title,
                "wedding vendor discovery persist failed"
            ),
        }
    }
    persisted
}

fn looks_like_vendor_website(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("http")
        && !lower.contains("google.com/maps")
        && !lower.contains("openstreetmap.org/")
}

fn looks_like_public_http_url(url: &str) -> bool {
    let parsed = match reqwest::Url::parse(url) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return false;
    }
    let Some(hostname) = parsed.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    !matches!(
        hostname.as_str(),
        "localhost" | "127.0.0.1" | "0.0.0.0" | "::1"
    )
}

/// Couple-facing vendor cards accept licensed Unsplash images, the narrowly
/// validated first-party Google Places proxy, and bounded static assets served
/// by OmnyID for an administrator-managed vendor listing. Arbitrary remote
/// image hosts stay excluded.
pub(super) fn is_unsplash_photo_url(url: &str) -> bool {
    if !looks_like_public_http_url(url) {
        return false;
    }
    let parsed = match reqwest::Url::parse(url.trim()) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    parsed.scheme() == "https"
        && parsed
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("images.unsplash.com"))
}

pub(super) fn is_omnyid_wedding_vendor_asset_url(url: &str) -> bool {
    let parsed = match reqwest::Url::parse(url.trim()) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    if parsed.scheme() != "https"
        || !parsed
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("omnyid.com"))
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return false;
    }
    let path = parsed.path();
    path.starts_with("/wedding/assets/venue-photos/")
        && matches!(
            path.rsplit('.')
                .next()
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("jpg" | "jpeg" | "png" | "webp")
        )
}

pub(super) fn is_google_wedding_vendor_photo_proxy_url(url: &str) -> bool {
    let Some(query) = url.trim().strip_prefix("/wedding/vendor-photo/google?") else {
        return false;
    };
    let mut params = query.split('&');
    let Some(name) = params.next() else {
        return false;
    };
    if !name.to_ascii_lowercase().starts_with("name=places%2f")
        || name.len() <= "name=places%2f".len()
    {
        return false;
    }
    match (params.next(), params.next()) {
        (None, None) => true,
        (Some(width), None) => width
            .strip_prefix("max_width_px=")
            .and_then(|value| value.parse::<u16>().ok())
            .is_some_and(|value| (120..=1200).contains(&value)),
        _ => false,
    }
}

pub(super) fn is_public_wedding_vendor_owner_photo_url(url: &str) -> bool {
    let Some(path) = url
        .trim()
        .strip_prefix("/api/public/wedding/vendor/photos/")
    else {
        return false;
    };
    let mut parts = path.split('/');
    let Some(asset_id) = parts.next() else {
        return false;
    };
    let Some(variant) = parts.next() else {
        return false;
    };
    parts.next().is_none()
        && ulid::Ulid::from_string(asset_id).is_ok()
        && matches!(variant, "full" | "medium" | "thumb")
}

pub(super) fn is_couple_facing_vendor_photo_url(url: &str) -> bool {
    is_unsplash_photo_url(url)
        || is_omnyid_wedding_vendor_asset_url(url)
        || is_google_wedding_vendor_photo_proxy_url(url)
        || is_public_wedding_vendor_owner_photo_url(url)
}

fn infer_email_from_text(text: &str) -> Option<String> {
    text.split_whitespace()
        .map(|part| {
            part.trim_matches(|ch: char| {
                matches!(
                    ch,
                    '<' | '>' | '(' | ')' | '[' | ']' | ',' | ';' | ':' | '.'
                )
            })
        })
        .find(|part| {
            part.len() <= 254
                && part.contains('@')
                && part.contains('.')
                && part.chars().all(|ch| {
                    ch.is_ascii_alphanumeric() || matches!(ch, '@' | '.' | '_' | '-' | '+')
                })
        })
        .map(str::to_string)
}

fn osm_address_from_tags(tags: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    let house_number = tags
        .get("addr:housenumber")
        .and_then(|value| value.as_str());
    let street = tags.get("addr:street").and_then(|value| value.as_str());
    let suburb = tags.get("addr:suburb").and_then(|value| value.as_str());
    let city = tags.get("addr:city").and_then(|value| value.as_str());
    let state = tags.get("addr:state").and_then(|value| value.as_str());
    let postcode = tags.get("addr:postcode").and_then(|value| value.as_str());
    let first_line = [house_number, street]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    let address = [
        if first_line.trim().is_empty() {
            None
        } else {
            Some(first_line)
        },
        suburb.map(str::to_string),
        city.map(str::to_string),
        state.map(str::to_string),
        postcode.map(str::to_string),
    ]
    .into_iter()
    .flatten()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>()
    .join(", ");
    if address.is_empty() {
        None
    } else {
        Some(address)
    }
}

fn clean_google_place_photo_name(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() > 600
        || !trimmed.starts_with("places/")
        || !trimmed.contains("/photos/")
        || trimmed.contains('?')
        || trimmed.contains('#')
        || trimmed.contains("..")
    {
        return None;
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '_' | '-' | '.'))
    {
        return None;
    }
    Some(trimmed.to_string())
}

fn google_place_photo_proxy_url(photo_name: &str) -> Option<String> {
    google_place_photo_proxy_url_at_width(photo_name, 720)
}

fn google_place_photo_proxy_url_at_width(photo_name: &str, max_width: u16) -> Option<String> {
    let clean_name = clean_google_place_photo_name(photo_name)?;
    let width = max_width.clamp(120, 1200);
    Some(format!(
        "/wedding/vendor-photo/google?name={}&max_width_px={width}",
        urlencoding::encode(&clean_name),
    ))
}

fn is_paid_vendor_search_provider(provider_kind: &str) -> bool {
    matches!(
        provider_kind,
        "brave_search" | "google_places" | "exa_search"
    )
}

fn infer_vendor_service_area(query: &str) -> Option<String> {
    let lower = query.to_ascii_lowercase();
    let markers = [" near ", " in ", " around ", " at "];
    markers
        .iter()
        .flat_map(|marker| {
            lower
                .match_indices(marker)
                .map(move |(index, _)| (index, marker.len()))
        })
        .filter_map(|(index, marker_len)| {
            service_area_candidate_after_marker(query, index + marker_len)
                .map(|candidate| (index, candidate))
        })
        .max_by_key(|(index, _)| *index)
        .map(|(_, candidate)| candidate)
}

fn service_area_candidate_after_marker(query: &str, start_index: usize) -> Option<String> {
    let raw = query[start_index..]
        .split([',', ';', '.', '\n'])
        .next()
        .unwrap_or_default();
    let mut candidate = raw.trim().to_string();
    let candidate_lower = candidate.to_ascii_lowercase();
    for stop in [
        " with ",
        " for ",
        " specialising ",
        " specializing ",
        " services ",
        " packages ",
        " price ",
        " reviews ",
        " budget ",
    ] {
        if let Some(index) = candidate_lower.find(stop) {
            candidate = candidate[..index].trim().to_string();
            break;
        }
    }
    let words = candidate
        .trim_start_matches("the ")
        .trim_start_matches("a ")
        .split_whitespace()
        .take(4)
        .collect::<Vec<_>>();
    let area = words.join(" ");
    let lower_area = area.to_ascii_lowercase();
    if area.is_empty()
        || matches!(
            lower_area.as_str(),
            "wedding" | "weddings" | "wedding style" | "wedding services"
        )
    {
        None
    } else {
        Some(area.chars().take(120).collect())
    }
}

fn overpass_area_pattern(query: &WeddingVendorSearchQueryRequest) -> Option<String> {
    infer_vendor_service_area(&query.query)
        .map(|area| area.replace(['"', '\\'], " "))
        .map(|area| area.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|area| !area.is_empty())
}

fn overpass_tag_filter(tag: &str) -> String {
    let trimmed = tag.trim();
    if let Some((key, value)) = trimmed.split_once('=') {
        return format!(
            "[\"{}\"=\"{}\"]",
            overpass_escape_token(key),
            overpass_escape_token(value)
        );
    }
    if let Some((key, value)) = trimmed.split_once('~') {
        return format!(
            "[\"{}\"~\"{}\",i]",
            overpass_escape_token(key),
            overpass_escape_token(value)
        );
    }
    if trimmed.is_empty() {
        "[\"name\"~\"wedding\",i]".to_string()
    } else {
        format!("[\"{}\"]", overpass_escape_token(trimmed))
    }
}

fn overpass_escape_token(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | ':' | ' '))
        .collect::<String>()
        .trim()
        .to_string()
}

fn wedding_vendor_slug(name: &str, category: &str, service_area: &str) -> String {
    let base = format!("{name} {category} {service_area}");
    let mut slug = String::new();
    let mut previous_dash = false;
    for ch in base.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            previous_dash = false;
        } else if !previous_dash && !slug.is_empty() {
            slug.push('-');
            previous_dash = true;
        }
        if slug.len() >= 120 {
            break;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        format!("vendor-{}", Ulid::new().to_string().to_ascii_lowercase())
    } else {
        slug
    }
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut deduped = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_ascii_lowercase();
        if seen.insert(key) {
            deduped.push(trimmed.to_string());
        }
    }
    deduped
}

fn bounded_provider_error_body(body: &str) -> String {
    body.split_whitespace()
        .take(36)
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(320)
        .collect()
}

async fn vendor_provider_http_error(provider: &str, response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let detail = bounded_provider_error_body(&body);
    let guidance = provider_http_error_guidance(provider, &body);
    if detail.is_empty() {
        format!("{provider} returned {status}.{guidance}")
    } else {
        format!("{provider} returned {status}: {detail}{guidance}")
    }
}

fn provider_http_error_guidance(provider: &str, body: &str) -> &'static str {
    let lower_provider = provider.to_ascii_lowercase();
    let lower_body = body.to_ascii_lowercase();
    if lower_provider.contains("google places") {
        if lower_body.contains("referer") && lower_body.contains("blocked") {
            return " Google Places key is restricted by HTTP referrer; for server-side wedding search, configure a server-compatible Google Places key such as IP/API-restricted server key, or update Google Cloud API key restrictions.";
        }
        if lower_body.contains("permission_denied")
            || lower_body.contains("permission denied")
            || lower_body.contains("api key not authorized")
            || lower_body.contains("places api")
                && (lower_body.contains("disabled") || lower_body.contains("not enabled"))
        {
            return " Google Places rejected the server-side request; confirm Places API (New) is enabled, billing is active, and the API key restrictions allow calls from the Oracle server.";
        }
    }
    ""
}

fn provider_error_blocks_remaining_run_queries(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("permission_denied")
        || lower.contains("permission denied")
        || lower.contains("api key not authorized")
        || lower.contains("api key not valid")
        || (lower.contains("referer") && lower.contains("blocked"))
        || lower.contains("quota exceeded")
        || lower.contains("rate limit")
        || lower.contains("too many requests")
}

async fn run_overpass_vendor_search_fallback(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
    attempted_provider_queries: &mut BTreeSet<String>,
    provider_kinds: &mut BTreeSet<String>,
    provider_labels: &mut BTreeSet<String>,
    sources: &mut Vec<WeddingVendorSearchSource>,
    failed_messages: &mut Vec<String>,
    reason: &str,
) {
    if sources.len() >= limit {
        return;
    }
    let fallback_query = overpass_fallback_query(query);
    if !attempted_provider_queries.insert(provider_query_attempt_key(
        &fallback_query.provider_kind,
        &fallback_query.query,
    )) {
        return;
    }
    provider_kinds.insert(fallback_query.provider_kind.clone());
    match search_overpass(client, &fallback_query, limit).await {
        Ok(items) => {
            if !items.is_empty() {
                provider_labels.insert("OSM / Overpass API".to_string());
                sources.extend(items);
            }
        }
        Err(message) => failed_messages.push(format!(
            "OSM / Overpass fallback after {reason} failed: {message}"
        )),
    }
}

async fn run_exa_vendor_search_fallback(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
    attempted_provider_queries: &mut BTreeSet<String>,
    provider_kinds: &mut BTreeSet<String>,
    provider_labels: &mut BTreeSet<String>,
    metered_providers: &mut BTreeSet<&'static str>,
    sources: &mut Vec<WeddingVendorSearchSource>,
    failed_messages: &mut Vec<String>,
    reason: &str,
) {
    if sources.len() >= limit || !admin_shared_tool_policy_enabled("exa-search-api") {
        return;
    }
    let mut fallback_query = query.clone();
    fallback_query.provider_kind = "exa_search".to_string();
    if !attempted_provider_queries.insert(provider_query_attempt_key(
        &fallback_query.provider_kind,
        &fallback_query.query,
    )) {
        return;
    }
    provider_kinds.insert(fallback_query.provider_kind.clone());
    match search_exa(client, &fallback_query, limit).await {
        Ok(items) => {
            if !items.is_empty() {
                provider_labels.insert("EXA Search API".to_string());
                metered_providers.insert("exa_search");
                sources.extend(items);
            }
        }
        Err(message) => failed_messages.push(format!(
            "EXA Search fallback after {reason} failed: {message}"
        )),
    }
}

fn overpass_fallback_query(
    query: &WeddingVendorSearchQueryRequest,
) -> WeddingVendorSearchQueryRequest {
    let mut fallback = query.clone();
    fallback.provider_kind = "overpass".to_string();
    if fallback
        .overpass_tags
        .as_ref()
        .map(|tags| tags.is_empty())
        .unwrap_or(true)
    {
        fallback.overpass_tags = Some(overpass_tags_for_category(fallback.category.as_deref()));
    }
    fallback
}

fn overpass_tags_for_category(category: Option<&str>) -> Vec<String> {
    match category
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_")
        .as_str()
    {
        "venue" => vec![
            "amenity=events_venue".to_string(),
            "amenity=community_centre".to_string(),
            "tourism=hotel".to_string(),
        ],
        "floral_designer" | "florist" => vec!["shop=florist".to_string()],
        "hair_stylist" | "hair" => vec!["shop=hairdresser".to_string()],
        "makeup_artist" | "makeup" => vec!["shop=beauty".to_string()],
        "cake_baker" | "cake" => vec!["shop=bakery".to_string()],
        "jeweler" | "jeweller" | "rings" => vec!["shop=jewelry".to_string()],
        "accommodations" | "accommodation" => vec!["tourism=hotel".to_string()],
        "caterer" | "catering" => vec!["amenity=restaurant".to_string()],
        "photographer" | "photography" => vec!["craft=photographer".to_string()],
        _ => vec!["name~wedding".to_string()],
    }
}

async fn search_overpass(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
) -> Result<Vec<WeddingVendorSearchSource>, String> {
    let endpoint = std::env::var("OMNYID_OVERPASS_API_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "https://overpass-api.de/api/interpreter".to_string());
    let tag = query
        .overpass_tags
        .as_ref()
        .and_then(|tags| tags.first())
        .cloned()
        .unwrap_or_else(|| "name~wedding".to_string());
    let tag_filter = overpass_tag_filter(&tag);
    let area_pattern =
        overpass_area_pattern(query).unwrap_or_else(|| query.query.replace(['"', '\\'], " "));
    let overpass_query = format!(
        "[out:json][timeout:15];nwr{}(area.searchArea);out center {};",
        tag_filter, limit
    );
    let response = client
        .post(endpoint)
        .body(format!(
            "[out:json][timeout:15];area[name~\"{}\"][admin_level~\"6|8\"]->.searchArea;{}",
            area_pattern, overpass_query,
        ))
        .send()
        .await
        .map_err(|err| format!("Overpass request failed: {err}"))?;
    if !response.status().is_success() {
        return Err(vendor_provider_http_error("Overpass", response).await);
    }
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("Overpass response parse failed: {err}"))?;
    let results = json["elements"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(limit)
        .filter_map(|item| {
            let tags = item["tags"].as_object()?;
            let name = tags.get("name")?.as_str()?.to_string();
            let id = item["id"].as_i64().unwrap_or_default();
            let item_type = item["type"].as_str().unwrap_or("node");
            let map_url = format!("https://www.openstreetmap.org/{item_type}/{id}");
            Some(WeddingVendorSearchSource {
                title: name,
                url: map_url.clone(),
                snippet: Some(format!("OSM tags matched for {}", query.query)),
                provider: "OSM / Overpass API".to_string(),
                website_url: tags
                    .get("website")
                    .or_else(|| tags.get("contact:website"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                map_url: Some(map_url),
                photo_url: None,
                address: osm_address_from_tags(tags),
                phone: tags
                    .get("phone")
                    .or_else(|| tags.get("contact:phone"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                email: tags
                    .get("email")
                    .or_else(|| tags.get("contact:email"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                instagram_url: tags
                    .get("contact:instagram")
                    .or_else(|| tags.get("instagram"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                ..WeddingVendorSearchSource::default()
            })
        })
        .collect();
    Ok(results)
}

fn dedupe_sources(sources: Vec<WeddingVendorSearchSource>) -> Vec<WeddingVendorSearchSource> {
    let mut seen = BTreeSet::new();
    let mut deduped = Vec::new();
    for source in sources {
        if source.title.trim().is_empty() || source.url.trim().is_empty() {
            continue;
        }
        let key = format!(
            "{}|{}",
            source.title.to_lowercase(),
            source.url.to_lowercase()
        );
        if seen.insert(key) {
            deduped.push(source);
        }
    }
    deduped
}

fn admin_shared_tool_policy_enabled(tool_id: &str) -> bool {
    let Some(prefix) = admin_shared_tool_policy_env_prefix(tool_id) else {
        return false;
    };
    let mut enabled_for_all_users =
        env_flag_value_local(&format!("{prefix}_ALL_USERS_ENABLED")).unwrap_or(false);
    let mut enabled_for_wedding_template =
        env_flag_value_local(&format!("{prefix}_WEDDING_TEMPLATE_ENABLED"))
            .unwrap_or_else(|| admin_shared_tool_policy_default_wedding_enabled(tool_id));

    if let Some(policy_file) =
        env_optional_trimmed_local("OMNYID_ADMIN_THIRD_PARTY_TOOL_POLICY_FILE")
    {
        if let Ok(content) = std::fs::read_to_string(policy_file) {
            if let Ok(value) = serde_json::from_str::<Value>(&content) {
                if let Some(record) =
                    value
                        .get("policies")
                        .and_then(Value::as_array)
                        .and_then(|policies| {
                            policies.iter().find(|entry| {
                                entry.get("toolId").and_then(Value::as_str) == Some(tool_id)
                            })
                        })
                {
                    if let Some(value) = record.get("enabledForAllUsers").and_then(Value::as_bool) {
                        enabled_for_all_users = value;
                    }
                    if let Some(value) = record
                        .get("enabledForWeddingTemplate")
                        .and_then(Value::as_bool)
                    {
                        enabled_for_wedding_template = value;
                    }
                }
            }
        }
    }

    enabled_for_all_users || enabled_for_wedding_template
}

fn admin_shared_tool_policy_default_wedding_enabled(tool_id: &str) -> bool {
    matches!(
        tool_id,
        "brave-search-api"
            | "exa-search-api"
            | "google-places-api"
            | "google-maps-platform"
            | "weatherapi"
    )
}

fn admin_shared_tool_policy_env_prefix(tool_id: &str) -> Option<&'static str> {
    match tool_id {
        "brave-search-api" => Some("OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API"),
        "exa-search-api" => Some("OMNYID_ADMIN_TOOL_EXA_SEARCH_API"),
        "google-places-api" => Some("OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API"),
        "google-maps-platform" => Some("OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM"),
        "weatherapi" => Some("OMNYID_ADMIN_TOOL_WEATHERAPI"),
        _ => None,
    }
}

fn env_flag_value_local(key: &str) -> Option<bool> {
    std::env::var(key)
        .ok()
        .map(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
        .flatten()
}

fn env_optional_trimmed_local(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
fn env_lock() -> std::sync::MutexGuard<'static, ()> {
    use std::sync::{Mutex, OnceLock};
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::directory::{
        directory_sources_cover_query, is_real_vendor_directory_record,
        wedding_vendor_directory_search_terms, wedding_vendor_record_to_search_source,
    };
    use super::*;
    use crate::db::WeddingVendorRecord;

    fn clear_provider_capability_env() {
        for key in [
            "OMNYID_ADMIN_THIRD_PARTY_TOOL_POLICY_FILE",
            "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY",
            "OMNYID_BRAVE_SEARCH_API_KEY",
            "BRAVE_SEARCH_API_KEY",
            "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY_FILE",
            "OMNYID_BRAVE_SEARCH_API_KEY_FILE",
            "BRAVE_SEARCH_API_KEY_FILE",
            "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY",
            "OMNYID_GOOGLE_PLACES_API_KEY",
            "GOOGLE_PLACES_API_KEY",
            "OMNYID_GOOGLE_MAPS_KEY",
            "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY_FILE",
            "OMNYID_GOOGLE_PLACES_API_KEY_FILE",
            "GOOGLE_PLACES_API_KEY_FILE",
            "OMNYID_GOOGLE_MAPS_KEY_FILE",
            "OMNYID_ADMIN_GOOGLE_MAPS_KEY",
            "OMNYID_ADMIN_GOOGLE_MAPS_KEY_FILE",
            "OMNYID_GOOGLE_MAPS_KEY_FILE",
            "OMNYID_ADMIN_WEATHERAPI_KEY",
            "OMNYID_WEATHERAPI_KEY",
            "WEATHERAPI_KEY",
            "OMNYID_ADMIN_WEATHERAPI_KEY_FILE",
            "OMNYID_WEATHERAPI_KEY_FILE",
            "WEATHERAPI_KEY_FILE",
            "OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API_ALL_USERS_ENABLED",
            "OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API_WEDDING_TEMPLATE_ENABLED",
            "OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_ALL_USERS_ENABLED",
            "OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED",
            "OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM_ALL_USERS_ENABLED",
            "OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM_WEDDING_TEMPLATE_ENABLED",
            "OMNYID_ADMIN_TOOL_WEATHERAPI_ALL_USERS_ENABLED",
            "OMNYID_ADMIN_TOOL_WEATHERAPI_WEDDING_TEMPLATE_ENABLED",
            "OMNYID_OVERPASS_API_URL",
        ] {
            unsafe {
                std::env::remove_var(key);
            }
        }
    }

    #[test]
    fn provider_query_attempt_key_normalizes_spacing_and_case() {
        assert_eq!(
            provider_query_attempt_key("Brave_Search", "  Wedding   venue near   Sydney  "),
            provider_query_attempt_key("brave_search", "wedding venue near sydney")
        );
        assert_ne!(
            provider_query_attempt_key("google_places", "wedding venue near sydney"),
            provider_query_attempt_key("brave_search", "wedding venue near sydney")
        );
    }

    #[test]
    fn vendor_service_area_inference_prefers_specific_late_location_phrase() {
        assert_eq!(
            infer_vendor_service_area(
                "a 60 people wedding at a beachfront location, in Gothic style in Sydney"
            )
            .as_deref(),
            Some("Sydney")
        );
        assert_eq!(
            infer_vendor_service_area("wedding florist near Northern Beaches with relaxed style")
                .as_deref(),
            Some("Northern Beaches")
        );
    }

    #[test]
    fn overpass_filter_serializes_compact_vendor_tags() {
        assert_eq!(
            overpass_tag_filter("shop=florist"),
            "[\"shop\"=\"florist\"]"
        );
        assert_eq!(
            overpass_tag_filter("name~wedding"),
            "[\"name\"~\"wedding\",i]"
        );
        assert_eq!(overpass_tag_filter("website"), "[\"website\"]");
    }

    #[test]
    fn overpass_fallback_query_adds_category_specific_tags() {
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some("venue".to_string()),
            query: "wedding venue near Sydney".to_string(),
            google_place_types: Some(vec!["event_venue".to_string()]),
            overpass_tags: None,
        };

        let fallback = overpass_fallback_query(&query);

        assert_eq!(fallback.provider_kind, "overpass");
        assert_eq!(
            fallback.overpass_tags.unwrap_or_default(),
            vec![
                "amenity=events_venue".to_string(),
                "amenity=community_centre".to_string(),
                "tourism=hotel".to_string(),
            ]
        );
    }

    #[test]
    fn wedding_provider_capabilities_payload_redacts_admin_keys() {
        let _env = env_lock();
        clear_provider_capability_env();
        unsafe {
            std::env::set_var("OMNYID_BRAVE_SEARCH_API_KEY", "secret-brave-search-key");
            std::env::set_var("OMNYID_GOOGLE_PLACES_API_KEY", "secret-google-places-key");
            std::env::set_var(
                "OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API_WEDDING_TEMPLATE_ENABLED",
                "true",
            );
            std::env::set_var(
                "OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED",
                "true",
            );
        }

        let payload = wedding_provider_capabilities_payload();
        let payload_text = payload.to_string();
        assert!(!payload_text.contains("secret-brave-search-key"));
        assert!(!payload_text.contains("secret-google-places-key"));
        assert!(payload_text.contains("env:OMNYID_BRAVE_SEARCH_API_KEY"));
        assert!(payload_text.contains("env:OMNYID_GOOGLE_PLACES_API_KEY"));

        let providers = payload["providers"].as_array().expect("providers");
        let brave = providers
            .iter()
            .find(|provider| provider["kind"].as_str() == Some("brave_search"))
            .expect("brave provider");
        assert_eq!(brave["credentialConfigured"].as_bool(), Some(true));
        assert_eq!(brave["sharedCreditEnabled"].as_bool(), Some(true));
        assert_eq!(brave["configured"].as_bool(), Some(true));
        assert_eq!(brave["verificationStatus"].as_str(), Some("unverified"));
        assert!(
            brave["diagnosticLabel"]
                .as_str()
                .unwrap_or_default()
                .contains("verified when a live search runs")
        );
        assert!(
            payload["connectedAppIds"]
                .as_array()
                .expect("connected ids")
                .iter()
                .any(|id| id.as_str() == Some("brave-search-api"))
        );

        clear_provider_capability_env();
    }

    #[test]
    fn admin_shared_tool_policy_enabled_reads_wedding_template_env_flag() {
        let _env = env_lock();
        clear_provider_capability_env();
        unsafe {
            std::env::set_var(
                "OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API_WEDDING_TEMPLATE_ENABLED",
                "true",
            );
        }

        assert!(admin_shared_tool_policy_enabled("brave-search-api"));
        assert!(admin_shared_tool_policy_enabled("google-places-api"));

        clear_provider_capability_env();
    }

    #[test]
    fn admin_shared_tool_policy_enabled_defaults_wedding_providers_on_until_disabled() {
        let _env = env_lock();
        clear_provider_capability_env();

        assert!(admin_shared_tool_policy_enabled("google-places-api"));
        assert!(admin_shared_tool_policy_enabled("google-maps-platform"));
        assert!(admin_shared_tool_policy_enabled("weatherapi"));

        unsafe {
            std::env::set_var(
                "OMNYID_ADMIN_TOOL_WEATHERAPI_WEDDING_TEMPLATE_ENABLED",
                "false",
            );
        }
        assert!(!admin_shared_tool_policy_enabled("weatherapi"));

        clear_provider_capability_env();
    }

    #[test]
    fn admin_shared_tool_policy_enabled_allows_file_policy_to_override_env() {
        let _env = env_lock();
        let policy_path =
            std::env::temp_dir().join(format!("omnyid-vendor-search-policy-{}.json", Ulid::new()));
        std::fs::write(
            &policy_path,
            serde_json::json!({
                "policies": [{
                    "toolId": "google-places-api",
                    "enabledForAllUsers": false,
                    "enabledForWeddingTemplate": false
                }]
            })
            .to_string(),
        )
        .expect("write policy");
        unsafe {
            std::env::set_var(
                "OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED",
                "true",
            );
            std::env::set_var(
                "OMNYID_ADMIN_THIRD_PARTY_TOOL_POLICY_FILE",
                policy_path.to_string_lossy().to_string(),
            );
        }

        assert!(!admin_shared_tool_policy_enabled("google-places-api"));

        clear_provider_capability_env();
        let _ = std::fs::remove_file(policy_path);
    }

    #[test]
    fn admin_shared_tool_policy_enabled_covers_live_evidence_providers() {
        let _env = env_lock();
        clear_provider_capability_env();
        unsafe {
            std::env::set_var(
                "OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM_ALL_USERS_ENABLED",
                "yes",
            );
            std::env::set_var(
                "OMNYID_ADMIN_TOOL_WEATHERAPI_WEDDING_TEMPLATE_ENABLED",
                "on",
            );
        }

        assert!(admin_shared_tool_policy_enabled("google-maps-platform"));
        assert!(admin_shared_tool_policy_enabled("weatherapi"));

        clear_provider_capability_env();
    }

    #[test]
    fn google_place_photo_proxy_url_accepts_only_places_photo_names() {
        assert_eq!(
            google_place_photo_proxy_url("places/example/photos/photo_abc-123").as_deref(),
            Some(
                "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fphoto_abc-123&max_width_px=720"
            )
        );
        assert!(google_place_photo_proxy_url("https://example.com/photo.jpg").is_none());
        assert!(google_place_photo_proxy_url("places/example/photos/photo?key=secret").is_none());
        assert!(google_place_photo_proxy_url("../places/example/photos/photo").is_none());
    }

    #[test]
    fn google_place_photo_proxy_url_bounds_the_catalogued_public_variant() {
        assert_eq!(
            google_place_photo_proxy_url_at_width("places/example/photos/photo_abc-123", 480)
                .as_deref(),
            Some(
                "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fphoto_abc-123&max_width_px=480"
            )
        );
        assert!(is_couple_facing_vendor_photo_url(
            "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fphoto_abc-123&max_width_px=480"
        ));
    }

    #[test]
    fn vendor_directory_search_terms_prioritize_the_exact_query_before_category_fallbacks() {
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "brave_search".to_string(),
            category: Some(" florist ".to_string()),
            query: "florist in Sydney specialising in wedding".to_string(),
            google_place_types: None,
            overpass_tags: None,
        };

        let terms = wedding_vendor_directory_search_terms(&query);

        assert_eq!(
            terms,
            vec![
                "florist in Sydney specialising in wedding".to_string(),
                "florist".to_string(),
                "Sydney".to_string(),
            ]
        );
    }

    #[test]
    fn descriptive_vendor_query_does_not_treat_generic_cached_rows_as_complete() {
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some("venue".to_string()),
            query: "rustic country micro-wedding venues in Sydney".to_string(),
            google_place_types: None,
            overpass_tags: None,
        };
        let generic = (0..5)
            .map(|index| WeddingVendorSearchSource {
                title: format!("Sydney Venue {index}"),
                url: format!("https://venue{index}.example"),
                snippet: Some("Wedding venue in Sydney".to_string()),
                provider: "Admin vendor database".to_string(),
                ..WeddingVendorSearchSource::default()
            })
            .collect::<Vec<_>>();

        assert!(!directory_sources_cover_query(&generic, &query, 5));
    }

    #[test]
    fn descriptive_vendor_query_can_reuse_three_evidence_backed_cached_rows() {
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some("venue".to_string()),
            query: "rustic country micro-wedding venues in Sydney".to_string(),
            google_place_types: None,
            overpass_tags: None,
        };
        let covered = (0..5)
            .map(|index| WeddingVendorSearchSource {
                title: format!("Country Venue {index}"),
                url: format!("https://country{index}.example"),
                snippet: Some(
                    if index < 3 {
                        "Rustic barn for intimate weddings"
                    } else {
                        "Sydney venue"
                    }
                    .to_string(),
                ),
                provider: "Admin vendor database".to_string(),
                ..WeddingVendorSearchSource::default()
            })
            .collect::<Vec<_>>();

        assert!(directory_sources_cover_query(&covered, &query, 5));
    }

    #[test]
    fn vendor_search_empty_result_message_surfaces_provider_failures() {
        let failures = vec![
            "Google Places returned 403: API key not authorized for Places API.".to_string(),
            "Brave Search returned 429: quota exceeded.".to_string(),
        ];
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some("venue".to_string()),
            query: "wedding venue in Sydney".to_string(),
            google_place_types: None,
            overpass_tags: None,
        };

        let message =
            vendor_search_empty_result_message(&failures, &BTreeSet::new(), &[query], true);

        assert!(message.contains("No live vendor sources were returned."));
        assert!(message.contains("Google Places returned 403"));
        assert!(message.contains("Brave Search returned 429"));
    }

    #[test]
    fn vendor_search_empty_result_message_explains_empty_successful_provider_run() {
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some("florist".to_string()),
            query: "florist in Sydney specialising in wedding".to_string(),
            google_place_types: None,
            overpass_tags: None,
        };
        let mut providers = BTreeSet::new();
        providers.insert("Google Places API".to_string());

        let message = vendor_search_empty_result_message(&[], &providers, &[query], true);

        assert!(message.contains("Google Places API ran 1 vendor-search query"));
        assert!(message.contains("returned no usable source URLs"));
    }

    #[test]
    fn bounded_provider_error_body_limits_noisy_provider_payloads() {
        let body = (0..80)
            .map(|index| format!("provider-error-field-{index}"))
            .collect::<Vec<_>>()
            .join(" ");

        let bounded = bounded_provider_error_body(&body);

        assert!(bounded.len() <= 320);
        assert!(bounded.contains("provider-error-field-0"));
        assert!(!bounded.contains("provider-error-field-79"));
    }

    #[test]
    fn provider_http_error_guidance_explains_google_places_referrer_restriction() {
        let guidance = provider_http_error_guidance(
            "Google Places",
            r#"{"error":{"message":"Requests from referer <empty> are blocked."}}"#,
        );

        assert!(guidance.contains("HTTP referrer"));
        assert!(guidance.contains("server-side wedding search"));
    }

    #[test]
    fn provider_http_error_guidance_explains_google_places_permission_denied() {
        let guidance = provider_http_error_guidance(
            "Google Places",
            r#"{"error":{"code":403,"message":"API key not valid. Please pass a valid API key.","status":"PERMISSION_DENIED"}}"#,
        );

        assert!(guidance.contains("Places API (New)"));
        assert!(guidance.contains("billing"));
        assert!(guidance.contains("Oracle server"));
    }

    #[test]
    fn provider_error_blocks_remaining_run_queries_for_provider_config_failures() {
        assert!(provider_error_blocks_remaining_run_queries(
            "Google Places returned 403: {\"error\":{\"status\":\"PERMISSION_DENIED\"}}",
        ));
        assert!(provider_error_blocks_remaining_run_queries(
            "Brave Search returned 429: quota exceeded.",
        ));
        assert!(provider_error_blocks_remaining_run_queries(
            "Requests from referer <empty> are blocked.",
        ));
        assert!(!provider_error_blocks_remaining_run_queries(
            "Google Places request failed: connection reset by peer",
        ));
    }

    #[test]
    fn wedding_vendor_record_maps_to_admin_database_source() {
        let source = wedding_vendor_record_to_search_source(WeddingVendorRecord {
            vendor_id: "vendor-1".to_string(),
            vendor_slug: "chloes-florals-sydney".to_string(),
            vendor_name: "Chloe's Florals".to_string(),
            category: "florist".to_string(),
            service_area: "Sydney".to_string(),
            address: Some("12 Test Street, Sydney NSW".to_string()),
            website_url: Some("https://chloes.example".to_string()),
            contact_phone: None,
            contact_email: None,
            source_url: Some("https://maps.google.com/?cid=example".to_string()),
            source_label: Some("Google Places API".to_string()),
            source_checked_at: Some("2026-09-29".to_string()),
            status: "active".to_string(),
            claim_status: "unclaimed".to_string(),
            linked_agent_id: None,
            notes: Some("Cached from search".to_string()),
            evidence: json!({}),
            caveat_labels: vec!["verify-before-booking".to_string()],
            created_by_user_id: None,
            updated_by_user_id: None,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
            photos: vec![crate::db::WeddingVendorPhotoRecord {
                photo_id: "photo-1".to_string(),
                vendor_id: "vendor-1".to_string(),
                slot: 1,
                photo_url: "https://images.unsplash.com/photo-1507504031003-b417219a0fde"
                    .to_string(),
                alt_text: Some("Chloe's Florals storefront".to_string()),
                source_label: Some("Admin vendor database".to_string()),
                source_url: Some("https://chloes.example/gallery".to_string()),
                retrieved_at: Some("2026-09-29T00:00:00Z".to_string()),
                licence_metadata: json!({}),
                created_at: "2026-09-29T00:00:00Z".to_string(),
            }],
            rooms: vec![crate::db::WeddingVendorRoomRecord {
                room_id: "room-1".to_string(),
                vendor_id: "vendor-1".to_string(),
                room_name: "Harvest Haven".to_string(),
                sort_order: 0,
                description: None,
                capacity_seated: Some(100),
                capacity_standing: None,
                pricing_label: Some("From $15,500 for ~100 guests".to_string()),
                price_from_cents: Some(1_550_000),
                minimum_spend_cents: None,
                minimum_spend_note: None,
                inclusions: vec!["Tables and chairs".to_string()],
                availability_note: None,
                source_url: None,
                source_label: None,
                source_checked_at: None,
                evidence: json!({}),
                photos: vec![
                    crate::db::WeddingVendorRoomPhotoRecord {
                        slot: 1,
                        stored: true,
                        storage_bucket: Some("bucket".to_string()),
                        storage_key: Some("private/key.webp".to_string()),
                        photo_url: None,
                        content_type: Some("image/webp".to_string()),
                        alt_text: None,
                        source_label: None,
                        source_url: None,
                    },
                    crate::db::WeddingVendorRoomPhotoRecord {
                        slot: 2,
                        stored: false,
                        storage_bucket: None,
                        storage_key: None,
                        photo_url: Some("https://cdn.example/barn.jpg".to_string()),
                        content_type: None,
                        alt_text: None,
                        source_label: None,
                        source_url: None,
                    },
                ],
            }],
            user_contact: None,
        });
        let rooms = source.rooms.as_ref().expect("rooms mapped");
        assert_eq!(rooms[0]["name"], "Harvest Haven");
        assert_eq!(rooms[0]["pricing_label"], "From $15,500 for ~100 guests");
        assert_eq!(
            rooms[0]["photo_urls"],
            json!([
                "/api/public/wedding/vendor/room-photos/room-1/1",
                "https://cdn.example/barn.jpg"
            ])
        );
        assert!(!rooms.to_string().contains("private/key.webp"));

        assert_eq!(source.title, "Chloe's Florals");
        assert_eq!(source.url, "https://chloes.example");
        assert_eq!(source.provider, "Admin vendor database");
        assert_eq!(
            source.map_url.as_deref(),
            Some("https://maps.google.com/?cid=example")
        );
        assert_eq!(
            source.photo_url.as_deref(),
            Some("https://images.unsplash.com/photo-1507504031003-b417219a0fde")
        );
        let snippet = source.snippet.as_deref().unwrap_or_default();
        assert!(snippet.contains("florist"));
        assert!(snippet.contains("Sydney"));
        assert!(!snippet.contains("shared wedding vendor database"));
    }

    #[test]
    fn couple_facing_vendor_photos_allow_approved_public_or_first_party_assets() {
        assert!(is_unsplash_photo_url(
            "https://images.unsplash.com/photo-1507504031003-b417219a0fde"
        ));
        assert!(!is_unsplash_photo_url("https://cdn.example/venue.jpg"));
        assert!(is_google_wedding_vendor_photo_proxy_url(
            "/wedding/vendor-photo/google?name=places%2Fabc%2Fphotos%2Fone&max_width_px=720"
        ));
        assert!(!is_google_wedding_vendor_photo_proxy_url(
            "/wedding/vendor-photo/google?name=places%2Fabc&key=secret"
        ));
        assert!(is_omnyid_wedding_vendor_asset_url(
            "https://omnyid.com/wedding/assets/venue-photos/curzon-hall.jpg"
        ));
        assert!(!is_omnyid_wedding_vendor_asset_url(
            "https://omnyid.com/wedding/assets/venue-photos/curzon-hall.jpg?tracking=1"
        ));
        assert!(is_public_wedding_vendor_owner_photo_url(
            "/api/public/wedding/vendor/photos/01ARZ3NDEKTSV4RRFFQ69G5FAV/medium"
        ));
        assert!(!is_public_wedding_vendor_owner_photo_url(
            "/api/public/wedding/vendor/photos/not-an-id/medium"
        ));
        assert!(!is_omnyid_wedding_vendor_asset_url(
            "https://omnyid.com.evil/wedding/assets/venue-photos/curzon-hall.jpg"
        ));
    }

    #[test]
    fn directory_titles_are_not_treated_as_vendor_records() {
        let record = WeddingVendorRecord {
            vendor_id: "directory-1".to_string(),
            vendor_slug: "venueguide-au".to_string(),
            vendor_name: "VenueGuide.au".to_string(),
            category: "venue".to_string(),
            service_area: "Sydney".to_string(),
            address: None,
            website_url: Some("https://venueguide.au".to_string()),
            contact_phone: Some("0000000000".to_string()),
            contact_email: None,
            source_url: Some("https://venueguide.au".to_string()),
            source_label: Some("Directory".to_string()),
            source_checked_at: None,
            status: "active".to_string(),
            claim_status: "unclaimed".to_string(),
            linked_agent_id: None,
            notes: None,
            evidence: json!({}),
            caveat_labels: vec![],
            created_by_user_id: None,
            updated_by_user_id: None,
            created_at: "2026-10-08T00:00:00Z".to_string(),
            updated_at: "2026-10-08T00:00:00Z".to_string(),
            photos: vec![],
            rooms: vec![],
            user_contact: None,
        };

        assert!(!is_real_vendor_directory_record(&record));
    }

    #[test]
    fn wedding_vendor_slug_is_stable_lowercase_and_ascii() {
        assert_eq!(
            wedding_vendor_slug("Chloe's Florals", "Florist", "Sydney CBD"),
            "chloe-s-florals-florist-sydney-cbd"
        );
    }

    #[test]
    fn paid_vendor_search_provider_only_flags_metered_live_apis() {
        assert!(is_paid_vendor_search_provider("brave_search"));
        assert!(is_paid_vendor_search_provider("google_places"));
        assert!(!is_paid_vendor_search_provider("overpass"));
        assert!(!is_paid_vendor_search_provider("manual_review"));
    }
}
