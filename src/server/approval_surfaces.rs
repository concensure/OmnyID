// @locs-version: 1.0
// @module-id: server.approval-surfaces
// @primary-capability: approval-surface-http-routes
// @stability: beta

use serde_json::Value;

use crate::message::AFPMessage;

fn approval_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

fn style_approval_option_value(
    option: &mut serde_json::Map<String, Value>,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) {
    if let Some(label) = option.get("label").and_then(Value::as_str) {
        option.insert(
            "label".to_string(),
            Value::String(approval_user_facing_text(label, active_persona)),
        );
    }
    if let Some(summary) = option.get("consequence_summary").and_then(Value::as_str) {
        option.insert(
            "consequence_summary".to_string(),
            Value::String(approval_user_facing_text(summary, active_persona)),
        );
    }
}

pub(crate) fn style_approval_review_payload(
    mut review: Value,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> Value {
    let Some(active_persona) = active_persona else {
        return review;
    };
    let Some(review_obj) = review.as_object_mut() else {
        return review;
    };

    for key in ["title", "reason", "provenance_summary"] {
        if let Some(text) = review_obj.get(key).and_then(Value::as_str) {
            review_obj.insert(
                key.to_string(),
                Value::String(approval_user_facing_text(text, Some(active_persona))),
            );
        }
    }

    if let Some(lines) = review_obj
        .get_mut("consequence_summary_lines")
        .and_then(Value::as_array_mut)
    {
        for line in lines.iter_mut() {
            if let Some(text) = line.as_str() {
                *line = Value::String(approval_user_facing_text(text, Some(active_persona)));
            }
        }
    }

    if let Some(options) = review_obj.get_mut("options").and_then(Value::as_array_mut) {
        for option in options.iter_mut().filter_map(Value::as_object_mut) {
            style_approval_option_value(option, Some(active_persona));
        }
    }

    if let Some(selected_option) = review_obj
        .get_mut("selected_option")
        .and_then(Value::as_object_mut)
    {
        style_approval_option_value(selected_option, Some(active_persona));
    }

    if let Some(draft_preview) = review_obj
        .get_mut("draft_preview")
        .and_then(Value::as_object_mut)
    {
        if let Some(label) = draft_preview.get("label").and_then(Value::as_str) {
            draft_preview.insert(
                "label".to_string(),
                Value::String(approval_user_facing_text(label, Some(active_persona))),
            );
        }
        if draft_preview.get("content_type").and_then(Value::as_str) != Some("code") {
            if let Some(content) = draft_preview.get("content").and_then(Value::as_str) {
                draft_preview.insert(
                    "content".to_string(),
                    Value::String(approval_user_facing_text(content, Some(active_persona))),
                );
            }
        }
    }

    review
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Capability ID lookup Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

pub(crate) fn action_capability_id(message: &AFPMessage) -> String {
    message
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("capability_id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            message
                .content
                .get("capability_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| message.subtype.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| message.r#type.clone())
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Draft preview Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/// Extracts a compact draft preview from the AFP message so the approval card
/// can show "what is about to happen" without the reviewer needing to open the
/// raw message. Returns null when no meaningful preview can be derived.
pub(crate) fn build_draft_preview(message: &AFPMessage) -> Value {
    let message_type = message.r#type.as_str();
    let subtype = message.subtype.as_deref().unwrap_or_default();

    // Email / outbound communication
    if message_type == "email_outgoing"
        || message_type == "action_reply"
        || message_type == "action_forward"
        || (message_type == "email" && matches!(subtype, "outgoing" | "reply" | "forward"))
    {
        let subject = message
            .content
            .get("subject")
            .or_else(|| message.content.get("reply_subject"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let body = message
            .content
            .get("body")
            .or_else(|| message.content.get("reply_body"))
            .or_else(|| message.content.get("content"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let draft_artifact_path = message
            .content
            .get("draft_artifact_path")
            .or_else(|| message.content.get("recorded_to"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label = if !subject.is_empty() {
            format!("Email: {subject}")
        } else {
            "Draft email".to_string()
        };
        let mut preview_parts = Vec::new();
        if !body.is_empty() {
            preview_parts.push(truncate_preview(body, 200));
        }
        if !draft_artifact_path.is_empty() {
            preview_parts.push(format!("Draft artifact: {draft_artifact_path}"));
        }
        let preview = preview_parts.join(" | ");
        return serde_json::json!({
            "label": label,
            "content": preview,
            "content_type": "text",
        });
    }

    // Shell command Ã¢â‚¬â€œ show the command verbatim
    if message_type == "shell_command" {
        let command = message
            .content
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        return serde_json::json!({
            "label": "Shell command",
            "content": command,
            "content_type": "code",
        });
    }

    // Outbound notifications / push / Slack
    if matches!(
        message_type,
        "outbound_notification" | "outbound_push" | "outbound_slack" | "push_notification"
    ) {
        let title = message
            .content
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let body = message
            .content
            .get("body")
            .or_else(|| message.content.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label = if !title.is_empty() {
            format!("Notification: {title}")
        } else {
            "Notification draft".to_string()
        };
        return serde_json::json!({
            "label": label,
            "content": truncate_preview(body, 200),
            "content_type": "text",
        });
    }

    // Public publish / social publish
    if matches!(
        message_type,
        "publish_post" | "content_publish" | "social_publish" | "feed_publish"
    ) {
        let title = message
            .content
            .get("title")
            .or_else(|| message.content.get("draft_title"))
            .or_else(|| message.content.get("headline"))
            .or_else(|| message.content.get("platform"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let body = message
            .content
            .get("body")
            .or_else(|| message.content.get("draft_body"))
            .or_else(|| message.content.get("content"))
            .or_else(|| message.content.get("summary"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let draft_artifact_path = message
            .content
            .get("draft_artifact_path")
            .or_else(|| message.content.get("recorded_to"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let tags = message
            .content
            .get("draft_tags")
            .or_else(|| message.content.get("tags"))
            .and_then(Value::as_array)
            .map(|tags| {
                tags.iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .filter(|tag| !tag.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let label = if !title.is_empty() {
            format!("Publish: {title}")
        } else {
            "Publish draft".to_string()
        };
        let mut preview_parts = Vec::new();
        if !body.is_empty() {
            preview_parts.push(truncate_preview(body, 200));
        }
        if !tags.is_empty() {
            preview_parts.push(format!("Tags: {}", tags.join(", ")));
        }
        if !draft_artifact_path.is_empty() {
            preview_parts.push(format!("Draft artifact: {draft_artifact_path}"));
        }
        return serde_json::json!({
            "label": label,
            "content": preview_parts.join(" | "),
            "content_type": "text",
        });
    }

    // Purchase / payment
    if matches!(
        message_type,
        "purchase_request" | "payment_intent" | "charge_request" | "payment"
    ) {
        let amount = message
            .content
            .get("amount_display")
            .or_else(|| message.content.get("amount"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let description = message
            .content
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label = if !amount.is_empty() {
            format!("Purchase: {amount}")
        } else {
            "Purchase request".to_string()
        };
        return serde_json::json!({
            "label": label,
            "content": truncate_preview(description, 200),
            "content_type": "text",
        });
    }

    // Form submit / document sign
    if matches!(
        message_type,
        "form_submit" | "document_sign" | "record_create" | "record_update"
    ) {
        let form_name = message
            .content
            .get("form_name")
            .or_else(|| message.content.get("document_name"))
            .or_else(|| message.content.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label = if !form_name.is_empty() {
            format!("Submit: {form_name}")
        } else {
            "Form submission".to_string()
        };
        let summary = message
            .content
            .get("summary")
            .or_else(|| message.content.get("description"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        return serde_json::json!({
            "label": label,
            "content": truncate_preview(summary, 200),
            "content_type": "text",
        });
    }

    // Booking / calendar events
    if matches!(
        message_type,
        "booking_request" | "calendar_event" | "meeting_request"
    ) {
        let profile = message.content.get("profile").and_then(Value::as_object);
        let event_title = message
            .content
            .get("title")
            .or_else(|| message.content.get("event_title"))
            .or_else(|| message.content.get("summary"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let start_time = message
            .content
            .get("start_time")
            .or_else(|| message.content.get("start"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let anchor_type = message
            .content
            .get("schedule_anchor_type")
            .and_then(Value::as_str)
            .or_else(|| {
                profile
                    .and_then(|profile| profile.get("schedule_anchor_type"))
                    .and_then(Value::as_str)
            })
            .map(humanize_preview_token)
            .filter(|value| !value.is_empty());
        let note_kind = message
            .content
            .get("note_kind")
            .and_then(Value::as_str)
            .or_else(|| {
                profile
                    .and_then(|profile| profile.get("schedule_note_kind"))
                    .and_then(Value::as_str)
            })
            .map(humanize_preview_token)
            .filter(|value| !value.is_empty());
        let prep_lead_minutes = message
            .content
            .get("prep_lead_minutes")
            .and_then(Value::as_i64)
            .or_else(|| {
                profile
                    .and_then(|profile| profile.get("prep_lead_minutes"))
                    .and_then(Value::as_i64)
            });
        let location = message
            .content
            .get("location")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let primary_flight_option = message
            .content
            .get("primary_flight_option")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let primary_stay_option = message
            .content
            .get("primary_stay_option")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let primary_transfer_option = message
            .content
            .get("primary_transfer_option")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label_prefix = anchor_type
            .as_deref()
            .map(|anchor_type| format!("{anchor_type} event"))
            .unwrap_or_else(|| "Event".to_string());
        let label = if !event_title.is_empty() {
            format!("{label_prefix}: {event_title}")
        } else {
            "Booking request".to_string()
        };
        let mut content_parts = Vec::new();
        if !start_time.is_empty() {
            content_parts.push(format!("Scheduled for {start_time}"));
        }
        if let Some(note_kind) = note_kind {
            content_parts.push(note_kind);
        }
        if let Some(prep_lead_minutes) = prep_lead_minutes {
            if prep_lead_minutes > 0 {
                content_parts.push(format!("Protects {prep_lead_minutes} min prep window"));
            }
        }
        if !location.is_empty() {
            content_parts.push(format!("Location: {location}"));
        }
        if !primary_flight_option.is_empty() {
            content_parts.push(format!("Flight: {primary_flight_option}"));
        }
        if !primary_stay_option.is_empty() {
            content_parts.push(format!("Stay: {primary_stay_option}"));
        }
        if !primary_transfer_option.is_empty() {
            content_parts.push(format!("Transfer: {primary_transfer_option}"));
        }
        let content = content_parts.join(" Ã¢â‚¬Â¢ ");
        return serde_json::json!({
            "label": label,
            "content": content,
            "content_type": "text",
        });
    }

    if let Some(receipt) = message
        .content
        .get("receipt_entry")
        .and_then(Value::as_object)
    {
        let merchant = receipt
            .get("merchant")
            .or_else(|| receipt.get("proposal_summary"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label = if !merchant.is_empty() {
            format!("Receipt: {merchant}")
        } else {
            "Receipt entry".to_string()
        };
        let mut preview_parts = Vec::new();
        if let Some(amount) = receipt
            .get("amount")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Amount: {amount}"));
        }
        if let Some(category) = receipt
            .get("category")
            .and_then(Value::as_str)
            .map(humanize_preview_token)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Category: {category}"));
        }
        if let Some(transaction_date) = receipt
            .get("transaction_date")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Date: {transaction_date}"));
        }
        if let Some(receipt_status) = receipt
            .get("receipt_status")
            .and_then(Value::as_str)
            .map(humanize_preview_token)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Status: {receipt_status}"));
        }
        if let Some(note) = message
            .content
            .get("receipt_notes")
            .and_then(Value::as_array)
            .and_then(|notes| notes.first())
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(truncate_preview(note, 120));
        }
        if let Some(path) = receipt
            .get("receipt_artifact_path")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Receipt artifact: {path}"));
        }
        return serde_json::json!({
            "label": label,
            "content": preview_parts.join(" | "),
            "content_type": "text",
        });
    }

    if let Some(digest) = message
        .content
        .get("finance_digest")
        .and_then(Value::as_object)
    {
        let scope = digest
            .get("digest_scope")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let proposal_summary = digest
            .get("proposal_summary")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label = if !scope.is_empty() {
            format!("Finance digest: {scope}")
        } else if !proposal_summary.is_empty() {
            format!("Finance digest: {proposal_summary}")
        } else {
            "Finance digest".to_string()
        };
        let mut preview_parts = Vec::new();
        if let Some(status) = digest
            .get("status")
            .and_then(Value::as_str)
            .map(humanize_preview_token)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Status: {status}"));
        }
        if let Some(next_action) = digest
            .get("next_action")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Next action: {next_action}"));
        }
        if let Some(account_count) = message
            .content
            .get("finance_input_context")
            .and_then(Value::as_object)
            .and_then(|context| context.get("account_count"))
            .and_then(Value::as_u64)
        {
            preview_parts.push(format!("Active accounts: {account_count}"));
        }
        if let Some(top_spend) = message
            .content
            .get("finance_input_context")
            .and_then(Value::as_object)
            .and_then(|context| context.get("top_spend_category"))
            .and_then(Value::as_str)
            .map(humanize_preview_token)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Top spend: {top_spend}"));
        }
        if let Some(note) = message
            .content
            .get("anomaly_notes")
            .and_then(Value::as_array)
            .and_then(|notes| notes.first())
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(truncate_preview(note, 120));
        }
        if let Some(path) = digest
            .get("finance_artifact_path")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Finance artifact: {path}"));
        }
        return serde_json::json!({
            "label": label,
            "content": preview_parts.join(" | "),
            "content_type": "text",
        });
    }

    if let Some(brief) = message
        .content
        .get("research_brief")
        .and_then(Value::as_object)
    {
        let proposal_summary = brief
            .get("proposal_summary")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let next_action = brief
            .get("next_action")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let label = if !proposal_summary.is_empty() {
            format!("Research brief: {proposal_summary}")
        } else if !next_action.is_empty() {
            format!("Research brief: {next_action}")
        } else {
            "Research brief".to_string()
        };
        let mut preview_parts = Vec::new();
        if let Some(body) = brief
            .get("brief_body")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(truncate_preview(body, 200));
        }
        if !next_action.is_empty() {
            preview_parts.push(format!("Next action: {next_action}"));
        }
        if let Some(finding) = message
            .content
            .get("key_findings")
            .and_then(Value::as_array)
            .and_then(|findings| findings.first())
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(truncate_preview(finding, 120));
        }
        if let Some(source_count) = brief.get("source_count").and_then(Value::as_u64) {
            preview_parts.push(format!("Source count: {source_count}"));
        }
        if let Some(source) = message
            .content
            .get("source_refs")
            .and_then(Value::as_array)
            .and_then(|sources| sources.first())
        {
            match source {
                Value::String(text) => {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        preview_parts.push(format!("Source: {trimmed}"));
                    }
                }
                Value::Object(object) => {
                    if let Some(title) = object
                        .get("title")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                    {
                        preview_parts.push(format!("Source: {title}"));
                    }
                    if let Some(url) = object
                        .get("url")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                    {
                        preview_parts.push(format!("URL: {url}"));
                    }
                }
                _ => {}
            }
        }
        if let Some(path) = brief
            .get("research_artifact_path")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            preview_parts.push(format!("Research artifact: {path}"));
        }
        return serde_json::json!({
            "label": label,
            "content": preview_parts.join(" | "),
            "content_type": "text",
        });
    }

    // Data delete / destructive mutations
    if matches!(
        message_type,
        "data_delete" | "record_delete" | "bulk_delete"
    ) {
        let target = message
            .content
            .get("target")
            .or_else(|| message.content.get("record_id"))
            .or_else(|| message.content.get("description"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        return serde_json::json!({
            "label": "Destructive operation",
            "content": truncate_preview(target, 200),
            "content_type": "text",
        });
    }

    // Generic fallback Ã¢â‚¬â€ use summary / description / title when available
    let summary = message
        .content
        .get("summary")
        .or_else(|| message.content.get("description"))
        .or_else(|| message.content.get("title"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());

    if let Some(content) = summary {
        return serde_json::json!({
            "label": format!("Review {}", message_type.replace('_', " ")),
            "content": truncate_preview(content, 200),
            "content_type": "text",
        });
    }

    Value::Null
}

fn truncate_preview(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.char_indices().nth(max_chars).is_some() {
        let end = trimmed
            .char_indices()
            .nth(max_chars)
            .map(|(i, _)| i)
            .unwrap_or(trimmed.len());
        format!("{}...", &trimmed[..end])
    } else {
        trimmed.to_string()
    }
}

fn humanize_preview_token(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let normalized = trimmed
        .split(['_', '-'])
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            let head = chars
                .next()
                .map(|ch| ch.to_uppercase().to_string())
                .unwrap_or_default();
            let tail = chars.as_str().to_ascii_lowercase();
            format!("{head}{tail}")
        })
        .collect::<Vec<_>>()
        .join(" ");
    normalized
}

pub(crate) fn approval_draft_preview_lines(preview: &Value) -> Vec<String> {
    let Some(content) = preview.get("content").and_then(Value::as_str) else {
        return Vec::new();
    };
    if preview.get("content_type").and_then(Value::as_str) == Some("code") {
        return Vec::new();
    }
    content
        .replace(" | ", "\n")
        .replace(" • ", "\n")
        .replace(" â€¢ ", "\n")
        .replace(" Ã¢â‚¬Â¢ ", "\n")
        .replace(" ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ", "\n")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Approval option helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

pub(crate) fn approval_option_summaries(options: &[Value]) -> Vec<Value> {
    options
        .iter()
        .filter_map(|option| {
            let option_id = option.get("option_id").and_then(Value::as_str)?.trim();
            if option_id.is_empty() {
                return None;
            }
            let label = option
                .get("label")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or(option_id);
            let consequence_summary = option
                .get("consequence_summary")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("");
            Some(serde_json::json!({
                "option_id": option_id,
                "label": label,
                "consequence_summary": consequence_summary,
            }))
        })
        .collect()
}

pub(crate) fn selected_approval_option_summary(
    options: &[Value],
    option_id: Option<&str>,
) -> Value {
    let Some(option_id) = option_id.map(str::trim).filter(|v| !v.is_empty()) else {
        return Value::Null;
    };
    approval_option_summaries(options)
        .into_iter()
        .find(|option| option.get("option_id").and_then(Value::as_str) == Some(option_id))
        .unwrap_or_else(|| {
            serde_json::json!({
                "option_id": option_id,
                "label": option_id,
                "consequence_summary": "",
            })
        })
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Approval kind inference Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

pub(crate) fn infer_workflow_approval_kind(
    label: Option<&str>,
    reason: Option<&str>,
    options: &[Value],
) -> &'static str {
    let mut haystack = String::new();
    if let Some(label) = label {
        haystack.push_str(label);
        haystack.push(' ');
    }
    if let Some(reason) = reason {
        haystack.push_str(reason);
        haystack.push(' ');
    }
    for option in options {
        if let Some(v) = option.get("label").and_then(Value::as_str) {
            haystack.push_str(v);
            haystack.push(' ');
        }
        if let Some(v) = option.get("consequence_summary").and_then(Value::as_str) {
            haystack.push_str(v);
            haystack.push(' ');
        }
    }
    let lower = haystack.to_ascii_lowercase();
    if ["purchase", "payment", "pay ", "invoice", "refund", "charge"]
        .iter()
        .any(|needle| lower.contains(needle))
    {
        "purchase"
    } else if [
        "book",
        "booking",
        "calendar",
        "meeting slot",
        "confirm slot",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
    {
        "booking"
    } else if ["publish", "public release", "release", "post publicly"]
        .iter()
        .any(|needle| lower.contains(needle))
    {
        "publish"
    } else if [
        "send",
        "reply",
        "response delivery",
        "email",
        "notify",
        "notification",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
    {
        "send"
    } else if ["delete", "remove", "destroy", "archive permanently"]
        .iter()
        .any(|needle| lower.contains(needle))
    {
        "destructive"
    } else if ["submit", "sign", "confirm", "approve", "accept"]
        .iter()
        .any(|needle| lower.contains(needle))
    {
        "submit"
    } else {
        "review"
    }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Workflow approval review payload Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

fn build_workflow_draft_preview(title: &str, reason: &str, approval_options: &[Value]) -> Value {
    let option_summaries = approval_option_summaries(approval_options);
    let selected_option = option_summaries.first();
    let option_label = selected_option
        .and_then(|option| option.get("label"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let consequence = selected_option
        .and_then(|option| option.get("consequence_summary"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());

    serde_json::json!({
        "label": option_label
            .map(|option_label| format!("{title}: {option_label}"))
            .unwrap_or_else(|| title.to_string()),
        "content": consequence
            .map(|summary| truncate_preview(summary, 200))
            .unwrap_or_else(|| truncate_preview(reason, 200)),
        "content_type": "text",
    })
}

pub(crate) fn build_workflow_approval_review_payload(
    title: Option<&str>,
    source_graph_node_id: Option<&str>,
    approval_reason: Option<&str>,
    approval_decision_point_id: Option<&str>,
    approval_options: &[Value],
) -> Value {
    let title = title
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("Approval review");
    let reason = approval_reason
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("This workflow step requires explicit review before continuing.");
    let decision_point_id = approval_decision_point_id
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let option_summaries = approval_option_summaries(approval_options);
    let consequence_summary_lines: Vec<Value> = option_summaries
        .iter()
        .filter_map(|option| {
            option
                .get("consequence_summary")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(|v| Value::String(v.to_string()))
        })
        .take(3)
        .collect();
    let mut source_refs = Vec::new();
    if let Some(node_id) = source_graph_node_id
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        source_refs.push(Value::String(format!("workflow_node:{node_id}")));
    }
    if let Some(dp_id) = decision_point_id {
        source_refs.push(Value::String(format!("approval_decision_point:{dp_id}")));
    }
    let approval_kind = infer_workflow_approval_kind(Some(title), Some(reason), approval_options);
    let draft_preview = build_workflow_draft_preview(title, reason, &option_summaries);
    serde_json::json!({
        "title": title,
        "reason": reason,
        "approval_kind": approval_kind,
        "decision_point_id": decision_point_id,
        "requires_human_review": true,
        "confidence": "high",
        "option_count": option_summaries.len(),
        "options": option_summaries,
        "consequence_summary_lines": consequence_summary_lines,
        "draft_preview": draft_preview,
        "provenance_summary": format!("Explicit workflow approval gate at {title}."),
        "source_refs": source_refs,
        "autonomy_decision": crate::autonomy_policy::autonomy_decision_for_explicit_approval_boundary(
            "Workflow step is paused at an explicit human approval boundary."
        ),
    })
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Action approval review payload Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/// Builds a normalized `approval_review` payload for an AFP message that is
/// pending human approval. Returns any existing `content.approval_review` block
/// unchanged so producers can supply richer context when they have it.
///
/// `capability_id` should be the result of `action_capability_id(message)`.
pub(crate) fn build_action_approval_review_payload(
    message: &AFPMessage,
    capability_id: &str,
) -> Value {
    if let Some(existing) = message
        .content
        .get("approval_review")
        .cloned()
        .filter(|v| !v.is_null())
    {
        return existing;
    }

    let message_type = message.r#type.as_str();
    let subtype = message.subtype.as_deref().unwrap_or_default();
    let mut title = format!("Review {}", message_type.replace('_', " "));
    let mut reason = "This action requires explicit human approval before execution.".to_string();
    let mut approval_kind = "review";
    let mut consequence_summary_lines: Vec<Value> = vec![
        Value::String("Approve to continue with the requested action.".to_string()),
        Value::String("Deny to stop before any external or high-consequence effect.".to_string()),
    ];

    match message_type {
        "shell_command" => {
            title = "Review shell command".to_string();
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("Shell commands require explicit approval before execution.")
                .to_string();
            approval_kind = "destructive";
            consequence_summary_lines = vec![
                Value::String(
                    "Approve to run the command with the requested timeout and safety mode."
                        .to_string(),
                ),
                Value::String(
                    "Deny to cancel before the command touches the workspace or system state."
                        .to_string(),
                ),
            ];
        }

        // Email / outbound communication
        t if t == "email_outgoing"
            || t == "action_reply"
            || t == "action_forward"
            || (t == "email" && matches!(subtype, "outgoing" | "reply" | "forward")) =>
        {
            title = "Review outbound communication".to_string();
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("Outbound communication should be reviewed before it is sent.")
                .to_string();
            approval_kind = "send";
            consequence_summary_lines = vec![
                Value::String("Approve to queue the outbound message for delivery.".to_string()),
                Value::String(
                    "Deny to keep the draft internal and prevent external send.".to_string(),
                ),
            ];
        }

        // Outbound notifications / push / Slack
        "outbound_notification" | "outbound_push" | "outbound_slack" | "push_notification" => {
            title = "Review outbound notification".to_string();
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("This notification will be delivered externally and should be reviewed.")
                .to_string();
            approval_kind = "send";
            consequence_summary_lines = vec![
                Value::String(
                    "Approve to deliver the notification to the recipient channel.".to_string(),
                ),
                Value::String(
                    "Deny to suppress the notification before it leaves this workspace."
                        .to_string(),
                ),
            ];
        }

        // Public publish / social publish
        "publish_post" | "content_publish" | "social_publish" | "feed_publish" => {
            let publish_target = message
                .content
                .get("platform")
                .or_else(|| message.content.get("destination"))
                .or_else(|| message.content.get("channel"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty());
            title = publish_target
                .map(|target| format!("Review publish: {target}"))
                .unwrap_or_else(|| "Review public publish".to_string());
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("This publish action will make content visible outside this workspace.")
                .to_string();
            approval_kind = "publish";
            consequence_summary_lines = vec![
                Value::String(
                    "Approve to publish the prepared content to the selected external destination."
                        .to_string(),
                ),
                Value::String(
                    "Deny to keep the content in draft without posting it publicly.".to_string(),
                ),
            ];
        }

        // Purchase / payment
        "purchase_request" | "payment_intent" | "charge_request" | "payment" => {
            let amount = message
                .content
                .get("amount_display")
                .or_else(|| message.content.get("amount"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty());
            title = amount
                .map(|a| format!("Review purchase: {a}"))
                .unwrap_or_else(|| "Review purchase request".to_string());
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("This purchase or payment action requires explicit approval.")
                .to_string();
            approval_kind = "purchase";
            consequence_summary_lines = vec![
                Value::String(
                    "Approve to initiate the payment with the displayed amount.".to_string(),
                ),
                Value::String(
                    "Deny to cancel before any charge or transaction is processed.".to_string(),
                ),
            ];
        }

        // Form submit / document sign
        "form_submit" | "document_sign" => {
            let form_name = message
                .content
                .get("form_name")
                .or_else(|| message.content.get("document_name"))
                .or_else(|| message.content.get("name"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty());
            title = form_name
                .map(|n| format!("Review submission: {n}"))
                .unwrap_or_else(|| "Review form submission".to_string());
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("This submission or signature action requires explicit approval.")
                .to_string();
            approval_kind = "submit";
            consequence_summary_lines = vec![
                Value::String("Approve to submit the form or apply the signature.".to_string()),
                Value::String(
                    "Deny to keep the document in draft without committing any external changes."
                        .to_string(),
                ),
            ];
        }

        // Data delete / destructive mutations
        "data_delete" | "record_delete" | "bulk_delete" => {
            let target = message
                .content
                .get("target")
                .or_else(|| message.content.get("record_id"))
                .or_else(|| message.content.get("description"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty());
            title = target
                .map(|t| format!("Review delete: {t}"))
                .unwrap_or_else(|| "Review destructive action".to_string());
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("This delete or destructive action cannot be undone without backup.")
                .to_string();
            approval_kind = "destructive";
            consequence_summary_lines = vec![
                Value::String("Approve to permanently delete the targeted records.".to_string()),
                Value::String("Deny to preserve the data without making any changes.".to_string()),
            ];
        }

        // Booking / calendar with explicit external commit
        "booking_request" | "meeting_request" => {
            let profile = message.content.get("profile").and_then(Value::as_object);
            let event_title = message
                .content
                .get("title")
                .or_else(|| message.content.get("event_title"))
                .or_else(|| message.content.get("summary"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty());
            let anchor_type = message
                .content
                .get("schedule_anchor_type")
                .and_then(Value::as_str)
                .or_else(|| {
                    profile
                        .and_then(|profile| profile.get("schedule_anchor_type"))
                        .and_then(Value::as_str)
                })
                .map(humanize_preview_token)
                .filter(|value| !value.is_empty());
            let note_kind = message
                .content
                .get("note_kind")
                .and_then(Value::as_str)
                .or_else(|| {
                    profile
                        .and_then(|profile| profile.get("schedule_note_kind"))
                        .and_then(Value::as_str)
                })
                .map(humanize_preview_token)
                .filter(|value| !value.is_empty());
            let prep_lead_minutes = message
                .content
                .get("prep_lead_minutes")
                .and_then(Value::as_i64)
                .or_else(|| {
                    profile
                        .and_then(|profile| profile.get("prep_lead_minutes"))
                        .and_then(Value::as_i64)
                });
            let location = message
                .content
                .get("location")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty());
            title = event_title
                .map(|t| {
                    anchor_type
                        .as_deref()
                        .map(|anchor_type| format!("Review {anchor_type} booking: {t}"))
                        .unwrap_or_else(|| format!("Review booking: {t}"))
                })
                .unwrap_or_else(|| "Review booking request".to_string());
            reason = message
                .content
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| {
                    let mut reason_parts = Vec::new();
                    if let Some(note_kind) = note_kind {
                        reason_parts.push(note_kind);
                    }
                    if let Some(prep_lead_minutes) = prep_lead_minutes {
                        if prep_lead_minutes > 0 {
                            reason_parts
                                .push(format!("protecting a {prep_lead_minutes}-minute prep window"));
                        }
                    }
                    if let Some(location) = location {
                        reason_parts.push(format!("at {location}"));
                    }
                    if reason_parts.is_empty() {
                        "This booking will send invitations or confirm external commitments."
                            .to_string()
                    } else {
                        format!(
                            "This booking will send invitations or confirm external commitments for {}.",
                            reason_parts.join(" ")
                        )
                    }
                });
            approval_kind = "booking";
            consequence_summary_lines = vec![
                Value::String(
                    "Approve to confirm the booking and dispatch any necessary invitations."
                        .to_string(),
                ),
                Value::String(
                    "Deny to cancel before any external calendar or venue commitment is made."
                        .to_string(),
                ),
            ];
        }

        // Generic operation-based classification
        _ => {
            if let Some(operation) = message
                .content
                .get("operation")
                .and_then(Value::as_str)
                .map(str::to_ascii_lowercase)
            {
                if ["send", "reply", "forward", "notify"]
                    .iter()
                    .any(|n| operation.contains(n))
                {
                    approval_kind = "send";
                } else if ["purchase", "pay", "charge", "refund"]
                    .iter()
                    .any(|n| operation.contains(n))
                {
                    approval_kind = "purchase";
                } else if ["delete", "remove", "destroy"]
                    .iter()
                    .any(|n| operation.contains(n))
                {
                    approval_kind = "destructive";
                } else if ["publish", "post", "release"]
                    .iter()
                    .any(|n| operation.contains(n))
                {
                    approval_kind = "publish";
                } else if ["submit", "book"].iter().any(|n| operation.contains(n)) {
                    approval_kind = "submit";
                }
                title = format!("Review {}", operation.replace('_', " "));
                reason = message
                    .content
                    .get("reason")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                    .unwrap_or("This integration action crosses an explicit approval boundary.")
                    .to_string();
            }
        }
    }

    let mut source_refs = vec![Value::String(format!("message:{}", message.id))];
    if !capability_id.trim().is_empty() {
        source_refs.push(Value::String(format!("capability:{capability_id}")));
    }

    let draft_preview = build_draft_preview(message);

    serde_json::json!({
        "title": title,
        "reason": reason,
        "approval_kind": approval_kind,
        "requires_human_review": true,
        "confidence": "high",
        "option_count": 2,
        "options": [
            {
                "option_id": "approve",
                "label": "Approve",
                "consequence_summary": consequence_summary_lines
                    .first()
                    .and_then(Value::as_str)
                    .unwrap_or("Approve to continue."),
            },
            {
                "option_id": "deny",
                "label": "Deny",
                "consequence_summary": consequence_summary_lines
                    .get(1)
                    .and_then(Value::as_str)
                    .unwrap_or("Deny to cancel."),
            }
        ],
        "consequence_summary_lines": consequence_summary_lines,
        "provenance_summary": format!("Approval derived from AFP {}:{}.", message_type, subtype),
        "source_refs": source_refs,
        "draft_preview": draft_preview,
        "autonomy_decision": crate::autonomy_policy::autonomy_decision_for_explicit_approval_boundary(
            "This action requires explicit human approval before execution."
        ),
    })
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::AFPMessage;

    fn minimal_message(r#type: &str, subtype: Option<&str>, content: Value) -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_test".to_string(),
            thread_id: "thread_test".to_string(),
            parent_id: None,
            from: "agent:test@omnyid.local".to_string(),
            to: vec![],
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            r#type: r#type.to_string(),
            kind: None,
            supertags: vec![],
            subtype: subtype.map(str::to_string),
            content,
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        }
    }

    #[test]
    fn shell_command_review_is_destructive_with_draft_preview() {
        let message = minimal_message(
            "shell_command",
            Some("request"),
            serde_json::json!({ "command": "rm -rf /tmp/cache", "reason": "Clearing stale cache." }),
        );
        let review = build_action_approval_review_payload(&message, "cap_shell");
        assert_eq!(review["approval_kind"].as_str(), Some("destructive"));
        assert_eq!(review["confidence"].as_str(), Some("high"));
        assert_eq!(
            review["draft_preview"]["content_type"].as_str(),
            Some("code")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some("rm -rf /tmp/cache")
        );
    }

    #[test]
    fn outbound_email_review_is_send_with_draft_preview() {
        let message = minimal_message(
            "email_outgoing",
            None,
            serde_json::json!({ "subject": "Hello", "body": "Hi there" }),
        );
        let review = build_action_approval_review_payload(&message, "cap_email");
        assert_eq!(review["approval_kind"].as_str(), Some("send"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Email: Hello")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some("Hi there")
        );
    }

    #[test]
    fn outbound_email_review_uses_authored_reply_fields_and_artifact_path() {
        let message = minimal_message(
            "action_reply",
            None,
            serde_json::json!({
                "reply_subject": "Re: Scheduling follow-up",
                "reply_body": "Thanks again. I can confirm 3 PM tomorrow.",
                "draft_artifact_path": ".skillcapsule/email/reply.md"
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_email");
        assert_eq!(review["approval_kind"].as_str(), Some("send"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Email: Re: Scheduling follow-up")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some(
                "Thanks again. I can confirm 3 PM tomorrow. | Draft artifact: .skillcapsule/email/reply.md"
            )
        );
    }

    #[test]
    fn outbound_notification_review_is_send() {
        let message = minimal_message(
            "outbound_notification",
            None,
            serde_json::json!({ "title": "Alert", "body": "Your meeting starts in 5 minutes." }),
        );
        let review = build_action_approval_review_payload(&message, "cap_notify");
        assert_eq!(review["approval_kind"].as_str(), Some("send"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Notification: Alert")
        );
    }

    #[test]
    fn publish_review_is_publish_with_preview() {
        let message = minimal_message(
            "publish_post",
            None,
            serde_json::json!({
                "platform": "LinkedIn",
                "title": "Launch note",
                "content": "We are shipping the new workflow review lane today."
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_publish");
        assert_eq!(review["approval_kind"].as_str(), Some("publish"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Publish: Launch note")
        );
    }

    #[test]
    fn publish_review_uses_authored_publication_fields_and_artifact_path() {
        let message = minimal_message(
            "content_publish",
            None,
            serde_json::json!({
                "draft_title": "Launch note for early adopters",
                "draft_body": "We are opening the beta to our first cohort this week.",
                "draft_tags": ["launch", "beta"],
                "draft_artifact_path": ".skillcapsule/content/publish.md"
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_publish");
        assert_eq!(review["approval_kind"].as_str(), Some("publish"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Publish: Launch note for early adopters")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some(
                "We are opening the beta to our first cohort this week. | Tags: launch, beta | Draft artifact: .skillcapsule/content/publish.md"
            )
        );
    }

    #[test]
    fn purchase_request_review_is_purchase() {
        let message = minimal_message(
            "purchase_request",
            None,
            serde_json::json!({ "amount_display": "$49.99", "description": "Annual subscription" }),
        );
        let review = build_action_approval_review_payload(&message, "cap_stripe");
        assert_eq!(review["approval_kind"].as_str(), Some("purchase"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Purchase: $49.99")
        );
    }

    #[test]
    fn data_delete_review_is_destructive() {
        let message = minimal_message(
            "data_delete",
            None,
            serde_json::json!({ "target": "user_archive_2024", "reason": "GDPR erasure request." }),
        );
        let review = build_action_approval_review_payload(&message, "cap_gdpr");
        assert_eq!(review["approval_kind"].as_str(), Some("destructive"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Destructive operation")
        );
    }

    #[test]
    fn form_submit_review_is_submit_with_preview() {
        let message = minimal_message(
            "form_submit",
            None,
            serde_json::json!({ "form_name": "Tax Filing 2025", "summary": "Annual tax return." }),
        );
        let review = build_action_approval_review_payload(&message, "cap_tax");
        assert_eq!(review["approval_kind"].as_str(), Some("submit"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Submit: Tax Filing 2025")
        );
    }

    #[test]
    fn calendar_event_review_preview_includes_anchor_and_prep_context() {
        let message = minimal_message(
            "calendar_event",
            None,
            serde_json::json!({
                "title": "Final interview loop",
                "start_time": "2026-07-29T09:00:00Z",
                "location": "Level 12, Harbour Tower",
                "note_kind": "interview_prep",
                "prep_lead_minutes": 45,
                "profile": {
                    "schedule_anchor_type": "interview",
                    "schedule_note_kind": "interview_prep",
                    "prep_lead_minutes": 45
                }
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_calendar");
        assert_eq!(review["approval_kind"].as_str(), Some("review"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Interview event: Final interview loop")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some(
                "Scheduled for 2026-07-29T09:00:00Z Ã¢â‚¬Â¢ Interview Prep Ã¢â‚¬Â¢ Protects 45 min prep window Ã¢â‚¬Â¢ Location: Level 12, Harbour Tower"
            )
        );
    }

    #[test]
    fn booking_request_review_preview_includes_primary_travel_options() {
        let message = minimal_message(
            "booking_request",
            None,
            serde_json::json!({
                "title": "Sydney to Singapore shortlist",
                "primary_flight_option": "SQ212 overnight",
                "primary_stay_option": "two nights near Marina Bay",
                "primary_transfer_option": "Airport transfer at 08:15",
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_booking");
        assert_eq!(review["approval_kind"].as_str(), Some("booking"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Event: Sydney to Singapore shortlist")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some(
                "Flight: SQ212 overnight Ã¢â‚¬Â¢ Stay: two nights near Marina Bay Ã¢â‚¬Â¢ Transfer: Airport transfer at 08:15"
            )
        );
    }

    #[test]
    fn receipt_entry_review_preview_uses_structured_receipt_fields() {
        let message = minimal_message(
            "action",
            None,
            serde_json::json!({
                "receipt_entry": {
                    "merchant": "Harbour Pharmacy",
                    "amount": "$48.20",
                    "category": "medical_expense",
                    "transaction_date": "2026-07-28",
                    "receipt_status": "ready_for_review",
                    "receipt_artifact_path": ".skillcapsule/receipts/harbour-pharmacy.json"
                },
                "receipt_notes": [
                    "Confirm whether the reimbursement should stay under health expenses."
                ]
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_receipt");
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Receipt: Harbour Pharmacy")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some(
                "Amount: $48.20 | Category: Medical Expense | Date: 2026-07-28 | Status: Ready For Review | Confirm whether the reimbursement should stay under health expenses. | Receipt artifact: .skillcapsule/receipts/harbour-pharmacy.json"
            )
        );
    }

    #[test]
    fn finance_digest_review_preview_uses_structured_finance_fields() {
        let message = minimal_message(
            "action",
            None,
            serde_json::json!({
                "finance_digest": {
                    "digest_scope": "monthly_cashflow",
                    "status": "watchlist",
                    "next_action": "Check the dining transactions against the travel budget.",
                    "finance_artifact_path": ".skillcapsule/finance/july-digest.md"
                },
                "finance_input_context": {
                    "account_count": 3,
                    "top_spend_category": "dining_out"
                },
                "anomaly_notes": [
                    "Dining spend rose 34 percent week over week."
                ]
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_finance");
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Finance digest: monthly_cashflow")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some(
                "Status: Watchlist | Next action: Check the dining transactions against the travel budget. | Active accounts: 3 | Top spend: Dining Out | Dining spend rose 34 percent week over week. | Finance artifact: .skillcapsule/finance/july-digest.md"
            )
        );
    }

    #[test]
    fn research_brief_review_preview_uses_structured_research_fields() {
        let message = minimal_message(
            "action",
            None,
            serde_json::json!({
                "research_brief": {
                    "proposal_summary": "MCP rollout review",
                    "brief_body": "The rollout is stable in the core runtime, but connector binding remains the dominant source of operational review work.",
                    "next_action": "Review the evidence-backed summary before sharing it with the rollout owners.",
                    "source_count": 2,
                    "research_artifact_path": ".skillcapsule/research/mcp-rollout.md"
                },
                "key_findings": [
                    "Connector binding validation is now the main source of rollout friction."
                ],
                "source_refs": [
                    {
                        "title": "Connector binding checklist",
                        "url": "https://example.com/checklist"
                    }
                ]
            }),
        );
        let review = build_action_approval_review_payload(&message, "cap_research");
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Research brief: MCP rollout review")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some(
                "The rollout is stable in the core runtime, but connector binding remains the dominant source of operational review work. | Next action: Review the evidence-backed summary before sharing it with the rollout owners. | Connector binding validation is now the main source of rollout friction. | Source count: 2 | Source: Connector binding checklist | URL: https://example.com/checklist | Research artifact: .skillcapsule/research/mcp-rollout.md"
            )
        );
    }

    #[test]
    fn draft_preview_truncates_long_body() {
        let long_body: String = "a".repeat(300);
        let message = minimal_message(
            "email_outgoing",
            None,
            serde_json::json!({ "subject": "Long", "body": long_body }),
        );
        let review = build_action_approval_review_payload(&message, "cap_email");
        let preview = review["draft_preview"]["content"].as_str().unwrap_or("");
        assert!(preview.ends_with("..."));
        assert!(preview.chars().count() <= 203); // 200 chars + three dots
    }

    #[test]
    fn approval_draft_preview_lines_normalize_pipe_and_legacy_bullet_separators() {
        let normalized = serde_json::json!({
            "label": "Receipt review",
            "content": "Merchant: Luna Cafe | Amount: $12.40 | Artifact path: receipts/luna-cafe.json",
            "content_type": "text",
        });
        let legacy = serde_json::json!({
            "label": "Receipt review",
            "content": "Merchant: Luna Cafe â€¢ Amount: $12.40 â€¢ Artifact path: receipts/luna-cafe.json",
            "content_type": "text",
        });

        assert_eq!(
            super::approval_draft_preview_lines(&normalized),
            vec![
                "Merchant: Luna Cafe".to_string(),
                "Amount: $12.40".to_string(),
                "Artifact path: receipts/luna-cafe.json".to_string(),
            ]
        );
        assert_eq!(
            super::approval_draft_preview_lines(&legacy),
            vec![
                "Merchant: Luna Cafe".to_string(),
                "Amount: $12.40".to_string(),
                "Artifact path: receipts/luna-cafe.json".to_string(),
            ]
        );
    }

    #[test]
    fn existing_approval_review_in_content_is_returned_unchanged() {
        let bespoke = serde_json::json!({
            "title": "Custom review",
            "approval_kind": "publish",
            "confidence": "medium",
        });
        let message = minimal_message(
            "action",
            None,
            serde_json::json!({ "approval_review": bespoke }),
        );
        let review = build_action_approval_review_payload(&message, "cap_pub");
        assert_eq!(review["approval_kind"].as_str(), Some("publish"));
        assert_eq!(review["confidence"].as_str(), Some("medium"));
    }

    #[test]
    fn workflow_review_includes_draft_preview_from_first_option() {
        let review = build_workflow_approval_review_payload(
            Some("Booking Approval"),
            Some("node_booking"),
            Some("Booking external travel should require explicit approval."),
            Some("booking_gate"),
            &[serde_json::json!({
                "option_id": "book",
                "label": "Book option",
                "consequence_summary": "Proceed with confirmed booking."
            })],
        );
        assert_eq!(review["approval_kind"].as_str(), Some("booking"));
        assert_eq!(
            review["draft_preview"]["label"].as_str(),
            Some("Booking Approval: Book option")
        );
        assert_eq!(
            review["draft_preview"]["content"].as_str(),
            Some("Proceed with confirmed booking.")
        );
    }

    #[test]
    fn approval_review_styling_restyles_user_visible_fields_only() {
        let persona = crate::agent_personas::AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_1".to_string(),
            name: "Concise".to_string(),
            soul_md: "Keep it brief.".to_string(),
            writing_style: "concise".to_string(),
            skills_json: serde_json::json!([]),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
            is_active: true,
            created_at: "2026-06-03T00:00:00Z".to_string(),
            updated_at: "2026-06-03T00:00:00Z".to_string(),
        };
        let review = serde_json::json!({
            "title": "Review outbound communication",
            "reason": "Outbound communication should be reviewed before it is sent.",
            "approval_kind": "send",
            "decision_point_id": "approval_123",
            "options": [
                {
                    "option_id": "approve",
                    "label": "Approve",
                    "consequence_summary": "Queue the outbound message for delivery."
                }
            ],
            "selected_option": {
                "option_id": "approve",
                "label": "Approve",
                "consequence_summary": "Queue the outbound message for delivery."
            },
            "consequence_summary_lines": [
                "Queue the outbound message for delivery."
            ],
            "draft_preview": {
                "label": "Draft email",
                "content": "Thanks for sending this through.",
                "content_type": "text"
            },
            "provenance_summary": "Explicit workflow approval gate at Review outbound communication.",
            "source_refs": ["workflow_node:node_1"]
        });

        let styled = style_approval_review_payload(review, Some(&persona));

        assert_eq!(
            styled["title"].as_str(),
            Some("Briefly: Review outbound communication")
        );
        assert_eq!(
            styled["reason"].as_str(),
            Some("Briefly: Outbound communication should be reviewed before it is sent.")
        );
        assert_eq!(
            styled["options"][0]["label"].as_str(),
            Some("Briefly: Approve")
        );
        assert_eq!(
            styled["selected_option"]["consequence_summary"].as_str(),
            Some("Briefly: Queue the outbound message for delivery.")
        );
        assert_eq!(
            styled["draft_preview"]["content"].as_str(),
            Some("Briefly: Thanks for sending this through.")
        );
        assert_eq!(styled["approval_kind"].as_str(), Some("send"));
        assert_eq!(styled["decision_point_id"].as_str(), Some("approval_123"));
        assert_eq!(
            styled["source_refs"][0].as_str(),
            Some("workflow_node:node_1")
        );
    }
}
