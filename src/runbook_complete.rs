//! Completion derives its context exclusively from committed owner-bound traces.
//! Unknown or unavailable outputs fail criteria; callers cannot assert success.
use crate::{
    runbook_afp::{RuntimeRecord, build_runtime_afp, parse_runtime_afp},
    runbook_contract::*,
    runbook_matcher::filter_matches,
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
};
use chrono::Utc;
use serde_json::{Map, json};

impl RunbookRuntime<'_, '_> {
    pub async fn complete(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
    ) -> Result<StepTrace> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let step = definition
            .steps
            .last()
            .filter(|s| s.kind == StepKind::Complete)
            .ok_or("missing_completion_step")?;
        let trace_id = digest(&json!(["runbook_step.v1", owner, id, step.step_id]));
        let input_hash = digest(&json!([
            "runbook_complete.v1",
            owner,
            id,
            current.instance.definition_ref,
            expected_revision
        ]));
        if let Some(prior) = self
            .store
            .read_kind(owner, "runbook_step_trace", Some(&trace_id), None, &mut tx)
            .await?
            .pop()
        {
            let RuntimeRecord::Trace(t) = parse_runtime_afp(owner, &prior)? else {
                return Err("invalid_trace");
            };
            if t.input_hash != input_hash {
                return Err("step_replay_conflict");
            }
            return Ok(t);
        }
        if current.instance.status != InstanceState::Running
            || current.instance.current_step_id.as_deref() != Some(&step.step_id)
        {
            return Err("step_not_current");
        }
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        let mut facts = std::collections::HashSet::new();
        if let Some(packet_id) = &current.instance.evidence_packet_ref {
            let value = self
                .store
                .read_kind(owner, "runbook_evidence", Some(packet_id), None, &mut tx)
                .await?
                .pop()
                .ok_or("evidence_required")?;
            let packet = crate::runbook_read::parse_receipt(owner, &value)?;
            if packet.instance_id != id {
                return Err("evidence_instance_mismatch");
            }
            for item in packet.packet.included {
                if let Some(object) = item.content.as_object() {
                    facts.extend(
                        object
                            .iter()
                            .filter(|(_, v)| !v.is_null())
                            .map(|(k, _)| k.clone()),
                    );
                }
            }
        }
        let question_id = digest(&json!(["runbook_question.v1", owner, id, step.step_id]));
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
            let input: crate::runbook_input::InputSupplied =
                serde_json::from_value(value["content"].clone())
                    .map_err(|_| "invalid_input_event")?;
            if input.instance_id == id && input.escalation_id == question_id {
                facts.extend(input.answers.keys().cloned());
            }
        }
        if step.required_fields.iter().any(|f| !facts.contains(f)) {
            return Err("completion_facts_missing");
        }
        let required: Vec<_> = definition
            .steps
            .iter()
            .take(definition.steps.len() - 1)
            .map(|s| s.step_id.clone())
            .collect();
        if current.instance.completed_step_ids != required {
            return Err("step_dependency_incomplete");
        }
        let mut outputs = Map::new();
        let mut refs = vec![current.instance.definition_ref.clone()];
        for prior_step in definition.steps.iter().take(definition.steps.len() - 1) {
            let prior_id = digest(&json!(["runbook_step.v1", owner, id, prior_step.step_id]));
            let value = self
                .store
                .read_kind(owner, "runbook_step_trace", Some(&prior_id), None, &mut tx)
                .await?
                .pop()
                .ok_or("step_trace_missing")?;
            let RuntimeRecord::Trace(t) = parse_runtime_afp(owner, &value)? else {
                return Err("invalid_trace");
            };
            if t.instance_id != id
                || t.step_id != prior_step.step_id
                || t.step_kind != prior_step.kind
                || t.status != TraceStatus::Completed
            {
                return Err("invalid_dependency_trace");
            }
            outputs.insert(
                prior_step.step_id.clone(),
                json!({"status":t.status,"output_hash":t.output_hash,"output_refs":t.output_refs}),
            );
            if matches!(
                prior_step.kind,
                StepKind::Classify | StepKind::Reason | StepKind::Draft
            ) {
                let receipt_id = digest(&json!([
                    "runbook_model_result",
                    owner,
                    id,
                    prior_step.step_id
                ]));
                let value = self
                    .store
                    .read_kind(
                        owner,
                        "runbook_model_result",
                        Some(&receipt_id),
                        None,
                        &mut tx,
                    )
                    .await?
                    .pop()
                    .ok_or("model_receipt_required")?;
                let receipt = crate::runbook_model_runtime::parse_receipt(owner, &value)?;
                if !receipt.applied || receipt.trace != t {
                    return Err("model_trace_mismatch");
                }
            }
            if prior_step.kind == StepKind::Tool {
                let receipt_id = crate::runbook_tool_records::id(
                    "runbook_tool_result",
                    owner,
                    id,
                    &prior_step.step_id,
                );
                let value = self
                    .store
                    .read_kind(
                        owner,
                        "runbook_tool_result",
                        Some(&receipt_id),
                        None,
                        &mut tx,
                    )
                    .await?
                    .pop()
                    .ok_or("tool_receipt_required")?;
                let receipt: crate::runbook_tool_records::ToolReceipt =
                    crate::runbook_tool_records::decode(&value)?;
                if !receipt.applied
                    || receipt.outcome != crate::runbook_tool_records::ToolOutcome::Completed
                    || receipt.trace != t
                {
                    return Err("tool_trace_mismatch");
                }
            }
            if prior_step.kind == StepKind::Approval {
                let action = t.approval_ref.as_ref().ok_or("approval_required")?;
                let value = self
                    .store
                    .read_kind(owner, "action", Some(action), None, &mut tx)
                    .await?
                    .pop()
                    .ok_or("approval_required")?;
                crate::runbook_review_decision::validate(owner, &value)?;
                if value["content"]["decision"] != "approved"
                    || t.output_hash != Some(digest(&value["content"]))
                {
                    return Err("approval_trace_mismatch");
                }
                let target = value["parent_id"].as_str().ok_or("approval_required")?;
                let rid = crate::runbook_review_decision::receipt_id(owner, target);
                let r = self
                    .store
                    .read_kind(owner, "runbook_review_decision", Some(&rid), None, &mut tx)
                    .await?
                    .pop()
                    .ok_or("approval_required")?;
                if crate::runbook_review_decision::parse(owner, &r)?.trace != t {
                    return Err("approval_trace_mismatch");
                }
            }
            if prior_step.kind == StepKind::Emit {
                let receipt_id = digest(&json!([
                    "runbook_emission.v1",
                    owner,
                    id,
                    prior_step.step_id
                ]));
                let value = self
                    .store
                    .read_kind(owner, "runbook_emission", Some(&receipt_id), None, &mut tx)
                    .await?
                    .pop()
                    .ok_or("emission_required")?;
                let receipt = crate::runbook_emit::validate_receipt(owner, &value)?;
                if receipt.trace != t {
                    return Err("emission_trace_mismatch");
                }
                let suggestion = self
                    .store
                    .read_kind(
                        owner,
                        "proactive_suggestion",
                        Some(&receipt.suggestion_ref),
                        None,
                        &mut tx,
                    )
                    .await?
                    .pop()
                    .ok_or("review_required")?;
                crate::runbook_emit::validate_suggestion(owner, &suggestion)?;
                if t.output_hash.as_deref() != Some(digest(&suggestion["content"]).as_str()) {
                    return Err("review_hash_mismatch");
                }
                if outputs
                    .insert(
                        "review_ref".into(),
                        json!(format!("private_message:{}", receipt.suggestion_ref)),
                    )
                    .is_some()
                {
                    return Err("ambiguous_review_output");
                }
            }
            refs.push(prior_id);
        }
        let context = json!({"instance":{"outputs":outputs}});
        let passed = definition
            .success_criteria
            .iter()
            .all(|f| filter_matches(f, &context));
        let now = Utc::now();
        let mut trace = StepTrace {
            trace_id: trace_id.clone(),
            instance_id: id.into(),
            step_id: step.step_id.clone(),
            step_kind: StepKind::Complete,
            status: if passed {
                TraceStatus::Completed
            } else {
                TraceStatus::Failed
            },
            input_refs: refs,
            output_refs: vec![],
            input_hash,
            output_hash: Some(digest(&context)),
            tool_id: None,
            model: None,
            prompt_version: None,
            input_tokens: 0,
            output_tokens: 0,
            cost_microunits: 0,
            approval_ref: None,
            provenance_ref: None,
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
            expected_revision,
            if passed {
                InstanceState::Completed
            } else {
                InstanceState::Failed
            },
        )?;
        next.latest_trace_ref = Some(trace_id);
        next.current_step_id = None;
        if passed {
            next.completed_step_ids.push(step.step_id.clone());
        }
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(trace)
    }
}
