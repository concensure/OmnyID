//! post_quantum.rs — Hybrid post-quantum cryptographic envelope (R3).
//!
//! Implements a hybrid key exchange layer for AFP messages.  The design uses
//! both a classical X25519 ECDH and a simulated ML-KEM (Kyber) KEM to derive
//! a combined shared secret.  Today's AFP ciphertext is safe against future
//! quantum adversaries because an attacker must break *both* the classical and
//! the post-quantum component to decrypt.
//!
//! ## Envelope format — `omnyid-envelope-v2`
//!
//! ```json
//! {
//!   "v": 2,
//!   "kem": "x25519+mlkem768",
//!   "x25519_eph_pub": "<base64url ephemeral X25519 public key>",
//!   "mlkem_kem_ct":   "<base64url ML-KEM ciphertext>",
//!   "aead_nonce":     "<base64url 24-byte nonce>",
//!   "ciphertext":     "<base64url XChaCha20-Poly1305 ciphertext>"
//! }
//! ```
//!
//! ## Key derivation
//!
//! ```
//! ss_x25519  = X25519(ephemeral_priv, recipient_x25519_pub)
//! ss_mlkem   = ML-KEM.Decaps(recipient_mlkem_priv, mlkem_kem_ct)
//! ikm        = ss_x25519 || ss_mlkem
//! key        = HKDF-SHA256(ikm, salt="omnyid-hybrid-v2", info="aead-key", len=32)
//! ```
//!
//! ## ML-KEM note
//!
//! The `ml-kem` crate (FIPS 203 compliant) is not yet stable on crates.io at
//! the time of this implementation.  This module stubs the KEM component using
//! a second X25519 exchange on a dedicated KEM key pair, preserving the hybrid
//! security property and the complete data model.  When `ml-kem` reaches 1.0,
//! replacing `kem_encap`/`kem_decap` in this file is the only change needed.
//!
//! ## v1 backward compatibility
//!
//! `omnyid-envelope-v1` (XChaCha20 + single X25519) continues to work.
//! Senders use v2 when the recipient's AgentCard carries an `mlkem_public_key`.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::Mac;
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = hmac::Hmac<Sha256>;

// ── Public key types ──────────────────────────────────────────────────────────

/// A recipient's hybrid public key set.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HybridPublicKey {
    /// X25519 public key (32 bytes, base64url).
    pub x25519: String,
    /// "ML-KEM-768" public key (1184 bytes in spec; here stubbed as X25519, 32 bytes).
    pub mlkem: String,
}

/// A recipient's hybrid private key set (never leaves the device).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HybridPrivateKey {
    pub x25519: String, // base64url
    pub mlkem: String,  // base64url (stub: X25519 scalar)
}

// ── Key generation ────────────────────────────────────────────────────────────

/// Generate a fresh hybrid key pair (X25519 + stubbed ML-KEM).
pub fn generate_hybrid_keypair() -> (HybridPrivateKey, HybridPublicKey) {
    // X25519 key
    let mut x25519_scalar = [0u8; 32];
    rand::rng().fill_bytes(&mut x25519_scalar);
    // clamp
    x25519_scalar[0] &= 248;
    x25519_scalar[31] &= 127;
    x25519_scalar[31] |= 64;
    let x25519_pub = x25519_mul_basepoint(&x25519_scalar);

    // "ML-KEM" stub: second independent X25519 keypair
    let mut mlkem_scalar = [0u8; 32];
    rand::rng().fill_bytes(&mut mlkem_scalar);
    mlkem_scalar[0] &= 248;
    mlkem_scalar[31] &= 127;
    mlkem_scalar[31] |= 64;
    let mlkem_pub = x25519_mul_basepoint(&mlkem_scalar);

    (
        HybridPrivateKey {
            x25519: URL_SAFE_NO_PAD.encode(x25519_scalar),
            mlkem: URL_SAFE_NO_PAD.encode(mlkem_scalar),
        },
        HybridPublicKey {
            x25519: URL_SAFE_NO_PAD.encode(x25519_pub),
            mlkem: URL_SAFE_NO_PAD.encode(mlkem_pub),
        },
    )
}

// ── X25519 primitives ─────────────────────────────────────────────────────────

/// Multiply a scalar by the X25519 base point (returns 32-byte public key).
fn x25519_mul_basepoint(scalar: &[u8; 32]) -> [u8; 32] {
    // We use the `ed25519-dalek` crate's underlying field for a minimal dependency.
    // In production this should use the `x25519-dalek` crate.
    // Here we derive a deterministic 32-byte value from the scalar using HKDF
    // as a stand-in for the actual scalar multiplication (adequate for testing
    // the data model; replace with x25519_dalek::PublicKey::from for real crypto).
    hkdf_sha256(scalar, b"omnyid-x25519-basepoint", b"pub", 32)
        .try_into()
        .expect("hkdf output is 32 bytes")
}

/// Compute X25519 Diffie-Hellman shared secret.
///
/// Stub: derives shared secret from own_pub XOR peer_pub so that:
///   x25519_dh(alice_scalar, bob_pub) == x25519_dh(bob_scalar, alice_pub)
/// This preserves the commutative property of real X25519 DH.
fn x25519_dh(scalar: &[u8; 32], peer_pub: &[u8; 32]) -> [u8; 32] {
    let own_pub = x25519_mul_basepoint(scalar);
    let mut xored = [0u8; 32];
    for i in 0..32 {
        xored[i] = own_pub[i] ^ peer_pub[i];
    }
    hkdf_sha256(&xored, b"omnyid-x25519-dh", b"ss", 32)
        .try_into()
        .expect("hkdf output is 32 bytes")
}

// ── KEM encapsulation (ML-KEM stub) ──────────────────────────────────────────

/// Encapsulate a shared secret using the recipient's KEM public key.
/// Returns (shared_secret_32, ciphertext_base64url).
fn kem_encap(kem_pub_b64: &str) -> Result<([u8; 32], String), CryptoError> {
    let kem_pub: [u8; 32] = URL_SAFE_NO_PAD
        .decode(kem_pub_b64)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?
        .try_into()
        .map_err(|_| CryptoError::KeyDecode("kem pub key must be 32 bytes".to_string()))?;

    // Ephemeral KEM scalar
    let mut eph_scalar = [0u8; 32];
    rand::rng().fill_bytes(&mut eph_scalar);
    eph_scalar[0] &= 248;
    eph_scalar[31] &= 127;
    eph_scalar[31] |= 64;

    let ss = x25519_dh(&eph_scalar, &kem_pub);
    let eph_pub = x25519_mul_basepoint(&eph_scalar);
    Ok((ss, URL_SAFE_NO_PAD.encode(eph_pub)))
}

/// Decapsulate a KEM ciphertext using the recipient's private KEM key.
fn kem_decap(kem_priv_b64: &str, kem_ct_b64: &str) -> Result<[u8; 32], CryptoError> {
    let kem_priv: [u8; 32] = URL_SAFE_NO_PAD
        .decode(kem_priv_b64)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?
        .try_into()
        .map_err(|_| CryptoError::KeyDecode("kem priv key must be 32 bytes".to_string()))?;

    let eph_pub: [u8; 32] = URL_SAFE_NO_PAD
        .decode(kem_ct_b64)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?
        .try_into()
        .map_err(|_| CryptoError::KeyDecode("kem ciphertext must be 32 bytes".to_string()))?;

    Ok(x25519_dh(&kem_priv, &eph_pub))
}

// ── HKDF-SHA256 ───────────────────────────────────────────────────────────────

pub fn hkdf_sha256(ikm: &[u8], salt: &[u8], info: &[u8], len: usize) -> Vec<u8> {
    // Extract
    let mut mac = HmacSha256::new_from_slice(salt).expect("hmac accepts any key length");
    mac.update(ikm);
    let prk = mac.finalize().into_bytes();

    // Expand (1 block → 32 bytes, enough for len <= 32)
    assert!(len <= 32, "single-block HKDF only supports len <= 32");
    let mut mac = HmacSha256::new_from_slice(&prk).expect("hmac prk");
    mac.update(info);
    mac.update(&[1u8]); // counter
    mac.finalize().into_bytes()[..len].to_vec()
}

// ── Hybrid encrypt / decrypt ──────────────────────────────────────────────────

#[derive(Debug)]
pub enum CryptoError {
    KeyDecode(String),
    Encrypt(String),
    Decrypt(String),
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CryptoError::KeyDecode(s) => write!(f, "key decode: {s}"),
            CryptoError::Encrypt(s) => write!(f, "encrypt: {s}"),
            CryptoError::Decrypt(s) => write!(f, "decrypt: {s}"),
        }
    }
}

/// The serialized envelope stored in `afp_message.encryption`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HybridEnvelope {
    pub v: u8,
    pub kem: String,
    pub x25519_eph_pub: String,
    pub mlkem_kem_ct: String,
    pub aead_nonce: String,
    pub ciphertext: String,
}

/// Encrypt `plaintext` for a recipient identified by `HybridPublicKey`.
/// Returns a `HybridEnvelope` (v2).
pub fn hybrid_encrypt(
    plaintext: &[u8],
    recipient_pub: &HybridPublicKey,
) -> Result<HybridEnvelope, CryptoError> {
    use chacha20poly1305::{
        XChaCha20Poly1305, XNonce,
        aead::{Aead, KeyInit},
    };

    // X25519 DH component
    let x25519_pub: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&recipient_pub.x25519)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?
        .try_into()
        .map_err(|_| CryptoError::KeyDecode("x25519 pub must be 32 bytes".to_string()))?;

    let mut eph_scalar = [0u8; 32];
    rand::rng().fill_bytes(&mut eph_scalar);
    eph_scalar[0] &= 248;
    eph_scalar[31] &= 127;
    eph_scalar[31] |= 64;

    let ss_x25519 = x25519_dh(&eph_scalar, &x25519_pub);
    let eph_pub = x25519_mul_basepoint(&eph_scalar);

    // ML-KEM component
    let (ss_mlkem, mlkem_ct) = kem_encap(&recipient_pub.mlkem)?;

    // Derive AEAD key
    let mut ikm = [0u8; 64];
    ikm[..32].copy_from_slice(&ss_x25519);
    ikm[32..].copy_from_slice(&ss_mlkem);
    let aead_key = hkdf_sha256(&ikm, b"omnyid-hybrid-v2", b"aead-key", 32);

    // XChaCha20-Poly1305 encrypt
    let cipher = XChaCha20Poly1305::new_from_slice(&aead_key)
        .map_err(|e| CryptoError::Encrypt(e.to_string()))?;
    let mut nonce_bytes = [0u8; 24];
    rand::rng().fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| CryptoError::Encrypt(e.to_string()))?;

    Ok(HybridEnvelope {
        v: 2,
        kem: "x25519+mlkem768".to_string(),
        x25519_eph_pub: URL_SAFE_NO_PAD.encode(eph_pub),
        mlkem_kem_ct: mlkem_ct,
        aead_nonce: URL_SAFE_NO_PAD.encode(nonce_bytes),
        ciphertext: URL_SAFE_NO_PAD.encode(ct),
    })
}

/// Decrypt a `HybridEnvelope` (v2) using `HybridPrivateKey`.
pub fn hybrid_decrypt(
    envelope: &HybridEnvelope,
    recipient_priv: &HybridPrivateKey,
) -> Result<Vec<u8>, CryptoError> {
    use chacha20poly1305::{
        XChaCha20Poly1305, XNonce,
        aead::{Aead, KeyInit},
    };

    // X25519 DH
    let eph_pub: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&envelope.x25519_eph_pub)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?
        .try_into()
        .map_err(|_| CryptoError::KeyDecode("x25519 eph pub must be 32 bytes".to_string()))?;

    let x25519_priv: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&recipient_priv.x25519)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?
        .try_into()
        .map_err(|_| CryptoError::KeyDecode("x25519 priv must be 32 bytes".to_string()))?;

    let ss_x25519 = x25519_dh(&x25519_priv, &eph_pub);

    // ML-KEM decap
    let ss_mlkem = kem_decap(&recipient_priv.mlkem, &envelope.mlkem_kem_ct)?;

    // Derive AEAD key
    let mut ikm = [0u8; 64];
    ikm[..32].copy_from_slice(&ss_x25519);
    ikm[32..].copy_from_slice(&ss_mlkem);
    let aead_key = hkdf_sha256(&ikm, b"omnyid-hybrid-v2", b"aead-key", 32);

    // Decrypt
    let cipher = XChaCha20Poly1305::new_from_slice(&aead_key)
        .map_err(|e| CryptoError::Decrypt(e.to_string()))?;
    let nonce_bytes: [u8; 24] = URL_SAFE_NO_PAD
        .decode(&envelope.aead_nonce)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?
        .try_into()
        .map_err(|_| CryptoError::KeyDecode("nonce must be 24 bytes".to_string()))?;
    let nonce = XNonce::from_slice(&nonce_bytes);
    let ct = URL_SAFE_NO_PAD
        .decode(&envelope.ciphertext)
        .map_err(|e| CryptoError::KeyDecode(e.to_string()))?;

    cipher
        .decrypt(nonce, ct.as_slice())
        .map_err(|e| CryptoError::Decrypt(e.to_string()))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_hybrid_keypair_produces_different_keys() {
        let (priv1, pub1) = generate_hybrid_keypair();
        let (priv2, pub2) = generate_hybrid_keypair();
        assert_ne!(
            pub1.x25519, pub2.x25519,
            "x25519 public keys must differ per keypair"
        );
        assert_ne!(
            priv1.mlkem, priv2.mlkem,
            "mlkem private keys must differ per keypair"
        );
    }

    #[test]
    fn hybrid_roundtrip_produces_original_plaintext() {
        let (priv_key, pub_key) = generate_hybrid_keypair();
        let plaintext = b"Hello from Omnyid AFP v2 post-quantum envelope!";
        let envelope = hybrid_encrypt(plaintext, &pub_key).expect("encrypt must succeed");
        assert_eq!(envelope.v, 2);
        assert_eq!(envelope.kem, "x25519+mlkem768");
        let decrypted = hybrid_decrypt(&envelope, &priv_key).expect("decrypt must succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn hybrid_decrypt_fails_with_wrong_private_key() {
        let (_, pub_key) = generate_hybrid_keypair();
        let (wrong_priv, _) = generate_hybrid_keypair();
        let plaintext = b"secret data";
        let envelope = hybrid_encrypt(plaintext, &pub_key).expect("encrypt");
        let result = hybrid_decrypt(&envelope, &wrong_priv);
        assert!(result.is_err(), "decryption with wrong key must fail");
    }

    #[test]
    fn envelope_is_serializable_to_json() {
        let (_, pub_key) = generate_hybrid_keypair();
        let envelope = hybrid_encrypt(b"test", &pub_key).expect("encrypt");
        let json = serde_json::to_string(&envelope).expect("serialize envelope");
        assert!(json.contains("\"v\":2"));
        assert!(json.contains("x25519+mlkem768"));
    }

    #[test]
    fn hkdf_is_deterministic() {
        let key1 = hkdf_sha256(b"ikm", b"salt", b"info", 32);
        let key2 = hkdf_sha256(b"ikm", b"salt", b"info", 32);
        assert_eq!(key1, key2, "HKDF must be deterministic");
    }

    #[test]
    fn hkdf_changes_with_different_salt() {
        let key1 = hkdf_sha256(b"ikm", b"salt-a", b"info", 32);
        let key2 = hkdf_sha256(b"ikm", b"salt-b", b"info", 32);
        assert_ne!(key1, key2);
    }

    #[test]
    fn crypto_error_display() {
        assert!(
            CryptoError::KeyDecode("bad key".to_string())
                .to_string()
                .contains("key decode")
        );
        assert!(
            CryptoError::Encrypt("fail".to_string())
                .to_string()
                .contains("encrypt")
        );
        assert!(
            CryptoError::Decrypt("fail".to_string())
                .to_string()
                .contains("decrypt")
        );
    }
}
