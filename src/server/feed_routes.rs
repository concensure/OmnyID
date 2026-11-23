/*
 * @module-id: rust.server.feed-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

const DEFAULT_PUBLIC_FEED_LIMIT: i64 = 20;
const MAX_PUBLIC_FEED_LIMIT: i64 = 100;
const DEFAULT_FEED_SEARCH_LIMIT: i64 = 20;
const MAX_FEED_SEARCH_LIMIT: i64 = 50;
const MAX_FEED_QUERY_LEN: usize = 200;
const MAX_FEED_MESSAGE_ID_LEN: usize = 128;
const MAX_FEED_AGENT_ID_LEN: usize = 128;
const MAX_FEED_TITLE_LEN: usize = 160;
const MAX_FEED_BODY_LEN: usize = 20_000;

fn feed_limit(value: Option<&str>, default: i64, max: i64) -> i64 {
    value
        .and_then(|value| value.trim().parse::<i64>().ok())
        .unwrap_or(default)
        .clamp(1, max)
}

fn feed_required_text(
    value: &str,
    field: &str,
    max_len: usize,
) -> Result<String, (StatusCode, String)> {
    let value = value.trim();
    if value.is_empty() || value.len() > max_len {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} must be 1-{max_len} characters"),
        ));
    }
    Ok(value.to_string())
}

fn feed_identifier(
    value: &str,
    field: &str,
    max_len: usize,
) -> Result<String, (StatusCode, String)> {
    let value = feed_required_text(value, field, max_len)?;
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | ':' | '@' | '.'))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} contains unsupported characters"),
        ));
    }
    Ok(value)
}

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

    let limit = feed_limit(
        params.get("limit").map(String::as_str),
        DEFAULT_PUBLIC_FEED_LIMIT,
        MAX_PUBLIC_FEED_LIMIT,
    );
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
        .chars()
        .take(MAX_FEED_QUERY_LEN)
        .collect::<String>()
        .trim()
        .to_string();
    if q.is_empty() {
        return Ok(Json(serde_json::json!({"agents": []})));
    }
    let limit = feed_limit(
        params.get("limit").map(String::as_str),
        DEFAULT_FEED_SEARCH_LIMIT,
        MAX_FEED_SEARCH_LIMIT,
    );
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
    let agent_id = feed_identifier(&agent_id, "agent_id", MAX_FEED_AGENT_ID_LEN)?;
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
    let agent_id = feed_identifier(&agent_id, "agent_id", MAX_FEED_AGENT_ID_LEN)?;
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
    let message_id = feed_identifier(&body.message_id, "message_id", MAX_FEED_MESSAGE_ID_LEN)?;
    let title = feed_required_text(&body.title, "title", MAX_FEED_TITLE_LEN)?;
    let body_text = feed_required_text(&body.body, "body", MAX_FEED_BODY_LEN)?;
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
        .publish_to_plaza(&user.id, &message_id, &from_agent, &title, &body_text)
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
    let message_id = feed_identifier(&body.message_id, "message_id", MAX_FEED_MESSAGE_ID_LEN)?;
    let valid_types = ["view", "share", "reply"];
    if !valid_types.contains(&body.engagement_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "type must be view, share, or reply".to_string(),
        ));
    }
    state
        .db
        .record_engagement(&user.id, &message_id, &body.engagement_type)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feed_limits_are_bounded() {
        assert_eq!(
            feed_limit(None, DEFAULT_PUBLIC_FEED_LIMIT, MAX_PUBLIC_FEED_LIMIT),
            20
        );
        assert_eq!(
            feed_limit(
                Some("-50"),
                DEFAULT_PUBLIC_FEED_LIMIT,
                MAX_PUBLIC_FEED_LIMIT
            ),
            1
        );
        assert_eq!(
            feed_limit(
                Some("500"),
                DEFAULT_PUBLIC_FEED_LIMIT,
                MAX_PUBLIC_FEED_LIMIT
            ),
            100
        );
        assert_eq!(
            feed_limit(
                Some("bad"),
                DEFAULT_FEED_SEARCH_LIMIT,
                MAX_FEED_SEARCH_LIMIT
            ),
            20
        );
    }

    #[test]
    fn feed_identifiers_are_trimmed_and_bounded() {
        assert_eq!(
            feed_identifier(
                " agent:demo@example.com ",
                "agent_id",
                MAX_FEED_AGENT_ID_LEN
            )
            .expect("valid id"),
            "agent:demo@example.com"
        );
        assert!(feed_identifier("../escape", "agent_id", MAX_FEED_AGENT_ID_LEN).is_err());
        assert!(
            feed_identifier(
                &"x".repeat(MAX_FEED_MESSAGE_ID_LEN + 1),
                "message_id",
                MAX_FEED_MESSAGE_ID_LEN
            )
            .is_err()
        );
    }

    #[test]
    fn feed_required_text_is_trimmed_and_bounded() {
        assert_eq!(
            feed_required_text(" hello ", "title", MAX_FEED_TITLE_LEN).expect("title"),
            "hello"
        );
        assert!(feed_required_text("   ", "title", MAX_FEED_TITLE_LEN).is_err());
        assert!(
            feed_required_text(
                &"x".repeat(MAX_FEED_TITLE_LEN + 1),
                "title",
                MAX_FEED_TITLE_LEN
            )
            .is_err()
        );
    }
}
