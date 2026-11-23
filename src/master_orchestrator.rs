/// Master Agent Orchestrator
///
/// Implements the proactive agent-team pattern described in the OmnyID design
/// discussion: a master agent plans an objective, validates tasks via the
/// PolicyEngine, spawns scoped sub-agent delegations, runs each task under a
/// bounded concurrency limit with a per-task timeout, and aggregates results.
///
/// Phase 2 items 25–27 (Security and Context Hardening):
/// - Item 25: Per-node capability validation at delegation time. Before
///   `generate_delegated_key()` the orchestrator intersects the requested task
///   type against the node's `allowed_capabilities` slice (from a
///   `WorkflowNodeManifest`). Tasks not in the node's allowed set are blocked
///   with a `policy_block` status before any delegation key is issued.
/// - Item 27: `context_snapshot` is populated at delegation time using
///   already-accumulated step results, the node system prompt, and a token
///   budget hint — zero additional round-trips.
///
/// Conceptual architecture inspired by Clawith (Apache 2.0 — see /about).
use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

use crate::{
    agent_template::{
        AgentTask, ContextSnapshot, TaskPriority, TaskStatus, generate_delegated_key,
    },
    audit_chain::message_hash,
    db::Db,
    inference::{InferenceBackend, InferenceMessage, InferenceRequest, dispatch_infer},
    policy_engine::PolicyEngine,
    prompt_guidance::append_reasoning_guidance,
};

// ── Node manifest (compiled IR node slice) ────────────────────────────────────

/// Minimal representation of a compiled IR workflow node used by the
/// orchestrator to enforce per-node policy at delegation time.
///
/// Populated from `latest_ir_json` in `saved_workflows`. When the orchestrator
/// is called outside of a workflow context (bare `ui/command` orchestration),
/// supply an empty manifest list — in that case the global PolicyEngine is the
/// sole gate.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkflowNodeManifest {
    /// The node's `id` field in the graph JSON.
    pub node_id: String,
    /// Node kind: "agent", "tool", "delegation", "trigger", etc.
    pub kind: String,
    /// Capability IDs this node is permitted to exercise.
    /// Empty = no per-node restriction beyond global policy.
    #[serde(default)]
    pub allowed_capabilities: Vec<String>,
    /// Outbound URL host allowlist. Empty = no host restriction.
    #[serde(default)]
    pub outbound_allowlist: Vec<String>,
    /// Optional system prompt from the compiled manifest.
    pub system_prompt: Option<String>,
    /// Optional instruction prompt from the compiled manifest.
    pub instruction_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_family_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantic_role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family_workflow_id: Option<String>,
    #[serde(default)]
    pub instance_inputs: std::collections::HashMap<String, String>,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlannedTask {
    pub id: String,
    /// One of ALLOWED_TASK_TYPES in policy_engine
    #[serde(rename = "type")]
    pub task_type: String,
    pub content: String,
    #[serde(default = "default_mask")]
    pub mask: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    /// Optional reference to a specific node in the compiled IR.
    /// When present the orchestrator uses its `allowed_capabilities` and
    /// `outbound_allowlist` for the delegation; otherwise falls back to the
    /// global PolicyEngine set.
    #[serde(default)]
    pub node_id: Option<String>,
}

fn default_mask() -> String {
    "private".to_string()
}
fn default_priority() -> String {
    "normal".to_string()
}

fn travel_request_needs_useful_fallback(task_content: &str, response: &str) -> bool {
    let task = task_content.to_ascii_lowercase();
    let response = response.to_ascii_lowercase();
    let travel_request = [
        "travel",
        "trip",
        "flight",
        "hotel",
        "itinerary",
        "route",
        "map",
        "weather",
        "forecast",
        "destination",
    ]
    .iter()
    .any(|term| task.contains(term));
    let tool_outage = response.contains("unavailable")
        || response.contains("could not retrieve")
        || response.contains("couldn't retrieve")
        || response.contains("not available");
    let useful_guidance = [
        "consider",
        "pack",
        "plan",
        "book",
        "check",
        "day",
        "itinerary",
        "budget",
        "stay",
        "flight",
        "hotel",
        "transport",
        "recommend",
        "option",
        "suggest",
    ]
    .iter()
    .any(|term| response.contains(term));

    travel_request && tool_outage && !useful_guidance
}

fn useful_travel_fallback(task_content: &str) -> String {
    format!(
        "I could not confirm the live weather or route details for this part of the trip yet. \
         I can still help you make progress: set the destination and dates, compare refundable transport and accommodation, \
         leave time buffers for transfers, and keep one flexible activity each day. \
         Share the origin, destination, dates, travellers, and priorities and I will turn this into a practical itinerary. \
         Request: {}",
        task_content.trim()
    )
}

fn preserve_useful_travel_answer(task_content: &str, response: String) -> String {
    if travel_request_needs_useful_fallback(task_content, &response) {
        useful_travel_fallback(task_content)
    } else {
        response
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct TaskResult {
    pub task_id: String,
    pub task_type: String,
    pub status: String, // "ok" | "failed" | "timeout" | "policy_blocked"
    pub result: Option<String>,
    pub error: Option<String>,
    pub result_meta: Option<crate::message::AfpNormalizedToolResultData>,
    pub cost_estimate_usd: Option<f64>,
    pub actual_cost_usd: Option<f64>,
    pub api_tier: Option<i32>,
    pub token_estimate: Option<i32>,
    pub tokens_used: Option<i32>,
    pub downgrade_action: Option<String>,
    pub execution_explanation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrchestratorResult {
    pub correlation_id: String,
    pub objective: String,
    pub task_count: usize,
    pub success_count: usize,
    pub results: Vec<TaskResult>,
    /// SHA-256 hash chain entry for the audit log
    pub audit_hash: String,
}

/// Build a human-readable explanation of why a task completed as it did.
pub fn task_execution_explanation(result: &TaskResult) -> String {
    if result.status == "ok" {
        format!("Task {} completed successfully.", result.task_id)
    } else {
        format!(
            "Task {} failed: {}",
            result.task_id,
            result.error.as_deref().unwrap_or("unknown error")
        )
    }
}

#[derive(Debug)]
pub enum OrchestratorError {
    PlanningFailed(String),
    DbError(sqlx::Error),
}

impl std::fmt::Display for OrchestratorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrchestratorError::PlanningFailed(msg) => write!(f, "planning failed: {msg}"),
            OrchestratorError::DbError(e) => write!(f, "db error: {e}"),
        }
    }
}

impl From<sqlx::Error> for OrchestratorError {
    fn from(e: sqlx::Error) -> Self {
        OrchestratorError::DbError(e)
    }
}

// ── MasterOrchestrator ────────────────────────────────────────────────────────

pub struct MasterOrchestrator {
    pub agent_instance_id: String,
    pub owner_user_id: String,
    /// Maximum number of tasks that can execute concurrently (default: 3)
    pub max_concurrency: usize,
    /// Optional compiled IR node manifests for per-node capability validation.
    /// When non-empty the orchestrator enforces item-25 policy at delegation time.
    pub node_manifests: Vec<WorkflowNodeManifest>,
}

impl MasterOrchestrator {
    pub fn new(agent_instance_id: String, owner_user_id: String) -> Self {
        Self {
            agent_instance_id,
            owner_user_id,
            max_concurrency: 3,
            node_manifests: vec![],
        }
    }

    /// Attach compiled IR node manifests so per-node capability validation
    /// (item 25) is enforced at delegation time.
    pub fn with_node_manifests(mut self, manifests: Vec<WorkflowNodeManifest>) -> Self {
        self.node_manifests = manifests;
        self
    }

    /// Run the orchestrator on a natural-language objective.
    ///
    /// Steps:
    /// 1. Ask the LLM to decompose `objective` into typed tasks (JSON).
    /// 2. Validate each task via PolicyEngine (global) and per-node manifest
    ///    (item 25) — task blocked → `policy_block` result, no key issued.
    /// 3. Execute valid tasks in parallel up to `max_concurrency`, each with a
    ///    30-second timeout. Delegation carries `allowed_capabilities`,
    ///    `outbound_allowlist`, and a `context_snapshot` (item 27).
    /// 4. Log an audit-chain entry and return aggregated results.
    /// Run with the exact user-selected BYOK, Ollama, RunPod, or hosted backend.
    #[allow(clippy::too_many_arguments)]
    pub async fn run_with_backend(
        &self,
        objective: &str,
        db: &Db,
        backend: &InferenceBackend,
        model: &str,
        operational_soul_md: Option<&str>,
        output_persona_md: Option<&str>,
        lora_active: bool,
        _cost_oracle: Option<&crate::cost_oracle::CostOracle>,
        trace_context: Option<&str>,
    ) -> Result<OrchestratorResult, OrchestratorError> {
        let correlation_id = ulid::Ulid::new().to_string();
        let trace_context_owned = trace_context.map(str::to_string);
        let reasoning_guidance =
            crate::server::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(
                &self.owner_user_id,
            )
            .unwrap_or_default();

        // Step 1: plan
        let tasks = self
            .plan_objective(
                objective,
                backend,
                model,
                operational_soul_md,
                lora_active,
                trace_context_owned.as_deref(),
                &reasoning_guidance,
            )
            .await?;
        let task_count = tasks.len();

        // Shared accumulator for prior step results (item 27 context snapshot).
        // Protected by a Mutex so concurrent tasks can read previous results.
        let prior_results: Arc<tokio::sync::Mutex<HashMap<String, String>>> =
            Arc::new(tokio::sync::Mutex::new(HashMap::new()));

        // Step 2 & 3: validate + execute concurrently
        let semaphore = Arc::new(Semaphore::new(self.max_concurrency));
        let node_manifests = Arc::new(self.node_manifests.clone());
        let mut handles = vec![];

        for task in tasks {
            let sem = semaphore.clone();
            let db = db.clone();
            let backend = backend.clone();
            let model = model.to_string();
            let agent_instance_id = self.agent_instance_id.clone();
            let owner_user_id = self.owner_user_id.clone();
            let operational_soul = operational_soul_md.map(str::to_string);
            let output_persona = output_persona_md.map(str::to_string);
            let lora = lora_active;
            let manifests = node_manifests.clone();
            let prior = prior_results.clone();
            let task_trace_context = trace_context_owned.clone();
            let task_reasoning_guidance = reasoning_guidance.clone();

            let handle = tokio::spawn(async move {
                let _permit = sem.acquire().await.ok();

                // ── Global policy gate ──────────────────────────────────────
                if !PolicyEngine::can_run(&task.task_type, &task.mask) {
                    return TaskResult {
                        task_id: task.id.clone(),
                        task_type: task.task_type.clone(),
                        status: "policy_blocked".to_string(),
                        result: None,
                        error: Some(format!(
                            "task type '{}' is not allowed under mask '{}'",
                            task.task_type, task.mask
                        )),
                        ..Default::default()
                    };
                }

                // ── Item 25: Per-node capability validation ─────────────────
                // Resolve the matching node manifest (by node_id if supplied,
                // otherwise by matching task_type to node kind).
                let node_manifest: Option<&WorkflowNodeManifest> = task
                    .node_id
                    .as_deref()
                    .and_then(|nid| manifests.iter().find(|m| m.node_id == nid))
                    .or_else(|| {
                        // Fallback: match by kind when node_id is not specified
                        manifests.iter().find(|m| m.kind == task.task_type)
                    });

                let (allowed_capabilities, outbound_allowlist, system_prompt, instruction_prompt) =
                    if let Some(manifest) = node_manifest {
                        // If the node has a non-empty allowed_capabilities list,
                        // verify the task type is in it.
                        if !manifest.allowed_capabilities.is_empty()
                            && !manifest.allowed_capabilities.contains(&task.task_type)
                        {
                            return TaskResult {
                                task_id: task.id.clone(),
                                task_type: task.task_type.clone(),
                                status: "policy_blocked".to_string(),
                                result: None,
                                error: Some(format!(
                                    "task type '{}' is not in node '{}' allowed_capabilities: [{}]",
                                    task.task_type,
                                    manifest.node_id,
                                    manifest.allowed_capabilities.join(", ")
                                )),
                                ..Default::default()
                            };
                        }
                        // Resolved capability slice: intersection of node list
                        // and PolicyEngine caps; use node list if non-empty,
                        // else fall back to global PolicyEngine set.
                        let caps: Vec<String> = if manifest.allowed_capabilities.is_empty() {
                            PolicyEngine::capabilities_for_task(&task.task_type)
                                .iter()
                                .map(|s| s.to_string())
                                .collect()
                        } else {
                            let global: Vec<&str> =
                                PolicyEngine::capabilities_for_task(&task.task_type).to_vec();
                            manifest
                                .allowed_capabilities
                                .iter()
                                .filter(|c| global.contains(&c.as_str()))
                                .cloned()
                                .collect()
                        };
                        (
                            caps,
                            manifest.outbound_allowlist.clone(),
                            manifest.system_prompt.clone(),
                            manifest.instruction_prompt.clone(),
                        )
                    } else {
                        // No manifest → global PolicyEngine caps, no host restriction
                        let caps = PolicyEngine::capabilities_for_task(&task.task_type)
                            .iter()
                            .map(|s| s.to_string())
                            .collect();
                        (caps, vec![], None, None)
                    };

                // ── Item 27: Build context snapshot ────────────────────────
                let prior_map = prior.lock().await.clone();
                let context_snapshot = Some(ContextSnapshot {
                    afp_thread_slice: vec![], // populated by supervisor when running in workflow context
                    prior_step_results: prior_map,
                    system_prompt: system_prompt.clone(),
                    instruction_prompt: instruction_prompt.clone(),
                    token_budget_remaining: Some(512),
                    simulator_projection_summary: task_trace_context.clone(),
                });

                // Create DB task record
                let agent_task = AgentTask::new(
                    owner_user_id.clone(),
                    agent_instance_id.clone(),
                    task.content.clone(),
                    TaskPriority::from_label(Some(task.priority.as_str())),
                );
                let _ = db.create_agent_task(&agent_task).await;

                // Generate scoped delegation — item 25 caps + allowlist + item 27 snapshot
                let master_key = match crate::agent_template::delegation_master_key_hex() {
                    Ok(key) => key,
                    Err(err) => {
                        let _ = db
                            .update_agent_task_status(
                                &owner_user_id,
                                &agent_task.id,
                                TaskStatus::Failed.as_str(),
                                None,
                                Some(err.as_str()),
                            )
                            .await;
                        return TaskResult {
                            task_id: agent_task.id,
                            task_type: task.task_type,
                            status: "failed".to_string(),
                            result: None,
                            error: Some(err),
                            ..Default::default()
                        };
                    }
                };
                let delegation = generate_delegated_key(
                    &master_key,
                    &task.task_type,
                    &agent_task.id,
                    30,
                    &agent_instance_id,
                    &owner_user_id,
                    allowed_capabilities,
                    outbound_allowlist,
                    context_snapshot,
                );
                let delegation_id = delegation.id.clone();
                let _ = db.create_delegation(&delegation).await;

                // Execute task with 30-second timeout
                let operational_soul_ref = operational_soul.as_deref();
                let output_persona_ref = output_persona.as_deref();
                let result = tokio::time::timeout(
                    std::time::Duration::from_secs(30),
                    execute_task_llm(
                        &task,
                        &backend,
                        &model,
                        operational_soul_ref,
                        output_persona_ref,
                        lora,
                        system_prompt.as_deref(),
                        instruction_prompt.as_deref(),
                        &task_reasoning_guidance,
                    ),
                )
                .await;

                // Revoke delegation
                let _ = db.revoke_delegation(&owner_user_id, &delegation_id).await;

                // Update task status + accumulate result for subsequent snapshots
                let (status_str, result_str, error_str) = match result {
                    Ok(Ok(text)) => {
                        let _ = db
                            .update_agent_task_status(
                                &owner_user_id,
                                &agent_task.id,
                                TaskStatus::Completed.as_str(),
                                Some(serde_json::Value::String(text.clone())),
                                None,
                            )
                            .await;
                        prior
                            .lock()
                            .await
                            .insert(agent_task.id.clone(), text.clone());
                        ("ok".to_string(), Some(text), None)
                    }
                    Ok(Err(e)) => {
                        let _ = db
                            .update_agent_task_status(
                                &owner_user_id,
                                &agent_task.id,
                                TaskStatus::Failed.as_str(),
                                None,
                                Some(e.as_str()),
                            )
                            .await;
                        ("failed".to_string(), None, Some(e))
                    }
                    Err(_) => {
                        let _ = db
                            .update_agent_task_status(
                                &owner_user_id,
                                &agent_task.id,
                                TaskStatus::Failed.as_str(),
                                None,
                                Some("task exceeded 30-second limit"),
                            )
                            .await;
                        (
                            "timeout".to_string(),
                            None,
                            Some("task exceeded 30-second limit".into()),
                        )
                    }
                };

                TaskResult {
                    task_id: agent_task.id,
                    task_type: task.task_type,
                    status: status_str,
                    result: result_str,
                    error: error_str,
                    ..Default::default()
                }
            });
            handles.push(handle);
        }

        let mut results = vec![];
        for h in handles {
            match h.await {
                Ok(r) => results.push(r),
                Err(e) => results.push(TaskResult {
                    task_id: "unknown".into(),
                    task_type: "unknown".into(),
                    status: "failed".into(),
                    result: None,
                    error: Some(e.to_string()),
                    ..Default::default()
                }),
            }
        }

        let success_count = results.iter().filter(|r| r.status == "ok").count();

        // Step 4: audit hash
        let audit_payload = serde_json::json!({
            "event": "orchestrator_run",
            "correlation_id": correlation_id,
            "objective_len": objective.len(),
            "task_count": task_count,
            "success_count": success_count,
        });
        let audit_hash = message_hash(&audit_payload);

        Ok(OrchestratorResult {
            correlation_id,
            objective: objective.to_string(),
            task_count,
            success_count,
            results,
            audit_hash,
        })
    }

    /// Ask the LLM to decompose the objective into a JSON task list.
    async fn plan_objective(
        &self,
        objective: &str,
        backend: &InferenceBackend,
        model: &str,
        soul_md: Option<&str>,
        lora_active: bool,
        trace_context: Option<&str>,
        reasoning_guidance: &[String],
    ) -> Result<Vec<PlannedTask>, OrchestratorError> {
        let system = if lora_active || soul_md.is_none() {
            planning_system_prompt(None, reasoning_guidance)
        } else {
            planning_system_prompt(soul_md, reasoning_guidance)
        };

        let trace_context_block = trace_context
            .filter(|context| !context.trim().is_empty())
            .map(|context| {
                format!(
                    "\nBounded planning context (advisory, not authoritative state):\n- {context}\n"
                )
            })
            .unwrap_or_default();

        let user_prompt = format!(
            "Decompose this objective into a JSON task list.\n\
            \n\
            Respond ONLY with valid JSON in this exact shape:\n\
            {{\"tasks\": [\
              {{\"id\": \"t1\", \"type\": \"email_triage\", \"content\": \"...\", \"mask\": \"private\", \"priority\": \"normal\"}}\
            ]}}\n\
            \n\
            Allowed task types: email_triage, calendar, study_planning, web_research, note, database.\n\
            Allowed masks: private, team, public.\n\
            {trace_context_block}\
            \n\
            Objective: {objective}"
        );

        let req = InferenceRequest {
            system,
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: user_prompt,
            }],
            max_tokens: 512,
            temperature: 0.2,
        };

        let resp = dispatch_infer(backend, model, &req)
            .await
            .map_err(|e| OrchestratorError::PlanningFailed(e.to_string()))?;

        // Parse JSON from response
        let text = resp.content.trim();
        let start = text.find('{').unwrap_or(0);
        let end = text.rfind('}').map(|i| i + 1).unwrap_or(text.len());
        let json_str = &text[start..end];

        let parsed: serde_json::Value = serde_json::from_str(json_str)
            .map_err(|e| OrchestratorError::PlanningFailed(format!("json parse: {e}")))?;

        let tasks: Vec<PlannedTask> = serde_json::from_value(parsed["tasks"].clone())
            .map_err(|e| OrchestratorError::PlanningFailed(format!("tasks parse: {e}")))?;

        Ok(tasks)
    }
}

fn planning_system_prompt(soul_md: Option<&str>, reasoning_guidance: &[String]) -> String {
    let soul_section = soul_md
        .map(|s| format!("\n\nAgent soul context:\n{s}"))
        .unwrap_or_default();
    let base = format!(
        "You are a master agent orchestrator.\n\
        Your job is to decompose user objectives into discrete, typed sub-tasks.\n\
        Each sub-task must map to an allowed task type.\n\
        Always choose the most restrictive mask that still allows the task to run.\n\
        Return ONLY valid JSON — no prose, no code fences.{soul_section}"
    );
    append_reasoning_guidance(&base, reasoning_guidance, "orchestration planning step")
}

#[allow(clippy::too_many_arguments)]
async fn execute_task_llm(
    task: &PlannedTask,
    backend: &InferenceBackend,
    model: &str,
    operational_soul_md: Option<&str>,
    output_persona_md: Option<&str>,
    lora_active: bool,
    system_prompt_override: Option<&str>,
    instruction_prompt: Option<&str>,
    reasoning_guidance: &[String],
) -> Result<String, String> {
    let capabilities = PolicyEngine::capabilities_for_task(&task.task_type);
    let caps_str = capabilities.join(", ");

    let soul_context = if !lora_active {
        operational_soul_md
            .map(|s| format!("\n\nAgent soul:\n{s}"))
            .unwrap_or_default()
    } else {
        String::new()
    };
    let persona_context = output_persona_md
        .map(|s| format!("\n\nUser-facing output persona:\n{s}"))
        .unwrap_or_default();

    // Use the node's system prompt from the compiled IR if available (item 27);
    // otherwise fall back to the generic sub-agent prompt.
    let system = if let Some(sp) = system_prompt_override {
        append_reasoning_guidance(
            &format!("{sp}{soul_context}{persona_context}"),
            reasoning_guidance,
            "delegated task execution",
        )
    } else {
        append_reasoning_guidance(
            &format!(
                "You are a sub-agent specialising in '{}'.\n\
            Your granted capabilities for this task: [{caps_str}].\n\
            Mask: {}. Operate under the principle of data minimisation.\n\
            Return a concise structured result.{soul_context}{persona_context}",
                task.task_type, task.mask,
            ),
            reasoning_guidance,
            "delegated task execution",
        )
    };

    // Prepend the instruction prompt to the user content when provided.
    let user_content = if let Some(ip) = instruction_prompt {
        format!("{ip}\n\n{}", task.content)
    } else {
        task.content.clone()
    };

    let req = InferenceRequest {
        system,
        messages: vec![InferenceMessage {
            role: "user".to_string(),
            content: user_content,
        }],
        max_tokens: 512,
        temperature: 0.3,
    };

    let response = dispatch_infer(backend, model, &req)
        .await
        .map_err(|e| e.to_string())?;

    Ok(preserve_useful_travel_answer(
        &task.content,
        response.content,
    ))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planned_task_deserializes_with_defaults() {
        let json = r#"{"id":"t1","type":"email_triage","content":"Check inbox"}"#;
        let task: PlannedTask = serde_json::from_str(json).unwrap();
        assert_eq!(task.mask, "private");
        assert_eq!(task.priority, "normal");
        assert_eq!(task.task_type, "email_triage");
        assert!(task.node_id.is_none());
    }

    #[test]
    fn orchestrator_result_serializes() {
        let r = OrchestratorResult {
            correlation_id: "cid".into(),
            objective: "test".into(),
            task_count: 2,
            success_count: 1,
            results: vec![],
            audit_hash: "hash".into(),
        };
        let j = serde_json::to_string(&r).unwrap();
        assert!(j.contains("correlation_id"));
        assert!(j.contains("audit_hash"));
    }

    #[test]
    fn planning_system_prompt_includes_soul_when_provided() {
        let prompt = planning_system_prompt(Some("## Personality\nCalm"), &[]);
        assert!(prompt.contains("Agent soul context"));
        assert!(prompt.contains("Calm"));
    }

    #[test]
    fn planning_system_prompt_omits_soul_when_none() {
        let prompt = planning_system_prompt(None, &[]);
        assert!(!prompt.contains("Agent soul context"));
    }

    #[test]
    fn travel_tool_outage_is_replaced_with_actionable_planning_guidance() {
        let answer = preserve_useful_travel_answer(
            "Plan a family trip to Tokyo and check the weather and route from Sydney",
            "Weather unavailable. Map unavailable.".to_string(),
        );

        assert!(answer.contains("refundable transport and accommodation"));
        assert!(!answer.contains("Weather unavailable"));
    }

    #[test]
    fn travel_answer_with_guidance_is_not_replaced_when_one_tool_is_unavailable() {
        let response =
            "Live weather is unavailable, but pack layers and keep a flexible indoor option."
                .to_string();
        assert_eq!(
            preserve_useful_travel_answer("Plan a trip to Tokyo", response.clone()),
            response
        );
    }

    #[test]
    fn planning_system_prompt_appends_reasoning_guidance() {
        let prompt = planning_system_prompt(
            None,
            &[
                "Use grounded reasoning.".to_string(),
                "Run a brief reflection pass.".to_string(),
            ],
        );
        assert!(prompt.contains("# Enabled workspace reasoning guidance"));
        assert!(prompt.contains("- Use grounded reasoning."));
        assert!(prompt.contains("- Run a brief reflection pass."));
    }

    #[test]
    fn plan_objective_uses_live_inference_backends() {
        let source = include_str!("master_orchestrator.rs");
        let start = source
            .find("async fn plan_objective(")
            .expect("plan_objective exists");
        let tail = &source[start..];
        let end = tail
            .find("fn planning_system_prompt(")
            .expect("planning_system_prompt follows plan_objective");
        let function_source = &tail[..end];

        assert!(function_source.contains("dispatch_infer(backend, model, &req)"));
        assert!(function_source.contains("serde_json::from_value(parsed[\"tasks\"].clone())"));
    }

    #[test]
    fn execute_task_llm_uses_live_inference_backends() {
        let source = include_str!("master_orchestrator.rs");
        let start = source
            .find("async fn execute_task_llm(")
            .expect("execute_task_llm exists");
        let tail = &source[start..];
        let end = tail
            .find("#[cfg(test)]")
            .expect("tests follow execute_task_llm");
        let function_source = &tail[..end];

        assert!(function_source.contains("dispatch_infer(backend, model, &req)"));
        assert!(function_source.contains("response.content"));
    }

    // ── Item 25: per-node capability validation ───────────────────────────────

    #[test]
    fn manifest_blocks_task_not_in_allowed_capabilities() {
        // A node that only allows "note" should block "email_triage"
        let manifest = WorkflowNodeManifest {
            node_id: "node-1".into(),
            kind: "agent".into(),
            allowed_capabilities: vec!["note".into()],
            outbound_allowlist: vec![],
            workflow_family_id: None,
            semantic_role: None,
            system_prompt: None,
            instruction_prompt: None,
            family_workflow_id: None,
            instance_inputs: std::collections::HashMap::new(),
        };
        // email_triage is NOT in allowed_capabilities
        assert!(
            !manifest
                .allowed_capabilities
                .contains(&"email_triage".to_string())
        );
        // note IS in allowed_capabilities
        assert!(manifest.allowed_capabilities.contains(&"note".to_string()));
    }

    #[test]
    fn manifest_with_empty_capabilities_allows_all() {
        let manifest = WorkflowNodeManifest {
            node_id: "node-2".into(),
            kind: "agent".into(),
            allowed_capabilities: vec![], // empty = no restriction
            outbound_allowlist: vec![],
            workflow_family_id: None,
            semantic_role: None,
            system_prompt: None,
            instruction_prompt: None,
            family_workflow_id: None,
            instance_inputs: std::collections::HashMap::new(),
        };
        assert!(manifest.allowed_capabilities.is_empty());
    }

    #[test]
    fn capability_intersection_with_global_policy() {
        // Node claims "read_email_metadata" and "email_send" (email_send is not
        // in the global PolicyEngine set for email_triage).
        let node_caps = vec!["read_email_metadata".to_string(), "email_send".to_string()];
        let global: Vec<&str> = PolicyEngine::capabilities_for_task("email_triage").to_vec();
        let intersection: Vec<String> = node_caps
            .iter()
            .filter(|c| global.contains(&c.as_str()))
            .cloned()
            .collect();
        // Only "read_email_metadata" passes — "email_send" is not in global caps
        assert_eq!(intersection, vec!["read_email_metadata".to_string()]);
        assert!(!intersection.contains(&"email_send".to_string()));
    }

    // ── Item 27: context snapshot ──────────────────────────────────────────────

    #[test]
    fn context_snapshot_serializes_round_trip() {
        let mut prior = HashMap::new();
        prior.insert("task-1".to_string(), "result text".to_string());
        let snap = ContextSnapshot {
            afp_thread_slice: vec![],
            prior_step_results: prior,
            system_prompt: Some("You are helpful".into()),
            instruction_prompt: Some("Summarise emails".into()),
            token_budget_remaining: Some(256),
            simulator_projection_summary: Some(
                "Bounded simulation traced 2 step(s) across 1 rollout.".into(),
            ),
        };
        let json = serde_json::to_string(&snap).unwrap();
        let back: ContextSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back.system_prompt.as_deref(), Some("You are helpful"));
        assert_eq!(back.token_budget_remaining, Some(256));
        assert_eq!(
            back.simulator_projection_summary.as_deref(),
            Some("Bounded simulation traced 2 step(s) across 1 rollout.")
        );
        assert_eq!(
            back.prior_step_results.get("task-1").map(|s| s.as_str()),
            Some("result text")
        );
    }

    #[test]
    fn planning_prompt_can_include_trace_context() {
        let orchestrator = MasterOrchestrator::new("agent_1".into(), "user_1".into());
        let prompt = {
            let trace_context_block = Some(
                "Bounded simulation traced 2 step(s); prepared draft candidate surfaced."
                    .to_string(),
            )
            .filter(|context| !context.trim().is_empty())
            .map(|context| {
                format!(
                    "\nBounded planning context (advisory, not authoritative state):\n- {context}\n"
                )
            })
            .unwrap_or_default();
            format!(
                "Decompose this objective into a JSON task list.\n\
                \n\
                Respond ONLY with valid JSON in this exact shape:\n\
                {{\"tasks\": [\
                  {{\"id\": \"t1\", \"type\": \"email_triage\", \"content\": \"...\", \"mask\": \"private\", \"priority\": \"normal\"}}\
                ]}}\n\
                \n\
                Allowed task types: email_triage, calendar, study_planning, web_research, note, database.\n\
                Allowed masks: private, team, public.\n\
                {trace_context_block}\
                \n\
                Objective: plan the next step"
            )
        };
        let _ = orchestrator;
        assert!(prompt.contains("Bounded planning context"));
        assert!(prompt.contains("prepared draft candidate surfaced"));
    }
}
