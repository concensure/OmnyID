//! Transactional deterministic transform execution; no caller-supplied facts.
use crate::{
    runbook_afp::{RuntimeRecord, parse_runtime_afp},
    runbook_contract::*,
    runbook_input::InputSupplied,
    runbook_runtime::{LocalStepResult, RunbookRuntime},
    runbook_store::digest,
    runbook_transform::{TransformReview, review},
    runbook_validation::identifier,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransformReceipt {
    pub instance_id: String,
    pub step_id: String,
    pub request_hash: String,
    pub evidence_ref: String,
    pub result: TransformReview,
    pub trace: StepTrace,
}

impl RunbookRuntime<'_, '_> {
    pub async fn execute_transform(
        &self,
        owner: &str,
        id: &str,
        step_id: &str,
        expected_revision: u32,
    ) -> Result<TransformReceipt> {
        if !identifier(step_id) {
            return Err("invalid_step_id");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let receipt_id = digest(&json!(["runbook_transform.v1", owner, id, step_id]));
        let request_hash = digest(&json!([
            "runbook_transform_request.v1",
            owner,
            id,
            step_id,
            expected_revision,
            current.instance.definition_ref
        ]));
        if let Some(value) = self
            .store
            .read_kind(owner, "runbook_transform", Some(&receipt_id), None, &mut tx)
            .await?
            .pop()
        {
            let receipt = validate(owner, &value)?;
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
        let step = definition
            .steps
            .get(current.instance.completed_step_ids.len())
            .ok_or("step_not_found")?;
        if step.kind != StepKind::Transform || step.step_id != step_id {
            return Err("not_a_transform_step");
        }
        let evidence_ref = current
            .instance
            .evidence_packet_ref
            .as_ref()
            .ok_or("evidence_required")?;
        let value = self
            .store
            .read_kind(owner, "runbook_evidence", Some(evidence_ref), None, &mut tx)
            .await?
            .pop()
            .ok_or("evidence_required")?;
        let read = crate::runbook_read::parse_receipt(owner, &value)?;
        if read.instance_id != id || !current.instance.completed_step_ids.contains(&read.step_id) {
            return Err("evidence_instance_mismatch");
        }
        // The current supported contract consumes the immediately saved Read
        // packet, not an arbitrary selector or data from a later revision.
        if step.input_refs != vec![format!("steps.{}.output_refs", read.step_id)] {
            return Err("unsupported_transform_selector");
        }
        let mut answers = BTreeMap::new();
        let mut answer_refs = vec![];
        for value in self
            .store
            .read_kind(
                owner,
                "runbook_input_supplied",
                None,
                Some(&current.instance.thread_id),
                &mut tx,
            )
            .await?
        {
            let input: InputSupplied = serde_json::from_value(value["content"].clone())
                .map_err(|_| "invalid_input_event")?;
            if input.instance_id != id {
                return Err("input_instance_mismatch");
            }
            let question = self
                .store
                .read_kind(
                    owner,
                    "epistemic_escalation",
                    Some(&input.escalation_id),
                    None,
                    &mut tx,
                )
                .await?
                .pop()
                .ok_or("question_not_found")?;
            let RuntimeRecord::Escalation(question) = parse_runtime_afp(owner, &question)? else {
                return Err("invalid_escalation");
            };
            if question.instance_id != id {
                return Err("question_instance_mismatch");
            }
            if question.step_id != step_id {
                continue;
            }
            answer_refs.push(input.event_id);
            for (field, value) in input.answers {
                if answers
                    .insert(field, value.clone())
                    .is_some_and(|prior| prior != value)
                {
                    return Err("conflicting_evidence");
                }
            }
        }
        let result = review(step, &read.packet, &answers)?;
        let input_hash = digest(&json!([
            request_hash,
            read.packet.hash,
            answer_refs,
            answers
        ]));
        let mut input_refs = vec![format!("private_message:{evidence_ref}")];
        input_refs.extend(
            answer_refs
                .into_iter()
                .map(|id| format!("private_message:{id}")),
        );
        let trace = self
            .record_local_step_in(
                owner,
                id,
                expected_revision,
                &LocalStepResult {
                    step_id: step_id.into(),
                    input_hash,
                    input_refs,
                    output_hash: digest(&json!(result)),
                    output_refs: vec![format!("private_message:{receipt_id}")],
                },
                None,
                &mut tx,
            )
            .await?;
        let receipt = TransformReceipt {
            instance_id: id.into(),
            step_id: step_id.into(),
            request_hash,
            evidence_ref: evidence_ref.clone(),
            result,
            trace,
        };
        self.store.append(owner,json!({"protocol":"afp-v1","id":receipt_id,"thread_id":current.instance.thread_id,
            "parent_id":current.message_id,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
            "type":"runbook_transform","subtype":"v1","content":receipt,"metadata":{"private":true,"store":true,"instance_id":id,"step_id":step_id},
            "references":[],"supertags":["runbook_transform"],"store_in_relational":true}),&mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }
}

pub(crate) fn validate(owner: &str, value: &Value) -> Result<TransformReceipt> {
    let r: TransformReceipt = serde_json::from_value(value["content"].clone())
        .map_err(|_| "invalid_transform_receipt")?;
    let id = digest(&json!([
        "runbook_transform.v1",
        owner,
        r.instance_id,
        r.step_id
    ]));
    if !identifier(&r.instance_id)
        || !identifier(&r.step_id)
        || !identifier(&r.evidence_ref)
        || r.request_hash.len() != 64
        || !r.request_hash.bytes().all(|b| b.is_ascii_hexdigit())
        || value["protocol"] != "afp-v1"
        || value["type"] != "runbook_transform"
        || value["subtype"] != "v1"
        || value["id"] != id
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["thread_id"] != format!("runbook:{}", r.instance_id)
        || !value["parent_id"].as_str().is_some_and(identifier)
        || value["metadata"]
            != json!({"private":true,"store":true,"instance_id":r.instance_id,"step_id":r.step_id})
        || value["references"] != json!([])
        || value["supertags"] != json!(["runbook_transform"])
        || value["store_in_relational"] != true
        || value["content"].to_string().len() > 65536
        || r.trace.instance_id != r.instance_id
        || r.trace.step_id != r.step_id
        || r.trace.step_kind != StepKind::Transform
        || r.trace.status != TraceStatus::Completed
        || r.trace.output_hash.as_deref() != Some(digest(&json!(r.result)).as_str())
        || r.trace.output_refs != vec![format!("private_message:{id}")]
    {
        return Err("invalid_transform_receipt");
    }
    RuntimeRecord::Trace(r.trace.clone()).validate()?;
    Ok(r)
}
