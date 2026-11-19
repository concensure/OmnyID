//! Private, non-actionable review emission through the existing AFP suggestion contract.
use crate::{
    message::AfpProactiveSuggestionContent,
    runbook_afp::RuntimeRecord,
    runbook_contract::*,
    runbook_runtime::{LocalStepResult, RunbookRuntime},
    runbook_store::digest,
    runbook_transform::TransformReview,
    runbook_validation::identifier,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EmissionReceipt {
    pub instance_id: String,
    pub step_id: String,
    pub request_hash: String,
    pub transform_ref: String,
    #[serde(default)]
    pub answer_ref: Option<String>,
    #[serde(default)]
    pub approval_ref: Option<String>,
    pub suggestion_ref: String,
    pub trace: StepTrace,
}

fn suggestion(
    owner: &str,
    instance: &RunbookInstance,
    step: &Step,
    review: &TransformReview,
    transform_ref: &str,
) -> Result<Value> {
    use TransformOperation::*;
    let c = &review.conclusions;
    let (title, lines) = match review.operation {
        CalculateBudgetExposure => (
            "Review budget exposure",
            vec![
                format!(
                    "Committed: {} minor units {}. Budget: {} minor units.",
                    c["committed_minor"],
                    c["currency"].as_str().unwrap_or(""),
                    c["total_budget_minor"]
                ),
                if c["over_budget"] == true {
                    "Recorded commitments exceed the supplied budget.".into()
                } else {
                    "Recorded commitments are within the supplied budget.".into()
                },
                "No spending has been authorised.".into(),
            ],
        ),
        ReviewStoredQuote => (
            "Review stored vendor quote",
            vec![
                format!(
                    "Recorded quote lifecycle: {}.",
                    c["lifecycle"].as_str().unwrap_or("")
                ),
                format!(
                    "Line items: {}. Facts needing evidence review: {}.",
                    c["line_count"], c["unconfirmed_fact_count"]
                ),
                "Review the saved quote and its source evidence before deciding.".into(),
                "Availability, booking and payment have not been authorised.".into(),
            ],
        ),
        ReviewTaskDependencies => (
            "Review task dependencies",
            vec![
                format!(
                    "Task: {}. Owner: {}.",
                    review.facts["task_ref"].as_str().unwrap_or(""),
                    review.facts["task_owner"].as_str().unwrap_or("")
                ),
                format!(
                    "Incomplete dependencies: {}.",
                    c["incomplete_dependency_refs"]
                        .as_array()
                        .map_or(0, Vec::len)
                ),
                "No additional task has been created.".into(),
            ],
        ),
        ReviewImportStatus => (
            "Review imported file",
            vec![
                if c["ready_for_review"] == true {
                    "The recorded parser and quarantine checks allow review.".into()
                } else {
                    "The recorded parser or quarantine checks still need attention.".into()
                },
                "The file has not been released.".into(),
            ],
        ),
        IdentifyMissingFacts => (
            "Review missing information",
            vec![format!(
                "Information supplied for: {}.",
                review.facts["required_field"].as_str().unwrap_or("")
            )],
        ),
        // Draft/approval-dependent starters must use their dedicated future adapters.
        _ => return Err("review_emission_not_implemented"),
    };
    let source_refs = vec![format!("private_message:{transform_ref}")];
    let content = AfpProactiveSuggestionContent {
        heuristic_id: crate::runbook_outcome::outcome_key(&instance.runbook_id, &step.step_id)?,
        confidence: 1.0,
        urgency: "low".into(),
        action_label: "Review findings".into(),
        description: "Review these sourced findings before deciding what to do.".into(),
        title: Some(title.into()),
        destination_view: Some("decision_queue".into()),
        artifact_summary_lines: lines,
        source_count: Some(source_refs.len() as u32),
        source_refs,
        source_event_id: Some(instance.trigger_event_id.clone()),
        provenance_cue: Some(
            "Based on saved runbook evidence; no external action was taken.".into(),
        ),
        ..Default::default()
    };
    let id = digest(&json!([
        "runbook_review.v1",
        owner,
        instance.instance_id,
        step.step_id
    ]));
    Ok(
        json!({"protocol":"afp-v1","id":id,"thread_id":instance.thread_id,
        "parent_id":transform_ref,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
        "type":"proactive_suggestion","subtype":"runbook_review:v1","content":content,
        "metadata":{"private":true,"store":true,"instance_id":instance.instance_id,"step_id":step.step_id},
        "references":[],"supertags":["runbook_review"],"store_in_relational":true}),
    )
}

impl RunbookRuntime<'_, '_> {
    pub async fn emit_review(
        &self,
        owner: &str,
        id: &str,
        step_id: &str,
        expected_revision: u32,
    ) -> Result<EmissionReceipt> {
        if !identifier(step_id) {
            return Err("invalid_step_id");
        }
        let mut tx = self.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let receipt_id = digest(&json!(["runbook_emission.v1", owner, id, step_id]));
        let request_hash = digest(&json!([
            "runbook_emit_request.v1",
            owner,
            id,
            step_id,
            expected_revision,
            current.instance.definition_ref
        ]));
        if let Some(value) = self
            .store
            .read_kind(owner, "runbook_emission", Some(&receipt_id), None, &mut tx)
            .await?
            .pop()
        {
            let receipt = validate_receipt(owner, &value)?;
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
        let index = current.instance.completed_step_ids.len();
        let step = definition.steps.get(index).ok_or("step_not_found")?;
        if step.step_id != step_id
            || step.kind != StepKind::Emit
            || step.output_kind.as_deref() != Some("proactive_suggestion")
            || step.follow_up_event.is_some()
            || !step.required_fields.is_empty()
        {
            return Err("unsupported_review_emission");
        }
        let prior = index
            .checked_sub(1)
            .and_then(|i| definition.steps.get(i))
            .ok_or("transform_required")?;
        if prior.kind == StepKind::Approval {
            let receipt = self
                .emit_approved_in(owner, &current, &definition, index, request_hash, &mut tx)
                .await?;
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(receipt);
        }
        if prior.kind != StepKind::Transform
            || step.input_refs != vec![format!("steps.{}.output_refs", prior.step_id)]
        {
            return Err("unsupported_review_selector");
        }
        let transform_ref = digest(&json!(["runbook_transform.v1", owner, id, prior.step_id]));
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_transform",
                Some(&transform_ref),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("transform_required")?;
        let transform = crate::runbook_transform_runtime::validate(owner, &value)?;
        if transform.instance_id != id
            || transform.step_id != prior.step_id
            || prior.operation != Some(transform.result.operation)
        {
            return Err("transform_instance_mismatch");
        }
        let mut answer_ref = None;
        let mut answer_hash = None;
        if transform.result.operation == TransformOperation::IdentifyMissingFacts {
            let question_id = digest(&json!(["runbook_question.v1", owner, id, step_id]));
            let field = transform.result.conclusions["missing_field"]
                .as_str()
                .ok_or("invalid_required_field")?;
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
                let answer: crate::runbook_input::InputSupplied =
                    serde_json::from_value(value["content"].clone())
                        .map_err(|_| "invalid_input_event")?;
                if answer.instance_id == id
                    && answer.escalation_id == question_id
                    && answer.answers.contains_key(field)
                {
                    if answer_ref.is_some() {
                        return Err("conflicting_evidence");
                    }
                    answer_ref = Some(answer.event_id);
                    answer_hash = Some(digest(&value["content"]));
                }
            }
            if answer_ref.is_none() {
                return Err("missing_required_answer");
            }
        }
        let mut input_refs = vec![format!("private_message:{transform_ref}")];
        input_refs.extend(answer_ref.iter().map(|s| format!("private_message:{s}")));
        let message = suggestion(
            owner,
            &current.instance,
            step,
            &transform.result,
            &transform_ref,
        )?;
        let suggestion_ref = message["id"].as_str().ok_or("invalid_review")?.to_owned();
        self.store.append(owner, message.clone(), &mut tx).await?;
        let trace = self
            .record_local_step_in(
                owner,
                id,
                expected_revision,
                &LocalStepResult {
                    step_id: step_id.into(),
                    input_hash: if answer_hash.is_some() {
                        digest(&json!([
                            request_hash,
                            transform.trace.output_hash,
                            answer_hash
                        ]))
                    } else {
                        digest(&json!([request_hash, transform.trace.output_hash]))
                    },
                    input_refs,
                    output_hash: digest(&message["content"]),
                    output_refs: vec![format!("private_message:{suggestion_ref}")],
                },
                None,
                true,
                &mut tx,
            )
            .await?;
        let receipt = EmissionReceipt {
            instance_id: id.into(),
            step_id: step_id.into(),
            request_hash,
            transform_ref,
            answer_ref,
            approval_ref: None,
            suggestion_ref,
            trace,
        };
        self.store.append(owner,json!({"protocol":"afp-v1","id":receipt_id,"thread_id":current.instance.thread_id,
            "parent_id":current.message_id,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
            "type":"runbook_emission","subtype":"v1","content":receipt,
            "metadata":{"private":true,"store":true,"instance_id":id,"step_id":step_id},
            "references":[],"supertags":["runbook_emission"],"store_in_relational":true}),&mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }
}

fn envelope(
    owner: &str,
    value: &Value,
    kind: &str,
    subtype: &str,
    tag: &str,
    instance: &str,
    step: &str,
    id: &str,
) -> Result<()> {
    if !identifier(instance)
        || !identifier(step)
        || value["protocol"] != "afp-v1"
        || value["id"] != id
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["thread_id"] != format!("runbook:{instance}")
        || !value["parent_id"].as_str().is_some_and(identifier)
        || value["type"] != kind
        || value["subtype"] != subtype
        || value["supertags"] != json!([tag])
        || value["metadata"]
            != json!({"private":true,"store":true,"instance_id":instance,"step_id":step})
        || value["references"] != json!([])
        || value["store_in_relational"] != true
        || value["content"].to_string().len() > 32768
        || chrono::DateTime::parse_from_rfc3339(value["timestamp"].as_str().unwrap_or("")).is_err()
    {
        return Err("invalid_review_envelope");
    }
    Ok(())
}

pub(crate) fn validate_suggestion(owner: &str, value: &Value) -> Result<()> {
    let instance = value["metadata"]["instance_id"]
        .as_str()
        .ok_or("invalid_review")?;
    let step = value["metadata"]["step_id"]
        .as_str()
        .ok_or("invalid_review")?;
    let id = digest(&json!(["runbook_review.v1", owner, instance, step]));
    envelope(
        owner,
        value,
        "proactive_suggestion",
        "runbook_review:v1",
        "runbook_review",
        instance,
        step,
        &id,
    )?;
    let content: AfpProactiveSuggestionContent =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_review")?;
    if json!(content) != value["content"]
        || content.action_afp_payload.is_some()
        || content.requires_approval
        || content.autonomy_decision.is_some()
        || content.source_refs
            != vec![format!(
                "private_message:{}",
                value["parent_id"].as_str().unwrap_or("")
            )]
        || content.source_count != Some(1)
        || content.artifact_summary_lines.len() > 8
        || content.destination_view.as_deref() != Some("decision_queue")
    {
        return Err("invalid_review");
    }
    Ok(())
}

pub(crate) fn validate_receipt(owner: &str, value: &Value) -> Result<EmissionReceipt> {
    let r: EmissionReceipt =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_emission")?;
    let id = digest(&json!([
        "runbook_emission.v1",
        owner,
        r.instance_id,
        r.step_id
    ]));
    envelope(
        owner,
        value,
        "runbook_emission",
        "v1",
        "runbook_emission",
        &r.instance_id,
        &r.step_id,
        &id,
    )?;
    if !identifier(&r.transform_ref)
        || r.suggestion_ref
            != digest(&json!([
                "runbook_review.v1",
                owner,
                r.instance_id,
                r.step_id
            ]))
        || r.request_hash.len() != 64
        || !r.request_hash.bytes().all(|b| b.is_ascii_hexdigit())
        || r.trace.instance_id != r.instance_id
        || r.trace.step_id != r.step_id
        || r.trace.step_kind != StepKind::Emit
        || r.trace.status != TraceStatus::Completed
        || r.trace.output_refs != vec![format!("private_message:{}", r.suggestion_ref)]
        || r.answer_ref.as_deref().is_some_and(|s| !identifier(s))
        || r.approval_ref.as_deref().is_some_and(|s| !identifier(s))
        || r.approval_ref != r.trace.approval_ref
        || (r.approval_ref.is_some() && r.answer_ref.is_some())
        || r.trace.input_refs
            != std::iter::once(format!("private_message:{}", r.transform_ref))
                .chain(r.answer_ref.iter().map(|s| format!("private_message:{s}")))
                .chain(
                    r.approval_ref
                        .iter()
                        .map(|s| format!("private_message:{s}")),
                )
                .collect::<Vec<_>>()
    {
        return Err("invalid_emission");
    }
    RuntimeRecord::Trace(r.trace.clone()).validate()?;
    Ok(r)
}
