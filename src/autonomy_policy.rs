/*
 * @module-id: rust.autonomy-policy
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionAutonomy {
    Silent,
    SoftConfirm,
    HardConfirm,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PersonalAutonomyLevel {
    ObserveOnly,
    PrepareSilently,
    DraftSilently,
    SuggestWithArtifact,
    ExecuteReversible,
    RequestApproval,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConsequenceLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InterruptionBudget {
    None,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProactiveAutonomyTier {
    AskAlways,
    NotifyThenAct,
    AutoExecute,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutonomyDecision {
    pub autonomy_level: PersonalAutonomyLevel,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_autonomy: Option<ActionAutonomy>,
    pub consequence: ConsequenceLevel,
    pub interruption_budget: InterruptionBudget,
    pub reversible: bool,
    pub approval_required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
}

impl AutonomyDecision {
    pub fn prepare_silently(rationale: impl Into<String>) -> Self {
        Self {
            autonomy_level: PersonalAutonomyLevel::PrepareSilently,
            action_autonomy: Some(ActionAutonomy::Silent),
            consequence: ConsequenceLevel::Low,
            interruption_budget: InterruptionBudget::None,
            reversible: true,
            approval_required: false,
            rationale: Some(rationale.into()),
        }
    }

    pub fn suggest_with_artifact(rationale: impl Into<String>) -> Self {
        Self {
            autonomy_level: PersonalAutonomyLevel::SuggestWithArtifact,
            action_autonomy: None,
            consequence: ConsequenceLevel::Medium,
            interruption_budget: InterruptionBudget::Low,
            reversible: true,
            approval_required: false,
            rationale: Some(rationale.into()),
        }
    }

    pub fn execute_reversible(rationale: impl Into<String>) -> Self {
        Self {
            autonomy_level: PersonalAutonomyLevel::ExecuteReversible,
            action_autonomy: Some(ActionAutonomy::SoftConfirm),
            consequence: ConsequenceLevel::Low,
            interruption_budget: InterruptionBudget::Low,
            reversible: true,
            approval_required: false,
            rationale: Some(rationale.into()),
        }
    }

    pub fn request_approval(rationale: impl Into<String>) -> Self {
        Self {
            autonomy_level: PersonalAutonomyLevel::RequestApproval,
            action_autonomy: Some(ActionAutonomy::HardConfirm),
            consequence: ConsequenceLevel::High,
            interruption_budget: InterruptionBudget::High,
            reversible: false,
            approval_required: true,
            rationale: Some(rationale.into()),
        }
    }
}

pub fn personal_level_for_action_autonomy(autonomy: ActionAutonomy) -> PersonalAutonomyLevel {
    match autonomy {
        ActionAutonomy::Silent => PersonalAutonomyLevel::PrepareSilently,
        ActionAutonomy::SoftConfirm => PersonalAutonomyLevel::ExecuteReversible,
        ActionAutonomy::HardConfirm => PersonalAutonomyLevel::RequestApproval,
    }
}

pub fn autonomy_decision_for_proactive_tier(tier: &str) -> AutonomyDecision {
    autonomy_decision_for_proactive_enum(
        ProactiveAutonomyTier::parse(tier).unwrap_or(ProactiveAutonomyTier::AskAlways),
    )
}

pub fn autonomy_decision_for_proactive_enum(tier: ProactiveAutonomyTier) -> AutonomyDecision {
    match tier {
        ProactiveAutonomyTier::AutoExecute => AutonomyDecision::execute_reversible(
            "Policy allows low-risk reversible proactive execution.",
        ),
        ProactiveAutonomyTier::NotifyThenAct => AutonomyDecision::suggest_with_artifact(
            "Policy prefers surfacing the prepared action before execution.",
        ),
        ProactiveAutonomyTier::AskAlways => AutonomyDecision::request_approval(
            "Policy requires explicit user review before proactive execution.",
        ),
    }
}

pub fn autonomy_decision_for_browser_task(step_approval_required: bool) -> AutonomyDecision {
    if step_approval_required {
        AutonomyDecision::request_approval(
            "Browser task requires explicit step approval before interactive execution.",
        )
    } else {
        AutonomyDecision::prepare_silently(
            "Browser task is scoped to silent read or preparation work.",
        )
    }
}

pub fn autonomy_decision_for_watcher_alert(
    severity: &str,
    rationale: impl Into<String>,
) -> AutonomyDecision {
    let (consequence, interruption_budget) = match severity.trim() {
        "urgent" => (ConsequenceLevel::High, InterruptionBudget::High),
        "important" => (ConsequenceLevel::Medium, InterruptionBudget::Medium),
        _ => (ConsequenceLevel::Low, InterruptionBudget::Low),
    };

    AutonomyDecision {
        autonomy_level: PersonalAutonomyLevel::SuggestWithArtifact,
        action_autonomy: Some(ActionAutonomy::SoftConfirm),
        consequence,
        interruption_budget,
        reversible: true,
        approval_required: false,
        rationale: Some(rationale.into()),
    }
}

pub fn autonomy_decision_for_smart_suggestion(
    confidence: f64,
    rationale: impl Into<String>,
) -> AutonomyDecision {
    let interruption_budget = if confidence >= 0.9 {
        InterruptionBudget::Medium
    } else {
        InterruptionBudget::Low
    };

    AutonomyDecision {
        autonomy_level: PersonalAutonomyLevel::SuggestWithArtifact,
        action_autonomy: Some(ActionAutonomy::SoftConfirm),
        consequence: ConsequenceLevel::Low,
        interruption_budget,
        reversible: true,
        approval_required: false,
        rationale: Some(rationale.into()),
    }
}

pub fn autonomy_decision_for_personal_automation_ignore(
    rationale: impl Into<String>,
) -> AutonomyDecision {
    AutonomyDecision::prepare_silently(rationale)
}

pub fn autonomy_decision_for_personal_automation_prepare(
    rationale: impl Into<String>,
) -> AutonomyDecision {
    AutonomyDecision::suggest_with_artifact(rationale)
}

pub fn autonomy_decision_for_personal_automation_request_approval(
    rationale: impl Into<String>,
) -> AutonomyDecision {
    AutonomyDecision::request_approval(rationale)
}

pub fn autonomy_decision_for_internal_reversible_action(
    rationale: impl Into<String>,
) -> AutonomyDecision {
    AutonomyDecision::execute_reversible(rationale)
}

pub fn autonomy_decision_for_explicit_approval_boundary(
    rationale: impl Into<String>,
) -> AutonomyDecision {
    AutonomyDecision::request_approval(rationale)
}

pub fn autonomy_decision_for_wait_resume_family(
    resume_family: &str,
    approval_rationale: impl Into<String>,
    non_approval_rationale: impl Into<String>,
) -> AutonomyDecision {
    if resume_family.trim() == "approval" {
        AutonomyDecision::request_approval(approval_rationale)
    } else {
        AutonomyDecision::prepare_silently(non_approval_rationale)
    }
}

pub fn autonomy_decision_for_synthesizer_handoff(
    approval_required: bool,
    escalation_required: bool,
    actionable_surface_recommendation: bool,
) -> AutonomyDecision {
    if approval_required {
        AutonomyDecision::request_approval("Snapshot contains approval-required work.")
    } else if escalation_required || actionable_surface_recommendation {
        AutonomyDecision::suggest_with_artifact("Snapshot surfaced actionable work for review.")
    } else {
        AutonomyDecision::prepare_silently(
            "Snapshot can continue gathering context without interrupting the user.",
        )
    }
}

pub fn autonomy_decision_for_simulator_promotion_target(target_kind: &str) -> AutonomyDecision {
    match target_kind {
        "prepared_context" => AutonomyDecision::prepare_silently(
            "Promote simulated context through the prepared-context path only.",
        ),
        "prepared_draft" => AutonomyDecision::suggest_with_artifact(
            "Promote simulated next steps through the prepared-draft path only.",
        ),
        "reversible_action" => AutonomyDecision::execute_reversible(
            "Promote simulated action only through reversible execution pathways.",
        ),
        "approval_required" => AutonomyDecision::request_approval(
            "Promote simulated action only through approval-gated pathways.",
        ),
        _ => AutonomyDecision::prepare_silently(
            "Unknown simulator promotion target stays non-authoritative.",
        ),
    }
}

pub fn autonomy_decision_for_simulator_action_kind(action_kind: &str) -> AutonomyDecision {
    match action_kind {
        "defer_task" => AutonomyDecision::execute_reversible(
            "Deferral stays inside reversible planning pathways until confirmed.",
        ),
        "flag_conflict" => AutonomyDecision::suggest_with_artifact(
            "Conflict flags should surface as prepared context first.",
        ),
        "propose_alternative" => AutonomyDecision::suggest_with_artifact(
            "Alternative paths should surface as prepared drafts or summaries.",
        ),
        "send_summary" => AutonomyDecision::request_approval(
            "Any simulated outbound summary must stay approval-gated before delivery.",
        ),
        "schedule_meeting" => AutonomyDecision::request_approval(
            "Meeting scheduling proposals must stay approval-gated before any external commit.",
        ),
        _ => AutonomyDecision::prepare_silently(
            "Unknown simulator action stays in a non-authoritative preparation lane.",
        ),
    }
}

pub fn autonomy_decision_for_revert_checkpoint(reversible: bool) -> AutonomyDecision {
    if reversible {
        AutonomyDecision::execute_reversible(
            "Checkpoint registers a reversible action and its undo boundary.",
        )
    } else {
        AutonomyDecision::request_approval(
            "Checkpoint refers to an action that is not safely reversible without review.",
        )
    }
}

pub fn autonomy_decision_for_revert_request(pre_approved: bool) -> AutonomyDecision {
    if pre_approved {
        AutonomyDecision::execute_reversible(
            "Revert request is already approved and can proceed as a compensating action.",
        )
    } else {
        AutonomyDecision::request_approval(
            "Revert request still requires explicit confirmation before compensating action.",
        )
    }
}

pub fn autonomy_decision_for_revert_result() -> AutonomyDecision {
    AutonomyDecision::execute_reversible(
        "Revert result records the outcome of a reversible compensating action.",
    )
}

impl ProactiveAutonomyTier {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "ask_always" => Some(Self::AskAlways),
            "notify_then_act" => Some(Self::NotifyThenAct),
            "auto_execute" => Some(Self::AutoExecute),
            _ => None,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::AskAlways => "ask_always",
            Self::NotifyThenAct => "notify_then_act",
            Self::AutoExecute => "auto_execute",
        }
    }

    pub fn from_confidence(confidence: f64) -> Self {
        if confidence > 0.9 {
            Self::AutoExecute
        } else if confidence >= 0.7 {
            Self::NotifyThenAct
        } else {
            Self::AskAlways
        }
    }

    pub fn cap_to_proactivity_level(self, level: i32) -> Self {
        match level {
            1 => Self::AskAlways,
            2 => match self {
                Self::AutoExecute => Self::NotifyThenAct,
                _ => self,
            },
            _ => self,
        }
    }
}

pub const fn proactive_tier_for_requires_approval(
    requires_approval: bool,
) -> ProactiveAutonomyTier {
    if requires_approval {
        ProactiveAutonomyTier::AskAlways
    } else {
        ProactiveAutonomyTier::NotifyThenAct
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_autonomy_maps_to_personal_levels() {
        assert_eq!(
            personal_level_for_action_autonomy(ActionAutonomy::Silent),
            PersonalAutonomyLevel::PrepareSilently
        );
        assert_eq!(
            personal_level_for_action_autonomy(ActionAutonomy::SoftConfirm),
            PersonalAutonomyLevel::ExecuteReversible
        );
        assert_eq!(
            personal_level_for_action_autonomy(ActionAutonomy::HardConfirm),
            PersonalAutonomyLevel::RequestApproval
        );
    }

    #[test]
    fn proactive_tiers_map_to_shared_policy() {
        assert_eq!(
            autonomy_decision_for_proactive_tier("auto_execute").autonomy_level,
            PersonalAutonomyLevel::ExecuteReversible
        );
        assert_eq!(
            autonomy_decision_for_proactive_tier("notify_then_act").autonomy_level,
            PersonalAutonomyLevel::SuggestWithArtifact
        );
        assert_eq!(
            autonomy_decision_for_proactive_tier("ask_always").autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
    }

    #[test]
    fn proactive_tier_helpers_stay_canonical() {
        assert_eq!(
            ProactiveAutonomyTier::parse("notify_then_act"),
            Some(ProactiveAutonomyTier::NotifyThenAct)
        );
        assert_eq!(
            ProactiveAutonomyTier::from_confidence(0.95).as_str(),
            "auto_execute"
        );
        assert_eq!(
            ProactiveAutonomyTier::AutoExecute
                .cap_to_proactivity_level(2)
                .as_str(),
            "notify_then_act"
        );
        assert_eq!(
            ProactiveAutonomyTier::NotifyThenAct
                .cap_to_proactivity_level(1)
                .as_str(),
            "ask_always"
        );
        assert_eq!(
            proactive_tier_for_requires_approval(true).as_str(),
            "ask_always"
        );
        assert_eq!(
            proactive_tier_for_requires_approval(false).as_str(),
            "notify_then_act"
        );
    }

    #[test]
    fn browser_task_policy_matches_step_approval() {
        assert_eq!(
            autonomy_decision_for_browser_task(false).autonomy_level,
            PersonalAutonomyLevel::PrepareSilently
        );
        assert_eq!(
            autonomy_decision_for_browser_task(true).autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
    }

    #[test]
    fn watcher_alert_policy_matches_severity() {
        let urgent = autonomy_decision_for_watcher_alert("urgent", "Escalate now.");
        assert_eq!(
            urgent.autonomy_level,
            PersonalAutonomyLevel::SuggestWithArtifact
        );
        assert_eq!(urgent.action_autonomy, Some(ActionAutonomy::SoftConfirm));
        assert_eq!(urgent.consequence, ConsequenceLevel::High);
        assert_eq!(urgent.interruption_budget, InterruptionBudget::High);
        assert_eq!(urgent.rationale.as_deref(), Some("Escalate now."));

        let gentle = autonomy_decision_for_watcher_alert("gentle", "Keep visible.");
        assert_eq!(gentle.consequence, ConsequenceLevel::Low);
        assert_eq!(gentle.interruption_budget, InterruptionBudget::Low);
    }

    #[test]
    fn smart_suggestion_policy_matches_confidence() {
        let high_confidence = autonomy_decision_for_smart_suggestion(0.95, "Prepared quietly.");
        assert_eq!(
            high_confidence.autonomy_level,
            PersonalAutonomyLevel::SuggestWithArtifact
        );
        assert_eq!(
            high_confidence.action_autonomy,
            Some(ActionAutonomy::SoftConfirm)
        );
        assert_eq!(high_confidence.consequence, ConsequenceLevel::Low);
        assert_eq!(
            high_confidence.interruption_budget,
            InterruptionBudget::Medium
        );
        assert_eq!(
            high_confidence.rationale.as_deref(),
            Some("Prepared quietly.")
        );

        let low_confidence = autonomy_decision_for_smart_suggestion(0.55, "Prepared quietly.");
        assert_eq!(low_confidence.interruption_budget, InterruptionBudget::Low);
    }

    #[test]
    fn personal_automation_helpers_map_to_shared_policy_levels() {
        assert_eq!(
            autonomy_decision_for_personal_automation_ignore("Observed only.").autonomy_level,
            PersonalAutonomyLevel::PrepareSilently
        );
        assert_eq!(
            autonomy_decision_for_personal_automation_prepare("Prepared review artifact.")
                .autonomy_level,
            PersonalAutonomyLevel::SuggestWithArtifact
        );
        assert_eq!(
            autonomy_decision_for_personal_automation_request_approval("Needs approval.")
                .autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
    }

    #[test]
    fn internal_reversible_action_helper_uses_execute_reversible_boundary() {
        let decision = autonomy_decision_for_internal_reversible_action(
            "Safe internal action remains reversible.",
        );
        assert_eq!(
            decision.autonomy_level,
            PersonalAutonomyLevel::ExecuteReversible
        );
        assert_eq!(decision.action_autonomy, Some(ActionAutonomy::SoftConfirm));
        assert!(decision.reversible);
        assert!(!decision.approval_required);
    }

    #[test]
    fn revert_policy_helpers_match_reversible_boundaries() {
        assert_eq!(
            autonomy_decision_for_revert_checkpoint(true).autonomy_level,
            PersonalAutonomyLevel::ExecuteReversible
        );
        assert_eq!(
            autonomy_decision_for_revert_request(false).autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
        assert_eq!(
            autonomy_decision_for_revert_result().autonomy_level,
            PersonalAutonomyLevel::ExecuteReversible
        );
    }

    #[test]
    fn explicit_approval_boundary_helper_preserves_request_approval_lane() {
        let decision =
            autonomy_decision_for_explicit_approval_boundary("Approval boundary remains explicit.");
        assert_eq!(
            decision.autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
        assert_eq!(decision.action_autonomy, Some(ActionAutonomy::HardConfirm));
        assert!(decision.approval_required);
    }

    #[test]
    fn wait_resume_family_helper_preserves_approval_and_nonapproval_lanes() {
        assert_eq!(
            autonomy_decision_for_wait_resume_family(
                "approval",
                "Approval resume.",
                "Passive resume."
            )
            .autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
        assert_eq!(
            autonomy_decision_for_wait_resume_family(
                "timer",
                "Approval resume.",
                "Passive resume."
            )
            .autonomy_level,
            PersonalAutonomyLevel::PrepareSilently
        );
    }

    #[test]
    fn synthesizer_handoff_helper_matches_existing_boundaries() {
        assert_eq!(
            autonomy_decision_for_synthesizer_handoff(true, false, false).autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
        assert_eq!(
            autonomy_decision_for_synthesizer_handoff(false, true, false).autonomy_level,
            PersonalAutonomyLevel::SuggestWithArtifact
        );
        assert_eq!(
            autonomy_decision_for_synthesizer_handoff(false, false, false).autonomy_level,
            PersonalAutonomyLevel::PrepareSilently
        );
    }

    #[test]
    fn simulator_promotion_helper_matches_existing_boundaries() {
        assert_eq!(
            autonomy_decision_for_simulator_promotion_target("prepared_context").autonomy_level,
            PersonalAutonomyLevel::PrepareSilently
        );
        assert_eq!(
            autonomy_decision_for_simulator_promotion_target("prepared_draft").autonomy_level,
            PersonalAutonomyLevel::SuggestWithArtifact
        );
        assert_eq!(
            autonomy_decision_for_simulator_promotion_target("reversible_action").autonomy_level,
            PersonalAutonomyLevel::ExecuteReversible
        );
        assert_eq!(
            autonomy_decision_for_simulator_promotion_target("approval_required").autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
    }

    #[test]
    fn simulator_action_helper_matches_existing_boundaries() {
        assert_eq!(
            autonomy_decision_for_simulator_action_kind("defer_task").autonomy_level,
            PersonalAutonomyLevel::ExecuteReversible
        );
        assert_eq!(
            autonomy_decision_for_simulator_action_kind("flag_conflict").autonomy_level,
            PersonalAutonomyLevel::SuggestWithArtifact
        );
        assert_eq!(
            autonomy_decision_for_simulator_action_kind("send_summary").autonomy_level,
            PersonalAutonomyLevel::RequestApproval
        );
        assert_eq!(
            autonomy_decision_for_simulator_action_kind("unknown").autonomy_level,
            PersonalAutonomyLevel::PrepareSilently
        );
    }
}
