/// Generic REST and GraphQL integration adapter — Phase 8 action framework.
///
/// Executes typed `IntegrationCapability` actions against external HTTP endpoints.
/// Every execution is gated by the capability's `ApprovalMode`:
/// - `Autonomous`: executes immediately.
/// - `SuggestOnly`: builds the request but does not send; returns a preview.
/// - `HumanApprovalRequired`: refuses to execute; caller must post an AFP approval first.
///
/// When an `AgentSigningContext` is provided every outbound request carries:
/// - `X-Agent-Id`: the caller's AFP Agent ID
/// - `X-Agent-Timestamp`: ISO 8601 UTC timestamp (replay-attack mitigation)
/// - `X-Agent-Signature`: Ed25519 hex signature over `"<agent_id>:<timestamp>:<url>"`
use base64::{Engine as _, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signer, SigningKey};
use reqwest::{Client, Method};
use serde_json::{Value, json};
use std::net::{IpAddr, SocketAddr};
use tokio::net::lookup_host;

use crate::integration::{
    ActionIntent, ActionResult, ActionStatus, ApprovalMode, IntegrationCapability,
    IntegrationTransport,
};

/// Ed25519 signing identity attached to outbound HTTP requests.
#[derive(Debug, Clone)]
pub struct AgentSigningContext {
    /// AFP Agent ID string, e.g. `"agent:deploy@acme.ai"`.
    pub agent_id: String,
    /// Raw 32-byte Ed25519 private key.
    pub private_key_bytes: [u8; 32],
}

impl AgentSigningContext {
    /// Build the three signature headers for a given URL.
    pub fn sign_request(&self, url: &str, timestamp: &str) -> [(&'static str, String); 3] {
        let signable = format!("{}:{}:{}", self.agent_id, timestamp, url);
        let signing_key = SigningKey::from_bytes(&self.private_key_bytes);
        let sig = signing_key.sign(signable.as_bytes());
        let sig_b64 = STANDARD.encode(sig.to_bytes());
        [
            ("X-Agent-Id", self.agent_id.clone()),
            ("X-Agent-Timestamp", timestamp.to_string()),
            ("X-Agent-Signature", sig_b64),
        ]
    }
}

/// Parameters for a concrete outbound API call.
#[derive(Debug, Clone)]
pub struct RestCallParams {
    /// Full endpoint URL (e.g. `https://api.stripe.com/v1/charges`).
    pub url: String,
    /// HTTP method for REST calls; ignored for GraphQL (always POST).
    pub method: String,
    /// Optional bearer token; sourced from resolved `secret_refs`.
    pub bearer_token: Option<String>,
    /// Request body (JSON). For GraphQL this must contain `query` and optionally `variables`.
    pub body: Value,
    /// Optional agent identity for request signing.
    pub signing_context: Option<AgentSigningContext>,
    /// Per-node outbound URL host allowlist (item 26 — Phase 2 hardening).
    ///
    /// Populated from `AgentDelegation.outbound_allowlist` which is resolved at
    /// delegation-issuance time from the compiled IR node manifest. When
    /// non-empty, `execute_action` checks the target host before any HTTP call
    /// or Ed25519 signing. An empty vec means no host restriction beyond the
    /// capability's `approval_mode`.
    pub outbound_allowlist: Vec<String>,
}

#[derive(Debug)]
pub struct AdapterResult {
    pub status: ActionStatus,
    pub output: Value,
    pub external_reference: Option<String>,
}

fn upstream_http_status_error(transport: &str, status: reqwest::StatusCode) -> String {
    format!("{transport} call returned {status}")
}

fn graphql_errors_error(errors: &Value) -> String {
    let count = errors.as_array().map_or(1, Vec::len);
    format!("GraphQL response contained {count} error item(s)")
}

/// Execute or preview an integration action.
///
/// Returns `Err` if approval is required but not yet granted, or if the HTTP
/// call fails. On success returns the structured `ActionResult`.
pub async fn execute_action(
    capability: &IntegrationCapability,
    intent: &ActionIntent,
    params: RestCallParams,
    now_iso: &str,
    client: &Client,
) -> Result<ActionResult, String> {
    match capability.approval_mode {
        ApprovalMode::HumanApprovalRequired => {
            return Err(format!(
                "Action '{}' requires human approval before execution. \
                 Post an AFP approval decision to /actions/decision first.",
                capability.capability_id
            ));
        }
        ApprovalMode::SuggestOnly => {
            return Ok(ActionResult {
                capability_id: capability.capability_id.clone(),
                thread_id: intent.thread_id.clone(),
                status: ActionStatus::Pending,
                output: json!({
                    "suggest_only": true,
                    "preview": {
                        "url": params.url,
                        "method": params.method,
                        "body": params.body,
                    }
                }),
                external_reference: None,
                recorded_at: now_iso.to_string(),
            });
        }
        ApprovalMode::Autonomous => {}
    }

    // ── Item 26: Outbound allowlist check (structural, pre-signing) ───────────
    // Must happen before Ed25519 signing so unauthorized calls never produce
    // valid request signatures. Check applies to both REST and GraphQL.
    if !params.outbound_allowlist.is_empty() {
        let host = extract_host(&params.url);
        if !params
            .outbound_allowlist
            .iter()
            .any(|allowed| host_matches(&host, allowed))
        {
            return Err(format!(
                "policy_block: outbound call to '{}' (host '{}') is not in the node's \
                 outbound_allowlist [{}]. Request denied before signing.",
                params.url,
                host,
                params.outbound_allowlist.join(", ")
            ));
        }
    }

    let result = match capability.transport {
        IntegrationTransport::Rest => rest_call(&params, client).await,
        IntegrationTransport::Graphql => graphql_call(&params, client).await,
        IntegrationTransport::BrowserAutomation => {
            Err("Browser automation is not yet supported in this adapter".to_string())
        }
    };

    match result {
        Ok((output, reference)) => Ok(ActionResult {
            capability_id: capability.capability_id.clone(),
            thread_id: intent.thread_id.clone(),
            status: ActionStatus::Completed,
            output,
            external_reference: reference,
            recorded_at: now_iso.to_string(),
        }),
        Err(err) => Ok(ActionResult {
            capability_id: capability.capability_id.clone(),
            thread_id: intent.thread_id.clone(),
            status: ActionStatus::Failed,
            output: json!({ "error": err }),
            external_reference: None,
            recorded_at: now_iso.to_string(),
        }),
    }
}

async fn rest_call(
    params: &RestCallParams,
    client: &Client,
) -> Result<(Value, Option<String>), String> {
    validate_public_http_url(&params.url).await?;
    let method = params
        .method
        .parse::<Method>()
        .map_err(|e| format!("Invalid HTTP method '{}': {e}", params.method))?;

    let mut builder = client.request(method, &params.url);
    if let Some(token) = &params.bearer_token {
        builder = builder.bearer_auth(token);
    }
    if let Some(ctx) = &params.signing_context {
        let ts = chrono::Utc::now().to_rfc3339();
        for (name, value) in ctx.sign_request(&params.url, &ts) {
            builder = builder.header(name, value);
        }
    }
    if !params.body.is_null() {
        builder = builder.json(&params.body);
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("REST call failed: {e}"))?;

    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .unwrap_or_else(|_| json!({ "raw": "<non-JSON response>" }));

    if !status.is_success() {
        return Err(upstream_http_status_error("REST", status));
    }

    Ok((body, None))
}

async fn graphql_call(
    params: &RestCallParams,
    client: &Client,
) -> Result<(Value, Option<String>), String> {
    validate_public_http_url(&params.url).await?;
    let mut builder = client.post(&params.url);
    if let Some(token) = &params.bearer_token {
        builder = builder.bearer_auth(token);
    }
    if let Some(ctx) = &params.signing_context {
        let ts = chrono::Utc::now().to_rfc3339();
        for (name, value) in ctx.sign_request(&params.url, &ts) {
            builder = builder.header(name, value);
        }
    }
    let resp = builder
        .json(&params.body)
        .send()
        .await
        .map_err(|e| format!("GraphQL call failed: {e}"))?;

    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .unwrap_or_else(|_| json!({ "raw": "<non-JSON response>" }));

    if !status.is_success() {
        return Err(upstream_http_status_error("GraphQL", status));
    }

    if let Some(errors) = body.get("errors") {
        if !errors.is_null() && errors.as_array().map_or(false, |arr| !arr.is_empty()) {
            return Err(graphql_errors_error(errors));
        }
    }

    Ok((body, None))
}

// ── SSRF blocklist ────────────────────────────────────────────────────────────

/// Reject URLs whose hostname resolves to link-local, loopback, or private
/// address ranges — guards against SSRF to cloud metadata endpoints.
///
/// DNS is not resolved here; this is a best-effort string check on the literal
/// hostname. Hosts that pass this check and then resolve to a blocked IP range
/// are blocked by the OS/network layer (defence-in-depth).
pub(crate) fn is_ssrf_blocked_host(host: &str) -> bool {
    // Strip brackets from IPv6 literals: [::1] → ::1
    let h = host.trim_matches(|c| c == '[' || c == ']');
    let h_lower = h.to_lowercase();

    // Exact loopback / link-local addresses
    let blocked_exact = [
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
        // Oracle / AWS / GCP / Azure cloud metadata endpoints
        "169.254.169.254",
        "metadata.google.internal",
        "169.254.170.2", // ECS task metadata
    ];
    if blocked_exact.iter().any(|b| h_lower == *b) {
        return true;
    }

    // Prefix-based private / link-local ranges (IPv4 dotted notation)
    let blocked_prefixes = [
        "10.",     // RFC-1918 Class A
        "172.16.", // RFC-1918 Class B (172.16–31.x.x)
        "172.17.",
        "172.18.",
        "172.19.",
        "172.20.",
        "172.21.",
        "172.22.",
        "172.23.",
        "172.24.",
        "172.25.",
        "172.26.",
        "172.27.",
        "172.28.",
        "172.29.",
        "172.30.",
        "172.31.",
        "192.168.",   // RFC-1918 Class C
        "127.",       // Full loopback range
        "169.254.",   // Link-local
        "fd",         // IPv6 ULA (fd00::/8)
        "fe80:",      // IPv6 link-local
        "::ffff:127", // IPv4-mapped loopback
        "::ffff:10.",
        "::ffff:192.168.",
    ];
    if blocked_prefixes.iter().any(|p| h_lower.starts_with(p)) {
        return true;
    }

    false
}

pub(crate) fn is_ssrf_blocked_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            ipv4.is_private()
                || ipv4.is_loopback()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_unspecified()
                || *ipv4 == std::net::Ipv4Addr::new(169, 254, 169, 254)
                || *ipv4 == std::net::Ipv4Addr::new(169, 254, 170, 2)
        }
        IpAddr::V6(ipv6) => {
            ipv6.is_loopback()
                || ipv6.is_unspecified()
                || ipv6.is_unique_local()
                || ipv6.is_unicast_link_local()
                || ipv6.is_multicast()
        }
    }
}

pub(crate) async fn validate_public_http_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|err| format!("invalid URL '{}': {err}", url))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| format!("invalid URL '{}': missing host", url))?;

    if is_ssrf_blocked_host(host) {
        return Err(format!(
            "ssrf_block: outbound call to '{}' (host '{}') targets a private or link-local address range and is not permitted.",
            url, host
        ));
    }

    let port = parsed.port_or_known_default().unwrap_or(443);
    let resolved: Vec<SocketAddr> = if let Ok(ip) = host.parse::<IpAddr>() {
        vec![SocketAddr::new(ip, port)]
    } else {
        lookup_host((host, port))
            .await
            .map_err(|err| format!("could not resolve host '{}': {err}", host))?
            .collect()
    };

    if resolved.is_empty() {
        return Err(format!("could not resolve host '{}'", host));
    }

    if let Some(blocked) = resolved.iter().find(|addr| is_ssrf_blocked_ip(&addr.ip())) {
        return Err(format!(
            "ssrf_block: outbound call to '{}' resolved host '{}' to blocked address '{}'",
            url,
            host,
            blocked.ip()
        ));
    }

    Ok(())
}

// ── Allowlist helpers ─────────────────────────────────────────────────────────

/// Extract the hostname (and optional port) from a URL string.
/// Returns the raw string on parse failure so the caller can include it in
/// the deny message.
pub(crate) fn extract_host(url: &str) -> String {
    // Minimal host extraction: find "://" then take up to the next "/" or end.
    if let Some(after_scheme) = url.split_once("://").map(|(_, rest)| rest) {
        let host_part = after_scheme.split('/').next().unwrap_or(after_scheme);
        // Strip port for matching purposes — allowlist entries may omit port.
        host_part.split(':').next().unwrap_or(host_part).to_string()
    } else {
        url.to_string()
    }
}

/// Returns `true` if `host` matches an allowlist entry.
///
/// Matching rules (in order):
/// 1. Exact match: `"api.stripe.com"` matches `"api.stripe.com"`.
/// 2. Wildcard subdomain: `"*.stripe.com"` matches `"api.stripe.com"` and
///    `"checkout.stripe.com"` but NOT `"stripe.com"` itself.
fn host_matches(host: &str, allowed: &str) -> bool {
    if allowed.starts_with("*.") {
        let suffix = &allowed[1..]; // ".stripe.com"
        host.ends_with(suffix)
    } else {
        host == allowed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integration::{ApprovalMode, IntegrationTransport};

    fn make_capability(
        mode: ApprovalMode,
        transport: IntegrationTransport,
    ) -> IntegrationCapability {
        IntegrationCapability {
            capability_id: "cap_test".to_string(),
            provider: "test".to_string(),
            operation: "ping".to_string(),
            transport,
            scopes: vec![],
            approval_mode: mode,
            secret_refs: vec![],
            metadata: serde_json::Value::Null,
        }
    }

    fn make_intent() -> ActionIntent {
        ActionIntent {
            capability_id: "cap_test".to_string(),
            thread_id: "thread_test".to_string(),
            requested_by: "agent:test@acme.ai".to_string(),
            input: serde_json::json!({}),
            reason: None,
        }
    }

    #[tokio::test]
    async fn human_approval_required_returns_error() {
        let cap = make_capability(
            ApprovalMode::HumanApprovalRequired,
            IntegrationTransport::Rest,
        );
        let intent = make_intent();
        let client = Client::new();
        let params = RestCallParams {
            url: "https://example.com/api".to_string(),
            method: "POST".to_string(),
            bearer_token: None,
            body: serde_json::json!({"foo": "bar"}),
            signing_context: None,
            outbound_allowlist: vec![],
        };
        let result = execute_action(&cap, &intent, params, "2026-01-01T00:00:00Z", &client).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("requires human approval"));
    }

    #[test]
    fn signing_context_produces_three_deterministic_headers() {
        let ctx = AgentSigningContext {
            agent_id: "agent:svc@acme.ai".to_string(),
            private_key_bytes: [42u8; 32],
        };
        let headers = ctx.sign_request("https://api.example.com/v1/charge", "2026-01-01T00:00:00Z");
        assert_eq!(headers[0].0, "X-Agent-Id");
        assert_eq!(headers[0].1, "agent:svc@acme.ai");
        assert_eq!(headers[1].0, "X-Agent-Timestamp");
        assert_eq!(headers[1].1, "2026-01-01T00:00:00Z");
        assert_eq!(headers[2].0, "X-Agent-Signature");
        // Same key + same inputs = same signature (deterministic)
        let headers2 =
            ctx.sign_request("https://api.example.com/v1/charge", "2026-01-01T00:00:00Z");
        assert_eq!(headers[2].1, headers2[2].1);
        // Different URL = different signature
        let headers3 = ctx.sign_request("https://api.example.com/v1/other", "2026-01-01T00:00:00Z");
        assert_ne!(headers[2].1, headers3[2].1);
    }

    #[test]
    fn upstream_status_errors_omit_response_bodies() {
        let err = upstream_http_status_error("REST", reqwest::StatusCode::UNAUTHORIZED);

        assert_eq!(err, "REST call returned 401 Unauthorized");
        assert!(!err.contains("access_token"));
        assert!(!err.contains("client_secret"));
    }

    #[test]
    fn graphql_errors_are_counted_not_echoed() {
        let errors = serde_json::json!([
            {"message": "token expired: sk_live_secret"},
            {"message": "customer email private@example.com"}
        ]);
        let err = graphql_errors_error(&errors);

        assert_eq!(err, "GraphQL response contained 2 error item(s)");
        assert!(!err.contains("sk_live_secret"));
        assert!(!err.contains("private@example.com"));
    }

    #[tokio::test]
    async fn suggest_only_returns_pending_preview() {
        let cap = make_capability(ApprovalMode::SuggestOnly, IntegrationTransport::Rest);
        let intent = make_intent();
        let client = Client::new();
        let params = RestCallParams {
            url: "https://api.stripe.com/v1/charges".to_string(),
            method: "POST".to_string(),
            bearer_token: Some("sk_test_xxx".to_string()),
            body: serde_json::json!({"amount": 2000, "currency": "usd"}),
            signing_context: None,
            outbound_allowlist: vec![],
        };
        let result = execute_action(&cap, &intent, params, "2026-01-01T00:00:00Z", &client)
            .await
            .unwrap();
        assert_eq!(result.status, ActionStatus::Pending);
        assert!(result.output.get("suggest_only").is_some());
    }

    // ── Item 26: outbound allowlist tests ─────────────────────────────────────

    #[test]
    fn extract_host_strips_scheme_path_and_port() {
        assert_eq!(
            extract_host("https://api.stripe.com/v1/charges"),
            "api.stripe.com"
        );
        assert_eq!(extract_host("http://localhost:8080/foo"), "localhost");
        assert_eq!(extract_host("https://example.com"), "example.com");
    }

    #[test]
    fn host_matches_exact_and_wildcard() {
        assert!(host_matches("api.stripe.com", "api.stripe.com"));
        assert!(!host_matches("other.stripe.com", "api.stripe.com"));
        assert!(host_matches("api.stripe.com", "*.stripe.com"));
        assert!(host_matches("checkout.stripe.com", "*.stripe.com"));
        // Wildcard should NOT match the apex domain itself
        assert!(!host_matches("stripe.com", "*.stripe.com"));
    }

    #[test]
    fn ssrf_ip_blocklist_rejects_metadata_and_private_addresses() {
        assert!(is_ssrf_blocked_ip(&"169.254.169.254".parse().expect("ip")));
        assert!(is_ssrf_blocked_ip(&"10.0.0.1".parse().expect("ip")));
        assert!(is_ssrf_blocked_ip(&"127.0.0.1".parse().expect("ip")));
    }

    #[tokio::test]
    async fn validate_public_http_url_rejects_localhost_without_dns_lookup() {
        let err = validate_public_http_url("https://localhost/secrets")
            .await
            .expect_err("localhost should be blocked");
        assert!(err.contains("ssrf_block"));
        assert!(err.contains("localhost"));
    }

    #[tokio::test]
    async fn validate_public_http_url_accepts_public_literal_ip() {
        validate_public_http_url("https://8.8.8.8/health")
            .await
            .expect("public literal IP should pass SSRF guard");
    }

    #[tokio::test]
    async fn allowlist_blocks_unauthorized_host() {
        let cap = make_capability(ApprovalMode::Autonomous, IntegrationTransport::Rest);
        let intent = make_intent();
        let client = Client::new();
        let params = RestCallParams {
            url: "https://evil.example.com/exfiltrate".to_string(),
            method: "POST".to_string(),
            bearer_token: None,
            body: serde_json::json!({}),
            signing_context: None,
            outbound_allowlist: vec!["api.stripe.com".to_string()],
        };
        let result = execute_action(&cap, &intent, params, "2026-01-01T00:00:00Z", &client).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("policy_block"));
        assert!(err.contains("evil.example.com"));
    }

    #[tokio::test]
    async fn empty_allowlist_does_not_block() {
        // Empty allowlist = no restriction. The call will fail at the network
        // level (no real server) but must NOT fail with a policy_block error.
        let cap = make_capability(ApprovalMode::Autonomous, IntegrationTransport::Rest);
        let intent = make_intent();
        let client = Client::new();
        let params = RestCallParams {
            url: "https://api.example.com/test".to_string(),
            method: "GET".to_string(),
            bearer_token: None,
            body: serde_json::Value::Null,
            signing_context: None,
            outbound_allowlist: vec![],
        };
        let result = execute_action(&cap, &intent, params, "2026-01-01T00:00:00Z", &client).await;
        // Should not be a policy_block — may succeed or fail with a network error
        if let Err(e) = &result {
            assert!(
                !e.contains("policy_block"),
                "empty allowlist triggered policy_block: {e}"
            );
        }
    }
}
