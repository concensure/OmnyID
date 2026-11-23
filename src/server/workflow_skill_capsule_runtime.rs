/*
 * @module-id: server.workflow-skill-capsule-runtime
 * @primary-capability: workflow-run-skill-capsule-dispatch
 * @sub-capabilities: manifest-to-skill-invocation, runtime-result-foldback, timeline-outcome-overrides
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-runtime
 */

use crate::db::WorkflowRunRecord;
use axum::http::StatusCode;
use serde_json::{Map, Value};
use std::future::Future;

use super::skill_capsule_routes::invoke_skill_capsule_operation;

#[derive(Clone, Debug, PartialEq, Eq)]
enum SkillCapsuleRunState {
    Completed,
    Blocked,
    Failed,
}

#[derive(Clone, Debug)]
struct SkillCapsuleExecutionDirective {
    operation: String,
    atom_id: Option<String>,
    task: Value,
}

pub(super) async fn apply_skill_capsule_runtime_effects(
    run: &mut WorkflowRunRecord,
    ir_snapshot: &Value,
) {
    apply_skill_capsule_runtime_effects_with_executor(run, ir_snapshot, |payload| async move {
        invoke_skill_capsule_operation(payload).await
    })
    .await;
}

async fn apply_skill_capsule_runtime_effects_with_executor<F, Fut>(
    run: &mut WorkflowRunRecord,
    ir_snapshot: &Value,
    executor: F,
) where
    F: Fn(Value) -> Fut,
    Fut: Future<Output = Result<Value, (StatusCode, String)>>,
{
    let run_id = run.run_id.clone();
    let Some(timeline) = run.timeline_json.as_array_mut() else {
        return;
    };
    let manifest_map = manifest_map_by_node_id(ir_snapshot);
    if manifest_map.is_empty() {
        return;
    }

    let mut first_override: Option<(String, SkillCapsuleExecutionResult)> = None;
    let mut executed_nodes = 0usize;

    for entry in timeline.iter_mut() {
        let status = entry.get("status").and_then(Value::as_str).unwrap_or("");
        if status != "completed" {
            continue;
        }
        let manifest_node_id = entry
            .get("manifest_node_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let Some(manifest) = manifest_map.get(manifest_node_id) else {
            continue;
        };
        let Some(directive) = skill_capsule_execution_directive(manifest, entry, &run_id) else {
            continue;
        };
        executed_nodes += 1;

        let payload = build_skill_capsule_payload(&directive);
        let execution = match executor(payload).await {
            Ok(value) => interpret_skill_capsule_response(&directive, &value),
            Err((_, message)) => SkillCapsuleExecutionResult {
                state: SkillCapsuleRunState::Failed,
                message,
                receipt_status: None,
                payload: Value::Null,
                preview: None,
                outcome_kind: "bridge_error",
            },
        };

        apply_execution_result_to_timeline_entry(entry, &directive, &execution);
        if first_override.is_none()
            && matches!(
                execution.state,
                SkillCapsuleRunState::Blocked | SkillCapsuleRunState::Failed
            )
        {
            let node_id = entry
                .get("node_id")
                .and_then(Value::as_str)
                .unwrap_or("unknown-node")
                .to_string();
            first_override = Some((node_id, execution.clone()));
        }
    }

    if executed_nodes == 0 {
        return;
    }

    if let Some(result_obj) = run.result_json.as_object_mut() {
        result_obj.insert(
            "skill_capsule_executed_node_count".to_string(),
            serde_json::json!(executed_nodes),
        );
    }

    if let Some((node_id, execution)) = first_override {
        apply_execution_override_to_run(run, &node_id, &execution);
    }
}

#[derive(Clone, Debug)]
struct SkillCapsuleExecutionResult {
    state: SkillCapsuleRunState,
    message: String,
    receipt_status: Option<String>,
    payload: Value,
    preview: Option<String>,
    outcome_kind: &'static str,
}

fn manifest_map_by_node_id<'a>(
    ir_snapshot: &'a Value,
) -> std::collections::HashMap<String, &'a Map<String, Value>> {
    ir_snapshot
        .get("manifests")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_object)
                .filter_map(|manifest| {
                    manifest
                        .get("node_id")
                        .and_then(Value::as_str)
                        .map(|id| (id.to_string(), manifest))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn skill_capsule_execution_directive(
    manifest: &Map<String, Value>,
    timeline_entry: &Value,
    run_id: &str,
) -> Option<SkillCapsuleExecutionDirective> {
    let connector_binding = manifest.get("connector_binding")?.as_object()?;
    if connector_binding
        .get("connector_family")
        .and_then(Value::as_str)
        != Some("skill_capsule")
    {
        return None;
    }

    let operation = connector_binding
        .get("operation")
        .and_then(Value::as_str)
        .or_else(|| manifest.get("operation").and_then(Value::as_str))
        .unwrap_or("compose")
        .to_string();
    let atom_id = connector_binding
        .get("atom_id")
        .and_then(Value::as_str)
        .or_else(|| manifest.get("atom_id").and_then(Value::as_str))
        .map(str::to_string);
    let objective = manifest
        .get("objective")
        .and_then(Value::as_str)
        .unwrap_or("Execute workflow node");
    let node_id = timeline_entry
        .get("node_id")
        .and_then(Value::as_str)
        .unwrap_or("workflow-node");
    let manifest_node_id = timeline_entry
        .get("manifest_node_id")
        .and_then(Value::as_str)
        .unwrap_or("unknown-manifest");
    let graph_label = timeline_entry
        .get("graph_node_label")
        .and_then(Value::as_str)
        .unwrap_or("Workflow node");
    let instance_input_bindings = manifest
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_bindings"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let instance_inputs = instance_input_bindings
        .iter()
        .filter_map(|entry| {
            Some((
                entry.get("key")?.as_str()?.to_string(),
                entry.get("value")?.clone(),
            ))
        })
        .collect::<Map<String, Value>>();

    Some(SkillCapsuleExecutionDirective {
        operation,
        atom_id,
        task: serde_json::json!({
            "description": objective,
            "workflow_run_id": run_id,
            "workflow_node_id": node_id,
            "workflow_manifest_node_id": manifest_node_id,
            "graph_node_label": graph_label,
            "instance_inputs": instance_inputs,
        }),
    })
}

fn build_skill_capsule_payload(directive: &SkillCapsuleExecutionDirective) -> Value {
    match directive.operation.as_str() {
        "prepare" | "activate" | "verify" => serde_json::json!({
            "op": directive.operation,
            "atom_id": directive.atom_id,
            "task": directive.task,
        }),
        _ => serde_json::json!({
            "op": "compose",
            "task": directive.task,
        }),
    }
}

fn interpret_skill_capsule_response(
    directive: &SkillCapsuleExecutionDirective,
    response: &Value,
) -> SkillCapsuleExecutionResult {
    let payload =
        normalize_skill_capsule_payload(response.get("data").cloned().unwrap_or(Value::Null));
    let receipt_status = payload
        .get("receipt")
        .and_then(Value::as_object)
        .and_then(|receipt| receipt.get("status"))
        .and_then(Value::as_str)
        .map(str::to_string);

    let preview = payload
        .get("compiledCapsule")
        .and_then(Value::as_str)
        .map(trim_preview)
        .or_else(|| {
            payload
                .get("recorded_to")
                .and_then(Value::as_str)
                .map(str::to_string)
        });

    match receipt_status.as_deref() {
        Some("BLOCKED") => SkillCapsuleExecutionResult {
            state: SkillCapsuleRunState::Blocked,
            message: format_skill_capsule_message(
                directive,
                "blocked",
                payload
                    .get("receipt")
                    .and_then(Value::as_object)
                    .and_then(|receipt| receipt.get("reason"))
                    .and_then(Value::as_str),
            ),
            receipt_status,
            payload,
            preview,
            outcome_kind: "receipt_blocked",
        },
        Some("FAIL") => SkillCapsuleExecutionResult {
            state: SkillCapsuleRunState::Failed,
            message: format_skill_capsule_message(directive, "failed", None),
            receipt_status,
            payload,
            preview,
            outcome_kind: "receipt_failed",
        },
        _ => SkillCapsuleExecutionResult {
            state: SkillCapsuleRunState::Completed,
            message: format_skill_capsule_message(directive, "completed", None),
            receipt_status,
            payload,
            preview,
            outcome_kind: "receipt_completed",
        },
    }
}

fn normalize_skill_capsule_payload(payload: Value) -> Value {
    let mut payload_obj = match payload {
        Value::Object(map) => map,
        other => return other,
    };
    let Some(receipt) = payload_obj
        .get("receipt")
        .and_then(Value::as_object)
        .cloned()
    else {
        return Value::Object(payload_obj);
    };

    for (target, source) in [
        ("receipt_status", "status"),
        ("receipt_reason", "reason"),
        ("merchant", "merchant"),
        ("merchant_name", "merchant"),
        ("category", "category"),
        ("ledger_category", "category"),
        ("amount", "amount"),
        ("total", "amount"),
        ("tax", "tax"),
        ("tax_amount", "tax"),
        ("currency", "currency"),
        ("transaction_date", "date"),
        ("receipt_date", "date"),
        ("summary", "summary"),
        ("receipt_summary", "summary"),
    ] {
        if !payload_obj.contains_key(target) {
            if let Some(value) = receipt.get(source).cloned() {
                payload_obj.insert(target.to_string(), value);
            }
        }
    }

    if !payload_obj.contains_key("receipt_notes") {
        if let Some(notes) = receipt.get("notes").cloned() {
            payload_obj.insert("receipt_notes".to_string(), notes);
        }
    }

    Value::Object(payload_obj)
}

fn format_skill_capsule_message(
    directive: &SkillCapsuleExecutionDirective,
    state: &str,
    reason: Option<&str>,
) -> String {
    let atom_suffix = directive
        .atom_id
        .as_deref()
        .map(|atom| format!(" ({atom})"))
        .unwrap_or_default();
    match reason {
        Some(reason) if !reason.trim().is_empty() => {
            format!(
                "Skill Capsule {}{} {state}: {reason}",
                directive.operation, atom_suffix
            )
        }
        _ => format!(
            "Skill Capsule {}{} {state}.",
            directive.operation, atom_suffix
        ),
    }
}

fn trim_preview(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.len() <= 240 {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..240])
    }
}

fn apply_execution_result_to_timeline_entry(
    entry: &mut Value,
    directive: &SkillCapsuleExecutionDirective,
    execution: &SkillCapsuleExecutionResult,
) {
    let Some(entry_obj) = entry.as_object_mut() else {
        return;
    };

    entry_obj.insert(
        "state_reason".to_string(),
        Value::String(execution.message.clone()),
    );
    match execution.state {
        SkillCapsuleRunState::Completed => {}
        SkillCapsuleRunState::Blocked => {
            entry_obj.insert("status".to_string(), Value::String("blocked".to_string()));
            entry_obj.insert("completed_at".to_string(), Value::Null);
            entry_obj.insert("duration_ms".to_string(), Value::Null);
        }
        SkillCapsuleRunState::Failed => {
            entry_obj.insert("status".to_string(), Value::String("failed".to_string()));
            entry_obj.insert("completed_at".to_string(), Value::Null);
            entry_obj.insert("duration_ms".to_string(), Value::Null);
        }
    }

    let trace = entry_obj
        .entry("trace".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if let Some(trace_obj) = trace.as_object_mut() {
        trace_obj.insert(
            "skill_capsule".to_string(),
            serde_json::json!({
                "operation": directive.operation,
                "atom_id": directive.atom_id,
                "receipt_status": execution.receipt_status,
                "preview": execution.preview,
                "payload": execution.payload,
                "outcome_kind": execution.outcome_kind,
            }),
        );
        trace_obj.insert(
            "kind".to_string(),
            Value::String(
                match execution.state {
                    SkillCapsuleRunState::Completed => "skill_capsule_completed",
                    SkillCapsuleRunState::Blocked => "skill_capsule_blocked",
                    SkillCapsuleRunState::Failed => "skill_capsule_failed",
                }
                .to_string(),
            ),
        );
        trace_obj.insert(
            "outcome".to_string(),
            Value::String(
                match execution.state {
                    SkillCapsuleRunState::Completed => "ok",
                    SkillCapsuleRunState::Blocked => "policy_blocked",
                    SkillCapsuleRunState::Failed => "execution_failed",
                }
                .to_string(),
            ),
        );
        trace_obj.insert(
            "summary".to_string(),
            Value::String(execution.message.clone()),
        );
        trace_obj.insert(
            "skill_capsule_outcome_kind".to_string(),
            Value::String(execution.outcome_kind.to_string()),
        );
        trace_obj.insert(
            "status_code".to_string(),
            Value::Number(serde_json::Number::from(match execution.state {
                SkillCapsuleRunState::Completed => 200,
                SkillCapsuleRunState::Blocked => 409,
                SkillCapsuleRunState::Failed => 500,
            })),
        );
    }
}

fn apply_execution_override_to_run(
    run: &mut WorkflowRunRecord,
    node_id: &str,
    execution: &SkillCapsuleExecutionResult,
) {
    let reason = execution.message.as_str();
    let state = execution.state.clone();
    run.status = match state {
        SkillCapsuleRunState::Completed => run.status.clone(),
        SkillCapsuleRunState::Blocked => "blocked".to_string(),
        SkillCapsuleRunState::Failed => "failed".to_string(),
    };
    if !matches!(state, SkillCapsuleRunState::Completed) {
        run.completed_at = None;
    }
    let workflow_title = run
        .result_json
        .get("summary")
        .and_then(Value::as_str)
        .and_then(|summary| summary.split_whitespace().next())
        .unwrap_or("Workflow")
        .to_string();
    if let Some(result_obj) = run.result_json.as_object_mut() {
        match state {
            SkillCapsuleRunState::Completed => {}
            SkillCapsuleRunState::Blocked => {
                result_obj.insert(
                    "summary".to_string(),
                    Value::String(format!("{workflow_title} was blocked at {node_id}.")),
                );
                result_obj.insert(
                    "blocked_at_node_id".to_string(),
                    Value::String(node_id.to_string()),
                );
                result_obj.insert(
                    "blocked_reason".to_string(),
                    Value::String(reason.to_string()),
                );
                result_obj.insert(
                    "skill_capsule_outcome_kind".to_string(),
                    Value::String(execution.outcome_kind.to_string()),
                );
                result_obj.insert(
                    "skill_capsule_receipt_status".to_string(),
                    execution
                        .receipt_status
                        .clone()
                        .map(Value::String)
                        .unwrap_or(Value::Null),
                );
                result_obj.insert("failed_at_node_id".to_string(), Value::Null);
                result_obj.insert("failed_reason".to_string(), Value::Null);
            }
            SkillCapsuleRunState::Failed => {
                result_obj.insert(
                    "summary".to_string(),
                    Value::String(format!("{workflow_title} failed at {node_id}.")),
                );
                result_obj.insert(
                    "failed_at_node_id".to_string(),
                    Value::String(node_id.to_string()),
                );
                result_obj.insert(
                    "failed_reason".to_string(),
                    Value::String(reason.to_string()),
                );
                result_obj.insert(
                    "skill_capsule_outcome_kind".to_string(),
                    Value::String(execution.outcome_kind.to_string()),
                );
                result_obj.insert(
                    "skill_capsule_receipt_status".to_string(),
                    execution
                        .receipt_status
                        .clone()
                        .map(Value::String)
                        .unwrap_or(Value::Null),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skill_capsule_execution_directive_reads_manifest_binding() {
        let manifest = serde_json::json!({
            "objective": "Prepare a reusable coding skill.",
            "connector_binding": {
                "connector_family": "skill_capsule",
                "operation": "prepare",
                "atom_id": "code.edit.safe"
            },
            "metadata": {
                "instance_input_bindings": [
                    {"key": "source_kind", "value": "workspace"}
                ]
            }
        });
        let timeline_entry = serde_json::json!({
            "node_id": "skill_node",
            "manifest_node_id": "mf_skill",
            "graph_node_label": "Reusable Skill"
        });
        let directive = skill_capsule_execution_directive(
            manifest.as_object().expect("manifest"),
            &timeline_entry,
            "run_123",
        )
        .expect("directive");

        assert_eq!(directive.operation, "prepare");
        assert_eq!(directive.atom_id.as_deref(), Some("code.edit.safe"));
        assert_eq!(
            directive.task["instance_inputs"]["source_kind"].as_str(),
            Some("workspace")
        );
    }

    #[test]
    fn apply_execution_override_to_run_marks_failed_result() {
        let mut run = WorkflowRunRecord {
            run_id: "run_1".to_string(),
            workflow_id: "wf_1".to_string(),
            deployment_id: "dep_1".to_string(),
            owner_user_id: "user_1".to_string(),
            status: "completed".to_string(),
            trigger_kind: "manual".to_string(),
            replay_of_run_id: None,
            timeline_json: serde_json::json!([]),
            result_json: serde_json::json!({
                "summary": "Workflow completed successfully."
            }),
            started_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: Some("2026-01-01T00:00:10Z".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        apply_execution_override_to_run(
            &mut run,
            "skill_node",
            &SkillCapsuleExecutionResult {
                state: SkillCapsuleRunState::Failed,
                message: "Skill Capsule verify failed.".to_string(),
                receipt_status: Some("FAIL".to_string()),
                payload: Value::Null,
                preview: None,
                outcome_kind: "receipt_failed",
            },
        );

        assert_eq!(run.status, "failed");
        assert_eq!(run.completed_at, None);
        assert_eq!(
            run.result_json["failed_at_node_id"].as_str(),
            Some("skill_node")
        );
        assert_eq!(
            run.result_json["skill_capsule_outcome_kind"].as_str(),
            Some("receipt_failed")
        );
        assert_eq!(
            run.result_json["skill_capsule_receipt_status"].as_str(),
            Some("FAIL")
        );
    }

    #[test]
    fn interpret_skill_capsule_response_normalizes_nested_receipt_fields() {
        let directive = SkillCapsuleExecutionDirective {
            operation: "prepare".to_string(),
            atom_id: Some("receipt.capture".to_string()),
            task: serde_json::json!({}),
        };
        let response = serde_json::json!({
            "data": {
                "receipt": {
                    "status": "OK",
                    "merchant": "Woolworths",
                    "category": "groceries",
                    "amount": 84.35,
                    "tax": 7.67,
                    "currency": "AUD",
                    "date": "2026-07-27",
                    "summary": "Categorized Woolworths grocery receipt for bookkeeping review.",
                    "notes": [
                        "Verify GST treatment before posting."
                    ]
                }
            }
        });

        let execution = interpret_skill_capsule_response(&directive, &response);
        let payload = execution.payload.as_object().expect("payload object");

        assert_eq!(execution.state, SkillCapsuleRunState::Completed);
        assert_eq!(
            payload.get("merchant").and_then(Value::as_str),
            Some("Woolworths")
        );
        assert_eq!(
            payload.get("category").and_then(Value::as_str),
            Some("groceries")
        );
        assert_eq!(payload.get("amount").and_then(Value::as_f64), Some(84.35));
        assert_eq!(payload.get("tax").and_then(Value::as_f64), Some(7.67));
        assert_eq!(payload.get("currency").and_then(Value::as_str), Some("AUD"));
        assert_eq!(
            payload.get("transaction_date").and_then(Value::as_str),
            Some("2026-07-27")
        );
        assert_eq!(
            payload.get("summary").and_then(Value::as_str),
            Some("Categorized Woolworths grocery receipt for bookkeeping review.")
        );
        assert!(
            payload
                .get("receipt_notes")
                .and_then(Value::as_array)
                .is_some()
        );
    }

    #[tokio::test]
    async fn apply_skill_capsule_runtime_effects_blocks_run_from_manifest_binding() {
        let mut run = WorkflowRunRecord {
            run_id: "run_blocked".to_string(),
            workflow_id: "wf_1".to_string(),
            deployment_id: "dep_1".to_string(),
            owner_user_id: "user_1".to_string(),
            status: "completed".to_string(),
            trigger_kind: "manual".to_string(),
            replay_of_run_id: None,
            timeline_json: serde_json::json!([
                {
                    "node_id": "skill_node",
                    "manifest_node_id": "mf_skill",
                    "graph_node_label": "Reusable Skill",
                    "status": "completed",
                    "trace": {
                        "action": {
                            "action_category": "tool_action"
                        }
                    }
                }
            ]),
            result_json: serde_json::json!({
                "summary": "Workflow completed successfully."
            }),
            started_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: Some("2026-01-01T00:00:10Z".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let ir_snapshot = serde_json::json!({
            "manifests": [
                {
                    "node_id": "mf_skill",
                    "objective": "Prepare a reusable coding skill.",
                    "connector_binding": {
                        "connector_family": "skill_capsule",
                        "operation": "prepare",
                        "atom_id": "code.edit.safe"
                    }
                }
            ]
        });

        apply_skill_capsule_runtime_effects_with_executor(
            &mut run,
            &ir_snapshot,
            |_payload| async {
                Ok(serde_json::json!({
                    "data": {
                        "receipt": {
                            "status": "BLOCKED",
                            "reason": "missing approval for skill publication"
                        }
                    }
                }))
            },
        )
        .await;

        let timeline = run.timeline_json.as_array().expect("timeline");
        assert_eq!(run.status, "blocked");
        assert_eq!(run.completed_at, None);
        assert_eq!(timeline[0]["status"].as_str(), Some("blocked"));
        assert_eq!(
            timeline[0]["trace"]["kind"].as_str(),
            Some("skill_capsule_blocked")
        );
        assert_eq!(
            timeline[0]["trace"]["skill_capsule_outcome_kind"].as_str(),
            Some("receipt_blocked")
        );
        assert_eq!(
            timeline[0]["trace"]["skill_capsule"]["operation"].as_str(),
            Some("prepare")
        );
        assert_eq!(
            timeline[0]["trace"]["skill_capsule"]["outcome_kind"].as_str(),
            Some("receipt_blocked")
        );
        assert_eq!(
            run.result_json["blocked_at_node_id"].as_str(),
            Some("skill_node")
        );
        assert_eq!(
            run.result_json["skill_capsule_outcome_kind"].as_str(),
            Some("receipt_blocked")
        );
        assert_eq!(
            run.result_json["skill_capsule_receipt_status"].as_str(),
            Some("BLOCKED")
        );
    }

    #[tokio::test]
    async fn apply_skill_capsule_runtime_effects_marks_run_failed_when_executor_errors() {
        let mut run = WorkflowRunRecord {
            run_id: "run_failed".to_string(),
            workflow_id: "wf_1".to_string(),
            deployment_id: "dep_1".to_string(),
            owner_user_id: "user_1".to_string(),
            status: "completed".to_string(),
            trigger_kind: "manual".to_string(),
            replay_of_run_id: None,
            timeline_json: serde_json::json!([
                {
                    "node_id": "skill_node",
                    "manifest_node_id": "mf_skill",
                    "graph_node_label": "Verifier",
                    "status": "completed",
                    "trace": {
                        "action": {
                            "action_category": "tool_action"
                        }
                    }
                }
            ]),
            result_json: serde_json::json!({
                "summary": "Workflow completed successfully."
            }),
            started_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: Some("2026-01-01T00:00:10Z".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let ir_snapshot = serde_json::json!({
            "manifests": [
                {
                    "node_id": "mf_skill",
                    "objective": "Verify the compiled capsule.",
                    "connector_binding": {
                        "connector_family": "skill_capsule",
                        "operation": "verify",
                        "atom_id": "code.review.strict"
                    }
                }
            ]
        });

        apply_skill_capsule_runtime_effects_with_executor(
            &mut run,
            &ir_snapshot,
            |_payload| async {
                Err((
                    StatusCode::BAD_GATEWAY,
                    "bridge runtime unavailable".to_string(),
                ))
            },
        )
        .await;

        let timeline = run.timeline_json.as_array().expect("timeline");
        assert_eq!(run.status, "failed");
        assert_eq!(run.completed_at, None);
        assert_eq!(timeline[0]["status"].as_str(), Some("failed"));
        assert_eq!(
            timeline[0]["trace"]["kind"].as_str(),
            Some("skill_capsule_failed")
        );
        assert_eq!(
            timeline[0]["trace"]["skill_capsule_outcome_kind"].as_str(),
            Some("bridge_error")
        );
        assert_eq!(
            run.result_json["failed_at_node_id"].as_str(),
            Some("skill_node")
        );
        assert_eq!(
            run.result_json["failed_reason"].as_str(),
            Some("bridge runtime unavailable")
        );
        assert_eq!(
            run.result_json["skill_capsule_outcome_kind"].as_str(),
            Some("bridge_error")
        );
        assert!(run.result_json["skill_capsule_receipt_status"].is_null());
    }
}
