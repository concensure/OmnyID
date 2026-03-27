//! secret_manager.rs — Pluggable secret storage backend.
//!
//! Replaces env-var credential storage with an auditable backend.
//!
//! Backends:
//!   - Env (default): reads from process environment variables
//!   - Vault: HashiCorp Vault KV v2 (requires OMNYID_VAULT_URL + OMNYID_VAULT_TOKEN)
//!   - OracleVault: Oracle Cloud Vault via OCID (requires OCI credentials)
//!
//! Select backend with `OMNYID_SECRET_MANAGER_BACKEND=env|vault|oracle_vault`.
//!
//! All backends implement the `SecretBackend` trait so the rest of the application
//! calls `get_secret("OMNYID_SIGNING_KEY_HEX")` regardless of where it lives.

use std::collections::HashMap;
use std::sync::Arc;

// ── Trait ─────────────────────────────────────────────────────────────────────

#[async_trait::async_trait]
pub trait SecretBackend: Send + Sync {
    /// Retrieve a named secret.  Returns `None` if the secret does not exist.
    async fn get(&self, name: &str) -> Result<Option<String>, SecretError>;

    /// Store or update a named secret.  Not supported by all backends.
    async fn set(&self, name: &str, value: &str) -> Result<(), SecretError>;
}

#[derive(Debug)]
pub enum SecretError {
    NotSupported(String),
    Backend(String),
    Serialization(String),
}

impl std::fmt::Display for SecretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SecretError::NotSupported(s) => write!(f, "not supported: {s}"),
            SecretError::Backend(s) => write!(f, "backend error: {s}"),
            SecretError::Serialization(s) => write!(f, "serialization error: {s}"),
        }
    }
}

// ── Env backend (default) ─────────────────────────────────────────────────────

/// Reads secrets from process environment variables.  In-memory overrides can
/// be injected at startup for testing.
pub struct EnvSecretBackend {
    overrides: HashMap<String, String>,
}

impl EnvSecretBackend {
    pub fn new() -> Self {
        Self {
            overrides: HashMap::new(),
        }
    }

    pub fn with_overrides(overrides: HashMap<String, String>) -> Self {
        Self { overrides }
    }
}

impl Default for EnvSecretBackend {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl SecretBackend for EnvSecretBackend {
    async fn get(&self, name: &str) -> Result<Option<String>, SecretError> {
        if let Some(v) = self.overrides.get(name) {
            return Ok(Some(v.clone()));
        }
        Ok(std::env::var(name).ok())
    }

    async fn set(&self, _name: &str, _value: &str) -> Result<(), SecretError> {
        Err(SecretError::NotSupported(
            "EnvSecretBackend is read-only; set env vars before starting the process".to_string(),
        ))
    }
}

// ── Vault backend ─────────────────────────────────────────────────────────────

/// HashiCorp Vault KV v2 backend.
///
/// Environment:
///   OMNYID_VAULT_URL   — e.g. http://vault:8200
///   OMNYID_VAULT_TOKEN — Vault root or app-role token
///   OMNYID_VAULT_MOUNT — KV mount path (default: "secret")
pub struct VaultSecretBackend {
    url: String,
    token: String,
    mount: String,
    client: reqwest::Client,
}

impl VaultSecretBackend {
    pub fn from_env() -> Result<Self, SecretError> {
        let url = std::env::var("OMNYID_VAULT_URL")
            .map_err(|_| SecretError::Backend("OMNYID_VAULT_URL not set".to_string()))?;
        let token = std::env::var("OMNYID_VAULT_TOKEN")
            .map_err(|_| SecretError::Backend("OMNYID_VAULT_TOKEN not set".to_string()))?;
        let mount = std::env::var("OMNYID_VAULT_MOUNT").unwrap_or_else(|_| "secret".to_string());
        Ok(Self {
            url,
            token,
            mount,
            client: reqwest::Client::new(),
        })
    }
}

#[async_trait::async_trait]
impl SecretBackend for VaultSecretBackend {
    async fn get(&self, name: &str) -> Result<Option<String>, SecretError> {
        let url = format!(
            "{}/v1/{}/data/omnyid/{}",
            self.url.trim_end_matches('/'),
            self.mount,
            name,
        );
        let resp = self
            .client
            .get(&url)
            .header("X-Vault-Token", &self.token)
            .send()
            .await
            .map_err(|e| SecretError::Backend(e.to_string()))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SecretError::Backend(format!("{status}: {body}")));
        }
        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| SecretError::Serialization(e.to_string()))?;
        let value = json["data"]["data"][name].as_str().map(|s| s.to_string());
        Ok(value)
    }

    async fn set(&self, name: &str, value: &str) -> Result<(), SecretError> {
        let url = format!(
            "{}/v1/{}/data/omnyid/{}",
            self.url.trim_end_matches('/'),
            self.mount,
            name,
        );
        let body = serde_json::json!({"data": {name: value}});
        let resp = self
            .client
            .post(&url)
            .header("X-Vault-Token", &self.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| SecretError::Backend(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(SecretError::Backend(format!("{status}: {text}")));
        }
        Ok(())
    }
}

// ── Oracle Vault backend (stub) ───────────────────────────────────────────────

/// Oracle Cloud Vault backend (OCID-based).
/// Implements the same `SecretBackend` trait; delegates to Oracle Secrets Service REST API.
/// Requires: OCI_VAULT_OCID, OCI_SECRET_COMPARTMENT_OCID, OCI_REGION env vars.
///
/// This stub returns `NotSupported` until OCI SDK credentials are configured.
/// It exists so the binary compiles and the backend selection path is complete.
pub struct OracleVaultBackend {
    vault_ocid: String,
    compartment_ocid: String,
    region: String,
    client: reqwest::Client,
}

impl OracleVaultBackend {
    pub fn from_env() -> Result<Self, SecretError> {
        let vault_ocid = std::env::var("OCI_VAULT_OCID")
            .map_err(|_| SecretError::Backend("OCI_VAULT_OCID not set".to_string()))?;
        let compartment_ocid = std::env::var("OCI_SECRET_COMPARTMENT_OCID")
            .map_err(|_| SecretError::Backend("OCI_SECRET_COMPARTMENT_OCID not set".to_string()))?;
        let region = std::env::var("OCI_REGION").unwrap_or_else(|_| "us-ashburn-1".to_string());
        Ok(Self {
            vault_ocid,
            compartment_ocid,
            region,
            client: reqwest::Client::new(),
        })
    }
}

#[async_trait::async_trait]
impl SecretBackend for OracleVaultBackend {
    async fn get(&self, name: &str) -> Result<Option<String>, SecretError> {
        // OCI Vault REST API — list secrets in compartment, find by name, retrieve bundle.
        // Full OCI request signing (Authorization: Signature) is required.
        // Returning a clear error rather than silently falling back to env.
        let _ = (
            &self.vault_ocid,
            &self.compartment_ocid,
            &self.region,
            &self.client,
            name,
        );
        Err(SecretError::NotSupported(
            "OracleVaultBackend: OCI request signing not yet implemented; \
             set OMNYID_SECRET_MANAGER_BACKEND=env or =vault"
                .to_string(),
        ))
    }

    async fn set(&self, name: &str, _value: &str) -> Result<(), SecretError> {
        let _ = name;
        Err(SecretError::NotSupported(
            "OracleVaultBackend: write path not yet implemented".to_string(),
        ))
    }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/// Build the appropriate backend from the `OMNYID_SECRET_MANAGER_BACKEND` env var.
///
/// Values: `env` (default), `vault`, `oracle_vault`
pub fn build_backend() -> Arc<dyn SecretBackend> {
    match std::env::var("OMNYID_SECRET_MANAGER_BACKEND")
        .unwrap_or_else(|_| "env".to_string())
        .as_str()
    {
        "vault" => match VaultSecretBackend::from_env() {
            Ok(b) => {
                tracing::info!("secret_manager: using Vault backend");
                Arc::new(b)
            }
            Err(e) => {
                tracing::warn!(
                    "secret_manager: Vault backend init failed ({e}), falling back to env"
                );
                Arc::new(EnvSecretBackend::new())
            }
        },
        "oracle_vault" => match OracleVaultBackend::from_env() {
            Ok(b) => {
                tracing::info!("secret_manager: using Oracle Vault backend");
                Arc::new(b)
            }
            Err(e) => {
                tracing::warn!(
                    "secret_manager: Oracle Vault init failed ({e}), falling back to env"
                );
                Arc::new(EnvSecretBackend::new())
            }
        },
        _ => {
            tracing::info!("secret_manager: using env backend (default)");
            Arc::new(EnvSecretBackend::new())
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn env_backend_reads_overrides() {
        let mut map = HashMap::new();
        map.insert("MY_SECRET".to_string(), "s3cr3t".to_string());
        let backend = EnvSecretBackend::with_overrides(map);
        let val = backend.get("MY_SECRET").await.unwrap();
        assert_eq!(val, Some("s3cr3t".to_string()));
    }

    #[tokio::test]
    async fn env_backend_returns_none_for_missing() {
        let backend = EnvSecretBackend::new();
        // Use a key that definitely does not exist
        let val = backend.get("__OMNYID_NONEXISTENT_KEY_XYZ__").await.unwrap();
        assert!(val.is_none());
    }

    #[tokio::test]
    async fn env_backend_set_returns_not_supported() {
        let backend = EnvSecretBackend::new();
        let result = backend.set("KEY", "val").await;
        assert!(matches!(result, Err(SecretError::NotSupported(_))));
    }

    #[tokio::test]
    async fn oracle_vault_returns_not_supported() {
        let backend = OracleVaultBackend {
            vault_ocid: "ocid1.vault.oc1..test".to_string(),
            compartment_ocid: "ocid1.compartment.oc1..test".to_string(),
            region: "us-ashburn-1".to_string(),
            client: reqwest::Client::new(),
        };
        let result = backend.get("ANY_KEY").await;
        assert!(matches!(result, Err(SecretError::NotSupported(_))));
    }

    #[test]
    fn build_backend_defaults_to_env() {
        // Ensure default factory produces a working backend (no panic)
        let _backend = build_backend();
    }

    #[test]
    fn secret_error_display() {
        assert!(
            SecretError::Backend("fail".to_string())
                .to_string()
                .contains("backend error")
        );
        assert!(
            SecretError::NotSupported("x".to_string())
                .to_string()
                .contains("not supported")
        );
        assert!(
            SecretError::Serialization("y".to_string())
                .to_string()
                .contains("serialization")
        );
    }
}
