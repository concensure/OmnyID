/*
 * @module-id: rust.server.social-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

const MAX_SOCIAL_CONTENT_LEN: usize = 10_000;
const MAX_SOCIAL_TITLE_LEN: usize = 160;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/social/posts", get(list_social_posts_http))
        .route("/social/suggestions", post(social_suggestions_http))
        .route("/social/publish", post(social_publish_http))
        .route(
            "/social/composer-message",
            get(social_composer_message_http),
        )
}

#[derive(serde::Deserialize)]
struct SocialSuggestionsRequest {
    platform: Option<String>,
    content: Option<String>,
}

#[derive(serde::Deserialize)]
struct SocialPublishRequest {
    platform: Option<String>,
    content: String,
    title: Option<String>,
}

fn normalize_social_platform(value: Option<String>) -> String {
    match value
        .as_deref()
        .unwrap_or("linkedin")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "x" | "twitter" => "x".to_string(),
        "bluesky" | "bsky" => "bluesky".to_string(),
        _ => "linkedin".to_string(),
    }
}

fn clean_social_content(value: String) -> Result<String, (StatusCode, String)> {
    let value = value.trim().to_string();
    if value.is_empty() || value.len() > MAX_SOCIAL_CONTENT_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("content must be 1-{MAX_SOCIAL_CONTENT_LEN} characters"),
        ));
    }
    Ok(value)
}

fn clean_social_optional_content(value: Option<String>) -> String {
    value
        .map(|value| value.trim().chars().take(MAX_SOCIAL_CONTENT_LEN).collect())
        .unwrap_or_default()
}

fn clean_social_title(value: Option<String>, content: &str) -> String {
    value
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| {
            content
                .lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("Social post")
                .trim()
                .to_string()
        })
        .chars()
        .take(MAX_SOCIAL_TITLE_LEN)
        .collect()
}

fn social_suggestion_items(platform: &str, content: &str) -> Vec<Value> {
    let lower = content.to_lowercase();
    let mut suggestions = Vec::new();

    if !content.trim().is_empty() && !content.contains('#') {
        suggestions.push(serde_json::json!({
            "id": "hashtags",
            "kind": "hashtag",
            "label": "Hashtags",
            "body": "Add 2-3 topic hashtags to improve discovery.",
            "action": "Add hashtags",
        }));
    }

    if platform == "linkedin" && content.len() < 180 {
        suggestions.push(serde_json::json!({
            "id": "linkedin-depth",
            "kind": "rewrite",
            "label": "Expand the hook",
            "body": "LinkedIn posts tend to perform better with a stronger opening and one concrete outcome.",
            "action": "Expand draft",
        }));
    }

    if platform == "x" && content.len() > 240 {
        suggestions.push(serde_json::json!({
            "id": "x-trim",
            "kind": "rewrite",
            "label": "Trim for X",
            "body": "This draft is approaching the X character limit. Tighten the opening and remove filler.",
            "action": "Shorten draft",
        }));
    }

    if lower.contains("launch") || lower.contains("release") || lower.contains("shipped") {
        suggestions.push(serde_json::json!({
            "id": "launch-tone",
            "kind": "tone",
            "label": "Outcome-first tone",
            "body": "Lead with the user impact first, then mention the launch details and team effort.",
        }));
    }

    suggestions.push(serde_json::json!({
        "id": "timing",
        "kind": "timing",
        "label": "Best time",
        "body": if platform == "linkedin" {
            "Weekday mornings usually perform best for LinkedIn updates."
        } else if platform == "x" {
            "Short posts often do best around commute hours or during live discussion windows."
        } else {
            "Bluesky engagement often improves when the post is concise and sent close to the discussion moment."
        },
    }));

    suggestions
}

fn social_post_rows_for_user(
    user_id: &str,
    master_agent_id: &str,
    messages: Vec<Value>,
) -> Vec<Value> {
    messages
        .into_iter()
        .filter(|message| {
            let content = message["content"].as_object();
            let publisher_user_id = content
                .and_then(|entry| entry.get("publisher_user_id"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let from_agent = message["from_agent"].as_str().unwrap_or_default();
            publisher_user_id == user_id || from_agent == master_agent_id
        })
        .map(|message| {
            let content = message["content"].as_object().cloned().unwrap_or_default();
            let body = content
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let platform = content
                .get("platform")
                .and_then(Value::as_str)
                .unwrap_or("linkedin");
            serde_json::json!({
                "id": message["id"].as_str().unwrap_or_default(),
                "platform": platform,
                "content": body,
                "publishedAt": message["timestamp"].as_str().unwrap_or_default(),
                "likes": 0,
                "reposts": 0,
                "replies": 0,
            })
        })
        .collect::<Vec<_>>()
}

async fn list_social_posts_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let master_agent_id = instance
        .as_ref()
        .and_then(|row| row["id"].as_str())
        .unwrap_or(&user.id)
        .to_string();

    let messages = state
        .db
        .list_public_messages(100, None)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let posts = social_post_rows_for_user(&user.id, &master_agent_id, messages);

    Ok(Json(serde_json::json!({ "posts": posts })))
}

async fn social_suggestions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SocialSuggestionsRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let platform = normalize_social_platform(body.platform);
    let content = clean_social_optional_content(body.content);
    let suggestions = social_suggestion_items(&platform, &content);
    Ok(Json(serde_json::json!({ "suggestions": suggestions })))
}

async fn social_composer_message_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let master_agent_id = instance
        .as_ref()
        .and_then(|row| row["id"].as_str())
        .unwrap_or(&user.id)
        .to_string();
    let platform = normalize_social_platform(params.get("platform").cloned());
    let content = clean_social_optional_content(params.get("content").cloned());
    let suggestions = social_suggestion_items(&platform, &content);
    let public_messages = state
        .db
        .list_public_messages(12, None)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let posts = social_post_rows_for_user(&user.id, &master_agent_id, public_messages);
    let title = clean_social_title(params.get("title").cloned(), "Social post draft");
    let platforms = vec![
        "LinkedIn".to_string(),
        "X".to_string(),
        "Bluesky".to_string(),
    ];
    let previews = platforms
        .iter()
        .map(|entry| {
            serde_json::json!({
                "platform": entry,
                "body": content,
                "status": "Preview",
            })
        })
        .collect::<Vec<_>>();
    let message = crate::ui_surface_messages::build_social_surface_message(
        "social_routes",
        &title,
        "Live social composer state",
        &content,
        &platforms,
        &suggestions,
        &previews,
    );
    Ok(Json(serde_json::json!({
        "message": message,
        "posts": posts,
    })))
}

async fn social_publish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SocialPublishRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let content = clean_social_content(body.content)?;

    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let from_agent = instance
        .as_ref()
        .and_then(|row| row["id"].as_str())
        .unwrap_or(&user.id)
        .to_string();

    let platform = normalize_social_platform(body.platform);
    let title = clean_social_title(body.title, &content);
    let source_message_id = format!("social:{}", Ulid::new());
    let id = state
        .db
        .publish_to_plaza(&user.id, &source_message_id, &from_agent, &title, &content)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "id": id,
        "published": true,
        "post": {
            "id": id,
            "platform": platform,
            "content": content,
            "publishedAt": chrono::Utc::now().to_rfc3339(),
            "likes": 0,
            "reposts": 0,
            "replies": 0,
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_SOCIAL_CONTENT_LEN, MAX_SOCIAL_TITLE_LEN, clean_social_content,
        clean_social_optional_content, clean_social_title, normalize_social_platform,
        social_post_rows_for_user, social_suggestion_items,
    };

    #[test]
    fn suggestions_include_timing_guidance() {
        let suggestions = social_suggestion_items("linkedin", "We shipped a launch update");
        assert!(
            suggestions
                .iter()
                .any(|item| item["kind"].as_str() == Some("timing"))
        );
    }

    #[test]
    fn x_suggestions_warn_when_draft_is_long() {
        let content = "x".repeat(250);
        let suggestions = social_suggestion_items("x", &content);
        assert!(
            suggestions
                .iter()
                .any(|item| item["id"].as_str() == Some("x-trim"))
        );
    }

    #[test]
    fn social_posts_filter_by_user_or_master_agent() {
        let rows = social_post_rows_for_user(
            "user-1",
            "agent-1",
            vec![
                serde_json::json!({
                    "id": "keep-user",
                    "from_agent": "someone-else",
                    "timestamp": "2026-05-28T00:00:00Z",
                    "content": { "publisher_user_id": "user-1", "body": "A", "platform": "linkedin" }
                }),
                serde_json::json!({
                    "id": "keep-agent",
                    "from_agent": "agent-1",
                    "timestamp": "2026-05-28T00:00:00Z",
                    "content": { "publisher_user_id": "other", "body": "B", "platform": "x" }
                }),
                serde_json::json!({
                    "id": "drop",
                    "from_agent": "agent-9",
                    "timestamp": "2026-05-28T00:00:00Z",
                    "content": { "publisher_user_id": "other", "body": "C", "platform": "x" }
                }),
            ],
        );
        assert_eq!(rows.len(), 2);
    }

    #[test]
    fn social_inputs_are_normalized_and_bounded() {
        assert_eq!(
            normalize_social_platform(Some(" Twitter ".to_string())),
            "x"
        );
        assert_eq!(
            normalize_social_platform(Some("BSKY".to_string())),
            "bluesky"
        );
        assert_eq!(
            normalize_social_platform(Some("unknown".to_string())),
            "linkedin"
        );
        assert_eq!(
            clean_social_content(" hello ".to_string()).expect("content"),
            "hello"
        );
        assert!(clean_social_content(" ".to_string()).is_err());
        assert!(clean_social_content("x".repeat(MAX_SOCIAL_CONTENT_LEN + 1)).is_err());
        assert_eq!(
            clean_social_optional_content(Some(" x ".to_string())),
            "x".to_string()
        );
        assert_eq!(
            clean_social_title(Some(" title ".to_string()), "fallback"),
            "title".to_string()
        );
        assert_eq!(
            clean_social_title(None, &"x".repeat(MAX_SOCIAL_TITLE_LEN + 50)).len(),
            MAX_SOCIAL_TITLE_LEN
        );
    }
}
