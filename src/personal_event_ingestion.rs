use serde_json::{Map, Value, json};
use ulid::Ulid;

use crate::{
    background_watcher::build_watcher_alert_afp,
    db::UserConnectedCapabilityRecord,
    message::{
        AFP_KIND_RICH_NOTE, AFP_TYPE_LEDGER, AfpPassiveEventContent, AfpWatcherAlertContent,
    },
    personal_automation_planner::{
        PersonalAutomationEvent, PersonalAutomationPlannerDecision, PersonalEventFamily,
        PersonalEventSeverity, PlannerActionClass, plan_background_automation,
    },
    prepared_draft_packet::{
        PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY, PREPARED_DRAFT_CLASS_DECISION_MEMO,
        PreparedDraftArtifact, build_prepared_draft_ledger_afp,
    },
};

pub fn canonical_event_from_passive_event(
    owner_user_id: &str,
    source_ref: &str,
    event: &AfpPassiveEventContent,
    event_subtype: &str,
) -> Option<PersonalAutomationEvent> {
    let normalized_subtype = event_subtype.trim().to_ascii_lowercase();
    match normalized_subtype.as_str() {
        "email_incoming" | "email_received" => {
            canonical_mail_event_from_passive_event(owner_user_id, source_ref, event)
        }
        "renewal_due" | "subscription_renewal_due" | "insurance_renewal" => {
            canonical_renewal_event_from_passive_event(owner_user_id, source_ref, event)
        }
        "bill_due" | "utility_bill_due" | "invoice_due" => {
            canonical_bill_event_from_passive_event(owner_user_id, source_ref, event)
        }
        "form_due" | "school_form_due" | "admin_form_due" => {
            canonical_form_event_from_passive_event(owner_user_id, source_ref, event)
        }
        _ => None,
    }
}

pub fn plan_passive_event_background_automation(
    owner_user_id: &str,
    source_ref: &str,
    event: &AfpPassiveEventContent,
    event_subtype: &str,
    connected_capabilities: &[UserConnectedCapabilityRecord],
    priority_rules: &Value,
) -> Option<PersonalAutomationPlannerDecision> {
    let canonical =
        canonical_event_from_passive_event(owner_user_id, source_ref, event, event_subtype)?;
    Some(plan_background_automation(
        &canonical,
        connected_capabilities,
        priority_rules,
    ))
}

pub fn plan_passive_event_background_artifact(
    owner_user_id: &str,
    thread_id: &str,
    source_ref: &str,
    event: &AfpPassiveEventContent,
    event_subtype: &str,
    connected_capabilities: &[UserConnectedCapabilityRecord],
    priority_rules: &Value,
) -> Option<Value> {
    let canonical =
        canonical_event_from_passive_event(owner_user_id, source_ref, event, event_subtype)?;
    let decision = plan_background_automation(&canonical, connected_capabilities, priority_rules);
    planner_decision_to_afp(
        owner_user_id,
        thread_id,
        &canonical,
        &decision,
        priority_rules,
    )
}

pub fn enrich_mail_passive_event_with_reply_policy(
    event: &AfpPassiveEventContent,
    reply_policy_metadata: Option<&Value>,
) -> AfpPassiveEventContent {
    let Some(policy_object) = reply_policy_metadata.and_then(Value::as_object) else {
        return event.clone();
    };

    let mut enriched = event.clone();
    merge_metadata_fields(&mut enriched.metadata, policy_object);

    if let Some(payload) = enriched.payload.as_mut().and_then(Value::as_object_mut) {
        for (key, value) in policy_object {
            payload.insert(key.clone(), value.clone());
        }
    }

    enriched
}

pub fn enrich_mail_passive_event_with_recent_contact_context(
    event: &AfpPassiveEventContent,
    recent_contact_context: &[Value],
) -> AfpPassiveEventContent {
    if recent_contact_context.is_empty() {
        return event.clone();
    }

    let mut enriched = event.clone();
    let context_value = Value::Array(recent_contact_context.to_vec());
    if let Some(metadata) = enriched.metadata.as_object_mut() {
        metadata.insert("recent_contact_context".to_string(), context_value.clone());
    }

    if let Some(payload) = enriched.payload.as_mut().and_then(Value::as_object_mut) {
        payload.insert("recent_contact_context".to_string(), context_value);
    }

    enriched
}

pub fn enrich_mail_passive_event_with_recent_conversation_context(
    event: &AfpPassiveEventContent,
    recent_conversation_context: &[Value],
) -> AfpPassiveEventContent {
    if recent_conversation_context.is_empty() {
        return event.clone();
    }

    let mut enriched = event.clone();
    let context_value = Value::Array(recent_conversation_context.to_vec());
    if let Some(metadata) = enriched.metadata.as_object_mut() {
        metadata.insert(
            "recent_conversation_context".to_string(),
            context_value.clone(),
        );
    }

    if let Some(payload) = enriched.payload.as_mut().and_then(Value::as_object_mut) {
        payload.insert("recent_conversation_context".to_string(), context_value);
    }

    enriched
}

pub fn enrich_mail_passive_event_with_recent_thread_context(
    event: &AfpPassiveEventContent,
    recent_thread_context: &[Value],
) -> AfpPassiveEventContent {
    if recent_thread_context.is_empty() {
        return event.clone();
    }

    let mut enriched = event.clone();
    let context_value = Value::Array(recent_thread_context.to_vec());
    if let Some(metadata) = enriched.metadata.as_object_mut() {
        metadata.insert("recent_thread_context".to_string(), context_value.clone());
    }

    if let Some(payload) = enriched.payload.as_mut().and_then(Value::as_object_mut) {
        payload.insert("recent_thread_context".to_string(), context_value);
    }

    enriched
}

pub fn planner_decision_to_afp(
    owner_user_id: &str,
    thread_id: &str,
    event: &PersonalAutomationEvent,
    decision: &PersonalAutomationPlannerDecision,
    priority_rules: &Value,
) -> Option<Value> {
    match decision.action_class {
        PlannerActionClass::Ignore => None,
        PlannerActionClass::PrepareDraft => match event.event_family {
            PersonalEventFamily::RenewalDue => Some(renewal_review_afp_from_event(
                owner_user_id,
                thread_id,
                event,
                decision,
            )),
            PersonalEventFamily::BillDue => Some(bill_review_afp_from_event(
                owner_user_id,
                thread_id,
                event,
                decision,
            )),
            PersonalEventFamily::FormDue => Some(form_review_afp_from_event(
                owner_user_id,
                thread_id,
                event,
                decision,
            )),
            _ => Some(prepared_draft_afp_from_event(
                owner_user_id,
                thread_id,
                event,
                decision,
                priority_rules,
            )),
        },
        PlannerActionClass::RequestApproval => {
            let subject = event
                .payload
                .get("subject")
                .and_then(Value::as_str)
                .unwrap_or("Approval required");
            let category = match event.event_family {
                PersonalEventFamily::BillDue => "billing",
                PersonalEventFamily::FormDue => "forms",
                _ => "communications",
            };
            let content = AfpWatcherAlertContent {
                heuristic_id: "personal_automation.request_approval".to_string(),
                message: format!("Approval required for: {subject}"),
                suggestion: Some(decision.rationale.clone()),
                confidence: canonical_event_confidence(event),
                severity: "important".to_string(),
                category: category.to_string(),
                entity_id: None,
                source_event_id: Some(event.source_ref.clone()),
            };
            Some(build_watcher_alert_afp(
                owner_user_id,
                thread_id,
                &content,
                &["Review now", "Open thread", "Dismiss"],
            ))
        }
    }
}

fn canonical_bill_event_from_passive_event(
    owner_user_id: &str,
    source_ref: &str,
    event: &AfpPassiveEventContent,
) -> Option<PersonalAutomationEvent> {
    let biller_name = event
        .metadata
        .get("biller_name")
        .or_else(|| event.metadata.get("service_name"))
        .or_else(|| event.metadata.get("subject"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Bill review");
    let provider = event
        .metadata
        .get("provider")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("manual")
        .to_string();
    let account_ref = event
        .metadata
        .get("account_ref")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let days_until_due = event.metadata.get("days_until_due").and_then(Value::as_i64);
    let amount_usd = event.metadata.get("amount_usd").and_then(Value::as_f64);
    let severity = if days_until_due.map(|value| value <= 0).unwrap_or(false) {
        PersonalEventSeverity::High
    } else if days_until_due.map(|value| value <= 5).unwrap_or(false) {
        PersonalEventSeverity::Medium
    } else {
        PersonalEventSeverity::Low
    };

    Some(PersonalAutomationEvent {
        owner_user_id: owner_user_id.to_string(),
        event_family: PersonalEventFamily::BillDue,
        provider,
        account_ref,
        source_ref: source_ref.to_string(),
        severity,
        payload: json!({
            "biller_name": biller_name,
            "subject": biller_name,
            "snippet": event.metadata.get("snippet").cloned().unwrap_or(Value::Null),
            "days_until_due": days_until_due,
            "due_date": event.metadata.get("due_date").cloned().unwrap_or(Value::Null),
            "amount_usd": amount_usd,
            "currency": event.metadata.get("currency").cloned().unwrap_or(Value::Null),
            "bill_kind": event.metadata.get("bill_kind").cloned().unwrap_or(Value::Null),
            "autopay_enabled": event.metadata.get("autopay_enabled").cloned().unwrap_or(Value::Null),
            "provider_label": event.metadata.get("provider_label").cloned().unwrap_or(Value::Null),
        }),
    })
}

fn canonical_renewal_event_from_passive_event(
    owner_user_id: &str,
    source_ref: &str,
    event: &AfpPassiveEventContent,
) -> Option<PersonalAutomationEvent> {
    let service_name = event
        .metadata
        .get("service_name")
        .or_else(|| event.metadata.get("subject"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Renewal review");
    let provider = event
        .metadata
        .get("provider")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("manual")
        .to_string();
    let account_ref = event
        .metadata
        .get("account_ref")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let days_until_renewal = event
        .metadata
        .get("days_until_renewal")
        .and_then(Value::as_i64);
    let severity = if days_until_renewal.map(|value| value <= 7).unwrap_or(false) {
        PersonalEventSeverity::High
    } else if days_until_renewal.map(|value| value <= 21).unwrap_or(false) {
        PersonalEventSeverity::Medium
    } else {
        PersonalEventSeverity::Low
    };

    Some(PersonalAutomationEvent {
        owner_user_id: owner_user_id.to_string(),
        event_family: PersonalEventFamily::RenewalDue,
        provider,
        account_ref,
        source_ref: source_ref.to_string(),
        severity,
        payload: json!({
            "service_name": service_name,
            "subject": service_name,
            "snippet": event.metadata.get("snippet").cloned().unwrap_or(Value::Null),
            "days_until_renewal": days_until_renewal,
            "renewal_date": event.metadata.get("renewal_date").cloned().unwrap_or(Value::Null),
            "current_cost_usd": event.metadata.get("current_cost_usd").cloned().unwrap_or(Value::Null),
            "alternative_cost_usd": event.metadata.get("alternative_cost_usd").cloned().unwrap_or(Value::Null),
            "renewal_kind": event.metadata.get("renewal_kind").cloned().unwrap_or(Value::Null),
            "provider_label": event.metadata.get("provider_label").cloned().unwrap_or(Value::Null),
        }),
    })
}

fn canonical_form_event_from_passive_event(
    owner_user_id: &str,
    source_ref: &str,
    event: &AfpPassiveEventContent,
) -> Option<PersonalAutomationEvent> {
    let form_name = event
        .metadata
        .get("form_name")
        .or_else(|| event.metadata.get("subject"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Form review");
    let provider = event
        .metadata
        .get("provider")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("manual")
        .to_string();
    let account_ref = event
        .metadata
        .get("account_ref")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let days_until_due = event.metadata.get("days_until_due").and_then(Value::as_i64);
    let severity = if days_until_due.map(|value| value <= 2).unwrap_or(false) {
        PersonalEventSeverity::High
    } else if days_until_due.map(|value| value <= 7).unwrap_or(false) {
        PersonalEventSeverity::Medium
    } else {
        PersonalEventSeverity::Low
    };

    Some(PersonalAutomationEvent {
        owner_user_id: owner_user_id.to_string(),
        event_family: PersonalEventFamily::FormDue,
        provider,
        account_ref,
        source_ref: source_ref.to_string(),
        severity,
        payload: json!({
            "form_name": form_name,
            "subject": form_name,
            "snippet": event.metadata.get("snippet").cloned().unwrap_or(Value::Null),
            "days_until_due": days_until_due,
            "due_date": event.metadata.get("due_date").cloned().unwrap_or(Value::Null),
            "form_kind": event.metadata.get("form_kind").cloned().unwrap_or(Value::Null),
            "form_owner": event.metadata.get("form_owner").cloned().unwrap_or(Value::Null),
            "submission_mode": event.metadata.get("submission_mode").cloned().unwrap_or(Value::Null),
            "requires_signature": event.metadata.get("requires_signature").cloned().unwrap_or(Value::Bool(false)),
            "sensitive_form": event.metadata.get("sensitive_form").cloned().unwrap_or(Value::Bool(false)),
            "provider_label": event.metadata.get("provider_label").cloned().unwrap_or(Value::Null),
        }),
    })
}

fn renewal_review_afp_from_event(
    owner_user_id: &str,
    thread_id: &str,
    event: &PersonalAutomationEvent,
    decision: &PersonalAutomationPlannerDecision,
) -> Value {
    let service_name = event
        .payload
        .get("service_name")
        .and_then(Value::as_str)
        .unwrap_or("Renewal review");
    let renewal_kind = event
        .payload
        .get("renewal_kind")
        .and_then(Value::as_str)
        .unwrap_or("subscription");
    let days_until_renewal = event
        .payload
        .get("days_until_renewal")
        .and_then(Value::as_i64);
    let current_cost = event
        .payload
        .get("current_cost_usd")
        .and_then(Value::as_f64);
    let alternative_cost = event
        .payload
        .get("alternative_cost_usd")
        .and_then(Value::as_f64);
    let summary = renewal_summary_line(service_name, renewal_kind, days_until_renewal);
    let body = renewal_review_body(
        service_name,
        renewal_kind,
        days_until_renewal,
        current_cost,
        alternative_cost,
    );
    let draft = PreparedDraftArtifact {
        draft_id: format!("draft:renewal-review:{}", Ulid::new()),
        draft_class: PREPARED_DRAFT_CLASS_DECISION_MEMO.to_string(),
        label: format!("Review renewal for {service_name}"),
        channel: event.provider.clone(),
        summary: summary.clone(),
        body,
        confidence: draft_confidence_label(canonical_event_confidence(event)).to_string(),
        readiness: "ready_now".to_string(),
        response_due_hint: renewal_due_hint(days_until_renewal).to_string(),
        approval_required_to_send: false,
        source_refs: vec![event.source_ref.clone()],
        source_count: 1,
        storage_type: "private".to_string(),
        storage_kind: Some("afp_message".to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: Some(decision.rationale.clone()),
        suggested_next_action: "Review renewal options".to_string(),
        object_refs: Vec::new(),
        memory_space: None,
        author_mask: Some("omnyid-personal-automation".to_string()),
        author_type: Some("system".to_string()),
        author_id: Some("personal_automation_planner".to_string()),
        is_human_authored: Some(false),
        human_only: Some(false),
    };

    let mut afp =
        build_prepared_draft_ledger_afp(owner_user_id, thread_id, Some(&event.source_ref), &draft);
    afp["type"] = Value::String(AFP_TYPE_LEDGER.to_string());
    afp["kind"] = Value::String(AFP_KIND_RICH_NOTE.to_string());
    afp["subtype"] = Value::String("prepared_draft".to_string());
    afp["metadata"]["searchable_metadata"]["prepared_draft_origin"] =
        Value::String("personal_automation".to_string());
    afp["metadata"]["searchable_metadata"]["prepared_draft_domain"] =
        Value::String("renewal_review".to_string());
    afp["metadata"]["searchable_metadata"]["renewal_kind"] =
        Value::String(renewal_kind.to_string());
    afp["metadata"]["searchable_metadata"]["source_message_id"] =
        Value::String(event.source_ref.clone());
    if let Some(days) = days_until_renewal {
        afp["metadata"]["searchable_metadata"]["days_until_renewal"] = Value::from(days);
    }
    if let Some(cost) = current_cost {
        afp["metadata"]["searchable_metadata"]["current_cost_usd"] = json!(cost);
    }
    if let Some(cost) = alternative_cost {
        afp["metadata"]["searchable_metadata"]["alternative_cost_usd"] = json!(cost);
    }
    afp
}

fn form_review_afp_from_event(
    owner_user_id: &str,
    thread_id: &str,
    event: &PersonalAutomationEvent,
    decision: &PersonalAutomationPlannerDecision,
) -> Value {
    let form_name = event
        .payload
        .get("form_name")
        .and_then(Value::as_str)
        .unwrap_or("Form review");
    let form_kind = event
        .payload
        .get("form_kind")
        .and_then(Value::as_str)
        .unwrap_or("form");
    let days_until_due = event.payload.get("days_until_due").and_then(Value::as_i64);
    let submission_mode = event.payload.get("submission_mode").and_then(Value::as_str);
    let form_owner = event.payload.get("form_owner").and_then(Value::as_str);
    let requires_signature = event
        .payload
        .get("requires_signature")
        .and_then(Value::as_bool);
    let sensitive_form = event.payload.get("sensitive_form").and_then(Value::as_bool);
    let summary = form_summary_line(form_name, form_kind, form_owner, days_until_due);
    let body = form_review_body(
        form_name,
        form_kind,
        form_owner,
        days_until_due,
        submission_mode,
    );
    let draft = PreparedDraftArtifact {
        draft_id: format!("draft:form-review:{}", Ulid::new()),
        draft_class: PREPARED_DRAFT_CLASS_DECISION_MEMO.to_string(),
        label: format!("Review form for {form_name}"),
        channel: event.provider.clone(),
        summary: summary.clone(),
        body,
        confidence: draft_confidence_label(canonical_event_confidence(event)).to_string(),
        readiness: "ready_now".to_string(),
        response_due_hint: form_due_hint(days_until_due).to_string(),
        approval_required_to_send: false,
        source_refs: vec![event.source_ref.clone()],
        source_count: 1,
        storage_type: "private".to_string(),
        storage_kind: Some("afp_message".to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: Some(decision.rationale.clone()),
        suggested_next_action: "Review the form and decide whether it can be completed now"
            .to_string(),
        object_refs: Vec::new(),
        memory_space: None,
        author_mask: Some("omnyid-personal-automation".to_string()),
        author_type: Some("system".to_string()),
        author_id: Some("personal_automation_planner".to_string()),
        is_human_authored: Some(false),
        human_only: Some(false),
    };

    let mut afp =
        build_prepared_draft_ledger_afp(owner_user_id, thread_id, Some(&event.source_ref), &draft);
    afp["type"] = Value::String(AFP_TYPE_LEDGER.to_string());
    afp["kind"] = Value::String(AFP_KIND_RICH_NOTE.to_string());
    afp["subtype"] = Value::String("prepared_draft".to_string());
    afp["metadata"]["searchable_metadata"]["prepared_draft_origin"] =
        Value::String("personal_automation".to_string());
    afp["metadata"]["searchable_metadata"]["prepared_draft_domain"] =
        Value::String("form_review".to_string());
    afp["metadata"]["searchable_metadata"]["form_kind"] = Value::String(form_kind.to_string());
    afp["metadata"]["searchable_metadata"]["source_message_id"] =
        Value::String(event.source_ref.clone());
    if let Some(days) = days_until_due {
        afp["metadata"]["searchable_metadata"]["days_until_due"] = Value::from(days);
    }
    if let Some(mode) = submission_mode {
        afp["metadata"]["searchable_metadata"]["submission_mode"] = Value::String(mode.to_string());
    }
    if let Some(owner) = form_owner {
        afp["metadata"]["searchable_metadata"]["form_owner"] = Value::String(owner.to_string());
    }
    if let Some(value) = requires_signature {
        afp["metadata"]["searchable_metadata"]["requires_signature"] = Value::Bool(value);
    }
    if let Some(value) = sensitive_form {
        afp["metadata"]["searchable_metadata"]["sensitive_form"] = Value::Bool(value);
    }
    afp
}

fn bill_review_afp_from_event(
    owner_user_id: &str,
    thread_id: &str,
    event: &PersonalAutomationEvent,
    decision: &PersonalAutomationPlannerDecision,
) -> Value {
    let biller_name = event
        .payload
        .get("biller_name")
        .and_then(Value::as_str)
        .unwrap_or("Bill review");
    let bill_kind = event
        .payload
        .get("bill_kind")
        .and_then(Value::as_str)
        .unwrap_or("bill");
    let days_until_due = event.payload.get("days_until_due").and_then(Value::as_i64);
    let amount_usd = event.payload.get("amount_usd").and_then(Value::as_f64);
    let autopay_enabled = event
        .payload
        .get("autopay_enabled")
        .and_then(Value::as_bool);
    let summary = bill_summary_line(biller_name, bill_kind, days_until_due, amount_usd);
    let body = bill_review_body(
        biller_name,
        bill_kind,
        days_until_due,
        amount_usd,
        autopay_enabled,
    );
    let draft = PreparedDraftArtifact {
        draft_id: format!("draft:bill-review:{}", Ulid::new()),
        draft_class: PREPARED_DRAFT_CLASS_DECISION_MEMO.to_string(),
        label: format!("Review bill for {biller_name}"),
        channel: event.provider.clone(),
        summary: summary.clone(),
        body,
        confidence: draft_confidence_label(canonical_event_confidence(event)).to_string(),
        readiness: "ready_now".to_string(),
        response_due_hint: bill_due_hint(days_until_due).to_string(),
        approval_required_to_send: false,
        source_refs: vec![event.source_ref.clone()],
        source_count: 1,
        storage_type: "private".to_string(),
        storage_kind: Some("afp_message".to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: Some(decision.rationale.clone()),
        suggested_next_action:
            "Review the bill and decide whether it can be paid or needs intervention".to_string(),
        object_refs: Vec::new(),
        memory_space: None,
        author_mask: Some("omnyid-personal-automation".to_string()),
        author_type: Some("system".to_string()),
        author_id: Some("personal_automation_planner".to_string()),
        is_human_authored: Some(false),
        human_only: Some(false),
    };

    let mut afp =
        build_prepared_draft_ledger_afp(owner_user_id, thread_id, Some(&event.source_ref), &draft);
    afp["type"] = Value::String(AFP_TYPE_LEDGER.to_string());
    afp["kind"] = Value::String(AFP_KIND_RICH_NOTE.to_string());
    afp["subtype"] = Value::String("prepared_draft".to_string());
    afp["metadata"]["searchable_metadata"]["prepared_draft_origin"] =
        Value::String("personal_automation".to_string());
    afp["metadata"]["searchable_metadata"]["prepared_draft_domain"] =
        Value::String("bill_review".to_string());
    afp["metadata"]["searchable_metadata"]["bill_kind"] = Value::String(bill_kind.to_string());
    afp["metadata"]["searchable_metadata"]["source_message_id"] =
        Value::String(event.source_ref.clone());
    if let Some(days) = days_until_due {
        afp["metadata"]["searchable_metadata"]["days_until_due"] = Value::from(days);
    }
    if let Some(amount) = amount_usd {
        afp["metadata"]["searchable_metadata"]["amount_usd"] = json!(amount);
    }
    if let Some(autopay) = autopay_enabled {
        afp["metadata"]["searchable_metadata"]["autopay_enabled"] = Value::Bool(autopay);
    }
    afp
}

fn prepared_draft_afp_from_event(
    owner_user_id: &str,
    thread_id: &str,
    event: &PersonalAutomationEvent,
    decision: &PersonalAutomationPlannerDecision,
    priority_rules: &Value,
) -> Value {
    let subject = event
        .payload
        .get("subject")
        .and_then(Value::as_str)
        .unwrap_or("Reply suggested");
    let sender = event
        .payload
        .get("sender_label")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let snippet = event
        .payload
        .get("snippet")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let to_address = sender
        .split(',')
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(sender);
    let reply_subject = reply_subject(subject);
    let reply_context = build_reply_context(event, decision, sender, snippet, priority_rules);
    let draft = PreparedDraftArtifact {
        draft_id: format!("draft:personal-automation:{}", Ulid::new()),
        draft_class: PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY.to_string(),
        label: format!("Prepared reply to {subject}"),
        channel: event.provider.clone(),
        summary: decision.rationale.clone(),
        body: reply_context.body.clone(),
        confidence: draft_confidence_label(canonical_event_confidence(event)).to_string(),
        readiness: "approval_ready".to_string(),
        response_due_hint: reply_context.response_due_hint.clone(),
        approval_required_to_send: true,
        source_refs: vec![event.source_ref.clone()],
        source_count: 1,
        storage_type: "private".to_string(),
        storage_kind: Some("afp_message".to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: Some(reply_context.selection_reason.clone()),
        suggested_next_action: reply_context.suggested_next_action.clone(),
        object_refs: Vec::new(),
        memory_space: None,
        author_mask: Some("omnyid-personal-automation".to_string()),
        author_type: Some("system".to_string()),
        author_id: Some("personal_automation_planner".to_string()),
        is_human_authored: Some(false),
        human_only: Some(false),
    };

    let mut afp =
        build_prepared_draft_ledger_afp(owner_user_id, thread_id, Some(&event.source_ref), &draft);
    afp["type"] = Value::String(AFP_TYPE_LEDGER.to_string());
    afp["kind"] = Value::String(AFP_KIND_RICH_NOTE.to_string());
    afp["subtype"] = Value::String("prepared_draft".to_string());
    afp["content"]["delivery"] = json!({
        "provider": event.provider,
        "capability_id": decision.capability_id,
        "to": [to_address],
        "subject": reply_subject,
        "in_reply_to": event.source_ref,
        "references": [event.source_ref],
        "approval_required": true,
    });
    afp["metadata"]["searchable_metadata"]["prepared_draft_origin"] =
        Value::String("personal_automation".to_string());
    afp["metadata"]["searchable_metadata"]["source_message_id"] =
        Value::String(event.source_ref.clone());
    afp["metadata"]["searchable_metadata"]["delivery_provider"] =
        Value::String(event.provider.clone());
    afp["metadata"]["searchable_metadata"]["delivery_capability_id"] = decision
        .capability_id
        .as_ref()
        .map(|value| Value::String(value.clone()))
        .unwrap_or(Value::Null);
    afp["metadata"]["searchable_metadata"]["sender_group_names"] = Value::Array(
        reply_context
            .sender_group_names
            .iter()
            .cloned()
            .map(Value::String)
            .collect(),
    );
    afp["metadata"]["searchable_metadata"]["sender_auto_draft"] =
        Value::Bool(reply_context.sender_auto_draft);
    afp["metadata"]["searchable_metadata"]["sender_sla_hours"] = reply_context
        .sender_sla_hours
        .map(|value| Value::from(value as i64))
        .unwrap_or(Value::Null);
    afp["metadata"]["searchable_metadata"]["matched_communication_keywords"] = Value::Array(
        reply_context
            .matched_communication_keywords
            .iter()
            .cloned()
            .map(Value::String)
            .collect(),
    );
    afp
}

#[derive(Debug, Clone)]
struct ReplyContext {
    body: String,
    response_due_hint: String,
    selection_reason: String,
    suggested_next_action: String,
    sender_group_names: Vec<String>,
    sender_auto_draft: bool,
    sender_sla_hours: Option<i32>,
    matched_communication_keywords: Vec<String>,
}

fn build_reply_context(
    event: &PersonalAutomationEvent,
    decision: &PersonalAutomationPlannerDecision,
    sender: &str,
    snippet: &str,
    priority_rules: &Value,
) -> ReplyContext {
    let sender_group_names = event_string_array(event, "sender_group_names");
    let sender_auto_draft = event
        .payload
        .get("sender_auto_draft")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let sender_sla_hours = event
        .payload
        .get("sender_sla_hours")
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok());
    let matched_communication_keywords = matched_communication_keywords(event, priority_rules);
    let recent_contact_subjects = recent_contact_subjects(event);
    let due_hint = draft_due_hint(event, sender_sla_hours).to_string();
    let salutation = sender_salutation(sender);
    let reply_body_lines = compose_reply_body_lines(
        event,
        sender,
        snippet,
        &due_hint,
        sender_sla_hours,
        &matched_communication_keywords,
        &recent_contact_subjects,
    );
    let body = format!(
        "{salutation}\n\n{}\n\nBest,\nOmnyID Draft",
        reply_body_lines.join("\n\n")
    );

    let selection_reason = if sender_group_names.is_empty() {
        decision.rationale.clone()
    } else {
        format!(
            "{} Sender group context: {}.",
            decision.rationale,
            sender_group_names.join(", ")
        )
    };

    let suggested_next_action = match sender_sla_hours {
        Some(hours) if hours <= 24 => "Review and approve reply today".to_string(),
        Some(hours) if hours <= 72 => "Review reply soon".to_string(),
        _ => "Review prepared reply".to_string(),
    };

    ReplyContext {
        body,
        response_due_hint: due_hint,
        selection_reason,
        suggested_next_action,
        sender_group_names,
        sender_auto_draft,
        sender_sla_hours,
        matched_communication_keywords,
    }
}

fn reply_subject(subject: &str) -> String {
    let trimmed = subject.trim();
    if trimmed.to_ascii_lowercase().starts_with("re:") {
        trimmed.to_string()
    } else {
        format!("Re: {trimmed}")
    }
}

fn draft_due_hint(event: &PersonalAutomationEvent, sender_sla_hours: Option<i32>) -> &'static str {
    match sender_sla_hours {
        Some(hours) if hours <= 24 => "today",
        Some(hours) if hours <= 72 => "soon",
        Some(_) => "this week",
        None => match event.severity {
            PersonalEventSeverity::High => "today",
            PersonalEventSeverity::Medium => "soon",
            PersonalEventSeverity::Low => "this week",
        },
    }
}

fn draft_confidence_label(confidence: f64) -> &'static str {
    if confidence >= 0.8 {
        "high"
    } else if confidence >= 0.45 {
        "medium"
    } else {
        "low"
    }
}

fn renewal_due_hint(days_until_renewal: Option<i64>) -> &'static str {
    match days_until_renewal {
        Some(days) if days <= 7 => "this week",
        Some(days) if days <= 21 => "soon",
        Some(_) => "this month",
        None => "soon",
    }
}

fn bill_due_hint(days_until_due: Option<i64>) -> &'static str {
    match days_until_due {
        Some(days) if days <= 0 => "today",
        Some(days) if days <= 5 => "this week",
        Some(_) => "soon",
        None => "soon",
    }
}

fn form_due_hint(days_until_due: Option<i64>) -> &'static str {
    match days_until_due {
        Some(days) if days <= 2 => "today",
        Some(days) if days <= 7 => "this week",
        Some(_) => "soon",
        None => "soon",
    }
}

fn renewal_summary_line(
    service_name: &str,
    renewal_kind: &str,
    days_until_renewal: Option<i64>,
) -> String {
    match days_until_renewal {
        Some(days) if days >= 0 => {
            format!(
                "{service_name} {renewal_kind} review is due in {days} day{}.",
                if days == 1 { "" } else { "s" }
            )
        }
        _ => format!("{service_name} {renewal_kind} review is ready."),
    }
}

fn bill_summary_line(
    biller_name: &str,
    bill_kind: &str,
    days_until_due: Option<i64>,
    amount_usd: Option<f64>,
) -> String {
    let amount_suffix = amount_usd
        .map(|amount| format!(" for ${amount:.2}"))
        .unwrap_or_default();
    match days_until_due {
        Some(days) if days > 0 => format!(
            "{biller_name} {bill_kind} review is due in {days} day{}{}.",
            if days == 1 { "" } else { "s" },
            amount_suffix
        ),
        Some(_) => format!("{biller_name} {bill_kind} review is due now{amount_suffix}."),
        None => format!("{biller_name} {bill_kind} review is ready{amount_suffix}."),
    }
}

fn form_summary_line(
    form_name: &str,
    form_kind: &str,
    form_owner: Option<&str>,
    days_until_due: Option<i64>,
) -> String {
    let owner_prefix = form_owner
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|owner| format!("{owner}'s "))
        .unwrap_or_default();
    match days_until_due {
        Some(days) if days > 0 => format!(
            "{owner_prefix}{form_name} {form_kind} review is due in {days} day{}.",
            if days == 1 { "" } else { "s" }
        ),
        Some(_) => format!("{owner_prefix}{form_name} {form_kind} review is due now."),
        None => format!("{owner_prefix}{form_name} {form_kind} review is ready."),
    }
}

fn renewal_review_body(
    service_name: &str,
    renewal_kind: &str,
    days_until_renewal: Option<i64>,
    current_cost: Option<f64>,
    alternative_cost: Option<f64>,
) -> String {
    let due_line = match days_until_renewal {
        Some(days) if days >= 0 => format!(
            "- Renewal window: {days} day{} remaining",
            if days == 1 { "" } else { "s" }
        ),
        _ => "- Renewal window: review timing not yet confirmed".to_string(),
    };
    let current_cost_line = current_cost
        .map(|cost| format!("- Current cost: ${cost:.2}"))
        .unwrap_or_else(|| "- Current cost: confirm latest spend before approving".to_string());
    let alternative_line = alternative_cost
        .map(|cost| format!("- Alternative offer observed: ${cost:.2}"))
        .unwrap_or_else(|| {
            "- Alternatives: compare current plan against at least one cheaper or better-fit option"
                .to_string()
        });

    format!(
        "Decision memo: {service_name} {renewal_kind}\n\n\
Review before renewal commits automatically.\n\n\
{due_line}\n\
{current_cost_line}\n\
{alternative_line}\n\
- Next step: review the renewal package and decide whether to renew, renegotiate, or replace"
    )
}

fn bill_review_body(
    biller_name: &str,
    bill_kind: &str,
    days_until_due: Option<i64>,
    amount_usd: Option<f64>,
    autopay_enabled: Option<bool>,
) -> String {
    let due_line = match days_until_due {
        Some(days) if days > 0 => format!(
            "- Due window: {days} day{} remaining",
            if days == 1 { "" } else { "s" }
        ),
        Some(_) => "- Due window: due now or overdue".to_string(),
        None => "- Due window: confirm due date before paying".to_string(),
    };
    let amount_line = amount_usd
        .map(|amount| format!("- Amount due: ${amount:.2}"))
        .unwrap_or_else(|| "- Amount due: confirm latest balance before paying".to_string());
    let autopay_line = match autopay_enabled {
        Some(true) => {
            "- Autopay: already enabled, confirm whether intervention is still needed".to_string()
        }
        Some(false) => {
            "- Autopay: not enabled, confirm whether manual payment is required".to_string()
        }
        None => "- Autopay: confirm whether this bill is already covered automatically".to_string(),
    };

    format!(
        "Decision memo: {biller_name} {bill_kind}\n\n\
Review before the due date passes or a duplicate payment is made.\n\n\
{due_line}\n\
{amount_line}\n\
{autopay_line}\n\
- Next step: verify the amount, confirm whether it is already covered, and decide whether to pay, defer, or dispute"
    )
}

fn form_review_body(
    form_name: &str,
    form_kind: &str,
    form_owner: Option<&str>,
    days_until_due: Option<i64>,
    submission_mode: Option<&str>,
) -> String {
    let due_line = match days_until_due {
        Some(days) if days > 0 => format!(
            "- Due window: {days} day{} remaining",
            if days == 1 { "" } else { "s" }
        ),
        Some(_) => "- Due window: due now or overdue".to_string(),
        None => "- Due window: confirm due date before submitting".to_string(),
    };
    let mode_line = submission_mode
        .map(|mode| format!("- Submission path: {mode}"))
        .unwrap_or_else(|| {
            "- Submission path: confirm whether this needs a portal, PDF, or paper form".to_string()
        });
    let owner_line = form_owner
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|owner| format!("- Form owner: {owner}"))
        .unwrap_or_else(|| "- Form owner: confirm who this form belongs to".to_string());

    format!(
        "Decision memo: {form_name} {form_kind}\n\n\
Review before the due date passes or the wrong submission path is used.\n\n\
{due_line}\n\
{owner_line}\n\
{mode_line}\n\
- Next step: confirm the required fields, gather any attachments, and decide whether it can be completed now"
    )
}

fn merge_metadata_fields(target: &mut Value, additions: &Map<String, Value>) {
    let Some(target_object) = target.as_object_mut() else {
        return;
    };

    for (key, value) in additions {
        target_object.insert(key.clone(), value.clone());
    }
}

fn event_string_array(event: &PersonalAutomationEvent, key: &str) -> Vec<String> {
    event
        .payload
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn sender_salutation(sender: &str) -> String {
    let fallback = "Hi,".to_string();
    let trimmed = sender.trim();
    if trimmed.is_empty() {
        return fallback;
    }

    let first_part = trimmed
        .split(['<', '@', ','])
        .next()
        .map(str::trim)
        .unwrap_or_default();
    let token = first_part
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .trim_matches(|ch: char| !ch.is_alphanumeric());
    if token.is_empty() {
        fallback
    } else {
        format!("Hi {token},")
    }
}

fn format_sla_hint(hours: i32) -> String {
    if hours <= 24 {
        "within a day".to_string()
    } else if hours < 168 {
        format!("within {hours} hours")
    } else {
        "within a week".to_string()
    }
}

fn compose_reply_body_lines(
    event: &PersonalAutomationEvent,
    sender: &str,
    snippet: &str,
    due_hint: &str,
    sender_sla_hours: Option<i32>,
    matched_communication_keywords: &[String],
    recent_contact_subjects: &[String],
) -> Vec<String> {
    let recent_conversation_subjects = recent_conversation_subjects(event);
    let recent_thread_subjects = recent_thread_subjects(event);
    let subject = event
        .payload
        .get("subject")
        .and_then(Value::as_str)
        .unwrap_or("your message")
        .trim();
    let normalized_text = format!(
        "{} {}",
        subject.to_ascii_lowercase(),
        snippet.to_ascii_lowercase()
    );

    let opener = if normalized_text.contains("thank") {
        "Thank you for the note.".to_string()
    } else if let Some(previous_subject) = recent_conversation_subjects.first() {
        format!(
            "Thanks for following up. I have the recent conversation context from \"{}\".",
            previous_subject
        )
    } else if let Some(previous_subject) = recent_thread_subjects.first() {
        format!(
            "Thanks for following up. I have the recent thread context from \"{}\".",
            previous_subject
        )
    } else if let Some(previous_subject) = recent_contact_subjects.first() {
        format!(
            "Thanks for following up. I have the recent context from our exchange about \"{}\".",
            previous_subject
        )
    } else {
        format!("Thanks for your message about \"{subject}\".")
    };

    let acknowledgment = if snippet.trim().is_empty() {
        "I received it and I’m reviewing the next step now.".to_string()
    } else if normalized_text.contains("invoice") {
        "I’ve received the invoice details and I’m reviewing them now.".to_string()
    } else if normalized_text.contains("contract") {
        "I’ve received the contract note and I’m reviewing the details now.".to_string()
    } else if normalized_text.contains("schedule")
        || normalized_text.contains("meeting")
        || normalized_text.contains("calendar")
    {
        "I’ve seen the scheduling request and I’m checking timing on my side.".to_string()
    } else if normalized_text.contains('?')
        || normalized_text.contains("can you")
        || normalized_text.contains("could you")
        || normalized_text.contains("please")
    {
        "I’ve seen your request and I can follow up on it.".to_string()
    } else {
        "I’ve seen the note and I’m following up on it.".to_string()
    };

    let timing = if let Some(hours) = sender_sla_hours {
        format!("I’ll follow up {}.", format_sla_hint(hours))
    } else {
        format!("I’ll follow up {}.", due_hint_phrase(due_hint))
    };

    let closing_detail = if matched_communication_keywords.is_empty() {
        if sender.contains('@') {
            "If there’s anything time-sensitive I should prioritize, feel free to flag it."
                .to_string()
        } else {
            "If there’s any extra context I should factor in, feel free to send it through."
                .to_string()
        }
    } else {
        format!(
            "I’m treating this with extra attention because it touches on {}.",
            matched_communication_keywords.join(", ")
        )
    };

    vec![opener, acknowledgment, timing, closing_detail]
}

fn due_hint_phrase(due_hint: &str) -> &'static str {
    match due_hint {
        "today" => "later today",
        "soon" => "soon",
        _ => "this week",
    }
}

fn matched_communication_keywords(
    event: &PersonalAutomationEvent,
    priority_rules: &Value,
) -> Vec<String> {
    let normalized = format!(
        "{} {} {}",
        event
            .payload
            .get("subject")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        event
            .payload
            .get("snippet")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        event
            .payload
            .get("sender_label")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )
    .to_ascii_lowercase();

    priority_rules
        .get("rules")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|rule| rule.get("type").and_then(Value::as_str) == Some("communication_filter"))
        .and_then(|rule| rule.get("keywords"))
        .and_then(Value::as_array)
        .map(|keywords| {
            keywords
                .iter()
                .filter_map(Value::as_str)
                .map(|value| value.trim().to_ascii_lowercase())
                .filter(|value| !value.is_empty() && normalized.contains(value))
                .collect()
        })
        .unwrap_or_default()
}

fn recent_contact_subjects(event: &PersonalAutomationEvent) -> Vec<String> {
    subjects_from_payload_context(event, "recent_contact_context")
}

fn recent_conversation_subjects(event: &PersonalAutomationEvent) -> Vec<String> {
    subjects_from_payload_context(event, "recent_conversation_context")
}

fn recent_thread_subjects(event: &PersonalAutomationEvent) -> Vec<String> {
    subjects_from_payload_context(event, "recent_thread_context")
}

fn subjects_from_payload_context(event: &PersonalAutomationEvent, key: &str) -> Vec<String> {
    event
        .payload
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("subject").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

pub fn canonical_mail_event_from_passive_event(
    owner_user_id: &str,
    source_ref: &str,
    event: &AfpPassiveEventContent,
) -> Option<PersonalAutomationEvent> {
    let provider = normalized_provider(event);
    if provider.is_empty() {
        return None;
    }

    let subject = event_field(event, "subject").unwrap_or_default();
    let snippet = event_field(event, "snippet")
        .or_else(|| event_field(event, "body_preview"))
        .unwrap_or_default();
    let sender = event_field(event, "from_address")
        .or_else(|| event_field(event, "sender_label"))
        .unwrap_or_default();
    let account_ref = event_field(event, "account_ref")
        .or_else(|| event_field(event, "gmail_email"))
        .or_else(|| event_field(event, "mailbox"))
        .map(str::to_string);

    let requires_action = event_bool(event, "requires_action")
        || contains_mail_action_keywords(&subject)
        || contains_mail_action_keywords(&snippet);
    let llm_impact_label = event_field(event, "llm_impact_label")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let llm_urgency_label = event_field(event, "llm_urgency_label")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let impact = event_field(event, "impact")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| infer_impact_from_text(&subject, &snippet));
    let urgency_score = event_number(event, "urgency_score").unwrap_or_default();
    let amount_usd = event_number(event, "amount_usd");

    let severity = if impact == "high"
        || llm_impact_label == "high"
        || llm_urgency_label == "urgent"
        || urgency_score >= 0.6
    {
        PersonalEventSeverity::High
    } else if requires_action || urgency_score >= 0.25 {
        PersonalEventSeverity::Medium
    } else {
        PersonalEventSeverity::Low
    };

    Some(PersonalAutomationEvent {
        owner_user_id: owner_user_id.to_string(),
        event_family: PersonalEventFamily::MessageRequiresReply,
        provider,
        account_ref,
        source_ref: source_ref.to_string(),
        severity,
        payload: json!({
            "subject": subject,
            "snippet": snippet,
            "sender_label": sender,
            "requires_action": requires_action,
            "impact": impact,
            "llm_impact_label": llm_impact_label,
            "llm_urgency_label": llm_urgency_label,
            "urgency_score": urgency_score,
            "amount_usd": amount_usd,
            "source": event.source,
            "event_type": event.event_type,
            "event_at": event.event_at,
            "sender_group_ids": event.metadata.get("sender_group_ids").cloned().unwrap_or(Value::Array(Vec::new())),
            "sender_group_names": event.metadata.get("sender_group_names").cloned().unwrap_or(Value::Array(Vec::new())),
            "sender_auto_draft": event.metadata.get("sender_auto_draft").cloned().unwrap_or(Value::Bool(false)),
            "sender_sla_hours": event.metadata.get("sender_sla_hours").cloned().unwrap_or(Value::Null),
            "external_conversation_key": event.metadata.get("external_conversation_key").cloned().unwrap_or(Value::Null),
            "recent_conversation_context": event.metadata.get("recent_conversation_context").cloned().unwrap_or(Value::Array(Vec::new())),
            "recent_contact_context": event.metadata.get("recent_contact_context").cloned().unwrap_or(Value::Array(Vec::new())),
            "recent_thread_context": event.metadata.get("recent_thread_context").cloned().unwrap_or(Value::Array(Vec::new())),
        }),
    })
}

fn normalized_provider(event: &AfpPassiveEventContent) -> String {
    for key in ["provider", "source_provider"] {
        if let Some(value) = event_field(event, key) {
            let normalized = value.trim().to_ascii_lowercase();
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }

    let source = event.source.trim().to_ascii_lowercase();
    if source.contains("gmail") {
        return "gmail".to_string();
    }
    if source.contains("outlook") {
        return "outlook".to_string();
    }
    if source.contains("imap") {
        return "imap".to_string();
    }

    "gmail".to_string()
}

fn event_field<'a>(event: &'a AfpPassiveEventContent, key: &str) -> Option<&'a str> {
    event
        .metadata
        .get(key)
        .and_then(Value::as_str)
        .or_else(|| {
            event
                .payload
                .as_ref()
                .and_then(|payload| payload.get(key))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            event
                .context
                .as_ref()
                .and_then(|context| context.get(key))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn event_bool(event: &AfpPassiveEventContent, key: &str) -> bool {
    event
        .metadata
        .get(key)
        .and_then(Value::as_bool)
        .or_else(|| {
            event
                .payload
                .as_ref()
                .and_then(|payload| payload.get(key))
                .and_then(Value::as_bool)
        })
        .or_else(|| {
            event
                .context
                .as_ref()
                .and_then(|context| context.get(key))
                .and_then(Value::as_bool)
        })
        .unwrap_or(false)
}

fn event_number(event: &AfpPassiveEventContent, key: &str) -> Option<f64> {
    event
        .metadata
        .get(key)
        .and_then(Value::as_f64)
        .or_else(|| {
            event
                .payload
                .as_ref()
                .and_then(|payload| payload.get(key))
                .and_then(Value::as_f64)
        })
        .or_else(|| {
            event
                .context
                .as_ref()
                .and_then(|context| context.get(key))
                .and_then(Value::as_f64)
        })
}

fn contains_mail_action_keywords(text: &str) -> bool {
    let normalized = text.to_ascii_lowercase();
    [
        "reply needed",
        "please reply",
        "action required",
        "approve",
        "contract",
        "invoice",
        "signature needed",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
}

fn infer_impact_from_text(subject: &str, snippet: &str) -> String {
    let normalized = format!(
        "{} {}",
        subject.trim().to_ascii_lowercase(),
        snippet.trim().to_ascii_lowercase()
    );
    if [
        "contract",
        "invoice",
        "legal",
        "approval",
        "signature",
        "payment",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
    {
        "high".to_string()
    } else {
        "normal".to_string()
    }
}

fn canonical_event_confidence(event: &PersonalAutomationEvent) -> f64 {
    match event.severity {
        PersonalEventSeverity::High => 0.90,
        PersonalEventSeverity::Medium => 0.78,
        PersonalEventSeverity::Low => 0.66,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        agent_template::default_priority_rules,
        db::UserConnectedCapabilityRecord,
        message::AfpPassiveEventContent,
        personal_automation_planner::{PersonalEventSeverity, PlannerActionClass},
    };
    use serde_json::json;

    fn gmail_capability(capability_id: &str) -> UserConnectedCapabilityRecord {
        UserConnectedCapabilityRecord {
            id: "ucc_test".to_string(),
            user_id: "user_1".to_string(),
            provider: "gmail".to_string(),
            account_ref: "person@example.com".to_string(),
            capability_family: "communications".to_string(),
            capability_id: capability_id.to_string(),
            transport: "rest".to_string(),
            granted_scopes: vec![],
            approval_mode: "autonomous".to_string(),
            secret_ref: Some("user_gmail_tokens:user_1".to_string()),
            health_state: "healthy".to_string(),
            last_checked_at: None,
            connected_at: "2026-07-17T00:00:00Z".to_string(),
            revoked_at: None,
            metadata_json: json!({}),
        }
    }

    #[test]
    fn canonical_mail_event_maps_email_metadata_to_message_requires_reply() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "gmail_email": "person@example.com",
                "subject": "Contract signature needed today",
                "snippet": "Please review and approve this contract.",
                "requires_action": true,
                "impact": "high"
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let canonical = canonical_mail_event_from_passive_event("user_1", "thread:gmail:1", &event)
            .expect("canonical event");

        assert_eq!(canonical.provider, "gmail");
        assert_eq!(canonical.account_ref.as_deref(), Some("person@example.com"));
        assert_eq!(canonical.severity, PersonalEventSeverity::High);
        assert_eq!(canonical.payload["requires_action"].as_bool(), Some(true));
    }

    #[test]
    fn passive_mail_event_plans_prepare_draft_for_routine_reply() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Quick follow up",
                "snippet": "Can you reply when you have a moment?"
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let decision = plan_passive_event_background_automation(
            "user_1",
            "thread:gmail:2",
            &event,
            "email_incoming",
            &[gmail_capability("gmail.draft")],
            &default_priority_rules(),
        )
        .expect("planner decision");

        assert_eq!(decision.action_class, PlannerActionClass::PrepareDraft);
        assert_eq!(decision.capability_id.as_deref(), Some("gmail.draft"));
    }

    #[test]
    fn passive_mail_event_plans_request_approval_for_invoice_threshold() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Invoice approval needed",
                "snippet": "Please approve the attached invoice.",
                "amount_usd": 75.0
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let decision = plan_passive_event_background_automation(
            "user_1",
            "thread:gmail:3",
            &event,
            "email_incoming",
            &[
                gmail_capability("gmail.draft"),
                gmail_capability("gmail.send"),
            ],
            &default_priority_rules(),
        )
        .expect("planner decision");

        assert_eq!(decision.action_class, PlannerActionClass::RequestApproval);
        assert_eq!(decision.capability_id.as_deref(), Some("gmail.send"));
    }

    #[test]
    fn canonical_renewal_event_maps_passive_metadata_to_renewal_due() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.92,
            metadata: json!({
                "provider": "manual",
                "service_name": "Acme Fiber",
                "renewal_kind": "internet_plan",
                "days_until_renewal": 6,
                "current_cost_usd": 79.0,
                "alternative_cost_usd": 61.0,
                "renewal_date": "2026-07-23"
            }),
            source: "renewal_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("renewal:acme-fiber".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let canonical = canonical_event_from_passive_event(
            "user_1",
            "renewal:acme-fiber",
            &event,
            "renewal_due",
        )
        .expect("canonical renewal event");

        assert_eq!(canonical.event_family, PersonalEventFamily::RenewalDue);
        assert_eq!(canonical.provider, "manual");
        assert_eq!(canonical.severity, PersonalEventSeverity::High);
        assert_eq!(
            canonical.payload["service_name"].as_str(),
            Some("Acme Fiber")
        );
        assert_eq!(
            canonical.payload["alternative_cost_usd"].as_f64(),
            Some(61.0)
        );
    }

    #[test]
    fn passive_renewal_event_maps_to_prepared_review_artifact() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.92,
            metadata: json!({
                "provider": "manual",
                "service_name": "Acme Fiber",
                "renewal_kind": "internet_plan",
                "days_until_renewal": 12,
                "current_cost_usd": 79.0,
                "alternative_cost_usd": 61.0
            }),
            source: "renewal_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("renewal:acme-fiber".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "renewal:acme-fiber",
            &event,
            "renewal_due",
            &[],
            &default_priority_rules(),
        )
        .expect("renewal review artifact");

        assert_eq!(afp["type"].as_str(), Some("ledger"));
        assert_eq!(afp["subtype"].as_str(), Some("prepared_draft"));
        assert_eq!(
            afp["content"]["draft_class"].as_str(),
            Some(PREPARED_DRAFT_CLASS_DECISION_MEMO)
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["prepared_draft_domain"].as_str(),
            Some("renewal_review")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["days_until_renewal"].as_i64(),
            Some(12)
        );
        assert_eq!(
            afp["content"]["summary"].as_str(),
            Some("Acme Fiber internet_plan review is due in 12 days.")
        );
    }

    #[test]
    fn canonical_bill_event_maps_passive_metadata_to_bill_due() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.91,
            metadata: json!({
                "provider": "manual",
                "biller_name": "Sydney Water",
                "bill_kind": "water_bill",
                "days_until_due": 4,
                "amount_usd": 42.5,
                "due_date": "2026-07-21"
            }),
            source: "billing_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("bill:sydney-water".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let canonical =
            canonical_event_from_passive_event("user_1", "bill:sydney-water", &event, "bill_due")
                .expect("canonical bill event");

        assert_eq!(canonical.event_family, PersonalEventFamily::BillDue);
        assert_eq!(canonical.provider, "manual");
        assert_eq!(canonical.severity, PersonalEventSeverity::Medium);
        assert_eq!(
            canonical.payload["biller_name"].as_str(),
            Some("Sydney Water")
        );
        assert_eq!(canonical.payload["amount_usd"].as_f64(), Some(42.5));
    }

    #[test]
    fn passive_bill_event_maps_to_prepared_bill_review_artifact() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.91,
            metadata: json!({
                "provider": "manual",
                "biller_name": "Sydney Water",
                "bill_kind": "water_bill",
                "days_until_due": 4,
                "amount_usd": 42.5,
                "autopay_enabled": false
            }),
            source: "billing_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("bill:sydney-water".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "bill:sydney-water",
            &event,
            "bill_due",
            &[],
            &default_priority_rules(),
        )
        .expect("bill review artifact");

        assert_eq!(afp["type"].as_str(), Some("ledger"));
        assert_eq!(afp["subtype"].as_str(), Some("prepared_draft"));
        assert_eq!(
            afp["content"]["draft_class"].as_str(),
            Some(PREPARED_DRAFT_CLASS_DECISION_MEMO)
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["prepared_draft_domain"].as_str(),
            Some("bill_review")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["days_until_due"].as_i64(),
            Some(4)
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["amount_usd"].as_f64(),
            Some(42.5)
        );
        assert_eq!(
            afp["content"]["summary"].as_str(),
            Some("Sydney Water water_bill review is due in 4 days for $42.50.")
        );
    }

    #[test]
    fn high_impact_bill_event_maps_to_billing_approval_alert() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.94,
            metadata: json!({
                "provider": "manual",
                "biller_name": "Quarterly Rates",
                "bill_kind": "council_rates",
                "days_until_due": 6,
                "amount_usd": 125.0
            }),
            source: "billing_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("bill:quarterly-rates".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "bill:quarterly-rates",
            &event,
            "bill_due",
            &[],
            &default_priority_rules(),
        )
        .expect("billing approval alert");

        assert_eq!(afp["type"].as_str(), Some("watcher_alert"));
        assert_eq!(afp["content"]["category"].as_str(), Some("billing"));
        assert_eq!(
            afp["content"]["message"].as_str(),
            Some("Approval required for: Quarterly Rates")
        );
        assert_eq!(
            afp["content"]["source_event_id"].as_str(),
            Some("bill:quarterly-rates")
        );
    }

    #[test]
    fn canonical_form_event_maps_passive_metadata_to_form_due() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "manual",
                "form_name": "Excursion Consent",
                "form_kind": "school_form",
                "days_until_due": 3,
                "due_date": "2026-07-20"
            }),
            source: "forms_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("form:excursion-consent".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let canonical = canonical_event_from_passive_event(
            "user_1",
            "form:excursion-consent",
            &event,
            "form_due",
        )
        .expect("canonical form event");

        assert_eq!(canonical.event_family, PersonalEventFamily::FormDue);
        assert_eq!(canonical.provider, "manual");
        assert_eq!(canonical.severity, PersonalEventSeverity::Medium);
        assert_eq!(
            canonical.payload["form_name"].as_str(),
            Some("Excursion Consent")
        );
    }

    #[test]
    fn passive_form_event_maps_to_prepared_form_review_artifact() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "manual",
                "form_name": "Excursion Consent",
                "form_kind": "school_form",
                "days_until_due": 3,
                "submission_mode": "parent_portal",
                "form_owner": "Mia",
                "requires_signature": false,
                "sensitive_form": false
            }),
            source: "forms_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("form:excursion-consent".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "form:excursion-consent",
            &event,
            "form_due",
            &[],
            &default_priority_rules(),
        )
        .expect("form review artifact");

        assert_eq!(afp["type"].as_str(), Some("ledger"));
        assert_eq!(afp["subtype"].as_str(), Some("prepared_draft"));
        assert_eq!(
            afp["content"]["draft_class"].as_str(),
            Some(PREPARED_DRAFT_CLASS_DECISION_MEMO)
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["prepared_draft_domain"].as_str(),
            Some("form_review")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["days_until_due"].as_i64(),
            Some(3)
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["submission_mode"].as_str(),
            Some("parent_portal")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["form_owner"].as_str(),
            Some("Mia")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["requires_signature"].as_bool(),
            Some(false)
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["sensitive_form"].as_bool(),
            Some(false)
        );
        assert_eq!(
            afp["content"]["summary"].as_str(),
            Some("Mia's Excursion Consent school_form review is due in 3 days.")
        );
    }

    #[test]
    fn urgent_signature_form_maps_to_forms_approval_alert() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.94,
            metadata: json!({
                "provider": "manual",
                "form_name": "Medical Consent",
                "form_kind": "school_form",
                "days_until_due": 0,
                "requires_signature": true
            }),
            source: "forms_daemon".to_string(),
            payload: None,
            context: None,
            entity_id: Some("form:medical-consent".to_string()),
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "form:medical-consent",
            &event,
            "form_due",
            &[],
            &default_priority_rules(),
        )
        .expect("forms approval alert");

        assert_eq!(afp["type"].as_str(), Some("watcher_alert"));
        assert_eq!(afp["content"]["category"].as_str(), Some("forms"));
        assert_eq!(
            afp["content"]["message"].as_str(),
            Some("Approval required for: Medical Consent")
        );
        assert_eq!(
            afp["content"]["source_event_id"].as_str(),
            Some("form:medical-consent")
        );
    }

    #[test]
    fn prepare_draft_decision_maps_to_prepared_draft_afp() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Quick follow up",
                "snippet": "Can you reply when you have a moment?"
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "thread:gmail:4",
            &event,
            "email_incoming",
            &[gmail_capability("gmail.draft")],
            &default_priority_rules(),
        )
        .expect("artifact");

        assert_eq!(afp["type"].as_str(), Some("ledger"));
        assert_eq!(afp["subtype"].as_str(), Some("prepared_draft"));
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["prepared_draft_origin"].as_str(),
            Some("personal_automation")
        );
        assert_eq!(
            afp["content"]["delivery"]["subject"].as_str(),
            Some("Re: Quick follow up")
        );
    }

    #[test]
    fn prepared_draft_carries_sender_reply_policy_metadata_into_body_and_search() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Field trip permission slip",
                "snippet": "Please reply by tomorrow so we can confirm attendance.",
                "from_address": "teacher@school.example",
                "sender_group_names": ["School"],
                "sender_auto_draft": true,
                "sender_sla_hours": 24
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "thread:gmail:4b",
            &event,
            "email_incoming",
            &[gmail_capability("gmail.draft")],
            &default_priority_rules(),
        )
        .expect("artifact");

        let body = afp["content"]["body"].as_str().expect("draft body string");
        assert!(body.contains("teacher"));
        assert!(body.contains("within a day"));
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["sender_group_names"][0].as_str(),
            Some("School")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["sender_auto_draft"].as_bool(),
            Some(true)
        );
    }

    #[test]
    fn enrich_mail_passive_event_with_reply_policy_merges_sender_metadata() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 1.0,
            metadata: json!({
                "provider": "gmail",
                "from_address": "coach@example.com"
            }),
            source: "gmail_watch".to_string(),
            payload: Some(json!({
                "provider": "gmail"
            })),
            context: None,
            entity_id: None,
            event_at: "2026-07-17T12:00:00Z".to_string(),
        };

        let enriched = enrich_mail_passive_event_with_reply_policy(
            &event,
            Some(&json!({
                "sender_group_names": ["Family"],
                "sender_auto_draft": true,
                "sender_sla_hours": 12
            })),
        );

        assert_eq!(
            enriched.metadata["sender_group_names"][0].as_str(),
            Some("Family")
        );
        assert_eq!(
            enriched
                .payload
                .as_ref()
                .and_then(|value| value.get("sender_auto_draft"))
                .and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn enrich_mail_passive_event_with_recent_contact_context_merges_context_array() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 1.0,
            metadata: json!({
                "provider": "gmail",
                "from_address": "coach@example.com"
            }),
            source: "gmail_watch".to_string(),
            payload: Some(json!({
                "provider": "gmail"
            })),
            context: None,
            entity_id: None,
            event_at: "2026-07-17T12:00:00Z".to_string(),
        };

        let enriched = enrich_mail_passive_event_with_recent_contact_context(
            &event,
            &[json!({
                "subject": "Earlier logistics note",
                "body_preview": "We already discussed pickup timing."
            })],
        );

        assert_eq!(
            enriched.metadata["recent_contact_context"][0]["subject"].as_str(),
            Some("Earlier logistics note")
        );
        assert_eq!(
            enriched
                .payload
                .as_ref()
                .and_then(|value| value.get("recent_contact_context"))
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("subject"))
                .and_then(Value::as_str),
            Some("Earlier logistics note")
        );
    }

    #[test]
    fn enrich_mail_passive_event_with_recent_conversation_context_merges_context_array() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 1.0,
            metadata: json!({
                "provider": "gmail",
                "from_address": "coach@example.com"
            }),
            source: "gmail_watch".to_string(),
            payload: Some(json!({
                "provider": "gmail"
            })),
            context: None,
            entity_id: None,
            event_at: "2026-07-17T12:00:00Z".to_string(),
        };

        let enriched = enrich_mail_passive_event_with_recent_conversation_context(
            &event,
            &[json!({
                "subject": "Conversation anchor note",
                "body_preview": "We already have canonical conversation history."
            })],
        );

        assert_eq!(
            enriched.metadata["recent_conversation_context"][0]["subject"].as_str(),
            Some("Conversation anchor note")
        );
        assert_eq!(
            enriched
                .payload
                .as_ref()
                .and_then(|value| value.get("recent_conversation_context"))
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("subject"))
                .and_then(Value::as_str),
            Some("Conversation anchor note")
        );
    }

    #[test]
    fn enrich_mail_passive_event_with_recent_thread_context_merges_context_array() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 1.0,
            metadata: json!({
                "provider": "gmail",
                "from_address": "coach@example.com"
            }),
            source: "gmail_watch".to_string(),
            payload: Some(json!({
                "provider": "gmail"
            })),
            context: None,
            entity_id: None,
            event_at: "2026-07-17T12:00:00Z".to_string(),
        };

        let enriched = enrich_mail_passive_event_with_recent_thread_context(
            &event,
            &[json!({
                "subject": "Earlier thread note",
                "body_preview": "We already discussed the reply chain."
            })],
        );

        assert_eq!(
            enriched.metadata["recent_thread_context"][0]["subject"].as_str(),
            Some("Earlier thread note")
        );
        assert_eq!(
            enriched
                .payload
                .as_ref()
                .and_then(|value| value.get("recent_thread_context"))
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("subject"))
                .and_then(Value::as_str),
            Some("Earlier thread note")
        );
    }

    #[test]
    fn prepared_draft_uses_recent_contact_context_in_reply_body() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Quick follow up",
                "snippet": "Can you confirm the timing?",
                "from_address": "coach@example.com",
                "recent_contact_context": [
                    {
                        "subject": "Pickup timing for Saturday",
                        "body_preview": "We discussed the earlier pickup window."
                    }
                ]
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "thread:gmail:6",
            &event,
            "email_incoming",
            &[gmail_capability("gmail.draft")],
            &default_priority_rules(),
        )
        .expect("artifact");

        let body = afp["content"]["body"].as_str().expect("draft body string");
        assert!(body.contains("Pickup timing for Saturday"));
        assert!(body.contains("Thanks for following up."));
    }

    #[test]
    fn prepared_draft_prefers_recent_thread_context_in_reply_body() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Quick follow up",
                "snippet": "Can you confirm the timing?",
                "from_address": "coach@example.com",
                "recent_thread_context": [
                    {
                        "subject": "Approval timing on the same thread",
                        "body_preview": "We already discussed the thread details."
                    }
                ],
                "recent_contact_context": [
                    {
                        "subject": "Older contact-only note",
                        "body_preview": "This should be lower priority than thread context."
                    }
                ]
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "thread:gmail:6b",
            &event,
            "email_incoming",
            &[gmail_capability("gmail.draft")],
            &default_priority_rules(),
        )
        .expect("artifact");

        let body = afp["content"]["body"].as_str().expect("draft body string");
        assert!(body.contains("Approval timing on the same thread"));
        assert!(!body.contains("Older contact-only note"));
    }

    #[test]
    fn prepared_draft_prefers_recent_conversation_context_over_thread_and_contact() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Quick follow up",
                "snippet": "Can you confirm the timing?",
                "from_address": "coach@example.com",
                "external_conversation_key": "external_email_thread:<root@example.com>",
                "recent_conversation_context": [
                    {
                        "subject": "Canonical conversation root",
                        "body_preview": "This should outrank every fallback context."
                    }
                ],
                "recent_thread_context": [
                    {
                        "subject": "Thread reconstruction fallback",
                        "body_preview": "This should be lower priority than the durable key."
                    }
                ],
                "recent_contact_context": [
                    {
                        "subject": "Contact-only fallback",
                        "body_preview": "This should be lowest priority."
                    }
                ]
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "thread:gmail:6c",
            &event,
            "email_incoming",
            &[gmail_capability("gmail.draft")],
            &default_priority_rules(),
        )
        .expect("artifact");

        let body = afp["content"]["body"].as_str().expect("draft body string");
        assert!(body.contains("Canonical conversation root"));
        assert!(!body.contains("Thread reconstruction fallback"));
        assert!(!body.contains("Contact-only fallback"));
    }

    #[test]
    fn approval_decision_maps_to_watcher_alert_afp() {
        let event = AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            confidence: 0.9,
            metadata: json!({
                "provider": "gmail",
                "subject": "Contract signature needed today",
                "snippet": "Please review and approve this contract.",
                "requires_action": true,
                "impact": "high"
            }),
            source: "gmail_watch".to_string(),
            payload: None,
            context: None,
            entity_id: None,
            event_at: "2026-07-17T10:00:00Z".to_string(),
        };

        let afp = plan_passive_event_background_artifact(
            "user_1",
            "watcher:user_1",
            "thread:gmail:5",
            &event,
            "email_incoming",
            &[
                gmail_capability("gmail.draft"),
                gmail_capability("gmail.send"),
            ],
            &default_priority_rules(),
        )
        .expect("artifact");

        assert_eq!(afp["type"].as_str(), Some("watcher_alert"));
        assert_eq!(afp["content"]["category"].as_str(), Some("communications"));
    }
}
