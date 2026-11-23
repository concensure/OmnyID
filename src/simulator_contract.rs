/*
 * @module-id: rust.simulator-contract
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};

use crate::{
    autonomy_policy::{AutonomyDecision, autonomy_decision_for_simulator_promotion_target},
    state_snapshot::StateSnapshotContent,
    state_synthesizer_contract::SynthesizerToMasterHandoff,
};

pub const SIMULATOR_CONTRACT_VERSION: &str = "simulator.v1";
pub const SIMULATOR_DEFAULT_NODE_CAP: usize = 48;
pub const SIMULATOR_DEFAULT_EDGE_CAP: usize = 96;
pub const SIMULATOR_DEFAULT_STEP_CAP: usize = 24;
pub const SIMULATOR_DEFAULT_ROLLOUT_CAP: usize = 3;
pub const SIMULATOR_DEFAULT_MEMORY_CAP_BYTES: usize = 256 * 1024;
pub const SIMULATOR_DEFAULT_ASSEMBLY_BUDGET_MS: u64 = 30;
pub const SIMULATOR_DEFAULT_EXECUTION_BUDGET_MS: u64 = 60;

pub const SIMULATOR_PROMOTION_PREPARED_CONTEXT: &str = "prepared_context";
pub const SIMULATOR_PROMOTION_PREPARED_DRAFT: &str = "prepared_draft";
pub const SIMULATOR_PROMOTION_REVERSIBLE_ACTION: &str = "reversible_action";
pub const SIMULATOR_PROMOTION_APPROVAL_REQUIRED: &str = "approval_required";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SimulatorGuardrails {
    pub node_cap: usize,
    pub edge_cap: usize,
    pub step_cap: usize,
    pub rollout_cap: usize,
    pub memory_cap_bytes: usize,
    pub assembly_budget_ms: u64,
    pub execution_budget_ms: u64,
    pub probabilistic_sampling_enabled: bool,
}

impl Default for SimulatorGuardrails {
    fn default() -> Self {
        Self {
            node_cap: SIMULATOR_DEFAULT_NODE_CAP,
            edge_cap: SIMULATOR_DEFAULT_EDGE_CAP,
            step_cap: SIMULATOR_DEFAULT_STEP_CAP,
            rollout_cap: SIMULATOR_DEFAULT_ROLLOUT_CAP,
            memory_cap_bytes: SIMULATOR_DEFAULT_MEMORY_CAP_BYTES,
            assembly_budget_ms: SIMULATOR_DEFAULT_ASSEMBLY_BUDGET_MS,
            execution_budget_ms: SIMULATOR_DEFAULT_EXECUTION_BUDGET_MS,
            probabilistic_sampling_enabled: false,
        }
    }
}

impl SimulatorGuardrails {
    pub fn normalized(self) -> Self {
        Self {
            node_cap: self.node_cap.clamp(1, SIMULATOR_DEFAULT_NODE_CAP),
            edge_cap: self.edge_cap.clamp(1, SIMULATOR_DEFAULT_EDGE_CAP),
            step_cap: self.step_cap.clamp(1, SIMULATOR_DEFAULT_STEP_CAP),
            rollout_cap: self.rollout_cap.clamp(1, SIMULATOR_DEFAULT_ROLLOUT_CAP),
            memory_cap_bytes: self
                .memory_cap_bytes
                .clamp(16 * 1024, SIMULATOR_DEFAULT_MEMORY_CAP_BYTES),
            assembly_budget_ms: self
                .assembly_budget_ms
                .clamp(1, SIMULATOR_DEFAULT_ASSEMBLY_BUDGET_MS),
            execution_budget_ms: self
                .execution_budget_ms
                .clamp(1, SIMULATOR_DEFAULT_EXECUTION_BUDGET_MS),
            probabilistic_sampling_enabled: self.probabilistic_sampling_enabled,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorRelevantStateSeed {
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub object_refs: Vec<String>,
    #[serde(default)]
    pub thread_refs: Vec<String>,
    #[serde(default)]
    pub active_state_fields: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_engine_focus_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_engine_focus_type: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SimulatorBoundaryInput {
    pub contract_version: String,
    pub snapshot_ref: String,
    pub snapshot: StateSnapshotContent,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synthesizer_handoff: Option<SynthesizerToMasterHandoff>,
    #[serde(default)]
    pub relevant_state: SimulatorRelevantStateSeed,
    #[serde(default)]
    pub guardrails: SimulatorGuardrails,
    #[serde(default)]
    pub ephemeral_trace: bool,
    #[serde(default)]
    pub allow_promotion: bool,
}

impl SimulatorBoundaryInput {
    pub fn new(
        snapshot_ref: impl Into<String>,
        snapshot: StateSnapshotContent,
        synthesizer_handoff: Option<SynthesizerToMasterHandoff>,
        relevant_state: SimulatorRelevantStateSeed,
    ) -> Self {
        Self {
            contract_version: SIMULATOR_CONTRACT_VERSION.to_string(),
            snapshot_ref: snapshot_ref.into(),
            snapshot,
            synthesizer_handoff,
            relevant_state,
            guardrails: SimulatorGuardrails::default(),
            ephemeral_trace: true,
            allow_promotion: true,
        }
    }

    pub fn normalized(mut self) -> Self {
        self.guardrails = self.guardrails.normalized();
        self
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorTraceSummary {
    pub summary: String,
    #[serde(default)]
    pub simulated_risks: Vec<String>,
    #[serde(default)]
    pub simulated_opportunities: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorPromotionReviewSurface {
    #[serde(default)]
    pub preview_only: bool,
    #[serde(default)]
    pub review_available: bool,
    pub boundary_summary: String,
    pub persistence_reason: String,
    pub provenance_summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance_cue: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_summary: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorPromotionCandidate {
    pub target_kind: String,
    pub summary: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub object_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autonomy_decision: Option<AutonomyDecision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_boundary: Option<String>,
    #[serde(default)]
    pub reversible: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_action_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_node_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_node_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review_surface: Option<SimulatorPromotionReviewSurface>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorRolloutSummary {
    pub surface: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub allow_promotion: bool,
    #[serde(default)]
    pub probabilistic_sampling_enabled: bool,
    #[serde(default)]
    pub review_surfaces_enabled: bool,
    pub rollout_stage: String,
    pub calibration_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub policy_summary: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorCalibrationSummary {
    pub confidence_posture: String,
    #[serde(default)]
    pub requires_human_review: bool,
    pub actionable_event_count: u32,
    pub rollouts_executed: u32,
    pub promotion_candidate_count: u32,
    pub review_surface_count: u32,
    #[serde(default)]
    pub policy_disabled: bool,
    #[serde(default)]
    pub promotions_suppressed: bool,
    #[serde(default)]
    pub queue_truncated: bool,
    #[serde(default)]
    pub timed_out: bool,
    #[serde(default)]
    pub memory_capped: bool,
    #[serde(default)]
    pub calibration_notes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SimulatorBoundaryOutput {
    pub contract_version: String,
    pub snapshot_ref: String,
    pub ephemeral_trace: bool,
    pub trace_summary: SimulatorTraceSummary,
    #[serde(default)]
    pub promotions: Vec<SimulatorPromotionCandidate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rollout: Option<SimulatorRolloutSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calibration: Option<SimulatorCalibrationSummary>,
}

impl SimulatorBoundaryOutput {
    pub fn new(
        snapshot_ref: impl Into<String>,
        ephemeral_trace: bool,
        trace_summary: SimulatorTraceSummary,
        promotions: Vec<SimulatorPromotionCandidate>,
    ) -> Self {
        Self {
            contract_version: SIMULATOR_CONTRACT_VERSION.to_string(),
            snapshot_ref: snapshot_ref.into(),
            ephemeral_trace,
            trace_summary,
            promotions,
            rollout: None,
            calibration: None,
        }
    }
}

fn simulator_boundary_summary(target_kind: &str) -> &'static str {
    match target_kind {
        SIMULATOR_PROMOTION_PREPARED_CONTEXT => {
            "Bounded simulator preview only. This remains prepared context and does not become durable state on its own."
        }
        SIMULATOR_PROMOTION_PREPARED_DRAFT => {
            "Bounded simulator preview only. This remains a prepared draft artifact until explicitly reviewed or promoted."
        }
        SIMULATOR_PROMOTION_REVERSIBLE_ACTION => {
            "Bounded simulator preview only. This stays inside reversible execution pathways and does not execute external work."
        }
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED => {
            "Bounded simulator preview only. This remains approval-gated and does not execute external work."
        }
        _ => {
            "Bounded simulator preview only. This remains non-authoritative until routed through an existing product pathway."
        }
    }
}

fn simulator_persistence_reason(target_kind: &str) -> &'static str {
    match target_kind {
        SIMULATOR_PROMOTION_PREPARED_CONTEXT => {
            "Persist only as prepared context through the existing continuity packet lane."
        }
        SIMULATOR_PROMOTION_PREPARED_DRAFT => {
            "Persist only as a prepared draft artifact through the existing draft lane."
        }
        SIMULATOR_PROMOTION_REVERSIBLE_ACTION => {
            "Persist only as a reversible preview through the existing reversible-action review lane."
        }
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED => {
            "Persist only as an approval preview through the existing approval-review lane."
        }
        _ => "Persist only through existing prepared, reversible, or approval pathways.",
    }
}

fn simulator_provenance_summary(source_refs: &[String], object_refs: &[String]) -> String {
    let source_count = source_refs.len();
    let object_count = object_refs.len();
    match (source_count, object_count) {
        (0, 0) => {
            "Traceable to bounded simulator evidence in the current continuity state.".to_string()
        }
        (sources, 0) => format!(
            "Traceable to {sources} source ref{} in the current continuity state.",
            if sources == 1 { "" } else { "s" }
        ),
        (0, objects) => format!(
            "Traceable to {objects} object anchor{} in the current continuity state.",
            if objects == 1 { "" } else { "s" }
        ),
        (sources, objects) => format!(
            "Traceable to {sources} source ref{} and {objects} object anchor{} in the current continuity state.",
            if sources == 1 { "" } else { "s" },
            if objects == 1 { "" } else { "s" }
        ),
    }
}

fn simulator_provenance_cue(source_refs: &[String], object_refs: &[String]) -> Option<String> {
    if !source_refs.is_empty() {
        Some("Grounded in current continuity source refs.".to_string())
    } else if !object_refs.is_empty() {
        Some("Grounded in current continuity object anchors.".to_string())
    } else {
        None
    }
}

fn simulator_source_summary(source_refs: &[String]) -> Option<String> {
    let count = source_refs.len();
    if count == 0 {
        None
    } else {
        Some(format!(
            "Based on {count} source{}.",
            if count == 1 { "" } else { "s" }
        ))
    }
}

pub fn simulator_promotion_candidate(
    target_kind: &str,
    summary: impl Into<String>,
    source_refs: Vec<String>,
    object_refs: Vec<String>,
) -> SimulatorPromotionCandidate {
    let (approval_boundary, reversible) = match target_kind {
        SIMULATOR_PROMOTION_REVERSIBLE_ACTION => (None, true),
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED => {
            (Some("user_approval_required".to_string()), false)
        }
        _ => (None, false),
    };
    let autonomy_decision = Some(autonomy_decision_for_simulator_promotion_target(
        target_kind,
    ));
    let review_surface = Some(SimulatorPromotionReviewSurface {
        preview_only: true,
        review_available: true,
        boundary_summary: simulator_boundary_summary(target_kind).to_string(),
        persistence_reason: simulator_persistence_reason(target_kind).to_string(),
        provenance_summary: simulator_provenance_summary(&source_refs, &object_refs),
        provenance_cue: simulator_provenance_cue(&source_refs, &object_refs),
        source_summary: simulator_source_summary(&source_refs),
    });

    SimulatorPromotionCandidate {
        target_kind: target_kind.to_string(),
        summary: summary.into(),
        source_refs,
        object_refs,
        autonomy_decision,
        approval_boundary,
        reversible,
        preview_action_kind: None,
        preview_node_kind: None,
        preview_node_label: None,
        review_surface,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulator_boundary_input_defaults_to_ephemeral_trace() {
        let input = SimulatorBoundaryInput::new(
            "snapshot:test",
            StateSnapshotContent::default(),
            None,
            SimulatorRelevantStateSeed::default(),
        );

        assert_eq!(input.contract_version, SIMULATOR_CONTRACT_VERSION);
        assert!(input.ephemeral_trace);
        assert!(input.allow_promotion);
        assert_eq!(input.guardrails, SimulatorGuardrails::default());
    }

    #[test]
    fn simulator_guardrails_are_clamped_to_bounded_defaults() {
        let input = SimulatorBoundaryInput {
            contract_version: SIMULATOR_CONTRACT_VERSION.to_string(),
            snapshot_ref: "snapshot:test".to_string(),
            snapshot: StateSnapshotContent::default(),
            synthesizer_handoff: None,
            relevant_state: SimulatorRelevantStateSeed::default(),
            guardrails: SimulatorGuardrails {
                node_cap: 10_000,
                edge_cap: 10_000,
                step_cap: 10_000,
                rollout_cap: 10_000,
                memory_cap_bytes: usize::MAX,
                assembly_budget_ms: 10_000,
                execution_budget_ms: 10_000,
                probabilistic_sampling_enabled: true,
            },
            ephemeral_trace: true,
            allow_promotion: true,
        }
        .normalized();

        assert_eq!(input.guardrails.node_cap, SIMULATOR_DEFAULT_NODE_CAP);
        assert_eq!(input.guardrails.edge_cap, SIMULATOR_DEFAULT_EDGE_CAP);
        assert_eq!(input.guardrails.step_cap, SIMULATOR_DEFAULT_STEP_CAP);
        assert_eq!(input.guardrails.rollout_cap, SIMULATOR_DEFAULT_ROLLOUT_CAP);
        assert_eq!(
            input.guardrails.memory_cap_bytes,
            SIMULATOR_DEFAULT_MEMORY_CAP_BYTES
        );
        assert_eq!(
            input.guardrails.assembly_budget_ms,
            SIMULATOR_DEFAULT_ASSEMBLY_BUDGET_MS
        );
        assert_eq!(
            input.guardrails.execution_budget_ms,
            SIMULATOR_DEFAULT_EXECUTION_BUDGET_MS
        );
        assert!(input.guardrails.probabilistic_sampling_enabled);
    }

    #[test]
    fn simulator_promotions_reuse_existing_autonomy_and_boundary_vocabulary() {
        let reversible = simulator_promotion_candidate(
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
            "Alternative path is low-risk if reversed quickly.",
            vec!["msg:1".to_string()],
            vec!["thread:1".to_string()],
        );
        let approval = simulator_promotion_candidate(
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
            "Conflict is likely without a manual decision.",
            vec!["msg:2".to_string()],
            vec!["thread:2".to_string()],
        );

        assert_eq!(
            reversible.target_kind,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION
        );
        assert!(reversible.reversible);
        assert!(reversible.approval_boundary.is_none());
        assert_eq!(approval.target_kind, SIMULATOR_PROMOTION_APPROVAL_REQUIRED);
        assert!(!approval.reversible);
        assert_eq!(
            approval.approval_boundary.as_deref(),
            Some("user_approval_required")
        );
        assert_eq!(
            approval
                .review_surface
                .as_ref()
                .map(|surface| surface.preview_only),
            Some(true)
        );
        assert_eq!(
            approval
                .review_surface
                .as_ref()
                .and_then(|surface| surface.provenance_cue.as_deref()),
            Some("Grounded in current continuity source refs.")
        );
        assert!(
            approval
                .review_surface
                .as_ref()
                .map(|surface| surface.boundary_summary.contains("approval-gated"))
                .unwrap_or(false)
        );
    }
}
