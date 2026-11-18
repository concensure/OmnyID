//! Deterministic read execution: frozen selectors, encrypted evidence and atomic
//! step/instance receipts. No caller-provided evidence or arbitrary query input.
use crate::{
    runbook_afp::{RuntimeRecord, parse_runtime_afp},
    runbook_contract::*,
    runbook_event::normalize_stored_event,
    runbook_evidence::{EvidencePacket, EvidenceRequest},
    runbook_runtime::{DispatchReceipt, LocalStepResult, RunbookRuntime},
    runbook_store::digest,
    runbook_validation::identifier,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReadRequest {
    pub step_id: String,
    pub expected_revision: u32,
    pub snapshot_ref: Option<String>,
    pub decrypt_limit: usize,
    pub byte_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReadReceipt {
    pub instance_id: String,
    pub step_id: String,
    pub request_hash: String,
    pub packet: EvidencePacket,
    pub trace: StepTrace,
}

pub(crate) fn parse_receipt(owner: &str, value: &Value) -> Result<ReadReceipt> {
    let receipt: ReadReceipt =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_evidence_receipt")?;
    let id = digest(&json!([
        "runbook_evidence.v1",
        owner,
        receipt.instance_id,
        receipt.step_id
    ]));
    let mut packet = receipt.packet.clone();
    packet.hash.clear();
    if !identifier(owner)
        || !identifier(&receipt.instance_id)
        || !identifier(&receipt.step_id)
        || value["protocol"] != "afp-v1"
        || value["id"] != id
        || value["type"] != "runbook_evidence"
        || value["subtype"] != "v1"
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["thread_id"] != format!("runbook:{}", receipt.instance_id)
        || value["metadata"]
            != json!({"private":true,"store":true,"instance_id":receipt.instance_id,"step_id":receipt.step_id})
        || receipt.trace.instance_id != receipt.instance_id
        || receipt.trace.step_id != receipt.step_id
        || receipt.trace.step_kind != StepKind::Read
        || receipt.trace.status != TraceStatus::Completed
        || receipt.trace.input_hash != receipt.request_hash
        || receipt.trace.output_hash.as_deref() != Some(receipt.packet.hash.as_str())
        || digest(&json!(packet)) != receipt.packet.hash
        || value["content"].to_string().len() > 524288
    {
        return Err("invalid_evidence_receipt");
    }
    RuntimeRecord::Trace(receipt.trace.clone()).validate()?;
    Ok(receipt)
}

impl RunbookRuntime<'_, '_> {
    /// Trusted executor entry point. Owner must be authenticated/daemon-derived.
    /// Budget arguments may only narrow the future shared account-policy budget.
    pub async fn execute_read(
        &self,
        owner: &str,
        id: &str,
        request: &ReadRequest,
    ) -> Result<ReadReceipt> {
        if !identifier(id) || !identifier(&request.step_id) {
            return Err("invalid_read_request");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let receipt_id = digest(&json!(["runbook_evidence.v1", owner, id, request.step_id]));
        let request_hash = digest(&json!([
            "runbook_read.v1",
            owner,
            id,
            current.instance.definition_ref,
            request
        ]));
        if let Some(prior) = self
            .store
            .read_kind(owner, "runbook_evidence", Some(&receipt_id), None, &mut tx)
            .await?
            .pop()
        {
            let prior = parse_receipt(owner, &prior)?;
            if prior.request_hash != request_hash {
                return Err("step_replay_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(prior);
        }
        if current.instance.revision != request.expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::Running
            || current.instance.current_step_id.as_deref() != Some(&request.step_id)
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
        if step.kind != StepKind::Read || step.step_id != request.step_id {
            return Err("not_a_read_step");
        }
        if request.snapshot_ref.is_some()
            && !step.input_refs.iter().any(|s| s == "state.snapshot_ref")
        {
            return Err("undeclared_snapshot_selector");
        }
        let source: Value = sqlx::query_scalar("SELECT payload FROM afp_messages WHERE owner_user_id=$1 AND id=$2 AND octet_length(payload::text)<=65536 FOR SHARE")
            .bind(owner).bind(&current.instance.trigger_event_id).fetch_optional(&mut *tx).await.map_err(|_| "storage_unavailable")?.ok_or("event_not_found_or_too_large")?;
        let event = normalize_stored_event(owner, owner, &source)?;
        let dispatch_id = digest(&json!(["runbook_dispatch.v1", owner, event.event_id]));
        let dispatch = self
            .store
            .read_kind(owner, "runbook_dispatch", Some(&dispatch_id), None, &mut tx)
            .await?
            .pop()
            .ok_or("dispatch_not_found")?;
        let dispatch: DispatchReceipt =
            serde_json::from_value(dispatch["content"].clone()).map_err(|_| "invalid_dispatch")?;
        if event.event_id != current.instance.trigger_event_id
            || dispatch.event_hash != digest(&json!(event))
        {
            return Err("event_replay_conflict");
        }
        let mut refs = Vec::new();
        for selector in &step.input_refs {
            match selector.as_str() {
                "event.source_refs" => refs.extend(event.source_refs.clone()),
                "event.entity_refs" => refs.extend(event.entity_refs.clone()),
                "state.snapshot_ref" => {
                    if let Some(reference) = &request.snapshot_ref {
                        if !reference.starts_with("snapshot:") {
                            return Err("invalid_snapshot_reference");
                        }
                        refs.push(reference.clone());
                    }
                }
                _ => {
                    let prior_step = selector
                        .strip_prefix("steps.")
                        .and_then(|s| s.strip_suffix(".output_refs"))
                        .ok_or("invalid_evidence_selector")?;
                    if !current
                        .instance
                        .completed_step_ids
                        .iter()
                        .any(|s| s == prior_step)
                    {
                        return Err("step_dependency_incomplete");
                    }
                    let trace_id = digest(&json!(["runbook_step.v1", owner, id, prior_step]));
                    let trace = self
                        .store
                        .read_kind(owner, "runbook_step_trace", Some(&trace_id), None, &mut tx)
                        .await?
                        .pop()
                        .ok_or("step_trace_missing")?;
                    let RuntimeRecord::Trace(trace) = parse_runtime_afp(owner, &trace)? else {
                        return Err("invalid_trace");
                    };
                    if trace.instance_id != id || trace.status != TraceStatus::Completed {
                        return Err("invalid_dependency_trace");
                    }
                    refs.extend(trace.output_refs);
                }
            }
        }
        refs.sort();
        refs.dedup();
        let packet = self
            .store
            .resolve_evidence_in(
                owner,
                &EvidenceRequest {
                    refs: refs.clone(),
                    required_fields: step.required_fields.clone(),
                    evidence_limit: definition.evidence_limit as usize,
                    decrypt_limit: request.decrypt_limit,
                    byte_limit: request.byte_limit,
                },
                &mut tx,
            )
            .await?;
        let trace = self
            .record_local_step_in(
                owner,
                id,
                request.expected_revision,
                &LocalStepResult {
                    step_id: request.step_id.clone(),
                    input_hash: request_hash.clone(),
                    input_refs: refs,
                    output_hash: packet.hash.clone(),
                    output_refs: packet
                        .included
                        .iter()
                        .map(|i| i.reference.clone())
                        .collect(),
                },
                Some(&receipt_id),
                false,
                &mut tx,
            )
            .await?;
        let receipt = ReadReceipt {
            instance_id: id.into(),
            step_id: request.step_id.clone(),
            request_hash,
            packet,
            trace,
        };
        self.store.append(owner,json!({"protocol":"afp-v1","id":receipt_id,"thread_id":current.instance.thread_id,
            "parent_id":current.message_id,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
            "type":"runbook_evidence","subtype":"v1","content":receipt,"references":[],"supertags":["runbook_evidence"],
            "store_in_relational":true,"metadata":{"private":true,"store":true,"instance_id":id,"step_id":request.step_id}}),&mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }
}
