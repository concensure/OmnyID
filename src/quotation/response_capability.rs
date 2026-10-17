use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use super::{ContextGrantAction, stable_hash};

pub const RESPONSE_CAPABILITY_SCHEMA_VERSION: &str = "quotation.response_capability.v1";
pub const RESPONSE_SESSION_COOKIE_NAME: &str = "omnyid_quotation_response";
const TOKEN_BYTES: usize = 32;
const SESSION_MINUTES: i64 = 15;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseCapabilityBinding {
    pub grant_id: String,
    pub vendor_id: String,
    pub response_recipient_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub thread_id: String,
    pub projection_fingerprint: String,
    pub allowed_actions: Vec<ContextGrantAction>,
    pub not_before: String,
    pub expires_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResponseCapabilityStatus {
    Active,
    Exchanged,
    Consumed,
    Revoked,
    Rotated,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResponseCapabilityRevocationReason {
    UserRevoked,
    GrantRevoked,
    QuotationSuperseded,
    ClaimDisputed,
    ClosureTerminal,
    Rotated,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseCapabilityRecord {
    pub schema_version: String,
    pub capability_id: String,
    pub binding: ResponseCapabilityBinding,
    pub token_prefix: String,
    pub token_mac: String,
    pub status: ResponseCapabilityStatus,
    pub generation: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotated_from_capability_id: Option<String>,
    pub issued_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exchanged_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consumed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revocation_reason: Option<ResponseCapabilityRevocationReason>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct SecretResponseToken(String);

impl std::fmt::Debug for SecretResponseToken {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SecretResponseToken([REDACTED])")
    }
}

impl SecretResponseToken {
    pub fn expose(self) -> String {
        self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IssuedResponseCapability {
    pub record: ResponseCapabilityRecord,
    pub token: SecretResponseToken,
    pub audit: ResponseCapabilityAuditEvent,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResponseCapabilityIssue {
    pub capability_id: String,
    pub binding: ResponseCapabilityBinding,
    pub issued_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResponseCapabilityAccess<'a> {
    pub vendor_id: &'a str,
    pub response_recipient_id: &'a str,
    pub quotation_id: &'a str,
    pub quotation_version_id: &'a str,
    pub thread_id: &'a str,
    pub projection_fingerprint: &'a str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResponseCapabilityAuthority<'a> {
    pub grant_active: bool,
    pub quotation_active: bool,
    pub claim_disputed: bool,
    pub closure_terminal: bool,
    pub active_projection_fingerprint: &'a str,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseTransactionSessionRecord {
    pub session_id: String,
    pub capability_id: String,
    pub vendor_id: String,
    pub thread_id: String,
    pub session_token_mac: String,
    pub csrf_token_mac: String,
    pub submission_nonce_mac: String,
    pub issued_at: String,
    pub expires_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consumed_at: Option<String>,
    pub account_access: bool,
}

#[derive(Clone, PartialEq, Eq)]
pub struct ResponseTransactionSecrets {
    session_token: String,
    csrf_token: String,
    submission_nonce: String,
}

impl std::fmt::Debug for ResponseTransactionSecrets {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("ResponseTransactionSecrets([REDACTED])")
    }
}

impl ResponseTransactionSecrets {
    pub fn cookie_header(&self) -> String {
        format!(
            "{RESPONSE_SESSION_COOKIE_NAME}={}; Path=/quotation/vendor-response; HttpOnly; Secure; SameSite=Strict",
            self.session_token
        )
    }

    pub fn csrf_token(&self) -> &str {
        &self.csrf_token
    }

    pub fn submission_nonce(&self) -> &str {
        &self.submission_nonce
    }

    pub fn session_token(&self) -> &str {
        &self.session_token
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IssuedResponseTransactionSession {
    pub record: ResponseTransactionSessionRecord,
    pub secrets: ResponseTransactionSecrets,
    pub audit: ResponseCapabilityAuditEvent,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResponseCapabilityAuditKind {
    Issued,
    Exchanged,
    Consumed,
    Revoked,
    Rotated,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseCapabilityAuditEvent {
    pub event_id: String,
    pub capability_id: String,
    pub kind: ResponseCapabilityAuditKind,
    pub occurred_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResponseCapabilityError {
    InvalidIssue,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResponseCapabilityRateSnapshot {
    pub token_prefix_attempts: u32,
    pub ip_hash_attempts: u32,
    pub vendor_attempts: u32,
    pub thread_attempts: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResponseCapabilityRatePolicy {
    pub token_prefix_limit: u32,
    pub ip_hash_limit: u32,
    pub vendor_limit: u32,
    pub thread_limit: u32,
    pub retry_after_seconds: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResponseCapabilityRateDecision {
    Allowed,
    Limited { retry_after_seconds: u32 },
}

fn parsed_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|time| time.with_timezone(&Utc))
}

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn valid_fingerprint(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn binding_valid(binding: &ResponseCapabilityBinding, issued_at: DateTime<Utc>) -> bool {
    let Some(not_before) = parsed_time(&binding.not_before) else {
        return false;
    };
    let Some(expires_at) = parsed_time(&binding.expires_at) else {
        return false;
    };
    let mut actions = binding.allowed_actions.clone();
    actions.sort();
    actions.dedup();
    [
        &binding.grant_id,
        &binding.vendor_id,
        &binding.response_recipient_id,
        &binding.quotation_id,
        &binding.quotation_version_id,
        &binding.thread_id,
    ]
    .iter()
    .all(|value| bounded(value, 180))
        && valid_fingerprint(&binding.projection_fingerprint)
        && !actions.is_empty()
        && actions.len() == binding.allowed_actions.len()
        && actions.len() <= 3
        && issued_at < expires_at
        && not_before < expires_at
}

fn mac(pepper: &[u8], value: &str) -> Option<String> {
    if pepper.len() < TOKEN_BYTES {
        return None;
    }
    let mut mac = Hmac::<Sha256>::new_from_slice(pepper).ok()?;
    mac.update(value.as_bytes());
    Some(hex::encode(mac.finalize().into_bytes()))
}

fn mac_matches(pepper: &[u8], value: &str, expected: &str) -> bool {
    let Ok(expected) = hex::decode(expected) else {
        return false;
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(pepper) else {
        return false;
    };
    mac.update(value.as_bytes());
    mac.verify_slice(&expected).is_ok()
}

fn secret(label: &str, entropy: [u8; TOKEN_BYTES]) -> String {
    format!("{label}_{}", URL_SAFE_NO_PAD.encode(entropy))
}

fn token_prefix(token: &str) -> Option<String> {
    if !token.starts_with("qrc_") || token.len() < 16 {
        return None;
    }
    Some(token[..16].to_string())
}

fn audit(
    capability_id: &str,
    kind: ResponseCapabilityAuditKind,
    occurred_at: &str,
) -> ResponseCapabilityAuditEvent {
    ResponseCapabilityAuditEvent {
        event_id: format!(
            "qrc_audit_{}",
            stable_hash(&(capability_id, kind, occurred_at))
        ),
        capability_id: capability_id.to_string(),
        kind,
        occurred_at: occurred_at.to_string(),
    }
}

pub fn issue_response_capability(
    issue: ResponseCapabilityIssue,
    pepper: &[u8],
) -> Result<IssuedResponseCapability, ResponseCapabilityError> {
    let mut entropy = [0_u8; TOKEN_BYTES];
    rand::rng().fill_bytes(&mut entropy);
    issue_response_capability_with_entropy(issue, pepper, entropy, 1, None)
}

pub fn issue_response_capability_with_entropy(
    issue: ResponseCapabilityIssue,
    pepper: &[u8],
    entropy: [u8; TOKEN_BYTES],
    generation: u32,
    rotated_from_capability_id: Option<String>,
) -> Result<IssuedResponseCapability, ResponseCapabilityError> {
    let issued_at = parsed_time(&issue.issued_at).ok_or(ResponseCapabilityError::InvalidIssue)?;
    if !bounded(&issue.capability_id, 180)
        || generation == 0
        || !binding_valid(&issue.binding, issued_at)
    {
        return Err(ResponseCapabilityError::InvalidIssue);
    }
    let raw_token = secret("qrc", entropy);
    let token_prefix = token_prefix(&raw_token).ok_or(ResponseCapabilityError::InvalidIssue)?;
    let token_mac = mac(pepper, &raw_token).ok_or(ResponseCapabilityError::InvalidIssue)?;
    let record = ResponseCapabilityRecord {
        schema_version: RESPONSE_CAPABILITY_SCHEMA_VERSION.to_string(),
        capability_id: issue.capability_id,
        binding: issue.binding,
        token_prefix,
        token_mac,
        status: ResponseCapabilityStatus::Active,
        generation,
        rotated_from_capability_id,
        issued_at: issue.issued_at,
        exchanged_at: None,
        consumed_at: None,
        revoked_at: None,
        revocation_reason: None,
    };
    Ok(IssuedResponseCapability {
        audit: audit(
            &record.capability_id,
            ResponseCapabilityAuditKind::Issued,
            &record.issued_at,
        ),
        record,
        token: SecretResponseToken(raw_token),
    })
}

fn authority_valid(
    record: &ResponseCapabilityRecord,
    authority: &ResponseCapabilityAuthority<'_>,
) -> bool {
    authority.grant_active
        && authority.quotation_active
        && !authority.claim_disputed
        && !authority.closure_terminal
        && authority.active_projection_fingerprint == record.binding.projection_fingerprint
}

pub fn exchange_response_capability_with_entropy(
    record: &mut ResponseCapabilityRecord,
    raw_token: &str,
    pepper: &[u8],
    access: &ResponseCapabilityAccess<'_>,
    authority: &ResponseCapabilityAuthority<'_>,
    now: DateTime<Utc>,
    session_entropy: [u8; TOKEN_BYTES],
    csrf_entropy: [u8; TOKEN_BYTES],
    nonce_entropy: [u8; TOKEN_BYTES],
) -> Result<IssuedResponseTransactionSession, ResponseCapabilityError> {
    let binding = &record.binding;
    if record.status != ResponseCapabilityStatus::Active
        || record.schema_version != RESPONSE_CAPABILITY_SCHEMA_VERSION
        || token_prefix(raw_token).as_deref() != Some(record.token_prefix.as_str())
        || !mac_matches(pepper, raw_token, &record.token_mac)
        || parsed_time(&binding.not_before).is_none_or(|time| now < time)
        || parsed_time(&binding.expires_at).is_none_or(|time| now >= time)
        || access.vendor_id != binding.vendor_id
        || access.response_recipient_id != binding.response_recipient_id
        || access.quotation_id != binding.quotation_id
        || access.quotation_version_id != binding.quotation_version_id
        || access.thread_id != binding.thread_id
        || access.projection_fingerprint != binding.projection_fingerprint
        || !authority_valid(record, authority)
    {
        return Err(ResponseCapabilityError::Unavailable);
    }
    let session_token = secret("qrs", session_entropy);
    let csrf_token = secret("qcsrf", csrf_entropy);
    let submission_nonce = secret("qnonce", nonce_entropy);
    let expires_at = std::cmp::min(
        parsed_time(&binding.expires_at).ok_or(ResponseCapabilityError::Unavailable)?,
        now + Duration::minutes(SESSION_MINUTES),
    );
    let session_id = format!(
        "qrs_{}",
        stable_hash(&(&record.capability_id, record.generation, now.to_rfc3339()))
    );
    let session = ResponseTransactionSessionRecord {
        session_id,
        capability_id: record.capability_id.clone(),
        vendor_id: binding.vendor_id.clone(),
        thread_id: binding.thread_id.clone(),
        session_token_mac: mac(pepper, &session_token)
            .ok_or(ResponseCapabilityError::Unavailable)?,
        csrf_token_mac: mac(pepper, &csrf_token).ok_or(ResponseCapabilityError::Unavailable)?,
        submission_nonce_mac: mac(pepper, &submission_nonce)
            .ok_or(ResponseCapabilityError::Unavailable)?,
        issued_at: now.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
        consumed_at: None,
        account_access: false,
    };
    record.status = ResponseCapabilityStatus::Exchanged;
    record.exchanged_at = Some(now.to_rfc3339());
    Ok(IssuedResponseTransactionSession {
        audit: audit(
            &record.capability_id,
            ResponseCapabilityAuditKind::Exchanged,
            &now.to_rfc3339(),
        ),
        record: session,
        secrets: ResponseTransactionSecrets {
            session_token,
            csrf_token,
            submission_nonce,
        },
    })
}

pub struct ResponseSubmissionProof<'a> {
    pub session_token: &'a str,
    pub csrf_token: &'a str,
    pub submission_nonce: &'a str,
    pub action: ContextGrantAction,
}

pub fn consume_response_capability(
    record: &mut ResponseCapabilityRecord,
    session: &mut ResponseTransactionSessionRecord,
    proof: &ResponseSubmissionProof<'_>,
    pepper: &[u8],
    authority: &ResponseCapabilityAuthority<'_>,
    now: DateTime<Utc>,
) -> Result<ResponseCapabilityAuditEvent, ResponseCapabilityError> {
    if record.status != ResponseCapabilityStatus::Exchanged
        || session.capability_id != record.capability_id
        || session.vendor_id != record.binding.vendor_id
        || session.thread_id != record.binding.thread_id
        || session.consumed_at.is_some()
        || parsed_time(&session.expires_at).is_none_or(|time| now >= time)
        || !record.binding.allowed_actions.contains(&proof.action)
        || !mac_matches(pepper, proof.session_token, &session.session_token_mac)
        || !mac_matches(pepper, proof.csrf_token, &session.csrf_token_mac)
        || !mac_matches(
            pepper,
            proof.submission_nonce,
            &session.submission_nonce_mac,
        )
        || !authority_valid(record, authority)
    {
        return Err(ResponseCapabilityError::Unavailable);
    }
    let consumed_at = now.to_rfc3339();
    session.consumed_at = Some(consumed_at.clone());
    record.status = ResponseCapabilityStatus::Consumed;
    record.consumed_at = Some(consumed_at.clone());
    Ok(audit(
        &record.capability_id,
        ResponseCapabilityAuditKind::Consumed,
        &consumed_at,
    ))
}

pub fn revoke_response_capability(
    record: &mut ResponseCapabilityRecord,
    reason: ResponseCapabilityRevocationReason,
    now: DateTime<Utc>,
) -> Result<ResponseCapabilityAuditEvent, ResponseCapabilityError> {
    if matches!(
        record.status,
        ResponseCapabilityStatus::Consumed
            | ResponseCapabilityStatus::Revoked
            | ResponseCapabilityStatus::Rotated
    ) {
        return Err(ResponseCapabilityError::Unavailable);
    }
    record.status = if reason == ResponseCapabilityRevocationReason::Rotated {
        ResponseCapabilityStatus::Rotated
    } else {
        ResponseCapabilityStatus::Revoked
    };
    record.revoked_at = Some(now.to_rfc3339());
    record.revocation_reason = Some(reason);
    Ok(audit(
        &record.capability_id,
        if reason == ResponseCapabilityRevocationReason::Rotated {
            ResponseCapabilityAuditKind::Rotated
        } else {
            ResponseCapabilityAuditKind::Revoked
        },
        &now.to_rfc3339(),
    ))
}

pub fn rotate_response_capability_with_entropy(
    record: &mut ResponseCapabilityRecord,
    next_capability_id: String,
    issued_at: String,
    pepper: &[u8],
    entropy: [u8; TOKEN_BYTES],
) -> Result<IssuedResponseCapability, ResponseCapabilityError> {
    let now = parsed_time(&issued_at).ok_or(ResponseCapabilityError::InvalidIssue)?;
    let prior_id = record.capability_id.clone();
    if matches!(
        record.status,
        ResponseCapabilityStatus::Consumed
            | ResponseCapabilityStatus::Revoked
            | ResponseCapabilityStatus::Rotated
    ) {
        return Err(ResponseCapabilityError::Unavailable);
    }
    let next = issue_response_capability_with_entropy(
        ResponseCapabilityIssue {
            capability_id: next_capability_id,
            binding: record.binding.clone(),
            issued_at,
        },
        pepper,
        entropy,
        record.generation.saturating_add(1),
        Some(prior_id),
    )?;
    revoke_response_capability(record, ResponseCapabilityRevocationReason::Rotated, now)?;
    Ok(next)
}

pub fn response_capability_rate_decision(
    snapshot: &ResponseCapabilityRateSnapshot,
    policy: &ResponseCapabilityRatePolicy,
) -> ResponseCapabilityRateDecision {
    if snapshot.token_prefix_attempts >= policy.token_prefix_limit
        || snapshot.ip_hash_attempts >= policy.ip_hash_limit
        || snapshot.vendor_attempts >= policy.vendor_limit
        || snapshot.thread_attempts >= policy.thread_limit
    {
        ResponseCapabilityRateDecision::Limited {
            retry_after_seconds: policy.retry_after_seconds.max(1),
        }
    } else {
        ResponseCapabilityRateDecision::Allowed
    }
}
