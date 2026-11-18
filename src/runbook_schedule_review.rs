//! Read-only comparisons of calendar facts and existing Run Sheet projections.
use crate::{
    db::WeddingRunSheetProjectionState, runbook_contract::Result, runbook_evidence::EvidencePacket,
    runbook_store::digest, runbook_validation::identifier,
};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EventTime {
    id: String,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
}

pub(crate) fn calendar(facts: &BTreeMap<String, Value>) -> Result<Value> {
    let events: Vec<EventTime> = serde_json::from_value(facts["event_times"].clone())
        .map_err(|_| "invalid_calendar_times")?;
    let minutes = facts["travel_buffer"]
        .as_u64()
        .filter(|n| *n <= 240)
        .ok_or("invalid_travel_buffer")?;
    let priority = facts["priority"]
        .as_str()
        .ok_or("invalid_calendar_priority")?;
    if !(2..=32).contains(&events.len()) {
        return Err("calendar_event_limit");
    }
    let mut seen = BTreeSet::new();
    for event in &events {
        if !identifier(&event.id)
            || !seen.insert(&event.id)
            || event.end_at <= event.start_at
            || event.end_at - event.start_at > Duration::days(7)
        {
            return Err("invalid_calendar_times");
        }
    }
    if !events.iter().any(|e| e.id == priority) {
        return Err("unknown_calendar_priority");
    }
    let buffer = Duration::minutes(minutes as i64);
    let overlaps = |a: DateTime<Utc>, b: DateTime<Utc>, e: &EventTime| -> Result<bool> {
        Ok(a < e
            .end_at
            .checked_add_signed(buffer)
            .ok_or("calendar_time_overflow")?
            && b.checked_add_signed(buffer)
                .ok_or("calendar_time_overflow")?
                > e.start_at)
    };
    let mut conflicts = vec![];
    for (index, a) in events.iter().enumerate() {
        for b in events.iter().skip(index + 1) {
            if !overlaps(a.start_at, a.end_at, b)? {
                continue;
            }
            if conflicts.len() >= 32 {
                return Err("calendar_conflict_limit");
            }
            if a.id != priority && b.id != priority {
                conflicts.push(
                    json!({"event_ids":[a.id,b.id],"priority_unresolved":true,"alternatives":[]}),
                );
                continue;
            }
            let (fixed, moving) = if b.id == priority { (b, a) } else { (a, b) };
            let duration = moving.end_at - moving.start_at;
            let after = fixed
                .end_at
                .checked_add_signed(buffer)
                .ok_or("calendar_time_overflow")?;
            let before_end = fixed
                .start_at
                .checked_sub_signed(buffer)
                .ok_or("calendar_time_overflow")?;
            let before = before_end
                .checked_sub_signed(duration)
                .ok_or("calendar_time_overflow")?;
            let mut alternatives = vec![];
            for start in [before, after] {
                let end = start
                    .checked_add_signed(duration)
                    .ok_or("calendar_time_overflow")?;
                let mut free = true;
                for other in &events {
                    if other.id != moving.id && overlaps(start, end, other)? {
                        free = false;
                    }
                }
                if free {
                    alternatives.push(json!({"event_id":moving.id,"start_at":start,"end_at":end,"availability_verified":false}));
                }
            }
            conflicts.push(json!({"event_ids":[a.id,b.id],"preserved_event_id":fixed.id,"alternatives":alternatives}));
        }
    }
    Ok(
        json!({"priority_event_id":priority,"travel_buffer_minutes":minutes,"conflicts":conflicts,
        "calendar_write_authorized":false,"external_availability_verified":false}),
    )
}

fn projection(reference: &str, packet: &EvidencePacket) -> Result<WeddingRunSheetProjectionState> {
    if !identifier(reference)
        || !(reference.starts_with("message:") || reference.starts_with("private_message:"))
    {
        return Err("invalid_runsheet_reference");
    }
    let mut matches = packet.included.iter().filter(|i| i.reference == reference);
    let source = matches.next().ok_or("runsheet_snapshot_missing")?;
    if matches.next().is_some() || source.content.to_string().len() > 65536 {
        return Err("invalid_runsheet_snapshot");
    }
    let state: WeddingRunSheetProjectionState =
        serde_json::from_value(source.content.clone()).map_err(|_| "invalid_runsheet_snapshot")?;
    if state.checkpoint.is_none() || state.messages.len() > 128 {
        return Err("invalid_runsheet_snapshot");
    }
    let checkpoint = state
        .checkpoint
        .as_ref()
        .ok_or("runsheet_checkpoint_missing")?;
    if !identifier(&checkpoint.database_id)
        || !identifier(&checkpoint.wedding_plan_id)
        || !identifier(&checkpoint.projector_id)
        || checkpoint.projector_version < 1
        || checkpoint.source_fingerprint.is_empty()
        || checkpoint.source_fingerprint.len() > 256
    {
        return Err("invalid_runsheet_snapshot");
    }
    Ok(state)
}

fn timing_rows(state: &WeddingRunSheetProjectionState) -> Result<BTreeMap<String, Value>> {
    let checkpoint = state
        .checkpoint
        .as_ref()
        .ok_or("runsheet_checkpoint_missing")?;
    let mut rows: BTreeMap<String, (u64, Value)> = BTreeMap::new();
    let mut created = BTreeSet::new();
    for message in &state.messages {
        let c = &message.content;
        if !matches!(
            c["kind"].as_str(),
            Some("database_record" | "database_record_update")
        ) {
            continue;
        }
        if c["table"] != "run_sheet" || c["database_id"] != checkpoint.database_id {
            return Err("runsheet_scope_mismatch");
        }
        let create = c["kind"] == "database_record";
        let id = c[if create {
            "record_id"
        } else {
            "target_record_id"
        }]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_runsheet_row")?;
        let revision = c["revision"]
            .as_u64()
            .filter(|n| *n > 0)
            .ok_or("invalid_runsheet_revision")?;
        let data = if create {
            if revision != 1 || !created.insert(id.to_owned()) {
                return Err("invalid_runsheet_history");
            }
            c["data"].clone()
        } else {
            let (prior_revision, prior) = rows.get(id).ok_or("missing_runsheet_base")?;
            if c["base_revision"].as_u64() != Some(*prior_revision)
                || prior_revision.checked_add(1) != Some(revision)
            {
                return Err("invalid_runsheet_history");
            }
            if c["operation"] == "tombstone" {
                rows.remove(id);
                continue;
            }
            if c["operation"] != "upsert" {
                return Err("unsupported_runsheet_operation");
            }
            let mut data = prior.clone();
            for (key, value) in c["patch"].as_object().ok_or("invalid_runsheet_patch")? {
                data.as_object_mut()
                    .ok_or("invalid_runsheet_row")?
                    .insert(key.clone(), value.clone());
            }
            data
        };
        if !data.is_object() {
            return Err("invalid_runsheet_row");
        }
        rows.insert(id.into(), (revision, data));
        if rows.len() > 64 {
            return Err("runsheet_row_limit");
        }
    }
    let mut output = BTreeMap::new();
    for (id, (_, data)) in rows {
        // Use the canonical projection's timing fields, not another schedule model.
        let parse = |key: &str| -> Result<DateTime<Utc>> {
            DateTime::parse_from_rfc3339(data[key].as_str().ok_or("runsheet_timing_missing")?)
                .map(|v| v.with_timezone(&Utc))
                .map_err(|_| "invalid_runsheet_timing")
        };
        let start = parse("start_at")?;
        let end = parse("end_at")?;
        if end <= start || end - start > Duration::days(7) {
            return Err("invalid_runsheet_timing");
        }
        output.insert(id, json!({"start_at":start,"end_at":end}));
    }
    Ok(output)
}

pub(crate) fn runsheet(facts: &BTreeMap<String, Value>, packet: &EvidencePacket) -> Result<Value> {
    let before_ref = facts["previous_version_ref"]
        .as_str()
        .ok_or("invalid_runsheet_reference")?;
    let after_ref = facts["current_version_ref"]
        .as_str()
        .ok_or("invalid_runsheet_reference")?;
    if before_ref == after_ref {
        return Err("runsheet_versions_identical");
    }
    let before = projection(before_ref, packet)?;
    let after = projection(after_ref, packet)?;
    let a = before.checkpoint.as_ref().unwrap();
    let b = after.checkpoint.as_ref().unwrap();
    if a.database_id != b.database_id
        || a.wedding_plan_id != b.wedding_plan_id
        || a.projector_id != b.projector_id
        || a.projector_version != b.projector_version
        || a.source_fingerprint == b.source_fingerprint
    {
        return Err("runsheet_scope_mismatch");
    }
    let old = timing_rows(&before)?;
    let new = timing_rows(&after)?;
    let viewers: Vec<String> = serde_json::from_value(facts["affected_viewers"].clone())
        .map_err(|_| "invalid_runsheet_viewers")?;
    if !crate::runbook_validation::identifiers(&viewers, 32)
        || viewers.iter().any(|s| !s.contains(':'))
    {
        return Err("invalid_runsheet_viewers");
    }
    let keys: BTreeSet<_> = old.keys().chain(new.keys()).collect();
    let changes: Vec<_> = keys
        .into_iter()
        .filter(|id| old.get(*id) != new.get(*id))
        .map(|id| json!({"record_id":id,"before":old.get(id),"after":new.get(id)}))
        .collect();
    Ok(
        json!({"changes":changes,"affected_viewer_refs":viewers,"previous_hash":digest(&json!(before)),
        "current_hash":digest(&json!(after)),"publish_authorized":false,"viewer_access_granted":false}),
    )
}
