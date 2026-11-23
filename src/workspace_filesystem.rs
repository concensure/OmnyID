/*
 * @module-id: rust.workspace-filesystem
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{message::AFPMessage, summarizer::generate_summary_and_embedding};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ThreadReadMode {
    Latest,
    Summary,
    Window,
}

impl ThreadReadMode {
    pub fn parse(input: &str) -> Self {
        match input.trim().to_lowercase().as_str() {
            "summary" => Self::Summary,
            "window" => Self::Window,
            _ => Self::Latest,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Latest => "latest",
            Self::Summary => "summary",
            Self::Window => "window",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceThreadSummary {
    pub thread_id: String,
    pub summary_text: String,
    pub source: String,
    pub message_id: Option<String>,
    pub generated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceThreadSnapshot {
    pub thread_id: String,
    pub snapshot_text: String,
    pub source: String,
    pub message_id: Option<String>,
    pub generated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<Value>,
    /// The thread that this snapshot compacts (may differ when cross-thread summaries are used).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_thread_id: Option<String>,
    /// IDs of the AFP messages whose content is compacted into this snapshot.
    /// Readers can replay only the messages that arrived after the last listed ID.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub compacted_message_ids: Vec<String>,
    /// Inclusive message window that this snapshot covers: [first_message_id, last_message_id].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_window: Option<[String; 2]>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceThreadRead {
    pub thread_id: String,
    pub mode: String,
    pub message_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_message: Option<AFPMessage>,
    #[serde(default)]
    pub messages: Vec<AFPMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<WorkspaceThreadSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<WorkspaceThreadSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceSearchHit {
    pub message_id: String,
    pub thread_id: String,
    pub message_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtype: Option<String>,
    pub snippet: String,
    pub score: u32,
    pub timestamp: String,
}

pub fn read_thread(
    messages: &[AFPMessage],
    mode: ThreadReadMode,
    window: usize,
) -> WorkspaceThreadRead {
    let thread_id = messages
        .last()
        .map(|message| message.thread_id.clone())
        .unwrap_or_default();
    let summary = latest_thread_summary(messages);
    let snapshot = latest_thread_snapshot(messages);
    let plan = latest_plan_content(messages);
    let latest_message = messages.last().cloned();
    let message_count = messages.len();
    let messages = match mode {
        ThreadReadMode::Summary => Vec::new(),
        ThreadReadMode::Window => {
            let take = window.clamp(1, 500);
            messages
                .iter()
                .rev()
                .take(take)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect()
        }
        ThreadReadMode::Latest => latest_message.clone().into_iter().collect(),
    };

    WorkspaceThreadRead {
        thread_id,
        mode: mode.as_str().to_string(),
        message_count,
        latest_message,
        messages,
        summary,
        snapshot,
        plan,
    }
}

pub fn latest_thread_summary(messages: &[AFPMessage]) -> Option<WorkspaceThreadSummary> {
    let thread_id = messages
        .last()
        .map(|message| message.thread_id.clone())
        .unwrap_or_default();
    if thread_id.is_empty() {
        return None;
    }

    for message in messages.iter().rev() {
        if message.r#type == "agent" && message.subtype.as_deref() == Some("workflow_summary") {
            let summary_text = extract_summary_text(&message.content);
            if summary_text.trim().is_empty() {
                continue;
            }
            return Some(WorkspaceThreadSummary {
                thread_id: thread_id.clone(),
                summary_text,
                source: "workflow_summary".to_string(),
                message_id: Some(message.id.clone()),
                generated_at: message.timestamp.clone(),
                plan: latest_plan_content(messages),
            });
        }
    }

    let generated = fallback_summary(messages)?;
    Some(WorkspaceThreadSummary {
        thread_id,
        summary_text: generated,
        source: "generated_fallback".to_string(),
        message_id: None,
        generated_at: messages
            .last()
            .map(|message| message.timestamp.clone())
            .unwrap_or_default(),
        plan: latest_plan_content(messages),
    })
}

pub fn latest_thread_snapshot(messages: &[AFPMessage]) -> Option<WorkspaceThreadSnapshot> {
    let thread_id = messages
        .last()
        .map(|message| message.thread_id.clone())
        .unwrap_or_default();
    if thread_id.is_empty() {
        return None;
    }

    for message in messages.iter().rev() {
        if message.r#type != "agent" || message.subtype.as_deref() != Some("snapshot") {
            continue;
        }

        let snapshot_text = extract_snapshot_text(&message.content);
        let source_thread_id = message
            .content
            .get("source_thread_id")
            .and_then(Value::as_str)
            .map(str::to_string);
        let compacted_message_ids = message
            .content
            .get("compacted_message_ids")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let message_window = {
            let first = message
                .content
                .get("window_first_message_id")
                .and_then(Value::as_str)
                .map(str::to_string);
            let last = message
                .content
                .get("window_last_message_id")
                .and_then(Value::as_str)
                .map(str::to_string);
            match (first, last) {
                (Some(f), Some(l)) => Some([f, l]),
                _ => None,
            }
        };

        return Some(WorkspaceThreadSnapshot {
            thread_id: thread_id.clone(),
            snapshot_text,
            source: "snapshot".to_string(),
            message_id: Some(message.id.clone()),
            generated_at: message.timestamp.clone(),
            state: message.content.get("state").cloned(),
            source_thread_id,
            compacted_message_ids,
            message_window,
        });
    }

    None
}

pub fn grep_thread(messages: &[AFPMessage], query: &str, limit: usize) -> Vec<WorkspaceSearchHit> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return Vec::new();
    }

    let limit = limit.max(1);
    let mut hits = Vec::new();
    for message in messages {
        let haystack = searchable_text(message);
        let haystack_lower = haystack.to_lowercase();
        let Some(index) = haystack_lower.find(&normalized_query) else {
            continue;
        };
        let snippet = build_snippet(&haystack, index, normalized_query.len());
        let score = haystack_lower.matches(&normalized_query).count() as u32;
        hits.push(WorkspaceSearchHit {
            message_id: message.id.clone(),
            thread_id: message.thread_id.clone(),
            message_type: message.r#type.clone(),
            subtype: message.subtype.clone(),
            snippet,
            score,
            timestamp: message.timestamp.clone(),
        });
    }

    hits.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| b.timestamp.cmp(&a.timestamp))
            .then_with(|| a.message_id.cmp(&b.message_id))
    });
    hits.truncate(limit);
    hits
}

pub fn latest_plan_content(messages: &[AFPMessage]) -> Option<Value> {
    messages
        .iter()
        .rev()
        .find(|message| message.r#type == "agent" && message.subtype.as_deref() == Some("plan"))
        .map(|message| message.content.clone())
}

fn fallback_summary(messages: &[AFPMessage]) -> Option<String> {
    let combined = messages
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(searchable_text)
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if combined.trim().is_empty() {
        return None;
    }
    let (summary, _) = generate_summary_and_embedding(&json!({ "text": combined }));
    Some(summary)
}

fn extract_summary_text(content: &Value) -> String {
    content
        .get("summary_text")
        .and_then(Value::as_str)
        .or_else(|| content.get("text").and_then(Value::as_str))
        .or_else(|| content.get("summary").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_default()
}

fn extract_snapshot_text(content: &Value) -> String {
    content
        .get("summary")
        .and_then(Value::as_str)
        .or_else(|| content.get("summary_text").and_then(Value::as_str))
        .or_else(|| content.get("text").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_default()
}

fn searchable_text(message: &AFPMessage) -> String {
    let mut parts = Vec::new();
    collect_strings(&message.content, &mut parts);
    if let Some(metadata) = &message.metadata {
        collect_strings(metadata, &mut parts);
    }
    parts.join(" ")
}

fn collect_strings(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            if !text.trim().is_empty() {
                out.push(text.trim().to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_strings(item, out);
            }
        }
        Value::Object(map) => {
            for value in map.values() {
                collect_strings(value, out);
            }
        }
        _ => {}
    }
}

fn build_snippet(haystack: &str, start: usize, match_len: usize) -> String {
    let prefix_start = start.saturating_sub(40);
    let suffix_end = (start + match_len + 80).min(haystack.len());
    haystack[prefix_start..suffix_end]
        .replace('\n', " ")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_message(
        id: &str,
        subtype: Option<&str>,
        timestamp: &str,
        content: Value,
    ) -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: id.to_string(),
            thread_id: "thread.demo".to_string(),
            parent_id: None,
            from: "agent:test@omnyid.local".to_string(),
            to: vec![],
            timestamp: timestamp.to_string(),
            r#type: "agent".to_string(),
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
    fn latest_thread_summary_prefers_persisted_workflow_summary() {
        let messages = vec![
            make_message(
                "msg-plan",
                Some("plan"),
                "2026-04-16T00:00:00Z",
                json!({"next_plan": "Search and summarise findings."}),
            ),
            make_message(
                "msg-summary",
                Some("workflow_summary"),
                "2026-04-16T00:01:00Z",
                json!({"summary_text": "Search completed with three relevant findings."}),
            ),
        ];

        let summary = latest_thread_summary(&messages).expect("summary");
        assert_eq!(summary.source, "workflow_summary");
        assert_eq!(
            summary
                .plan
                .as_ref()
                .and_then(|plan| plan["next_plan"].as_str()),
            Some("Search and summarise findings.")
        );
        assert_eq!(
            summary.summary_text,
            "Search completed with three relevant findings."
        );
    }

    #[test]
    fn read_thread_window_returns_recent_messages_and_summary() {
        let messages = vec![
            make_message(
                "msg-1",
                Some("step"),
                "2026-04-16T00:00:00Z",
                json!({"text": "First step"}),
            ),
            make_message(
                "msg-2",
                Some("step"),
                "2026-04-16T00:01:00Z",
                json!({"text": "Second step"}),
            ),
            make_message(
                "msg-3",
                Some("result"),
                "2026-04-16T00:02:00Z",
                json!({"text": "Final answer"}),
            ),
        ];

        let view = read_thread(&messages, ThreadReadMode::Window, 2);
        assert_eq!(view.messages.len(), 2);
        assert_eq!(view.messages[0].id, "msg-2");
        assert!(view.summary.is_some());
    }

    #[test]
    fn read_thread_exposes_latest_snapshot_when_present() {
        let messages = vec![
            make_message(
                "msg-plan",
                Some("plan"),
                "2026-04-16T00:00:00Z",
                json!({"objective": "Track travel options"}),
            ),
            make_message(
                "msg-snapshot",
                Some("snapshot"),
                "2026-04-16T00:03:00Z",
                json!({
                    "kind": "thread_snapshot",
                    "summary": "Three flights shortlisted and one hotel pending review.",
                    "state": {
                        "selected_flights": 3,
                        "pending_hotels": 1
                    }
                }),
            ),
        ];

        let view = read_thread(&messages, ThreadReadMode::Latest, 1);
        let snapshot = view.snapshot.expect("snapshot");
        assert_eq!(snapshot.source, "snapshot");
        assert_eq!(
            snapshot.snapshot_text,
            "Three flights shortlisted and one hotel pending review."
        );
        assert_eq!(
            snapshot
                .state
                .as_ref()
                .and_then(|state| state["selected_flights"].as_i64()),
            Some(3)
        );
    }

    #[test]
    fn grep_thread_returns_ranked_hits() {
        let messages = vec![
            make_message(
                "msg-1",
                Some("step"),
                "2026-04-16T00:00:00Z",
                json!({"text": "Battery test and charger check"}),
            ),
            make_message(
                "msg-2",
                Some("result"),
                "2026-04-16T00:01:00Z",
                json!({"text": "Battery battery battery health report"}),
            ),
        ];

        let hits = grep_thread(&messages, "battery", 5);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].message_id, "msg-2");
        assert!(hits[0].snippet.to_lowercase().contains("battery"));
    }
}
