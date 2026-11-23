//! AFP contract validators for the disabled wedding vendor email relay.
//!
//! Email payloads are serialised only inside an encrypted AFP envelope. The
//! plaintext metadata checked here is deliberately limited to opaque routing
//! and idempotency values.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::message::AFPMessage;

pub const WEDDING_VENDOR_EMAIL_SCHEMA: &str = "wedding_vendor_email/v1";
pub const EMAIL_READ_SCHEMA: &str = "email_read/v1";
pub const EMAIL_DELIVERY_STATUS_SCHEMA: &str = "email_delivery_status/v1";
pub const EMAIL_BOUNCE_SCHEMA: &str = "email_bounce/v1";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct WeddingVendorEmailParticipant {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub address: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WeddingVendorEmailDirection {
    Inbound,
    Outbound,
    Reply,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct WeddingVendorEmailContent {
    pub schema: String,
    pub vendor_id: String,
    pub direction: WeddingVendorEmailDirection,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    pub from: WeddingVendorEmailParticipant,
    pub to: Vec<WeddingVendorEmailParticipant>,
    #[serde(default)]
    pub references: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct EmailReadContent {
    pub schema_version: String,
    pub source_message_id: String,
    pub read_at: String,
    pub actor_agent_id: String,
}

pub fn wedding_vendor_email_idempotency_key(namespace: &str, stable_parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for part in std::iter::once(namespace).chain(stable_parts.iter().copied()) {
        let trimmed = part.trim();
        hasher.update((trimmed.len() as u64).to_be_bytes());
        hasher.update(trimmed.as_bytes());
    }
    format!("sha256:{:x}", hasher.finalize())
}

pub fn validate_wedding_vendor_email_envelope(message: &AFPMessage) -> Result<(), &'static str> {
    if message.r#type != "email" || message.kind.as_deref() != Some("communication") {
        return Err("relay envelope must be email communication");
    }
    if !matches!(
        message.subtype.as_deref(),
        Some("incoming" | "outgoing" | "reply" | "delivery_status" | "bounce")
    ) {
        return Err("unsupported relay subtype");
    }
    if !message
        .supertags
        .iter()
        .any(|tag| tag == "wedding_vendor_email")
    {
        return Err("missing wedding vendor email supertag");
    }
    validate_encrypted_marker(message)?;
    let metadata = metadata_object(message)?;
    let schema = metadata.get("schema").and_then(Value::as_str);
    if !matches!(
        schema,
        Some(WEDDING_VENDOR_EMAIL_SCHEMA | EMAIL_DELIVERY_STATUS_SCHEMA | EMAIL_BOUNCE_SCHEMA)
    ) {
        return Err("unsupported relay metadata schema");
    }
    validate_metadata_allowlist(
        metadata,
        &[
            "schema",
            "transport",
            "provider_event_digest",
            "vendor_id",
            "relay_thread_id",
            "risk_classification",
            "idempotency_key",
        ],
    )?;
    validate_idempotency(metadata)?;
    Ok(())
}

pub fn validate_email_read_envelope(message: &AFPMessage) -> Result<(), &'static str> {
    if message.r#type != "email"
        || message.kind.as_deref() != Some("communication")
        || message.subtype.as_deref() != Some("read")
    {
        return Err("invalid read event envelope");
    }
    let parent_id = message
        .parent_id
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or("read event requires parent")?;
    if !message
        .supertags
        .iter()
        .any(|tag| tag == "wedding_vendor_email")
        || !message.supertags.iter().any(|tag| tag == "user_read_event")
    {
        return Err("missing read event supertags");
    }
    let references_source = message.references.iter().any(|reference| {
        reference.get("type").and_then(Value::as_str) == Some("message")
            && reference.get("target").and_then(Value::as_str) == Some(parent_id)
            && reference
                .pointer("/metadata/relation")
                .and_then(Value::as_str)
                == Some("read")
    });
    if !references_source {
        return Err("read event must reference parent message");
    }
    validate_encrypted_marker(message)?;
    let metadata = metadata_object(message)?;
    if metadata.get("schema").and_then(Value::as_str) != Some(EMAIL_READ_SCHEMA) {
        return Err("unsupported read metadata schema");
    }
    validate_metadata_allowlist(metadata, &["schema", "idempotency_key"])?;
    validate_idempotency(metadata)
}

fn validate_encrypted_marker(message: &AFPMessage) -> Result<(), &'static str> {
    if message
        .content
        .get("omnyid_encrypted")
        .and_then(Value::as_bool)
        != Some(true)
        || message.content.get("scheme").and_then(Value::as_str) != Some("omnyid-envelope-v1")
        || message
            .content
            .as_object()
            .is_none_or(|content| content.len() != 2)
        || message
            .encryption
            .as_ref()
            .and_then(Value::as_object)
            .is_none()
    {
        return Err("content must be an encrypted relay envelope");
    }
    Ok(())
}

fn metadata_object(message: &AFPMessage) -> Result<&serde_json::Map<String, Value>, &'static str> {
    message
        .metadata
        .as_ref()
        .and_then(Value::as_object)
        .ok_or("relay metadata is required")
}

fn validate_metadata_allowlist(
    metadata: &serde_json::Map<String, Value>,
    allowed: &[&str],
) -> Result<(), &'static str> {
    if metadata.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err("relay metadata has a disallowed field");
    }
    if metadata
        .values()
        .any(|value| value.as_str().is_some_and(|text| text.contains('@')))
    {
        return Err("relay metadata must not contain an email address");
    }
    Ok(())
}

fn validate_idempotency(metadata: &serde_json::Map<String, Value>) -> Result<(), &'static str> {
    let value = metadata
        .get("idempotency_key")
        .and_then(Value::as_str)
        .ok_or("idempotency key is required")?;
    if value.len() != 71
        || !value.starts_with("sha256:")
        || !value[7..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("invalid idempotency key");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        EMAIL_READ_SCHEMA, WEDDING_VENDOR_EMAIL_SCHEMA, validate_email_read_envelope,
        validate_wedding_vendor_email_envelope, wedding_vendor_email_idempotency_key,
    };
    use crate::message::AFPMessage;
    use serde_json::json;

    fn relay_message() -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "01JQ0YQ2X3E2G7M8N9P0QRSTUV".to_string(),
            thread_id: "01JQ0YQ2X3E2G7M8N9P0QRSTUV".to_string(),
            from: "agent:planner@omnyid.com".to_string(),
            to: vec!["agent:planner@omnyid.com".to_string()],
            timestamp: "2026-10-14T00:00:00Z".to_string(),
            r#type: "email".to_string(),
            kind: Some("communication".to_string()),
            subtype: Some("incoming".to_string()),
            supertags: vec!["wedding_vendor_email".to_string()],
            content: json!({"omnyid_encrypted": true, "scheme": "omnyid-envelope-v1"}),
            metadata: Some(json!({
                "schema": WEDDING_VENDOR_EMAIL_SCHEMA,
                "vendor_id": "vendor_opaque",
                "idempotency_key": wedding_vendor_email_idempotency_key("test", &["one"]),
            })),
            signature: String::new(),
            encryption: Some(json!({"scheme": "omnyid-envelope-v1", "ciphertext_b64": "opaque"})),
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            parent_id: None,
            prev_hash: None,
        }
    }

    #[test]
    fn relay_rejects_plaintext_and_address_metadata() {
        let mut message = relay_message();
        assert!(validate_wedding_vendor_email_envelope(&message).is_ok());
        message.content = json!({"subject": "plaintext"});
        assert!(validate_wedding_vendor_email_envelope(&message).is_err());
        let mut message = relay_message();
        message.metadata.as_mut().expect("metadata")["address"] = json!("vendor@example.test");
        assert!(validate_wedding_vendor_email_envelope(&message).is_err());
    }

    #[test]
    fn read_requires_parent_reference() {
        let mut message = relay_message();
        message.subtype = Some("read".to_string());
        message.parent_id = Some("source_message".to_string());
        message.supertags.push("user_read_event".to_string());
        message.metadata = Some(json!({
            "schema": EMAIL_READ_SCHEMA,
            "idempotency_key": wedding_vendor_email_idempotency_key("read", &["source_message"]),
        }));
        message.references = vec![
            json!({"type":"message", "target":"source_message", "metadata":{"relation":"read"}}),
        ];
        assert!(validate_email_read_envelope(&message).is_ok());
        message.references.clear();
        assert!(validate_email_read_envelope(&message).is_err());
    }

    #[test]
    fn idempotency_is_deterministic() {
        assert_eq!(
            wedding_vendor_email_idempotency_key("email", &["message", "vendor"]),
            wedding_vendor_email_idempotency_key("email", &["message", "vendor"]),
        );
    }
}
