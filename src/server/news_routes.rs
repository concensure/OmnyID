/*
 * @module-id: rust.server.news-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

const MAX_NEWS_LABEL_LEN: usize = 200;
const MAX_NEWS_LOCALITY_LEN: usize = 160;
const MAX_NEWS_GOAL_ID_LEN: usize = 128;
const MAX_NEWS_ROUTE_ID_LEN: usize = 128;
const MAX_NEWS_CATEGORIES: usize = 20;
const MAX_NEWS_SOURCES: usize = 20;
const MAX_NEWS_FEED_LIMIT: i64 = 100;
const DEFAULT_NEWS_FEED_LIMIT: i64 = 30;

fn news_feed_limit(value: Option<&str>) -> i64 {
    value
        .and_then(|value| value.trim().parse::<i64>().ok())
        .unwrap_or(DEFAULT_NEWS_FEED_LIMIT)
        .clamp(1, MAX_NEWS_FEED_LIMIT)
}

fn news_required_text(
    value: Option<&str>,
    field: &str,
    max_len: usize,
) -> Result<String, (StatusCode, String)> {
    let value = value.unwrap_or("").trim();
    if value.is_empty() || value.len() > max_len {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} must be 1-{max_len} characters"),
        ));
    }
    Ok(value.to_string())
}

fn news_optional_text(
    value: Option<&str>,
    max_len: usize,
) -> Result<Option<String>, (StatusCode, String)> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value.len() > max_len {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("value must be 1-{max_len} characters"),
                ));
            }
            Ok(value.to_string())
        })
        .transpose()
}

fn news_route_id(value: &str, field: &str) -> Result<String, (StatusCode, String)> {
    let value = news_required_text(Some(value), field, MAX_NEWS_ROUTE_ID_LEN)?;
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | ':' | '.'))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} contains unsupported characters"),
        ));
    }
    Ok(value)
}

fn bounded_json_array(
    body: &Value,
    field: &str,
    max_len: usize,
) -> Result<Value, (StatusCode, String)> {
    let Some(value) = body.get(field) else {
        return Ok(json!([]));
    };
    let Some(items) = value.as_array() else {
        return Err((StatusCode::BAD_REQUEST, format!("{field} must be an array")));
    };
    if items.len() > max_len {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} can include at most {max_len} items"),
        ));
    }
    Ok(Value::Array(items.clone()))
}

fn serialize_bounded_json_array(
    body: &Value,
    field: &str,
    max_len: usize,
) -> Result<String, (StatusCode, String)> {
    serde_json::to_string(&bounded_json_array(body, field, max_len)?).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to encode news array".to_string(),
        )
    })
}

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

    let label = news_required_text(body["label"].as_str(), "label", MAX_NEWS_LABEL_LEN)?;
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
    let categories_value = bounded_json_array(&body, "categories", MAX_NEWS_CATEGORIES)?;
    let sources_value = bounded_json_array(&body, "sources", MAX_NEWS_SOURCES)?;
    let categories = serialize_bounded_json_array(&body, "categories", MAX_NEWS_CATEGORIES)?;
    let locality = news_optional_text(body["locality"].as_str(), MAX_NEWS_LOCALITY_LEN)?;
    let sources = serialize_bounded_json_array(&body, "sources", MAX_NEWS_SOURCES)?;
    let goal_id = news_optional_text(body["goal_id"].as_str(), MAX_NEWS_GOAL_ID_LEN)?;

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
        "categories": categories_value,
        "locality": locality,
        "granularity": granularity,
        "frequency": frequency,
        "sources": sources_value,
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
    let channel_id = news_route_id(&channel_id, "channel_id")?;

    if let Some(lbl) = body["label"].as_str() {
        let trimmed = lbl.trim();
        if trimmed.is_empty() || trimmed.len() > MAX_NEWS_LABEL_LEN {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("label must be 1-{MAX_NEWS_LABEL_LEN} characters"),
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
    let label = body["label"].as_str().map(|s| s.trim().to_string());
    let granularity = body["granularity"].as_str().map(|s| s.to_string());
    let frequency = body["frequency"].as_str().map(|s| s.to_string());
    let locality = news_optional_text(body["locality"].as_str(), MAX_NEWS_LOCALITY_LEN)?;
    let enabled = body["enabled"].as_bool();
    let categories_json = body
        .get("categories")
        .map(|_| serialize_bounded_json_array(&body, "categories", MAX_NEWS_CATEGORIES))
        .transpose()?;
    let sources_json = body
        .get("sources")
        .map(|_| serialize_bounded_json_array(&body, "sources", MAX_NEWS_SOURCES))
        .transpose()?;
    let goal_id = news_optional_text(body["goal_id"].as_str(), MAX_NEWS_GOAL_ID_LEN)?;

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
    let channel_id = news_route_id(&channel_id, "channel_id")?;
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
    let channel_id = news_route_id(&channel_id, "channel_id")?;
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

    let limit = news_feed_limit(params.get("limit").map(String::as_str));
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
    let item_id = news_route_id(&item_id, "item_id")?;
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
    let item_id = news_route_id(&item_id, "item_id")?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn news_feed_limit_is_bounded() {
        assert_eq!(news_feed_limit(None), DEFAULT_NEWS_FEED_LIMIT);
        assert_eq!(news_feed_limit(Some("-20")), 1);
        assert_eq!(news_feed_limit(Some("500")), MAX_NEWS_FEED_LIMIT);
        assert_eq!(news_feed_limit(Some("bad")), DEFAULT_NEWS_FEED_LIMIT);
    }

    #[test]
    fn news_route_ids_are_trimmed_and_bounded() {
        assert_eq!(
            news_route_id(" 01JNEWSCHANNEL ", "channel_id").expect("valid channel id"),
            "01JNEWSCHANNEL"
        );
        assert!(news_route_id("../escape", "channel_id").is_err());
        assert!(news_route_id(&"x".repeat(MAX_NEWS_ROUTE_ID_LEN + 1), "item_id").is_err());
    }

    #[test]
    fn news_text_fields_are_trimmed_and_bounded() {
        assert_eq!(
            news_required_text(Some(" Local brief "), "label", MAX_NEWS_LABEL_LEN)
                .expect("valid label"),
            "Local brief"
        );
        assert!(news_required_text(Some(" "), "label", MAX_NEWS_LABEL_LEN).is_err());
        assert!(
            news_optional_text(
                Some(&"x".repeat(MAX_NEWS_LOCALITY_LEN + 1)),
                MAX_NEWS_LOCALITY_LEN
            )
            .is_err()
        );
    }

    #[test]
    fn news_json_arrays_are_type_checked_and_bounded() {
        let body = json!({ "categories": ["ai"], "sources": ["https://example.com/feed"] });
        assert_eq!(
            bounded_json_array(&body, "categories", MAX_NEWS_CATEGORIES).expect("array"),
            json!(["ai"])
        );
        assert!(
            bounded_json_array(&json!({ "sources": "rss" }), "sources", MAX_NEWS_SOURCES).is_err()
        );
        assert!(
            bounded_json_array(
                &json!({ "sources": vec!["x"; MAX_NEWS_SOURCES + 1] }),
                "sources",
                MAX_NEWS_SOURCES
            )
            .is_err()
        );
    }
}
