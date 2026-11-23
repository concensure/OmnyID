/*
 * @module-id: rust.server.proactive-ranking-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(crate) type ProactiveGroundingRank = (u8, u8, u8);
pub(crate) type ProactiveSuggestionRank = (
    u8,
    u8,
    u8,
    u8,
    u8,
    ProactiveGroundingRank,
    u8,
    u8,
    u8,
    u8,
    u8,
);
pub(crate) type StateFieldSelectionRank = (u8, u8, u8, u8, u8, std::cmp::Reverse<usize>, String);

pub(crate) fn proactive_kind_rank(kind: &str, requires_approval: bool) -> u8 {
    match kind {
        "continuity_priority" if requires_approval => 0,
        "prepared_draft" => 1,
        "simulator_approval_preview" => 2,
        "simulator_conflict_fusion" => 3,
        "context_ready" => 3,
        "continuity_priority" => 4,
        "simulator_reversible_preview" => 4,
        "context_pack" => 4,
        "state_field" => 4,
        _ => 4,
    }
}

pub(crate) fn proactive_artifact_rank(
    kind: &str,
    draft_class: &str,
    pack_kind: &str,
    field_key: &str,
    due_hint: &str,
    requires_approval: bool,
    unresolved_decisions_field_key: &str,
) -> u8 {
    match draft_class {
        "comparison_table" | "decision_memo" => 0,
        "communication_reply"
            if requires_approval || crate::timing_hints::due_hint_is_immediate(due_hint) =>
        {
            1
        }
        "follow_up_draft" | "communication_reply" => 2,
        "meeting_brief" | "project_prep_note" | "task_bundle" => 3,
        _ if kind == "simulator_approval_preview" => 1,
        _ if kind == "simulator_conflict_fusion" => 2,
        _ if kind == "simulator_reversible_preview" => 3,
        _ if kind == "context_ready" => 3,
        _ if kind == "state_field" && requires_approval => 0,
        _ if kind == "state_field" && field_key == unresolved_decisions_field_key => 1,
        _ if kind == "state_field" => 4,
        _ if kind == "context_pack" && pack_kind == "obligation_pack" => 4,
        _ if kind == "context_pack" => 5,
        _ if kind == "prepared_draft" => 4,
        _ => 6,
    }
}

pub(crate) fn proactive_readiness_rank(readiness: &str) -> u8 {
    match readiness {
        "ready_now" => 0,
        "ready" => 1,
        "prepared" => 2,
        _ => 3,
    }
}

pub(crate) fn proactive_confidence_rank(confidence: &str) -> u8 {
    match confidence {
        "high" => 0,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    }
}

pub(crate) fn proactive_reference_rank(kind: &str, reference_ref_count: usize) -> u8 {
    if kind == "context_pack" && reference_ref_count > 0 {
        0
    } else {
        1
    }
}

pub(crate) fn proactive_approval_rank(requires_approval: bool) -> u8 {
    if requires_approval { 0 } else { 1 }
}

pub(crate) fn state_field_confidence_rank(confidence: &str) -> Option<u8> {
    match confidence {
        "high" => Some(0),
        "medium" => Some(1),
        _ => None,
    }
}

pub(crate) fn state_field_kind_rank(
    field_key: &str,
    approval_required_work_field_key: &str,
    unresolved_decisions_field_key: &str,
) -> u8 {
    match field_key {
        value if value == approval_required_work_field_key => 0,
        value if value == unresolved_decisions_field_key => 1,
        _ => 2,
    }
}

pub(crate) fn state_field_surface_rank(surface_hint: &str) -> u8 {
    match surface_hint {
        "decision_queue" => 0,
        "response_queue" => 1,
        "context_panel" => 2,
        "home" => 3,
        _ => 4,
    }
}

pub(crate) fn state_field_requires_approval_rank(autonomy_level: &str) -> u8 {
    if autonomy_level == "request_approval" {
        0
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::{
        proactive_approval_rank, proactive_artifact_rank, proactive_confidence_rank,
        proactive_kind_rank, proactive_readiness_rank, proactive_reference_rank,
        state_field_confidence_rank, state_field_kind_rank, state_field_requires_approval_rank,
        state_field_surface_rank,
    };

    #[test]
    fn proactive_kind_rank_prefers_approval_gated_priority_items() {
        assert!(
            proactive_kind_rank("continuity_priority", true)
                < proactive_kind_rank("prepared_draft", false)
        );
    }

    #[test]
    fn proactive_artifact_rank_prefers_urgent_replies_and_state_field_decisions() {
        assert!(
            proactive_artifact_rank(
                "prepared_draft",
                "communication_reply",
                "",
                "",
                "today",
                false,
                "state.unresolved_decisions",
            ) < proactive_artifact_rank(
                "prepared_draft",
                "task_bundle",
                "",
                "",
                "",
                false,
                "state.unresolved_decisions",
            )
        );
        assert!(
            proactive_artifact_rank(
                "state_field",
                "",
                "",
                "state.unresolved_decisions",
                "",
                false,
                "state.unresolved_decisions",
            ) < proactive_artifact_rank(
                "context_pack",
                "",
                "topic_pack",
                "",
                "",
                false,
                "state.unresolved_decisions",
            )
        );
    }

    #[test]
    fn proactive_rank_helpers_preserve_expected_ordering() {
        assert!(proactive_readiness_rank("ready_now") < proactive_readiness_rank("prepared"));
        assert!(proactive_confidence_rank("high") < proactive_confidence_rank("low"));
        assert!(
            proactive_reference_rank("context_pack", 1)
                < proactive_reference_rank("context_pack", 0)
        );
        assert!(proactive_approval_rank(true) < proactive_approval_rank(false));
    }

    #[test]
    fn state_field_rank_helpers_preserve_expected_ordering() {
        assert_eq!(state_field_confidence_rank("high"), Some(0));
        assert_eq!(state_field_confidence_rank("low"), None);
        assert!(
            state_field_kind_rank(
                "state.approval_required_work",
                "state.approval_required_work",
                "state.unresolved_decisions",
            ) < state_field_kind_rank(
                "state.project_scope_drift",
                "state.approval_required_work",
                "state.unresolved_decisions",
            )
        );
        assert!(state_field_surface_rank("decision_queue") < state_field_surface_rank("home"));
        assert!(
            state_field_requires_approval_rank("request_approval")
                < state_field_requires_approval_rank("auto")
        );
    }
}
