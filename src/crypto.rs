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

    let signable = signable_payload(msg);
    let sig_bytes = match STANDARD.decode(signature_b64) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let signature_array: [u8; 64] = match sig_bytes.try_into() {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let signature = Signature::from_bytes(&signature_array);

    verifying_key
        .verify(signable.as_bytes(), &signature)
        .is_ok()
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
    let mut parts = Vec::with_capacity(15);
    parts.push(msg.protocol.clone());
    parts.push(msg.id.clone());
    parts.push(msg.thread_id.clone());
    parts.push(msg.parent_id.clone().unwrap_or_default());
    parts.push(msg.from.clone());
    parts.push(canonical_json_string(&serde_json::json!(msg.to)));
    parts.push(msg.timestamp.clone());
    parts.push(msg.r#type.clone());
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
    parts.push(msg.store_in_relational.to_string());
    parts.join("\n")
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
        canonical_json_string, decrypt_content, encrypt_content, has_verifiable_signature,
        is_supported_encryption_envelope, sign_message, signable_payload, verify_signature,
    };
    use crate::message::AFPMessage;

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
            subtype: Some("status".to_string()),
            content: serde_json::json!({"b": 2, "a": 1}),
            metadata: Some(serde_json::json!({"domain": "ops", "confidence": 0.97})),
            signature: String::new(),
            encryption: Some(serde_json::json!({"z": true, "a": "first"})),
            views: vec![serde_json::json!({"format": "system", "content": {"z": 1, "a": 2}})],
            references: vec![serde_json::json!({"target": "thread_other", "type": "thread"})],
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
