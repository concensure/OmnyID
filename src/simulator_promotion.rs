use std::collections::HashMap;

use serde_json::{Value, json};

use crate::{
    message::{AFP_KIND_RICH_NOTE, AFPMessage},
    prepared_context_packet::{
        PREPARED_CONTEXT_KIND_CONTINUITY, PREPARED_CONTEXT_PACK_KIND_TOPIC, PreparedContextPack,
        PreparedContextPacket,
    },
    prepared_draft_packet::{
        PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE, PreparedDraftArtifact, PreparedDraftPacket,
    },
    reversible_actions::{
        DraftTaskCreationRequest, ReversibleActionBundle, TentativeCalendarHoldRequest,
        build_draft_task_creation_bundle, build_tentative_calendar_hold_bundle,
    },
    server::approval_surfaces::{action_capability_id, build_action_approval_review_payload},
    simulator_contract::{
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED, SIMULATOR_PROMOTION_PREPARED_CONTEXT,
        SIMULATOR_PROMOTION_PREPARED_DRAFT, SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
        SimulatorBoundaryInput, SimulatorPromotionCandidate, simulator_promotion_candidate,
    },
    simulator_graph::SimulatorRelevantStateGraph,
    simulator_loop::SimulatorTraceStep,
};

pub fn build_simulator_promotions(
    input: &SimulatorBoundaryInput,
    graph: &SimulatorRelevantStateGraph,
    trace_steps: &[SimulatorTraceStep],
) -> Vec<SimulatorPromotionCandidate> {
    if !input.allow_promotion {
        return Vec::new();
    }

    let nodes_by_id = graph
        .nodes
        .iter()
        .map(|node| (node.node_id.as_str(), node))
        .collect::<HashMap<_, _>>();
    let mut promotions = Vec::new();

    for target_kind in prioritized_promotion_targets(input) {
        let mut matching_steps = trace_steps
            .iter()
            .filter(|step| step.promotion_target.as_deref() == Some(target_kind))
            .collect::<Vec<_>>();
        if matching_steps.is_empty() {
            continue;
        }
        matching_steps.sort_by_key(|step| {
            (
                step_focus_rank(input, target_kind, step),
                step.rollout_index,
                step.step_index,
                step.node_id.as_str(),
            )
        });

        let summary =
            field_guided_promotion_summary(input, promotion_summary(target_kind, &matching_steps));
        let source_refs = unique_strings(
            matching_steps
                .iter()
                .filter_map(|step| nodes_by_id.get(step.node_id.as_str()).copied())
                .flat_map(|node| node.source_refs.iter().cloned())
                .collect(),
        );
        let object_refs = unique_strings(
            matching_steps
                .iter()
                .filter_map(|step| nodes_by_id.get(step.node_id.as_str()).copied())
                .flat_map(|node| node.object_refs.iter().cloned())
                .collect(),
        );

        let primary_step = matching_steps[0];
        let mut promotion =
            simulator_promotion_candidate(target_kind, summary, source_refs, object_refs);
        promotion.preview_action_kind = Some(primary_step.action_kind.clone());
        promotion.preview_node_kind = Some(primary_step.node_kind.clone());
        promotion.preview_node_label = Some(primary_step.node_label.clone());
        promotions.push(promotion);
    }

    promotions
}

fn prioritized_promotion_targets(input: &SimulatorBoundaryInput) -> [&'static str; 4] {
    match input.relevant_state.field_engine_focus_type.as_deref() {
        Some("attention") => [
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
        ],
        Some("interest") => [
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
        ],
        Some("obligation") => [
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
        ],
        Some("relationship") => [
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
        ],
        Some("project") => [
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
        ],
        Some("goal") => [
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
        ],
        Some("opportunity") => [
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
        ],
        Some("knowledge") => [
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
        ],
        _ => [
            SIMULATOR_PROMOTION_PREPARED_CONTEXT,
            SIMULATOR_PROMOTION_PREPARED_DRAFT,
            SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
            SIMULATOR_PROMOTION_APPROVAL_REQUIRED,
        ],
    }
}

fn step_focus_rank(
    input: &SimulatorBoundaryInput,
    target_kind: &str,
    step: &SimulatorTraceStep,
) -> u8 {
    match input.relevant_state.field_engine_focus_type.as_deref() {
        Some("attention") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "response", "send_summary") => 0,
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "decision", "propose_alternative") => 1,
            (SIMULATOR_PROMOTION_REVERSIBLE_ACTION, "commitment", "defer_task") => 0,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "critical_change", "flag_conflict") => 1,
            _ => 3,
        },
        Some("interest") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "context_item", "flag_conflict") => 0,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "critical_change", "flag_conflict") => 1,
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "decision", "propose_alternative") => 1,
            (SIMULATOR_PROMOTION_APPROVAL_REQUIRED, "response", _) => 2,
            _ => 3,
        },
        Some("obligation") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "commitment", "schedule_meeting") => 0,
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "response", "send_summary") => 1,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "commitment", _) => 1,
            (SIMULATOR_PROMOTION_REVERSIBLE_ACTION, "commitment", "defer_task") => 2,
            _ => 3,
        },
        Some("relationship") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_APPROVAL_REQUIRED, "response", "send_summary") => 0,
            (SIMULATOR_PROMOTION_APPROVAL_REQUIRED, "commitment", "schedule_meeting") => 0,
            (SIMULATOR_PROMOTION_REVERSIBLE_ACTION, "commitment", "defer_task") => 1,
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "response", _) => 1,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "critical_change", _) => 2,
            _ => 3,
        },
        Some("project") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "decision", "propose_alternative") => 0,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "critical_change", "flag_conflict") => 0,
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "context_item", _) => 1,
            (SIMULATOR_PROMOTION_REVERSIBLE_ACTION, "commitment", "defer_task") => 2,
            _ => 3,
        },
        Some("goal") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "commitment", "schedule_meeting") => 0,
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "decision", "propose_alternative") => 1,
            (SIMULATOR_PROMOTION_REVERSIBLE_ACTION, "commitment", "defer_task") => 1,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "context_item", _) => 2,
            _ => 3,
        },
        Some("opportunity") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "decision", "propose_alternative") => 0,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "critical_change", "flag_conflict") => 1,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "context_item", _) => 1,
            (SIMULATOR_PROMOTION_APPROVAL_REQUIRED, "decision", _) => 2,
            _ => 3,
        },
        Some("knowledge") => match (
            target_kind,
            step.node_kind.as_str(),
            step.action_kind.as_str(),
        ) {
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "context_item", "flag_conflict") => 0,
            (SIMULATOR_PROMOTION_PREPARED_CONTEXT, "critical_change", "flag_conflict") => 1,
            (SIMULATOR_PROMOTION_PREPARED_DRAFT, "decision", "propose_alternative") => 1,
            (SIMULATOR_PROMOTION_APPROVAL_REQUIRED, "response", _) => 2,
            _ => 3,
        },
        _ => 1,
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SimulatorPromotionWritebackPreview {
    pub prepared_context_packet: Option<PreparedContextPacket>,
    pub prepared_draft_packet: Option<PreparedDraftPacket>,
    pub reversible_action_bundle: Option<ReversibleActionBundle>,
    pub approval_review: Option<Value>,
}

fn review_surface_available(candidate: &SimulatorPromotionCandidate) -> bool {
    candidate
        .review_surface
        .as_ref()
        .map(|surface| surface.review_available)
        .unwrap_or(false)
}

pub fn materialize_simulator_promotions(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    promotions: &[SimulatorPromotionCandidate],
) -> SimulatorPromotionWritebackPreview {
    SimulatorPromotionWritebackPreview {
        prepared_context_packet: promotions
            .iter()
            .find(|promotion| promotion.target_kind == SIMULATOR_PROMOTION_PREPARED_CONTEXT)
            .map(build_prepared_context_preview_from_candidate),
        prepared_draft_packet: promotions
            .iter()
            .find(|promotion| promotion.target_kind == SIMULATOR_PROMOTION_PREPARED_DRAFT)
            .map(build_prepared_draft_preview_from_candidate),
        reversible_action_bundle: promotions
            .iter()
            .find(|promotion| {
                promotion.target_kind == SIMULATOR_PROMOTION_REVERSIBLE_ACTION
                    && review_surface_available(promotion)
            })
            .map(|candidate| {
                build_reversible_action_preview_from_candidate(
                    owner_user_id,
                    thread_id,
                    parent_id,
                    candidate,
                )
            }),
        approval_review: promotions
            .iter()
            .find(|promotion| {
                promotion.target_kind == SIMULATOR_PROMOTION_APPROVAL_REQUIRED
                    && review_surface_available(promotion)
            })
            .map(build_approval_review_preview_from_candidate),
    }
}

fn promotion_summary(target_kind: &str, matching_steps: &[&SimulatorTraceStep]) -> String {
    let step = matching_steps[0];
    match target_kind {
        SIMULATOR_PROMOTION_PREPARED_CONTEXT => format!(
            "Prepare bounded context from {} around {}.",
            step.action_kind, step.node_label
        ),
        SIMULATOR_PROMOTION_PREPARED_DRAFT => format!(
            "Prepare alternative draft from {} around {}.",
            step.action_kind, step.node_label
        ),
        SIMULATOR_PROMOTION_REVERSIBLE_ACTION => format!(
            "Suggest reversible next step from {} around {}.",
            step.action_kind, step.node_label
        ),
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED => format!(
            "Escalate approval-bound proposal from {} around {}.",
            step.action_kind, step.node_label
        ),
        _ => format!(
            "Keep bounded simulator projection non-authoritative around {}.",
            step.node_label
        ),
    }
}

fn field_guided_promotion_summary(input: &SimulatorBoundaryInput, summary: String) -> String {
    if let Some(field_summary) = input
        .relevant_state
        .field_engine_focus_summary
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        format!("{summary} Field-guided by {field_summary}")
    } else {
        summary
    }
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut ordered = Vec::new();
    for value in values {
        if !ordered.contains(&value) {
            ordered.push(value);
        }
    }
    ordered
}

fn build_prepared_context_preview_from_candidate(
    candidate: &SimulatorPromotionCandidate,
) -> PreparedContextPacket {
    let pack = PreparedContextPack {
        pack_id: format!("simulator:context:{}", stable_slug(&candidate.summary)),
        pack_kind: PREPARED_CONTEXT_PACK_KIND_TOPIC.to_string(),
        title: "Simulated context pack".to_string(),
        summary: candidate.summary.clone(),
        confidence: "medium".to_string(),
        why_surfaced: "Prepared from bounded simulator projection.".to_string(),
        anchor_refs: candidate.source_refs.iter().take(2).cloned().collect(),
        source_refs: candidate.source_refs.clone(),
        reference_refs: Vec::new(),
        object_refs: candidate.object_refs.clone(),
        evidence_kinds: vec!["simulator_projection".to_string()],
        ..crate::prepared_context_packet::PreparedContextPack::default()
    };

    PreparedContextPacket {
        packet_kind: PREPARED_CONTEXT_KIND_CONTINUITY.to_string(),
        ready: true,
        summary: candidate.summary.clone(),
        anchor_refs: candidate.source_refs.iter().take(2).cloned().collect(),
        source_refs: candidate.source_refs.clone(),
        decision_refs: Vec::new(),
        decision_history_refs: Vec::new(),
        response_refs: Vec::new(),
        follow_up_refs: Vec::new(),
        relationship_refs: Vec::new(),
        project_refs: Vec::new(),
        reference_refs: Vec::new(),
        object_refs: candidate.object_refs.clone(),
        thread_refs: Vec::new(),
        file_refs: Vec::new(),
        packs: vec![pack],
        decrypt_needed_count: 0,
        ..crate::prepared_context_packet::PreparedContextPacket::default()
    }
}

fn build_prepared_draft_preview_from_candidate(
    candidate: &SimulatorPromotionCandidate,
) -> PreparedDraftPacket {
    PreparedDraftPacket {
        ready: true,
        summary: "Prepared 1 project prep note for review.".to_string(),
        drafts: vec![PreparedDraftArtifact {
            draft_id: format!("draft:simulator:{}", stable_slug(&candidate.summary)),
            draft_class: PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE.to_string(),
            label: "Simulated project prep note".to_string(),
            channel: "project".to_string(),
            summary: candidate.summary.clone(),
            body: simulator_draft_body(candidate),
            confidence: "medium".to_string(),
            readiness: "ready".to_string(),
            response_due_hint: "Next work session".to_string(),
            approval_required_to_send: false,
            source_refs: candidate.source_refs.clone(),
            source_count: candidate.source_refs.len() as u32,
            storage_type: "ledger".to_string(),
            storage_kind: Some("rich_note".to_string()),
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            selection_reason: Some("Prepared from bounded simulator projection.".to_string()),
            suggested_next_action: "Review simulated prep note".to_string(),
            object_refs: candidate.object_refs.clone(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        }],
    }
}

fn build_reversible_action_preview_from_candidate(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    candidate: &SimulatorPromotionCandidate,
) -> ReversibleActionBundle {
    match candidate.preview_action_kind.as_deref() {
        Some("defer_task") => build_draft_task_creation_bundle(
            owner_user_id,
            thread_id,
            parent_id,
            &DraftTaskCreationRequest {
                title: format!(
                    "Draft follow-up for {}",
                    candidate
                        .preview_node_label
                        .as_deref()
                        .unwrap_or("simulated commitment")
                ),
                summary: candidate.summary.clone(),
                due_hint: Some("Next work session".to_string()),
                source_refs: candidate.source_refs.clone(),
                source_message_ids: Vec::new(),
            },
        ),
        _ => build_tentative_calendar_hold_bundle(
            owner_user_id,
            thread_id,
            parent_id,
            &TentativeCalendarHoldRequest {
                title: candidate
                    .preview_node_label
                    .clone()
                    .unwrap_or_else(|| "Simulated tentative hold".to_string()),
                description: Some(candidate.summary.clone()),
                start_at: "simulation:next".to_string(),
                end_at: None,
                all_day: false,
                location: None,
                hold_reason: Some("Prepared from bounded simulator projection.".to_string()),
                source_refs: candidate.source_refs.clone(),
                source_message_ids: Vec::new(),
            },
        ),
    }
}

fn build_approval_review_preview_from_candidate(candidate: &SimulatorPromotionCandidate) -> Value {
    let message = approval_preview_message(candidate);
    let capability_id = action_capability_id(&message);
    build_action_approval_review_payload(&message, &capability_id)
}

fn approval_preview_message(candidate: &SimulatorPromotionCandidate) -> AFPMessage {
    match candidate.preview_action_kind.as_deref() {
        Some("schedule_meeting") => AFPMessage {
            thread_id: "simulator:approval".to_string(),
            from: "simulator".to_string(),
            to: vec!["user".to_string()],
            r#type: "meeting_request".to_string(),
            kind: Some(AFP_KIND_RICH_NOTE.to_string()),
            subtype: Some("approval_preview".to_string()),
            content: json!({
                "title": candidate.preview_node_label.clone().unwrap_or_else(|| "Proposed meeting".to_string()),
                "summary": candidate.summary,
                "start_time": "pending_approval",
                "source_refs": candidate.source_refs,
            }),
            metadata: Some(json!({
                "capability_id": "cap_simulator_schedule_meeting",
                "approval_mode": "human_approval_required",
            })),
            ..AFPMessage::default()
        },
        _ => AFPMessage {
            thread_id: "simulator:approval".to_string(),
            from: "simulator".to_string(),
            to: vec!["user".to_string()],
            r#type: "email_outgoing".to_string(),
            kind: Some(AFP_KIND_RICH_NOTE.to_string()),
            subtype: Some("approval_preview".to_string()),
            content: json!({
                "subject": candidate.preview_node_label.clone().unwrap_or_else(|| "Simulated summary".to_string()),
                "body": candidate.summary,
                "source_refs": candidate.source_refs,
            }),
            metadata: Some(json!({
                "capability_id": "cap_simulator_send_summary",
                "approval_mode": "human_approval_required",
            })),
            ..AFPMessage::default()
        },
    }
}

fn simulator_draft_body(candidate: &SimulatorPromotionCandidate) -> String {
    let mut lines = vec![candidate.summary.clone()];
    if !candidate.source_refs.is_empty() {
        lines.push(format!("Source refs: {}", candidate.source_refs.join(", ")));
    }
    if !candidate.object_refs.is_empty() {
        lines.push(format!("Object refs: {}", candidate.object_refs.join(", ")));
    }
    lines.join("\n\n")
}

fn stable_slug(input: &str) -> String {
    let filtered = input
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    let compact = filtered
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if compact.is_empty() {
        "simulator".to_string()
    } else {
        compact
    }
}

#[cfg(test)]
mod tests;
