use serde::{Deserialize, Serialize};

use crate::{
    autonomy_policy::PersonalAutonomyLevel,
    field_engine_contract::{
        FIELD_TYPE_ATTENTION, FIELD_TYPE_GOAL, FIELD_TYPE_INTEREST, FIELD_TYPE_KNOWLEDGE,
        FIELD_TYPE_OBLIGATION, FIELD_TYPE_OPPORTUNITY, FIELD_TYPE_PROJECT, FIELD_TYPE_RELATIONSHIP,
        FieldEngineSnapshot, FieldSignal,
    },
    prepared_context_packet::PreparedContextPacket,
    prepared_draft_packet::PreparedDraftPacket,
    state_snapshot::{
        StateSnapshotCommitment, StateSnapshotContextItem, StateSnapshotContinuityMetrics,
        StateSnapshotCriticalChange, StateSnapshotDecisionItem, StateSnapshotResponseItem,
        StateSnapshotWatcherSignal,
    },
};

pub const STATE_FIELD_UNRESOLVED_DECISIONS: &str = "unresolved_decisions";
pub const STATE_FIELD_MEETING_READINESS: &str = "meeting_readiness";
pub const STATE_FIELD_PROJECT_SCOPE_DRIFT: &str = "project_scope_drift";
pub const STATE_FIELD_FOLLOW_UP_PRESSURE: &str = "follow_up_pressure";
pub const STATE_FIELD_STALE_KNOWLEDGE_RISK: &str = "stale_knowledge_risk";
pub const STATE_FIELD_APPROVAL_REQUIRED_WORK: &str = "approval_required_work";
pub const STATE_FIELD_RESEARCH_GAP: &str = "research_gap";
pub const STATE_FIELD_RELATIONSHIP_FOLLOW_UP: &str = "relationship_follow_up";
const FIELD_ENGINE_REASON_PREFIX: &str = "Field engine indicates";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct StateFieldActivation {
    pub field_key: String,
    pub label: String,
    pub status: String,
    pub confidence: String,
    pub surface_hint: String,
    pub recommended_action: String,
    pub autonomy_level: String,
    pub reason: String,
    #[serde(default)]
    pub evidence_refs: Vec<String>,
}

fn state_field_visibility_rank(
    field: &StateFieldActivation,
) -> Option<(u8, u8, u8, u8, u8, std::cmp::Reverse<usize>, &str)> {
    let status_rank = match field.status.as_str() {
        "active" => 0,
        "monitor" => 1,
        _ => return None,
    };
    let advisory_rank = if field.reason.starts_with(FIELD_ENGINE_REASON_PREFIX) {
        0
    } else {
        1
    };
    let prepared_support_rank =
        if field.status == "monitor" && field_reason_indicates_prepared_support(field) {
            1
        } else {
            0
        };
    let field_rank = match field.field_key.as_str() {
        STATE_FIELD_APPROVAL_REQUIRED_WORK => 0,
        STATE_FIELD_UNRESOLVED_DECISIONS => 1,
        STATE_FIELD_FOLLOW_UP_PRESSURE => 2,
        STATE_FIELD_RELATIONSHIP_FOLLOW_UP => 3,
        _ => 4,
    };
    let surface_rank = match field.surface_hint.as_str() {
        "decision_queue" => 0,
        "response_queue" => 1,
        "context_panel" => 2,
        _ => 3,
    };
    Some((
        status_rank,
        advisory_rank,
        prepared_support_rank,
        field_rank,
        surface_rank,
        std::cmp::Reverse(field.evidence_refs.len()),
        field.field_key.as_str(),
    ))
}

fn field_reason_indicates_prepared_support(field: &StateFieldActivation) -> bool {
    field
        .reason
        .contains("Prepared follow-up work is already available")
        || field
            .reason
            .contains("Prepared relationship follow-up is already available")
        || field
            .reason
            .contains("Prepared context is already available")
        || field
            .reason
            .contains("Prepared support is already available")
}

pub fn visible_state_fields(fields: &[StateFieldActivation]) -> Vec<&StateFieldActivation> {
    let mut visible = fields
        .iter()
        .filter_map(|field| state_field_visibility_rank(field).map(|rank| (rank, field)))
        .collect::<Vec<_>>();
    visible.sort_by(|(left_rank, _), (right_rank, _)| left_rank.cmp(right_rank));
    visible.into_iter().map(|(_, field)| field).collect()
}

pub fn leading_state_field(fields: &[StateFieldActivation]) -> Option<&StateFieldActivation> {
    visible_state_fields(fields).into_iter().next()
}

pub fn has_escalation_state_field(fields: &[StateFieldActivation]) -> bool {
    visible_state_fields(fields).into_iter().any(|field| {
        field.status == "active" && matches!(field.confidence.as_str(), "high" | "medium")
    })
}

pub fn apply_field_engine_advisory_to_state_fields(
    fields: &mut [StateFieldActivation],
    field_snapshot: &FieldEngineSnapshot,
) {
    let Some(primary_signal) = primary_field_signal(field_snapshot) else {
        return;
    };
    let highlighted_keys = match primary_signal.field_type.as_str() {
        FIELD_TYPE_RELATIONSHIP => [
            Some(STATE_FIELD_RELATIONSHIP_FOLLOW_UP),
            Some(STATE_FIELD_FOLLOW_UP_PRESSURE),
            None,
        ],
        FIELD_TYPE_ATTENTION => [
            Some(STATE_FIELD_UNRESOLVED_DECISIONS),
            Some(STATE_FIELD_FOLLOW_UP_PRESSURE),
            None,
        ],
        FIELD_TYPE_PROJECT => [
            Some(STATE_FIELD_PROJECT_SCOPE_DRIFT),
            Some(STATE_FIELD_UNRESOLVED_DECISIONS),
            Some(STATE_FIELD_RESEARCH_GAP),
        ],
        FIELD_TYPE_INTEREST => [
            Some(STATE_FIELD_RESEARCH_GAP),
            Some(STATE_FIELD_PROJECT_SCOPE_DRIFT),
            None,
        ],
        FIELD_TYPE_OBLIGATION => [
            Some(STATE_FIELD_MEETING_READINESS),
            Some(STATE_FIELD_FOLLOW_UP_PRESSURE),
            None,
        ],
        FIELD_TYPE_GOAL => [
            Some(STATE_FIELD_MEETING_READINESS),
            Some(STATE_FIELD_UNRESOLVED_DECISIONS),
            None,
        ],
        FIELD_TYPE_OPPORTUNITY => [
            Some(STATE_FIELD_UNRESOLVED_DECISIONS),
            Some(STATE_FIELD_RESEARCH_GAP),
            Some(STATE_FIELD_MEETING_READINESS),
        ],
        FIELD_TYPE_KNOWLEDGE => [
            Some(STATE_FIELD_RESEARCH_GAP),
            Some(STATE_FIELD_STALE_KNOWLEDGE_RISK),
            None,
        ],
        _ => [None, None, None],
    };

    for key in highlighted_keys.into_iter().flatten() {
        if let Some(field) = fields
            .iter_mut()
            .find(|field| field.field_key == key && field.status != "inactive")
        {
            apply_primary_signal_to_field(field, primary_signal);
        }
    }
}

pub fn build_state_fields(
    decision_queue: &[StateSnapshotDecisionItem],
    response_queue: &[StateSnapshotResponseItem],
    active_commitments: &[StateSnapshotCommitment],
    critical_changes: &[StateSnapshotCriticalChange],
    context_panel_items: &[StateSnapshotContextItem],
    watcher_signals: &[StateSnapshotWatcherSignal],
    continuity_metrics: &StateSnapshotContinuityMetrics,
    prepared_context_packet: Option<&PreparedContextPacket>,
    prepared_draft_packet: Option<&PreparedDraftPacket>,
) -> Vec<StateFieldActivation> {
    let mut fields = Vec::new();
    let prepared_follow_up_ready = has_prepared_follow_up_artifact(prepared_draft_packet);
    let prepared_context_ready = has_prepared_context_artifact(prepared_context_packet);
    let prepared_decision_support_ready =
        has_prepared_decision_support_artifact(prepared_draft_packet) || prepared_context_ready;

    let unresolved_decision_refs = decision_queue
        .iter()
        .flat_map(|item| item.source_refs.iter().cloned())
        .collect::<Vec<_>>();
    fields.push(build_field(
        STATE_FIELD_UNRESOLVED_DECISIONS,
        "Unresolved decisions",
        if decision_queue.is_empty() {
            "inactive"
        } else if decision_queue.iter().any(|item| item.approval_required) {
            "active"
        } else if decision_queue.len() >= 2 && !prepared_decision_support_ready {
            "active"
        } else if decision_queue.len() >= 2
            || decision_queue.iter().any(|item| item.approval_required)
        {
            "monitor"
        } else {
            "monitor"
        },
        if decision_queue.iter().any(|item| item.approval_required) {
            "high"
        } else if decision_queue.len() >= 2 {
            "medium"
        } else {
            "low"
        },
        "decision_queue",
        "Review the unresolved decision queue.",
        if decision_queue.iter().any(|item| item.approval_required) {
            PersonalAutonomyLevel::RequestApproval
        } else {
            PersonalAutonomyLevel::SuggestWithArtifact
        },
        if decision_queue.is_empty() {
            "No decision backlog detected."
        } else if decision_queue.len() >= 2 && prepared_decision_support_ready {
            "Prepared support is already available, so generic decision backlog stays bounded."
        } else {
            "The decision queue still contains unresolved items."
        },
        unresolved_decision_refs,
    ));

    let has_meeting_brief = prepared_draft_packet
        .map(|packet| {
            packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == "meeting_brief")
        })
        .unwrap_or(false);
    let meeting_commitment_refs = active_commitments
        .iter()
        .filter(|item| looks_like_meeting_commitment(item))
        .flat_map(|item| item.source_refs.iter().cloned())
        .collect::<Vec<_>>();
    let meeting_status = if has_meeting_brief {
        "active"
    } else if !meeting_commitment_refs.is_empty() {
        "monitor"
    } else {
        "inactive"
    };
    fields.push(build_field(
        STATE_FIELD_MEETING_READINESS,
        "Meeting readiness",
        meeting_status,
        if has_meeting_brief {
            "high"
        } else if !meeting_commitment_refs.is_empty() {
            "medium"
        } else {
            "low"
        },
        "home",
        "Review the prepared meeting brief or upcoming commitment.",
        if has_meeting_brief {
            PersonalAutonomyLevel::SuggestWithArtifact
        } else {
            PersonalAutonomyLevel::PrepareSilently
        },
        if has_meeting_brief {
            "A meeting brief is already prepared for an active commitment."
        } else if !meeting_commitment_refs.is_empty() {
            "Upcoming commitments suggest meeting preparation is relevant."
        } else {
            "No meeting-focused preparation is currently needed."
        },
        meeting_commitment_refs,
    ));

    let scope_drift_refs = critical_changes
        .iter()
        .filter(|item| looks_like_scope_change(item))
        .flat_map(|item| item.source_refs.iter().cloned())
        .chain(
            context_panel_items
                .iter()
                .filter(|item| {
                    item.relation_path.iter().any(|relation| {
                        matches!(
                            relation.as_str(),
                            "same_project" | "same_area" | "same_resource"
                        )
                    })
                })
                .flat_map(|item| item.source_refs.iter().cloned()),
        )
        .collect::<Vec<_>>();
    fields.push(build_field(
        STATE_FIELD_PROJECT_SCOPE_DRIFT,
        "Project scope drift",
        if scope_drift_refs.len() >= 2 {
            "active"
        } else if scope_drift_refs.len() == 1 {
            "monitor"
        } else {
            "inactive"
        },
        if scope_drift_refs.len() >= 2 {
            "medium"
        } else {
            "low"
        },
        "context_panel",
        "Inspect related project context before committing to the next step.",
        PersonalAutonomyLevel::SuggestWithArtifact,
        if scope_drift_refs.len() >= 2 {
            "Recent project-linked changes suggest scope or context drift."
        } else if scope_drift_refs.len() == 1 {
            "One project-linked signal suggests a possible shift in scope."
        } else {
            "No meaningful project scope drift is currently surfaced."
        },
        scope_drift_refs,
    ));

    let follow_up_refs = response_queue
        .iter()
        .flat_map(|item| item.source_refs.iter().cloned())
        .chain(
            context_panel_items
                .iter()
                .filter(|item| {
                    item.relation_path
                        .iter()
                        .any(|relation| relation == "same_follow_up_chain")
                })
                .flat_map(|item| item.source_refs.iter().cloned()),
        )
        .collect::<Vec<_>>();
    let active_follow_up_pressure =
        has_active_follow_up_pressure(response_queue, continuity_metrics);
    fields.push(build_field(
        STATE_FIELD_FOLLOW_UP_PRESSURE,
        "Follow-up pressure",
        if continuity_metrics.follow_up_drift_score >= 0.72 {
            "active"
        } else if active_follow_up_pressure && !prepared_follow_up_ready {
            "active"
        } else if continuity_metrics.follow_up_drift_score >= 0.45 || !response_queue.is_empty() {
            "monitor"
        } else {
            "inactive"
        },
        if continuity_metrics.follow_up_drift_score >= 0.72 {
            "high"
        } else if !response_queue.is_empty() || prepared_follow_up_ready {
            "medium"
        } else {
            "low"
        },
        "response_queue",
        "Review follow-up and reply pressure before it becomes stale.",
        PersonalAutonomyLevel::SuggestWithArtifact,
        if continuity_metrics.follow_up_drift_score >= 0.72 {
            "Follow-up drift is elevated and multiple response items need attention."
        } else if prepared_follow_up_ready && !response_queue.is_empty() {
            "Prepared follow-up work is already available, so reply pressure stays bounded."
        } else if response_queue.len() >= 2 {
            "Multiple response items remain active with sustained continuity pressure."
        } else if !response_queue.is_empty() {
            "The response queue still carries active follow-up work."
        } else {
            "There is no current follow-up pressure."
        },
        follow_up_refs,
    ));

    let decrypt_needed_signal_count = watcher_signals
        .iter()
        .filter(|signal| signal.decrypt_needed)
        .count()
        + context_panel_items
            .iter()
            .filter(|item| item.decrypt_needed)
            .count();
    let stale_signal_count = watcher_signals
        .iter()
        .filter(|signal| signal.freshness == "stale")
        .count();
    let low_confidence_context_count = context_panel_items
        .iter()
        .filter(|item| item.confidence == "low")
        .count();
    let stale_knowledge_refs = watcher_signals
        .iter()
        .filter(|signal| signal.freshness == "stale" || signal.decrypt_needed)
        .flat_map(|signal| signal.source_refs.iter().cloned())
        .chain(
            context_panel_items
                .iter()
                .filter(|item| item.decrypt_needed || item.confidence == "low")
                .flat_map(|item| item.source_refs.iter().cloned()),
        )
        .collect::<Vec<_>>();
    fields.push(build_field(
        STATE_FIELD_STALE_KNOWLEDGE_RISK,
        "Stale knowledge risk",
        if stale_knowledge_refs.len() >= 2 && !prepared_context_ready {
            "active"
        } else if stale_knowledge_refs.len() >= 1 {
            "monitor"
        } else {
            "inactive"
        },
        if stale_knowledge_refs.len() >= 2 {
            "medium"
        } else {
            "low"
        },
        "context_panel",
        "Refresh old context before relying on it.",
        PersonalAutonomyLevel::PrepareSilently,
        stale_knowledge_reason(
            stale_knowledge_refs.len(),
            decrypt_needed_signal_count,
            stale_signal_count,
            low_confidence_context_count,
            prepared_context_ready,
        ),
        stale_knowledge_refs,
    ));

    let approval_refs = decision_queue
        .iter()
        .filter(|item| item.approval_required)
        .flat_map(|item| item.source_refs.iter().cloned())
        .chain(
            prepared_draft_packet
                .into_iter()
                .flat_map(|packet| packet.drafts.iter())
                .filter(|draft| draft.approval_required_to_send)
                .flat_map(|draft| draft.source_refs.iter().cloned()),
        )
        .collect::<Vec<_>>();
    fields.push(build_field(
        STATE_FIELD_APPROVAL_REQUIRED_WORK,
        "Approval required work",
        if approval_refs.is_empty() {
            "inactive"
        } else {
            "active"
        },
        if approval_refs.is_empty() {
            "low"
        } else {
            "high"
        },
        "decision_queue",
        "Review approval-gated work before any irreversible action proceeds.",
        PersonalAutonomyLevel::RequestApproval,
        if approval_refs.is_empty() {
            "No approval-gated work is currently active."
        } else {
            "Explicit approval boundaries are active in the current work queue."
        },
        approval_refs,
    ));

    let research_refs = decision_queue
        .iter()
        .filter(|item| looks_like_research_gap_decision(item))
        .flat_map(|item| item.source_refs.iter().cloned())
        .chain(
            context_panel_items
                .iter()
                .filter(|item| looks_like_research_gap_context(item))
                .flat_map(|item| item.source_refs.iter().cloned()),
        )
        .collect::<Vec<_>>();
    fields.push(build_field(
        STATE_FIELD_RESEARCH_GAP,
        "Research gap",
        if research_refs.is_empty() {
            "inactive"
        } else if research_refs.len() >= 2 && !prepared_context_ready {
            "active"
        } else {
            "monitor"
        },
        if research_refs.len() >= 2 {
            "medium"
        } else {
            "low"
        },
        "context_panel",
        "Gather supporting evidence before acting.",
        PersonalAutonomyLevel::PrepareSilently,
        if research_refs.len() >= 2 && prepared_context_ready {
            "Prepared context is already available, so research gap pressure stays bounded."
        } else if research_refs.len() >= 2 {
            "Multiple context signals suggest missing supporting evidence."
        } else if research_refs.len() == 1 {
            "One surfaced item still looks under-researched."
        } else {
            "No meaningful research gap is currently surfaced."
        },
        research_refs,
    ));

    let relationship_refs = context_panel_items
        .iter()
        .filter(|item| {
            item.relation_path
                .iter()
                .any(|relation| relation == "same_relationship")
                || item
                    .why_surfaced
                    .to_ascii_lowercase()
                    .contains("relationship")
        })
        .flat_map(|item| item.source_refs.iter().cloned())
        .chain(
            prepared_draft_packet
                .into_iter()
                .flat_map(|packet| packet.drafts.iter())
                .filter(|draft| draft.draft_class == "follow_up_draft")
                .flat_map(|draft| draft.source_refs.iter().cloned()),
        )
        .collect::<Vec<_>>();
    let prepared_relationship_follow_up_ready =
        has_prepared_relationship_follow_up_artifact(prepared_draft_packet);
    fields.push(build_field(
        STATE_FIELD_RELATIONSHIP_FOLLOW_UP,
        "Relationship follow-up",
        if relationship_refs.is_empty() {
            "inactive"
        } else if relationship_refs.len() >= 2 && !prepared_relationship_follow_up_ready {
            "active"
        } else {
            "monitor"
        },
        if relationship_refs.len() >= 2 {
            "medium"
        } else {
            "low"
        },
        "response_queue",
        "Maintain continuity on the relationship follow-up lane.",
        PersonalAutonomyLevel::SuggestWithArtifact,
        if relationship_refs.len() >= 2 && prepared_relationship_follow_up_ready {
            "Prepared relationship follow-up is already available, so the lane stays bounded."
        } else if relationship_refs.len() >= 2 {
            "Relationship-linked context and follow-up work are both active."
        } else if relationship_refs.len() == 1 {
            "A relationship-linked follow-up is currently in view."
        } else {
            "No relationship follow-up lane is currently active."
        },
        relationship_refs,
    ));

    fields
}

fn stale_knowledge_reason(
    surfaced_ref_count: usize,
    decrypt_needed_count: usize,
    stale_signal_count: usize,
    low_confidence_context_count: usize,
    prepared_context_ready: bool,
) -> &'static str {
    if surfaced_ref_count >= 2 && prepared_context_ready {
        return "Prepared context is already available, so stale knowledge risk stays bounded.";
    }
    if surfaced_ref_count == 0 {
        return "Knowledge freshness looks acceptable.";
    }
    if decrypt_needed_count > 0 && stale_signal_count == 0 && low_confidence_context_count == 0 {
        return if surfaced_ref_count == 1 {
            "One surfaced item still needs decryption before it can be trusted."
        } else {
            "Several surfaced items still need decryption before they can be trusted."
        };
    }
    if stale_signal_count > 0 && decrypt_needed_count == 0 && low_confidence_context_count == 0 {
        return if surfaced_ref_count == 1 {
            "One surfaced item looks stale and should be refreshed before it can be trusted."
        } else {
            "Several surfaced items look stale and should be refreshed before they can be trusted."
        };
    }
    if low_confidence_context_count > 0 && decrypt_needed_count == 0 && stale_signal_count == 0 {
        return if surfaced_ref_count == 1 {
            "One surfaced item is still low-confidence and should be verified before it can be trusted."
        } else {
            "Several surfaced items are still low-confidence and should be verified before they can be trusted."
        };
    }
    if surfaced_ref_count >= 2 {
        "Several surfaced items depend on older, encrypted, or lower-confidence context."
    } else {
        "One surfaced item looks stale or still needs decryption before it can be trusted."
    }
}

fn has_active_follow_up_pressure(
    response_queue: &[StateSnapshotResponseItem],
    continuity_metrics: &StateSnapshotContinuityMetrics,
) -> bool {
    continuity_metrics.follow_up_drift_score >= 0.72
        || (response_queue.len() >= 2
            && (continuity_metrics.activity_velocity >= 0.4
                || continuity_metrics.urgency_acceleration >= 0.45))
}

fn has_prepared_follow_up_artifact(prepared_draft_packet: Option<&PreparedDraftPacket>) -> bool {
    prepared_draft_packet
        .filter(|packet| packet.ready)
        .map(|packet| {
            packet.drafts.iter().any(|draft| {
                matches!(
                    draft.draft_class.as_str(),
                    crate::prepared_draft_packet::PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
                        | crate::prepared_draft_packet::PREPARED_DRAFT_CLASS_FOLLOW_UP
                )
            })
        })
        .unwrap_or(false)
}

fn has_prepared_decision_support_artifact(
    prepared_draft_packet: Option<&PreparedDraftPacket>,
) -> bool {
    prepared_draft_packet
        .filter(|packet| packet.ready)
        .map(|packet| {
            packet.drafts.iter().any(|draft| {
                matches!(
                    draft.draft_class.as_str(),
                    crate::prepared_draft_packet::PREPARED_DRAFT_CLASS_DECISION_MEMO
                        | crate::prepared_draft_packet::PREPARED_DRAFT_CLASS_COMPARISON_TABLE
                )
            })
        })
        .unwrap_or(false)
}

fn has_prepared_context_artifact(prepared_context_packet: Option<&PreparedContextPacket>) -> bool {
    prepared_context_packet
        .map(|packet| packet.ready)
        .unwrap_or(false)
}

fn has_prepared_relationship_follow_up_artifact(
    prepared_draft_packet: Option<&PreparedDraftPacket>,
) -> bool {
    prepared_draft_packet
        .filter(|packet| packet.ready)
        .map(|packet| {
            packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == "follow_up_draft")
        })
        .unwrap_or(false)
}

fn build_field(
    field_key: &str,
    label: &str,
    status: &str,
    confidence: &str,
    surface_hint: &str,
    recommended_action: &str,
    autonomy_level: PersonalAutonomyLevel,
    reason: &str,
    evidence_refs: Vec<String>,
) -> StateFieldActivation {
    StateFieldActivation {
        field_key: field_key.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        confidence: confidence.to_string(),
        surface_hint: surface_hint.to_string(),
        recommended_action: recommended_action.to_string(),
        autonomy_level: format!("{autonomy_level:?}").to_casefold(),
        reason: reason.to_string(),
        evidence_refs,
    }
}

fn primary_field_signal(snapshot: &FieldEngineSnapshot) -> Option<&FieldSignal> {
    snapshot.fields.iter().max_by(|left, right| {
        field_signal_priority(left)
            .partial_cmp(&field_signal_priority(right))
            .unwrap_or(std::cmp::Ordering::Equal)
    })
}

fn field_signal_priority(field: &FieldSignal) -> f32 {
    (field.projected_risk * 0.52)
        + (field.projected_opportunity * 0.28)
        + (field.density * 0.12)
        + field.momentum.abs() * 0.08
}

fn apply_primary_signal_to_field(field: &mut StateFieldActivation, signal: &FieldSignal) {
    let reason_suffix = match (signal.field_type.as_str(), field.field_key.as_str()) {
        (FIELD_TYPE_RELATIONSHIP, STATE_FIELD_RELATIONSHIP_FOLLOW_UP) => {
            "relationship continuity is the leading pressure in the current snapshot."
        }
        (FIELD_TYPE_RELATIONSHIP, STATE_FIELD_FOLLOW_UP_PRESSURE) => {
            "relationship continuity is amplifying current follow-up drift."
        }
        (FIELD_TYPE_ATTENTION, STATE_FIELD_UNRESOLVED_DECISIONS) => {
            "attention fragmentation is concentrating around unresolved decisions."
        }
        (FIELD_TYPE_ATTENTION, STATE_FIELD_FOLLOW_UP_PRESSURE) => {
            "attention fragmentation is amplifying current follow-up and reply pressure."
        }
        (FIELD_TYPE_PROJECT, STATE_FIELD_PROJECT_SCOPE_DRIFT) => {
            "project coordination pressure is the leading source of drift or scope tension."
        }
        (FIELD_TYPE_PROJECT, STATE_FIELD_UNRESOLVED_DECISIONS) => {
            "project decision debt is intensifying current queue pressure."
        }
        (FIELD_TYPE_PROJECT, STATE_FIELD_RESEARCH_GAP) => {
            "project pressure is still knowledge-constrained."
        }
        (FIELD_TYPE_INTEREST, STATE_FIELD_RESEARCH_GAP) => {
            "interest pressure is clustering around an open topic that still needs stronger evidence."
        }
        (FIELD_TYPE_INTEREST, STATE_FIELD_PROJECT_SCOPE_DRIFT) => {
            "interest pressure is clustering around project context that is still loosely aligned."
        }
        (FIELD_TYPE_OBLIGATION, STATE_FIELD_MEETING_READINESS) => {
            "obligation pressure is concentrating around commitments that need a concrete readiness step."
        }
        (FIELD_TYPE_OBLIGATION, STATE_FIELD_FOLLOW_UP_PRESSURE) => {
            "obligation pressure is amplifying the current follow-up load around due commitments."
        }
        (FIELD_TYPE_GOAL, STATE_FIELD_MEETING_READINESS) => {
            "goal progression now depends on readiness for the next concrete commitment or meeting."
        }
        (FIELD_TYPE_GOAL, STATE_FIELD_UNRESOLVED_DECISIONS) => {
            "goal progression is being gated by unresolved decisions."
        }
        (FIELD_TYPE_OPPORTUNITY, STATE_FIELD_UNRESOLVED_DECISIONS) => {
            "opportunity leverage is concentrated around unresolved decisions."
        }
        (FIELD_TYPE_OPPORTUNITY, STATE_FIELD_RESEARCH_GAP) => {
            "opportunity leverage is still knowledge-constrained."
        }
        (FIELD_TYPE_OPPORTUNITY, STATE_FIELD_MEETING_READINESS) => {
            "opportunity leverage depends on readiness for the next concrete coordination step."
        }
        (FIELD_TYPE_KNOWLEDGE, STATE_FIELD_RESEARCH_GAP) => {
            "knowledge pressure is still evidence-constrained enough to gather support before acting."
        }
        (FIELD_TYPE_KNOWLEDGE, STATE_FIELD_STALE_KNOWLEDGE_RISK) => {
            "knowledge pressure is relying on context that has drifted stale enough to verify."
        }
        _ => return,
    };

    field.reason = format!("{FIELD_ENGINE_REASON_PREFIX} {reason_suffix}");
    if !signal.scope_ref.trim().is_empty() && !field.evidence_refs.contains(&signal.scope_ref) {
        field.evidence_refs.push(signal.scope_ref.clone());
    }
    if field.status == "monitor" && signal.projected_risk >= 0.72 && signal.confidence >= 0.4 {
        field.status = "active".to_string();
    }
    if field.confidence == "low" && signal.confidence >= 0.45 {
        field.confidence = "medium".to_string();
    }
}

trait ToCasefold {
    fn to_casefold(&self) -> String;
}

impl ToCasefold for String {
    fn to_casefold(&self) -> String {
        self.chars()
            .enumerate()
            .flat_map(|(index, ch)| {
                if ch.is_uppercase() && index > 0 {
                    vec!['_', ch.to_ascii_lowercase()]
                } else {
                    vec![ch.to_ascii_lowercase()]
                }
            })
            .collect()
    }
}

fn looks_like_meeting_commitment(item: &StateSnapshotCommitment) -> bool {
    let lower = item.label.to_ascii_lowercase();
    [
        "meeting",
        "call",
        "appointment",
        "dentist",
        "interview",
        "standup",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn looks_like_scope_change(item: &StateSnapshotCriticalChange) -> bool {
    let delta = item.delta_type.to_ascii_lowercase();
    let label = item.label.to_ascii_lowercase();
    ["project", "scope", "resource", "area"]
        .iter()
        .any(|needle| delta.contains(needle) || label.contains(needle))
}

fn looks_like_research_gap_decision(item: &StateSnapshotDecisionItem) -> bool {
    let category = item.category.to_ascii_lowercase();
    let action = item.suggested_next_action.to_ascii_lowercase();
    category.contains("research")
        || ["research", "compare", "verify", "evidence"]
            .iter()
            .any(|needle| action.contains(needle))
}

fn looks_like_research_gap_context(item: &StateSnapshotContextItem) -> bool {
    let why = item.why_surfaced.to_ascii_lowercase();
    let label = item.label.to_ascii_lowercase();
    ["research", "missing", "evidence", "compare", "unknown"]
        .iter()
        .any(|needle| why.contains(needle) || label.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        prepared_context_packet::PreparedContextPacket,
        prepared_draft_packet::{PreparedDraftArtifact, PreparedDraftPacket},
        state_snapshot::{
            StateSnapshotCommitment, StateSnapshotContextItem, StateSnapshotContinuityMetrics,
            StateSnapshotCriticalChange, StateSnapshotDecisionItem, StateSnapshotResponseItem,
        },
    };

    #[test]
    fn build_state_fields_activates_approval_and_follow_up_lanes() {
        let fields = build_state_fields(
            &[StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Approve vendor payment".to_string(),
                category: "finance".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Approve payment".to_string(),
                approval_required: true,
            }],
            &[StateSnapshotResponseItem {
                id: "response_1".to_string(),
                label: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                response_due_hint: "Within 24h".to_string(),
                source_refs: vec!["msg_2".to_string()],
                suggested_next_action: "Draft reply".to_string(),
            }],
            &[StateSnapshotCommitment::default()],
            &[StateSnapshotCriticalChange::default()],
            &[StateSnapshotContextItem {
                id: "ctx_1".to_string(),
                label: "Supplier relationship".to_string(),
                why_surfaced: "relationship follow-up".to_string(),
                confidence: "medium".to_string(),
                freshness: "reactivated".to_string(),
                relation_path: vec!["same_relationship".to_string()],
                source_refs: vec!["msg_3".to_string()],
                decrypt_needed: false,
            }],
            &[],
            &StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.8,
                ..Default::default()
            },
            None,
            Some(&PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 follow-up draft.".to_string(),
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "follow_up_draft".to_string(),
                    label: "Follow-up".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared follow-up".to_string(),
                    body: "Checking in".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    approval_required_to_send: true,
                    source_refs: vec!["msg_2".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
        );

        let approval = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_APPROVAL_REQUIRED_WORK)
            .expect("approval field");
        assert_eq!(approval.status, "active");
        assert_eq!(approval.surface_hint, "decision_queue");

        let follow_up = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow-up field");
        assert_eq!(follow_up.status, "active");

        let relationship = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_RELATIONSHIP_FOLLOW_UP)
            .expect("relationship field");
        assert_eq!(relationship.status, "monitor");
        assert_eq!(
            relationship.reason,
            "Prepared relationship follow-up is already available, so the lane stays bounded."
        );
    }

    #[test]
    fn visible_state_fields_prioritize_approval_and_active_over_monitor() {
        let fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                label: "Follow-up pressure".to_string(),
                status: "monitor".to_string(),
                confidence: "medium".to_string(),
                surface_hint: "response_queue".to_string(),
                recommended_action: "Review follow-up pressure.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Monitor only.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_APPROVAL_REQUIRED_WORK.to_string(),
                label: "Approval required work".to_string(),
                status: "active".to_string(),
                confidence: "high".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Review approval gates.".to_string(),
                autonomy_level: "request_approval".to_string(),
                reason: "Human review required.".to_string(),
                evidence_refs: vec!["msg_2".to_string(), "msg_3".to_string()],
            },
        ];

        let visible = visible_state_fields(&fields);
        assert_eq!(visible.len(), 2);
        assert_eq!(visible[0].field_key, STATE_FIELD_APPROVAL_REQUIRED_WORK);
        assert_eq!(
            leading_state_field(&fields).map(|field| field.field_key.as_str()),
            Some(STATE_FIELD_APPROVAL_REQUIRED_WORK)
        );
        assert!(has_escalation_state_field(&fields));
    }

    #[test]
    fn visible_state_fields_demote_monitor_lanes_already_bounded_by_prepared_support() {
        let fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                label: "Follow-up pressure".to_string(),
                status: "monitor".to_string(),
                confidence: "medium".to_string(),
                surface_hint: "response_queue".to_string(),
                recommended_action: "Review follow-up pressure.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason:
                    "Prepared follow-up work is already available, so reply pressure stays bounded."
                        .to_string(),
                evidence_refs: vec!["msg_follow_up".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
                label: "Project scope drift".to_string(),
                status: "monitor".to_string(),
                confidence: "medium".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Inspect project context.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "One project-linked signal suggests a possible shift in scope.".to_string(),
                evidence_refs: vec!["msg_project".to_string()],
            },
        ];

        let visible = visible_state_fields(&fields);
        assert_eq!(visible.len(), 2);
        assert_eq!(visible[0].field_key, STATE_FIELD_PROJECT_SCOPE_DRIFT);
        assert_eq!(visible[1].field_key, STATE_FIELD_FOLLOW_UP_PRESSURE);
    }

    #[test]
    fn follow_up_pressure_stays_monitor_for_static_multi_reply_backlog_without_momentum() {
        let fields = build_state_fields(
            &[],
            &[
                StateSnapshotResponseItem {
                    id: "response_1".to_string(),
                    label: "Reply to supplier".to_string(),
                    channel: "email".to_string(),
                    urgency: "soon".to_string(),
                    confidence: "medium".to_string(),
                    response_due_hint: "This week".to_string(),
                    source_refs: vec!["msg_1".to_string()],
                    suggested_next_action: "Draft reply".to_string(),
                },
                StateSnapshotResponseItem {
                    id: "response_2".to_string(),
                    label: "Reply to partner".to_string(),
                    channel: "email".to_string(),
                    urgency: "soon".to_string(),
                    confidence: "medium".to_string(),
                    response_due_hint: "This week".to_string(),
                    source_refs: vec!["msg_2".to_string()],
                    suggested_next_action: "Draft follow-up".to_string(),
                },
            ],
            &[],
            &[],
            &[],
            &[],
            &StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.31,
                activity_velocity: 0.18,
                urgency_acceleration: 0.22,
                ..Default::default()
            },
            None,
            None,
        );

        let follow_up = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow-up field");
        assert_eq!(follow_up.status, "monitor");
        assert_eq!(follow_up.confidence, "medium");
    }

    #[test]
    fn follow_up_pressure_becomes_active_for_multi_reply_backlog_with_sustained_momentum() {
        let fields = build_state_fields(
            &[],
            &[
                StateSnapshotResponseItem {
                    id: "response_1".to_string(),
                    label: "Reply to supplier".to_string(),
                    channel: "email".to_string(),
                    urgency: "today".to_string(),
                    confidence: "medium".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    source_refs: vec!["msg_1".to_string()],
                    suggested_next_action: "Draft reply".to_string(),
                },
                StateSnapshotResponseItem {
                    id: "response_2".to_string(),
                    label: "Reply to partner".to_string(),
                    channel: "email".to_string(),
                    urgency: "today".to_string(),
                    confidence: "medium".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    source_refs: vec!["msg_2".to_string()],
                    suggested_next_action: "Draft follow-up".to_string(),
                },
            ],
            &[],
            &[],
            &[],
            &[],
            &StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.34,
                activity_velocity: 0.47,
                urgency_acceleration: 0.29,
                ..Default::default()
            },
            None,
            None,
        );

        let follow_up = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow-up field");
        assert_eq!(follow_up.status, "active");
        assert_eq!(follow_up.confidence, "medium");
    }

    #[test]
    fn follow_up_pressure_yields_to_monitor_when_prepared_reply_is_ready() {
        let fields = build_state_fields(
            &[],
            &[
                StateSnapshotResponseItem {
                    id: "response_1".to_string(),
                    label: "Reply to supplier".to_string(),
                    channel: "email".to_string(),
                    urgency: "today".to_string(),
                    confidence: "medium".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    source_refs: vec!["msg_1".to_string()],
                    suggested_next_action: "Draft reply".to_string(),
                },
                StateSnapshotResponseItem {
                    id: "response_2".to_string(),
                    label: "Reply to partner".to_string(),
                    channel: "email".to_string(),
                    urgency: "today".to_string(),
                    confidence: "medium".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    source_refs: vec!["msg_2".to_string()],
                    suggested_next_action: "Draft follow-up".to_string(),
                },
            ],
            &[],
            &[],
            &[],
            &[],
            &StateSnapshotContinuityMetrics {
                follow_up_drift_score: 0.34,
                activity_velocity: 0.47,
                urgency_acceleration: 0.29,
                ..Default::default()
            },
            None,
            Some(&PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 follow-up draft.".to_string(),
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class:
                        crate::prepared_draft_packet::PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
                            .to_string(),
                    label: "Reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared follow-up reply.".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: None,
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
        );

        let follow_up = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow-up field");
        assert_eq!(follow_up.status, "monitor");
        assert_eq!(follow_up.confidence, "medium");
        assert_eq!(
            follow_up.reason,
            "Prepared follow-up work is already available, so reply pressure stays bounded."
        );
    }

    #[test]
    fn unresolved_decisions_yield_to_monitor_when_prepared_support_is_ready() {
        let fields = build_state_fields(
            &[
                StateSnapshotDecisionItem {
                    id: "decision_1".to_string(),
                    label: "Reply to supplier".to_string(),
                    category: "decision".to_string(),
                    urgency: "medium".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_1".to_string()],
                    suggested_next_action: "Review reply".to_string(),
                    approval_required: false,
                },
                StateSnapshotDecisionItem {
                    id: "decision_2".to_string(),
                    label: "Review missing evidence".to_string(),
                    category: "decision".to_string(),
                    urgency: "medium".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_2".to_string()],
                    suggested_next_action: "Review context".to_string(),
                    approval_required: false,
                },
            ],
            &[],
            &[],
            &[],
            &[],
            &[],
            &StateSnapshotContinuityMetrics::default(),
            Some(&PreparedContextPacket {
                packet_kind: "continuity_context".to_string(),
                ready: true,
                summary: "Prepared context ready.".to_string(),
                anchor_refs: vec!["msg_2".to_string()],
                source_refs: vec!["msg_2".to_string()],
                decision_refs: vec!["msg_2".to_string()],
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
                ..PreparedContextPacket::default()
            }),
            None,
        );

        let unresolved = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_UNRESOLVED_DECISIONS)
            .expect("unresolved decisions field");
        assert_eq!(unresolved.status, "monitor");
        assert_eq!(
            unresolved.reason,
            "Prepared support is already available, so generic decision backlog stays bounded."
        );
    }

    #[test]
    fn unresolved_decisions_yield_to_monitor_when_prepared_decision_memo_is_ready() {
        let fields = build_state_fields(
            &[
                StateSnapshotDecisionItem {
                    id: "decision_1".to_string(),
                    label: "Choose migration path".to_string(),
                    category: "decision".to_string(),
                    urgency: "medium".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_1".to_string()],
                    suggested_next_action: "Review tradeoffs".to_string(),
                    approval_required: false,
                },
                StateSnapshotDecisionItem {
                    id: "decision_2".to_string(),
                    label: "Choose rollout window".to_string(),
                    category: "decision".to_string(),
                    urgency: "medium".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_2".to_string()],
                    suggested_next_action: "Review options".to_string(),
                    approval_required: false,
                },
            ],
            &[],
            &[],
            &[],
            &[],
            &[],
            &StateSnapshotContinuityMetrics::default(),
            None,
            Some(&PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 decision memo for review.".to_string(),
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_decision_memo".to_string(),
                    draft_class: "decision_memo".to_string(),
                    label: "Decision memo".to_string(),
                    channel: "workspace".to_string(),
                    summary: "Prepared decision memo".to_string(),
                    body: "Tradeoff review".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                    source_count: 2,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review memo".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
        );

        let unresolved = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_UNRESOLVED_DECISIONS)
            .expect("unresolved decisions field");
        assert_eq!(unresolved.status, "monitor");
        assert_eq!(
            unresolved.reason,
            "Prepared support is already available, so generic decision backlog stays bounded."
        );
    }

    #[test]
    fn unresolved_decisions_stay_active_when_only_prepared_follow_up_is_ready() {
        let fields = build_state_fields(
            &[
                StateSnapshotDecisionItem {
                    id: "decision_1".to_string(),
                    label: "Choose migration path".to_string(),
                    category: "decision".to_string(),
                    urgency: "medium".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_1".to_string()],
                    suggested_next_action: "Review tradeoffs".to_string(),
                    approval_required: false,
                },
                StateSnapshotDecisionItem {
                    id: "decision_2".to_string(),
                    label: "Choose rollout window".to_string(),
                    category: "decision".to_string(),
                    urgency: "medium".to_string(),
                    confidence: "medium".to_string(),
                    source_refs: vec!["msg_2".to_string()],
                    suggested_next_action: "Review options".to_string(),
                    approval_required: false,
                },
            ],
            &[],
            &[],
            &[],
            &[],
            &[],
            &StateSnapshotContinuityMetrics::default(),
            None,
            Some(&PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 follow-up draft.".to_string(),
                drafts: vec![PreparedDraftArtifact {
                    draft_id: "draft_follow_up".to_string(),
                    draft_class: "follow_up_draft".to_string(),
                    label: "Follow-up".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared follow-up".to_string(),
                    body: "Checking in".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_reply".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: Some("rich_note".to_string()),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review and send".to_string(),
                    object_refs: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
            }),
        );

        let unresolved = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_UNRESOLVED_DECISIONS)
            .expect("unresolved decisions field");
        assert_eq!(unresolved.status, "active");
        assert_eq!(
            unresolved.reason,
            "The decision queue still contains unresolved items."
        );
    }

    #[test]
    fn research_gap_yields_to_monitor_when_prepared_context_is_ready() {
        let fields = build_state_fields(
            &[StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Compare vendor options".to_string(),
                category: "research".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Research the alternatives".to_string(),
                approval_required: false,
            }],
            &[],
            &[],
            &[],
            &[StateSnapshotContextItem {
                id: "ctx_1".to_string(),
                label: "Missing evidence thread".to_string(),
                why_surfaced: "missing evidence for decision".to_string(),
                confidence: "medium".to_string(),
                freshness: "stale".to_string(),
                relation_path: vec!["same_project".to_string()],
                source_refs: vec!["msg_2".to_string()],
                decrypt_needed: false,
            }],
            &[],
            &StateSnapshotContinuityMetrics::default(),
            Some(&PreparedContextPacket {
                packet_kind: "continuity_context".to_string(),
                ready: true,
                summary: "Prepared supporting context.".to_string(),
                anchor_refs: vec!["msg_1".to_string()],
                source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
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
                ..PreparedContextPacket::default()
            }),
            None,
        );

        let research_gap = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_RESEARCH_GAP)
            .expect("research gap field");
        assert_eq!(research_gap.status, "monitor");
        assert_eq!(
            research_gap.reason,
            "Prepared context is already available, so research gap pressure stays bounded."
        );
    }

    #[test]
    fn stale_knowledge_risk_activates_for_decrypt_needed_watcher_signal() {
        let fields = build_state_fields(
            &[],
            &[],
            &[],
            &[],
            &[],
            &[StateSnapshotWatcherSignal {
                id: "sig_1".to_string(),
                signal_key: "watcher:locked_context".to_string(),
                category: "knowledge".to_string(),
                freshness: "recent".to_string(),
                urgency: "this_week".to_string(),
                confidence: "medium".to_string(),
                urgency_hint: "Signal remains available as recent watcher context.".to_string(),
                suppression_status: "active".to_string(),
                suppression_reason:
                    "Watcher surfaced this signal without an active suppression override."
                        .to_string(),
                escalation_status: "quiet".to_string(),
                escalation_reason: "Signal remains available as low-pressure watcher context."
                    .to_string(),
                decrypt_needed: true,
                source_type: "watcher_alert".to_string(),
                source_subtype: "locked_context".to_string(),
                thread_id: "thread_1".to_string(),
                source_refs: vec!["msg_1".to_string()],
            }],
            &StateSnapshotContinuityMetrics::default(),
            None,
            None,
        );

        let stale_knowledge = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_STALE_KNOWLEDGE_RISK)
            .expect("stale knowledge field");
        assert_eq!(stale_knowledge.status, "monitor");
        assert_eq!(
            stale_knowledge.reason,
            "One surfaced item still needs decryption before it can be trusted."
        );
    }

    #[test]
    fn stale_knowledge_risk_activates_for_low_confidence_context_item() {
        let fields = build_state_fields(
            &[],
            &[],
            &[],
            &[],
            &[StateSnapshotContextItem {
                id: "context_1".to_string(),
                label: "Old research note".to_string(),
                why_surfaced: "Needs verification.".to_string(),
                confidence: "low".to_string(),
                freshness: "stale".to_string(),
                relation_path: vec!["same_topic".to_string()],
                source_refs: vec!["msg_context".to_string()],
                decrypt_needed: false,
            }],
            &[],
            &StateSnapshotContinuityMetrics::default(),
            None,
            None,
        );

        let stale_knowledge = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_STALE_KNOWLEDGE_RISK)
            .expect("stale knowledge field");
        assert_eq!(stale_knowledge.status, "monitor");
        assert_eq!(
            stale_knowledge.reason,
            "One surfaced item is still low-confidence and should be verified before it can be trusted."
        );
    }

    #[test]
    fn has_escalation_state_field_ignores_unknown_confidence() {
        let fields = vec![StateFieldActivation {
            field_key: STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
            label: "Project scope drift".to_string(),
            status: "active".to_string(),
            confidence: "unknown".to_string(),
            surface_hint: "context_panel".to_string(),
            recommended_action: "Inspect project context.".to_string(),
            autonomy_level: "suggest_with_artifact".to_string(),
            reason: "Malformed legacy confidence.".to_string(),
            evidence_refs: vec!["msg_1".to_string()],
        }];

        assert_eq!(
            leading_state_field(&fields).map(|field| field.field_key.as_str()),
            Some(STATE_FIELD_PROJECT_SCOPE_DRIFT)
        );
        assert!(!has_escalation_state_field(&fields));
    }

    #[test]
    fn field_engine_advisory_can_promote_relationship_follow_up() {
        let mut fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_RELATIONSHIP_FOLLOW_UP.to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                reason: "A relationship-linked follow-up is currently in view.".to_string(),
                ..StateFieldActivation::default()
            },
            StateFieldActivation {
                field_key: STATE_FIELD_UNRESOLVED_DECISIONS.to_string(),
                status: "active".to_string(),
                confidence: "medium".to_string(),
                ..StateFieldActivation::default()
            },
        ];
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![FieldSignal {
                field_type: FIELD_TYPE_RELATIONSHIP.to_string(),
                scope_ref: "thread_partner".to_string(),
                projected_risk: 0.84,
                confidence: 0.62,
                ..FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_advisory_to_state_fields(&mut fields, &field_snapshot);

        let relationship = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_RELATIONSHIP_FOLLOW_UP)
            .expect("relationship field");
        assert_eq!(relationship.status, "active");
        assert_eq!(relationship.confidence, "medium");
        assert!(relationship.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(
            relationship
                .evidence_refs
                .contains(&"thread_partner".to_string())
        );
        assert_eq!(
            leading_state_field(&fields).map(|field| field.field_key.as_str()),
            Some(STATE_FIELD_RELATIONSHIP_FOLLOW_UP)
        );
    }

    #[test]
    fn field_engine_advisory_can_promote_goal_readiness_lane() {
        let mut fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_MEETING_READINESS.to_string(),
                label: "Meeting readiness".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Prepare the upcoming meeting.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Upcoming commitment detected.".to_string(),
                evidence_refs: vec!["calendar_launch".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_UNRESOLVED_DECISIONS.to_string(),
                label: "Unresolved decisions".to_string(),
                status: "monitor".to_string(),
                confidence: "medium".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Resolve the blocking decision.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Decision backlog still open.".to_string(),
                evidence_refs: vec!["msg_decision".to_string()],
            },
        ];
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![FieldSignal {
                field_type: FIELD_TYPE_GOAL.to_string(),
                scope_ref: "calendar_launch".to_string(),
                confidence: 0.61,
                projected_risk: 0.76,
                projected_opportunity: 0.54,
                ..FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_advisory_to_state_fields(&mut fields, &field_snapshot);

        let readiness = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_MEETING_READINESS)
            .expect("meeting readiness field");
        assert_eq!(readiness.status, "active");
        assert_eq!(readiness.confidence, "medium");
        assert!(readiness.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(
            readiness
                .evidence_refs
                .contains(&"calendar_launch".to_string())
        );
    }

    #[test]
    fn field_engine_advisory_can_enrich_opportunity_decision_and_research_lanes() {
        let mut fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_UNRESOLVED_DECISIONS.to_string(),
                label: "Unresolved decisions".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Resolve the decision queue.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Decision backlog still open.".to_string(),
                evidence_refs: vec!["msg_decision".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_RESEARCH_GAP.to_string(),
                label: "Research gap".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Gather comparison evidence.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Research coverage is still incomplete.".to_string(),
                evidence_refs: vec!["ctx_research".to_string()],
            },
        ];
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![FieldSignal {
                field_type: FIELD_TYPE_OPPORTUNITY.to_string(),
                scope_ref: "project_launch".to_string(),
                confidence: 0.58,
                projected_risk: 0.49,
                projected_opportunity: 0.71,
                ..FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_advisory_to_state_fields(&mut fields, &field_snapshot);

        let decisions = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_UNRESOLVED_DECISIONS)
            .expect("decision field");
        let research = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_RESEARCH_GAP)
            .expect("research field");

        assert!(decisions.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(research.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(
            decisions
                .evidence_refs
                .contains(&"project_launch".to_string())
        );
        assert!(
            research
                .evidence_refs
                .contains(&"project_launch".to_string())
        );
        assert_eq!(decisions.confidence, "medium");
        assert_eq!(research.confidence, "medium");
    }

    #[test]
    fn field_engine_advisory_can_enrich_knowledge_research_and_staleness_lanes() {
        let mut fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_RESEARCH_GAP.to_string(),
                label: "Research gap".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Gather evidence.".to_string(),
                autonomy_level: "prepare_silently".to_string(),
                reason: "Research coverage is still incomplete.".to_string(),
                evidence_refs: vec!["ctx_research".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_STALE_KNOWLEDGE_RISK.to_string(),
                label: "Stale knowledge risk".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Refresh old context.".to_string(),
                autonomy_level: "prepare_silently".to_string(),
                reason: "One surfaced item looks stale enough to verify.".to_string(),
                evidence_refs: vec!["ctx_stale".to_string()],
            },
        ];
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![FieldSignal {
                field_type: FIELD_TYPE_KNOWLEDGE.to_string(),
                scope_ref: "research_brief".to_string(),
                confidence: 0.57,
                projected_risk: 0.73,
                projected_opportunity: 0.52,
                ..FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_advisory_to_state_fields(&mut fields, &field_snapshot);

        let research = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_RESEARCH_GAP)
            .expect("research field");
        let stale = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_STALE_KNOWLEDGE_RISK)
            .expect("stale field");

        assert!(research.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(stale.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(
            research
                .evidence_refs
                .contains(&"research_brief".to_string())
        );
        assert!(stale.evidence_refs.contains(&"research_brief".to_string()));
        assert_eq!(research.confidence, "medium");
        assert_eq!(stale.confidence, "medium");
        assert_eq!(stale.status, "active");
    }

    #[test]
    fn field_engine_advisory_can_enrich_interest_research_and_project_lanes() {
        let mut fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_RESEARCH_GAP.to_string(),
                label: "Research gap".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Gather evidence.".to_string(),
                autonomy_level: "prepare_silently".to_string(),
                reason: "Research coverage is still incomplete.".to_string(),
                evidence_refs: vec!["ctx_interest".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
                label: "Project scope drift".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Review scope drift.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Project context still needs alignment.".to_string(),
                evidence_refs: vec!["ctx_interest".to_string()],
            },
        ];
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![FieldSignal {
                field_type: FIELD_TYPE_INTEREST.to_string(),
                scope_ref: "project_interest".to_string(),
                confidence: 0.57,
                projected_risk: 0.73,
                projected_opportunity: 0.66,
                ..FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_advisory_to_state_fields(&mut fields, &field_snapshot);

        let research = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_RESEARCH_GAP)
            .expect("research field");
        let drift = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_PROJECT_SCOPE_DRIFT)
            .expect("drift field");

        assert!(research.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(drift.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(
            research
                .evidence_refs
                .contains(&"project_interest".to_string())
        );
        assert!(
            drift
                .evidence_refs
                .contains(&"project_interest".to_string())
        );
        assert_eq!(research.confidence, "medium");
        assert_eq!(drift.confidence, "medium");
        assert_eq!(research.status, "active");
        assert_eq!(drift.status, "active");
    }

    #[test]
    fn field_engine_advisory_can_enrich_obligation_readiness_and_follow_up_lanes() {
        let mut fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_MEETING_READINESS.to_string(),
                label: "Meeting readiness".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Prepare for the commitment.".to_string(),
                autonomy_level: "prepare_silently".to_string(),
                reason: "A meeting is coming soon.".to_string(),
                evidence_refs: vec!["calendar_obligation".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                label: "Follow-up pressure".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "response_queue".to_string(),
                recommended_action: "Review follow-up pressure.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "The response queue still carries active follow-up work.".to_string(),
                evidence_refs: vec!["msg_obligation".to_string()],
            },
        ];
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![FieldSignal {
                field_type: FIELD_TYPE_OBLIGATION.to_string(),
                scope_ref: "calendar_obligation".to_string(),
                confidence: 0.58,
                projected_risk: 0.74,
                projected_opportunity: 0.49,
                ..FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_advisory_to_state_fields(&mut fields, &field_snapshot);

        let readiness = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_MEETING_READINESS)
            .expect("readiness field");
        let follow_up = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow-up field");

        assert!(readiness.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(follow_up.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(
            readiness
                .evidence_refs
                .contains(&"calendar_obligation".to_string())
        );
        assert!(
            follow_up
                .evidence_refs
                .contains(&"calendar_obligation".to_string())
        );
        assert_eq!(readiness.confidence, "medium");
        assert_eq!(follow_up.confidence, "medium");
        assert_eq!(readiness.status, "active");
        assert_eq!(follow_up.status, "active");
    }

    #[test]
    fn field_engine_advisory_can_enrich_attention_decision_and_follow_up_lanes() {
        let mut fields = vec![
            StateFieldActivation {
                field_key: STATE_FIELD_UNRESOLVED_DECISIONS.to_string(),
                label: "Unresolved decisions".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Resolve the queue.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Decision backlog still open.".to_string(),
                evidence_refs: vec!["msg_decision".to_string()],
            },
            StateFieldActivation {
                field_key: STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                label: "Follow-up pressure".to_string(),
                status: "monitor".to_string(),
                confidence: "low".to_string(),
                surface_hint: "response_queue".to_string(),
                recommended_action: "Review follow-up pressure.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "The response queue still carries active follow-up work.".to_string(),
                evidence_refs: vec!["msg_reply".to_string()],
            },
        ];
        let field_snapshot = FieldEngineSnapshot {
            fields: vec![FieldSignal {
                field_type: FIELD_TYPE_ATTENTION.to_string(),
                scope_ref: "thread_attention".to_string(),
                confidence: 0.59,
                projected_risk: 0.77,
                projected_opportunity: 0.41,
                ..FieldSignal::default()
            }],
            ..FieldEngineSnapshot::default()
        };

        apply_field_engine_advisory_to_state_fields(&mut fields, &field_snapshot);

        let decisions = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_UNRESOLVED_DECISIONS)
            .expect("decision field");
        let follow_up = fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow-up field");

        assert!(decisions.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(follow_up.reason.starts_with(FIELD_ENGINE_REASON_PREFIX));
        assert!(
            decisions
                .evidence_refs
                .contains(&"thread_attention".to_string())
        );
        assert!(
            follow_up
                .evidence_refs
                .contains(&"thread_attention".to_string())
        );
        assert_eq!(decisions.confidence, "medium");
        assert_eq!(follow_up.confidence, "medium");
        assert_eq!(decisions.status, "active");
        assert_eq!(follow_up.status, "active");
    }
}
