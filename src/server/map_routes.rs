/*
 * @module-id: rust.server.map-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use crate::{
    map_service::{LatLng, MapService, RouteResult},
    message::{
        AFP_SUBTYPE_MAP_GEOCODE, AFP_SUBTYPE_MAP_PLACES, AFP_SUBTYPE_MAP_ROUTE,
        AFP_TYPE_LOCATION_EVENT, AFP_TYPE_MAP_RESULT,
    },
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/map/geocode", post(map_geocode_http))
        .route("/map/route", post(map_route_http))
        .route("/map/route-card", post(map_route_card_http))
        .route(
            "/map/route-compare-message",
            post(map_route_compare_message_http),
        )
        .route("/map/places", post(map_places_http))
        .route(
            "/map/provider",
            get(map_provider_get_http).put(map_provider_put_http),
        )
        .route("/ingest/location", post(ingest_location_http))
}

// â”€â”€ Request / response shapes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(serde::Deserialize)]
struct MapGeocodeRequest {
    thread_id: String,
    query: String,
}

#[derive(serde::Deserialize)]
struct MapRouteRequest {
    thread_id: String,
    origin_query: Option<String>,
    origin_lat: Option<f64>,
    origin_lng: Option<f64>,
    destination_query: Option<String>,
    destination_lat: Option<f64>,
    destination_lng: Option<f64>,
    /// "driving" | "walking" | "cycling" | "transit" (default: "driving")
    #[serde(default)]
    mode: Option<String>,
}

#[derive(serde::Deserialize)]
struct MapRouteCompareRequest {
    thread_id: String,
    origin_query: Option<String>,
    origin_lat: Option<f64>,
    origin_lng: Option<f64>,
    destination_query: Option<String>,
    destination_lat: Option<f64>,
    destination_lng: Option<f64>,
    #[serde(default)]
    modes: Option<Vec<String>>,
}

#[derive(serde::Deserialize)]
struct MapPlacesRequest {
    thread_id: String,
    lat: f64,
    lng: f64,
    radius_m: Option<f64>,
    place_type: String,
}

#[derive(serde::Deserialize)]
pub(super) struct IngestLocationRequest {
    thread_id: String,
    lat: f64,
    lng: f64,
    accuracy_m: Option<f64>,
    /// "gps" | "network" | "passive" | "manual"
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
    /// When true, reverse-geocode and store a human label.
    #[serde(default)]
    resolve_label: Option<bool>,
}

#[derive(serde::Deserialize)]
struct MapProviderPutRequest {
    /// "google_maps" | "mapbox" | "osm"
    provider: String,
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn user_map_provider(state: &Arc<AppState>, user_id: &str) -> String {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT provider FROM map_provider_configs WHERE user_id = $1 LIMIT 1")
            .bind(user_id)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);
    row.map(|(p,)| p)
        .unwrap_or_else(|| crate::map_service::PROVIDER_GOOGLE_MAPS.to_string())
}

fn map_service_for(provider: &str) -> MapService {
    MapService::from_env(Some(provider))
}

fn display_mode_label(mode: &str) -> String {
    match mode {
        "driving" => "Driving".to_string(),
        "walking" => "Walking".to_string(),
        "cycling" => "Cycling".to_string(),
        "transit" => "Transit".to_string(),
        other => {
            let mut chars = other.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => "Mode".to_string(),
            }
        }
    }
}

fn canonical_route_modes(modes: Option<&[String]>) -> Vec<String> {
    let candidates = modes
        .map(|items| {
            items
                .iter()
                .map(|item| item.trim().to_lowercase())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            vec![
                "driving".to_string(),
                "walking".to_string(),
                "cycling".to_string(),
                "transit".to_string(),
            ]
        });
    let mut unique = Vec::new();
    for mode in candidates {
        if mode.is_empty() || unique.iter().any(|existing: &String| existing == &mode) {
            continue;
        }
        unique.push(mode);
    }
    unique
}

fn build_route_card_metrics(route: &RouteResult) -> Vec<Value> {
    vec![
        serde_json::json!({ "label": "Duration", "value": route.duration_text.clone() }),
        serde_json::json!({ "label": "Distance", "value": route.distance_text.clone() }),
        serde_json::json!({ "label": "Steps", "value": route.steps.len().to_string() }),
    ]
}

fn build_route_tradeoffs(mode: &str, route: &RouteResult) -> Vec<Value> {
    let mut tradeoffs = Vec::new();
    if mode == "driving" {
        tradeoffs.push(serde_json::json!({
            "title": "Road dependency",
            "body": "Driving speed depends on live traffic and parking availability."
        }));
    }
    if mode == "walking" || mode == "cycling" {
        tradeoffs.push(serde_json::json!({
            "title": "Physical effort",
            "body": format!("This option covers {} across {} steps.", route.distance_text, route.steps.len())
        }));
    }
    if route.steps.len() > 10 {
        tradeoffs.push(serde_json::json!({
            "title": "Complexity",
            "body": "This route has a higher step count, which may increase navigation overhead."
        }));
    }
    tradeoffs
}

fn build_mode_comparison_rows(results: &[(String, RouteResult)]) -> Vec<Value> {
    if results.is_empty() {
        return Vec::new();
    }
    let fastest_duration = results
        .iter()
        .map(|(_, route)| route.duration_s)
        .fold(f64::INFINITY, f64::min);
    let shortest_distance = results
        .iter()
        .map(|(_, route)| route.distance_m)
        .fold(f64::INFINITY, f64::min);
    let simplest_steps = results
        .iter()
        .map(|(_, route)| route.steps.len())
        .min()
        .unwrap_or(0);

    vec![
        serde_json::json!({
            "label": "Duration",
            "values": results.iter().map(|(_, route)| route.duration_text.clone()).collect::<Vec<_>>(),
            "winner": false,
            "note": "Lower is better",
            "confidence_delta": format!("{:.0} mins spread", (results.iter().map(|(_, route)| route.duration_s).fold(0.0, f64::max) - fastest_duration) / 60.0),
        }),
        serde_json::json!({
            "label": "Distance",
            "values": results.iter().map(|(_, route)| route.distance_text.clone()).collect::<Vec<_>>(),
            "winner": false,
            "note": "Shorter routes usually reduce travel burden",
            "confidence_delta": format!("{:.1} km spread", (results.iter().map(|(_, route)| route.distance_m).fold(0.0, f64::max) - shortest_distance) / 1000.0),
        }),
        serde_json::json!({
            "label": "Steps",
            "values": results.iter().map(|(_, route)| route.steps.len().to_string()).collect::<Vec<_>>(),
            "winner": false,
            "note": format!("Lowest step count is {}", simplest_steps),
        }),
    ]
}

async fn resolve_route_request(
    svc: &MapService,
    req: &MapRouteRequest,
) -> Result<(LatLng, LatLng, String), (StatusCode, String)> {
    let origin = resolve_latlng(
        svc,
        req.origin_lat,
        req.origin_lng,
        req.origin_query.as_deref(),
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let destination = resolve_latlng(
        svc,
        req.destination_lat,
        req.destination_lng,
        req.destination_query.as_deref(),
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let mode = req.mode.clone().unwrap_or_else(|| "driving".to_string());
    Ok((origin, destination, mode))
}

async fn resolve_route_compare_request(
    svc: &MapService,
    req: &MapRouteCompareRequest,
) -> Result<(LatLng, LatLng, Vec<String>), (StatusCode, String)> {
    let origin = resolve_latlng(
        svc,
        req.origin_lat,
        req.origin_lng,
        req.origin_query.as_deref(),
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let destination = resolve_latlng(
        svc,
        req.destination_lat,
        req.destination_lng,
        req.destination_query.as_deref(),
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok((
        origin,
        destination,
        canonical_route_modes(req.modes.as_deref()),
    ))
}

// â”€â”€ GET /map/provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn map_provider_get_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let provider = user_map_provider(&state, &user.id).await;
    let svc = map_service_for(&provider);
    Ok(Json(serde_json::json!({
        "provider": provider,
        "tile_config": serde_json::to_value(svc.tile_config()).unwrap_or_default(),
        "available_providers": ["google_maps", "mapbox", "osm"],
    })))
}

// â”€â”€ PUT /map/provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn map_provider_put_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MapProviderPutRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let valid = ["google_maps", "mapbox", "osm"];
    if !valid.contains(&req.provider.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("provider must be one of: {}", valid.join(", ")),
        ));
    }
    sqlx::query(
        r#"
        INSERT INTO map_provider_configs (user_id, provider, updated_at)
        VALUES ($1, $2, now())
        ON CONFLICT (user_id) DO UPDATE
          SET provider = EXCLUDED.provider,
              updated_at = now()
        "#,
    )
    .bind(&user.id)
    .bind(&req.provider)
    .execute(&state.db.pool)
    .await
    .map_err(internal_http_error)?;

    Ok(Json(serde_json::json!({ "provider": req.provider })))
}

// â”€â”€ POST /map/geocode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn map_geocode_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MapGeocodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("map_geocode", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let query = req.query.trim();
    if query.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "query is required".to_string()));
    }

    let provider = user_map_provider(&state, &user.id).await;
    let svc = map_service_for(&provider);
    let results = svc
        .geocode(query)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    let results_json: Vec<serde_json::Value> = results
        .iter()
        .map(|r| serde_json::to_value(r).unwrap_or_default())
        .collect();
    let tile_config = serde_json::to_value(svc.tile_config()).unwrap_or_default();

    let content = serde_json::json!({
        "result_type": AFP_SUBTYPE_MAP_GEOCODE,
        "provider": provider,
        "query": query,
        "geocode_results": results_json,
        "tile_config": tile_config,
    });

    let msg = new_server_message(
        "omnyid://server/map".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_MAP_RESULT,
        content.clone(),
        vec![serde_json::json!({
            "format": "map",
            "content": {
                "result_type": "geocode",
                "provider": provider,
                "query": query,
                "results": results_json,
                "tile_config": tile_config,
            }
        })],
        vec![],
        vec![],
        false,
    )
    .map_err(internal_http_error)?;

    let msg_id = msg.id.clone();
    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, &user.id, msg)
        .await
        .map_err(internal_http_error)?;

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "message_id": msg_id,
        "provider": provider,
        "result_count": results.len(),
        "results": results_json,
    })))
}

// â”€â”€ POST /map/route â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn map_route_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MapRouteRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("map_route", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let provider = user_map_provider(&state, &user.id).await;
    let svc = map_service_for(&provider);

    let (origin, destination, mode) = resolve_route_request(&svc, &req).await?;
    let route = svc
        .directions(&origin, &destination, &mode)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    let route_json = route
        .as_ref()
        .map(|r| serde_json::to_value(r).unwrap_or_default());
    let tile_config = serde_json::to_value(svc.tile_config()).unwrap_or_default();

    let content = serde_json::json!({
        "result_type": AFP_SUBTYPE_MAP_ROUTE,
        "provider": provider,
        "query": format!("{} â†’ {}", req.origin_query.as_deref().unwrap_or("origin"), req.destination_query.as_deref().unwrap_or("destination")),
        "origin": serde_json::to_value(&origin).unwrap_or_default(),
        "destination": serde_json::to_value(&destination).unwrap_or_default(),
        "mode": mode.clone(),
        "route": route_json,
        "tile_config": tile_config,
    });

    let msg = new_server_message(
        "omnyid://server/map".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_MAP_RESULT,
        content.clone(),
        vec![serde_json::json!({
            "format": "map",
            "content": {
                "result_type": "route",
                "provider": provider,
                "origin": serde_json::to_value(&origin).unwrap_or_default(),
                "destination": serde_json::to_value(&destination).unwrap_or_default(),
                "mode": mode.clone(),
                "route": route_json,
                "tile_config": tile_config,
            }
        })],
        vec![],
        vec![],
        false,
    )
    .map_err(internal_http_error)?;

    let msg_id = msg.id.clone();
    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, &user.id, msg)
        .await
        .map_err(internal_http_error)?;

    let summary = route.as_ref().map(|r| {
        serde_json::json!({
            "distance_text": r.distance_text,
            "duration_text": r.duration_text,
            "distance_m": r.distance_m,
            "duration_s": r.duration_s,
            "step_count": r.steps.len(),
        })
    });

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "message_id": msg_id,
        "provider": provider,
        "mode": mode,
        "route": summary,
    })))
}

async fn map_route_card_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MapRouteRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("map_route_card", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let provider = user_map_provider(&state, &user.id).await;
    let svc = map_service_for(&provider);
    let (origin, destination, mode) = resolve_route_request(&svc, &req).await?;
    let route = svc
        .directions(&origin, &destination, &mode)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no route found for the requested mode".to_string(),
            )
        })?;

    let origin_label = req.origin_query.as_deref().unwrap_or("origin");
    let destination_label = req.destination_query.as_deref().unwrap_or("destination");
    let title = format!("{} route", display_mode_label(&mode));
    let summary = format!(
        "{} from {} to {} across {} steps.",
        route.duration_text,
        origin_label,
        destination_label,
        route.steps.len()
    );
    let assumptions = vec![
        format!("Provider: {}", provider),
        format!("Mode: {}", display_mode_label(&mode)),
    ];
    let notes = vec![
        format!("Distance estimate: {}", route.distance_text),
        format!(
            "Resolved destination at {}, {}",
            destination.lat, destination.lng
        ),
    ];
    let actions = vec!["copy".to_string(), "share".to_string()];
    let copy_text = format!(
        "{} from {} to {} via {}. Distance {} across {} steps.",
        route.duration_text,
        origin_label,
        destination_label,
        display_mode_label(&mode),
        route.distance_text,
        route.steps.len()
    );
    let message = crate::ui_surface_messages::build_route_card_surface_message(
        "map_routes",
        &title,
        &summary,
        Some(&format!("{}:{}:{}", provider, mode, req.thread_id)),
        &build_route_card_metrics(&route),
        &build_route_tradeoffs(&mode, &route),
        &assumptions,
        &notes,
        &actions,
        Some(if route.steps.len() <= 6 { 0.84 } else { 0.72 }),
        Some(&copy_text),
        None,
    );
    Ok(Json(serde_json::json!({
        "message": message,
        "provider": provider,
        "mode": mode,
    })))
}

async fn map_route_compare_message_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MapRouteCompareRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("map_route_compare", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let provider = user_map_provider(&state, &user.id).await;
    let svc = map_service_for(&provider);
    let (origin, destination, modes) = resolve_route_compare_request(&svc, &req).await?;

    let mut results = Vec::new();
    for mode in modes {
        if let Some(route) = svc
            .directions(&origin, &destination, &mode)
            .await
            .map_err(|e| (StatusCode::BAD_GATEWAY, e))?
        {
            results.push((mode, route));
        }
    }

    if results.is_empty() {
        return Err((
            StatusCode::NOT_FOUND,
            "no comparable routes found".to_string(),
        ));
    }

    let columns = results
        .iter()
        .map(|(mode, _)| display_mode_label(mode))
        .collect::<Vec<_>>();
    let title = "Route mode comparison".to_string();
    let description = format!(
        "Compare travel modes from {} to {} using {}.",
        req.origin_query.as_deref().unwrap_or("origin"),
        req.destination_query.as_deref().unwrap_or("destination"),
        provider
    );
    let rows = build_mode_comparison_rows(&results);
    let message = crate::ui_surface_messages::build_comparison_table_surface_message(
        "map_routes",
        &title,
        &description,
        &columns,
        &rows,
    );

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "message": message,
        "provider": provider,
        "available_modes": results.iter().map(|(mode, _)| mode.clone()).collect::<Vec<_>>(),
    })))
}

// â”€â”€ POST /map/places â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn map_places_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MapPlacesRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("map_places", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let provider = user_map_provider(&state, &user.id).await;
    let svc = map_service_for(&provider);

    let center = LatLng {
        lat: req.lat,
        lng: req.lng,
    };
    let radius_m = req.radius_m.unwrap_or(500.0).clamp(50.0, 50_000.0);
    let places = svc
        .places_nearby(&center, radius_m, &req.place_type)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    let places_json: Vec<serde_json::Value> = places
        .iter()
        .map(|p| serde_json::to_value(p).unwrap_or_default())
        .collect();
    let tile_config = serde_json::to_value(svc.tile_config()).unwrap_or_default();

    let content = serde_json::json!({
        "result_type": AFP_SUBTYPE_MAP_PLACES,
        "provider": provider,
        "query": req.place_type,
        "places": places_json,
        "tile_config": tile_config,
        "center": { "lat": req.lat, "lng": req.lng },
        "radius_m": radius_m,
    });

    let msg = new_server_message(
        "omnyid://server/map".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_MAP_RESULT,
        content.clone(),
        vec![serde_json::json!({
            "format": "map",
            "content": {
                "result_type": "places",
                "provider": provider,
                "center": { "lat": req.lat, "lng": req.lng },
                "radius_m": radius_m,
                "place_type": req.place_type,
                "places": places_json,
                "tile_config": tile_config,
            }
        })],
        vec![],
        vec![],
        false,
    )
    .map_err(internal_http_error)?;

    let msg_id = msg.id.clone();
    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, &user.id, msg)
        .await
        .map_err(internal_http_error)?;

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "message_id": msg_id,
        "provider": provider,
        "place_count": places.len(),
        "places": places_json,
    })))
}

// â”€â”€ POST /ingest/location â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub(super) async fn ingest_location_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<IngestLocationRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_location", &headers),
        RateLimitPolicy {
            max_requests: 120,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let source = req.source.as_deref().unwrap_or("passive").to_string();

    // Optionally reverse-geocode to get a human label
    let label: Option<String> = if req.resolve_label.unwrap_or(false) {
        let provider = user_map_provider(&state, &user.id).await;
        let svc = map_service_for(&provider);
        svc.reverse_geocode(req.lat, req.lng)
            .await
            .ok()
            .flatten()
            .map(|r| r.display_name)
    } else {
        None
    };

    // Persist to location_events
    let event_id: (String,) = sqlx::query_as(
        r#"
        INSERT INTO location_events (user_id, lat, lng, accuracy_m, source, label, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id::text
        "#,
    )
    .bind(&user.id)
    .bind(req.lat)
    .bind(req.lng)
    .bind(req.accuracy_m)
    .bind(&source)
    .bind(&label)
    .bind(req.metadata.clone().unwrap_or(serde_json::json!({})))
    .fetch_one(&state.db.pool)
    .await
    .map_err(internal_http_error)?;

    let event_content = serde_json::json!({
        "lat": req.lat,
        "lng": req.lng,
        "accuracy_m": req.accuracy_m,
        "source": source,
        "label": label,
        "metadata": req.metadata.unwrap_or(serde_json::json!({})),
    });

    let msg = new_server_message(
        "omnyid://server/location".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_LOCATION_EVENT,
        event_content,
        vec![],
        vec![],
        vec![],
        false,
    )
    .map_err(internal_http_error)?;

    let msg_id = msg.id.clone();
    sqlx::query("UPDATE location_events SET message_id = $1 WHERE id = $2::uuid")
        .bind(&msg_id)
        .bind(&event_id.0)
        .execute(&state.db.pool)
        .await
        .ok();

    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, &user.id, msg)
        .await
        .map_err(internal_http_error)?;

    // Trigger geofence check for this user
    check_geofences(&state, &user.id, req.lat, req.lng).await;

    Ok(Json(serde_json::json!({
        "event_id": event_id.0,
        "message_id": msg_id,
        "lat": req.lat,
        "lng": req.lng,
        "label": label,
    })))
}

// â”€â”€ Geofence check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn check_geofences(state: &Arc<AppState>, user_id: &str, lat: f64, lng: f64) {
    let zones: Vec<(String, String, f64, f64, f64, Option<String>)> = sqlx::query_as(
        r#"
        SELECT id::text, name, lat, lng, radius_m, trigger_heuristic_id
        FROM geofence_zones
        WHERE user_id = $1 AND enabled = true AND trigger_heuristic_id IS NOT NULL
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    for (zone_id, zone_name, zone_lat, zone_lng, radius_m, heuristic_id_opt) in zones {
        let heuristic_id = heuristic_id_opt.unwrap_or_default();
        let dlat = lat - zone_lat;
        let dlng = lng - zone_lng;
        // Haversine approximation in metres
        let dist = ((dlat * dlat + dlng * dlng).sqrt()) * 111_000.0;
        if dist <= radius_m {
            tracing::debug!(
                "User {} entered geofence zone '{}' ({}), heuristic: {}",
                user_id,
                zone_name,
                zone_id,
                heuristic_id
            );
            // Emit a passive event so the heuristic engine can pick it up
            let _ = sqlx::query(
                r#"
                INSERT INTO location_events (user_id, lat, lng, source, label, metadata)
                VALUES ($1, $2, $3, 'geofence', $4, $5)
                "#,
            )
            .bind(user_id)
            .bind(lat)
            .bind(lng)
            .bind(format!("Entered: {}", zone_name))
            .bind(serde_json::json!({
                "zone_id": zone_id,
                "zone_name": zone_name,
                "heuristic_id": heuristic_id,
                "event": "geofence_enter",
            }))
            .execute(&state.db.pool)
            .await;
        }
    }
}

// â”€â”€ Shared utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn resolve_latlng(
    svc: &MapService,
    lat: Option<f64>,
    lng: Option<f64>,
    query: Option<&str>,
) -> Result<LatLng, String> {
    if let (Some(lat), Some(lng)) = (lat, lng) {
        return Ok(LatLng { lat, lng });
    }
    let q = query.ok_or("either lat/lng or a query string is required")?;
    let results = svc.geocode(q).await?;
    results
        .into_iter()
        .next()
        .map(|r| LatLng {
            lat: r.lat,
            lng: r.lng,
        })
        .ok_or_else(|| format!("could not geocode '{q}'"))
}

#[cfg(test)]
mod tests {
    use super::{build_mode_comparison_rows, build_route_card_metrics, canonical_route_modes};
    use crate::map_service::{LatLng, RouteResult, RouteStep};

    fn sample_route(duration_s: f64, distance_m: f64, steps: usize) -> RouteResult {
        RouteResult {
            distance_m,
            duration_s,
            steps: (0..steps)
                .map(|_| RouteStep {
                    instruction: "Head north".to_string(),
                    distance_m: distance_m / steps.max(1) as f64,
                    duration_s: duration_s / steps.max(1) as f64,
                    start: LatLng { lat: 0.0, lng: 0.0 },
                    end: LatLng { lat: 1.0, lng: 1.0 },
                })
                .collect(),
            polyline: None,
            distance_text: format!("{:.1} km", distance_m / 1000.0),
            duration_text: format!("{} mins", (duration_s / 60.0).round() as u32),
        }
    }

    #[test]
    fn canonical_modes_are_unique_and_lowercase() {
        let modes = canonical_route_modes(Some(&[
            "Driving".to_string(),
            "walking".to_string(),
            "driving".to_string(),
        ]));
        assert_eq!(modes, vec!["driving".to_string(), "walking".to_string()]);
    }

    #[test]
    fn route_card_metrics_include_duration_distance_and_steps() {
        let metrics = build_route_card_metrics(&sample_route(900.0, 4200.0, 5));
        assert_eq!(metrics.len(), 3);
        assert_eq!(metrics[0]["label"].as_str(), Some("Duration"));
    }

    #[test]
    fn comparison_rows_cover_duration_distance_and_steps() {
        let rows = build_mode_comparison_rows(&[
            ("driving".to_string(), sample_route(900.0, 4200.0, 5)),
            ("walking".to_string(), sample_route(2400.0, 3900.0, 7)),
        ]);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0]["label"].as_str(), Some("Duration"));
        assert_eq!(rows[1]["values"].as_array().map(Vec::len), Some(2));
    }

    #[test]
    fn map_routes_sanitize_message_construction_failures() {
        let source = include_str!("map_routes.rs");
        let geocode_start = source
            .find("async fn map_geocode_http(")
            .expect("map geocode start");
        let route_start = source
            .find("async fn map_route_http(")
            .expect("map route start");
        let route_card_start = source
            .find("async fn map_route_card_http(")
            .expect("map route card start");
        let places_start = source
            .find("async fn map_places_http(")
            .expect("map places start");
        let ingest_start = source
            .find("pub(super) async fn ingest_location_http(")
            .expect("ingest location start");
        let geofence_start = source
            .find("async fn check_geofences(")
            .expect("check geofences start");
        let geocode = &source[geocode_start..route_start];
        let route = &source[route_start..route_card_start];
        let places = &source[places_start..ingest_start];
        let ingest_location = &source[ingest_start..geofence_start];
        assert!(
            geocode.contains(".map_err(internal_http_error)?;")
                && route.contains(".map_err(internal_http_error)?;")
                && places.contains(".map_err(internal_http_error)?;")
                && ingest_location.contains(".map_err(internal_http_error)?;"),
            "map route handlers should sanitize AFP message construction failures"
        );
        assert!(
            !geocode.contains(".map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;")
                && !route.contains(".map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;")
                && !places.contains(".map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;")
                && !ingest_location
                    .contains(".map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;"),
            "map route handlers should not echo raw internal constructor errors"
        );
    }
}
