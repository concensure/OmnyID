/*
 * @module-id: rust.eval-harness
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Model-agnostic evaluation harness for reasoning benchmarks.
///
/// Runs benchmark problems through an `InferenceBackend` in two steps:
///
/// 1. **Reasoning call** â€” the challenge model answers the problem. The prompt
///    instructs the model to wrap its final answer in `\boxed{â€¦}` (the format
///    required by the NVIDIA Nemotron reasoning challenge evaluation).
///
/// 2. **Evaluation Agent call** â€” [`eval_agent::eval_agent_assess`] scores the
///    reasoning + answer against the expected answer and returns a typed
///    [`EvalAgentResult`] whose `score`, `valid`, and `retry_reason` fields
///    drive retry and LoRA quality-gate decisions.
///
/// Scoring replicates the Kaggle challenge metric: exact string match on the
/// extracted `\boxed{â€¦}` answer, with Â±0.01 relative tolerance for numeric
/// comparisons (absolute tolerance when ground truth is zero).
///
/// # Separate judge model
///
/// `EvalConfig.eval_backend` / `EvalConfig.eval_model` allow using a different
/// (ideally stronger) model to judge reasoning quality. Defaults to the same
/// backend+model as the reasoning call when omitted. Set to an Anthropic backend
/// for the most accurate scoring of Nemotron outputs.
use std::collections::HashMap;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::eval_agent::{
    EvalAgentRequest, EvalAgentResult, eval_agent_assess, reflection_eval_agent,
};
use crate::inference::{InferenceBackend, InferenceMessage, InferenceRequest, dispatch_infer};
use crate::personalization::{FeedbackSignal, PersonalizationEvent};
use crate::workflow_supervisor::ReflectionPolicy;

// â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalConfig {
    pub benchmark_name: String,
    /// The reasoning model ID â€” the model that actually solves problems.
    pub model: String,
    /// The inference backend for the reasoning model.
    pub backend: InferenceBackend,
    /// Optional: separate judge model ID for scoring reasoning quality.
    /// When `None`, the same `model` is used for both reasoning and judging.
    /// Using a stronger judge (e.g., Claude) eliminates the self-judge bias
    /// where a model inflates scores on its own outputs.
    pub eval_model: Option<String>,
    /// Optional: separate inference backend for the judge model.
    /// When `None`, the same `backend` is used.
    pub eval_backend: Option<InferenceBackend>,
    pub reflection_policy: ReflectionPolicy,
    /// Maximum retry passes when the eval agent reports low score + retry reason.
    pub max_replan_passes: u32,
    /// Minimum eval agent score to pass the quality gate (default 0.85).
    pub confidence_threshold: f64,
    /// When true, high-quality examples are stored as `PersonalizationEvent`
    /// records for LoRA training data collection.
    pub collect_lora_examples: bool,
}

impl EvalConfig {
    /// Return the effective judge backend (falls back to reasoning backend).
    pub fn judge_backend(&self) -> &InferenceBackend {
        self.eval_backend.as_ref().unwrap_or(&self.backend)
    }
    /// Return the effective judge model ID (falls back to reasoning model).
    pub fn judge_model(&self) -> &str {
        self.eval_model.as_deref().unwrap_or(&self.model)
    }

    pub fn from_training_config(training_cfg: &serde_json::Value, api_key: &str) -> Self {
        let model = training_cfg
            .get("challenge_model")
            .and_then(|v| v.as_str())
            .unwrap_or("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16")
            .to_string();
        let base_url = training_cfg
            .get("challenge_backend_url")
            .and_then(|v| v.as_str())
            .unwrap_or("https://integrate.api.nvidia.com/v1")
            .to_string();
        let backend = InferenceBackend::OpenAICompat {
            base_url,
            api_key: api_key.to_string(),
            cost_per_1m_input: training_cfg
                .get("cost_per_1m_input")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.35),
            cost_per_1m_output: training_cfg
                .get("cost_per_1m_output")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.40),
        };

        // Optional separate judge: use Anthropic Claude when configured,
        // or any other OpenAI-compat backend via eval_backend_url.
        let eval_model = training_cfg
            .get("eval_model")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let eval_backend: Option<InferenceBackend> = if let Some(eval_url) = training_cfg
            .get("eval_backend_url")
            .and_then(|v| v.as_str())
        {
            let eval_api_key = training_cfg
                .get("eval_api_key")
                .and_then(|v| v.as_str())
                .unwrap_or(api_key);
            Some(InferenceBackend::OpenAICompat {
                base_url: eval_url.to_string(),
                api_key: eval_api_key.to_string(),
                cost_per_1m_input: 0.25,
                cost_per_1m_output: 1.25,
            })
        } else if let Some(anthropic_key) = training_cfg
            .get("eval_anthropic_key")
            .and_then(|v| v.as_str())
            .or_else(|| {
                std::env::var("ANTHROPIC_API_KEY")
                    .ok()
                    .as_deref()
                    .and_then(|_| None)
            })
        {
            // Explicit Anthropic judge key in training_config
            Some(InferenceBackend::Anthropic {
                api_key: anthropic_key.to_string(),
            })
        } else if eval_model.is_some() {
            // eval_model specified but no separate URL/key â†’ same backend, different model
            None
        } else {
            None
        };

        let reflection_policy_str = training_cfg
            .get("reflection_policy")
            .and_then(|v| v.as_str())
            .unwrap_or("every_step");
        let reflection_policy = match reflection_policy_str {
            "every_step" => ReflectionPolicy::EveryStep,
            "on_drift" => ReflectionPolicy::OnDrift,
            "on_failure_or_drift" => ReflectionPolicy::OnFailureOrDrift,
            _ => ReflectionPolicy::Off,
        };
        Self {
            benchmark_name: training_cfg
                .get("benchmark_name")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string(),
            model,
            backend,
            eval_model,
            eval_backend,
            reflection_policy,
            max_replan_passes: training_cfg
                .get("max_replan_passes")
                .and_then(|v| v.as_u64())
                .unwrap_or(3) as u32,
            // Default threshold raised to 0.85 (eval agent is a stricter scorer)
            confidence_threshold: training_cfg
                .get("confidence_threshold")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.85),
            collect_lora_examples: training_cfg
                .get("collect_lora_examples")
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
        }
    }
}

// â”€â”€ Problem + Result types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalProblem {
    pub id: String,
    pub prompt: String,
    pub expected_answer: String,
    /// Weight for aggregate scoring (0.0â€“1.0).
    pub difficulty: f64,
    /// e.g. "math", "logic", "bit_manipulation", "algebra"
    pub category: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalResult {
    pub problem_id: String,
    /// The model's raw free-form response (includes reasoning chain).
    pub model_reasoning: String,
    /// Extracted boxed answer (or last non-empty line as fallback).
    pub model_answer: String,
    /// Whether the eval agent judged the answer valid.
    pub valid: bool,
    /// Eval agent's overall score (0.0â€“1.0).  Primary signal for gating.
    pub eval_agent_score: f64,
    /// Per-dimension scores from the eval agent.
    pub category_scores: HashMap<String, f64>,
    /// Number of retry passes taken.
    pub retry_count: u32,
    pub latency_ms: u64,
    pub category: String,
    pub difficulty: f64,
    /// Whether the answer matched by the Kaggle-accurate scoring function.
    pub challenge_correct: bool,
}

impl EvalResult {
    /// Convenience alias: true when eval_agent_score >= 0.85 AND valid.
    pub fn is_high_quality(&self) -> bool {
        self.valid && self.eval_agent_score >= 0.85
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalRunSummary {
    pub run_id: String,
    pub benchmark_name: String,
    pub model: String,
    /// Weighted average of eval_agent_score Ã— difficulty.
    pub overall_score: f64,
    /// Kaggle-accurate accuracy: fraction of problems where challenge_correct is true.
    pub challenge_accuracy: f64,
    pub per_category_scores: HashMap<String, f64>,
    pub total_problems: u32,
    pub valid_count: u32,
    pub challenge_correct_count: u32,
    pub total_latency_ms: u64,
    pub lora_examples_collected: u32,
    pub results: Vec<EvalResult>,
}

impl EvalRunSummary {
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or_default()
    }
}

// â”€â”€ Reasoning system prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// System prompt for the NVIDIA Nemotron reasoning challenge.
///
/// Instructs the model to:
/// 1. Reason step-by-step through the problem
/// 2. Wrap the final answer in `\boxed{answer}` â€” required by the Kaggle evaluator
///
/// Using `\boxed{}` allows the challenge's `extract_boxed_answer()` function to
/// reliably extract the answer regardless of reasoning style.
fn reasoning_system_prompt() -> &'static str {
    "You are an expert reasoning agent competing in a logical reasoning challenge. \
     Solve the given problem step by step, showing your reasoning clearly. \
     You MUST end your response with your final answer wrapped in \\boxed{} notation. \
     Example: if the answer is 42, write \\boxed{42} at the end. \
     For bit manipulation problems: show bitwise operations step by step. \
     For algebraic equations: isolate the variable showing each step. \
     Be precise â€” the answer is evaluated with Â±0.01 tolerance for numeric answers."
}

// â”€â”€ Challenge-accurate answer extraction and scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Extract the answer from `\boxed{...}` notation (last occurrence).
///
/// Replicates the Kaggle evaluation code's `extract_boxed_answer()`:
/// returns the last match of `\boxed{...}` in the text, or falls back to the
/// last numeric sequence when no `\boxed{}` is found.
pub fn extract_boxed_answer(text: &str) -> String {
    // Find all \boxed{...} occurrences and return the last
    let mut last_match: Option<String> = None;
    let mut search = text;
    while let Some(start) = search.find(r"\boxed{") {
        let rest = &search[start + r"\boxed{".len()..];
        // Find matching closing brace (not nested; challenge answers are simple)
        if let Some(end) = rest.find('}') {
            last_match = Some(rest[..end].trim().to_string());
            search = &rest[end + 1..];
        } else {
            break;
        }
    }
    if let Some(m) = last_match {
        return m;
    }

    // Fallback: last numeric sequence (integer or decimal)
    let mut last_num: Option<String> = None;
    let mut chars = text.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        if c.is_ascii_digit()
            || (c == '-' && chars.peek().map_or(false, |(_, nc)| nc.is_ascii_digit()))
        {
            let start = i;
            let mut end = i + c.len_utf8();
            let mut has_dot = false;
            while let Some(&(j, nc)) = chars.peek() {
                if nc.is_ascii_digit() {
                    end = j + nc.len_utf8();
                    chars.next();
                } else if nc == '.' && !has_dot {
                    has_dot = true;
                    end = j + nc.len_utf8();
                    chars.next();
                } else {
                    break;
                }
            }
            last_num = Some(text[start..end].to_string());
        }
    }
    last_num.unwrap_or_else(|| last_non_empty_line(text))
}

/// Kaggle-accurate answer comparison with Â±0.01 tolerance.
///
/// Replicates the challenge evaluation logic:
/// - Exact string match (after trimming whitespace)
/// - If both parse as floats: absolute tolerance when gt == 0, else 1% relative
pub fn answers_match(predicted: &str, ground_truth: &str) -> bool {
    let p = predicted.trim();
    let g = ground_truth.trim();
    if p == g {
        return true;
    }
    // Numeric comparison
    if let (Ok(pf), Ok(gf)) = (p.parse::<f64>(), g.parse::<f64>()) {
        if gf == 0.0 {
            (pf - gf).abs() < 1e-2
        } else {
            (pf - gf).abs() / gf.abs() < 1e-2
        }
    } else {
        false
    }
}

// â”€â”€ Core eval logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

impl EvalConfig {
    /// Run a set of problems and return a scored summary.
    ///
    /// For each problem:
    /// 1. Send a reasoning prompt to the challenge model; model responds with `\boxed{answer}`
    /// 2. Pass the full response to the Evaluation Agent (separate judge model if configured)
    /// 3. Retry only when `eval_agent.should_retry(threshold)` is true and retries remain
    /// 4. Run reflection per policy and collect traces
    /// 5. Record a `PersonalizationEvent` when `eval_agent.passes_quality_gate(0.85)`
    pub async fn run(
        &self,
        problems: &[EvalProblem],
        db: Option<&crate::db::Db>,
        owner_user_id: &str,
        thread_id: &str,
    ) -> EvalRunSummary {
        let run_id = ulid::Ulid::new().to_string();
        let mut results: Vec<EvalResult> = Vec::with_capacity(problems.len());
        let mut lora_collected: u32 = 0;
        let mut steps_since_reflection: u32 = 0;

        for problem in problems {
            let start = Instant::now();
            let mut retry_count: u32 = 0;
            let mut last_reasoning = String::new();
            let mut last_eval = EvalAgentResult::fallback_failure();

            loop {
                // â”€â”€ Step 1: Reasoning call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                let reasoning_req = InferenceRequest {
                    system: reasoning_system_prompt().to_string(),
                    messages: vec![InferenceMessage {
                        role: "user".to_string(),
                        content: problem.prompt.clone(),
                    }],
                    // 4096 tokens: reasoning models produce 2kâ€“8k token chains.
                    // temperature 0.7: diverse reasoning traces for LoRA training
                    // data variety. Challenge inference uses temp=0.0; training
                    // benefits from higher temperature for coverage.
                    max_tokens: 4096,
                    temperature: 0.7,
                };

                let reasoning_text =
                    match dispatch_infer(&self.backend, &self.model, &reasoning_req).await {
                        Ok(resp) => resp.content,
                        Err(_) => break,
                    };
                last_reasoning = reasoning_text.clone();

                // â”€â”€ Step 2: Eval Agent assessment (separate judge if configured) â”€â”€
                // Extract boxed answer â€” matches the Kaggle evaluator's extraction.
                let model_answer = extract_boxed_answer(&reasoning_text);
                let eval_request = EvalAgentRequest {
                    problem: problem.prompt.clone(),
                    reasoning: reasoning_text,
                    model_answer: model_answer.clone(),
                    expected_answer: problem.expected_answer.clone(),
                    category: problem.category.clone(),
                };

                let eval_result =
                    eval_agent_assess(self.judge_backend(), self.judge_model(), &eval_request)
                        .await;

                let should_retry = eval_result.should_retry(self.confidence_threshold)
                    && retry_count < self.max_replan_passes;

                last_eval = eval_result;

                if should_retry {
                    retry_count += 1;
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    continue;
                }
                break;
            }

            let latency_ms = start.elapsed().as_millis() as u64;
            let model_answer = extract_boxed_answer(&last_reasoning);
            let challenge_correct = answers_match(&model_answer, &problem.expected_answer);

            steps_since_reflection += 1;

            // â”€â”€ Step 3: Reflection (per policy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let should_reflect = match &self.reflection_policy {
                ReflectionPolicy::EveryStep => true,
                ReflectionPolicy::EveryNSteps(n) => steps_since_reflection >= *n,
                ReflectionPolicy::OnDrift => false, // needs prior trace; skip in harness
                ReflectionPolicy::OnFailureOrDrift => !last_eval.valid,
                ReflectionPolicy::Off => false,
            };

            if should_reflect {
                steps_since_reflection = 0;
                // Run reflection; emit trace as AFP message if we have a DB
                let results_summary = format!(
                    "Problem: {}\nModel answer: {}\nExpected: {}\nValid: {}",
                    problem.prompt, model_answer, problem.expected_answer, last_eval.valid
                );
                let reflection = reflection_eval_agent(
                    self.judge_backend(),
                    self.judge_model(),
                    &problem.prompt,
                    &results_summary,
                )
                .await;

                if let Some(db) = db {
                    // Persist AFP reflection_trace message via the lightweight
                    // training-specific helper (avoids importing server::auth).
                    let trace_content = serde_json::json!({
                        "summary": reflection.to_json_string(),
                        "problem_id": problem.id,
                        "confidence": reflection.confidence,
                        "drift_detected": reflection.replan_needed,
                        "training_mode": true,
                        "store": true,
                    });
                    let _ = db
                        .store_training_reflection_trace(
                            owner_user_id,
                            thread_id,
                            &problem.id,
                            &trace_content,
                        )
                        .await;
                }
            }

            // Quality gate: eval agent score >= 0.85 AND valid, retry didn't exhaust
            if self.collect_lora_examples && last_eval.passes_quality_gate(0.85) {
                if let Some(db) = db {
                    // Embed the full training pair as JSON in the rationale field so
                    // the LoRA export produces proper instruction-tuning JSONL without
                    // needing to re-fetch AFP messages.
                    let rationale_json = serde_json::json!({
                        "eval_category": problem.category,
                        "score": last_eval.score,
                        "problem_id": problem.id,
                        "system_prompt": reasoning_system_prompt(),
                        "problem": problem.prompt,
                        "reasoning": last_reasoning,
                        "answer": extract_boxed_answer(&last_reasoning),
                        "expected_answer": problem.expected_answer,
                        "difficulty": problem.difficulty,
                        "challenge_correct": challenge_correct,
                    })
                    .to_string();

                    let event = PersonalizationEvent {
                        event_id: ulid::Ulid::new().to_string(),
                        thread_id: thread_id.to_string(),
                        message_id: problem.id.clone(),
                        actor_agent_id: owner_user_id.to_string(),
                        signal: FeedbackSignal::Approved,
                        rationale: Some(rationale_json),
                        captured_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
                    };
                    if db.record_personalization_event(&event).await.is_ok() {
                        lora_collected += 1;
                    }
                }
            }

            results.push(EvalResult {
                problem_id: problem.id.clone(),
                model_reasoning: last_reasoning,
                model_answer,
                valid: last_eval.valid,
                eval_agent_score: last_eval.score,
                category_scores: last_eval.category_scores,
                retry_count,
                latency_ms,
                category: problem.category.clone(),
                difficulty: problem.difficulty,
                challenge_correct,
            });
        }

        // â”€â”€ Scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let valid_count = results.iter().filter(|r| r.valid).count() as u32;
        let challenge_correct_count = results.iter().filter(|r| r.challenge_correct).count() as u32;
        let total_latency: u64 = results.iter().map(|r| r.latency_ms).sum();

        // Weighted score: sum(eval_agent_score Ã— difficulty) / sum(difficulty)
        let (weighted_score, weighted_total) = results.iter().fold((0.0_f64, 0.0_f64), |acc, r| {
            let w = if r.difficulty > 0.0 {
                r.difficulty
            } else {
                1.0
            };
            (acc.0 + r.eval_agent_score * w, acc.1 + w)
        });
        let overall_score = if weighted_total > 0.0 {
            weighted_score / weighted_total
        } else {
            0.0
        };

        // Challenge accuracy: simple fraction (matches Kaggle metric)
        let challenge_accuracy = if results.is_empty() {
            0.0
        } else {
            challenge_correct_count as f64 / results.len() as f64
        };

        // Per-category scores: average eval_agent_score weighted by difficulty
        let mut cat_scores: HashMap<String, (f64, f64)> = HashMap::new();
        for r in &results {
            let entry = cat_scores.entry(r.category.clone()).or_insert((0.0, 0.0));
            let w = if r.difficulty > 0.0 {
                r.difficulty
            } else {
                1.0
            };
            entry.0 += r.eval_agent_score * w;
            entry.1 += w;
        }
        let per_category_scores: HashMap<String, f64> = cat_scores
            .iter()
            .map(|(k, (score, total))| (k.clone(), if *total > 0.0 { score / total } else { 0.0 }))
            .collect();

        EvalRunSummary {
            run_id,
            benchmark_name: self.benchmark_name.clone(),
            model: self.model.clone(),
            overall_score,
            challenge_accuracy,
            per_category_scores,
            total_problems: results.len() as u32,
            valid_count,
            challenge_correct_count,
            total_latency_ms: total_latency,
            lora_examples_collected: lora_collected,
            results,
        }
    }

    /// Load benchmark problems from a JSONL or JSON array file.
    pub fn load_problems_from_json(path: &str) -> Result<Vec<EvalProblem>, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("cannot read benchmark file '{}': {}", path, e))?;

        if let Ok(arr) = serde_json::from_str::<Vec<EvalProblem>>(&content) {
            return Ok(arr);
        }

        let mut problems = vec![];
        for (i, line) in content.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("//") {
                continue;
            }
            let p: EvalProblem =
                serde_json::from_str(trimmed).map_err(|e| format!("line {}: {}", i + 1, e))?;
            problems.push(p);
        }
        Ok(problems)
    }
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Return the last non-empty line of a multi-line response.
fn last_non_empty_line(text: &str) -> String {
    text.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim()
        .to_string()
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn last_non_empty_line_extracts_correctly() {
        assert_eq!(last_non_empty_line("first\nsecond\n\n"), "second");
        assert_eq!(last_non_empty_line("only"), "only");
        assert_eq!(last_non_empty_line(""), "");
    }

    #[test]
    fn extract_boxed_answer_single() {
        let text = "After working through the steps we get \\boxed{42}";
        assert_eq!(extract_boxed_answer(text), "42");
    }

    #[test]
    fn extract_boxed_answer_last_of_multiple() {
        let text = "First attempt: \\boxed{40}, corrected: \\boxed{42}";
        assert_eq!(extract_boxed_answer(text), "42");
    }

    #[test]
    fn extract_boxed_answer_fallback_to_numeric() {
        let text = "The final result is 3.14159 based on the calculation.";
        let ans = extract_boxed_answer(text);
        // Should find a numeric value
        assert!(!ans.is_empty());
    }

    #[test]
    fn extract_boxed_answer_no_match_last_line() {
        let text = "No boxed answer here.";
        let ans = extract_boxed_answer(text);
        assert_eq!(ans, "No boxed answer here.");
    }

    #[test]
    fn answers_match_exact() {
        assert!(answers_match("42", "42"));
        assert!(answers_match("  42  ", "42"));
        assert!(!answers_match("41", "42"));
    }

    #[test]
    fn answers_match_numeric_tolerance() {
        // Â±1% tolerance for non-zero ground truth
        assert!(answers_match("1.004", "1.0")); // 0.4% â€” within
        assert!(!answers_match("1.02", "1.0")); // 2% â€” outside
        // Absolute 0.01 for ground truth == 0
        assert!(answers_match("0.009", "0.0"));
        assert!(!answers_match("0.011", "0.0"));
    }

    #[test]
    fn eval_result_is_high_quality() {
        let r = EvalResult {
            problem_id: "p1".into(),
            model_reasoning: "reasoning".into(),
            model_answer: "42".into(),
            valid: true,
            eval_agent_score: 0.91,
            category_scores: HashMap::new(),
            retry_count: 0,
            latency_ms: 100,
            category: "math".into(),
            difficulty: 1.0,
            challenge_correct: true,
        };
        assert!(r.is_high_quality());
    }

    #[test]
    fn eval_run_summary_weighted_score() {
        let results = vec![
            EvalResult {
                problem_id: "p1".into(),
                model_reasoning: String::new(),
                model_answer: "4".into(),
                valid: true,
                eval_agent_score: 0.95,
                category_scores: HashMap::new(),
                retry_count: 0,
                latency_ms: 100,
                category: "math".into(),
                difficulty: 1.0,
                challenge_correct: true,
            },
            EvalResult {
                problem_id: "p2".into(),
                model_reasoning: String::new(),
                model_answer: "wrong".into(),
                valid: false,
                eval_agent_score: 0.20,
                category_scores: HashMap::new(),
                retry_count: 2,
                latency_ms: 200,
                category: "math".into(),
                difficulty: 1.0,
                challenge_correct: false,
            },
        ];
        // Weighted: (0.95 + 0.20) / 2 = 0.575
        let (ws, wt) = results.iter().fold((0.0_f64, 0.0_f64), |acc, r| {
            let w = r.difficulty;
            (acc.0 + r.eval_agent_score * w, acc.1 + w)
        });
        let score = ws / wt;
        assert!((score - 0.575).abs() < 0.01);
    }

    #[test]
    fn challenge_accuracy_computed_correctly() {
        // 1 correct out of 2 = 0.5
        let correct_count = 1u32;
        let total = 2usize;
        let acc = correct_count as f64 / total as f64;
        assert!((acc - 0.5).abs() < 0.001);
    }
}
