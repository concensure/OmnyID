/// Microsoft Graph API adapter — Phase 5 email gateway, Outlook provider.
///
/// Covers:
/// - OAuth2 token refresh via Microsoft identity platform
/// - Outbound send via `POST /me/sendMail`
/// - Inbound poll via `GET /me/mailFolders/inbox/messages` with delta links
/// - Message fetch via `GET /me/messages/{id}/$value` (raw RFC 822)
use base64::{Engine as _, engine::general_purpose::STANDARD};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

// GAP-097: shared client for connection pooling across all Graph API calls.
static GRAPH_CLIENT: OnceLock<Client> = OnceLock::new();
fn graph_client() -> &'static Client {
    GRAPH_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default()
    })
}

use super::smtp_out::OutgoingEmailRequest;

const MS_TOKEN_URL_BASE: &str = "https://login.microsoftonline.com";
const GRAPH_API_BASE: &str = "https://graph.microsoft.com/v1.0";

#[derive(Clone, Debug)]
pub struct GraphOAuthConfig {
    pub tenant_id: String,
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    /// The user's UPN or "me" for the authenticated user.
    pub user_id: String,
    pub from_address: String,
}

impl GraphOAuthConfig {
    pub fn from_env() -> Option<Self> {
        Some(Self {
            tenant_id: std::env::var("OMNYID_MS_TENANT_ID").ok()?,
            client_id: std::env::var("OMNYID_MS_CLIENT_ID").ok()?,
            client_secret: std::env::var("OMNYID_MS_CLIENT_SECRET").ok()?,
            refresh_token: std::env::var("OMNYID_MS_REFRESH_TOKEN").ok()?,
            user_id: std::env::var("OMNYID_MS_USER_ID").unwrap_or_else(|_| "me".to_string()),
            from_address: std::env::var("OMNYID_MS_FROM_ADDRESS").ok()?,
        })
    }
}

#[derive(Deserialize)]
struct MsTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GraphMessageListResponse {
    #[serde(default, rename = "value")]
    messages: Vec<GraphMessageMeta>,
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
    #[serde(rename = "@odata.deltaLink")]
    delta_link: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct GraphMessageMeta {
    pub id: String,
    #[serde(rename = "internetMessageId")]
    pub internet_message_id: Option<String>,
    pub subject: Option<String>,
    #[serde(rename = "receivedDateTime")]
    pub received_date_time: Option<String>,
    #[serde(rename = "isRead")]
    pub is_read: Option<bool>,
}

#[derive(Serialize)]
struct SendMailBody {
    message: OutlookMessage,
    #[serde(rename = "saveToSentItems")]
    save_to_sent_items: bool,
}

#[derive(Serialize)]
struct OutlookMessage {
    subject: String,
    body: OutlookBody,
    #[serde(rename = "toRecipients")]
    to_recipients: Vec<OutlookRecipient>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "replyTo")]
    reply_to: Option<Vec<OutlookRecipient>>,
}

#[derive(Serialize)]
struct OutlookBody {
    #[serde(rename = "contentType")]
    content_type: String,
    content: String,
}

#[derive(Serialize)]
struct OutlookRecipient {
    #[serde(rename = "emailAddress")]
    email_address: OutlookEmailAddress,
}

#[derive(Serialize)]
struct OutlookEmailAddress {
    address: String,
}

async fn refresh_access_token(
    client: &Client,
    config: &GraphOAuthConfig,
) -> Result<String, String> {
    let url = format!(
        "{}/{}/oauth2/v2.0/token",
        MS_TOKEN_URL_BASE, config.tenant_id
    );
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", &config.client_id),
        ("client_secret", &config.client_secret),
        ("refresh_token", &config.refresh_token),
        ("scope", "https://graph.microsoft.com/.default"),
    ];
    let resp = client
        .post(&url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("MS token request failed: {e}"))?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("MS token error: {text}"));
    }
    let token: MsTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("MS token parse: {e}"))?;
    Ok(token.access_token)
}

/// Send an email via Microsoft Graph `sendMail`.
pub async fn send_graph_message(
    request: &OutgoingEmailRequest,
    config: &GraphOAuthConfig,
) -> Result<(), String> {
    let client = graph_client();
    let token = refresh_access_token(client, config).await?;

    let body = SendMailBody {
        save_to_sent_items: true,
        message: OutlookMessage {
            subject: request.subject.clone(),
            body: OutlookBody {
                content_type: "Text".to_string(),
                content: request.body.clone(),
            },
            to_recipients: request
                .to
                .iter()
                .map(|addr| OutlookRecipient {
                    email_address: OutlookEmailAddress {
                        address: addr.clone(),
                    },
                })
                .collect(),
            reply_to: None,
        },
    };

    let url = format!("{}/users/{}/sendMail", GRAPH_API_BASE, config.user_id);
    let resp = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Graph sendMail request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Graph sendMail error ({}): {}", status, text));
    }
    Ok(())
}

/// List inbox messages since `delta_link` (or full sync if None).
/// Returns (messages, new_delta_link_or_next_link).
pub async fn list_inbox_messages(
    config: &GraphOAuthConfig,
    delta_link: Option<&str>,
) -> Result<(Vec<GraphMessageMeta>, Option<String>), String> {
    let client = graph_client();
    let token = refresh_access_token(client, config).await?;

    let url = if let Some(link) = delta_link {
        link.to_string()
    } else {
        format!(
            "{}/users/{}/mailFolders/inbox/messages/delta?$select=id,internetMessageId,subject,receivedDateTime,isRead&$top=50",
            GRAPH_API_BASE, config.user_id
        )
    };

    let resp = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Graph list messages failed: {e}"))?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Graph list error: {text}"));
    }
    let list: GraphMessageListResponse = resp
        .json()
        .await
        .map_err(|e| format!("Graph list parse: {e}"))?;
    let checkpoint = list.delta_link.or(list.next_link);
    Ok((list.messages, checkpoint))
}

/// Fetch the raw RFC 822 bytes of a message by Graph message ID.
pub async fn fetch_raw_message(
    config: &GraphOAuthConfig,
    message_id: &str,
) -> Result<Vec<u8>, String> {
    let client = graph_client();
    let token = refresh_access_token(client, config).await?;
    let url = format!(
        "{}/users/{}/messages/{}/$value",
        GRAPH_API_BASE, config.user_id, message_id
    );
    let resp = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Graph fetch raw failed: {e}"))?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Graph fetch raw error: {text}"));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Graph raw bytes: {e}"))?;
    Ok(bytes.to_vec())
}

/// Encode raw bytes as base64 for AFP attachment storage reference.
pub fn raw_to_base64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::graph_client;

    #[test]
    fn graph_client_is_shared_singleton() {
        assert!(std::ptr::eq(graph_client(), graph_client()));
    }
}
