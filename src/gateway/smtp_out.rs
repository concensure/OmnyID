use serde_json::Value;
use tracing::{instrument, warn};

use crate::message::AFPMessage;

use super::{
    gmail_api::{GmailOAuthConfig, send_gmail_message},
    graph_api::{GraphOAuthConfig, send_graph_message},
    provider::{MailGatewayConfig, OutboundAuthMode},
    smtp_fallback::{SmtpFallbackConfig, send_via_smtp_fallback},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OutgoingEmailRequest {
    pub thread_id: String,
    pub message_id: String,
    pub parent_id: Option<String>,
    pub to: Vec<String>,
    pub subject: String,
    pub body: String,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
}

pub fn outgoing_message_id_header(request: &OutgoingEmailRequest) -> String {
    let local = request
        .message_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(160)
        .collect::<String>();
    format!(
        "<{}@omnyid.invalid>",
        if local.is_empty() { "message" } else { &local }
    )
}

#[instrument(skip(message), fields(thread_id = %message.thread_id, message_id = %message.id, message_type = %message.r#type))]
pub async fn dispatch_outgoing_message(message: &AFPMessage) -> Result<bool, String> {
    let Some(request) = build_outgoing_email_request(message) else {
        return Ok(false);
    };

    send_outgoing_email(&request).await?;
    Ok(true)
}

pub fn build_outgoing_email_request(message: &AFPMessage) -> Option<OutgoingEmailRequest> {
    match email_operation_kind(message) {
        Some("outgoing") => {
            let to = recipients_from_content(&message.content, &message.to);
            let subject = message.content.get("subject")?.as_str()?.trim().to_string();
            let body = body_from_content(&message.content)?;
            Some(OutgoingEmailRequest {
                thread_id: message.thread_id.clone(),
                message_id: message.id.clone(),
                parent_id: message.parent_id.clone(),
                to,
                subject,
                body,
                in_reply_to: in_reply_to_from_content(&message.content),
                references: references_from_content(&message.content),
            })
        }
        Some("reply") => {
            let to = recipients_from_content(&message.content, &message.to);
            let body = body_from_content(&message.content)?;
            let subject = message
                .content
                .get("subject")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("Re: Omnyid thread {}", message.thread_id));
            Some(OutgoingEmailRequest {
                thread_id: message.thread_id.clone(),
                message_id: message.id.clone(),
                parent_id: message.parent_id.clone(),
                to,
                subject,
                body,
                in_reply_to: in_reply_to_from_content(&message.content),
                references: references_from_content(&message.content),
            })
        }
        Some("forward") => {
            let to = recipients_from_content(&message.content, &message.to);
            let body = forward_body_from_content(&message.content)?;
            let subject = message
                .content
                .get("subject")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("Fwd: Omnyid thread {}", message.thread_id));
            Some(OutgoingEmailRequest {
                thread_id: message.thread_id.clone(),
                message_id: message.id.clone(),
                parent_id: message.parent_id.clone(),
                to,
                subject,
                body,
                in_reply_to: in_reply_to_from_content(&message.content),
                references: references_from_content(&message.content),
            })
        }
        _ => None,
    }
}

fn email_operation_kind(message: &AFPMessage) -> Option<&'static str> {
    match message.r#type.as_str() {
        "email_outgoing" => Some("outgoing"),
        "action_reply" => Some("reply"),
        "action_forward" => Some("forward"),
        "email" => match message.subtype.as_deref() {
            Some("outgoing") => Some("outgoing"),
            Some("reply") => Some("reply"),
            Some("forward") => Some("forward"),
            _ => None,
        },
        _ => None,
    }
}

#[instrument(skip(request), fields(thread_id = %request.thread_id, message_id = %request.message_id))]
pub async fn send_outgoing_email(request: &OutgoingEmailRequest) -> Result<(), String> {
    let config = MailGatewayConfig::from_env();

    match config.outbound_auth_mode {
        OutboundAuthMode::OAuthGmailApi => {
            let gmail_config = gmail_config_from_env(&config)?;
            send_gmail_message(request, &gmail_config).await
        }
        OutboundAuthMode::OAuthMicrosoftGraph => {
            // GAP-084: wire the real Microsoft Graph send path instead of the no-op placeholder.
            let graph_config = GraphOAuthConfig::from_env().ok_or_else(|| {
                "Microsoft Graph outbound email requires OMNYID_MS_TENANT_ID, \
                 OMNYID_MS_CLIENT_ID, OMNYID_MS_CLIENT_SECRET, OMNYID_MS_REFRESH_TOKEN, \
                 and OMNYID_MS_FROM_ADDRESS to be set"
                    .to_string()
            })?;
            send_graph_message(request, &graph_config).await
        }
        OutboundAuthMode::DirectSmtpFallback => {
            let smtp_config = smtp_fallback_config_from_env(&config)?;
            send_via_smtp_fallback(request, &smtp_config).await
        }
        OutboundAuthMode::Disabled => {
            warn!(
                thread_id = %request.thread_id,
                message_id = %request.message_id,
                "Omnyid outbound email disabled: no supported auth configured"
            );
            Err("Outbound email provider auth is not configured".to_string())
        }
    }
}

/// Send a transactional email (verification, password reset, etc.) without an AFP message context.
/// Falls through to the same configured outbound provider. Returns Ok(()) if provider is
/// unconfigured and logs a warning — callers should still proceed (token was created, link logged).
pub async fn send_transactional_email(to: &str, subject: &str, body: &str) -> Result<(), String> {
    let request = OutgoingEmailRequest {
        thread_id: format!("transactional-{}", ulid::Ulid::new()),
        message_id: format!("txemail-{}", ulid::Ulid::new()),
        parent_id: None,
        to: vec![to.to_string()],
        subject: subject.to_string(),
        body: body.to_string(),
        in_reply_to: None,
        references: vec![],
    };
    if let Some(result) = send_transactional_platform_email(to, subject, body).await {
        return result;
    }
    match send_outgoing_email(&request).await {
        Ok(()) => Ok(()),
        Err(primary_error) => {
            let Some(resend_api_key) = crate::secret_manager::read_process_secret_trimmed(
                "OMNYID_TRANSACTIONAL_RESEND_API_KEY",
            )
            .or_else(|| {
                crate::secret_manager::read_process_secret_trimmed(
                    "OMNYID_VENDOR_MAIL_RESEND_API_KEY",
                )
            }) else {
                return Err(primary_error);
            };

            let from_address = std::env::var("OMNYID_TRANSACTIONAL_FROM_ADDRESS")
                .ok()
                .or_else(|| std::env::var("FROM_ADDRESS").ok())
                .or_else(|| std::env::var("OMNYID_EMAIL_ADDRESS").ok())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    format!(
                        "{primary_error}; Resend fallback requires FROM_ADDRESS or OMNYID_EMAIL_ADDRESS"
                    )
                })?;

            warn!(
                error = %primary_error,
                "Primary transactional email delivery failed; attempting Resend fallback"
            );
            send_transactional_email_via_resend(
                &resend_api_key,
                &from_address,
                to,
                subject,
                body,
            )
            .await
            .map_err(|resend_error| {
                format!(
                    "Primary transactional delivery failed: {primary_error}; Resend fallback failed: {resend_error}"
                )
            })
        }
    }
}

/// Platform-owned account mail is separate from the Gmail continuity gateway.
/// Cloudflare Email Sending is attempted first; Resend is only used after that
/// attempt fails or when Cloudflare has not been configured yet.
async fn send_transactional_platform_email(
    to: &str,
    subject: &str,
    body: &str,
) -> Option<Result<(), String>> {
    let cloudflare_api_key = crate::secret_manager::read_process_secret_trimmed(
        "OMNYID_TRANSACTIONAL_CLOUDFLARE_API_TOKEN",
    )
    .or_else(|| {
        crate::secret_manager::read_process_secret_trimmed(
            "OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN",
        )
    });
    let cloudflare_account_id = std::env::var("OMNYID_TRANSACTIONAL_CLOUDFLARE_ACCOUNT_ID")
        .ok()
        .or_else(|| std::env::var("OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let resend_api_key =
        crate::secret_manager::read_process_secret_trimmed("OMNYID_TRANSACTIONAL_RESEND_API_KEY")
            .or_else(|| {
                crate::secret_manager::read_process_secret_trimmed(
                    "OMNYID_VENDOR_MAIL_RESEND_API_KEY",
                )
            });
    if cloudflare_api_key.is_none() && resend_api_key.is_none() {
        return None;
    }

    let from = std::env::var("OMNYID_TRANSACTIONAL_FROM_ADDRESS")
        .ok()
        .or_else(|| std::env::var("FROM_ADDRESS").ok())
        .or_else(|| std::env::var("OMNYID_EMAIL_ADDRESS").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let Some(from) = from else {
        return Some(Err("Transactional delivery requires OMNYID_TRANSACTIONAL_FROM_ADDRESS, FROM_ADDRESS, or OMNYID_EMAIL_ADDRESS".to_string()));
    };

    let cloudflare_error = match (cloudflare_api_key, cloudflare_account_id) {
        (Some(api_key), Some(account_id)) => match send_transactional_email_via_cloudflare(
            &api_key,
            &account_id,
            &from,
            to,
            subject,
            body,
        )
        .await
        {
            Ok(()) => return Some(Ok(())),
            Err(error) => {
                warn!(error = %error, "Cloudflare transactional email delivery failed; attempting Resend fallback");
                Some(error)
            }
        },
        (Some(_), None) => Some(
            "Cloudflare transactional email requires OMNYID_TRANSACTIONAL_CLOUDFLARE_ACCOUNT_ID"
                .to_string(),
        ),
        (None, _) => None,
    };

    match resend_api_key {
        Some(api_key) => Some(send_transactional_email_via_resend(&api_key, &from, to, subject, body)
            .await
            .map_err(|resend_error| match cloudflare_error {
                Some(cloudflare_error) => format!("Cloudflare primary failed: {cloudflare_error}; Resend fallback failed: {resend_error}"),
                None => resend_error,
            })),
        None => Some(Err(cloudflare_error.unwrap_or_else(|| "No platform transactional email provider is configured".to_string()))),
    }
}

async fn send_transactional_email_via_cloudflare(
    api_key: &str,
    account_id: &str,
    from: &str,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let response = reqwest::Client::new()
        .post(format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/email/sending/send",
            urlencoding::encode(account_id)
        ))
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "from": from,
            "to": [to],
            "subject": subject,
            "text": body,
        }))
        .send()
        .await
        .map_err(|error| format!("Cloudflare Email Sending request failed: {error}"))?;
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status();
    let detail = response.text().await.unwrap_or_default();
    Err(format!(
        "Cloudflare Email Sending returned {status}: {}",
        detail.chars().take(500).collect::<String>()
    ))
}

async fn send_transactional_email_via_resend(
    api_key: &str,
    from: &str,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let response = reqwest::Client::new()
        .post("https://api.resend.com/emails")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "from": from,
            "to": [to],
            "subject": subject,
            "text": body,
        }))
        .send()
        .await
        .map_err(|error| format!("Resend request failed: {error}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let detail = response.text().await.unwrap_or_default();
    let detail = detail.chars().take(500).collect::<String>();
    Err(format!("Resend returned {status}: {detail}"))
}

fn gmail_config_from_env(config: &MailGatewayConfig) -> Result<GmailOAuthConfig, String> {
    Ok(GmailOAuthConfig {
        client_id: config
            .gmail_client_id
            .clone()
            .ok_or_else(|| "OMNYID_GMAIL_CLIENT_ID is not configured".to_string())?,
        client_secret: config
            .gmail_client_secret
            .clone()
            .ok_or_else(|| "OMNYID_GMAIL_CLIENT_SECRET is not configured".to_string())?,
        refresh_token: config
            .gmail_refresh_token
            .clone()
            .ok_or_else(|| "OMNYID_GMAIL_REFRESH_TOKEN is not configured".to_string())?,
        user_id: config
            .gmail_user_id
            .clone()
            .unwrap_or_else(|| "me".to_string()),
        from_address: config
            .from_address
            .clone()
            .ok_or_else(|| "FROM_ADDRESS or OMNYID_EMAIL_ADDRESS is not configured".to_string())?,
    })
}

fn smtp_fallback_config_from_env(config: &MailGatewayConfig) -> Result<SmtpFallbackConfig, String> {
    Ok(SmtpFallbackConfig {
        host: config
            .smtp_host
            .clone()
            .ok_or_else(|| "SMTP_HOST is not configured".to_string())?,
        port: config.smtp_port,
        username: config
            .smtp_username
            .clone()
            .ok_or_else(|| "SMTP_USER is not configured".to_string())?,
        password: config
            .smtp_password
            .clone()
            .ok_or_else(|| "SMTP_PASS is not configured".to_string())?,
        from_address: config
            .from_address
            .clone()
            .ok_or_else(|| "FROM_ADDRESS or OMNYID_EMAIL_ADDRESS is not configured".to_string())?,
    })
}

fn recipients_from_content(content: &Value, fallback: &[String]) -> Vec<String> {
    let mut recipients = content
        .get("to")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if recipients.is_empty() {
        recipients = fallback
            .iter()
            .map(String::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect();
    }

    if recipients.is_empty() {
        vec![]
    } else {
        recipients
    }
}

fn body_from_content(content: &Value) -> Option<String> {
    content
        .get("body")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn forward_body_from_content(content: &Value) -> Option<String> {
    let forwarded_body = body_from_content(content);
    let note = content
        .get("note")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    match (note, forwarded_body) {
        (Some(note), Some(body)) => Some(format!("{note}\n\n{body}")),
        (Some(note), None) => Some(note),
        (None, Some(body)) => Some(body),
        (None, None) => None,
    }
}

fn in_reply_to_from_content(content: &Value) -> Option<String> {
    content
        .get("in_reply_to")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn references_from_content(content: &Value) -> Vec<String> {
    content
        .get("references")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{build_outgoing_email_request, dispatch_outgoing_message};
    use crate::message::AFPMessage;
    use serde_json::{Value, json};
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn sample_message(message_type: &str, subtype: Option<&str>, content: Value) -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_test_01".to_string(),
            thread_id: "thread_test_01".to_string(),
            parent_id: Some("msg_parent_01".to_string()),
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["friend@example.com".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: message_type.to_string(),
            kind: None,
            supertags: vec![],
            subtype: subtype.map(str::to_string),
            content,
            metadata: None,
            signature: "ed25519:test".to_string(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        }
    }

    #[test]
    fn email_outgoing_maps_to_gateway_request() {
        let request = build_outgoing_email_request(&sample_message(
            "email_outgoing",
            None,
            json!({
                "subject": "Hello",
                "body": "Body text"
            }),
        ))
        .expect("request");

        assert_eq!(request.to, vec!["friend@example.com".to_string()]);
        assert_eq!(request.subject, "Hello");
        assert_eq!(request.body, "Body text");
    }

    #[test]
    fn action_forward_combines_note_and_body() {
        let request = build_outgoing_email_request(&sample_message(
            "action_forward",
            None,
            json!({
                "to": ["other@example.com"],
                "note": "FYI",
                "body": "Forwarded body"
            }),
        ))
        .expect("request");

        assert_eq!(request.to, vec!["other@example.com".to_string()]);
        assert_eq!(request.body, "FYI\n\nForwarded body");
        assert_eq!(request.subject, "Fwd: Omnyid thread thread_test_01");
    }

    #[test]
    fn action_reply_maps_reply_headers_and_defaults_subject() {
        let request = build_outgoing_email_request(&sample_message(
            "action_reply",
            None,
            json!({
                "body": "Reply body",
                "in_reply_to": "<msg-1@example.com>",
                "references": ["<msg-0@example.com>", "<msg-1@example.com>"]
            }),
        ))
        .expect("request");

        assert_eq!(request.subject, "Re: Omnyid thread thread_test_01");
        assert_eq!(request.in_reply_to, Some("<msg-1@example.com>".to_string()));
        assert_eq!(
            request.references,
            vec![
                "<msg-0@example.com>".to_string(),
                "<msg-1@example.com>".to_string()
            ]
        );
    }

    #[tokio::test]
    async fn dispatch_reports_config_error_when_outbound_auth_missing() {
        let _guard = env_lock().lock().expect("env lock");
        for key in [
            "OMNYID_MAIL_PROVIDER",
            "OMNYID_GMAIL_CLIENT_ID",
            "OMNYID_GMAIL_CLIENT_SECRET",
            "OMNYID_GMAIL_REFRESH_TOKEN",
            "OMNYID_MICROSOFT_CLIENT_ID",
            "OMNYID_MICROSOFT_CLIENT_SECRET",
            "OMNYID_MICROSOFT_REFRESH_TOKEN",
            "SMTP_HOST",
            "SMTP_USER",
            "SMTP_PASS",
        ] {
            unsafe {
                std::env::remove_var(key);
            }
        }

        let error = dispatch_outgoing_message(&sample_message(
            "email_outgoing",
            None,
            json!({
                "subject": "Hello",
                "body": "Body text"
            }),
        ))
        .await
        .expect_err("dispatch should fail");

        assert!(error.contains("not configured"));
    }

    #[test]
    fn broad_email_outgoing_shape_maps_to_gateway_request() {
        let request = build_outgoing_email_request(&sample_message(
            "email",
            Some("outgoing"),
            json!({
                "subject": "Hello",
                "body": "Body text"
            }),
        ))
        .expect("request");

        assert_eq!(request.subject, "Hello");
        assert_eq!(request.body, "Body text");
    }
}
