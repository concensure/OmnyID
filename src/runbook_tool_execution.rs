//! Reserve before trusted provider invocation; never reacquire an abandoned call.
use crate::{
    mcp_client::bounded::{CallFailure, CallOutcome, CallResponse},
    runbook_afp::{RuntimeRecord, build_runtime_afp},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
    runbook_tool_records::{self as records, *},
    tool_dispatch::runbook_contract::PreparedRunbookTool,
};
use chrono::Utc;
use serde_json::json;

/// Trusted internal adapter seam, analogous to ModelProvider. A future live
/// adapter must use the bound account and credential authority. No route invokes it.
#[async_trait::async_trait]
pub trait ToolProvider: Send + Sync {
    async fn call(
        &self,
        request: &PreparedRunbookTool,
    ) -> std::result::Result<CallResponse, CallFailure>;
}
impl RunbookRuntime<'_, '_> {
    pub async fn execute_tool(
        &self,
        owner: &str,
        instance: &str,
        proposal_ref: &str,
        provider: &dyn ToolProvider,
    ) -> Result<ToolReceipt> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, instance, &mut tx).await?;
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_tool_proposal",
                Some(proposal_ref),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("tool_proposal_missing")?;
        let proposal: ToolProposal = records::decode(&value)?;
        if proposal.instance_id != instance {
            return Err("tool_proposal_mismatch");
        }
        let step = &proposal.step_id;
        let result_id = records::id("runbook_tool_result", owner, instance, step);
        if let Some(v) = self
            .store
            .read_kind(
                owner,
                "runbook_tool_result",
                Some(&result_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
        {
            let receipt: ToolReceipt = records::decode(&v)?;
            if receipt.proposal_ref != proposal_ref || receipt.request_hash != proposal.request_hash
            {
                return Err("tool_replay_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(receipt);
        }
        let reservation_id = records::id("runbook_tool_reservation", owner, instance, step);
        if !self
            .store
            .read_kind(
                owner,
                "runbook_tool_reservation",
                Some(&reservation_id),
                None,
                &mut tx,
            )
            .await?
            .is_empty()
        {
            return Err("tool_attempt_reserved");
        }
        let decision_id = records::id("runbook_tool_decision", owner, instance, step);
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_tool_decision",
                Some(&decision_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("tool_approval_required")?;
        let decision: ToolDecision = records::decode(&value)?;
        if !decision.approved
            || decision.proposal_ref != proposal_ref
            || decision.request_hash != proposal.request_hash
        {
            return Err("tool_approval_required");
        }
        if current.instance.revision
            != decision
                .expected_revision
                .checked_add(1)
                .ok_or("revision_overflow")?
            || current.instance.status != InstanceState::Running
            || current.instance.current_step_id.as_deref() != Some(step)
        {
            return Err("tool_approval_stale");
        }
        if proposal.expires_at <= Utc::now() {
            return Err("tool_proposal_expired");
        }
        let prepared = self
            .prepare_current_tool(owner, &current.instance, &proposal.request, &mut tx)
            .await?;
        if prepared.request_hash() != proposal.request_hash {
            return Err("tool_preparation_stale");
        }
        let reservation = Reservation {
            instance_id: instance.into(),
            step_id: step.clone(),
            proposal_ref: proposal_ref.into(),
            decision_ref: decision_id.clone(),
            request_hash: proposal.request_hash.clone(),
            expected_revision: current.instance.revision,
            started_at: Utc::now(),
        };
        self.store
            .append(
                owner,
                records::envelope(
                    owner,
                    "runbook_tool_reservation",
                    instance,
                    step,
                    &decision_id,
                    json!(reservation),
                ),
                &mut tx,
            )
            .await?;
        // Authorization linearizes here. Later revocation/cancellation can stop
        // continuation, not undo a request already admitted to the provider.
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        let result =
            tokio::time::timeout(std::time::Duration::from_secs(30), provider.call(&prepared))
                .await;
        let (outcome, failure, output) = match result {
            Ok(Ok(response)) => match prepared.validate_response(&response) {
                Ok(output) => (ToolOutcome::Completed, None, Some(output.clone())),
                Err(_) => (
                    ToolOutcome::Unknown,
                    Some("tool_response_invalid".to_owned()),
                    None,
                ),
            },
            Ok(Err(e)) => (
                if e.outcome == CallOutcome::NotSent {
                    ToolOutcome::NotSent
                } else {
                    ToolOutcome::Unknown
                },
                Some("tool_provider_failed".to_owned()),
                None,
            ),
            Err(_) => (
                ToolOutcome::Unknown,
                Some("tool_deadline_exceeded".to_owned()),
                None,
            ),
        };
        self.finish_tool(
            owner,
            &proposal,
            &reservation,
            outcome,
            failure,
            output,
            None,
        )
        .await
    }

    /// Explicit abandonment, not provider reconciliation. The authenticated caller
    /// acknowledges that an admitted external action may still happen. Never retry.
    /// No HTTP/worker entrypoint exposes this operation yet.
    pub async fn abandon_tool_attempt(
        &self,
        owner: &str,
        instance: &str,
        proposal_ref: &str,
        expected_revision: u32,
    ) -> Result<ToolReceipt> {
        let mut tx = self.store.begin(owner).await?;
        self.load_instance(owner, instance, &mut tx).await?;
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_tool_proposal",
                Some(proposal_ref),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("tool_proposal_missing")?;
        let proposal: ToolProposal = records::decode(&value)?;
        if proposal.instance_id != instance {
            return Err("tool_proposal_mismatch");
        }
        let rid = records::id(
            "runbook_tool_reservation",
            owner,
            instance,
            &proposal.step_id,
        );
        let value = self
            .store
            .read_kind(owner, "runbook_tool_reservation", Some(&rid), None, &mut tx)
            .await?
            .pop()
            .ok_or("tool_reservation_missing")?;
        let reservation: Reservation = records::decode(&value)?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        self.finish_tool(
            owner,
            &proposal,
            &reservation,
            ToolOutcome::Unknown,
            Some("tool_attempt_abandoned".into()),
            None,
            Some(expected_revision),
        )
        .await
    }

    async fn finish_tool(
        &self,
        owner: &str,
        proposal: &ToolProposal,
        reservation: &Reservation,
        outcome: ToolOutcome,
        failure: Option<String>,
        output: Option<serde_json::Value>,
        abandon_revision: Option<u32>,
    ) -> Result<ToolReceipt> {
        let instance = proposal.instance_id.as_str();
        let proposal_ref = proposal.proposal_ref.as_str();
        let step = &proposal.step_id;
        let reservation_id = records::id("runbook_tool_reservation", owner, instance, step);
        let result_id = records::id("runbook_tool_result", owner, instance, step);
        let decision_id = records::id("runbook_tool_decision", owner, instance, step);
        if reservation.instance_id != instance
            || reservation.step_id != *step
            || reservation.proposal_ref != proposal_ref
            || reservation.request_hash != proposal.request_hash
            || reservation.decision_ref != decision_id
        {
            return Err("tool_reservation_mismatch");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, instance, &mut tx).await?;
        // Owner transaction serialization makes result persistence first-writer-wins.
        // A late provider response cannot overwrite an explicit unknown receipt.
        if let Some(value) = self
            .store
            .read_kind(
                owner,
                "runbook_tool_result",
                Some(&result_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
        {
            let receipt: ToolReceipt = records::decode(&value)?;
            if receipt.proposal_ref != proposal_ref || receipt.request_hash != proposal.request_hash
            {
                return Err("tool_replay_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(receipt);
        }
        if let Some(revision) = abandon_revision {
            if current.instance.revision != revision {
                return Err("stale_revision");
            }
        }
        let saved = self
            .store
            .read_kind(
                owner,
                "runbook_tool_reservation",
                Some(&reservation_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("tool_reservation_missing")?;
        if saved["content"] != json!(reservation) {
            return Err("tool_reservation_mismatch");
        }
        let matches = current.instance.revision == reservation.expected_revision
            && current.instance.status == InstanceState::Running
            && current.instance.current_step_id.as_deref() == Some(step);
        let permitted = if matches {
            self.prepare_current_tool(owner, &current.instance, &proposal.request, &mut tx)
                .await
                .is_ok_and(|p| p.request_hash() == proposal.request_hash)
        } else {
            false
        };
        let applied = matches && permitted && outcome == ToolOutcome::Completed;
        let now = Utc::now();
        let mut trace = StepTrace {
            trace_id: digest(&json!(["runbook_step.v1", owner, instance, step])),
            instance_id: instance.into(),
            step_id: step.clone(),
            step_kind: StepKind::Tool,
            status: if applied {
                TraceStatus::Completed
            } else if !matches || !permitted {
                TraceStatus::Denied
            } else {
                TraceStatus::Failed
            },
            input_refs: vec![
                format!("private_message:{proposal_ref}"),
                format!("private_message:{reservation_id}"),
            ],
            output_refs: vec![format!("private_message:{result_id}")],
            input_hash: proposal.request_hash.clone(),
            output_hash: Some(digest(&json!([outcome, failure, output]))),
            tool_id: Some(format!(
                "{}.{}",
                proposal.request.tool_slug, proposal.request.capability
            )),
            model: None,
            prompt_version: None,
            input_tokens: 0,
            output_tokens: 0,
            cost_microunits: 0,
            approval_ref: Some(decision_id),
            provenance_ref: None,
            started_at: reservation.started_at,
            completed_at: Some(now),
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
        if matches {
            let mut next = current.instance.clone();
            next.revision = next.revision.checked_add(1).ok_or("revision_overflow")?;
            next.latest_trace_ref = Some(trace.trace_id.clone());
            if applied {
                let definition = self.definition(owner, &current.instance, &mut tx).await?;
                next.completed_step_ids.push(step.clone());
                next.current_step_id = Some(
                    definition
                        .steps
                        .get(next.completed_step_ids.len())
                        .ok_or("missing_completion_step")?
                        .step_id
                        .clone(),
                );
            } else {
                next.status = InstanceState::Failed;
            }
            self.append_instance(owner, Some(&current.message_id), next, &mut tx)
                .await?;
        }
        let receipt = ToolReceipt {
            instance_id: instance.into(),
            step_id: step.clone(),
            proposal_ref: proposal_ref.into(),
            request_hash: proposal.request_hash.clone(),
            outcome,
            failure,
            output,
            trace,
            applied,
        };
        self.store
            .append(
                owner,
                records::envelope(
                    owner,
                    "runbook_tool_result",
                    instance,
                    step,
                    &reservation_id,
                    json!(receipt),
                ),
                &mut tx,
            )
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }
}
