/*
 * @module-id: rust.skill-chain-runtime
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Skill Chain Runtime â€” ordered skill pipeline execution.
///
/// Executes `AfpSkillChainContent` plans sequentially:
///   1. Resolve input bindings for each step from the chain input and prior outputs.
///   2. Dispatch the step to the skill capsule HTTP bridge (or stub in tests).
///   3. Validate the result; on failure check `optional` flag.
///   4. Return `AfpSkillChainResultContent` with full step trace.
///
/// This module is synchronous-friendly for unit tests. Production callers use
/// the async variant `execute_skill_chain_async` which calls the real HTTP bridge.
use std::time::Instant;

use serde_json::{Value, json};

use crate::message::{
    AFP_SUBTYPE_SKILL_CHAIN_ABORT, AFP_SUBTYPE_SKILL_CHAIN_RESULT, AFP_TYPE_SKILL_CHAIN,
    AfpSkillChainContent, AfpSkillChainResultContent, AfpSkillChainStep, AfpSkillChainStepResult,
};

// â”€â”€ Chain status constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const CHAIN_STATUS_SUCCESS: &str = "success";
pub const CHAIN_STATUS_PARTIAL: &str = "partial";
pub const CHAIN_STATUS_FAILED: &str = "failed";
pub const CHAIN_STATUS_ABORTED: &str = "aborted";

pub const STEP_STATUS_SUCCESS: &str = "success";
pub const STEP_STATUS_SKIPPED: &str = "skipped";
pub const STEP_STATUS_FAILED: &str = "failed";

// â”€â”€ Input binding resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Resolve input bindings for a single step given the chain's initial input
/// and the outputs of all preceding steps.
///
/// Binding syntax:
///   `"$input.<key>"` â€” resolves against the chain's initial `input` object.
///   `"$step[N].<json_pointer>"` â€” resolves against step N's output (0-based).
///   Any other value is treated as a literal JSON value.
pub fn resolve_inputs(
    step: &AfpSkillChainStep,
    chain_input: &Value,
    step_outputs: &[Option<Value>],
) -> Value {
    let mapping = match step.input_mapping.as_object() {
        Some(m) => m,
        None => return json!({}),
    };

    let mut resolved = serde_json::Map::new();
    for (param, binding_val) in mapping {
        let binding = match binding_val.as_str() {
            Some(s) => s,
            None => {
                resolved.insert(param.clone(), binding_val.clone());
                continue;
            }
        };

        let value = if let Some(key) = binding.strip_prefix("$input.") {
            chain_input.get(key).cloned().unwrap_or(Value::Null)
        } else if let Some(rest) = binding.strip_prefix("$step[") {
            parse_step_ref(rest, step_outputs)
        } else {
            binding_val.clone()
        };

        resolved.insert(param.clone(), value);
    }

    Value::Object(resolved)
}

fn parse_step_ref(rest: &str, step_outputs: &[Option<Value>]) -> Value {
    // Format: `N].<json_pointer>` or `N]`
    let close = match rest.find(']') {
        Some(i) => i,
        None => return Value::Null,
    };
    let index: usize = match rest[..close].parse() {
        Ok(n) => n,
        Err(_) => return Value::Null,
    };
    let output = match step_outputs.get(index).and_then(Option::as_ref) {
        Some(v) => v,
        None => return Value::Null,
    };
    let pointer = rest[close + 1..].trim_start_matches('.');
    if pointer.is_empty() {
        output.clone()
    } else {
        pointer_get(output, pointer)
    }
}

/// Resolve a dot-separated or `/`-prefixed path into a JSON value.
/// Supports both `"foo.bar"` and `"/foo/bar"` (RFC 6901) notation.
fn pointer_get(v: &Value, pointer: &str) -> Value {
    let normalized = pointer.trim_start_matches('/');
    // Support both `.` (dot-path) and `/` (JSON Pointer) separators.
    let separator = if normalized.contains('/') { '/' } else { '.' };
    let mut current = v;
    for segment in normalized.split(separator) {
        if segment.is_empty() {
            continue;
        }
        current = match current.get(segment) {
            Some(c) => c,
            None => return Value::Null,
        };
    }
    current.clone()
}

// â”€â”€ Step executor (pluggable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Trait implemented by the real HTTP bridge and the test stub.
pub trait StepExecutor: Send + Sync {
    fn execute(&self, skill_id: &str, input: &Value) -> Result<Value, String>;
}

/// Stub executor used in tests â€” echoes the input back as output.
pub struct EchoExecutor;

impl StepExecutor for EchoExecutor {
    fn execute(&self, skill_id: &str, input: &Value) -> Result<Value, String> {
        Ok(json!({ "skill_id": skill_id, "echo": input }))
    }
}

/// Failing executor for testing abort paths.
pub struct FailExecutor {
    pub error: String,
}

impl StepExecutor for FailExecutor {
    fn execute(&self, _skill_id: &str, _input: &Value) -> Result<Value, String> {
        Err(self.error.clone())
    }
}

// â”€â”€ Chain execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Execute an `AfpSkillChainContent` plan synchronously.
///
/// Returns an `AfpSkillChainResultContent` with the full step trace and final output.
pub fn execute_skill_chain(
    chain: &AfpSkillChainContent,
    executor: &dyn StepExecutor,
) -> AfpSkillChainResultContent {
    let chain_start = Instant::now();
    let mut step_results: Vec<AfpSkillChainStepResult> = Vec::new();
    let mut step_outputs: Vec<Option<Value>> = Vec::new();
    let mut had_fatal_failure = false;
    let mut abort_reason: Option<String> = None;

    // Sort steps by index to ensure execution order is deterministic.
    let mut sorted_steps = chain.steps.clone();
    sorted_steps.sort_by_key(|s| s.index);

    for step in &sorted_steps {
        let step_start = Instant::now();

        let resolved_input = resolve_inputs(step, &chain.input, &step_outputs);

        let exec_result = executor.execute(&step.skill_id, &resolved_input);

        let duration_ms = step_start.elapsed().as_millis() as u64;

        match exec_result {
            Ok(output) => {
                step_results.push(AfpSkillChainStepResult {
                    step_id: format!("{}.{}", chain.chain_id, step.index),
                    index: step.index,
                    skill_id: step.skill_id.clone(),
                    status: STEP_STATUS_SUCCESS.to_string(),
                    output: Some(output.clone()),
                    error: None,
                    duration_ms,
                });
                step_outputs.push(Some(output));
            }
            Err(err) => {
                step_results.push(AfpSkillChainStepResult {
                    step_id: format!("{}.{}", chain.chain_id, step.index),
                    index: step.index,
                    skill_id: step.skill_id.clone(),
                    status: STEP_STATUS_FAILED.to_string(),
                    output: None,
                    error: Some(err.clone()),
                    duration_ms,
                });
                step_outputs.push(None);

                if !step.optional {
                    had_fatal_failure = true;
                    abort_reason = Some(format!(
                        "Required step [{}] '{}' failed: {err}",
                        step.index, step.skill_id
                    ));
                    break;
                }
            }
        }
    }

    let total_duration_ms = chain_start.elapsed().as_millis() as u64;

    // Resolve final output via output_binding.
    let final_output = if had_fatal_failure {
        None
    } else {
        resolve_final_output(chain, &step_outputs)
    };

    // Determine overall chain status.
    let status = if had_fatal_failure {
        CHAIN_STATUS_ABORTED
    } else if step_results.iter().any(|r| r.status == STEP_STATUS_FAILED) {
        CHAIN_STATUS_PARTIAL
    } else {
        CHAIN_STATUS_SUCCESS
    }
    .to_string();

    AfpSkillChainResultContent {
        chain_id: chain.chain_id.clone(),
        status,
        step_results,
        final_output,
        total_duration_ms,
        abort_reason,
        ..Default::default()
    }
}

fn resolve_final_output(
    chain: &AfpSkillChainContent,
    step_outputs: &[Option<Value>],
) -> Option<Value> {
    let last_output = step_outputs.iter().rev().find_map(|o| o.as_ref())?;

    match &chain.output_binding {
        Some(binding) => {
            let v = pointer_get(last_output, binding.trim_start_matches('/'));
            if v.is_null() { None } else { Some(v) }
        }
        None => Some(last_output.clone()),
    }
}

// â”€â”€ AFP message builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `skill_chain:result` or `skill_chain:abort` AFP JSON message.
pub fn build_skill_chain_result_afp(
    owner_user_id: &str,
    thread_id: &str,
    result: &AfpSkillChainResultContent,
) -> Value {
    let subtype = if result.status == CHAIN_STATUS_ABORTED {
        AFP_SUBTYPE_SKILL_CHAIN_ABORT
    } else {
        AFP_SUBTYPE_SKILL_CHAIN_RESULT
    };

    json!({
        "protocol": "afp-v1",
        "id": ulid::Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "skill_chain_runtime",
        "to": [owner_user_id],
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "type": AFP_TYPE_SKILL_CHAIN,
        "subtype": subtype,
        "content": serde_json::to_value(result).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::{AfpSkillChainContent, AfpSkillChainStep};
    use ulid::Ulid;

    fn make_chain(steps: Vec<AfpSkillChainStep>) -> AfpSkillChainContent {
        AfpSkillChainContent {
            chain_id: Ulid::new().to_string(),
            title: "test chain".to_string(),
            steps,
            input: json!({ "query": "hello" }),
            output_binding: None,
        }
    }

    fn step(index: u32, skill_id: &str, optional: bool) -> AfpSkillChainStep {
        AfpSkillChainStep {
            id: format!("step_{index}"),
            index,
            skill_id: skill_id.to_string(),
            description: format!("Run {skill_id}"),
            input_mapping: json!({ "data": "$input.query" }),
            optional,
        }
    }

    #[test]
    fn all_steps_succeed_with_echo_executor() {
        let chain = make_chain(vec![step(0, "classify", false), step(1, "enrich", false)]);
        let result = execute_skill_chain(&chain, &EchoExecutor);
        assert_eq!(result.status, CHAIN_STATUS_SUCCESS);
        assert_eq!(result.step_results.len(), 2);
        assert!(result.final_output.is_some());
    }

    #[test]
    fn required_failure_aborts_chain() {
        let chain = make_chain(vec![step(0, "classify", false), step(1, "enrich", false)]);
        let result = execute_skill_chain(
            &chain,
            &FailExecutor {
                error: "connection refused".into(),
            },
        );
        assert_eq!(result.status, CHAIN_STATUS_ABORTED);
        assert!(result.abort_reason.is_some());
        assert_eq!(result.step_results.len(), 1);
    }

    #[test]
    fn optional_failure_continues_chain() {
        struct FirstFailsExecutor;
        impl StepExecutor for FirstFailsExecutor {
            fn execute(&self, skill_id: &str, _input: &Value) -> Result<Value, String> {
                if skill_id == "classify" {
                    Err("classify unavailable".into())
                } else {
                    Ok(json!({ "enrich": "done" }))
                }
            }
        }
        let chain = make_chain(vec![step(0, "classify", true), step(1, "enrich", false)]);
        let result = execute_skill_chain(&chain, &FirstFailsExecutor);
        assert_eq!(result.status, CHAIN_STATUS_PARTIAL);
        assert_eq!(result.step_results.len(), 2);
        assert!(result.final_output.is_some());
    }

    #[test]
    fn resolve_inputs_binds_chain_input() {
        let s = step(0, "test", false);
        let chain_input = json!({ "query": "hello world" });
        let resolved = resolve_inputs(&s, &chain_input, &[]);
        assert_eq!(resolved["data"], json!("hello world"));
    }

    #[test]
    fn resolve_inputs_binds_prior_step_output() {
        let s = AfpSkillChainStep {
            id: "step_1".to_string(),
            index: 1,
            skill_id: "enrich".to_string(),
            description: "Run enrich".to_string(),
            input_mapping: json!({ "text": "$step[0].echo.data" }),
            ..Default::default()
        };
        let step0_output = json!({ "echo": { "data": "from step 0" } });
        let resolved = resolve_inputs(&s, &json!({}), &[Some(step0_output)]);
        assert_eq!(resolved["text"], json!("from step 0"));
    }

    #[test]
    fn build_skill_chain_result_afp_has_correct_type() {
        let result = AfpSkillChainResultContent {
            chain_id: "chain_01".into(),
            status: CHAIN_STATUS_SUCCESS.into(),
            ..Default::default()
        };
        let afp = build_skill_chain_result_afp("user_01", "thread_01", &result);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_SKILL_CHAIN));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_SKILL_CHAIN_RESULT)
        );
    }
}
