/*
 * @module-id: rust.proactive-llm-gate
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Proactive agent â€” Layer 4: Selective LLM Activation Gate (P4.1â€“P4.4).
///
/// P4.1 â€” `should_invoke_llm()`: pure function; no LLM needed for the decision itself.
/// P4.2 â€” `build_context_prompt()`: context-compressed prompt (~400 tokens max overhead).
/// P4.3 â€” `validate_llm_suggestion()`: parse and validate raw LLM JSON against AFP schema.
/// P4.4 â€” `check_token_budget()` / `log_token_usage()`: per-heuristic daily token cap.
///
/// Callers: `proactive_routes::ingest_passive_event_http` runs this after the heuristic
/// evaluator when `should_invoke_llm` returns true AND the token budget allows it.
use serde_json::Value;
use tracing::warn;

use crate::db::Db;
use crate::inference::{
    InferenceBackend, InferenceMessage, InferenceRequest, InferenceResponse, dispatch_infer,
};
use crate::message::AfpProactiveSuggestionContent;
use crate::proactive_engine::EvaluationResult;
use crate::prompt_guidance::append_reasoning_guidance;

/// If the daily token budget per heuristic is not set, use this default.
pub const DEFAULT_DAILY_TOKEN_BUDGET: i64 = 200;

/// Confidence above which the template-only path is used (no LLM synthesis needed).
const AUTO_GENERATE_THRESHOLD: f64 = 0.85;

// â”€â”€ P4.1 â€” Activation decision â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Returns `true` when the LLM should be invoked to improve a proactive suggestion.
///
/// LLM is skipped when:
/// - Confidence is already above the auto-generate threshold, OR
/// - The action template description contains no placeholders (no synthesis needed).
///
/// Zero token cost for the decision itself.
pub fn should_invoke_llm(result: &EvaluationResult) -> bool {
    if result.suggestion.confidence >= AUTO_GENERATE_THRESHOLD {
        return false;
    }
    // Check whether the description contains template placeholders ({entity}, {name}, etc.)
    // that require synthesis.  If none, template output is already complete.
    let has_placeholders =
        result.suggestion.description.contains('{') && result.suggestion.description.contains('}');
    has_placeholders
}

// â”€â”€ P4.2 â€” Context-compressed prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a compact LLM prompt that injects behavioral + temporal context.
/// Max overhead: ~400 tokens.  Returns (system_prompt, user_message).
pub fn build_context_prompt(
    event_subtype: &str,
    result: &EvaluationResult,
    behavioral_memory: &[Value],
    temporal_summary: &[Value],
    reasoning_guidance: &[String],
) -> (String, String) {
    let base_system = "You are an AI assistant that improves proactive suggestion messages. \
Return ONLY a JSON object with fields: description (string), action_label (string), urgency (\"low\"|\"medium\"|\"high\"). \
Keep descriptions concise (â‰¤ 2 sentences). Do not add markdown or commentary outside the JSON."
        .to_string();
    let system = append_reasoning_guidance(
        &base_system,
        reasoning_guidance,
        "proactive suggestion wording",
    );

    // Behavioral context: up to 3 most relevant patterns
    let beh_lines: Vec<String> = behavioral_memory
        .iter()
        .take(3)
        .filter_map(|b| {
            b.get("pattern_key")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();
    let beh_ctx = if beh_lines.is_empty() {
        String::new()
    } else {
        format!("\nUser patterns: {}", beh_lines.join("; "))
    };

    // Temporal context: last-seen for relevant entity types (â‰¤ 2 entries)
    let temp_lines: Vec<String> = temporal_summary
        .iter()
        .take(2)
        .filter_map(|t| {
            let et = t.get("event_type").and_then(Value::as_str)?;
            let last = t.get("last_seen_at").and_then(Value::as_str)?;
            Some(format!("{et} last seen {last}"))
        })
        .collect();
    let temp_ctx = if temp_lines.is_empty() {
        String::new()
    } else {
        format!("\nTemporal context: {}", temp_lines.join("; "))
    };

    let user_msg = format!(
        "Event: {event_subtype}\n\
         Heuristic: {heuristic_id}\n\
         Current description: \"{description}\"\n\
         Current action label: \"{action_label}\"\n\
         Confidence: {confidence:.2}{beh_ctx}{temp_ctx}\n\n\
         Improve the description to be more specific and actionable. Return JSON only.",
        heuristic_id = result.heuristic_id,
        description = result.suggestion.description,
        action_label = result.suggestion.action_label,
        confidence = result.suggestion.confidence,
    );

    (system, user_msg)
}

// â”€â”€ P4.3 â€” Structured output validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Parse and validate raw LLM JSON output against the `proactive_suggestion` AFP schema.
/// Falls back to `None` if the output is invalid â€” caller then uses the template.
pub fn validate_llm_suggestion(
    raw: &str,
    base: &AfpProactiveSuggestionContent,
) -> Option<AfpProactiveSuggestionContent> {
    // Strip markdown code fences if present
    let trimmed = raw.trim();
    let json_str = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.trim_end_matches("```").trim())
        .unwrap_or(trimmed);

    let parsed: Value = serde_json::from_str(json_str).ok()?;
    let obj = parsed.as_object()?;

    let description = obj
        .get("description")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)?;

    let action_label = obj
        .get("action_label")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| base.action_label.clone());

    let urgency = obj
        .get("urgency")
        .and_then(Value::as_str)
        .filter(|u| matches!(*u, "low" | "medium" | "high"))
        .map(str::to_string)
        .unwrap_or_else(|| base.urgency.clone());

    Some(AfpProactiveSuggestionContent {
        description,
        action_label,
        urgency,
        ..base.clone()
    })
}

// â”€â”€ P4.4 â€” Token budget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Returns `true` when the heuristic's daily token budget has not yet been exhausted.
/// Falls back to `true` (permit) on DB error so a transient failure doesn't silently block.
pub async fn check_token_budget(
    db: &Db,
    heuristic_id: &str,
    owner_user_id: &str,
    budget: i64,
) -> bool {
    match db.daily_token_usage(heuristic_id, owner_user_id).await {
        Ok(used) => used < budget,
        Err(e) => {
            warn!("proactive token budget check failed for heuristic {heuristic_id}: {e}");
            true
        }
    }
}

// â”€â”€ Orchestrator: run_llm_gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Full P4 pipeline for a single evaluation result.
///
/// 1. Check `should_invoke_llm` â€” if false, return `None` (caller uses template suggestion).
/// 2. Check daily token budget â€” if exceeded, return `None`.
/// 3. Build context-compressed prompt.
/// 4. Call LLM via `dispatch_infer`.
/// 5. Validate output.  On validation failure fall back to template.
/// 6. Log token usage.
///
/// Returns `Some(improved_suggestion)` or `None` (caller uses the heuristic template).
pub async fn run_llm_gate(
    db: &Db,
    backend: &InferenceBackend,
    model: &str,
    owner_user_id: &str,
    event_subtype: &str,
    result: &EvaluationResult,
    behavioral_memory: &[Value],
    temporal_summary: &[Value],
    reasoning_guidance: &[String],
) -> Option<AfpProactiveSuggestionContent> {
    if !should_invoke_llm(result) {
        return None;
    }

    if !check_token_budget(
        db,
        &result.heuristic_id,
        owner_user_id,
        DEFAULT_DAILY_TOKEN_BUDGET,
    )
    .await
    {
        warn!(
            "proactive token budget exhausted for heuristic {} (user {})",
            result.heuristic_id, owner_user_id
        );
        return None;
    }

    let (system, user_msg) = build_context_prompt(
        event_subtype,
        result,
        behavioral_memory,
        temporal_summary,
        reasoning_guidance,
    );
    let req = InferenceRequest {
        system,
        messages: vec![InferenceMessage {
            role: "user".to_string(),
            content: user_msg,
        }],
        max_tokens: 200,
        temperature: 0.3,
    };

    let resp: InferenceResponse = match dispatch_infer(backend, model, &req).await {
        Ok(r) => r,
        Err(e) => {
            warn!(
                "proactive LLM gate inference failed for heuristic {}: {e}",
                result.heuristic_id
            );
            return None;
        }
    };

    // P4.4 â€” log token usage regardless of validation outcome
    let tokens_used = resp.tokens_input + resp.tokens_output;
    let _ = db
        .log_proactive_token_usage(&result.heuristic_id, owner_user_id, tokens_used.into())
        .await;

    validate_llm_suggestion(&resp.content, &result.suggestion)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::AfpProactiveSuggestionContent;
    use crate::proactive_engine::EvaluationResult;

    fn make_result(confidence: f64, description: &str) -> EvaluationResult {
        EvaluationResult {
            heuristic_id: "test-heuristic".to_string(),
            suggestion: AfpProactiveSuggestionContent {
                heuristic_id: "test-heuristic".to_string(),
                confidence,
                urgency: "medium".to_string(),
                action_label: "Do something".to_string(),
                description: description.to_string(),
                action_afp_payload: None,
                dismiss_reason: None,
                source_event_id: None,
                entity_id: None,
                ..Default::default()
            },
        }
    }

    #[test]
    fn high_confidence_skips_llm() {
        let result = make_result(0.95, "A meeting ended. Follow up?");
        assert!(!should_invoke_llm(&result));
    }

    #[test]
    fn low_confidence_with_placeholder_invokes_llm() {
        let result = make_result(0.60, "Meeting with {client_name} ended. Draft follow-up?");
        assert!(should_invoke_llm(&result));
    }

    #[test]
    fn low_confidence_no_placeholder_skips_llm() {
        let result = make_result(0.60, "A workflow failed. Review the run.");
        assert!(!should_invoke_llm(&result));
    }

    #[test]
    fn validate_llm_suggestion_parses_valid_json() {
        let base = make_result(0.6, "old description").suggestion;
        let raw = r#"{"description":"New improved description.","action_label":"Review now","urgency":"high"}"#;
        let out = validate_llm_suggestion(raw, &base).unwrap();
        assert_eq!(out.description, "New improved description.");
        assert_eq!(out.urgency, "high");
    }

    #[test]
    fn validate_llm_suggestion_rejects_invalid_urgency() {
        let base = make_result(0.6, "old description").suggestion;
        let raw = r#"{"description":"Improved.","urgency":"critical"}"#;
        // urgency "critical" is not valid â€” should fall back to base urgency
        let out = validate_llm_suggestion(raw, &base).unwrap();
        assert_eq!(out.urgency, "medium"); // base urgency preserved
    }

    #[test]
    fn validate_llm_suggestion_handles_code_fence() {
        let base = make_result(0.6, "old").suggestion;
        let raw = "```json\n{\"description\":\"Fence stripped.\",\"action_label\":\"Act\",\"urgency\":\"low\"}\n```";
        let out = validate_llm_suggestion(raw, &base).unwrap();
        assert_eq!(out.description, "Fence stripped.");
    }

    #[test]
    fn build_context_prompt_stays_under_limit() {
        let result = make_result(
            0.7,
            "Client meeting ended. {client_name} may need a follow-up.",
        );
        let (_sys, user) = build_context_prompt(
            "calendar_event_completed",
            &result,
            &[serde_json::json!({"pattern_key":"delays_invoicing"})],
            &[serde_json::json!({"event_type":"passive_event","last_seen_at":"2026-05-18"})],
            &[],
        );
        // Rough token estimate: 4 chars â‰ˆ 1 token; keep under 400
        let estimated_tokens = user.len() / 4;
        assert!(
            estimated_tokens < 400,
            "prompt too long: {estimated_tokens} tokens estimated"
        );
    }

    #[test]
    fn build_context_prompt_appends_reasoning_guidance() {
        let result = make_result(
            0.7,
            "Client meeting ended. {client_name} may need a follow-up.",
        );
        let (system, _user) = build_context_prompt(
            "calendar_event_completed",
            &result,
            &[],
            &[],
            &[
                "Use grounded reasoning.".to_string(),
                "Run a brief reflection pass.".to_string(),
            ],
        );
        assert!(system.contains("# Enabled workspace reasoning guidance"));
        assert!(system.contains("- Use grounded reasoning."));
        assert!(system.contains("- Run a brief reflection pass."));
    }
}
