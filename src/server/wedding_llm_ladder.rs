//! Shared, platform-funded LLM fallback for wedding features.
//!
//! Prompts and responses are intentionally never logged here. Feature routes own
//! their validation and their tenant-scoped metering receipt after a success.

use std::time::Duration;

use crate::inference::{InferenceBackend, InferenceMessage, InferenceRequest, dispatch_infer};
use crate::wedding_shared_tool_metering::WeddingSharedToolProvider;

use super::llm_resolution::{
    read_hosted_anthropic_api_key, read_hosted_cerebras_api_key, read_hosted_mistral_api_key,
};

pub const DEFAULT_CEREBRAS_MODEL: &str = "qwen-3.8-27b";
pub const DEFAULT_MISTRAL_MODEL: &str = "mistral-small-latest";
pub const DEFAULT_ANTHROPIC_MODEL: &str = "claude-haiku-5-5";
const PROVIDER_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeddingLlmFeature {
    Outreach,
    Interpreter,
    ConstraintCapture,
    Enrichment,
    QuoteNormalisation,
}

impl WeddingLlmFeature {
    const fn env_name(self) -> &'static str {
        match self {
            Self::Outreach => "OUTREACH",
            Self::Interpreter => "INTERPRETER",
            Self::ConstraintCapture => "CONSTRAINT_CAPTURE",
            Self::Enrichment => "ENRICHMENT",
            Self::QuoteNormalisation => "QUOTE_NORMALISATION",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeddingLlmProvider {
    Cerebras,
    Mistral,
    Anthropic,
}

impl WeddingLlmProvider {
    pub const ORDER: [Self; 3] = [Self::Cerebras, Self::Mistral, Self::Anthropic];

    pub const fn label(self) -> &'static str {
        match self {
            Self::Cerebras => "cerebras",
            Self::Mistral => "mistral",
            Self::Anthropic => "anthropic",
        }
    }

    pub const fn metering_provider(self) -> WeddingSharedToolProvider {
        match self {
            Self::Cerebras => WeddingSharedToolProvider::CerebrasLlm,
            Self::Mistral => WeddingSharedToolProvider::MistralLlm,
            Self::Anthropic => WeddingSharedToolProvider::AnthropicLlm,
        }
    }

    fn api_key(self) -> Option<String> {
        match self {
            Self::Cerebras => read_hosted_cerebras_api_key(),
            Self::Mistral => read_hosted_mistral_api_key(),
            Self::Anthropic => read_hosted_anthropic_api_key(),
        }
    }

    fn backend(self, api_key: String) -> InferenceBackend {
        match self {
            Self::Cerebras => InferenceBackend::OpenAICompat {
                base_url: "https://api.cerebras.ai/v1".to_string(),
                api_key,
                cost_per_1m_input: 0.0,
                cost_per_1m_output: 0.0,
            },
            Self::Mistral => InferenceBackend::OpenAICompat {
                base_url: "https://api.mistral.ai/v1".to_string(),
                api_key,
                cost_per_1m_input: 0.0,
                cost_per_1m_output: 0.0,
            },
            Self::Anthropic => InferenceBackend::Anthropic { api_key },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WeddingLlmAttempt {
    pub provider: WeddingLlmProvider,
    pub model: String,
    pub error_kind: String,
}

#[derive(Debug)]
pub enum LadderOutcome<T> {
    Success {
        value: T,
        provider: WeddingLlmProvider,
        model: String,
        tokens_input: i32,
        tokens_output: i32,
        cost_cents: i32,
        attempts: Vec<WeddingLlmAttempt>,
    },
    Exhausted {
        attempts: Vec<WeddingLlmAttempt>,
    },
}

fn valid_model(value: String) -> Option<String> {
    let value = value.trim().to_string();
    (!value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control))
        .then_some(value)
}

pub fn model_for(feature: WeddingLlmFeature, provider: WeddingLlmProvider) -> String {
    let provider_name = provider.label().to_ascii_uppercase();
    let exact = format!(
        "OMNYID_WEDDING_{}_{}_MODEL",
        feature.env_name(),
        provider_name
    );
    let outreach = format!("OMNYID_WEDDING_OUTREACH_{}_MODEL", provider_name);
    std::env::var(&exact)
        .ok()
        .and_then(valid_model)
        .or_else(|| std::env::var(&outreach).ok().and_then(valid_model))
        .unwrap_or_else(|| match provider {
            WeddingLlmProvider::Cerebras => DEFAULT_CEREBRAS_MODEL.to_string(),
            WeddingLlmProvider::Mistral => DEFAULT_MISTRAL_MODEL.to_string(),
            WeddingLlmProvider::Anthropic => DEFAULT_ANTHROPIC_MODEL.to_string(),
        })
}

fn warn_fallback(feature: WeddingLlmFeature, provider: WeddingLlmProvider, error_kind: &str) {
    tracing::warn!(
        feature = feature.env_name(),
        provider = provider.label(),
        error_kind,
        "wedding LLM provider unavailable; trying next provider"
    );
}

pub async fn run_ladder<T, Validate>(
    feature: WeddingLlmFeature,
    system: &str,
    user_text: &str,
    max_tokens: u32,
    validate: Validate,
) -> LadderOutcome<T>
where
    Validate: Fn(&str) -> Result<T, String>,
{
    run_ladder_with_temperature(feature, system, user_text, max_tokens, 0.6, validate).await
}

pub async fn run_ladder_with_temperature<T, Validate>(
    feature: WeddingLlmFeature,
    system: &str,
    user_text: &str,
    max_tokens: u32,
    temperature: f32,
    validate: Validate,
) -> LadderOutcome<T>
where
    Validate: Fn(&str) -> Result<T, String>,
{
    let temperature = if temperature.is_finite() {
        temperature.clamp(0.0, 2.0)
    } else {
        0.0
    };
    let mut attempts = Vec::new();
    for provider in WeddingLlmProvider::ORDER {
        let model = model_for(feature, provider);
        let Some(api_key) = provider.api_key() else {
            attempts.push(WeddingLlmAttempt {
                provider,
                model,
                error_kind: "missing_key".to_string(),
            });
            warn_fallback(feature, provider, "missing_key");
            continue;
        };
        let request = InferenceRequest {
            system: system.to_string(),
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: user_text.to_string(),
            }],
            max_tokens,
            temperature,
        };
        let result = tokio::time::timeout(
            PROVIDER_TIMEOUT,
            dispatch_infer(&provider.backend(api_key), &model, &request),
        )
        .await;
        let error_kind = match result {
            Err(_) => "timeout",
            Ok(Err(_)) => "transport",
            Ok(Ok(response)) if response.content.trim().is_empty() => "empty_output",
            Ok(Ok(response)) => match validate(&response.content) {
                Ok(value) => {
                    return LadderOutcome::Success {
                        value,
                        provider,
                        model,
                        tokens_input: response.tokens_input,
                        tokens_output: response.tokens_output,
                        cost_cents: response.cost_cents,
                        attempts,
                    };
                }
                Err(_) => "validation",
            },
        }
        .to_string();
        attempts.push(WeddingLlmAttempt {
            provider,
            model,
            error_kind: error_kind.clone(),
        });
        warn_fallback(feature, provider, &error_kind);
    }
    LadderOutcome::Exhausted { attempts }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn run_with<T, Validate, Invoke>(validate: Validate, mut invoke: Invoke) -> LadderOutcome<T>
    where
        Validate: Fn(&str) -> Result<T, String>,
        Invoke: FnMut(WeddingLlmProvider) -> Result<&'static str, &'static str>,
    {
        let mut attempts = Vec::new();
        for provider in WeddingLlmProvider::ORDER {
            let model = match provider {
                WeddingLlmProvider::Cerebras => DEFAULT_CEREBRAS_MODEL,
                WeddingLlmProvider::Mistral => DEFAULT_MISTRAL_MODEL,
                WeddingLlmProvider::Anthropic => DEFAULT_ANTHROPIC_MODEL,
            }
            .to_string();
            match invoke(provider).and_then(|raw| validate(raw).map_err(|_| "validation")) {
                Ok(value) => {
                    return LadderOutcome::Success {
                        value,
                        provider,
                        model,
                        tokens_input: 0,
                        tokens_output: 0,
                        cost_cents: 0,
                        attempts,
                    };
                }
                Err(error_kind) => attempts.push(WeddingLlmAttempt {
                    provider,
                    model,
                    error_kind: error_kind.to_string(),
                }),
            }
        }
        LadderOutcome::Exhausted { attempts }
    }

    #[test]
    fn cerebras_success_does_not_try_a_fallback() {
        let outcome = run_with(
            |value| Ok(value.to_string()),
            |provider| {
                assert_eq!(provider, WeddingLlmProvider::Cerebras);
                Ok("valid")
            },
        );
        assert!(
            matches!(outcome, LadderOutcome::Success { provider: WeddingLlmProvider::Cerebras, attempts, .. } if attempts.is_empty())
        );
    }

    #[test]
    fn failed_or_invalid_output_falls_through_in_order() {
        let outcome = run_with(
            |value| {
                (value == "valid")
                    .then(|| value.to_string())
                    .ok_or_else(|| "invalid".to_string())
            },
            |provider| match provider {
                WeddingLlmProvider::Cerebras => Ok("invalid"),
                WeddingLlmProvider::Mistral => Ok("valid"),
                WeddingLlmProvider::Anthropic => panic!("must not be called"),
            },
        );
        assert!(
            matches!(outcome, LadderOutcome::Success { provider: WeddingLlmProvider::Mistral, attempts, .. } if attempts[0].error_kind == "validation")
        );
    }

    #[test]
    fn transport_failure_falls_through_to_mistral() {
        let outcome = run_with(
            |value| Ok(value.to_string()),
            |provider| match provider {
                WeddingLlmProvider::Cerebras => Err("transport"),
                WeddingLlmProvider::Mistral => Ok("valid"),
                WeddingLlmProvider::Anthropic => panic!("must not be called"),
            },
        );
        assert!(
            matches!(outcome, LadderOutcome::Success { provider: WeddingLlmProvider::Mistral, attempts, .. } if attempts[0].error_kind == "transport")
        );
    }

    #[test]
    fn missing_earlier_keys_reaches_anthropic_default() {
        let outcome = run_with(
            |value| Ok(value.to_string()),
            |provider| match provider {
                WeddingLlmProvider::Cerebras | WeddingLlmProvider::Mistral => Err("missing_key"),
                WeddingLlmProvider::Anthropic => Ok("valid"),
            },
        );
        assert!(
            matches!(outcome, LadderOutcome::Success { provider: WeddingLlmProvider::Anthropic, ref model, attempts, .. } if model == DEFAULT_ANTHROPIC_MODEL && attempts.len() == 2)
        );
    }

    #[test]
    fn exhaustion_records_every_provider() {
        let outcome: LadderOutcome<()> =
            run_with(|_| Err("invalid".to_string()), |_| Err("transport"));
        assert!(
            matches!(outcome, LadderOutcome::Exhausted { attempts } if attempts.len() == 3 && attempts[2].provider == WeddingLlmProvider::Anthropic)
        );
    }

    #[test]
    fn feature_model_override_beats_outreach_fallback() {
        let _guard = env_lock().lock().expect("environment lock");
        let key = "OMNYID_WEDDING_INTERPRETER_CEREBRAS_MODEL";
        // SAFETY: the module test lock serialises the temporary process environment mutation.
        unsafe { std::env::set_var(key, "interpreter-test-model") };
        assert_eq!(
            model_for(WeddingLlmFeature::Interpreter, WeddingLlmProvider::Cerebras),
            "interpreter-test-model"
        );
        // SAFETY: see the matching set above.
        unsafe { std::env::remove_var(key) };
    }

    #[test]
    fn quotation_feature_has_an_independent_model_override() {
        let _guard = env_lock().lock().expect("environment lock");
        let key = "OMNYID_WEDDING_QUOTE_NORMALISATION_MISTRAL_MODEL";
        // SAFETY: the module test lock serialises the temporary process environment mutation.
        unsafe { std::env::set_var(key, "quote-normalisation-test-model") };
        assert_eq!(
            model_for(
                WeddingLlmFeature::QuoteNormalisation,
                WeddingLlmProvider::Mistral
            ),
            "quote-normalisation-test-model"
        );
        // SAFETY: see the matching set above.
        unsafe { std::env::remove_var(key) };
    }
}
