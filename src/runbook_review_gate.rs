//! Private review proposals use the existing action/approval surface. They are
//! not send, publish, booking or tool grants; execution stays at the review gate.
use crate::{
    runbook_afp::{RuntimeRecord, build_runtime_afp},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
    runbook_validation::identifier,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReviewGateReceipt {
    pub instance_id: String,
    pub step_id: String,
    pub request_hash: String,
    pub action_ref: String,
    pub source_ref: String,
    pub trace: StepTrace,
}

fn id(kind: &str, owner: &str, instance: &str, step: &str) -> String {
    digest(&json!([kind, owner, instance, step]))
}
fn envelope(
    owner: &str,
    instance: &str,
    step: &str,
    parent: &str,
    kind: &str,
    content: Value,
) -> Value {
    json!({"protocol":"afp-v1","id":id(kind,owner,instance,step),"thread_id":format!("runbook:{instance}"),
        "parent_id":parent,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),"type":kind,
        "subtype":"runbook_review_v1","content":content,"metadata":{"private":true,"store":true,"instance_id":instance,"step_id":step},
        "references":[],"supertags":["runbook_review_gate"],"store_in_relational":true})
}

fn review_payload(title: &str, source: &str) -> Value {
    json!({"title":title,"reason":"Review the saved evidence before proposing any external action.",
        "approval_kind":"review","requires_human_review":true,"confidence":"bounded_evidence",
        "option_count":2,"options":[{"option_id":"approve","label":"Approve this review","consequence_summary":"Record review only. Sending, publishing, booking and retries still require their own action authority."},
            {"option_id":"deny","label":"Decline this review","consequence_summary":"Keep the proposal private and take no external action."}],
        "consequence_summary_lines":["This is a private review proposal.","Approval does not send, publish, book or retry anything."],
        "provenance_summary":"Based on the frozen Runbook evidence and verified step receipt.",
        "source_refs":[source],"draft_preview":null,
        "autonomy_decision":crate::autonomy_policy::autonomy_decision_for_explicit_approval_boundary("External actions require separate authority.")})
}

impl RunbookRuntime<'_, '_> {
    pub(crate) async fn cancel_review_gates(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<()> {
        for value in self
            .store
            .read_kind(
                owner,
                "runbook_review_gate",
                None,
                Some(&instance.thread_id),
                tx,
            )
            .await?
        {
            let r = parse_receipt(owner, &value)?;
            let table = format!(
                "\"{}\".action_audit_log",
                crate::db::tenant_schema_name(owner)
            );
            sqlx::query(&format!("UPDATE {table} SET status='cancelled' WHERE capability_id='runbook.review' AND external_reference=$1 AND status='pending'"))
                .bind(&r.action_ref).execute(&mut **tx).await.map_err(|_| "storage_unavailable")?;
        }
        Ok(())
    }

    pub async fn request_review(
        &self,
        owner: &str,
        instance_id: &str,
        step_id: &str,
        expected_revision: u32,
    ) -> Result<ReviewGateReceipt> {
        if !identifier(step_id) {
            return Err("invalid_step_id");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, instance_id, &mut tx).await?;
        let receipt_id = id("runbook_review_gate", owner, instance_id, step_id);
        let request_hash = digest(&json!([
            owner,
            instance_id,
            step_id,
            expected_revision,
            current.instance.definition_ref
        ]));
        if let Some(prior) = self
            .store
            .read_kind(
                owner,
                "runbook_review_gate",
                Some(&receipt_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
        {
            let receipt = parse_receipt(owner, &prior)?;
            if receipt.request_hash != request_hash {
                return Err("step_replay_conflict");
            }
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
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let registry = self.store.load(owner, &mut tx).await?;
        let latest = registry
            .get(&current.instance.runbook_id)
            .ok_or("definition_not_found")?;
        if matches!(
            latest.definition.max_autonomy,
            MaxAutonomy::ObserveOnly | MaxAutonomy::DraftOnly
        ) {
            return Err("review_policy_denied");
        }
        if matches!(
            definition.max_autonomy,
            MaxAutonomy::ObserveOnly | MaxAutonomy::DraftOnly
        ) {
            return Err("review_policy_denied");
        }
        let index = current.instance.completed_step_ids.len();
        let step = definition.steps.get(index).ok_or("step_not_found")?;
        let prior = index
            .checked_sub(1)
            .and_then(|i| definition.steps.get(i))
            .ok_or("review_source_required")?;
        if step.kind != StepKind::Approval
            || step.step_id != step_id
            || !step.required_fields.is_empty()
            || step.input_refs != vec![format!("steps.{}.output_refs", prior.step_id)]
        {
            return Err("unsupported_review_gate");
        }
        let (source_ref, source_hash, proposal) = match prior.kind {
            StepKind::Transform => {
                let reference = digest(&json!([
                    "runbook_transform.v1",
                    owner,
                    instance_id,
                    prior.step_id
                ]));
                let v = self
                    .store
                    .read_kind(owner, "runbook_transform", Some(&reference), None, &mut tx)
                    .await?
                    .pop()
                    .ok_or("review_source_required")?;
                let r = crate::runbook_transform_runtime::validate(owner, &v)?;
                if r.instance_id != instance_id || r.step_id != prior.step_id {
                    return Err("review_source_mismatch");
                }
                (
                    reference,
                    r.trace.output_hash.ok_or("review_source_required")?,
                    json!(r.result.conclusions),
                )
            }
            StepKind::Draft => {
                let reference = digest(&json!([
                    "runbook_model_result",
                    owner,
                    instance_id,
                    prior.step_id
                ]));
                let v = self
                    .store
                    .read_kind(
                        owner,
                        "runbook_model_result",
                        Some(&reference),
                        None,
                        &mut tx,
                    )
                    .await?
                    .pop()
                    .ok_or("review_source_required")?;
                let r = crate::runbook_model_runtime::parse_receipt(owner, &v)?;
                if !r.applied
                    || r.trace.instance_id != instance_id
                    || r.trace.step_id != prior.step_id
                {
                    return Err("review_source_mismatch");
                }
                (
                    reference,
                    r.trace.output_hash.ok_or("review_source_required")?,
                    r.draft_afp.ok_or("review_draft_required")?,
                )
            }
            _ => return Err("unsupported_review_source"),
        };
        let source = format!("private_message:{source_ref}");
        let review = review_payload(&definition.name, &source);
        let content = json!({"capability_id":"runbook.review","approval_mode":"human_approval_required",
            "approval_review":review,"proposal":proposal,"source_ref":source,"external_execution_authorized":false});
        let action = envelope(owner, instance_id, step_id, &source_ref, "action", content);
        let action_ref = action["id"]
            .as_str()
            .ok_or("invalid_review_action")?
            .to_owned();
        let app: crate::message::AFPMessage =
            serde_json::from_value(action.clone()).map_err(|_| "invalid_review_action")?;
        let shared_review = crate::server::approval_surfaces::build_action_approval_review_payload(
            &app,
            "runbook.review",
        );
        if shared_review != review {
            return Err("review_contract_mismatch");
        }
        self.store.append(owner, action.clone(), &mut tx).await?;
        let now = Utc::now();
        let mut trace = StepTrace {
            trace_id: id("runbook_review_gate_trace", owner, instance_id, step_id),
            instance_id: instance_id.into(),
            step_id: step_id.into(),
            step_kind: StepKind::Approval,
            status: TraceStatus::Waiting,
            input_refs: vec![source],
            output_refs: vec![format!("private_message:{action_ref}")],
            input_hash: digest(&json!([request_hash, source_hash])),
            output_hash: Some(digest(&action["content"])),
            tool_id: None,
            model: None,
            prompt_version: None,
            input_tokens: 0,
            output_tokens: 0,
            cost_microunits: 0,
            approval_ref: None,
            provenance_ref: None,
            started_at: now,
            completed_at: None,
        };
        self.attach_provenance(owner, &current.instance, &mut trace, None, &mut tx)
            .await?;
        let mut trace_message = build_runtime_afp(
            owner,
            Some(&current.message_id),
            &RuntimeRecord::Trace(trace.clone()),
            now,
        )?;
        trace_message["id"] = json!(trace.trace_id);
        self.store.append(owner, trace_message, &mut tx).await?;
        let mut next = current
            .instance
            .transition(expected_revision, InstanceState::AwaitingApproval)?;
        next.latest_trace_ref = Some(trace.trace_id.clone());
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        // Existing account-private action audit projection, in the same transaction.
        // Only bounded presentation/reference data is projected, never draft bodies.
        let table = format!(
            "\"{}\".action_audit_log",
            crate::db::tenant_schema_name(owner)
        );
        sqlx::query(&format!("INSERT INTO {table} (capability_id,thread_id,status,output,external_reference,recorded_at) VALUES ($1,$2,'pending',$3,$4,$5)"))
            .bind("runbook.review").bind(&current.instance.thread_id)
            .bind(json!({"message_id":action_ref,"approval_mode":"human_approval_required","approval_review":shared_review}))
            .bind(&action_ref).bind(now).execute(&mut *tx).await.map_err(|_| "storage_unavailable")?;
        let receipt = ReviewGateReceipt {
            instance_id: instance_id.into(),
            step_id: step_id.into(),
            request_hash,
            action_ref,
            source_ref,
            trace,
        };
        self.store
            .append(
                owner,
                envelope(
                    owner,
                    instance_id,
                    step_id,
                    &current.message_id,
                    "runbook_review_gate",
                    json!(receipt),
                ),
                &mut tx,
            )
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }
}

pub(crate) fn validate(owner: &str, value: &Value) -> Result<()> {
    let instance = value["metadata"]["instance_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_review_gate")?;
    let step = value["metadata"]["step_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_review_gate")?;
    let parent = value["parent_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_review_gate")?;
    let kind = value["type"].as_str().ok_or("invalid_review_gate")?;
    if !matches!(kind, "action" | "runbook_review_gate") {
        return Err("invalid_review_gate");
    }
    let expected = envelope(owner, instance, step, parent, kind, Value::Null);
    for key in [
        "protocol",
        "id",
        "thread_id",
        "from",
        "to",
        "type",
        "subtype",
        "metadata",
        "references",
        "supertags",
        "store_in_relational",
    ] {
        if value[key] != expected[key] {
            return Err("invalid_review_gate");
        }
    }
    if value["content"].to_string().len() > 32768
        || chrono::DateTime::parse_from_rfc3339(value["timestamp"].as_str().unwrap_or("")).is_err()
    {
        return Err("invalid_review_gate");
    }
    if kind == "action" {
        let c = &value["content"];
        if c.as_object().map(|o| o.len()) != Some(6)
            || c["capability_id"] != "runbook.review"
            || c["approval_mode"] != "human_approval_required"
            || c["external_execution_authorized"] != false
            || c["source_ref"] != format!("private_message:{parent}")
            || c["approval_review"]
                != review_payload(
                    c["approval_review"]["title"]
                        .as_str()
                        .ok_or("invalid_review_gate")?,
                    c["source_ref"].as_str().unwrap_or(""),
                )
        {
            return Err("invalid_review_action");
        }
    } else {
        let r: ReviewGateReceipt =
            serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_review_gate")?;
        RuntimeRecord::Trace(r.trace.clone()).validate()?;
        if r.instance_id != instance
            || r.step_id != step
            || r.request_hash.len() != 64
            || !r.request_hash.bytes().all(|b| b.is_ascii_hexdigit())
            || r.trace.output_hash.is_none()
            || r.action_ref != id("action", owner, instance, step)
            || !identifier(&r.source_ref)
            || r.trace.trace_id != id("runbook_review_gate_trace", owner, instance, step)
            || r.trace.instance_id != instance
            || r.trace.step_id != step
            || r.trace.step_kind != StepKind::Approval
            || r.trace.status != TraceStatus::Waiting
            || r.trace.approval_ref.is_some()
            || r.trace.provenance_ref.is_none()
            || r.trace.input_refs != vec![format!("private_message:{}", r.source_ref)]
            || r.trace.output_refs != vec![format!("private_message:{}", r.action_ref)]
        {
            return Err("invalid_review_gate");
        }
    }
    Ok(())
}
pub(crate) fn parse_receipt(owner: &str, value: &Value) -> Result<ReviewGateReceipt> {
    validate(owner, value)?;
    serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_review_gate")
}
