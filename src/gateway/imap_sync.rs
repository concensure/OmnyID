use std::time::Duration;

use std::sync::Arc;

use serde_json::Value;
use sqlx;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tonic::Response;
use tracing::{debug, info, warn};
use ulid::Ulid;

use crate::{
    afp::Ack,
    daemon_runtime::ShutdownRx,
    db::{Db, GmailTokenRecord, PersonalAutomationConversationRecord},
    gateway::{
        custom_imap::{CustomImapConfig, fetch_recent_messages as fetch_recent_imap_messages},
        gmail_api::{GmailOAuthConfig, fetch_gmail_raw_message, list_gmail_message_ids},
        graph_api::{
            GraphOAuthConfig, fetch_raw_message as fetch_graph_raw_message, list_inbox_messages,
        },
        smtp_in::{handle_incoming_email, summarize_incoming_email},
    },
    message::{AFPMessage, AfpPassiveEventContent},
    metrics::Metrics,
    personal_event_ingestion::{
        enrich_mail_passive_event_with_recent_contact_context,
        enrich_mail_passive_event_with_recent_conversation_context,
        enrich_mail_passive_event_with_recent_thread_context,
        enrich_mail_passive_event_with_reply_policy, plan_passive_event_background_artifact,
    },
    server::{
        app_to_proto, auth::store_private_app_message, env_hex_32, sign_server_generated_message,
        store_proto_message,
    },
};

use super::provider::{InboundAuthMode, MailGatewayConfig, MailProvider};

const CROCKFORD_BASE32_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Derives a stable 26-character ULID-shaped id from an arbitrary label, for
/// callers that need a fixed synthetic thread/message id that still passes
/// `validate_proto_message`'s ULID format check.
fn deterministic_pseudo_ulid(label: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(label.as_bytes());
    digest
        .iter()
        .take(26)
        .map(|byte| CROCKFORD_BASE32_ALPHABET[(*byte % 32) as usize] as char)
        .collect()
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct GmailSyncTarget {
    owner_user_id: Option<String>,
    account: String,
    config: GmailOAuthConfig,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MailSyncErrorPolicy {
    checkpoint_status: &'static str,
    initial_backoff_seconds: u64,
    is_permanent: bool,
}

pub fn start_imap_sync(
    db: Db,
    metrics: Arc<Metrics>,
    relay_tx: broadcast::Sender<String>,
    mut shutdown: ShutdownRx,
) -> JoinHandle<()> {
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

        // GAP-085: track consecutive failures for exponential backoff.
        // The loop never exits permanently on transient errors.
        let mut consecutive_failures: u32 = 0;

        loop {
            if *shutdown.borrow() {
                info!("Omnyid mail sync scheduler: graceful shutdown");
                break;
            }
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
                    // Disabled is permanent; exit the task.
                    return;
                }
            };

            let account = config
                .email_address
                .clone()
                .unwrap_or_else(|| "unknown-account".to_string());
            let error_policy = match &status_result {
                Ok(_) => None,
                Err(error) => Some(classify_mail_sync_error(error)),
            };
            let checkpoint_status = match (&status_result, error_policy) {
                (Ok((status, _)), _) => status.as_str(),
                (Err(_), Some(policy)) => policy.checkpoint_status,
                (Err(_), None) => "error",
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

            let sleep_secs = if status_result.is_err() {
                consecutive_failures += 1;
                let policy = error_policy.unwrap_or(MailSyncErrorPolicy {
                    checkpoint_status: "error",
                    initial_backoff_seconds: 30,
                    is_permanent: false,
                });
                let backoff = if policy.is_permanent {
                    policy.initial_backoff_seconds
                } else {
                    // Exponential backoff: 30s, 60s, 120s … capped at 15 min.
                    (policy.initial_backoff_seconds * (1u64 << consecutive_failures.min(5)))
                        .min(900)
                };
                let error = status_result
                    .as_ref()
                    .err()
                    .map(String::as_str)
                    .unwrap_or("");
                warn!(
                    provider = config.provider_label(),
                    account = %account,
                    checkpoint_status = policy.checkpoint_status,
                    is_permanent = policy.is_permanent,
                    consecutive_failures,
                    backoff_seconds = backoff,
                    error = %error,
                    "Omnyid mail sync tick failed — will retry"
                );
                backoff
            } else {
                consecutive_failures = 0;
                config.poll_interval_seconds
            };

            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(sleep_secs)) => {}
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Omnyid mail sync scheduler: graceful shutdown");
                        break;
                    }
                }
            }
        }
    })
}

async fn gmail_sync_tick(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    config: &MailGatewayConfig,
) -> Result<(String, Option<String>), String> {
    // GAP-086 (pass 4): fetch up to OMNYID_GMAIL_SYNC_BATCH_SIZE messages per tick
    // (default 50) so high-volume inboxes don't permanently miss emails.
    let batch_size = mail_sync_batch_size("OMNYID_GMAIL_SYNC_BATCH_SIZE", 50);
    let targets = gmail_sync_targets(db, config).await?;
    let mut newest_processed_any: Option<String> = None;

    for target in targets {
        let messages = list_gmail_message_ids(&target.config, batch_size).await?;

        let last_seen =
            db_checkpoint_last_message_id(db, config.provider_label(), &target.account).await;
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
            let raw_email = fetch_gmail_raw_message(&target.config, &message_id).await?;
            let message = handle_incoming_email(&raw_email).await?;
            let raw_gateway_message_id = message.id.clone();
            persist_gateway_message(db, metrics, relay_tx, message)
                .await
                .map_err(|err| err.to_string())?;
            if let Some(owner_user_id) = target.owner_user_id.as_deref() {
                emit_gmail_personal_automation(
                    db,
                    metrics,
                    relay_tx,
                    owner_user_id,
                    &target.account,
                    &message_id,
                    &raw_email,
                )
                .await?;
                try_emit_wedding_vendor_reply(
                    db,
                    metrics,
                    relay_tx,
                    owner_user_id,
                    &raw_gateway_message_id,
                    &raw_email,
                )
                .await;
            }
            newest_processed = Some(message_id);
        }

        if let Err(err) = db
            .upsert_mail_sync_checkpoint(
                config.provider_label(),
                &target.account,
                None,
                newest_processed.as_deref(),
                "oauth_gmail_api",
                None,
            )
            .await
        {
            warn!(%err, account = %target.account, "Omnyid Gmail sync checkpoint update failed");
        }

        if newest_processed.is_some() {
            newest_processed_any = newest_processed;
        }
    }

    Ok(("oauth_gmail_api".to_string(), newest_processed_any))
}

async fn custom_imap_sync_tick(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    config: &MailGatewayConfig,
) -> Result<(String, Option<String>), String> {
    let batch_size = mail_sync_batch_size("OMNYID_IMAP_SYNC_BATCH_SIZE", 50);
    let imap_config = custom_imap_config_from_env(config)?;
    let account = config
        .email_address
        .clone()
        .or_else(|| config.imap_username.clone())
        .unwrap_or_else(|| "unknown-account".to_string());
    let last_seen_uid = db_checkpoint_last_message_id(db, config.provider_label(), &account)
        .await
        .and_then(|value| value.parse::<u32>().ok());
    let messages = fetch_recent_imap_messages(imap_config, last_seen_uid, batch_size).await?;

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

/// The In-Reply-To header plus every References entry, deduplicated — the set
/// of message ids that, if one of them is a vendor outreach's outbound
/// message id, means this email is a reply to that outreach.
fn wedding_vendor_reply_candidates(
    summary: &crate::gateway::smtp_in::IncomingEmailSummary,
) -> Vec<String> {
    let mut candidates: Vec<String> = Vec::new();
    if let Some(in_reply_to) = summary.in_reply_to.as_deref() {
        let trimmed = in_reply_to.trim();
        if !trimmed.is_empty() {
            candidates.push(trimmed.to_string());
        }
    }
    for reference in &summary.reference_targets {
        let trimmed = reference.trim();
        if !trimmed.is_empty() && !candidates.iter().any(|existing| existing == trimmed) {
            candidates.push(trimmed.to_string());
        }
    }
    candidates
}

/// Matches an inbound Gmail reply back to a wedding vendor outreach and, on a
/// hit, stores a derived "wedding_vendor_reply_received" AFP message so the
/// follow-up card can show it. This must never fail the sync tick — a lookup
/// or persist error here is logged at debug and swallowed, same as "no match".
async fn try_emit_wedding_vendor_reply(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    raw_gateway_message_id: &str,
    raw_email: &[u8],
) {
    let summary = summarize_incoming_email(raw_email);
    let sender = summary.smtp_from.trim();
    let candidates = wedding_vendor_reply_candidates(&summary);

    if candidates.is_empty() && sender.is_empty() {
        return;
    }

    let matched = match db
        .find_wedding_vendor_contact_for_reply(owner_user_id, &candidates, sender)
        .await
    {
        Ok(Some(matched)) => matched,
        Ok(None) => return,
        Err(err) => {
            debug!(%err, owner_user_id, "wedding vendor reply match lookup failed");
            return;
        }
    };

    let received_at = chrono::Utc::now().to_rfc3339();
    if let Err(err) = db
        .mark_wedding_vendor_contact_response_received(
            owner_user_id,
            &matched.vendor_id,
            &received_at,
        )
        .await
    {
        debug!(%err, owner_user_id, vendor_id = %matched.vendor_id, "failed to mark wedding vendor response_received_at");
    }

    let Some(thread_id) = matched
        .thread_id
        .clone()
        .filter(|value| !value.trim().is_empty())
    else {
        debug!(
            owner_user_id,
            vendor_id = %matched.vendor_id,
            "matched wedding vendor contact has no outreach thread_id; skipping derived reply message"
        );
        return;
    };

    let subject = summary.subject.trim();
    let snippet: String = summary.body_preview.chars().take(500).collect();
    let content = serde_json::json!({
        "subject": subject,
        "snippet": snippet,
        "from": sender,
        "received_at": received_at,
    });
    let metadata = serde_json::json!({
        "vendor_id": matched.vendor_id,
        "vendor_label": matched.vendor_label,
        "vendor_contact_thread_id": thread_id,
        "vendor_contact_receipt_ref": matched.receipt_ref,
        "response_received_at": received_at,
        "provider": "gmail",
    });

    let message = match build_wedding_vendor_reply_message(
        owner_user_id,
        &thread_id,
        raw_gateway_message_id,
        content,
        metadata,
    ) {
        Ok(message) => message,
        Err(err) => {
            debug!(%err, owner_user_id, "failed to build wedding vendor reply AFP message");
            return;
        }
    };

    if let Err(err) = store_private_app_message(db, metrics, relay_tx, owner_user_id, message).await
    {
        debug!(%err, owner_user_id, "failed to store wedding vendor reply AFP message");
    }
}

/// Builds the derived "a vendor replied" AFP message directly (rather than via
/// `new_server_message`, whose fixed type taxonomy has no room for a custom
/// parent_id/supertags combination) so `parent_id` and `supertags` can be baked
/// into the encryption AAD before the content is sealed.
fn build_wedding_vendor_reply_message(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: &str,
    content: Value,
    metadata: Value,
) -> Result<crate::message::AFPMessage, String> {
    let encryption_key = env_hex_32("OMNYID_ENCRYPTION_KEY_HEX")?.ok_or_else(|| {
        "OMNYID_ENCRYPTION_KEY_HEX must be configured for server-generated messages".to_string()
    })?;
    let message_id = Ulid::new().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let from = "agent://wedding-gateway".to_string();
    let to = vec![owner_user_id.to_string()];
    let message_type = "email";
    let subtype = "wedding_vendor_reply_received";
    let aad = serde_json::json!({
        "protocol": "afp-v1",
        "id": message_id,
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": from,
        "to": to,
        "timestamp": timestamp,
        "type": message_type,
        "subtype": subtype,
        "metadata": metadata.clone(),
    });
    let encryption = crate::crypto::encrypt_content(&content, &aad, &encryption_key);
    let mut message = crate::message::AFPMessage {
        protocol: "afp-v1".to_string(),
        id: message_id,
        thread_id: thread_id.to_string(),
        parent_id: Some(parent_id.to_string()),
        from,
        to,
        timestamp,
        r#type: message_type.to_string(),
        kind: Some(subtype.to_string()),
        supertags: vec![
            "template:wedding_planning".to_string(),
            "event:wedding".to_string(),
            "wedding_vendor_reply".to_string(),
            "needs_follow_up".to_string(),
        ],
        subtype: Some(subtype.to_string()),
        content,
        metadata: Some(metadata),
        signature: String::new(),
        encryption: Some(encryption),
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    };
    sign_server_generated_message(&mut message)?;
    Ok(message)
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

async fn gmail_sync_targets(
    db: &Db,
    config: &MailGatewayConfig,
) -> Result<Vec<GmailSyncTarget>, String> {
    let client_id = config
        .gmail_client_id
        .clone()
        .ok_or_else(|| "OMNYID_GMAIL_CLIENT_ID is not configured".to_string())?;
    let client_secret = config
        .gmail_client_secret
        .clone()
        .ok_or_else(|| "OMNYID_GMAIL_CLIENT_SECRET is not configured".to_string())?;
    let user_scoped_tokens = db
        .list_connected_gmail_tokens()
        .await
        .map_err(|err| format!("Failed to list connected Gmail accounts: {err}"))?;

    if !user_scoped_tokens.is_empty() {
        return Ok(user_scoped_tokens
            .into_iter()
            .map(|token| gmail_sync_target_from_record(&client_id, &client_secret, token))
            .collect());
    }

    Ok(vec![GmailSyncTarget {
        owner_user_id: None,
        account: config
            .email_address
            .clone()
            .unwrap_or_else(|| "unknown-account".to_string()),
        config: gmail_config_from_env(config)?,
    }])
}

fn gmail_sync_target_from_record(
    client_id: &str,
    client_secret: &str,
    token: GmailTokenRecord,
) -> GmailSyncTarget {
    GmailSyncTarget {
        owner_user_id: Some(token.user_id),
        account: token.gmail_email.clone(),
        config: GmailOAuthConfig {
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            refresh_token: token.refresh_token,
            user_id: "me".to_string(),
            from_address: token.gmail_email,
        },
    }
}

async fn emit_gmail_personal_automation(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    gmail_email: &str,
    external_message_id: &str,
    raw_email: &[u8],
) -> Result<(), String> {
    let summary = summarize_incoming_email(raw_email);
    let observed_at = chrono::Utc::now().to_rfc3339();
    let event_content =
        build_gmail_passive_event_content(gmail_email, external_message_id, &summary);
    let reply_policy_metadata = db
        .get_contact_reply_policy_metadata(owner_user_id, summary.smtp_from.trim())
        .await
        .map_err(|err| format!("failed to load contact reply policy: {err}"))?;
    let recent_contact_context = db
        .recent_private_incoming_email_context(
            owner_user_id,
            summary.smtp_from.trim(),
            Some(&summary.smtp_message_id),
            3,
        )
        .await
        .map_err(|err| format!("failed to load recent contact email context: {err}"))?;
    let recent_conversation_context = db
        .recent_private_incoming_email_conversation_context(
            owner_user_id,
            &summary.external_conversation_key,
            Some(&summary.smtp_message_id),
            4,
        )
        .await
        .map_err(|err| format!("failed to load recent conversation email context: {err}"))?;
    let recent_thread_context = db
        .recent_private_incoming_email_thread_context(
            owner_user_id,
            &thread_reference_targets(&summary),
            Some(&summary.smtp_message_id),
            3,
        )
        .await
        .map_err(|err| format!("failed to load recent thread email context: {err}"))?;
    let event_content =
        enrich_mail_passive_event_with_reply_policy(&event_content, reply_policy_metadata.as_ref());
    let event_content = enrich_mail_passive_event_with_recent_conversation_context(
        &event_content,
        &recent_conversation_context,
    );
    let event_content = enrich_mail_passive_event_with_recent_contact_context(
        &event_content,
        &recent_contact_context,
    );
    let event_content = enrich_mail_passive_event_with_recent_thread_context(
        &event_content,
        &recent_thread_context,
    );
    // validate_proto_message (GAP-098) requires thread_id to be a valid ULID,
    // so the human-readable "passive:{user_id}" label can't be stored directly —
    // derive a stable, ULID-shaped id from it instead so all passive events for
    // a user keep landing in the same synthetic thread.
    let thread_id = deterministic_pseudo_ulid(&format!("passive:{owner_user_id}"));
    let event_afp_id = format!("gmail:{gmail_email}:{external_message_id}");

    let connected_capabilities = db
        .list_user_connected_capabilities(owner_user_id)
        .await
        .map_err(|err| format!("failed to load connected capabilities: {err}"))?;
    let priority_rules = db
        .get_master_agent_instance(owner_user_id)
        .await
        .map_err(|err| format!("failed to load master agent instance: {err}"))?
        .and_then(|instance| instance.get("priority_rules").cloned())
        .unwrap_or_else(crate::agent_template::default_priority_rules);
    let automation_artifact_json = plan_passive_event_background_artifact(
        owner_user_id,
        &thread_id,
        &event_afp_id,
        &event_content,
        "email_incoming",
        &connected_capabilities,
        &priority_rules,
    );
    db.upsert_personal_automation_conversation(&gmail_conversation_record(
        owner_user_id,
        gmail_email,
        external_message_id,
        &summary,
        &observed_at,
        &thread_id,
        &event_afp_id,
        automation_artifact_json.as_ref(),
    ))
    .await
    .map_err(|err| format!("failed to upsert gmail conversation registry entry: {err}"))?;

    if let Some(automation_artifact_json) = automation_artifact_json {
        let automation_message = serde_json::from_value::<AFPMessage>(automation_artifact_json)
            .map_err(|err| format!("failed to decode automation artifact AFP: {err}"))?;
        store_private_app_message(db, metrics, relay_tx, owner_user_id, automation_message)
            .await
            .map_err(|err| err.message().to_string())?;
    }

    Ok(())
}

fn build_gmail_passive_event_content(
    gmail_email: &str,
    external_message_id: &str,
    summary: &crate::gateway::smtp_in::IncomingEmailSummary,
) -> AfpPassiveEventContent {
    let body_preview = summary.body_preview.trim().to_string();
    let subject = summary.subject.trim().to_string();
    AfpPassiveEventContent {
        event_type: "email_incoming".to_string(),
        confidence: 1.0,
        metadata: serde_json::json!({
            "provider": "gmail",
            "gmail_email": gmail_email,
            "account_ref": gmail_email,
            "message_id": external_message_id,
            "smtp_message_id": summary.smtp_message_id,
            "subject": subject,
            "snippet": body_preview,
            "from_address": summary.smtp_from,
            "to_address": summary.smtp_to,
            "requires_action": contains_mail_action_keywords(&subject)
                || contains_mail_action_keywords(&body_preview),
            "in_reply_to": summary.in_reply_to,
            "reference_targets": summary.reference_targets,
            "external_conversation_key": summary.external_conversation_key,
        }),
        entity_id: Some(external_message_id.to_string()),
        source: "gmail_watch".to_string(),
        payload: Some(serde_json::json!({
            "provider": "gmail",
            "gmail_email": gmail_email,
            "account_ref": gmail_email,
            "message_id": external_message_id,
            "subject": subject,
            "snippet": body_preview,
            "from_address": summary.smtp_from,
            "to_address": summary.smtp_to,
            "external_conversation_key": summary.external_conversation_key,
        })),
        context: None,
        event_at: chrono::Utc::now().to_rfc3339(),
    }
}

fn gmail_conversation_record(
    owner_user_id: &str,
    gmail_email: &str,
    external_message_id: &str,
    summary: &crate::gateway::smtp_in::IncomingEmailSummary,
    observed_at: &str,
    thread_id: &str,
    source_event_id: &str,
    automation_artifact_json: Option<&Value>,
) -> PersonalAutomationConversationRecord {
    let (
        needs_attention,
        latest_attention_kind,
        latest_artifact_id,
        latest_artifact_type,
        latest_artifact_subtype,
        latest_artifact_draft_class,
        latest_artifact_destination_view,
        latest_value_hint,
        latest_artifact_summary,
    ) = conversation_attention_metadata(automation_artifact_json);
    let attention_rank = crate::conversation_attention::conversation_attention_rank(
        "communications",
        latest_attention_kind,
        latest_value_hint.as_deref(),
    );
    PersonalAutomationConversationRecord {
        id: String::new(),
        user_id: owner_user_id.to_string(),
        provider: "gmail".to_string(),
        account_ref: gmail_email.to_string(),
        conversation_key: summary.external_conversation_key.clone(),
        conversation_family: "communications".to_string(),
        display_label: if summary.subject.trim().is_empty() {
            format!("Conversation with {}", summary.smtp_from.trim())
        } else {
            summary.subject.trim().to_string()
        },
        latest_message_ref: Some(external_message_id.to_string()),
        latest_subject: Some(summary.subject.trim().to_string()),
        latest_sender: Some(summary.smtp_from.trim().to_string()),
        health_state: "active".to_string(),
        first_observed_at: observed_at.to_string(),
        last_observed_at: observed_at.to_string(),
        metadata_json: serde_json::json!({
            "provider_label": "Gmail",
            "external_conversation_key": summary.external_conversation_key,
            "smtp_message_id": summary.smtp_message_id,
            "in_reply_to": summary.in_reply_to,
            "reference_targets": summary.reference_targets,
            "from_address": summary.smtp_from,
            "to_address": summary.smtp_to,
            "thread_id": thread_id,
            "source_event_id": source_event_id,
            "needs_attention": needs_attention,
            "attention_rank": attention_rank,
            "latest_attention_kind": latest_attention_kind,
            "latest_artifact_id": latest_artifact_id,
            "latest_artifact_type": latest_artifact_type,
            "latest_artifact_subtype": latest_artifact_subtype,
            "latest_artifact_draft_class": latest_artifact_draft_class,
            "latest_artifact_destination_view": latest_artifact_destination_view,
            "latest_value_hint": latest_value_hint,
            "latest_artifact_summary": latest_artifact_summary,
        }),
    }
}

fn conversation_attention_metadata(
    automation_artifact_json: Option<&Value>,
) -> (
    bool,
    &'static str,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let Some(artifact) = automation_artifact_json else {
        return (false, "none", None, None, None, None, None, None, None);
    };

    let artifact_id = artifact
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let artifact_type = artifact
        .get("type")
        .and_then(Value::as_str)
        .map(str::to_string);
    let artifact_subtype = artifact
        .get("subtype")
        .and_then(Value::as_str)
        .map(str::to_string);
    let artifact_draft_class = artifact
        .get("content")
        .and_then(Value::as_object)
        .and_then(|content| content.get("draft_class"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let artifact_destination_view = artifact
        .get("content")
        .and_then(Value::as_object)
        .and_then(|content| content.get("destination_view"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            artifact_draft_class
                .as_deref()
                .map(crate::prepared_draft_semantics::prepared_draft_destination_view)
                .map(str::to_string)
        });
    let artifact_summary = artifact
        .get("content")
        .and_then(Value::as_object)
        .and_then(|content| {
            content
                .get("summary")
                .and_then(Value::as_str)
                .or_else(|| content.get("message").and_then(Value::as_str))
                .or_else(|| content.get("label").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let value_hint = artifact_value_hint(artifact);
    let attention_kind = match (artifact_type.as_deref(), artifact_subtype.as_deref()) {
        (Some("watcher_alert"), _) => "approval_request",
        (Some("ledger"), Some("prepared_draft")) => "prepared_draft",
        _ => "background_follow_up",
    };

    (
        true,
        attention_kind,
        artifact_id,
        artifact_type,
        artifact_subtype,
        artifact_draft_class,
        artifact_destination_view,
        value_hint,
        artifact_summary,
    )
}

fn artifact_value_hint(artifact: &Value) -> Option<String> {
    let searchable = artifact
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get("searchable_metadata"))
        .and_then(Value::as_object)?;
    let domain = searchable
        .get("prepared_draft_domain")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if domain != "renewal_review" {
        return None;
    }

    let current_cost = searchable.get("current_cost_usd").and_then(Value::as_f64);
    let alternative_cost = searchable
        .get("alternative_cost_usd")
        .and_then(Value::as_f64);
    if let (Some(current), Some(alternative)) = (current_cost, alternative_cost) {
        if alternative < current {
            return Some(format!("Potential savings: ${:.2}", current - alternative));
        }
    }

    searchable
        .get("days_until_renewal")
        .and_then(Value::as_i64)
        .map(|days| {
            if days <= 0 {
                "Renewal is due now".to_string()
            } else if days == 1 {
                "Renewal due in 1 day".to_string()
            } else {
                format!("Renewal due in {days} days")
            }
        })
}

fn thread_reference_targets(
    summary: &crate::gateway::smtp_in::IncomingEmailSummary,
) -> Vec<String> {
    let mut targets = Vec::new();
    if let Some(in_reply_to) = summary
        .in_reply_to
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        targets.push(in_reply_to.to_string());
    }
    for target in &summary.reference_targets {
        let trimmed = target.trim();
        if !trimmed.is_empty() {
            targets.push(trimmed.to_string());
        }
    }
    targets.sort();
    targets.dedup();
    targets
}

fn contains_mail_action_keywords(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "please reply",
        "can you",
        "could you",
        "action required",
        "needs your response",
        "approval needed",
        "invoice",
        "payment due",
        "urgent",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn classify_mail_sync_error(error: &str) -> MailSyncErrorPolicy {
    let normalized = error.to_ascii_lowercase();
    if normalized.contains("invalid_grant")
        || normalized.contains("invalid_client")
        || normalized.contains("refresh token")
        || normalized.contains("oauth token exchange failed with status 400")
    {
        MailSyncErrorPolicy {
            checkpoint_status: "auth_invalid",
            initial_backoff_seconds: 3600,
            is_permanent: true,
        }
    } else if normalized.contains("not configured") {
        MailSyncErrorPolicy {
            checkpoint_status: "config_invalid",
            initial_backoff_seconds: 3600,
            is_permanent: true,
        }
    } else {
        MailSyncErrorPolicy {
            checkpoint_status: "error",
            initial_backoff_seconds: 30,
            is_permanent: false,
        }
    }
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

fn mail_sync_batch_size(env_key: &str, default: usize) -> usize {
    parse_mail_sync_batch_size(std::env::var(env_key).ok().as_deref(), default)
}

fn parse_mail_sync_batch_size(raw: Option<&str>, default: usize) -> usize {
    raw.and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
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
    use super::{
        GmailSyncTarget, InboundAuthMode, MailGatewayConfig, MailProvider,
        build_gmail_passive_event_content, build_wedding_vendor_reply_message,
        classify_mail_sync_error, gmail_sync_target_from_record, parse_mail_sync_batch_size,
        thread_reference_targets, wedding_vendor_reply_candidates,
    };
    use crate::db::GmailTokenRecord;
    use crate::gateway::gmail_api::GmailOAuthConfig;
    use crate::gateway::smtp_in::IncomingEmailSummary;
    use std::sync::{Mutex, OnceLock};

    fn encryption_key_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn sample_reply_summary(
        in_reply_to: Option<&str>,
        reference_targets: Vec<String>,
        smtp_from: &str,
    ) -> IncomingEmailSummary {
        IncomingEmailSummary {
            subject: "Re: Enquiry about your florals".to_string(),
            smtp_from: smtp_from.to_string(),
            smtp_to: "couple@example.com".to_string(),
            body_preview: "Yes, we have availability that weekend!".to_string(),
            smtp_message_id: "reply-msg-1@vendor.example.com".to_string(),
            in_reply_to: in_reply_to.map(str::to_string),
            reference_targets,
            external_conversation_key: "conv-1".to_string(),
        }
    }

    #[test]
    fn wedding_vendor_reply_candidates_matches_by_in_reply_to() {
        let summary = sample_reply_summary(
            Some("outbound-msg-1@omnyid.mail"),
            vec![],
            "hello@chloesflorals.example.com",
        );
        let candidates = wedding_vendor_reply_candidates(&summary);
        assert_eq!(candidates, vec!["outbound-msg-1@omnyid.mail".to_string()]);
    }

    #[test]
    fn wedding_vendor_reply_candidates_includes_references_and_dedupes() {
        let summary = sample_reply_summary(
            Some("outbound-msg-1@omnyid.mail"),
            vec![
                "outbound-msg-1@omnyid.mail".to_string(),
                "earlier-msg@omnyid.mail".to_string(),
            ],
            "hello@chloesflorals.example.com",
        );
        let candidates = wedding_vendor_reply_candidates(&summary);
        assert_eq!(
            candidates,
            vec![
                "outbound-msg-1@omnyid.mail".to_string(),
                "earlier-msg@omnyid.mail".to_string(),
            ]
        );
    }

    #[test]
    fn wedding_vendor_reply_candidates_is_empty_when_threading_headers_are_absent() {
        // The sender-address fallback match (§3.7 of the outreach doc) does not need
        // any candidate ids — the caller matches on sender address instead.
        let summary = sample_reply_summary(None, vec![], "hello@chloesflorals.example.com");
        assert!(wedding_vendor_reply_candidates(&summary).is_empty());
    }

    #[test]
    fn wedding_vendor_reply_candidates_is_empty_for_an_unrelated_email_with_no_threading() {
        let summary = sample_reply_summary(None, vec![], "newsletter@unrelated.example.com");
        assert!(wedding_vendor_reply_candidates(&summary).is_empty());
    }

    #[test]
    fn build_wedding_vendor_reply_message_carries_wedding_supertags_and_parent_id() {
        let _guard = encryption_key_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        unsafe {
            // 32 bytes (64 hex chars): a 16-byte pattern repeated twice.
            let key = "00112233445566778899aabbccddeeff".repeat(2);
            std::env::set_var("OMNYID_ENCRYPTION_KEY_HEX", &key);
            std::env::set_var("OMNYID_SIGNING_KEY_HEX", &key);
        }
        let message = build_wedding_vendor_reply_message(
            "user_123",
            "01JQ0YQ2X3E2G7M8N9P0QRSTUV",
            "raw-gateway-message-id",
            serde_json::json!({"subject": "Re: Enquiry", "snippet": "Yes we're available"}),
            serde_json::json!({"vendor_id": "vendor:chloes-florals"}),
        );
        unsafe {
            std::env::remove_var("OMNYID_ENCRYPTION_KEY_HEX");
            std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
        }
        let message = message.expect("message should build with a configured encryption key");

        assert_eq!(message.parent_id.as_deref(), Some("raw-gateway-message-id"));
        assert!(
            message
                .supertags
                .contains(&"template:wedding_planning".to_string())
        );
        assert!(message.supertags.contains(&"event:wedding".to_string()));
        assert!(
            message
                .supertags
                .contains(&"wedding_vendor_reply".to_string())
        );
        assert!(message.supertags.contains(&"needs_follow_up".to_string()));
        assert_eq!(
            message.kind.as_deref(),
            Some("wedding_vendor_reply_received")
        );
        assert_eq!(
            message.subtype.as_deref(),
            Some("wedding_vendor_reply_received")
        );
    }

    #[test]
    fn build_wedding_vendor_reply_message_fails_closed_without_an_encryption_key() {
        let _guard = encryption_key_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        unsafe {
            std::env::remove_var("OMNYID_ENCRYPTION_KEY_HEX");
            std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
        }
        let result = build_wedding_vendor_reply_message(
            "user_123",
            "01JQ0YQ2X3E2G7M8N9P0QRSTUV",
            "raw-gateway-message-id",
            serde_json::json!({}),
            serde_json::json!({}),
        );
        assert!(result.is_err());
    }

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

    #[test]
    fn classify_mail_sync_error_marks_invalid_grant_as_permanent_auth_failure() {
        let policy = classify_mail_sync_error(
            "Google OAuth token exchange failed with status 400: {\"error\":\"invalid_grant\"}",
        );
        assert_eq!(policy.checkpoint_status, "auth_invalid");
        assert!(policy.is_permanent);
        assert_eq!(policy.initial_backoff_seconds, 3600);
    }

    #[test]
    fn classify_mail_sync_error_marks_missing_config_as_permanent_config_failure() {
        let policy = classify_mail_sync_error("OMNYID_GMAIL_REFRESH_TOKEN is not configured");
        assert_eq!(policy.checkpoint_status, "config_invalid");
        assert!(policy.is_permanent);
        assert_eq!(policy.initial_backoff_seconds, 3600);
    }

    #[test]
    fn classify_mail_sync_error_keeps_transient_errors_retryable() {
        let policy =
            classify_mail_sync_error("Gmail API message list request failed: operation timed out");
        assert_eq!(policy.checkpoint_status, "error");
        assert!(!policy.is_permanent);
        assert_eq!(policy.initial_backoff_seconds, 30);
    }

    #[test]
    fn gmail_sync_target_from_record_uses_user_scoped_refresh_token_and_account() {
        let target = gmail_sync_target_from_record(
            "client-id",
            "client-secret",
            GmailTokenRecord {
                user_id: "user_123".to_string(),
                gmail_email: "person@example.com".to_string(),
                refresh_token: "refresh-token".to_string(),
            },
        );

        assert_eq!(
            target,
            GmailSyncTarget {
                owner_user_id: Some("user_123".to_string()),
                account: "person@example.com".to_string(),
                config: GmailOAuthConfig {
                    client_id: "client-id".to_string(),
                    client_secret: "client-secret".to_string(),
                    refresh_token: "refresh-token".to_string(),
                    user_id: "me".to_string(),
                    from_address: "person@example.com".to_string(),
                },
            }
        );
    }

    #[test]
    fn build_gmail_passive_event_content_shapes_mail_metadata_for_planner() {
        let event = build_gmail_passive_event_content(
            "person@example.com",
            "gmail-msg-1",
            &IncomingEmailSummary {
                subject: "Please reply about the invoice".to_string(),
                smtp_from: "billing@example.com".to_string(),
                smtp_to: "person@example.com".to_string(),
                body_preview: "Action required for invoice 4821".to_string(),
                smtp_message_id: "<smtp-1@example.com>".to_string(),
                in_reply_to: Some("<parent@example.com>".to_string()),
                reference_targets: vec!["<ref-1@example.com>".to_string()],
                external_conversation_key: crate::gateway::smtp_in::external_email_conversation_key(
                    "<smtp-1@example.com>",
                    Some("<parent@example.com>"),
                    &["<ref-1@example.com>".to_string()],
                ),
            },
        );

        assert_eq!(event.event_type, "email_incoming");
        assert_eq!(event.source, "gmail_watch");
        assert_eq!(event.entity_id.as_deref(), Some("gmail-msg-1"));
        assert_eq!(event.metadata["provider"].as_str(), Some("gmail"));
        assert_eq!(
            event.metadata["gmail_email"].as_str(),
            Some("person@example.com")
        );
        assert_eq!(event.metadata["requires_action"].as_bool(), Some(true));
        assert_eq!(
            event
                .payload
                .as_ref()
                .and_then(|value| value.get("subject"))
                .and_then(serde_json::Value::as_str),
            Some("Please reply about the invoice")
        );
        assert_eq!(
            event.metadata["external_conversation_key"].as_str(),
            Some("external_email_thread:<ref-1@example.com>")
        );
    }

    #[test]
    fn thread_reference_targets_prefers_in_reply_to_and_references_without_duplicates() {
        let targets = thread_reference_targets(&IncomingEmailSummary {
            subject: "Please reply about the invoice".to_string(),
            smtp_from: "billing@example.com".to_string(),
            smtp_to: "person@example.com".to_string(),
            body_preview: "Action required for invoice 4821".to_string(),
            smtp_message_id: "<smtp-1@example.com>".to_string(),
            in_reply_to: Some("<parent@example.com>".to_string()),
            reference_targets: vec![
                "<parent@example.com>".to_string(),
                "<ref-1@example.com>".to_string(),
            ],
            external_conversation_key: crate::gateway::smtp_in::external_email_conversation_key(
                "<smtp-1@example.com>",
                Some("<parent@example.com>"),
                &[
                    "<parent@example.com>".to_string(),
                    "<ref-1@example.com>".to_string(),
                ],
            ),
        });

        assert_eq!(
            targets,
            vec![
                "<parent@example.com>".to_string(),
                "<ref-1@example.com>".to_string()
            ]
        );
    }

    #[test]
    fn parse_mail_sync_batch_size_uses_positive_override() {
        assert_eq!(parse_mail_sync_batch_size(Some("75"), 50), 75);
    }

    #[test]
    fn parse_mail_sync_batch_size_rejects_zero_and_invalid_values() {
        assert_eq!(parse_mail_sync_batch_size(Some("0"), 50), 50);
        assert_eq!(parse_mail_sync_batch_size(Some("invalid"), 50), 50);
        assert_eq!(parse_mail_sync_batch_size(None, 50), 50);
    }
}
