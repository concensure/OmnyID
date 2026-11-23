/*
 * @module-id: rust.proactive-memory-capture
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::{Duration, Utc};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    afp::Message as ProtoMessage,
    memory_workspace::{MemoryWorkspaceScope, apply_workspace_scope_metadata},
    message::{
        AFP_TYPE_AGENT_MEMORY, AfpAgentMemoryContent, AfpEmotionalDecay, AfpEmotionalSignal,
    },
    proactive_outcome_memory::HeuristicOutcomeFeedback,
};

#[derive(Debug, Clone)]
pub struct CapturedAgentMemory {
    pub message_id: String,
    pub proto: ProtoMessage,
    pub content_json: Value,
}

pub fn capture_proactive_outcome_memory(
    owner_user_id: &str,
    heuristic_id: &str,
    suggestion_id: &str,
    accepted: bool,
    outcome_afp_id: Option<&str>,
    feedback: Option<&HeuristicOutcomeFeedback>,
    workspace_scope: Option<&MemoryWorkspaceScope>,
) -> Option<CapturedAgentMemory> {
    let feedback = feedback?;
    if !should_capture(feedback) {
        return None;
    }

    let timestamp = Utc::now().to_rfc3339();
    let emotional_signal = build_emotional_signal(feedback, accepted, &timestamp);
    let emotional_decay = build_emotional_decay(feedback, &timestamp);
    let content = build_memory_content(
        heuristic_id,
        suggestion_id,
        accepted,
        outcome_afp_id,
        feedback,
        workspace_scope,
    );
    let content_json = serde_json::to_value(&content).ok()?;
    let metadata =
        build_memory_metadata(feedback, emotional_signal, emotional_decay, workspace_scope);
    let message_id = Ulid::new().to_string();

    Some(CapturedAgentMemory {
        message_id: message_id.clone(),
        proto: ProtoMessage {
            protocol: "afp-v1".to_string(),
            id: message_id,
            thread_id: format!("continuity:memory:{owner_user_id}"),
            parent_id: String::new(),
            from: "proactive_outcome_memory".to_string(),
            to: vec![owner_user_id.to_string()],
            timestamp,
            r#type: AFP_TYPE_AGENT_MEMORY.to_string(),
            kind: None,
            supertags: vec![],
            subtype: String::new(),
            content: serde_json::to_string(&content_json).unwrap_or_else(|_| "{}".to_string()),
            metadata: serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string()),
            signature: String::new(),
            encryption: String::new(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: true,
        },
        content_json,
    })
}

fn should_capture(feedback: &HeuristicOutcomeFeedback) -> bool {
    matches!(
        feedback.status.as_str(),
        "reinforced" | "trusted" | "suppressed" | "cooldown_recommended"
    ) && feedback.total >= 3
}

fn build_memory_content(
    heuristic_id: &str,
    suggestion_id: &str,
    accepted: bool,
    outcome_afp_id: Option<&str>,
    feedback: &HeuristicOutcomeFeedback,
    workspace_scope: Option<&MemoryWorkspaceScope>,
) -> AfpAgentMemoryContent {
    let summary = match feedback.status.as_str() {
        "reinforced" | "trusted" => format!(
            "The user tends to find '{}' proactive prompts helpful.",
            heuristic_id
        ),
        "suppressed" | "cooldown_recommended" => format!(
            "The user often dismisses '{}' proactive prompts and prefers gentler resurfacing.",
            heuristic_id
        ),
        _ => format!("Observed proactive outcome pattern for '{}'.", heuristic_id),
    };
    let detail = Some(format!(
        "Acceptance rate {:.0}% over {} outcomes. Most recent outcome was {}.",
        feedback.acceptance_rate * 100.0,
        feedback.total,
        if accepted { "accepted" } else { "dismissed" }
    ));
    let mut source_message_ids = vec![suggestion_id.to_string()];
    if let Some(outcome_afp_id) = outcome_afp_id {
        source_message_ids.push(outcome_afp_id.to_string());
    }

    AfpAgentMemoryContent {
        kind: "pattern".to_string(),
        summary,
        detail,
        tags: vec![
            "proactive-feedback".to_string(),
            heuristic_id.to_string(),
            feedback.status.clone(),
        ],
        source_message_ids,
        namespace: workspace_scope
            .and_then(|scope| scope.memory_space.clone())
            .or_else(|| Some("proactive".to_string())),
    }
}

fn build_memory_metadata(
    feedback: &HeuristicOutcomeFeedback,
    emotional_signal: AfpEmotionalSignal,
    emotional_decay: AfpEmotionalDecay,
    workspace_scope: Option<&MemoryWorkspaceScope>,
) -> Value {
    let mut metadata = serde_json::Map::from_iter([
        ("store".to_string(), Value::Bool(true)),
        ("continuity".to_string(), Value::Bool(true)),
        ("tier".to_string(), Value::String("project".to_string())),
        (
            "namespace".to_string(),
            Value::String("proactive".to_string()),
        ),
        (
            "project_id".to_string(),
            Value::String("default".to_string()),
        ),
        ("agent_id".to_string(), Value::String("master".to_string())),
        ("role".to_string(), Value::String("continuity".to_string())),
        (
            "confidence".to_string(),
            json!(confidence_from_feedback(feedback)),
        ),
        ("profile_id".to_string(), Value::Null),
        ("emotional_signal".to_string(), json!(emotional_signal)),
        ("emotional_decay".to_string(), json!(emotional_decay)),
        (
            "source".to_string(),
            Value::String("proactive_outcome".to_string()),
        ),
        (
            "author_type".to_string(),
            Value::String("agent".to_string()),
        ),
        ("author_id".to_string(), Value::String("master".to_string())),
    ]);
    apply_workspace_scope_metadata(&mut metadata, workspace_scope);

    Value::Object(metadata)
}

fn build_emotional_signal(
    feedback: &HeuristicOutcomeFeedback,
    accepted: bool,
    captured_at: &str,
) -> AfpEmotionalSignal {
    let (valence, arousal, label) = match feedback.status.as_str() {
        "reinforced" | "trusted" => (0.35, 0.3, "helpful-pattern"),
        "suppressed" => (-0.25, 0.45, "intrusion-risk"),
        "cooldown_recommended" => (-0.1, 0.25, "cooldown-pattern"),
        _ => (0.0, 0.2, "neutral-pattern"),
    };
    let weight = confidence_from_feedback(feedback)
        .max(if accepted { 0.55 } else { 0.5 })
        .clamp(0.0, 1.0);

    AfpEmotionalSignal {
        valence,
        arousal,
        weight,
        source: "system_derived".to_string(),
        confidence: Some(confidence_from_feedback(feedback)),
        label: Some(label.to_string()),
        captured_at: captured_at.to_string(),
    }
}

fn build_emotional_decay(
    feedback: &HeuristicOutcomeFeedback,
    timestamp: &str,
) -> AfpEmotionalDecay {
    let suppressed_until = feedback
        .suggested_suppression_hours
        .map(|hours| (Utc::now() + Duration::hours(hours as i64)).to_rfc3339());

    AfpEmotionalDecay {
        half_life_days: feedback.suggested_half_life_days,
        last_reinforced_at: Some(timestamp.to_string()),
        suppressed_until,
    }
}

fn confidence_from_feedback(feedback: &HeuristicOutcomeFeedback) -> f64 {
    feedback
        .acceptance_rate
        .max(1.0 - feedback.acceptance_rate)
        .clamp(0.35, 0.95)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feedback(status: &str, acceptance_rate: f64) -> HeuristicOutcomeFeedback {
        HeuristicOutcomeFeedback {
            heuristic_id: "study-break".to_string(),
            total: 8,
            accepted: 1,
            acceptance_rate,
            status: status.to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: Some(72),
            suggested_half_life_days: 5,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }
    }

    #[test]
    fn capture_proactive_outcome_memory_emits_for_suppressed_feedback() {
        let captured = capture_proactive_outcome_memory(
            "user_01",
            "study-break",
            "suggestion_1",
            false,
            Some("outcome_1"),
            Some(&feedback("suppressed", 0.125)),
            None,
        )
        .unwrap();
        assert_eq!(captured.proto.r#type, AFP_TYPE_AGENT_MEMORY);
        assert!(
            captured
                .proto
                .metadata
                .contains("\"namespace\":\"proactive\"")
        );
        assert!(
            captured.content_json["summary"]
                .as_str()
                .unwrap_or_default()
                .contains("dismisses")
        );
        assert!(
            captured
                .proto
                .metadata
                .contains("\"author_type\":\"agent\"")
        );
        assert!(captured.proto.metadata.contains("\"author_id\":\"master\""));
    }

    #[test]
    fn capture_proactive_outcome_memory_skips_neutral_feedback() {
        let captured = capture_proactive_outcome_memory(
            "user_01",
            "shopping-nudge",
            "suggestion_2",
            true,
            None,
            Some(&feedback("neutral", 0.5)),
            None,
        );
        assert!(captured.is_none());
    }

    #[test]
    fn capture_proactive_outcome_memory_carries_optional_workspace_scope() {
        let captured = capture_proactive_outcome_memory(
            "user_01",
            "study-break",
            "suggestion_3",
            true,
            None,
            Some(&feedback("trusted", 0.875)),
            Some(&MemoryWorkspaceScope {
                memory_space: Some("work".to_string()),
                author_mask: Some("private".to_string()),
                ..MemoryWorkspaceScope::default()
            }),
        )
        .unwrap();

        assert!(
            captured
                .proto
                .metadata
                .contains("\"memory_space\":\"work\"")
        );
        assert!(
            captured
                .proto
                .metadata
                .contains("\"author_mask\":\"private\"")
        );
        assert_eq!(captured.content_json["namespace"].as_str(), Some("work"));
    }
}
