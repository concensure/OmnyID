/*
 * @module-id: rust.eval-agent
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Evaluation Agent â€” structured LLM-based scoring with clean JSON-only output.
///
/// Replaces brittle text parsing (CoT suffix extraction, regex scanning) with
/// two dedicated agent functions whose **entire response** is a JSON object at
/// `temperature = 0.1`.  Callers receive typed structs; no raw-text parsing
/// happens outside this module.
///
/// # AFP alignment
/// Every agent call maps to an AFP `node_request` â†’ `node_result` exchange:
/// - The serialised request payload is the `node_request` content.
/// - The returned struct, once serialised by the caller, is the `node_result`.
/// - The caller (eval_harness, workflow_supervisor) creates the delegation key
///   and wraps the result in `NodeResult` â€” consistent with all other nodes.
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::inference::{InferenceBackend, InferenceMessage, InferenceRequest, dispatch_infer};

// â”€â”€ AFP subtypes emitted by this module â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Re-exported from message.rs to avoid duplication; callers may use either path.

pub use crate::message::AFP_SUBTYPE_EVAL_AGENT_RESULT;
pub use crate::message::AFP_SUBTYPE_REFLECTION_EVAL_RESULT;

// â”€â”€ Evaluation Agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Input to the Evaluation Agent.  Carries the problem, the reasoning the
/// model produced, and both the model's answer and the expected answer so the
/// agent can perform semantic (not just lexical) comparison.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalAgentRequest {
    pub problem: String,
    /// The full reasoning chain the reasoning model produced (free-form text).
    pub reasoning: String,
    pub model_answer: String,
    pub expected_answer: String,
    /// e.g. "math", "logic", "reading_comprehension" â€” used to populate
    /// `category_scores` with dimension labels relevant to the problem type.
    pub category: String,
}

/// Typed output from the Evaluation Agent.
///
/// The `score` field is the primary signal used for retry decisions and the
/// LoRA quality gate.  `retry_reason` is `Some` only when `score < 0.80` â€”
/// callers must check both to decide whether to retry.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvalAgentResult {
    /// True if the model answer is semantically correct.
    pub valid: bool,
    /// Overall quality score (0.0â€“1.0).  Target for challenge: â‰¥ 0.90.
    pub score: f64,
    /// Per-dimension scores keyed by dimension name.
    pub category_scores: HashMap<String, f64>,
    /// Non-null only when `score < 0.80`; contains a specific actionable
    /// suggestion for what to retry differently.
    pub retry_reason: Option<String>,
    /// The agent's own confidence in this assessment (0.0â€“1.0).
    pub confidence: f64,
}

impl EvalAgentResult {
    /// Safe default returned when the agent call fails or JSON cannot be
    /// parsed.  Signals "not valid, score 0, should retry" so the outer loop
    /// always handles failure gracefully.
    pub fn fallback_failure() -> Self {
        Self {
            valid: false,
            score: 0.0,
            category_scores: HashMap::new(),
            retry_reason: Some("eval agent unavailable â€” auto-retry".to_string()),
            confidence: 0.0,
        }
    }

    /// Returns true when this result passes the quality gate for LoRA export.
    pub fn passes_quality_gate(&self, threshold: f64) -> bool {
        self.score >= threshold && self.retry_reason.is_none()
    }

    /// Returns true when the caller should retry (low score AND explicit reason).
    pub fn should_retry(&self, threshold: f64) -> bool {
        self.score < threshold && self.retry_reason.is_some()
    }
}

/// System prompt that constrains the Evaluation Agent to JSON-only output.
fn eval_agent_system_prompt() -> &'static str {
    "You are an evaluation agent. Your ONLY output must be a single JSON object \
     with no other text, no markdown fences, no explanation.\n\
     JSON schema (all fields required):\n\
     {\n\
       \"valid\": <bool>,\n\
       \"score\": <float 0.0-1.0>,\n\
       \"category_scores\": {\"accuracy\": <float>, \"reasoning_quality\": <float>, \"completeness\": <float>},\n\
       \"retry_reason\": <string or null>,\n\
       \"confidence\": <float 0.0-1.0>\n\
     }\n\
     Field semantics:\n\
     - valid: true if the model answer is semantically correct given the problem\n\
     - score: weighted average of category scores, overall quality 0.0-1.0\n\
     - accuracy: is the final answer correct (0-1)\n\
     - reasoning_quality: are the reasoning steps sound and complete (0-1)\n\
     - completeness: does the response fully address every part of the question (0-1)\n\
     - retry_reason: null when score >= 0.80; otherwise ONE specific actionable \
       instruction describing what should be corrected on retry\n\
     - confidence: your confidence in this evaluation (0-1)\n\
     Output ONLY the JSON object. Any non-JSON output is a failure."
}

/// Call the Evaluation Agent to score a reasoning result.
///
/// Uses `temperature = 0.1` so the model's response is reliably JSON.
/// Falls back to `EvalAgentResult::fallback_failure()` on any error.
pub async fn eval_agent_assess(
    backend: &InferenceBackend,
    model: &str,
    request: &EvalAgentRequest,
) -> EvalAgentResult {
    let user_content = serde_json::json!({
        "problem": request.problem,
        "model_reasoning": request.reasoning,
        "model_answer": request.model_answer,
        "expected_answer": request.expected_answer,
        "category": request.category,
    })
    .to_string();

    let req = InferenceRequest {
        system: eval_agent_system_prompt().to_string(),
        messages: vec![InferenceMessage {
            role: "user".to_string(),
            content: user_content,
        }],
        max_tokens: 256,
        temperature: 0.1,
    };

    let text = match dispatch_infer(backend, model, &req).await {
        Ok(resp) => resp.content,
        Err(_) => return EvalAgentResult::fallback_failure(),
    };

    parse_eval_agent_json(&text)
}

/// Parse a JSON-only eval agent response into `EvalAgentResult`.
/// Falls back to `fallback_failure()` if the JSON is malformed or missing fields.
fn parse_eval_agent_json(text: &str) -> EvalAgentResult {
    // The response should be pure JSON; find the outermost `{...}` block.
    let text = text.trim();
    let start = text.find('{').unwrap_or(0);
    let end = text.rfind('}').map(|i| i + 1).unwrap_or(text.len());
    let json_str = &text[start..end];

    let v: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return EvalAgentResult::fallback_failure(),
    };

    let valid = v.get("valid").and_then(|x| x.as_bool()).unwrap_or(false);
    let score = v
        .get("score")
        .and_then(|x| x.as_f64())
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);
    let confidence = v
        .get("confidence")
        .and_then(|x| x.as_f64())
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);
    let retry_reason = v.get("retry_reason").and_then(|x| {
        if x.is_null() {
            None
        } else {
            x.as_str().map(str::to_string)
        }
    });

    let category_scores: HashMap<String, f64> = v
        .get("category_scores")
        .and_then(|x| x.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, val)| val.as_f64().map(|f| (k.clone(), f.clamp(0.0, 1.0))))
                .collect()
        })
        .unwrap_or_default();

    EvalAgentResult {
        valid,
        score,
        category_scores,
        retry_reason,
        confidence,
    }
}

// â”€â”€ Reflection Evaluation Agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Result of a single parallel reflection check.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReflectionCheckResult {
    pub passed: bool,
    pub notes: String,
    /// "none" | "warning" | "error" â€” only "error" triggers replanning.
    pub severity: String,
}

impl ReflectionCheckResult {
    fn fallback_pass(kind: &str) -> Self {
        Self {
            passed: true,
            notes: format!("{kind} check unavailable â€” defaulting to pass"),
            severity: "none".to_string(),
        }
    }
}

/// Combined result from all three parallel reflection checks.
///
/// `replan_needed` is true when any check returns `severity = "error"`.
/// `replan_suggestions` collects the `notes` of all failing checks for the
/// supervisor's replan prompt.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReflectionEvalResult {
    /// True when ALL three checks passed (no errors or warnings).
    pub pass: bool,
    /// True when any check has `severity = "error"` â€” triggers supervisor replan.
    pub replan_needed: bool,
    /// Specific corrections from failing checks, passed to the replan prompt.
    pub replan_suggestions: Vec<String>,
    /// Individual check results keyed by check name.
    pub checks: HashMap<String, ReflectionCheckResult>,
    /// Confidence derived from the fraction of checks that passed (0.0â€“1.0).
    pub confidence: f64,
}

impl ReflectionEvalResult {
    /// Safe default: all checks pass, no replan.  Used when all 3 calls fail.
    pub fn fallback_pass() -> Self {
        let mut checks = HashMap::new();
        for kind in ["logical", "factual", "completeness"] {
            checks.insert(kind.to_string(), ReflectionCheckResult::fallback_pass(kind));
        }
        Self {
            pass: true,
            replan_needed: false,
            replan_suggestions: vec![],
            checks,
            confidence: 0.5, // signal uncertainty when falling back
        }
    }

    /// Serialise to JSON string for embedding in `NodeResult.output`.
    pub fn to_json_string(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }
}

/// System prompt for a single reflection check.  Each check asks about only
/// one dimension so the model cannot conflate concerns.
fn reflection_check_system_prompt(kind: &str) -> String {
    let check_description = match kind {
        "logical" => {
            "logical validity â€” are all reasoning steps in the workflow results \
            logically valid? Look for non-sequiturs, invalid inferences, circular \
            reasoning, or steps that do not follow from the previous ones."
        }
        "factual" => {
            "factual accuracy â€” are all stated facts in the workflow results \
            accurate? Look for factual errors, unsubstantiated claims, incorrect \
            numbers, or contradictions with widely accepted knowledge."
        }
        "completeness" => {
            "completeness â€” does the workflow output fully address the \
            original objective? Look for missing steps, partially answered questions, \
            or objectives that were misunderstood and not addressed."
        }
        _ => "overall quality",
    };

    format!(
        "You are a {kind} checker evaluating an AI workflow's output. \
         Your ONLY output must be a single JSON object with no other text.\n\
         You check ONLY for {check_description}\n\
         JSON schema (all fields required):\n\
         {{\"passed\": <bool>, \"notes\": <string>, \"severity\": <\"none\"|\"warning\"|\"error\">}}\n\
         - passed: true if the check passes (no issues found)\n\
         - notes: one or two sentences of specific, actionable observation; \
           empty string if passed is true\n\
         - severity: \"none\" if passed, \"warning\" for minor issues, \
           \"error\" for issues that require replanning\n\
         Output ONLY the JSON object."
    )
}

async fn run_reflection_check(
    backend: &InferenceBackend,
    model: &str,
    kind: &str,
    objective: &str,
    results_summary: &str,
) -> ReflectionCheckResult {
    let user_content =
        format!("Objective: {objective}\n\nWorkflow execution results:\n{results_summary}");

    let req = InferenceRequest {
        system: reflection_check_system_prompt(kind),
        messages: vec![InferenceMessage {
            role: "user".to_string(),
            content: user_content,
        }],
        max_tokens: 200,
        temperature: 0.1,
    };

    let text = match dispatch_infer(backend, model, &req).await {
        Ok(resp) => resp.content,
        Err(_) => return ReflectionCheckResult::fallback_pass(kind),
    };

    parse_reflection_check_json(&text, kind)
}

fn parse_reflection_check_json(text: &str, kind: &str) -> ReflectionCheckResult {
    let text = text.trim();
    let start = text.find('{').unwrap_or(0);
    let end = text.rfind('}').map(|i| i + 1).unwrap_or(text.len());
    let json_str = &text[start..end];

    let v: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return ReflectionCheckResult::fallback_pass(kind),
    };

    ReflectionCheckResult {
        passed: v.get("passed").and_then(|x| x.as_bool()).unwrap_or(true),
        notes: v
            .get("notes")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        severity: v
            .get("severity")
            .and_then(|x| x.as_str())
            .unwrap_or("none")
            .to_string(),
    }
}

/// Run three parallel reflection checks (logical, factual, completeness) and
/// merge the results into a single `ReflectionEvalResult`.
///
/// All three LLM calls happen concurrently via `tokio::join!`.  A single
/// failing call does not block the others â€” it falls back to `passed = true`
/// so one unhealthy endpoint never stops the workflow.
pub async fn reflection_eval_agent(
    backend: &InferenceBackend,
    model: &str,
    objective: &str,
    results_summary: &str,
) -> ReflectionEvalResult {
    // Three checks run concurrently â€” no sequential latency on the critical path.
    let (logical, factual, completeness) = tokio::join!(
        run_reflection_check(backend, model, "logical", objective, results_summary),
        run_reflection_check(backend, model, "factual", objective, results_summary),
        run_reflection_check(backend, model, "completeness", objective, results_summary),
    );

    let checks_vec = [
        ("logical", logical),
        ("factual", factual),
        ("completeness", completeness),
    ];

    let mut replan_suggestions: Vec<String> = vec![];
    let mut error_count: u32 = 0;
    let mut warning_count: u32 = 0;
    let mut passed_count: u32 = 0;
    let mut checks = HashMap::new();

    for (name, check) in checks_vec {
        match check.severity.as_str() {
            "error" => {
                error_count += 1;
                if !check.notes.is_empty() {
                    replan_suggestions.push(format!("[{name}] {}", check.notes));
                }
            }
            "warning" => {
                warning_count += 1;
            }
            _ => {
                passed_count += 1;
            }
        }
        checks.insert(name.to_string(), check);
    }

    let total = 3u32;
    let replan_needed = error_count > 0;
    let pass = error_count == 0 && warning_count == 0;
    // Confidence: 1.0 when all pass, degrades per warning/error
    let confidence = (passed_count as f64 - (warning_count as f64 * 0.2)) / total as f64;
    let confidence = confidence.clamp(0.0, 1.0);

    ReflectionEvalResult {
        pass,
        replan_needed,
        replan_suggestions,
        checks,
        confidence,
    }
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_eval_agent_valid_json() {
        let json = r#"{"valid":true,"score":0.92,"category_scores":{"accuracy":0.95,"reasoning_quality":0.9,"completeness":0.9},"retry_reason":null,"confidence":0.88}"#;
        let result = parse_eval_agent_json(json);
        assert!(result.valid);
        assert!((result.score - 0.92).abs() < 0.01);
        assert!(result.retry_reason.is_none());
        assert!(!result.category_scores.is_empty());
    }

    #[test]
    fn parse_eval_agent_low_score_has_retry_reason() {
        let json = r#"{"valid":false,"score":0.42,"category_scores":{"accuracy":0.2,"reasoning_quality":0.5,"completeness":0.6},"retry_reason":"The final answer is numerically wrong; re-check step 2","confidence":0.85}"#;
        let result = parse_eval_agent_json(json);
        assert!(!result.valid);
        assert!(result.retry_reason.is_some());
        assert!(result.should_retry(0.80));
    }

    #[test]
    fn parse_eval_agent_malformed_returns_fallback() {
        let result = parse_eval_agent_json("I cannot evaluate this.");
        assert!(!result.valid);
        assert_eq!(result.score, 0.0);
        assert!(result.retry_reason.is_some());
    }

    #[test]
    fn parse_reflection_check_json_valid() {
        let json = r#"{"passed":false,"notes":"Step 3 conclusion does not follow from step 2","severity":"error"}"#;
        let result = parse_reflection_check_json(json, "logical");
        assert!(!result.passed);
        assert_eq!(result.severity, "error");
        assert!(!result.notes.is_empty());
    }

    #[test]
    fn reflection_eval_result_fallback_is_safe() {
        let r = ReflectionEvalResult::fallback_pass();
        assert!(r.pass);
        assert!(!r.replan_needed);
        assert_eq!(r.checks.len(), 3);
    }

    #[test]
    fn quality_gate_threshold() {
        let passing = EvalAgentResult {
            valid: true,
            score: 0.87,
            category_scores: HashMap::new(),
            retry_reason: None,
            confidence: 0.9,
        };
        assert!(passing.passes_quality_gate(0.85));
        assert!(!passing.passes_quality_gate(0.90));

        let failing = EvalAgentResult {
            valid: false,
            score: 0.60,
            category_scores: HashMap::new(),
            retry_reason: Some("wrong answer".to_string()),
            confidence: 0.85,
        };
        assert!(!failing.passes_quality_gate(0.85));
        assert!(failing.should_retry(0.85));
    }
}
