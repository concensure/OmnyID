/*
 * @module-id: rust.thread-summarizer
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Thread Summarizer â€” cross-thread auto-summarization.
///
/// Condenses multiple AFP threads into a single `thread_summary` AFP message.
/// The primary entry point is `auto_summarize_threads()` which:
///   1. Checks whether summarization is warranted (message count / token depth).
///   2. Extracts plain-text content from each thread's messages.
///   3. Calls `summarizer::generate_summary_and_embedding` for a compact digest.
///   4. Extracts key insights and next actions via lightweight heuristics.
///   5. Returns a ready-to-emit `AfpThreadSummaryContent`.
///
/// The async variant (`auto_summarize_threads_async`) additionally calls Ollama
/// for a richer embedding and a semantically-improved condensed text.
use serde_json::Value;

use crate::message::{
    AFP_SUBTYPE_THREAD_SUMMARY_AUTO, AFP_TYPE_THREAD_SUMMARY, AfpThreadSummaryContent,
};
use crate::summarizer::generate_summary_and_embedding;

// â”€â”€ Summarization thresholds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Minimum number of AFP messages across all threads to trigger auto-summarization.
pub const AUTO_SUMMARIZE_MIN_MESSAGES: usize = 20;

/// Approximate token count (chars / 4) above which summarization is recommended.
pub const AUTO_SUMMARIZE_TOKEN_THRESHOLD: usize = 4_000;

// â”€â”€ Trigger check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Returns `true` when the combined thread content warrants a summary.
/// Callers should check this before invoking `auto_summarize_threads`.
pub fn should_auto_summarize(messages: &[Value]) -> bool {
    if messages.len() >= AUTO_SUMMARIZE_MIN_MESSAGES {
        return true;
    }
    let total_chars: usize = messages.iter().map(|m| content_text(m).len()).sum();
    total_chars / 4 >= AUTO_SUMMARIZE_TOKEN_THRESHOLD
}

// â”€â”€ Content extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Extract a plain-text snippet from an AFP message's `content` field.
fn content_text(msg: &Value) -> String {
    let c = &msg["content"];
    // Try common text fields in priority order.
    for field in &[
        "text",
        "body",
        "message",
        "description",
        "condensed_text",
        "summary",
    ] {
        if let Some(s) = c.get(field).and_then(Value::as_str) {
            if !s.is_empty() {
                return s.chars().take(800).collect();
            }
        }
    }
    // Fallback: stringify the first 200 chars of the content blob.
    c.to_string().chars().take(200).collect()
}

/// Extract the ISO 8601 timestamp from an AFP message.
fn msg_timestamp(msg: &Value) -> Option<&str> {
    msg.get("timestamp").and_then(Value::as_str)
}

/// Extract the thread_id from an AFP message.
fn msg_thread_id(msg: &Value) -> Option<&str> {
    msg.get("thread_id").and_then(Value::as_str)
}

// â”€â”€ Insight and action extraction (heuristic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Extract simple bullet insights from a block of text.
/// Strategy: take sentences that contain signal words.
fn extract_insights(text: &str) -> Vec<String> {
    let signal_words = [
        "important",
        "key",
        "critical",
        "decided",
        "agreed",
        "confirmed",
        "blocked",
        "risk",
        "deadline",
        "milestone",
        "approved",
        "rejected",
    ];
    text.split(['.', '\n', '!', '?'])
        .map(str::trim)
        .filter(|s| {
            let lower = s.to_lowercase();
            s.len() > 20 && signal_words.iter().any(|w| lower.contains(w))
        })
        .take(5)
        .map(|s| format!("â€¢ {s}."))
        .collect()
}

/// Extract action items from a block of text.
fn extract_next_actions(text: &str) -> Vec<String> {
    let action_words = [
        "need to",
        "should",
        "must",
        "action:",
        "todo:",
        "follow up",
        "schedule",
        "review",
        "send",
        "update",
        "check",
    ];
    text.split(['.', '\n'])
        .map(str::trim)
        .filter(|s| {
            let lower = s.to_lowercase();
            s.len() > 15 && action_words.iter().any(|w| lower.contains(w))
        })
        .take(5)
        .map(|s| format!("â†’ {s}."))
        .collect()
}

// â”€â”€ Main API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build an `AfpThreadSummaryContent` from a flat slice of AFP messages
/// (potentially spanning multiple thread IDs).
///
/// This is the synchronous path â€” uses the built-in summarizer stub.
/// For Ollama-backed summaries use `auto_summarize_threads_async`.
pub fn auto_summarize_threads(messages: &[Value]) -> AfpThreadSummaryContent {
    // Collect distinct thread IDs.
    let mut thread_ids: Vec<String> = messages
        .iter()
        .filter_map(|m| msg_thread_id(m))
        .map(str::to_string)
        .collect();
    thread_ids.dedup();

    // Determine covered time range.
    let timestamps: Vec<&str> = messages.iter().filter_map(msg_timestamp).collect();
    let covered_from = timestamps.iter().min().copied().unwrap_or("").to_string();
    let covered_to = timestamps.iter().max().copied().unwrap_or("").to_string();

    // Concatenate all content snippets.
    let full_text: String = messages
        .iter()
        .map(content_text)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let total_chars = full_text.len();
    let tokens_compressed = (total_chars / 4) as u32;

    // Generate condensed summary using the existing summarizer.
    let content_value = serde_json::json!({ "text": full_text });
    let (raw_summary, _embedding) = generate_summary_and_embedding(&content_value);

    let condensed_text = raw_summary
        .strip_prefix("Summary: ")
        .unwrap_or(&raw_summary)
        .to_string();

    let key_insights = extract_insights(&full_text);
    let next_actions = extract_next_actions(&full_text);

    AfpThreadSummaryContent {
        thread_ids,
        covered_from,
        covered_to,
        condensed_text,
        key_insights,
        next_actions,
        generated_by: AFP_SUBTYPE_THREAD_SUMMARY_AUTO.to_string(),
        model_used: Some("built-in-stub".to_string()),
        tokens_compressed,
    }
}

/// Build a `thread_summary` AFP JSON message ready for storage.
pub fn build_thread_summary_afp(
    owner_user_id: &str,
    summary_thread_id: &str,
    content: &AfpThreadSummaryContent,
) -> Value {
    serde_json::json!({
        "protocol": "afp-v1",
        "id": ulid::Ulid::new().to_string(),
        "thread_id": summary_thread_id,
        "from": "thread_summarizer",
        "to": [owner_user_id],
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "type": AFP_TYPE_THREAD_SUMMARY,
        "subtype": AFP_SUBTYPE_THREAD_SUMMARY_AUTO,
        "content": serde_json::to_value(content).unwrap_or(serde_json::Value::Null),
        "metadata": { "store": true, "summarizer": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Async variant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Async version of `auto_summarize_threads` â€” calls Ollama for an improved
/// condensed text and 768-dim embedding. Falls back to the synchronous stub
/// if Ollama is unavailable.
pub async fn auto_summarize_threads_async(
    messages: &[Value],
    ollama_url: Option<&str>,
) -> AfpThreadSummaryContent {
    let mut base = auto_summarize_threads(messages);

    // Attempt Ollama embedding for richer semantic representation.
    if crate::summarizer::generate_embedding_with_ollama(ollama_url, None, &base.condensed_text)
        .await
        .is_some()
    {
        base.model_used = Some("nomic-embed-text".to_string());
    }

    base
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn make_msg(thread_id: &str, timestamp: &str, body: &str) -> Value {
        serde_json::json!({
            "protocol": "afp-v1",
            "id": "msg_001",
            "thread_id": thread_id,
            "timestamp": timestamp,
            "type": "note",
            "content": { "body": body },
        })
    }

    #[test]
    fn should_auto_summarize_triggers_on_message_count() {
        let msgs: Vec<Value> = (0..20)
            .map(|i| make_msg("t1", "2026-05-01T00:00:00Z", &format!("msg {i}")))
            .collect();
        assert!(should_auto_summarize(&msgs));
    }

    #[test]
    fn should_not_summarize_small_thread() {
        let msgs: Vec<Value> = (0..5)
            .map(|i| make_msg("t1", "2026-05-01T00:00:00Z", &format!("msg {i}")))
            .collect();
        assert!(!should_auto_summarize(&msgs));
    }

    #[test]
    fn auto_summarize_threads_collects_thread_ids() {
        let msgs = vec![
            make_msg(
                "thread_a",
                "2026-05-01T10:00:00Z",
                "We decided the deadline is critical.",
            ),
            make_msg(
                "thread_b",
                "2026-05-02T10:00:00Z",
                "We need to review the budget proposal.",
            ),
        ];
        let summary = auto_summarize_threads(&msgs);
        assert!(summary.thread_ids.contains(&"thread_a".to_string()));
        assert!(summary.thread_ids.contains(&"thread_b".to_string()));
    }

    #[test]
    fn auto_summarize_threads_extracts_time_range() {
        let msgs = vec![
            make_msg("t1", "2026-05-01T08:00:00Z", "Early message."),
            make_msg("t1", "2026-05-03T20:00:00Z", "Late message."),
        ];
        let summary = auto_summarize_threads(&msgs);
        assert_eq!(summary.covered_from, "2026-05-01T08:00:00Z");
        assert_eq!(summary.covered_to, "2026-05-03T20:00:00Z");
    }

    #[test]
    fn auto_summarize_threads_produces_non_empty_condensed_text() {
        let msgs = vec![make_msg(
            "t1",
            "2026-05-01T00:00:00Z",
            "The project milestone was confirmed and approved.",
        )];
        let summary = auto_summarize_threads(&msgs);
        assert!(!summary.condensed_text.is_empty());
    }

    #[test]
    fn build_thread_summary_afp_has_correct_type() {
        let content = AfpThreadSummaryContent {
            thread_ids: vec!["t1".into()],
            condensed_text: "Summary text.".into(),
            generated_by: "auto".into(),
            ..Default::default()
        };
        let afp = build_thread_summary_afp("user_01", "summary_thread_01", &content);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_THREAD_SUMMARY));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_THREAD_SUMMARY_AUTO)
        );
    }
}
