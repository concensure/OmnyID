//! Deterministic wedding quote -> DecisionOS orchestration.
//!
//! This adapter is deliberately bounded to one quote event. It references the
//! source quote instead of copying email or attachment bodies into a second
//! store, and its deterministic ids make insertion/reconciliation idempotent.

use crate::{
    message::AFPMessage,
    wedding_vendor_decision_patterns::{
        PatternVerificationInput, PatternVerificationOutcome, VENDOR_QUOTE_RESPONSE_PATTERN_ID,
        WEDDING_PATTERN_VERSION, verify_pattern,
    },
};
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub const QUOTE_ACTIONS: &[&str] = &[
    "ACCEPT_VENDOR",
    "NEGOTIATE_QUOTE",
    "EXPLORE_ALTERNATIVE",
    "DEFER_DECISION",
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct QuoteSafetyEnvelope {
    pub comfortable_resurface_at: Option<String>,
    pub latest_safe_decision_at: Option<String>,
    pub critical_at: Option<String>,
    pub external_deadline: Option<String>,
    pub deadline_source: Option<&'static str>,
    pub quote_validity_deadline: Option<String>,
    pub date_hold_deadline: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct VenueQuoteDecisionContent {
    pub state: &'static str,
    pub question: String,
    pub heading: String,
    pub primary_action_label: &'static str,
    pub one_thing_to_confirm: &'static str,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct QuotePrioritySignals {
    pub quote_validity_deadline_pressure: u8,
    pub alternative_recovery_time: u8,
    pub dependency_impact: u8,
    pub financial_exposure: u8,
    pub reversibility: u8,
    pub category_priority: u8,
    pub material_change_magnitude: u8,
    pub total: u8,
}

#[derive(Clone, Debug, Default)]
pub struct QuoteProjectionBatch {
    pub messages: Vec<AFPMessage>,
    pub verification_outcome: Option<PatternVerificationOutcome>,
}

fn clean(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn object<'a>(value: &'a Value, key: &str) -> Option<&'a serde_json::Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}

fn field<'a>(message: &'a AFPMessage, names: &[&str]) -> Option<&'a Value> {
    let quote = object(&message.content, "quote");
    let metadata = message.metadata.as_ref().and_then(Value::as_object);
    names.iter().find_map(|name| {
        quote
            .and_then(|value| value.get(*name))
            .or_else(|| message.content.get(*name))
            .or_else(|| metadata.and_then(|value| value.get(*name)))
    })
}

fn text_field(message: &AFPMessage, names: &[&str]) -> Option<String> {
    clean(field(message, names))
}

fn bool_field(message: &AFPMessage, names: &[&str]) -> bool {
    field(message, names).and_then(Value::as_bool) == Some(true)
}

fn number_field(message: &AFPMessage, names: &[&str]) -> Option<f64> {
    field(message, names).and_then(|value| {
        value
            .as_f64()
            .or_else(|| value.as_str()?.trim().replace(',', "").parse().ok())
    })
}

fn string_set_field(message: &AFPMessage, names: &[&str]) -> BTreeSet<String> {
    let Some(value) = field(message, names) else {
        return BTreeSet::new();
    };
    match value {
        Value::Array(values) => values
            .iter()
            .filter_map(|value| clean(Some(value)))
            .collect(),
        Value::String(value) if !value.trim().is_empty() => [value.trim().to_string()].into(),
        _ => BTreeSet::new(),
    }
}

fn safe_label(value: &str, fallback: &str) -> String {
    let normalized = value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, ':' | '_' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if normalized.is_empty() {
        fallback.to_string()
    } else {
        normalized
    }
}

fn message_tokens(message: &AFPMessage) -> String {
    let mut values = vec![
        message.r#type.as_str(),
        message.kind.as_deref().unwrap_or_default(),
        message.subtype.as_deref().unwrap_or_default(),
        message
            .content
            .get("ledger_kind")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    ];
    values.extend(message.supertags.iter().map(String::as_str));
    values.join(" ").to_ascii_lowercase()
}

pub fn is_wedding_vendor_quote_event(message: &AFPMessage) -> bool {
    message_tokens(message).contains("wedding_vendor_quote_received")
}

pub fn quote_decision_id(wedding_plan_id: Option<&str>, quote_message_id: &str) -> String {
    format!(
        "wedding_vendor_quote:{}:{}",
        safe_label(wedding_plan_id.unwrap_or_default(), "wedding"),
        safe_label(quote_message_id, "quote")
    )
}

fn parsed_time(value: Option<&str>) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value?)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

pub fn quote_safety_envelope(message: &AFPMessage, _now: DateTime<Utc>) -> QuoteSafetyEnvelope {
    let quote_validity = text_field(message, &["valid_until", "validUntil", "quote_valid_until"])
        .and_then(|value| parsed_time(Some(&value)));
    let date_hold = text_field(
        message,
        &[
            "date_hold_expires_at",
            "dateHoldExpiresAt",
            "vendor_date_hold_expires_at",
        ],
    )
    .and_then(|value| parsed_time(Some(&value)));
    let effective = match (quote_validity, date_hold) {
        (Some(quote), Some(hold)) if hold <= quote => Some((hold, "vendor_date_hold")),
        (Some(quote), Some(_)) => Some((quote, "vendor_quote_validity")),
        (Some(quote), None) => Some((quote, "vendor_quote_validity")),
        (None, Some(hold)) => Some((hold, "vendor_date_hold")),
        (None, None) => None,
    };
    let Some((deadline, source)) = effective else {
        return QuoteSafetyEnvelope {
            comfortable_resurface_at: None,
            latest_safe_decision_at: None,
            critical_at: None,
            external_deadline: None,
            deadline_source: None,
            quote_validity_deadline: None,
            date_hold_deadline: None,
        };
    };
    let critical = deadline - Duration::hours(24);
    let latest_safe = deadline - Duration::days(3);
    let comfortable = deadline - Duration::days(7);
    QuoteSafetyEnvelope {
        comfortable_resurface_at: Some(comfortable.to_rfc3339()),
        latest_safe_decision_at: Some(latest_safe.to_rfc3339()),
        critical_at: Some(critical.to_rfc3339()),
        external_deadline: Some(deadline.to_rfc3339()),
        deadline_source: Some(source),
        quote_validity_deadline: quote_validity.map(|value| value.to_rfc3339()),
        date_hold_deadline: date_hold.map(|value| value.to_rfc3339()),
    }
}

pub fn venue_quote_decision_content(
    message: &AFPMessage,
    now: DateTime<Utc>,
) -> VenueQuoteDecisionContent {
    let vendor = text_field(
        message,
        &["vendor_name", "vendorName", "vendor_id", "vendorId"],
    )
    .unwrap_or_else(|| "this venue".to_string());
    let event_date = text_field(
        message,
        &["event_date", "eventDate", "wedding_date", "weddingDate"],
    )
    .unwrap_or_else(|| "your wedding date".to_string());
    let hold = text_field(
        message,
        &[
            "date_hold_expires_at",
            "dateHoldExpiresAt",
            "vendor_date_hold_expires_at",
        ],
    )
    .and_then(|value| parsed_time(Some(&value)));
    let hold_days = hold.map(|value| (value - now).num_days());
    let attachment_status =
        text_field(message, &["attachment_text_status", "attachmentTextStatus"]);
    let booking_status = text_field(message, &["booking_status", "bookingStatus"])
        .unwrap_or_else(|| "open".to_string())
        .to_ascii_lowercase();
    let unreadable = attachment_status.as_deref() == Some("linked_unverified");
    let state = if unreadable {
        "unreadable_quote"
    } else if booking_status == "booked" {
        "booked"
    } else if matches!(booking_status.as_str(), "chosen" | "selected" | "preferred") {
        "chosen"
    } else if hold_days.is_some_and(|days| days < 0) {
        "hold_lapsed"
    } else if hold_days.is_some_and(|days| days <= 7) {
        "hold_expiring"
    } else if number_field(message, &["budget_delta_amount", "budgetDeltaAmount"])
        .is_some_and(|amount| amount > 0.0)
    {
        "over_budget"
    } else {
        "no_deadline"
    };
    let question = match state {
        "booked" => format!("What should be confirmed next for {vendor}?"),
        "chosen" => format!("Confirm {vendor} as your venue for {event_date}?"),
        _ => format!("Hold {vendor} for {event_date}?"),
    };
    let (heading, primary_action_label, one_thing_to_confirm) = match state {
        "unreadable_quote" => (
            format!("{vendor}'s quote needs unlocking"),
            "Open the original quote",
            "The quote amount, inclusions and any stated date-hold deadline.",
        ),
        "over_budget" => (
            format!("{vendor} is above the saved allowance"),
            "Compare the budget trade-off",
            "Whether the quoted scope justifies the budget difference.",
        ),
        "hold_expiring" => (
            format!("{vendor}'s date hold is expiring"),
            "Review the date hold",
            "Whether to ask the venue to keep holding the date; sending still needs approval.",
        ),
        "hold_lapsed" => (
            format!("{vendor}'s stated date hold has lapsed"),
            "Check the date again",
            "Whether the wedding date is still available.",
        ),
        "chosen" => (
            format!("{vendor} is your saved preference"),
            "Confirm our venue choice",
            "Whether this preference is ready to become the couple's confirmed choice.",
        ),
        "booked" => (
            format!("{vendor} is recorded as booked"),
            "Add booking details",
            "The contract, deposit, payment dates and run-sheet details.",
        ),
        _ => (
            format!("No date-hold deadline is stated for {vendor}"),
            "Ask about a date hold",
            "Whether the venue can hold the date, and until when.",
        ),
    };
    VenueQuoteDecisionContent {
        state,
        question,
        heading,
        primary_action_label,
        one_thing_to_confirm,
    }
}

fn bounded_score(value: Option<f64>, max: u8, divisor: f64) -> u8 {
    value
        .map(|value| (value.abs() / divisor).ceil().clamp(0.0, max as f64) as u8)
        .unwrap_or(0)
}

pub fn quote_priority_signals(
    message: &AFPMessage,
    envelope: &QuoteSafetyEnvelope,
    now: DateTime<Utc>,
) -> QuotePrioritySignals {
    let quote_validity_deadline_pressure = envelope
        .external_deadline
        .as_deref()
        .and_then(|value| parsed_time(Some(value)))
        .map(|deadline| match (deadline - now).num_hours() {
            ..=24 => 25,
            25..=72 => 20,
            73..=168 => 12,
            _ => 5,
        })
        .unwrap_or(0);
    let alternative_recovery_time =
        if bool_field(message, &["limited_availability", "limitedAvailability"]) {
            15
        } else {
            8
        };
    let dependency_impact = if bool_field(message, &["blocks_dependants", "blocksDependants"]) {
        15
    } else {
        5
    };
    let financial_exposure = bounded_score(
        number_field(
            message,
            &["budget_delta_amount", "budgetDeltaAmount", "amount"],
        ),
        20,
        1_000.0,
    );
    let reversibility = if bool_field(message, &["non_refundable", "nonRefundable"]) {
        10
    } else {
        4
    };
    let category_priority = number_field(message, &["category_priority", "categoryPriority"])
        .map(|value| value.clamp(0.0, 10.0) as u8)
        .unwrap_or(5);
    let material_change_magnitude = number_field(
        message,
        &["material_change_magnitude", "materialChangeMagnitude"],
    )
    .map(|value| value.clamp(0.0, 5.0) as u8)
    .unwrap_or_else(|| {
        if text_field(message, &["supersedes_quote_id"]).is_some() {
            5
        } else {
            0
        }
    });
    let total = quote_validity_deadline_pressure
        + alternative_recovery_time
        + dependency_impact
        + financial_exposure
        + reversibility
        + category_priority
        + material_change_magnitude;
    QuotePrioritySignals {
        quote_validity_deadline_pressure,
        alternative_recovery_time,
        dependency_impact,
        financial_exposure,
        reversibility,
        category_priority,
        material_change_magnitude,
        total,
    }
}

fn verification_for_quote(
    message: &AFPMessage,
    decision_id: &str,
) -> crate::wedding_vendor_decision_patterns::PatternVerification {
    let vendor = text_field(
        message,
        &["vendor_name", "vendorName", "vendor_id", "vendorId"],
    );
    let mut present_inputs = BTreeSet::from([
        "decision_id".to_string(),
        "quote_message_id".to_string(),
        "quote_thread_id".to_string(),
    ]);
    if vendor.is_some() {
        present_inputs.insert("vendor_identity".to_string());
    }
    let mut optional_gaps = BTreeSet::new();
    for (field_name, aliases) in [
        ("amount", &["amount", "quote_amount"] as &[_]),
        ("currency", &["currency", "quote_currency"] as &[_]),
        ("scope", &["inclusions", "scope"] as &[_]),
        ("valid_until", &["valid_until", "validUntil"] as &[_]),
        (
            "budget_context",
            &["budget_delta_amount", "budgetDeltaAmount"] as &[_],
        ),
    ] {
        if field(message, aliases).is_none() {
            optional_gaps.insert(field_name.to_string());
        }
    }
    let _ = decision_id;
    verify_pattern(PatternVerificationInput {
        pattern_id: VENDOR_QUOTE_RESPONSE_PATTERN_ID.to_string(),
        pattern_version: WEDDING_PATTERN_VERSION,
        situation_type: if text_field(message, &["supersedes_quote_id", "supersedesQuoteId"])
            .is_some()
        {
            "vendor_quote_materially_changed".to_string()
        } else {
            "vendor_quote_received".to_string()
        },
        present_inputs,
        present_evidence: BTreeSet::from(["source_quote".to_string(), "vendor_thread".to_string()]),
        allowed_actions: QUOTE_ACTIONS
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        execution_contracts: BTreeSet::from(["wedding.vendor_quote_reply@1".to_string()]),
        stale_evidence: string_set_field(message, &["stale_evidence", "staleEvidence"]),
        conflicting_evidence: string_set_field(
            message,
            &["conflicting_evidence", "conflictingEvidence"],
        ),
        optional_gaps,
    })
}

fn base_message(id: String, message: &AFPMessage, now: DateTime<Utc>) -> AFPMessage {
    AFPMessage {
        protocol: "afp/1.0".to_string(),
        id,
        thread_id: message.thread_id.clone(),
        parent_id: Some(message.id.clone()),
        from: "system://wedding-planning".to_string(),
        to: vec![
            "agent://decision-queue".to_string(),
            "agent://wedding-planning".to_string(),
        ],
        timestamp: now.to_rfc3339(),
        r#type: String::new(),
        kind: None,
        supertags: vec![],
        subtype: None,
        content: Value::Null,
        metadata: None,
        signature: String::new(),
        encryption: None,
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    }
}

fn diagnostic_message(
    source: &AFPMessage,
    decision_id: &str,
    verification: &crate::wedding_vendor_decision_patterns::PatternVerification,
    now: DateTime<Utc>,
) -> AFPMessage {
    let mut message = base_message(format!("{decision_id}:pattern-blocked:v1"), source, now);
    message.r#type = "projection_diagnostic".to_string();
    message.kind = Some("wedding_vendor_decision_pattern_blocked".to_string());
    message.subtype = message.kind.clone();
    message.supertags = vec!["wedding".to_string(), "decision:blocked".to_string()];
    message.content = json!({
        "decision_id": decision_id,
        "source_ref": source.id,
        "verification": verification,
        "repair_policy": "append corrected evidence or a successor quote; do not mutate the source event",
    });
    message.metadata = Some(json!({
        "origin": "wedding_quote_event_projector",
        "idempotency_key": message.id,
        "pattern_id": VENDOR_QUOTE_RESPONSE_PATTERN_ID,
        "pattern_version": WEDDING_PATTERN_VERSION,
        "projection_status": "blocked",
    }));
    message.references = vec![json!({
        "type": "wedding_vendor_quote",
        "target": source.id,
        "label": "Blocked source quote"
    })];
    message
}

fn superseded_message(
    source: &AFPMessage,
    wedding_plan_id: Option<&str>,
    superseded_quote_id: &str,
    now: DateTime<Utc>,
) -> AFPMessage {
    let old_decision_id = quote_decision_id(wedding_plan_id, superseded_quote_id);
    let mut message = base_message(
        format!(
            "{old_decision_id}:superseded-by:{}:v1",
            safe_label(&source.id, "quote")
        ),
        source,
        now,
    );
    message.r#type = "decision_result".to_string();
    message.kind = Some("wedding_vendor_quote_decision_superseded".to_string());
    message.subtype = Some("wedding_vendor_quote_superseded".to_string());
    message.supertags = vec!["wedding".to_string(), "decision:resolved".to_string()];
    message.content = json!({
        "decision_id": old_decision_id,
        "resolution": "superseded",
        "active": false,
        "superseded_by_quote_id": source.id,
    });
    message.metadata = Some(json!({
        "origin": "wedding_quote_event_projector",
        "idempotency_key": message.id,
        "pattern_id": VENDOR_QUOTE_RESPONSE_PATTERN_ID,
        "pattern_version": WEDDING_PATTERN_VERSION,
        "lifecycle": "superseded",
    }));
    message.references = vec![
        json!({"type": "superseded_quote", "target": superseded_quote_id}),
        json!({"type": "successor_quote", "target": source.id}),
    ];
    message
}

pub fn project_quote_event(source: &AFPMessage, now: DateTime<Utc>) -> QuoteProjectionBatch {
    if !is_wedding_vendor_quote_event(source)
        || source.id.trim().is_empty()
        || source.thread_id.trim().is_empty()
    {
        return QuoteProjectionBatch::default();
    }
    let wedding_plan_id = text_field(source, &["wedding_plan_id", "weddingPlanId"]);
    let decision_id = quote_decision_id(wedding_plan_id.as_deref(), &source.id);
    let verification = verification_for_quote(source, &decision_id);
    if !verification.outcome.allows_projection() {
        return QuoteProjectionBatch {
            messages: vec![diagnostic_message(source, &decision_id, &verification, now)],
            verification_outcome: Some(verification.outcome),
        };
    }

    let envelope = quote_safety_envelope(source, now);
    let priority = quote_priority_signals(source, &envelope, now);
    let venue_decision = venue_quote_decision_content(source, now);
    let watcher_caught_kind = match venue_decision.state {
        "hold_expiring" => Some("expiring_hold"),
        "over_budget" => Some("over_budget_quote"),
        _ => None,
    };
    let vendor_name = text_field(
        source,
        &["vendor_name", "vendorName", "vendor_id", "vendorId"],
    )
    .unwrap_or_else(|| "Vendor".to_string());
    let situation_type =
        if text_field(source, &["supersedes_quote_id", "supersedesQuoteId"]).is_some() {
            "vendor_quote_materially_changed"
        } else {
            "vendor_quote_received"
        };
    let idempotency_key = format!("{decision_id}:active:v1");
    let mut decision = base_message(idempotency_key.clone(), source, now);
    decision.r#type = "decision_request".to_string();
    decision.kind = Some("wedding_vendor_quote_decision".to_string());
    decision.subtype = decision.kind.clone();
    decision.supertags = vec![
        "wedding".to_string(),
        "wedding_vendor_quote".to_string(),
        "decisionos".to_string(),
        "decision:active".to_string(),
    ];
    decision.content = json!({
        "decision_id": decision_id,
        "title": format!("{vendor_name} quote decision"),
        "source_refs": [source.id],
        "allowed_actions": QUOTE_ACTIONS,
        "approval_required": true,
        "execution_contract": "wedding.vendor_quote_reply@1",
        "open_intent": {
            "kind": "open_wedding_vendor_quote",
            "thread_id": source.thread_id,
            "quote_message_id": source.id,
        },
        "evidence": {
            "vendor_identity": vendor_name,
            "quote_source_ref": source.id,
            "unknown_fields": verification.optional_gaps,
        },
        "safety_envelope": envelope,
        "venue_decision": &venue_decision,
        "priority_signals": priority,
        "pattern_verification": verification,
    });
    decision.metadata = Some(json!({
        "origin": "wedding_quote_event_projector",
        "projection": "wedding_quote_to_decisionos",
        "decision_id": decision_id,
        "idempotency_key": idempotency_key,
        "pattern_id": VENDOR_QUOTE_RESPONSE_PATTERN_ID,
        "pattern_version": WEDDING_PATTERN_VERSION,
        "situation_type": situation_type,
        "projection_recipe": "wedding.vendor_quote_response.card@1",
        "verification_outcome": verification.outcome,
        "wedding_plan_id": wedding_plan_id,
        "quote_message_id": source.id,
        "quote_thread_id": source.thread_id,
        "venue_decision_state": venue_decision.state,
        "vendor_date_hold_expires_at": text_field(source, &["date_hold_expires_at", "dateHoldExpiresAt", "vendor_date_hold_expires_at"]),
        "quote_valid_until": text_field(source, &["valid_until", "validUntil", "quote_valid_until"]),
        "watcher_caught_kind": watcher_caught_kind,
        "watcher_caught_at": watcher_caught_kind.map(|_| now.to_rfc3339()),
        "lifecycle": "unresolved",
        "privacy_scope": "source_refs_and_bounded_decision_metadata",
    }));
    decision.views = vec![json!({
        "format": "a2ui",
        "content": {
            "kind": "wedding_vendor_quote_decision",
            "title": format!("{vendor_name} quote decision"),
            "decision_id": decision_id,
        }
    })];
    decision.references = vec![json!({
        "type": "wedding_vendor_quote",
        "target": source.id,
        "label": "Wedding quote source"
    })];

    let mut messages = vec![];
    if let Some(superseded_quote_id) =
        text_field(source, &["supersedes_quote_id", "supersedesQuoteId"])
    {
        messages.push(superseded_message(
            source,
            wedding_plan_id.as_deref(),
            &superseded_quote_id,
            now,
        ));
    }
    messages.push(decision);
    QuoteProjectionBatch {
        messages,
        verification_outcome: Some(verification.outcome),
    }
}

pub fn due_deferral_resurface(
    deferral: &AFPMessage,
    original_decision: &AFPMessage,
    now: DateTime<Utc>,
) -> Option<AFPMessage> {
    if !message_tokens(deferral).contains("wedding_decision_deferral") {
        return None;
    }
    let due_at = text_field(deferral, &["deferred_until_at", "deferredUntilAt"])
        .or_else(|| text_field(deferral, &["stale_after_at", "staleAfterAt"]))
        .and_then(|value| parsed_time(Some(&value)))?;
    if due_at > now {
        return None;
    }
    let decision_id = text_field(deferral, &["decision_id", "focus_item_id", "focusItemId"])
        .or_else(|| clean(original_decision.content.get("decision_id")))?;
    let mut message = base_message(
        format!(
            "{decision_id}:resurface:{}:v1",
            safe_label(&deferral.id, "deferral")
        ),
        original_decision,
        now,
    );
    message.parent_id = Some(deferral.id.clone());
    message.r#type = "decision_request".to_string();
    message.kind = Some("wedding_vendor_quote_decision_resurfaced".to_string());
    message.subtype = message.kind.clone();
    message.supertags = vec![
        "wedding".to_string(),
        "decision:active".to_string(),
        "decision:resurfaced".to_string(),
    ];
    message.content = original_decision.content.clone();
    if let Some(content) = message.content.as_object_mut() {
        content.insert(
            "resurfaced_from_deferral_id".to_string(),
            json!(deferral.id),
        );
        content.insert(
            "resurface_reason".to_string(),
            json!("scheduled_date_reached"),
        );
    }
    message.metadata = Some(json!({
        "origin": "wedding_quote_resurface_watcher",
        "idempotency_key": message.id,
        "decision_id": decision_id,
        "pattern_id": VENDOR_QUOTE_RESPONSE_PATTERN_ID,
        "pattern_version": WEDDING_PATTERN_VERSION,
        "lifecycle": "resurfaced",
        "resurface_reason": "scheduled_date_reached",
        "source_deferral_id": deferral.id,
    }));
    message.references = vec![
        json!({"type": "decision_deferral", "target": deferral.id}),
        json!({"type": "decision_request", "target": original_decision.id}),
    ];
    Some(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quote() -> AFPMessage {
        AFPMessage {
            protocol: "afp/1.0".to_string(),
            id: "quote-1".to_string(),
            thread_id: "vendor-thread-1".to_string(),
            parent_id: None,
            from: "vendor://wedding".to_string(),
            to: vec!["agent://wedding-planning".to_string()],
            timestamp: "2026-10-06T00:00:00Z".to_string(),
            r#type: "ledger".to_string(),
            kind: Some("wedding_vendor_quote_received".to_string()),
            supertags: vec!["wedding_vendor_quote".to_string()],
            subtype: Some("wedding_vendor_quote_received".to_string()),
            content: json!({"quote": {"vendorName": "Harbour Studio", "amount": 8000, "currency": "AUD", "validUntil": "2026-10-20T00:00:00Z"}}),
            metadata: Some(json!({"wedding_plan_id": "plan-1"})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        }
    }

    #[test]
    fn quote_projection_is_pattern_verified_and_deterministic() {
        let now = parsed_time(Some("2026-10-06T00:00:00Z")).unwrap();
        let first = project_quote_event(&quote(), now);
        let second = project_quote_event(&quote(), now);
        assert_eq!(
            serde_json::to_value(&first.messages).unwrap(),
            serde_json::to_value(&second.messages).unwrap()
        );
        assert_eq!(first.messages.len(), 1);
        let decision = &first.messages[0];
        assert_eq!(decision.r#type, "decision_request");
        assert_eq!(
            decision.metadata.as_ref().unwrap()["verification_outcome"],
            "VALID_WITH_OPTIONAL_GAPS"
        );
        assert_eq!(
            decision.content["allowed_actions"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert_eq!(
            decision.content["safety_envelope"]["deadline_source"],
            "vendor_quote_validity"
        );
        assert_eq!(
            decision.content["venue_decision"]["question"],
            "Hold Harbour Studio for your wedding date?"
        );
        assert!(decision.content.get("quote").is_none());
    }

    #[test]
    fn expired_vendor_deadline_is_preserved_for_overdue_escalation() {
        let now = parsed_time(Some("2026-10-21T00:00:00Z")).unwrap();
        let envelope = quote_safety_envelope(&quote(), now);
        assert_eq!(envelope.deadline_source, Some("vendor_quote_validity"));
        assert_eq!(
            envelope.external_deadline.as_deref(),
            Some("2026-10-20T00:00:00+00:00")
        );
        assert_eq!(
            quote_priority_signals(&quote(), &envelope, now).quote_validity_deadline_pressure,
            25
        );
    }

    #[test]
    fn missing_deadline_never_creates_a_countdown_or_priority_pressure() {
        let now = parsed_time(Some("2026-10-06T00:00:00Z")).unwrap();
        let mut source = quote();
        source.content["quote"]
            .as_object_mut()
            .unwrap()
            .remove("validUntil");
        let envelope = quote_safety_envelope(&source, now);
        assert_eq!(envelope.deadline_source, None);
        assert_eq!(envelope.external_deadline, None);
        assert_eq!(
            quote_priority_signals(&source, &envelope, now).quote_validity_deadline_pressure,
            0
        );
        assert_eq!(
            venue_quote_decision_content(&source, now).state,
            "no_deadline"
        );
    }

    #[test]
    fn date_hold_is_separate_and_earlier_than_quote_validity() {
        let now = parsed_time(Some("2026-10-06T00:00:00Z")).unwrap();
        let mut source = quote();
        source.content["quote"]["dateHoldExpiresAt"] = json!("2026-10-10T00:00:00Z");
        source.content["quote"]["eventDate"] = json!("2027-11-20");
        let envelope = quote_safety_envelope(&source, now);
        assert_eq!(envelope.deadline_source, Some("vendor_date_hold"));
        assert_eq!(
            envelope.date_hold_deadline.as_deref(),
            Some("2026-10-10T00:00:00+00:00")
        );
        assert_eq!(
            envelope.quote_validity_deadline.as_deref(),
            Some("2026-10-20T00:00:00+00:00")
        );
        let decision = venue_quote_decision_content(&source, now);
        assert_eq!(decision.state, "hold_expiring");
        assert_eq!(decision.question, "Hold Harbour Studio for 2027-11-20?");
        let projected = project_quote_event(&source, now);
        assert_eq!(
            projected.messages[0].metadata.as_ref().unwrap()["watcher_caught_kind"],
            "expiring_hold"
        );
    }

    #[test]
    fn missing_vendor_identity_emits_diagnostic_not_decision_card() {
        let mut source = quote();
        source.content = json!({"quote": {"amount": 8000}});
        let batch = project_quote_event(&source, Utc::now());
        assert_eq!(batch.messages[0].r#type, "projection_diagnostic");
        assert_eq!(
            batch.verification_outcome,
            Some(PatternVerificationOutcome::BlockedMissingData)
        );
    }

    #[test]
    fn revised_quote_resolves_prior_decision_before_successor() {
        let mut source = quote();
        source.id = "quote-2".to_string();
        source.metadata.as_mut().unwrap()["supersedes_quote_id"] = json!("quote-1");
        let batch = project_quote_event(&source, Utc::now());
        assert_eq!(batch.messages.len(), 2);
        assert_eq!(batch.messages[0].r#type, "decision_result");
        assert_eq!(batch.messages[0].content["resolution"], "superseded");
        assert_eq!(batch.messages[1].r#type, "decision_request");
    }

    #[test]
    fn dated_deferral_resurfaces_once_with_deterministic_identity() {
        let now = parsed_time(Some("2026-10-10T00:00:00Z")).unwrap();
        let decision = project_quote_event(&quote(), now).messages.pop().unwrap();
        let mut deferral = quote();
        deferral.id = "deferral-1".to_string();
        deferral.kind = Some("wedding_decision_deferral".to_string());
        deferral.subtype = deferral.kind.clone();
        deferral.content = json!({
            "decision_id": decision.content["decision_id"],
            "deferred_until_at": "2026-10-09T00:00:00Z"
        });
        let first = due_deferral_resurface(&deferral, &decision, now).unwrap();
        let second = due_deferral_resurface(&deferral, &decision, now).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(first.content["resurface_reason"], "scheduled_date_reached");
    }
}
