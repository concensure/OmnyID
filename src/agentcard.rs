use base64::{Engine as _, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::agent_id::AgentId;
use crate::crypto::canonical_json_string;

/// A structured capability descriptor advertising what an agent can do.
/// Included in the signed AgentCard so peers can verify the full schema contract.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CapabilityDescriptor {
    pub name: String,
    pub description: String,
    /// JSON Schema object describing the capability's input parameters.
    pub input_schema: serde_json::Value,
    /// Optional JSON Schema for the return value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<serde_json::Value>,
    /// Semver string, e.g. "1.0.0".
    pub version: String,
    #[serde(default)]
    pub tags: Vec<String>,
    /// "autonomous" | "suggest_only" | "human_approval_required"
    pub approval_mode: String,
}

impl CapabilityDescriptor {
    /// Create a minimal built-in capability descriptor (no schema, version 0.0.0).
    pub fn builtin(name: &str) -> Self {
        Self {
            name: name.to_string(),
            description: String::new(),
            input_schema: serde_json::json!({}),
            output_schema: None,
            version: "0.0.0".to_string(),
            tags: vec![],
            approval_mode: "autonomous".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AgentCard {
    pub protocol: String,
    pub agent_id: String,
    pub key_id: String,
    pub previous_key_ids: Vec<String>,
    pub public_key_hex: String,
    /// Optional X25519 public key used solely to encrypt an envelope to this
    /// agent. It is signed with the rest of the card, never a private key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_public_key_hex: Option<String>,
    pub homeserver_url: String,
    pub capabilities: Vec<CapabilityDescriptor>,
    pub timestamp: String,
    pub signature: String,
}

impl AgentCard {
    pub fn new(
        agent_id: String,
        key_id: String,
        previous_key_ids: Vec<String>,
        public_key_hex: String,
        homeserver_url: String,
    ) -> Self {
        Self {
            protocol: "afp-v1".to_string(),
            agent_id,
            key_id,
            previous_key_ids,
            public_key_hex,
            encryption_public_key_hex: None,
            homeserver_url,
            capabilities: vec![
                CapabilityDescriptor::builtin("afp-v1"),
                CapabilityDescriptor::builtin("thread_fetch"),
                CapabilityDescriptor::builtin("ui_render"),
            ],
            timestamp: chrono::Utc::now().to_rfc3339(),
            signature: String::new(),
        }
    }

    pub fn from_env() -> Self {
        let signing_seed_hex = std::env::var("OMNYID_SIGNING_KEY_HEX").ok();
        let agent_id = std::env::var("OMNYID_AGENT_ID")
            .ok()
            .and_then(|value| AgentId::parse(&value).map(|agent_id| agent_id.full))
            .unwrap_or_else(|| "agent:demo@yourdomain.ai".to_string());
        let homeserver_url = std::env::var("OMNYID_HOMESERVER_URL")
            .unwrap_or_else(|_| "https://your-homeserver:8080".to_string());
        let key_id = std::env::var("OMNYID_KEY_ID")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "main".to_string());
        let previous_key_ids = std::env::var("OMNYID_PREVIOUS_KEY_IDS")
            .ok()
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let public_key_hex = std::env::var("OMNYID_PUBLIC_KEY_HEX").unwrap_or_else(|_| {
            signing_seed_hex
                .as_deref()
                .and_then(derive_public_key_hex)
                .unwrap_or_else(|| "your-public-key-hex-here".to_string())
        });

        let mut card = Self::new(
            agent_id,
            key_id,
            previous_key_ids,
            public_key_hex,
            homeserver_url,
        );
        if let Some(seed_hex) = signing_seed_hex {
            if let Some(signature) = sign_agent_card(&card, &seed_hex) {
                card.signature = signature;
            }
        }
        card
    }

    pub fn verify(&self) -> bool {
        self.verify_with_trusted_public_key(None)
    }

    pub fn verify_with_trusted_public_key(&self, trusted_public_key_hex: Option<&str>) -> bool {
        let Some(agent_id) = AgentId::parse(&self.agent_id) else {
            return false;
        };
        if self.key_id.trim().is_empty() {
            return false;
        }

        if self.signature.trim().is_empty() {
            return false;
        }

        let Some(homeserver_host) = homeserver_host(&self.homeserver_url) else {
            return false;
        };
        if !host_matches_agent_domain(homeserver_host, &agent_id.domain) {
            return false;
        }

        let Some((public_key_hex, signature_b64)) = parse_signature_parts(&self.signature) else {
            return false;
        };

        if public_key_hex != self.public_key_hex {
            return false;
        }
        if let Some(trusted_public_key_hex) = trusted_public_key_hex {
            let trusted = trusted_public_key_hex.trim();
            if trusted.is_empty() || !public_key_hex.eq_ignore_ascii_case(trusted) {
                return false;
            }
        }

        let public_key_bytes = match hex::decode(public_key_hex) {
            Ok(bytes) => bytes,
            Err(_) => return false,
        };
        let public_key_array: [u8; 32] = match public_key_bytes.try_into() {
            Ok(bytes) => bytes,
            Err(_) => return false,
        };
        let verifying_key = match VerifyingKey::from_bytes(&public_key_array) {
            Ok(key) => key,
            Err(_) => return false,
        };

        let signature_bytes = match STANDARD.decode(signature_b64) {
            Ok(bytes) => bytes,
            Err(_) => return false,
        };
        let signature_array: [u8; 64] = match signature_bytes.try_into() {
            Ok(bytes) => bytes,
            Err(_) => return false,
        };
        let signature = ed25519_dalek::Signature::from_bytes(&signature_array);

        verifying_key
            .verify(agent_card_signable_payload(self).as_bytes(), &signature)
            .is_ok()
    }
}

pub fn sign_agent_card(card: &AgentCard, signing_seed_hex: &str) -> Option<String> {
    let seed_bytes = hex::decode(signing_seed_hex).ok()?;
    let seed_array: [u8; 32] = seed_bytes.try_into().ok()?;
    let signing_key = SigningKey::from_bytes(&seed_array);
    let public_key_hex = hex::encode(signing_key.verifying_key().to_bytes());

    if public_key_hex != card.public_key_hex {
        return None;
    }

    let signature = signing_key.sign(agent_card_signable_payload(card).as_bytes());
    let signature_b64 = STANDARD.encode(signature.to_bytes());
    Some(format!("ed25519:{public_key_hex}:{signature_b64}"))
}

pub fn derive_public_key_hex(signing_seed_hex: &str) -> Option<String> {
    let seed_bytes = hex::decode(signing_seed_hex).ok()?;
    let seed_array: [u8; 32] = seed_bytes.try_into().ok()?;
    let signing_key = SigningKey::from_bytes(&seed_array);
    Some(hex::encode(signing_key.verifying_key().to_bytes()))
}

fn agent_card_signable_payload(card: &AgentCard) -> String {
    let mut fields = vec![
        card.protocol.clone(),
        card.agent_id.clone(),
        card.key_id.clone(),
        canonical_json_string(&serde_json::json!(card.previous_key_ids)),
        card.public_key_hex.clone(),
        card.homeserver_url.clone(),
        canonical_json_string(&serde_json::json!(card.capabilities)),
        card.timestamp.clone(),
    ];

    // Preserve the original AFP-v1 payload for cards that pre-date encrypted
    // envelopes. Once present, the encryption key is signed and cannot be
    // swapped or stripped without invalidating the card.
    if let Some(encryption_public_key_hex) = &card.encryption_public_key_hex {
        fields.push(encryption_public_key_hex.clone());
    }
    fields.join("\n")
}

fn parse_signature_parts(signature: &str) -> Option<(&str, &str)> {
    let stripped = signature.strip_prefix("ed25519:")?;
    let mut parts = stripped.splitn(2, ':');
    let public_key_hex = parts.next()?;
    let signature_b64 = parts.next()?;
    if public_key_hex.is_empty() || signature_b64.is_empty() {
        None
    } else {
        Some((public_key_hex, signature_b64))
    }
}

fn homeserver_host(homeserver_url: &str) -> Option<String> {
    let url = reqwest::Url::parse(homeserver_url).ok()?;
    let host = url.host_str()?.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() { None } else { Some(host) }
}

fn host_matches_agent_domain(host: String, agent_domain: &str) -> bool {
    let agent_domain = agent_domain.trim_end_matches('.').to_ascii_lowercase();
    host == agent_domain || host.ends_with(&format!(".{agent_domain}"))
}

#[cfg(test)]
mod tests {
    use super::{AgentCard, derive_public_key_hex, sign_agent_card};

    #[test]
    fn signed_agent_card_verifies() {
        let signing_seed_hex = "0707070707070707070707070707070707070707070707070707070707070707";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:test@omnyid.local".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex,
            "https://omnyid.local".to_string(),
        );

        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");

        assert!(card.verify());
    }

    #[test]
    fn signed_encryption_key_is_verified_and_legacy_cards_still_deserialize() {
        let signing_seed_hex = "1414141414141414141414141414141414141414141414141414141414141414";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:test@omnyid.local".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex,
            "https://omnyid.local".to_string(),
        );
        card.encryption_public_key_hex =
            Some("abababababababababababababababababababababababababababababababab".to_string());
        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");

        assert!(card.verify());
        card.encryption_public_key_hex = None;
        assert!(!card.verify());

        let legacy: AgentCard = serde_json::from_value(serde_json::json!({
            "protocol": "afp-v1",
            "agent_id": "agent:legacy@omnyid.local",
            "key_id": "main",
            "previous_key_ids": [],
            "public_key_hex": "00",
            "homeserver_url": "https://omnyid.local",
            "capabilities": [],
            "timestamp": "2026-01-01T00:00:00Z",
            "signature": ""
        }))
        .expect("legacy card should deserialize");
        assert_eq!(legacy.encryption_public_key_hex, None);
    }

    #[test]
    fn tampered_agent_card_fails_verification() {
        let signing_seed_hex = "0909090909090909090909090909090909090909090909090909090909090909";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:test@omnyid.local".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex,
            "https://omnyid.local".to_string(),
        );

        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");
        card.homeserver_url = "https://evil.local".to_string();

        assert!(!card.verify());
    }

    #[test]
    fn malformed_agent_id_fails_verification() {
        let signing_seed_hex = "0707070707070707070707070707070707070707070707070707070707070707";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "not-an-agent-id".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex,
            "https://omnyid.local".to_string(),
        );

        card.signature = "ed25519:bad:bad".to_string();
        assert!(!card.verify());
    }

    #[test]
    fn tampered_key_id_fails_verification() {
        let signing_seed_hex = "0808080808080808080808080808080808080808080808080808080808080808";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:test@omnyid.local".to_string(),
            "main".to_string(),
            vec!["old-key".to_string()],
            public_key_hex,
            "https://omnyid.local".to_string(),
        );

        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");
        card.key_id = "rotated".to_string();

        assert!(!card.verify());
    }

    #[test]
    fn subdomain_homeserver_host_is_allowed() {
        let signing_seed_hex = "1010101010101010101010101010101010101010101010101010101010101010";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:test@omnyid.local".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex,
            "https://relay.omnyid.local".to_string(),
        );

        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");

        assert!(card.verify());
    }

    #[test]
    fn unrelated_homeserver_host_fails_verification_even_when_self_signed() {
        let signing_seed_hex = "1111111111111111111111111111111111111111111111111111111111111111";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:ceo@omnyid.local".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex,
            "https://attacker.local".to_string(),
        );

        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");

        assert!(!card.verify());
    }

    #[test]
    fn trusted_public_key_verification_accepts_matching_key() {
        let signing_seed_hex = "1212121212121212121212121212121212121212121212121212121212121212";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:test@omnyid.local".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex.clone(),
            "https://omnyid.local".to_string(),
        );

        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");

        assert!(card.verify_with_trusted_public_key(Some(&public_key_hex)));
    }

    #[test]
    fn trusted_public_key_verification_rejects_mismatched_key_even_when_self_signed() {
        let signing_seed_hex = "1313131313131313131313131313131313131313131313131313131313131313";
        let public_key_hex = derive_public_key_hex(signing_seed_hex).expect("public key");
        let mut card = AgentCard::new(
            "agent:test@omnyid.local".to_string(),
            "main".to_string(),
            vec![],
            public_key_hex,
            "https://omnyid.local".to_string(),
        );

        card.signature = sign_agent_card(&card, signing_seed_hex).expect("signature");

        assert!(card.verify());
        assert!(!card.verify_with_trusted_public_key(Some(
            "abababababababababababababababababababababababababababababababab"
        )));
    }
}
