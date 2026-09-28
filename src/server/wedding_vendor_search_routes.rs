/*
 * @module-id: rust.server.wedding-vendor-search-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use crate::admin_tool_secrets::{
    BRAVE_SEARCH_SPEC, GOOGLE_MAPS_SPEC, GOOGLE_PLACES_SPEC, WEATHER_API_SPEC,
    admin_tool_secret_status, resolve_admin_tool_secret,
};
use crate::map_service::{MapService, PROVIDER_GOOGLE_MAPS, PROVIDER_OSM};
use crate::wedding_shared_tool_metering::{
    WeddingSharedToolFeature, WeddingSharedToolProvider, WeddingSharedToolUsageInput,
    record_wedding_shared_tool_usage,
};
use serde_json::Value;

#[derive(serde::Deserialize)]
struct WeddingVendorSearchRequest {
    workspace_id: Option<String>,
    queries: Vec<WeddingVendorSearchQueryRequest>,
    max_results_per_query: Option<usize>,
}

#[derive(serde::Deserialize, Clone)]
struct WeddingVendorSearchQueryRequest {
    provider_kind: String,
    category: Option<String>,
    query: String,
    google_place_types: Option<Vec<String>>,
    overpass_tags: Option<Vec<String>>,
}

#[derive(serde::Serialize, Clone)]
struct WeddingVendorSearchSource {
    title: String,
    url: String,
    snippet: Option<String>,
    provider: String,
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
    let places = admin_tool_secret_status(GOOGLE_PLACES_SPEC);
    let maps = admin_tool_secret_status(GOOGLE_MAPS_SPEC);
    let weatherapi = admin_tool_secret_status(WEATHER_API_SPEC);
    let brave_policy_enabled = admin_shared_tool_policy_enabled("brave-search-api");
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
            "sourceLabel": brave.source_label,
        }),
        json!({
            "kind": "google_places",
            "connectedAppId": "google-places-api",
            "label": places.label,
            "credentialRequired": true,
            "credentialConfigured": places.configured,
            "sharedCreditEnabled": places_policy_enabled,
            "configured": places.configured && places_policy_enabled,
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
            "sourceLabel": weatherapi.source_label,
        }),
        json!({
            "kind": "overpass",
            "connectedAppId": "overpass-api",
            "label": "OSM / Overpass API",
            "credentialRequired": false,
            "configured": overpass_configured,
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
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("OmnyID-WeddingPlanner/1.0")
        .build()
        .map_err(internal_http_error)?;
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

    let mut sources = Vec::new();
    let mut provider_kinds = BTreeSet::new();
    let mut categories = BTreeSet::new();
    let mut failed_messages = Vec::new();
    let mut provider_labels = BTreeSet::new();
    let mut metered_providers = BTreeSet::new();

    for query in &planned_queries {
        provider_kinds.insert(query.provider_kind.clone());
        if let Some(category) = query
            .category
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            categories.insert(category.to_string());
        }
        match query.provider_kind.as_str() {
            "google_places" if admin_shared_tool_policy_enabled("google-places-api") => {
                match search_google_places(&client, query, limit).await {
                    Ok(items) => {
                        provider_labels.insert("Google Places API".to_string());
                        metered_providers.insert("google_places");
                        sources.extend(items);
                    }
                    Err(message) => failed_messages.push(message),
                }
            }
            "google_places" => failed_messages.push(
                "Google Places API is not enabled for admin-funded wedding planner use."
                    .to_string(),
            ),
            "brave_search" if admin_shared_tool_policy_enabled("brave-search-api") => {
                match search_brave(&client, query, limit).await {
                    Ok(items) => {
                        provider_labels.insert("Brave Search".to_string());
                        metered_providers.insert("brave_search");
                        sources.extend(items);
                    }
                    Err(message) => failed_messages.push(message),
                }
            }
            "brave_search" => failed_messages.push(
                "Brave Search API is not enabled for admin-funded wedding planner use.".to_string(),
            ),
            "overpass" => match search_overpass(&client, query, limit).await {
                Ok(items) => {
                    provider_labels.insert("OSM / Overpass API".to_string());
                    sources.extend(items);
                }
                Err(message) => failed_messages.push(message),
            },
            other => failed_messages.push(format!("Unsupported vendor-search provider: {other}")),
        }
    }

    let sources = dedupe_sources(sources);
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
    } else {
        "executed"
    };
    let message = if sources.is_empty() {
        failed_messages
            .first()
            .cloned()
            .unwrap_or_else(|| "Live vendor search returned no usable sources.".to_string())
    } else {
        format!(
            "Live vendor search completed with {} source{}.",
            sources.len(),
            if sources.len() == 1 { "" } else { "s" }
        )
    };

    for provider in metered_providers {
        let shared_provider = match provider {
            "google_places" => WeddingSharedToolProvider::GooglePlaces,
            "brave_search" => WeddingSharedToolProvider::BraveSearch,
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

    Ok(Json(WeddingVendorSearchResponse {
        ok: !sources.is_empty(),
        status: status.to_string(),
        external_search_performed: true,
        provider_label,
        query_count: planned_queries.len(),
        source_count: sources.len(),
        queries: planned_queries
            .iter()
            .map(|query| query.query.clone())
            .collect(),
        sources: sources.clone(),
        message,
        receipt_metadata: json!({
            "receipt_id": format!(
                "wedding_vendor_search:live:{}:{}",
                req.workspace_id.as_deref().unwrap_or("workspace"),
                Ulid::new()
            ),
            "vendor_search_mode": "live",
            "vendor_search_status": status,
            "provider_kinds": provider_kinds.iter().cloned().collect::<Vec<_>>(),
            "vendor_categories": categories.iter().cloned().collect::<Vec<_>>(),
            "external_search_performed": true,
            "query_count": planned_queries.len(),
            "source_count": sources.len(),
            "source_urls": sources.iter().map(|source| source.url.clone()).take(20).collect::<Vec<_>>(),
            "source_provider_labels": provider_labels.iter().cloned().collect::<Vec<_>>(),
            "failed_messages": failed_messages,
        }),
    }))
}

async fn search_brave(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
) -> Result<Vec<WeddingVendorSearchSource>, String> {
    let key = resolve_admin_tool_secret(BRAVE_SEARCH_SPEC)
        .map(|secret| secret.secret)
        .ok_or_else(|| "Brave Search API key is not configured.".to_string())?;
    let count = limit.to_string();
    let response = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .query(&[("q", query.query.as_str()), ("count", count.as_str())])
        .header("Accept", "application/json")
        .header("X-Subscription-Token", key)
        .send()
        .await
        .map_err(|err| format!("Brave Search request failed: {err}"))?;
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("Brave Search response parse failed: {err}"))?;
    let results = json["web"]["results"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(limit)
        .filter_map(|item| {
            Some(WeddingVendorSearchSource {
                title: item["title"].as_str()?.to_string(),
                url: item["url"].as_str()?.to_string(),
                snippet: item["description"].as_str().map(ToOwned::to_owned),
                provider: "Brave Search".to_string(),
            })
        })
        .collect();
    Ok(results)
}

async fn search_google_places(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
) -> Result<Vec<WeddingVendorSearchSource>, String> {
    let key = resolve_admin_tool_secret(GOOGLE_PLACES_SPEC)
        .map(|secret| secret.secret)
        .ok_or_else(|| "Google Places API key is not configured.".to_string())?;
    let response = client
        .post("https://places.googleapis.com/v1/places:searchText")
        .header("X-Goog-Api-Key", key)
        .header(
            "X-Goog-FieldMask",
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri",
        )
        .json(&json!({
            "textQuery": query.query,
            "maxResultCount": limit.clamp(1, 20),
        }))
        .send()
        .await
        .map_err(|err| format!("Google Places request failed: {err}"))?;
    if !response.status().is_success() {
        return Err(format!("Google Places returned {}", response.status()));
    }
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("Google Places response parse failed: {err}"))?;
    Ok(google_places_sources_from_response(&json, query, limit))
}

fn google_places_sources_from_response(
    json: &serde_json::Value,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
) -> Vec<WeddingVendorSearchSource> {
    let place_types = query
        .google_place_types
        .clone()
        .unwrap_or_default()
        .join(", ");
    json["places"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(limit)
        .filter_map(|item| {
            let name = item["displayName"]["text"]
                .as_str()
                .or_else(|| item["displayName"].as_str())?
                .to_string();
            let place_id = item["id"].as_str().unwrap_or("");
            let vicinity = item["formattedAddress"].as_str().unwrap_or("");
            let rating = item["rating"].as_f64();
            let review_count = item["userRatingCount"].as_u64();
            let rating_text = rating
                .map(|value| {
                    let count = review_count
                        .map(|count| {
                            format!(
                                " across {count} review{}",
                                if count == 1 { "" } else { "s" }
                            )
                        })
                        .unwrap_or_default();
                    format!(" rating {value:.1}{count}")
                })
                .unwrap_or_default();
            let maps_url = item["googleMapsUri"].as_str().map(str::to_string);
            let website_url = item["websiteUri"].as_str().map(str::to_string);
            Some(WeddingVendorSearchSource {
                title: name,
                url: maps_url.or(website_url).unwrap_or_else(|| {
                    if place_id.is_empty() {
                        format!(
                            "https://www.google.com/maps/search/?api=1&query={}",
                            urlencoding::encode(&query.query)
                        )
                    } else {
                        format!(
                            "https://www.google.com/maps/search/?api=1&query={}&query_place_id={}",
                            urlencoding::encode(&query.query),
                            place_id
                        )
                    }
                }),
                snippet: Some(format!(
                    "{}{}{}",
                    vicinity,
                    rating_text,
                    if place_types.is_empty() {
                        ""
                    } else {
                        " - place types requested"
                    }
                )),
                provider: "Google Places API".to_string(),
            })
        })
        .collect()
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
    let overpass_query = format!(
        "[out:json][timeout:15];nwr[{}](area.searchArea);out center {};",
        tag, limit
    );
    let response = client
        .post(endpoint)
        .body(format!(
            "[out:json][timeout:15];area[name~\"{}\"][admin_level~\"6|8\"]->.searchArea;{}",
            query.query.replace('"', ""),
            overpass_query,
        ))
        .send()
        .await
        .map_err(|err| format!("Overpass request failed: {err}"))?;
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
            Some(WeddingVendorSearchSource {
                title: name,
                url: format!("https://www.openstreetmap.org/{item_type}/{id}"),
                snippet: Some(format!("OSM tags matched for {}", query.query)),
                provider: "OSM / Overpass API".to_string(),
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
    let mut enabled_for_all_users = env_flag_enabled_local(&format!("{prefix}_ALL_USERS_ENABLED"));
    let mut enabled_for_wedding_template =
        env_flag_enabled_local(&format!("{prefix}_WEDDING_TEMPLATE_ENABLED"));

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

fn admin_shared_tool_policy_env_prefix(tool_id: &str) -> Option<&'static str> {
    match tool_id {
        "brave-search-api" => Some("OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API"),
        "google-places-api" => Some("OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API"),
        "google-maps-platform" => Some("OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM"),
        "weatherapi" => Some("OMNYID_ADMIN_TOOL_WEATHERAPI"),
        _ => None,
    }
}

fn env_flag_enabled_local(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn env_optional_trimmed_local(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("env lock")
    }

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
        assert!(!admin_shared_tool_policy_enabled("google-places-api"));

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
    fn google_places_sources_from_response_reads_places_api_new_shape() {
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some("florist".to_string()),
            query: "florist in Sydney specialising in wedding".to_string(),
            google_place_types: Some(vec!["point_of_interest".to_string()]),
            overpass_tags: None,
        };
        let response = json!({
            "places": [{
                "id": "places/example",
                "displayName": { "text": "Chloe's Florals" },
                "formattedAddress": "12 Test Street, Sydney NSW",
                "rating": 4.9,
                "userRatingCount": 63,
                "googleMapsUri": "https://maps.google.com/?cid=example",
                "websiteUri": "https://example.test"
            }]
        });

        let sources = google_places_sources_from_response(&response, &query, 5);

        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].title, "Chloe's Florals");
        assert_eq!(sources[0].url, "https://maps.google.com/?cid=example");
        assert!(
            sources[0]
                .snippet
                .as_deref()
                .unwrap_or_default()
                .contains("rating 4.9 across 63 reviews")
        );
        assert_eq!(sources[0].provider, "Google Places API");
    }
}
