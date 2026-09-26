use serde::{Deserialize, Serialize};

use crate::message::AfpProactiveSuggestionContent;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProactiveStrategicAction {
    SurfaceNow,
    Defer,
    Suppress,
    AskApproval,
    BackgroundOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProactiveStrategicPolicy {
    pub action: ProactiveStrategicAction,
    pub surface_policy: String,
    pub approval_policy: String,
    pub rationale: String,
}

pub fn policy_for_proactive_suggestion(
    suggestion: &AfpProactiveSuggestionContent,
) -> ProactiveStrategicPolicy {
    if suggestion.requires_approval {
        return ProactiveStrategicPolicy {
            action: ProactiveStrategicAction::AskApproval,
            surface_policy: "surface_now".to_string(),
            approval_policy: "approval_required".to_string(),
            rationale: "Suggestion may lead to a consequential action and needs explicit approval."
                .to_string(),
        };
    }

    let confidence = suggestion.confidence.clamp(0.0, 1.0);
    let urgency = suggestion.urgency.trim();
    let surface_hint = suggestion
        .surface_hint
        .as_deref()
        .unwrap_or_default()
        .trim();

    if confidence < 0.45 {
        return ProactiveStrategicPolicy {
            action: ProactiveStrategicAction::Suppress,
            surface_policy: "suppress".to_string(),
            approval_policy: "no_side_effect".to_string(),
            rationale: "Confidence is below the proactive surface threshold.".to_string(),
        };
    }

    if matches!(surface_hint, "background" | "background_only" | "silent") {
        return ProactiveStrategicPolicy {
            action: ProactiveStrategicAction::BackgroundOnly,
            surface_policy: "background_only".to_string(),
            approval_policy: "no_side_effect".to_string(),
            rationale: "Surface hint keeps this as background preparation.".to_string(),
        };
    }

    if urgency == "high" || confidence >= 0.85 {
        return ProactiveStrategicPolicy {
            action: ProactiveStrategicAction::SurfaceNow,
            surface_policy: "surface_now".to_string(),
            approval_policy: "no_side_effect".to_string(),
            rationale:
                "Urgency or confidence is high enough to surface without claiming execution."
                    .to_string(),
        };
    }

    ProactiveStrategicPolicy {
        action: ProactiveStrategicAction::Defer,
        surface_policy: "defer".to_string(),
        approval_policy: "no_side_effect".to_string(),
        rationale: "Suggestion is useful but can wait for a calmer review moment.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn suggestion(confidence: f64, urgency: &str) -> AfpProactiveSuggestionContent {
        AfpProactiveSuggestionContent {
            heuristic_id: "test".to_string(),
            confidence,
            urgency: urgency.to_string(),
            action_label: "Review".to_string(),
            description: "Review this".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn approval_required_suggestions_ask_approval() {
        let mut suggestion = suggestion(0.95, "high");
        suggestion.requires_approval = true;

        let policy = policy_for_proactive_suggestion(&suggestion);

        assert_eq!(policy.action, ProactiveStrategicAction::AskApproval);
        assert_eq!(policy.approval_policy, "approval_required");
        assert_eq!(policy.surface_policy, "surface_now");
    }

    #[test]
    fn low_confidence_suggestions_are_suppressed() {
        let policy = policy_for_proactive_suggestion(&suggestion(0.3, "low"));

        assert_eq!(policy.action, ProactiveStrategicAction::Suppress);
        assert_eq!(policy.surface_policy, "suppress");
    }

    #[test]
    fn background_surface_hint_stays_background_only() {
        let mut suggestion = suggestion(0.9, "medium");
        suggestion.surface_hint = Some("background_only".to_string());

        let policy = policy_for_proactive_suggestion(&suggestion);

        assert_eq!(policy.action, ProactiveStrategicAction::BackgroundOnly);
        assert_eq!(policy.surface_policy, "background_only");
    }

    #[test]
    fn high_urgency_surfaces_now_without_side_effects() {
        let policy = policy_for_proactive_suggestion(&suggestion(0.7, "high"));

        assert_eq!(policy.action, ProactiveStrategicAction::SurfaceNow);
        assert_eq!(policy.approval_policy, "no_side_effect");
    }
}
