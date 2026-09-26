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

// ── CBOR / COSE key parsing (GAP-004) ────────────────────────────────────────

/// Parsed COSE public key (RFC 8152).
#[derive(Debug)]
pub enum CoseKey {
    Es256 { x: [u8; 32], y: [u8; 32] },
    EdDsa { public: [u8; 32] },
}

/// Extract the `authData` bytes from a base64url-encoded WebAuthn attestation object.
///
/// The attestation object is a CBOR map: `{fmt: text, attStmt: map, authData: bytes}`.
/// We do a minimal scan for the `authData` text key without a full CBOR library.
pub fn extract_auth_data(attestation_object_b64: &str) -> Result<Vec<u8>, WebAuthnError> {
    let cbor = URL_SAFE_NO_PAD
        .decode(attestation_object_b64)
        .map_err(|e| WebAuthnError::InvalidClientData(format!("base64 decode: {e}")))?;
    cbor_find_bytes_by_text_key(&cbor, "authData")
        .map(|s| s.to_vec())
        .ok_or_else(|| {
            WebAuthnError::InvalidClientData("authData not found in attestation_object".into())
        })
}

/// Locate a text-keyed bytes value in a CBOR map without a full parser.
/// Handles the specific subset produced by WebAuthn attestation objects.
fn cbor_find_bytes_by_text_key<'a>(cbor: &'a [u8], target_key: &str) -> Option<&'a [u8]> {
    let key_bytes = target_key.as_bytes();
    let mut i = 1usize; // skip map header byte
    let map_len = cbor.first().map(|b| b & 0x1f)? as usize;
    for _ in 0..map_len {
        if i >= cbor.len() {
            break;
        }
        // Read text string key
        let (key_start, key_len) = cbor_read_text_header(&cbor[i..])?;
        let key_data_start = i + key_start;
        let key_data_end = key_data_start + key_len;
        if key_data_end > cbor.len() {
            break;
        }
        let is_match = cbor[key_data_start..key_data_end] == *key_bytes;
        i = key_data_end;
        // Read value
        if i >= cbor.len() {
            break;
        }
        let (val_header, val_len) = cbor_read_bytes_header(&cbor[i..])?;
        i += val_header;
        let val_end = i + val_len;
        if val_end > cbor.len() {
            break;
        }
        if is_match {
            return Some(&cbor[i..val_end]);
        }
        i = val_end;
    }
    None
}

fn cbor_read_text_header(buf: &[u8]) -> Option<(usize, usize)> {
    let first = *buf.first()?;
    if first & 0xe0 != 0x60 {
        return None;
    } // must be major type 3 (text)
    cbor_read_len(first, buf)
}

fn cbor_read_bytes_header(buf: &[u8]) -> Option<(usize, usize)> {
    let first = *buf.first()?;
    // Accept major type 2 (bytes) or skip over any type to advance cursor
    if first & 0xe0 == 0x40 {
        cbor_read_len(first, buf)
    } else if first & 0xe0 == 0x60 {
        // text — skip it
        cbor_read_len(first, buf)
    } else if first & 0xe0 == 0xa0 {
        // nested map — we can't easily skip; return None
        None
    } else {
        None
    }
}

fn cbor_read_len(first: u8, buf: &[u8]) -> Option<(usize, usize)> {
    let additional = first & 0x1f;
    match additional {
        0..=23 => Some((1, additional as usize)),
        24 => buf.get(1).map(|&n| (2, n as usize)),
        25 => {
            let n = u16::from_be_bytes(buf.get(1..3)?.try_into().ok()?);
            Some((3, n as usize))
        }
        _ => None,
    }
}

/// Extract the COSE public key from authData (starting at offset 37 for assertions,
/// or with attested credential data at offset 37 for registration).
///
/// For registration authData the AT flag (bit 6 of flags byte at offset 32) must be set.
/// Layout after sign_count (byte 37 in registration):
///   AAGUID (16 bytes) | credId len (2 bytes BE) | credId (N bytes) | COSE key (CBOR)
pub fn extract_cose_key_from_auth_data(auth_data: &[u8]) -> Result<CoseKey, WebAuthnError> {
    if auth_data.len() < 37 {
        return Err(WebAuthnError::InvalidClientData(
            "authData too short".into(),
        ));
    }
    let flags = auth_data[32];
    let at_flag = flags & 0x40 != 0;
    if !at_flag {
        return Err(WebAuthnError::InvalidClientData(
            "AT flag not set — no credential data".into(),
        ));
    }
    // Skip: rpIdHash(32) + flags(1) + signCount(4) + AAGUID(16) = 53
    if auth_data.len() < 55 {
        return Err(WebAuthnError::InvalidClientData(
            "authData too short for credential data".into(),
        ));
    }
    let cred_id_len = u16::from_be_bytes([auth_data[53], auth_data[54]]) as usize;
    let cose_start = 55 + cred_id_len;
    if cose_start >= auth_data.len() {
        return Err(WebAuthnError::InvalidClientData(
            "authData too short for COSE key".into(),
        ));
    }
    parse_cose_key(&auth_data[cose_start..])
}

/// Parse a COSE key from its CBOR encoding.
/// Supports ES256 (-7, P-256 ECDSA) and EdDSA (-8, Ed25519).
pub fn parse_cose_key(cbor: &[u8]) -> Result<CoseKey, WebAuthnError> {
    // Scan the CBOR map for integer keys 3 (alg), -2 (x), -3 (y).
    // CBOR integer encoding: positive n → n, negative n → 0x20 | ((-n)-1)
    // So: alg=3 → 0x03, -2 → 0x21, -3 → 0x22, -7 → 0x26, -8 → 0x27
    let alg = cbor_find_int_value(cbor, 3)
        .ok_or_else(|| WebAuthnError::InvalidClientData("COSE key missing alg".into()))?;
    match alg {
        -7 => {
            // ES256 — P-256
            let x = cbor_find_bytes32(cbor, -2).ok_or_else(|| {
                WebAuthnError::InvalidClientData("COSE ES256 key missing x".into())
            })?;
            let y = cbor_find_bytes32(cbor, -3).ok_or_else(|| {
                WebAuthnError::InvalidClientData("COSE ES256 key missing y".into())
            })?;
            Ok(CoseKey::Es256 { x, y })
        }
        -8 => {
            // EdDSA — Ed25519
            let public = cbor_find_bytes32(cbor, -2).ok_or_else(|| {
                WebAuthnError::InvalidClientData("COSE EdDSA key missing x".into())
            })?;
            Ok(CoseKey::EdDsa { public })
        }
        _ => Err(WebAuthnError::InvalidClientData(format!(
            "unsupported COSE algorithm {alg}"
        ))),
    }
}

/// Find the value of an integer-keyed entry in a CBOR integer map.
fn cbor_find_int_value(cbor: &[u8], key: i64) -> Option<i64> {
    let key_byte: u8 = if key >= 0 {
        key as u8
    } else {
        0x20 | ((-key - 1) as u8)
    };
    let map_items = (cbor.first()? & 0x1f) as usize;
    let mut i = 1usize;
    for _ in 0..map_items {
        if i >= cbor.len() {
            break;
        }
        let kb = cbor[i];
        i += 1;
        // Value: might be a small int or a bytes
        if kb == key_byte {
            // Read int value
            return cbor_read_cbor_int(&cbor[i..]);
        } else {
            // Skip value
            i += cbor_skip_value(&cbor[i..])?;
        }
    }
    None
}

fn cbor_find_bytes32(cbor: &[u8], key: i64) -> Option<[u8; 32]> {
    let key_byte: u8 = if key >= 0 {
        key as u8
    } else {
        0x20 | ((-key - 1) as u8)
    };
    let map_items = (cbor.first()? & 0x1f) as usize;
    let mut i = 1usize;
    for _ in 0..map_items {
        if i >= cbor.len() {
            break;
        }
        let kb = cbor[i];
        i += 1;
        if kb == key_byte {
            // Next should be bytes(32): 0x58 0x20 [32 bytes]
            if cbor.get(i).copied()? == 0x58 && cbor.get(i + 1).copied()? == 0x20 {
                let start = i + 2;
                let end = start + 32;
                return cbor.get(start..end)?.try_into().ok();
            }
            return None;
        } else {
            i += cbor_skip_value(&cbor[i..])?;
        }
    }
    None
}

fn cbor_read_cbor_int(buf: &[u8]) -> Option<i64> {
    let b = *buf.first()?;
    match b >> 5 {
        0 => Some((b & 0x1f) as i64),        // positive int, small
        1 => Some(-((b & 0x1f) as i64) - 1), // negative int, small
        _ => None,
    }
}

fn cbor_skip_value(buf: &[u8]) -> Option<usize> {
    let b = *buf.first()?;
    let major = b >> 5;
    let additional = b & 0x1f;
    match (major, additional) {
        (0 | 1, 0..=23) => Some(1),                       // small int
        (0 | 1, 24) => Some(2),                           // 1-byte int
        (2 | 3, 0..=23) => Some(1 + additional as usize), // short bytes/text
        (2 | 3, 24) => {
            let len = *buf.get(1)? as usize;
            Some(2 + len)
        }
        (2 | 3, 25) => {
            let len = u16::from_be_bytes(buf.get(1..3)?.try_into().ok()?) as usize;
            Some(3 + len)
        }
        (5, 0..=23) => {
            // nested map — rough skip: 1 header + 2 * n items each ~2 bytes
            // This is approximate; caller should not rely on nested map skipping
            Some(1)
        }
        _ => Some(1),
    }
}

// ── Signature verification (GAP-004) ─────────────────────────────────────────

/// Verify a WebAuthn assertion signature.
///
/// The signed message is: `authenticatorData || SHA-256(clientDataJSON bytes)`
pub fn verify_assertion_signature(
    auth_data_b64: &str,
    client_data_json_b64: &str,
    signature_b64: &str,
    cred: &StoredCredential,
) -> Result<(), WebAuthnError> {
    let auth_data = URL_SAFE_NO_PAD
        .decode(auth_data_b64)
        .map_err(|e| WebAuthnError::InvalidClientData(format!("bad auth_data base64: {e}")))?;
    let client_data_bytes = URL_SAFE_NO_PAD
        .decode(client_data_json_b64)
        .map_err(|e| WebAuthnError::InvalidClientData(format!("bad client_data base64: {e}")))?;
    let signature = URL_SAFE_NO_PAD
        .decode(signature_b64)
        .map_err(|e| WebAuthnError::InvalidClientData(format!("bad signature base64: {e}")))?;

    let client_data_hash: [u8; 32] = Sha256::digest(&client_data_bytes).into();
    let mut signed_msg = auth_data;
    signed_msg.extend_from_slice(&client_data_hash);

    let public_key_cbor = URL_SAFE_NO_PAD
        .decode(&cred.public_key_cbor)
        .map_err(|e| WebAuthnError::InvalidClientData(format!("bad stored key base64: {e}")))?;
    let cose_key = parse_cose_key(&public_key_cbor)?;

    match cose_key {
        CoseKey::Es256 { x, y } => verify_es256(&signed_msg, &signature, &x, &y),
        CoseKey::EdDsa { public } => verify_eddsa(&signed_msg, &signature, &public),
    }
}

fn verify_es256(
    msg: &[u8],
    der_sig: &[u8],
    x: &[u8; 32],
    y: &[u8; 32],
) -> Result<(), WebAuthnError> {
    use p256::EncodedPoint;
    use p256::ecdsa::{Signature, VerifyingKey, signature::Verifier};
    let point = EncodedPoint::from_affine_coordinates(x.into(), y.into(), false);
    let vk = VerifyingKey::from_encoded_point(&point)
        .map_err(|_| WebAuthnError::InvalidClientData("invalid P-256 public key".into()))?;
    let sig = Signature::from_der(der_sig)
        .map_err(|_| WebAuthnError::InvalidClientData("invalid ES256 DER signature".into()))?;
    vk.verify(msg, &sig)
        .map_err(|_| WebAuthnError::InvalidClientData("ES256 signature verification failed".into()))
}

fn verify_eddsa(msg: &[u8], sig_bytes: &[u8], public: &[u8; 32]) -> Result<(), WebAuthnError> {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let vk = VerifyingKey::from_bytes(public)
        .map_err(|_| WebAuthnError::InvalidClientData("invalid Ed25519 public key".into()))?;
    let sig = Signature::from_slice(sig_bytes)
        .map_err(|_| WebAuthnError::InvalidClientData("invalid Ed25519 signature".into()))?;
    vk.verify(msg, &sig)
        .map_err(|_| WebAuthnError::InvalidClientData("EdDSA signature verification failed".into()))
}

// ── Credential record builder ─────────────────────────────────────────────────

/// Build a `StoredCredential` from a successful registration finish request.
///
/// Extracts and stores the COSE public key from the attestation object's authData.
/// The `public_key_cbor` field is stored as base64url for later use in signature verification.
pub fn build_stored_credential(
    finish: &RegistrationFinish,
    public_key_cbor_b64: &str,
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
    fn build_stored_credential_uses_supplied_public_key_cbor() {
        let finish = RegistrationFinish {
            user_id: "user_01".to_string(),
            credential_id: "cred_abc".to_string(),
            client_data_json: "client-data-json-b64".to_string(),
            attestation_object: "attestation-object-b64".to_string(),
            device_type: "platform".to_string(),
        };

        let credential = build_stored_credential(&finish, "public-key-cbor-b64");

        assert_eq!(credential.public_key_cbor, "public-key-cbor-b64");
        assert_ne!(credential.public_key_cbor, finish.client_data_json);
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
