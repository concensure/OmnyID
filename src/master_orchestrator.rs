/// Master Agent Orchestrator
///
/// Implements the proactive agent-team pattern described in the OmnyID design
/// discussion: a master agent plans an objective, validates tasks via the
/// PolicyEngine, spawns scoped sub-agent delegations, runs each task under a
/// bounded concurrency limit with a per-task timeout, and aggregates results.
///
/// Conceptual architecture inspired by Clawith (Apache 2.0 — see /about).
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

use crate::{
    agent_template::{AgentTask, TaskPriority, TaskStatus, generate_delegated_key},
    audit_chain::message_hash,
    db::Db,
    inference::{InferenceMessage, InferenceRequest, anthropic_infer, runpod_infer},
    policy_engine::PolicyEngine,
};

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
}

fn default_mask() -> String {
    "private".to_string()
}
fn default_priority() -> String {
    "normal".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub task_type: String,
    pub status: String, // "ok" | "failed" | "timeout" | "policy_blocked"
    pub result: Option<String>,
    pub error: Option<String>,
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
}

impl MasterOrchestrator {
    pub fn new(agent_instance_id: String, owner_user_id: String) -> Self {
        Self {
            agent_instance_id,
            owner_user_id,
            max_concurrency: 3,
        }
    }

    /// Run the orchestrator on a natural-language objective.
    ///
    /// Steps:
    /// 1. Ask the LLM to decompose `objective` into typed tasks (JSON).
    /// 2. Validate each task via PolicyEngine.
    /// 3. Execute valid tasks in parallel up to `max_concurrency`, each with a
    ///    30-second timeout.
    /// 4. Log an audit-chain entry and return aggregated results.
    pub async fn run(
        &self,
        objective: &str,
        db: &Db,
        api_key: &str,
        model: &str,
        soul_md: Option<&str>,
        lora_active: bool,
        runpod_endpoint: Option<&str>,
    ) -> Result<OrchestratorResult, OrchestratorError> {
        let correlation_id = ulid::Ulid::new().to_string();

        // Step 1: plan
        let tasks = self
            .plan_objective(
                objective,
                api_key,
                model,
                soul_md,
                lora_active,
                runpod_endpoint,
            )
            .await?;
        let task_count = tasks.len();

        // Step 2 & 3: validate + execute concurrently
        let semaphore = Arc::new(Semaphore::new(self.max_concurrency));
        let mut handles = vec![];

        for task in tasks {
            let sem = semaphore.clone();
            let db = db.clone();
            let api_key = api_key.to_string();
            let model = model.to_string();
            let agent_instance_id = self.agent_instance_id.clone();
            let owner_user_id = self.owner_user_id.clone();
            let soul = soul_md.map(str::to_string);
            let lora = lora_active;
            let runpod_ep = runpod_endpoint.map(str::to_string);

            let handle = tokio::spawn(async move {
                let _permit = sem.acquire().await.ok();

                // Policy gate
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
                    };
                }

                // Create DB task record
                let agent_task = AgentTask::new(
                    owner_user_id.clone(),
                    agent_instance_id.clone(),
                    task.content.clone(),
                    match task.priority.as_str() {
                        "high" => TaskPriority::High,
                        "low" => TaskPriority::Low,
                        _ => TaskPriority::Normal,
                    },
                );
                let _ = db.create_agent_task(&agent_task).await;

                // Generate scoped delegation
                let placeholder_master_key = "0".repeat(64);
                let delegation = generate_delegated_key(
                    &placeholder_master_key,
                    &task.task_type,
                    &agent_task.id,
                    30,
                    &agent_instance_id,
                    &owner_user_id,
                );
                let delegation_id = delegation.id.clone();
                let _ = db.create_delegation(&delegation).await;

                // Execute task with 30-second timeout
                let soul_ref = soul.as_deref();
                let result = tokio::time::timeout(
                    std::time::Duration::from_secs(30),
                    execute_task_llm(
                        &task,
                        &api_key,
                        &model,
                        soul_ref,
                        lora,
                        runpod_ep.as_deref(),
                    ),
                )
                .await;

                // Revoke delegation
                let _ = db.revoke_delegation(&owner_user_id, &delegation_id).await;

                // Update task status in DB
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
        api_key: &str,
        model: &str,
        soul_md: Option<&str>,
        lora_active: bool,
        runpod_endpoint: Option<&str>,
    ) -> Result<Vec<PlannedTask>, OrchestratorError> {
        let system = if lora_active || soul_md.is_none() {
            planning_system_prompt(None)
        } else {
            planning_system_prompt(soul_md)
        };

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

        let resp = if let Some(ep) = runpod_endpoint {
            runpod_infer(ep, api_key, model, &req)
                .await
                .map_err(|e| OrchestratorError::PlanningFailed(e.to_string()))?
        } else {
            anthropic_infer(api_key, model, &req)
                .await
                .map_err(|e| OrchestratorError::PlanningFailed(e.to_string()))?
        };

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

fn planning_system_prompt(soul_md: Option<&str>) -> String {
    let soul_section = soul_md
        .map(|s| format!("\n\nAgent soul context:\n{s}"))
        .unwrap_or_default();
    format!(
        "You are a master agent orchestrator.\n\
        Your job is to decompose user objectives into discrete, typed sub-tasks.\n\
        Each sub-task must map to an allowed task type.\n\
        Always choose the most restrictive mask that still allows the task to run.\n\
        Return ONLY valid JSON — no prose, no code fences.{soul_section}"
    )
}

async fn execute_task_llm(
    task: &PlannedTask,
    api_key: &str,
    model: &str,
    soul_md: Option<&str>,
    lora_active: bool,
    runpod_endpoint: Option<&str>,
) -> Result<String, String> {
    let capabilities = PolicyEngine::capabilities_for_task(&task.task_type);
    let caps_str = capabilities.join(", ");

    let soul_context = if !lora_active {
        soul_md
            .map(|s| format!("\n\nAgent soul:\n{s}"))
            .unwrap_or_default()
    } else {
        String::new()
    };

    let system = format!(
        "You are a sub-agent specialising in '{}'.\n\
        Your granted capabilities for this task: [{caps_str}].\n\
        Mask: {}. Operate under the principle of data minimisation.\n\
        Return a concise structured result.{soul_context}",
        task.task_type, task.mask,
    );

    let req = InferenceRequest {
        system,
        messages: vec![InferenceMessage {
            role: "user".to_string(),
            content: task.content.clone(),
        }],
        max_tokens: 512,
        temperature: 0.3,
    };

    if let Some(ep) = runpod_endpoint {
        runpod_infer(ep, api_key, model, &req)
            .await
            .map(|r| r.content)
            .map_err(|e| e.to_string())
    } else {
        anthropic_infer(api_key, model, &req)
            .await
            .map(|r| r.content)
            .map_err(|e| e.to_string())
    }
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
        let prompt = planning_system_prompt(Some("## Personality\nCalm"));
        assert!(prompt.contains("Agent soul context"));
        assert!(prompt.contains("Calm"));
    }

    #[test]
    fn planning_system_prompt_omits_soul_when_none() {
        let prompt = planning_system_prompt(None);
        assert!(!prompt.contains("Agent soul context"));
    }
}
