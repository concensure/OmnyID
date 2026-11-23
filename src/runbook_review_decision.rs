//! Authenticated review decisions grant continuation of private preparation only.
use crate::{
    runbook_afp::{build_runtime_afp, RuntimeRecord},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
    runbook_validation::identifier,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewDecision {
    Approved,
    Rejected,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDecisionRequest {
    pub action_ref: String,
    pub expected_revision: u32,
    pub decision: ReviewDecision,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewDecisionReceipt {
    pub instance_id: String,
    pub step_id: String,
    pub request: ReviewDecisionRequest,
    pub decision_ref: String,
    pub trace: StepTrace,
}
pub(crate) fn receipt_id(owner: &str, action: &str) -> String {
    digest(&json!(["runbook_review_decision", owner, action]))
}
fn decision_id(owner: &str, action: &str) -> String {
    digest(&json!(["runbook_review_decision_action", owner, action]))
}
fn envelope(
    owner: &str,
    instance: &str,
    step: &str,
    parent: &str,
    kind: &str,
    id: &str,
    content: Value,
) -> Value {
    json!({"protocol":"afp-v1","id":id,"thread_id":format!("runbook:{instance}"),"parent_id":parent,
        "from":owner,"to":[owner],"type":kind,"subtype":if kind=="action"{"approval_decision"}else{"v1"},
        "timestamp":Utc::now().to_rfc3339(),"content":content,"metadata":{"private":true,"store":true,"instance_id":instance,"step_id":step,"origin":"human_approval"},
        "references":[],"supertags":["runbook_review_decision"],"store_in_relational":true})
}

impl RunbookRuntime<'_, '_> {
    /// Only call with the owner derived from an authenticated, recent session.
    /// No caller-supplied actor, note, capability, output or action payload is trusted.
    pub async fn decide_review(
        &self,
        owner: &str,
        instance: &str,
        request: &ReviewDecisionRequest,
    ) -> Result<ReviewDecisionReceipt> {
        if !identifier(&request.action_ref) || request.expected_revision == 0 {
            return Err("invalid_review_decision");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, instance, &mut tx).await?;
        let rid = receipt_id(owner, &request.action_ref);
        if let Some(v) = self
            .store
            .read_kind(owner, "runbook_review_decision", Some(&rid), None, &mut tx)
            .await?
            .pop()
        {
            let r = parse(owner, &v)?;
            if r.instance_id != instance || &r.request != request {
                return Err("decision_replay_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(r);
        }
        if current.instance.revision != request.expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::AwaitingApproval {
            return Err("review_not_pending");
        }
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let index = current.instance.completed_step_ids.len();
        let step = definition.steps.get(index).ok_or("step_not_found")?;
        if step.kind != StepKind::Approval
            || current.instance.current_step_id.as_deref() != Some(&step.step_id)
        {
            return Err("step_not_current");
        }
        let gate_ref = digest(&json!([
            "runbook_review_gate",
            owner,
            instance,
            step.step_id
        ]));
        let gate = self
            .store
            .read_kind(owner, "runbook_review_gate", Some(&gate_ref), None, &mut tx)
            .await?
            .pop()
            .ok_or("review_source_required")?;
        let gate = crate::runbook_review_gate::parse_receipt(owner, &gate)?;
        if gate.action_ref != request.action_ref {
            return Err("review_target_mismatch");
        }
        let action = self
            .store
            .read_kind(owner, "action", Some(&request.action_ref), None, &mut tx)
            .await?
            .pop()
            .ok_or("review_action_missing")?;
        if gate.trace.output_hash != Some(digest(&action["content"])) {
            return Err("review_action_mismatch");
        }
        let approved = request.decision == ReviewDecision::Approved;
        if approved {
            self.require_enabled(owner, &current.instance, &mut tx)
                .await?;
            let latest = self.store.load(owner, &mut tx).await?;
            let latest = latest
                .get(&definition.runbook_id)
                .ok_or("definition_not_found")?;
            if [definition.max_autonomy, latest.definition.max_autonomy]
                .iter()
                .any(|v| matches!(v, MaxAutonomy::ObserveOnly | MaxAutonomy::DraftOnly))
            {
                return Err("review_policy_denied");
            }
        }
        let decision_ref = decision_id(owner, &request.action_ref);
        let content = json!({"target_message_id":request.action_ref,"capability_id":"runbook.review","decision":request.decision,
            "status":request.decision,"approval_mode":"human_approval_required","external_execution_authorized":false});
        self.store
            .append(
                owner,
                envelope(
                    owner,
                    instance,
                    &step.step_id,
                    &request.action_ref,
                    "action",
                    &decision_ref,
                    content.clone(),
                ),
                &mut tx,
            )
            .await?;
        let now = Utc::now();
        let trace_id = digest(&json!(["runbook_step.v1", owner, instance, step.step_id]));
        let mut trace = StepTrace {
            trace_id: trace_id.clone(),
            instance_id: instance.into(),
            step_id: step.step_id.clone(),
            step_kind: StepKind::Approval,
            status: if approved {
                TraceStatus::Completed
            } else {
                TraceStatus::Failed
            },
            input_refs: vec![format!("private_message:{}", request.action_ref)],
            output_refs: vec![format!("private_message:{decision_ref}")],
            input_hash: digest(&json!([
                request,
                gate.trace.output_hash,
                current.instance.definition_ref
            ])),
            output_hash: Some(digest(&content)),
            approval_ref: Some(decision_ref.clone()),
            provenance_ref: None,
            tool_id: None,
            model: None,
            prompt_version: None,
            input_tokens: 0,
            output_tokens: 0,
            cost_microunits: 0,
            started_at: now,
            completed_at: Some(now),
        };
        self.attach_provenance(owner, &current.instance, &mut trace, None, &mut tx)
            .await?;
        let mut message = build_runtime_afp(
            owner,
            Some(&current.message_id),
            &RuntimeRecord::Trace(trace.clone()),
            now,
        )?;
        message["id"] = json!(trace_id);
        self.store.append(owner, message, &mut tx).await?;
        let mut next = current.instance.transition(
            request.expected_revision,
            if approved {
                InstanceState::Running
            } else {
                InstanceState::Cancelled
            },
        )?;
        next.latest_trace_ref = Some(trace_id);
        if approved {
            next.completed_step_ids.push(step.step_id.clone());
            next.current_step_id = Some(
                definition
                    .steps
                    .get(index + 1)
                    .ok_or("missing_completion_step")?
                    .step_id
                    .clone(),
            );
        } else {
            next.current_step_id = None;
            self.cancel_questions(owner, &current, &mut tx).await?;
            self.resolve_schedules(owner, &current, false, &mut tx)
                .await?;
        }
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        let table = format!(
            "\"{}\".action_audit_log",
            crate::db::tenant_schema_name(owner)
        );
        let status = if approved { "approved" } else { "rejected" };
        let changed=sqlx::query(&format!("UPDATE {table} SET status=$1 WHERE capability_id='runbook.review' AND external_reference=$2 AND status='pending'"))
            .bind(status).bind(&request.action_ref).execute(&mut *tx).await.map_err(|_|"storage_unavailable")?.rows_affected();
        if changed != 1 {
            return Err("review_projection_conflict");
        }
        let receipt = ReviewDecisionReceipt {
            instance_id: instance.into(),
            step_id: step.step_id.clone(),
            request: request.clone(),
            decision_ref,
            trace,
        };
        self.store
            .append(
                owner,
                envelope(
                    owner,
                    instance,
                    &step.step_id,
                    &request.action_ref,
                    "runbook_review_decision",
                    &rid,
                    json!(receipt),
                ),
                &mut tx,
            )
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }
}

pub(crate) fn validate(owner: &str, v: &Value) -> Result<()> {
    let instance = v["metadata"]["instance_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_review_decision")?;
    let step = v["metadata"]["step_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_review_decision")?;
    let parent = v["parent_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_review_decision")?;
    let kind = v["type"].as_str().ok_or("invalid_review_decision")?;
    let id = match kind {
        "action" => decision_id(owner, parent),
        "runbook_review_decision" => receipt_id(owner, parent),
        _ => return Err("invalid_review_decision"),
    };
    let expected = envelope(owner, instance, step, parent, kind, &id, Value::Null);
    for key in [
        "protocol",
        "id",
        "thread_id",
        "parent_id",
        "from",
        "to",
        "type",
        "subtype",
        "metadata",
        "references",
        "supertags",
        "store_in_relational",
    ] {
        if v[key] != expected[key] {
            return Err("invalid_review_decision");
        }
    }
    if chrono::DateTime::parse_from_rfc3339(v["timestamp"].as_str().unwrap_or("")).is_err()
        || v["content"].to_string().len() > 16384
    {
        return Err("invalid_review_decision");
    }
    if kind == "action" {
        let decision: ReviewDecision = serde_json::from_value(v["content"]["decision"].clone())
            .map_err(|_| "invalid_review_decision")?;
        if v["content"]
            != json!({"target_message_id":parent,"capability_id":"runbook.review","decision":decision,"status":decision,"approval_mode":"human_approval_required","external_execution_authorized":false})
        {
            return Err("invalid_review_decision");
        }
    } else {
        let r: ReviewDecisionReceipt =
            serde_json::from_value(v["content"].clone()).map_err(|_| "invalid_review_decision")?;
        RuntimeRecord::Trace(r.trace.clone()).validate()?;
        if r.instance_id != instance
            || r.step_id != step
            || r.request.action_ref != parent
            || r.request.expected_revision == 0
            || r.decision_ref != decision_id(owner, parent)
            || r.trace.instance_id != instance
            || r.trace.step_id != step
            || r.trace.step_kind != StepKind::Approval
            || r.trace.trace_id != digest(&json!(["runbook_step.v1", owner, instance, step]))
            || r.trace.status
                != if r.request.decision == ReviewDecision::Approved {
                    TraceStatus::Completed
                } else {
                    TraceStatus::Failed
                }
            || r.trace.approval_ref.as_deref() != Some(&r.decision_ref)
            || r.trace.provenance_ref.is_none()
            || r.trace.output_hash.is_none()
            || r.trace.input_refs != vec![format!("private_message:{parent}")]
            || r.trace.output_refs != vec![format!("private_message:{}", r.decision_ref)]
        {
            return Err("invalid_review_decision");
        }
    }
    Ok(())
}
pub(crate) fn parse(owner: &str, v: &Value) -> Result<ReviewDecisionReceipt> {
    validate(owner, v)?;
    serde_json::from_value(v["content"].clone()).map_err(|_| "invalid_review_decision")
}
