/*
 * @module-id: rust.empathetic-memory
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::memory_workspace::{MemoryWorkspaceScope, apply_workspace_scope_metadata};
use crate::message::{
    AFP_TYPE_MEMORY_RESURFACING_EVENT, AfpEmotionalDecay, AfpEmotionalSignal, AfpEmpatheticMetadata,
};

const SUPPRESSED_PENALTY: f64 = 0.15;
const PROFILE_MISMATCH_PENALTY: f64 = 0.35;

#[derive(Debug, Clone, PartialEq)]
pub struct ResurfacingScoreBreakdown {
    pub score: f64,
    pub recency_decay: f64,
    pub emotional_weight_multiplier: f64,
    pub context_match_multiplier: f64,
    pub profile_match_multiplier: f64,
    pub dismissal_penalty: f64,
}

pub fn extract_empathetic_metadata(metadata: Option<&Value>) -> AfpEmpatheticMetadata {
    metadata
        .cloned()
        .and_then(|value| serde_json::from_value::<AfpEmpatheticMetadata>(value).ok())
        .unwrap_or_default()
}

pub fn emotional_weight_multiplier(signal: Option<&AfpEmotionalSignal>) -> f64 {
    match signal {
        Some(signal) => 1.0 + signal.weight.clamp(0.0, 1.0) * 0.75,
        None => 1.0,
    }
}

pub fn recency_decay(decay: Option<&AfpEmotionalDecay>, as_of: DateTime<Utc>) -> f64 {
    let Some(decay) = decay else {
        return 1.0;
    };
    let Some(last_reinforced_at) = decay.last_reinforced_at.as_deref() else {
        return 1.0;
    };
    let Ok(last_reinforced_at) = DateTime::parse_from_rfc3339(last_reinforced_at) else {
        return 1.0;
    };
    let days = (as_of - last_reinforced_at.with_timezone(&Utc))
        .to_std()
        .map(|duration| duration.as_secs_f64() / 86_400.0)
        .unwrap_or(0.0);
    let half_life = decay.half_life_days.max(1) as f64;
    0.5_f64.powf(days / half_life).clamp(0.0, 1.0)
}

pub fn dismissal_penalty(decay: Option<&AfpEmotionalDecay>, as_of: DateTime<Utc>) -> f64 {
    let Some(decay) = decay else {
        return 1.0;
    };
    let Some(suppressed_until) = decay.suppressed_until.as_deref() else {
        return 1.0;
    };
    let Ok(suppressed_until) = DateTime::parse_from_rfc3339(suppressed_until) else {
        return 1.0;
    };
    if suppressed_until.with_timezone(&Utc) > as_of {
        SUPPRESSED_PENALTY
    } else {
        1.0
    }
}

pub fn profile_match_multiplier(
    active_profile_id: Option<&str>,
    memory_profile_id: Option<&str>,
) -> f64 {
    match (active_profile_id, memory_profile_id) {
        (Some(active), Some(memory)) if active != memory => PROFILE_MISMATCH_PENALTY,
        _ => 1.0,
    }
}

pub fn compute_resurfacing_score(
    base_relevance: f64,
    signal: Option<&AfpEmotionalSignal>,
    decay: Option<&AfpEmotionalDecay>,
    context_match_score: f64,
    active_profile_id: Option<&str>,
    memory_profile_id: Option<&str>,
    as_of: DateTime<Utc>,
) -> ResurfacingScoreBreakdown {
    let recency = recency_decay(decay, as_of);
    let weight = emotional_weight_multiplier(signal);
    let context = context_match_score.clamp(0.0, 2.0);
    let profile = profile_match_multiplier(active_profile_id, memory_profile_id);
    let dismissal = dismissal_penalty(decay, as_of);
    let score = (base_relevance.max(0.0) * recency * weight * context * profile * dismissal)
        .clamp(0.0, 10.0);

    ResurfacingScoreBreakdown {
        score,
        recency_decay: recency,
        emotional_weight_multiplier: weight,
        context_match_multiplier: context,
        profile_match_multiplier: profile,
        dismissal_penalty: dismissal,
    }
}

pub fn explain_resurfacing(
    signal: Option<&AfpEmotionalSignal>,
    decay: Option<&AfpEmotionalDecay>,
    active_profile_id: Option<&str>,
    memory_profile_id: Option<&str>,
) -> String {
    let mut reasons: Vec<&str> = Vec::new();
    if signal.is_some_and(|signal| signal.weight >= 0.7) {
        reasons.push("marked high-importance");
    }
    if decay.is_some_and(|decay| decay.suppressed_until.is_some()) {
        reasons.push("suppression-aware");
    }
    if active_profile_id.is_some()
        && memory_profile_id.is_some()
        && active_profile_id == memory_profile_id
    {
        reasons.push("matches active profile");
    }
    if reasons.is_empty() {
        "baseline contextual relevance".to_string()
    } else {
        reasons.join(", ")
    }
}

pub fn build_memory_resurfacing_event(
    owner_user_id: &str,
    profile_id: Option<&str>,
    memory_message_id: &str,
    trigger: &str,
    reason: &str,
    score: f64,
    action_taken: &str,
    workspace_scope: Option<&MemoryWorkspaceScope>,
) -> Value {
    let timestamp = Utc::now().to_rfc3339();
    let mut metadata = serde_json::Map::from_iter([
        ("store".to_string(), Value::Bool(true)),
        ("continuity".to_string(), Value::Bool(true)),
        (
            "profile_id".to_string(),
            profile_id
                .map(|value| Value::String(value.to_string()))
                .unwrap_or(Value::Null),
        ),
    ]);
    apply_workspace_scope_metadata(&mut metadata, workspace_scope);
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": format!("continuity:memory:{}", owner_user_id),
        "from": "empathetic_memory",
        "to": [owner_user_id],
        "timestamp": timestamp,
        "type": AFP_TYPE_MEMORY_RESURFACING_EVENT,
        "content": {
            "memory_message_id": memory_message_id,
            "trigger": trigger,
            "reason": reason,
            "score": score,
            "action_taken": action_taken,
            "dismissed": false,
            "created_at": timestamp,
        },
        "metadata": metadata,
        "store_in_relational": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signal(weight: f64) -> AfpEmotionalSignal {
        AfpEmotionalSignal {
            valence: -0.3,
            arousal: 0.7,
            weight,
            source: "user_explicit".to_string(),
            confidence: Some(1.0),
            label: Some("frustrating".to_string()),
            captured_at: "2026-05-28T11:30:00Z".to_string(),
        }
    }

    fn decay(last_reinforced_at: &str, suppressed_until: Option<&str>) -> AfpEmotionalDecay {
        AfpEmotionalDecay {
            half_life_days: 14,
            last_reinforced_at: Some(last_reinforced_at.to_string()),
            suppressed_until: suppressed_until.map(str::to_string),
        }
    }

    #[test]
    fn resurfacing_score_increases_for_high_weight_signal() {
        let now = DateTime::parse_from_rfc3339("2026-05-28T11:30:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let baseline = compute_resurfacing_score(1.0, None, None, 1.0, None, None, now);
        let weighted =
            compute_resurfacing_score(1.0, Some(&signal(0.9)), None, 1.0, None, None, now);
        assert!(weighted.score > baseline.score);
    }

    #[test]
    fn resurfacing_score_penalizes_suppressed_memories() {
        let now = DateTime::parse_from_rfc3339("2026-05-28T11:30:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let active_decay = decay("2026-05-20T11:30:00Z", Some("2026-05-30T11:30:00Z"));
        let scored =
            compute_resurfacing_score(1.0, None, Some(&active_decay), 1.0, None, None, now);
        assert!(scored.dismissal_penalty < 1.0);
        assert!(scored.score < 1.0);
    }

    #[test]
    fn resurfacing_score_penalizes_profile_mismatch() {
        let now = DateTime::parse_from_rfc3339("2026-05-28T11:30:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let scored = compute_resurfacing_score(
            1.0,
            None,
            None,
            1.0,
            Some("profile_a"),
            Some("profile_b"),
            now,
        );
        assert!(scored.profile_match_multiplier < 1.0);
    }

    #[test]
    fn build_memory_resurfacing_event_emits_expected_type() {
        let event = build_memory_resurfacing_event(
            "user_123",
            Some("profile_123"),
            "msg_123",
            "context_match",
            "Related to today's planning",
            0.82,
            "shown_as_suggestion",
            None,
        );
        assert_eq!(
            event.get("type").and_then(Value::as_str),
            Some(AFP_TYPE_MEMORY_RESURFACING_EVENT)
        );
        assert_eq!(
            event
                .get("metadata")
                .and_then(|metadata| metadata.get("profile_id"))
                .and_then(Value::as_str),
            Some("profile_123")
        );
    }

    #[test]
    fn build_memory_resurfacing_event_carries_workspace_scope_metadata() {
        let event = build_memory_resurfacing_event(
            "user_123",
            Some("profile_123"),
            "msg_123",
            "context_match",
            "Related to today's planning",
            0.82,
            "shown_as_suggestion",
            Some(&MemoryWorkspaceScope {
                memory_space: Some("personal".to_string()),
                author_mask: Some("private".to_string()),
                human_only: Some(true),
                ..MemoryWorkspaceScope::default()
            }),
        );
        let metadata = event.get("metadata").and_then(Value::as_object).unwrap();
        assert_eq!(
            metadata.get("memory_space").and_then(Value::as_str),
            Some("personal")
        );
        assert_eq!(
            metadata.get("author_mask").and_then(Value::as_str),
            Some("private")
        );
        assert_eq!(
            metadata.get("human_only").and_then(Value::as_bool),
            Some(true)
        );
    }
}
