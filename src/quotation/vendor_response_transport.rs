use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

use crate::{
    crypto::{is_supported_encryption_envelope, signature_matches_public_key, verify_signature},
    message::AFPMessage,
};

pub const VENDOR_RESPONSE_TRANSPORT_VERSION: &str = "quotation.vendor_response_transport.v1";
pub const WEDDING_ENQUIRY_RESPONSE_TYPE: &str = "wedding_enquiry_response";
pub const WEDDING_ENQUIRY_TYPE: &str = "wedding_enquiry";
pub const MAX_VENDOR_ENVELOPE_BYTES: usize = 65_536;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorResponseRoutingMetadata {
    pub schema_version: String,
    pub grant_message_id: String,
    pub grant_id: String,
    pub vendor_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub projection_fingerprint: String,
    pub response_id: String,
    pub response_fingerprint: String,
    pub nonce: String,
    pub agent_card_key_id: String,
    pub expires_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_identity_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_identity_kind: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClaimedVendorAuthority<'a> {
    pub vendor_id: &'a str,
    pub agent_id: &'a str,
    pub agent_card_key_id: &'a str,
    pub signing_public_key_hex: &'a str,
    pub claim_status: &'a str,
    pub agent_card_valid: bool,
    pub response_capability: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActiveVendorGrant<'a> {
    pub grant_message_id: &'a str,
    pub grant_id: &'a str,
    pub vendor_id: &'a str,
    pub target_agent_id: &'a str,
    pub response_recipient_id: &'a str,
    pub quotation_id: &'a str,
    pub quotation_version_id: &'a str,
    pub thread_id: &'a str,
    pub projection_fingerprint: &'a str,
    pub expires_at: &'a str,
    pub active: bool,
    pub quotation_active: bool,
    pub closure_terminal: bool,
    pub answer_questions_allowed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorTransportFailure {
    InvalidEnvelope,
    PlaintextForbidden,
    PayloadTooLarge,
    Expired,
    ClaimUnavailable,
    AgentCardChanged,
    SignatureInvalid,
    WrongRecipient,
    BindingMismatch,
    GrantUnavailable,
    ActionUnavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorTransportReceiptStatus {
    Accepted,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorTransportReceipt {
    pub receipt_id: String,
    pub request_id: String,
    pub request_digest: String,
    pub status: VendorTransportReceiptStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<VendorTransportFailure>,
    pub received_at: String,
}

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn fingerprint(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn parsed_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn empty_plaintext(content: &Value) -> bool {
    content.is_null() || content.as_object().is_some_and(|object| object.is_empty())
}

pub fn envelope_bytes(message: &AFPMessage) -> Option<Vec<u8>> {
    let bytes = serde_json::to_vec(message).ok()?;
    (!bytes.is_empty() && bytes.len() <= MAX_VENDOR_ENVELOPE_BYTES).then_some(bytes)
}

pub fn envelope_digest(message: &AFPMessage) -> Option<String> {
    envelope_bytes(message).map(|bytes| hex::encode(Sha256::digest(bytes)))
}

pub fn ciphertext_bytes(message: &AFPMessage) -> Option<usize> {
    let ciphertext = message.encryption.as_ref()?.get("ciphertext")?.as_str()?;
    STANDARD.decode(ciphertext).ok().map(|bytes| bytes.len())
}

pub fn valid_vendor_encrypted_envelope(encryption: &Value) -> bool {
    let Some(object) = encryption.as_object() else {
        return false;
    };
    let expected = [
        "aad",
        "algorithm",
        "ciphertext",
        "ephemeral_public_key",
        "nonce",
        "scheme",
    ]
    .into_iter()
    .collect::<BTreeSet<_>>();
    if object.keys().map(String::as_str).collect::<BTreeSet<_>>() != expected
        || !is_supported_encryption_envelope(encryption)
    {
        return false;
    }
    let decoded_len = |key: &str| {
        object
            .get(key)
            .and_then(Value::as_str)
            .and_then(|value| STANDARD.decode(value).ok())
            .map(|value| value.len())
    };
    decoded_len("ephemeral_public_key") == Some(32)
        && decoded_len("nonce") == Some(24)
        && decoded_len("ciphertext").is_some_and(|bytes| (1..=60 * 1024).contains(&bytes))
        && decoded_len("aad").is_some_and(|bytes| bytes <= 8 * 1024)
}

pub fn routing_metadata(
    message: &AFPMessage,
) -> Result<VendorResponseRoutingMetadata, VendorTransportFailure> {
    serde_json::from_value(
        message
            .metadata
            .clone()
            .ok_or(VendorTransportFailure::InvalidEnvelope)?,
    )
    .map_err(|_| VendorTransportFailure::InvalidEnvelope)
}

fn metadata_valid(metadata: &VendorResponseRoutingMetadata) -> bool {
    metadata.schema_version == VENDOR_RESPONSE_TRANSPORT_VERSION
        && bounded(&metadata.grant_message_id, 180)
        && bounded(&metadata.grant_id, 180)
        && bounded(&metadata.vendor_id, 180)
        && bounded(&metadata.quotation_id, 180)
        && bounded(&metadata.quotation_version_id, 180)
        && fingerprint(&metadata.projection_fingerprint)
        && bounded(&metadata.response_id, 180)
        && fingerprint(&metadata.response_fingerprint)
        && bounded(&metadata.nonce, 180)
        && bounded(&metadata.agent_card_key_id, 180)
        && parsed_time(&metadata.expires_at).is_some()
        && match (&metadata.sender_identity_id, &metadata.sender_identity_kind) {
            (None, None) => true,
            (Some(identity_id), Some(kind)) => bounded(identity_id, 180)
                && matches!(kind.as_str(), "connected_email" | "omnyid_mask"),
            _ => false,
        }
}

pub fn validate_claimed_vendor_response(
    message: &AFPMessage,
    authority: &ClaimedVendorAuthority<'_>,
    grant: &ActiveVendorGrant<'_>,
    now: DateTime<Utc>,
) -> Result<VendorResponseRoutingMetadata, VendorTransportFailure> {
    if !matches!(authority.claim_status, "claimed" | "verified")
        || !authority.agent_card_valid
        || !authority.response_capability
    {
        return Err(VendorTransportFailure::ClaimUnavailable);
    }
    if authority.agent_card_key_id.trim().is_empty()
        || authority.signing_public_key_hex.trim().is_empty()
    {
        return Err(VendorTransportFailure::AgentCardChanged);
    }
    if !empty_plaintext(&message.content) {
        return Err(VendorTransportFailure::PlaintextForbidden);
    }
    if message.r#type != WEDDING_ENQUIRY_RESPONSE_TYPE
        || message.protocol != "afp-v1"
        || !bounded(&message.id, 180)
        || !bounded(&message.thread_id, 180)
        || message
            .encryption
            .as_ref()
            .is_none_or(|encryption| !valid_vendor_encrypted_envelope(encryption))
    {
        return Err(VendorTransportFailure::InvalidEnvelope);
    }
    if envelope_bytes(message).is_none()
        || ciphertext_bytes(message).is_none_or(|bytes| bytes == 0 || bytes > 60 * 1024)
    {
        return Err(VendorTransportFailure::PayloadTooLarge);
    }
    if message.from != authority.agent_id || message.to.as_slice() != [grant.response_recipient_id]
    {
        return Err(VendorTransportFailure::WrongRecipient);
    }
    if !verify_signature(message)
        || !signature_matches_public_key(&message.signature, authority.signing_public_key_hex)
    {
        return Err(VendorTransportFailure::SignatureInvalid);
    }
    let metadata = routing_metadata(message)?;
    if !metadata_valid(&metadata) {
        return Err(VendorTransportFailure::InvalidEnvelope);
    }
    if metadata.agent_card_key_id != authority.agent_card_key_id {
        return Err(VendorTransportFailure::AgentCardChanged);
    }
    if !grant.active || !grant.quotation_active || grant.closure_terminal {
        return Err(VendorTransportFailure::GrantUnavailable);
    }
    if !grant.answer_questions_allowed {
        return Err(VendorTransportFailure::ActionUnavailable);
    }
    let message_time =
        parsed_time(&message.timestamp).ok_or(VendorTransportFailure::InvalidEnvelope)?;
    let envelope_expiry =
        parsed_time(&metadata.expires_at).ok_or(VendorTransportFailure::InvalidEnvelope)?;
    let grant_expiry =
        parsed_time(grant.expires_at).ok_or(VendorTransportFailure::GrantUnavailable)?;
    if message_time > now + chrono::Duration::minutes(5)
        || now >= envelope_expiry
        || now >= grant_expiry
        || envelope_expiry > grant_expiry
    {
        return Err(VendorTransportFailure::Expired);
    }
    if message.id != metadata.response_id
        || message.thread_id != grant.thread_id
        || metadata.grant_message_id != grant.grant_message_id
        || metadata.grant_id != grant.grant_id
        || metadata.vendor_id != authority.vendor_id
        || metadata.vendor_id != grant.vendor_id
        || metadata.quotation_id != grant.quotation_id
        || metadata.quotation_version_id != grant.quotation_version_id
        || !metadata
            .projection_fingerprint
            .eq_ignore_ascii_case(grant.projection_fingerprint)
        || authority.agent_id != grant.target_agent_id
    {
        return Err(VendorTransportFailure::BindingMismatch);
    }
    Ok(metadata)
}

pub fn receipt_id(vendor_id: &str, request_id: &str) -> String {
    let digest = Sha256::digest(format!(
        "quotation-vendor-receipt\0{vendor_id}\0{request_id}"
    ));
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    ulid::Ulid::from_bytes(bytes).to_string()
}

pub fn vendor_transport_receipt(
    vendor_id: &str,
    request_id: &str,
    request_digest: &str,
    outcome: Result<&str, VendorTransportFailure>,
    now: DateTime<Utc>,
) -> VendorTransportReceipt {
    let (status, message_id, failure) = match outcome {
        Ok(message_id) => (
            VendorTransportReceiptStatus::Accepted,
            Some(message_id.to_string()),
            None,
        ),
        Err(failure) => (VendorTransportReceiptStatus::Rejected, None, Some(failure)),
    };
    VendorTransportReceipt {
        receipt_id: receipt_id(vendor_id, request_id),
        request_id: request_id.to_string(),
        request_digest: request_digest.to_ascii_lowercase(),
        status,
        message_id,
        failure,
        received_at: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    }
}
