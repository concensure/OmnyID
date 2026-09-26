/*
 * @module-id: rust.server.news-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/news/subscriptions",
            get(list_channels_http).post(create_channel_http),
        )
        .route(
            "/api/news/subscriptions/{channel_id}",
            put(update_channel_http).delete(delete_channel_http),
        )
        .route("/api/news/feed/{channel_id}", get(get_channel_feed_http))
        .route("/api/news/items/{item_id}/dismiss", post(dismiss_item_http))
        .route(
            "/api/news/items/{item_id}/save",
            post(save_item_to_knowledge_http),
        )
}

async fn list_channels_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rows = sqlx::query(
        "SELECT channel_id, label, categories::text as categories, locality,
                granularity, frequency, sources::text as sources, goal_id, enabled,
                created_at::text as created_at
         FROM news_subscriptions WHERE user_id = $1 ORDER BY created_at ASC",
    )
    .bind(&user.id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let channels: Vec<Value> = rows
        .iter()
        .map(|r| -> Result<Value, sqlx::Error> {
            let categories_raw: Option<String> = r.try_get("categories").ok().flatten();
            let sources_raw: Option<String> = r.try_get("sources").ok().flatten();
            Ok(json!({
                "channel_id": r.try_get::<String, _>("channel_id")?,
                "label": r.try_get::<String, _>("label")?,
                "categories": categories_raw.as_deref()
                    .and_then(|s| serde_json::from_str::<Value>(s).ok()).unwrap_or(json!([])),
                "locality": r.try_get::<Option<String>, _>("locality").ok().flatten(),
                "granularity": r.try_get::<String, _>("granularity")?,
                "frequency": r.try_get::<String, _>("frequency")?,
                "sources": sources_raw.as_deref()
                    .and_then(|s| serde_json::from_str::<Value>(s).ok()).unwrap_or(json!([])),
                "goal_id": r.try_get::<Option<String>, _>("goal_id").ok().flatten(),
                "enabled": r.try_get::<bool, _>("enabled").unwrap_or(true),
                "created_at": r.try_get::<Option<String>, _>("created_at").ok().flatten(),
            }))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "channels": channels })))
}

async fn create_channel_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let channel_id = Ulid::new().to_string();

    let label = body["label"].as_str().unwrap_or("").trim().to_string();
    if label.is_empty() || label.len() > 200 {
        return Err((
            StatusCode::BAD_REQUEST,
            "label must be 1â€“200 characters".to_string(),
        ));
    }
    let granularity = body["granularity"]
        .as_str()
        .unwrap_or("summaries")
        .to_string();
    if !["headlines", "summaries", "deep"].contains(&granularity.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "granularity must be headlines, summaries, or deep".to_string(),
        ));
    }
    let frequency = body["frequency"].as_str().unwrap_or("daily").to_string();
    if !["realtime", "daily", "weekly"].contains(&frequency.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "frequency must be realtime, daily, or weekly".to_string(),
        ));
    }
    if body
        .get("sources")
        .and_then(|v| v.as_array())
        .map_or(false, |a| a.len() > 20)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "at most 20 RSS sources allowed".to_string(),
        ));
    }

    let categories = serde_json::to_string(body.get("categories").unwrap_or(&json!([])))
        .unwrap_or_else(|_| "[]".to_string());
    let locality = body["locality"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let sources = serde_json::to_string(body.get("sources").unwrap_or(&json!([])))
        .unwrap_or_else(|_| "[]".to_string());
    let goal_id = body["goal_id"].as_str().map(|s| s.to_string());

    if let Some(ref gid) = goal_id {
        let exists_row = sqlx::query(
            "SELECT EXISTS(SELECT 1 FROM user_goals WHERE goal_id = $1 AND user_id = $2) as e",
        )
        .bind(gid)
        .bind(&user.id)
        .fetch_one(&state.db.pool)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
        if !exists_row.try_get::<bool, _>("e").unwrap_or(false) {
            return Err((StatusCode::BAD_REQUEST, "goal_id not found".to_string()));
        }
    }

    let now = chrono::Utc::now();
    sqlx::query(
        "INSERT INTO news_subscriptions
             (channel_id, user_id, label, categories, locality, granularity, frequency, sources, goal_id, enabled)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, true)"
    )
    .bind(&channel_id)
    .bind(&user.id)
    .bind(&label)
    .bind(&categories)
    .bind(&locality)
    .bind(&granularity)
    .bind(&frequency)
    .bind(&sources)
    .bind(&goal_id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(Json(json!({
        "channel_id": channel_id,
        "label": label,
        "categories": body.get("categories").cloned().unwrap_or(json!([])),
        "locality": locality,
        "granularity": granularity,
        "frequency": frequency,
        "sources": body.get("sources").cloned().unwrap_or(json!([])),
        "goal_id": goal_id,
        "enabled": true,
        "created_at": now.to_rfc3339(),
    })))
}

async fn update_channel_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    if let Some(lbl) = body["label"].as_str() {
        let trimmed = lbl.trim();
        if trimmed.is_empty() || trimmed.len() > 200 {
            return Err((
                StatusCode::BAD_REQUEST,
                "label must be 1â€“200 characters".to_string(),
            ));
        }
    }
    if let Some(g) = body["granularity"].as_str() {
        if !["headlines", "summaries", "deep"].contains(&g) {
            return Err((
                StatusCode::BAD_REQUEST,
                "granularity must be headlines, summaries, or deep".to_string(),
            ));
        }
    }
    if let Some(f) = body["frequency"].as_str() {
        if !["realtime", "daily", "weekly"].contains(&f) {
            return Err((
                StatusCode::BAD_REQUEST,
                "frequency must be realtime, daily, or weekly".to_string(),
            ));
        }
    }
    if body
        .get("sources")
        .and_then(|v| v.as_array())
        .map_or(false, |a| a.len() > 20)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "at most 20 RSS sources allowed".to_string(),
        ));
    }

    let label = body["label"].as_str().map(|s| s.trim().to_string());
    let granularity = body["granularity"].as_str().map(|s| s.to_string());
    let frequency = body["frequency"].as_str().map(|s| s.to_string());
    let locality = body["locality"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let enabled = body["enabled"].as_bool();
    let categories_json = body
        .get("categories")
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()));
    let sources_json = body
        .get("sources")
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()));
    let goal_id = body["goal_id"].as_str().map(|s| s.to_string());

    if let Some(ref gid) = goal_id {
        let exists_row = sqlx::query(
            "SELECT EXISTS(SELECT 1 FROM user_goals WHERE goal_id = $1 AND user_id = $2) as e",
        )
        .bind(gid)
        .bind(&user.id)
        .fetch_one(&state.db.pool)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
        if !exists_row.try_get::<bool, _>("e").unwrap_or(false) {
            return Err((StatusCode::BAD_REQUEST, "goal_id not found".to_string()));
        }
    }

    sqlx::query(
        "UPDATE news_subscriptions SET
              label = COALESCE($3, label),
              granularity = COALESCE($4, granularity),
              frequency = COALESCE($5, frequency),
              locality = COALESCE($6, locality),
              enabled = COALESCE($7, enabled),
              categories = CASE WHEN $8::text IS NOT NULL THEN $8::jsonb ELSE categories END,
              sources = CASE WHEN $9::text IS NOT NULL THEN $9::jsonb ELSE sources END,
              goal_id = COALESCE($10, goal_id)
           WHERE channel_id = $1 AND user_id = $2",
    )
    .bind(&channel_id)
    .bind(&user.id)
    .bind(&label)
    .bind(&granularity)
    .bind(&frequency)
    .bind(&locality)
    .bind(enabled)
    .bind(&categories_json)
    .bind(&sources_json)
    .bind(&goal_id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(Json(json!({ "ok": true })))
}

async fn delete_channel_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    sqlx::query("DELETE FROM news_subscriptions WHERE channel_id = $1 AND user_id = $2")
        .bind(&channel_id)
        .bind(&user.id)
        .execute(&state.db.pool)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "ok": true })))
}

async fn get_channel_feed_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let exists_row = sqlx::query(
        "SELECT EXISTS(SELECT 1 FROM news_subscriptions WHERE channel_id = $1 AND user_id = $2) as e"
    )
    .bind(&channel_id)
    .bind(&user.id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let exists: bool = exists_row.try_get::<bool, _>("e").unwrap_or(false);
    if !exists {
        return Err((StatusCode::NOT_FOUND, "channel not found".to_string()));
    }

    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(30)
        .min(100);
    let rows = sqlx::query(
        "SELECT id, url, headline, summary, source_name,
                published_at::text as published_at, reading_time_min,
                goal_relevance, categories::text as categories,
                deep_content, dismissed, saved_to_knowledge
         FROM news_items
         WHERE channel_id = $1 AND dismissed = false
         ORDER BY published_at DESC NULLS LAST LIMIT $2",
    )
    .bind(&channel_id)
    .bind(limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let items: Vec<Value> = rows
        .iter()
        .map(|r| -> Result<Value, sqlx::Error> {
            let categories_raw: Option<String> = r.try_get("categories").ok().flatten();
            Ok(json!({
                "id": r.try_get::<String, _>("id")?,
                "channel_id": channel_id,
                "url": r.try_get::<Option<String>, _>("url").ok().flatten(),
                "headline": r.try_get::<Option<String>, _>("headline").ok().flatten(),
                "summary": r.try_get::<Option<String>, _>("summary").ok().flatten(),
                "source_name": r.try_get::<Option<String>, _>("source_name").ok().flatten(),
                "published_at": r.try_get::<Option<String>, _>("published_at").ok().flatten(),
                "reading_time_min": r.try_get::<Option<i32>, _>("reading_time_min").ok().flatten(),
                "goal_relevance": r.try_get::<Option<f64>, _>("goal_relevance").ok().flatten(),
                "categories": categories_raw.as_deref()
                    .and_then(|s| serde_json::from_str::<Value>(s).ok()).unwrap_or(json!([])),
                "deep_content": r.try_get::<Option<String>, _>("deep_content").ok().flatten(),
                "dismissed": r.try_get::<bool, _>("dismissed").unwrap_or(false),
                "saved_to_knowledge": r.try_get::<bool, _>("saved_to_knowledge").unwrap_or(false),
            }))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "items": items })))
}

async fn dismiss_item_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(item_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    sqlx::query(
        "UPDATE news_items ni SET dismissed = true
         FROM news_subscriptions ns
         WHERE ni.channel_id = ns.channel_id AND ns.user_id = $2 AND ni.id = $1",
    )
    .bind(&item_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;
    Ok(Json(json!({ "ok": true })))
}

/// Mark a news item as saved to the knowledge graph.
/// The AFP note is created asynchronously by the news_delivery_agent daemon,
/// which polls for news_items where saved_to_knowledge = true AND afp_note_id IS NULL.
async fn save_item_to_knowledge_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(item_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let updated_row = sqlx::query(
        "UPDATE news_items ni SET saved_to_knowledge = true
         FROM news_subscriptions ns
         WHERE ni.channel_id = ns.channel_id AND ns.user_id = $2 AND ni.id = $1
         RETURNING ni.id",
    )
    .bind(&item_id)
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    if updated_row.is_none() {
        return Err((StatusCode::NOT_FOUND, "item not found".to_string()));
    }

    Ok(Json(json!({ "ok": true })))
}
