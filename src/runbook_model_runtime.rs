//! Two-phase private model execution. Reserve before calling; uncertain calls
//! remain reserved and are never automatically repeated after a process crash.
use crate::{
    runbook_afp::{RuntimeRecord, build_runtime_afp},
    runbook_contract::*,
    runbook_llm_step::{self as model, ModelEvaluation, ModelPolicy, ModelProvider, ModelRequest},
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
    runbook_validation::identifier,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Reservation {
    pub(crate) instance_id: String,
    pub(crate) step_id: String,
    expected_revision: u32,
    #[serde(default)]
    pub(crate) budget: Option<crate::runbook_budget::BudgetReservation>,
    pub(crate) request_hash: String,
    input_hash: String,
    transform_ref: String,
    request: ModelRequest,
    policy: ModelPolicy,
    step: Step,
    pub(crate) started_at: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ModelReceipt {
    pub reservation_ref: String,
    pub request_hash: String,
    pub evaluation: ModelEvaluation,
    pub draft_afp: Option<Value>,
    pub trace: StepTrace,
    pub applied: bool,
}

impl std::fmt::Debug for ModelReceipt {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ModelReceipt")
            .field("trace", &self.trace)
            .field("applied", &self.applied)
            .field("evaluation", &self.evaluation)
            .field("draft", &"[REDACTED]")
            .finish()
    }
}

fn record_id(kind: &str, owner: &str, instance: &str, step: &str) -> String {
    digest(&json!([kind, owner, instance, step]))
}
fn envelope(
    owner: &str,
    kind: &str,
    instance: &str,
    step: &str,
    parent: &str,
    content: Value,
) -> Value {
    json!({"protocol":"afp-v1","id":record_id(kind,owner,instance,step),"thread_id":format!("runbook:{instance}"),
        "parent_id":parent,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
        "type":kind,"subtype":"v1","content":content,"metadata":{"private":true,"store":true,"instance_id":instance,"step_id":step},
        "references":[],"supertags":[kind],"store_in_relational":true})
}

fn private_draft(
    owner: &str,
    instance: &str,
    step: &str,
    started_at: DateTime<Utc>,
    evaluation: &ModelEvaluation,
) -> Option<Value> {
    let output = evaluation.output.as_ref()?;
    if output["type"] != "draft" {
        return None;
    }
    Some(
        json!({"protocol":"afp-v1","id":record_id("runbook_model_draft",owner,instance,step),
        "thread_id":format!("runbook:{instance}"),"parent_id":record_id("runbook_model_reservation",owner,instance,step),
        "from":owner,"to":[owner],"timestamp":started_at.to_rfc3339(),"type":"draft","subtype":"runbook_sourced_draft_v1",
        "content":output["content"],"metadata":{"private":true,"store":true,"approval_state":"not_requested"},
        "references":[],"supertags":["runbook_draft"],"store_in_relational":true,"signature":""}),
    )
}

impl RunbookRuntime<'_, '_> {
    /// Internal injection seam only. There is deliberately no HTTP/event-hook
    /// entry point and no live provider until owner inference/budget integration.
    pub async fn execute_model(
        &self,
        owner: &str,
        id: &str,
        step_id: &str,
        expected_revision: u32,
        policy: &ModelPolicy,
        provider: &dyn ModelProvider,
    ) -> Result<ModelReceipt> {
        if !identifier(step_id) {
            return Err("invalid_step_id");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let receipt_id = record_id("runbook_model_result", owner, id, step_id);
        let reservation_id = record_id("runbook_model_reservation", owner, id, step_id);
        let request_hash = digest(&json!([
            owner,
            id,
            step_id,
            expected_revision,
            policy,
            current.instance.definition_ref
        ]));
        if let Some(value) = self
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
        {
            let receipt = parse_receipt(owner, &value)?;
            if receipt.request_hash != request_hash {
                return Err("step_replay_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(receipt);
        }
        if let Some(value) = self
            .store
            .read_kind(
                owner,
                "runbook_model_reservation",
                Some(&reservation_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
        {
            if value["content"]["request_hash"] != request_hash {
                return Err("step_replay_conflict");
            }
            return Err("model_call_pending_reconciliation");
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
        model::schema_for(step.kind)?;
        if step.kind == StepKind::Draft && definition.max_autonomy == MaxAutonomy::ObserveOnly {
            return Err("model_policy_denied");
        }
        // Only a prior, verified deterministic transform may feed the model.
        // Raw Read bodies and caller-provided facts/URLs are never accepted.
        let prior = index
            .checked_sub(1)
            .and_then(|i| definition.steps.get(i))
            .ok_or("model_input_required")?;
        if prior.kind != StepKind::Transform
            || step.input_refs != vec![format!("steps.{}.output_refs", prior.step_id)]
            || !current.instance.completed_step_ids.contains(&prior.step_id)
            || !step.required_fields.is_empty()
        {
            return Err("unsupported_model_selector");
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
            .ok_or("model_input_required")?;
        let transform = crate::runbook_transform_runtime::validate(owner, &value)?;
        if transform.instance_id != id || transform.step_id != prior.step_id {
            return Err("model_input_mismatch");
        }
        let request = model::prepare(
            owner,
            step,
            json!(transform.result),
            vec![format!("private_message:{transform_ref}")],
            policy,
        )?;
        let amount = crate::runbook_budget::reservation_amount(step, policy)?;
        let snapshot = self
            .model_budget_in(owner, &current.instance, Utc::now(), &mut tx)
            .await?;
        if let Err(reason) = snapshot.check(amount) {
            // Persist a resumable pause without creating a provider reservation.
            let next = current
                .instance
                .transition(expected_revision, InstanceState::WaitingForBudget)?;
            self.append_instance(owner, Some(&current.message_id), next, &mut tx)
                .await?;
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Err(reason);
        }
        let budget = crate::runbook_budget::BudgetReservation {
            policy_ref: snapshot.policy_ref.ok_or("budget_policy_missing")?,
            runbook_id: current.instance.runbook_id.clone(),
            reserved_microunits: amount,
        };
        let input_hash = digest(&json!([request_hash, request, transform.trace.output_hash]));
        let reservation = Reservation {
            budget: Some(budget),
            instance_id: id.into(),
            step_id: step_id.into(),
            expected_revision,
            request_hash: request_hash.clone(),
            input_hash,
            transform_ref,
            request,
            policy: policy.clone(),
            step: step.clone(),
            started_at: Utc::now(),
        };
        self.store
            .append(
                owner,
                envelope(
                    owner,
                    "runbook_model_reservation",
                    id,
                    step_id,
                    &current.message_id,
                    json!(reservation),
                ),
                &mut tx,
            )
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;

        let evaluation = model::evaluate(provider, reservation.request.clone(), policy, step).await;
        // Never hold the owner transaction across a provider call. Cancellation,
        // disable and deletion can proceed; their state wins at finalization.
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let reservation_value = self
            .store
            .read_kind(
                owner,
                "runbook_model_reservation",
                Some(&reservation_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("model_reservation_missing")?;
        if reservation_value["content"] != json!(reservation) {
            return Err("model_reservation_mismatch");
        }
        let current_matches = current.instance.revision == expected_revision
            && current.instance.status == InstanceState::Running
            && current.instance.current_step_id.as_deref() == Some(step_id);
        let enabled = self
            .require_enabled(owner, &current.instance, &mut tx)
            .await
            .is_ok();
        let applied = current_matches
            && enabled
            && evaluation.output.is_some()
            && evaluation.failure.is_none();
        let last = evaluation.attempts.last().ok_or("model_attempt_missing")?;
        let draft_afp = private_draft(owner, id, step_id, reservation.started_at, &evaluation);
        let mut trace = StepTrace {
            trace_id: digest(&json!(["runbook_step.v1", owner, id, step_id])),
            instance_id: id.into(),
            step_id: step_id.into(),
            step_kind: step.kind,
            status: if applied {
                TraceStatus::Completed
            } else if !current_matches || !enabled {
                TraceStatus::Denied
            } else {
                TraceStatus::Failed
            },
            input_refs: vec![
                format!("private_message:{}", reservation.transform_ref),
                format!("private_message:{reservation_id}"),
            ],
            output_refs: vec![format!("private_message:{receipt_id}")],
            input_hash: reservation.input_hash.clone(),
            output_hash: Some(digest(&json!([evaluation, draft_afp]))),
            tool_id: None,
            model: Some(last.model.clone()),
            prompt_version: Some(model::PROMPT_VERSION.into()),
            input_tokens: evaluation
                .attempts
                .iter()
                .map(|a| a.input_tokens)
                .fold(0u32, u32::saturating_add),
            output_tokens: evaluation
                .attempts
                .iter()
                .map(|a| a.output_tokens)
                .fold(0u32, u32::saturating_add),
            cost_microunits: evaluation
                .attempts
                .iter()
                .map(|a| a.cost_microunits)
                .fold(0u64, u64::saturating_add),
            approval_ref: None,
            provenance_ref: None,
            started_at: reservation.started_at,
            completed_at: Some(Utc::now()),
        };
        self.attach_provenance(owner, &current.instance, &mut trace, None, &mut tx)
            .await?;
        let mut message = build_runtime_afp(
            owner,
            Some(&current.message_id),
            &RuntimeRecord::Trace(trace.clone()),
            Utc::now(),
        )?;
        message["id"] = json!(trace.trace_id);
        self.store.append(owner, message, &mut tx).await?;
        if current_matches {
            let mut next = current.instance.clone();
            next.revision = next.revision.checked_add(1).ok_or("revision_overflow")?;
            next.latest_trace_ref = Some(trace.trace_id.clone());
            if applied {
                next.completed_step_ids.push(step_id.into());
                next.current_step_id = Some(
                    definition
                        .steps
                        .get(index + 1)
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
        let receipt = ModelReceipt {
            reservation_ref: reservation_id,
            request_hash,
            evaluation,
            draft_afp,
            trace,
            applied,
        };
        self.store
            .append(
                owner,
                envelope(
                    owner,
                    "runbook_model_result",
                    id,
                    step_id,
                    &current.message_id,
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
    let kind = value["type"].as_str().ok_or("invalid_model_record")?;
    let instance = value["metadata"]["instance_id"]
        .as_str()
        .ok_or("invalid_model_record")?;
    let step = value["metadata"]["step_id"]
        .as_str()
        .ok_or("invalid_model_record")?;
    if !matches!(kind, "runbook_model_reservation" | "runbook_model_result")
        || !identifier(instance)
        || !identifier(step)
        || value["protocol"] != "afp-v1"
        || value["id"] != record_id(kind, owner, instance, step)
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["thread_id"] != format!("runbook:{instance}")
        || !value["parent_id"].as_str().is_some_and(identifier)
        || value["subtype"] != "v1"
        || value["metadata"]
            != json!({"private":true,"store":true,"instance_id":instance,"step_id":step})
        || value["references"] != json!([])
        || value["supertags"] != json!([kind])
        || value["store_in_relational"] != true
        || value["content"].to_string().len() > 65536
        || DateTime::parse_from_rfc3339(value["timestamp"].as_str().unwrap_or("")).is_err()
    {
        return Err("invalid_model_record");
    }
    let hash = |s: &str| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit());
    if kind == "runbook_model_reservation" {
        let r: Reservation = serde_json::from_value(value["content"].clone())
            .map_err(|_| "invalid_model_reservation")?;
        if r.budget.as_ref().is_some_and(|b| {
            !identifier(&b.runbook_id)
                || !hash(&b.policy_ref)
                || crate::runbook_budget::reservation_amount(&r.step, &r.policy).ok()
                    != Some(b.reserved_microunits)
        }) {
            return Err("invalid_budget_reservation");
        }
        if r.instance_id != instance
            || r.step_id != step
            || r.step.step_id != step
            || r.expected_revision == 0
            || !hash(&r.request_hash)
            || !hash(&r.input_hash)
            || !hash(&r.transform_ref)
            || r.request
                != model::prepare(
                    owner,
                    &r.step,
                    r.request.input.clone(),
                    vec![format!("private_message:{}", r.transform_ref)],
                    &r.policy,
                )?
        {
            return Err("invalid_model_reservation");
        }
    } else {
        let r: ModelReceipt = serde_json::from_value(value["content"].clone())
            .map_err(|_| "invalid_model_receipt")?;
        RuntimeRecord::Trace(r.trace.clone()).validate()?;
        if r.draft_afp != private_draft(owner, instance, step, r.trace.started_at, &r.evaluation) {
            return Err("invalid_model_draft");
        }
        if let Some(draft) = &r.draft_afp {
            serde_json::from_value::<crate::message::AFPMessage>(draft.clone())
                .map_err(|_| "invalid_model_draft")?;
        }

        let schema = model::schema_for(r.trace.step_kind)?;
        let attempts = &r.evaluation.attempts;
        if attempts.is_empty() || attempts.len() > 2 {
            return Err("invalid_model_receipt");
        }
        for (index, attempt) in attempts.iter().enumerate() {
            if attempt.model
                != if index == 0 {
                    model::BASE_MODEL
                } else {
                    model::ESCALATION_MODEL
                }
                || !hash(&attempt.input_hash)
                || attempt.output_hash.as_ref().is_some_and(|v| !hash(v))
                || attempt.reserved_cost_microunits == 0
                || attempt.reserved_cost_microunits > 1_000_000
                || (index == 1
                    && (attempt.effort != model::Effort::Medium
                        || attempts[0].failure != Some(model::ModelFailure::Acceptance)))
                || (attempt.usage_known != attempt.output_hash.is_some())
                || (!attempt.usage_known
                    && (attempt.input_tokens != 0
                        || attempt.output_tokens != 0
                        || attempt.cost_microunits != 0
                        || !matches!(
                            attempt.failure,
                            Some(model::ModelFailure::Provider | model::ModelFailure::Timeout)
                        )))
            {
                return Err("invalid_model_attempt");
            }
        }
        if r.trace.model.as_deref() != Some(attempts.last().unwrap().model.as_str())
            || r.trace.prompt_version.as_deref() != Some(model::PROMPT_VERSION)
            || r.trace.input_tokens
                != attempts
                    .iter()
                    .map(|a| a.input_tokens)
                    .fold(0u32, u32::saturating_add)
            || r.trace.output_tokens
                != attempts
                    .iter()
                    .map(|a| a.output_tokens)
                    .fold(0u32, u32::saturating_add)
            || r.trace.cost_microunits
                != attempts
                    .iter()
                    .map(|a| a.cost_microunits)
                    .fold(0u64, u64::saturating_add)
            || r.evaluation.failure != attempts.last().unwrap().failure
            || r.evaluation.output.is_some() != r.evaluation.failure.is_none()
            || r.trace.input_refs.len() != 2
            || r.trace.input_refs[1] != format!("private_message:{}", r.reservation_ref)
        {
            return Err("invalid_model_usage");
        }
        if let Some(value) = &r.evaluation.output {
            model::output(&value.to_string(), schema, &r.trace.input_refs[..1], 0)
                .map_err(|_| "invalid_model_output")?;
        }
        if r.trace.instance_id != instance
            || r.trace.step_id != step
            || !hash(&r.request_hash)
            || r.reservation_ref != record_id("runbook_model_reservation", owner, instance, step)
            || r.trace.trace_id != digest(&json!(["runbook_step.v1", owner, instance, step]))
            || r.trace.output_hash != Some(digest(&json!([r.evaluation, r.draft_afp])))
            || r.trace.output_refs
                != vec![format!(
                    "private_message:{}",
                    record_id(kind, owner, instance, step)
                )]
            || r.trace.approval_ref.is_some()
            || r.trace.provenance_ref.is_none()
            || r.evaluation.attempts.is_empty()
            || r.evaluation.attempts.len() > 2
            || r.applied != (r.trace.status == TraceStatus::Completed)
            || (r.applied && (r.evaluation.output.is_none() || r.evaluation.failure.is_some()))
        {
            return Err("invalid_model_receipt");
        }
    }
    Ok(())
}
pub(crate) fn parse_receipt(owner: &str, value: &Value) -> Result<ModelReceipt> {
    validate(owner, value)?;
    serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_model_receipt")
}
