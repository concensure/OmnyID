/*
 * @module-id: rust.persona-state-capture
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    afp::Message as ProtoMessage,
    message::{AFP_TYPE_PERSONA_STATE, AfpPersonaStateContent},
};

const DEFAULT_PROFILE_ID: &str = "master-default";

#[derive(Debug, Clone)]
pub struct CapturedPersonaState {
    pub message_id: String,
    pub proto: ProtoMessage,
    pub content_json: Value,
}

#[derive(Debug, Clone)]
pub struct PersonaProfileSnapshot {
    pub mode: String,
    pub max_react_loops: u8,
    pub reflection_level: String,
    pub context_window_policy: String,
}

pub fn capture_persona_state(
    owner_user_id: &str,
    updated_by: &str,
    optimization_mode: &str,
    auto_confirm_threshold_cents: f64,
    show_cost_estimates: bool,
    default_store_in_history: bool,
    profile: Option<PersonaProfileSnapshot>,
) -> Option<CapturedPersonaState> {
    let profile = profile.unwrap_or_else(|| PersonaProfileSnapshot::from_mode(optimization_mode));
    let timestamp = Utc::now().to_rfc3339();
    let content = AfpPersonaStateContent {
        profile_id: DEFAULT_PROFILE_ID.to_string(),
        tone_mode: tone_mode_from_preferences(show_cost_estimates, &profile),
        initiative_level: initiative_level_from_profile(&profile),
        verbosity_level: verbosity_level_from_profile(&profile),
        caution_level: caution_level_from_preferences(auto_confirm_threshold_cents, &profile),
        continuity_anchors: continuity_anchors(
            default_store_in_history,
            auto_confirm_threshold_cents,
            &profile,
        ),
        updated_by: updated_by.to_string(),
        reason: "Updated from agent preference settings.".to_string(),
        effective_at: timestamp.clone(),
    };
    let content_json = serde_json::to_value(&content).ok()?;
    let metadata = json!({
        "store": true,
        "continuity": true,
        "source": "agent_preferences",
        "profile_id": content.profile_id,
    });
    let message_id = Ulid::new().to_string();

    Some(CapturedPersonaState {
        message_id: message_id.clone(),
        proto: ProtoMessage {
            protocol: "afp-v1".to_string(),
            id: message_id,
            thread_id: format!("continuity:persona:{owner_user_id}"),
            parent_id: String::new(),
            from: "persona_state_capture".to_string(),
            to: vec![owner_user_id.to_string()],
            timestamp,
            r#type: AFP_TYPE_PERSONA_STATE.to_string(),
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

impl PersonaProfileSnapshot {
    pub fn from_mode(mode: &str) -> Self {
        match mode {
            "speed" => Self {
                mode: "speed".to_string(),
                max_react_loops: 1,
                reflection_level: "minimal".to_string(),
                context_window_policy: "tight".to_string(),
            },
            "cost" => Self {
                mode: "cost".to_string(),
                max_react_loops: 1,
                reflection_level: "minimal".to_string(),
                context_window_policy: "compact".to_string(),
            },
            _ => Self {
                mode: "balanced".to_string(),
                max_react_loops: 3,
                reflection_level: "adaptive".to_string(),
                context_window_policy: "compact".to_string(),
            },
        }
    }
}

fn tone_mode_from_preferences(
    show_cost_estimates: bool,
    profile: &PersonaProfileSnapshot,
) -> String {
    if show_cost_estimates {
        match profile.mode.as_str() {
            "speed" => "neutral_direct".to_string(),
            "cost" => "calm_frugal".to_string(),
            _ => "warm_clear".to_string(),
        }
    } else {
        "neutral_direct".to_string()
    }
}

fn initiative_level_from_profile(profile: &PersonaProfileSnapshot) -> String {
    match profile.max_react_loops {
        0..=1 => "low".to_string(),
        2..=3 => "medium".to_string(),
        _ => "high".to_string(),
    }
}

fn verbosity_level_from_profile(profile: &PersonaProfileSnapshot) -> String {
    match profile.reflection_level.as_str() {
        "minimal" => "low".to_string(),
        "full" => "high".to_string(),
        _ => "medium".to_string(),
    }
}

fn caution_level_from_preferences(
    auto_confirm_threshold_cents: f64,
    profile: &PersonaProfileSnapshot,
) -> String {
    if auto_confirm_threshold_cents <= 0.0 {
        return "high".to_string();
    }
    match profile.mode.as_str() {
        "speed" => "low".to_string(),
        "cost" => "high".to_string(),
        _ => "medium".to_string(),
    }
}

fn continuity_anchors(
    default_store_in_history: bool,
    auto_confirm_threshold_cents: f64,
    profile: &PersonaProfileSnapshot,
) -> Vec<String> {
    let mut anchors = vec![format!("optimize_for:{}", profile.mode)];
    anchors.push(format!("context_window:{}", profile.context_window_policy));
    anchors.push(format!(
        "history_default:{}",
        if default_store_in_history {
            "store"
        } else {
            "ephemeral"
        }
    ));
    if auto_confirm_threshold_cents > 0.0 {
        anchors.push(format!(
            "auto_confirm_under_cents:{:.0}",
            auto_confirm_threshold_cents
        ));
    } else {
        anchors.push("auto_confirm_disabled".to_string());
    }
    anchors
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_profile(mode: &str) -> PersonaProfileSnapshot {
        PersonaProfileSnapshot::from_mode(mode)
    }

    #[test]
    fn capture_persona_state_emits_persona_afp() {
        let captured = capture_persona_state(
            "user_01",
            "user:user_01",
            "balanced",
            5.0,
            true,
            true,
            Some(sample_profile("balanced")),
        )
        .unwrap();
        assert_eq!(captured.proto.r#type, AFP_TYPE_PERSONA_STATE);
        assert!(
            captured
                .proto
                .metadata
                .contains("\"profile_id\":\"master-default\"")
        );
        assert_eq!(
            captured.content_json["tone_mode"].as_str(),
            Some("warm_clear")
        );
    }

    #[test]
    fn capture_persona_state_maps_cost_mode_to_higher_caution() {
        let captured = capture_persona_state(
            "user_01",
            "user:user_01",
            "cost",
            5.0,
            true,
            true,
            Some(sample_profile("cost")),
        )
        .unwrap();
        assert_eq!(
            captured.content_json["caution_level"].as_str(),
            Some("high")
        );
        assert_eq!(
            captured.content_json["initiative_level"].as_str(),
            Some("low")
        );
    }
}
