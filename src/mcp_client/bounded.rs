//! Opt-in bounded MCP transport. Callers must independently supply action authority.
//! No runbook route invokes this transport yet. Never automatically retry a call.
use reqwest::header::{ACCEPT, CONTENT_ENCODING, CONTENT_TYPE, HeaderValue};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;
pub mod destination;
mod unique_json;

#[derive(Clone, Copy)]
pub struct CallLimits {
    pub timeout: Duration,
    pub response_bytes: usize,
}
impl Default for CallLimits {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(15),
            response_bytes: 65536,
        }
    }
}
/// After transmission starts, any failure may conceal a completed side effect.
/// These outcomes must never be interpreted as permission to retry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallOutcome {
    NotSent,
    Unknown,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CallFailure {
    pub code: &'static str,
    pub outcome: CallOutcome,
}
fn rejected(code: &'static str) -> CallFailure {
    CallFailure {
        code,
        outcome: CallOutcome::NotSent,
    }
}
fn unknown(code: &'static str) -> CallFailure {
    CallFailure {
        code,
        outcome: CallOutcome::Unknown,
    }
}
/// Correlated transport receipt, not proof of business success. No Debug/Serialize:
/// the structured payload may contain private data. No raw error body is retained.
pub struct CallResponse {
    result: Value,
    pub(crate) request_binding: String,
}
impl CallResponse {
    pub fn result(&self) -> &Value {
        &self.result
    }
}
pub(crate) fn request_binding(endpoint: &str, capability: &str, arguments: &Value) -> String {
    crate::runbook_store::digest(&json!([
        "bounded_mcp_request.v1",
        endpoint,
        capability,
        arguments
    ]))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    jsonrpc: String,
    id: String,
    #[serde(deserialize_with = "unique_json::deserialize")]
    result: Value,
}

/// Independent of the old permissive MCP API. No redirects, proxy inheritance,
/// compressed responses, retries or text/event-stream fallback are supported.
/// The total deadline includes sending, headers and every body chunk.
pub async fn call_tool(
    endpoint: &str,
    api_key: Option<&str>,
    capability: &str,
    arguments: &Value,
    limits: CallLimits,
) -> Result<CallResponse, CallFailure> {
    call_tool_inner(endpoint, api_key, capability, arguments, limits, None).await
}
pub(crate) async fn call_tool_pinned(
    target: &destination::PinnedMcpTarget,
    api_key: Option<&str>,
    capability: &str,
    arguments: &Value,
    limits: CallLimits,
) -> Result<CallResponse, CallFailure> {
    call_tool_inner(
        target.endpoint(),
        api_key,
        capability,
        arguments,
        limits,
        Some(target),
    )
    .await
}
async fn call_tool_inner(
    endpoint: &str,
    api_key: Option<&str>,
    capability: &str,
    arguments: &Value,
    limits: CallLimits,
    target: Option<&destination::PinnedMcpTarget>,
) -> Result<CallResponse, CallFailure> {
    if limits.timeout.is_zero()
        || limits.timeout > Duration::from_secs(30)
        || limits.response_bytes == 0
        || limits.response_bytes > 65536
    {
        return Err(rejected("invalid_tool_limits"));
    }
    let url = reqwest::Url::parse(endpoint).map_err(|_| rejected("invalid_tool_endpoint"))?;
    if endpoint.len() > 2048
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || super::validate_mcp_server_url(endpoint).is_err()
    {
        return Err(rejected("invalid_tool_endpoint"));
    }
    if !crate::runbook_validation::identifier(capability) || !arguments.is_object() {
        return Err(rejected("invalid_tool_request"));
    }
    // Bound before recursive serialization, including optional/unused branches.
    let mut pending = vec![(arguments, 0usize)];
    let mut nodes = 0;
    let mut bytes = 0usize;
    while let Some((v, depth)) = pending.pop() {
        nodes += 1;
        if nodes > 2048 || depth > 20 || pending.len() > 2048 {
            return Err(rejected("tool_request_too_large"));
        }
        match v {
            Value::Object(m) => {
                if m.len() > 2048 {
                    return Err(rejected("tool_request_too_large"));
                }
                for (k, v) in m {
                    bytes = bytes.saturating_add(k.len());
                    pending.push((v, depth + 1));
                }
            }
            Value::Array(a) => {
                if a.len() > 2048 {
                    return Err(rejected("tool_request_too_large"));
                }
                pending.extend(a.iter().map(|v| (v, depth + 1)));
            }
            Value::String(s) => bytes = bytes.saturating_add(s.len()),
            _ => (),
        }
        if bytes > 32768 {
            return Err(rejected("tool_request_too_large"));
        }
    }
    let id = ulid::Ulid::new().to_string();
    let body = serde_json::to_vec(&json!({"jsonrpc":"2.0","id":id,"method":"tools/call",
        "params":{"name":capability,"arguments":arguments}}))
    .map_err(|_| rejected("invalid_tool_request"))?;
    if body.len() > 65536 {
        return Err(rejected("tool_request_too_large"));
    }
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .no_proxy()
        .connect_timeout(limits.timeout)
        .timeout(limits.timeout);
    if let Some(target) = target {
        builder = target.pin(builder);
    }
    let client = builder
        .build()
        .map_err(|_| rejected("tool_client_unavailable"))?;
    let mut request = client
        .post(url)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json")
        .header("Accept-Encoding", "identity")
        .body(body);
    if let Some(key) = api_key {
        if key.is_empty() || key.len() > 8192 {
            return Err(rejected("invalid_tool_credential"));
        }
        let mut bearer = HeaderValue::from_str(&format!("Bearer {key}"))
            .map_err(|_| rejected("invalid_tool_credential"))?;
        bearer.set_sensitive(true);
        let mut raw =
            HeaderValue::from_str(key).map_err(|_| rejected("invalid_tool_credential"))?;
        raw.set_sensitive(true);
        request = request
            .header("Authorization", bearer)
            .header("X-API-Key", raw);
    }
    let request = request
        .build()
        .map_err(|_| rejected("invalid_tool_request"))?;
    tokio::time::timeout(limits.timeout, async {
        let mut response = client
            .execute(request)
            .await
            .map_err(|_| unknown("tool_transport_failed"))?;
        if !response.status().is_success() {
            return Err(unknown("tool_http_failed"));
        }
        if response
            .headers()
            .get(CONTENT_ENCODING)
            .is_some_and(|v| v != "identity")
        {
            return Err(unknown("unsupported_tool_encoding"));
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split(';').next());
        if !content_type.is_some_and(|s| s.trim().eq_ignore_ascii_case("application/json")) {
            return Err(unknown("unsupported_tool_content_type"));
        }
        if response
            .content_length()
            .is_some_and(|n| n > limits.response_bytes as u64)
        {
            return Err(unknown("tool_response_too_large"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| unknown("tool_body_failed"))?
        {
            if chunk.len() > limits.response_bytes.saturating_sub(bytes.len()) {
                return Err(unknown("tool_response_too_large"));
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.iter().copied().find(|b| !b.is_ascii_whitespace()) != Some(b'{') {
            return Err(unknown("invalid_tool_envelope"));
        }
        let envelope: Envelope =
            serde_json::from_slice(&bytes).map_err(|_| unknown("invalid_tool_envelope"))?;
        if envelope.jsonrpc != "2.0" || envelope.id != id {
            return Err(unknown("uncorrelated_tool_response"));
        }
        Ok(CallResponse {
            result: envelope.result,
            request_binding: request_binding(endpoint, capability, arguments),
        })
    })
    .await
    .map_err(|_| unknown("tool_deadline_exceeded"))?
}
