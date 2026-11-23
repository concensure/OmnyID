/*
 * @module-id: rust.server.geofence-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/geofence/zones", get(list_http).post(create_http))
        .route(
            "/geofence/zones/{id}",
            axum::routing::patch(update_http).delete(delete_http),
        )
}

// â”€â”€ Request shapes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(serde::Deserialize)]
struct CreateRequest {
    name: String,
    lat: f64,
    lng: f64,
    #[serde(default = "default_radius")]
    radius_m: f64,
    #[serde(default = "default_zone_type")]
    zone_type: String,
    trigger_heuristic_id: Option<String>,
    #[serde(default = "default_trigger_on")]
    trigger_on: String,
}
fn default_radius() -> f64 {
    200.0
}
fn default_zone_type() -> String {
    "custom".to_string()
}
fn default_trigger_on() -> String {
    "enter".to_string()
}

#[derive(serde::Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    radius_m: Option<f64>,
    zone_type: Option<String>,
    trigger_on: Option<String>,
    enabled: Option<bool>,
}

// â”€â”€ Row shape (returned by all handlers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(sqlx::FromRow, serde::Serialize)]
struct ZoneRow {
    id: String,
    name: String,
    lat: f64,
    lng: f64,
    radius_m: f64,
    zone_type: String,
    trigger_heuristic_id: Option<String>,
    trigger_on: String,
    enabled: bool,
    created_at: String,
    updated_at: String,
}

const SELECT_COLS: &str = "id::text, name, lat, lng, radius_m, zone_type, \
     trigger_heuristic_id, trigger_on, enabled, \
     created_at::text, updated_at::text";

// â”€â”€ GET /geofence/zones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let zones: Vec<ZoneRow> = sqlx::query_as(&format!(
        "SELECT {SELECT_COLS} FROM geofence_zones WHERE user_id = $1 ORDER BY created_at DESC"
    ))
    .bind(&user.id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_http_error)?;
    Ok(Json(serde_json::json!({ "zones": zones })))
}

// â”€â”€ POST /geofence/zones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CreateRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    validate_zone(&req.name, req.lat, req.lng, req.radius_m)?;
    let user = authenticated_user(&state.db, &headers).await?;
    let zone: ZoneRow = sqlx::query_as(&format!(
        "INSERT INTO geofence_zones \
           (user_id, name, lat, lng, radius_m, zone_type, trigger_heuristic_id, trigger_on) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
         RETURNING {SELECT_COLS}"
    ))
    .bind(&user.id)
    .bind(&req.name)
    .bind(req.lat)
    .bind(req.lng)
    .bind(req.radius_m)
    .bind(&req.zone_type)
    .bind(&req.trigger_heuristic_id)
    .bind(&req.trigger_on)
    .fetch_one(&state.db.pool)
    .await
    .map_err(internal_http_error)?;
    Ok(Json(serde_json::json!({ "zone": zone })))
}

// â”€â”€ PATCH /geofence/zones/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn update_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(zone_id): Path<String>,
    Json(req): Json<UpdateRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if let (Some(name), Some(lat), Some(lng), Some(r)) =
        (req.name.as_ref(), None::<f64>, None::<f64>, req.radius_m)
    {
        _ = (name, lat, lng); // bounds checked only when all present
        if r <= 0.0 {
            return Err((StatusCode::BAD_REQUEST, "radius_m must be positive".into()));
        }
    }
    let zone: Option<ZoneRow> = sqlx::query_as(&format!(
        "UPDATE geofence_zones SET \
           name       = COALESCE($3, name), \
           radius_m   = COALESCE($4, radius_m), \
           zone_type  = COALESCE($5, zone_type), \
           trigger_on = COALESCE($6, trigger_on), \
           enabled    = COALESCE($7, enabled), \
           updated_at = now() \
         WHERE id = $1::uuid AND user_id = $2 \
         RETURNING {SELECT_COLS}"
    ))
    .bind(&zone_id)
    .bind(&user.id)
    .bind(&req.name)
    .bind(req.radius_m)
    .bind(&req.zone_type)
    .bind(&req.trigger_on)
    .bind(req.enabled)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(internal_http_error)?;

    zone.map(|z| Json(serde_json::json!({ "zone": z })))
        .ok_or((StatusCode::NOT_FOUND, "zone not found".into()))
}

// â”€â”€ DELETE /geofence/zones/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(zone_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rows = sqlx::query("DELETE FROM geofence_zones WHERE id = $1::uuid AND user_id = $2")
        .bind(&zone_id)
        .bind(&user.id)
        .execute(&state.db.pool)
        .await
        .map_err(internal_http_error)?
        .rows_affected();

    if rows == 0 {
        return Err((StatusCode::NOT_FOUND, "zone not found".into()));
    }
    Ok(Json(serde_json::json!({ "deleted": true, "id": zone_id })))
}

// â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn validate_zone(
    name: &str,
    lat: f64,
    lng: f64,
    radius_m: f64,
) -> Result<(), (StatusCode, String)> {
    if name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "name is required".into()));
    }
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err((StatusCode::BAD_REQUEST, "lat/lng out of range".into()));
    }
    if radius_m <= 0.0 || radius_m > 50_000.0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "radius_m must be between 1 and 50000".into(),
        ));
    }
    Ok(())
}
