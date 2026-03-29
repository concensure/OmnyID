//! federation.rs — Federated AFP relay (homeserver-to-homeserver).
//!
//! Implements R4: enable two Omnyid homeservers to exchange AFP messages
//! directly without email routing.
//!
//! ## Resolution flow
//!
//!   1. Parse the recipient Agent ID: `agent:alice@anotherdomain.com`
//!   2. Fetch `https://anotherdomain.com/.well-known/afp-delegation`
//!   3. Read `relay_endpoint` from the JSON response
//!   4. POST the AFP message to that endpoint with an HMAC-SHA256 signature
//!   5. The receiving homeserver verifies the signature and ingests the message
//!
//! ## `.well-known/afp-delegation` format
//!
//! ```json
//! {
//!   "agent_id": "agent:alice@anotherdomain.com",
//!   "relay_endpoint": "https://anotherdomain.com/federation/relay",
//!   "signing_key": "<ed25519 public key hex>",
//!   "version": "1.0"
//! }
//! ```
//!
//! ## Inbound request verification
//!
//! The sender includes an `X-Omnyid-Signature` header:
//! ```
//! HMAC-SHA256(signing_key_hex, canonical_json(afp_message))
//! ```
//! The receiver looks up the sender's signing key via their `.well-known` doc
//! and verifies the signature before accepting the message.

use hmac::Mac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = hmac::Hmac<Sha256>;

// ── Agent ID parsing ──────────────────────────────────────────────────────────

/// Parse `agent:alice@example.com` into `("alice", "example.com")`.
pub fn parse_agent_id(agent_id: &str) -> Option<(&str, &str)> {
    let without_prefix = agent_id.strip_prefix("agent:")?;
    let at = without_prefix.rfind('@')?;
    let local = &without_prefix[..at];
    let domain = &without_prefix[at + 1..];
    if local.is_empty() || domain.is_empty() {
        return None;
    }
    Some((local, domain))
}

/// Returns true if the Agent ID belongs to a foreign homeserver (not this one).
pub fn is_foreign_agent(agent_id: &str, own_domain: &str) -> bool {
    match parse_agent_id(agent_id) {
        Some((_, domain)) => domain != own_domain,
        None => false,
    }
}

// ── AFP delegation document ───────────────────────────────────────────────────

/// Fetched from `https://<domain>/.well-known/afp-delegation`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AfpDelegation {
    pub agent_id: String,
    pub relay_endpoint: String,
    pub signing_key: String, // hex-encoded Ed25519 public key
    pub version: String,
}

/// Fetch the AFP delegation document for a domain.
pub async fn fetch_afp_delegation(domain: &str) -> Result<AfpDelegation, FederationError> {
    let url = format!("https://{}/.well-known/afp-delegation", domain);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| FederationError::Http(e.to_string()))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| FederationError::Http(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(FederationError::DelegationNotFound(domain.to_string()));
    }

    resp.json::<AfpDelegation>()
        .await
        .map_err(|e| FederationError::Serialization(e.to_string()))
}

// ── Signature helpers ─────────────────────────────────────────────────────────

/// Compute HMAC-SHA256 over a canonical JSON representation of the message.
/// `signing_key_hex` is the sender's 32-byte HMAC key in hex.
pub fn sign_relay_message(
    canonical_json: &str,
    signing_key_hex: &str,
) -> Result<String, FederationError> {
    let key_bytes = hex::decode(signing_key_hex)
        .map_err(|e| FederationError::Signature(format!("invalid signing key: {e}")))?;
    let mut mac = HmacSha256::new_from_slice(&key_bytes)
        .map_err(|e| FederationError::Signature(e.to_string()))?;
    mac.update(canonical_json.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

/// Verify an HMAC-SHA256 signature from the sender.
/// Returns Ok(()) if valid, Err otherwise.
pub fn verify_relay_signature(
    canonical_json: &str,
    signing_key_hex: &str,
    received_sig_hex: &str,
) -> Result<(), FederationError> {
    let expected = sign_relay_message(canonical_json, signing_key_hex)?;
    // Constant-time comparison
    let expected_bytes =
        hex::decode(&expected).map_err(|e| FederationError::Signature(e.to_string()))?;
    let received_bytes = hex::decode(received_sig_hex)
        .map_err(|_| FederationError::Signature("received signature is not hex".to_string()))?;
    if expected_bytes.len() != received_bytes.len() {
        return Err(FederationError::SignatureMismatch);
    }
    let mismatch = expected_bytes
        .iter()
        .zip(received_bytes.iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b));
    if mismatch != 0 {
        return Err(FederationError::SignatureMismatch);
    }
    Ok(())
}

// ── Relay dispatch ────────────────────────────────────────────────────────────

/// Outbound relay request payload.
#[derive(Serialize, Deserialize, Debug)]
pub struct RelayRequest {
    pub message: serde_json::Value,
    pub sender_domain: String,
    pub nonce: String, // ULID — replay protection
    pub timestamp: String,
}

/// Relay an AFP message to a foreign homeserver.
///
/// 1. Resolves the recipient's `.well-known/afp-delegation`
/// 2. Builds the relay request with a fresh nonce
/// 3. Signs it with the local homeserver's signing key
/// 4. POSTs to the recipient's relay endpoint
pub async fn dispatch_relay(
    message: serde_json::Value,
    recipient_agent_id: &str,
    own_domain: &str,
    own_signing_key_hex: &str,
) -> Result<(), FederationError> {
    let (_, domain) = parse_agent_id(recipient_agent_id)
        .ok_or_else(|| FederationError::InvalidAgentId(recipient_agent_id.to_string()))?;

    let delegation = fetch_afp_delegation(domain).await?;

    let relay_req = RelayRequest {
        message,
        sender_domain: own_domain.to_string(),
        nonce: ulid::Ulid::new().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    };

    let canonical = serde_json::to_string(&relay_req)
        .map_err(|e| FederationError::Serialization(e.to_string()))?;

    let signature = sign_relay_message(&canonical, own_signing_key_hex)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| FederationError::Http(e.to_string()))?;

    let resp = client
        .post(&delegation.relay_endpoint)
        .header("Content-Type", "application/json")
        .header("X-Omnyid-Signature", &signature)
        .header("X-Omnyid-Sender", own_domain)
        .body(canonical)
        .send()
        .await
        .map_err(|e| FederationError::Http(e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(FederationError::RemoteRejected(format!("{status}: {body}")));
    }
    Ok(())
}

// ── Inbound relay verification ────────────────────────────────────────────────

/// Verify an inbound relay request from another homeserver.
///
/// 1. Parses the relay request body
/// 2. Fetches the sender's `.well-known/afp-delegation` to get their signing key
/// 3. Verifies the HMAC-SHA256 signature
/// 4. Returns the RelayRequest if valid
pub async fn verify_inbound_relay(
    body: &str,
    sender_domain: &str,
    received_sig: &str,
) -> Result<RelayRequest, FederationError> {
    let delegation = fetch_afp_delegation(sender_domain).await?;
    verify_relay_signature(body, &delegation.signing_key, received_sig)?;
    let req: RelayRequest =
        serde_json::from_str(body).map_err(|e| FederationError::Serialization(e.to_string()))?;
    // Nonce is stored by the caller in a short-lived seen-nonces set for replay protection
    Ok(req)
}

// ── Error type ────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum FederationError {
    InvalidAgentId(String),
    DelegationNotFound(String),
    Http(String),
    Serialization(String),
    Signature(String),
    SignatureMismatch,
    RemoteRejected(String),
}

impl std::fmt::Display for FederationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FederationError::InvalidAgentId(s) => write!(f, "invalid agent id: {s}"),
            FederationError::DelegationNotFound(s) => write!(f, "afp-delegation not found for {s}"),
            FederationError::Http(s) => write!(f, "HTTP error: {s}"),
            FederationError::Serialization(s) => write!(f, "serialization error: {s}"),
            FederationError::Signature(s) => write!(f, "signature error: {s}"),
            FederationError::SignatureMismatch => write!(f, "signature mismatch"),
            FederationError::RemoteRejected(s) => write!(f, "remote rejected relay: {s}"),
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_agent_id_valid() {
        let (local, domain) = parse_agent_id("agent:alice@example.com").unwrap();
        assert_eq!(local, "alice");
        assert_eq!(domain, "example.com");
    }

    #[test]
    fn parse_agent_id_invalid_no_at() {
        assert!(parse_agent_id("agent:aliceexample.com").is_none());
    }

    #[test]
    fn parse_agent_id_invalid_no_prefix() {
        assert!(parse_agent_id("alice@example.com").is_none());
    }

    #[test]
    fn is_foreign_agent_detects_different_domain() {
        assert!(is_foreign_agent("agent:alice@foreign.com", "example.com"));
        assert!(!is_foreign_agent("agent:alice@example.com", "example.com"));
    }

    #[test]
    fn relay_signature_roundtrip() {
        let key_hex = hex::encode([0xab_u8; 32]);
        let canonical = r#"{"message":"hello","nonce":"abc"}"#;
        let sig = sign_relay_message(canonical, &key_hex).unwrap();
        assert!(verify_relay_signature(canonical, &key_hex, &sig).is_ok());
    }

    #[test]
    fn relay_signature_detects_tampered_body() {
        let key_hex = hex::encode([0xab_u8; 32]);
        let canonical = r#"{"message":"hello"}"#;
        let sig = sign_relay_message(canonical, &key_hex).unwrap();
        let tampered = r#"{"message":"TAMPERED"}"#;
        assert!(verify_relay_signature(tampered, &key_hex, &sig).is_err());
    }

    #[test]
    fn relay_signature_detects_wrong_key() {
        let key_a = hex::encode([0xaa_u8; 32]);
        let key_b = hex::encode([0xbb_u8; 32]);
        let canonical = r#"{"nonce":"x"}"#;
        let sig = sign_relay_message(canonical, &key_a).unwrap();
        assert!(verify_relay_signature(canonical, &key_b, &sig).is_err());
    }

    #[test]
    fn federation_error_display() {
        assert!(
            FederationError::InvalidAgentId("x".to_string())
                .to_string()
                .contains("invalid")
        );
        assert!(
            FederationError::SignatureMismatch
                .to_string()
                .contains("mismatch")
        );
        assert!(
            FederationError::DelegationNotFound("dom".to_string())
                .to_string()
                .contains("not found")
        );
    }
}
