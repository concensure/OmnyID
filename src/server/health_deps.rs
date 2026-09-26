/*
 * @module-id: rust.server.health-deps
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use crate::secret_manager::read_process_secret_trimmed;
use crate::server::billing::{
    billing_workspace_base_url_is_configured, stripe_checkout_price_id_for_plan,
};

/// Dependency readiness probes for the /readyz endpoint (GAP-087).
///
/// Each probe returns a short status string: "ok", "not_configured", "timeout",
/// or a descriptive error. Callers treat "ok" and "not_configured" as passing.

struct LlmProbeTarget {
    provider: &'static str,
    url: String,
    auth: LlmProbeAuth,
}

enum LlmProbeAuth {
    Bearer(String),
    Anthropic(String),
    None,
}

/// Probe SeaweedFS readiness via either the master API or the S3 gateway.
///
/// Env vars:
///   SEAWEEDFS_MASTER_URL            â€” e.g. "http://seaweedfs:9333"
///   OMNYID_SEAWEEDFS_S3_ENDPOINT    â€” e.g. "http://seaweedfs:8333"
///   SEAWEEDFS_ENDPOINT / AWS_ENDPOINT_URL â€” legacy fallback for older environments
///
/// SeaweedFS master returns 200 JSON on `/cluster/status` when healthy.
/// When only the S3 gateway endpoint is configured, probing the endpoint root is
/// sufficient for a lightweight readiness check.
pub async fn check_object_store_readiness(client: &reqwest::Client) -> String {
    if let Ok(master) = std::env::var("SEAWEEDFS_MASTER_URL") {
        let url = format!("{}/cluster/status", master.trim_end_matches('/'));
        return probe_http(client, &url, "seaweedfs").await;
    }

    let endpoint = match std::env::var("OMNYID_SEAWEEDFS_S3_ENDPOINT")
        .or_else(|_| std::env::var("SEAWEEDFS_ENDPOINT"))
        .or_else(|_| std::env::var("AWS_ENDPOINT_URL"))
    {
        Ok(e) => e,
        Err(_) => return "not_configured".to_string(),
    };
    probe_http(client, endpoint.trim_end_matches('/'), "seaweedfs_s3").await
}

/// Probe SMTP outbound connectivity via a TCP handshake.
///
/// Env vars: SMTP_HOST (required), SMTP_PORT (default 587).
pub async fn check_smtp_readiness() -> String {
    let host = match std::env::var("SMTP_HOST") {
        Ok(h) => h,
        Err(_) => return "not_configured".to_string(),
    };
    let port: u16 = std::env::var("SMTP_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(587);
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect((host.as_str(), port)),
    )
    .await
    {
        Ok(Ok(_)) => "ok".to_string(),
        Ok(Err(e)) => format!("error: {e}"),
        Err(_) => "timeout".to_string(),
    }
}

/// Probe Gmail OAuth runtime configuration without exposing secrets.
///
/// This is a configuration diagnostic rather than a network reachability check.
/// A partially configured OAuth deployment should show up as "misconfigured"
/// so operators can fix it before users encounter route-time failures.
pub fn check_gmail_oauth_readiness() -> String {
    let has_client_id = env_var_present("OMNYID_GMAIL_CLIENT_ID");
    let has_client_secret = secret_present("OMNYID_GMAIL_CLIENT_SECRET");
    let has_homeserver_url = env_var_present("OMNYID_HOMESERVER_URL");
    let has_session_secret = secret_present("OMNYID_SESSION_SECRET");

    let any_present =
        has_client_id || has_client_secret || has_homeserver_url || has_session_secret;
    if !any_present {
        return "not_configured".to_string();
    }

    if !has_client_id {
        return "misconfigured: missing_OMNYID_GMAIL_CLIENT_ID".to_string();
    }
    if !has_client_secret {
        return "misconfigured: missing_OMNYID_GMAIL_CLIENT_SECRET".to_string();
    }
    if !has_homeserver_url {
        return "misconfigured: missing_OMNYID_HOMESERVER_URL".to_string();
    }
    if !has_session_secret {
        return "misconfigured: missing_OMNYID_SESSION_SECRET".to_string();
    }

    let homeserver_url = std::env::var("OMNYID_HOMESERVER_URL").unwrap_or_default();
    let trimmed = homeserver_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return "misconfigured: blank_OMNYID_HOMESERVER_URL".to_string();
    }
    match reqwest::Url::parse(trimmed) {
        Ok(url) if matches!(url.scheme(), "http" | "https") && url.host_str().is_some() => {
            "ok".to_string()
        }
        _ => "misconfigured: invalid_OMNYID_HOMESERVER_URL".to_string(),
    }
}

/// Probe the configured managed LLM backend.
///
/// This intentionally checks only server-managed backends configured through
/// environment variables. Per-user BYOK providers are private user state and
/// are not a reliable service-level readiness signal for `/readyz`.
pub async fn check_llm_backend_readiness(client: &reqwest::Client) -> String {
    let Some(target) = llm_probe_target_from_env() else {
        return "not_configured".to_string();
    };
    let request = match target.auth {
        LlmProbeAuth::Bearer(token) => client.get(&target.url).bearer_auth(token),
        LlmProbeAuth::Anthropic(token) => client
            .get(&target.url)
            .header("x-api-key", token)
            .header("anthropic-version", "2023-06-01"),
        LlmProbeAuth::None => client.get(&target.url),
    };
    match tokio::time::timeout(std::time::Duration::from_secs(5), request.send()).await {
        Ok(Ok(resp)) if resp.status().is_success() => "ok".to_string(),
        Ok(Ok(resp)) => format!("{}_http_{}", target.provider, resp.status().as_u16()),
        Ok(Err(e)) => format!("{}_error: {e}", target.provider),
        Err(_) => format!("{}_timeout", target.provider),
    }
}

/// Probe Composio runtime configuration.
///
/// If an API key is configured, this performs a lightweight authenticated tools
/// request so invalid production keys show up in `/readyz`.
fn composio_readiness_from_http_status(status: u16) -> String {
    match status {
        401 | 403 => format!("misconfigured: unauthorized_COMPOSIO_API_KEY_http_{status}"),
        429 => "degraded: composio_rate_limited".to_string(),
        status if status >= 500 => format!("degraded: composio_upstream_http_{status}"),
        _ => format!("misconfigured: composio_http_{status}"),
    }
}

fn composio_api_base_url() -> String {
    std::env::var("COMPOSIO_API_BASE_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "https://backend.composio.dev/api/v3.1".to_string())
}

pub async fn check_composio_readiness(client: &reqwest::Client) -> String {
    let Some(api_key) = read_process_secret_trimmed("COMPOSIO_API_KEY") else {
        return "not_configured".to_string();
    };
    if api_key.trim().is_empty() {
        return "misconfigured: blank_COMPOSIO_API_KEY".to_string();
    }
    let probe_url = format!("{}/tools?limit=1", composio_api_base_url());
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        client
            .get(probe_url)
            .header("x-api-key", api_key)
            .header("accept", "application/json")
            .send(),
    )
    .await
    {
        Ok(Ok(resp)) if resp.status().is_success() => "ok".to_string(),
        Ok(Ok(resp)) => composio_readiness_from_http_status(resp.status().as_u16()),
        Ok(Err(e)) => format!("composio_error: {e}"),
        Err(_) => "composio_timeout".to_string(),
    }
}

/// Probe Stripe self-serve billing configuration.
///
/// This is a configuration diagnostic rather than a live Stripe API check.
/// It fails closed on partial or obviously invalid configuration so `/readyz`
/// does not report green while checkout or portal flows are dead in production.
pub fn check_stripe_billing_readiness() -> String {
    let secret = read_process_secret_trimmed("OMNYID_STRIPE_SECRET_KEY");
    let webhook_secret = read_process_secret_trimmed("OMNYID_STRIPE_WEBHOOK_SECRET");
    let pro_price = stripe_checkout_price_id_for_plan("pro");
    let team_price_raw = read_process_secret_trimmed("OMNYID_STRIPE_TEAM_PRICE_ID");
    let return_url_ready = billing_workspace_base_url_is_configured();

    let any_present = secret.is_some()
        || webhook_secret.is_some()
        || pro_price.is_some()
        || team_price_raw.is_some()
        || return_url_ready;
    if !any_present {
        return "not_configured".to_string();
    }

    let has_secret = secret
        .as_deref()
        .map(stripe_secret_key_looks_valid)
        .unwrap_or(false);
    if !has_secret {
        return "misconfigured: missing_or_invalid_OMNYID_STRIPE_SECRET_KEY".to_string();
    }

    if !return_url_ready {
        return "misconfigured: missing_billing_workspace_base_url".to_string();
    }

    let has_pro_price = pro_price.is_some();
    if !has_pro_price {
        return "misconfigured: missing_or_invalid_OMNYID_STRIPE_PRO_PRICE_ID".to_string();
    }

    let team_price_valid = team_price_raw
        .as_deref()
        .map(stripe_price_id_looks_valid)
        .unwrap_or(true);
    if !team_price_valid {
        return "misconfigured: invalid_OMNYID_STRIPE_TEAM_PRICE_ID".to_string();
    }

    let has_webhook_secret = webhook_secret
        .as_deref()
        .map(stripe_webhook_secret_looks_valid)
        .unwrap_or(false);
    if !has_webhook_secret {
        return "misconfigured: missing_or_invalid_OMNYID_STRIPE_WEBHOOK_SECRET".to_string();
    }

    "ok".to_string()
}

fn llm_probe_target_from_env() -> Option<LlmProbeTarget> {
    if let Ok(base) = std::env::var("OMNYID_OLLAMA_URL").or_else(|_| std::env::var("OLLAMA_URL")) {
        let trimmed = base.trim().trim_end_matches('/');
        if !trimmed.is_empty() {
            return Some(LlmProbeTarget {
                provider: "ollama",
                url: format!("{trimmed}/api/tags"),
                auth: LlmProbeAuth::None,
            });
        }
    }

    let runpod_endpoint_id = std::env::var("OMNYID_RUNPOD_ENDPOINT_ID").unwrap_or_default();
    let runpod_api_key = read_process_secret_trimmed("OMNYID_RUNPOD_API_KEY").unwrap_or_default();
    if !runpod_endpoint_id.trim().is_empty() && !runpod_api_key.trim().is_empty() {
        return Some(LlmProbeTarget {
            provider: "runpod",
            url: format!(
                "https://api.runpod.ai/v2/{}/openai/v1/models",
                runpod_endpoint_id.trim()
            ),
            auth: LlmProbeAuth::Bearer(runpod_api_key),
        });
    }

    let anthropic_api_key = read_process_secret_trimmed("OMNYID_ANTHROPIC_KEY")
        .or_else(|| read_process_secret_trimmed("ANTHROPIC_API_KEY"))
        .unwrap_or_default();
    if !anthropic_api_key.trim().is_empty() {
        return Some(LlmProbeTarget {
            provider: "anthropic",
            url: "https://api.anthropic.com/v1/models".to_string(),
            auth: LlmProbeAuth::Anthropic(anthropic_api_key),
        });
    }

    None
}

async fn probe_http(client: &reqwest::Client, url: &str, label: &str) -> String {
    match tokio::time::timeout(std::time::Duration::from_secs(5), client.get(url).send()).await {
        Ok(Ok(resp)) if resp.status().is_success() => "ok".to_string(),
        Ok(Ok(resp)) => format!("{label}_http_{}", resp.status().as_u16()),
        Ok(Err(e)) => format!("{label}_error: {e}"),
        Err(_) => format!("{label}_timeout"),
    }
}

fn env_var_present(name: &str) -> bool {
    std::env::var(name)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

fn secret_present(name: &str) -> bool {
    read_process_secret_trimmed(name)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

fn stripe_secret_key_looks_valid(value: &str) -> bool {
    let trimmed = value.trim();
    (trimmed.starts_with("sk_live_") || trimmed.starts_with("sk_test_"))
        && trimmed.len() > "sk_test_".len()
}

fn stripe_webhook_secret_looks_valid(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("whsec_") && trimmed.len() > "whsec_".len()
}

fn stripe_price_id_looks_valid(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("price_") && trimmed.len() > "price_".len()
}

#[cfg(test)]
mod tests {
    use super::{
        check_composio_readiness, check_gmail_oauth_readiness, check_stripe_billing_readiness,
        composio_api_base_url, composio_readiness_from_http_status, llm_probe_target_from_env,
    };
    use std::sync::{Mutex, OnceLock};

    fn llm_probe_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_llm_probe_env() {
        for key in [
            "OMNYID_OLLAMA_URL",
            "OLLAMA_URL",
            "OMNYID_RUNPOD_ENDPOINT_ID",
            "OMNYID_RUNPOD_API_KEY",
            "OMNYID_ANTHROPIC_KEY",
            "ANTHROPIC_API_KEY",
        ] {
            unsafe {
                std::env::remove_var(key);
            }
        }
    }

    fn clear_gmail_probe_env() {
        for key in [
            "OMNYID_GMAIL_CLIENT_ID",
            "OMNYID_GMAIL_CLIENT_SECRET",
            "OMNYID_GMAIL_CLIENT_SECRET_FILE",
            "OMNYID_HOMESERVER_URL",
            "OMNYID_SESSION_SECRET",
            "OMNYID_SESSION_SECRET_FILE",
        ] {
            unsafe {
                std::env::remove_var(key);
            }
        }
    }

    fn clear_composio_probe_env() {
        unsafe {
            std::env::remove_var("COMPOSIO_API_KEY");
            std::env::remove_var("COMPOSIO_API_BASE_URL");
        }
    }

    fn clear_stripe_probe_env() {
        for key in [
            "OMNYID_STRIPE_SECRET_KEY",
            "OMNYID_STRIPE_WEBHOOK_SECRET",
            "OMNYID_STRIPE_PRO_PRICE_ID",
            "OMNYID_STRIPE_CHECKOUT_PRICE_ID",
            "OMNYID_STRIPE_TEAM_PRICE_ID",
            "OMNYID_WORKSPACE_BASE_URL",
            "OMNYID_UI_BASE_URL",
            "OMNYID_HOMESERVER_URL",
        ] {
            unsafe {
                std::env::remove_var(key);
            }
        }
    }

    #[test]
    fn llm_probe_prefers_ollama_when_configured() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_llm_probe_env();
        unsafe {
            std::env::set_var("OMNYID_OLLAMA_URL", "http://ollama:11434/");
            std::env::set_var("OMNYID_ANTHROPIC_KEY", "test-key");
        }
        let target = llm_probe_target_from_env().expect("ollama target");
        assert_eq!(target.provider, "ollama");
        assert_eq!(target.url, "http://ollama:11434/api/tags");
        clear_llm_probe_env();
    }

    #[test]
    fn llm_probe_uses_runpod_when_ollama_absent() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_llm_probe_env();
        unsafe {
            std::env::set_var("OMNYID_RUNPOD_ENDPOINT_ID", "ep-123");
            std::env::set_var("OMNYID_RUNPOD_API_KEY", "runpod-key");
        }
        let target = llm_probe_target_from_env().expect("runpod target");
        assert_eq!(target.provider, "runpod");
        assert!(target.url.contains("/ep-123/openai/v1/models"));
        clear_llm_probe_env();
    }

    #[test]
    fn llm_probe_falls_back_to_anthropic_key() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_llm_probe_env();
        unsafe {
            std::env::set_var("ANTHROPIC_API_KEY", "anthropic-key");
        }
        let target = llm_probe_target_from_env().expect("anthropic target");
        assert_eq!(target.provider, "anthropic");
        assert_eq!(target.url, "https://api.anthropic.com/v1/models");
        clear_llm_probe_env();
    }

    #[test]
    fn gmail_oauth_probe_reports_not_configured_when_absent() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_gmail_probe_env();
        assert_eq!(check_gmail_oauth_readiness(), "not_configured");
    }

    #[test]
    fn gmail_oauth_probe_reports_partial_configuration() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_gmail_probe_env();
        unsafe {
            std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "gmail-client-id");
            std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com");
        }
        assert_eq!(
            check_gmail_oauth_readiness(),
            "misconfigured: missing_OMNYID_GMAIL_CLIENT_SECRET"
        );
        clear_gmail_probe_env();
    }

    #[test]
    fn gmail_oauth_probe_accepts_complete_configuration() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_gmail_probe_env();
        unsafe {
            std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "gmail-client-id");
            std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "gmail-client-secret");
            std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com/");
            std::env::set_var("OMNYID_SESSION_SECRET", "session-secret");
        }
        assert_eq!(check_gmail_oauth_readiness(), "ok");
        clear_gmail_probe_env();
    }

    #[tokio::test]
    async fn composio_probe_reports_not_configured_when_absent() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_composio_probe_env();
        let client = reqwest::Client::new();
        assert_eq!(check_composio_readiness(&client).await, "not_configured");
    }

    #[test]
    fn composio_probe_classifies_unauthorized_and_upstream_failures() {
        assert_eq!(
            composio_readiness_from_http_status(401),
            "misconfigured: unauthorized_COMPOSIO_API_KEY_http_401"
        );
        assert_eq!(
            composio_readiness_from_http_status(429),
            "degraded: composio_rate_limited"
        );
        assert_eq!(
            composio_readiness_from_http_status(503),
            "degraded: composio_upstream_http_503"
        );
    }

    #[test]
    fn composio_probe_uses_configured_api_base_override_when_present() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_composio_probe_env();
        unsafe {
            std::env::set_var("COMPOSIO_API_BASE_URL", " http://127.0.0.1:9010/api/v3.1/ ");
        }
        assert_eq!(
            composio_api_base_url(),
            "http://127.0.0.1:9010/api/v3.1".to_string()
        );
        clear_composio_probe_env();
    }

    #[test]
    fn stripe_billing_probe_reports_not_configured_when_absent() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_stripe_probe_env();
        assert_eq!(check_stripe_billing_readiness(), "not_configured");
    }

    #[test]
    fn stripe_billing_probe_reports_missing_webhook_secret() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_stripe_probe_env();
        unsafe {
            std::env::set_var("OMNYID_STRIPE_SECRET_KEY", "sk_live_123");
            std::env::set_var("OMNYID_STRIPE_PRO_PRICE_ID", "price_123");
            std::env::set_var("OMNYID_WORKSPACE_BASE_URL", "https://app.omnyid.com");
        }
        assert_eq!(
            check_stripe_billing_readiness(),
            "misconfigured: missing_or_invalid_OMNYID_STRIPE_WEBHOOK_SECRET"
        );
        clear_stripe_probe_env();
    }

    #[test]
    fn stripe_billing_probe_accepts_complete_configuration() {
        let _guard = llm_probe_env_lock().lock().expect("lock llm probe env");
        clear_stripe_probe_env();
        unsafe {
            std::env::set_var("OMNYID_STRIPE_SECRET_KEY", "sk_live_123");
            std::env::set_var("OMNYID_STRIPE_WEBHOOK_SECRET", "whsec_123");
            std::env::set_var("OMNYID_STRIPE_PRO_PRICE_ID", "price_123");
            std::env::set_var("OMNYID_WORKSPACE_BASE_URL", "https://app.omnyid.com");
        }
        assert_eq!(check_stripe_billing_readiness(), "ok");
        clear_stripe_probe_env();
    }
}
