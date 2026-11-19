use super::*;
use reqwest::header::{CONTENT_ENCODING, CONTENT_TYPE};
const MAX_BYTES: usize = 65536;

pub(super) async fn call(
    endpoint: &str,
    key: &str,
    request: &ModelRequest,
) -> Result<ModelResponse, ModelFailure> {
    // One deadline covers headers and body. No automatic retries or redirects.
    tokio::time::timeout(
        std::time::Duration::from_secs(25),
        inner(endpoint, key, request),
    )
    .await
    .map_err(|_| ModelFailure::Timeout)?
}
async fn inner(
    endpoint: &str,
    key: &str,
    request: &ModelRequest,
) -> Result<ModelResponse, ModelFailure> {
    if key.is_empty() || key.len() > 8192 {
        return Err(ModelFailure::Provider);
    }
    let body = body(request);
    let bytes = body.to_string().len();
    if bytes > 24576 {
        return Err(ModelFailure::TokenCeiling);
    }
    // UTF-8 bytes plus fixed protocol margin bound input conservatively; output
    // cap includes reasoning tokens. Unknown results retain the runtime reservation.
    if cost(
        &request.model,
        bytes as u32 + 4096,
        request.max_output_tokens,
    )? > request.max_cost_microunits
    {
        return Err(ModelFailure::CostCeiling);
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .no_proxy()
        .build()
        .map_err(|_| ModelFailure::Provider)?;
    let mut response = client
        .post(endpoint)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|_| ModelFailure::Provider)?;
    if !response.status().is_success()
        || response.headers().contains_key(CONTENT_ENCODING)
        || !response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| {
                v.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .eq_ignore_ascii_case("application/json")
            })
        || response
            .content_length()
            .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err(ModelFailure::Provider);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ModelFailure::Provider)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_BYTES {
            return Err(ModelFailure::Provider);
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| ModelFailure::InvalidSchema)?;
    decode(&value, request)
}

pub(super) fn decode(value: &Value, request: &ModelRequest) -> Result<ModelResponse, ModelFailure> {
    if value["model"] != request.model {
        return Err(ModelFailure::ModelMismatch);
    }
    if !value["service_tier"].is_null() && value["service_tier"] != "default" {
        return Err(ModelFailure::CostCeiling);
    }
    let choices = value["choices"]
        .as_array()
        .filter(|c| c.len() == 1)
        .ok_or(ModelFailure::InvalidSchema)?;
    let choice = &choices[0];
    if choice["finish_reason"] != "stop"
        || choice["message"]["role"] != "assistant"
        || !choice["message"]["refusal"].is_null()
        || !choice["message"]["tool_calls"].is_null()
    {
        return Err(ModelFailure::InvalidSchema);
    }
    let text = choice["message"]["content"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 16384)
        .ok_or(ModelFailure::InvalidSchema)?;
    let input = value["usage"]["prompt_tokens"]
        .as_u64()
        .filter(|n| *n <= 32768)
        .ok_or(ModelFailure::TokenCeiling)? as u32;
    let output = value["usage"]["completion_tokens"]
        .as_u64()
        .filter(|n| *n <= u64::from(request.max_output_tokens))
        .ok_or(ModelFailure::TokenCeiling)? as u32;
    let price = cost(&request.model, input, output)?;
    if price > request.max_cost_microunits {
        return Err(ModelFailure::CostCeiling);
    }
    Ok(ModelResponse {
        text: text.into(),
        model: request.model.clone(),
        input_tokens: input,
        output_tokens: output,
        cost_microunits: price,
    })
}
