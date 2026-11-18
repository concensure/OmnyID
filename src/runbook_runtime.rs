//! Durable planning and local-step receipts. No event hook, tool/model invocation,
//! approval authority or scheduler is enabled by this module.
use crate::runbook_afp::{RuntimeRecord, build_runtime_afp, parse_runtime_afp};
use crate::runbook_contract::*;
use crate::runbook_event::normalize_stored_event;
use crate::runbook_matcher::{MatchDecision, MatchDisposition, match_event};
use crate::runbook_registry::parse_definition_afp;
use crate::runbook_store::{RunbookStore, digest};
use crate::runbook_validation::identifier;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DispatchReceipt {
    pub event_id: String,
    pub event_hash: String,
    pub decisions: Vec<MatchDecision>,
    pub instance_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LocalStepResult {
    pub step_id: String,
    pub input_hash: String,
    pub input_refs: Vec<String>,
    pub output_hash: String,
    pub output_refs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct InstanceRecord {
    pub message_id: String,
    pub instance: RunbookInstance,
}

pub struct RunbookRuntime<'a, 'db> {
    pub(crate) store: &'a RunbookStore<'db>,
}

impl<'a, 'db> RunbookRuntime<'a, 'db> {
    pub fn new(store: &'a RunbookStore<'db>) -> Self {
        Self { store }
    }

    /// Resolve the ID from the existing owner-partitioned event ledger, never
    /// accept an event payload/owner assertion from a request. Freeze the first
    /// plan, including suppressions, so retries cannot promote other definitions.
    pub async fn dispatch(&self, owner: &str, event_id: &str) -> Result<DispatchReceipt> {
        if !identifier(event_id) {
            return Err("invalid_event_id");
        }
        let mut tx = self.store.begin(owner).await?;
        let source: Option<Value> = sqlx::query_scalar("SELECT payload FROM afp_messages WHERE owner_user_id=$1 AND id=$2 AND octet_length(payload::text)<=65536 FOR SHARE")
            .bind(owner).bind(event_id).fetch_optional(&mut *tx).await.map_err(|_| "storage_unavailable")?;
        let source = source.ok_or("event_not_found_or_too_large")?;
        if source["id"] != event_id {
            return Err("event_identity_mismatch");
        }
        let event = normalize_stored_event(owner, owner, &source)?;
        let event_hash = digest(&json!(event));
        let receipt_id = digest(&json!(["runbook_dispatch.v1", owner, event_id]));
        if let Some(prior) = self
            .store
            .read_kind(owner, "runbook_dispatch", Some(&receipt_id), None, &mut tx)
            .await?
            .pop()
        {
            let receipt: DispatchReceipt =
                serde_json::from_value(prior["content"].clone()).map_err(|_| "invalid_dispatch")?;
            if receipt.event_hash != event_hash {
                return Err("event_replay_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(receipt);
        }
        let registry = self.store.load(owner, &mut tx).await?;
        let decisions = match_event(owner, &registry, &event, &HashSet::new())?;
        let feedback = self.outcome_feedback_in(owner, &mut tx).await?;
        let decisions = crate::runbook_outcome::apply_feedback(decisions, &registry, &feedback)?;
        let mut instance_ids = vec![];
        for decision in &decisions {
            if decision.disposition != MatchDisposition::Matched {
                continue;
            }
            let definition = &registry
                .get(&decision.runbook_id)
                .ok_or("definition_not_found")?
                .definition;
            let id = decision.instance_key.clone();
            let instance = RunbookInstance {
                instance_id: id.clone(),
                runbook_id: definition.runbook_id.clone(),
                runbook_version: definition.version,
                trigger_event_id: event_id.into(),
                thread_id: format!("runbook:{id}"),
                instance_key: id.clone(),
                status: InstanceState::Matched,
                current_step_id: None,
                completed_step_ids: vec![],
                next_follow_up_at: None,
                wait_expires_at: None,
                definition_ref: decision.definition_ref.clone(),
                evidence_packet_ref: None,
                latest_trace_ref: None,
                retry_of_instance_id: None,
                revision: 1,
            };
            self.append_instance(owner, None, instance, &mut tx).await?;
            instance_ids.push(id);
        }
        let receipt = DispatchReceipt {
            event_id: event_id.into(),
            event_hash,
            decisions,
            instance_ids,
        };
        let message = audit(
            owner,
            &receipt_id,
            "runbook_dispatch",
            event_id,
            None,
            json!(receipt),
        );
        self.store.append(owner, message, &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }

    pub async fn instance(&self, owner: &str, id: &str) -> Result<InstanceRecord> {
        let mut tx = self.store.begin(owner).await?;
        let record = self.load_instance(owner, id, &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(record)
    }

    pub async fn start(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
    ) -> Result<InstanceRecord> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        // No generic "resume" here: approval and epistemic waits require their
        // dedicated future authority adapters, not an arbitrary state transition.
        if current.instance.status != InstanceState::Matched {
            return Err("instance_not_matched");
        }
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let mut next = current
            .instance
            .transition(expected_revision, InstanceState::Running)?;
        next.current_step_id = Some(definition.steps[0].step_id.clone());
        let result = self
            .append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(result)
    }

    /// Commit a trusted local executor's result and the next instance revision
    /// atomically. Tool/model/emit/approval results deliberately fail closed until
    /// their existing authority and persistence integrations are implemented.
    pub async fn record_local_step(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
        result: &LocalStepResult,
    ) -> Result<StepTrace> {
        let mut tx = self.store.begin(owner).await?;
        let trace = self
            .record_local_step_in(owner, id, expected_revision, result, None, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(trace)
    }

    pub(crate) async fn record_local_step_in(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
        result: &LocalStepResult,
        evidence_ref: Option<&str>,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<StepTrace> {
        let current = self.load_instance(owner, id, tx).await?;
        let trace_id = digest(&json!(["runbook_step.v1", owner, id, result.step_id]));
        if let Some(prior) = self
            .store
            .read_kind(owner, "runbook_step_trace", Some(&trace_id), None, tx)
            .await?
            .pop()
        {
            let RuntimeRecord::Trace(trace) = parse_runtime_afp(owner, &prior)? else {
                return Err("invalid_trace");
            };
            if trace.input_hash != result.input_hash
                || trace.input_refs != result.input_refs
                || trace.output_hash.as_deref() != Some(&result.output_hash)
                || trace.output_refs != result.output_refs
            {
                return Err("step_replay_conflict");
            }
            return Ok(trace);
        }
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::Running
            || current.instance.current_step_id.as_deref() != Some(&result.step_id)
        {
            return Err("step_not_current");
        }
        self.require_enabled(owner, &current.instance, tx).await?;
        let definition = self.definition(owner, &current.instance, tx).await?;
        let index = current.instance.completed_step_ids.len();
        let step = definition.steps.get(index).ok_or("step_not_found")?;
        if step.step_id != result.step_id
            || !matches!(step.kind, StepKind::Read | StepKind::Transform)
        {
            return Err("step_requires_executor_integration");
        }
        let now = Utc::now();
        let mut trace = StepTrace {
            trace_id: trace_id.clone(),
            instance_id: id.into(),
            step_id: step.step_id.clone(),
            step_kind: step.kind,
            status: TraceStatus::Completed,
            input_refs: result.input_refs.clone(),
            output_refs: result.output_refs.clone(),
            input_hash: result.input_hash.clone(),
            output_hash: Some(result.output_hash.clone()),
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
        self.attach_provenance(
            owner,
            &current.instance,
            &mut trace,
            evidence_ref.map(|_| result.output_hash.as_str()),
            tx,
        )
        .await?;
        let mut trace_afp = build_runtime_afp(
            owner,
            Some(&current.message_id),
            &RuntimeRecord::Trace(trace.clone()),
            now,
        )?;
        trace_afp["id"] = json!(trace_id);
        self.store.append(owner, trace_afp, tx).await?;
        let mut next = current.instance.clone();
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
        if let Some(reference) = evidence_ref {
            next.evidence_packet_ref = Some(reference.into());
        }
        self.append_instance(owner, Some(&current.message_id), next, tx)
            .await?;
        Ok(trace)
    }

    /// Persist the wait and its declared follow-up schedule atomically.
    pub async fn wait(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
        due_at: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> Result<InstanceRecord> {
        self.schedule_wait(owner, id, expected_revision, due_at, expires_at)
            .await?;
        self.instance(owner, id).await
    }

    pub async fn cancel(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
    ) -> Result<InstanceRecord> {
        self.resolve(owner, id, expected_revision, false).await
    }
    pub async fn expire_wait(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
    ) -> Result<InstanceRecord> {
        self.resolve(owner, id, expected_revision, true).await
    }

    async fn resolve(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
        timeout: bool,
    ) -> Result<InstanceRecord> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let reason = if timeout { "timed_out" } else { "cancelled" };
        let receipt_id = digest(&json!([
            "runbook_resolution.v1",
            owner,
            id,
            expected_revision,
            reason
        ]));
        if let Some(prior) = self
            .store
            .read_kind(
                owner,
                "runbook_resolution",
                Some(&receipt_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
        {
            if current.message_id != prior["content"]["instance_ref"] {
                return Err("resolution_history_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(current);
        }
        if timeout
            && (current.instance.status != InstanceState::WaitingForEvent
                || current
                    .instance
                    .wait_expires_at
                    .is_none_or(|t| t > Utc::now()))
        {
            return Err("wait_not_due");
        }
        let mut next = current.instance.transition(
            expected_revision,
            if timeout {
                InstanceState::Failed
            } else {
                InstanceState::Cancelled
            },
        )?;
        self.cancel_questions(owner, &current, &mut tx).await?;
        self.resolve_schedules(owner, &current, timeout, &mut tx)
            .await?;
        next.next_follow_up_at = None;
        next.wait_expires_at = None;
        let record = self
            .append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        let resolution = audit(
            owner,
            &receipt_id,
            "runbook_resolution",
            id,
            Some(&current.message_id),
            json!({"instance_id":id,"instance_ref":record.message_id,"reason":reason}),
        );
        self.store.append(owner, resolution, &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(record)
    }

    pub(crate) async fn require_enabled(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        let registry = self.store.load(owner, tx).await?;
        let current = registry
            .get(&instance.runbook_id)
            .ok_or("definition_not_found")?;
        if !current.definition.enabled || current.definition.status != DefinitionStatus::Active {
            return Err("definition_disabled");
        }
        Ok(())
    }
    pub(crate) async fn definition(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<RunbookDefinition> {
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_definition",
                Some(&instance.definition_ref),
                None,
                tx,
            )
            .await?
            .pop()
            .ok_or("definition_not_found")?;
        let definition = parse_definition_afp(owner, &value)?.definition;
        if definition.runbook_id != instance.runbook_id
            || definition.version != instance.runbook_version
        {
            return Err("instance_definition_mismatch");
        }
        Ok(definition)
    }
    pub(crate) async fn append_instance(
        &self,
        owner: &str,
        parent: Option<&str>,
        instance: RunbookInstance,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<InstanceRecord> {
        if instance.revision > 4096 {
            return Err("instance_history_limit");
        }
        let mut message = build_runtime_afp(
            owner,
            parent,
            &RuntimeRecord::Instance(instance.clone()),
            Utc::now(),
        )?;
        let message_id = digest(&json!([
            "runbook_revision.v1",
            owner,
            instance.instance_id,
            instance.revision
        ]));
        message["id"] = json!(message_id);
        self.store.append(owner, message, tx).await?;
        Ok(InstanceRecord {
            message_id,
            instance,
        })
    }
    pub(crate) async fn load_instance(
        &self,
        owner: &str,
        id: &str,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<InstanceRecord> {
        if !identifier(id) {
            return Err("invalid_instance_id");
        }
        let messages = self
            .store
            .read_kind(
                owner,
                "runbook_instance",
                None,
                Some(&format!("runbook:{id}")),
                tx,
            )
            .await?;
        let mut records = vec![];
        for message in messages {
            let RuntimeRecord::Instance(instance) = parse_runtime_afp(owner, &message)? else {
                return Err("invalid_instance");
            };
            records.push((message, instance));
        }
        records.sort_by_key(|(_, i)| i.revision);
        let mut previous: Option<InstanceRecord> = None;
        for (message, instance) in records {
            if instance.instance_id != id {
                return Err("instance_identity_mismatch");
            }
            if let Some(prior) = &previous {
                if prior.instance.revision.checked_add(1) != Some(instance.revision)
                    || message["parent_id"] != prior.message_id
                    || prior.instance.status.terminal()
                    || (prior.instance.status != instance.status
                        && !prior.instance.status.can_transition_to(instance.status))
                    || (prior.instance.status == instance.status
                        && !matches!(
                            instance.status,
                            InstanceState::Running | InstanceState::WaitingForEvent
                        ))
                    || instance.definition_ref != prior.instance.definition_ref
                    || instance.runbook_id != prior.instance.runbook_id
                    || instance.runbook_version != prior.instance.runbook_version
                    || instance.instance_key != prior.instance.instance_key
                    || instance.trigger_event_id != prior.instance.trigger_event_id
                    || !instance
                        .completed_step_ids
                        .starts_with(&prior.instance.completed_step_ids)
                {
                    return Err("invalid_instance_history");
                }
            } else if instance.revision != 1
                || instance.status != InstanceState::Matched
                || !message["parent_id"].is_null()
            {
                return Err("missing_instance_root");
            }
            previous = Some(InstanceRecord {
                message_id: message["id"].as_str().ok_or("invalid_message_id")?.into(),
                instance,
            });
        }
        previous.ok_or("instance_not_found")
    }
}

fn audit(
    owner: &str,
    id: &str,
    kind: &str,
    subject: &str,
    parent: Option<&str>,
    content: Value,
) -> Value {
    let thread = if kind == "runbook_resolution" {
        format!("runbook:{subject}")
    } else {
        format!("{kind}:{subject}")
    };
    json!({"protocol":"afp-v1","id":id,"thread_id":thread,"parent_id":parent,
        "from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),"type":kind,"subtype":"v1",
        "content":content,"metadata":{"private":true,"store":true,"subject_id":subject},
        "references":[subject],"supertags":["runbook",kind],"store_in_relational":true})
}

pub(crate) fn validate_audit(owner: &str, message: &Value) -> Result<()> {
    let subject = message["metadata"]["subject_id"]
        .as_str()
        .ok_or("invalid_audit")?;
    let kind = message["type"].as_str().ok_or("invalid_audit")?;
    if !identifier(owner)
        || !identifier(subject)
        || !message["id"].as_str().is_some_and(identifier)
        || message["content"].to_string().len() > MAX_DEFINITION_BYTES
        || DateTime::parse_from_rfc3339(message["timestamp"].as_str().ok_or("invalid_audit")?)
            .is_err()
    {
        return Err("invalid_audit");
    }
    let expected = audit(owner, "unused", kind, subject, None, Value::Null);
    for field in [
        "protocol",
        "from",
        "to",
        "thread_id",
        "subtype",
        "metadata",
        "references",
        "supertags",
        "store_in_relational",
    ] {
        if message[field] != expected[field] {
            return Err("invalid_audit_envelope");
        }
    }
    match kind {
        "runbook_dispatch" => {
            let receipt: DispatchReceipt = serde_json::from_value(message["content"].clone())
                .map_err(|_| "invalid_dispatch")?;
            if receipt.event_id != subject
                || receipt.event_hash.len() != 64
                || !receipt.event_hash.bytes().all(|b| b.is_ascii_hexdigit())
                || receipt.instance_ids.len() > 5
                || !message["parent_id"].is_null()
                || receipt.decisions.iter().any(|d| {
                    !identifier(&d.runbook_id)
                        || !identifier(&d.definition_ref)
                        || d.instance_key.len() != 64
                        || !d.instance_key.bytes().all(|b| b.is_ascii_hexdigit())
                })
                || receipt.instance_ids
                    != receipt
                        .decisions
                        .iter()
                        .filter(|d| d.disposition == MatchDisposition::Matched)
                        .map(|d| d.instance_key.clone())
                        .collect::<Vec<_>>()
            {
                return Err("invalid_dispatch");
            }
        }
        "runbook_resolution" => {
            #[derive(Deserialize)]
            #[serde(deny_unknown_fields)]
            struct Resolution {
                instance_id: String,
                instance_ref: String,
                reason: String,
            }
            let r: Resolution = serde_json::from_value(message["content"].clone())
                .map_err(|_| "invalid_resolution")?;
            if r.instance_id != subject
                || !identifier(&r.instance_ref)
                || !matches!(r.reason.as_str(), "cancelled" | "timed_out")
                || !message["parent_id"].as_str().is_some_and(identifier)
            {
                return Err("invalid_resolution");
            }
        }
        _ => return Err("invalid_audit_kind"),
    }
    Ok(())
}
