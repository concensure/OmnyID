//! Durable follow-up AFP events. A shared daemon may call the bounded due scan;
//! this module starts no timer/task and accepts no caller-supplied event type.
use crate::{
    runbook_afp::{RuntimeRecord, build_runtime_afp},
    runbook_contract::*,
    runbook_control::envelope,
    runbook_runtime::{InstanceRecord, RunbookRuntime},
    runbook_store::digest,
    runbook_validation::{identifier, identifiers},
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use std::collections::BTreeMap;
mod trace;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleStatus {
    Scheduled,
    Delivered,
    Cancelled,
    Expired,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FollowUpSchedule {
    pub schedule_id: String,
    pub instance_id: String,
    pub step_id: String,
    pub revision: u32,
    pub requested_revision: u32,
    pub status: ScheduleStatus,
    pub event_type: String,
    pub due_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub cancellation_key: String,
    pub caused_by_event_id: String,
    pub source_refs: Vec<String>,
}
#[derive(Debug, Clone, PartialEq)]
pub struct ScheduleRecord {
    pub message_id: String,
    pub schedule: FollowUpSchedule,
}

fn record_id(s: &FollowUpSchedule) -> String {
    digest(&json!([
        "runbook_schedule_revision.v1",
        s.schedule_id,
        s.revision
    ]))
}
pub(crate) fn validate_schedule_record(value: &Value) -> Result<()> {
    let s: FollowUpSchedule =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_schedule")?;
    let owner = value["from"].as_str().ok_or("invalid_schedule")?;
    if !identifier(&s.step_id)
        || !identifier(&s.caused_by_event_id)
        || s.revision == 0
        || s.revision > 4096
        || s.requested_revision == 0
        || s.due_at >= s.expires_at
        || s.expires_at - s.due_at > Duration::days(30)
        || !identifiers(&s.source_refs, MAX_REFS)
        || s.schedule_id
            != digest(&json!([
                "runbook_schedule.v1",
                owner,
                s.instance_id,
                s.step_id
            ]))
        || s.cancellation_key != s.schedule_id
    {
        return Err("invalid_schedule");
    }
    let id = record_id(&s);
    match value["type"].as_str() {
        Some("runbook_schedule") if value["id"] == id => Ok(()),
        Some("runbook_follow_up")
            if s.status == ScheduleStatus::Delivered
                && value["parent_id"] == id
                && value["id"] == digest(&json!(["runbook_due.v1", s.schedule_id])) =>
        {
            Ok(())
        }
        _ => Err("invalid_schedule_event"),
    }
}
fn deadline(due: DateTime<Utc>, expiry: DateTime<Utc>) -> Result<()> {
    if due <= Utc::now() || expiry <= due || expiry > Utc::now() + Duration::days(30) {
        Err("invalid_wait_deadline")
    } else {
        Ok(())
    }
}

impl RunbookRuntime<'_, '_> {
    pub async fn schedule_wait(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
        due_at: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> Result<ScheduleRecord> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        // Look up the original request before state checks, including after delivery.
        let records = self.schedules_in(owner, id, &mut tx).await?;
        if let Some(prior) = records.iter().find(|r| {
            r.schedule.revision == 1 && r.schedule.requested_revision == expected_revision
        }) {
            if prior.schedule.due_at != due_at || prior.schedule.expires_at != expires_at {
                return Err("schedule_replay_conflict");
            }
            return Ok(prior.clone());
        }
        deadline(due_at, expires_at)?;
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let step = definition
            .steps
            .get(current.instance.completed_step_ids.len())
            .ok_or("step_not_found")?;
        if step.kind != StepKind::Wait
            || current.instance.current_step_id.as_deref() != Some(&step.step_id)
        {
            return Err("invalid_wait_step");
        }
        let event = step
            .follow_up_event
            .as_deref()
            .filter(|e| definition.follow_up_events.iter().any(|f| f == e))
            .ok_or("undeclared_follow_up")?;
        let latest = self.store.load(owner, &mut tx).await?;
        if !latest
            .get(&definition.runbook_id)
            .is_some_and(|d| d.definition.follow_up_events.iter().any(|f| f == event))
        {
            return Err("undeclared_follow_up");
        }
        let mut next = current
            .instance
            .transition(expected_revision, InstanceState::WaitingForEvent)?;
        next.next_follow_up_at = Some(due_at);
        next.wait_expires_at = Some(expires_at);
        let schedule_id = digest(&json!(["runbook_schedule.v1", owner, id, step.step_id]));
        let mut refs = vec![format!("message:{}", current.instance.trigger_event_id)];
        if let Some(packet) = &current.instance.evidence_packet_ref {
            refs.push(format!("private_message:{packet}"));
        }
        let s = FollowUpSchedule {
            schedule_id: schedule_id.clone(),
            instance_id: id.into(),
            step_id: step.step_id.clone(),
            revision: 1,
            requested_revision: expected_revision,
            status: ScheduleStatus::Scheduled,
            event_type: event.into(),
            due_at,
            expires_at,
            cancellation_key: schedule_id,
            caused_by_event_id: current.instance.trigger_event_id.clone(),
            source_refs: refs,
        };
        let result = self
            .append_schedule(owner, &current.instance, &current.message_id, s, &mut tx)
            .await?;
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(result)
    }

    pub async fn reschedule_wait(
        &self,
        owner: &str,
        id: &str,
        parent_schedule_ref: &str,
        expected_revision: u32,
        due_at: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> Result<ScheduleRecord> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let records = self.schedules_in(owner, id, &mut tx).await?;
        let parent = records
            .iter()
            .find(|r| r.message_id == parent_schedule_ref)
            .ok_or("schedule_not_found")?;
        let latest = records
            .iter()
            .filter(|r| r.schedule.schedule_id == parent.schedule.schedule_id)
            .max_by_key(|r| r.schedule.revision)
            .ok_or("schedule_not_found")?;
        if latest.schedule.revision == parent.schedule.revision + 1
            && latest.schedule.status == ScheduleStatus::Scheduled
            && latest.schedule.requested_revision == expected_revision
            && latest.schedule.due_at == due_at
            && latest.schedule.expires_at == expires_at
        {
            return Ok(latest.clone());
        }
        if latest.message_id != parent_schedule_ref
            || latest.schedule.status != ScheduleStatus::Scheduled
        {
            return Err("stale_schedule");
        }
        deadline(due_at, expires_at)?;
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        self.check_schedule_current(owner, &current, latest, &mut tx)
            .await?;
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        if latest.schedule.expires_at <= Utc::now() {
            return Err("schedule_expired");
        }
        let mut s = latest.schedule.clone();
        s.revision += 1;
        s.requested_revision = expected_revision;
        s.due_at = due_at;
        s.expires_at = expires_at;
        let result = self
            .append_schedule(owner, &current.instance, parent_schedule_ref, s, &mut tx)
            .await?;
        let mut next = current.instance.clone();
        next.revision += 1;
        next.next_follow_up_at = Some(due_at);
        next.wait_expires_at = Some(expires_at);
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(result)
    }

    /// Bounded scan for the existing daemon adapter. Returned refs are hints;
    /// delivery rechecks ownership, revision, current policy and real server time.
    pub async fn due_schedules(&self, owner: &str, limit: usize) -> Result<Vec<ScheduleRecord>> {
        if limit == 0 || limit > 100 {
            return Err("invalid_scan_limit");
        }
        let mut tx = self.store.begin(owner).await?;
        let values = self
            .store
            .read_kind(owner, "runbook_schedule", None, None, &mut tx)
            .await?;
        let mut latest: BTreeMap<String, ScheduleRecord> = BTreeMap::new();
        for value in values {
            let s: FollowUpSchedule =
                serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_schedule")?;
            if latest
                .get(&s.schedule_id)
                .is_none_or(|r| r.schedule.revision < s.revision)
            {
                latest.insert(
                    s.schedule_id.clone(),
                    ScheduleRecord {
                        message_id: value["id"].as_str().ok_or("invalid_schedule")?.into(),
                        schedule: s,
                    },
                );
            }
        }
        let mut due: Vec<_> = latest
            .into_values()
            .filter(|r| {
                r.schedule.status == ScheduleStatus::Scheduled && r.schedule.due_at <= Utc::now()
            })
            .collect();
        due.sort_by(|a, b| {
            a.schedule
                .due_at
                .cmp(&b.schedule.due_at)
                .then(a.message_id.cmp(&b.message_id))
        });
        due.truncate(limit);
        Ok(due)
    }

    pub async fn deliver_follow_up(
        &self,
        owner: &str,
        id: &str,
        schedule_ref: &str,
    ) -> Result<ScheduleRecord> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let records = self.schedules_in(owner, id, &mut tx).await?;
        let requested = records
            .iter()
            .find(|r| r.message_id == schedule_ref)
            .ok_or("schedule_not_found")?;
        let latest = records
            .iter()
            .filter(|r| r.schedule.schedule_id == requested.schedule.schedule_id)
            .max_by_key(|r| r.schedule.revision)
            .ok_or("schedule_not_found")?;
        // Only exact delivery retry is a receipt. A stale rescheduled scan conflicts.
        if latest.schedule.status == ScheduleStatus::Delivered
            && latest.schedule.revision == requested.schedule.revision + 1
        {
            return Ok(latest.clone());
        }
        if latest.message_id != schedule_ref || latest.schedule.status != ScheduleStatus::Scheduled
        {
            return Err("stale_schedule");
        }
        if latest.schedule.due_at > Utc::now() {
            return Err("schedule_not_due");
        }
        self.check_schedule_current(owner, &current, latest, &mut tx)
            .await?;
        let expired = latest.schedule.expires_at <= Utc::now();
        if !expired {
            self.require_enabled(owner, &current.instance, &mut tx)
                .await?;
        }
        let mut s = latest.schedule.clone();
        s.revision += 1;
        s.status = if expired {
            ScheduleStatus::Expired
        } else {
            ScheduleStatus::Delivered
        };
        let result = self
            .append_schedule(owner, &current.instance, schedule_ref, s.clone(), &mut tx)
            .await?;
        let mut next = current.instance.transition(
            current.instance.revision,
            if expired {
                InstanceState::Failed
            } else {
                InstanceState::Running
            },
        )?;
        next.next_follow_up_at = None;
        next.wait_expires_at = None;
        if !expired {
            let event_id = digest(&json!(["runbook_due.v1", s.schedule_id]));
            self.store
                .append(
                    owner,
                    envelope(
                        owner,
                        &event_id,
                        id,
                        &result.message_id,
                        "runbook_follow_up",
                        json!(s),
                    ),
                    &mut tx,
                )
                .await?;
            let definition = self.definition(owner, &current.instance, &mut tx).await?;
            let step_index = current.instance.completed_step_ids.len();
            let now = Utc::now();
            let trace_id = digest(&json!(["runbook_step.v1", owner, id, s.step_id]));
            let mut trace = StepTrace {
                trace_id: trace_id.clone(),
                instance_id: id.into(),
                step_id: s.step_id.clone(),
                step_kind: StepKind::Wait,
                status: TraceStatus::Completed,
                input_refs: vec![schedule_ref.into()],
                output_refs: vec![event_id],
                input_hash: digest(&json!(latest.schedule)),
                output_hash: Some(digest(&json!(s))),
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
            let mut value = build_runtime_afp(
                owner,
                Some(&current.message_id),
                &RuntimeRecord::Trace(trace),
                now,
            )?;
            value["id"] = json!(trace_id);
            self.store.append(owner, value, &mut tx).await?;
            next.completed_step_ids.push(s.step_id);
            next.current_step_id = Some(
                definition
                    .steps
                    .get(step_index + 1)
                    .ok_or("missing_completion_step")?
                    .step_id
                    .clone(),
            );
            next.latest_trace_ref = Some(trace_id);
        }
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(result)
    }

    async fn check_schedule_current(
        &self,
        owner: &str,
        current: &InstanceRecord,
        record: &ScheduleRecord,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        let s = &record.schedule;
        if current.instance.status != InstanceState::WaitingForEvent
            || current.instance.current_step_id.as_deref() != Some(&s.step_id)
            || current.instance.next_follow_up_at != Some(s.due_at)
            || current.instance.wait_expires_at != Some(s.expires_at)
        {
            return Err("schedule_not_current");
        }
        let definition = self.definition(owner, &current.instance, tx).await?;
        let step = definition
            .steps
            .get(current.instance.completed_step_ids.len())
            .ok_or("step_not_found")?;
        let latest = self.store.load(owner, tx).await?;
        if step.kind != StepKind::Wait
            || step.step_id != s.step_id
            || step.follow_up_event.as_deref() != Some(&s.event_type)
            || !definition.follow_up_events.contains(&s.event_type)
            || !latest
                .get(&definition.runbook_id)
                .is_some_and(|d| d.definition.follow_up_events.contains(&s.event_type))
        {
            return Err("undeclared_follow_up");
        }
        Ok(())
    }

    async fn append_schedule(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        parent: &str,
        s: FollowUpSchedule,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<ScheduleRecord> {
        let message_id = record_id(&s);
        self.store
            .append(
                owner,
                envelope(
                    owner,
                    &message_id,
                    &s.instance_id,
                    parent,
                    "runbook_schedule",
                    json!(s),
                ),
                tx,
            )
            .await?;
        self.trace_schedule(owner, instance, parent, &message_id, &s, tx)
            .await?;
        Ok(ScheduleRecord {
            message_id,
            schedule: s,
        })
    }

    async fn schedules_in(
        &self,
        owner: &str,
        id: &str,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<Vec<ScheduleRecord>> {
        let values = self
            .store
            .read_kind(
                owner,
                "runbook_schedule",
                None,
                Some(&format!("runbook:{id}")),
                tx,
            )
            .await?;
        let mut records = Vec::new();
        for value in values {
            let s: FollowUpSchedule =
                serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_schedule")?;
            records.push((value, s));
        }
        records.sort_by_key(|(_, s)| (s.schedule_id.clone(), s.revision));
        let mut previous: BTreeMap<String, ScheduleRecord> = BTreeMap::new();
        let mut result = vec![];
        for (v, s) in records {
            if s.instance_id != id {
                return Err("schedule_instance_mismatch");
            }
            if let Some(p) = previous.get(&s.schedule_id) {
                if s.revision != p.schedule.revision + 1
                    || v["parent_id"] != p.message_id
                    || p.schedule.status != ScheduleStatus::Scheduled
                    || s.step_id != p.schedule.step_id
                    || s.event_type != p.schedule.event_type
                    || s.source_refs != p.schedule.source_refs
                    || s.caused_by_event_id != p.schedule.caused_by_event_id
                {
                    return Err("invalid_schedule_history");
                }
            } else if s.revision != 1 || s.status != ScheduleStatus::Scheduled {
                return Err("missing_schedule_root");
            }
            let r = ScheduleRecord {
                message_id: v["id"].as_str().ok_or("invalid_schedule")?.into(),
                schedule: s,
            };
            previous.insert(r.schedule.schedule_id.clone(), r.clone());
            result.push(r);
        }
        Ok(result)
    }

    pub(crate) async fn resolve_schedules(
        &self,
        owner: &str,
        current: &InstanceRecord,
        expired: bool,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        let records = self
            .schedules_in(owner, &current.instance.instance_id, tx)
            .await?;
        let mut latest: BTreeMap<String, ScheduleRecord> = BTreeMap::new();
        for r in records {
            latest.insert(r.schedule.schedule_id.clone(), r);
        }
        for r in latest
            .into_values()
            .filter(|r| r.schedule.status == ScheduleStatus::Scheduled)
        {
            let mut s = r.schedule;
            s.revision += 1;
            s.status = if expired {
                ScheduleStatus::Expired
            } else {
                ScheduleStatus::Cancelled
            };
            self.append_schedule(owner, &current.instance, &r.message_id, s, tx)
                .await?;
        }
        Ok(())
    }
}
