/*
 * @module-id: rust.server.space-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use crate::spaces::SpaceManager;

const MAX_SPACE_NAME_LEN: usize = 120;
const MAX_SPACE_DESCRIPTION_LEN: usize = 1000;
const MAX_SPACE_MESSAGE_ID_LEN: usize = 128;
const MAX_SPACE_AGENT_ID_LEN: usize = 128;
const MAX_SPACE_MESSAGE_TYPE_LEN: usize = 64;
const MAX_SPACE_SUBTYPE_LEN: usize = 64;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/spaces", get(list_spaces_http).post(create_space_http))
        .route("/spaces/{id}", get(get_space_http))
        .route("/spaces/{id}/join", post(join_space_http))
        .route("/spaces/{id}/leave", post(leave_space_http))
        .route(
            "/spaces/{id}/messages",
            get(list_space_messages_http).post(post_space_message_http),
        )
        .route("/spaces/{id}/members", get(list_space_members_http))
        .route("/spaces/{id}/feed-card", get(space_feed_card_http))
        .route("/spaces/{id}/feed-message", get(space_feed_message_http))
}

fn space_manager(state: &Arc<AppState>) -> SpaceManager {
    SpaceManager::new(state.db.pool.clone())
}

fn space_messages_limit(raw: Option<&str>) -> i64 {
    raw.and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(50)
        .clamp(1, 200)
}

fn clean_space_required(
    value: String,
    label: &str,
    max_len: usize,
) -> Result<String, (StatusCode, String)> {
    let value = value.trim().to_string();
    if value.is_empty() || value.len() > max_len {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{label} must be 1-{max_len} characters"),
        ));
    }
    Ok(value)
}

fn clean_space_optional(
    value: Option<String>,
    max_len: usize,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(value) = value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    if value.len() > max_len {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("optional field must be 1-{max_len} characters"),
        ));
    }
    Ok(Some(value))
}

fn space_feed_member_rows(members: &[crate::spaces::SpaceMember]) -> Vec<Value> {
    members
        .iter()
        .map(|member| {
            serde_json::json!({
                "user_id": member.user_id,
                "role": member.role,
                "name": member.user_id,
            })
        })
        .collect()
}

fn space_feed_message_rows(messages: &[crate::spaces::SpaceMessage]) -> Vec<Value> {
    messages
        .iter()
        .map(|message| {
            serde_json::json!({
                "author": if message.from_agent.is_empty() {
                    message.author_user_id.clone()
                } else {
                    message.from_agent.clone()
                },
                "body": message.content.get("text").and_then(Value::as_str)
                    .or_else(|| message.content.get("html").and_then(Value::as_str))
                    .unwrap_or_default(),
                "type": message.r#type,
                "timestamp": message.created_at,
            })
        })
        .collect()
}

/// GET /spaces â€” list all spaces the user is a member of or owns
async fn list_spaces_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let spaces = space_manager(&state)
        .list_spaces_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = spaces.len();
    Ok(Json(
        serde_json::json!({ "spaces": spaces, "count": count }),
    ))
}

/// POST /spaces â€” create a new space
#[derive(serde::Deserialize)]
struct CreateSpaceRequest {
    name: String,
    description: Option<String>,
    #[serde(default)]
    is_public: bool,
}

async fn create_space_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateSpaceRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let name = clean_space_required(body.name, "name", MAX_SPACE_NAME_LEN)?;
    let description = clean_space_optional(body.description, MAX_SPACE_DESCRIPTION_LEN)?;
    let space = space_manager(&state)
        .create_space(&user.id, &name, description.as_deref(), body.is_public)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "space": space })))
}

/// GET /spaces/:id
async fn get_space_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let space = space_manager(&state)
        .get_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "space not found".to_string()))?;
    Ok(Json(serde_json::json!({ "space": space })))
}

/// POST /spaces/:id/join
async fn join_space_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    // Verify space is accessible (public or already member)
    let space = space_manager(&state)
        .get_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "space not found".to_string()))?;
    if !space.is_public && space.owner_user_id != user.id {
        return Err((StatusCode::FORBIDDEN, "space is private".to_string()));
    }
    let member = space_manager(&state)
        .join_space(&id, &user.id, None)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "member": member })))
}

/// POST /spaces/:id/leave
async fn leave_space_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let removed = space_manager(&state)
        .leave_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "removed": removed })))
}

/// GET /spaces/:id/messages
async fn list_space_messages_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let manager = space_manager(&state);
    // Authorization gate: get_space enforces owner/member/public membership in SQL.
    // Returns None (â†’ 403) if the authenticated user has no access to this space.
    manager
        .get_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::FORBIDDEN,
                "space not found or access denied".to_string(),
            )
        })?;
    let limit = space_messages_limit(params.get("limit").map(String::as_str));
    let before_id = params.get("before_id").map(String::as_str);
    let messages = manager
        .list_messages(&id, &user.id, limit, before_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = messages.len();
    Ok(Json(
        serde_json::json!({ "messages": messages, "count": count }),
    ))
}

/// POST /spaces/:id/messages
#[derive(serde::Deserialize)]
struct PostSpaceMessageRequest {
    afp_message_id: String,
    from_agent: String,
    #[serde(rename = "type")]
    msg_type: String,
    subtype: Option<String>,
    content: serde_json::Value,
}

async fn post_space_message_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<PostSpaceMessageRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let manager = space_manager(&state);
    // Authorization gate: verify the user can access this space at all.
    let space = manager
        .get_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::FORBIDDEN,
                "space not found or access denied".to_string(),
            )
        })?;
    // Posting requires membership â€” viewing a public space is not enough.
    // The owner is always allowed; for everyone else check the members table.
    if space.owner_user_id != user.id {
        let members = manager
            .list_members(&id, &user.id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        if !members.iter().any(|m| m.user_id == user.id) {
            return Err((
                StatusCode::FORBIDDEN,
                "you must be a member to post to this space".to_string(),
            ));
        }
    }
    let afp_message_id = clean_space_required(
        body.afp_message_id,
        "afp_message_id",
        MAX_SPACE_MESSAGE_ID_LEN,
    )?;
    let from_agent = clean_space_required(body.from_agent, "from_agent", MAX_SPACE_AGENT_ID_LEN)?;
    let msg_type = clean_space_required(body.msg_type, "type", MAX_SPACE_MESSAGE_TYPE_LEN)?;
    let subtype = clean_space_optional(body.subtype, MAX_SPACE_SUBTYPE_LEN)?;
    let msg = manager
        .post_message(
            &id,
            &afp_message_id,
            &from_agent,
            &user.id,
            &msg_type,
            subtype.as_deref(),
            body.content,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "message": msg })))
}

/// GET /spaces/:id/members
async fn list_space_members_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let manager = space_manager(&state);
    // Authorization gate: get_space enforces owner/member/public membership in SQL.
    manager
        .get_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::FORBIDDEN,
                "space not found or access denied".to_string(),
            )
        })?;
    let members = manager
        .list_members(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = members.len();
    Ok(Json(
        serde_json::json!({ "members": members, "count": count }),
    ))
}

/// GET /spaces/:id/feed-card â€” return a live A2UI `space_feed` card built from current state.
async fn space_feed_card_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let manager = space_manager(&state);
    let space = manager
        .get_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "space not found".to_string()))?;
    let members = manager
        .list_members(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let messages = manager
        .list_messages(&id, &user.id, 25, None)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let member_rows = space_feed_member_rows(&members);
    let message_rows = space_feed_message_rows(&messages);

    let content = serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": space.name,
        "description": space.description,
        "components": [
            {
                "type": "space_feed",
                "props": {
                    "space_id": space.id,
                    "space_name": space.name,
                    "space_description": space.description,
                    "can_post": true,
                    "composer_placeholder": "Write an update to this space...",
                    "members": member_rows,
                    "messages": message_rows,
                }
            }
        ]
    });

    Ok(Json(serde_json::json!({
        "view_id": format!("space_feed:{}", id),
        "format": "a2ui.v1",
        "content": content,
    })))
}

/// GET /spaces/:id/feed-message â€” return a live AFP `a2ui_render` message for the space feed.
async fn space_feed_message_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let manager = space_manager(&state);
    let space = manager
        .get_space(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "space not found".to_string()))?;
    let members = manager
        .list_members(&id, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let messages = manager
        .list_messages(&id, &user.id, 25, None)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let message = crate::ui_surface_messages::build_space_feed_surface_message(
        "space_routes",
        &space.name,
        space.description.as_deref().unwrap_or("Shared space feed"),
        &space.name,
        Some(&space.id),
        &space_feed_member_rows(&members),
        &space_feed_message_rows(&messages),
        true,
    );
    Ok(Json(serde_json::json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_SPACE_AGENT_ID_LEN, clean_space_optional, clean_space_required, space_feed_member_rows,
        space_feed_message_rows, space_messages_limit,
    };

    #[test]
    fn feed_member_rows_preserve_roles() {
        let rows = space_feed_member_rows(&[crate::spaces::SpaceMember {
            id: "member-1".to_string(),
            space_id: "space-1".to_string(),
            user_id: "user-1".to_string(),
            agent_id: None,
            role: "host".to_string(),
            joined_at: "2026-05-28T00:00:00Z".to_string(),
            invited_by: None,
        }]);
        assert_eq!(rows[0]["role"].as_str(), Some("host"));
    }

    #[test]
    fn feed_message_rows_prefer_agent_name_when_present() {
        let rows = space_feed_message_rows(&[crate::spaces::SpaceMessage {
            id: "msg-1".to_string(),
            space_id: "space-1".to_string(),
            afp_message_id: "afp-1".to_string(),
            from_agent: "master-agent".to_string(),
            author_user_id: "user-1".to_string(),
            r#type: "update".to_string(),
            subtype: None,
            content: serde_json::json!({ "text": "Kickoff" }),
            created_at: "2026-05-28T00:00:00Z".to_string(),
        }]);
        assert_eq!(rows[0]["author"].as_str(), Some("master-agent"));
        assert_eq!(rows[0]["body"].as_str(), Some("Kickoff"));
    }

    #[test]
    fn space_messages_limit_is_bounded() {
        assert_eq!(space_messages_limit(None), 50);
        assert_eq!(space_messages_limit(Some("0")), 1);
        assert_eq!(space_messages_limit(Some("-2")), 1);
        assert_eq!(space_messages_limit(Some("80")), 80);
        assert_eq!(space_messages_limit(Some("5000")), 200);
    }

    #[test]
    fn space_string_inputs_are_trimmed_and_bounded() {
        assert_eq!(
            clean_space_required(
                " agent-1 ".to_string(),
                "from_agent",
                MAX_SPACE_AGENT_ID_LEN
            )
            .expect("agent id"),
            "agent-1"
        );
        assert!(
            clean_space_required(" ".to_string(), "from_agent", MAX_SPACE_AGENT_ID_LEN).is_err()
        );
        assert!(
            clean_space_required(
                "x".repeat(MAX_SPACE_AGENT_ID_LEN + 1),
                "from_agent",
                MAX_SPACE_AGENT_ID_LEN
            )
            .is_err()
        );
        assert_eq!(
            clean_space_optional(Some(" desc ".to_string()), 20).expect("description"),
            Some("desc".to_string())
        );
        assert_eq!(
            clean_space_optional(Some(" ".to_string()), 20).expect("blank"),
            None
        );
    }
}
