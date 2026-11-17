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
    let source_refs = vec![format!("message:{id}")];
    let mut entity_refs = Vec::new();
    if let Some(entity) = content.get("entity_id").filter(|v| !v.is_null()) {
        let entity = entity.as_str().ok_or("invalid_entity_ref")?;
        if !entity.contains(':') || !identifier(entity) {
            return Err("untyped_entity_ref");
        }
        entity_refs.push(entity.to_string());
    }
    let event = ProactiveEvent {
        event_id: id.to_string(),
        event_type: event_type.to_string(),
        source_refs,
        entity_refs,
        metadata,
        confidence: content["confidence"]
            .as_f64()
            .ok_or("missing_event_confidence")?,
        occurred_at,
        caused_by_event_id: None,
    };
    validate_event(&event)?;
    Ok(event)
}
