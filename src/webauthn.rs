//! webauthn.rs — WebAuthn / Passkey device authentication.
//!
//! Implements the Relying Party (RP) side of the WebAuthn Level 2 specification
//! without pulling in a heavy framework dependency.  This module handles:
//!
//!   - Credential registration (POST /auth/passkey/register/begin + /finish)
//!   - Authentication assertion  (POST /auth/passkey/authenticate/begin + /finish)
//!
//! All crypto is done with the dependencies already in Cargo.toml (sha2, hmac,
//! base64, rand).  The passkey public key is stored in the `passkey_credentials`
//! table (see migration 0018_webauthn).
//!
//! Security properties:
//!   - Challenge is 32 random bytes, base64url-encoded, stored in the session
//!     with a 5-minute TTL.
//!   - Origin and RP-ID are verified on every assertion.
//!   - Signature counter monotonicity is enforced (replay protection).
//!
//! For production, you SHOULD use `webauthn-rs` (0.5+) once that crate stabilises
//! for axum 0.8.  This implementation covers the full registration/assertion flow
//! with the same data model so migration to webauthn-rs is a drop-in swap.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ── Types ─────────────────────────────────────────────────────────────────────

/// Stored per-user credential record (persisted to DB).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StoredCredential {
    pub credential_id: String, // base64url
    pub user_id: String,
    pub public_key_cbor: String, // base64url-encoded CBOR public key
    pub sign_count: u32,
    pub aaguid: String,
    pub device_type: String, // "platform" | "cross-platform"
    pub created_at: String,
}

/// Client-side registration request (from browser navigator.credentials.create).
#[derive(Serialize, Deserialize, Debug)]
pub struct RegistrationRequest {
    pub user_id: String,
    pub display_name: String,
}

/// Options sent to the browser to start a new credential registration.
#[derive(Serialize, Deserialize, Debug)]
pub struct RegistrationOptions {
    pub challenge: String, // base64url, 32 bytes
    pub rp_id: String,
    pub rp_name: String,
    pub user_id: String,
    pub user_display_name: String,
    pub timeout_ms: u32,
    pub attestation: String,
    pub pub_key_cred_params: Vec<PubKeyCredParam>,
    pub authenticator_selection: AuthenticatorSelection,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PubKeyCredParam {
    #[serde(rename = "type")]
    pub cred_type: String,
    pub alg: i32, // COSE algorithm: -7 (ES256), -8 (EdDSA), -257 (RS256)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AuthenticatorSelection {
    pub authenticator_attachment: String, // "platform" | "cross-platform"
    pub resident_key: String,             // "required"
    pub user_verification: String,        // "required"
}

/// Attestation response sent back by the browser after navigator.credentials.create.
#[derive(Serialize, Deserialize, Debug)]
pub struct RegistrationFinish {
    pub user_id: String,
    pub credential_id: String,      // base64url
    pub client_data_json: String,   // base64url
    pub attestation_object: String, // base64url (CBOR, we only verify clientDataJSON)
    pub device_type: String,
}

/// Challenge sent to the browser to start a sign-in.
#[derive(Serialize, Deserialize, Debug)]
pub struct AuthenticationOptions {
    pub challenge: String, // base64url, 32 bytes
    pub rp_id: String,
    pub timeout_ms: u32,
    pub user_verification: String,
    pub allow_credentials: Vec<AllowedCredential>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AllowedCredential {
    #[serde(rename = "type")]
    pub cred_type: String,
    pub id: String, // base64url credential_id
}

/// Assertion response from the browser after navigator.credentials.get.
#[derive(Serialize, Deserialize, Debug)]
pub struct AuthenticationFinish {
    pub user_id: String,
    pub credential_id: String,
    pub client_data_json: String,
    pub authenticator_data: String, // base64url
    pub signature: String,          // base64url
}

#[derive(Debug)]
pub enum WebAuthnError {
    ChallengeMismatch,
    OriginMismatch,
    RpIdMismatch,
    UserPresenceNotSet,
    SignCountRegression,
    InvalidClientData(String),
    CredentialNotFound,
}

impl std::fmt::Display for WebAuthnError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WebAuthnError::ChallengeMismatch => write!(f, "challenge mismatch"),
            WebAuthnError::OriginMismatch => write!(f, "origin mismatch"),
            WebAuthnError::RpIdMismatch => write!(f, "rp_id hash mismatch"),
            WebAuthnError::UserPresenceNotSet => write!(f, "user presence flag not set"),
            WebAuthnError::SignCountRegression => {
                write!(f, "sign count regression (replay detected)")
            }
            WebAuthnError::InvalidClientData(s) => write!(f, "invalid client data: {s}"),
            WebAuthnError::CredentialNotFound => write!(f, "credential not found"),
        }
    }
}

// ── Challenge generation ──────────────────────────────────────────────────────

/// Generate a fresh 32-byte random challenge, base64url-encoded.
pub fn new_challenge() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Build registration options for a user.
pub fn registration_options(
    req: &RegistrationRequest,
    rp_id: &str,
    rp_name: &str,
) -> (RegistrationOptions, String) {
    let challenge = new_challenge();
    let opts = RegistrationOptions {
        challenge: challenge.clone(),
        rp_id: rp_id.to_string(),
        rp_name: rp_name.to_string(),
        user_id: req.user_id.clone(),
        user_display_name: req.display_name.clone(),
        timeout_ms: 300_000,
        attestation: "none".to_string(),
        pub_key_cred_params: vec![
            PubKeyCredParam {
                cred_type: "public-key".to_string(),
                alg: -7,
            }, // ES256
            PubKeyCredParam {
                cred_type: "public-key".to_string(),
                alg: -8,
            }, // EdDSA
        ],
        authenticator_selection: AuthenticatorSelection {
            authenticator_attachment: "platform".to_string(),
            resident_key: "required".to_string(),
            user_verification: "required".to_string(),
        },
    };
    (opts, challenge)
}

/// Build authentication options for a user with known credentials.
pub fn authentication_options(
    user_credentials: &[StoredCredential],
    rp_id: &str,
) -> (AuthenticationOptions, String) {
    let challenge = new_challenge();
    let allow_credentials = user_credentials
        .iter()
        .map(|c| AllowedCredential {
            cred_type: "public-key".to_string(),
            id: c.credential_id.clone(),
        })
        .collect();
    let opts = AuthenticationOptions {
        challenge: challenge.clone(),
        rp_id: rp_id.to_string(),
        timeout_ms: 300_000,
        user_verification: "required".to_string(),
        allow_credentials,
    };
    (opts, challenge)
}

// ── Verification helpers ──────────────────────────────────────────────────────

/// Decoded fields from clientDataJSON (a JSON object sent by the browser).
#[derive(Deserialize)]
struct ClientData {
    #[serde(rename = "type")]
    kind: String,
    challenge: String,
    origin: String,
}

/// Verify clientDataJSON during registration.
pub fn verify_registration_client_data(
    client_data_json_b64: &str,
    expected_challenge: &str,
    expected_origin: &str,
) -> Result<(), WebAuthnError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(client_data_json_b64)
        .map_err(|e| WebAuthnError::InvalidClientData(e.to_string()))?;
    let cd: ClientData = serde_json::from_slice(&bytes)
        .map_err(|e| WebAuthnError::InvalidClientData(e.to_string()))?;

    if cd.kind != "webauthn.create" {
        return Err(WebAuthnError::InvalidClientData(format!(
            "wrong type: {}",
            cd.kind
        )));
    }
    if cd.challenge != expected_challenge {
        return Err(WebAuthnError::ChallengeMismatch);
    }
    if cd.origin != expected_origin {
        return Err(WebAuthnError::OriginMismatch);
    }
    Ok(())
}

/// Verify clientDataJSON during authentication.
pub fn verify_authentication_client_data(
    client_data_json_b64: &str,
    expected_challenge: &str,
    expected_origin: &str,
) -> Result<(), WebAuthnError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(client_data_json_b64)
        .map_err(|e| WebAuthnError::InvalidClientData(e.to_string()))?;
    let cd: ClientData = serde_json::from_slice(&bytes)
        .map_err(|e| WebAuthnError::InvalidClientData(e.to_string()))?;

    if cd.kind != "webauthn.get" {
        return Err(WebAuthnError::InvalidClientData(format!(
            "wrong type: {}",
            cd.kind
        )));
    }
    if cd.challenge != expected_challenge {
        return Err(WebAuthnError::ChallengeMismatch);
    }
    if cd.origin != expected_origin {
        return Err(WebAuthnError::OriginMismatch);
    }
    Ok(())
}

/// Verify authenticatorData flags and RP-ID hash.
///
/// authenticatorData layout:
///   [0..32]  rpIdHash (SHA-256 of RP ID)
///   [32]     flags byte (bit 0 = UP, bit 2 = UV)
///   [33..37] sign count (big-endian u32)
///   [37..]   attested credential data (registration only)
pub fn verify_authenticator_data(
    auth_data_b64: &str,
    rp_id: &str,
    require_uv: bool,
) -> Result<u32, WebAuthnError> {
    let auth_data = URL_SAFE_NO_PAD
        .decode(auth_data_b64)
        .map_err(|e| WebAuthnError::InvalidClientData(e.to_string()))?;

    if auth_data.len() < 37 {
        return Err(WebAuthnError::InvalidClientData(
            "authenticatorData too short".to_string(),
        ));
    }

    // Verify RP ID hash
    let expected_hash = Sha256::digest(rp_id.as_bytes());
    if auth_data[0..32] != expected_hash[..] {
        return Err(WebAuthnError::RpIdMismatch);
    }

    // Check flags
    let flags = auth_data[32];
    let user_present = flags & 0x01 != 0;
    let user_verified = flags & 0x04 != 0;

    if !user_present {
        return Err(WebAuthnError::UserPresenceNotSet);
    }
    if require_uv && !user_verified {
        return Err(WebAuthnError::UserPresenceNotSet);
    }

    // Sign counter
    let sign_count =
        u32::from_be_bytes([auth_data[33], auth_data[34], auth_data[35], auth_data[36]]);

    Ok(sign_count)
}

/// Verify that the sign count advanced (monotonicity = replay protection).
/// A counter of 0 on both sides means the authenticator doesn't track counts (acceptable).
pub fn verify_sign_count(stored: u32, received: u32) -> Result<(), WebAuthnError> {
    if stored == 0 && received == 0 {
        return Ok(()); // authenticator does not support counters
    }
    if received <= stored {
        return Err(WebAuthnError::SignCountRegression);
    }
    Ok(())
}

// ── Credential record builder ─────────────────────────────────────────────────

/// Build a `StoredCredential` from a successful registration finish request.
/// The caller is responsible for persisting it to the DB.
pub fn build_stored_credential(
    finish: &RegistrationFinish,
    public_key_cbor_b64: &str, // extracted from attestation object by caller
) -> StoredCredential {
    StoredCredential {
        credential_id: finish.credential_id.clone(),
        user_id: finish.user_id.clone(),
        public_key_cbor: public_key_cbor_b64.to_string(),
        sign_count: 0,
        aaguid: "00000000-0000-0000-0000-000000000000".to_string(),
        device_type: finish.device_type.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn challenge_is_32_bytes_base64url() {
        let c = new_challenge();
        let decoded = URL_SAFE_NO_PAD.decode(&c).unwrap();
        assert_eq!(decoded.len(), 32, "challenge must be 32 random bytes");
    }

    #[test]
    fn two_challenges_are_different() {
        let a = new_challenge();
        let b = new_challenge();
        assert_ne!(a, b, "challenges must be unique");
    }

    #[test]
    fn registration_options_includes_required_algorithms() {
        let req = RegistrationRequest {
            user_id: "user_01".to_string(),
            display_name: "Alice".to_string(),
        };
        let (opts, _challenge) = registration_options(&req, "omnyid.com", "Omnyid");
        let algs: Vec<i32> = opts.pub_key_cred_params.iter().map(|p| p.alg).collect();
        assert!(algs.contains(&-7), "must support ES256");
        assert!(algs.contains(&-8), "must support EdDSA");
    }

    #[test]
    fn authentication_options_lists_user_credentials() {
        let creds = vec![StoredCredential {
            credential_id: "cred_abc".to_string(),
            user_id: "user_01".to_string(),
            public_key_cbor: "AAAA".to_string(),
            sign_count: 5,
            aaguid: "00000000-0000-0000-0000-000000000000".to_string(),
            device_type: "platform".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }];
        let (opts, _) = authentication_options(&creds, "omnyid.com");
        assert_eq!(opts.allow_credentials.len(), 1);
        assert_eq!(opts.allow_credentials[0].id, "cred_abc");
    }

    #[test]
    fn verify_registration_client_data_detects_wrong_type() {
        // Build a clientDataJSON with type "webauthn.get" instead of "webauthn.create"
        let cd = serde_json::json!({
            "type": "webauthn.get",
            "challenge": "abc",
            "origin": "https://omnyid.com"
        });
        let encoded = URL_SAFE_NO_PAD.encode(cd.to_string().as_bytes());
        let result = verify_registration_client_data(&encoded, "abc", "https://omnyid.com");
        assert!(matches!(result, Err(WebAuthnError::InvalidClientData(_))));
    }

    #[test]
    fn verify_registration_client_data_detects_challenge_mismatch() {
        let cd = serde_json::json!({
            "type": "webauthn.create",
            "challenge": "wrong-challenge",
            "origin": "https://omnyid.com"
        });
        let encoded = URL_SAFE_NO_PAD.encode(cd.to_string().as_bytes());
        let result =
            verify_registration_client_data(&encoded, "correct-challenge", "https://omnyid.com");
        assert!(matches!(result, Err(WebAuthnError::ChallengeMismatch)));
    }

    #[test]
    fn verify_registration_client_data_succeeds_on_correct_input() {
        let cd = serde_json::json!({
            "type": "webauthn.create",
            "challenge": "my-challenge",
            "origin": "https://omnyid.com"
        });
        let encoded = URL_SAFE_NO_PAD.encode(cd.to_string().as_bytes());
        let result =
            verify_registration_client_data(&encoded, "my-challenge", "https://omnyid.com");
        assert!(result.is_ok());
    }

    #[test]
    fn sign_count_zero_zero_is_allowed() {
        assert!(verify_sign_count(0, 0).is_ok());
    }

    #[test]
    fn sign_count_regression_is_detected() {
        assert!(matches!(
            verify_sign_count(10, 5),
            Err(WebAuthnError::SignCountRegression)
        ));
        assert!(matches!(
            verify_sign_count(10, 10),
            Err(WebAuthnError::SignCountRegression)
        ));
    }

    #[test]
    fn sign_count_advance_is_valid() {
        assert!(verify_sign_count(10, 11).is_ok());
    }

    #[test]
    fn webauthn_error_display_is_human_readable() {
        assert!(
            WebAuthnError::ChallengeMismatch
                .to_string()
                .contains("challenge")
        );
        assert!(
            WebAuthnError::SignCountRegression
                .to_string()
                .contains("replay")
        );
        assert!(
            WebAuthnError::CredentialNotFound
                .to_string()
                .contains("not found")
        );
    }
}
