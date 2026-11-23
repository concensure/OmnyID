//! audit_chain.rs — cryptographic chaining for AFP thread integrity.
//!
//! Each message's `prev_hash` = SHA-256 of the canonical JSON of the
//! previous message in the thread (ordered by timestamp ASC, then id ASC).
//! This makes tampering or deletion detectable by clients.

use sha2::{Digest, Sha256};

/// Compute the SHA-256 of a message's canonical JSON (sorted keys).
pub fn message_hash(msg_json: &serde_json::Value) -> String {
    // Canonical = compact JSON with keys sorted. Use a map with BTreeMap
    // ordering by re-serializing through serde_json with sorted keys.
    let canonical = canonical_json(msg_json);
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    hex::encode(hasher.finalize())
}

fn canonical_json(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Object(map) => {
            let mut sorted: Vec<_> = map.iter().collect();
            sorted.sort_by_key(|(k, _)| k.as_str());
            let inner = sorted
                .iter()
                .map(|(k, v)| format!("\"{}\":{}", k, canonical_json(v)))
                .collect::<Vec<_>>()
                .join(",");
            format!("{{{inner}}}")
        }
        serde_json::Value::Array(arr) => {
            let inner = arr.iter().map(canonical_json).collect::<Vec<_>>().join(",");
            format!("[{inner}]")
        }
        other => other.to_string(),
    }
}

/// Verify a chain of messages. Returns `Ok(())` if the chain is intact,
/// or `Err(broken_at_index)` with the index of the first broken link.
pub fn verify_chain(messages: &[serde_json::Value]) -> Result<(), usize> {
    if messages.is_empty() {
        return Ok(());
    }
    // First message may have no prev_hash — that's fine.
    let mut prev_hash: Option<String> = None;
    for (i, msg) in messages.iter().enumerate() {
        let recorded = msg
            .get("prev_hash")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        if i > 0 {
            if recorded != prev_hash {
                return Err(i);
            }
        }
        // Compute hash of this message (without the prev_hash field itself)
        let mut stripped = msg.clone();
        if let Some(obj) = stripped.as_object_mut() {
            obj.remove("prev_hash");
        }
        prev_hash = Some(message_hash(&stripped));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonical_json_sorts_keys() {
        let v = json!({"z": 1, "a": 2, "m": 3});
        let c = canonical_json(&v);
        assert_eq!(c, r#"{"a":2,"m":3,"z":1}"#);
    }

    #[test]
    fn message_hash_is_deterministic() {
        let v = json!({"id": "abc", "type": "note"});
        assert_eq!(message_hash(&v), message_hash(&v));
    }

    #[test]
    fn verify_chain_empty_is_ok() {
        assert!(verify_chain(&[]).is_ok());
    }

    #[test]
    fn verify_chain_single_no_prev_hash_is_ok() {
        let msg = json!({"id": "1", "type": "note"});
        assert!(verify_chain(&[msg]).is_ok());
    }

    #[test]
    fn verify_chain_detects_broken_link() {
        let msg1 = json!({"id": "1", "type": "note"});
        let msg2 = json!({"id": "2", "type": "note", "prev_hash": "wrong_hash"});
        assert_eq!(verify_chain(&[msg1, msg2]), Err(1));
    }

    #[test]
    fn verify_chain_valid_two_messages() {
        let msg1 = json!({"id": "1", "type": "note"});
        let hash1 = message_hash(&msg1);
        let msg2 = json!({"id": "2", "type": "note", "prev_hash": hash1});
        assert!(verify_chain(&[msg1, msg2]).is_ok());
    }
}
