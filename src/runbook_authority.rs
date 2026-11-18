//! Restrictive tool preflight using existing connected-capability/account policy.
//! No assessment is an execution grant. Review receipts cannot authorize actions;
//! the future approval executor must revalidate exact inputs and current policy.
use crate::{
    autonomy_policy::{
        AutonomyDecision, PersonalAutonomyLevel, ProactiveAutonomyTier,
        autonomy_decision_for_proactive_enum,
    },
    message::AfpProactiveSuggestionContent,
    proactive_policy::{ProactiveStrategicPolicy, policy_for_proactive_suggestion},
    runbook_afp::{RuntimeRecord, build_runtime_afp},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
    runbook_validation::identifier,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;

/// Projection from the authenticated owner's connected-capability table. It
/// deliberately excludes credentials, account addresses and arbitrary metadata.
#[derive(Debug, Clone)]
pub struct ConnectedToolPolicy {
    pub owner: String,
    pub tool: String,
    pub healthy: bool,
    pub revoked: bool,
    pub approval_mode: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PolicyDisposition {
    Denied,
    ReviewRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ToolPolicyDecision {
    pub disposition: PolicyDisposition,
    pub reason: String,
    pub tier: ProactiveAutonomyTier,
    pub autonomy: AutonomyDecision,
    pub surface_policy: ProactiveStrategicPolicy,
}

/// Pure restrictive intersection. Callers must load policy from trusted storage,
/// never from a definition, model result, evidence packet or HTTP request body.
pub fn evaluate_tool_policy(
    owner: &str,
    definition: &RunbookDefinition,
    step: &Step,
    connection: Option<&ConnectedToolPolicy>,
    account_level: i32,
    user_override: Option<&str>,
) -> ToolPolicyDecision {
    let raw_tier = user_override
        .and_then(ProactiveAutonomyTier::parse)
        .unwrap_or(ProactiveAutonomyTier::AskAlways);
    let mut tier = raw_tier.cap_to_proactivity_level(account_level);
    let tool = step.tool.as_deref().unwrap_or("");
    let denial = if step.kind != StepKind::Tool
        || !identifier(tool)
        || !definition.steps.iter().any(|s| s == step)
        || !definition.tools_allowlist.iter().any(|s| s == tool)
    {
        Some("tool_not_allowed")
    } else if !definition.enabled || definition.status != DefinitionStatus::Active {
        Some("definition_disabled")
    } else if matches!(
        definition.max_autonomy,
        MaxAutonomy::ObserveOnly | MaxAutonomy::DraftOnly
    ) {
        Some("definition_autonomy_limit")
    } else if !(1..=3).contains(&account_level)
        || user_override.is_some_and(|s| ProactiveAutonomyTier::parse(s).is_none())
    {
        Some("invalid_account_policy")
    } else if connection
        .is_none_or(|c| c.owner != owner || c.tool != tool || !c.healthy || c.revoked)
    {
        Some("capability_unavailable")
    } else if connection.is_some_and(|c| {
        !matches!(
            c.approval_mode.as_str(),
            "autonomous" | "human_approval_required"
        )
    }) {
        // suggest_only permits a suggestion, never execution through approval.
        Some("capability_execution_not_permitted")
    } else {
        None
    };
    let hard_boundary = requires_hard_approval(tool)
        || definition.max_autonomy == MaxAutonomy::ApprovalRequired
        || connection.is_some_and(|c| c.approval_mode == "human_approval_required");
    if hard_boundary || denial.is_some() {
        tier = ProactiveAutonomyTier::AskAlways;
    }
    let policy_autonomy = autonomy_decision_for_proactive_enum(tier);
    // Even a low-risk capability remains in review until action schema, dispatch
    // and approval-resume integration are complete. Never return an execute token.
    let autonomy = if denial.is_some() {
        AutonomyDecision {
            autonomy_level: PersonalAutonomyLevel::ObserveOnly,
            action_autonomy: None,
            ..AutonomyDecision::prepare_silently(
                "Policy denied the action; approval cannot override this denial.",
            )
        }
    } else if policy_autonomy.approval_required {
        policy_autonomy
    } else {
        AutonomyDecision::request_approval(
            "Runbook tool execution requires a validated action and review.",
        )
    };
    let reason = denial.unwrap_or(if hard_boundary {
        "hard_approval_boundary"
    } else {
        "executor_review_required"
    });
    let surface_policy = policy_for_proactive_suggestion(&AfpProactiveSuggestionContent {
        requires_approval: denial.is_none(),
        confidence: if denial.is_some() { 0.0 } else { 1.0 },
        action_label: "Review action".into(),
        description: "Review the exact proposed action before any tool execution.".into(),
        ..Default::default()
    });
    ToolPolicyDecision {
        disposition: if denial.is_some() {
            PolicyDisposition::Denied
        } else {
            PolicyDisposition::ReviewRequired
        },
        reason: reason.into(),
        tier,
        autonomy,
        surface_policy,
    }
}

/// Only explicitly reviewed read/draft capabilities avoid the consequential
/// classification. Unknown tools, writes, sends, spend, booking, publication,
/// destructive actions and irreversible mutations all require hard approval.
pub fn requires_hard_approval(tool: &str) -> bool {
    !matches!(tool, "gmail.read" | "gmail.draft" | "google_calendar.read")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PolicyReceipt {
    pub instance_id: String,
    pub step_id: String,
    pub request_hash: String,
    pub decision: ToolPolicyDecision,
    pub trace: StepTrace,
}

pub(crate) fn parse_policy_receipt(owner: &str, value: &Value) -> Result<PolicyReceipt> {
    let receipt: PolicyReceipt =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_policy_receipt")?;
    let id = digest(&json!([
        "runbook_policy.v1",
        owner,
        receipt.instance_id,
        receipt.step_id
    ]));
    let trace_id = digest(&json!([
        "runbook_policy_trace.v1",
        owner,
        receipt.instance_id,
        receipt.step_id
    ]));
    let expected_status = if receipt.decision.disposition == PolicyDisposition::Denied {
        TraceStatus::Denied
    } else {
        TraceStatus::Waiting
    };
    if !identifier(owner)
        || !identifier(&receipt.instance_id)
        || !identifier(&receipt.step_id)
        || value["protocol"] != "afp-v1"
        || value["id"] != id
        || value["type"] != "runbook_policy"
        || value["subtype"] != "v1"
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["thread_id"] != format!("runbook:{}", receipt.instance_id)
        || value["metadata"]
            != json!({"private":true,"store":true,"instance_id":receipt.instance_id,"step_id":receipt.step_id})
        || value["references"] != json!([])
        || value["supertags"] != json!(["runbook_policy"])
        || value["store_in_relational"] != true
        || value["content"].to_string().len() > 32768
        || receipt.trace.trace_id != trace_id
        || receipt.trace.instance_id != receipt.instance_id
        || receipt.trace.step_id != receipt.step_id
        || receipt.trace.step_kind != StepKind::Tool
        || receipt.trace.status != expected_status
        || receipt.trace.input_hash != receipt.request_hash
        || receipt.trace.output_hash.as_deref() != Some(digest(&json!(receipt.decision)).as_str())
        || receipt.decision.autonomy.approval_required
            != (receipt.decision.disposition == PolicyDisposition::ReviewRequired)
        || receipt.trace.approval_ref.is_some()
    {
        return Err("invalid_policy_receipt");
    }
    RuntimeRecord::Trace(receipt.trace.clone()).validate()?;
    Ok(receipt)
}

impl RunbookRuntime<'_, '_> {
    /// Resolve policy for the frozen current Tool step and durably stop or wait.
    /// No input payload, tool name, capability claim or approval token is accepted.
    pub async fn check_tool_policy(
        &self,
        owner: &str,
        id: &str,
        step_id: &str,
        expected_revision: u32,
    ) -> Result<PolicyReceipt> {
        if !identifier(id) || !identifier(step_id) {
            return Err("invalid_policy_request");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let receipt_id = digest(&json!(["runbook_policy.v1", owner, id, step_id]));
        let request_hash = digest(&json!([
            "runbook_policy_request.v1",
            owner,
            id,
            step_id,
            expected_revision,
            current.instance.definition_ref
        ]));
        if let Some(prior) = self
            .store
            .read_kind(owner, "runbook_policy", Some(&receipt_id), None, &mut tx)
            .await?
            .pop()
        {
            let receipt = parse_policy_receipt(owner, &prior)?;
            if receipt.request_hash != request_hash {
                return Err("step_replay_conflict");
            }
            // This returns an audit of the old check, never a grant to execute or
            // resume. Revocation cannot be bypassed by replaying a review receipt.
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(receipt);
        }
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::Running
            || current.instance.current_step_id.as_deref() != Some(step_id)
        {
            return Err("step_not_current");
        }
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let step = definition
            .steps
            .get(current.instance.completed_step_ids.len())
            .ok_or("step_not_found")?;
        if step.kind != StepKind::Tool || step.step_id != step_id {
            return Err("not_a_tool_step");
        }
        let tool = step.tool.as_deref().ok_or("tool_not_allowed")?;
        let latest = self.store.load(owner, &mut tx).await?;
        let latest = latest
            .get(&definition.runbook_id)
            .ok_or("definition_not_found")?;
        // Current definition edits can revoke, but never expand, a frozen grant.
        let latest_permits = latest.definition.enabled
            && latest.definition.status == DefinitionStatus::Active
            && latest.definition.tools_allowlist.iter().any(|s| s == tool)
            && !matches!(
                latest.definition.max_autonomy,
                MaxAutonomy::ObserveOnly | MaxAutonomy::DraftOnly
            );
        let rows=sqlx::query("SELECT user_id,capability_id,approval_mode,health_state,revoked_at IS NOT NULL AS revoked FROM user_connected_capabilities WHERE user_id=$1 AND capability_id=$2 ORDER BY id LIMIT 2 FOR SHARE")
            .bind(owner).bind(tool).fetch_all(&mut *tx).await.map_err(|_|"storage_unavailable")?;
        // A definition has no provider-account selector yet. Ambiguity must not
        // silently choose an account or combine scopes from multiple connections.
        let connection = if rows.len() == 1 {
            Some(ConnectedToolPolicy {
                owner: rows[0].get("user_id"),
                tool: rows[0].get("capability_id"),
                healthy: rows[0].get::<String, _>("health_state") == "healthy",
                revoked: rows[0].get("revoked"),
                approval_mode: rows[0].get("approval_mode"),
            })
        } else {
            None
        };
        let level: Option<i32> = sqlx::query_scalar(
            "SELECT level FROM user_proactivity_config WHERE owner_user_id=$1 FOR SHARE",
        )
        .bind(owner)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| "storage_unavailable")?;
        let override_tier:Option<String>=sqlx::query_scalar("SELECT autonomy_tier FROM heuristic_autonomy_overrides WHERE owner_user_id=$1 AND heuristic_id=$2 FOR SHARE")
            .bind(owner).bind(format!("runbook:{}",definition.runbook_id)).fetch_optional(&mut *tx).await.map_err(|_|"storage_unavailable")?;
        let mut effective = definition.clone();
        if !latest_permits {
            effective.enabled = false;
        }
        if latest.definition.max_autonomy == MaxAutonomy::ApprovalRequired
            && effective.max_autonomy == MaxAutonomy::Reversible
        {
            effective.max_autonomy = MaxAutonomy::ApprovalRequired;
        }
        let decision = evaluate_tool_policy(
            owner,
            &effective,
            step,
            connection.as_ref(),
            level.unwrap_or(2),
            override_tier.as_deref(),
        );
        let denied = decision.disposition == PolicyDisposition::Denied;
        let now = Utc::now();
        let mut trace = StepTrace {
            trace_id: digest(&json!(["runbook_policy_trace.v1", owner, id, step_id])),
            instance_id: id.into(),
            step_id: step_id.into(),
            step_kind: StepKind::Tool,
            status: if denied {
                TraceStatus::Denied
            } else {
                TraceStatus::Waiting
            },
            input_refs: vec![current.instance.definition_ref.clone()],
            output_refs: vec![],
            input_hash: request_hash.clone(),
            output_hash: Some(digest(&json!(decision))),
            tool_id: Some(tool.into()),
            model: None,
            prompt_version: None,
            input_tokens: 0,
            output_tokens: 0,
            cost_microunits: 0,
            approval_ref: None,
            provenance_ref: None,
            started_at: now,
            completed_at: if denied { Some(now) } else { None },
        };
        self.attach_provenance(owner, &current.instance, &mut trace, None, &mut tx)
            .await?;
        let mut trace_afp = build_runtime_afp(
            owner,
            Some(&current.message_id),
            &RuntimeRecord::Trace(trace.clone()),
            now,
        )?;
        trace_afp["id"] = json!(trace.trace_id);
        self.store.append(owner, trace_afp, &mut tx).await?;
        let mut next = current.instance.transition(
            expected_revision,
            if denied {
                InstanceState::Failed
            } else {
                InstanceState::AwaitingApproval
            },
        )?;
        next.latest_trace_ref = Some(trace.trace_id.clone());
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        let receipt = PolicyReceipt {
            instance_id: id.into(),
            step_id: step_id.into(),
            request_hash,
            decision,
            trace,
        };
        self.store.append(owner,json!({"protocol":"afp-v1","id":receipt_id,"thread_id":current.instance.thread_id,"parent_id":current.message_id,
            "from":owner,"to":[owner],"timestamp":now.to_rfc3339(),"type":"runbook_policy","subtype":"v1","content":receipt,
            "references":[],"supertags":["runbook_policy"],"store_in_relational":true,
            "metadata":{"private":true,"store":true,"instance_id":id,"step_id":step_id}}),&mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }
}
