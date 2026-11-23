use serde_json::Value;

use crate::message::AfpNormalizedToolResultData;

use super::{ToolDispatchOutput, ToolInvocation};

pub(super) fn format_tool_result(
    invocation: &ToolInvocation,
    payload: &Value,
) -> ToolDispatchOutput {
    let normalized = normalize_result_payload(payload);

    if let Some(summary) = summarize_structured_result(invocation, normalized) {
        return ToolDispatchOutput {
            summary,
            metadata: result_metadata(invocation, normalized),
        };
    }

    if let Some(content) = payload.get("content").and_then(Value::as_array) {
        let text_parts = content
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>();
        if !text_parts.is_empty() {
            return ToolDispatchOutput {
                summary: text_parts.join("\n"),
                metadata: result_metadata(invocation, normalized),
            };
        }
    }

    ToolDispatchOutput {
        summary: format!(
            "Approved tool '{}' executed '{}' successfully.\n{}",
            invocation.tool.slug,
            invocation.capability,
            serde_json::to_string_pretty(payload).unwrap_or_else(|_| payload.to_string())
        ),
        metadata: result_metadata(invocation, normalized),
    }
}

fn normalize_result_payload<'a>(payload: &'a Value) -> &'a Value {
    payload
        .get("structuredContent")
        .filter(|value| value.is_object())
        .unwrap_or(payload)
}

fn summarize_structured_result(invocation: &ToolInvocation, payload: &Value) -> Option<String> {
    let status = payload
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("completed");
    let status_prefix = if matches!(status, "ok" | "success" | "completed") {
        "Completed"
    } else {
        "Returned"
    };

    match (
        invocation.tool.slug.as_str(),
        invocation.capability.as_str(),
    ) {
        ("slack" | "teams" | "discord", "send_message" | "post_message") => {
            let channel = payload
                .get("channel")
                .and_then(Value::as_str)
                .unwrap_or("the target channel");
            let text = payload
                .get("text")
                .or_else(|| payload.get("message"))
                .and_then(Value::as_str)
                .map(compact_summary_text)
                .unwrap_or_else(|| "message sent".to_string());
            Some(format!("{status_prefix} {} in {}.", text, channel))
        }
        ("notion", "create_page" | "update_page") => {
            let title = payload
                .get("title")
                .or_else(|| payload.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("Untitled page");
            let url = payload.get("url").and_then(Value::as_str);
            Some(match url {
                Some(url) => format!("{status_prefix} Notion page \"{title}\". {url}"),
                None => format!("{status_prefix} Notion page \"{title}\"."),
            })
        }
        ("google-calendar", "create_event") => {
            let title = payload
                .get("summary")
                .or_else(|| payload.get("title"))
                .and_then(Value::as_str)
                .unwrap_or("calendar event");
            let when = payload.get("when").and_then(Value::as_str);
            Some(match when {
                Some(when) => format!("{status_prefix} calendar event \"{title}\" ({when})."),
                None => format!("{status_prefix} calendar event \"{title}\"."),
            })
        }
        ("google-drive", "create_file" | "read_file" | "share_file") => {
            let filename = payload
                .get("filename")
                .or_else(|| payload.get("name"))
                .or_else(|| payload.get("title"))
                .and_then(Value::as_str)
                .unwrap_or("file");
            let url = payload.get("url").and_then(Value::as_str);
            Some(match url {
                Some(url) => format!("{status_prefix} Google Drive file \"{filename}\". {url}"),
                None => format!("{status_prefix} Google Drive file \"{filename}\"."),
            })
        }
        ("github" | "linear" | "jira", capability)
            if capability.starts_with("create_")
                || capability.starts_with("update_")
                || capability.starts_with("search_")
                || capability.starts_with("list_") =>
        {
            let item_name = payload
                .get("title")
                .or_else(|| payload.get("name"))
                .or_else(|| payload.get("query"))
                .and_then(Value::as_str)
                .unwrap_or(capability);
            let url = payload.get("url").and_then(Value::as_str);
            Some(match url {
                Some(url) => format!(
                    "{status_prefix} {} {} \"{}\". {}",
                    invocation.tool.name, invocation.capability, item_name, url
                ),
                None => format!(
                    "{status_prefix} {} {} \"{}\".",
                    invocation.tool.name, invocation.capability, item_name
                ),
            })
        }
        _ => payload
            .get("summary")
            .and_then(Value::as_str)
            .or_else(|| payload.get("message").and_then(Value::as_str))
            .or_else(|| payload.get("text").and_then(Value::as_str))
            .map(compact_summary_text)
            .map(|text| format!("{status_prefix} {}.", text)),
    }
}

fn compact_summary_text(text: &str) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= 96 {
        normalized
    } else {
        normalized.chars().take(93).collect::<String>() + "..."
    }
}

fn payload_artifact_title(payload: &Value) -> Option<&str> {
    payload
        .get("title")
        .or_else(|| payload.get("name"))
        .or_else(|| payload.get("summary"))
        .and_then(Value::as_str)
}

fn infer_artifact_kind(invocation: &ToolInvocation, payload: &Value) -> &'static str {
    let capability = invocation.capability.as_str();
    if payload.get("channel").is_some() || capability.contains("message") {
        "message"
    } else if payload.get("filename").is_some() || capability.contains("file") {
        "file"
    } else if capability.contains("page") {
        "page"
    } else if capability.contains("event") {
        "event"
    } else if payload.get("url").is_some() {
        "artifact"
    } else {
        "result"
    }
}

fn derive_artifact_label(invocation: &ToolInvocation, payload: &Value) -> String {
    payload_artifact_title(payload)
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("filename")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            payload
                .get("channel")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            payload
                .get("url")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| {
            format!(
                "{} {}",
                invocation.tool.name,
                invocation.capability.replace('_', " ")
            )
        })
}

fn result_metadata(
    invocation: &ToolInvocation,
    payload: &Value,
) -> Option<AfpNormalizedToolResultData> {
    Some(AfpNormalizedToolResultData {
        schema_version: crate::message::AFP_TOOL_RESULT_SCHEMA_V1.to_string(),
        tool_slug: invocation.tool.slug.clone(),
        tool_name: invocation.tool.name.clone(),
        capability: invocation.capability.clone(),
        connector_label: invocation.tool.name.clone(),
        artifact_label: derive_artifact_label(invocation, payload),
        artifact_kind: infer_artifact_kind(invocation, payload).to_string(),
        url: payload
            .get("url")
            .and_then(Value::as_str)
            .map(str::to_string),
        title: payload_artifact_title(payload).map(str::to_string),
        channel: payload
            .get("channel")
            .and_then(Value::as_str)
            .map(str::to_string),
        filename: payload
            .get("filename")
            .and_then(Value::as_str)
            .map(str::to_string),
        ..Default::default()
    })
}
