use std::time::Duration;

use std::sync::Arc;

use sqlx;
use tokio::sync::broadcast;
use tonic::Response;
use tracing::{info, warn};

use crate::{
    afp::Ack,
    db::Db,
    gateway::{
        custom_imap::{CustomImapConfig, fetch_recent_messages as fetch_recent_imap_messages},
        gmail_api::{GmailOAuthConfig, fetch_gmail_raw_message, list_gmail_message_ids},
        graph_api::{
            GraphOAuthConfig, fetch_raw_message as fetch_graph_raw_message, list_inbox_messages,
        },
        smtp_in::handle_incoming_email,
    },
    metrics::Metrics,
    server::{app_to_proto, store_proto_message},
};

use super::provider::{InboundAuthMode, MailGatewayConfig, MailProvider};

pub async fn start_imap_sync(db: Db, metrics: Arc<Metrics>, relay_tx: broadcast::Sender<String>) {
    let config = MailGatewayConfig::from_env();
    tokio::spawn(async move {
        if matches!(config.provider, MailProvider::Disabled) {
            warn!("Omnyid mail sync disabled: no provider configured");
            return;
        }

        info!(
            provider = ?config.provider,
            auth_mode = ?config.inbound_auth_mode,
            poll_interval_seconds = config.poll_interval_seconds,
            "Omnyid mail sync scheduler started"
        );

        loop {
            let status_result = match config.inbound_auth_mode {
                InboundAuthMode::OAuthGmailApi => {
                    gmail_sync_tick(&db, &metrics, &relay_tx, &config).await
                }
                InboundAuthMode::OAuthMicrosoftGraph => {
                    graph_sync_tick(&db, &metrics, &relay_tx, &config).await
                }
                InboundAuthMode::DirectCredentialsFallback => {
                    custom_imap_sync_tick(&db, &metrics, &relay_tx, &config).await
                }
                InboundAuthMode::Disabled => {
                    warn!("Omnyid mail sync auth disabled");
                    Err("disabled".to_string())
                }
            };

            let account = config
                .email_address
                .clone()
                .unwrap_or_else(|| "unknown-account".to_string());
            let checkpoint_status = match &status_result {
                Ok((status, _)) => status.as_str(),
                Err(_) => "disabled",
            };
            let checkpoint_error = match &status_result {
                Ok((_, error)) => error.as_deref(),
                Err(error) => Some(error.as_str()),
            };

            if let Err(err) = db
                .upsert_mail_sync_checkpoint(
                    config.provider_label(),
                    &account,
                    None,
                    status_result
                        .as_ref()
                        .ok()
                        .and_then(|(_, last_message_id)| last_message_id.as_deref()),
                    checkpoint_status,
                    checkpoint_error,
                )
                .await
            {
                warn!(%err, "Omnyid mail sync checkpoint update failed");
            }

            if status_result.is_err() {
                return;
            }

            tokio::time::sleep(Duration::from_secs(config.poll_interval_seconds)).await;
        }
    });
}

async fn gmail_sync_tick(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    config: &MailGatewayConfig,
) -> Result<(String, Option<String>), String> {
    let gmail_config = gmail_config_from_env(config)?;
    let account = config
        .email_address
        .clone()
        .unwrap_or_else(|| "unknown-account".to_string());
    let messages = list_gmail_message_ids(&gmail_config, 10).await?;

    let last_seen = db_checkpoint_last_message_id(db, config.provider_label(), &account).await;
    let mut pending_ids = messages
        .into_iter()
        .map(|message| message.id)
        .collect::<Vec<_>>();
    if let Some(last_seen_id) = last_seen.as_deref() {
        if let Some(index) = pending_ids
            .iter()
            .position(|message_id| message_id == last_seen_id)
        {
            pending_ids.truncate(index);
        }
    }
    pending_ids.reverse();

    let mut newest_processed: Option<String> = None;
    for message_id in pending_ids {
        let raw_email = fetch_gmail_raw_message(&gmail_config, &message_id).await?;
        let message = handle_incoming_email(&raw_email).await?;
        persist_gateway_message(db, metrics, relay_tx, message)
            .await
            .map_err(|err| err.to_string())?;
        newest_processed = Some(message_id);
    }

    Ok(("oauth_gmail_api".to_string(), newest_processed))
}

async fn custom_imap_sync_tick(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    config: &MailGatewayConfig,
) -> Result<(String, Option<String>), String> {
    let imap_config = custom_imap_config_from_env(config)?;
    let account = config
        .email_address
        .clone()
        .or_else(|| config.imap_username.clone())
        .unwrap_or_else(|| "unknown-account".to_string());
    let last_seen_uid = db_checkpoint_last_message_id(db, config.provider_label(), &account)
        .await
        .and_then(|value| value.parse::<u32>().ok());
    let messages = fetch_recent_imap_messages(imap_config, last_seen_uid, 10).await?;

    let mut newest_processed: Option<String> = None;
    for fetched in messages {
        let message = handle_incoming_email(&fetched.raw_email).await?;
        persist_gateway_message(db, metrics, relay_tx, message)
            .await
            .map_err(|err| err.to_string())?;
        newest_processed = Some(fetched.uid.to_string());
    }

    Ok(("direct_credentials_fallback".to_string(), newest_processed))
}

async fn persist_gateway_message(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    message: crate::message::AFPMessage,
) -> Result<Response<Ack>, tonic::Status> {
    store_proto_message(db, metrics, relay_tx, app_to_proto(message)).await
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

async fn graph_sync_tick(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    config: &MailGatewayConfig,
) -> Result<(String, Option<String>), String> {
    let graph_config = graph_config_from_env()?;
    let account = config
        .email_address
        .clone()
        .unwrap_or_else(|| graph_config.from_address.clone());

    // Use stored delta_link as the checkpoint (it's a URL, not a simple ID)
    let delta_link = db_checkpoint_last_message_id(db, config.provider_label(), &account).await;
    let (messages, new_checkpoint) =
        list_inbox_messages(&graph_config, delta_link.as_deref()).await?;

    let mut newest_processed: Option<String> = None;
    for meta in messages {
        let raw_bytes = fetch_graph_raw_message(&graph_config, &meta.id).await?;
        let message = handle_incoming_email(&raw_bytes).await?;
        persist_gateway_message(db, metrics, relay_tx, message)
            .await
            .map_err(|err| err.to_string())?;
        newest_processed = Some(meta.id);
    }

    // Persist the new delta_link as checkpoint so next tick uses delta sync
    let checkpoint = new_checkpoint.or(newest_processed.clone());
    Ok(("oauth_microsoft_graph".to_string(), checkpoint))
}

fn graph_config_from_env() -> Result<GraphOAuthConfig, String> {
    GraphOAuthConfig::from_env()
        .ok_or_else(|| "Microsoft Graph config incomplete: check OMNYID_MS_* env vars".to_string())
}

fn custom_imap_config_from_env(config: &MailGatewayConfig) -> Result<CustomImapConfig, String> {
    Ok(CustomImapConfig {
        host: config
            .imap_host
            .clone()
            .ok_or_else(|| "OMNYID_IMAP_HOST is not configured".to_string())?,
        port: config.imap_port,
        username: config
            .imap_username
            .clone()
            .ok_or_else(|| "OMNYID_IMAP_USERNAME is not configured".to_string())?,
        password: config
            .imap_password
            .clone()
            .ok_or_else(|| "OMNYID_IMAP_PASSWORD is not configured".to_string())?,
    })
}

async fn db_checkpoint_last_message_id(db: &Db, provider: &str, account: &str) -> Option<String> {
    sqlx::query_scalar::<_, Option<String>>(
        r#"
        SELECT last_message_id
        FROM mail_sync_checkpoints
        WHERE provider = $1 AND account = $2
        "#,
    )
    .bind(provider)
    .bind(account)
    .fetch_optional(&db.pool)
    .await
    .ok()
    .flatten()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::{InboundAuthMode, MailGatewayConfig, MailProvider};

    #[test]
    fn scheduler_uses_shared_gateway_config() {
        let config = MailGatewayConfig {
            provider: MailProvider::CustomImap,
            inbound_auth_mode: InboundAuthMode::DirectCredentialsFallback,
            outbound_auth_mode: super::super::provider::OutboundAuthMode::DirectSmtpFallback,
            poll_interval_seconds: 30,
            email_address: Some("user@example.com".to_string()),
            imap_host: Some("mail.example.com".to_string()),
            imap_port: 993,
            imap_username: Some("user@example.com".to_string()),
            imap_password: Some("secret".to_string()),
            smtp_host: Some("smtp.example.com".to_string()),
            smtp_port: 587,
            smtp_username: Some("user@example.com".to_string()),
            smtp_password: Some("secret".to_string()),
            gmail_client_id: None,
            gmail_client_secret: None,
            gmail_refresh_token: None,
            gmail_user_id: None,
            from_address: Some("user@example.com".to_string()),
        };

        assert_eq!(config.provider, MailProvider::CustomImap);
        assert_eq!(
            config.inbound_auth_mode,
            InboundAuthMode::DirectCredentialsFallback
        );
        assert!(config.inbound_enabled());
    }
}
