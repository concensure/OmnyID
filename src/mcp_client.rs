/*
 * @module-id: rust.mcp-client
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::{Value, json};

/// Reject non-HTTPS (and non-localhost HTTP) MCP server URLs to prevent SSRF.
///
/// User-supplied `mcp_server_url` values are stored in the DB and passed here
/// as-is.  Without this guard an authenticated user could register a tool with
/// `mcp_server_url = "http://169.254.169.254/..."` and use OmnyID as an SSRF
/// proxy to probe the instance metadata service or internal network endpoints.
pub(crate) fn validate_mcp_server_url(url: &str) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("https://") {
        return Ok(());
    }
    // Allow plain HTTP only for loopback â€” useful in development.
    let localhost_prefixes = [
        "http://localhost:",
        "http://localhost/",
        "http://127.0.0.1:",
        "http://127.0.0.1/",
        "http://[::1]:",
        "http://[::1]/",
    ];
    let localhost_exact = ["http://localhost", "http://127.0.0.1", "http://[::1]"];
    if localhost_prefixes.iter().any(|p| lower.starts_with(p))
        || localhost_exact.iter().any(|e| lower == *e)
    {
        return Ok(());
    }
    Err(format!(
        "MCP server URL must use https:// (or http://localhost for development); \
         HTTP to external hosts is blocked to prevent SSRF. Got: {url}"
    ))
}

pub async fn call_tool(
    server_url: &str,
    api_key: Option<&str>,
    tool_name: &str,
    arguments: Value,
) -> Result<Value, String> {
    validate_mcp_server_url(server_url)?;

    let client = reqwest::Client::new();
    let request_id = ulid::Ulid::new().to_string();
    let payload = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        }
    });

    let mut builder = client.post(server_url).json(&payload);
    if let Some(key) = api_key.filter(|value| !value.is_empty()) {
        builder = builder
            .header("Authorization", format!("Bearer {key}"))
            .header("X-API-Key", key);
    }

    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("MCP HTTP error {status}: {body}"));
    }

    if let Some(error) = body.get("error") {
        return Err(format!("MCP tool error: {error}"));
    }

    Ok(body
        .get("result")
        .cloned()
        .unwrap_or_else(|| json!({"raw": body})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn empty_host_fails_cleanly() {
        let result = call_tool("", None, "send_message", json!({"text": "hi"})).await;
        assert!(result.is_err());
    }

    #[test]
    fn ssrf_guard_blocks_internal_http() {
        assert!(validate_mcp_server_url("http://169.254.169.254/latest/meta-data/").is_err());
        assert!(validate_mcp_server_url("http://10.0.0.1/internal").is_err());
        assert!(validate_mcp_server_url("http://192.168.1.1/").is_err());
        assert!(validate_mcp_server_url("file:///etc/passwd").is_err());
        assert!(validate_mcp_server_url("ftp://example.com").is_err());
    }

    #[test]
    fn ssrf_guard_allows_https_and_localhost() {
        assert!(validate_mcp_server_url("https://mcp.example.com/v1").is_ok());
        assert!(validate_mcp_server_url("https://api.notion.com/mcp").is_ok());
        assert!(validate_mcp_server_url("http://localhost:8080/mcp").is_ok());
        assert!(validate_mcp_server_url("http://127.0.0.1:3000/mcp").is_ok());
        assert!(validate_mcp_server_url("http://[::1]:9000/mcp").is_ok());
    }
}
