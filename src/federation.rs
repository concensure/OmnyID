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
//! ```text
//! ed25519:<hex-encoded 64-byte signature over canonical_json(relay_request)>
//! ```
//! The receiver looks up the sender's Ed25519 public key via their `.well-known` doc
//! and verifies the signature before accepting the message.
//!
//! GAP-109: Previously HMAC-SHA256 was used with the sender's **public** key, which is
//! trivially forgeable because the key is publicly known. Ed25519 asymmetric signing
//! is the correct primitive: sign with the private key, verify with the public key.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use crate::gateway::rest_adapter::validate_public_http_url;

// ── Agent ID parsing ──────────────────────────────────────────────────────────

/// Parse `agent:alice@example.com` into `("alice", "example.com")`.
pub fn parse_agent_id(agent_id: &str) -> Option<(&str, &str)> {
    let without_prefix = agent_id.strip_prefix("agent:")?;
    let at = without_prefix.rfind('@')?;
    let local = &without_prefix[..at];
    let domain = &without_prefix[at + 1..];
    if !valid_agent_local(local) || !valid_agent_domain(domain) {
        return None;
    }
    Some((local, domain))
}

fn valid_agent_local(local: &str) -> bool {
    !local.is_empty()
        && local
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '+'))
        && !local.starts_with('.')
        && !local.ends_with('.')
        && !local.contains("..")
}

fn valid_agent_domain(domain: &str) -> bool {
    if domain.is_empty()
        || domain.starts_with('.')
        || domain.ends_with('.')
        || domain.contains("..")
    {
        return false;
    }

    domain.split('.').all(|label| {
        !label.is_empty()
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    })
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

fn validate_afp_delegation_for_domain(
    delegation: &AfpDelegation,
    domain: &str,
) -> Result<(), FederationError> {
    let Some((_, delegation_domain)) = parse_agent_id(&delegation.agent_id) else {
        return Err(FederationError::DelegationInvalid(
            "delegation agent_id must be a valid agent id".to_string(),
        ));
    };
    if delegation_domain != domain {
        return Err(FederationError::DelegationInvalid(format!(
            "delegation agent_id domain '{}' does not match requested domain '{}'",
            delegation_domain, domain
        )));
    }

    let signing_key_bytes = hex::decode(delegation.signing_key.trim()).map_err(|_| {
        FederationError::DelegationInvalid("delegation signing_key must be hex".to_string())
    })?;
    if signing_key_bytes.len() != 32 {
        return Err(FederationError::DelegationInvalid(
            "delegation signing_key must decode to 32 bytes".to_string(),
        ));
    }

    if delegation.relay_endpoint.trim().is_empty() {
        return Err(FederationError::DelegationInvalid(
            "delegation relay_endpoint is required".to_string(),
        ));
    }

    Ok(())
}

/// Reject domains whose hostnames match private/loopback ranges (SSRF guard).
fn is_ssrf_blocked_domain(domain: &str) -> bool {
    let h = domain.split(':').next().unwrap_or(domain).to_lowercase();
    let blocked_exact = [
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
        "169.254.169.254",
    ];
    if blocked_exact.iter().any(|b| h == *b) {
        return true;
    }
    let blocked_prefixes = [
        "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.",
        "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.",
        "172.31.", "192.168.", "127.", "169.254.", "fd", "fe80:",
    ];
    blocked_prefixes.iter().any(|p| h.starts_with(p))
}

// GAP-091: cache delegation documents so repeated inbound relay requests from the
// same sender do not each spawn a blocking HTTPS fetch. TTL is 5 minutes.
static DELEGATION_CACHE: OnceLock<Mutex<HashMap<String, (AfpDelegation, Instant)>>> =
    OnceLock::new();
const DELEGATION_CACHE_TTL_SECS: u64 = 300;

fn delegation_cache() -> &'static Mutex<HashMap<String, (AfpDelegation, Instant)>> {
    DELEGATION_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Fetch the AFP delegation document for a domain, with a 5-minute TTL cache.
pub async fn fetch_afp_delegation(domain: &str) -> Result<AfpDelegation, FederationError> {
    if is_ssrf_blocked_domain(domain) {
        return Err(FederationError::Http(format!(
            "ssrf_block: federation domain '{}' targets a private address range",
            domain
        )));
    }

    // Check cache before making the network request.
    if let Ok(cache) = delegation_cache().lock() {
        if let Some((cached, fetched_at)) = cache.get(domain) {
            if fetched_at.elapsed().as_secs() < DELEGATION_CACHE_TTL_SECS {
                return Ok(cached.clone());
            }
        }
    }

    let url = format!("https://{}/.well-known/afp-delegation", domain);
    validate_public_http_url(&url)
        .await
        .map_err(FederationError::Http)?;
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

    let delegation = resp
        .json::<AfpDelegation>()
        .await
        .map_err(|e| FederationError::Serialization(e.to_string()))?;
    validate_afp_delegation_for_domain(&delegation, domain)?;

    // Populate cache.
    if let Ok(mut cache) = delegation_cache().lock() {
        cache.insert(domain.to_string(), (delegation.clone(), Instant::now()));
    }

    Ok(delegation)
}

// ── Signature helpers ─────────────────────────────────────────────────────────

/// Sign a relay payload with the sender's Ed25519 private key (GAP-109).
///
/// `private_key_hex` is the 32-byte seed (private key) in hex.
/// Returns `"ed25519:<sig_hex>"`.
pub fn sign_relay_message(
    canonical_json: &str,
    private_key_hex: &str,
) -> Result<String, FederationError> {
    let key_bytes: [u8; 32] = hex::decode(private_key_hex)
        .map_err(|e| FederationError::Signature(format!("invalid private key: {e}")))?
        .try_into()
        .map_err(|_| FederationError::Signature("private key must be 32 bytes".to_string()))?;
    let signing_key = SigningKey::from_bytes(&key_bytes);
    let signature = signing_key.sign(canonical_json.as_bytes());
    Ok(format!("ed25519:{}", hex::encode(signature.to_bytes())))
}

/// Verify an Ed25519 signature from the sender's public key (GAP-109).
///
/// `public_key_hex` is the sender's 32-byte verifying key (from their `.well-known` doc).
/// `received_sig` is `"ed25519:<sig_hex>"`.
pub fn verify_relay_signature(
    canonical_json: &str,
    public_key_hex: &str,
    received_sig: &str,
) -> Result<(), FederationError> {
    let sig_hex = received_sig.strip_prefix("ed25519:").ok_or_else(|| {
        FederationError::Signature("signature must start with 'ed25519:'".to_string())
    })?;
    let sig_bytes: [u8; 64] = hex::decode(sig_hex)
        .map_err(|_| FederationError::Signature("signature is not valid hex".to_string()))?
        .try_into()
        .map_err(|_| FederationError::Signature("signature must be 64 bytes".to_string()))?;
    let pub_bytes: [u8; 32] = hex::decode(public_key_hex)
        .map_err(|_| FederationError::Signature("public key is not valid hex".to_string()))?
        .try_into()
        .map_err(|_| FederationError::Signature("public key must be 32 bytes".to_string()))?;
    let verifying_key = VerifyingKey::from_bytes(&pub_bytes)
        .map_err(|e| FederationError::Signature(format!("invalid public key: {e}")))?;
    let signature = Signature::from_bytes(&sig_bytes);
    verifying_key
        .verify(canonical_json.as_bytes(), &signature)
        .map_err(|_| FederationError::SignatureMismatch)
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

const RELAY_REQUEST_TIMESTAMP_TOLERANCE_SECS: i64 = 300;

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

    // Guard relay_endpoint against SSRF — the domain may differ from the
    // well-known host if the delegation document is compromised or forged.
    let relay_host = delegation
        .relay_endpoint
        .split_once("://")
        .map(|(_, rest)| {
            rest.split('/')
                .next()
                .unwrap_or(rest)
                .split(':')
                .next()
                .unwrap_or(rest)
        })
        .unwrap_or(&delegation.relay_endpoint);
    if is_ssrf_blocked_domain(relay_host) {
        return Err(FederationError::Http(format!(
            "ssrf_block: relay_endpoint host '{}' targets a private address range",
            relay_host
        )));
    }
    validate_public_http_url(&delegation.relay_endpoint)
        .await
        .map_err(FederationError::Http)?;

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
    validate_inbound_relay_request(&req, sender_domain, chrono::Utc::now().timestamp())?;
    // Nonce is stored by the caller in a short-lived seen-nonces set for replay protection
    Ok(req)
}

fn validate_inbound_relay_request(
    request: &RelayRequest,
    expected_sender_domain: &str,
    now_secs: i64,
) -> Result<(), FederationError> {
    if request.sender_domain.trim() != expected_sender_domain.trim() {
        return Err(FederationError::Signature(format!(
            "relay sender mismatch: header={} body={}",
            expected_sender_domain, request.sender_domain
        )));
    }

    let timestamp = chrono::DateTime::parse_from_rfc3339(&request.timestamp)
        .map_err(|_| FederationError::Signature("invalid relay timestamp".to_string()))?;
    if (now_secs - timestamp.timestamp()).abs() > RELAY_REQUEST_TIMESTAMP_TOLERANCE_SECS {
        return Err(FederationError::Signature(
            "relay timestamp outside allowed tolerance".to_string(),
        ));
    }

    Ok(())
}

// ── Error type ────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum FederationError {
    InvalidAgentId(String),
    DelegationNotFound(String),
    DelegationInvalid(String),
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
            FederationError::DelegationInvalid(s) => write!(f, "invalid afp-delegation: {s}"),
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
        let (local, domain) = parse_agent_id("agent:alice@omnyid.com").unwrap();
        assert_eq!(local, "alice");
        assert_eq!(domain, "omnyid.com");
    }

    #[test]
    fn parse_agent_id_invalid_no_at() {
        assert!(parse_agent_id("agent:aliceomnyid.com").is_none());
    }

    #[test]
    fn parse_agent_id_invalid_no_prefix() {
        assert!(parse_agent_id("alice@omnyid.com").is_none());
    }

    #[test]
    fn parse_agent_id_invalid_whitespace_or_bad_labels() {
        assert!(parse_agent_id("agent:alice smith@omnyid.com").is_none());
        assert!(parse_agent_id("agent:alice@omnyid .com").is_none());
        assert!(parse_agent_id("agent:alice@omnyid..com").is_none());
        assert!(parse_agent_id("agent:.alice@omnyid.com").is_none());
        assert!(parse_agent_id("agent:alice@-omnyid.com").is_none());
    }

    #[test]
    fn is_foreign_agent_detects_different_domain() {
        assert!(is_foreign_agent("agent:alice@foreign.com", "omnyid.com"));
        assert!(!is_foreign_agent("agent:alice@omnyid.com", "omnyid.com"));
    }

    fn valid_delegation(domain: &str) -> AfpDelegation {
        AfpDelegation {
            agent_id: format!("agent:relay@{domain}"),
            relay_endpoint: format!("https://{domain}/federation/relay"),
            signing_key: "ab".repeat(32),
            version: "1.0".to_string(),
        }
    }

    #[test]
    fn validate_afp_delegation_accepts_matching_domain_and_key() {
        let delegation = valid_delegation("example.com");
        validate_afp_delegation_for_domain(&delegation, "example.com").unwrap();
    }

    #[test]
    fn validate_afp_delegation_rejects_agent_domain_mismatch() {
        let delegation = valid_delegation("evil.example");
        let err = validate_afp_delegation_for_domain(&delegation, "example.com")
            .expect_err("domain mismatch should fail");
        assert!(err.to_string().contains("does not match requested domain"));
    }

    #[test]
    fn validate_afp_delegation_rejects_malformed_signing_key() {
        let mut delegation = valid_delegation("example.com");
        delegation.signing_key = "abcd".to_string();
        let err = validate_afp_delegation_for_domain(&delegation, "example.com")
            .expect_err("short key should fail");
        assert!(err.to_string().contains("32 bytes"));

        delegation.signing_key = "not-hex".to_string();
        let err = validate_afp_delegation_for_domain(&delegation, "example.com")
            .expect_err("non-hex key should fail");
        assert!(err.to_string().contains("must be hex"));
    }

    #[test]
    fn relay_signature_roundtrip() {
        let private_key_seed = [0xab_u8; 32];
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&private_key_seed);
        let pub_hex = hex::encode(signing_key.verifying_key().to_bytes());
        let priv_hex = hex::encode(private_key_seed);
        let canonical = r#"{"message":"hello","nonce":"abc"}"#;
        let sig = sign_relay_message(canonical, &priv_hex).unwrap();
        assert!(verify_relay_signature(canonical, &pub_hex, &sig).is_ok());
    }

    #[test]
    fn relay_signature_detects_tampered_body() {
        let private_key_seed = [0xab_u8; 32];
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&private_key_seed);
        let pub_hex = hex::encode(signing_key.verifying_key().to_bytes());
        let priv_hex = hex::encode(private_key_seed);
        let canonical = r#"{"message":"hello"}"#;
        let sig = sign_relay_message(canonical, &priv_hex).unwrap();
        let tampered = r#"{"message":"TAMPERED"}"#;
        assert!(verify_relay_signature(tampered, &pub_hex, &sig).is_err());
    }

    #[test]
    fn relay_signature_detects_wrong_key() {
        let seed_a = [0xaa_u8; 32];
        let seed_b = [0xbb_u8; 32];
        let pub_hex_b = hex::encode(
            ed25519_dalek::SigningKey::from_bytes(&seed_b)
                .verifying_key()
                .to_bytes(),
        );
        let priv_hex_a = hex::encode(seed_a);
        let canonical = r#"{"nonce":"x"}"#;
        let sig = sign_relay_message(canonical, &priv_hex_a).unwrap();
        assert!(verify_relay_signature(canonical, &pub_hex_b, &sig).is_err());
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

    #[test]
    fn validate_inbound_relay_request_accepts_matching_recent_request() {
        let now_secs = chrono::Utc::now().timestamp();
        let request = RelayRequest {
            message: serde_json::json!({"kind": "note"}),
            sender_domain: "foreign.example".to_string(),
            nonce: ulid::Ulid::new().to_string(),
            timestamp: chrono::DateTime::from_timestamp(now_secs, 0)
                .expect("timestamp")
                .to_rfc3339(),
        };

        assert!(validate_inbound_relay_request(&request, "foreign.example", now_secs).is_ok());
    }

    #[test]
    fn validate_inbound_relay_request_rejects_sender_domain_mismatch() {
        let now_secs = chrono::Utc::now().timestamp();
        let request = RelayRequest {
            message: serde_json::json!({"kind": "note"}),
            sender_domain: "attacker.example".to_string(),
            nonce: ulid::Ulid::new().to_string(),
            timestamp: chrono::DateTime::from_timestamp(now_secs, 0)
                .expect("timestamp")
                .to_rfc3339(),
        };

        let err = validate_inbound_relay_request(&request, "foreign.example", now_secs)
            .expect_err("sender mismatch must fail");
        assert!(err.to_string().contains("relay sender mismatch"));
    }

    #[test]
    fn validate_inbound_relay_request_rejects_stale_timestamp() {
        let now_secs = chrono::Utc::now().timestamp();
        let request = RelayRequest {
            message: serde_json::json!({"kind": "note"}),
            sender_domain: "foreign.example".to_string(),
            nonce: ulid::Ulid::new().to_string(),
            timestamp: chrono::DateTime::from_timestamp(
                now_secs - RELAY_REQUEST_TIMESTAMP_TOLERANCE_SECS - 1,
                0,
            )
            .expect("timestamp")
            .to_rfc3339(),
        };

        let err = validate_inbound_relay_request(&request, "foreign.example", now_secs)
            .expect_err("stale relay request must fail");
        assert!(
            err.to_string()
                .contains("relay timestamp outside allowed tolerance")
        );
    }

    #[test]
    fn validate_inbound_relay_request_rejects_invalid_timestamp() {
        let request = RelayRequest {
            message: serde_json::json!({"kind": "note"}),
            sender_domain: "foreign.example".to_string(),
            nonce: ulid::Ulid::new().to_string(),
            timestamp: "not-a-timestamp".to_string(),
        };

        let err = validate_inbound_relay_request(&request, "foreign.example", 0)
            .expect_err("invalid timestamp must fail");
        assert!(err.to_string().contains("invalid relay timestamp"));
    }
}
