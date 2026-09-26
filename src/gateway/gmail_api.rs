use base64::{
    Engine as _, alphabet,
    engine::{GeneralPurpose, GeneralPurposeConfig, general_purpose::URL_SAFE_NO_PAD},
};

/// Gmail's API is inconsistent about whether `raw` message payloads carry
/// base64url padding, so decode leniently instead of assuming either way
/// (encoding our own outgoing messages still uses strict URL_SAFE_NO_PAD below).
const URL_SAFE_LENIENT: GeneralPurpose = GeneralPurpose::new(
    &alphabet::URL_SAFE,
    GeneralPurposeConfig::new()
        .with_encode_padding(false)
        .with_decode_padding_mode(base64::engine::DecodePaddingMode::Indifferent),
);
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

use super::smtp_out::OutgoingEmailRequest;

const GOOGLE_OAUTH_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL_BASE: &str = "https://gmail.googleapis.com/gmail/v1/users";

// GAP-097: shared client for connection pooling across all Gmail API calls.
static GMAIL_CLIENT: OnceLock<Client> = OnceLock::new();
fn gmail_client() -> &'static Client {
    GMAIL_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default()
    })
}

fn gmail_upstream_status_error(operation: &str, status: reqwest::StatusCode) -> String {
    format!("{operation} failed with status {status}")
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GmailOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    pub user_id: String,
    pub from_address: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct GmailTokenResponse {
    access_token: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct GmailMessageId {
    pub id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct GmailListResponse {
    #[serde(default)]
    messages: Vec<GmailMessageId>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct GmailRawMessageResponse {
    id: String,
    raw: String,
}

pub async fn send_gmail_message(
    request: &OutgoingEmailRequest,
    config: &GmailOAuthConfig,
) -> Result<(), String> {
    let client = gmail_client();
    let token = exchange_refresh_token(&client, config).await?;
    let raw_message = build_gmail_raw_message(request, &config.from_address);

    let response = client
        .post(format!(
            "{}/{}/messages/send",
            GMAIL_SEND_URL_BASE, config.user_id
        ))
        .bearer_auth(token.access_token)
        .json(&serde_json::json!({ "raw": raw_message }))
        .send()
        .await
        .map_err(|err| format!("Gmail API send request failed: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(gmail_upstream_status_error("Gmail API send", status));
    }

    Ok(())
}

async fn exchange_refresh_token(
    client: &Client,
    config: &GmailOAuthConfig,
) -> Result<GmailTokenResponse, String> {
    let response = client
        .post(GOOGLE_OAUTH_TOKEN_URL)
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("refresh_token", config.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|err| format!("Google OAuth token exchange failed: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(gmail_upstream_status_error(
            "Google OAuth token exchange",
            status,
        ));
    }

    response
        .json::<GmailTokenResponse>()
        .await
        .map_err(|err| format!("Google OAuth token payload decode failed: {err}"))
}

pub async fn list_gmail_message_ids(
    config: &GmailOAuthConfig,
    max_results: usize,
) -> Result<Vec<GmailMessageId>, String> {
    let client = gmail_client();
    let token = exchange_refresh_token(&client, config).await?;
    let response = client
        .get(format!(
            "{}/{}/messages",
            GMAIL_SEND_URL_BASE, config.user_id
        ))
        .bearer_auth(token.access_token)
        .query(&[
            ("maxResults", max_results.to_string()),
            ("includeSpamTrash", "false".to_string()),
        ])
        .send()
        .await
        .map_err(|err| format!("Gmail API message list request failed: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(gmail_upstream_status_error(
            "Gmail API message list",
            status,
        ));
    }

    let payload = response
        .json::<GmailListResponse>()
        .await
        .map_err(|err| format!("Gmail API message list decode failed: {err}"))?;
    Ok(payload.messages)
}

pub async fn fetch_gmail_raw_message(
    config: &GmailOAuthConfig,
    message_id: &str,
) -> Result<Vec<u8>, String> {
    let client = gmail_client();
    let token = exchange_refresh_token(&client, config).await?;
    let response = client
        .get(format!(
            "{}/{}/messages/{}",
            GMAIL_SEND_URL_BASE, config.user_id, message_id
        ))
        .bearer_auth(token.access_token)
        .query(&[("format", "raw")])
        .send()
        .await
        .map_err(|err| format!("Gmail API raw message request failed: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(gmail_upstream_status_error(
            "Gmail API raw message fetch",
            status,
        ));
    }

    let payload = response
        .json::<GmailRawMessageResponse>()
        .await
        .map_err(|err| format!("Gmail API raw message decode failed: {err}"))?;

    URL_SAFE_LENIENT
        .decode(payload.raw)
        .map_err(|err| format!("Gmail raw message base64url decode failed: {err}"))
}

/// Strip CR and LF from a header value to prevent CRLF injection (GAP-094).
fn sanitize_header(value: &str) -> String {
    value.replace(['\r', '\n'], "")
}

pub fn build_gmail_raw_message(request: &OutgoingEmailRequest, from_address: &str) -> String {
    let mut mime = String::new();
    mime.push_str(&format!("From: {}\r\n", sanitize_header(from_address)));
    let to_clean: Vec<String> = request.to.iter().map(|a| sanitize_header(a)).collect();
    mime.push_str(&format!("To: {}\r\n", to_clean.join(", ")));
    mime.push_str(&format!(
        "Subject: {}\r\n",
        sanitize_header(&request.subject)
    ));
    mime.push_str("MIME-Version: 1.0\r\n");
    mime.push_str("Content-Type: text/plain; charset=UTF-8\r\n");
    if let Some(in_reply_to) = request.in_reply_to.as_ref() {
        mime.push_str(&format!(
            "In-Reply-To: {}\r\n",
            sanitize_header(in_reply_to)
        ));
    }
    if !request.references.is_empty() {
        let refs_clean: Vec<String> = request
            .references
            .iter()
            .map(|r| sanitize_header(r))
            .collect();
        mime.push_str(&format!("References: {}\r\n", refs_clean.join(" ")));
    }
    mime.push_str("\r\n");
    mime.push_str(&request.body);

    URL_SAFE_NO_PAD.encode(mime.as_bytes())
}

#[cfg(test)]
mod tests {
    use base64::Engine as _;

    use super::{
        GmailMessageId, build_gmail_raw_message, gmail_client, gmail_upstream_status_error,
    };
    use crate::gateway::smtp_out::OutgoingEmailRequest;

    #[test]
    fn gmail_raw_message_contains_reply_headers_and_body() {
        let raw = build_gmail_raw_message(
            &OutgoingEmailRequest {
                thread_id: "thread_test_01".to_string(),
                message_id: "msg_test_01".to_string(),
                parent_id: Some("msg_parent_01".to_string()),
                to: vec!["friend@example.com".to_string()],
                subject: "Hello".to_string(),
                body: "Body text".to_string(),
                in_reply_to: Some("<parent@example.com>".to_string()),
                references: vec![
                    "<root@example.com>".to_string(),
                    "<parent@example.com>".to_string(),
                ],
            },
            "sender@example.com",
        );

        let decoded = String::from_utf8(
            base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(raw)
                .expect("decode"),
        )
        .expect("utf8");

        assert!(decoded.contains("From: sender@example.com\r\n"));
        assert!(decoded.contains("To: friend@example.com\r\n"));
        assert!(decoded.contains("Subject: Hello\r\n"));
        assert!(decoded.contains("In-Reply-To: <parent@example.com>\r\n"));
        assert!(decoded.contains("References: <root@example.com> <parent@example.com>\r\n"));
        assert!(decoded.ends_with("\r\nBody text"));
    }

    #[test]
    fn gmail_message_id_shape_is_stable() {
        let payload = serde_json::from_value::<GmailMessageId>(serde_json::json!({
            "id": "18c5d2f0b1"
        }))
        .expect("gmail message id");

        assert_eq!(payload.id, "18c5d2f0b1");
    }

    #[test]
    fn gmail_client_is_shared_singleton() {
        assert!(std::ptr::eq(gmail_client(), gmail_client()));
    }

    #[test]
    fn gmail_upstream_status_error_omits_provider_body() {
        let err = gmail_upstream_status_error(
            "Google OAuth token exchange",
            reqwest::StatusCode::UNAUTHORIZED,
        );

        assert_eq!(
            err,
            "Google OAuth token exchange failed with status 401 Unauthorized"
        );
        assert!(!err.contains("refresh_token"));
        assert!(!err.contains("client_secret"));
    }
}
