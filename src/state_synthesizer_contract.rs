use serde::{Deserialize, Serialize};

use crate::{
    autonomy_policy::{AutonomyDecision, autonomy_decision_for_synthesizer_handoff},
    field_engine::{FieldEngineSummary, summarize_field_engine_snapshot},
    field_engine_contract::FieldEngineSnapshot,
    message::AfpPersonaStateContent,
    prepared_draft_semantics::prepared_draft_destination_view,
    simulator_loop::SimulatorExecutionResult,
    state_snapshot::StateSnapshotContent,
};

pub const SURFACE_HOMEPAGE: &str = "homepage";
pub const SURFACE_CONTEXT_PANEL: &str = "context_panel";
pub const SURFACE_DECISION_QUEUE: &str = "decision_queue";
pub const SURFACE_RESPONSE_QUEUE: &str = "response_queue";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct WatcherSynthesisRequest {
    pub trigger_id: String,
    pub trigger_kind: String,
    pub reason: String,
    pub priority: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
    pub time_window: String,
    pub requested_scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relationship_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decrypt_budget_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage_surface_hint: Option<String>,
    /// EMA-derived velocity of the user's activity signal (events/second delta).
    /// Populated by Background Watcher when `ema_state::derive_state` runs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_velocity: Option<f64>,
    /// EMA-derived acceleration (second derivative) — positive = momentum building.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_acceleration: Option<f64>,
    /// Human-readable trend label from `ema_state::trend_label`
    /// e.g. "accelerating" | "tapering" | "stable" | "rapid_cooling".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_trend: Option<String>,
    /// Normalised activity intensity 0–1 (current EMA value clamped).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_intensity: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct BrowserActionCandidate {
    pub action_kind: String,
    pub policy_mode: String,
    #[serde(default)]
    pub allowed_side_effects: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EmpathyCoordinationContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tone_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initiative_level: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caution_level: Option<String>,
    pub watcher_mode: String,
    pub suppression_active_count: u32,
    pub trusted_signal_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SynthesizerToMasterHandoff {
    pub snapshot_ref: String,
    pub view_id: String,
    pub confidence: String,
    pub surface_recommendation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggested_mood: Option<String>,
    #[serde(default)]
    pub suggested_next_actions: Vec<String>,
    #[serde(default)]
    pub escalation_required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_boundary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autonomy_decision: Option<AutonomyDecision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_action_candidate: Option<BrowserActionCandidate>,
    #[serde(default)]
    pub prepared_context_ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepared_context_summary: Option<String>,
    #[serde(default)]
    pub prepared_draft_ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepared_draft_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub follow_up_write_candidate: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decrypt_trace: Option<String>,
    #[serde(default)]
    pub simulated_projection_ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulated_projection_summary: Option<String>,
    #[serde(default)]
    pub simulated_projection_risks: Vec<String>,
    #[serde(default)]
    pub simulated_projection_opportunities: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulated_actionable_event_count: Option<u32>,
    #[serde(default)]
    pub simulated_review_surfaces_ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulated_rollout_stage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulated_calibration_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulated_review_summary: Option<String>,
    #[serde(default)]
    pub simulated_calibration_notes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulated_promotion_candidate_count: Option<u32>,
    #[serde(default)]
    pub field_engine_ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_engine_primary_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_engine_summary: Option<String>,
    #[serde(default)]
    pub field_engine_risks: Vec<String>,
    #[serde(default)]
    pub field_engine_opportunities: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub empathy_context: Option<EmpathyCoordinationContext>,
}

pub fn normalize_surface_recommendation(surface: &str) -> &str {
    match surface {
        SURFACE_HOMEPAGE
        | SURFACE_CONTEXT_PANEL
        | SURFACE_DECISION_QUEUE
        | SURFACE_RESPONSE_QUEUE => surface,
        _ => SURFACE_HOMEPAGE,
    }
}

pub fn should_suppress_signal(confidence: &str, has_actionability: bool) -> bool {
    matches!(confidence, "low" | "weak") && !has_actionability
}

pub fn build_synthesizer_handoff(
    snapshot_ref: &str,
    view_id: &str,
    snapshot: &StateSnapshotContent,
    request: Option<&WatcherSynthesisRequest>,
) -> SynthesizerToMasterHandoff {
    let escalation_required = should_escalate_snapshot(snapshot, request);
    let surface_recommendation = request
        .and_then(|req| req.homepage_surface_hint.as_deref())
        .map(normalize_surface_recommendation)
        .unwrap_or_else(|| default_surface_for_snapshot(snapshot, escalation_required))
        .to_string();

    let approval_required = snapshot_requires_approval_review(snapshot);
    let actionable_surface_recommendation = surface_recommendation != SURFACE_HOMEPAGE;
    let autonomy_decision = Some(autonomy_decision_for_synthesizer_handoff(
        approval_required,
        escalation_required,
        actionable_surface_recommendation,
    ));
    let browser_action_candidate = snapshot
        .decision_queue
        .iter()
        .find(|item| item.category == "shopping")
        .filter(|_| escalation_required)
        .map(|_| BrowserActionCandidate {
            action_kind: "review_shopping_decision".to_string(),
            policy_mode: "read_only".to_string(),
            allowed_side_effects: Vec::new(),
            target_url: None,
        });

    SynthesizerToMasterHandoff {
        snapshot_ref: snapshot_ref.to_string(),
        view_id: view_id.to_string(),
        confidence: confidence_for_snapshot(snapshot).to_string(),
        surface_recommendation,
        suggested_mood: suggested_mood_for_snapshot(snapshot).map(str::to_string),
        suggested_next_actions: suggested_next_actions(snapshot),
        escalation_required,
        approval_boundary: approval_required.then_some("user_approval_required".to_string()),
        autonomy_decision,
        browser_action_candidate,
        prepared_context_ready: snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.ready)
            .unwrap_or(false),
        prepared_context_summary: snapshot
            .prepared_context_packet
            .as_ref()
            .filter(|packet| packet.ready)
            .map(|packet| packet.summary.clone()),
        prepared_draft_ready: snapshot
            .prepared_draft_packet
            .as_ref()
            .map(|packet| packet.ready)
            .unwrap_or(false),
        prepared_draft_summary: snapshot
            .prepared_draft_packet
            .as_ref()
            .filter(|packet| packet.ready)
            .map(|packet| packet.summary.clone()),
        follow_up_write_candidate: request
            .and_then(|req| req.relationship_id.as_ref())
            .map(|id| format!("relationship_follow_up:{id}")),
        decrypt_trace: request.and_then(|req| {
            // Augment the trace with EMA context when available so the Master
            // Agent can weigh urgency against current activity momentum.
            let budget = req.decrypt_budget_hint.as_deref().unwrap_or("").to_string();
            if let Some(trend) = req.activity_trend.as_deref() {
                let intensity = req.activity_intensity.unwrap_or(0.0);
                Some(format!("{budget}|trend={trend}|intensity={intensity:.2}"))
            } else if budget.is_empty() {
                None
            } else {
                Some(budget)
            }
        }),
        simulated_projection_ready: false,
        simulated_projection_summary: None,
        simulated_projection_risks: Vec::new(),
        simulated_projection_opportunities: Vec::new(),
        simulated_actionable_event_count: None,
        simulated_review_surfaces_ready: false,
        simulated_rollout_stage: None,
        simulated_calibration_mode: None,
        simulated_review_summary: None,
        simulated_calibration_notes: Vec::new(),
        simulated_promotion_candidate_count: None,
        field_engine_ready: false,
        field_engine_primary_type: None,
        field_engine_summary: None,
        field_engine_risks: Vec::new(),
        field_engine_opportunities: Vec::new(),
        empathy_context: None,
    }
}

pub fn apply_empathy_context_to_handoff(
    handoff: &mut SynthesizerToMasterHandoff,
    snapshot: &StateSnapshotContent,
    persona_state: Option<&AfpPersonaStateContent>,
) {
    let suppression_active_count = snapshot
        .watcher_signals
        .iter()
        .filter(|signal| {
            matches!(
                signal.suppression_status.as_str(),
                "suppressed" | "cooldown"
            )
        })
        .count() as u32;
    let trusted_signal_count = snapshot
        .watcher_signals
        .iter()
        .filter(|signal| signal.suppression_status == "trusted")
        .count() as u32;

    let watcher_mode = if suppression_active_count > 0 {
        "cooldown"
    } else if snapshot
        .watcher_signals
        .iter()
        .any(|signal| signal.escalation_status == "required")
    {
        "urgent_clear"
    } else if trusted_signal_count > 0 {
        "trusted_gentle"
    } else if snapshot.watcher_signals.is_empty() {
        "quiet"
    } else {
        "baseline"
    };

    let explanation = if suppression_active_count > 0 {
        Some(format!(
            "{} watcher signal(s) are cooled down, so downstream surfaces should preserve auditability without amplifying pressure.",
            suppression_active_count
        ))
    } else if watcher_mode == "urgent_clear" {
        Some(
            "Active watcher pressure remains time-sensitive and should stay clear rather than softened."
                .to_string(),
        )
    } else if trusted_signal_count > 0 {
        Some(format!(
            "{} watcher signal(s) are trusted from prior outcomes, so gentle continuity framing is appropriate.",
            trusted_signal_count
        ))
    } else if snapshot.watcher_signals.is_empty() {
        None
    } else {
        Some(
            "Watcher context is active but does not currently require a special empathy override."
                .to_string(),
        )
    };

    handoff.empathy_context = Some(EmpathyCoordinationContext {
        profile_id: persona_state.map(|persona| persona.profile_id.clone()),
        tone_mode: persona_state.map(|persona| persona.tone_mode.clone()),
        initiative_level: persona_state.map(|persona| persona.initiative_level.clone()),
        caution_level: persona_state.map(|persona| persona.caution_level.clone()),
        watcher_mode: watcher_mode.to_string(),
        suppression_active_count,
        trusted_signal_count,
        explanation,
    });
}

fn suggested_mood_for_snapshot(snapshot: &StateSnapshotContent) -> Option<&'static str> {
    let decision_count = snapshot.decision_queue.len();
    let response_count = snapshot.response_queue.len();
    let commitment_count = snapshot.active_commitments.len();
    let critical_change_count = snapshot.critical_changes.len();
    let queue_pressure = snapshot.continuity_metrics.unresolved_queue_pressure;
    let switch_pressure = snapshot.continuity_metrics.context_switch_rate;
    let urgency_pressure = snapshot.continuity_metrics.urgency_acceleration;
    let prepared_work_ready = has_ready_prepared_work(snapshot);

    if critical_change_count > 0 && (queue_pressure >= 0.65 || urgency_pressure >= 0.7) {
        return Some("stressed");
    }
    if queue_pressure >= 0.7 && urgency_pressure >= 0.75 {
        return Some("stressed");
    }
    if decision_count + response_count >= 4 && urgency_pressure >= 0.75 {
        return Some("stressed");
    }
    if commitment_count >= 2 && switch_pressure >= 0.55 {
        return Some("tired");
    }
    if response_count >= 2 && switch_pressure >= 0.7 {
        return Some("tired");
    }
    if primary_active_state_field_surface(snapshot) == Some(SURFACE_DECISION_QUEUE)
        && decision_count == 0
        && response_count == 0
    {
        return None;
    }
    if prepared_work_allows_calm_fallback(snapshot) {
        return Some("focused");
    }
    if prepared_work_ready
        && critical_change_count == 0
        && decision_count + response_count <= 2
        && switch_pressure <= 0.45
        && queue_pressure <= 0.45
        && urgency_pressure <= 0.45
    {
        return Some("focused");
    }
    if critical_change_count == 0
        && decision_count + response_count <= 1
        && switch_pressure <= 0.35
        && queue_pressure <= 0.35
    {
        return Some("focused");
    }
    None
}

pub fn apply_field_engine_projection_to_handoff(
    handoff: &mut SynthesizerToMasterHandoff,
    field_snapshot: &FieldEngineSnapshot,
) {
    let Some(summary) = summarize_field_engine_snapshot(field_snapshot) else {
        return;
    };
    apply_field_engine_summary_to_handoff(handoff, &summary);
}

fn apply_field_engine_summary_to_handoff(
    handoff: &mut SynthesizerToMasterHandoff,
    summary: &FieldEngineSummary,
) {
    handoff.field_engine_ready = true;
    handoff.field_engine_primary_type = summary.primary_field_type.clone();
    handoff.field_engine_summary = Some(summary.summary.clone());
    handoff.field_engine_risks = summary.risks.clone();
    handoff.field_engine_opportunities = summary.opportunities.clone();
    for opportunity in &summary.opportunities {
        if !handoff.suggested_next_actions.contains(opportunity) {
            handoff.suggested_next_actions.push(opportunity.clone());
        }
    }
}

pub fn apply_simulation_projection_to_handoff(
    handoff: &mut SynthesizerToMasterHandoff,
    simulation: &SimulatorExecutionResult,
) {
    let actionable_event_count = simulation.stats.actionable_events as u32;
    let trace_summary = simulation.output.trace_summary.summary.trim();
    let has_projection_detail = !trace_summary.is_empty()
        || !simulation.output.trace_summary.simulated_risks.is_empty()
        || !simulation
            .output
            .trace_summary
            .simulated_opportunities
            .is_empty()
        || !simulation.output.promotions.is_empty()
        || simulation.output.rollout.is_some()
        || simulation.output.calibration.is_some();

    if !has_projection_detail {
        return;
    }

    handoff.simulated_projection_ready = actionable_event_count > 0
        || !simulation.output.promotions.is_empty()
        || !simulation.output.trace_summary.simulated_risks.is_empty()
        || !simulation
            .output
            .trace_summary
            .simulated_opportunities
            .is_empty();
    handoff.simulated_projection_summary =
        (!trace_summary.is_empty()).then(|| simulation.output.trace_summary.summary.clone());
    handoff.simulated_projection_risks = simulation.output.trace_summary.simulated_risks.clone();
    handoff.simulated_projection_opportunities = simulation
        .output
        .trace_summary
        .simulated_opportunities
        .clone();
    handoff.simulated_actionable_event_count =
        (actionable_event_count > 0).then_some(actionable_event_count);
    handoff.simulated_review_surfaces_ready = simulation
        .output
        .rollout
        .as_ref()
        .map(|rollout| rollout.review_surfaces_enabled)
        .unwrap_or(false)
        && simulation
            .output
            .calibration
            .as_ref()
            .map(|calibration| calibration.review_surface_count > 0)
            .unwrap_or(false);
    handoff.simulated_rollout_stage = simulation
        .output
        .rollout
        .as_ref()
        .map(|rollout| rollout.rollout_stage.clone());
    handoff.simulated_review_summary = simulation
        .output
        .rollout
        .as_ref()
        .and_then(|rollout| rollout.policy_summary.clone())
        .filter(|value| !value.trim().is_empty());
    handoff.simulated_calibration_mode = simulation
        .output
        .calibration
        .as_ref()
        .map(|calibration| calibration.confidence_posture.clone());
    handoff.simulated_calibration_notes = simulation
        .output
        .calibration
        .as_ref()
        .map(|calibration| calibration.calibration_notes.clone())
        .unwrap_or_default();
    handoff.simulated_promotion_candidate_count = simulation
        .output
        .calibration
        .as_ref()
        .map(|calibration| calibration.promotion_candidate_count)
        .filter(|count| *count > 0);

    for suggestion in simulation
        .output
        .trace_summary
        .simulated_opportunities
        .iter()
        .take(2)
    {
        if !handoff.suggested_next_actions.contains(suggestion) {
            handoff.suggested_next_actions.push(suggestion.clone());
        }
    }
}

fn should_escalate_snapshot(
    snapshot: &StateSnapshotContent,
    request: Option<&WatcherSynthesisRequest>,
) -> bool {
    // State fields encode all major pressure signals deterministically.
    // Unknown confidence values should fall through to the legacy metric path
    // rather than forcing an interrupt.
    if crate::state_fields::has_escalation_state_field(&snapshot.state_fields) {
        return true;
    }
    // Legacy fallback for snapshots with empty state_fields or when all fields are
    // inactive/low-confidence but raw metrics still exceed their individual thresholds.
    let approval_required = snapshot_requires_approval_review(snapshot);
    let explicit_priority = request
        .map(|req| matches!(req.priority.as_str(), "high" | "urgent"))
        .unwrap_or(false);
    let metrics = &snapshot.continuity_metrics;
    let calm_prepared_work_ready = prepared_work_allows_calm_fallback(snapshot);
    approval_required
        || explicit_priority
        || metrics.urgency_acceleration >= 0.72
        || (!calm_prepared_work_ready && metrics.unresolved_queue_pressure >= 0.68)
        || metrics.follow_up_drift_score >= 0.72
        || (metrics.context_switch_rate >= 0.65 && metrics.activity_velocity >= 0.55)
}

fn default_surface_for_snapshot(
    snapshot: &StateSnapshotContent,
    escalation_required: bool,
) -> &'static str {
    // State-field routing is the primary path; the metric-based fallback below only
    // fires for legacy snapshots that carry empty state_fields.
    let calm_prepared_work_ready = prepared_work_allows_calm_fallback(snapshot);
    if let Some(state_field_surface) = primary_active_state_field_surface(snapshot) {
        return state_field_surface;
    }
    let decision_queue_requires_review = snapshot
        .decision_queue
        .iter()
        .any(|item| item.approval_required)
        || (!calm_prepared_work_ready
            && snapshot.continuity_metrics.unresolved_queue_pressure >= 0.65);
    let prepared_draft_ready = snapshot
        .prepared_draft_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let prepared_context_ready = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let response_pressure_active = response_pressure_active(snapshot);
    let context_pressure_active = !snapshot.critical_changes.is_empty()
        || snapshot.continuity_metrics.follow_up_drift_score >= 0.65
        || snapshot.continuity_metrics.context_switch_rate >= 0.60;

    if decision_queue_requires_review {
        SURFACE_DECISION_QUEUE
    } else if !snapshot.response_queue.is_empty()
        && prepared_draft_ready
        && response_pressure_active
    {
        SURFACE_RESPONSE_QUEUE
    } else if prepared_context_ready && context_pressure_active {
        SURFACE_CONTEXT_PANEL
    } else if !snapshot.response_queue.is_empty() && response_pressure_active {
        SURFACE_RESPONSE_QUEUE
    } else if !snapshot.decision_queue.is_empty() {
        SURFACE_DECISION_QUEUE
    } else if context_pressure_active {
        SURFACE_CONTEXT_PANEL
    } else if escalation_required {
        SURFACE_CONTEXT_PANEL
    } else {
        SURFACE_HOMEPAGE
    }
}

fn response_pressure_active(snapshot: &StateSnapshotContent) -> bool {
    snapshot.continuity_metrics.follow_up_drift_score >= 0.65
        || snapshot.response_queue.len() >= 2
        || snapshot
            .response_queue
            .iter()
            .any(response_item_is_due_soon)
}

fn prepared_work_allows_calm_fallback(snapshot: &StateSnapshotContent) -> bool {
    let approval_required = snapshot_requires_approval_review(snapshot);
    has_ready_prepared_work(snapshot)
        && !approval_required
        && !response_pressure_active(snapshot)
        && snapshot.critical_changes.is_empty()
        && snapshot.continuity_metrics.urgency_acceleration < 0.72
        && !(snapshot.continuity_metrics.context_switch_rate >= 0.65
            && snapshot.continuity_metrics.activity_velocity >= 0.55)
}

fn response_item_is_due_soon(item: &crate::state_snapshot::StateSnapshotResponseItem) -> bool {
    matches!(item.urgency.as_str(), "urgent" | "today")
        || crate::timing_hints::due_hint_is_immediate(&item.response_due_hint)
}

fn primary_active_state_field_surface(snapshot: &StateSnapshotContent) -> Option<&'static str> {
    let active_field = crate::state_fields::leading_state_field(&snapshot.state_fields)?;
    Some(match active_field.surface_hint.as_str() {
        SURFACE_DECISION_QUEUE => SURFACE_DECISION_QUEUE,
        SURFACE_RESPONSE_QUEUE => SURFACE_RESPONSE_QUEUE,
        SURFACE_CONTEXT_PANEL => SURFACE_CONTEXT_PANEL,
        _ => SURFACE_HOMEPAGE,
    })
}

fn confidence_for_snapshot(snapshot: &StateSnapshotContent) -> &'static str {
    let approval_required = snapshot_requires_approval_review(snapshot);
    let primary_surface = primary_active_state_field_surface(snapshot);
    if snapshot.sources.is_empty() {
        "low"
    } else if prepared_work_allows_calm_fallback(snapshot)
        || (has_ready_prepared_work(snapshot)
            && !approval_required
            && snapshot.continuity_metrics.urgency_acceleration < 0.72
            && snapshot.continuity_metrics.unresolved_queue_pressure < 0.68)
    {
        "high"
    } else if primary_surface == Some(SURFACE_DECISION_QUEUE)
        && snapshot.decision_queue.is_empty()
        && snapshot.response_queue.is_empty()
    {
        "medium"
    } else if !approval_required
        && snapshot.critical_changes.is_empty()
        && snapshot.decision_queue.is_empty()
    {
        "high"
    } else {
        "medium"
    }
}

fn snapshot_requires_approval_review(snapshot: &StateSnapshotContent) -> bool {
    snapshot
        .decision_queue
        .iter()
        .any(|item| item.approval_required)
        || snapshot.state_fields.iter().any(|field| {
            field.status == "active"
                && (field.field_key == crate::state_fields::STATE_FIELD_APPROVAL_REQUIRED_WORK
                    || field.autonomy_level == "request_approval")
        })
}

fn has_ready_prepared_work(snapshot: &StateSnapshotContent) -> bool {
    snapshot
        .prepared_draft_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false)
        || snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.ready)
            .unwrap_or(false)
}

fn suggested_next_actions(snapshot: &StateSnapshotContent) -> Vec<String> {
    if !snapshot.suggested_actions.is_empty() {
        return snapshot.suggested_actions.iter().take(3).cloned().collect();
    }

    if let Some(packet) = snapshot
        .prepared_draft_packet
        .as_ref()
        .filter(|packet| packet.ready)
    {
        if !response_pressure_active(snapshot) && !packet.summary.trim().is_empty() {
            return vec![prepared_draft_packet_review_action(packet)];
        }
        let actions = packet
            .drafts
            .iter()
            .map(|draft| draft.suggested_next_action.trim())
            .filter(|action| !action.is_empty())
            .map(str::to_string)
            .take(3)
            .collect::<Vec<_>>();
        if !actions.is_empty() {
            return actions;
        }
        if !packet.summary.trim().is_empty() {
            return vec![prepared_draft_packet_review_action(packet)];
        }
    }

    if let Some(packet) = snapshot
        .prepared_context_packet
        .as_ref()
        .filter(|packet| packet.ready)
    {
        if !packet.summary.trim().is_empty() {
            return vec!["Review prepared context".to_string()];
        }
    }

    if let Some(field) = crate::state_fields::leading_state_field(&snapshot.state_fields) {
        if !field.recommended_action.trim().is_empty() {
            return vec![field.recommended_action.clone()];
        }
    }

    snapshot
        .decision_queue
        .iter()
        .map(|item| item.suggested_next_action.clone())
        .take(3)
        .collect()
}

fn prepared_draft_packet_review_action(
    packet: &crate::prepared_draft_packet::PreparedDraftPacket,
) -> String {
    let Some(first_draft) = packet.drafts.first() else {
        return "Review prepared work".to_string();
    };
    match prepared_draft_destination_view(&first_draft.draft_class) {
        SURFACE_RESPONSE_QUEUE => "Review prepared reply".to_string(),
        SURFACE_DECISION_QUEUE => "Review prepared decision support".to_string(),
        _ => "Review prepared work".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        simulator_contract::{SimulatorBoundaryOutput, SimulatorTraceSummary},
        simulator_loop::{SimulatorExecutionResult, SimulatorExecutionStats},
        state_snapshot::{
            StateSnapshotCommitment, StateSnapshotCriticalChange, StateSnapshotDecisionItem,
        },
    };

    #[test]
    fn normalize_surface_recommendation_defaults_conservatively() {
        assert_eq!(
            normalize_surface_recommendation("unknown_surface"),
            SURFACE_HOMEPAGE
        );
        assert_eq!(
            normalize_surface_recommendation(SURFACE_CONTEXT_PANEL),
            SURFACE_CONTEXT_PANEL
        );
        assert_eq!(
            normalize_surface_recommendation(SURFACE_RESPONSE_QUEUE),
            SURFACE_RESPONSE_QUEUE
        );
    }

    #[test]
    fn low_confidence_low_actionability_is_suppressed() {
        assert!(should_suppress_signal("low", false));
        assert!(should_suppress_signal("weak", false));
        assert!(!should_suppress_signal("high", false));
        assert!(!should_suppress_signal("low", true));
    }

    #[test]
    fn build_synthesizer_handoff_prefers_surface_hint_and_relationship_follow_up() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Approve grocery order".to_string(),
                category: "shopping".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review total".to_string(),
                approval_required: true,
            }],
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: vec![StateSnapshotCriticalChange::default()],
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: Default::default(),
            suggested_actions: vec!["Review your schedule".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };
        let request = WatcherSynthesisRequest {
            trigger_id: "watcher_1".to_string(),
            trigger_kind: "watcher_alert".to_string(),
            reason: "relationship follow-up window".to_string(),
            priority: "urgent".to_string(),
            source_refs: vec!["msg_1".to_string()],
            time_window: "today".to_string(),
            requested_scope: "relationship".to_string(),
            relationship_id: Some("rel_123".to_string()),
            decrypt_budget_hint: Some("metadata_first".to_string()),
            homepage_surface_hint: Some(SURFACE_CONTEXT_PANEL.to_string()),
            ..WatcherSynthesisRequest::default()
        };

        let handoff = build_synthesizer_handoff(
            "snapshot_1",
            "homepage:state:user_01",
            &snapshot,
            Some(&request),
        );
        assert_eq!(handoff.surface_recommendation, SURFACE_CONTEXT_PANEL);
        assert_eq!(
            handoff.follow_up_write_candidate.as_deref(),
            Some("relationship_follow_up:rel_123")
        );
        assert_eq!(
            handoff.approval_boundary.as_deref(),
            Some("user_approval_required")
        );
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::RequestApproval)
        );
        assert!(!handoff.prepared_context_ready);
        assert!(!handoff.prepared_draft_ready);
        assert!(handoff.escalation_required);
        assert!(handoff.browser_action_candidate.is_some());
    }

    #[test]
    fn build_synthesizer_handoff_defaults_to_homepage_for_calm_snapshot() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: Default::default(),
            suggested_actions: vec!["Plan your day".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                packet_kind: "continuity_context".to_string(),
                ready: true,
                summary: "Prepared context ready: 1 related context item.".to_string(),
                anchor_refs: vec!["msg_1".to_string()],
                source_refs: vec!["msg_1".to_string()],
                decision_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                response_refs: Vec::new(),
                follow_up_refs: Vec::new(),
                relationship_refs: Vec::new(),
                project_refs: Vec::new(),
                reference_refs: Vec::new(),
                object_refs: Vec::new(),
                thread_refs: Vec::new(),
                file_refs: Vec::new(),
                packs: Vec::new(),
                decrypt_needed_count: 0,
                ..crate::prepared_context_packet::PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft.".to_string(),
                    body: "Thanks for the update.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    approval_required_to_send: true,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send email reply".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_HOMEPAGE);
        assert_eq!(handoff.suggested_mood.as_deref(), Some("focused"));
        assert_eq!(handoff.confidence, "high");
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Plan your day".to_string()]
        );
        assert!(!handoff.escalation_required);
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::PrepareSilently)
        );
        assert!(handoff.prepared_context_ready);
        assert_eq!(
            handoff.prepared_context_summary.as_deref(),
            Some("Prepared context ready: 1 related context item.")
        );
        assert!(handoff.prepared_draft_ready);
        assert_eq!(
            handoff.prepared_draft_summary.as_deref(),
            Some("Prepared 1 communication reply draft for review.")
        );
        assert!(!handoff.field_engine_ready);
    }

    #[test]
    fn apply_field_engine_projection_to_handoff_sets_compact_summary() {
        let mut handoff = SynthesizerToMasterHandoff::default();
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![crate::field_engine_contract::FieldSignal {
                field_type: crate::field_engine_contract::FIELD_TYPE_PROJECT.to_string(),
                density: 0.66,
                momentum: -0.42,
                acceleration: 0.58,
                projected_risk: 0.8,
                projected_opportunity: 0.34,
                ..crate::field_engine_contract::FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_projection_to_handoff(&mut handoff, &field_snapshot);

        assert!(handoff.field_engine_ready);
        assert_eq!(
            handoff.field_engine_primary_type.as_deref(),
            Some("project")
        );
        assert!(
            handoff
                .field_engine_summary
                .as_deref()
                .unwrap_or_default()
                .contains("Project field")
        );
        assert!(!handoff.field_engine_risks.is_empty());
    }

    #[test]
    fn build_synthesizer_handoff_escalates_for_derivative_pressure_without_explicit_request() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string(), "msg_2".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                urgency_acceleration: 0.81,
                unresolved_queue_pressure: 0.71,
                ..Default::default()
            },
            suggested_actions: vec!["Review upcoming deadlines".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert!(handoff.escalation_required);
        assert_eq!(handoff.surface_recommendation, SURFACE_DECISION_QUEUE);
        assert_eq!(handoff.suggested_mood.as_deref(), Some("stressed"));
        assert!(handoff.approval_boundary.is_none());
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact)
        );
    }

    #[test]
    fn build_synthesizer_handoff_prefers_context_panel_for_follow_up_drift() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: vec![],
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.78,
                context_switch_rate: 0.62,
                ..Default::default()
            },
            suggested_actions: vec!["Reconnect dangling follow-ups".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert!(handoff.escalation_required);
        assert_eq!(handoff.surface_recommendation, SURFACE_CONTEXT_PANEL);
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact)
        );
    }

    #[test]
    fn build_synthesizer_handoff_can_prefer_response_queue_for_draft_ready_replies() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                id: "msg_1".to_string(),
                label: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                response_due_hint: "Today".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Draft or send reply".to_string(),
            }],
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.66,
                ..Default::default()
            },
            suggested_actions: vec!["Review reply draft".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft for supplier".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft.".to_string(),
                    body: "Thanks for the update.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    approval_required_to_send: true,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send email reply".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_RESPONSE_QUEUE);
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact)
        );
    }

    #[test]
    fn build_synthesizer_handoff_does_not_force_response_queue_for_calm_single_prepared_reply() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                id: "msg_1".to_string(),
                label: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "medium".to_string(),
                confidence: "medium".to_string(),
                response_due_hint: "This week".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Draft or send reply".to_string(),
            }],
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.42,
                context_switch_rate: 0.28,
                unresolved_queue_pressure: 0.31,
                urgency_acceleration: 0.22,
                ..Default::default()
            },
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft for supplier".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft.".to_string(),
                    body: "Thanks for the update.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "This week".to_string(),
                    approval_required_to_send: true,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send email reply".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_HOMEPAGE);
        assert_eq!(handoff.suggested_mood.as_deref(), Some("focused"));
        assert_eq!(handoff.confidence, "high");
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Review prepared reply".to_string()]
        );
    }

    #[test]
    fn build_synthesizer_handoff_does_not_escalate_for_generic_queue_pressure_when_prepared_reply_is_ready()
     {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                unresolved_queue_pressure: 0.71,
                urgency_acceleration: 0.34,
                context_switch_rate: 0.28,
                ..Default::default()
            },
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft for supplier".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft.".to_string(),
                    body: "Thanks for the update.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "This week".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send email reply".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert!(!handoff.escalation_required);
        assert_eq!(handoff.surface_recommendation, SURFACE_HOMEPAGE);
        assert_eq!(handoff.suggested_mood.as_deref(), Some("focused"));
        assert_eq!(handoff.confidence, "high");
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Review prepared reply".to_string()]
        );
    }

    #[test]
    fn build_synthesizer_handoff_uses_decision_support_action_for_prepared_decision_memo() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["artifact_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                unresolved_queue_pressure: 0.22,
                urgency_acceleration: 0.19,
                ..Default::default()
            },
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 renewal review memo for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "decision_memo".to_string(),
                    label: "Renewal review memo".to_string(),
                    channel: "note".to_string(),
                    summary: "Prepared a renewal review memo.".to_string(),
                    body: "Compare renewal paths before approving a switch.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "This week".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["artifact_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review renewal memo".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-07-18T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_HOMEPAGE);
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Review prepared decision support".to_string()]
        );
    }

    #[test]
    fn build_synthesizer_handoff_still_escalates_for_high_urgency_even_when_prepared_reply_is_ready()
     {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                unresolved_queue_pressure: 0.71,
                urgency_acceleration: 0.81,
                context_switch_rate: 0.28,
                ..Default::default()
            },
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft for supplier".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft.".to_string(),
                    body: "Thanks for the update.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "This week".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send email reply".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert!(handoff.escalation_required);
        assert_eq!(handoff.surface_recommendation, SURFACE_DECISION_QUEUE);
        assert_eq!(handoff.suggested_mood.as_deref(), Some("stressed"));
    }

    #[test]
    fn build_synthesizer_handoff_prefers_prepared_draft_action_when_snapshot_actions_are_empty() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Review backlog".to_string(),
                category: "decision".to_string(),
                urgency: "medium".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review and decide".to_string(),
                approval_required: false,
            }],
            response_queue: vec![],
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.66,
                ..Default::default()
            },
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft for supplier".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft.".to_string(),
                    body: "Thanks for the update.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send email reply".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Review and send email reply".to_string()]
        );
    }

    #[test]
    fn build_synthesizer_handoff_prefers_active_state_field_action_when_snapshot_actions_are_empty()
    {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Review backlog".to_string(),
                category: "decision".to_string(),
                urgency: "medium".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review and decide".to_string(),
                approval_required: false,
            }],
            response_queue: vec![],
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: Default::default(),
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: vec![crate::state_fields::StateFieldActivation {
                field_key: crate::state_fields::STATE_FIELD_RESEARCH_GAP.to_string(),
                label: "Research gap".to_string(),
                status: "active".to_string(),
                confidence: "medium".to_string(),
                surface_hint: SURFACE_CONTEXT_PANEL.to_string(),
                recommended_action: "Gather supporting evidence before acting.".to_string(),
                autonomy_level: "prepare_silently".to_string(),
                reason: "Multiple context signals suggest missing supporting evidence.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            }],
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Gather supporting evidence before acting.".to_string()]
        );
    }

    #[test]
    fn build_synthesizer_handoff_prefers_prepared_response_over_ordinary_decision_backlog() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string(), "msg_2".to_string()],
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Review roadmap note".to_string(),
                category: "decision".to_string(),
                urgency: "medium".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review and decide".to_string(),
                approval_required: false,
            }],
            response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                id: "msg_2".to_string(),
                label: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                response_due_hint: "Today".to_string(),
                source_refs: vec!["msg_2".to_string()],
                suggested_next_action: "Draft or send reply".to_string(),
            }],
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: vec![],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.66,
                ..Default::default()
            },
            suggested_actions: vec!["Review reply draft".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft for supplier".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft.".to_string(),
                    body: "Thanks for the update.".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_2".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send email reply".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_RESPONSE_QUEUE);
        assert_eq!(handoff.suggested_mood.as_deref(), Some("focused"));
        assert_eq!(handoff.confidence, "high");
    }

    #[test]
    fn build_synthesizer_handoff_prefers_prepared_context_over_ordinary_decision_backlog() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string(), "msg_2".to_string()],
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Review roadmap note".to_string(),
                category: "decision".to_string(),
                urgency: "medium".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review and decide".to_string(),
                approval_required: false,
            }],
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: vec![StateSnapshotCriticalChange {
                label: "Missing evidence in project brief".to_string(),
                delta_type: "project_context_gap".to_string(),
                source_refs: vec!["msg_2".to_string()],
            }],
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                context_switch_rate: 0.62,
                ..Default::default()
            },
            suggested_actions: vec!["Review prepared context".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                packet_kind: "continuity_context".to_string(),
                ready: true,
                summary: "Prepared supporting context.".to_string(),
                anchor_refs: vec!["msg_2".to_string()],
                source_refs: vec!["msg_2".to_string()],
                decision_refs: vec!["msg_1".to_string()],
                decision_history_refs: Vec::new(),
                response_refs: Vec::new(),
                follow_up_refs: Vec::new(),
                relationship_refs: Vec::new(),
                project_refs: Vec::new(),
                reference_refs: Vec::new(),
                object_refs: Vec::new(),
                thread_refs: Vec::new(),
                file_refs: Vec::new(),
                packs: Vec::new(),
                decrypt_needed_count: 0,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
                ..crate::prepared_context_packet::PreparedContextPacket::default()
            }),
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_CONTEXT_PANEL);
    }

    #[test]
    fn build_synthesizer_handoff_prefers_prepared_context_over_generic_response_backlog() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string(), "msg_2".to_string()],
            decision_queue: Vec::new(),
            response_queue: vec![
                crate::state_snapshot::StateSnapshotResponseItem::default(),
                crate::state_snapshot::StateSnapshotResponseItem::default(),
            ],
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                context_switch_rate: 0.63,
                follow_up_drift_score: 0.42,
                ..Default::default()
            },
            suggested_actions: vec!["Review prepared context".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                packet_kind: "continuity_context".to_string(),
                ready: true,
                summary: "Prepared supporting context.".to_string(),
                anchor_refs: vec!["msg_2".to_string()],
                source_refs: vec!["msg_2".to_string()],
                decision_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                response_refs: vec!["msg_1".to_string()],
                follow_up_refs: Vec::new(),
                relationship_refs: Vec::new(),
                project_refs: Vec::new(),
                reference_refs: Vec::new(),
                object_refs: Vec::new(),
                thread_refs: Vec::new(),
                file_refs: Vec::new(),
                packs: Vec::new(),
                decrypt_needed_count: 0,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
                ..crate::prepared_context_packet::PreparedContextPacket::default()
            }),
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_CONTEXT_PANEL);
    }

    #[test]
    fn build_synthesizer_handoff_prefers_active_state_field_surface() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: Default::default(),
            suggested_actions: vec!["Refresh supporting context".to_string()],
            confidence_notes: Vec::new(),
            state_fields: vec![crate::state_fields::StateFieldActivation {
                field_key: "research_gap".to_string(),
                label: "Research gap".to_string(),
                status: "active".to_string(),
                confidence: "medium".to_string(),
                surface_hint: SURFACE_CONTEXT_PANEL.to_string(),
                recommended_action: "Gather evidence before acting.".to_string(),
                autonomy_level: "prepare_silently".to_string(),
                reason: "Multiple context signals suggest missing supporting evidence.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            }],
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_CONTEXT_PANEL);
    }

    #[test]
    fn build_synthesizer_handoff_sets_tired_mood_for_commitment_switch_pressure() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem::default(); 2],
            active_commitments: vec![
                StateSnapshotCommitment::default(),
                StateSnapshotCommitment::default(),
            ],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics {
                context_switch_rate: 0.72,
                ..Default::default()
            },
            suggested_actions: vec!["Batch low-effort follow-ups".to_string()],
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.suggested_mood.as_deref(), Some("tired"));
    }

    #[test]
    fn build_synthesizer_handoff_prefers_approval_state_field_surface_over_array_order() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string(), "msg_2".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: Default::default(),
            suggested_actions: vec!["Route the strongest field".to_string()],
            confidence_notes: Vec::new(),
            state_fields: vec![
                crate::state_fields::StateFieldActivation {
                    field_key: crate::state_fields::STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
                    label: "Project scope drift".to_string(),
                    status: "active".to_string(),
                    confidence: "medium".to_string(),
                    surface_hint: SURFACE_CONTEXT_PANEL.to_string(),
                    recommended_action: "Inspect related project context.".to_string(),
                    autonomy_level: "suggest_with_artifact".to_string(),
                    reason: "Recent project-linked changes suggest scope drift.".to_string(),
                    evidence_refs: vec!["msg_1".to_string()],
                },
                crate::state_fields::StateFieldActivation {
                    field_key: crate::state_fields::STATE_FIELD_APPROVAL_REQUIRED_WORK.to_string(),
                    label: "Approval required work".to_string(),
                    status: "active".to_string(),
                    confidence: "high".to_string(),
                    surface_hint: SURFACE_DECISION_QUEUE.to_string(),
                    recommended_action: "Review approval-gated work.".to_string(),
                    autonomy_level: "request_approval".to_string(),
                    reason: "Explicit approval boundaries are active.".to_string(),
                    evidence_refs: vec!["msg_2".to_string(), "msg_3".to_string()],
                },
            ],
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_DECISION_QUEUE);
        assert!(handoff.escalation_required);
        assert_eq!(
            handoff.approval_boundary.as_deref(),
            Some("user_approval_required")
        );
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::RequestApproval)
        );
    }

    #[test]
    fn build_synthesizer_handoff_prefers_active_state_field_over_monitor_field() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: Default::default(),
            suggested_actions: vec!["Prefer active lane".to_string()],
            confidence_notes: Vec::new(),
            state_fields: vec![
                crate::state_fields::StateFieldActivation {
                    field_key: crate::state_fields::STATE_FIELD_UNRESOLVED_DECISIONS.to_string(),
                    label: "Unresolved decisions".to_string(),
                    status: "monitor".to_string(),
                    confidence: "medium".to_string(),
                    surface_hint: SURFACE_DECISION_QUEUE.to_string(),
                    recommended_action: "Review the unresolved decision queue.".to_string(),
                    autonomy_level: "suggest_with_artifact".to_string(),
                    reason: "The decision queue still contains unresolved items.".to_string(),
                    evidence_refs: vec!["msg_1".to_string()],
                },
                crate::state_fields::StateFieldActivation {
                    field_key: crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                    label: "Follow-up pressure".to_string(),
                    status: "active".to_string(),
                    confidence: "medium".to_string(),
                    surface_hint: SURFACE_RESPONSE_QUEUE.to_string(),
                    recommended_action: "Review follow-up pressure.".to_string(),
                    autonomy_level: "suggest_with_artifact".to_string(),
                    reason: "The response queue still carries active follow-up work.".to_string(),
                    evidence_refs: vec!["msg_2".to_string(), "msg_3".to_string()],
                },
            ],
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert_eq!(handoff.surface_recommendation, SURFACE_RESPONSE_QUEUE);
    }

    #[test]
    fn build_synthesizer_handoff_does_not_escalate_for_unknown_state_field_confidence() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: vec![StateSnapshotCommitment::default()],
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: Default::default(),
            suggested_actions: vec!["Stay in monitor mode".to_string()],
            confidence_notes: Vec::new(),
            state_fields: vec![crate::state_fields::StateFieldActivation {
                field_key: "project_scope_drift".to_string(),
                label: "Project scope drift".to_string(),
                status: "active".to_string(),
                confidence: "unknown".to_string(),
                surface_hint: SURFACE_CONTEXT_PANEL.to_string(),
                recommended_action: "Inspect related project context.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Malformed or legacy confidence signal.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            }],
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
        };

        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        assert!(!handoff.escalation_required);
        assert_eq!(handoff.surface_recommendation, SURFACE_CONTEXT_PANEL);
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact)
        );
    }

    #[test]
    fn apply_empathy_context_to_handoff_exports_persona_and_cooldown_state() {
        let snapshot = StateSnapshotContent {
            watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                id: "sig_1".to_string(),
                signal_key: "watcher:study".to_string(),
                category: "study".to_string(),
                freshness: "fresh".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                urgency_hint:
                    "Signal stays visible for auditability while suppression remains active."
                        .to_string(),
                suppression_status: "suppressed".to_string(),
                suppression_reason: "Low acceptance history.".to_string(),
                escalation_status: "deferred".to_string(),
                escalation_reason: "Suppression is active.".to_string(),
                decrypt_needed: false,
                source_type: "smart_suggestion".to_string(),
                source_subtype: "study".to_string(),
                thread_id: "watcher:user_1".to_string(),
                source_refs: vec!["msg_1".to_string()],
            }],
            ..StateSnapshotContent::default()
        };
        let mut handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        let persona_state = AfpPersonaStateContent {
            profile_id: "master-default".to_string(),
            tone_mode: "warm_clear".to_string(),
            initiative_level: "medium".to_string(),
            verbosity_level: "medium".to_string(),
            caution_level: "high".to_string(),
            continuity_anchors: Vec::new(),
            updated_by: "user:user_01".to_string(),
            reason: "Updated from preferences".to_string(),
            effective_at: "2026-06-03T10:00:00Z".to_string(),
        };

        apply_empathy_context_to_handoff(&mut handoff, &snapshot, Some(&persona_state));

        let empathy = handoff
            .empathy_context
            .as_ref()
            .expect("empathy context should be present");
        assert_eq!(empathy.profile_id.as_deref(), Some("master-default"));
        assert_eq!(empathy.tone_mode.as_deref(), Some("warm_clear"));
        assert_eq!(empathy.caution_level.as_deref(), Some("high"));
        assert_eq!(empathy.watcher_mode, "cooldown");
        assert_eq!(empathy.suppression_active_count, 1);
    }

    #[test]
    fn apply_empathy_context_to_handoff_marks_trusted_gentle_mode() {
        let snapshot = StateSnapshotContent {
            watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                id: "sig_1".to_string(),
                signal_key: "watcher:shopping".to_string(),
                category: "shopping".to_string(),
                freshness: "recent".to_string(),
                urgency: "gentle".to_string(),
                confidence: "medium".to_string(),
                urgency_hint: "Trusted context remains available.".to_string(),
                suppression_status: "trusted".to_string(),
                suppression_reason: "Helpful before.".to_string(),
                escalation_status: "watch".to_string(),
                escalation_reason: "No immediate interrupt needed.".to_string(),
                decrypt_needed: false,
                source_type: "smart_suggestion".to_string(),
                source_subtype: "shopping".to_string(),
                thread_id: "watcher:user_1".to_string(),
                source_refs: vec!["msg_2".to_string()],
            }],
            ..StateSnapshotContent::default()
        };
        let mut handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);

        apply_empathy_context_to_handoff(&mut handoff, &snapshot, None);

        let empathy = handoff
            .empathy_context
            .as_ref()
            .expect("empathy context should be present");
        assert_eq!(empathy.watcher_mode, "trusted_gentle");
        assert_eq!(empathy.trusted_signal_count, 1);
    }

    #[test]
    fn apply_simulation_projection_to_handoff_adds_projection_summary_and_opportunity() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            suggested_actions: vec!["Review schedule".to_string()],
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };
        let mut handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        let simulation = SimulatorExecutionResult {
            output: SimulatorBoundaryOutput::new(
                "snapshot_1",
                true,
                SimulatorTraceSummary {
                    summary: "Bounded simulation traced 2 step(s).".to_string(),
                    simulated_risks: vec![
                        "Approval-gated branch surfaced for send_summary.".to_string(),
                    ],
                    simulated_opportunities: vec![
                        "Prepared draft candidate surfaced for propose_alternative.".to_string(),
                    ],
                },
                Vec::new(),
            ),
            trace_steps: Vec::new(),
            stats: SimulatorExecutionStats {
                actionable_events: 2,
                ..SimulatorExecutionStats::default()
            },
        };

        apply_simulation_projection_to_handoff(&mut handoff, &simulation);

        assert!(handoff.simulated_projection_ready);
        assert_eq!(
            handoff.simulated_projection_summary.as_deref(),
            Some("Bounded simulation traced 2 step(s).")
        );
        assert_eq!(handoff.simulated_actionable_event_count, Some(2));
        assert!(!handoff.simulated_review_surfaces_ready);
        assert!(
            handoff.suggested_next_actions.contains(
                &"Prepared draft candidate surfaced for propose_alternative.".to_string()
            )
        );
    }

    #[test]
    fn apply_simulation_projection_to_handoff_preserves_rollout_metadata_without_actionable_events()
    {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string()],
            suggested_actions: vec!["Stay calm".to_string()],
            staleness_at: "2026-06-03T12:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };
        let mut handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);
        let mut output = SimulatorBoundaryOutput::new(
            "snapshot_1",
            true,
            SimulatorTraceSummary {
                summary: "Simulation stayed in shadow mode for this calm state.".to_string(),
                simulated_risks: Vec::new(),
                simulated_opportunities: Vec::new(),
            },
            Vec::new(),
        );
        output.rollout = Some(crate::simulator_contract::SimulatorRolloutSummary {
            surface: "synthesizer".to_string(),
            enabled: true,
            allow_promotion: false,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: true,
            rollout_stage: "shadow".to_string(),
            calibration_mode: "shadow_only".to_string(),
            policy_summary: Some(
                "Simulator preview stays bounded on synthesizer without promotion write-back."
                    .to_string(),
            ),
        });
        output.calibration = Some(crate::simulator_contract::SimulatorCalibrationSummary {
            confidence_posture: "shadow_only".to_string(),
            requires_human_review: true,
            actionable_event_count: 0,
            rollouts_executed: 1,
            promotion_candidate_count: 0,
            review_surface_count: 1,
            policy_disabled: false,
            promotions_suppressed: true,
            queue_truncated: false,
            timed_out: false,
            memory_capped: false,
            calibration_notes: vec![
                "Deterministic bounded preview stayed within a single rollout.".to_string(),
                "Promotion write-back is suppressed by rollout policy.".to_string(),
                "1 review surface remained available for promoted previews.".to_string(),
            ],
        });
        let simulation = SimulatorExecutionResult {
            output,
            trace_steps: Vec::new(),
            stats: SimulatorExecutionStats {
                actionable_events: 0,
                ..SimulatorExecutionStats::default()
            },
        };

        apply_simulation_projection_to_handoff(&mut handoff, &simulation);

        assert!(!handoff.simulated_projection_ready);
        assert_eq!(
            handoff.simulated_projection_summary.as_deref(),
            Some("Simulation stayed in shadow mode for this calm state.")
        );
        assert_eq!(handoff.simulated_actionable_event_count, None);
        assert!(handoff.simulated_review_surfaces_ready);
        assert_eq!(handoff.simulated_rollout_stage.as_deref(), Some("shadow"));
        assert_eq!(
            handoff.simulated_calibration_mode.as_deref(),
            Some("shadow_only")
        );
        assert_eq!(
            handoff.simulated_review_summary.as_deref(),
            Some("Simulator preview stays bounded on synthesizer without promotion write-back.")
        );
        assert_eq!(handoff.simulated_promotion_candidate_count, None);
        assert_eq!(handoff.simulated_calibration_notes.len(), 3);
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Stay calm".to_string()]
        );
    }
}
