use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::{
    field_engine_contract::field_type_from_primary_or_summary,
    simulator_contract::{
        SimulatorBoundaryInput, SimulatorBoundaryOutput, SimulatorCalibrationSummary,
        SimulatorRelevantStateSeed, SimulatorRolloutSummary, SimulatorTraceSummary,
    },
    simulator_graph::SimulatorRelevantStateGraph,
    simulator_promotion::build_simulator_promotions,
    simulator_rollout::{
        SimulatorRolloutPolicy, SimulatorRolloutSurface, load_simulator_rollout_policy,
    },
    simulator_runtime::{
        SimulatorActionCondition, SimulatorActionRegistryEntry, SimulatorQueuedEvent,
        build_bounded_simulator_event_queue, default_simulator_action_registry,
    },
};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorTraceStep {
    pub rollout_index: usize,
    pub step_index: usize,
    pub event_id: String,
    pub event_kind: String,
    pub node_id: String,
    pub node_kind: String,
    pub node_label: String,
    pub action_kind: String,
    pub action_label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub promotion_target: Option<String>,
    pub summary: String,
    #[serde(default)]
    pub preconditions: Vec<SimulatorActionCondition>,
    #[serde(default)]
    pub postconditions: Vec<SimulatorActionCondition>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorExecutionStats {
    pub rollouts_executed: usize,
    pub steps_executed: usize,
    pub actionable_events: usize,
    pub queue_events_considered: usize,
    pub queue_truncated: bool,
    pub timed_out: bool,
    pub memory_capped: bool,
    pub probabilistic_sampling_used: bool,
    pub trace_bytes_estimate: usize,
    #[serde(default)]
    pub policy_disabled: bool,
    #[serde(default)]
    pub promotions_suppressed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SimulatorExecutionResult {
    pub output: SimulatorBoundaryOutput,
    #[serde(default)]
    pub trace_steps: Vec<SimulatorTraceStep>,
    pub stats: SimulatorExecutionStats,
}

pub fn run_bounded_simulation(
    input: &SimulatorBoundaryInput,
    graph: &SimulatorRelevantStateGraph,
) -> SimulatorExecutionResult {
    let normalized = input.clone().normalized();
    let guardrails = normalized.guardrails.clone();
    let events = prioritize_events_by_field_focus(
        &normalized,
        build_bounded_simulator_event_queue(graph, guardrails.step_cap),
    );
    let registry = default_simulator_action_registry();
    let actionable_events = count_actionable_events(&events, &registry);
    let branchable = has_branchable_event(&events, &registry);
    let rollout_count = if guardrails.probabilistic_sampling_enabled && branchable {
        guardrails.rollout_cap
    } else {
        1
    };
    let queue_truncated = graph.nodes.len() > events.len();
    let started_at = Instant::now();
    let mut trace_steps = Vec::new();
    let mut stats = SimulatorExecutionStats {
        rollouts_executed: 0,
        steps_executed: 0,
        actionable_events,
        queue_events_considered: events.len(),
        queue_truncated,
        timed_out: false,
        memory_capped: false,
        probabilistic_sampling_used: rollout_count > 1,
        trace_bytes_estimate: 0,
        policy_disabled: false,
        promotions_suppressed: false,
    };

    for rollout_index in 0..rollout_count {
        if started_at.elapsed().as_millis() as u64 > guardrails.execution_budget_ms {
            stats.timed_out = true;
            break;
        }
        stats.rollouts_executed += 1;

        for (step_index, event) in events.iter().take(guardrails.step_cap).enumerate() {
            if started_at.elapsed().as_millis() as u64 > guardrails.execution_budget_ms {
                stats.timed_out = true;
                break;
            }

            let candidates = matching_actions(event, &registry);
            if candidates.is_empty() {
                continue;
            }

            let action = select_action_for_rollout(&normalized, event, &candidates, rollout_index);
            let step = build_trace_step(rollout_index, step_index, event, action);
            let step_bytes = estimate_step_bytes(&step);
            if stats.trace_bytes_estimate + step_bytes > guardrails.memory_cap_bytes {
                stats.memory_capped = true;
                break;
            }

            stats.trace_bytes_estimate += step_bytes;
            stats.steps_executed += 1;
            trace_steps.push(step);
        }

        if stats.timed_out || stats.memory_capped {
            break;
        }
    }

    let trace_summary = build_trace_summary(&normalized, &trace_steps, &stats);
    let promotions = build_simulator_promotions(&normalized, graph, &trace_steps);
    let output = SimulatorBoundaryOutput::new(
        normalized.snapshot_ref.clone(),
        normalized.ephemeral_trace,
        trace_summary,
        promotions,
    );

    SimulatorExecutionResult {
        output,
        trace_steps,
        stats,
    }
}

pub fn simulate_snapshot_projection(
    snapshot_ref: impl Into<String>,
    snapshot: crate::state_snapshot::StateSnapshotContent,
    synthesizer_handoff: Option<crate::state_synthesizer_contract::SynthesizerToMasterHandoff>,
) -> SimulatorExecutionResult {
    simulate_snapshot_projection_with_policy(
        snapshot_ref,
        snapshot,
        synthesizer_handoff,
        &load_simulator_rollout_policy(SimulatorRolloutSurface::Synthesizer),
    )
}

pub fn simulate_snapshot_projection_for_planning(
    snapshot_ref: impl Into<String>,
    snapshot: crate::state_snapshot::StateSnapshotContent,
    synthesizer_handoff: Option<crate::state_synthesizer_contract::SynthesizerToMasterHandoff>,
) -> SimulatorExecutionResult {
    simulate_snapshot_projection_with_policy(
        snapshot_ref,
        snapshot,
        synthesizer_handoff,
        &load_simulator_rollout_policy(SimulatorRolloutSurface::Planning),
    )
}

pub fn simulate_snapshot_projection_for_watcher(
    snapshot_ref: impl Into<String>,
    snapshot: crate::state_snapshot::StateSnapshotContent,
) -> SimulatorExecutionResult {
    simulate_snapshot_projection_with_policy(
        snapshot_ref,
        snapshot,
        None,
        &load_simulator_rollout_policy(SimulatorRolloutSurface::Watcher),
    )
}

pub fn simulate_snapshot_projection_with_policy(
    snapshot_ref: impl Into<String>,
    snapshot: crate::state_snapshot::StateSnapshotContent,
    synthesizer_handoff: Option<crate::state_synthesizer_contract::SynthesizerToMasterHandoff>,
    policy: &SimulatorRolloutPolicy,
) -> SimulatorExecutionResult {
    let relevant_state = relevant_state_seed_from_snapshot(&snapshot, synthesizer_handoff.as_ref());
    let snapshot_ref = snapshot_ref.into();

    if !policy.enabled {
        return SimulatorExecutionResult {
            output: apply_rollout_and_calibration_metadata(
                SimulatorBoundaryOutput::new(
                    snapshot_ref,
                    true,
                    SimulatorTraceSummary {
                        summary: policy.disabled_summary(),
                        simulated_risks: Vec::new(),
                        simulated_opportunities: Vec::new(),
                    },
                    Vec::new(),
                ),
                policy,
                &SimulatorExecutionStats {
                    policy_disabled: true,
                    promotions_suppressed: !policy.allow_promotion,
                    ..SimulatorExecutionStats::default()
                },
            ),
            trace_steps: Vec::new(),
            stats: SimulatorExecutionStats {
                policy_disabled: true,
                promotions_suppressed: !policy.allow_promotion,
                ..SimulatorExecutionStats::default()
            },
        };
    }

    let mut input = SimulatorBoundaryInput::new(
        snapshot_ref,
        snapshot.clone(),
        synthesizer_handoff,
        relevant_state,
    );
    input.allow_promotion = policy.allow_promotion;
    input.guardrails.probabilistic_sampling_enabled = policy.probabilistic_sampling_enabled;
    let input = input.normalized();
    let graph = crate::simulator_graph::build_relevant_state_graph(&input);
    let mut result = run_bounded_simulation(&input, &graph);
    result.stats.promotions_suppressed = !input.allow_promotion;
    result.output = apply_rollout_and_calibration_metadata(result.output, policy, &result.stats);
    result
}

fn apply_rollout_and_calibration_metadata(
    mut output: SimulatorBoundaryOutput,
    policy: &SimulatorRolloutPolicy,
    stats: &SimulatorExecutionStats,
) -> SimulatorBoundaryOutput {
    apply_review_surface_policy(&mut output, policy);
    let promotion_candidate_count = output.promotions.len() as u32;
    let review_surface_count = output
        .promotions
        .iter()
        .filter(|promotion| {
            promotion
                .review_surface
                .as_ref()
                .map(|surface| surface.review_available)
                .unwrap_or(false)
        })
        .count() as u32;
    let policy_summary = rollout_policy_summary(
        policy,
        stats,
        promotion_candidate_count,
        review_surface_count,
    );
    let calibration_notes = calibration_notes_for_policy_and_stats(
        policy,
        stats,
        promotion_candidate_count,
        review_surface_count,
    );
    output.rollout = Some(SimulatorRolloutSummary {
        surface: policy.surface.as_str().to_string(),
        enabled: policy.enabled,
        allow_promotion: policy.allow_promotion,
        probabilistic_sampling_enabled: policy.probabilistic_sampling_enabled,
        review_surfaces_enabled: policy.review_surfaces_enabled,
        rollout_stage: policy.rollout_stage.clone(),
        calibration_mode: policy.calibration_mode.clone(),
        policy_summary: Some(policy_summary),
    });
    output.calibration = Some(SimulatorCalibrationSummary {
        confidence_posture: policy.calibration_mode.clone(),
        requires_human_review: true,
        actionable_event_count: stats.actionable_events as u32,
        rollouts_executed: stats.rollouts_executed as u32,
        promotion_candidate_count,
        review_surface_count,
        policy_disabled: stats.policy_disabled,
        promotions_suppressed: stats.promotions_suppressed,
        queue_truncated: stats.queue_truncated,
        timed_out: stats.timed_out,
        memory_capped: stats.memory_capped,
        calibration_notes,
    });
    output
}

fn rollout_policy_summary(
    policy: &SimulatorRolloutPolicy,
    stats: &SimulatorExecutionStats,
    promotion_candidate_count: u32,
    review_surface_count: u32,
) -> String {
    if stats.policy_disabled || !policy.enabled {
        return format!(
            "Simulator preview is disabled for {} by rollout policy.",
            policy.surface.as_str()
        );
    }
    if !policy.allow_promotion {
        return format!(
            "Simulator preview stays bounded on {} without promotion write-back.",
            policy.surface.as_str()
        );
    }
    if policy.review_surfaces_enabled && review_surface_count > 0 {
        return format!(
            "Simulator preview stays bounded on {} with {} reviewable promotion candidate{}.",
            policy.surface.as_str(),
            promotion_candidate_count,
            if promotion_candidate_count == 1 {
                ""
            } else {
                "s"
            }
        );
    }
    format!(
        "Simulator preview stays bounded on {} without exposed review surfaces.",
        policy.surface.as_str()
    )
}

fn calibration_notes_for_policy_and_stats(
    policy: &SimulatorRolloutPolicy,
    stats: &SimulatorExecutionStats,
    promotion_candidate_count: u32,
    review_surface_count: u32,
) -> Vec<String> {
    let mut notes = Vec::new();
    if stats.policy_disabled || !policy.enabled {
        notes.push("Rollout policy disabled simulator execution for this surface.".to_string());
        return notes;
    }
    if policy.probabilistic_sampling_enabled && stats.probabilistic_sampling_used {
        notes.push("Probabilistic sampling stayed within the bounded rollout cap.".to_string());
    } else {
        notes.push("Deterministic bounded preview stayed within a single rollout.".to_string());
    }
    if !policy.allow_promotion || stats.promotions_suppressed {
        notes.push("Promotion write-back is suppressed by rollout policy.".to_string());
    } else if promotion_candidate_count > 0 {
        notes.push(format!(
            "{} promotion candidate{} remained bounded to existing product lanes.",
            promotion_candidate_count,
            if promotion_candidate_count == 1 {
                ""
            } else {
                "s"
            }
        ));
    }
    if !policy.review_surfaces_enabled {
        notes.push("Review surfaces are disabled for this rollout stage.".to_string());
    } else if review_surface_count > 0 {
        notes.push(format!(
            "{} review surface{} remained available for promoted previews.",
            review_surface_count,
            if review_surface_count == 1 { "" } else { "s" }
        ));
    }
    if stats.queue_truncated {
        notes.push("Relevant-state queue was truncated by the bounded step cap.".to_string());
    }
    if stats.timed_out {
        notes.push("Execution stopped at the bounded time budget.".to_string());
    }
    if stats.memory_capped {
        notes.push("Trace growth stopped at the bounded memory budget.".to_string());
    }
    notes
}

fn apply_review_surface_policy(
    output: &mut SimulatorBoundaryOutput,
    policy: &SimulatorRolloutPolicy,
) {
    if policy.review_surfaces_enabled {
        return;
    }

    for promotion in &mut output.promotions {
        if let Some(review_surface) = promotion.review_surface.as_mut() {
            review_surface.review_available = false;
        }
    }
}

fn relevant_state_seed_from_snapshot(
    snapshot: &crate::state_snapshot::StateSnapshotContent,
    synthesizer_handoff: Option<&crate::state_synthesizer_contract::SynthesizerToMasterHandoff>,
) -> SimulatorRelevantStateSeed {
    SimulatorRelevantStateSeed {
        source_refs: snapshot.sources.clone(),
        object_refs: snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.object_refs.clone())
            .unwrap_or_default(),
        thread_refs: snapshot
            .watcher_signals
            .iter()
            .map(|signal| signal.thread_id.clone())
            .filter(|thread_id| !thread_id.is_empty())
            .take(8)
            .collect(),
        active_state_fields: snapshot
            .state_fields
            .iter()
            .filter(|field| field.status == "active")
            .map(|field| field.field_key.clone())
            .take(8)
            .collect(),
        field_engine_focus_summary: synthesizer_handoff
            .filter(|handoff| handoff.field_engine_ready)
            .and_then(|handoff| handoff.field_engine_summary.clone()),
        field_engine_focus_type: synthesizer_handoff.and_then(|handoff| {
            if !handoff.field_engine_ready {
                return None;
            }
            field_type_from_primary_or_summary(
                handoff.field_engine_primary_type.as_deref(),
                handoff.field_engine_summary.as_deref(),
            )
            .map(str::to_string)
        }),
    }
}

fn build_trace_step(
    rollout_index: usize,
    step_index: usize,
    event: &SimulatorQueuedEvent,
    action: &SimulatorActionRegistryEntry,
) -> SimulatorTraceStep {
    SimulatorTraceStep {
        rollout_index,
        step_index,
        event_id: event.event_id.clone(),
        event_kind: event.event_kind.clone(),
        node_id: event.node_id.clone(),
        node_kind: event.node_kind.clone(),
        node_label: event.node_label.clone(),
        action_kind: action.action_kind.clone(),
        action_label: action.label.clone(),
        promotion_target: action.promotion_target.clone(),
        summary: format!(
            "{} via {} after {}.",
            action.label, event.event_kind, event.rationale
        ),
        preconditions: action.preconditions.clone(),
        postconditions: action.postconditions.clone(),
    }
}

fn matching_actions<'a>(
    event: &SimulatorQueuedEvent,
    registry: &'a [SimulatorActionRegistryEntry],
) -> Vec<&'a SimulatorActionRegistryEntry> {
    registry
        .iter()
        .filter(|entry| {
            entry
                .preconditions
                .iter()
                .any(|condition| condition.target_node_kind == event.node_kind)
        })
        .collect()
}

fn count_actionable_events(
    events: &[SimulatorQueuedEvent],
    registry: &[SimulatorActionRegistryEntry],
) -> usize {
    events
        .iter()
        .filter(|event| !matching_actions(event, registry).is_empty())
        .count()
}

fn has_branchable_event(
    events: &[SimulatorQueuedEvent],
    registry: &[SimulatorActionRegistryEntry],
) -> bool {
    events
        .iter()
        .any(|event| matching_actions(event, registry).len() > 1)
}

fn prioritize_events_by_field_focus(
    input: &SimulatorBoundaryInput,
    mut events: Vec<SimulatorQueuedEvent>,
) -> Vec<SimulatorQueuedEvent> {
    let focus = input.relevant_state.field_engine_focus_type.as_deref();
    events.sort_by_key(|event| {
        (
            event_focus_rank(event, focus),
            event.scheduled_minute_offset,
            event.priority,
            event.event_id.clone(),
        )
    });
    events
}

fn select_action_for_rollout<'a>(
    input: &SimulatorBoundaryInput,
    event: &SimulatorQueuedEvent,
    actions: &[&'a SimulatorActionRegistryEntry],
    rollout_index: usize,
) -> &'a SimulatorActionRegistryEntry {
    let focus = input.relevant_state.field_engine_focus_type.as_deref();
    let mut ordered = actions.to_vec();
    ordered.sort_by_key(|action| {
        (
            action_focus_rank(event, action, focus),
            action.action_kind.as_str(),
        )
    });
    ordered[rollout_index % ordered.len()]
}

fn event_focus_rank(event: &SimulatorQueuedEvent, focus: Option<&str>) -> u8 {
    match focus {
        Some("attention") => match event.node_kind.as_str() {
            "response" | "decision" | "state_field" => 0,
            "commitment" | "watcher_signal" | "critical_change" => 1,
            "prepared_draft" | "prepared_context" => 2,
            _ => 3,
        },
        Some("interest") => match event.node_kind.as_str() {
            "context_item" | "prepared_context" => 0,
            "decision" | "prepared_draft" => 1,
            "watcher_signal" | "critical_change" => 2,
            _ => 3,
        },
        Some("obligation") => match event.node_kind.as_str() {
            "commitment" => 0,
            "response" => 1,
            "prepared_draft" | "prepared_context" => 2,
            "decision" | "state_field" => 3,
            _ => 4,
        },
        Some("relationship") => match event.node_kind.as_str() {
            "response" | "commitment" | "watcher_signal" => 0,
            "state_field" => 1,
            _ => 2,
        },
        Some("project") => match event.node_kind.as_str() {
            "decision" | "context_item" | "prepared_context" | "prepared_draft" => 0,
            "state_field" | "critical_change" => 1,
            _ => 2,
        },
        Some("goal") => match event.node_kind.as_str() {
            "commitment" | "decision" | "prepared_draft" => 0,
            "prepared_context" | "context_item" => 1,
            "state_field" | "critical_change" => 2,
            _ => 3,
        },
        Some("opportunity") => match event.node_kind.as_str() {
            "decision" | "context_item" | "prepared_context" => 0,
            "critical_change" | "prepared_draft" => 1,
            "commitment" => 2,
            _ => 3,
        },
        Some("knowledge") => match event.node_kind.as_str() {
            "context_item" | "prepared_context" => 0,
            "decision" | "prepared_draft" => 1,
            "state_field" | "watcher_signal" | "critical_change" => 2,
            _ => 3,
        },
        _ => 1,
    }
}

fn action_focus_rank(
    event: &SimulatorQueuedEvent,
    action: &SimulatorActionRegistryEntry,
    focus: Option<&str>,
) -> u8 {
    match focus {
        Some("attention") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("response", "send_summary") => 0,
            ("commitment", "defer_task") => 0,
            ("decision", "propose_alternative") => 1,
            ("critical_change", "flag_conflict") => 1,
            _ => 2,
        },
        Some("interest") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("context_item", "flag_conflict") => 0,
            ("decision", "propose_alternative") => 1,
            ("critical_change", "flag_conflict") => 1,
            ("commitment", "defer_task") => 2,
            _ => 3,
        },
        Some("obligation") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("commitment", "schedule_meeting") => 0,
            ("response", "send_summary") => 0,
            ("commitment", "defer_task") => 1,
            ("decision", "propose_alternative") => 2,
            _ => 3,
        },
        Some("relationship") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("commitment", "schedule_meeting") => 0,
            ("response", "send_summary") => 0,
            ("commitment", "defer_task") => 1,
            _ => 2,
        },
        Some("project") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("decision", "propose_alternative") => 0,
            ("critical_change", "flag_conflict") => 0,
            ("commitment", "defer_task") => 1,
            _ => 2,
        },
        Some("goal") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("commitment", "schedule_meeting") => 0,
            ("commitment", "defer_task") => 1,
            ("decision", "propose_alternative") => 1,
            _ => 2,
        },
        Some("opportunity") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("decision", "propose_alternative") => 0,
            ("context_item", "flag_conflict") => 1,
            ("critical_change", "flag_conflict") => 1,
            _ => 2,
        },
        Some("knowledge") => match (event.node_kind.as_str(), action.action_kind.as_str()) {
            ("decision", "propose_alternative") => 0,
            ("context_item", "flag_conflict") => 1,
            ("critical_change", "flag_conflict") => 1,
            ("commitment", "defer_task") => 2,
            _ => 3,
        },
        _ => 1,
    }
}

fn estimate_step_bytes(step: &SimulatorTraceStep) -> usize {
    step.event_id.len()
        + step.event_kind.len()
        + step.node_id.len()
        + step.node_kind.len()
        + step.node_label.len()
        + step.action_kind.len()
        + step.action_label.len()
        + step.summary.len()
        + step
            .promotion_target
            .as_ref()
            .map_or(0, |target| target.len())
        + step
            .preconditions
            .iter()
            .map(condition_bytes)
            .sum::<usize>()
        + step
            .postconditions
            .iter()
            .map(condition_bytes)
            .sum::<usize>()
}

fn condition_bytes(condition: &SimulatorActionCondition) -> usize {
    condition.condition_kind.len() + condition.target_node_kind.len() + condition.detail.len()
}

fn build_trace_summary(
    input: &SimulatorBoundaryInput,
    trace_steps: &[SimulatorTraceStep],
    stats: &SimulatorExecutionStats,
) -> SimulatorTraceSummary {
    let simulated_risks = collect_distinct_lines(trace_steps, |step| {
        matches!(step.promotion_target.as_deref(), Some("approval_required"))
            .then(|| format!("Approval-gated branch surfaced for {}.", step.action_kind))
    });
    let simulated_opportunities =
        collect_distinct_lines(trace_steps, |step| match step.promotion_target.as_deref() {
            Some("prepared_context") => Some(format!(
                "Prepared context candidate surfaced for {}.",
                step.action_kind
            )),
            Some("prepared_draft") => Some(format!(
                "Prepared draft candidate surfaced for {}.",
                step.action_kind
            )),
            Some("reversible_action") => Some(format!(
                "Reversible action candidate surfaced for {}.",
                step.action_kind
            )),
            _ => None,
        });

    let summary = if trace_steps.is_empty() {
        "Bounded simulation found no actionable branches in the current relevant state.".to_string()
    } else {
        format!(
            "Bounded simulation traced {} step(s) across {} rollout(s) from {} actionable event(s).",
            stats.steps_executed, stats.rollouts_executed, stats.actionable_events
        )
    };
    let summary = if let Some(field_summary) = input
        .relevant_state
        .field_engine_focus_summary
        .as_ref()
        .filter(|summary| !summary.trim().is_empty())
    {
        format!("{summary} {field_summary}")
    } else {
        summary
    };
    let simulated_risks = if let Some(field_summary) = input
        .relevant_state
        .field_engine_focus_summary
        .as_ref()
        .filter(|summary| !summary.trim().is_empty())
    {
        let mut lines = simulated_risks;
        if !lines.iter().any(|line| line == field_summary) {
            lines.push(field_summary.clone());
        }
        lines
    } else {
        simulated_risks
    };

    SimulatorTraceSummary {
        summary,
        simulated_risks,
        simulated_opportunities,
    }
}

fn collect_distinct_lines<F>(trace_steps: &[SimulatorTraceStep], build: F) -> Vec<String>
where
    F: Fn(&SimulatorTraceStep) -> Option<String>,
{
    let mut lines = Vec::new();
    for step in trace_steps {
        if let Some(line) = build(step) {
            if !lines.contains(&line) {
                lines.push(line);
            }
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        simulator_contract::{SimulatorBoundaryInput, SimulatorRelevantStateSeed},
        simulator_graph::{
            SimulatorRelevantStateEdge, SimulatorRelevantStateGraph, SimulatorRelevantStateNode,
        },
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
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "response:1".to_string(),
                    node_kind: "response".to_string(),
                    label: "Reply to thread".to_string(),
                    urgency: Some("urgent".to_string()),
                    confidence: Some("medium".to_string()),
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
    fn bounded_simulation_defaults_to_single_rollout_without_sampling() {
        let mut input = sample_input();
        input.guardrails.step_cap = 2;
        input.guardrails.rollout_cap = 3;
        let result = run_bounded_simulation(&input, &sample_graph());

        assert_eq!(result.stats.rollouts_executed, 1);
        assert_eq!(result.stats.steps_executed, 2);
        assert!(!result.stats.probabilistic_sampling_used);
        assert_eq!(result.output.promotions.len(), 2);
        assert!(
            result
                .output
                .promotions
                .iter()
                .any(|promotion| promotion.target_kind == "reversible_action")
        );
    }

    #[test]
    fn bounded_simulation_caps_rollouts_when_sampling_is_enabled() {
        let mut input = sample_input();
        input.guardrails.step_cap = 2;
        input.guardrails.rollout_cap = 5;
        input.guardrails.probabilistic_sampling_enabled = true;
        let result = run_bounded_simulation(&input, &sample_graph());

        assert_eq!(result.stats.rollouts_executed, 3);
        assert!(result.stats.probabilistic_sampling_used);
        let commitment_actions = result
            .trace_steps
            .iter()
            .filter(|step| step.node_kind == "commitment")
            .map(|step| step.action_kind.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            commitment_actions,
            vec!["defer_task", "schedule_meeting", "defer_task"]
        );
    }

    #[test]
    fn trace_summary_carries_field_engine_focus_when_available() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_summary = Some(
            "Project field shows active pressure with density 0.63 and momentum -0.32.".to_string(),
        );

        let result = run_bounded_simulation(&input, &sample_graph());

        assert!(
            result
                .output
                .trace_summary
                .summary
                .contains("Project field shows active pressure")
        );
        assert!(
            result
                .output
                .trace_summary
                .simulated_risks
                .iter()
                .any(|line| line.contains("Project field shows active pressure"))
        );
    }

    #[test]
    fn relationship_focus_prioritizes_relationship_events_and_actions() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("relationship".to_string());
        input.guardrails.step_cap = 2;
        input.guardrails.rollout_cap = 2;
        input.guardrails.probabilistic_sampling_enabled = true;

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&sample_graph(), 3),
        );
        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("response")
        );

        let result = run_bounded_simulation(&input, &sample_graph());
        let commitment_actions = result
            .trace_steps
            .iter()
            .filter(|step| step.node_kind == "commitment")
            .map(|step| step.action_kind.as_str())
            .collect::<Vec<_>>();
        assert_eq!(commitment_actions, vec!["schedule_meeting", "defer_task"]);
    }

    #[test]
    fn project_focus_prioritizes_project_events() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("project".to_string());
        let graph = SimulatorRelevantStateGraph {
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
                    node_id: "decision:1".to_string(),
                    node_kind: "decision".to_string(),
                    label: "Approve architecture".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("high".to_string()),
                    source_refs: vec!["msg:1".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "response:1".to_string(),
                    node_kind: "response".to_string(),
                    label: "Reply to thread".to_string(),
                    urgency: Some("urgent".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:2".to_string()],
                    object_refs: Vec::new(),
                },
            ],
            edges: vec![SimulatorRelevantStateEdge {
                from_node_id: "root:snapshot:test".to_string(),
                to_node_id: "decision:1".to_string(),
                relation_kind: "queue_pressure".to_string(),
            }],
        };

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&graph, 3),
        );

        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("decision")
        );
    }

    #[test]
    fn goal_focus_prioritizes_commitment_events_and_meeting_actions() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("goal".to_string());
        input.guardrails.step_cap = 2;
        input.guardrails.rollout_cap = 2;
        input.guardrails.probabilistic_sampling_enabled = true;

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&sample_graph(), 3),
        );
        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("commitment")
        );

        let result = run_bounded_simulation(&input, &sample_graph());
        let commitment_actions = result
            .trace_steps
            .iter()
            .filter(|step| step.node_kind == "commitment")
            .map(|step| step.action_kind.as_str())
            .collect::<Vec<_>>();
        assert_eq!(commitment_actions, vec!["schedule_meeting", "defer_task"]);
    }

    #[test]
    fn opportunity_focus_prioritizes_decision_events_and_alternative_actions() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("opportunity".to_string());
        let graph = SimulatorRelevantStateGraph {
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
                    node_id: "decision:1".to_string(),
                    node_kind: "decision".to_string(),
                    label: "Choose launch path".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("high".to_string()),
                    source_refs: vec!["msg:1".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "commitment:1".to_string(),
                    node_kind: "commitment".to_string(),
                    label: "Launch sync".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:2".to_string()],
                    object_refs: Vec::new(),
                },
            ],
            edges: vec![SimulatorRelevantStateEdge {
                from_node_id: "root:snapshot:test".to_string(),
                to_node_id: "decision:1".to_string(),
                relation_kind: "queue_pressure".to_string(),
            }],
        };

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&graph, 3),
        );
        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("decision")
        );

        let registry = default_simulator_action_registry();
        let candidates = matching_actions(&events[0], &registry);
        let action = select_action_for_rollout(&input, &events[0], &candidates, 0);
        assert_eq!(action.action_kind, "propose_alternative");
    }

    #[test]
    fn knowledge_focus_prioritizes_context_events_and_decision_actions() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("knowledge".to_string());
        let graph = SimulatorRelevantStateGraph {
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
                    node_id: "context:1".to_string(),
                    node_kind: "context_item".to_string(),
                    label: "Stale evidence cluster".to_string(),
                    urgency: Some("high".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:1".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "decision:1".to_string(),
                    node_kind: "decision".to_string(),
                    label: "Choose evidence path".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("high".to_string()),
                    source_refs: vec!["msg:2".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "commitment:1".to_string(),
                    node_kind: "commitment".to_string(),
                    label: "Status sync".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:3".to_string()],
                    object_refs: Vec::new(),
                },
            ],
            edges: vec![SimulatorRelevantStateEdge {
                from_node_id: "root:snapshot:test".to_string(),
                to_node_id: "decision:1".to_string(),
                relation_kind: "queue_pressure".to_string(),
            }],
        };

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&graph, 4),
        );
        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("context_item")
        );

        let decision_event = events
            .iter()
            .find(|event| event.node_kind == "decision")
            .expect("decision event");
        let registry = default_simulator_action_registry();
        let candidates = matching_actions(decision_event, &registry);
        let action = select_action_for_rollout(&input, decision_event, &candidates, 0);
        assert_eq!(action.action_kind, "propose_alternative");
    }

    #[test]
    fn interest_focus_prioritizes_context_events_and_reference_actions() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("interest".to_string());
        let graph = SimulatorRelevantStateGraph {
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
                    node_id: "context:1".to_string(),
                    node_kind: "context_item".to_string(),
                    label: "Topic cluster".to_string(),
                    urgency: Some("high".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:1".to_string()],
                    object_refs: vec!["project_interest".to_string()],
                },
                SimulatorRelevantStateNode {
                    node_id: "decision:1".to_string(),
                    node_kind: "decision".to_string(),
                    label: "Choose exploration path".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("high".to_string()),
                    source_refs: vec!["msg:2".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "commitment:1".to_string(),
                    node_kind: "commitment".to_string(),
                    label: "Status sync".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:3".to_string()],
                    object_refs: Vec::new(),
                },
            ],
            edges: vec![SimulatorRelevantStateEdge {
                from_node_id: "root:snapshot:test".to_string(),
                to_node_id: "context:1".to_string(),
                relation_kind: "reference_cluster".to_string(),
            }],
        };

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&graph, 4),
        );
        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("context_item")
        );

        let decision_event = events
            .iter()
            .find(|event| event.node_kind == "decision")
            .expect("decision event");
        let registry = default_simulator_action_registry();
        let candidates = matching_actions(decision_event, &registry);
        let action = select_action_for_rollout(&input, decision_event, &candidates, 0);
        assert_eq!(action.action_kind, "propose_alternative");
    }

    #[test]
    fn obligation_focus_prioritizes_commitment_events_and_readiness_actions() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("obligation".to_string());
        let graph = SimulatorRelevantStateGraph {
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
                    label: "Client handoff".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("high".to_string()),
                    source_refs: vec!["calendar:1".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "response:1".to_string(),
                    node_kind: "response".to_string(),
                    label: "Reply to due thread".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:1".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "decision:1".to_string(),
                    node_kind: "decision".to_string(),
                    label: "Approve handoff".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:2".to_string()],
                    object_refs: Vec::new(),
                },
            ],
            edges: vec![SimulatorRelevantStateEdge {
                from_node_id: "root:snapshot:test".to_string(),
                to_node_id: "commitment:1".to_string(),
                relation_kind: "due_pressure".to_string(),
            }],
        };

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&graph, 4),
        );
        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("commitment")
        );

        let commitment_event = events
            .iter()
            .find(|event| event.node_kind == "commitment")
            .expect("commitment event");
        let registry = default_simulator_action_registry();
        let candidates = matching_actions(commitment_event, &registry);
        let action = select_action_for_rollout(&input, commitment_event, &candidates, 0);
        assert_eq!(action.action_kind, "schedule_meeting");
    }

    #[test]
    fn attention_focus_prioritizes_response_events_and_release_actions() {
        let mut input = sample_input();
        input.relevant_state.field_engine_focus_type = Some("attention".to_string());
        input.guardrails.step_cap = 2;
        input.guardrails.rollout_cap = 2;
        input.guardrails.probabilistic_sampling_enabled = true;

        let events = prioritize_events_by_field_focus(
            &input,
            build_bounded_simulator_event_queue(&sample_graph(), 3),
        );
        assert_eq!(
            events.first().map(|event| event.node_kind.as_str()),
            Some("response")
        );

        let result = run_bounded_simulation(&input, &sample_graph());
        let response_actions = result
            .trace_steps
            .iter()
            .filter(|step| step.node_kind == "response")
            .map(|step| step.action_kind.as_str())
            .collect::<Vec<_>>();
        assert!(response_actions.contains(&"send_summary"));
    }

    #[test]
    fn bounded_simulation_respects_memory_cap() {
        let mut input = sample_input();
        input.guardrails.step_cap = 24;
        input.guardrails.memory_cap_bytes = 16 * 1024;
        let mut graph = sample_graph();
        graph.nodes = (0..24)
            .map(|index| SimulatorRelevantStateNode {
                node_id: format!("response:{index}"),
                node_kind: "response".to_string(),
                label: "R".repeat(4_000),
                urgency: Some("urgent".to_string()),
                confidence: Some("medium".to_string()),
                source_refs: vec![format!("msg:{index}")],
                object_refs: Vec::new(),
            })
            .collect();

        let result = run_bounded_simulation(&input, &graph);

        assert!(result.stats.memory_capped);
        assert!(result.stats.steps_executed < 24);
    }

    #[test]
    fn rollout_policy_can_disable_simulation_before_execution() {
        let policy = SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Watcher,
            enabled: false,
            allow_promotion: false,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: false,
            rollout_stage: "shadow".to_string(),
            calibration_mode: "shadow_only".to_string(),
        };

        let result = simulate_snapshot_projection_with_policy(
            "snapshot:test",
            StateSnapshotContent::default(),
            None,
            &policy,
        );

        assert!(result.stats.policy_disabled);
        assert!(result.trace_steps.is_empty());
        assert!(result.output.promotions.is_empty());
        assert!(
            result
                .output
                .trace_summary
                .summary
                .contains("disabled for watcher")
        );
        assert_eq!(
            result
                .output
                .rollout
                .as_ref()
                .map(|rollout| rollout.rollout_stage.as_str()),
            Some("shadow")
        );
        assert_eq!(
            result
                .output
                .rollout
                .as_ref()
                .and_then(|rollout| rollout.policy_summary.as_deref()),
            Some("Simulator preview is disabled for watcher by rollout policy.")
        );
        assert_eq!(
            result
                .output
                .calibration
                .as_ref()
                .map(|calibration| calibration.policy_disabled),
            Some(true)
        );
        assert_eq!(
            result
                .output
                .calibration
                .as_ref()
                .map(|calibration| calibration.calibration_notes.clone()),
            Some(vec![
                "Rollout policy disabled simulator execution for this surface.".to_string()
            ])
        );
    }

    #[test]
    fn rollout_policy_can_suppress_promotions_while_leaving_trace_enabled() {
        let policy = SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Synthesizer,
            enabled: true,
            allow_promotion: false,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: true,
            rollout_stage: "review".to_string(),
            calibration_mode: "bounded_deterministic".to_string(),
        };

        let result = simulate_snapshot_projection_with_policy(
            "snapshot:test",
            sample_input().snapshot,
            None,
            &policy,
        );

        assert!(result.stats.promotions_suppressed);
        assert!(result.output.promotions.is_empty());
        assert!(!result.stats.policy_disabled);
        assert_eq!(
            result
                .output
                .calibration
                .as_ref()
                .map(|calibration| calibration.confidence_posture.as_str()),
            Some("bounded_deterministic")
        );
        assert_eq!(
            result
                .output
                .rollout
                .as_ref()
                .and_then(|rollout| rollout.policy_summary.as_deref()),
            Some("Simulator preview stays bounded on synthesizer without promotion write-back.")
        );
        assert!(
            result
                .output
                .calibration
                .as_ref()
                .map(|calibration| calibration.promotions_suppressed)
                .unwrap_or(false)
        );
        assert!(
            result
                .output
                .calibration
                .as_ref()
                .map(|calibration| calibration
                    .calibration_notes
                    .iter()
                    .any(|note| note.contains("suppressed by rollout policy")))
                .unwrap_or(false)
        );
    }

    fn sample_output_with_review_surface() -> SimulatorBoundaryOutput {
        SimulatorBoundaryOutput::new(
            "snapshot:test",
            true,
            SimulatorTraceSummary {
                summary: "Bounded simulation traced 1 step.".to_string(),
                simulated_risks: vec!["Approval boundary likely".to_string()],
                simulated_opportunities: vec!["Prepared follow-up is possible".to_string()],
            },
            vec![crate::simulator_contract::simulator_promotion_candidate(
                crate::simulator_contract::SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
                "Escalate approval-bound proposal from send_summary around Customer demo.",
                vec!["msg:1".to_string()],
                vec!["project:aurora".to_string()],
            )],
        )
    }

    #[test]
    fn rollout_policy_disables_review_surfaces_on_promotions_fail_closed() {
        let policy = SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Synthesizer,
            enabled: true,
            allow_promotion: true,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: false,
            rollout_stage: "review".to_string(),
            calibration_mode: "bounded_deterministic".to_string(),
        };
        let output = apply_rollout_and_calibration_metadata(
            sample_output_with_review_surface(),
            &policy,
            &SimulatorExecutionStats {
                actionable_events: 1,
                rollouts_executed: 1,
                ..SimulatorExecutionStats::default()
            },
        );

        assert!(!output.promotions.is_empty());
        assert!(output.promotions.iter().all(|promotion| {
            promotion
                .review_surface
                .as_ref()
                .map(|surface| !surface.review_available)
                .unwrap_or(true)
        }));
        assert_eq!(
            output
                .calibration
                .as_ref()
                .map(|calibration| calibration.review_surface_count),
            Some(0)
        );
        assert_eq!(
            output
                .rollout
                .as_ref()
                .map(|rollout| rollout.review_surfaces_enabled),
            Some(false)
        );
        assert_eq!(
            output
                .rollout
                .as_ref()
                .and_then(|rollout| rollout.policy_summary.as_deref()),
            Some("Simulator preview stays bounded on synthesizer without exposed review surfaces.")
        );
        assert!(
            output
                .calibration
                .as_ref()
                .map(|calibration| calibration
                    .calibration_notes
                    .iter()
                    .any(|note| note.contains("Review surfaces are disabled")))
                .unwrap_or(false)
        );
    }

    #[test]
    fn rollout_policy_preserves_review_surfaces_when_enabled() {
        let policy = SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Synthesizer,
            enabled: true,
            allow_promotion: true,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: true,
            rollout_stage: "review".to_string(),
            calibration_mode: "bounded_deterministic".to_string(),
        };
        let output = apply_rollout_and_calibration_metadata(
            sample_output_with_review_surface(),
            &policy,
            &SimulatorExecutionStats {
                actionable_events: 1,
                rollouts_executed: 1,
                ..SimulatorExecutionStats::default()
            },
        );

        assert!(!output.promotions.is_empty());
        assert!(output.promotions.iter().any(|promotion| {
            promotion
                .review_surface
                .as_ref()
                .map(|surface| surface.review_available)
                .unwrap_or(false)
        }));
        assert!(
            output
                .calibration
                .as_ref()
                .map(|calibration| calibration.review_surface_count > 0)
                .unwrap_or(false)
        );
        assert!(
            output
                .calibration
                .as_ref()
                .map(|calibration| calibration
                    .calibration_notes
                    .iter()
                    .any(|note| note.contains("review surface remained available")
                        || note.contains("review surfaces remained available")))
                .unwrap_or(false)
        );
    }

    #[test]
    fn calibration_notes_include_queue_and_timeout_guardrail_signals() {
        let policy = SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Synthesizer,
            enabled: true,
            allow_promotion: true,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: true,
            rollout_stage: "review".to_string(),
            calibration_mode: "bounded_deterministic".to_string(),
        };
        let output = apply_rollout_and_calibration_metadata(
            sample_output_with_review_surface(),
            &policy,
            &SimulatorExecutionStats {
                actionable_events: 1,
                rollouts_executed: 1,
                queue_truncated: true,
                timed_out: true,
                ..SimulatorExecutionStats::default()
            },
        );

        let calibration = output.calibration.expect("calibration metadata");
        assert!(calibration.queue_truncated);
        assert!(calibration.timed_out);
        assert!(
            calibration
                .calibration_notes
                .iter()
                .any(|note| note.contains("truncated by the bounded step cap"))
        );
        assert!(
            calibration
                .calibration_notes
                .iter()
                .any(|note| note.contains("bounded time budget"))
        );
    }

    #[test]
    fn calibration_notes_include_memory_guardrail_signal() {
        let policy = SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Synthesizer,
            enabled: true,
            allow_promotion: true,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: true,
            rollout_stage: "review".to_string(),
            calibration_mode: "bounded_deterministic".to_string(),
        };
        let output = apply_rollout_and_calibration_metadata(
            sample_output_with_review_surface(),
            &policy,
            &SimulatorExecutionStats {
                actionable_events: 1,
                rollouts_executed: 1,
                memory_capped: true,
                ..SimulatorExecutionStats::default()
            },
        );

        let calibration = output.calibration.expect("calibration metadata");
        assert!(calibration.memory_capped);
        assert!(
            calibration
                .calibration_notes
                .iter()
                .any(|note| note.contains("bounded memory budget"))
        );
    }

    #[test]
    fn planning_projection_uses_planning_rollout_surface() {
        let result = simulate_snapshot_projection_for_planning(
            "snapshot:test",
            sample_input().snapshot,
            None,
        );

        assert_eq!(
            result
                .output
                .rollout
                .as_ref()
                .map(|rollout| rollout.surface.as_str()),
            Some("planning")
        );
        assert_eq!(
            result
                .output
                .rollout
                .as_ref()
                .map(|rollout| rollout.allow_promotion),
            Some(false)
        );
    }
}
