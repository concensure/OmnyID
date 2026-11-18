//! Normalize persisted events without copying payloads, credentials or message bodies.
//! `ledger_owner` is the partition used for the database read, not a field from JSON.
use crate::runbook_contract::*;
use crate::runbook_validation::{identifier, validate_event};
use chrono::{DateTime, Utc};
use serde_json::{Map, Value};

pub fn normalize_stored_event(
    owner: &str,
    ledger_owner: &str,
    stored: &Value,
) -> Result<ProactiveEvent> {
    if !identifier(owner) || owner != ledger_owner {
        return Err("event_owner_mismatch");
    }
    if stored["protocol"] != "afp-v1" {
        return Err("invalid_event_protocol");
    }
    let id = stored["id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_event_id")?;
    let content = &stored["content"];
    let kind = stored["type"].as_str().ok_or("missing_event_type")?;
    let event_type = match kind {
        "passive_event" => content["event_type"].as_str().ok_or("missing_event_type")?,
        "watcher_alert"
        | "watcher_resolution_event"
        | "workflow_failed"
        | "wedding_vendor_quote_received"
        | "wedding_rsvp_received"
        | "wedding_task_due"
        | "document_review_required" => kind,
        // Due-event eligibility belongs to the durable scheduler, not this adapter.
        _ => return Err("unsupported_event_source"),
    };
    let at = if kind == "passive_event" {
        &content["event_at"]
    } else {
        &stored["timestamp"]
    };
    let occurred_at = DateTime::parse_from_rfc3339(at.as_str().ok_or("missing_event_time")?)
        .map_err(|_| "invalid_event_time")?
        .with_timezone(&Utc);
    let mut metadata = Map::new();
    // Copy only reviewed structured keys. Unknown upstream metadata is deliberately
    // omitted; direct normalized-event callers receive strict validation instead.
    for key in [
        "wedding_id",
        "document_kind",
        "revision",
        "idle_hours",
        "status",
        "category",
        "tags",
        "permission",
        "required_field",
        "confidence",
    ] {
        if let Some(value) = content.get("metadata").and_then(|m| m.get(key)) {
            metadata.insert(key.into(), value.clone());
        }
    }
    let watcher = kind == "watcher_alert" || kind == "watcher_resolution_event";
    let mut source_refs = vec![format!("message:{id}")];
    for field in ["source_refs", "entity_refs"] {
        if let Some(value) = content.get(field) {
            let refs: Vec<String> =
                serde_json::from_value(value.clone()).map_err(|_| "invalid_event_refs")?;
            if !crate::runbook_validation::identifiers(&refs, MAX_REFS)
                || refs.iter().any(|r| !r.contains(':'))
            {
                return Err("invalid_event_refs");
            }
            if field == "source_refs" {
                source_refs.extend(refs);
            }
        }
    }
    if watcher {
        for field in ["source_event_id", "resolved_message_id"] {
            if let Some(v) = content.get(field).filter(|v| !v.is_null()) {
                let reference = v
                    .as_str()
                    .filter(|s| identifier(s))
                    .ok_or("invalid_event_refs")?;
                source_refs.push(format!("message:{reference}"));
            }
        }
    }
    source_refs.sort();
    source_refs.dedup();
    let mut entity_refs: Vec<String> = content
        .get("entity_refs")
        .map(|v| serde_json::from_value(v.clone()))
        .transpose()
        .map_err(|_| "invalid_event_refs")?
        .unwrap_or_default();
    if let Some(entity) = content.get("entity_id").filter(|v| !v.is_null()) {
        let entity = entity.as_str().ok_or("invalid_entity_ref")?;
        if (!entity.contains(':') && !watcher) || !identifier(entity) {
            return Err("untyped_entity_ref");
        }
        entity_refs.push(if entity.contains(':') {
            entity.to_string()
        } else {
            format!("entity:{entity}")
        });
    }
    entity_refs.sort();
    entity_refs.dedup();
    let optional_string = |value: Option<&Value>| -> Result<Option<String>> {
        value
            .filter(|v| !v.is_null())
            .map(|v| v.as_str().map(str::to_owned).ok_or("invalid_event_field"))
            .transpose()
    };
    let event = ProactiveEvent {
        urgency: optional_string(content.get("urgency").or_else(|| content.get("severity")))?,
        event_id: id.to_string(),
        event_type: event_type.to_string(),
        source_refs,
        entity_refs,
        metadata,
        confidence: if kind == "watcher_resolution_event" && content.get("confidence").is_none() {
            0.0
        } else {
            content["confidence"]
                .as_f64()
                .ok_or("missing_event_confidence")?
        },
        occurred_at,
        caused_by_event_id: optional_string(
            content
                .get("caused_by_event_id")
                .or_else(|| content.get("source_event_id")),
        )?,
    };
    validate_event(&event)?;
    Ok(event)
}

// Due events use a separate private-ledger entry point. A public AFP body that
// merely claims to be runbook_follow_up is never eligible for dispatch.
impl crate::runbook_store::RunbookStore<'_> {
    pub async fn normalize_follow_up(&self, owner: &str, event_id: &str) -> Result<ProactiveEvent> {
        if !identifier(event_id) {
            return Err("invalid_event_id");
        }
        let mut tx = self.begin(owner).await?;
        let value = self
            .read_kind(owner, "runbook_follow_up", Some(event_id), None, &mut tx)
            .await?
            .pop()
            .ok_or("event_not_found")?;
        let schedule: crate::runbook_schedule::FollowUpSchedule =
            serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_schedule")?;
        let mut refs = schedule.source_refs;
        refs.push(format!("private_message:{event_id}"));
        refs.sort();
        refs.dedup();
        let event = ProactiveEvent {
            urgency: None,
            event_id: event_id.into(),
            event_type: schedule.event_type,
            source_refs: refs,
            entity_refs: vec![format!("instance:{}", schedule.instance_id)],
            metadata: Map::new(),
            confidence: 1.0,
            occurred_at: DateTime::parse_from_rfc3339(
                value["timestamp"].as_str().ok_or("invalid_timestamp")?,
            )
            .map_err(|_| "invalid_timestamp")?
            .with_timezone(&Utc),
            caused_by_event_id: Some(schedule.caused_by_event_id),
        };
        validate_event(&event)?;
        Ok(event)
    }
}
