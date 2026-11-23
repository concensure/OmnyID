//! Private, false-default operational alias relay.
//!
//! The Cloudflare Worker authenticates the transport envelope. This layer then
//! requires Cloudflare's first trusted DMARC result, an exact sender/alias
//! allowlist match, single-recipient syntax, malware clearance, and durable
//! idempotency before it can send anything.

use std::time::Duration;

use axum::{Json, http::StatusCode};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ulid::Ulid;

use super::{AppState, RateLimitPolicy, VerifiedEnvelope};
use crate::gateway::operator_email_relay_provider::{
    OperatorRelayDeliveryState, OperatorRelaySendRequest, send_operator_relay_email,
};

const PROVIDER: &str = "cloudflare_email_worker";
const MAX_BODY_CHARS: usize = 100_000;

#[derive(Debug)]
struct RelayError {
    status: StatusCode,
    code: &'static str,
}

impl RelayError {
    const fn new(status: StatusCode, code: &'static str) -> Self {
        Self { status, code }
    }

    fn http(self) -> (StatusCode, String) {
        (self.status, self.code.to_string())
    }
}

#[derive(Clone, Debug)]
struct RelayConfig {
    aliases: Vec<String>,
    operators: Vec<String>,
    encryption_key: [u8; 32],
}

#[derive(Clone, Debug)]
struct RelayThread {
    id: String,
    alias: String,
    operator: String,
    recipient: String,
}

#[derive(Debug)]
enum RelayPlan {
    Initial { thread: RelayThread, body: String },
    OperatorReply { thread: RelayThread, body: String },
    ExternalInbound { thread: RelayThread, body: String },
    ExternalReply { thread: RelayThread, body: String },
}

impl RelayPlan {
    fn thread(&self) -> &RelayThread {
        match self {
            Self::Initial { thread, .. }
            | Self::OperatorReply { thread, .. }
            | Self::ExternalInbound { thread, .. }
            | Self::ExternalReply { thread, .. } => thread,
        }
    }

    fn body(&self) -> &str {
        match self {
            Self::Initial { body, .. }
            | Self::OperatorReply { body, .. }
            | Self::ExternalInbound { body, .. }
            | Self::ExternalReply { body, .. } => body,
        }
    }

    fn direction(&self) -> &'static str {
        match self {
            Self::Initial { .. } | Self::OperatorReply { .. } => "operator_to_external",
            Self::ExternalInbound { .. } | Self::ExternalReply { .. } => "external_to_operator",
        }
    }
}

pub(super) fn enabled() -> bool {
    super::env_enabled("OMNYID_OPERATOR_EMAIL_RELAY_ENABLED")
}

pub(super) fn is_configured_alias(recipient: &str) -> bool {
    enabled()
        && configured_addresses("OMNYID_OPERATOR_EMAIL_RELAY_ALIASES")
            .iter()
            .any(|value| value == recipient)
}

pub(super) async fn handle(
    state: &AppState,
    envelope: &VerifiedEnvelope,
    raw: &[u8],
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    let config = config().map_err(RelayError::http)?;
    if !config.aliases.iter().any(|value| value == &envelope.to) {
        return Err(RelayError::new(StatusCode::NOT_FOUND, "not_found").http());
    }
    super::enforce_rate_limit(
        state,
        format!(
            "operator_email_relay_sender:{}:{}",
            address_digest(&envelope.from),
            address_digest(&envelope.to)
        ),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    require_cloudflare_dmarc_pass(raw).map_err(RelayError::http)?;
    let parsed = crate::gateway::smtp_in::parse_incoming_email_source(raw);
    if parsed.body_media_type != "text/plain" {
        return Err(
            RelayError::new(StatusCode::UNPROCESSABLE_ENTITY, "plain_text_required").http(),
        );
    }
    if parsed.attachments_blocked || !parsed.attachments.is_empty() {
        return Err(RelayError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "attachments_not_supported",
        )
        .http());
    }
    if normalize_address(&parsed.summary.smtp_from).as_deref() != Some(envelope.from.as_str())
        || normalize_address(&parsed.summary.smtp_to).as_deref() != Some(envelope.to.as_str())
    {
        return Err(RelayError::new(StatusCode::UNAUTHORIZED, "identity_mismatch").http());
    }
    match crate::gateway::clamav::scan_bytes(raw).await {
        Ok(Some(result)) if !result.is_infected => {}
        Ok(Some(_)) => {
            return Err(
                RelayError::new(StatusCode::UNPROCESSABLE_ENTITY, "malware_rejected").http(),
            );
        }
        Ok(None) | Err(_) => {
            return Err(
                RelayError::new(StatusCode::SERVICE_UNAVAILABLE, "scanner_unavailable").http(),
            );
        }
    }

    let plan = build_plan(state, &config, envelope, &parsed)
        .await
        .map_err(RelayError::http)?;
    super::enforce_rate_limit(
        state,
        format!(
            "operator_email_relay_recipient:{}",
            address_digest(&plan.thread().recipient)
        ),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let event_id = format!("{PROVIDER}:{}", envelope.event_id);
    if !reserve_event(state, &config, &event_id, envelope, &plan)
        .await
        .map_err(RelayError::http)?
    {
        return Ok((
            StatusCode::ACCEPTED,
            Json(json!({"status": "duplicate", "event_id": envelope.event_id})),
        ));
    }

    let thread = plan.thread();
    let (to, bcc) = match &plan {
        RelayPlan::Initial { .. } | RelayPlan::OperatorReply { .. } => {
            (thread.recipient.clone(), Some(thread.operator.clone()))
        }
        RelayPlan::ExternalInbound { .. } | RelayPlan::ExternalReply { .. } => {
            (thread.operator.clone(), None)
        }
    };
    let request = OperatorRelaySendRequest {
        from: thread.alias.clone(),
        to,
        bcc,
        reply_to: thread.alias.clone(),
        subject: normalized_subject(&parsed.summary.subject),
        text: plan.body().to_string(),
        in_reply_to: parsed
            .summary
            .in_reply_to
            .as_deref()
            .filter(|value| safe_message_id(value))
            .map(str::to_string),
        references: parsed
            .summary
            .reference_targets
            .iter()
            .filter(|value| safe_message_id(value))
            .take(20)
            .cloned()
            .collect(),
        receipt_id: format!("relay:{}", envelope.event_id),
    };
    let receipt = match send_operator_relay_email(&request).await {
        Ok(receipt) => receipt,
        Err(_) => {
            mark_failed(state, &event_id, "provider_send_failed").await;
            return Err(RelayError::new(StatusCode::BAD_GATEWAY, "provider_send_failed").http());
        }
    };
    complete_event(
        state,
        &event_id,
        thread,
        &receipt.provider_message_id,
        receipt.state,
    )
    .await
    .map_err(RelayError::http)?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": receipt.state.label(),
            "event_id": envelope.event_id,
            "relay_thread_id": thread.id,
        })),
    ))
}

async fn build_plan(
    state: &AppState,
    config: &RelayConfig,
    envelope: &VerifiedEnvelope,
    parsed: &crate::gateway::smtp_in::IncomingEmailSource,
) -> Result<RelayPlan, RelayError> {
    let sender = envelope.from.as_str();
    if config.operators.iter().any(|value| value == sender) {
        if let Some((recipient, body)) = parse_initial_command(&parsed.body)? {
            if config.operators.iter().any(|value| value == &recipient) {
                return Err(RelayError::new(
                    StatusCode::BAD_REQUEST,
                    "recipient_invalid",
                ));
            }
            let thread = RelayThread {
                id: format!("oprelay_{}", Ulid::new().to_string().to_lowercase()),
                alias: envelope.to.clone(),
                operator: sender.to_string(),
                recipient,
            };
            return Ok(RelayPlan::Initial { thread, body });
        }
        let thread = resolve_thread(state, config, parsed).await?;
        if !thread.operator.eq_ignore_ascii_case(sender) || thread.alias != envelope.to {
            return Err(RelayError::new(
                StatusCode::UNAUTHORIZED,
                "sender_not_authorized",
            ));
        }
        return Ok(RelayPlan::OperatorReply {
            thread,
            body: validated_body(&parsed.body)?,
        });
    }

    let body = validated_body(&parsed.body)?;
    let thread = match resolve_thread(state, config, parsed).await {
        Ok(thread) => thread,
        Err(error)
            if error.code == "thread_reference_required" || error.code == "thread_not_found" =>
        {
            return Ok(RelayPlan::ExternalInbound {
                thread: RelayThread {
                    id: format!("oprelay_{}", Ulid::new().to_string().to_lowercase()),
                    alias: envelope.to.clone(),
                    operator: config.operators[0].clone(),
                    recipient: sender.to_string(),
                },
                body: external_inbound_body(sender, &body),
            });
        }
        Err(error) => return Err(error),
    };
    if !thread.recipient.eq_ignore_ascii_case(sender) || thread.alias != envelope.to {
        return Err(RelayError::new(
            StatusCode::UNAUTHORIZED,
            "sender_not_authorized",
        ));
    }
    Ok(RelayPlan::ExternalReply { thread, body })
}

fn external_inbound_body(sender: &str, body: &str) -> String {
    format!("Message from {sender}\n\n{body}")
}

fn parse_initial_command(body: &str) -> Result<Option<(String, String)>, RelayError> {
    let normalized = body.replace("\r\n", "\n").replace('\r', "\n");
    let Some((line_index, line)) = normalized
        .lines()
        .enumerate()
        .find(|(_, line)| !line.trim().is_empty())
    else {
        return Err(RelayError::new(
            StatusCode::BAD_REQUEST,
            "message_body_required",
        ));
    };
    let Some(candidate) = line.trim().strip_prefix("To:") else {
        return Ok(None);
    };
    let recipient = normalize_address(candidate)
        .filter(|value| !value.ends_with("@omnyid.com"))
        .ok_or_else(|| RelayError::new(StatusCode::BAD_REQUEST, "recipient_invalid"))?;
    let body = normalized
        .lines()
        .enumerate()
        .filter_map(|(index, value)| (index != line_index).then_some(value))
        .collect::<Vec<_>>()
        .join("\n");
    Ok(Some((recipient, validated_body(&body)?)))
}

fn validated_body(body: &str) -> Result<String, RelayError> {
    let body = body.trim().to_string();
    if body.is_empty() || body.chars().count() > MAX_BODY_CHARS {
        return Err(RelayError::new(
            StatusCode::BAD_REQUEST,
            "message_body_invalid",
        ));
    }
    Ok(body)
}

async fn resolve_thread(
    state: &AppState,
    config: &RelayConfig,
    parsed: &crate::gateway::smtp_in::IncomingEmailSource,
) -> Result<RelayThread, RelayError> {
    let mut ids = parsed.summary.reference_targets.clone();
    if let Some(value) = parsed.summary.in_reply_to.clone() {
        ids.push(value);
    }
    ids.retain(|value| safe_message_id(value));
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err(RelayError::new(
            StatusCode::BAD_REQUEST,
            "thread_reference_required",
        ));
    }
    let row = sqlx::query(
        r#"SELECT t.relay_thread_id, t.alias_address, t.operator_ciphertext,
                  t.recipient_ciphertext
             FROM operator_email_relay_events e
             JOIN operator_email_relay_threads t ON t.relay_thread_id = e.relay_thread_id
            WHERE e.outbound_message_id = ANY($1)
              AND t.status = 'active'
            ORDER BY e.created_at DESC
            LIMIT 1"#,
    )
    .bind(&ids)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })?
    .ok_or_else(|| RelayError::new(StatusCode::NOT_FOUND, "thread_not_found"))?;
    let id: String = row.get("relay_thread_id");
    Ok(RelayThread {
        operator: decrypt_address(config, &id, "operator", row.get("operator_ciphertext"))?,
        recipient: decrypt_address(config, &id, "recipient", row.get("recipient_ciphertext"))?,
        alias: row.get("alias_address"),
        id,
    })
}

async fn reserve_event(
    state: &AppState,
    config: &RelayConfig,
    event_id: &str,
    envelope: &VerifiedEnvelope,
    plan: &RelayPlan,
) -> Result<bool, RelayError> {
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })?;
    if matches!(
        plan,
        RelayPlan::Initial { .. } | RelayPlan::ExternalInbound { .. }
    ) {
        let thread = plan.thread();
        let operator_ciphertext =
            encrypt_address(config, &thread.id, "operator", &thread.operator)?;
        let recipient_ciphertext =
            encrypt_address(config, &thread.id, "recipient", &thread.recipient)?;
        sqlx::query(
            r#"INSERT INTO operator_email_relay_threads
                 (relay_thread_id, alias_address, operator_address_digest, operator_ciphertext,
                  recipient_address_digest, recipient_ciphertext)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
        )
        .bind(&thread.id)
        .bind(&thread.alias)
        .bind(address_digest(&thread.operator))
        .bind(operator_ciphertext)
        .bind(address_digest(&thread.recipient))
        .bind(recipient_ciphertext)
        .execute(&mut *tx)
        .await
        .map_err(|_| {
            RelayError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "relay_persistence_unavailable",
            )
        })?;
    }
    let inserted = sqlx::query(
        r#"INSERT INTO operator_email_relay_events
             (provider_event_id, relay_thread_id, direction, payload_digest, source_message_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (provider_event_id) DO NOTHING"#,
    )
    .bind(event_id)
    .bind(&plan.thread().id)
    .bind(plan.direction())
    .bind(&envelope.body_digest)
    .bind(source_id_from_plan(plan))
    .execute(&mut *tx)
    .await
    .map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })?
    .rows_affected();
    if inserted == 1 {
        tx.commit().await.map_err(|_| {
            RelayError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "relay_persistence_unavailable",
            )
        })?;
        return Ok(true);
    }
    tx.rollback().await.map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })?;
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT payload_digest FROM operator_email_relay_events WHERE provider_event_id = $1",
    )
    .bind(event_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })?;
    match existing.as_deref() {
        Some(value) if value == envelope.body_digest => Ok(false),
        Some(_) => Err(RelayError::new(StatusCode::CONFLICT, "event_conflict")),
        None => Err(RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )),
    }
}

fn source_id_from_plan(_plan: &RelayPlan) -> Option<String> {
    // The source ID is intentionally omitted here: provider event ID is the
    // replay authority and outbound IDs are the only accepted thread handles.
    None
}

async fn complete_event(
    state: &AppState,
    event_id: &str,
    thread: &RelayThread,
    outbound_message_id: &str,
    delivery: OperatorRelayDeliveryState,
) -> Result<(), RelayError> {
    let status = delivery.label();
    let mut tx = state.db.pool.begin().await.map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })?;
    let updated = sqlx::query(
        r#"UPDATE operator_email_relay_events
              SET outbound_message_id = $2, processing_status = $3, processed_at = NOW()
            WHERE provider_event_id = $1 AND processing_status = 'reserved'"#,
    )
    .bind(event_id)
    .bind(outbound_message_id)
    .bind(status)
    .execute(&mut *tx)
    .await
    .map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })?
    .rows_affected();
    if updated != 1 {
        tx.rollback().await.ok();
        return Err(RelayError::new(StatusCode::CONFLICT, "event_conflict"));
    }
    sqlx::query(
        "UPDATE operator_email_relay_threads SET status = CASE WHEN $2 = 'bounced' THEN 'bounced' WHEN $2 = 'suppressed' THEN 'blocked' ELSE status END, last_activity_at = NOW() WHERE relay_thread_id = $1",
    )
    .bind(&thread.id)
    .bind(status)
    .execute(&mut *tx)
    .await
    .map_err(|_| RelayError::new(StatusCode::SERVICE_UNAVAILABLE, "relay_persistence_unavailable"))?;
    tx.commit().await.map_err(|_| {
        RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_persistence_unavailable",
        )
    })
}

async fn mark_failed(state: &AppState, event_id: &str, code: &str) {
    let _ = sqlx::query(
        "UPDATE operator_email_relay_events SET processing_status = 'failed', error_code = $2, processed_at = NOW() WHERE provider_event_id = $1 AND processing_status = 'reserved'",
    )
    .bind(event_id)
    .bind(code)
    .execute(&state.db.pool)
    .await;
}

fn config() -> Result<RelayConfig, RelayError> {
    if !enabled() {
        return Err(RelayError::new(StatusCode::NOT_FOUND, "not_found"));
    }
    let aliases = configured_addresses("OMNYID_OPERATOR_EMAIL_RELAY_ALIASES");
    let operators = configured_addresses("OMNYID_OPERATOR_EMAIL_RELAY_SENDERS");
    let encryption_key = crate::secret_manager::read_process_secret_trimmed(
        "OMNYID_OPERATOR_EMAIL_RELAY_ENCRYPTION_KEY_HEX",
    )
    .and_then(|value| hex::decode(value).ok())
    .and_then(|value| <[u8; 32]>::try_from(value).ok())
    .ok_or_else(|| RelayError::new(StatusCode::SERVICE_UNAVAILABLE, "relay_config_unavailable"))?;
    if aliases.is_empty()
        || operators.len() != 1
        || aliases.iter().any(|value| !value.ends_with("@omnyid.com"))
        || operators.iter().any(|value| value.ends_with("@omnyid.com"))
        || aliases
            .iter()
            .any(|alias| operators.iter().any(|operator| operator == alias))
    {
        return Err(RelayError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "relay_config_unavailable",
        ));
    }
    Ok(RelayConfig {
        aliases,
        operators,
        encryption_key,
    })
}

fn configured_addresses(name: &str) -> Vec<String> {
    std::env::var(name)
        .unwrap_or_default()
        .split(',')
        .filter_map(normalize_address)
        .collect()
}

fn normalize_address(value: &str) -> Option<String> {
    let value = value.trim().to_ascii_lowercase();
    let (local, domain) = value.rsplit_once('@')?;
    (!local.is_empty()
        && !domain.is_empty()
        && value.len() <= 320
        && !value.contains([',', ';', '\r', '\n', '\0', ' ']))
    .then_some(value)
}

fn require_cloudflare_dmarc_pass(raw: &[u8]) -> Result<(), RelayError> {
    let value = first_header(raw, "authentication-results")
        .ok_or_else(|| RelayError::new(StatusCode::UNAUTHORIZED, "dmarc_evidence_missing"))?
        .to_ascii_lowercase();
    if !value.trim_start().starts_with("mx.cloudflare.net;")
        || !value
            .split(';')
            .any(|part| part.trim_start().starts_with("dmarc=pass"))
    {
        return Err(RelayError::new(
            StatusCode::UNAUTHORIZED,
            "dmarc_not_passed",
        ));
    }
    Ok(())
}

fn first_header(raw: &[u8], wanted: &str) -> Option<String> {
    let head_end = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .or_else(|| raw.windows(2).position(|window| window == b"\n\n"))?;
    let text = String::from_utf8_lossy(&raw[..head_end]).replace("\r\n", "\n");
    let mut headers: Vec<(String, String)> = Vec::new();
    for line in text.lines() {
        if (line.starts_with(' ') || line.starts_with('\t')) && !headers.is_empty() {
            headers.last_mut()?.1.push(' ');
            headers.last_mut()?.1.push_str(line.trim());
            continue;
        }
        let (name, value) = line.split_once(':')?;
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
    }
    headers
        .into_iter()
        .find_map(|(name, value)| (name == wanted).then_some(value))
}

fn encrypt_address(
    config: &RelayConfig,
    thread_id: &str,
    kind: &str,
    address: &str,
) -> Result<Value, RelayError> {
    Ok(crate::crypto::encrypt_content(
        &json!({"address": address}),
        &json!({"schema": "operator_email_relay_address/v1", "thread_id": thread_id, "kind": kind}),
        &config.encryption_key,
    ))
}

fn decrypt_address(
    config: &RelayConfig,
    thread_id: &str,
    kind: &str,
    ciphertext: Value,
) -> Result<String, RelayError> {
    crate::crypto::decrypt_content(
        &ciphertext,
        &json!({"schema": "operator_email_relay_address/v1", "thread_id": thread_id, "kind": kind}),
        &config.encryption_key,
    )
    .and_then(|value| {
        value
            .get("address")
            .and_then(Value::as_str)
            .and_then(normalize_address)
    })
    .ok_or_else(|| RelayError::new(StatusCode::SERVICE_UNAVAILABLE, "relay_decryption_failed"))
}

fn address_digest(address: &str) -> String {
    hex::encode(Sha256::digest(address.as_bytes()))
}

fn normalized_subject(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        "Message via OmnyID".to_string()
    } else {
        value
            .chars()
            .filter(|value| !value.is_control())
            .take(240)
            .collect()
    }
}

fn safe_message_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && value.len() <= 998
        && value.starts_with('<')
        && value.ends_with('>')
        && !value.contains(['\r', '\n', '\0'])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_is_exact_single_recipient_and_removed_from_body() {
        let (recipient, body) = parse_initial_command("\nTo: Alice@Example.com\n\nHello Alice")
            .expect("parse")
            .expect("command");
        assert_eq!(recipient, "alice@example.com");
        assert_eq!(body, "Hello Alice");
        assert!(parse_initial_command("To: a@example.com,b@example.com\nhello").is_err());
        assert!(parse_initial_command("To: privacy@omnyid.com\nhello").is_err());
    }

    #[test]
    fn only_first_cloudflare_authentication_result_is_trusted() {
        let safe = b"Authentication-Results: mx.cloudflare.net; dmarc=pass header.from=gmail.com\r\nAuthentication-Results: attacker; dmarc=fail\r\n\r\nbody";
        assert!(require_cloudflare_dmarc_pass(safe).is_ok());
        let forged = b"Authentication-Results: attacker; dmarc=pass\r\nAuthentication-Results: mx.cloudflare.net; dmarc=pass\r\n\r\nbody";
        assert!(require_cloudflare_dmarc_pass(forged).is_err());
        let failed = b"Authentication-Results: mx.cloudflare.net; dmarc=fail\r\n\r\nbody";
        assert!(require_cloudflare_dmarc_pass(failed).is_err());
    }

    #[test]
    fn address_ciphertext_is_bound_to_thread_and_role() {
        let config = RelayConfig {
            aliases: vec!["hello@omnyid.com".to_string()],
            operators: vec!["operator@gmail.com".to_string()],
            encryption_key: [7_u8; 32],
        };
        let ciphertext = encrypt_address(&config, "thread-a", "recipient", "alice@example.com")
            .expect("encrypt");
        assert_eq!(
            decrypt_address(&config, "thread-a", "recipient", ciphertext.clone()).expect("decrypt"),
            "alice@example.com"
        );
        assert!(decrypt_address(&config, "thread-b", "recipient", ciphertext.clone()).is_err());
        assert!(decrypt_address(&config, "thread-a", "operator", ciphertext).is_err());
    }

    #[test]
    fn unsolicited_external_mail_is_labelled_for_the_single_operator() {
        let body = external_inbound_body("alice@example.com", "Can you help?");
        assert_eq!(body, "Message from alice@example.com\n\nCan you help?");
        assert!(!body.contains("To:"));
    }
}
