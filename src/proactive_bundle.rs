use serde_json::Value;

use crate::{
    autonomy_policy::AutonomyDecision,
    proactive_engine::{
        apply_proactive_autonomy_to_suggestion_value, build_suggestion_afp, EvaluationResult,
    },
    proactive_provenance::build_proactive_suggestion_provenance_afp,
};

#[derive(Debug, Clone)]
pub struct ProactiveSuggestionAfpBundle {
    pub suggestion_afp: Value,
    pub companion_afps: Vec<Value>,
}

pub fn build_suggestion_afp_bundle(
    owner_user_id: &str,
    thread_id: &str,
    result: &EvaluationResult,
    source_event_afp_id: Option<&str>,
) -> ProactiveSuggestionAfpBundle {
    let suggestion_afp =
        build_suggestion_afp(owner_user_id, thread_id, result, source_event_afp_id);
    let companion_afps = build_proactive_suggestion_provenance_afp(owner_user_id, &suggestion_afp)
        .into_iter()
        .collect();

    ProactiveSuggestionAfpBundle {
        suggestion_afp,
        companion_afps,
    }
}

pub fn build_suggestion_afp_bundle_with_autonomy(
    owner_user_id: &str,
    thread_id: &str,
    result: &EvaluationResult,
    source_event_afp_id: Option<&str>,
    autonomy_tier: &str,
    autonomy_decision: &AutonomyDecision,
) -> ProactiveSuggestionAfpBundle {
    let mut suggestion_afp =
        build_suggestion_afp(owner_user_id, thread_id, result, source_event_afp_id);
    apply_proactive_autonomy_to_suggestion_value(
        &mut suggestion_afp,
        autonomy_tier,
        autonomy_decision,
    );
    let companion_afps = build_proactive_suggestion_provenance_afp(owner_user_id, &suggestion_afp)
        .into_iter()
        .collect();

    ProactiveSuggestionAfpBundle {
        suggestion_afp,
        companion_afps,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        autonomy_policy::{autonomy_decision_for_proactive_enum, ProactiveAutonomyTier},
        message::{
            AfpPassiveEventContent, AfpProactiveSuggestionContent, AFP_SUBTYPE_EMAIL_THREAD_IDLE,
        },
        proactive_engine::{builtin_heuristics, evaluate},
    };
    use serde_json::json;

    #[test]
    fn bundle_adds_provenance_for_action_driving_suggestion() {
        let event = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_EMAIL_THREAD_IDLE.to_string(),
            payload: None,
            context: None,
            source: "email".to_string(),
            entity_id: Some("thread_123".to_string()),
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({ "idle_hours": 72.0 }),
        };
        let results = evaluate(&event, AFP_SUBTYPE_EMAIL_THREAD_IDLE, &builtin_heuristics());
        let bundle =
            build_suggestion_afp_bundle("user_1", "passive:user_1", &results[0], Some("msg_1"));

        assert_eq!(bundle.companion_afps.len(), 1);
        assert_eq!(
            bundle.companion_afps[0]["parent_id"].as_str(),
            bundle.suggestion_afp["id"].as_str()
        );
        assert_eq!(
            bundle.companion_afps[0]["content"]["source_message_ids"][0].as_str(),
            Some("msg_1")
        );
    }

    #[test]
    fn bundle_with_autonomy_hashes_final_suggestion_shape() {
        let event = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_EMAIL_THREAD_IDLE.to_string(),
            payload: None,
            context: None,
            source: "email".to_string(),
            entity_id: Some("thread_123".to_string()),
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({ "idle_hours": 72.0 }),
        };
        let results = evaluate(&event, AFP_SUBTYPE_EMAIL_THREAD_IDLE, &builtin_heuristics());
        let autonomy_tier = ProactiveAutonomyTier::NotifyThenAct;
        let autonomy_decision = autonomy_decision_for_proactive_enum(autonomy_tier);
        let bundle = build_suggestion_afp_bundle_with_autonomy(
            "user_1",
            "passive:user_1",
            &results[0],
            Some("msg_1"),
            autonomy_tier.as_str(),
            &autonomy_decision,
        );

        assert_eq!(
            bundle.suggestion_afp["content"]["autonomy_tier"].as_str(),
            Some("notify_then_act")
        );
        assert_eq!(bundle.companion_afps.len(), 1);
        assert_eq!(
            bundle.companion_afps[0]["parent_id"].as_str(),
            bundle.suggestion_afp["id"].as_str()
        );
        assert_eq!(
            bundle.companion_afps[0]["content"]["context"]["approval_policy"].as_str(),
            Some("approval_required")
        );
        assert_eq!(
            bundle.companion_afps[0]["content"]["input_hashes"][0]["label"].as_str(),
            Some("proactive_suggestion")
        );
    }

    #[test]
    fn bundle_does_not_add_provenance_for_low_touch_policies() {
        let cases = [
            ("defer", 0.7, "medium", None),
            ("suppress", 0.3, "low", None),
            ("background_only", 0.9, "medium", Some("background_only")),
        ];

        for (expected_action, confidence, urgency, surface_hint) in cases {
            let result = EvaluationResult {
                heuristic_id: format!("policy-{expected_action}"),
                suggestion: AfpProactiveSuggestionContent {
                    heuristic_id: format!("policy-{expected_action}"),
                    confidence,
                    urgency: urgency.to_string(),
                    action_label: "Review later".to_string(),
                    description: "Keep this as a low-touch suggestion.".to_string(),
                    surface_hint: surface_hint.map(str::to_string),
                    ..Default::default()
                },
            };

            let bundle =
                build_suggestion_afp_bundle("user_1", "passive:user_1", &result, Some("msg_1"));

            assert_eq!(
                bundle.suggestion_afp["content"]["strategic_policy"]["action"].as_str(),
                Some(expected_action)
            );
            assert!(
                bundle.companion_afps.is_empty(),
                "{expected_action} should not create companion provenance"
            );
        }
    }
}
