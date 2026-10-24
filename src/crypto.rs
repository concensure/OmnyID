use std::collections::BTreeMap;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, OsRng, Payload, rand_core::RngCore},
};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde_json::{Map, Value};

pub fn sign_message(msg: &mut crate::message::AFPMessage, private_key_bytes: &[u8; 32]) -> String {
    let signing_key = SigningKey::from_bytes(private_key_bytes);
    let public_key_hex = hex::encode(signing_key.verifying_key().to_bytes());
    let signable = signable_payload(msg);
    let signature = signing_key.sign(signable.as_bytes());
    let encoded_signature = STANDARD.encode(signature.to_bytes());
    msg.signature = format!("ed25519:{public_key_hex}:{encoded_signature}");
    msg.signature.clone()
}

pub fn verify_signature(msg: &crate::message::AFPMessage) -> bool {
    let Some((public_key_hex, signature_b64)) = parse_signature_parts(&msg.signature) else {
        return false;
    };

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

    let sig_bytes = match STANDARD.decode(signature_b64) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let signature_array: [u8; 64] = match sig_bytes.try_into() {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let signature = Signature::from_bytes(&signature_array);

    let signable = signable_payload(msg);
    if verifying_key
        .verify(signable.as_bytes(), &signature)
        .is_ok()
    {
        return true;
    }

    // Signatures created before timestamp canonicalisation used the timestamp
    // text exactly as supplied. Continue to accept those while the original
    // representation is still available (for example, before persistence).
    let exact_signable = exact_timestamp_signable_payload(msg);
    if verifying_key
        .verify(exact_signable.as_bytes(), &signature)
        .is_ok()
    {
        return true;
    }

    // Backward compatibility: older AFP signatures incorrectly included the
    // storage hint in the signed bytes. Accept that legacy form for existing
    // messages, but do not generate new signatures with it.
    let legacy_signable = legacy_signable_payload(msg);
    verifying_key
        .verify(legacy_signable.as_bytes(), &signature)
        .is_ok()
}

pub fn signature_public_key_hex(signature: &str) -> Option<&str> {
    let (public_key_hex, _) = parse_signature_parts(signature)?;
    Some(public_key_hex)
}

pub fn signature_matches_public_key(signature: &str, expected_public_key_hex: &str) -> bool {
    let expected = expected_public_key_hex.trim();
    if expected.is_empty() {
        return false;
    }
    signature_public_key_hex(signature).is_some_and(|actual| actual.eq_ignore_ascii_case(expected))
}

pub fn has_verifiable_signature(signature: &str) -> bool {
    parse_signature_parts(signature).is_some()
}

pub fn encrypt_content(content: &Value, aad: &Value, shared_key_bytes: &[u8; 32]) -> Value {
    let cipher = XChaCha20Poly1305::new_from_slice(shared_key_bytes)
        .expect("shared encryption key must be 32 bytes");
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);

    let plaintext = canonical_json_string(content);
    let associated_data = canonical_json_string(aad);
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce_bytes),
            Payload {
                msg: plaintext.as_bytes(),
                aad: associated_data.as_bytes(),
            },
        )
        .expect("encryption should succeed with valid inputs");

    serde_json::json!({
        "scheme": "omnyid-envelope-v1",
        "algorithm": "xchacha20poly1305-ietf",
        "nonce": STANDARD.encode(nonce_bytes),
        "ciphertext": STANDARD.encode(ciphertext),
    })
}

pub fn decrypt_content(
    encryption: &Value,
    aad: &Value,
    shared_key_bytes: &[u8; 32],
) -> Option<Value> {
    if !is_supported_encryption_envelope(encryption) {
        return None;
    }

    let nonce_b64 = encryption.get("nonce")?.as_str()?;
    let ciphertext_b64 = encryption.get("ciphertext")?.as_str()?;
    let nonce_vec = STANDARD.decode(nonce_b64).ok()?;
    let ciphertext = STANDARD.decode(ciphertext_b64).ok()?;
    let nonce_bytes: [u8; 24] = nonce_vec.try_into().ok()?;

    let cipher = XChaCha20Poly1305::new_from_slice(shared_key_bytes).ok()?;
    let associated_data = canonical_json_string(aad);
    let plaintext = cipher
        .decrypt(
            XNonce::from_slice(&nonce_bytes),
            Payload {
                msg: ciphertext.as_ref(),
                aad: associated_data.as_bytes(),
            },
        )
        .ok()?;

    serde_json::from_slice(&plaintext).ok()
}

fn recipient_aead_key(
    shared_secret: &[u8; 32],
    ephemeral_public_key: &[u8; 32],
    recipient_public_key: &[u8; 32],
    recipient_key_id: &str,
) -> Result<[u8; 32], String> {
    if recipient_key_id.is_empty() || recipient_key_id.len() > 180 {
        return Err("recipient key id is invalid".to_string());
    }
    let mut key_context = Vec::with_capacity(64 + recipient_key_id.len());
    key_context.extend_from_slice(ephemeral_public_key);
    key_context.extend_from_slice(recipient_public_key);
    key_context.extend_from_slice(recipient_key_id.as_bytes());
    crate::post_quantum::hkdf_sha256(
        shared_secret,
        b"omnyid-recipient-x25519-v1",
        &key_context,
        32,
    )
    .try_into()
    .map_err(|_| "recipient key derivation failed".to_string())
}

/// Encrypt content directly to one recipient-held X25519 key.
///
/// The server creates an ephemeral key for this object and never receives the
/// recipient private key.  This is intentionally distinct from the legacy
/// server-wide shared-key envelope: possession of the homeserver environment
/// is not sufficient to decrypt the resulting ciphertext later.
pub fn encrypt_content_for_recipient(
    content: &Value,
    aad: &Value,
    recipient_public_key_hex: &str,
    recipient_key_id: &str,
) -> Result<Value, String> {
    use x25519_dalek::{PublicKey, StaticSecret};

    let recipient_bytes: [u8; 32] = hex::decode(recipient_public_key_hex.trim())
        .map_err(|_| "recipient encryption key must be 32-byte hex".to_string())?
        .try_into()
        .map_err(|_| "recipient encryption key must be 32-byte hex".to_string())?;
    let recipient_public = PublicKey::from(recipient_bytes);
    let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let shared = ephemeral_secret.diffie_hellman(&recipient_public);
    if !shared.was_contributory() {
        return Err("recipient encryption key is not contributory".to_string());
    }

    let aead_key = recipient_aead_key(
        shared.as_bytes(),
        ephemeral_public.as_bytes(),
        recipient_public.as_bytes(),
        recipient_key_id,
    )?;
    let cipher = XChaCha20Poly1305::new_from_slice(&aead_key)
        .map_err(|_| "recipient encryption setup failed".to_string())?;
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);
    let plaintext = canonical_json_string(content);
    let associated_data = canonical_json_string(aad);
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce_bytes),
            Payload {
                msg: plaintext.as_bytes(),
                aad: associated_data.as_bytes(),
            },
        )
        .map_err(|_| "recipient encryption failed".to_string())?;

    Ok(serde_json::json!({
        "scheme": "omnyid-envelope-v1",
        "algorithm": "xchacha20poly1305-ietf",
        "mode": "recipient-x25519-v1",
        "recipient_key_id": recipient_key_id,
        "ephemeral_public_key": STANDARD.encode(ephemeral_public.as_bytes()),
        "nonce": STANDARD.encode(nonce_bytes),
        "ciphertext": STANDARD.encode(ciphertext),
        "aad": STANDARD.encode(associated_data.as_bytes()),
    }))
}

#[cfg(test)]
fn decrypt_content_for_recipient(
    encryption: &Value,
    recipient_private_key: &[u8; 32],
) -> Option<Value> {
    use x25519_dalek::{PublicKey, StaticSecret};

    let ephemeral_public: [u8; 32] = STANDARD
        .decode(encryption.get("ephemeral_public_key")?.as_str()?)
        .ok()?
        .try_into()
        .ok()?;
    let nonce: [u8; 24] = STANDARD
        .decode(encryption.get("nonce")?.as_str()?)
        .ok()?
        .try_into()
        .ok()?;
    let ciphertext = STANDARD
        .decode(encryption.get("ciphertext")?.as_str()?)
        .ok()?;
    let aad = STANDARD.decode(encryption.get("aad")?.as_str()?).ok()?;
    let secret = StaticSecret::from(*recipient_private_key);
    let recipient_public = PublicKey::from(&secret);
    let ephemeral_public = PublicKey::from(ephemeral_public);
    let shared = secret.diffie_hellman(&ephemeral_public);
    if !shared.was_contributory() {
        return None;
    }
    let aead_key = recipient_aead_key(
        shared.as_bytes(),
        ephemeral_public.as_bytes(),
        recipient_public.as_bytes(),
        encryption.get("recipient_key_id")?.as_str()?,
    )
    .ok()?;
    let plaintext = XChaCha20Poly1305::new_from_slice(&aead_key)
        .ok()?
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad: &aad,
            },
        )
        .ok()?;
    serde_json::from_slice(&plaintext).ok()
}

pub fn is_supported_encryption_envelope(encryption: &Value) -> bool {
    encryption
        .get("scheme")
        .and_then(Value::as_str)
        .is_some_and(|scheme| scheme == "omnyid-envelope-v1")
        && encryption
            .get("algorithm")
            .and_then(Value::as_str)
            .is_some_and(|algorithm| algorithm == "xchacha20poly1305-ietf")
        && encryption.get("nonce").and_then(Value::as_str).is_some()
        && encryption
            .get("ciphertext")
            .and_then(Value::as_str)
            .is_some()
}

pub fn signable_payload(msg: &crate::message::AFPMessage) -> String {
    signable_payload_with_timestamp(msg, canonical_signed_timestamp(&msg.timestamp))
}

fn exact_timestamp_signable_payload(msg: &crate::message::AFPMessage) -> String {
    signable_payload_with_timestamp(msg, msg.timestamp.clone())
}

fn canonical_signed_timestamp(timestamp: &str) -> String {
    let parsed = chrono::DateTime::parse_from_rfc3339(timestamp)
        .or_else(|_| chrono::DateTime::parse_from_str(timestamp, "%Y-%m-%d %H:%M:%S%.f%#z"));
    parsed
        .ok()
        .and_then(|value| {
            let nanoseconds = value.with_timezone(&chrono::Utc).timestamp_nanos_opt()?;
            let microseconds =
                nanoseconds.div_euclid(1_000) + i64::from(nanoseconds.rem_euclid(1_000) >= 500);
            chrono::DateTime::from_timestamp_micros(microseconds)
        })
        .map(|value| value.to_rfc3339_opts(chrono::SecondsFormat::Micros, true))
        .unwrap_or_else(|| timestamp.to_string())
}

fn signable_payload_with_timestamp(msg: &crate::message::AFPMessage, timestamp: String) -> String {
    let mut parts = Vec::with_capacity(16);
    parts.push(msg.protocol.clone());
    parts.push(msg.id.clone());
    parts.push(msg.thread_id.clone());
    parts.push(msg.parent_id.clone().unwrap_or_default());
    parts.push(msg.from.clone());
    parts.push(canonical_json_string(&serde_json::json!(msg.to)));
    parts.push(timestamp);
    parts.push(msg.r#type.clone());
    parts.push(msg.kind.clone().unwrap_or_default());
    parts.push(msg.subtype.clone().unwrap_or_default());
    parts.push(canonical_json_string(&msg.content));
    parts.push(
        msg.metadata
            .as_ref()
            .map(canonical_json_string)
            .unwrap_or_else(|| "{}".to_string()),
    );
    parts.push(
        msg.encryption
            .as_ref()
            .map(canonical_json_string)
            .unwrap_or_else(|| "{}".to_string()),
    );
    parts.push(canonical_json_string(&Value::Array(msg.views.clone())));
    parts.push(canonical_json_string(&Value::Array(msg.references.clone())));
    parts.push(canonical_json_string(&Value::Array(
        msg.attachments.clone(),
    )));
    parts.join("\n")
}

fn legacy_signable_payload(msg: &crate::message::AFPMessage) -> String {
    let mut parts = exact_timestamp_signable_payload(msg)
        .split('\n')
        .map(str::to_string)
        .collect::<Vec<_>>();
    parts.push(msg.store_in_relational.to_string());
    parts.join("\n")
}

/// Derive the 32-byte key used to encrypt BYOK API keys at rest (GAP-049).
/// Uses HKDF-SHA256 with a provider-specific info tag so each provider's
/// key domain is independent.
pub fn byok_api_key_kek(provider: &str) -> [u8; 32] {
    let root_key_hex =
        crate::secret_manager::read_process_secret_trimmed("OMNYID_ENCRYPTION_KEY_HEX")
            .or_else(|| {
                crate::secret_manager::read_process_secret_trimmed("OMNYID_SIGNING_KEY_HEX")
            })
            .unwrap_or_default();
    let root_key = hex::decode(root_key_hex.trim()).unwrap_or_else(|_| vec![0u8; 32]);
    let info = format!("omnyid-byok-api-key:{provider}");
    let derived = crate::post_quantum::hkdf_sha256(&root_key, b"", info.as_bytes(), 32);
    let mut key = [0u8; 32];
    key.copy_from_slice(&derived);
    key
}

/// Encrypt an arbitrary plaintext string with XChaCha20-Poly1305 (GAP-062).
/// Returns a base64(nonce || ciphertext) string suitable for DB storage.
/// The caller supplies a 32-byte symmetric key (e.g. derived from OMNYID_ENCRYPTION_KEY_HEX).
pub fn encrypt_secret(plaintext: &str, key: &[u8; 32]) -> String {
    let cipher = XChaCha20Poly1305::new_from_slice(key).expect("32-byte key");
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce_bytes), plaintext.as_bytes())
        .expect("encrypt_secret: encryption should succeed");
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    STANDARD.encode(combined)
}

/// Decrypt a base64(nonce || ciphertext) string produced by `encrypt_secret`.
/// Returns `None` if decryption fails (wrong key, tampered ciphertext).
pub fn decrypt_secret(encoded: &str, key: &[u8; 32]) -> Option<String> {
    let combined = STANDARD.decode(encoded).ok()?;
    if combined.len() < 24 {
        return None;
    }
    let (nonce_bytes, ciphertext) = combined.split_at(24);
    let cipher = XChaCha20Poly1305::new_from_slice(key).expect("32-byte key");
    let plaintext = cipher
        .decrypt(XNonce::from_slice(nonce_bytes), ciphertext)
        .ok()?;
    String::from_utf8(plaintext).ok()
}

pub fn canonical_json_string(value: &Value) -> String {
    canonicalize_value(value).to_string()
}

fn canonicalize_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sorted = BTreeMap::new();
            for (key, value) in map {
                sorted.insert(key.clone(), canonicalize_value(value));
            }
            let mut ordered = Map::new();
            for (key, value) in sorted {
                ordered.insert(key, value);
            }
            Value::Object(ordered)
        }
        Value::Array(values) => Value::Array(values.iter().map(canonicalize_value).collect()),
        _ => value.clone(),
    }
}

fn parse_signature_parts(signature: &str) -> Option<(&str, &str)> {
    let stripped = signature.strip_prefix("ed25519:")?;
    let mut pieces = stripped.splitn(2, ':');
    let public_key_hex = pieces.next()?;
    let signature_b64 = pieces.next()?;
    if public_key_hex.is_empty() || signature_b64.is_empty() {
        None
    } else {
        Some((public_key_hex, signature_b64))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        STANDARD, SigningKey, canonical_json_string, decrypt_content,
        decrypt_content_for_recipient, encrypt_content, encrypt_content_for_recipient,
        has_verifiable_signature, is_supported_encryption_envelope, legacy_signable_payload,
        recipient_aead_key, sign_message, signable_payload, signature_matches_public_key,
        signature_public_key_hex, verify_signature,
    };
    use crate::message::AFPMessage;
    use base64::Engine as _;
    use ed25519_dalek::Signer;

    fn sample_message() -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_123".to_string(),
            thread_id: "thread_123".to_string(),
            parent_id: Some("msg_parent".to_string()),
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["agent:peer@omnyid.local".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "task".to_string(),
            kind: Some("task".to_string()),
            supertags: vec![],
            subtype: Some("status".to_string()),
            content: serde_json::json!({"b": 2, "a": 1}),
            metadata: Some(serde_json::json!({"domain": "ops", "confidence": 0.97})),
            signature: String::new(),
            encryption: Some(serde_json::json!({"z": true, "a": "first"})),
            views: vec![serde_json::json!({"format": "system", "content": {"z": 1, "a": 2}})],
            references: vec![serde_json::json!({"target": "thread_other", "type": "thread"})],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        }
    }

    #[test]
    fn canonical_json_sorts_keys() {
        let value = serde_json::json!({"z": 1, "a": {"d": 4, "b": 2}});
        assert_eq!(
            canonical_json_string(&value),
            r#"{"a":{"b":2,"d":4},"z":1}"#
        );
    }

    #[test]
    fn sign_and_verify_round_trip() {
        let mut message = sample_message();
        let key = [7u8; 32];
        let signature = sign_message(&mut message, &key);
        assert!(has_verifiable_signature(&signature));
        assert!(verify_signature(&message));
    }

    #[test]
    fn signature_survives_postgres_timestamp_text_normalisation() {
        let mut message = sample_message();
        message.timestamp = "2026-03-20T00:00:00.987654321+00:00".to_string();
        sign_message(&mut message, &[7u8; 32]);

        message.timestamp = "2026-03-20 00:00:00.987654+00".to_string();
        assert!(verify_signature(&message));

        message.timestamp = "2026-03-20 00:00:01.987654+00".to_string();
        assert!(!verify_signature(&message));

        message.timestamp = "2026-03-20T00:00:02.987654789Z".to_string();
        sign_message(&mut message, &[7u8; 32]);
        message.timestamp = "2026-03-20 00:00:02.987655+00".to_string();
        assert!(verify_signature(&message));
    }

    #[test]
    fn signature_breaks_on_payload_change() {
        let mut message = sample_message();
        let key = [9u8; 32];
        sign_message(&mut message, &key);
        let before = signable_payload(&message);
        message.content = serde_json::json!({"a": 999});
        let after = signable_payload(&message);
        assert_ne!(before, after);
        assert!(!verify_signature(&message));
    }

    #[test]
    fn signature_public_key_hex_extracts_embedded_key() {
        let mut message = sample_message();
        let key = [9u8; 32];
        let signature = sign_message(&mut message, &key);
        let signing_key = SigningKey::from_bytes(&key);
        let expected = hex::encode(signing_key.verifying_key().to_bytes());

        assert_eq!(
            signature_public_key_hex(&signature),
            Some(expected.as_str())
        );
    }

    #[test]
    fn signature_matches_public_key_requires_exact_trusted_key() {
        let mut message = sample_message();
        let key = [11u8; 32];
        let signature = sign_message(&mut message, &key);
        let signing_key = SigningKey::from_bytes(&key);
        let expected = hex::encode(signing_key.verifying_key().to_bytes());

        assert!(signature_matches_public_key(&signature, &expected));
        assert!(!signature_matches_public_key(&signature, "deadbeef"));
    }

    #[test]
    fn signable_payload_ignores_storage_hint() {
        let mut message = sample_message();
        let before = signable_payload(&message);
        message.store_in_relational = true;
        let after = signable_payload(&message);
        assert_eq!(before, after);
    }

    #[test]
    fn verify_signature_accepts_legacy_storage_hint_payload() {
        let mut message = sample_message();
        let key = [11u8; 32];
        let signing_key = SigningKey::from_bytes(&key);
        let public_key_hex = hex::encode(signing_key.verifying_key().to_bytes());
        let legacy_signature = signing_key.sign(legacy_signable_payload(&message).as_bytes());
        message.signature = format!(
            "ed25519:{public_key_hex}:{}",
            STANDARD.encode(legacy_signature.to_bytes())
        );
        assert!(verify_signature(&message));
    }

    #[test]
    fn encryption_round_trip_restores_plaintext() {
        let key = [3u8; 32];
        let content = serde_json::json!({"secret": "hello", "count": 2});
        let aad = serde_json::json!({
            "thread_id": "thread_123",
            "type": "task",
            "subtype": "status",
            "metadata": {"domain": "ops"}
        });

        let envelope = encrypt_content(&content, &aad, &key);
        let decrypted = decrypt_content(&envelope, &aad, &key).expect("decryption should succeed");

        assert_eq!(decrypted, content);
    }

    #[test]
    fn recipient_envelope_only_opens_with_intended_private_key() {
        use x25519_dalek::{PublicKey, StaticSecret};

        let recipient_secret = StaticSecret::from([7_u8; 32]);
        let recipient_public = PublicKey::from(&recipient_secret);
        let content = serde_json::json!({"private": "for one account"});
        let aad = serde_json::json!({"owner_user_id": "user_a", "message_id": "m1"});
        let envelope = encrypt_content_for_recipient(
            &content,
            &aad,
            &hex::encode(recipient_public.as_bytes()),
            "key_a",
        )
        .expect("recipient envelope");

        assert_eq!(
            decrypt_content_for_recipient(&envelope, &recipient_secret.to_bytes()),
            Some(content)
        );
        assert!(decrypt_content_for_recipient(&envelope, &[9_u8; 32]).is_none());
        assert_eq!(
            envelope.get("mode").and_then(serde_json::Value::as_str),
            Some("recipient-x25519-v1")
        );
    }

    #[test]
    fn recipient_key_derivation_matches_browser_contract_vector() {
        let shared = [1_u8; 32];
        let ephemeral = [2_u8; 32];
        let recipient = [3_u8; 32];
        assert_eq!(
            hex::encode(
                recipient_aead_key(&shared, &ephemeral, &recipient, "vendor-test-key")
                    .expect("derived key")
            ),
            "85b2b7b403145c1ed0eeecb51aa228472855d18d1cad9902ab6e99da78941eb0"
        );
    }

    #[test]
    fn encryption_envelope_is_supported_when_fields_exist() {
        let envelope = serde_json::json!({
            "scheme": "omnyid-envelope-v1",
            "algorithm": "xchacha20poly1305-ietf",
            "nonce": "abc",
            "ciphertext": "def"
        });

        assert!(is_supported_encryption_envelope(&envelope));
    }
}
