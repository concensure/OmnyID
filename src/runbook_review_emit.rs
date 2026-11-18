//! Continue a reviewed proposal into a private, non-actionable finding.
use crate::{
    message::AfpProactiveSuggestionContent,
    runbook_afp::{build_runtime_afp, RuntimeRecord},
    runbook_contract::*,
    runbook_emit::EmissionReceipt,
    runbook_review_decision::{parse, receipt_id, ReviewDecision},
    runbook_runtime::{InstanceRecord, RunbookRuntime},
    runbook_store::digest,
};
use chrono::Utc;
use serde_json::json;
use sqlx::{Postgres, Transaction};

impl RunbookRuntime<'_, '_> {
    pub(crate) async fn emit_approved_in(
        &self,
        owner: &str,
        current: &InstanceRecord,
        definition: &RunbookDefinition,
        index: usize,
        request_hash: String,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<EmissionReceipt> {
        let instance = &current.instance;
        let id = &instance.instance_id;
        let step = definition.steps.get(index).ok_or("step_not_found")?;
        let approval = definition
            .steps
            .get(index.checked_sub(1).ok_or("approval_required")?)
            .ok_or("approval_required")?;
        let source = definition
            .steps
            .get(index.checked_sub(2).ok_or("review_source_required")?)
            .ok_or("review_source_required")?;
        if approval.kind != StepKind::Approval
            || !matches!(source.kind, StepKind::Draft | StepKind::Transform)
            || step.input_refs != vec![format!("steps.{}.output_refs", source.step_id)]
        {
            return Err("unsupported_review_selector");
        }
        let gate_id = digest(&json!(["runbook_review_gate", owner, id, approval.step_id]));
        let value = self
            .store
            .read_kind(owner, "runbook_review_gate", Some(&gate_id), None, tx)
            .await?
            .pop()
            .ok_or("approval_required")?;
        let gate = crate::runbook_review_gate::parse_receipt(owner, &value)?;
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_review_decision",
                Some(&receipt_id(owner, &gate.action_ref)),
                None,
                tx,
            )
            .await?
            .pop()
            .ok_or("approval_required")?;
        let decision = parse(owner, &value)?;
        if decision.instance_id != *id
            || decision.step_id != approval.step_id
            || decision.request.decision != ReviewDecision::Approved
        {
            return Err("approval_required");
        }
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_step_trace",
                Some(&decision.trace.trace_id),
                None,
                tx,
            )
            .await?
            .pop()
            .ok_or("approval_required")?;
        if value["content"] != json!(decision.trace) {
            return Err("approval_trace_mismatch");
        }
        let action = self
            .store
            .read_kind(owner, "action", Some(&gate.action_ref), None, tx)
            .await?
            .pop()
            .ok_or("review_action_missing")?;
        if gate.trace.output_hash != Some(digest(&action["content"])) {
            return Err("review_action_mismatch");
        }
        let source_ref = format!("private_message:{}", gate.source_ref);
        let content = AfpProactiveSuggestionContent {
            heuristic_id: crate::runbook_outcome::outcome_key(&instance.runbook_id, &step.step_id)?,
            confidence: 1.0,
            urgency: "low".into(),
            action_label: "Review findings".into(),
            description: "Your review decision is saved. External actions need separate authority."
                .into(),
            title: Some("Reviewed runbook proposal".into()),
            destination_view: Some("decision_queue".into()),
            artifact_summary_lines: vec![
                "You approved this private review.".into(),
                "No message, calendar change, publication, booking or retry was executed.".into(),
            ],
            source_refs: vec![source_ref.clone()],
            source_count: Some(1),
            source_event_id: Some(instance.trigger_event_id.clone()),
            provenance_cue: Some("The saved approval binds the exact private proposal.".into()),
            ..Default::default()
        };
        let suggestion_ref = digest(&json!(["runbook_review.v1", owner, id, step.step_id]));
        let now = Utc::now();
        let message = json!({"protocol":"afp-v1","id":suggestion_ref,"thread_id":instance.thread_id,"parent_id":gate.source_ref,"from":owner,"to":[owner],
            "timestamp":now.to_rfc3339(),"type":"proactive_suggestion","subtype":"runbook_review:v1","content":content,
            "metadata":{"private":true,"store":true,"instance_id":id,"step_id":step.step_id},"references":[],"supertags":["runbook_review"],"store_in_relational":true});
        self.store.append(owner, message.clone(), tx).await?;
        let trace_id = digest(&json!(["runbook_step.v1", owner, id, step.step_id]));
        let mut trace = StepTrace {
            trace_id: trace_id.clone(),
            instance_id: id.clone(),
            step_id: step.step_id.clone(),
            step_kind: StepKind::Emit,
            status: TraceStatus::Completed,
            input_refs: vec![
                source_ref,
                format!("private_message:{}", decision.decision_ref),
            ],
            output_refs: vec![format!("private_message:{suggestion_ref}")],
            input_hash: digest(&json!([
                request_hash,
                gate.trace.output_hash,
                decision.trace.output_hash
            ])),
            output_hash: Some(digest(&message["content"])),
            approval_ref: Some(decision.decision_ref.clone()),
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
        self.attach_provenance(owner, instance, &mut trace, None, tx)
            .await?;
        let mut message = build_runtime_afp(
            owner,
            Some(&current.message_id),
            &RuntimeRecord::Trace(trace.clone()),
            now,
        )?;
        message["id"] = json!(trace_id);
        self.store.append(owner, message, tx).await?;
        let mut next = instance.clone();
        next.revision = next.revision.checked_add(1).ok_or("revision_overflow")?;
        next.completed_step_ids.push(step.step_id.clone());
        next.current_step_id = Some(
            definition
                .steps
                .get(index + 1)
                .ok_or("missing_completion_step")?
                .step_id
                .clone(),
        );
        next.latest_trace_ref = Some(trace_id);
        self.append_instance(owner, Some(&current.message_id), next, tx)
            .await?;
        let receipt = EmissionReceipt {
            instance_id: id.clone(),
            step_id: step.step_id.clone(),
            request_hash,
            transform_ref: gate.source_ref,
            answer_ref: None,
            approval_ref: Some(decision.decision_ref),
            suggestion_ref,
            trace,
        };
        let rid = digest(&json!(["runbook_emission.v1", owner, id, step.step_id]));
        self.store.append(owner,json!({"protocol":"afp-v1","id":rid,"thread_id":instance.thread_id,"parent_id":current.message_id,"from":owner,"to":[owner],
            "timestamp":now.to_rfc3339(),"type":"runbook_emission","subtype":"v1","content":receipt,
            "metadata":{"private":true,"store":true,"instance_id":id,"step_id":step.step_id},"references":[],"supertags":["runbook_emission"],"store_in_relational":true}),tx).await?;
        Ok(receipt)
    }
}
