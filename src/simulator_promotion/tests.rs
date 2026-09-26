use super::*;
use crate::{
    simulator_contract::{
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED, SimulatorBoundaryInput, SimulatorRelevantStateSeed,
    },
    simulator_graph::{
        SimulatorRelevantStateEdge, SimulatorRelevantStateGraph, SimulatorRelevantStateNode,
    },
    simulator_loop::SimulatorTraceStep,
    state_snapshot::StateSnapshotContent,
};

fn sample_input() -> SimulatorBoundaryInput {
    SimulatorBoundaryInput::new(
        "snapshot:test",
        StateSnapshotContent::default(),
        None,
        SimulatorRelevantStateSeed::default(),
    )
}

fn sample_graph() -> SimulatorRelevantStateGraph {
    SimulatorRelevantStateGraph {
        contract_version: "simulator.v1".to_string(),
        snapshot_ref: "snapshot:test".to_string(),
        node_cap: 32,
        edge_cap: 64,
        nodes_truncated: false,
        edges_truncated: false,
        budget_exhausted: false,
        assembly_time_ms: 1,
        nodes: vec![
            SimulatorRelevantStateNode {
                node_id: "commitment:1".to_string(),
                node_kind: "commitment".to_string(),
                label: "Customer demo".to_string(),
                urgency: Some("today".to_string()),
                confidence: Some("high".to_string()),
                source_refs: vec!["msg:1".to_string()],
                object_refs: vec!["project:aurora".to_string()],
            },
            SimulatorRelevantStateNode {
                node_id: "change:1".to_string(),
                node_kind: "critical_change".to_string(),
                label: "Calendar conflict".to_string(),
                urgency: Some("urgent".to_string()),
                confidence: Some("high".to_string()),
                source_refs: vec!["msg:2".to_string()],
                object_refs: Vec::new(),
            },
        ],
        edges: vec![SimulatorRelevantStateEdge {
            from_node_id: "root:snapshot:test".to_string(),
            to_node_id: "commitment:1".to_string(),
            relation_kind: "queue_pressure".to_string(),
        }],
    }
}

#[test]
fn build_simulator_promotions_reuses_existing_target_kinds() {
    let promotions = build_simulator_promotions(
        &sample_input(),
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:change:1".to_string(),
                event_kind: "inspect_change_impact".to_string(),
                node_id: "change:1".to_string(),
                node_kind: "critical_change".to_string(),
                node_label: "Calendar conflict".to_string(),
                action_kind: "flag_conflict".to_string(),
                action_label: "Flag likely conflict".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_CONTEXT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:commitment:1".to_string(),
                event_kind: "check_commitment_timing".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "commitment".to_string(),
                node_label: "Customer demo".to_string(),
                action_kind: "defer_task".to_string(),
                action_label: "Defer task safely".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(promotions.len(), 2);
    assert!(
        promotions
            .iter()
            .any(|promotion| promotion.target_kind == SIMULATOR_PROMOTION_PREPARED_CONTEXT)
    );
    assert!(
        promotions
            .iter()
            .any(|promotion| promotion.target_kind == SIMULATOR_PROMOTION_REVERSIBLE_ACTION)
    );
    assert!(
        promotions
            .iter()
            .any(|promotion| promotion.source_refs.contains(&"msg:1".to_string()))
    );
    assert_eq!(
        promotions
            .iter()
            .find(|promotion| promotion.target_kind == SIMULATOR_PROMOTION_REVERSIBLE_ACTION)
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("defer_task")
    );
}

#[test]
fn build_simulator_promotions_respects_allow_promotion() {
    let mut input = sample_input();
    input.allow_promotion = false;
    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[SimulatorTraceStep {
            rollout_index: 0,
            step_index: 0,
            event_id: "event:commitment:1".to_string(),
            event_kind: "check_commitment_timing".to_string(),
            node_id: "commitment:1".to_string(),
            node_kind: "commitment".to_string(),
            node_label: "Customer demo".to_string(),
            action_kind: "defer_task".to_string(),
            action_label: "Defer task safely".to_string(),
            promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
            summary: String::new(),
            preconditions: Vec::new(),
            postconditions: Vec::new(),
        }],
    );

    assert!(promotions.is_empty());
}

#[test]
fn build_simulator_promotions_carries_field_guided_summary_when_available() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_summary = Some(
        "Relationship field shows high pressure with density 0.72 and momentum -0.41.".to_string(),
    );
    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[SimulatorTraceStep {
            rollout_index: 0,
            step_index: 0,
            event_id: "event:commitment:1".to_string(),
            event_kind: "check_commitment_timing".to_string(),
            node_id: "commitment:1".to_string(),
            node_kind: "commitment".to_string(),
            node_label: "Customer demo".to_string(),
            action_kind: "defer_task".to_string(),
            action_label: "Defer task safely".to_string(),
            promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
            summary: String::new(),
            preconditions: Vec::new(),
            postconditions: Vec::new(),
        }],
    );

    assert!(
        promotions
            .first()
            .map(|promotion| promotion
                .summary
                .contains("Field-guided by Relationship field"))
            .unwrap_or(false)
    );
}

#[test]
fn relationship_focus_prioritizes_approval_preview_before_reversible_preview() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("relationship".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:commitment:1".to_string(),
                event_kind: "check_commitment_timing".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "commitment".to_string(),
                node_label: "Customer demo".to_string(),
                action_kind: "defer_task".to_string(),
                action_label: "Defer task safely".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:response:1".to_string(),
                event_kind: "review_follow_up_window".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "response".to_string(),
                node_label: "Reply to customer".to_string(),
                action_kind: "send_summary".to_string(),
                action_label: "Prepare summary send".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_APPROVAL_REQUIRED.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_APPROVAL_REQUIRED)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("send_summary")
    );
}

#[test]
fn project_focus_prefers_decision_based_prepared_draft_step() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("project".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:response:1".to_string(),
                event_kind: "review_follow_up_window".to_string(),
                node_id: "change:1".to_string(),
                node_kind: "response".to_string(),
                node_label: "Reply to thread".to_string(),
                action_kind: "propose_alternative".to_string(),
                action_label: "Propose alternative".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:decision:1".to_string(),
                event_kind: "review_decision_path".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "decision".to_string(),
                node_label: "Approve architecture".to_string(),
                action_kind: "propose_alternative".to_string(),
                action_label: "Propose alternative".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_PREPARED_DRAFT)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_node_kind.as_deref()),
        Some("decision")
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_node_label.as_deref()),
        Some("Approve architecture")
    );
}

#[test]
fn goal_focus_prioritizes_prepared_draft_before_reversible_preview() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("goal".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:commitment:1".to_string(),
                event_kind: "check_commitment_timing".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "commitment".to_string(),
                node_label: "Customer demo".to_string(),
                action_kind: "defer_task".to_string(),
                action_label: "Defer task safely".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:commitment:2".to_string(),
                event_kind: "check_commitment_timing".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "commitment".to_string(),
                node_label: "Customer demo".to_string(),
                action_kind: "schedule_meeting".to_string(),
                action_label: "Schedule meeting".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_PREPARED_DRAFT)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("schedule_meeting")
    );
}

#[test]
fn opportunity_focus_prefers_decision_based_prepared_draft_before_context_preview() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("opportunity".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:change:1".to_string(),
                event_kind: "monitor_change".to_string(),
                node_id: "change:1".to_string(),
                node_kind: "critical_change".to_string(),
                node_label: "Requirement shift".to_string(),
                action_kind: "flag_conflict".to_string(),
                action_label: "Flag conflict".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_CONTEXT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:decision:1".to_string(),
                event_kind: "review_decision_path".to_string(),
                node_id: "decision:1".to_string(),
                node_kind: "decision".to_string(),
                node_label: "Choose launch path".to_string(),
                action_kind: "propose_alternative".to_string(),
                action_label: "Propose alternative".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_PREPARED_DRAFT)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("propose_alternative")
    );
}

#[test]
fn knowledge_focus_prefers_context_refresh_before_decision_draft_preview() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("knowledge".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:decision:1".to_string(),
                event_kind: "review_decision_path".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "decision".to_string(),
                node_label: "Choose evidence path".to_string(),
                action_kind: "propose_alternative".to_string(),
                action_label: "Propose alternative".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:context:1".to_string(),
                event_kind: "inspect_connected_context".to_string(),
                node_id: "change:1".to_string(),
                node_kind: "context_item".to_string(),
                node_label: "Stale evidence cluster".to_string(),
                action_kind: "flag_conflict".to_string(),
                action_label: "Flag likely conflict".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_CONTEXT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_PREPARED_CONTEXT)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("flag_conflict")
    );
}

#[test]
fn interest_focus_prefers_context_cluster_preview_before_decision_draft_preview() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("interest".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:decision:1".to_string(),
                event_kind: "review_decision_path".to_string(),
                node_id: "decision:1".to_string(),
                node_kind: "decision".to_string(),
                node_label: "Choose topic path".to_string(),
                action_kind: "propose_alternative".to_string(),
                action_label: "Propose alternative".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:context:1".to_string(),
                event_kind: "inspect_connected_context".to_string(),
                node_id: "context:1".to_string(),
                node_kind: "context_item".to_string(),
                node_label: "Topic cluster".to_string(),
                action_kind: "flag_conflict".to_string(),
                action_label: "Flag likely conflict".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_CONTEXT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_PREPARED_CONTEXT)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("flag_conflict")
    );
}

#[test]
fn obligation_focus_prefers_readiness_draft_before_reversible_preview() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("obligation".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:commitment:1".to_string(),
                event_kind: "check_commitment_timing".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "commitment".to_string(),
                node_label: "Client handoff".to_string(),
                action_kind: "schedule_meeting".to_string(),
                action_label: "Schedule meeting".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:commitment:2".to_string(),
                event_kind: "check_commitment_timing".to_string(),
                node_id: "commitment:2".to_string(),
                node_kind: "commitment".to_string(),
                node_label: "Defer another task".to_string(),
                action_kind: "defer_task".to_string(),
                action_label: "Defer task safely".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_PREPARED_DRAFT)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("schedule_meeting")
    );
}

#[test]
fn attention_focus_prefers_prepared_draft_before_reversible_preview() {
    let mut input = sample_input();
    input.relevant_state.field_engine_focus_type = Some("attention".to_string());

    let promotions = build_simulator_promotions(
        &input,
        &sample_graph(),
        &[
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 0,
                event_id: "event:commitment:1".to_string(),
                event_kind: "check_commitment_timing".to_string(),
                node_id: "commitment:1".to_string(),
                node_kind: "commitment".to_string(),
                node_label: "Customer demo".to_string(),
                action_kind: "defer_task".to_string(),
                action_label: "Defer task safely".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
            SimulatorTraceStep {
                rollout_index: 0,
                step_index: 1,
                event_id: "event:response:1".to_string(),
                event_kind: "review_follow_up_window".to_string(),
                node_id: "response:1".to_string(),
                node_kind: "response".to_string(),
                node_label: "Reply to customer".to_string(),
                action_kind: "send_summary".to_string(),
                action_label: "Prepare summary send".to_string(),
                promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
                summary: String::new(),
                preconditions: Vec::new(),
                postconditions: Vec::new(),
            },
        ],
    );

    assert_eq!(
        promotions
            .first()
            .map(|promotion| promotion.target_kind.as_str()),
        Some(SIMULATOR_PROMOTION_PREPARED_DRAFT)
    );
    assert_eq!(
        promotions
            .first()
            .and_then(|promotion| promotion.preview_action_kind.as_deref()),
        Some("send_summary")
    );
}

#[test]
fn materialize_simulator_promotions_uses_existing_prepared_structures() {
    let mut context = simulator_promotion_candidate(
        SIMULATOR_PROMOTION_PREPARED_CONTEXT,
        "Prepare bounded context from flag_conflict around Calendar conflict.",
        vec!["msg:2".to_string()],
        vec!["project:aurora".to_string()],
    );
    context.preview_action_kind = Some("flag_conflict".to_string());

    let mut draft = simulator_promotion_candidate(
        SIMULATOR_PROMOTION_PREPARED_DRAFT,
        "Prepare alternative draft from propose_alternative around Customer demo.",
        vec!["msg:1".to_string()],
        vec!["project:aurora".to_string()],
    );
    draft.preview_action_kind = Some("propose_alternative".to_string());

    let mut reversible = simulator_promotion_candidate(
        SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
        "Suggest reversible next step from defer_task around Customer demo.",
        vec!["msg:1".to_string()],
        vec!["project:aurora".to_string()],
    );
    reversible.preview_action_kind = Some("defer_task".to_string());
    reversible.preview_node_label = Some("Customer demo".to_string());

    let mut approval = simulator_promotion_candidate(
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
        "Escalate approval-bound proposal from send_summary around Customer demo.",
        vec!["msg:1".to_string()],
        vec!["project:aurora".to_string()],
    );
    approval.preview_action_kind = Some("send_summary".to_string());
    approval.preview_node_label = Some("Customer demo".to_string());

    let preview = materialize_simulator_promotions(
        "user_01",
        "continuity:state:user_01",
        Some("snapshot_1"),
        &[context, draft, reversible, approval],
    );

    assert!(
        preview
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.ready)
            == Some(true)
    );
    assert_eq!(
        preview
            .prepared_draft_packet
            .as_ref()
            .and_then(|packet| packet.drafts.first())
            .map(|draft| draft.draft_class.as_str()),
        Some(PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE)
    );
    assert_eq!(
        preview
            .prepared_context_packet
            .as_ref()
            .and_then(|packet| packet.packs.first())
            .map(|pack| pack.pack_kind.as_str()),
        Some(PREPARED_CONTEXT_PACK_KIND_TOPIC)
    );
    assert_eq!(
        preview
            .reversible_action_bundle
            .as_ref()
            .and_then(|bundle| bundle.action_afp.get("subtype"))
            .and_then(Value::as_str),
        Some("draft_task")
    );
    assert_eq!(
        preview
            .approval_review
            .as_ref()
            .and_then(|review| review.get("approval_kind"))
            .and_then(Value::as_str),
        Some("send")
    );
}

#[test]
fn materialize_simulator_promotions_suppresses_review_only_previews_when_unavailable() {
    let mut reversible = simulator_promotion_candidate(
        SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
        "Suggest reversible next step from defer_task around Customer demo.",
        vec!["msg:1".to_string()],
        vec!["project:aurora".to_string()],
    );
    reversible.preview_action_kind = Some("defer_task".to_string());
    reversible.preview_node_label = Some("Customer demo".to_string());
    if let Some(review_surface) = reversible.review_surface.as_mut() {
        review_surface.review_available = false;
    }

    let mut approval = simulator_promotion_candidate(
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
        "Escalate approval-bound proposal from send_summary around Customer demo.",
        vec!["msg:1".to_string()],
        vec!["project:aurora".to_string()],
    );
    approval.preview_action_kind = Some("send_summary".to_string());
    approval.preview_node_label = Some("Customer demo".to_string());
    if let Some(review_surface) = approval.review_surface.as_mut() {
        review_surface.review_available = false;
    }

    let preview = materialize_simulator_promotions(
        "user_01",
        "continuity:state:user_01",
        Some("snapshot_1"),
        &[reversible, approval],
    );

    assert!(preview.reversible_action_bundle.is_none());
    assert!(preview.approval_review.is_none());
}
