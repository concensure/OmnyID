/*
 * @module-id: rust.server.brief-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/brief/today", get(get_brief_today_http))
        .route("/api/brief/generate", post(generate_brief_http))
        .route("/api/brief/offer", post(execute_brief_offer_http))
}

async fn get_brief_today_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let today = chrono::Utc::now().date_naive().to_string();

    let row = sqlx::query(
        "SELECT brief_id, sections::text as sections, generated_at::text as generated_at, read_at::text as read_at
         FROM intelligence_briefs WHERE user_id = $1 AND brief_date = $2::date"
    )
    .bind(&user.id)
    .bind(&today)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    match row {
        Some(r) => {
            let brief_id: String = r
                .try_get("brief_id")
                .map_err(internal_error)
                .map_err(status_to_http)?;
            let sections_raw: Option<String> = r.try_get("sections").ok().flatten();
            let generated_at: Option<String> = r.try_get("generated_at").ok().flatten();
            let read_at: Option<String> = r.try_get("read_at").ok().flatten();
            let sections = sections_raw
                .as_deref()
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .unwrap_or(json!([]));
            Ok(Json(json!({
                "brief_id": brief_id,
                "brief_date": today,
                "sections": sections,
                "generated_at": generated_at,
                "read_at": read_at,
            })))
        }
        None => Ok(Json(
            json!({ "brief_id": null, "brief_date": today, "sections": [] }),
        )),
    }
}

async fn generate_brief_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let today = chrono::Utc::now().date_naive().to_string();
    let brief_id = Ulid::new().to_string();

    sqlx::query(
        "INSERT INTO intelligence_briefs (brief_id, user_id, brief_date, sections)
         VALUES ($1, $2, $3::date, '[]'::jsonb)
         ON CONFLICT (user_id, brief_date) DO NOTHING",
    )
    .bind(&brief_id)
    .bind(&user.id)
    .bind(&today)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(Json(json!({ "ok": true, "brief_id": brief_id })))
}

async fn execute_brief_offer_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let brief_id = body["brief_id"].as_str().unwrap_or("").to_string();
    let intent = body["intent"].as_str().unwrap_or("").to_string();

    if brief_id.is_empty() || intent.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "brief_id and intent required".to_string(),
        ));
    }

    let exists_row = sqlx::query(
        "SELECT EXISTS(SELECT 1 FROM intelligence_briefs WHERE brief_id = $1 AND user_id = $2) as e"
    )
    .bind(&brief_id)
    .bind(&user.id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let exists: bool = exists_row.try_get::<bool, _>("e").unwrap_or(false);

    if !exists {
        return Err((StatusCode::NOT_FOUND, "brief not found".to_string()));
    }

    let action_id = Ulid::new().to_string();
    sqlx::query(
        "UPDATE intelligence_briefs
         SET accepted_offer_intent = $3, accepted_offer_id = $4
         WHERE brief_id = $1 AND user_id = $2",
    )
    .bind(&brief_id)
    .bind(&user.id)
    .bind(&intent)
    .bind(&action_id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(Json(json!({ "ok": true, "action_id": action_id })))
}
