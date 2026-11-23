// @locs-version: 1.0
// @module-id: server.llm-resolution
// @primary-capability: user-scoped-llm-provider-resolution
// @stability: beta
use crate::admin_tool_secrets::{
    ANTHROPIC_LLM_SPEC, NVIDIA_LLM_SPEC, RUNPOD_LLM_SPEC, resolve_admin_tool_secret,
};
use crate::inference::InferenceBackend;
use crate::secret_manager::read_process_secret_trimmed;

use super::Db;
pub(crate) use super::openrouter_funded_inference::runbook::reserve_shared_runbook;

const DEFAULT_ANTHROPIC_MODEL: &str = "claude-haiku-4-5-20251001";
const DEFAULT_RUNPOD_MODEL: &str = "Qwen/Qwen3.5-35B-A3B";
const DEFAULT_NVIDIA_MODEL: &str = "meta/llama-3.3-70b-instruct";
const DEFAULT_MISTRAL_MODEL: &str = "mistral-small-latest";
const DEFAULT_HUGGINGFACE_MODEL: &str = "meta-llama/Llama-3.1-8B-Instruct";
const DEFAULT_OPENAI_MODEL: &str = "gpt-4o-mini";
const DEFAULT_OPENROUTER_MODEL: &str = "openai/gpt-4o-mini";
const DEFAULT_CEREBRAS_MODEL: &str = "llama3.1-70b";
const DEFAULT_TOGETHER_MODEL: &str = "meta-llama/Llama-3-8b-hf";
const NVIDIA_NIM_BASE_URL: &str = "https://integrate.api.nvidia.com/v1";
const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";

#[derive(Debug, Clone)]
pub(crate) struct ResolvedUserInferenceBackend {
    pub backend_name: String,
    pub model: String,
    pub backend: InferenceBackend,
}

pub(crate) async fn resolve_user_inference_backend(
    db: &Db,
    user_id: &str,
) -> Result<Option<ResolvedUserInferenceBackend>, sqlx::Error> {
    let Some(cfg) = db.get_llm_config(user_id).await? else {
        return Ok(None);
    };
    Ok(resolve_user_inference_backend_from_config(
        &cfg,
        db.get_byok_api_key(user_id).await?,
    ))
}

fn resolve_user_inference_backend_from_config(
    cfg: &serde_json::Value,
    byok_api_key: Option<String>,
) -> Option<ResolvedUserInferenceBackend> {
    let backend_name = cfg["backend"].as_str().unwrap_or("hosted").to_string();
    let provider = cfg["provider"].as_str().unwrap_or("anthropic");
    let configured_model = cfg["model"]
        .as_str()
        .filter(|value| !value.trim().is_empty());

    let (backend, model) = match backend_name.as_str() {
        "hosted" => {
            let monthly_budget_cents = cfg["monthly_budget_cents"].as_i64().unwrap_or(0);
            if monthly_budget_cents <= 0 {
                return None;
            }
            if let Some(api_key) = read_hosted_anthropic_api_key() {
                (
                    InferenceBackend::Anthropic { api_key },
                    configured_model
                        .unwrap_or(DEFAULT_ANTHROPIC_MODEL)
                        .to_string(),
                )
            } else if let Some(api_key) = read_hosted_nvidia_api_key() {
                (
                    nvidia_nim_backend(&api_key),
                    configured_model.unwrap_or(DEFAULT_NVIDIA_MODEL).to_string(),
                )
            } else {
                return None;
            }
        }
        "byok" => {
            let api_key = byok_api_key.unwrap_or_default();
            if api_key.trim().is_empty() {
                return None;
            }
            (
                byok_backend_for_provider(provider, &api_key),
                configured_model
                    .unwrap_or_else(|| default_model_for_provider(provider))
                    .to_string(),
            )
        }
        "ollama" => (
            InferenceBackend::Ollama {
                url: cfg["ollama_url"]
                    .as_str()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(DEFAULT_OLLAMA_URL)
                    .to_string(),
            },
            configured_model
                .unwrap_or(DEFAULT_ANTHROPIC_MODEL)
                .to_string(),
        ),
        "runpod" => {
            let api_key = read_runpod_api_key().unwrap_or_default();
            if api_key.trim().is_empty() {
                return None;
            }
            (
                InferenceBackend::RunPod {
                    endpoint_id: std::env::var("OMNYID_RUNPOD_ENDPOINT_ID").unwrap_or_default(),
                    api_key,
                },
                configured_model.unwrap_or(DEFAULT_RUNPOD_MODEL).to_string(),
            )
        }
        _ => return None,
    };

    Some(ResolvedUserInferenceBackend {
        backend_name,
        model,
        backend,
    })
}

pub(super) fn read_hosted_anthropic_api_key() -> Option<String> {
    resolve_admin_tool_secret(ANTHROPIC_LLM_SPEC)
        .map(|secret| secret.secret)
        .or_else(|| read_process_secret_trimmed("OMNYID_ANTHROPIC_KEY"))
        .or_else(|| read_process_secret_trimmed("ANTHROPIC_API_KEY"))
}

/// Platform-owned provider secret for the wedding draft failover chain. This
/// honours the normal `*_FILE` convention through `read_process_secret_trimmed`.
pub(super) fn read_hosted_cerebras_api_key() -> Option<String> {
    read_process_secret_trimmed("OMNYID_CEREBRAS_API_KEY")
        .or_else(|| read_process_secret_trimmed("CEREBRAS_API_KEY"))
}

/// Platform-owned provider secret for the wedding draft failover chain.
pub(super) fn read_hosted_mistral_api_key() -> Option<String> {
    read_process_secret_trimmed("OMNYID_MISTRAL_API_KEY")
        .or_else(|| read_process_secret_trimmed("MISTRAL_API_KEY"))
}

/// Platform-owned OpenRouter secret for bounded public Wedding tools. The
/// secret manager's normal `*_FILE` handling is retained in production.
pub(super) fn read_hosted_openrouter_api_key() -> Option<String> {
    read_process_secret_trimmed("OPENROUTER_API_KEY")
        .or_else(|| read_process_secret_trimmed("OMNYID_OPENROUTER_API_KEY"))
}

pub(super) fn hosted_wedding_draft_model_configured() -> bool {
    read_hosted_cerebras_api_key().is_some()
        || read_hosted_mistral_api_key().is_some()
        || read_hosted_anthropic_api_key().is_some()
}

fn read_hosted_nvidia_api_key() -> Option<String> {
    resolve_admin_tool_secret(NVIDIA_LLM_SPEC)
        .map(|secret| secret.secret)
        .or_else(|| read_process_secret_trimmed("OMNYID_NVIDIA_API_KEY"))
        .or_else(|| read_process_secret_trimmed("NVIDIA_API_KEY"))
}

fn read_runpod_api_key() -> Option<String> {
    resolve_admin_tool_secret(RUNPOD_LLM_SPEC)
        .map(|secret| secret.secret)
        .or_else(|| read_process_secret_trimmed("OMNYID_RUNPOD_API_KEY"))
}

pub(super) fn default_model_for_provider(provider: &str) -> &'static str {
    match provider {
        "openai" => DEFAULT_OPENAI_MODEL,
        "openrouter" => DEFAULT_OPENROUTER_MODEL,
        "cerebras" => DEFAULT_CEREBRAS_MODEL,
        "together_ai" => DEFAULT_TOGETHER_MODEL,
        "nvidia" | "nvidia_nim" => DEFAULT_NVIDIA_MODEL,
        "mistral" => DEFAULT_MISTRAL_MODEL,
        "huggingface" | "hugging_face" => DEFAULT_HUGGINGFACE_MODEL,
        _ => DEFAULT_ANTHROPIC_MODEL,
    }
}

fn byok_backend_for_provider(provider: &str, api_key: &str) -> InferenceBackend {
    match provider {
        "openai" => openai_compat_backend("https://api.openai.com/v1", api_key),
        "openrouter" => openai_compat_backend("https://openrouter.ai/api/v1", api_key),
        "cerebras" => openai_compat_backend("https://api.cerebras.ai/v1", api_key),
        "together_ai" => openai_compat_backend("https://api.together.xyz/v1", api_key),
        "mistral" => openai_compat_backend("https://api.mistral.ai/v1", api_key),
        "huggingface" | "hugging_face" => {
            openai_compat_backend("https://router.huggingface.co/v1", api_key)
        }
        "nvidia" | "nvidia_nim" => nvidia_nim_backend(api_key),
        _ => InferenceBackend::Anthropic {
            api_key: api_key.to_string(),
        },
    }
}

fn nvidia_nim_backend(api_key: &str) -> InferenceBackend {
    openai_compat_backend(NVIDIA_NIM_BASE_URL, api_key)
}

fn openai_compat_backend(base_url: &str, api_key: &str) -> InferenceBackend {
    InferenceBackend::OpenAICompat {
        base_url: base_url.to_string(),
        api_key: api_key.to_string(),
        // BYOK requests should not accrue hosted-spend charges inside OmnyID.
        cost_per_1m_input: 0.0,
        cost_per_1m_output: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn resolves_openrouter_byok_to_openai_compat_backend() {
        let cfg = serde_json::json!({
            "backend": "byok",
            "provider": "openrouter",
            "model": "openai/gpt-4o-mini",
        });
        let resolved =
            resolve_user_inference_backend_from_config(&cfg, Some("sk-or-test".to_string()))
                .unwrap();
        match resolved.backend {
            InferenceBackend::OpenAICompat { base_url, .. } => {
                assert_eq!(base_url, "https://openrouter.ai/api/v1");
            }
            other => panic!("expected openai compat backend, got {other:?}"),
        }
    }

    #[test]
    fn provider_defaults_match_their_api_model_names_when_the_model_is_omitted() {
        for (provider, expected) in [
            ("openai", DEFAULT_OPENAI_MODEL),
            ("openrouter", DEFAULT_OPENROUTER_MODEL),
            ("cerebras", DEFAULT_CEREBRAS_MODEL),
            ("together_ai", DEFAULT_TOGETHER_MODEL),
        ] {
            let cfg = serde_json::json!({ "backend": "byok", "provider": provider });
            let resolved =
                resolve_user_inference_backend_from_config(&cfg, Some("test-key".to_string()))
                    .expect("provider should resolve");
            assert_eq!(resolved.model, expected);
        }
    }

    #[test]
    fn resolves_nvidia_byok_to_nim_openai_compat_backend() {
        let cfg = serde_json::json!({
            "backend": "byok",
            "provider": "nvidia",
        });
        let resolved =
            resolve_user_inference_backend_from_config(&cfg, Some("nvapi-test".to_string()))
                .unwrap();
        assert_eq!(resolved.model, DEFAULT_NVIDIA_MODEL);
        match resolved.backend {
            InferenceBackend::OpenAICompat { base_url, .. } => {
                assert_eq!(base_url, NVIDIA_NIM_BASE_URL);
            }
            other => panic!("expected NVIDIA OpenAI compat backend, got {other:?}"),
        }
    }

    #[test]
    fn resolves_mistral_byok_to_openai_compat_backend() {
        let cfg = serde_json::json!({
            "backend": "byok",
            "provider": "mistral",
        });
        let resolved =
            resolve_user_inference_backend_from_config(&cfg, Some("mistral-test".to_string()))
                .unwrap();
        assert_eq!(resolved.model, DEFAULT_MISTRAL_MODEL);
        match resolved.backend {
            InferenceBackend::OpenAICompat { base_url, .. } => {
                assert_eq!(base_url, "https://api.mistral.ai/v1");
            }
            other => panic!("expected Mistral OpenAI compat backend, got {other:?}"),
        }
    }

    #[test]
    fn resolves_huggingface_byok_to_openai_compat_backend() {
        let cfg = serde_json::json!({
            "backend": "byok",
            "provider": "huggingface",
        });
        let resolved =
            resolve_user_inference_backend_from_config(&cfg, Some("hf_test".to_string())).unwrap();
        assert_eq!(resolved.model, DEFAULT_HUGGINGFACE_MODEL);
        match resolved.backend {
            InferenceBackend::OpenAICompat { base_url, .. } => {
                assert_eq!(base_url, "https://router.huggingface.co/v1");
            }
            other => panic!("expected Hugging Face OpenAI compat backend, got {other:?}"),
        }
    }

    #[test]
    fn hosted_backend_falls_back_to_nvidia_when_anthropic_is_missing() {
        let _guard = env_lock().lock().unwrap();
        unsafe {
            std::env::remove_var("OMNYID_ANTHROPIC_KEY");
            std::env::remove_var("OMNYID_ANTHROPIC_KEY_FILE");
            std::env::remove_var("ANTHROPIC_API_KEY");
            std::env::remove_var("ANTHROPIC_API_KEY_FILE");
            std::env::set_var("OMNYID_NVIDIA_API_KEY", "nvapi-test");
        }
        let cfg = serde_json::json!({
            "backend": "hosted",
            "monthly_budget_cents": 100,
        });
        let resolved = resolve_user_inference_backend_from_config(&cfg, None).unwrap();

        assert_eq!(resolved.model, DEFAULT_NVIDIA_MODEL);
        match resolved.backend {
            InferenceBackend::OpenAICompat { base_url, .. } => {
                assert_eq!(base_url, NVIDIA_NIM_BASE_URL);
            }
            other => panic!("expected NVIDIA hosted fallback backend, got {other:?}"),
        }

        unsafe {
            std::env::remove_var("OMNYID_NVIDIA_API_KEY");
        }
    }

    #[test]
    fn hosted_backend_requires_positive_budget() {
        let cfg = serde_json::json!({
            "backend": "hosted",
            "model": "claude-haiku-4-5-20251001",
            "monthly_budget_cents": 0,
        });
        assert!(resolve_user_inference_backend_from_config(&cfg, None).is_none());
    }

    #[test]
    fn ollama_backend_prefers_saved_url() {
        let cfg = serde_json::json!({
            "backend": "ollama",
            "model": "llama3.2",
            "ollama_url": "http://10.0.0.8:11434",
        });
        let resolved = resolve_user_inference_backend_from_config(&cfg, None).unwrap();
        match resolved.backend {
            InferenceBackend::Ollama { url } => {
                assert_eq!(url, "http://10.0.0.8:11434");
            }
            other => panic!("expected ollama backend, got {other:?}"),
        }
    }
}
