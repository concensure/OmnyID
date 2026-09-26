//! inference.rs — pluggable LLM inference backend
//!
//! Backends:
//!   - Anthropic (cloud, requires API key)
//!   - Ollama (local, no key required, fully private)
//!
//! The backend is selected per-user from `user_llm_config` via the agent
//! template system.

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InferenceRequest {
    pub system: String,
    pub messages: Vec<InferenceMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InferenceMessage {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InferenceResponse {
    pub content: String,
    pub model: String,
    pub tokens_input: i32,
    pub tokens_output: i32,
    /// Estimated cost in cents (0 for self-hosted backends)
    pub cost_cents: i32,
}

#[derive(Debug)]
pub enum InferenceError {
    Http(String),
    Api(String),
    BudgetExhausted,
    NotConfigured,
}

impl std::fmt::Display for InferenceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InferenceError::Http(s) => write!(f, "HTTP error: {s}"),
            InferenceError::Api(s) => write!(f, "API error: {s}"),
            InferenceError::BudgetExhausted => write!(f, "monthly budget exhausted"),
            InferenceError::NotConfigured => write!(f, "LLM backend not configured"),
        }
    }
}

// ── Anthropic backend ─────────────────────────────────────────────────────────

/// Approximate Haiku pricing: $0.80 / 1M input tokens, $4.00 / 1M output.
fn anthropic_cost_cents(tokens_input: i32, tokens_output: i32) -> i32 {
    let input_cents = (tokens_input as f64 * 0.0000008) as i32;
    let output_cents = (tokens_output as f64 * 0.000004) as i32;
    input_cents + output_cents
}

pub async fn anthropic_infer(
    api_key: &str,
    model: &str,
    req: &InferenceRequest,
) -> Result<InferenceResponse, InferenceError> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "max_tokens": req.max_tokens,
        "system": req.system,
        "messages": req.messages.iter().map(|m| serde_json::json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
    });
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(InferenceError::Api(format!("{status}: {text}")));
    }
    let json: Value = resp
        .json()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;
    let content = json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let tokens_input = json["usage"]["input_tokens"].as_i64().unwrap_or(0) as i32;
    let tokens_output = json["usage"]["output_tokens"].as_i64().unwrap_or(0) as i32;
    let cost_cents = anthropic_cost_cents(tokens_input, tokens_output);
    Ok(InferenceResponse {
        content,
        model: model.to_string(),
        tokens_input,
        tokens_output,
        cost_cents,
    })
}

// ── Ollama backend ────────────────────────────────────────────────────────────

pub async fn ollama_infer(
    ollama_url: &str,
    model: &str,
    req: &InferenceRequest,
) -> Result<InferenceResponse, InferenceError> {
    let client = reqwest::Client::new();
    // Build a single prompt from system + messages (Ollama /api/generate)
    let prompt = format!(
        "System: {}\n\n{}",
        req.system,
        req.messages
            .iter()
            .map(|m| format!("{}: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": { "num_predict": req.max_tokens, "temperature": req.temperature },
    });
    let url = format!("{}/api/generate", ollama_url.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(InferenceError::Api(format!("{status}: {text}")));
    }
    let json: Value = resp
        .json()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;
    let content = json["response"].as_str().unwrap_or("").to_string();
    let tokens_input = json["prompt_eval_count"].as_i64().unwrap_or(0) as i32;
    let tokens_output = json["eval_count"].as_i64().unwrap_or(0) as i32;
    Ok(InferenceResponse {
        content,
        model: model.to_string(),
        tokens_input,
        tokens_output,
        cost_cents: 0, // local inference has no monetary cost
    })
}

// ── RunPod (QWEN / vLLM) backend ─────────────────────────────────────────────

/// RunPod runsync endpoint — waits up to 90 s for the job to complete.
/// The endpoint must expose a vLLM-compatible `/runsync` handler.
pub async fn runpod_infer(
    endpoint_id: &str,
    api_key: &str,
    model: &str,
    req: &InferenceRequest,
) -> Result<InferenceResponse, InferenceError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| InferenceError::Http(e.to_string()))?;

    let messages: Vec<serde_json::Value> = std::iter::once(serde_json::json!({
        "role": "system",
        "content": req.system,
    }))
    .chain(req.messages.iter().map(|m| {
        serde_json::json!({
            "role": m.role,
            "content": m.content,
        })
    }))
    .collect();

    let body = serde_json::json!({
        "input": {
            "model": model,
            "messages": messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
        }
    });

    let url = format!("https://api.runpod.ai/v2/{}/runsync", endpoint_id);
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(InferenceError::Api(format!("{status}: {text}")));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;

    // RunPod wraps the vLLM response under "output"
    let output = &json["output"];
    let content = output["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let tokens_input = output["usage"]["prompt_tokens"].as_i64().unwrap_or(0) as i32;
    let tokens_output = output["usage"]["completion_tokens"].as_i64().unwrap_or(0) as i32;

    Ok(InferenceResponse {
        content,
        model: model.to_string(),
        tokens_input,
        tokens_output,
        cost_cents: 0, // self-hosted via RunPod; internal cost tracked separately
    })
}

// ── Unified backend ───────────────────────────────────────────────────────────

/// Selectable inference backend carried by modules that need to call an LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "backend", rename_all = "snake_case")]
pub enum InferenceBackend {
    Anthropic {
        api_key: String,
    },
    Ollama {
        url: String,
    },
    RunPod {
        endpoint_id: String,
        api_key: String,
    },
    OpenAICompat {
        base_url: String,
        api_key: String,
        cost_per_1m_input: f64,
        cost_per_1m_output: f64,
    },
}

/// Dispatch an inference request to the appropriate backend.
pub async fn dispatch_infer(
    backend: &InferenceBackend,
    model: &str,
    req: &InferenceRequest,
) -> Result<InferenceResponse, InferenceError> {
    match backend {
        InferenceBackend::Anthropic { api_key } => anthropic_infer(api_key, model, req).await,
        InferenceBackend::Ollama { url } => ollama_infer(url, model, req).await,
        InferenceBackend::RunPod {
            endpoint_id,
            api_key,
        } => runpod_infer(endpoint_id, api_key, model, req).await,
        InferenceBackend::OpenAICompat {
            base_url,
            api_key,
            cost_per_1m_input,
            cost_per_1m_output,
        } => {
            openai_compat_infer(
                base_url,
                api_key,
                model,
                *cost_per_1m_input,
                *cost_per_1m_output,
                req,
            )
            .await
        }
    }
}

/// OpenAI-compatible inference backend (NVIDIA NIM, Together AI, Anyscale, etc.)
async fn openai_compat_infer(
    base_url: &str,
    api_key: &str,
    model: &str,
    cost_per_1m_input: f64,
    cost_per_1m_output: f64,
    req: &InferenceRequest,
) -> Result<InferenceResponse, InferenceError> {
    let client = reqwest::Client::new();
    let messages: Vec<Value> = std::iter::once(serde_json::json!({
        "role": "system",
        "content": req.system,
    }))
    .chain(
        req.messages
            .iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content })),
    )
    .collect();
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
    });
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(InferenceError::Api(format!("{status}: {text}")));
    }
    let json: Value = resp
        .json()
        .await
        .map_err(|e| InferenceError::Http(e.to_string()))?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let tokens_input = json["usage"]["prompt_tokens"].as_i64().unwrap_or(0) as i32;
    let tokens_output = json["usage"]["completion_tokens"].as_i64().unwrap_or(0) as i32;
    let cost_cents = ((tokens_input as f64 / 1_000_000.0) * cost_per_1m_input
        + (tokens_output as f64 / 1_000_000.0) * cost_per_1m_output) as i32;
    Ok(InferenceResponse {
        content,
        model: model.to_string(),
        tokens_input,
        tokens_output,
        cost_cents,
    })
}

/// Construct an `InferenceBackend` from a backend name and API key string.
/// Used by route handlers that read backend config from DB or env vars.
pub fn build_inference_backend(backend: &str, api_key: &str) -> InferenceBackend {
    match backend {
        "ollama" => InferenceBackend::Ollama {
            url: std::env::var("OLLAMA_URL")
                .unwrap_or_else(|_| "http://localhost:11434".to_string()),
        },
        "runpod" => InferenceBackend::RunPod {
            endpoint_id: std::env::var("OMNYID_RUNPOD_ENDPOINT_ID").unwrap_or_default(),
            api_key: api_key.to_string(),
        },
        "nvidia" | "nvidia_nim" => InferenceBackend::OpenAICompat {
            base_url: "https://integrate.api.nvidia.com/v1".to_string(),
            api_key: api_key.to_string(),
            cost_per_1m_input: 0.0,
            cost_per_1m_output: 0.0,
        },
        _ => InferenceBackend::Anthropic {
            api_key: api_key.to_string(),
        },
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_cost_estimate_is_non_negative() {
        let cost = anthropic_cost_cents(1000, 500);
        assert!(cost >= 0);
    }

    #[test]
    fn inference_error_display_is_human_readable() {
        let e = InferenceError::BudgetExhausted;
        assert!(e.to_string().contains("budget"));
        let e2 = InferenceError::Http("connection refused".to_string());
        assert!(e2.to_string().contains("connection"));
    }

    #[test]
    fn inference_request_serializes_cleanly() {
        let req = InferenceRequest {
            system: "You are a helpful assistant.".to_string(),
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: "hello".to_string(),
            }],
            max_tokens: 512,
            temperature: 0.7,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("helpful assistant"));
        assert!(json.contains("max_tokens"));
    }

    #[test]
    fn build_inference_backend_supports_nvidia_nim() {
        match build_inference_backend("nvidia", "nvapi-test") {
            InferenceBackend::OpenAICompat {
                base_url, api_key, ..
            } => {
                assert_eq!(base_url, "https://integrate.api.nvidia.com/v1");
                assert_eq!(api_key, "nvapi-test");
            }
            other => panic!("expected NVIDIA OpenAI-compatible backend, got {other:?}"),
        }
    }
}
