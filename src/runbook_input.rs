//! Bounded missing-fact questions and typed, owner-authenticated answer events.
//! Answer facts are data only; they cannot change steps, tools or approval state.
use crate::{
    runbook_afp::{RuntimeRecord, build_runtime_afp, parse_runtime_afp},
    runbook_contract::*,
    runbook_control::envelope,
    runbook_read::parse_receipt,
    runbook_runtime::{InstanceRecord, RunbookRuntime},
    runbook_store::digest,
    runbook_validation::identifier,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InputSupplied {
    pub event_id: String,
    pub instance_id: String,
    pub escalation_id: String,
    pub answers: BTreeMap<String, Value>,
}

pub fn validate_answer(schema: AnswerSchema, value: &Value) -> Result<()> {
    let valid = match schema {
        AnswerSchema::Boolean => value.is_boolean(),
        AnswerSchema::NonNegativeNumber => {
            value.as_f64().is_some_and(|v| v.is_finite() && v >= 0.0)
        }
        AnswerSchema::ShortText => value.as_str().is_some_and(|s| {
            !s.trim().is_empty() && s.len() <= 512 && !s.chars().any(char::is_control)
        }),
        AnswerSchema::Date => value.as_str().is_some_and(|s| {
            s.len() == 10
                && NaiveDate::parse_from_str(s, "%Y-%m-%d")
                    .is_ok_and(|d| d.format("%Y-%m-%d").to_string() == s)
        }),
    };
    if valid {
        Ok(())
    } else {
        Err("invalid_answer_schema")
    }
}

pub(crate) fn validate_input_record(value: &Value) -> Result<()> {
    let input: InputSupplied =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_input_event")?;
    if !identifier(&input.event_id)
        || !identifier(&input.escalation_id)
        || input.answers.is_empty()
        || input.answers.len() > 16
        || input.answers.iter().any(|(k, v)| {
            !identifier(k)
                || v.to_string().len() > 1024
                || v.is_null()
                || v.is_array()
                || v.is_object()
        })
        || value["id"] != input.event_id
        || value["parent_id"] != input.escalation_id
    {
        return Err("invalid_input_event");
    }
    Ok(())
}

fn resolution_id(owner: &str, id: &str) -> String {
    digest(&json!(["runbook_question_resolution.v1", owner, id]))
}

impl RunbookRuntime<'_, '_> {
    /// Uses the saved read packet and frozen current-step requirements. One
    /// question per step, even across concurrent calls; retries cannot rewrite it.
    pub async fn request_missing_input(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
        schema: AnswerSchema,
        expires_at: DateTime<Utc>,
    ) -> Result<Option<EpistemicEscalation>> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let step_id = current
            .instance
            .current_step_id
            .as_deref()
            .ok_or("step_not_current")?;
        let escalation_id = digest(&json!(["runbook_question.v1", owner, id, step_id]));
        if let Some(prior) = self
            .store
            .read_kind(
                owner,
                "epistemic_escalation",
                Some(&escalation_id),
                None,
                &mut tx,
            )
            .await?
            .pop()
        {
            let RuntimeRecord::Escalation(e) = parse_runtime_afp(owner, &prior)? else {
                return Err("invalid_escalation");
            };
            if e.answer_schema != schema || e.expires_at != expires_at {
                return Err("question_replay_conflict");
            }
            if let Some(resolved) = self
                .store
                .read_kind(
                    owner,
                    "epistemic_escalation",
                    Some(&resolution_id(owner, &escalation_id)),
                    None,
                    &mut tx,
                )
                .await?
                .pop()
            {
                let RuntimeRecord::Escalation(e) = parse_runtime_afp(owner, &resolved)? else {
                    return Err("invalid_escalation");
                };
                return Ok(Some(e));
            }
            return Ok(Some(e));
        }
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::Running {
            return Err("instance_not_running");
        }
        if expires_at <= Utc::now() || expires_at > Utc::now() + Duration::days(30) {
            return Err("invalid_question_expiry");
        }
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let step = definition
            .steps
            .iter()
            .find(|s| s.step_id == step_id)
            .ok_or("step_not_found")?;
        let packet_id = current
            .instance
            .evidence_packet_ref
            .as_deref()
            .ok_or("evidence_required")?;
        let packet = self
            .store
            .read_kind(owner, "runbook_evidence", Some(packet_id), None, &mut tx)
            .await?
            .pop()
            .ok_or("evidence_required")?;
        let receipt = parse_receipt(owner, &packet)?;
        if receipt.instance_id != id {
            return Err("evidence_instance_mismatch");
        }
        let missing: Vec<String> = step
            .required_fields
            .iter()
            .filter(|field| {
                !receipt.packet.included.iter().any(|item| {
                    item.content
                        .get(field.as_str())
                        .is_some_and(|v| !v.is_null())
                })
            })
            .cloned()
            .collect();
        if missing.is_empty() {
            return Ok(None);
        }
        if !definition
            .escalate_when
            .contains(&EscalationReason::MissingRequiredFact)
        {
            return Err("missing_fact_escalation_undeclared");
        }
        let mut attempted: Vec<String> = receipt
            .packet
            .included
            .iter()
            .map(|i| i.reference.clone())
            .chain(receipt.packet.omitted.iter().map(|i| i.reference.clone()))
            .collect();
        attempted.sort();
        attempted.dedup();
        let e = EpistemicEscalation {
            escalation_id: escalation_id.clone(),
            instance_id: id.into(),
            step_id: step_id.into(),
            status: EscalationStatus::Open,
            reason: EscalationReason::MissingRequiredFact,
            question: format!("Please provide: {}.", missing.join(", ")),
            missing_fields: missing,
            attempted_refs: attempted,
            why_needed: format!(
                "These facts are required before step {step_id} can continue; the bounded evidence did not supply them."
            ),
            answer_schema: schema,
            expires_at,
        };
        let mut message = build_runtime_afp(
            owner,
            Some(&current.message_id),
            &RuntimeRecord::Escalation(e.clone()),
            Utc::now(),
        )?;
        message["id"] = json!(escalation_id);
        self.store.append(owner, message, &mut tx).await?;
        let next = current
            .instance
            .transition(expected_revision, InstanceState::WaitingForInput)?;
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(Some(e))
    }

    /// The authenticated adapter supplies owner separately. Only this typed AFP
    /// event can resolve a question; duplicate answers are rejected, not reapplied.
    pub async fn supply_input(
        &self,
        owner: &str,
        input: &InputSupplied,
        expected_revision: u32,
    ) -> Result<InstanceRecord> {
        let value = envelope(
            owner,
            &input.event_id,
            &input.instance_id,
            &input.escalation_id,
            "runbook_input_supplied",
            json!(input),
        );
        crate::runbook_control::validate(owner, &value)?;
        let mut tx = self.store.begin(owner).await?;
        let current = self
            .load_instance(owner, &input.instance_id, &mut tx)
            .await?;
        let e = self
            .open_question(owner, &current, &input.escalation_id, &mut tx)
            .await?;
        if e.expires_at <= Utc::now() {
            return Err("answer_expired");
        }
        if input.answers.keys().cloned().collect::<Vec<_>>() != {
            let mut fields = e.missing_fields.clone();
            fields.sort();
            fields
        } {
            return Err("answer_fields_mismatch");
        }
        for answer in input.answers.values() {
            validate_answer(e.answer_schema, answer)?;
        }
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        let next = current
            .instance
            .transition(expected_revision, InstanceState::Running)?;
        self.store.append(owner, value, &mut tx).await?;
        self.close_question(owner, &e, EscalationStatus::Answered, &mut tx)
            .await?;
        let result = self
            .append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(result)
    }

    pub async fn expire_input(
        &self,
        owner: &str,
        id: &str,
        escalation_id: &str,
        expected_revision: u32,
    ) -> Result<InstanceRecord> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let e = self
            .open_question(owner, &current, escalation_id, &mut tx)
            .await?;
        if e.expires_at > Utc::now() {
            return Err("question_not_expired");
        }
        let next = current
            .instance
            .transition(expected_revision, InstanceState::Failed)?;
        self.close_question(owner, &e, EscalationStatus::Expired, &mut tx)
            .await?;
        let result = self
            .append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(result)
    }

    /// Explicit typed answers remain separate from source evidence. Executors can
    /// consume them as facts, with the supplying event as provenance, never policy.
    pub async fn supplied_inputs(&self, owner: &str, id: &str) -> Result<Vec<InputSupplied>> {
        let mut tx = self.store.begin(owner).await?;
        self.load_instance(owner, id, &mut tx).await?;
        self.store
            .read_kind(
                owner,
                "runbook_input_supplied",
                None,
                Some(&format!("runbook:{id}")),
                &mut tx,
            )
            .await?
            .into_iter()
            .map(|v| {
                serde_json::from_value(v["content"].clone()).map_err(|_| "invalid_input_event")
            })
            .collect()
    }

    async fn open_question(
        &self,
        owner: &str,
        current: &InstanceRecord,
        id: &str,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<EpistemicEscalation> {
        if current.instance.status != InstanceState::WaitingForInput {
            return Err("question_not_open");
        }
        let value = self
            .store
            .read_kind(owner, "epistemic_escalation", Some(id), None, tx)
            .await?
            .pop()
            .ok_or("question_not_found")?;
        let RuntimeRecord::Escalation(e) = parse_runtime_afp(owner, &value)? else {
            return Err("invalid_escalation");
        };
        if e.instance_id != current.instance.instance_id
            || current.instance.current_step_id.as_deref() != Some(&e.step_id)
            || e.status != EscalationStatus::Open
            || !self
                .store
                .read_kind(
                    owner,
                    "epistemic_escalation",
                    Some(&resolution_id(owner, id)),
                    None,
                    tx,
                )
                .await?
                .is_empty()
        {
            return Err("question_not_open");
        }
        Ok(e)
    }

    async fn close_question(
        &self,
        owner: &str,
        e: &EpistemicEscalation,
        status: EscalationStatus,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        let mut next = e.clone();
        next.status = status;
        let mut value = build_runtime_afp(
            owner,
            Some(&e.escalation_id),
            &RuntimeRecord::Escalation(next),
            Utc::now(),
        )?;
        value["id"] = json!(resolution_id(owner, &e.escalation_id));
        self.store.append(owner, value, tx).await
    }

    pub(crate) async fn cancel_questions(
        &self,
        owner: &str,
        current: &InstanceRecord,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        if current.instance.status != InstanceState::WaitingForInput {
            return Ok(());
        }
        let step = current
            .instance
            .current_step_id
            .as_deref()
            .ok_or("step_not_current")?;
        let id = digest(&json!([
            "runbook_question.v1",
            owner,
            current.instance.instance_id,
            step
        ]));
        let e = self.open_question(owner, current, &id, tx).await?;
        self.close_question(owner, &e, EscalationStatus::Cancelled, tx)
            .await
    }
}
