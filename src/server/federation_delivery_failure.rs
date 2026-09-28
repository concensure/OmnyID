/*
 * @module-id: rust.server.federation-delivery-failure
 * @primary-capability: rust.server-federation-delivery-proof
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use crate::message::AFPMessage;
use ulid::Ulid;

pub(super) const FEDERATION_DELIVERY_ERROR_MAX_CHARS: usize = 1_000;
const FEDERATION_DELIVERY_ERROR_TRUNCATED_SUFFIX: &str = " ... [truncated]";

pub(super) fn federation_delivery_error_summary(error_message: &str) -> String {
    let normalized = error_message
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let normalized = if normalized.is_empty() {
        "unknown federation delivery error".to_string()
    } else {
        normalized
    };

    if normalized.chars().count() <= FEDERATION_DELIVERY_ERROR_MAX_CHARS {
        return normalized;
    }

    let keep_chars = FEDERATION_DELIVERY_ERROR_MAX_CHARS
        .saturating_sub(FEDERATION_DELIVERY_ERROR_TRUNCATED_SUFFIX.chars().count());
    let mut truncated = normalized.chars().take(keep_chars).collect::<String>();
    truncated.push_str(FEDERATION_DELIVERY_ERROR_TRUNCATED_SUFFIX);
    truncated
}

fn federation_delivery_thread_id(request_thread_id: &str) -> (String, Option<String>) {
    let trimmed = request_thread_id.trim();
    if Ulid::from_string(trimmed).is_ok() {
        return (trimmed.to_string(), None);
    }
    (Ulid::new().to_string(), Some(trimmed.to_string()))
}

pub(super) fn build_federated_agent_message(
    from_agent_id: &str,
    recipient_agent_id: &str,
    request_thread_id: &str,
    subject: &str,
    body: &str,
    sender_user_id: &str,
) -> AFPMessage {
    let (delivery_thread_id, source_thread_id) = federation_delivery_thread_id(request_thread_id);
    let mut content = serde_json::json!({
        "subject": subject,
        "body": body,
        "recipient_agent_id": recipient_agent_id,
        "delivery_thread_id": delivery_thread_id,
        "delivery_status": "pending_relay",
    });
    if let Some(source_thread_id) = source_thread_id.as_deref() {
        content["source_thread_id"] = serde_json::json!(source_thread_id);
    }

    let mut metadata = serde_json::json!({
        "origin": "thread_federation_compose",
        "source": "federation",
        "delivery": "outbound",
        "delivery_status": "pending_relay",
        "sender_user_id": sender_user_id,
    });
    if let Some(source_thread_id) = source_thread_id.as_deref() {
        metadata["source_thread_id"] = serde_json::json!(source_thread_id);
        metadata["delivery_thread_id"] = serde_json::json!(delivery_thread_id);
    }

    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: Ulid::new().to_string(),
        thread_id: delivery_thread_id,
        parent_id: None,
        from: from_agent_id.to_string(),
        to: vec![recipient_agent_id.to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent_message".to_string(),
        kind: Some("communication".to_string()),
        supertags: vec!["federation".to_string(), "agent_to_agent".to_string()],
        subtype: Some("federated_outbound".to_string()),
        content,
        metadata: Some(metadata),
        signature: String::new(),
        encryption: None,
        views: vec![serde_json::json!({
            "format": "rich_text",
            "priority": 1,
            "content": {
                "markdown": format!("### Federated message to `{}`\n\n{}", recipient_agent_id, body)
            }
        })],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    }
}

pub(super) fn build_federated_delivery_failure_message(
    attempted_message: &AFPMessage,
    error_message: &str,
) -> AFPMessage {
    let error_summary = federation_delivery_error_summary(error_message);
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: Ulid::new().to_string(),
        thread_id: attempted_message.thread_id.clone(),
        parent_id: Some(attempted_message.id.clone()),
        from: attempted_message.from.clone(),
        to: attempted_message.to.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent_message".to_string(),
        kind: Some("communication".to_string()),
        supertags: vec!["federation".to_string(), "delivery_failed".to_string()],
        subtype: Some("federated_delivery_failed".to_string()),
        content: serde_json::json!({
            "title": "Federated delivery failed",
            "body": "The homeserver could not deliver this agent-to-agent message.",
            "attempted_message_id": attempted_message.id,
            "recipient_agent_ids": attempted_message.to,
            "error": error_summary.clone(),
        }),
        metadata: Some(serde_json::json!({
            "origin": "thread_federation_compose",
            "source": "federation",
            "delivery": "failed",
            "attempted_message_id": attempted_message.id,
        })),
        signature: String::new(),
        encryption: None,
        views: vec![serde_json::json!({
            "format": "rich_text",
            "priority": 1,
            "content": {
                "markdown": format!(
                    "### Federated delivery failed\n\nThe homeserver could not deliver this agent-to-agent message.\n\n`{}`",
                    error_summary
                )
            }
        })],
        references: vec![serde_json::json!({
            "type": "delivery_attempt",
            "target": attempted_message.id
        })],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    }
}

pub(super) fn build_federated_delivery_sent_message(attempted_message: &AFPMessage) -> AFPMessage {
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: Ulid::new().to_string(),
        thread_id: attempted_message.thread_id.clone(),
        parent_id: Some(attempted_message.id.clone()),
        from: attempted_message.from.clone(),
        to: attempted_message.to.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent_message".to_string(),
        kind: Some("communication".to_string()),
        supertags: vec!["federation".to_string(), "delivery_sent".to_string()],
        subtype: Some("federated_delivery_sent".to_string()),
        content: serde_json::json!({
            "title": "Federated delivery accepted",
            "body": "The peer homeserver accepted this agent-to-agent message for delivery.",
            "attempted_message_id": attempted_message.id,
            "recipient_agent_ids": attempted_message.to,
            "status": "accepted_by_peer_relay",
        }),
        metadata: Some(serde_json::json!({
            "origin": "thread_federation_compose",
            "source": "federation",
            "delivery": "sent",
            "attempted_message_id": attempted_message.id,
        })),
        signature: String::new(),
        encryption: None,
        views: vec![serde_json::json!({
            "format": "rich_text",
            "priority": 1,
            "content": {
                "markdown": "### Federated delivery accepted\n\nThe peer homeserver accepted this agent-to-agent message for delivery."
            }
        })],
        references: vec![serde_json::json!({
            "type": "delivery_attempt",
            "target": attempted_message.id
        })],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    }
}
