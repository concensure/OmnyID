/*
 * @locs-version: 1.1
 * @module-id: gateway.slack
 * @module-name: SlackGateway
 * @category: gateway
 * @domain: external-integration
 * @primary-capability: slack-message-posting
 * @sub-capabilities: webhook-post,channel-routing
 * @version: 1.0.0
 * @stability: draft
 * @state-model: stateless
 * @side-effects: explicit
 * @inputs: SlackConfig, optional channel, message text
 * @outputs: unit Ok or error string
 * @dependencies: [reqwest, serde_json]
 * @guard-mode: editable
 */

//! Slack gateway via Incoming Webhooks.
//!
//! Config is sourced from `OMNYID_SLACK_WEBHOOK_URL`. When the env var is unset
//! `post_message` returns `Ok(())` silently so orchestration continues without
//! a real Slack workspace configured.

use std::sync::OnceLock;

// GAP-097: shared client for connection pooling across all Slack calls.
static SLACK_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
fn slack_client() -> &'static reqwest::Client {
    SLACK_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_default()
    })
}

/* locs:section id=types edit=editable role=contract */

/// Config for the Slack gateway.
pub struct SlackConfig {
    /// Incoming Webhook URL. Empty string → no-op (graceful stub).
    pub webhook_url: String,
}

/* locs:end */

/* locs:section id=impl edit=editable role=implementation */

/// Post a message to Slack via an Incoming Webhook.
///
/// `channel` overrides the webhook's default channel when provided.
/// When `cfg.webhook_url` is empty returns `Ok(())` without making a request.
pub async fn post_message(
    cfg: &SlackConfig,
    channel: Option<&str>,
    text: &str,
) -> Result<(), String> {
    if cfg.webhook_url.is_empty() {
        // Graceful no-op — integration not configured.
        return Ok(());
    }

    let mut payload = serde_json::json!({ "text": text });
    if let Some(ch) = channel {
        payload["channel"] = serde_json::Value::String(ch.to_string());
    }

    let resp = slack_client()
        .post(&cfg.webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("Slack webhook error {status}"));
    }

    Ok(())
}

/* locs:end */

/* locs:section id=tests edit=editable role=example */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_webhook_is_noop() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let cfg = SlackConfig {
            webhook_url: String::new(),
        };
        let result = rt.block_on(post_message(&cfg, None, "hello"));
        assert!(result.is_ok());
    }

    #[test]
    fn slack_client_is_shared_singleton() {
        assert!(std::ptr::eq(slack_client(), slack_client()));
    }

    #[test]
    fn slack_error_message_does_not_depend_on_upstream_body() {
        let status = reqwest::StatusCode::BAD_REQUEST;
        let message = format!("Slack webhook error {status}");

        assert_eq!(message, "Slack webhook error 400 Bad Request");
        assert!(!message.contains("invalid_auth"));
    }
}

/* locs:end */
