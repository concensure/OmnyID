//! Strict derivation compatible with existing MCP credential encryption.
//! Backend errors and malformed primary keys must never trigger fallback.
use crate::secret_manager::SecretBackend;

pub(super) async fn load(backend: &dyn SecretBackend) -> Result<[u8; 32], &'static str> {
    let primary = backend
        .get("OMNYID_ENCRYPTION_KEY_HEX")
        .await
        .map_err(|_| "tool_credential_service_unavailable")?;
    let value = match primary {
        Some(value) => value,
        None => backend
            .get("OMNYID_SIGNING_KEY_HEX")
            .await
            .map_err(|_| "tool_credential_service_unavailable")?
            .ok_or("tool_credential_key_missing")?,
    };
    let value = value.trim();
    if value.len() != 64 {
        return Err("tool_credential_key_invalid");
    }
    let root = hex::decode(value).map_err(|_| "tool_credential_key_invalid")?;
    if root.iter().all(|b| *b == 0) {
        return Err("tool_credential_key_invalid");
    }
    let derived = crate::post_quantum::hkdf_sha256(&root, b"omnyid-tool-connection-kek", b"v1", 32);
    let mut key = [0; 32];
    key.copy_from_slice(&derived);
    Ok(key)
}
