//! Authenticated Cloudflare delivery boundary for the private operator relay.
//!
//! This is intentionally separate from vendor/couple mail. Callers must first
//! authenticate the Cloudflare ingress event and bind it to an operator thread.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::secret_manager::read_process_secret_trimmed;

const SEND_URL_PREFIX: &str = "https://api.cloudflare.com/client/v4/accounts";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OperatorRelaySendRequest {
    pub from: String,
    pub to: String,
    pub bcc: Option<String>,
    pub reply_to: String,
    pub subject: String,
    pub text: String,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub receipt_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperatorRelayDeliveryState {
    Accepted,
    Delivered,
    Bounced,
    Suppressed,
}

impl OperatorRelayDeliveryState {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Accepted => "accepted",
            Self::Delivered => "delivered",
            Self::Bounced => "bounced",
            Self::Suppressed => "suppressed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OperatorRelayReceipt {
    pub provider_message_id: String,
    pub state: OperatorRelayDeliveryState,
}

#[derive(Debug, Deserialize)]
struct CloudflareEnvelope {
    success: bool,
    result: Option<CloudflareResult>,
}

#[derive(Debug, Deserialize)]
struct CloudflareResult {
    #[serde(default)]
    delivered: Vec<String>,
    #[serde(default)]
    permanent_bounces: Vec<String>,
    #[serde(default)]
    suppressed_recipients: Vec<String>,
    #[serde(default)]
    queued: Vec<String>,
    message_id: Option<String>,
}

pub async fn send_operator_relay_email(
    request: &OperatorRelaySendRequest,
) -> Result<OperatorRelayReceipt, String> {
    validate_request(request)?;
    let token = read_process_secret_trimmed("OMNYID_OPERATOR_EMAIL_RELAY_CLOUDFLARE_API_TOKEN")
        .ok_or_else(|| "operator_relay_provider_unavailable".to_string())?;
    let account_id = std::env::var("OMNYID_OPERATOR_EMAIL_RELAY_CLOUDFLARE_ACCOUNT_ID")
        .ok()
        .or_else(|| std::env::var("OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| "operator_relay_provider_unavailable".to_string())?;
    let endpoint = format!(
        "{SEND_URL_PREFIX}/{}/email/sending/send",
        urlencoding::encode(&account_id)
    );
    send_to_endpoint(&endpoint, &token, request).await
}

async fn send_to_endpoint(
    endpoint: &str,
    token: &str,
    request: &OperatorRelaySendRequest,
) -> Result<OperatorRelayReceipt, String> {
    let response = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(token)
        .json(&cloudflare_payload(request))
        .send()
        .await
        .map_err(|_| "operator_relay_provider_request_failed".to_string())?;
    if !response.status().is_success() {
        return Err("operator_relay_provider_rejected".to_string());
    }
    let envelope = response
        .json::<CloudflareEnvelope>()
        .await
        .map_err(|_| "operator_relay_provider_receipt_invalid".to_string())?;
    receipt_from_envelope(envelope, &request.to)
}

fn receipt_from_envelope(
    envelope: CloudflareEnvelope,
    recipient: &str,
) -> Result<OperatorRelayReceipt, String> {
    if !envelope.success {
        return Err("operator_relay_provider_rejected".to_string());
    }
    receipt_from_result(
        envelope
            .result
            .ok_or_else(|| "operator_relay_provider_receipt_invalid".to_string())?,
        recipient,
    )
}

fn receipt_from_result(
    result: CloudflareResult,
    recipient: &str,
) -> Result<OperatorRelayReceipt, String> {
    let contains = |values: &[String]| {
        values
            .iter()
            .any(|value| value.eq_ignore_ascii_case(recipient))
    };
    let state = if contains(&result.suppressed_recipients) {
        OperatorRelayDeliveryState::Suppressed
    } else if contains(&result.permanent_bounces) {
        OperatorRelayDeliveryState::Bounced
    } else if contains(&result.delivered) {
        OperatorRelayDeliveryState::Delivered
    } else if contains(&result.queued) {
        OperatorRelayDeliveryState::Accepted
    } else {
        return Err("operator_relay_provider_recipient_missing".to_string());
    };
    let provider_message_id = result
        .message_id
        .map(|value| value.trim().to_string())
        .filter(|value| safe_message_id(value))
        .ok_or_else(|| "operator_relay_provider_receipt_invalid".to_string())?;
    Ok(OperatorRelayReceipt {
        provider_message_id,
        state,
    })
}

fn cloudflare_payload(request: &OperatorRelaySendRequest) -> Value {
    let mut headers = serde_json::Map::new();
    headers.insert(
        "X-OmnyID-Relay-Receipt".to_string(),
        json!(request.receipt_id),
    );
    if let Some(in_reply_to) = request.in_reply_to.as_deref() {
        headers.insert("In-Reply-To".to_string(), json!(in_reply_to));
    }
    if !request.references.is_empty() {
        headers.insert(
            "References".to_string(),
            json!(request.references.join(" ")),
        );
    }
    let mut payload = json!({
        "from": request.from,
        "to": [request.to],
        "reply_to": request.reply_to,
        "subject": request.subject,
        "text": request.text,
        "headers": headers,
    });
    if let Some(bcc) = request.bcc.as_deref() {
        payload["bcc"] = json!([bcc]);
    }
    payload
}

fn validate_request(request: &OperatorRelaySendRequest) -> Result<(), String> {
    for value in [&request.from, &request.to, &request.reply_to] {
        if !safe_address(value) {
            return Err("operator_relay_address_invalid".to_string());
        }
    }
    if request
        .bcc
        .as_deref()
        .is_some_and(|value| !safe_address(value))
    {
        return Err("operator_relay_address_invalid".to_string());
    }
    if !request.from.eq_ignore_ascii_case(&request.reply_to)
        || !request.from.to_ascii_lowercase().ends_with("@omnyid.com")
        || request.to.to_ascii_lowercase().ends_with("@omnyid.com")
        || request
            .bcc
            .as_deref()
            .is_some_and(|bcc| request.to.eq_ignore_ascii_case(bcc))
        || request.subject.trim().is_empty()
        || request.subject.chars().count() > 240
        || request.subject.chars().any(char::is_control)
        || request.text.trim().is_empty()
        || request.text.chars().count() > 100_000
        || !safe_receipt_id(&request.receipt_id)
        || request.references.len() > 20
        || request
            .references
            .iter()
            .any(|value| !safe_message_id(value))
        || request
            .in_reply_to
            .as_deref()
            .is_some_and(|value| !safe_message_id(value))
    {
        return Err("operator_relay_request_invalid".to_string());
    }
    Ok(())
}

fn safe_address(value: &str) -> bool {
    let value = value.trim();
    value.len() <= 320
        && value.contains('@')
        && !value.contains([',', ';', '\r', '\n', '\0', ' '])
        && !value.starts_with('@')
        && !value.ends_with('@')
}

fn safe_message_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && value.len() <= 998
        && value.starts_with('<')
        && value.ends_with('>')
        && !value.contains(['\r', '\n', '\0'])
}

fn safe_receipt_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 180
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> OperatorRelaySendRequest {
        OperatorRelaySendRequest {
            from: "hello@omnyid.com".to_string(),
            to: "alice@example.com".to_string(),
            bcc: Some("operator@gmail.com".to_string()),
            reply_to: "hello@omnyid.com".to_string(),
            subject: "A useful subject".to_string(),
            text: "Hello Alice".to_string(),
            in_reply_to: Some("<prior@cloudflare>".to_string()),
            references: vec!["<root@cloudflare>".to_string()],
            receipt_id: "relay:01TEST".to_string(),
        }
    }

    #[test]
    fn payload_uses_first_class_bcc_reply_to_and_thread_headers() {
        let payload = cloudflare_payload(&request());
        assert_eq!(payload["from"], "hello@omnyid.com");
        assert_eq!(payload["to"][0], "alice@example.com");
        assert_eq!(payload["bcc"][0], "operator@gmail.com");
        assert_eq!(payload["reply_to"], "hello@omnyid.com");
        assert_eq!(payload["headers"]["In-Reply-To"], "<prior@cloudflare>");
    }

    #[test]
    fn provider_boundary_rejects_loops_and_header_injection() {
        let mut input = request();
        input.to = "privacy@omnyid.com".to_string();
        assert_eq!(
            validate_request(&input),
            Err("operator_relay_request_invalid".to_string())
        );
        let mut input = request();
        input.subject = "Hello\r\nBcc: victim@example.com".to_string();
        assert_eq!(
            validate_request(&input),
            Err("operator_relay_request_invalid".to_string())
        );
    }

    #[test]
    fn receipt_states_are_recipient_bound() {
        let receipt = receipt_from_result(
            CloudflareResult {
                delivered: vec!["alice@example.com".to_string()],
                permanent_bounces: vec![],
                suppressed_recipients: vec![],
                queued: vec![],
                message_id: Some("<sent@cloudflare>".to_string()),
            },
            "alice@example.com",
        )
        .expect("receipt");
        assert_eq!(receipt.state, OperatorRelayDeliveryState::Delivered);
        assert!(
            receipt_from_result(
                CloudflareResult {
                    delivered: vec!["other@example.com".to_string()],
                    permanent_bounces: vec![],
                    suppressed_recipients: vec![],
                    queued: vec![],
                    message_id: Some("<sent@cloudflare>".to_string()),
                },
                "alice@example.com",
            )
            .is_err()
        );
        let suppressed = receipt_from_result(
            CloudflareResult {
                delivered: vec![],
                permanent_bounces: vec![],
                suppressed_recipients: vec!["alice@example.com".to_string()],
                queued: vec![],
                message_id: Some("<suppressed@cloudflare>".to_string()),
            },
            "alice@example.com",
        )
        .expect("suppressed receipt");
        assert_eq!(suppressed.state, OperatorRelayDeliveryState::Suppressed);
    }

    #[test]
    fn provider_failure_and_missing_receipt_fail_closed() {
        assert_eq!(
            receipt_from_envelope(
                CloudflareEnvelope {
                    success: false,
                    result: None,
                },
                "alice@example.com",
            ),
            Err("operator_relay_provider_rejected".to_string())
        );
        assert_eq!(
            receipt_from_envelope(
                CloudflareEnvelope {
                    success: true,
                    result: None,
                },
                "alice@example.com",
            ),
            Err("operator_relay_provider_receipt_invalid".to_string())
        );
    }
}
