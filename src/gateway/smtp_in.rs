use mail_parser::{Address, HeaderValue, MessageParser, MimeHeaders, PartType};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    crypto::{encrypt_content, sign_message},
    message::AFPMessage,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IncomingEmailSummary {
    pub subject: String,
    pub smtp_from: String,
    pub smtp_to: String,
    pub body_preview: String,
    pub smtp_message_id: String,
    pub in_reply_to: Option<String>,
    pub reference_targets: Vec<String>,
    pub external_conversation_key: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IncomingEmailAttachment {
    pub file_name: String,
    pub media_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IncomingEmailSource {
    pub summary: IncomingEmailSummary,
    pub body: String,
    pub body_media_type: String,
    pub attachments: Vec<IncomingEmailAttachment>,
    pub attachments_blocked: bool,
}

pub async fn handle_incoming_email(raw_email: &[u8]) -> Result<AFPMessage, String> {
    let parsed = parse_incoming_email(raw_email);
    let subject = parsed.subject;
    let smtp_from = parsed.smtp_from;
    let smtp_to = parsed.smtp_to;
    let body = parsed.body;
    let smtp_message_id = parsed.smtp_message_id;
    let in_reply_to = parsed.in_reply_to;
    let reference_targets = parsed.reference_targets;
    let external_conversation_key = external_email_conversation_key(
        &smtp_message_id,
        in_reply_to.as_deref(),
        &reference_targets,
    );
    let gateway_references =
        build_gateway_references(&smtp_message_id, in_reply_to.as_deref(), &reference_targets);

    // thread_id must be a bare ULID (GAP-098 / validate_proto_message) — no prefix.
    let thread_id = Ulid::new().to_string();
    let mut afp_msg = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: Ulid::new().to_string(),
        thread_id: thread_id.clone(),
        parent_id: None,
        from: gateway_agent_id(),
        to: vec![current_agent_id()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "email".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some("incoming".to_string()),
        content: json!({
            "subject": subject,
            "from": smtp_from,
            "to": smtp_to,
            "body": body,
            "original_smtp_id": smtp_message_id,
            "in_reply_to": in_reply_to,
            "smtp_references": reference_targets,
            "external_conversation_key": external_conversation_key
        }),
        metadata: Some(json!({
            "channel": "smtp",
            "kind": "gateway_ingest",
            "transport": "smtp",
            "email_from": smtp_from,
            "email_to": smtp_to,
            "email_subject": subject,
            "original_smtp_id": smtp_message_id,
            "in_reply_to": in_reply_to,
            "smtp_references": reference_targets,
            "external_conversation_key": external_conversation_key
        })),
        signature: String::new(),
        encryption: None,
        views: vec![
            json!({"format": "email", "content": {"subject": subject, "body": body}}),
            json!({"format": "notion", "content": {"blocks": [{"type": "paragraph", "text": body}]}}),
        ],
        references: gateway_references,
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    };

    maybe_encrypt_gateway_message(&mut afp_msg)?;
    maybe_sign_gateway_message(&mut afp_msg)?;

    Ok(afp_msg)
}

pub fn summarize_incoming_email(raw_email: &[u8]) -> IncomingEmailSummary {
    let parsed = parse_incoming_email(raw_email);
    let external_conversation_key = external_email_conversation_key(
        &parsed.smtp_message_id,
        parsed.in_reply_to.as_deref(),
        &parsed.reference_targets,
    );
    IncomingEmailSummary {
        subject: parsed.subject,
        smtp_from: parsed.smtp_from,
        smtp_to: parsed.smtp_to,
        body_preview: preview_text(&parsed.body, 240),
        smtp_message_id: parsed.smtp_message_id,
        in_reply_to: parsed.in_reply_to,
        reference_targets: parsed.reference_targets,
        external_conversation_key,
    }
}

pub fn parse_incoming_email_source(raw_email: &[u8]) -> IncomingEmailSource {
    let parsed = parse_incoming_email(raw_email);
    let summary = IncomingEmailSummary {
        subject: parsed.subject.clone(),
        smtp_from: parsed.smtp_from.clone(),
        smtp_to: parsed.smtp_to.clone(),
        body_preview: preview_text(&parsed.body, 240),
        smtp_message_id: parsed.smtp_message_id.clone(),
        in_reply_to: parsed.in_reply_to.clone(),
        reference_targets: parsed.reference_targets.clone(),
        external_conversation_key: external_email_conversation_key(
            &parsed.smtp_message_id,
            parsed.in_reply_to.as_deref(),
            &parsed.reference_targets,
        ),
    };
    IncomingEmailSource {
        summary,
        body: parsed.body,
        body_media_type: parsed.body_media_type,
        attachments: parsed.attachments,
        attachments_blocked: parsed.attachments_blocked,
    }
}

pub fn external_email_conversation_key(
    smtp_message_id: &str,
    in_reply_to: Option<&str>,
    reference_targets: &[String],
) -> String {
    let root = reference_targets
        .first()
        .map(String::as_str)
        .or(in_reply_to)
        .unwrap_or(smtp_message_id)
        .trim();
    format!("external_email_thread:{root}")
}

struct ParsedIncomingEmail {
    subject: String,
    smtp_from: String,
    smtp_to: String,
    body: String,
    smtp_message_id: String,
    in_reply_to: Option<String>,
    reference_targets: Vec<String>,
    body_media_type: String,
    attachments: Vec<IncomingEmailAttachment>,
    attachments_blocked: bool,
}

fn maybe_encrypt_gateway_message(message: &mut AFPMessage) -> Result<(), String> {
    let Some(key) = gateway_encryption_key()? else {
        return Ok(());
    };

    let plaintext = message.content.clone();
    let aad = gateway_encryption_aad(message);
    message.encryption = Some(encrypt_content(&plaintext, &aad, &key));
    message.content = json!({
        "omnyid_encrypted": true,
        "scheme": "omnyid-envelope-v1",
        "source": "smtp_gateway"
    });
    Ok(())
}

fn maybe_sign_gateway_message(message: &mut AFPMessage) -> Result<(), String> {
    let Some(seed) = gateway_signing_seed()? else {
        return Ok(());
    };

    sign_message(message, &seed);
    Ok(())
}

fn gateway_encryption_aad(message: &AFPMessage) -> Value {
    json!({
        "protocol": message.protocol,
        "id": message.id,
        "thread_id": message.thread_id,
        "parent_id": message.parent_id.clone().unwrap_or_default(),
        "from": message.from,
        "to": message.to,
        "timestamp": message.timestamp,
        "type": message.r#type,
        "subtype": message.subtype.clone().unwrap_or_default(),
        "metadata": message.metadata.clone().unwrap_or_else(|| json!({})),
    })
}

fn gateway_signing_seed() -> Result<Option<[u8; 32]>, String> {
    env_hex_32("OMNYID_SIGNING_KEY_HEX")
}

fn gateway_encryption_key() -> Result<Option<[u8; 32]>, String> {
    env_hex_32("OMNYID_ENCRYPTION_KEY_HEX")
}

fn env_hex_32(name: &str) -> Result<Option<[u8; 32]>, String> {
    let Some(trimmed) = crate::secret_manager::read_process_secret_trimmed(name) else {
        return Ok(None);
    };

    let bytes = hex::decode(&trimmed).map_err(|_| format!("{name} must be valid hex"))?;
    let array: [u8; 32] = bytes
        .try_into()
        .map_err(|_| format!("{name} must decode to 32 bytes"))?;
    Ok(Some(array))
}

fn gateway_agent_id() -> String {
    std::env::var("OMNYID_GATEWAY_AGENT_ID")
        .unwrap_or_else(|_| "agent:email-gateway@local.omnyid".to_string())
}

fn current_agent_id() -> String {
    std::env::var("OMNYID_AGENT_ID").unwrap_or_else(|_| "agent:you@yourdomain.ai".to_string())
}

fn parse_incoming_email(raw_email: &[u8]) -> ParsedIncomingEmail {
    let fallback_raw = String::from_utf8_lossy(raw_email).to_string();
    let fallback = ParsedIncomingEmail {
        subject: extract_header(&fallback_raw, "Subject")
            .unwrap_or_else(|| "Incoming email".to_string()),
        smtp_from: extract_header(&fallback_raw, "From")
            .unwrap_or_else(|| "external-email".to_string()),
        smtp_to: extract_header(&fallback_raw, "To").unwrap_or_else(|| current_agent_id()),
        body: extract_body(&fallback_raw),
        smtp_message_id: extract_header(&fallback_raw, "Message-Id")
            .unwrap_or_else(|| format!("smtp_{}", Ulid::new())),
        in_reply_to: extract_header(&fallback_raw, "In-Reply-To"),
        reference_targets: extract_reference_targets(&fallback_raw),
        body_media_type: "text/plain".to_string(),
        attachments: vec![],
        attachments_blocked: false,
    };

    let Some(message) = MessageParser::default().parse(raw_email) else {
        return fallback;
    };

    let (body, body_media_type) = if let Some(value) = message.body_text(0) {
        (value.into_owned(), "text/plain".to_string())
    } else if let Some(value) = message.body_html(0) {
        (value.into_owned(), "text/html".to_string())
    } else {
        (fallback.body.clone(), fallback.body_media_type.clone())
    };

    const MAX_ATTACHMENTS: usize = 20;
    const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;
    const MAX_TOTAL_ATTACHMENT_BYTES: usize = 32 * 1024 * 1024;
    let mut attachments = Vec::new();
    let mut total_bytes = 0_usize;
    let mut attachments_blocked = false;
    for (index, part) in message.attachments().enumerate() {
        let bytes = match &part.body {
            PartType::Binary(value) | PartType::InlineBinary(value) => value.as_ref(),
            PartType::Text(value) | PartType::Html(value) => value.as_bytes(),
            PartType::Message(value) => value.raw_message.as_ref(),
            PartType::Multipart(_) => continue,
        };
        if attachments.len() >= MAX_ATTACHMENTS
            || bytes.len() > MAX_ATTACHMENT_BYTES
            || total_bytes.saturating_add(bytes.len()) > MAX_TOTAL_ATTACHMENT_BYTES
        {
            attachments_blocked = true;
            continue;
        }
        let media_type = part
            .content_type()
            .map(|content_type| {
                format!(
                    "{}/{}",
                    content_type.c_type,
                    content_type.c_subtype.as_deref().unwrap_or("octet-stream")
                )
            })
            .unwrap_or_else(|| "application/octet-stream".to_string());
        attachments.push(IncomingEmailAttachment {
            file_name: part
                .attachment_name()
                .map(str::to_string)
                .unwrap_or_else(|| format!("attachment-{}.bin", index + 1)),
            media_type,
            bytes: bytes.to_vec(),
        });
        total_bytes = total_bytes.saturating_add(bytes.len());
    }

    ParsedIncomingEmail {
        subject: message
            .subject()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or(fallback.subject),
        smtp_from: address_to_string(message.from()).unwrap_or(fallback.smtp_from),
        smtp_to: address_to_string(message.to()).unwrap_or(fallback.smtp_to),
        body,
        smtp_message_id: message
            .message_id()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(normalize_message_id)
            .unwrap_or(fallback.smtp_message_id),
        in_reply_to: header_ids_to_strings(message.in_reply_to())
            .into_iter()
            .next()
            .or(fallback.in_reply_to),
        reference_targets: {
            let parsed_references = header_ids_to_strings(message.references());
            if parsed_references.is_empty() {
                fallback.reference_targets
            } else {
                parsed_references
            }
        },
        body_media_type,
        attachments,
        attachments_blocked,
    }
}

fn extract_header(raw_email: &str, name: &str) -> Option<String> {
    raw_email.lines().find_map(|line| {
        let prefix = format!("{name}:");
        line.strip_prefix(&prefix)
            .map(|value| value.trim().to_string())
    })
}

fn extract_reference_targets(raw_email: &str) -> Vec<String> {
    let Some(value) = extract_header(raw_email, "References") else {
        return vec![];
    };

    value
        .split_whitespace()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(normalize_message_id)
        .collect()
}

fn header_ids_to_strings(value: &HeaderValue<'_>) -> Vec<String> {
    value
        .as_text_list()
        .map(|items| {
            items
                .iter()
                .map(|item| item.trim())
                .filter(|item| !item.is_empty())
                .map(normalize_message_id)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn address_to_string(address: Option<&Address<'_>>) -> Option<String> {
    let address = address?;
    let parts = address
        .iter()
        .filter_map(|entry| entry.address())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}

fn build_gateway_references(
    smtp_message_id: &str,
    in_reply_to: Option<&str>,
    reference_targets: &[String],
) -> Vec<Value> {
    let mut references = vec![json!({
        "type": "external_email",
        "target": smtp_message_id,
        "metadata": {
            "relation": "message_id"
        }
    })];

    if let Some(in_reply_to) = in_reply_to.map(str::trim).filter(|value| !value.is_empty()) {
        references.push(json!({
            "type": "external_email",
            "target": in_reply_to,
            "metadata": {
                "relation": "in_reply_to"
            }
        }));
    }

    for target in reference_targets {
        references.push(json!({
            "type": "external_email",
            "target": target,
            "metadata": {
                "relation": "reference"
            }
        }));
    }

    references
}

fn extract_body(raw_email: &str) -> String {
    raw_email
        .split("\n\n")
        .nth(1)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(raw_email.trim())
        .to_string()
}

fn normalize_message_id(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with('<') && trimmed.ends_with('>') {
        trimmed.to_string()
    } else {
        format!("<{trimmed}>")
    }
}

fn preview_text(input: &str, max_chars: usize) -> String {
    let normalized = input.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = normalized.chars().take(max_chars).collect::<String>();
    if normalized.chars().count() > max_chars {
        preview.push_str("...");
    }
    preview
}

#[cfg(test)]
mod tests {
    use super::{handle_incoming_email, parse_incoming_email_source};
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[tokio::test]
    async fn incoming_email_is_signed_when_seed_exists() {
        let _guard = env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        unsafe {
            std::env::set_var(
                "OMNYID_SIGNING_KEY_HEX",
                "0707070707070707070707070707070707070707070707070707070707070707",
            );
            std::env::remove_var("OMNYID_ENCRYPTION_KEY_HEX");
        }

        let message = handle_incoming_email(b"Subject: Hello\n\nBody text")
            .await
            .expect("message");

        assert!(message.signature.starts_with("ed25519:"));
        assert!(message.encryption.is_none());
    }

    #[tokio::test]
    async fn incoming_email_is_encrypted_when_key_exists() {
        let _guard = env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        unsafe {
            std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
            std::env::set_var(
                "OMNYID_ENCRYPTION_KEY_HEX",
                "0909090909090909090909090909090909090909090909090909090909090909",
            );
        }

        let message = handle_incoming_email(b"Subject: Secret\n\nBody text")
            .await
            .expect("message");

        assert_eq!(message.content["omnyid_encrypted"], true);
        assert_eq!(
            message
                .encryption
                .as_ref()
                .and_then(|value| value.get("scheme"))
                .and_then(|value| value.as_str()),
            Some("omnyid-envelope-v1")
        );
    }

    #[tokio::test]
    async fn incoming_email_captures_threading_headers_as_references() {
        let _guard = env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        unsafe {
            std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
            std::env::remove_var("OMNYID_ENCRYPTION_KEY_HEX");
        }

        let message = handle_incoming_email(
            b"Subject: Re: Hello\nMessage-Id: <msg-2@example.com>\nIn-Reply-To: <msg-1@example.com>\nReferences: <msg-0@example.com> <msg-1@example.com>\n\nBody text",
        )
        .await
        .expect("message");

        assert_eq!(message.references.len(), 4);
        assert_eq!(message.references[0]["target"], "<msg-2@example.com>");
        assert_eq!(message.references[1]["target"], "<msg-1@example.com>");
        assert_eq!(message.references[1]["metadata"]["relation"], "in_reply_to");
        assert_eq!(message.references[2]["target"], "<msg-0@example.com>");
        assert_eq!(message.references[3]["target"], "<msg-1@example.com>");
    }

    #[test]
    fn incoming_email_source_preserves_bounded_mime_attachments() {
        let raw = concat!(
            "From: Vendor <vendor@example.test>\r\n",
            "To: couple@example.test\r\n",
            "Subject: Revised quote\r\n",
            "Message-Id: <reply@example.test>\r\n",
            "In-Reply-To: <invite@example.test>\r\n",
            "Content-Type: multipart/mixed; boundary=quote-boundary\r\n",
            "\r\n",
            "--quote-boundary\r\n",
            "Content-Type: text/plain; charset=utf-8\r\n",
            "\r\n",
            "The revised total is AUD 4,200.\r\n",
            "--quote-boundary\r\n",
            "Content-Type: text/plain; name=revision.txt\r\n",
            "Content-Disposition: attachment; filename=revision.txt\r\n",
            "Content-Transfer-Encoding: base64\r\n",
            "\r\n",
            "VG90YWwgQVVEIDQsMjAw\r\n",
            "--quote-boundary--\r\n"
        );
        let source = parse_incoming_email_source(raw.as_bytes());
        assert_eq!(source.summary.smtp_from, "vendor@example.test");
        assert_eq!(
            source.summary.in_reply_to.as_deref(),
            Some("<invite@example.test>")
        );
        assert!(source.body.contains("revised total"));
        assert_eq!(source.body_media_type, "text/plain");
        assert_eq!(source.attachments.len(), 1);
        assert_eq!(source.attachments[0].file_name, "revision.txt");
        assert_eq!(source.attachments[0].media_type, "text/plain");
        assert_eq!(source.attachments[0].bytes, b"Total AUD 4,200");
        assert!(!source.attachments_blocked);
    }

    #[test]
    fn html_only_email_prefers_the_mail_parser_plaintext_view() {
        let source = parse_incoming_email_source(
            b"From: vendor@example.test\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Total <strong>AUD 4,200</strong></p>",
        );
        assert_eq!(source.body_media_type, "text/plain");
        assert!(source.body.contains("AUD 4,200"));
    }
}
