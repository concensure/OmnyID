/*
 * @module-id: rust.behavioral-pattern-extractor
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Behavioral Pattern Extractor â€” Pillar A of Continuity.
///
/// Reads the user's `behavioral_memory` table, clusters evidence rows by
/// category, and emits `behavior_pattern` AFP messages.  Runs heuristically
/// (zero LLM tokens) so it can fire on every request without budget pressure.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    db::Db,
    message::{AFP_TYPE_BEHAVIOR_PATTERN, AfpBehaviorPatternContent},
};

const CONFIDENCE_THRESHOLD: f64 = 0.5;
const MIN_EVIDENCE: i64 = 2;

/// Synthesise `behavior_pattern` AFP messages from the user's behavioral_memory.
/// Returns the list of AFP JSON values emitted (and already stored in the DB).
pub async fn synthesize_behavior_patterns(
    db: &Db,
    user_id: &str,
) -> Result<Vec<Value>, sqlx::Error> {
    let memories = db.list_behavioral_memory(user_id, 50).await?;

    let mut emitted: Vec<Value> = Vec::new();

    for mem in &memories {
        let confidence = mem["confidence"].as_f64().unwrap_or(0.0);
        let evidence_count = mem["evidence_count"].as_i64().unwrap_or(0);
        if confidence < CONFIDENCE_THRESHOLD || evidence_count < MIN_EVIDENCE {
            continue;
        }

        let pattern_key = mem["pattern_key"].as_str().unwrap_or("").to_string();
        let last_observed = mem["last_observed_at"].as_str().unwrap_or("").to_string();
        let metadata = mem.get("metadata").cloned().unwrap_or(Value::Null);

        let (summary, category) = summarize_pattern(&pattern_key, &metadata);

        let content = AfpBehaviorPatternContent {
            pattern_key: pattern_key.clone(),
            summary,
            category,
            confidence,
            evidence_count: evidence_count as i32,
            last_observed_at: last_observed,
            action_chips: vec!["Note this".to_string(), "Dismiss".to_string()],
        };

        let id = Ulid::new().to_string();
        let afp = build_behavior_pattern_afp(user_id, &id, &content);
        let _ = db.insert_daemon_afp_message(&afp).await;
        emitted.push(afp);
    }

    Ok(emitted)
}

/// Build a `behavior_pattern` AFP message JSON value.
pub fn build_behavior_pattern_afp(
    user_id: &str,
    id: &str,
    content: &AfpBehaviorPatternContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": format!("continuity:behavior:{}", user_id),
        "from": "behavioral_pattern_extractor",
        "to": [user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BEHAVIOR_PATTERN,
        "content": {
            "pattern_key": content.pattern_key,
            "summary": content.summary,
            "category": content.category,
            "confidence": content.confidence,
            "evidence_count": content.evidence_count,
            "last_observed_at": content.last_observed_at,
            "action_chips": content.action_chips,
        },
        "views": [{
            "schema_version": "a2ui.v1",
            "kind": "insight_line",
            "props": {
                "icon": category_icon(&content.category),
                "title": content.summary,
                "badge": format!("Confidence {:.0}%", content.confidence * 100.0),
                "badge_tone": if content.confidence >= 0.8 { "success" } else { "info" },
                "action_chips": content.action_chips,
            },
        }],
        "metadata": { "store": true, "proactive": true, "continuity": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn summarize_pattern(key: &str, metadata: &Value) -> (String, String) {
    // Prefer an explicit summary stored in metadata by prior agent runs.
    if let Some(s) = metadata.get("summary").and_then(|v| v.as_str()) {
        let category = metadata
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("other")
            .to_string();
        return (s.to_string(), category);
    }

    // Derive a human-readable sentence from the pattern key.
    let (summary, category) = match key {
        k if k.contains("morning") || k.contains("deep_work") => (
            "Tends to do focused work in the morning hours".to_string(),
            "work_style".to_string(),
        ),
        k if k.contains("evening") || k.contains("wind_down") => (
            "Typically winds down in the evening rather than working late".to_string(),
            "routine".to_string(),
        ),
        k if k.contains("short_reply") || k.contains("brief_email") => (
            "Prefers short, direct replies to emails".to_string(),
            "communication".to_string(),
        ),
        k if k.contains("delay") || k.contains("defer") => (
            "Often defers non-urgent decisions to a later session".to_string(),
            "work_style".to_string(),
        ),
        k if k.contains("mood") || k.contains("stress") || k.contains("anxious") => (
            format!("Emotional pattern detected: {}", k.replace('_', " ")),
            "emotional".to_string(),
        ),
        _ => (
            format!("Recurring pattern: {}", key.replace('_', " ")),
            "other".to_string(),
        ),
    };
    (summary, category)
}

fn category_icon(category: &str) -> &'static str {
    match category {
        "work_style" => "ðŸ§ ",
        "routine" => "ðŸ”„",
        "emotional" => "ðŸ’™",
        "communication" => "âœ‰ï¸",
        _ => "ðŸ“Š",
    }
}
