/*
 * @module-id: rust.ui-surface-messages
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use crate::message::AFPMessage;
use serde_json::{Value, json};
use ulid::Ulid;

pub fn surface_message_base(intent: &str, origin: &str) -> AFPMessage {
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: format!("surface.{intent}.{}", Ulid::new()),
        thread_id: format!("thread.surface.{intent}.{}", Ulid::new()),
        parent_id: None,
        from: "omnyid://surface-builder".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some("a2ui_render".to_string()),
        content: Value::Null,
        metadata: Some(json!({
            "origin": origin,
            "intent": intent,
        })),
        signature: String::new(),
        encryption: None,
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    }
}

pub fn build_social_surface_message(
    origin: &str,
    title: &str,
    description: &str,
    draft_text: &str,
    platforms: &[String],
    suggestions: &[Value],
    previews: &[Value],
) -> AFPMessage {
    let mut message = surface_message_base("social", origin);
    let content = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": description,
        "components": [
            {
                "type": "social_composer",
                "props": {
                    "title": title,
                    "description": description,
                    "draft_text": draft_text,
                    "selected_platform": platforms.first().map(|platform| platform.to_lowercase()).unwrap_or_else(|| "linkedin".to_string()),
                    "platforms": platforms,
                    "suggestions": suggestions,
                    "preview": previews,
                }
            }
        ]
    });
    message.content = content.clone();
    message.views = vec![json!({
        "format": "a2ui.v1",
        "priority": 100,
        "content": content,
    })];
    message
}

pub fn build_space_feed_surface_message(
    origin: &str,
    title: &str,
    description: &str,
    space_name: &str,
    space_id: Option<&str>,
    members: &[Value],
    messages: &[Value],
    can_post: bool,
) -> AFPMessage {
    let mut message = surface_message_base("spaces", origin);
    let content = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": description,
        "components": [
            {
                "type": "space_feed",
                "props": {
                    "title": title,
                    "space_id": space_id.unwrap_or_default(),
                    "space_name": space_name,
                    "space_description": description,
                    "can_post": can_post,
                    "composer_placeholder": "Write an update to this space...",
                    "members": members,
                    "messages": messages,
                }
            }
        ]
    });
    message.content = content.clone();
    message.views = vec![json!({
        "format": "a2ui.v1",
        "priority": 100,
        "content": content,
    })];
    message
}

pub fn build_route_card_surface_message(
    origin: &str,
    title: &str,
    description: &str,
    route_id: Option<&str>,
    metrics: &[Value],
    tradeoffs: &[Value],
    assumptions: &[String],
    notes: &[String],
    actions: &[String],
    confidence: Option<f64>,
    copy_text: Option<&str>,
    share_url: Option<&str>,
) -> AFPMessage {
    let mut message = surface_message_base("route", origin);
    let content = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": description,
        "components": [
            {
                "type": "route_card",
                "props": {
                    "route_id": route_id.unwrap_or_default(),
                    "title": title,
                    "summary": description,
                    "metrics": metrics,
                    "tradeoffs": tradeoffs,
                    "assumptions": assumptions,
                    "dependency_notes": notes,
                    "actions": actions,
                    "confidence": confidence,
                    "copy_text": copy_text.unwrap_or_default(),
                    "share_url": share_url.unwrap_or_default(),
                }
            }
        ]
    });
    message.content = content.clone();
    message.views = vec![json!({
        "format": "a2ui.v1",
        "priority": 100,
        "content": content,
    })];
    message
}

pub fn build_comparison_table_surface_message(
    origin: &str,
    title: &str,
    description: &str,
    columns: &[String],
    rows: &[Value],
) -> AFPMessage {
    let mut message = surface_message_base("comparison", origin);
    let content = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": description,
        "components": [
            {
                "type": "comparison_table",
                "props": {
                    "title": title,
                    "description": description,
                    "columns": columns,
                    "rows": rows,
                }
            }
        ]
    });
    message.content = content.clone();
    message.views = vec![json!({
        "format": "a2ui.v1",
        "priority": 100,
        "content": content,
    })];
    message
}

#[cfg(test)]
mod tests {
    use super::{
        build_comparison_table_surface_message, build_route_card_surface_message,
        build_social_surface_message, build_space_feed_surface_message,
    };
    use serde_json::json;

    #[test]
    fn social_surface_message_uses_social_component() {
        let message = build_social_surface_message(
            "test",
            "Launch post",
            "Prepared draft",
            "We shipped.",
            &["LinkedIn".to_string()],
            &[json!("Tone: confident")],
            &[json!({"platform": "LinkedIn", "body": "We shipped."})],
        );
        assert_eq!(message.subtype.as_deref(), Some("a2ui_render"));
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("social_composer")
        );
    }

    #[test]
    fn space_surface_message_uses_space_feed_component() {
        let message = build_space_feed_surface_message(
            "test",
            "War room",
            "Shared launch space",
            "War room",
            Some("space-1"),
            &[json!({"name": "You"})],
            &[json!({"author": "Master Agent", "body": "Kickoff"})],
            true,
        );
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("space_feed")
        );
    }

    #[test]
    fn route_surface_message_uses_route_card_component() {
        let message = build_route_card_surface_message(
            "test",
            "Fastest route",
            "Best option for the current commute.",
            Some("route-1"),
            &[json!({"label": "Duration", "value": "18 mins"})],
            &[json!({"title": "Trade-off", "body": "Includes tolls"})],
            &["Traffic stays stable".to_string()],
            &["Parking near destination".to_string()],
            &["copy".to_string(), "share".to_string()],
            Some(0.82),
            Some("Shareable route summary"),
            Some("https://example.com/route"),
        );
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("route_card")
        );
    }

    #[test]
    fn comparison_surface_message_uses_comparison_table_component() {
        let message = build_comparison_table_surface_message(
            "test",
            "Mode comparison",
            "Compare route options.",
            &["Driving".to_string(), "Walking".to_string()],
            &[json!({
                "label": "Duration",
                "values": ["18 mins", "42 mins"],
                "winner": false
            })],
        );
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("comparison_table")
        );
    }
}
