use serde::{Deserialize, Serialize};

use crate::{
    field_engine_contract::{
        FIELD_TYPE_ATTENTION, FIELD_TYPE_GOAL, FIELD_TYPE_INTEREST, FIELD_TYPE_KNOWLEDGE,
        FIELD_TYPE_OBLIGATION, FIELD_TYPE_OPPORTUNITY, FIELD_TYPE_PROJECT, FIELD_TYPE_RELATIONSHIP,
        FieldEngineSnapshot, FieldSignal, field_signal,
    },
    prepared_context_packet::{
        PREPARED_CONTEXT_PACK_KIND_OBLIGATION, PREPARED_CONTEXT_PACK_KIND_TOPIC,
    },
    prepared_draft_packet::{
        PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY, PREPARED_DRAFT_CLASS_COMPARISON_TABLE,
        PREPARED_DRAFT_CLASS_DECISION_MEMO, PREPARED_DRAFT_CLASS_FOLLOW_UP,
        PREPARED_DRAFT_CLASS_MEETING_BRIEF, PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE,
        PREPARED_DRAFT_CLASS_TASK_BUNDLE, PreparedDraftArtifact,
    },
    state_fields::{
        STATE_FIELD_FOLLOW_UP_PRESSURE, STATE_FIELD_MEETING_READINESS,
        STATE_FIELD_PROJECT_SCOPE_DRIFT, STATE_FIELD_RELATIONSHIP_FOLLOW_UP,
        STATE_FIELD_RESEARCH_GAP, STATE_FIELD_STALE_KNOWLEDGE_RISK,
        STATE_FIELD_UNRESOLVED_DECISIONS,
    },
    state_snapshot::{StateSnapshotContent, StateSnapshotContextItem},
};

fn clamp_unit(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}

fn clamp_signed_unit(value: f32) -> f32 {
    value.clamp(-1.0, 1.0)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct FieldEngineSummary {
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_field_type: Option<String>,
    #[serde(default)]
    pub risks: Vec<String>,
    #[serde(default)]
    pub opportunities: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct FieldEngineMetrics {
    pub candidate_field_count: u32,
    pub surfaced_field_count: u32,
    pub interruption_avoided_count: u32,
    pub preparation_ready_field_count: u32,
    pub historically_reusable_family_count: u32,
    pub historically_cautious_family_count: u32,
    pub historical_reuse_event_count: u32,
    pub historical_dismissed_event_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub historical_draft_usage_rate: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub historical_undone_action_rate: Option<String>,
    #[serde(default)]
    pub surfaced_field_types: Vec<String>,
    #[serde(default)]
    pub suppressed_field_types: Vec<String>,
    #[serde(default)]
    pub calibration_notes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct FieldEngineEvaluation {
    pub snapshot: FieldEngineSnapshot,
    pub metrics: FieldEngineMetrics,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct FieldEngineOutcomeSignals {
    pub draft_usage_rate: f64,
    pub undone_action_rate: f64,
    pub reusable_family_count: u32,
    pub cautious_family_count: u32,
    pub reuse_event_count: u32,
    pub dismissed_event_count: u32,
}

pub fn build_field_engine_snapshot(snapshot: &StateSnapshotContent) -> FieldEngineSnapshot {
    evaluate_field_engine_snapshot(snapshot).snapshot
}

pub fn evaluate_field_engine_snapshot(snapshot: &StateSnapshotContent) -> FieldEngineEvaluation {
    let mut candidate_fields = Vec::new();
    if let Some(field) = relationship_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }
    if let Some(field) = project_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }
    if let Some(field) = interest_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }
    if let Some(field) = knowledge_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }
    if let Some(field) = attention_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }
    if let Some(field) = obligation_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }
    if let Some(field) = opportunity_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }
    if let Some(field) = goal_field_from_snapshot(snapshot) {
        candidate_fields.push(field);
    }

    let candidate_field_count = candidate_fields.len() as u32;
    let mut surfaced_fields = Vec::new();
    let mut suppressed_field_types = Vec::new();
    let mut calibration_notes = Vec::new();

    for field in candidate_fields {
        if should_surface_field(&field) {
            surfaced_fields.push(field);
        } else {
            suppressed_field_types.push(field.field_type.clone());
            calibration_notes.push(suppressed_field_note(&field));
        }
    }

    let surfaced_field_count = surfaced_fields.len() as u32;
    let interruption_avoided_count = suppressed_field_types.len() as u32;
    let preparation_ready_field_count = surfaced_fields
        .iter()
        .filter(|field| field_has_preparation_support(snapshot, field))
        .count() as u32;
    let surfaced_field_types = surfaced_fields
        .iter()
        .map(|field| field.field_type.clone())
        .collect::<Vec<_>>();

    FieldEngineEvaluation {
        snapshot: FieldEngineSnapshot {
            fields: surfaced_fields,
            ..FieldEngineSnapshot::default()
        }
        .normalized(),
        metrics: FieldEngineMetrics {
            candidate_field_count,
            surfaced_field_count,
            interruption_avoided_count,
            preparation_ready_field_count,
            historically_reusable_family_count: 0,
            historically_cautious_family_count: 0,
            historical_reuse_event_count: 0,
            historical_dismissed_event_count: 0,
            historical_draft_usage_rate: None,
            historical_undone_action_rate: None,
            surfaced_field_types,
            suppressed_field_types,
            calibration_notes,
        },
    }
}

pub fn summarize_field_engine_snapshot(
    snapshot: &FieldEngineSnapshot,
) -> Option<FieldEngineSummary> {
    let leading_field = snapshot.fields.iter().max_by(|left, right| {
        field_priority_score(left)
            .partial_cmp(&field_priority_score(right))
            .unwrap_or(std::cmp::Ordering::Equal)
    })?;
    Some(FieldEngineSummary {
        summary: field_summary_line(leading_field),
        primary_field_type: Some(leading_field.field_type.clone()),
        risks: field_risk_lines(leading_field),
        opportunities: field_opportunity_lines(leading_field),
    })
}

fn relationship_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let relationship_context = snapshot
        .context_panel_items
        .iter()
        .filter(|item| {
            item.relation_path.iter().any(|relation| {
                matches!(
                    relation.as_str(),
                    "same_relationship" | "same_follow_up_chain" | "same_thread"
                )
            })
        })
        .collect::<Vec<_>>();
    let relationship_refs = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.relationship_refs.clone())
        .unwrap_or_default();
    let follow_up_drafts = prepared_drafts_by_class(
        snapshot,
        &[
            PREPARED_DRAFT_CLASS_FOLLOW_UP,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY,
        ],
    );
    let response_source_refs = snapshot
        .response_queue
        .iter()
        .flat_map(|item| item.source_refs.iter().cloned())
        .collect::<Vec<_>>();

    let evidence_count = relationship_context.len()
        + relationship_refs.len()
        + response_source_refs.len()
        + follow_up_drafts.len();
    if evidence_count == 0 {
        return None;
    }

    let density = clamp_unit(
        (relationship_context.len() as f32 * 0.28)
            + (relationship_refs.len() as f32 * 0.18)
            + (response_source_refs.len() as f32 * 0.16)
            + (follow_up_drafts.len() as f32 * 0.22),
    );
    let drift_pressure = snapshot.continuity_metrics.follow_up_drift_score as f32;
    let reactivation_pressure =
        clamp_unit(snapshot.continuity_metrics.reactivation_signal_count as f32 / 3.0);
    let prepared_follow_up_support = clamp_unit(follow_up_drafts.len() as f32 / 2.0);
    let momentum = clamp_signed_unit(
        prepared_follow_up_support * 0.65
            - drift_pressure * 0.72
            - reactivation_pressure * 0.18
            - if has_active_state_field(snapshot, STATE_FIELD_RELATIONSHIP_FOLLOW_UP) {
                0.16
            } else {
                0.0
            },
    );
    let acceleration = clamp_signed_unit(
        reactivation_pressure * 0.55
            + clamp_unit(snapshot.continuity_metrics.urgency_acceleration as f32) * 0.25
            - prepared_follow_up_support * 0.22,
    );
    let projected_risk = clamp_unit(
        drift_pressure * 0.58
            + reactivation_pressure * 0.22
            + clamp_unit(snapshot.response_queue.len() as f32 / 3.0) * 0.14
            + if has_active_state_field(snapshot, STATE_FIELD_FOLLOW_UP_PRESSURE) {
                0.1
            } else {
                0.0
            },
    );
    let projected_opportunity = clamp_unit(
        prepared_follow_up_support * 0.5 + density * 0.25 + reactivation_pressure * 0.2
            - projected_risk * 0.12,
    );
    let confidence = clamp_unit(
        0.25 + clamp_unit(evidence_count as f32 / 8.0) * 0.45
            + clamp_unit(snapshot.continuity_metrics.fresh_signal_count as f32 / 3.0) * 0.15
            + if snapshot.response_queue.is_empty() {
                0.0
            } else {
                0.08
            },
    );

    let scope_ref =
        choose_relationship_scope_ref(snapshot, &response_source_refs, &relationship_context)
            .unwrap_or_else(|| "state_snapshot".to_string());
    let mut field = field_signal(
        "relationship:primary",
        FIELD_TYPE_RELATIONSHIP,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(0.28 + drift_pressure * 0.44);
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = relationship_object_refs(snapshot);
    field.contributing_interactions = unique_refs(
        relationship_context
            .iter()
            .map(|item| item.id.clone())
            .chain(response_source_refs)
            .chain(relationship_refs)
            .chain(
                follow_up_drafts
                    .iter()
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn project_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let project_context = snapshot
        .context_panel_items
        .iter()
        .filter(|item| {
            item.relation_path.iter().any(|relation| {
                matches!(
                    relation.as_str(),
                    "same_project" | "same_area" | "same_resource"
                )
            })
        })
        .collect::<Vec<_>>();
    let project_refs = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.project_refs.clone())
        .unwrap_or_default();
    let project_object_refs = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.object_refs.clone())
        .unwrap_or_default();
    let project_prep_drafts =
        prepared_drafts_by_class(snapshot, &[PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE]);
    let project_decision_pressure = clamp_unit(snapshot.decision_queue.len() as f32 / 3.0);
    let evidence_count = project_context.len()
        + project_refs.len()
        + project_object_refs.len()
        + project_prep_drafts.len()
        + snapshot.decision_queue.len();
    if evidence_count == 0 {
        return None;
    }

    let research_density = clamp_unit(
        project_context
            .iter()
            .filter(|item| {
                item.label.to_ascii_lowercase().contains("research")
                    || item.why_surfaced.to_ascii_lowercase().contains("reference")
            })
            .count() as f32
            / 2.0,
    );
    let execution_density =
        clamp_unit(project_prep_drafts.len() as f32 * 0.5 + project_object_refs.len() as f32 * 0.2);
    let density = clamp_unit(
        (project_context.len() as f32 * 0.22)
            + (project_refs.len() as f32 * 0.16)
            + (project_object_refs.len() as f32 * 0.16)
            + execution_density * 0.18
            + research_density * 0.14
            + project_decision_pressure * 0.14,
    );
    let stall_pressure = clamp_unit(
        project_decision_pressure * 0.32
            + research_density * 0.24
            + clamp_unit(snapshot.critical_changes.len() as f32 / 3.0) * 0.14
            + if has_active_state_field(snapshot, STATE_FIELD_PROJECT_SCOPE_DRIFT) {
                0.2
            } else {
                0.0
            }
            + if has_active_state_field(snapshot, STATE_FIELD_UNRESOLVED_DECISIONS) {
                0.14
            } else {
                0.0
            }
            + if has_active_state_field(snapshot, STATE_FIELD_RESEARCH_GAP) {
                0.1
            } else {
                0.0
            },
    );
    let momentum = clamp_signed_unit(
        execution_density * 0.7 - stall_pressure * 0.74 - project_decision_pressure * 0.18,
    );
    let acceleration = clamp_signed_unit(
        clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.32
            + clamp_unit(snapshot.continuity_metrics.unresolved_queue_pressure as f32) * 0.28
            - execution_density * 0.22,
    );
    let projected_risk = clamp_unit(
        stall_pressure * 0.7
            + clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.15,
    );
    let projected_opportunity = clamp_unit(
        execution_density * 0.46 + density * 0.22 + project_prep_drafts.len() as f32 * 0.14,
    );
    let confidence = clamp_unit(
        0.22 + clamp_unit(evidence_count as f32 / 8.0) * 0.44
            + clamp_unit(snapshot.decision_queue.len() as f32 / 3.0) * 0.16,
    );

    let scope_ref = choose_project_scope_ref(snapshot, &project_context, &project_object_refs)
        .unwrap_or_else(|| "state_snapshot".to_string());
    let mut field = field_signal(
        "project:primary",
        FIELD_TYPE_PROJECT,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(0.18 + stall_pressure * 0.38);
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = unique_refs(
        project_object_refs
            .into_iter()
            .chain(
                project_prep_drafts
                    .iter()
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .collect(),
    );
    field.contributing_interactions = unique_refs(
        project_context
            .iter()
            .map(|item| item.id.clone())
            .chain(project_refs)
            .chain(
                snapshot
                    .decision_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                project_prep_drafts
                    .iter()
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn interest_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let topic_context = snapshot
        .context_panel_items
        .iter()
        .filter(|item| {
            item.relation_path.iter().any(|relation| {
                matches!(
                    relation.as_str(),
                    "same_thread" | "same_object" | "same_project" | "same_area"
                )
            }) && !item.decrypt_needed
        })
        .collect::<Vec<_>>();
    let topic_pack_count = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| {
            packet
                .packs
                .iter()
                .filter(|pack| pack.pack_kind == PREPARED_CONTEXT_PACK_KIND_TOPIC)
                .count()
        })
        .unwrap_or(0);
    let reference_ref_count = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.reference_refs.len())
        .unwrap_or(0);
    let object_ref_count = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.object_refs.len())
        .unwrap_or(0);
    let watcher_interest = snapshot
        .watcher_signals
        .iter()
        .filter(|signal| {
            let category = signal.category.to_ascii_lowercase();
            let subtype = signal.source_subtype.to_ascii_lowercase();
            category.contains("research")
                || category.contains("knowledge")
                || category.contains("workflow")
                || subtype.contains("topic")
                || subtype.contains("reference")
        })
        .collect::<Vec<_>>();
    let comparison_support = prepared_drafts_by_class(
        snapshot,
        &[
            PREPARED_DRAFT_CLASS_COMPARISON_TABLE,
            PREPARED_DRAFT_CLASS_DECISION_MEMO,
            PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE,
        ],
    );
    let ready_support_count = comparison_support
        .iter()
        .filter(|draft| matches!(draft.readiness.as_str(), "ready" | "ready_now"))
        .count();
    let evidence_count = topic_context.len()
        + topic_pack_count
        + reference_ref_count
        + object_ref_count
        + watcher_interest.len()
        + comparison_support.len();
    if evidence_count < 2 {
        return None;
    }

    let context_density = clamp_unit(topic_context.len() as f32 / 3.0);
    let pack_density = clamp_unit(topic_pack_count as f32 / 2.0);
    let reference_density = clamp_unit(reference_ref_count as f32 / 4.0);
    let object_density = clamp_unit(object_ref_count as f32 / 3.0);
    let watcher_density = clamp_unit(watcher_interest.len() as f32 / 3.0);
    let support_density =
        clamp_unit((comparison_support.len() as f32 * 0.18) + (ready_support_count as f32 * 0.2));
    let density = clamp_unit(
        context_density * 0.24
            + pack_density * 0.18
            + reference_density * 0.16
            + object_density * 0.14
            + watcher_density * 0.12
            + support_density * 0.16,
    );
    let momentum = clamp_signed_unit(
        support_density * 0.44 + pack_density * 0.22 + watcher_density * 0.12
            - clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.18
            - clamp_unit(snapshot.continuity_metrics.follow_up_drift_score as f32) * 0.06,
    );
    let acceleration = clamp_signed_unit(
        watcher_density * 0.24
            + clamp_unit(snapshot.continuity_metrics.fresh_signal_count as f32 / 4.0) * 0.18
            + clamp_unit(snapshot.continuity_metrics.urgency_acceleration as f32) * 0.1
            - support_density * 0.08,
    );
    let projected_risk = clamp_unit(
        clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.18
            + clamp_unit(snapshot.continuity_metrics.unresolved_queue_pressure as f32) * 0.12
            - support_density * 0.08,
    );
    let projected_opportunity = clamp_unit(
        density * 0.34
            + support_density * 0.24
            + reference_density * 0.14
            + object_density * 0.12
            + pack_density * 0.1,
    );
    let confidence = clamp_unit(
        0.2 + clamp_unit(evidence_count as f32 / 10.0) * 0.3
            + density * 0.12
            + support_density * 0.08,
    );

    let scope_ref = snapshot
        .prepared_context_packet
        .as_ref()
        .and_then(|packet| packet.object_refs.first().cloned())
        .or_else(|| {
            snapshot
                .prepared_context_packet
                .as_ref()
                .and_then(|packet| packet.reference_refs.first().cloned())
        })
        .or_else(|| topic_context.first().map(|item| item.id.clone()))
        .or_else(|| {
            watcher_interest
                .first()
                .map(|signal| signal.thread_id.clone())
        })
        .unwrap_or_else(|| "state_snapshot".to_string());

    let mut field = field_signal(
        "interest:primary",
        FIELD_TYPE_INTEREST,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(
        0.14 + clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.18,
    );
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = unique_refs(
        snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.object_refs.clone())
            .unwrap_or_default()
            .into_iter()
            .chain(
                comparison_support
                    .iter()
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .collect(),
    );
    field.contributing_interactions = unique_refs(
        topic_context
            .iter()
            .map(|item| item.id.clone())
            .chain(
                snapshot
                    .prepared_context_packet
                    .as_ref()
                    .into_iter()
                    .flat_map(|packet| packet.reference_refs.iter().cloned()),
            )
            .chain(
                watcher_interest
                    .iter()
                    .flat_map(|signal| signal.source_refs.iter().cloned()),
            )
            .chain(
                comparison_support
                    .iter()
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn knowledge_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let research_decisions = snapshot
        .decision_queue
        .iter()
        .filter(|item| looks_like_knowledge_decision(item))
        .collect::<Vec<_>>();
    let research_context = snapshot
        .context_panel_items
        .iter()
        .filter(|item| looks_like_knowledge_context(item))
        .collect::<Vec<_>>();
    let stale_signals = snapshot
        .watcher_signals
        .iter()
        .filter(|signal| {
            signal.freshness.eq_ignore_ascii_case("stale")
                || signal.category.to_ascii_lowercase().contains("knowledge")
        })
        .collect::<Vec<_>>();
    let knowledge_drafts = prepared_drafts_by_class(
        snapshot,
        &[
            PREPARED_DRAFT_CLASS_COMPARISON_TABLE,
            PREPARED_DRAFT_CLASS_DECISION_MEMO,
            PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE,
        ],
    );
    let ready_knowledge_drafts = knowledge_drafts
        .iter()
        .filter(|draft| matches!(draft.readiness.as_str(), "ready" | "ready_now"))
        .count();
    let prepared_context_ready = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let research_gap_active = has_active_state_field(snapshot, STATE_FIELD_RESEARCH_GAP);
    let stale_knowledge_active = has_active_state_field(snapshot, STATE_FIELD_STALE_KNOWLEDGE_RISK);
    let decision_pressure = clamp_unit(research_decisions.len() as f32 / 3.0);
    let context_density = clamp_unit(research_context.len() as f32 / 3.0);
    let stale_pressure = clamp_unit(stale_signals.len() as f32 / 2.0);
    let draft_support =
        clamp_unit((knowledge_drafts.len() as f32 * 0.18) + (ready_knowledge_drafts as f32 * 0.22));
    let prepared_context_support = if prepared_context_ready { 0.28 } else { 0.0 };
    let knowledge_support = clamp_unit(draft_support + prepared_context_support);
    let evidence_count = research_decisions.len()
        + research_context.len()
        + stale_signals.len()
        + knowledge_drafts.len()
        + usize::from(prepared_context_ready)
        + usize::from(research_gap_active)
        + usize::from(stale_knowledge_active);
    if evidence_count == 0 {
        return None;
    }

    let density = clamp_unit(
        context_density * 0.26
            + decision_pressure * 0.24
            + stale_pressure * 0.18
            + knowledge_support * 0.22,
    );
    let momentum = clamp_signed_unit(
        knowledge_support * 0.68
            - stale_pressure * 0.54
            - if research_gap_active { 0.18 } else { 0.0 }
            - if stale_knowledge_active { 0.16 } else { 0.0 },
    );
    let acceleration = clamp_signed_unit(
        stale_pressure * 0.34
            + clamp_unit(snapshot.continuity_metrics.urgency_acceleration as f32) * 0.18
            + decision_pressure * 0.18
            - knowledge_support * 0.16,
    );
    let projected_risk = clamp_unit(
        stale_pressure * 0.34
            + decision_pressure * 0.2
            + if research_gap_active { 0.18 } else { 0.0 }
            + if stale_knowledge_active { 0.18 } else { 0.0 }
            + clamp_unit(snapshot.continuity_metrics.unresolved_queue_pressure as f32) * 0.1,
    );
    let projected_opportunity = clamp_unit(
        knowledge_support * 0.38
            + context_density * 0.18
            + decision_pressure * 0.18
            + clamp_unit(ready_knowledge_drafts as f32 / 2.0) * 0.12,
    );
    let confidence = clamp_unit(
        0.22 + clamp_unit(evidence_count as f32 / 8.0) * 0.34
            + knowledge_support * 0.14
            + context_density * 0.08,
    );

    let scope_ref = snapshot
        .prepared_context_packet
        .as_ref()
        .and_then(|packet| packet.object_refs.first().cloned())
        .or_else(|| {
            knowledge_drafts
                .iter()
                .flat_map(|draft| draft.object_refs.iter())
                .next()
                .cloned()
        })
        .or_else(|| research_context.first().map(|item| item.id.clone()))
        .or_else(|| {
            research_decisions
                .iter()
                .flat_map(|item| item.source_refs.iter())
                .next()
                .cloned()
        })
        .unwrap_or_else(|| "state_snapshot".to_string());

    let mut field = field_signal(
        "knowledge:primary",
        FIELD_TYPE_KNOWLEDGE,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(0.18 + stale_pressure * 0.24 + decision_pressure * 0.12);
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = unique_refs(
        snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.object_refs.clone())
            .unwrap_or_default()
            .into_iter()
            .chain(
                knowledge_drafts
                    .iter()
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .collect(),
    );
    field.contributing_interactions = unique_refs(
        stale_signals
            .iter()
            .flat_map(|signal| signal.source_refs.iter().cloned())
            .chain(research_context.iter().map(|item| item.id.clone()))
            .chain(
                research_decisions
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                knowledge_drafts
                    .iter()
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn attention_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let decision_pressure = clamp_unit(snapshot.decision_queue.len() as f32 / 3.0);
    let response_pressure = clamp_unit(snapshot.response_queue.len() as f32 / 3.0);
    let change_pressure = clamp_unit(snapshot.critical_changes.len() as f32 / 3.0);
    let watcher_pressure = clamp_unit(snapshot.watcher_signals.len() as f32 / 4.0);
    let switch_pressure = clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32);
    let queue_pressure = clamp_unit(snapshot.continuity_metrics.unresolved_queue_pressure as f32);
    let urgency_pressure = clamp_unit(snapshot.continuity_metrics.urgency_acceleration as f32);
    let follow_up_pressure = clamp_unit(snapshot.continuity_metrics.follow_up_drift_score as f32);
    let prepared_context_ready = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let prepared_draft_ready = snapshot
        .prepared_draft_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let prepared_support = clamp_unit(
        if prepared_context_ready { 0.22 } else { 0.0 }
            + if prepared_draft_ready { 0.28 } else { 0.0 },
    );
    let evidence_count = snapshot.decision_queue.len()
        + snapshot.response_queue.len()
        + snapshot.critical_changes.len()
        + snapshot.watcher_signals.len()
        + usize::from(prepared_context_ready)
        + usize::from(prepared_draft_ready);
    let has_core_attention_evidence = decision_pressure > 0.0
        || response_pressure > 0.0
        || change_pressure > 0.0
        || watcher_pressure > 0.0
        || switch_pressure >= 0.32
        || queue_pressure >= 0.32
        || urgency_pressure >= 0.28;
    if evidence_count == 0 || !has_core_attention_evidence {
        return None;
    }

    let density = clamp_unit(
        decision_pressure * 0.18
            + response_pressure * 0.18
            + change_pressure * 0.14
            + watcher_pressure * 0.1
            + switch_pressure * 0.2
            + queue_pressure * 0.12
            + urgency_pressure * 0.08,
    );
    let fragmentation_pressure = clamp_unit(
        decision_pressure * 0.22
            + response_pressure * 0.22
            + switch_pressure * 0.24
            + queue_pressure * 0.18
            + follow_up_pressure * 0.08
            + if change_pressure > 0.0 { 0.08 } else { 0.0 },
    );
    let momentum = clamp_signed_unit(
        prepared_support * 0.42 - fragmentation_pressure * 0.74 - urgency_pressure * 0.08,
    );
    let acceleration = clamp_signed_unit(
        urgency_pressure * 0.34
            + change_pressure * 0.18
            + watcher_pressure * 0.16
            + switch_pressure * 0.12
            - prepared_support * 0.14,
    );
    let projected_risk = clamp_unit(
        fragmentation_pressure * 0.54
            + urgency_pressure * 0.18
            + change_pressure * 0.12
            + watcher_pressure * 0.08,
    );
    let projected_opportunity = clamp_unit(
        prepared_support * 0.42
            + queue_pressure * 0.14
            + decision_pressure * 0.1
            + response_pressure * 0.1
            - switch_pressure * 0.08,
    );
    let confidence = clamp_unit(
        0.2 + clamp_unit(evidence_count as f32 / 10.0) * 0.34
            + fragmentation_pressure * 0.16
            + prepared_support * 0.1,
    );

    let scope_ref = snapshot
        .decision_queue
        .iter()
        .flat_map(|item| item.source_refs.iter())
        .next()
        .cloned()
        .or_else(|| {
            snapshot
                .response_queue
                .iter()
                .flat_map(|item| item.source_refs.iter())
                .next()
                .cloned()
        })
        .or_else(|| {
            snapshot
                .watcher_signals
                .iter()
                .find(|signal| !signal.thread_id.is_empty())
                .map(|signal| signal.thread_id.clone())
        })
        .or_else(|| {
            snapshot
                .critical_changes
                .iter()
                .flat_map(|item| item.source_refs.iter())
                .next()
                .cloned()
        })
        .unwrap_or_else(|| "state_snapshot".to_string());

    let mut field = field_signal(
        "attention:primary",
        FIELD_TYPE_ATTENTION,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(0.18 + fragmentation_pressure * 0.26 + urgency_pressure * 0.12);
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = unique_refs(
        snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.object_refs.clone())
            .unwrap_or_default(),
    );
    field.contributing_interactions = unique_refs(
        snapshot
            .decision_queue
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned())
            .chain(
                snapshot
                    .response_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .watcher_signals
                    .iter()
                    .flat_map(|signal| signal.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .critical_changes
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn obligation_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let due_commitments = snapshot
        .active_commitments
        .iter()
        .filter(|item| looks_like_due_soon_commitment(item.time_horizon.as_str()))
        .collect::<Vec<_>>();
    let obligation_pack_count = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| {
            packet
                .packs
                .iter()
                .filter(|pack| pack.pack_kind == PREPARED_CONTEXT_PACK_KIND_OBLIGATION)
                .count()
        })
        .unwrap_or(0);
    let obligation_drafts = prepared_drafts_by_class(
        snapshot,
        &[
            PREPARED_DRAFT_CLASS_MEETING_BRIEF,
            PREPARED_DRAFT_CLASS_TASK_BUNDLE,
            PREPARED_DRAFT_CLASS_FOLLOW_UP,
        ],
    );
    let ready_draft_count = obligation_drafts
        .iter()
        .filter(|draft| matches!(draft.readiness.as_str(), "ready" | "ready_now"))
        .count();
    let approval_pressure = snapshot
        .decision_queue
        .iter()
        .filter(|item| item.approval_required)
        .count();
    let urgent_responses = snapshot
        .response_queue
        .iter()
        .filter(|item| {
            matches!(
                item.urgency.to_ascii_lowercase().as_str(),
                "today" | "urgent" | "high"
            )
        })
        .collect::<Vec<_>>();
    let meeting_readiness_active = has_active_state_field(snapshot, STATE_FIELD_MEETING_READINESS);
    let follow_up_active = has_active_state_field(snapshot, STATE_FIELD_FOLLOW_UP_PRESSURE);
    let evidence_count = due_commitments.len()
        + obligation_pack_count
        + obligation_drafts.len()
        + urgent_responses.len()
        + approval_pressure
        + usize::from(meeting_readiness_active)
        + usize::from(follow_up_active);
    if evidence_count < 2 {
        return None;
    }

    let commitment_density = clamp_unit(due_commitments.len() as f32 / 3.0);
    let pack_density = clamp_unit(obligation_pack_count as f32 / 2.0);
    let draft_support =
        clamp_unit((obligation_drafts.len() as f32 * 0.18) + (ready_draft_count as f32 * 0.22));
    let response_pressure = clamp_unit(urgent_responses.len() as f32 / 3.0);
    let approval_density = clamp_unit(approval_pressure as f32 / 2.0);
    let density = clamp_unit(
        commitment_density * 0.28
            + pack_density * 0.18
            + draft_support * 0.2
            + response_pressure * 0.16
            + approval_density * 0.1,
    );
    let obligation_pressure = clamp_unit(
        commitment_density * 0.34
            + response_pressure * 0.18
            + approval_density * 0.16
            + clamp_unit(snapshot.continuity_metrics.deadline_signal_count as f32 / 3.0) * 0.14
            + if follow_up_active { 0.1 } else { 0.0 },
    );
    let momentum = clamp_signed_unit(
        draft_support * 0.54 + pack_density * 0.18
            - obligation_pressure * 0.62
            - clamp_unit(snapshot.continuity_metrics.follow_up_drift_score as f32) * 0.1,
    );
    let acceleration = clamp_signed_unit(
        clamp_unit(snapshot.continuity_metrics.urgency_acceleration as f32) * 0.32
            + clamp_unit(snapshot.continuity_metrics.unresolved_queue_pressure as f32) * 0.18
            + clamp_unit(snapshot.continuity_metrics.deadline_signal_count as f32 / 3.0) * 0.12
            - draft_support * 0.14,
    );
    let projected_risk = clamp_unit(
        obligation_pressure * 0.64
            + approval_density * 0.08
            + if meeting_readiness_active { 0.08 } else { 0.0 }
            + if follow_up_active { 0.08 } else { 0.0 },
    );
    let projected_opportunity = clamp_unit(
        draft_support * 0.38
            + pack_density * 0.18
            + commitment_density * 0.18
            + clamp_unit(ready_draft_count as f32 / 2.0) * 0.08
            + if meeting_readiness_active { 0.12 } else { 0.0 },
    );
    let confidence = clamp_unit(
        0.22 + clamp_unit(evidence_count as f32 / 9.0) * 0.34
            + draft_support * 0.12
            + commitment_density * 0.08,
    );

    let scope_ref = due_commitments
        .iter()
        .flat_map(|item| item.source_refs.iter())
        .next()
        .cloned()
        .or_else(|| {
            snapshot
                .prepared_context_packet
                .as_ref()
                .and_then(|packet| packet.object_refs.first().cloned())
        })
        .or_else(|| {
            urgent_responses
                .iter()
                .flat_map(|item| item.source_refs.iter())
                .next()
                .cloned()
        })
        .unwrap_or_else(|| "state_snapshot".to_string());

    let mut field = field_signal(
        "obligation:primary",
        FIELD_TYPE_OBLIGATION,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(0.18 + obligation_pressure * 0.3);
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = unique_refs(
        snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.object_refs.clone())
            .unwrap_or_default()
            .into_iter()
            .chain(
                obligation_drafts
                    .iter()
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .collect(),
    );
    field.contributing_interactions = unique_refs(
        due_commitments
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned())
            .chain(
                urgent_responses
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .decision_queue
                    .iter()
                    .filter(|item| item.approval_required)
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                obligation_drafts
                    .iter()
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn opportunity_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let prepared_context_ready = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let prepared_opportunity_drafts = prepared_drafts_by_class(
        snapshot,
        &[
            PREPARED_DRAFT_CLASS_DECISION_MEMO,
            PREPARED_DRAFT_CLASS_COMPARISON_TABLE,
            PREPARED_DRAFT_CLASS_MEETING_BRIEF,
            PREPARED_DRAFT_CLASS_TASK_BUNDLE,
            PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE,
        ],
    );
    let ready_now_drafts = prepared_opportunity_drafts
        .iter()
        .filter(|draft| draft.readiness == "ready_now")
        .count();
    let context_ready_density = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| {
            packet.source_refs.len()
                + packet.packs.len()
                + packet.file_refs.len()
                + packet.object_refs.len()
        })
        .unwrap_or(0);
    let due_soon_commitments = snapshot
        .active_commitments
        .iter()
        .filter(|commitment| {
            let horizon = commitment.time_horizon.to_ascii_lowercase();
            matches!(
                horizon.as_str(),
                "today" | "tonight" | "tomorrow" | "this_week" | "due_soon"
            )
        })
        .count();
    let leverage_context = snapshot
        .context_panel_items
        .iter()
        .filter(|item| {
            item.relation_path.iter().any(|relation| {
                matches!(
                    relation.as_str(),
                    "same_project" | "same_area" | "same_resource" | "same_object"
                )
            })
        })
        .collect::<Vec<_>>();
    let leverage_object_refs = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.object_refs.clone())
        .unwrap_or_default();
    let has_core_opportunity_evidence = prepared_context_ready
        || !prepared_opportunity_drafts.is_empty()
        || !leverage_context.is_empty()
        || !leverage_object_refs.is_empty()
        || !snapshot.decision_queue.is_empty()
        || !snapshot.critical_changes.is_empty()
        || due_soon_commitments > 0;
    let evidence_count = prepared_opportunity_drafts.len()
        + context_ready_density
        + snapshot.decision_queue.len()
        + snapshot.response_queue.len()
        + snapshot.critical_changes.len()
        + due_soon_commitments
        + leverage_context.len()
        + leverage_object_refs.len()
        + usize::from(prepared_context_ready);
    if evidence_count == 0 || !has_core_opportunity_evidence {
        return None;
    }

    let decision_pressure = clamp_unit(snapshot.decision_queue.len() as f32 / 3.0);
    let response_pressure = clamp_unit(snapshot.response_queue.len() as f32 / 3.0);
    let change_pressure = clamp_unit(snapshot.critical_changes.len() as f32 / 3.0);
    let commitment_pressure = clamp_unit(due_soon_commitments as f32 / 2.0);
    let prepared_draft_support = clamp_unit(
        (prepared_opportunity_drafts.len() as f32 * 0.34) + (ready_now_drafts as f32 * 0.24),
    );
    let prepared_context_support = if prepared_context_ready {
        clamp_unit(0.28 + clamp_unit(context_ready_density as f32 / 6.0) * 0.42)
    } else {
        0.0
    };
    let leverage_density = clamp_unit(
        (leverage_context.len() as f32 * 0.18)
            + (leverage_object_refs.len() as f32 * 0.16)
            + (prepared_context_support * 0.26)
            + (prepared_draft_support * 0.24)
            + (decision_pressure * 0.08)
            + (response_pressure * 0.08),
    );
    let readiness_support =
        clamp_unit(prepared_context_support * 0.52 + prepared_draft_support * 0.48);
    let alignment_pressure = clamp_unit(
        decision_pressure * 0.3
            + response_pressure * 0.24
            + commitment_pressure * 0.18
            + change_pressure * 0.14
            + clamp_unit(snapshot.continuity_metrics.unresolved_queue_pressure as f32) * 0.14,
    );
    let momentum = clamp_signed_unit(
        readiness_support * 0.72
            - clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.22
            - clamp_unit(snapshot.continuity_metrics.follow_up_drift_score as f32) * 0.08,
    );
    let acceleration = clamp_signed_unit(
        change_pressure * 0.34
            + commitment_pressure * 0.22
            + clamp_unit(snapshot.continuity_metrics.urgency_acceleration as f32) * 0.22
            + (ready_now_drafts as f32 * 0.08)
            - clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.12,
    );
    let projected_opportunity =
        clamp_unit(readiness_support * 0.44 + leverage_density * 0.24 + alignment_pressure * 0.24);
    let projected_risk = clamp_unit(
        alignment_pressure * 0.42
            + clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.18
            - readiness_support * 0.16,
    );
    let confidence = clamp_unit(
        0.24 + clamp_unit(evidence_count as f32 / 10.0) * 0.34
            + readiness_support * 0.16
            + clamp_unit(snapshot.continuity_metrics.fresh_signal_count as f32 / 4.0) * 0.1,
    );

    let scope_ref = leverage_object_refs
        .first()
        .cloned()
        .or_else(|| {
            prepared_opportunity_drafts
                .iter()
                .flat_map(|draft| draft.object_refs.iter())
                .next()
                .cloned()
        })
        .or_else(|| {
            snapshot
                .decision_queue
                .iter()
                .flat_map(|item| item.source_refs.iter())
                .next()
                .cloned()
        })
        .or_else(|| leverage_context.first().map(|item| item.id.clone()))
        .unwrap_or_else(|| "state_snapshot".to_string());

    let mut field = field_signal(
        "opportunity:primary",
        FIELD_TYPE_OPPORTUNITY,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = leverage_density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(0.16 + change_pressure * 0.26 + commitment_pressure * 0.18);
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = unique_refs(
        leverage_object_refs
            .into_iter()
            .chain(
                prepared_opportunity_drafts
                    .iter()
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .collect(),
    );
    field.contributing_interactions = unique_refs(
        leverage_context
            .iter()
            .map(|item| item.id.clone())
            .chain(
                snapshot
                    .decision_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .response_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .active_commitments
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .critical_changes
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                prepared_opportunity_drafts
                    .iter()
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn goal_field_from_snapshot(snapshot: &StateSnapshotContent) -> Option<FieldSignal> {
    let due_commitments = snapshot
        .active_commitments
        .iter()
        .filter(|commitment| {
            let horizon = commitment.time_horizon.to_ascii_lowercase();
            matches!(
                horizon.as_str(),
                "today" | "tonight" | "tomorrow" | "this_week" | "due_soon"
            )
        })
        .collect::<Vec<_>>();
    let goal_context = snapshot
        .context_panel_items
        .iter()
        .filter(|item| {
            item.relation_path.iter().any(|relation| {
                matches!(
                    relation.as_str(),
                    "same_project" | "same_thread" | "same_object" | "same_area"
                )
            })
        })
        .collect::<Vec<_>>();
    let goal_drafts = prepared_drafts_by_class(
        snapshot,
        &[
            PREPARED_DRAFT_CLASS_TASK_BUNDLE,
            PREPARED_DRAFT_CLASS_MEETING_BRIEF,
            PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE,
            PREPARED_DRAFT_CLASS_DECISION_MEMO,
        ],
    );
    let ready_goal_drafts = goal_drafts
        .iter()
        .filter(|draft| matches!(draft.readiness.as_str(), "ready" | "ready_now"))
        .count();
    let decision_pressure = clamp_unit(snapshot.decision_queue.len() as f32 / 3.0);
    let response_pressure = clamp_unit(snapshot.response_queue.len() as f32 / 3.0);
    let commitment_pressure = clamp_unit(due_commitments.len() as f32 / 2.0);
    let context_density = clamp_unit(goal_context.len() as f32 / 3.0);
    let prepared_context_ready = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let has_core_goal_evidence = !due_commitments.is_empty()
        || !goal_context.is_empty()
        || !goal_drafts.is_empty()
        || !snapshot.decision_queue.is_empty()
        || prepared_context_ready;
    let prepared_context_support = if prepared_context_ready { 0.32 } else { 0.0 };
    let resistance_pressure = clamp_unit(
        decision_pressure * 0.28
            + response_pressure * 0.18
            + clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.16
            + clamp_unit(snapshot.continuity_metrics.unresolved_queue_pressure as f32) * 0.2
            + if has_active_state_field(snapshot, STATE_FIELD_UNRESOLVED_DECISIONS) {
                0.12
            } else {
                0.0
            }
            + if has_active_state_field(snapshot, STATE_FIELD_PROJECT_SCOPE_DRIFT) {
                0.1
            } else {
                0.0
            },
    );
    let readiness_support = clamp_unit(
        prepared_context_support
            + (goal_drafts.len() as f32 * 0.18)
            + (ready_goal_drafts as f32 * 0.22)
            + if has_active_state_field(snapshot, STATE_FIELD_MEETING_READINESS) {
                0.1
            } else {
                0.0
            },
    );
    let evidence_count = due_commitments.len()
        + goal_context.len()
        + goal_drafts.len()
        + snapshot.decision_queue.len()
        + snapshot.response_queue.len()
        + usize::from(prepared_context_ready);
    if evidence_count == 0 || !has_core_goal_evidence {
        return None;
    }

    let density = clamp_unit(
        context_density * 0.26
            + commitment_pressure * 0.22
            + readiness_support * 0.28
            + decision_pressure * 0.12
            + response_pressure * 0.12,
    );
    let momentum = clamp_signed_unit(
        readiness_support * 0.72
            - resistance_pressure * 0.66
            - clamp_unit(snapshot.continuity_metrics.follow_up_drift_score as f32) * 0.08,
    );
    let acceleration = clamp_signed_unit(
        commitment_pressure * 0.32
            + clamp_unit(snapshot.continuity_metrics.urgency_acceleration as f32) * 0.22
            + decision_pressure * 0.18
            - readiness_support * 0.16,
    );
    let projected_risk = clamp_unit(
        resistance_pressure * 0.54
            + commitment_pressure * 0.16
            + clamp_unit(snapshot.continuity_metrics.context_switch_rate as f32) * 0.1,
    );
    let projected_opportunity = clamp_unit(
        readiness_support * 0.42
            + commitment_pressure * 0.2
            + context_density * 0.18
            + clamp_unit(ready_goal_drafts as f32 / 2.0) * 0.12,
    );
    let confidence = clamp_unit(
        0.24 + clamp_unit(evidence_count as f32 / 8.0) * 0.36
            + readiness_support * 0.16
            + commitment_pressure * 0.08,
    );

    let scope_ref = due_commitments
        .first()
        .and_then(|commitment| commitment.source_refs.first().cloned())
        .or_else(|| {
            goal_drafts
                .iter()
                .flat_map(|draft| draft.object_refs.iter())
                .next()
                .cloned()
        })
        .or_else(|| {
            snapshot
                .prepared_context_packet
                .as_ref()
                .and_then(|packet| packet.object_refs.first().cloned())
        })
        .or_else(|| goal_context.first().map(|item| item.id.clone()))
        .unwrap_or_else(|| "state_snapshot".to_string());

    let mut field = field_signal(
        "goal:primary",
        FIELD_TYPE_GOAL,
        scope_ref,
        snapshot.staleness_at.clone(),
    );
    field.density = density;
    field.momentum = momentum;
    field.acceleration = acceleration;
    field.confidence = confidence;
    field.decay_rate = clamp_unit(0.18 + resistance_pressure * 0.24 + commitment_pressure * 0.18);
    field.projected_direction = clamp_signed_unit(projected_opportunity - projected_risk);
    field.projected_risk = projected_risk;
    field.projected_opportunity = projected_opportunity;
    field.contributing_objects = unique_refs(
        snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.object_refs.clone())
            .unwrap_or_default()
            .into_iter()
            .chain(
                goal_drafts
                    .iter()
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .collect(),
    );
    field.contributing_interactions = unique_refs(
        due_commitments
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned())
            .chain(goal_context.iter().map(|item| item.id.clone()))
            .chain(
                snapshot
                    .decision_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .response_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                goal_drafts
                    .iter()
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            )
            .collect(),
    );
    Some(field)
}

fn prepared_drafts_by_class<'a>(
    snapshot: &'a StateSnapshotContent,
    classes: &[&str],
) -> Vec<&'a PreparedDraftArtifact> {
    snapshot
        .prepared_draft_packet
        .as_ref()
        .map(|packet| {
            packet
                .drafts
                .iter()
                .filter(|draft| classes.contains(&draft.draft_class.as_str()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn has_active_state_field(snapshot: &StateSnapshotContent, field_key: &str) -> bool {
    snapshot
        .state_fields
        .iter()
        .any(|field| field.field_key == field_key && field.status == "active")
}

fn choose_relationship_scope_ref(
    snapshot: &StateSnapshotContent,
    response_source_refs: &[String],
    relationship_context: &[&StateSnapshotContextItem],
) -> Option<String> {
    snapshot
        .watcher_signals
        .iter()
        .find(|signal| !signal.thread_id.is_empty())
        .map(|signal| signal.thread_id.clone())
        .or_else(|| response_source_refs.first().cloned())
        .or_else(|| relationship_context.first().map(|item| item.id.clone()))
        .or_else(|| {
            snapshot
                .prepared_context_packet
                .as_ref()
                .and_then(|packet| packet.relationship_refs.first().cloned())
        })
}

fn choose_project_scope_ref(
    snapshot: &StateSnapshotContent,
    project_context: &[&StateSnapshotContextItem],
    project_object_refs: &[String],
) -> Option<String> {
    project_object_refs
        .first()
        .cloned()
        .or_else(|| {
            snapshot.prepared_draft_packet.as_ref().and_then(|packet| {
                packet
                    .drafts
                    .iter()
                    .flat_map(|draft| draft.object_refs.iter())
                    .next()
                    .cloned()
            })
        })
        .or_else(|| {
            snapshot
                .prepared_context_packet
                .as_ref()
                .and_then(|packet| packet.project_refs.first().cloned())
        })
        .or_else(|| project_context.first().map(|item| item.id.clone()))
}

fn relationship_object_refs(snapshot: &StateSnapshotContent) -> Vec<String> {
    unique_refs(
        snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.object_refs.clone())
            .unwrap_or_default()
            .into_iter()
            .chain(
                snapshot
                    .prepared_draft_packet
                    .as_ref()
                    .into_iter()
                    .flat_map(|packet| packet.drafts.iter())
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .collect(),
    )
}

fn unique_refs(mut refs: Vec<String>) -> Vec<String> {
    refs.retain(|item| !item.trim().is_empty());
    refs.sort();
    refs.dedup();
    refs
}

fn contains_knowledge_keyword(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    [
        "research",
        "knowledge",
        "stale",
        "evidence",
        "compare",
        "verify",
        "unknown",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
}

fn looks_like_knowledge_decision(item: &crate::state_snapshot::StateSnapshotDecisionItem) -> bool {
    contains_knowledge_keyword(&item.category)
        || contains_knowledge_keyword(&item.label)
        || contains_knowledge_keyword(&item.suggested_next_action)
}

fn looks_like_knowledge_context(item: &StateSnapshotContextItem) -> bool {
    contains_knowledge_keyword(&item.label)
        || contains_knowledge_keyword(&item.why_surfaced)
        || item.relation_path.iter().any(|relation| {
            matches!(
                relation.as_str(),
                "same_project" | "same_object" | "same_area"
            )
        })
}

fn field_priority_score(field: &FieldSignal) -> f32 {
    (field.projected_risk * 0.52)
        + (field.projected_opportunity * 0.28)
        + (field.density * 0.12)
        + field.momentum.abs() * 0.08
}

fn field_label(field_type: &str) -> &str {
    match field_type {
        FIELD_TYPE_ATTENTION => "Attention field",
        FIELD_TYPE_INTEREST => "Interest field",
        FIELD_TYPE_OBLIGATION => "Obligation field",
        FIELD_TYPE_RELATIONSHIP => "Relationship field",
        FIELD_TYPE_PROJECT => "Project field",
        FIELD_TYPE_KNOWLEDGE => "Knowledge field",
        FIELD_TYPE_OPPORTUNITY => "Opportunity field",
        FIELD_TYPE_GOAL => "Goal field",
        _ => "Field",
    }
}

fn field_summary_line(field: &FieldSignal) -> String {
    let pressure = if field.projected_risk >= 0.7 {
        "high pressure"
    } else if field.projected_risk >= 0.45 {
        "active pressure"
    } else if field.projected_opportunity >= 0.55 {
        "open opportunity"
    } else {
        "background signal"
    };
    format!(
        "{} shows {} with density {:.2} and momentum {:.2}.",
        field_label(&field.field_type),
        pressure,
        field.density,
        field.momentum
    )
}

fn field_risk_lines(field: &FieldSignal) -> Vec<String> {
    let mut risks = Vec::new();
    if field.projected_risk >= 0.68 {
        risks.push(format!(
            "{} drift risk is elevated.",
            field_label(&field.field_type)
        ));
    }
    if field.acceleration > 0.45 {
        risks.push(format!(
            "{} pressure is accelerating.",
            field_label(&field.field_type)
        ));
    }
    if field.momentum < -0.35 {
        risks.push(format!(
            "{} momentum is currently negative.",
            field_label(&field.field_type)
        ));
    }
    risks
}

fn field_opportunity_lines(field: &FieldSignal) -> Vec<String> {
    let mut opportunities = Vec::new();
    if field.projected_opportunity >= 0.48 {
        opportunities.push(format!(
            "{} has actionable preparation potential.",
            field_label(&field.field_type)
        ));
    }
    if field.momentum > 0.25 {
        opportunities.push(format!(
            "{} momentum supports forward movement.",
            field_label(&field.field_type)
        ));
    }
    opportunities
}

fn should_surface_field(field: &FieldSignal) -> bool {
    let contribution_count =
        field.contributing_objects.len() + field.contributing_interactions.len();
    let directional_strength = field.projected_direction.abs();
    let pressure_strength = field.projected_risk.max(field.projected_opportunity);

    if contribution_count < 2 {
        return false;
    }
    if field.confidence < 0.38 {
        return false;
    }
    if pressure_strength < 0.45 && directional_strength < 0.28 {
        return false;
    }
    true
}

fn suppressed_field_note(field: &FieldSignal) -> String {
    format!(
        "{} remained suppressed because evidence or directional pressure stayed below calibration thresholds.",
        field_label(&field.field_type)
    )
}

pub fn field_engine_metric_notes(metrics: &FieldEngineMetrics) -> Vec<String> {
    let mut notes = Vec::new();
    if metrics.interruption_avoided_count > 0 {
        notes.push(format!(
            "Field engine avoided surfacing {} weak candidate(s) before they became interruptions.",
            metrics.interruption_avoided_count
        ));
    }
    if metrics.preparation_ready_field_count > 0 {
        notes.push(format!(
            "Field engine sees {} surfaced field(s) with existing prepared support.",
            metrics.preparation_ready_field_count
        ));
        if metrics
            .surfaced_field_types
            .iter()
            .any(|field_type| field_type == FIELD_TYPE_GOAL)
        {
            notes.push(
                "Goal pressure already has prepared support for the next concrete commitment."
                    .to_string(),
            );
        }
        if metrics
            .surfaced_field_types
            .iter()
            .any(|field_type| field_type == FIELD_TYPE_OPPORTUNITY)
        {
            notes.push(
                "Opportunity pressure already has prepared support for a leverage-ready next step."
                    .to_string(),
            );
        }
        if metrics
            .surfaced_field_types
            .iter()
            .any(|field_type| field_type == FIELD_TYPE_INTEREST)
        {
            notes.push(
                "Interest pressure already has prepared support for topic clustering or comparison work."
                    .to_string(),
            );
        }
        if metrics
            .surfaced_field_types
            .iter()
            .any(|field_type| field_type == FIELD_TYPE_OBLIGATION)
        {
            notes.push(
                "Obligation pressure already has prepared support for readiness or bundled follow-up work."
                    .to_string(),
            );
        }
        if metrics
            .surfaced_field_types
            .iter()
            .any(|field_type| field_type == FIELD_TYPE_ATTENTION)
        {
            notes.push(
                "Attention pressure already has prepared support for batching or release work."
                    .to_string(),
            );
        }
        if metrics
            .surfaced_field_types
            .iter()
            .any(|field_type| field_type == FIELD_TYPE_KNOWLEDGE)
        {
            notes.push(
                "Knowledge pressure already has prepared support for evidence refresh or comparison work."
                    .to_string(),
            );
        }
    }
    if metrics
        .suppressed_field_types
        .iter()
        .any(|field_type| field_type == FIELD_TYPE_OBLIGATION)
    {
        notes.push(
            "Obligation pressure stayed suppressed until commitment timing or preparation support became stronger."
                .to_string(),
        );
    }
    if metrics
        .suppressed_field_types
        .iter()
        .any(|field_type| field_type == FIELD_TYPE_INTEREST)
    {
        notes.push(
            "Interest pressure stayed suppressed until topic clustering or reference continuity became stronger."
                .to_string(),
        );
    }
    if metrics
        .suppressed_field_types
        .iter()
        .any(|field_type| field_type == FIELD_TYPE_ATTENTION)
    {
        notes.push(
            "Attention pressure stayed suppressed until switching or queue fragmentation became stronger."
                .to_string(),
        );
    }
    if metrics
        .suppressed_field_types
        .iter()
        .any(|field_type| field_type == FIELD_TYPE_GOAL)
    {
        notes.push(
            "Goal pressure stayed suppressed until stronger commitment or readiness evidence appears."
                .to_string(),
        );
    }
    if metrics
        .suppressed_field_types
        .iter()
        .any(|field_type| field_type == FIELD_TYPE_OPPORTUNITY)
    {
        notes.push(
            "Opportunity pressure stayed suppressed until clearer leverage or dependency evidence appears."
                .to_string(),
        );
    }
    if metrics
        .suppressed_field_types
        .iter()
        .any(|field_type| field_type == FIELD_TYPE_KNOWLEDGE)
    {
        notes.push(
            "Knowledge pressure stayed suppressed until stronger evidence freshness or research support appears."
                .to_string(),
        );
    }
    if let Some(draft_usage_rate) = metrics
        .historical_draft_usage_rate
        .as_deref()
        .and_then(|value| value.parse::<f64>().ok())
    {
        if draft_usage_rate < 0.25 && metrics.preparation_ready_field_count > 0 {
            notes.push(format!(
                "Prepared support exists, but historical draft reuse is still low ({draft_usage_rate:.2}); keep field-driven surfacing conservative."
            ));
        }
    }
    if let Some(undone_action_rate) = metrics
        .historical_undone_action_rate
        .as_deref()
        .and_then(|value| value.parse::<f64>().ok())
    {
        if undone_action_rate > 0.3 && metrics.surfaced_field_count > 0 {
            notes.push(format!(
                "Undo pressure is elevated ({undone_action_rate:.2}); field-driven suggestions should stay reversible or review-first."
            ));
        }
    }
    if metrics.historically_reusable_family_count > 0 {
        notes.push(format!(
            "{} draft family signal(s) show historically reusable behavior.",
            metrics.historically_reusable_family_count
        ));
    }
    if metrics.historically_cautious_family_count > 0 {
        notes.push(format!(
            "{} draft family signal(s) remain in cautious or cooldown territory.",
            metrics.historically_cautious_family_count
        ));
    }
    if metrics.historical_reuse_event_count > 0 || metrics.historical_dismissed_event_count > 0 {
        notes.push(format!(
            "Outcome memory shows {} accepted vs {} dismissed draft-family event(s).",
            metrics.historical_reuse_event_count, metrics.historical_dismissed_event_count
        ));
    }
    notes
}

fn looks_like_due_soon_commitment(time_horizon: &str) -> bool {
    let lower = time_horizon.to_ascii_lowercase();
    lower.contains("today")
        || lower.contains("tomorrow")
        || lower.contains("24h")
        || lower.contains("this week")
        || lower.contains("soon")
}

pub fn apply_outcome_signals_to_field_engine_metrics(
    metrics: &mut FieldEngineMetrics,
    signals: &FieldEngineOutcomeSignals,
) {
    metrics.historical_draft_usage_rate = Some(format!("{:.2}", signals.draft_usage_rate));
    metrics.historical_undone_action_rate = Some(format!("{:.2}", signals.undone_action_rate));
    metrics.historically_reusable_family_count = signals.reusable_family_count;
    metrics.historically_cautious_family_count = signals.cautious_family_count;
    metrics.historical_reuse_event_count = signals.reuse_event_count;
    metrics.historical_dismissed_event_count = signals.dismissed_event_count;
}

fn field_has_preparation_support(snapshot: &StateSnapshotContent, field: &FieldSignal) -> bool {
    let has_prepared_context = snapshot
        .prepared_context_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let has_prepared_draft = snapshot
        .prepared_draft_packet
        .as_ref()
        .map(|packet| packet.ready)
        .unwrap_or(false);
    let actionable_pressure = field.projected_opportunity >= 0.48 || field.projected_risk >= 0.68;

    actionable_pressure && (has_prepared_context || has_prepared_draft)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        prepared_context_packet::PreparedContextPacket,
        prepared_draft_packet::{PreparedDraftArtifact, PreparedDraftPacket},
        state_fields::{STATE_FIELD_PROJECT_SCOPE_DRIFT, StateFieldActivation},
        state_snapshot::{
            StateSnapshotCommitment, StateSnapshotContent, StateSnapshotContextItem,
            StateSnapshotContinuityMetrics, StateSnapshotCriticalChange, StateSnapshotDecisionItem,
            StateSnapshotResponseItem, StateSnapshotWatcherSignal,
        },
    };

    #[test]
    fn relationship_field_detects_follow_up_drift_from_existing_evidence() {
        let snapshot = StateSnapshotContent {
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_1".to_string(),
                label: "Reply to partner".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Within 24h".to_string(),
                source_refs: vec!["msg_partner".to_string()],
                suggested_next_action: "Draft follow-up".to_string(),
            }],
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_rel_1".to_string(),
                label: "Partner thread resurfaced".to_string(),
                why_surfaced: "Same relationship resurfaced".to_string(),
                confidence: "high".to_string(),
                freshness: "reactivated".to_string(),
                relation_path: vec!["same_relationship".to_string()],
                source_refs: vec!["msg_partner".to_string()],
                decrypt_needed: false,
            }],
            watcher_signals: vec![StateSnapshotWatcherSignal {
                id: "sig_1".to_string(),
                signal_key: "watcher:partner".to_string(),
                category: "communication".to_string(),
                freshness: "fresh".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                urgency_hint: "Fresh signal still needs attention today.".to_string(),
                suppression_status: "active".to_string(),
                suppression_reason:
                    "Watcher surfaced this signal without an active suppression override."
                        .to_string(),
                escalation_status: "watch".to_string(),
                escalation_reason:
                    "Near-term watcher pressure remains active, but it does not currently justify an interruptive alert."
                        .to_string(),
                decrypt_needed: false,
                source_type: "watcher_alert".to_string(),
                source_subtype: "follow_up".to_string(),
                thread_id: "thread_partner".to_string(),
                source_refs: vec!["msg_partner".to_string()],
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                fresh_signal_count: 1,
                reactivation_signal_count: 2,
                follow_up_drift_score: 0.9,
                urgency_acceleration: 0.6,
                ..StateSnapshotContinuityMetrics::default()
            },
            state_fields: vec![StateFieldActivation {
                field_key: STATE_FIELD_RELATIONSHIP_FOLLOW_UP.to_string(),
                status: "active".to_string(),
                ..StateFieldActivation::default()
            }],
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let relationship = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_RELATIONSHIP)
            .expect("relationship field");

        assert_eq!(relationship.scope_ref, "thread_partner");
        assert!(relationship.density > 0.3);
        assert!(relationship.momentum < 0.0);
        assert!(relationship.projected_risk > relationship.projected_opportunity);
    }

    #[test]
    fn project_field_detects_stall_when_project_context_outpaces_execution() {
        let snapshot = StateSnapshotContent {
            decision_queue: vec![
                StateSnapshotDecisionItem {
                    id: "dq_1".to_string(),
                    label: "Choose API shape".to_string(),
                    category: "project".to_string(),
                    urgency: "this_week".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_project_1".to_string()],
                    suggested_next_action: "Resolve tradeoff".to_string(),
                    approval_required: false,
                },
                StateSnapshotDecisionItem {
                    id: "dq_2".to_string(),
                    label: "Confirm rollout plan".to_string(),
                    category: "project".to_string(),
                    urgency: "this_week".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_project_2".to_string()],
                    suggested_next_action: "Prepare decision memo".to_string(),
                    approval_required: false,
                },
            ],
            context_panel_items: vec![
                StateSnapshotContextItem {
                    id: "ctx_proj_1".to_string(),
                    label: "Research note on architecture alternatives".to_string(),
                    why_surfaced: "Reference resurfaced from same project".to_string(),
                    confidence: "medium".to_string(),
                    freshness: "reactivated".to_string(),
                    relation_path: vec!["same_project".to_string()],
                    source_refs: vec!["msg_project_1".to_string()],
                    decrypt_needed: false,
                },
                StateSnapshotContextItem {
                    id: "ctx_proj_2".to_string(),
                    label: "Dependency blocker discussion".to_string(),
                    why_surfaced: "Same project context".to_string(),
                    confidence: "medium".to_string(),
                    freshness: "active".to_string(),
                    relation_path: vec!["same_project".to_string(), "same_resource".to_string()],
                    source_refs: vec!["msg_project_2".to_string()],
                    decrypt_needed: false,
                },
            ],
            continuity_metrics: StateSnapshotContinuityMetrics {
                context_switch_rate: 0.72,
                unresolved_queue_pressure: 0.68,
                ..StateSnapshotContinuityMetrics::default()
            },
            state_fields: vec![StateFieldActivation {
                field_key: STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
                status: "active".to_string(),
                ..StateFieldActivation::default()
            }],
            prepared_context_packet: Some(PreparedContextPacket {
                project_refs: vec!["ctx_proj_1".to_string(), "ctx_proj_2".to_string()],
                object_refs: vec!["project:aurora".to_string()],
                ..PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(PreparedDraftPacket {
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE.to_string(),
                    label: "Project prep note".to_string(),
                    source_refs: vec!["msg_project_1".to_string()],
                    object_refs: vec!["project:aurora".to_string()],
                    ..PreparedDraftArtifact::default()
                }],
                ..PreparedDraftPacket::default()
            }),
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let project = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_PROJECT)
            .expect("project field");

        assert_eq!(project.scope_ref, "project:aurora");
        assert!(project.density > 0.45);
        assert!(project.projected_risk > 0.45);
        assert!(project.projected_opportunity > 0.0);
    }

    #[test]
    fn interest_field_detects_topic_clustering_with_reference_support() {
        let snapshot = StateSnapshotContent {
            context_panel_items: vec![
                StateSnapshotContextItem {
                    id: "ctx_interest_1".to_string(),
                    label: "Research thread around supplier strategy".to_string(),
                    why_surfaced: "Same project context remains active".to_string(),
                    confidence: "high".to_string(),
                    freshness: "active".to_string(),
                    relation_path: vec!["same_project".to_string(), "same_thread".to_string()],
                    source_refs: vec!["msg_interest_1".to_string()],
                    decrypt_needed: false,
                },
                StateSnapshotContextItem {
                    id: "ctx_interest_2".to_string(),
                    label: "Reference cluster around vendor comparisons".to_string(),
                    why_surfaced: "Same object context remains active".to_string(),
                    confidence: "medium".to_string(),
                    freshness: "active".to_string(),
                    relation_path: vec!["same_object".to_string()],
                    source_refs: vec!["msg_interest_2".to_string()],
                    decrypt_needed: false,
                },
            ],
            watcher_signals: vec![StateSnapshotWatcherSignal {
                id: "sig_interest".to_string(),
                signal_key: "watcher:interest_cluster".to_string(),
                category: "knowledge".to_string(),
                freshness: "fresh".to_string(),
                urgency: "this_week".to_string(),
                confidence: "medium".to_string(),
                urgency_hint: "Fresh watcher signal is still active now.".to_string(),
                suppression_status: "active".to_string(),
                suppression_reason:
                    "Watcher surfaced this signal without an active suppression override."
                        .to_string(),
                escalation_status: "quiet".to_string(),
                escalation_reason: "Signal remains available as low-pressure watcher context."
                    .to_string(),
                decrypt_needed: false,
                source_type: "watcher_alert".to_string(),
                source_subtype: "topic_cluster".to_string(),
                thread_id: "thread_interest".to_string(),
                source_refs: vec!["msg_interest_2".to_string()],
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                fresh_signal_count: 2,
                context_switch_rate: 0.28,
                ..StateSnapshotContinuityMetrics::default()
            },
            prepared_context_packet: Some(PreparedContextPacket {
                ready: true,
                reference_refs: vec!["thread:interest_research".to_string()],
                object_refs: vec!["project:interest".to_string()],
                packs: vec![crate::prepared_context_packet::PreparedContextPack {
                    pack_id: "pack_interest".to_string(),
                    pack_kind: PREPARED_CONTEXT_PACK_KIND_TOPIC.to_string(),
                    title: "Interest topic pack".to_string(),
                    summary: "Clustered topic context".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from topic continuity.".to_string(),
                    anchor_refs: vec!["msg_interest_1".to_string()],
                    source_refs: vec!["msg_interest_1".to_string()],
                    reference_refs: vec!["thread:interest_research".to_string()],
                    object_refs: vec!["project:interest".to_string()],
                    evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                    ..crate::prepared_context_packet::PreparedContextPack::default()
                }],
                ..PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_interest".to_string(),
                    draft_class: PREPARED_DRAFT_CLASS_COMPARISON_TABLE.to_string(),
                    label: "Interest comparison".to_string(),
                    readiness: "ready".to_string(),
                    source_refs: vec!["msg_interest_1".to_string()],
                    object_refs: vec!["project:interest".to_string()],
                    ..PreparedDraftArtifact::default()
                }],
                ..PreparedDraftPacket::default()
            }),
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let interest = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_INTEREST)
            .expect("interest field");

        assert_eq!(interest.scope_ref, "project:interest");
        assert!(interest.density > 0.3);
        assert!(interest.projected_opportunity > 0.3);
        assert!(interest.confidence > 0.4);
    }

    #[test]
    fn opportunity_field_detects_ready_leverage_when_preparation_and_pressure_align() {
        let snapshot = StateSnapshotContent {
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "dq_1".to_string(),
                label: "Choose launch path".to_string(),
                category: "project".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["msg_decision".to_string()],
                suggested_next_action: "Review tradeoffs".to_string(),
                approval_required: false,
            }],
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_1".to_string(),
                label: "Reply to stakeholder update".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Within 24h".to_string(),
                source_refs: vec!["msg_reply".to_string()],
                suggested_next_action: "Use prepared draft".to_string(),
            }],
            active_commitments: vec![StateSnapshotCommitment {
                label: "Launch sync".to_string(),
                time_horizon: "tomorrow".to_string(),
                source_refs: vec!["calendar_launch".to_string()],
            }],
            critical_changes: vec![StateSnapshotCriticalChange {
                label: "Stakeholder feedback arrived".to_string(),
                delta_type: "new_signal".to_string(),
                source_refs: vec!["msg_feedback".to_string()],
            }],
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_proj_1".to_string(),
                label: "Launch comparison context".to_string(),
                why_surfaced: "Prepared from same project and object".to_string(),
                confidence: "high".to_string(),
                freshness: "active".to_string(),
                relation_path: vec!["same_project".to_string(), "same_object".to_string()],
                source_refs: vec!["msg_decision".to_string()],
                decrypt_needed: false,
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                fresh_signal_count: 2,
                urgency_acceleration: 0.62,
                unresolved_queue_pressure: 0.58,
                ..StateSnapshotContinuityMetrics::default()
            },
            prepared_context_packet: Some(PreparedContextPacket {
                ready: true,
                source_refs: vec!["msg_decision".to_string(), "msg_feedback".to_string()],
                anchor_refs: vec!["ctx_proj_1".to_string()],
                object_refs: vec!["project:launch".to_string()],
                ..PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: PREPARED_DRAFT_CLASS_DECISION_MEMO.to_string(),
                    label: "Decision memo".to_string(),
                    readiness: "ready_now".to_string(),
                    source_refs: vec!["msg_decision".to_string()],
                    object_refs: vec!["project:launch".to_string()],
                    ..PreparedDraftArtifact::default()
                }],
                ..PreparedDraftPacket::default()
            }),
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let opportunity = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_OPPORTUNITY)
            .expect("opportunity field");

        assert_eq!(opportunity.scope_ref, "project:launch");
        assert!(opportunity.density > 0.35);
        assert!(opportunity.momentum > 0.2);
        assert!(opportunity.projected_opportunity > opportunity.projected_risk);
        assert!(
            opportunity
                .contributing_interactions
                .contains(&"msg_decision".to_string())
        );
    }

    #[test]
    fn goal_field_detects_ready_commitment_pressure_with_existing_support() {
        let snapshot = StateSnapshotContent {
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "dq_1".to_string(),
                label: "Confirm launch path".to_string(),
                category: "project".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_goal_decision".to_string()],
                suggested_next_action: "Approve launch path".to_string(),
                approval_required: false,
            }],
            active_commitments: vec![StateSnapshotCommitment {
                label: "Launch review".to_string(),
                time_horizon: "tomorrow".to_string(),
                source_refs: vec!["calendar_goal".to_string()],
            }],
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_goal_1".to_string(),
                label: "Launch plan context".to_string(),
                why_surfaced: "Same project context remains active".to_string(),
                confidence: "high".to_string(),
                freshness: "active".to_string(),
                relation_path: vec!["same_project".to_string(), "same_object".to_string()],
                source_refs: vec!["msg_goal_decision".to_string()],
                decrypt_needed: false,
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                urgency_acceleration: 0.58,
                unresolved_queue_pressure: 0.42,
                ..StateSnapshotContinuityMetrics::default()
            },
            prepared_context_packet: Some(PreparedContextPacket {
                ready: true,
                object_refs: vec!["project:launch".to_string()],
                ..PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_goal_1".to_string(),
                    draft_class: PREPARED_DRAFT_CLASS_TASK_BUNDLE.to_string(),
                    label: "Launch task bundle".to_string(),
                    readiness: "ready".to_string(),
                    source_refs: vec!["msg_goal_decision".to_string()],
                    object_refs: vec!["project:launch".to_string()],
                    ..PreparedDraftArtifact::default()
                }],
                ..PreparedDraftPacket::default()
            }),
            state_fields: vec![StateFieldActivation {
                field_key: STATE_FIELD_MEETING_READINESS.to_string(),
                status: "active".to_string(),
                ..StateFieldActivation::default()
            }],
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let goal = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_GOAL)
            .expect("goal field");

        assert_eq!(goal.scope_ref, "calendar_goal");
        assert!(goal.density > 0.3);
        assert!(goal.projected_opportunity > 0.45);
        assert!(goal.confidence > 0.45);
    }

    #[test]
    fn knowledge_field_detects_stale_research_pressure_with_prepared_support() {
        let snapshot = StateSnapshotContent {
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "dq_research".to_string(),
                label: "Verify evidence before rollout".to_string(),
                category: "research".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["msg_research".to_string()],
                suggested_next_action: "Compare current assumptions".to_string(),
                approval_required: false,
            }],
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_research".to_string(),
                label: "Research comparison note".to_string(),
                why_surfaced: "Same project context still looks knowledge-constrained.".to_string(),
                confidence: "medium".to_string(),
                freshness: "stale".to_string(),
                relation_path: vec!["same_project".to_string(), "same_object".to_string()],
                source_refs: vec!["msg_research".to_string()],
                decrypt_needed: false,
            }],
            watcher_signals: vec![StateSnapshotWatcherSignal {
                id: "sig_stale".to_string(),
                signal_key: "watcher:stale_research".to_string(),
                category: "knowledge".to_string(),
                freshness: "stale".to_string(),
                urgency: "this_week".to_string(),
                confidence: "medium".to_string(),
                urgency_hint: "Signal remains visible, but its timing pressure is aging.".to_string(),
                suppression_status: "active".to_string(),
                suppression_reason:
                    "Watcher surfaced this signal without an active suppression override."
                        .to_string(),
                escalation_status: "quiet".to_string(),
                escalation_reason:
                    "Signal is still retained as background context, but its escalation pressure has decayed."
                        .to_string(),
                decrypt_needed: false,
                source_type: "watcher_alert".to_string(),
                source_subtype: "stale_reference".to_string(),
                thread_id: "thread_research".to_string(),
                source_refs: vec!["msg_research".to_string()],
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                unresolved_queue_pressure: 0.58,
                urgency_acceleration: 0.42,
                ..StateSnapshotContinuityMetrics::default()
            },
            state_fields: vec![
                StateFieldActivation {
                    field_key: STATE_FIELD_RESEARCH_GAP.to_string(),
                    status: "active".to_string(),
                    ..StateFieldActivation::default()
                },
                StateFieldActivation {
                    field_key: STATE_FIELD_STALE_KNOWLEDGE_RISK.to_string(),
                    status: "monitor".to_string(),
                    ..StateFieldActivation::default()
                },
            ],
            prepared_context_packet: Some(PreparedContextPacket {
                ready: true,
                object_refs: vec!["project:knowledge_launch".to_string()],
                ..PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_compare".to_string(),
                    draft_class: PREPARED_DRAFT_CLASS_COMPARISON_TABLE.to_string(),
                    label: "Research comparison".to_string(),
                    readiness: "ready_now".to_string(),
                    source_refs: vec!["msg_research".to_string()],
                    object_refs: vec!["project:knowledge_launch".to_string()],
                    ..PreparedDraftArtifact::default()
                }],
                ..PreparedDraftPacket::default()
            }),
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let knowledge = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_KNOWLEDGE)
            .expect("knowledge field");

        assert_eq!(knowledge.scope_ref, "project:knowledge_launch");
        assert!(knowledge.density > 0.35);
        assert!(knowledge.projected_risk > 0.45);
        assert!(knowledge.projected_opportunity > 0.25);
    }

    #[test]
    fn attention_field_detects_fragmented_queue_pressure_with_prepared_support() {
        let snapshot = StateSnapshotContent {
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "dq_attention".to_string(),
                label: "Resolve contract choice".to_string(),
                category: "project".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_attention_decision".to_string()],
                suggested_next_action: "Review options".to_string(),
                approval_required: false,
            }],
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_attention".to_string(),
                label: "Reply to customer thread".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Within 24h".to_string(),
                source_refs: vec!["msg_attention_reply".to_string()],
                suggested_next_action: "Use prepared reply".to_string(),
            }],
            critical_changes: vec![StateSnapshotCriticalChange {
                label: "New blocker surfaced".to_string(),
                delta_type: "new_signal".to_string(),
                source_refs: vec!["msg_attention_change".to_string()],
            }],
            watcher_signals: vec![StateSnapshotWatcherSignal {
                id: "sig_attention".to_string(),
                signal_key: "watcher:attention_split".to_string(),
                category: "workflow".to_string(),
                freshness: "fresh".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                urgency_hint: "Fresh signal still needs attention today.".to_string(),
                suppression_status: "active".to_string(),
                suppression_reason:
                    "Watcher surfaced this signal without an active suppression override."
                        .to_string(),
                escalation_status: "watch".to_string(),
                escalation_reason:
                    "Near-term watcher pressure remains active, but it does not currently justify an interruptive alert."
                        .to_string(),
                decrypt_needed: false,
                source_type: "watcher_alert".to_string(),
                source_subtype: "context_switch".to_string(),
                thread_id: "thread_attention".to_string(),
                source_refs: vec!["msg_attention_reply".to_string()],
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                context_switch_rate: 0.81,
                unresolved_queue_pressure: 0.74,
                urgency_acceleration: 0.66,
                follow_up_drift_score: 0.42,
                ..StateSnapshotContinuityMetrics::default()
            },
            prepared_context_packet: Some(PreparedContextPacket {
                ready: true,
                object_refs: vec!["project:attention".to_string()],
                ..PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_attention".to_string(),
                    draft_class: PREPARED_DRAFT_CLASS_TASK_BUNDLE.to_string(),
                    label: "Batch next steps".to_string(),
                    readiness: "ready".to_string(),
                    source_refs: vec!["msg_attention_decision".to_string()],
                    object_refs: vec!["project:attention".to_string()],
                    ..PreparedDraftArtifact::default()
                }],
                ..PreparedDraftPacket::default()
            }),
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let attention = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_ATTENTION)
            .expect("attention field");

        assert_eq!(attention.scope_ref, "msg_attention_decision");
        assert!(attention.density > 0.35);
        assert!(attention.projected_risk > 0.45);
        assert!(attention.projected_opportunity > 0.2);
    }

    #[test]
    fn obligation_field_detects_due_commitment_pressure_with_prepared_support() {
        let snapshot = StateSnapshotContent {
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "dq_obligation".to_string(),
                label: "Approve contract handoff".to_string(),
                category: "operations".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_obligation_decision".to_string()],
                suggested_next_action: "Approve handoff".to_string(),
                approval_required: true,
            }],
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_obligation".to_string(),
                label: "Reply to due handoff thread".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Within 24h".to_string(),
                source_refs: vec!["msg_obligation_reply".to_string()],
                suggested_next_action: "Use prepared reply".to_string(),
            }],
            active_commitments: vec![StateSnapshotCommitment {
                label: "Client handoff".to_string(),
                time_horizon: "tomorrow".to_string(),
                source_refs: vec!["calendar_obligation".to_string()],
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                deadline_signal_count: 2,
                urgency_acceleration: 0.52,
                unresolved_queue_pressure: 0.44,
                follow_up_drift_score: 0.36,
                ..StateSnapshotContinuityMetrics::default()
            },
            state_fields: vec![
                StateFieldActivation {
                    field_key: STATE_FIELD_MEETING_READINESS.to_string(),
                    status: "monitor".to_string(),
                    ..StateFieldActivation::default()
                },
                StateFieldActivation {
                    field_key: STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                    status: "active".to_string(),
                    ..StateFieldActivation::default()
                },
            ],
            prepared_context_packet: Some(PreparedContextPacket {
                ready: true,
                object_refs: vec!["project:handoff".to_string()],
                packs: vec![crate::prepared_context_packet::PreparedContextPack {
                    pack_id: "pack_obligation".to_string(),
                    pack_kind: PREPARED_CONTEXT_PACK_KIND_OBLIGATION.to_string(),
                    title: "Handoff obligation pack".to_string(),
                    summary: "Due commitments and follow-up context.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Due commitment".to_string(),
                    anchor_refs: vec!["calendar_obligation".to_string()],
                    source_refs: vec!["calendar_obligation".to_string()],
                    reference_refs: Vec::new(),
                    object_refs: vec!["project:handoff".to_string()],
                    evidence_kinds: vec!["project".to_string()],
                    ..crate::prepared_context_packet::PreparedContextPack::default()
                }],
                ..PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                drafts: vec![
                    PreparedDraftArtifact {
                        draft_id: "draft_meeting".to_string(),
                        draft_class: PREPARED_DRAFT_CLASS_MEETING_BRIEF.to_string(),
                        label: "Handoff brief".to_string(),
                        readiness: "ready".to_string(),
                        source_refs: vec!["calendar_obligation".to_string()],
                        object_refs: vec!["project:handoff".to_string()],
                        ..PreparedDraftArtifact::default()
                    },
                    PreparedDraftArtifact {
                        draft_id: "draft_bundle".to_string(),
                        draft_class: PREPARED_DRAFT_CLASS_TASK_BUNDLE.to_string(),
                        label: "Handoff bundle".to_string(),
                        readiness: "ready_now".to_string(),
                        source_refs: vec!["msg_obligation_reply".to_string()],
                        object_refs: vec!["project:handoff".to_string()],
                        ..PreparedDraftArtifact::default()
                    },
                ],
                ..PreparedDraftPacket::default()
            }),
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let engine_snapshot = build_field_engine_snapshot(&snapshot);
        let obligation = engine_snapshot
            .fields
            .iter()
            .find(|field| field.field_type == FIELD_TYPE_OBLIGATION)
            .expect("obligation field");

        assert_eq!(obligation.scope_ref, "calendar_obligation");
        assert!(obligation.density > 0.3);
        assert!(obligation.projected_risk > 0.4);
        assert!(obligation.projected_opportunity > 0.25);
        assert!(obligation.confidence > 0.4);
    }

    #[test]
    fn field_engine_summary_prefers_high_pressure_field() {
        let summary = summarize_field_engine_snapshot(&FieldEngineSnapshot {
            fields: vec![
                FieldSignal {
                    field_type: FIELD_TYPE_RELATIONSHIP.to_string(),
                    projected_risk: 0.42,
                    projected_opportunity: 0.52,
                    density: 0.5,
                    momentum: -0.1,
                    ..FieldSignal::default()
                },
                FieldSignal {
                    field_type: FIELD_TYPE_PROJECT.to_string(),
                    projected_risk: 0.82,
                    projected_opportunity: 0.31,
                    density: 0.64,
                    momentum: -0.48,
                    acceleration: 0.55,
                    ..FieldSignal::default()
                },
            ],
            ..FieldEngineSnapshot::default()
        })
        .expect("field summary");

        assert!(summary.summary.contains("Project field"));
        assert!(summary.risks.iter().any(|risk| risk.contains("elevated")));
        assert!(
            summary
                .risks
                .iter()
                .any(|risk| risk.contains("accelerating"))
        );
    }

    #[test]
    fn evaluation_suppresses_weak_relationship_signal() {
        let snapshot = StateSnapshotContent {
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_1".to_string(),
                label: "Reply later".to_string(),
                channel: "email".to_string(),
                urgency: "low".to_string(),
                confidence: "low".to_string(),
                response_due_hint: "Soon".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review".to_string(),
            }],
            continuity_metrics: StateSnapshotContinuityMetrics::default(),
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(evaluation.snapshot.fields.is_empty());
        assert!(evaluation.metrics.candidate_field_count >= 1);
        assert_eq!(evaluation.metrics.surfaced_field_count, 0);
        assert!(
            evaluation
                .metrics
                .suppressed_field_types
                .contains(&FIELD_TYPE_RELATIONSHIP.to_string())
        );
        assert!(
            evaluation
                .metrics
                .suppressed_field_types
                .contains(&FIELD_TYPE_ATTENTION.to_string())
        );
    }

    #[test]
    fn evaluation_suppresses_weak_project_signal() {
        let snapshot = StateSnapshotContent {
            prepared_context_packet: Some(PreparedContextPacket {
                project_refs: vec!["project:aurora".to_string()],
                ..PreparedContextPacket::default()
            }),
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(evaluation.snapshot.fields.is_empty());
        assert_eq!(evaluation.metrics.candidate_field_count, 1);
        assert_eq!(evaluation.metrics.surfaced_field_count, 0);
        assert!(
            evaluation
                .metrics
                .suppressed_field_types
                .contains(&FIELD_TYPE_PROJECT.to_string())
        );
    }

    #[test]
    fn evaluation_suppresses_weak_opportunity_signal() {
        let snapshot = StateSnapshotContent {
            active_commitments: vec![StateSnapshotCommitment {
                label: "Keep an eye on this".to_string(),
                time_horizon: "today".to_string(),
                source_refs: vec!["calendar_1".to_string()],
            }],
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(evaluation.snapshot.fields.is_empty());
        assert!(evaluation.metrics.candidate_field_count >= 1);
        assert_eq!(evaluation.metrics.surfaced_field_count, 0);
        assert!(
            evaluation
                .metrics
                .suppressed_field_types
                .contains(&FIELD_TYPE_OPPORTUNITY.to_string())
        );
    }

    #[test]
    fn evaluation_suppresses_weak_goal_signal() {
        let snapshot = StateSnapshotContent {
            active_commitments: vec![StateSnapshotCommitment {
                label: "Someday maybe".to_string(),
                time_horizon: "later".to_string(),
                source_refs: vec!["calendar_future".to_string()],
            }],
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(evaluation.snapshot.fields.is_empty());
        assert_eq!(evaluation.metrics.candidate_field_count, 0);
        assert!(
            !evaluation
                .metrics
                .suppressed_field_types
                .contains(&FIELD_TYPE_GOAL.to_string())
        );
    }

    #[test]
    fn evaluation_suppresses_weak_knowledge_signal() {
        let snapshot = StateSnapshotContent {
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_thin".to_string(),
                label: "Background project note".to_string(),
                why_surfaced: "Same project context".to_string(),
                confidence: "low".to_string(),
                freshness: "stale".to_string(),
                relation_path: vec!["same_project".to_string()],
                source_refs: vec!["msg_ctx".to_string()],
                decrypt_needed: false,
            }],
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(
            !evaluation
                .snapshot
                .fields
                .iter()
                .any(|field| field.field_type == FIELD_TYPE_KNOWLEDGE)
        );
        assert!(
            evaluation
                .metrics
                .suppressed_field_types
                .contains(&FIELD_TYPE_KNOWLEDGE.to_string())
        );
    }

    #[test]
    fn evaluation_does_not_surface_interest_from_thin_signal() {
        let snapshot = StateSnapshotContent {
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_interest_thin".to_string(),
                label: "General note".to_string(),
                why_surfaced: "Same project context".to_string(),
                confidence: "low".to_string(),
                freshness: "stale".to_string(),
                relation_path: vec!["same_project".to_string()],
                source_refs: vec!["msg_interest_thin".to_string()],
                decrypt_needed: false,
            }],
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(
            !evaluation
                .snapshot
                .fields
                .iter()
                .any(|field| field.field_type == FIELD_TYPE_INTEREST)
        );
    }

    #[test]
    fn evaluation_suppresses_weak_attention_signal() {
        let snapshot = StateSnapshotContent {
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_thin_attention".to_string(),
                label: "Reply sometime".to_string(),
                channel: "email".to_string(),
                urgency: "low".to_string(),
                confidence: "low".to_string(),
                response_due_hint: "Soon".to_string(),
                source_refs: vec!["msg_thin_attention".to_string()],
                suggested_next_action: "Review".to_string(),
            }],
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(
            !evaluation
                .snapshot
                .fields
                .iter()
                .any(|field| field.field_type == FIELD_TYPE_ATTENTION)
        );
        assert!(
            evaluation
                .metrics
                .suppressed_field_types
                .contains(&FIELD_TYPE_ATTENTION.to_string())
        );
    }

    #[test]
    fn evaluation_suppresses_weak_obligation_signal() {
        let snapshot = StateSnapshotContent {
            active_commitments: vec![StateSnapshotCommitment {
                label: "Maybe later".to_string(),
                time_horizon: "later".to_string(),
                source_refs: vec!["calendar_later".to_string()],
            }],
            staleness_at: "2026-06-25T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);

        assert!(
            !evaluation
                .snapshot
                .fields
                .iter()
                .any(|field| field.field_type == FIELD_TYPE_OBLIGATION)
        );
    }

    #[test]
    fn evaluation_counts_preparation_ready_fields_and_interruptions_avoided() {
        let snapshot = StateSnapshotContent {
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_1".to_string(),
                label: "Reply to partner".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Within 24h".to_string(),
                source_refs: vec!["msg_partner".to_string()],
                suggested_next_action: "Draft follow-up".to_string(),
            }],
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_rel_1".to_string(),
                label: "Partner thread resurfaced".to_string(),
                why_surfaced: "Same relationship resurfaced".to_string(),
                confidence: "high".to_string(),
                freshness: "reactivated".to_string(),
                relation_path: vec!["same_relationship".to_string()],
                source_refs: vec!["msg_partner".to_string()],
                decrypt_needed: false,
            }],
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: PREPARED_DRAFT_CLASS_FOLLOW_UP.to_string(),
                    label: "Follow up".to_string(),
                    source_refs: vec!["msg_partner".to_string()],
                    ..PreparedDraftArtifact::default()
                }],
                ..PreparedDraftPacket::default()
            }),
            continuity_metrics: StateSnapshotContinuityMetrics {
                fresh_signal_count: 1,
                reactivation_signal_count: 2,
                follow_up_drift_score: 0.9,
                urgency_acceleration: 0.6,
                ..StateSnapshotContinuityMetrics::default()
            },
            state_fields: vec![StateFieldActivation {
                field_key: STATE_FIELD_RELATIONSHIP_FOLLOW_UP.to_string(),
                status: "active".to_string(),
                ..StateFieldActivation::default()
            }],
            staleness_at: "2026-06-20T10:00:00Z".to_string(),
            ..StateSnapshotContent::default()
        };

        let evaluation = evaluate_field_engine_snapshot(&snapshot);
        let notes = field_engine_metric_notes(&evaluation.metrics);

        assert!(evaluation.metrics.preparation_ready_field_count >= 1);
        assert!(evaluation.metrics.interruption_avoided_count >= 1);
        assert!(
            notes
                .iter()
                .any(|note| note.contains("existing prepared support"))
        );
        assert!(notes.iter().any(|note| note.contains("avoided surfacing")));
    }

    #[test]
    fn outcome_signals_extend_metric_notes_for_low_reuse_and_high_undo_pressure() {
        let mut metrics = FieldEngineMetrics {
            surfaced_field_count: 1,
            preparation_ready_field_count: 1,
            surfaced_field_types: vec![
                FIELD_TYPE_GOAL.to_string(),
                FIELD_TYPE_OPPORTUNITY.to_string(),
            ],
            suppressed_field_types: vec![FIELD_TYPE_PROJECT.to_string()],
            ..FieldEngineMetrics::default()
        };
        apply_outcome_signals_to_field_engine_metrics(
            &mut metrics,
            &FieldEngineOutcomeSignals {
                draft_usage_rate: 0.18,
                undone_action_rate: 0.44,
                reusable_family_count: 1,
                cautious_family_count: 2,
                reuse_event_count: 5,
                dismissed_event_count: 3,
            },
        );

        let notes = field_engine_metric_notes(&metrics);

        assert!(
            notes
                .iter()
                .any(|note| note.contains("draft reuse is still low"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Undo pressure is elevated"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("historically reusable behavior"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("cautious or cooldown territory"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("5 accepted vs 3 dismissed"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Goal pressure already has prepared support"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Opportunity pressure already has prepared support"))
        );
    }

    #[test]
    fn metric_notes_surface_goal_and_opportunity_suppression_guidance() {
        let metrics = FieldEngineMetrics {
            interruption_avoided_count: 2,
            suppressed_field_types: vec![
                FIELD_TYPE_GOAL.to_string(),
                FIELD_TYPE_OPPORTUNITY.to_string(),
            ],
            ..FieldEngineMetrics::default()
        };

        let notes = field_engine_metric_notes(&metrics);

        assert!(
            notes
                .iter()
                .any(|note| note.contains("Goal pressure stayed suppressed"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Opportunity pressure stayed suppressed"))
        );
    }

    #[test]
    fn metric_notes_surface_knowledge_support_and_suppression_guidance() {
        let metrics = FieldEngineMetrics {
            preparation_ready_field_count: 1,
            surfaced_field_types: vec![FIELD_TYPE_KNOWLEDGE.to_string()],
            suppressed_field_types: vec![FIELD_TYPE_KNOWLEDGE.to_string()],
            ..FieldEngineMetrics::default()
        };

        let notes = field_engine_metric_notes(&metrics);

        assert!(
            notes
                .iter()
                .any(|note| note
                    .contains("prepared support for evidence refresh or comparison work"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Knowledge pressure stayed suppressed"))
        );
    }

    #[test]
    fn metric_notes_surface_attention_support_and_suppression_guidance() {
        let metrics = FieldEngineMetrics {
            preparation_ready_field_count: 1,
            surfaced_field_types: vec![FIELD_TYPE_ATTENTION.to_string()],
            suppressed_field_types: vec![FIELD_TYPE_ATTENTION.to_string()],
            ..FieldEngineMetrics::default()
        };

        let notes = field_engine_metric_notes(&metrics);

        assert!(
            notes
                .iter()
                .any(|note| note.contains("batching or release work"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Attention pressure stayed suppressed"))
        );
    }

    #[test]
    fn metric_notes_surface_interest_support_and_suppression_guidance() {
        let metrics = FieldEngineMetrics {
            preparation_ready_field_count: 1,
            surfaced_field_types: vec![FIELD_TYPE_INTEREST.to_string()],
            suppressed_field_types: vec![FIELD_TYPE_INTEREST.to_string()],
            ..FieldEngineMetrics::default()
        };

        let notes = field_engine_metric_notes(&metrics);

        assert!(
            notes
                .iter()
                .any(|note| note.contains("topic clustering or comparison work"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Interest pressure stayed suppressed"))
        );
    }

    #[test]
    fn metric_notes_surface_obligation_support_and_suppression_guidance() {
        let metrics = FieldEngineMetrics {
            preparation_ready_field_count: 1,
            surfaced_field_types: vec![FIELD_TYPE_OBLIGATION.to_string()],
            suppressed_field_types: vec![FIELD_TYPE_OBLIGATION.to_string()],
            ..FieldEngineMetrics::default()
        };

        let notes = field_engine_metric_notes(&metrics);

        assert!(
            notes
                .iter()
                .any(|note| note.contains("readiness or bundled follow-up work"))
        );
        assert!(
            notes
                .iter()
                .any(|note| note.contains("Obligation pressure stayed suppressed"))
        );
    }
}
