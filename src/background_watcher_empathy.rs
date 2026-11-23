/*
 * @module-id: rust.background-watcher-empathy
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::Utc;
use serde_json::{Map, Value};

use crate::message::{AfpEmotionalDecay, AfpEmotionalSignal};
use crate::proactive_outcome_memory::HeuristicOutcomeFeedback;

pub fn decorate_watcher_message(
    message: Value,
    category: &str,
    severity: &str,
    confidence: f64,
) -> Value {
    decorate_watcher_message_with_feedback(message, category, severity, confidence, None)
}

pub fn decorate_watcher_message_with_feedback(
    mut message: Value,
    category: &str,
    severity: &str,
    confidence: f64,
    feedback: Option<&HeuristicOutcomeFeedback>,
) -> Value {
    let signal = watcher_emotional_signal(category, severity, confidence);
    let decay = watcher_emotional_decay(severity, feedback);
    let explanation = watcher_empathy_explanation(category, severity, feedback);

    let Some(root) = message.as_object_mut() else {
        return message;
    };

    let metadata = root
        .entry("metadata".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(metadata) = metadata.as_object_mut() {
        metadata.insert(
            "emotional_signal".to_string(),
            serde_json::to_value(signal).unwrap_or(Value::Null),
        );
        metadata.insert(
            "emotional_decay".to_string(),
            serde_json::to_value(decay).unwrap_or(Value::Null),
        );
        metadata.insert(
            "empathetic_explanation".to_string(),
            Value::String(explanation.clone()),
        );
    }

    if let Some(views) = root.get_mut("views").and_then(Value::as_array_mut) {
        if let Some(first_view) = views.first_mut().and_then(Value::as_object_mut) {
            let props = first_view
                .entry("props".to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if let Some(props) = props.as_object_mut() {
                props.insert(
                    "empathetic_explanation".to_string(),
                    Value::String(explanation),
                );
            }
        }
    }

    message
}

fn watcher_emotional_signal(category: &str, severity: &str, confidence: f64) -> AfpEmotionalSignal {
    let (valence, arousal, weight, label) = match (category, severity) {
        ("safety", "urgent") | ("medication", "urgent") => (-0.55, 0.9, 0.9, "safety-sensitive"),
        ("medication", "important") | ("schedule", "important") => {
            (-0.35, 0.7, 0.75, "time-sensitive")
        }
        ("shopping", "gentle") | ("study", "gentle") => (0.15, 0.35, 0.45, "gentle-supportive"),
        (_, "urgent") => (-0.45, 0.85, 0.8, "urgent-context"),
        (_, "important") => (-0.2, 0.6, 0.65, "important-context"),
        _ => (0.1, 0.3, 0.4, "gentle-context"),
    };

    AfpEmotionalSignal {
        valence,
        arousal,
        weight,
        source: "system_derived".to_string(),
        confidence: Some(confidence.clamp(0.0, 1.0)),
        label: Some(label.to_string()),
        captured_at: Utc::now().to_rfc3339(),
    }
}

fn watcher_emotional_decay(
    severity: &str,
    feedback: Option<&HeuristicOutcomeFeedback>,
) -> AfpEmotionalDecay {
    let half_life_days = match severity {
        "urgent" => 45,
        "important" => 21,
        _ => 7,
    };
    let adjusted_half_life_days = feedback
        .map(|feedback| feedback.suggested_half_life_days)
        .unwrap_or(half_life_days);
    let suppressed_until = feedback
        .and_then(|feedback| feedback.suggested_suppression_hours)
        .map(|hours| (Utc::now() + chrono::Duration::hours(hours as i64)).to_rfc3339());

    AfpEmotionalDecay {
        half_life_days: adjusted_half_life_days,
        last_reinforced_at: Some(Utc::now().to_rfc3339()),
        suppressed_until,
    }
}

fn watcher_empathy_explanation(
    category: &str,
    severity: &str,
    feedback: Option<&HeuristicOutcomeFeedback>,
) -> String {
    if let Some(feedback) = feedback {
        return match feedback.status.as_str() {
            "suppressed" => format!(
                "This heuristic has low acceptance history, so similar reminders are cooled down for about {} hours.",
                feedback.suggested_suppression_hours.unwrap_or(0)
            ),
            "cooldown_recommended" => format!(
                "This heuristic is being surfaced more carefully because its recent acceptance rate is only {:.0}%.",
                feedback.acceptance_rate * 100.0
            ),
            "reinforced" | "trusted" => format!(
                "This heuristic has been helpful before, so its context is retained for about {} days.",
                feedback.suggested_half_life_days
            ),
            _ => "The watcher keeps this message gentle and context-aware by default.".to_string(),
        };
    }
    match (category, severity) {
        ("medication", "urgent") => {
            "Medication-related risks are phrased clearly and kept high-priority.".to_string()
        }
        ("shopping", "gentle") => {
            "Shopping nudges stay lightweight so they help without interrupting.".to_string()
        }
        ("study", "gentle") => {
            "Study reminders are framed gently to reduce pressure while preserving momentum."
                .to_string()
        }
        (_, "urgent") => {
            "Urgent contexts carry stronger resurfacing weight so they are not missed.".to_string()
        }
        _ => "The watcher keeps this message gentle and context-aware by default.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proactive_outcome_memory::HeuristicOutcomeFeedback;

    #[test]
    fn decorate_watcher_message_adds_empathetic_metadata() {
        let message = serde_json::json!({
            "metadata": { "store": true },
            "views": [{ "format": "insight_line", "props": { "primary": "Take medication" } }]
        });
        let decorated = decorate_watcher_message(message, "medication", "important", 0.82);

        assert_eq!(
            decorated["metadata"]["emotional_signal"]["source"].as_str(),
            Some("system_derived")
        );
        assert_eq!(
            decorated["metadata"]["emotional_decay"]["half_life_days"].as_u64(),
            Some(21)
        );
        assert!(
            decorated["views"][0]["props"]["empathetic_explanation"]
                .as_str()
                .is_some()
        );
    }

    #[test]
    fn decorate_watcher_message_handles_missing_metadata_and_views() {
        let message = serde_json::json!({});
        let decorated = decorate_watcher_message(message, "shopping", "gentle", 0.7);
        assert!(decorated["metadata"]["emotional_signal"].is_object());
    }

    #[test]
    fn decorate_watcher_message_with_feedback_applies_suppression_window() {
        let feedback = HeuristicOutcomeFeedback {
            heuristic_id: "study-break".to_string(),
            total: 8,
            accepted: 1,
            acceptance_rate: 0.125,
            status: "suppressed".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: Some(72),
            suggested_half_life_days: 5,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        };
        let message = serde_json::json!({
            "metadata": { "store": true },
            "views": [{ "format": "insight_line", "props": { "primary": "Take a break" } }]
        });
        let decorated = decorate_watcher_message_with_feedback(
            message,
            "study",
            "gentle",
            0.7,
            Some(&feedback),
        );
        assert_eq!(
            decorated["metadata"]["emotional_decay"]["half_life_days"].as_u64(),
            Some(5)
        );
        assert!(
            decorated["metadata"]["emotional_decay"]["suppressed_until"]
                .as_str()
                .is_some()
        );
    }
}
