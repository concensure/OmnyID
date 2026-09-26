/*
 * @module-id: rust.server.feed-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/feed/public", get(public_feed_http))
        .route("/feed/publish", post(feed_publish_http))
        .route("/feed/search", get(feed_search_http))
        .route(
            "/feed/follow/{agent_id}",
            post(feed_follow_http).delete(feed_unfollow_http),
        )
        .route("/feed/following", get(feed_following_http))
        .route("/feed/engage", post(feed_engage_http))
}

/// GET /feed/public
/// Rate-limited for unauthenticated callers (10 req/min per IP).
async fn public_feed_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Stricter rate limit for unauthenticated access
    if authenticated_user(&state.db, &headers).await.is_err() {
        enforce_rate_limit(
            &state,
            public_rate_limit_key("public_feed", &headers),
            RateLimitPolicy {
                max_requests: 10,
                window: std::time::Duration::from_secs(60),
            },
        )
        .await?;
    }

    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(100);
    let before_id = params.get("before_id").map(String::as_str);
    let messages = state
        .db
        .list_public_messages(limit, before_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = messages.len();
    Ok(Json(serde_json::json!({"items": messages, "count": count})))
}

/// GET /feed/search?q=&limit=
async fn feed_search_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let q = params
        .get("q")
        .map(String::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if q.is_empty() {
        return Ok(Json(serde_json::json!({"agents": []})));
    }
    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);
    let agents = state
        .db
        .search_agents(&user.id, &q, limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"agents": agents})))
}

/// POST /feed/follow/{agent_id}
async fn feed_follow_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .follow_agent(&user.id, &agent_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /feed/follow/{agent_id}
async fn feed_unfollow_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .unfollow_agent(&user.id, &agent_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /feed/following
async fn feed_following_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let follows = state
        .db
        .list_following(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"following": follows})))
}

#[derive(serde::Deserialize)]
struct EngageRequest {
    message_id: String,
    #[serde(rename = "type")]
    engagement_type: String,
}

/// POST /feed/publish  â€” publish a message to Plaza as a public_article
#[derive(serde::Deserialize)]
struct PublishRequest {
    message_id: String,
    title: String,
    body: String,
}

async fn feed_publish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PublishRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let from_agent = instance
        .as_ref()
        .and_then(|i| i["id"].as_str())
        .unwrap_or(&user.id)
        .to_string();
    let id = state
        .db
        .publish_to_plaza(
            &user.id,
            &body.message_id,
            &from_agent,
            &body.title,
            &body.body,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "id": id, "published": true })))
}

/// POST /feed/engage
async fn feed_engage_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<EngageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let valid_types = ["view", "share", "reply"];
    if !valid_types.contains(&body.engagement_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "type must be view, share, or reply".to_string(),
        ));
    }
    state
        .db
        .record_engagement(&user.id, &body.message_id, &body.engagement_type)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}
