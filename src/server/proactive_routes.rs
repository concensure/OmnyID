// @locs-version: 1.0
// @module-id: server.proactive-routes
// @primary-capability: proactive-http-routes
// @stability: beta

/// Proactive agent HTTP routes — P1.2, P3.3, P3.4, P5.3, P7.1–P7.3.
///
/// POST /events/passive                    — ingest passive event AFP (no LLM)
/// POST /proactive/outcomes                — record acceptance / dismissal (P3.3)
/// GET  /proactive/suggestions             — list pending suggestions
/// GET  /proactive/audit                   — autonomous action audit log (P7.2)
/// GET  /memory/context                    — behavioral + temporal context (P3.4)
/// GET  /proactive/packs                   — available + enabled heuristic packs (P7.3)
/// POST /proactive/packs/{pack_id}/enable  — enable a pack
/// POST /proactive/packs/{pack_id}/disable — disable a pack
/// GET  /proactive/autonomy/{heuristic_id} — get autonomy tier override
/// PUT  /proactive/autonomy/{heuristic_id} — set autonomy tier override
/// GET  /proactive/level                   — get global proactivity level (1-3)
/// POST /proactive/level                   — set global proactivity level
use super::*;
use crate::agent_template::default_priority_rules;
use crate::background_watcher::build_watcher_resolution_event_afp;
use crate::message::{
    AFP_SUBTYPE_COORDINATION_CYCLE_TRACE, AFP_TYPE_PASSIVE_EVENT, AFP_TYPE_PROACTIVE_ACTION_TAKEN,
    AFP_TYPE_REFLECTION_TRACE, AfpOutcomeObservabilityContent, AfpPassiveEventContent,
    AfpReflectionTraceContent, AfpWatcherResolutionEventContent,
};
use crate::personal_event_ingestion::{
    enrich_mail_passive_event_with_recent_contact_context,
    enrich_mail_passive_event_with_recent_conversation_context,
    enrich_mail_passive_event_with_recent_thread_context,
    enrich_mail_passive_event_with_reply_policy, plan_passive_event_background_artifact,
};
use crate::proactive_engine::{
    EvaluationResult, ProactiveOutcomeRecord, apply_confidence_feedback,
    build_suggestion_afp_bundle_with_autonomy, builtin_heuristics, evaluate,
};
use crate::proactive_heuristics_extended::{
    heuristics_for_packs, pack_catalogue, suggest_packs_from_behavior,
};
use crate::proactive_llm_gate::run_llm_gate;
use crate::proactive_memory_capture::capture_proactive_outcome_memory;
use crate::proactive_outcome_memory::{
    HeuristicOutcomeFeedback, annotate_suggestions_with_outcome_feedback, feedback_for_heuristic,
    filter_suggestions_by_outcome_feedback, reprioritize_suggestions_by_outcome_feedback,
    summarize_family_outcome_rates_adapted_with_signal_overrides, summarize_outcome_rates_adapted,
    summarize_outcome_rates_adapted_with_signal_overrides,
};
use crate::server::approval_surfaces::approval_draft_preview_lines;
use crate::server::continuity_routes::{
    continuity_panel_kind, continuity_prepared_draft_items,
    continuity_prepared_packet_detail_lines, continuity_primary_mode, continuity_reference_labels,
    continuity_state_snapshot_content, cost_status_from_snapshot,
    effective_priority_item_with_cost, empathy_coordination_reason, load_continuity_state_summary,
    load_dashboard_cost_snapshot, preferred_continuity_state_message,
    simulator_approval_review_preview_from_state, simulator_prepared_context_preview_from_state,
    simulator_reversible_action_preview_from_state, thread_retrieval_state_from_refs,
};
use crate::token_budget::TokenBudgetGate;
use crate::{
    autonomy_policy::{ProactiveAutonomyTier, autonomy_decision_for_proactive_enum},
    field_engine_contract::{
        FIELD_TYPE_ATTENTION, FIELD_TYPE_GOAL, FIELD_TYPE_INTEREST, FIELD_TYPE_KNOWLEDGE,
        FIELD_TYPE_OBLIGATION, FIELD_TYPE_OPPORTUNITY, FIELD_TYPE_PROJECT, FIELD_TYPE_RELATIONSHIP,
        field_type_from_primary_or_summary,
    },
    memory_workspace::MemoryWorkspaceScope,
    prepared_context_packet::{
        PREPARED_CONTEXT_KIND_CONTINUITY, PreparedContextPack, PreparedContextPacket,
        build_prepared_context_ledger_afp,
    },
    prepared_draft_packet::{
        PreparedDraftArtifact, PreparedDraftComparisonRow, build_prepared_draft_ledger_afp,
    },
    response_queue_policy::NotificationSourceFilters,
    state_fields::{STATE_FIELD_APPROVAL_REQUIRED_WORK, STATE_FIELD_UNRESOLVED_DECISIONS},
    state_synthesizer::build_synthesis_invalidation_afp,
    state_synthesizer_contract::SynthesizerToMasterHandoff,
};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

mod proactive_companion_storage;
use proactive_companion_storage::store_proactive_companion_afps;

fn watcher_resolution_source_message<'a>(
    messages: &'a [Value],
    suggestion_id: &str,
) -> Option<&'a Value> {
    messages.iter().find(|message| {
        message.get("id").and_then(Value::as_str) == Some(suggestion_id)
            && matches!(
                message.get("type").and_then(Value::as_str),
                Some("watcher_alert" | "smart_suggestion")
            )
    })
}

fn watcher_resolution_event_from_outcome(
    owner_user_id: &str,
    suggestion_id: &str,
    accepted: bool,
    heuristic_id: &str,
    source_message: &Value,
) -> Value {
    let thread_id = source_message
        .get("thread_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("passive:unknown");
    let content = source_message.get("content").unwrap_or(source_message);
    let category = content
        .get("category")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let severity = content
        .get("severity")
        .and_then(Value::as_str)
        .map(str::to_string);
    let source_event_id = content
        .get("source_event_id")
        .and_then(Value::as_str)
        .map(str::to_string);

    build_watcher_resolution_event_afp(
        owner_user_id,
        thread_id,
        &AfpWatcherResolutionEventContent {
            resolution_kind: if accepted {
                "accepted".to_string()
            } else {
                "dismissed".to_string()
            },
            resolved_message_id: suggestion_id.to_string(),
            heuristic_id: heuristic_id.to_string(),
            category,
            severity,
            source_event_id,
            note: None,
            snoozed_until: None,
        },
    )
}

fn synthesis_invalidation_event_from_resolution(
    owner_user_id: &str,
    resolution_event: &Value,
    continuity_summary: &crate::server::types::DashboardContinuityStateResponse,
) -> Option<Value> {
    if continuity_summary.latest_state_snapshot_ref.is_none()
        && continuity_summary.latest_state_synthesis_ref.is_none()
    {
        return None;
    }

    Some(build_synthesis_invalidation_afp(
        owner_user_id,
        &crate::message::AfpSynthesisInvalidationEventContent {
            invalidation_kind: "watcher_resolution".to_string(),
            reason_message_id: resolution_event["id"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            reason_type: resolution_event["type"]
                .as_str()
                .unwrap_or("watcher_resolution_event")
                .to_string(),
            invalidated_types: vec!["state_snapshot".to_string(), "state_synthesis".to_string()],
            invalidated_snapshot_ref: continuity_summary.latest_state_snapshot_ref.clone(),
            invalidated_synthesis_ref: continuity_summary.latest_state_synthesis_ref.clone(),
            heuristic_id: resolution_event["metadata"]["heuristic_id"]
                .as_str()
                .map(str::to_string),
            category: resolution_event["metadata"]["searchable_metadata"]["watcher_category"]
                .as_str()
                .map(str::to_string),
        },
    ))
}

fn coordination_reflection_trace_from_outcome(
    owner_user_id: &str,
    req: &RecordOutcomeRequest,
    continuity_summary: &crate::server::types::DashboardContinuityStateResponse,
    outcome_observability: Option<AfpOutcomeObservabilityContent>,
    watcher_resolution_event_id: Option<&str>,
    synthesis_invalidation_event_id: Option<&str>,
) -> Value {
    let surfaced_summary = continuity_summary
        .preferred_state_brief
        .as_ref()
        .map(|brief| brief.title.clone());
    let surfaced_priority_title = continuity_summary
        .preferred_priority_item
        .as_ref()
        .map(|item| item.title.clone());
    let surfaced_panel_kind = continuity_summary
        .preferred_priority_item
        .as_ref()
        .map(|item| item.panel_kind.clone());
    let mut linked_artifact_ids = Vec::new();
    if let Some(outcome_afp_id) = req.outcome_afp_id.as_ref() {
        linked_artifact_ids.push(outcome_afp_id.clone());
    }
    if let Some(event_id) = watcher_resolution_event_id {
        linked_artifact_ids.push(event_id.to_string());
    }
    if let Some(event_id) = synthesis_invalidation_event_id {
        linked_artifact_ids.push(event_id.to_string());
    }

    let mut reasoning_notes = Vec::new();
    if let Some(selection_reason) = continuity_summary
        .preferred_priority_item
        .as_ref()
        .and_then(|item| item.selection_reason.clone())
    {
        reasoning_notes.push(selection_reason);
    }
    if let Some(explanation) = continuity_summary
        .preferred_synthesizer_handoff
        .as_ref()
        .and_then(|handoff| handoff.empathy_context.as_ref())
        .and_then(|context| context.explanation.clone())
    {
        reasoning_notes.push(explanation);
    }
    if let Some(summary) = continuity_summary
        .preferred_synthesizer_handoff
        .as_ref()
        .and_then(|handoff| handoff.field_engine_summary.clone())
    {
        reasoning_notes.push(format!("Field-guided: {summary}"));
    }
    let packet_detail_notes = continuity_summary
        .latest_state_snapshot
        .as_ref()
        .and_then(continuity_state_snapshot_content)
        .map(continuity_prepared_packet_detail_lines)
        .unwrap_or_default();
    if packet_detail_notes.is_empty() {
        if let Some(prepared_context_summary) = continuity_summary
            .preferred_synthesizer_handoff
            .as_ref()
            .and_then(|handoff| handoff.prepared_context_summary.clone())
        {
            reasoning_notes.push(prepared_context_summary);
        }
        if let Some(prepared_draft_summary) = continuity_summary
            .preferred_synthesizer_handoff
            .as_ref()
            .and_then(|handoff| handoff.prepared_draft_summary.clone())
        {
            reasoning_notes.push(prepared_draft_summary);
        }
    } else {
        for note in packet_detail_notes.into_iter().take(2) {
            reasoning_notes.push(note);
        }
    }
    reasoning_notes.truncate(4);

    let content = AfpReflectionTraceContent {
        cycle_kind: "proactive_outcome".to_string(),
        suggestion_id: req.suggestion_id.clone(),
        outcome_kind: if req.accepted {
            "accepted".to_string()
        } else {
            "dismissed".to_string()
        },
        heuristic_id: req.heuristic_id.clone(),
        surfaced_summary,
        surfaced_priority_title,
        surfaced_panel_kind,
        snapshot_ref: continuity_summary.latest_state_snapshot_ref.clone(),
        synthesis_ref: continuity_summary.latest_state_synthesis_ref.clone(),
        linked_artifact_ids: linked_artifact_ids.clone(),
        reasoning_notes: reasoning_notes.clone(),
        outcome_observability,
        traced_at: chrono::Utc::now().to_rfc3339(),
    };

    json!({
        "protocol": "afp-v1",
        "id": ulid::Ulid::new().to_string(),
        "thread_id": format!("continuity:state:{}", owner_user_id),
        "from": "proactive_agent",
        "to": [owner_user_id],
        "timestamp": content.traced_at,
        "type": AFP_TYPE_REFLECTION_TRACE,
        "subtype": AFP_SUBTYPE_COORDINATION_CYCLE_TRACE,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": {
            "store": true,
            "coordination_event": true,
            "searchable_metadata": {
                "cycle_kind": content.cycle_kind,
                "suggestion_id": content.suggestion_id,
                "outcome_kind": content.outcome_kind,
                "heuristic_id": content.heuristic_id,
                "snapshot_ref": content.snapshot_ref,
                "synthesis_ref": content.synthesis_ref,
                "panel_kind": content.surfaced_panel_kind,
            }
        },
        "store_in_relational": true,
    })
}

fn outcome_observability_from_outcome(
    req: &RecordOutcomeRequest,
    continuity_summary: &crate::server::types::DashboardContinuityStateResponse,
    heuristic_feedback: Option<&HeuristicOutcomeFeedback>,
    linked_artifact_count: usize,
) -> AfpOutcomeObservabilityContent {
    let dominant_surface_kind = continuity_summary
        .preferred_priority_card
        .as_ref()
        .map(|card| card.panel_kind.clone())
        .or_else(|| {
            continuity_summary
                .preferred_priority_item
                .as_ref()
                .map(|item| item.panel_kind.clone())
        });
    let surface_kind = continuity_summary
        .preferred_priority_item
        .as_ref()
        .and_then(|item| item.surface_hint.clone())
        .or_else(|| dominant_surface_kind.clone())
        .or_else(|| {
            continuity_summary
                .preferred_synthesizer_handoff
                .as_ref()
                .map(|handoff| handoff.surface_recommendation.clone())
        })
        .unwrap_or_else(|| "unknown".to_string());
    let source_ref_count = continuity_summary
        .preferred_priority_item
        .as_ref()
        .map(|item| item.source_refs.len())
        .unwrap_or(0);
    let workspace_scope_kind = req.memory_workspace_scope().map(|scope| {
        let has_authorship_scope = scope.author_mask.is_some()
            || scope.author_type.is_some()
            || scope.author_id.is_some()
            || scope.is_human_authored.is_some()
            || scope.human_only.is_some();
        match (scope.memory_space.is_some(), has_authorship_scope) {
            (true, true) => "memory_and_authorship".to_string(),
            (true, false) => "memory_space".to_string(),
            (false, true) => "authorship".to_string(),
            (false, false) => "unscoped".to_string(),
        }
    });
    let narrowing_signal = if workspace_scope_kind.is_some() {
        "workspace_scoped".to_string()
    } else if source_ref_count > 0 || linked_artifact_count > 1 {
        "continuity_scoped".to_string()
    } else {
        "broad".to_string()
    };
    let dominant_surface_match = dominant_surface_kind
        .as_deref()
        .is_some_and(|kind| kind == surface_kind);
    let acceptance_rate_bucket = heuristic_feedback.map(|feedback| {
        let rate = feedback.acceptance_rate;
        if rate >= 0.75 {
            "high".to_string()
        } else if rate >= 0.45 {
            "medium".to_string()
        } else {
            "low".to_string()
        }
    });

    AfpOutcomeObservabilityContent {
        surface_kind,
        dominant_surface_kind,
        workspace_scope_kind,
        narrowing_signal,
        feedback_status: heuristic_feedback.map(|feedback| feedback.status.clone()),
        feedback_scope: heuristic_feedback.map(|feedback| feedback.scope.clone()),
        acceptance_rate_bucket,
        dominant_surface_match,
        linked_artifact_count: linked_artifact_count as u32,
        source_ref_count: source_ref_count as u32,
    }
}

fn summarize_outcome_observability_traces(messages: &[Value]) -> Value {
    let mut total = 0_u64;
    let mut accepted = 0_u64;
    let mut dismissed = 0_u64;
    let mut dominant_surface_matches = 0_u64;
    let mut surface_counts: std::collections::BTreeMap<String, u64> = Default::default();
    let mut narrowing_counts: std::collections::BTreeMap<String, u64> = Default::default();
    let mut feedback_status_counts: std::collections::BTreeMap<String, u64> = Default::default();
    let mut acceptance_bucket_counts: std::collections::BTreeMap<String, u64> = Default::default();

    for message in messages {
        if message.get("type").and_then(Value::as_str) != Some(AFP_TYPE_REFLECTION_TRACE) {
            continue;
        }
        if message.get("subtype").and_then(Value::as_str)
            != Some(AFP_SUBTYPE_COORDINATION_CYCLE_TRACE)
        {
            continue;
        }
        if message["content"]["cycle_kind"].as_str() != Some("proactive_outcome") {
            continue;
        }
        let observability = &message["content"]["outcome_observability"];
        if !observability.is_object() {
            continue;
        }

        total += 1;
        match message["content"]["outcome_kind"].as_str() {
            Some("accepted") => accepted += 1,
            Some("dismissed") => dismissed += 1,
            _ => {}
        }
        if observability["dominant_surface_match"].as_bool() == Some(true) {
            dominant_surface_matches += 1;
        }
        if let Some(surface_kind) = observability["surface_kind"].as_str() {
            *surface_counts.entry(surface_kind.to_string()).or_default() += 1;
        }
        if let Some(narrowing_signal) = observability["narrowing_signal"].as_str() {
            *narrowing_counts
                .entry(narrowing_signal.to_string())
                .or_default() += 1;
        }
        if let Some(feedback_status) = observability["feedback_status"].as_str() {
            *feedback_status_counts
                .entry(feedback_status.to_string())
                .or_default() += 1;
        }
        if let Some(bucket) = observability["acceptance_rate_bucket"].as_str() {
            *acceptance_bucket_counts
                .entry(bucket.to_string())
                .or_default() += 1;
        }
    }

    json!({
        "total_traces": total,
        "accepted": accepted,
        "dismissed": dismissed,
        "dominant_surface_matches": dominant_surface_matches,
        "surface_counts": surface_counts,
        "narrowing_counts": narrowing_counts,
        "feedback_status_counts": feedback_status_counts,
        "acceptance_rate_bucket_counts": acceptance_bucket_counts,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FieldEngineFocus {
    Attention,
    Interest,
    Obligation,
    Relationship,
    Project,
    Goal,
    Opportunity,
    Knowledge,
}

fn field_engine_focus_from_handoff(
    handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<FieldEngineFocus> {
    let handoff = handoff?;
    if !handoff.field_engine_ready {
        return None;
    }
    match field_type_from_primary_or_summary(
        handoff.field_engine_primary_type.as_deref(),
        handoff.field_engine_summary.as_deref(),
    ) {
        Some(FIELD_TYPE_ATTENTION) => Some(FieldEngineFocus::Attention),
        Some(FIELD_TYPE_INTEREST) => Some(FieldEngineFocus::Interest),
        Some(FIELD_TYPE_OBLIGATION) => Some(FieldEngineFocus::Obligation),
        Some(FIELD_TYPE_RELATIONSHIP) => Some(FieldEngineFocus::Relationship),
        Some(FIELD_TYPE_PROJECT) => Some(FieldEngineFocus::Project),
        Some(FIELD_TYPE_GOAL) => Some(FieldEngineFocus::Goal),
        Some(FIELD_TYPE_OPPORTUNITY) => Some(FieldEngineFocus::Opportunity),
        Some(FIELD_TYPE_KNOWLEDGE) => Some(FieldEngineFocus::Knowledge),
        _ => None,
    }
}

fn field_engine_selection_reason(handoff: Option<&SynthesizerToMasterHandoff>) -> Option<String> {
    handoff
        .filter(|handoff| handoff.field_engine_ready)
        .and_then(|handoff| handoff.field_engine_summary.clone())
        .filter(|summary| !summary.trim().is_empty())
        .map(|summary| format!("Field-guided: {summary}"))
}

fn prepared_draft_alignment_rank(
    item: &ContinuityPreparedDraftItem,
    handoff: Option<&SynthesizerToMasterHandoff>,
    continuity_state: Option<&DashboardContinuityMessage>,
) -> (u8, u8, u8, u8, u8, String) {
    let focus_rank = match field_engine_focus_from_handoff(handoff) {
        Some(FieldEngineFocus::Attention) => match item.draft_class.as_str() {
            "task_bundle" => 0,
            "communication_reply" | "follow_up_draft" => 1,
            "meeting_brief" => 2,
            "decision_memo" | "comparison_table" | "project_prep_note" => 3,
            _ => 4,
        },
        Some(FieldEngineFocus::Interest) => match item.draft_class.as_str() {
            "comparison_table" => 0,
            "decision_memo" | "project_prep_note" => 1,
            "meeting_brief" => 2,
            "task_bundle" => 3,
            "communication_reply" | "follow_up_draft" => 4,
            _ => 5,
        },
        Some(FieldEngineFocus::Obligation) => match item.draft_class.as_str() {
            "meeting_brief" => 0,
            "task_bundle" => 1,
            "follow_up_draft" | "communication_reply" => 2,
            "decision_memo" | "project_prep_note" => 3,
            "comparison_table" => 4,
            _ => 5,
        },
        Some(FieldEngineFocus::Relationship) => match item.draft_class.as_str() {
            "follow_up_draft" => 0,
            "communication_reply" => 1,
            "meeting_brief" => 2,
            "project_prep_note" | "decision_memo" | "comparison_table" | "task_bundle" => 3,
            _ => 4,
        },
        Some(FieldEngineFocus::Project) => match item.draft_class.as_str() {
            "project_prep_note" => 0,
            "decision_memo" | "comparison_table" => 1,
            "task_bundle" | "meeting_brief" => 2,
            "communication_reply" | "follow_up_draft" => 3,
            _ => 4,
        },
        Some(FieldEngineFocus::Goal) => match item.draft_class.as_str() {
            "task_bundle" => 0,
            "meeting_brief" => 1,
            "decision_memo" | "project_prep_note" => 2,
            "comparison_table" => 3,
            "communication_reply" | "follow_up_draft" => 4,
            _ => 5,
        },
        Some(FieldEngineFocus::Opportunity) => match item.draft_class.as_str() {
            "decision_memo" | "comparison_table" => 0,
            "task_bundle" | "project_prep_note" => 1,
            "meeting_brief" => 2,
            "communication_reply" | "follow_up_draft" => 3,
            _ => 4,
        },
        Some(FieldEngineFocus::Knowledge) => match item.draft_class.as_str() {
            "comparison_table" | "decision_memo" => 0,
            "project_prep_note" => 1,
            "task_bundle" | "meeting_brief" => 2,
            "communication_reply" | "follow_up_draft" => 3,
            _ => 4,
        },
        None => 2,
    };
    let readiness_rank = match item.readiness.as_str() {
        "ready_now" => 0,
        "ready" => 1,
        _ => 2,
    };
    let file_rank = prepared_draft_file_alignment_rank(item, continuity_state);
    let scope_rank = crate::server::continuity_ranking_helpers::prepared_draft_scope_rank(
        item.memory_space.as_deref(),
        item.author_mask.as_deref(),
        item.author_type.as_deref(),
        item.author_id.as_deref(),
        item.is_human_authored,
        item.human_only,
    );
    let evidence_rank =
        crate::server::continuity_ranking_helpers::source_refs_evidence_rank(&item.source_refs);
    (
        focus_rank,
        readiness_rank,
        file_rank,
        scope_rank,
        evidence_rank,
        item.draft_class.clone(),
    )
}

fn prepared_draft_selection_reason_with_field_context(
    base_reason: Option<&str>,
    handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<String> {
    let base_reason = base_reason.map(str::trim).filter(|value| !value.is_empty());
    let field_reason = field_engine_selection_reason(handoff);
    match (base_reason, field_reason.as_deref()) {
        (Some(base), Some(field)) if base != field => Some(format!("{base} {field}")),
        (Some(base), _) => Some(base.to_string()),
        (None, Some(field)) => Some(field.to_string()),
        (None, None) => None,
    }
}

fn should_surface_prepared_draft_item_for_selector(
    item: &ContinuityPreparedDraftItem,
    handoff: Option<&SynthesizerToMasterHandoff>,
) -> bool {
    if should_promote_prepared_draft_item(item) {
        return true;
    }
    item.readiness == "ready" && field_engine_focus_from_handoff(handoff).is_some()
}

fn prepared_draft_file_alignment_rank(
    item: &ContinuityPreparedDraftItem,
    continuity_state: Option<&DashboardContinuityMessage>,
) -> u8 {
    let Some(state) = continuity_state else {
        return 1;
    };
    let Some(packet) = (match state.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
            .prepared_context_packet
            .as_ref()
            .cloned()
            .or_else(|| simulator_prepared_context_preview_from_state(state)),
        Some(DashboardContinuityParsedContent::StateSynthesis(_)) | None => None,
    }) else {
        return 1;
    };
    crate::server::continuity_ranking_helpers::source_refs_alignment_rank(
        &item.source_refs,
        Some(packet.source_refs.as_slice()),
    )
}

fn context_pack_alignment_rank(
    item: &ContinuityPreparedContextPackItem,
    handoff: Option<&SynthesizerToMasterHandoff>,
) -> (u8, u8, u8, u8, u8, usize, u8, String) {
    let focus_rank = match field_engine_focus_from_handoff(handoff) {
        Some(FieldEngineFocus::Attention) => {
            if item.pack_kind == "obligation_pack" {
                0
            } else if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "decision" | "follow_up" | "project"))
            {
                1
            } else if !item.reference_refs.is_empty() {
                2
            } else {
                3
            }
        }
        Some(FieldEngineFocus::Interest) => {
            if item.pack_kind == "topic_pack" {
                0
            } else if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "reference" | "project"))
            {
                1
            } else if !item.reference_refs.is_empty() || !item.object_refs.is_empty() {
                2
            } else {
                3
            }
        }
        Some(FieldEngineFocus::Obligation) => {
            if item.pack_kind == "obligation_pack" {
                0
            } else if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "follow_up" | "decision" | "project"))
            {
                1
            } else if !item.object_refs.is_empty() {
                2
            } else {
                3
            }
        }
        Some(FieldEngineFocus::Relationship) => {
            if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "relationship" | "follow_up"))
            {
                0
            } else if !item.reference_refs.is_empty() {
                1
            } else {
                3
            }
        }
        Some(FieldEngineFocus::Project) => {
            if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "project" | "decision" | "reference"))
            {
                0
            } else if item.pack_kind == "topic_pack" {
                1
            } else {
                3
            }
        }
        Some(FieldEngineFocus::Goal) => {
            if item.pack_kind == "obligation_pack" {
                0
            } else if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "decision" | "project"))
            {
                1
            } else {
                3
            }
        }
        Some(FieldEngineFocus::Opportunity) => {
            if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "decision" | "reference" | "project"))
            {
                0
            } else if item.pack_kind == "topic_pack" {
                1
            } else {
                3
            }
        }
        Some(FieldEngineFocus::Knowledge) => {
            if item
                .evidence_kinds
                .iter()
                .any(|kind| matches!(kind.as_str(), "reference" | "decision"))
            {
                0
            } else if item.pack_kind == "topic_pack" {
                1
            } else {
                3
            }
        }
        None => 2,
    };
    let (pack_rank, evidence_rank, urgency_rank) =
        crate::server::continuity_ranking_helpers::context_pack_value_rank(
            &item.pack_kind,
            &item.evidence_kinds,
            &item.why_surfaced,
        );
    let value_rank = evidence_rank.min(urgency_rank);
    let scope_rank = context_pack_scope_rank(item);
    let file_rank = crate::server::continuity_ranking_helpers::context_pack_file_rank(
        &item.file_refs,
        &item.file_labels,
    );
    let source_rank =
        crate::server::continuity_ranking_helpers::source_refs_evidence_rank(&item.source_refs);
    (
        focus_rank,
        pack_rank,
        value_rank,
        scope_rank,
        file_rank,
        std::cmp::Reverse(item.reference_refs.len()).0,
        source_rank,
        item.pack_kind.clone(),
    )
}

fn context_pack_value_signal_rank(item: &ContinuityPreparedContextPackItem) -> u8 {
    let (_, evidence_rank, urgency_rank) =
        crate::server::continuity_ranking_helpers::context_pack_value_rank(
            &item.pack_kind,
            &item.evidence_kinds,
            &item.why_surfaced,
        );
    evidence_rank.min(urgency_rank)
}

fn context_pack_scope_rank(item: &ContinuityPreparedContextPackItem) -> u8 {
    crate::server::continuity_ranking_helpers::context_pack_scope_rank(
        item.memory_space.as_deref(),
        item.author_mask.as_deref(),
        item.author_type.as_deref(),
        item.author_id.as_deref(),
        item.is_human_authored,
        item.human_only,
    )
}

fn prepared_draft_heuristic_id(item: &ContinuityPreparedDraftItem) -> String {
    let fingerprint_payload = serde_json::json!({
        "draft_class": item.draft_class,
        "title": item.title,
        "channel": item.channel,
        "summary": item.summary,
        "body": item.body,
        "response_due_hint": item.response_due_hint,
        "requires_approval": item.requires_approval,
        "source_refs": item.source_refs,
        "comparison_headers": item.comparison_headers,
        "comparison_rows": item.comparison_rows,
    });
    let fingerprint = hex::encode(Sha256::digest(fingerprint_payload.to_string().as_bytes()));
    format!("prepared-draft:{}:{}", item.id, &fingerprint[..16])
}

fn prepared_draft_heuristic_family_id(item: &ContinuityPreparedDraftItem) -> String {
    format!("prepared-draft:{}", item.id)
}

fn context_pack_heuristic_id(item: &ContinuityPreparedContextPackItem) -> String {
    let fingerprint_payload = serde_json::json!({
        "pack_kind": item.pack_kind,
        "title": item.title,
        "summary": item.summary,
        "why_surfaced": item.why_surfaced,
        "source_refs": item.source_refs,
        "reference_refs": item.reference_refs,
        "object_refs": item.object_refs,
        "evidence_kinds": item.evidence_kinds,
    });
    let fingerprint = hex::encode(Sha256::digest(fingerprint_payload.to_string().as_bytes()));
    format!("context-pack:{}:{}", item.id, &fingerprint[..16])
}

fn context_pack_heuristic_family_id(item: &ContinuityPreparedContextPackItem) -> String {
    format!("context-pack:{}", item.id)
}

fn context_ready_heuristic_id(
    packet: &crate::prepared_context_packet::PreparedContextPacket,
    continuity_handoff: &SynthesizerToMasterHandoff,
) -> String {
    let fingerprint_payload = serde_json::json!({
        "summary": packet.summary,
        "prepared_context_summary": continuity_handoff.prepared_context_summary,
        "surface_recommendation": continuity_handoff.surface_recommendation,
        "source_refs": packet.source_refs,
        "reference_refs": packet.reference_refs,
        "object_refs": packet.object_refs,
        "anchor_refs": packet.anchor_refs,
        "pack_ids": packet.packs.iter().map(|pack| pack.pack_id.clone()).collect::<Vec<_>>(),
        "evidence_kinds": packet
            .packs
            .iter()
            .flat_map(|pack| pack.evidence_kinds.iter().cloned())
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>(),
    });
    let fingerprint = hex::encode(Sha256::digest(fingerprint_payload.to_string().as_bytes()));
    format!("context-ready:prepared-context:{}", &fingerprint[..16])
}

fn context_ready_heuristic_family_id() -> String {
    "context-ready:prepared-context".to_string()
}

fn simulator_review_heuristic_family_id(kind: &str) -> String {
    format!("simulator-review:{}", kind)
}

fn simulator_review_heuristic_id(kind: &str, title: &str, source_refs: &[String]) -> String {
    let family_id = simulator_review_heuristic_family_id(kind);
    let fingerprint_payload = json!({
        "kind": kind,
        "title": title,
        "source_refs": source_refs,
    });
    let fingerprint = hex::encode(Sha256::digest(fingerprint_payload.to_string().as_bytes()));
    format!("{}:{}", family_id, &fingerprint[..16])
}

pub(super) async fn load_adapted_outcome_feedback(
    db: &Db,
    user_id: &str,
    queue_pressure: Option<f64>,
) -> Result<Vec<crate::proactive_outcome_memory::HeuristicOutcomeFeedback>, sqlx::Error> {
    let outcome_rates = db.heuristic_acceptance_rates(user_id).await?;
    let family_outcome_rates = db.heuristic_family_acceptance_rates(user_id).await?;

    let heuristic_ids = outcome_rates
        .iter()
        .chain(family_outcome_rates.iter())
        .filter_map(|rate| {
            rate.get("heuristic_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let ema_states = db
        .list_heuristic_ema_states(user_id, &heuristic_ids)
        .await?;
    let recent_rates = db.heuristic_acceptance_rates_recent(user_id, 14).await?;
    let topic_recurrence = recent_rates
        .iter()
        .filter_map(|rate| {
            let heuristic_id = rate.get("heuristic_id").and_then(Value::as_str)?;
            let total = rate
                .get("total")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0) as u32;
            Some((
                heuristic_id.to_string(),
                crate::heuristic_adaptation::normalise_topic_recurrence(total, 5),
            ))
        })
        .collect::<std::collections::HashMap<_, _>>();
    let undone_action_rate = db.recent_undone_action_rate(user_id, 40, 3).await?;
    let draft_usage_rate = db.recent_prepared_draft_usage_rate(user_id, 40, 3).await?;

    let mut feedback = summarize_outcome_rates_adapted_with_signal_overrides(
        &outcome_rates,
        &ema_states,
        queue_pressure,
        Some(&topic_recurrence),
        Some(undone_action_rate),
        Some(draft_usage_rate),
    );
    feedback.extend(
        summarize_family_outcome_rates_adapted_with_signal_overrides(
            &family_outcome_rates,
            &ema_states,
            queue_pressure,
            Some(&topic_recurrence),
            Some(undone_action_rate),
            Some(draft_usage_rate),
        ),
    );
    Ok(feedback)
}

pub(super) fn queue_pressure_from_continuity_summary(
    continuity_summary: &DashboardContinuityStateResponse,
) -> Option<f64> {
    let state = preferred_continuity_state_message(continuity_summary)?;
    let snapshot = match state.parsed_content.as_ref()? {
        DashboardContinuityParsedContent::StateSnapshot(snapshot) => snapshot,
        DashboardContinuityParsedContent::StateSynthesis(_) => return None,
    };
    Some(crate::heuristic_adaptation::normalise_queue_pressure(
        (snapshot.decision_queue.len() + snapshot.response_queue.len()) as u32,
        20,
    ))
}

fn active_attention_window_from_summary(
    continuity_summary: &DashboardContinuityStateResponse,
) -> Option<&Value> {
    continuity_summary
        .latest_state_snapshot
        .as_ref()
        .and_then(|message| message.metadata.get("active_attention_window"))
        .filter(|window| !window.is_null())
}

fn with_active_attention_window_hint(
    mut item: Value,
    active_attention_window: Option<&Value>,
) -> Value {
    let Some(window) = active_attention_window else {
        return item;
    };
    let match_count = proactive_attention_window_match_count(&item, window);
    item["attention_window_match_count"] = Value::from(match_count as u64);
    if let Some(expires_in_seconds) = window.get("expires_in_seconds").and_then(Value::as_u64) {
        item["attention_window_expires_in_seconds"] = Value::from(expires_in_seconds);
    }
    item
}

fn proactive_attention_window_match_count(item: &Value, window: &Value) -> usize {
    let source_refs = json_string_set(item.get("source_refs"));
    let object_refs = json_string_set(item.get("object_refs"));
    let thread_refs = json_string_set(item.get("thread_refs"));
    let file_refs = json_string_set(item.get("file_refs"));
    let mut match_count = intersection_count(&source_refs, window.get("source_refs"))
        + intersection_count(&object_refs, window.get("object_refs"))
        + intersection_count(&thread_refs, window.get("thread_refs"))
        + intersection_count(&file_refs, window.get("file_refs"));

    if let Some(memory_space) = item.get("memory_space").and_then(Value::as_str) {
        match_count += usize::from(
            window
                .get("memory_spaces")
                .and_then(Value::as_array)
                .map(|spaces| {
                    spaces
                        .iter()
                        .filter_map(Value::as_str)
                        .any(|space| space == memory_space)
                })
                .unwrap_or(false),
        );
    }

    match_count
}

fn json_string_set(value: Option<&Value>) -> HashSet<String> {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(str::to_string)
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default()
}

fn intersection_count(values: &HashSet<String>, window_values: Option<&Value>) -> usize {
    let Some(window_values) = window_values.and_then(Value::as_array) else {
        return 0;
    };
    window_values
        .iter()
        .filter_map(Value::as_str)
        .filter(|value| values.contains(*value))
        .count()
}

pub(super) fn filter_proactive_suggestions_by_preferences(
    suggestions: Vec<serde_json::Value>,
    prefs: &AgentPreferences,
) -> Vec<serde_json::Value> {
    suggestions
        .into_iter()
        .filter(|item| proactive_suggestion_allowed(item, prefs))
        .collect()
}

pub(super) fn prioritize_proactive_suggestions(
    suggestions: Vec<serde_json::Value>,
    continuity_priority_item: Option<&ContinuityPriorityItem>,
    continuity_priority_card: Option<&ContinuityPriorityCard>,
    prepared_draft_suggestion: Option<Value>,
    context_ready_suggestion: Option<Value>,
    context_pack_suggestion: Option<Value>,
    state_field_suggestion: Option<Value>,
    active_attention_window: Option<&Value>,
) -> Vec<serde_json::Value> {
    let mut suggestions = suggestions
        .into_iter()
        .map(|item| with_active_attention_window_hint(item, active_attention_window))
        .collect::<Vec<_>>();
    let has_prepared_draft_suggestion = prepared_draft_suggestion.is_some();
    let has_context_ready_suggestion = context_ready_suggestion.is_some();
    let has_context_pack_suggestion = context_pack_suggestion.is_some();
    if let Some(field_suggestion) = state_field_suggestion.filter(|field_suggestion| {
        should_surface_state_field_suggestion(
            field_suggestion,
            prepared_draft_suggestion.as_ref(),
            context_ready_suggestion.as_ref(),
            context_pack_suggestion.as_ref(),
        )
    }) {
        suggestions.insert(
            0,
            with_active_attention_window_hint(field_suggestion, active_attention_window),
        );
    }
    if let Some(pack_suggestion) = context_pack_suggestion {
        suggestions.insert(
            0,
            with_active_attention_window_hint(pack_suggestion, active_attention_window),
        );
    }
    if let Some(context_suggestion) = context_ready_suggestion {
        suggestions.insert(
            0,
            with_active_attention_window_hint(context_suggestion, active_attention_window),
        );
    }
    if let Some(draft_suggestion) = prepared_draft_suggestion {
        suggestions.insert(
            0,
            with_active_attention_window_hint(draft_suggestion, active_attention_window),
        );
    }
    if let Some(priority_item) = continuity_priority_item.filter(|priority_item| {
        should_surface_continuity_priority_suggestion(
            priority_item,
            continuity_priority_card,
            has_prepared_draft_suggestion,
            has_context_ready_suggestion,
            has_context_pack_suggestion,
        )
    }) {
        suggestions.insert(
            0,
            with_active_attention_window_hint(
                synthetic_continuity_priority_suggestion(priority_item, continuity_priority_card),
                active_attention_window,
            ),
        );
    }
    let continuity_action_intent =
        continuity_priority_item.and_then(|item| item.suggested_action.as_deref());
    suggestions
        .sort_by(|left, right| proactive_suggestion_cmp(left, right, continuity_action_intent));
    suggestions
}

fn should_surface_continuity_priority_suggestion(
    priority_item: &ContinuityPriorityItem,
    continuity_priority_card: Option<&ContinuityPriorityCard>,
    has_prepared_draft_suggestion: bool,
    has_context_ready_suggestion: bool,
    has_context_pack_suggestion: bool,
) -> bool {
    if priority_item.requires_approval {
        return true;
    }

    if priority_item.panel_kind == "response_queue"
        && priority_item.prepared_draft_class.is_some()
        && has_prepared_draft_suggestion
        && continuity_priority_card
            .map(|card| card.description.as_str() == "Prepared response is ready for review.")
            .unwrap_or(false)
    {
        return false;
    }

    if priority_item.panel_kind == "decision_queue"
        && priority_item.prepared_draft_class.is_some()
        && has_prepared_draft_suggestion
        && continuity_priority_card
            .map(|card| {
                card.description.as_str() == "Prepared decision support is ready for review."
            })
            .unwrap_or(false)
    {
        return false;
    }

    if priority_item.panel_kind == "context_panel"
        && continuity_priority_card
            .map(|card| card.description.as_str() == "Prepared context is ready for review.")
            .unwrap_or(false)
        && (has_context_ready_suggestion || has_context_pack_suggestion)
    {
        return false;
    }

    true
}

fn suggestion_surface_hint(item: &Value) -> Option<&str> {
    item.get("surface_hint")
        .and_then(Value::as_str)
        .or_else(|| item.get("destination_view").and_then(Value::as_str))
}

fn should_surface_state_field_suggestion(
    field_suggestion: &Value,
    prepared_draft_suggestion: Option<&Value>,
    context_ready_suggestion: Option<&Value>,
    context_pack_suggestion: Option<&Value>,
) -> bool {
    let field_key = field_suggestion
        .get("field_key")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if field_key == crate::state_fields::STATE_FIELD_APPROVAL_REQUIRED_WORK {
        return true;
    }

    let field_surface_hint = suggestion_surface_hint(field_suggestion).unwrap_or_default();
    if field_surface_hint.is_empty() {
        return true;
    }

    if prepared_draft_suggestion
        .and_then(suggestion_surface_hint)
        .is_some_and(|surface_hint| surface_hint == field_surface_hint)
    {
        return false;
    }

    if matches!(field_surface_hint, "context_panel")
        && (context_ready_suggestion
            .and_then(suggestion_surface_hint)
            .is_some_and(|surface_hint| surface_hint == field_surface_hint)
            || context_pack_suggestion
                .and_then(suggestion_surface_hint)
                .is_some_and(|surface_hint| surface_hint == field_surface_hint))
    {
        return false;
    }

    true
}

fn proactive_suggestion_cmp(
    left: &Value,
    right: &Value,
    continuity_action_intent: Option<&str>,
) -> std::cmp::Ordering {
    proactive_suggestion_rank(left, continuity_action_intent)
        .cmp(&proactive_suggestion_rank(right, continuity_action_intent))
        .then_with(|| {
            left.get("title")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .cmp(
                    &right
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or_default(),
                )
        })
}

fn proactive_suggestion_rank(
    item: &Value,
    continuity_action_intent: Option<&str>,
) -> crate::server::proactive_ranking_helpers::ProactiveSuggestionRank {
    let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();
    let requires_approval = item
        .get("requires_approval")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let readiness = item
        .get("readiness")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let confidence = item
        .get("confidence")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let draft_class = item
        .get("draft_class")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let field_key = item
        .get("field_key")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let pack_kind = item
        .get("pack_kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let due_hint = item
        .get("response_due_hint")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let reference_ref_count = item
        .get("reference_refs")
        .and_then(Value::as_array)
        .map(|refs| {
            refs.iter()
                .filter_map(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .count()
        })
        .unwrap_or(0);

    let kind_rank =
        crate::server::proactive_ranking_helpers::proactive_kind_rank(kind, requires_approval);
    let artifact_rank = crate::server::proactive_ranking_helpers::proactive_artifact_rank(
        kind,
        draft_class,
        pack_kind,
        field_key,
        &due_hint,
        requires_approval,
        STATE_FIELD_UNRESOLVED_DECISIONS,
    );
    let readiness_rank =
        crate::server::proactive_ranking_helpers::proactive_readiness_rank(readiness);
    let confidence_rank =
        crate::server::proactive_ranking_helpers::proactive_confidence_rank(confidence);
    let reference_rank = crate::server::proactive_ranking_helpers::proactive_reference_rank(
        kind,
        reference_ref_count,
    );
    let action_alignment_rank =
        proactive_suggestion_action_alignment_rank(item, continuity_action_intent);
    let scope_rank = proactive_suggestion_scope_rank(item);
    let value_signal_rank = proactive_suggestion_value_signal_rank(item);
    let file_rank = proactive_suggestion_file_rank(item);
    let evidence_rank = proactive_suggestion_evidence_rank(item);
    let grounding_rank = (file_rank, evidence_rank, reference_rank);
    let attention_window_rank = proactive_suggestion_attention_window_rank(item);
    let approval_rank =
        crate::server::proactive_ranking_helpers::proactive_approval_rank(requires_approval);
    let watcher_suppression_rank = watcher_suggestion_suppression_rank(item);

    (
        kind_rank,
        artifact_rank,
        action_alignment_rank,
        scope_rank,
        value_signal_rank,
        grounding_rank,
        attention_window_rank,
        watcher_suppression_rank,
        readiness_rank,
        confidence_rank,
        approval_rank,
    )
}

fn proactive_suggestion_file_rank(item: &Value) -> u8 {
    let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();
    if !matches!(
        kind,
        "prepared_draft" | "context_pack" | "continuity_priority"
    ) {
        return 1;
    }

    let file_ref_count = item
        .get("file_refs")
        .and_then(Value::as_array)
        .map(|refs| {
            refs.iter()
                .filter_map(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .count()
        })
        .unwrap_or(0);
    let file_label_count = item
        .get("file_labels")
        .and_then(Value::as_array)
        .map(|labels| {
            labels
                .iter()
                .filter_map(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .count()
        })
        .unwrap_or(0);

    crate::server::continuity_ranking_helpers::file_signal_rank(file_ref_count, file_label_count)
}

fn proactive_suggestion_evidence_rank(item: &Value) -> u8 {
    let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();
    if !matches!(
        kind,
        "prepared_draft" | "context_ready" | "context_pack" | "continuity_priority" | "state_field"
    ) {
        return 2;
    }

    let source_count = item
        .get("source_count")
        .and_then(Value::as_u64)
        .unwrap_or_else(|| {
            item.get("source_refs")
                .and_then(Value::as_array)
                .map(|refs| {
                    refs.iter()
                        .filter_map(Value::as_str)
                        .filter(|value| !value.trim().is_empty())
                        .count() as u64
                })
                .unwrap_or(0)
        });

    crate::server::continuity_ranking_helpers::source_count_evidence_rank(source_count as usize)
}

fn proactive_suggestion_attention_window_rank(item: &Value) -> u8 {
    let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();
    if !matches!(
        kind,
        "prepared_draft" | "context_ready" | "context_pack" | "continuity_priority" | "state_field"
    ) {
        return 3;
    }

    let match_count = item
        .get("attention_window_match_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    match match_count {
        0 => 3,
        1 => 2,
        2 => 1,
        _ => 0,
    }
}

fn proactive_suggestion_action_alignment_rank(
    item: &Value,
    continuity_action_intent: Option<&str>,
) -> u8 {
    let Some(intent) = continuity_action_intent else {
        return 1;
    };
    let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();
    if !matches!(
        kind,
        "prepared_draft" | "context_ready" | "context_pack" | "state_field"
    ) {
        return 1;
    }
    let suggested_action = item
        .get("suggested_action")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if suggested_action.is_empty() {
        return 1;
    }
    if suggested_actions_align(suggested_action, intent) {
        0
    } else {
        1
    }
}

fn proactive_suggestion_scope_rank(item: &Value) -> u8 {
    let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();
    if !matches!(
        kind,
        "prepared_draft" | "context_ready" | "context_pack" | "state_field"
    ) {
        return 1;
    }

    crate::server::continuity_ranking_helpers::prepared_draft_scope_rank(
        item.get("memory_space").and_then(Value::as_str),
        item.get("author_mask").and_then(Value::as_str),
        item.get("author_type").and_then(Value::as_str),
        item.get("author_id").and_then(Value::as_str),
        item.get("is_human_authored").and_then(Value::as_bool),
        item.get("human_only").and_then(Value::as_bool),
    )
}

fn proactive_suggestion_value_signal_rank(item: &Value) -> u8 {
    let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();
    if !matches!(
        kind,
        "prepared_draft" | "context_ready" | "context_pack" | "continuity_priority"
    ) {
        return 2;
    }

    let priority = item
        .get("priority")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let status = item
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let follow_up_at = item
        .get("follow_up_at")
        .and_then(Value::as_str)
        .or_else(|| item.get("response_due_hint").and_then(Value::as_str))
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();

    let priority_rank = crate::agent_template::TaskPriority::rank_value(&priority);
    let due_hint_rank = crate::timing_hints::due_hint_timing_rank(&follow_up_at);

    if priority_rank <= 1
        || matches!(status.as_str(), "active" | "trusted")
        || due_hint_is_immediate(&follow_up_at)
    {
        return 0;
    }

    if priority_rank == 2
        || matches!(status.as_str(), "ready" | "pending" | "monitor")
        || due_hint_rank <= 2
    {
        return 1;
    }

    2
}

fn suggested_actions_align(left: &str, right: &str) -> bool {
    let normalized_left = left.trim().to_ascii_lowercase();
    let normalized_right = right.trim().to_ascii_lowercase();
    if normalized_left.is_empty() || normalized_right.is_empty() {
        return false;
    }
    if normalized_left == normalized_right {
        return true;
    }

    let left_tokens = normalized_left
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect::<std::collections::BTreeSet<_>>();
    let right_tokens = normalized_right
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect::<std::collections::BTreeSet<_>>();
    if left_tokens.is_empty() || right_tokens.is_empty() {
        return false;
    }
    let overlap = left_tokens.intersection(&right_tokens).count();
    overlap >= 2
        || left_tokens
            .iter()
            .any(|token| token == &"reply" && right_tokens.contains("reply"))
}

fn watcher_suggestion_suppression_rank(item: &Value) -> u8 {
    let source_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
    if !matches!(source_type, "watcher_alert" | "smart_suggestion") {
        return 0;
    }

    let suppressed_until = item["metadata"]["emotional_decay"]["suppressed_until"]
        .as_str()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok());
    if suppressed_until.is_some_and(|until| until > chrono::Utc::now().fixed_offset()) {
        return 2;
    }

    let explanation = item["metadata"]["empathetic_explanation"]
        .as_str()
        .or_else(|| {
            item["views"]
                .get(0)
                .and_then(|view| view["props"]["empathetic_explanation"].as_str())
        })
        .unwrap_or_default()
        .to_lowercase();
    if explanation.contains("surfaced more carefully") {
        1
    } else {
        0
    }
}

fn due_hint_is_immediate(due_hint: &str) -> bool {
    crate::timing_hints::due_hint_is_immediate(due_hint)
}

fn prepared_draft_boundary_hint(
    draft_class: &str,
    requires_approval: bool,
    readiness: &str,
    response_due_hint: &str,
) -> Option<String> {
    crate::prepared_draft_semantics::prepared_draft_boundary_hint(
        draft_class,
        requires_approval,
        readiness,
        response_due_hint,
    )
}

fn prepared_draft_suggestion_from_item(
    item: &ContinuityPreparedDraftItem,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
    file_refs: &[String],
    file_labels: &[String],
) -> Value {
    let destination_view = prepared_draft_destination_view(&item.draft_class);
    let action_label = prepared_draft_action_label(&item.draft_class);
    let surface_hint = prepared_draft_surface_hint(destination_view);
    let thread_retrieval_state = thread_retrieval_state_from_refs(
        "prepared_draft",
        item.requires_approval,
        &item.source_refs,
        &[],
        &item.object_refs,
        &item.object_labels,
        file_refs,
        file_labels,
        None,
    );
    serde_json::json!({
        "id": format!("prepared-draft:{}", item.id),
        "kind": "prepared_draft",
        "draft_class": item.draft_class,
        "title": item.title,
        "description": item.summary,
        "body_preview": item.body,
        "channel": item.channel,
        "confidence": item.confidence,
        "readiness": item.readiness,
        "response_due_hint": item.response_due_hint,
        "follow_up_at": crate::prepared_draft_semantics::follow_up_proposal_from_draft_semantics(
            &item.draft_class,
            &item.response_due_hint,
        ),
        "requires_approval": item.requires_approval,
        "approval_or_reversibility_hint": prepared_draft_boundary_hint(
            &item.draft_class,
            item.requires_approval,
            &item.readiness,
            &item.response_due_hint,
        ),
        "selection_reason": prepared_draft_selection_reason_with_field_context(
            item.selection_reason.as_deref(),
            continuity_handoff,
        ),
        "destination_view": destination_view,
        "surface_hint": surface_hint,
        "suggested_action": item.suggested_action,
        "action_label": action_label,
        "artifact_summary_lines": prepared_draft_summary_lines_from_item_with_reason(item),
        "source_refs": item.source_refs,
        "source_count": item.source_refs.len(),
        "object_refs": item.object_refs,
        "object_labels": item.object_labels,
        "file_refs": file_refs,
        "file_labels": file_labels,
        "comparison_headers": item.comparison_headers,
        "comparison_rows": item.comparison_rows,
        "memory_space": item.memory_space,
        "author_mask": item.author_mask,
        "author_type": item.author_type,
        "author_id": item.author_id,
        "is_human_authored": item.is_human_authored,
        "human_only": item.human_only,
        "thread_retrieval_state": thread_retrieval_state,
    })
}

pub(super) fn prepared_draft_suggestion_from_state(
    prepared_draft_items: &[ContinuityPreparedDraftItem],
    continuity_state: Option<&DashboardContinuityMessage>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<Value> {
    let draft_file_refs = continuity_state
        .and_then(|state| match state.parsed_content.as_ref() {
            Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
                .prepared_context_packet
                .as_ref()
                .map(|packet| packet.file_refs.clone())
                .or_else(|| {
                    simulator_prepared_context_preview_from_state(state)
                        .map(|packet| packet.file_refs)
                }),
            Some(DashboardContinuityParsedContent::StateSynthesis(_)) | None => None,
        })
        .unwrap_or_default();
    let draft_file_labels = continuity_reference_labels(&draft_file_refs, continuity_state);
    if let Some(item) = prepared_draft_items
        .iter()
        .filter(|item| should_surface_prepared_draft_item_for_selector(item, continuity_handoff))
        .min_by(|left, right| {
            prepared_draft_alignment_rank(left, continuity_handoff, continuity_state).cmp(
                &prepared_draft_alignment_rank(right, continuity_handoff, continuity_state),
            )
        })
    {
        return Some(prepared_draft_suggestion_from_item(
            item,
            continuity_handoff,
            &draft_file_refs,
            &draft_file_labels,
        ));
    }

    let state = continuity_state?;
    let normalized_items = continuity_prepared_draft_items(Some(state));
    normalized_items
        .iter()
        .filter(|item| should_surface_prepared_draft_item_for_selector(item, continuity_handoff))
        .min_by(|left, right| {
            prepared_draft_alignment_rank(left, continuity_handoff, continuity_state).cmp(
                &prepared_draft_alignment_rank(right, continuity_handoff, continuity_state),
            )
        })
        .or_else(|| normalized_items.first())
        .map(|item| {
            prepared_draft_suggestion_from_item(
                item,
                continuity_handoff,
                &draft_file_refs,
                &draft_file_labels,
            )
        })
}

fn context_pack_suggestion_from_summary(
    continuity_summary: &DashboardContinuityStateResponse,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<Value> {
    let pack = selected_context_pack_item_from_summary(continuity_summary, continuity_handoff)?;
    Some(synthetic_context_pack_suggestion(pack))
}

fn selected_context_pack_item_from_summary<'a>(
    continuity_summary: &'a DashboardContinuityStateResponse,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<&'a ContinuityPreparedContextPackItem> {
    continuity_summary
        .preferred_context_pack_items
        .iter()
        .min_by(|left, right| {
            context_pack_alignment_rank(left, continuity_handoff)
                .cmp(&context_pack_alignment_rank(right, continuity_handoff))
        })
}

fn prepared_context_packet_from_state(
    continuity_state: Option<&DashboardContinuityMessage>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<PreparedContextPacket> {
    let handoff = continuity_handoff?;
    let state = continuity_state?;
    let snapshot = match state.parsed_content.as_ref()? {
        DashboardContinuityParsedContent::StateSnapshot(snapshot) => snapshot,
        DashboardContinuityParsedContent::StateSynthesis(_) => return None,
    };
    if handoff.prepared_context_ready {
        snapshot.prepared_context_packet.clone()
    } else {
        None
    }
    .filter(|packet| packet.ready)
    .or_else(|| simulator_prepared_context_preview_from_state(state).filter(|packet| packet.ready))
}

fn context_suggestion_uses_simulator_preview(
    continuity_state: Option<&DashboardContinuityMessage>,
) -> bool {
    let Some(state) = continuity_state else {
        return false;
    };
    let has_durable_packet = match state.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
            .prepared_context_packet
            .as_ref()
            .map(|packet| packet.ready)
            .unwrap_or(false),
        _ => false,
    };
    !has_durable_packet
        && simulator_prepared_context_preview_from_state(state)
            .map(|packet| packet.ready)
            .unwrap_or(false)
}

pub(super) fn context_ready_suggestion_from_state(
    continuity_state: Option<&DashboardContinuityMessage>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<Value> {
    let handoff = continuity_handoff?;
    let state = continuity_state?;
    let packet = prepared_context_packet_from_state(continuity_state, continuity_handoff)?;
    let object_labels = crate::server::continuity_routes::continuity_reference_labels(
        &packet.object_refs,
        Some(state),
    );
    Some(synthetic_context_ready_suggestion(
        &packet,
        &object_labels,
        handoff,
    ))
}

fn simulator_rollout_summary_from_state(state: &DashboardContinuityMessage) -> Option<&Value> {
    state
        .metadata
        .get("simulator_rollout_summary")
        .filter(|value| value.is_object())
}

fn simulator_calibration_summary_from_state(state: &DashboardContinuityMessage) -> Option<&Value> {
    state
        .metadata
        .get("simulator_calibration_summary")
        .filter(|value| value.is_object())
}

fn simulator_rollout_stage_from_sources(
    rollout: Option<&Value>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<String> {
    rollout
        .and_then(|value| {
            value
                .get("rollout_stage")
                .or_else(|| value.get("stage"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            continuity_handoff
                .and_then(|handoff| handoff.simulated_rollout_stage.as_deref())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn simulator_calibration_mode_from_sources(
    calibration: Option<&Value>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<String> {
    calibration
        .and_then(|value| {
            value
                .get("confidence_posture")
                .or_else(|| value.get("calibration_mode"))
                .or_else(|| value.get("mode"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            continuity_handoff
                .and_then(|handoff| handoff.simulated_calibration_mode.as_deref())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn simulator_review_summary_from_sources(
    rollout: Option<&Value>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<String> {
    rollout
        .and_then(|value| {
            value
                .get("policy_summary")
                .or_else(|| value.get("review_summary"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            continuity_handoff
                .and_then(|handoff| handoff.simulated_review_summary.as_deref())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn simulator_calibration_notes_from_sources(
    calibration: Option<&Value>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Vec<String> {
    let metadata_notes = calibration
        .and_then(|value| value.get("calibration_notes"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !metadata_notes.is_empty() {
        return metadata_notes;
    }
    continuity_handoff
        .map(|handoff| {
            handoff
                .simulated_calibration_notes
                .iter()
                .map(|item| item.trim())
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn simulator_rollout_summary_line_from_sources(
    rollout: Option<&Value>,
    calibration: Option<&Value>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<String> {
    let stage = simulator_rollout_stage_from_sources(rollout, continuity_handoff)?;
    let calibration_mode = simulator_calibration_mode_from_sources(calibration, continuity_handoff);
    Some(match calibration_mode {
        Some(mode) => format!(
            "Simulator rollout stage: {}. Calibration mode: {}.",
            stage.replace('_', " "),
            mode.replace('_', " ")
        ),
        None => format!("Simulator rollout stage: {}.", stage.replace('_', " ")),
    })
}

fn simulator_review_surface_for_target_from_state<'a>(
    state: &'a DashboardContinuityMessage,
    target_kind: &str,
) -> Option<&'a Value> {
    state
        .metadata
        .get("simulator_promotions")
        .and_then(Value::as_array)
        .and_then(|promotions| {
            promotions.iter().find(|promotion| {
                promotion
                    .get("target_kind")
                    .and_then(Value::as_str)
                    .map(|value| value == target_kind)
                    .unwrap_or(false)
            })
        })
        .and_then(|promotion| promotion.get("review_surface"))
        .filter(|value| value.is_object())
}

fn simulator_rollout_summary_line(
    rollout: Option<&Value>,
    calibration: Option<&Value>,
) -> Option<String> {
    let stage = rollout
        .and_then(|value| value.get("rollout_stage").or_else(|| value.get("stage")))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())?;
    let calibration_mode = calibration
        .and_then(|value| {
            value
                .get("confidence_posture")
                .or_else(|| value.get("calibration_mode"))
                .or_else(|| value.get("mode"))
        })
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());
    Some(match calibration_mode {
        Some(mode) => format!(
            "Simulator rollout stage: {}. Calibration mode: {}.",
            stage.replace('_', " "),
            mode.replace('_', " ")
        ),
        None => format!("Simulator rollout stage: {}.", stage.replace('_', " ")),
    })
}

pub(super) fn simulator_reversible_preview_suggestion_from_state(
    continuity_state: Option<&DashboardContinuityMessage>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<Value> {
    let state = continuity_state?;
    let preview = simulator_reversible_action_preview_from_state(state)?;
    let rollout = simulator_rollout_summary_from_state(state);
    let calibration = simulator_calibration_summary_from_state(state);
    let review_surface = simulator_review_surface_for_target_from_state(state, "reversible_action");
    let preview_boundary_summary = review_surface
        .and_then(|surface| surface.get("boundary_summary"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Bounded simulator preview only. This stays inside reversible execution pathways and does not execute external work.");
    let persistence_reason = review_surface
        .and_then(|surface| surface.get("persistence_reason"))
        .and_then(Value::as_str);
    let provenance_cue = review_surface
        .and_then(|surface| surface.get("provenance_summary"))
        .and_then(Value::as_str);
    let source_summary = review_surface
        .and_then(|surface| surface.get("source_summary"))
        .and_then(Value::as_str);
    let review_surface_available = review_surface
        .and_then(|surface| surface.get("review_available"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !review_surface_available {
        return None;
    }
    let rollout_stage = simulator_rollout_stage_from_sources(rollout, continuity_handoff);
    let calibration_mode = simulator_calibration_mode_from_sources(calibration, continuity_handoff);
    let rollout_summary =
        simulator_rollout_summary_line_from_sources(rollout, calibration, continuity_handoff);
    let review_summary = simulator_review_summary_from_sources(rollout, continuity_handoff);
    let calibration_notes =
        simulator_calibration_notes_from_sources(calibration, continuity_handoff);
    let action_afp = preview.get("action_afp")?;
    let action_content = action_afp.get("content").unwrap_or(&Value::Null);
    let title = action_content
        .get("title")
        .or_else(|| action_content.get("summary"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Review reversible simulator preview");
    let description = action_content
        .get("summary")
        .or_else(|| action_content.get("description"))
        .and_then(Value::as_str)
        .unwrap_or("Bounded simulator projection prepared a reversible internal preview.");
    let source_refs = action_content
        .get("source_refs")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let heuristic_family_id = simulator_review_heuristic_family_id("reversible");
    let heuristic_id = simulator_review_heuristic_id("reversible", title, &source_refs);
    let mut artifact_summary_lines = vec![description.to_string()];
    if let Some(summary) = review_summary.clone() {
        artifact_summary_lines.push(summary);
    }
    if let Some(note) = calibration_notes.first() {
        artifact_summary_lines.push(note.clone());
    }
    artifact_summary_lines.truncate(3);
    Some(json!({
        "id": "simulator:reversible_preview",
        "kind": "simulator_reversible_preview",
        "heuristic_id": heuristic_id,
        "heuristic_family_id": heuristic_family_id,
        "title": title,
        "description": description,
        "suggested_action": "Inspect reversible simulator preview",
        "action_label": "Review reversible preview",
        "confidence": "medium",
        "requires_approval": false,
        "destination_view": continuity_handoff
            .map(|handoff| handoff.surface_recommendation.clone())
            .unwrap_or_else(|| "decision_queue".to_string()),
        "surface_hint": continuity_handoff
            .map(|handoff| handoff.surface_recommendation.clone())
            .unwrap_or_else(|| "decision_queue".to_string()),
        "preview_only": true,
        "preview_boundary_summary": preview_boundary_summary,
        "approval_or_reversibility_hint": "Stays inside reversible execution pathways until explicitly confirmed.",
        "artifact_summary_lines": artifact_summary_lines,
        "source_refs": source_refs,
        "source_count": source_refs.len(),
        "persisted_from_continuity": true,
        "persistence_reason": persistence_reason,
        "provenance_cue": provenance_cue,
        "source_summary": source_summary,
        "review_surface_available": review_surface_available,
        "review_summary": review_summary,
        "calibration_notes": calibration_notes,
        "rollout_summary": rollout_summary,
        "rollout_stage": rollout_stage,
        "calibration_mode": calibration_mode,
    }))
}

pub(super) fn simulator_approval_preview_suggestion_from_state(
    continuity_state: Option<&DashboardContinuityMessage>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<Value> {
    let state = continuity_state?;
    let review = simulator_approval_review_preview_from_state(state)?;
    let rollout = simulator_rollout_summary_from_state(state);
    let calibration = simulator_calibration_summary_from_state(state);
    let review_surface = simulator_review_surface_for_target_from_state(state, "approval_required");
    let preview_boundary_summary = review_surface
        .and_then(|surface| surface.get("boundary_summary"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(
            "Bounded simulator preview only. This remains approval-gated and does not execute external work.",
        );
    let persistence_reason = review_surface
        .and_then(|surface| surface.get("persistence_reason"))
        .and_then(Value::as_str);
    let provenance_cue = review_surface
        .and_then(|surface| surface.get("provenance_summary"))
        .and_then(Value::as_str);
    let source_summary = review_surface
        .and_then(|surface| surface.get("source_summary"))
        .and_then(Value::as_str);
    let review_surface_available = review_surface
        .and_then(|surface| surface.get("review_available"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !review_surface_available {
        return None;
    }
    let rollout_stage = simulator_rollout_stage_from_sources(rollout, continuity_handoff);
    let calibration_mode = simulator_calibration_mode_from_sources(calibration, continuity_handoff);
    let rollout_summary =
        simulator_rollout_summary_line_from_sources(rollout, calibration, continuity_handoff);
    let review_summary = simulator_review_summary_from_sources(rollout, continuity_handoff);
    let calibration_notes =
        simulator_calibration_notes_from_sources(calibration, continuity_handoff);
    let title = review
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Review simulator approval preview");
    let reason = review
        .get("reason")
        .and_then(Value::as_str)
        .unwrap_or("Bounded simulator projection found an approval-gated path.");
    let summary_lines = review
        .get("consequence_summary_lines")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let _draft_preview_lines = review
        .get("draft_preview")
        .and_then(Value::as_object)
        .and_then(|preview| preview.get("content"))
        .and_then(Value::as_str)
        .map(|content| {
            content
                .split(" • ")
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let draft_preview_lines = review
        .get("draft_preview")
        .map(approval_draft_preview_lines)
        .unwrap_or_default();
    let source_refs = review
        .get("source_refs")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let heuristic_family_id = simulator_review_heuristic_family_id("approval");
    let heuristic_id = simulator_review_heuristic_id("approval", title, &source_refs);
    let mut artifact_summary_lines = if !draft_preview_lines.is_empty() {
        draft_preview_lines.clone()
    } else if summary_lines.is_empty() {
        vec![reason.to_string()]
    } else {
        summary_lines.clone()
    };
    if let Some(summary) = review_summary.clone() {
        artifact_summary_lines.push(summary);
    }
    if let Some(note) = calibration_notes.first() {
        artifact_summary_lines.push(note.clone());
    }
    artifact_summary_lines.truncate(3);
    Some(json!({
        "id": "simulator:approval_preview",
        "kind": "simulator_approval_preview",
        "heuristic_id": heuristic_id,
        "heuristic_family_id": heuristic_family_id,
        "title": title,
        "description": reason,
        "suggested_action": "Inspect approval simulator preview",
        "action_label": "Review approval preview",
        "confidence": review.get("confidence").and_then(Value::as_str).unwrap_or("high"),
        "requires_approval": true,
        "destination_view": continuity_handoff
            .map(|handoff| handoff.surface_recommendation.clone())
            .unwrap_or_else(|| "decision_queue".to_string()),
        "surface_hint": continuity_handoff
            .map(|handoff| handoff.surface_recommendation.clone())
            .unwrap_or_else(|| "decision_queue".to_string()),
        "preview_only": true,
        "preview_boundary_summary": preview_boundary_summary,
        "approval_or_reversibility_hint": "Remains approval-gated; no external action runs from the simulator preview.",
        "artifact_summary_lines": artifact_summary_lines,
        "source_refs": source_refs,
        "source_count": source_refs.len(),
        "approval_kind": review.get("approval_kind").cloned().unwrap_or(Value::Null),
        "draft_preview": review.get("draft_preview").cloned().unwrap_or(Value::Null),
        "persisted_from_continuity": true,
        "persistence_reason": persistence_reason,
        "provenance_cue": provenance_cue,
        "source_summary": source_summary,
        "review_surface_available": review_surface_available,
        "review_summary": review_summary,
        "calibration_notes": calibration_notes,
        "rollout_summary": rollout_summary,
        "rollout_stage": rollout_stage,
        "calibration_mode": calibration_mode,
    }))
}

pub(super) fn synthetic_continuity_priority_suggestion(
    priority_item: &ContinuityPriorityItem,
    continuity_priority_card: Option<&ContinuityPriorityCard>,
) -> Value {
    let thread_retrieval_state = continuity_priority_card
        .and_then(|card| card.thread_retrieval_state.clone())
        .or_else(|| {
            thread_retrieval_state_from_refs(
                "continuity_priority",
                priority_item.requires_approval,
                &priority_item.source_refs,
                &[],
                continuity_priority_card
                    .map(|card| card.object_refs.as_slice())
                    .unwrap_or(&[]),
                continuity_priority_card
                    .map(|card| card.object_labels.as_slice())
                    .unwrap_or(&[]),
                continuity_priority_card
                    .map(|card| card.file_refs.as_slice())
                    .unwrap_or(&[]),
                continuity_priority_card
                    .map(|card| card.file_labels.as_slice())
                    .unwrap_or(&[]),
                None,
            )
        });
    let mut artifact_summary_lines = Vec::new();
    if let Some(reason) = priority_item.selection_reason.as_ref() {
        artifact_summary_lines.push(reason.clone());
    }
    if let Some(reason) = continuity_priority_card
        .and_then(|card| card.readiness_reason.as_ref())
        .filter(|reason| !reason.trim().is_empty())
    {
        artifact_summary_lines.push(reason.clone());
    }
    if let Some(retrieval_mode) = continuity_priority_card
        .and_then(|card| card.retrieval_mode.as_deref())
        .filter(|mode| !mode.trim().is_empty())
    {
        let retrieval_summary = if continuity_priority_card
            .map(|card| card.deeper_retrieval_recommended)
            .unwrap_or(false)
        {
            format!("{retrieval_mode} with deeper retrieval recommended.")
        } else {
            format!("{retrieval_mode} ready.")
        };
        artifact_summary_lines.push(retrieval_summary);
    }
    if let Some(card) = continuity_priority_card {
        if card.topology_budget_used > 0 {
            artifact_summary_lines.push(format!(
                "Topology budget used: {}",
                card.topology_budget_used
            ));
        }
        if card.working_set_count > 0 {
            artifact_summary_lines.push(format!("Working set refs: {}", card.working_set_count));
        }
        if card.active_topic_count > 0 {
            artifact_summary_lines
                .push(format!("Active topic anchors: {}", card.active_topic_count));
        }
    }
    if let Some(scope_line) = proactive_scope_summary_line(
        priority_item.memory_space.as_deref(),
        priority_item.author_type.as_deref(),
        priority_item.is_human_authored,
        priority_item.human_only,
    ) {
        artifact_summary_lines.push(scope_line);
    }
    serde_json::json!({
        "id": format!("continuity-priority:{}", priority_item.panel_kind),
        "kind": "continuity_priority",
        "title": priority_item.title,
        "panel_kind": priority_item.panel_kind,
        "destination_view": priority_item.panel_kind,
        "requires_approval": priority_item.requires_approval,
        "surface_hint": priority_item.surface_hint,
        "suggested_action": priority_item.suggested_action,
        "action_label": "Open priority",
        "confidence": priority_item.confidence,
        "draft_class": priority_item.prepared_draft_class,
        "selection_reason": priority_item.selection_reason,
        "retrieval_mode": continuity_priority_card
            .and_then(|card| card.retrieval_mode.clone()),
        "deeper_retrieval_recommended": continuity_priority_card
            .map(|card| card.deeper_retrieval_recommended)
            .unwrap_or(false),
        "readiness_reason": continuity_priority_card
            .and_then(|card| card.readiness_reason.clone()),
        "topology_budget_used": continuity_priority_card
            .map(|card| card.topology_budget_used)
            .unwrap_or(0),
        "working_set_count": continuity_priority_card
            .map(|card| card.working_set_count)
            .unwrap_or(0),
        "active_topic_count": continuity_priority_card
            .map(|card| card.active_topic_count)
            .unwrap_or(0),
        "working_set_refs": continuity_priority_card
            .map(|card| card.working_set_refs.clone())
            .unwrap_or_default(),
        "active_topic_refs": continuity_priority_card
            .map(|card| card.active_topic_refs.clone())
            .unwrap_or_default(),
        "decision_history_refs": continuity_priority_card
            .map(|card| card.decision_history_refs.clone())
            .unwrap_or_default(),
        "project_refs": continuity_priority_card
            .map(|card| card.project_refs.clone())
            .unwrap_or_default(),
        "thread_refs": continuity_priority_card
            .map(|card| card.thread_refs.clone())
            .unwrap_or_default(),
        "artifact_summary_lines": artifact_summary_lines,
        "source_refs": priority_item.source_refs,
        "memory_space": priority_item.memory_space,
        "author_mask": priority_item.author_mask,
        "author_type": priority_item.author_type,
        "author_id": priority_item.author_id,
        "is_human_authored": priority_item.is_human_authored,
        "human_only": priority_item.human_only,
        "linked_target_label": continuity_priority_card
            .and_then(|card| card.linked_target_label.clone()),
        "object_refs": continuity_priority_card
            .map(|card| card.object_refs.clone())
            .unwrap_or_default(),
        "object_labels": continuity_priority_card
            .map(|card| card.object_labels.clone())
            .unwrap_or_default(),
        "file_refs": continuity_priority_card
            .map(|card| card.file_refs.clone())
            .unwrap_or_default(),
        "file_labels": continuity_priority_card
            .map(|card| card.file_labels.clone())
            .unwrap_or_default(),
        "thread_retrieval_state": thread_retrieval_state,
    })
}

pub(super) fn synthetic_context_pack_suggestion(pack: &ContinuityPreparedContextPackItem) -> Value {
    let thread_retrieval_state = pack.thread_retrieval_state.clone().or_else(|| {
        thread_retrieval_state_from_refs(
            "context_pack",
            false,
            &pack.source_refs,
            &pack.reference_refs,
            &pack.object_refs,
            &pack.object_labels,
            &pack.file_refs,
            &pack.file_labels,
            None,
        )
    });
    serde_json::json!({
        "id": format!("context-pack:{}", pack.id),
        "kind": "context_pack",
        "heuristic_id": context_pack_heuristic_id(pack),
        "heuristic_family_id": context_pack_heuristic_family_id(pack),
        "pack_id": pack.id,
        "pack_kind": pack.pack_kind,
        "is_pack_suggestion": true,
        "title": pack.title,
        "description": pack.summary,
        "confidence": pack.confidence,
        "destination_view": "home",
        "surface_hint": "context_panel",
        "action_label": "Open workspace",
        "selection_reason": pack.why_surfaced,
        "retrieval_mode": pack.retrieval_mode,
        "deeper_retrieval_recommended": pack.deeper_retrieval_recommended,
        "readiness_reason": pack.readiness_reason,
        "topology_budget_used": pack.topology_budget_used,
        "working_set_count": pack.working_set_count,
        "active_topic_count": pack.active_topic_count,
        "artifact_summary_lines": context_pack_summary_lines(pack),
        "source_refs": pack.source_refs,
        "source_count": pack.source_refs.len(),
        "reference_refs": pack.reference_refs,
        "reference_labels": pack.reference_labels,
        "object_refs": pack.object_refs,
        "object_labels": pack.object_labels,
        "file_refs": pack.file_refs,
        "file_labels": pack.file_labels,
        "anchor_refs": pack.anchor_refs,
        "evidence_kinds": pack.evidence_kinds,
        "memory_space": pack.memory_space,
        "author_mask": pack.author_mask,
        "author_type": pack.author_type,
        "author_id": pack.author_id,
        "is_human_authored": pack.is_human_authored,
        "human_only": pack.human_only,
        "thread_retrieval_state": thread_retrieval_state,
    })
}

fn context_ready_summary_lines(
    packet: &crate::prepared_context_packet::PreparedContextPacket,
    object_labels: &[String],
) -> Vec<String> {
    let mut lines = vec![packet.summary.clone()];
    lines.extend(context_summary_detail_lines(
        packet.memory_space.as_deref(),
        packet.author_type.as_deref(),
        packet.is_human_authored,
        packet.human_only,
        None,
        &[],
        &[],
        object_labels,
        &packet.object_refs,
        &[],
        &packet.file_refs,
    ));
    if let Some(file_line) = crate::server::summary_helpers::counted_item_line(
        "Includes",
        packet.file_refs.len(),
        "linked file reference",
        "linked file references",
        true,
    ) {
        lines.push(file_line);
    }
    if let Some(decision_history_line) = crate::server::summary_helpers::counted_item_line(
        "Carries",
        packet.decision_history_refs.len(),
        "decision-history reference",
        "decision-history references",
        true,
    ) {
        lines.push(decision_history_line);
    }
    if let Some(object_anchor_line) = crate::server::summary_helpers::reference_summary_line(
        "Object anchors",
        object_labels,
        &packet.object_refs,
        None,
        false,
    ) {
        lines.push(object_anchor_line);
    }
    lines
}

fn context_summary_detail_lines(
    memory_space: Option<&str>,
    author_type: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
    evidence_kinds: Option<&[String]>,
    reference_labels: &[String],
    reference_refs: &[String],
    object_labels: &[String],
    object_refs: &[String],
    file_labels: &[String],
    file_refs: &[String],
) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(scope_line) =
        proactive_scope_summary_line(memory_space, author_type, is_human_authored, human_only)
    {
        lines.push(scope_line);
    }
    if let Some(evidence_kinds) = evidence_kinds.filter(|values| !values.is_empty()) {
        if let Some(evidence_line) =
            crate::server::summary_helpers::list_summary_line("Evidence", evidence_kinds, false)
        {
            lines.push(evidence_line);
        }
    }
    if let Some(reference_line) = crate::server::summary_helpers::reference_summary_line(
        "Linked objects",
        reference_labels,
        reference_refs,
        None,
        false,
    ) {
        lines.push(reference_line);
    }
    if let Some(object_anchor_line) = crate::server::summary_helpers::reference_summary_line(
        "Object anchors",
        object_labels,
        object_refs,
        None,
        false,
    ) {
        lines.push(object_anchor_line);
    }
    if let Some(file_anchor_line) = crate::server::summary_helpers::reference_summary_line(
        "File anchors",
        file_labels,
        file_refs,
        None,
        false,
    ) {
        lines.push(file_anchor_line);
    }
    lines
}

fn proactive_scope_summary_line(
    memory_space: Option<&str>,
    author_type: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
) -> Option<String> {
    crate::server::scope_helpers::scope_summary_line(
        memory_space,
        author_type,
        is_human_authored,
        human_only,
    )
}

fn proactive_follow_up_timing_summary_line(
    follow_up_at: Option<&str>,
    existing_summary: Option<&str>,
) -> Option<String> {
    crate::prepared_draft_semantics::follow_up_timing_summary_line_unless_present(
        follow_up_at,
        existing_summary,
    )
}

fn synthetic_context_ready_suggestion(
    packet: &crate::prepared_context_packet::PreparedContextPacket,
    object_labels: &[String],
    continuity_handoff: &SynthesizerToMasterHandoff,
) -> Value {
    let thread_retrieval_state = thread_retrieval_state_from_refs(
        "context_ready",
        false,
        &packet.source_refs,
        &packet.reference_refs,
        &packet.object_refs,
        object_labels,
        &packet.file_refs,
        &[],
        None,
    );
    serde_json::json!({
        "id": "context-ready:prepared-context",
        "kind": "context_ready",
        "heuristic_id": context_ready_heuristic_id(packet, continuity_handoff),
        "heuristic_family_id": context_ready_heuristic_family_id(),
        "title": "Prepared context ready",
        "description": continuity_handoff
            .prepared_context_summary
            .clone()
            .unwrap_or_else(|| packet.summary.clone()),
        "confidence": continuity_handoff.confidence,
        "readiness": "ready_now",
        "requires_approval": false,
        "approval_or_reversibility_hint": "Opening this reveals prepared context only; it does not execute a side effect.",
        "destination_view": "home",
        "surface_hint": continuity_handoff.surface_recommendation.clone(),
        "suggested_action": "Review prepared context",
        "action_label": "Open workspace",
        "selection_reason": field_engine_selection_reason(Some(continuity_handoff))
            .unwrap_or_else(|| "Prepared context is already assembled from current continuity.".to_string()),
        "artifact_summary_lines": context_ready_summary_lines(packet, object_labels),
        "source_refs": packet.source_refs,
        "source_count": packet.source_refs.len(),
        "working_set_refs": packet.working_set_refs,
        "active_topic_refs": packet.active_topic_refs,
        "reference_refs": packet.reference_refs,
        "decision_history_refs": packet.decision_history_refs,
        "project_refs": packet.project_refs,
        "object_refs": packet.object_refs,
        "object_labels": object_labels,
        "thread_refs": packet.thread_refs,
        "anchor_refs": packet.anchor_refs,
        "file_refs": packet.file_refs,
        "memory_space": packet.memory_space,
        "author_mask": packet.author_mask,
        "author_type": packet.author_type,
        "author_id": packet.author_id,
        "is_human_authored": packet.is_human_authored,
        "human_only": packet.human_only,
        "evidence_kinds": packet
            .packs
            .iter()
            .flat_map(|pack| pack.evidence_kinds.iter().cloned())
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>(),
        "thread_retrieval_state": thread_retrieval_state,
    })
}

fn context_pack_item_to_prepared_context_packet(
    item: &ContinuityPreparedContextPackItem,
) -> PreparedContextPacket {
    PreparedContextPacket {
        packet_kind: PREPARED_CONTEXT_KIND_CONTINUITY.to_string(),
        ready: true,
        summary: item.summary.clone(),
        retrieval_mode: item.retrieval_mode.clone().unwrap_or_else(|| {
            crate::prepared_context_packet::PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST
                .to_string()
        }),
        deeper_retrieval_recommended: item.deeper_retrieval_recommended,
        readiness_reason: item.readiness_reason.clone(),
        anchor_refs: item.anchor_refs.clone(),
        working_set_refs: item
            .source_refs
            .iter()
            .take(item.working_set_count.max(1) as usize)
            .cloned()
            .collect(),
        active_topic_refs: item
            .object_refs
            .iter()
            .chain(item.reference_refs.iter())
            .take(item.active_topic_count.max(1) as usize)
            .cloned()
            .collect(),
        source_refs: item.source_refs.clone(),
        reference_refs: item.reference_refs.clone(),
        object_refs: item.object_refs.clone(),
        file_refs: item.file_refs.clone(),
        topology_budget_used: item.topology_budget_used,
        packs: vec![PreparedContextPack {
            pack_id: item.id.clone(),
            pack_kind: item.pack_kind.clone(),
            title: item.title.clone(),
            summary: item.summary.clone(),
            confidence: item.confidence.clone(),
            why_surfaced: item.why_surfaced.clone(),
            anchor_refs: item.anchor_refs.clone(),
            source_refs: item.source_refs.clone(),
            reference_refs: item.reference_refs.clone(),
            object_refs: item.object_refs.clone(),
            file_refs: item.file_refs.clone(),
            file_labels: item.file_labels.clone(),
            evidence_kinds: item.evidence_kinds.clone(),
            memory_space: item.memory_space.clone(),
            author_mask: item.author_mask.clone(),
            author_type: item.author_type.clone(),
            author_id: item.author_id.clone(),
            is_human_authored: item.is_human_authored,
            human_only: item.human_only,
        }],
        memory_space: item.memory_space.clone(),
        author_mask: item.author_mask.clone(),
        author_type: item.author_type.clone(),
        author_id: item.author_id.clone(),
        is_human_authored: item.is_human_authored,
        human_only: item.human_only,
        ..PreparedContextPacket::default()
    }
}

fn proactive_action_payload_from_prepared_context_packet(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    packet: &PreparedContextPacket,
    simulator_promoted: bool,
) -> Value {
    let mut afp = build_prepared_context_ledger_afp(owner_user_id, thread_id, parent_id, packet);
    if simulator_promoted {
        afp["metadata"]["simulator_preview_promoted"] = Value::Bool(true);
        afp["metadata"]["context_origin"] =
            Value::String("simulator_prepared_context_preview".to_string());
    }
    afp
}

fn proactive_action_payload_from_context_pack_item(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    item: &ContinuityPreparedContextPackItem,
    simulator_promoted: bool,
) -> Value {
    let packet = context_pack_item_to_prepared_context_packet(item);
    let mut afp = proactive_action_payload_from_prepared_context_packet(
        owner_user_id,
        thread_id,
        parent_id,
        &packet,
        simulator_promoted,
    );
    afp["metadata"]["context_origin"] = Value::String(if simulator_promoted {
        "simulator_prepared_context_preview".to_string()
    } else {
        "continuity_context_pack".to_string()
    });
    afp["metadata"]["context_pack_kind"] = Value::String(item.pack_kind.clone());
    afp
}

fn context_pack_summary_lines(item: &ContinuityPreparedContextPackItem) -> Vec<String> {
    let mut lines = vec![item.why_surfaced.clone()];
    if let Some(reason) = item.readiness_reason.as_ref() {
        lines.push(reason.clone());
    }
    if let Some(retrieval_mode) = item
        .retrieval_mode
        .as_deref()
        .map(str::trim)
        .filter(|mode| !mode.is_empty())
    {
        lines.push(if item.deeper_retrieval_recommended {
            format!(
                "Retrieval mode: {} with selective deepening recommended.",
                retrieval_mode.replace('_', "-")
            )
        } else {
            format!("Retrieval mode: {}.", retrieval_mode.replace('_', "-"))
        });
    }
    lines.extend(context_summary_detail_lines(
        item.memory_space.as_deref(),
        item.author_type.as_deref(),
        item.is_human_authored,
        item.human_only,
        Some(&item.evidence_kinds),
        &item.reference_labels,
        &item.reference_refs,
        &item.object_labels,
        &item.object_refs,
        &item.file_labels,
        &item.file_refs,
    ));
    if item.topology_budget_used > 0 {
        lines.push(format!(
            "Topology budget used: {} related context item{}.",
            item.topology_budget_used,
            if item.topology_budget_used == 1 {
                ""
            } else {
                "s"
            }
        ));
    }
    lines
}

fn synthetic_prepared_draft_suggestion(
    draft: &PreparedDraftArtifact,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
    file_refs: &[String],
    file_labels: &[String],
) -> Value {
    let destination_view = prepared_draft_destination_view(&draft.draft_class);
    let action_label = prepared_draft_action_label(&draft.draft_class);
    let surface_hint = prepared_draft_surface_hint(destination_view);
    let thread_retrieval_state = thread_retrieval_state_from_refs(
        "prepared_draft",
        draft.approval_required_to_send,
        &draft.source_refs,
        &[],
        &draft.object_refs,
        &[],
        file_refs,
        file_labels,
        None,
    );
    serde_json::json!({
        "id": format!("prepared-draft:{}", draft.draft_id),
        "kind": "prepared_draft",
        "draft_class": draft.draft_class,
        "title": draft.label,
        "description": draft.summary,
        "body_preview": draft.body,
        "channel": draft.channel,
        "confidence": draft.confidence,
        "readiness": draft.readiness,
        "response_due_hint": draft.response_due_hint,
        "follow_up_at": crate::prepared_draft_semantics::follow_up_proposal_from_draft_semantics(
            &draft.draft_class,
            &draft.response_due_hint,
        ),
        "requires_approval": draft.approval_required_to_send,
        "approval_or_reversibility_hint": prepared_draft_boundary_hint(
            &draft.draft_class,
            draft.approval_required_to_send,
            &draft.readiness,
            &draft.response_due_hint,
        ),
        "selection_reason": prepared_draft_selection_reason_with_field_context(
            draft.selection_reason.as_deref(),
            continuity_handoff,
        ),
        "destination_view": destination_view,
        "surface_hint": surface_hint,
        "suggested_action": draft.suggested_next_action,
        "action_label": action_label,
        "artifact_summary_lines": prepared_draft_summary_lines_with_reason(draft),
        "source_refs": draft.source_refs,
        "source_count": draft.source_count,
        "object_refs": draft.object_refs,
        "file_refs": file_refs,
        "file_labels": file_labels,
        "storage_type": draft.storage_type,
        "storage_kind": draft.storage_kind,
        "memory_space": draft.memory_space,
        "author_mask": draft.author_mask,
        "author_type": draft.author_type,
        "author_id": draft.author_id,
        "is_human_authored": draft.is_human_authored,
        "human_only": draft.human_only,
        "comparison_headers": draft.comparison_headers,
        "comparison_rows": draft.comparison_rows,
        "thread_retrieval_state": thread_retrieval_state,
    })
}

fn synthetic_state_field_suggestion(field: &ContinuityStateFieldItem) -> Value {
    synthetic_state_field_suggestion_with_state(field, None)
}

fn synthetic_state_field_suggestion_with_state(
    field: &ContinuityStateFieldItem,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Value {
    let requires_approval = field.autonomy_level == "request_approval";
    let destination_view = match field.surface_hint.as_str() {
        "decision_queue" => "decision_queue",
        "response_queue" => "response_queue",
        "context_panel" => "context_panel",
        _ => "home",
    };
    let action_label = if requires_approval {
        "Review required"
    } else {
        match destination_view {
            "decision_queue" => "Open decision queue",
            "response_queue" => "Open responses",
            "context_panel" => "Open context",
            _ => "Open workspace",
        }
    };
    let selection_reason = state_field_selection_reason(field, preferred_state);
    serde_json::json!({
        "id": format!("state-field:{}", field.field_key),
        "kind": "state_field",
        "field_key": field.field_key,
        "title": field.label,
        "description": field.reason,
        "confidence": field.confidence,
        "requires_approval": requires_approval,
        "destination_view": destination_view,
        "surface_hint": field.surface_hint,
        "suggested_action": field.recommended_action,
        "action_label": action_label,
        "selection_reason": selection_reason,
        "artifact_summary_lines": [&field.reason],
        "source_refs": field.evidence_refs,
        "source_count": field.evidence_refs.len(),
    })
}

fn state_field_selection_rank(
    field: &ContinuityStateFieldItem,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<crate::server::proactive_ranking_helpers::StateFieldSelectionRank> {
    if field.status != "active" {
        return None;
    }
    let confidence_rank =
        crate::server::proactive_ranking_helpers::state_field_confidence_rank(&field.confidence)?;
    let field_rank = crate::server::proactive_ranking_helpers::state_field_kind_rank(
        &field.field_key,
        STATE_FIELD_APPROVAL_REQUIRED_WORK,
        STATE_FIELD_UNRESOLVED_DECISIONS,
    );
    let surface_rank =
        crate::server::proactive_ranking_helpers::state_field_surface_rank(&field.surface_hint);
    let watcher_pressure_rank = state_field_watcher_pressure_rank(field, preferred_state);
    Some((
        field_rank,
        watcher_pressure_rank,
        confidence_rank,
        surface_rank,
        requires_approval_rank(field),
        std::cmp::Reverse(field.evidence_refs.len()),
        field.field_key.clone(),
    ))
}

fn requires_approval_rank(field: &ContinuityStateFieldItem) -> u8 {
    crate::server::proactive_ranking_helpers::state_field_requires_approval_rank(
        &field.autonomy_level,
    )
}

fn state_field_watcher_pressure_rank(
    field: &ContinuityStateFieldItem,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> u8 {
    if field.field_key != crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE {
        return 0;
    }
    if watcher_context_cooldown_reason(preferred_state).is_some() {
        1
    } else {
        0
    }
}

fn watcher_context_cooldown_reason(
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<String> {
    let Some(DashboardContinuityMessage {
        parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)),
        ..
    }) = preferred_state
    else {
        return None;
    };

    let has_active_or_trusted = snapshot
        .watcher_signals
        .iter()
        .any(|signal| matches!(signal.suppression_status.as_str(), "active" | "trusted"));
    if has_active_or_trusted {
        return None;
    }

    snapshot
        .watcher_signals
        .iter()
        .find(|signal| {
            matches!(
                signal.suppression_status.as_str(),
                "suppressed" | "cooldown"
            )
        })
        .and_then(|signal| {
            let suppression_reason = signal.suppression_reason.trim();
            if !suppression_reason.is_empty() {
                return Some(suppression_reason.to_string());
            }
            let escalation_reason = signal.escalation_reason.trim();
            if !escalation_reason.is_empty() {
                return Some(escalation_reason.to_string());
            }
            let urgency_hint = signal.urgency_hint.trim();
            if !urgency_hint.is_empty() {
                return Some(urgency_hint.to_string());
            }
            None
        })
}

fn state_field_selection_reason(
    field: &ContinuityStateFieldItem,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<String> {
    if field.field_key == crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE {
        if let Some(reason) = watcher_context_cooldown_reason(preferred_state) {
            return Some(reason);
        }
        if let Some(reason) = empathy_coordination_reason(
            preferred_state.and_then(|state| state.synthesizer_handoff.as_ref()),
        ) {
            return Some(reason);
        }
    }
    field_engine_selection_reason(None)
}

pub(super) fn state_field_suggestion_from_fields(
    state_fields: &[ContinuityStateFieldItem],
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<Value> {
    // Surface a deterministic top field so routing does not depend on backend emission order.
    let field = state_fields
        .iter()
        .filter_map(|field| {
            state_field_selection_rank(field, preferred_state).map(|rank| (rank, field))
        })
        .min_by(|(left_rank, _), (right_rank, _)| left_rank.cmp(right_rank))
        .map(|(_, field)| field)?;
    Some(synthetic_state_field_suggestion_with_state(
        field,
        preferred_state,
    ))
}

fn prepared_draft_destination_view(draft_class: &str) -> &'static str {
    crate::prepared_draft_semantics::prepared_draft_destination_view(draft_class)
}

fn prepared_draft_action_label(draft_class: &str) -> &'static str {
    crate::prepared_draft_semantics::prepared_draft_action_label(draft_class)
}

fn prepared_draft_surface_hint(destination_view: &str) -> String {
    destination_view.to_string()
}

fn prepared_draft_preview_lines(
    draft_class: &str,
    body: &str,
    response_due_hint: &str,
    comparison_rows: &[PreparedDraftComparisonRow],
) -> Vec<String> {
    if draft_class == "comparison_table" {
        return comparison_rows
            .iter()
            .take(2)
            .map(|row| {
                format!(
                    "{}: {}",
                    row.label,
                    row.values
                        .iter()
                        .take(2)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(" · ")
                )
            })
            .collect();
    }

    let mut lines = body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.strip_prefix("- ").unwrap_or(line).to_string())
        .filter(|line| !line.ends_with(':'))
        .take(3)
        .collect::<Vec<_>>();
    if let Some(timing_line) = proactive_follow_up_timing_summary_line(
        crate::prepared_draft_semantics::follow_up_proposal_from_draft_semantics(
            draft_class,
            response_due_hint,
        )
        .as_deref(),
        Some(body),
    ) {
        lines.insert(0, timing_line);
    }
    lines
}

fn prepared_draft_structured_lines(
    title: &str,
    summary: &str,
    suggested_next_action: &str,
    body: &str,
) -> Vec<String> {
    let body_trimmed = body.trim();
    let mut lines = Vec::new();
    let normalized_body = body_trimmed.to_ascii_lowercase();

    let push_if_distinct = |lines: &mut Vec<String>, prefix: &str, value: &str| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return;
        }
        lines.push(format!("{prefix}{trimmed}"));
    };

    if !title.trim().is_empty() {
        let title_lower = title.trim().to_ascii_lowercase();
        if !normalized_body.contains(&title_lower) {
            push_if_distinct(&mut lines, "Draft: ", title);
        }
    }
    if !summary.trim().is_empty() {
        let summary_trimmed = summary.trim();
        let summary_lower = summary_trimmed.to_ascii_lowercase();
        if !normalized_body.contains(&summary_lower) {
            push_if_distinct(&mut lines, "", summary_trimmed);
        }
    }
    if !suggested_next_action.trim().is_empty() {
        let action_trimmed = suggested_next_action.trim();
        let action_lower = action_trimmed.to_ascii_lowercase();
        if !normalized_body.contains(&action_lower) {
            push_if_distinct(&mut lines, "Next action: ", action_trimmed);
        }
    }

    lines
}

fn prepared_draft_object_anchor_line(
    preferred_labels: &[String],
    fallback_refs: &[String],
) -> Option<String> {
    crate::server::summary_helpers::reference_summary_line(
        "Object anchors",
        preferred_labels,
        fallback_refs,
        None,
        false,
    )
}

fn prepared_draft_summary_lines(draft: &PreparedDraftArtifact) -> Vec<String> {
    if draft.draft_class == "comparison_table" {
        return draft
            .comparison_rows
            .iter()
            .take(2)
            .map(|row| {
                format!(
                    "{}: {}",
                    row.label,
                    row.values
                        .iter()
                        .take(2)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(" · ")
                )
            })
            .collect();
    }

    let mut lines = prepared_draft_structured_lines(
        &draft.label,
        &draft.summary,
        &draft.suggested_next_action,
        &draft.body,
    );
    lines.extend(prepared_draft_preview_lines(
        &draft.draft_class,
        &draft.body,
        &draft.response_due_hint,
        &draft.comparison_rows,
    ));
    if let Some(anchor_line) =
        prepared_draft_object_anchor_line(&draft.object_refs, &draft.object_refs)
    {
        lines.push(anchor_line);
    }
    lines
}

fn prepared_draft_summary_lines_from_item(item: &ContinuityPreparedDraftItem) -> Vec<String> {
    if item.draft_class == "comparison_table" {
        return item
            .comparison_rows
            .iter()
            .take(2)
            .map(|row| {
                format!(
                    "{}: {}",
                    row.label,
                    row.values
                        .iter()
                        .take(2)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(" · ")
                )
            })
            .collect();
    }

    let mut lines = prepared_draft_structured_lines(
        &item.title,
        &item.summary,
        &item.suggested_action,
        &item.body,
    );
    lines.extend(prepared_draft_preview_lines(
        &item.draft_class,
        &item.body,
        &item.response_due_hint,
        &item.comparison_rows,
    ));
    if let Some(anchor_line) =
        prepared_draft_object_anchor_line(&item.object_labels, &item.object_refs)
    {
        lines.push(anchor_line);
    }
    lines
}

fn prepared_draft_summary_lines_with_reason(draft: &PreparedDraftArtifact) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(reason) = draft.selection_reason.as_ref() {
        lines.push(reason.clone());
    }
    if let Some(scope_line) = proactive_scope_summary_line(
        draft.memory_space.as_deref(),
        draft.author_type.as_deref(),
        draft.is_human_authored,
        draft.human_only,
    ) {
        lines.push(scope_line);
    }
    lines.extend(prepared_draft_summary_lines(draft));
    lines
}

fn prepared_draft_summary_lines_from_item_with_reason(
    item: &ContinuityPreparedDraftItem,
) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(reason) = item.selection_reason.as_ref() {
        lines.push(reason.clone());
    }
    if let Some(scope_line) = proactive_scope_summary_line(
        item.memory_space.as_deref(),
        item.author_type.as_deref(),
        item.is_human_authored,
        item.human_only,
    ) {
        lines.push(scope_line);
    }
    lines.extend(prepared_draft_summary_lines_from_item(item));
    lines
}

fn proactive_content_from_prepared_draft_item(item: &ContinuityPreparedDraftItem) -> Value {
    let heuristic_id = prepared_draft_heuristic_id(item);
    let heuristic_family_id = prepared_draft_heuristic_family_id(item);
    serde_json::json!({
        "heuristic_id": heuristic_id,
        "heuristic_family_id": heuristic_family_id,
        "confidence": item.confidence,
        "urgency": if item.requires_approval { "high" } else { "medium" },
        "action_label": prepared_draft_action_label(&item.draft_class),
        "title": item.title,
        "description": item.summary,
        "destination_view": prepared_draft_destination_view(&item.draft_class),
        "surface_hint": prepared_draft_destination_view(&item.draft_class),
        "channel": item.channel,
        "draft_class": item.draft_class,
        "response_due_hint": item.response_due_hint,
        "follow_up_at": crate::prepared_draft_semantics::follow_up_proposal_from_draft_semantics(
            &item.draft_class,
            &item.response_due_hint,
        ),
        "requires_approval": item.requires_approval,
        "approval_or_reversibility_hint": prepared_draft_boundary_hint(
            &item.draft_class,
            item.requires_approval,
            &item.readiness,
            &item.response_due_hint,
        ),
        "selection_reason": item.selection_reason,
        "artifact_summary_lines": prepared_draft_summary_lines_from_item_with_reason(item),
        "source_refs": item.source_refs,
        "source_count": item.source_refs.len(),
        "comparison_headers": item.comparison_headers,
        "comparison_rows": item.comparison_rows,
        "action_afp_payload": null,
        "dismiss_reason": null,
        "source_event_id": null,
        "entity_id": null,
    })
}

fn continuity_item_to_prepared_draft_artifact(
    item: &ContinuityPreparedDraftItem,
) -> PreparedDraftArtifact {
    PreparedDraftArtifact {
        draft_id: item.id.clone(),
        draft_class: item.draft_class.clone(),
        label: item.title.clone(),
        channel: item.channel.clone(),
        summary: item.summary.clone(),
        body: item.body.clone(),
        confidence: item.confidence.clone(),
        readiness: item.readiness.clone(),
        response_due_hint: item.response_due_hint.clone(),
        approval_required_to_send: item.requires_approval,
        source_refs: item.source_refs.clone(),
        source_count: item.source_refs.len() as u32,
        storage_type: crate::message::AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(crate::message::AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: item.comparison_headers.clone(),
        comparison_rows: item.comparison_rows.clone(),
        selection_reason: item.selection_reason.clone(),
        suggested_next_action: item.suggested_action.clone(),
        object_refs: item.object_refs.clone(),
        memory_space: item.memory_space.clone(),
        author_mask: item.author_mask.clone(),
        author_type: item.author_type.clone(),
        author_id: item.author_id.clone(),
        is_human_authored: item.is_human_authored,
        human_only: item.human_only,
    }
}

fn proactive_action_payload_from_prepared_draft_item(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    item: &ContinuityPreparedDraftItem,
) -> Value {
    let draft = continuity_item_to_prepared_draft_artifact(item);
    let mut afp = build_prepared_draft_ledger_afp(owner_user_id, thread_id, parent_id, &draft);
    if item.id.starts_with("draft:simulator:") {
        afp["metadata"]["simulator_preview_promoted"] = Value::Bool(true);
        afp["metadata"]["draft_origin"] =
            Value::String("simulator_prepared_draft_preview".to_string());
    }
    afp
}

fn should_promote_prepared_draft_item(item: &ContinuityPreparedDraftItem) -> bool {
    item.readiness == "ready_now"
        && crate::prepared_draft_semantics::should_promote_prepared_draft_class(&item.draft_class)
}

pub(super) async fn persist_prepared_draft_suggestions_from_continuity(
    state: &Arc<AppState>,
    user_id: &str,
    continuity_summary: &DashboardContinuityStateResponse,
) {
    let continuity_state = preferred_continuity_state_message(continuity_summary);
    let continuity_thread_id = continuity_state
        .as_ref()
        .map(|state| state.thread_id.as_str())
        .unwrap_or("continuity:prepared-draft");
    let continuity_parent_id = continuity_state.as_ref().map(|state| state.id.as_str());
    let current_heuristic_ids = continuity_summary
        .preferred_prepared_draft_items
        .iter()
        .filter(|item| should_promote_prepared_draft_item(item))
        .take(2)
        .map(prepared_draft_heuristic_id)
        .collect::<HashSet<_>>();
    let active_headers = state
        .db
        .list_active_proactive_suggestion_headers(user_id, 200)
        .await
        .unwrap_or_default();
    for suggestion_id in stale_continuity_suggestion_ids(
        &active_headers,
        &current_heuristic_ids,
        is_prepared_draft_heuristic_id,
    ) {
        let _ = state
            .db
            .dismiss_active_proactive_suggestion(user_id, &suggestion_id)
            .await;
    }
    for item in continuity_summary
        .preferred_prepared_draft_items
        .iter()
        .filter(|item| should_promote_prepared_draft_item(item))
        .take(2)
    {
        let heuristic_id = prepared_draft_heuristic_id(item);
        let exists = state
            .db
            .has_active_proactive_suggestion(user_id, &heuristic_id)
            .await
            .unwrap_or(false);
        if exists {
            continue;
        }
        let latest_outcome = state
            .db
            .latest_proactive_outcome_accepted(user_id, &heuristic_id)
            .await
            .ok()
            .flatten();
        if latest_outcome == Some(false) {
            continue;
        }

        let mut content = proactive_content_from_prepared_draft_item(item);
        content["action_afp_payload"] = proactive_action_payload_from_prepared_draft_item(
            user_id,
            continuity_thread_id,
            continuity_parent_id,
            item,
        );
        if let Ok(suggest_afp) = new_server_message(
            "proactive_engine".to_string(),
            vec![user_id.to_string()],
            format!("proactive:continuity:{user_id}"),
            "proactive_suggestion",
            content.clone(),
            vec![],
            vec![],
            vec![],
            false,
        ) {
            let _ =
                store_and_prune_proactive_suggestion(state, user_id, &suggest_afp, content).await;
        }
    }
}

pub(super) async fn persist_context_suggestions_from_continuity(
    state: &Arc<AppState>,
    user_id: &str,
    continuity_summary: &DashboardContinuityStateResponse,
) {
    let continuity_state = preferred_continuity_state_message(continuity_summary);
    let continuity_handoff = continuity_summary.preferred_synthesizer_handoff.as_ref();
    let continuity_thread_id = continuity_state
        .as_ref()
        .map(|state| state.thread_id.as_str())
        .unwrap_or("continuity:prepared-context");
    let continuity_parent_id = continuity_state.as_ref().map(|state| state.id.as_str());
    let simulator_promoted = context_suggestion_uses_simulator_preview(continuity_state.as_ref());
    let suggestion =
        context_ready_suggestion_from_state(continuity_state.as_ref(), continuity_handoff).or_else(
            || context_pack_suggestion_from_summary(continuity_summary, continuity_handoff),
        );
    let current_heuristic_ids = suggestion
        .as_ref()
        .and_then(|content| content.get("heuristic_id").and_then(Value::as_str))
        .map(|heuristic_id| HashSet::from([heuristic_id.to_string()]))
        .unwrap_or_default();
    let active_headers = state
        .db
        .list_active_proactive_suggestion_headers(user_id, 200)
        .await
        .unwrap_or_default();
    for suggestion_id in stale_continuity_suggestion_ids(
        &active_headers,
        &current_heuristic_ids,
        is_context_heuristic_id,
    ) {
        let _ = state
            .db
            .dismiss_active_proactive_suggestion(user_id, &suggestion_id)
            .await;
    }

    let Some(mut content) = suggestion else {
        return;
    };
    match content.get("kind").and_then(Value::as_str) {
        Some("context_ready") => {
            if let Some(packet) =
                prepared_context_packet_from_state(continuity_state.as_ref(), continuity_handoff)
            {
                content["action_afp_payload"] =
                    proactive_action_payload_from_prepared_context_packet(
                        user_id,
                        continuity_thread_id,
                        continuity_parent_id,
                        &packet,
                        simulator_promoted,
                    );
            }
        }
        Some("context_pack") => {
            if let Some(item) =
                selected_context_pack_item_from_summary(continuity_summary, continuity_handoff)
            {
                content["action_afp_payload"] = proactive_action_payload_from_context_pack_item(
                    user_id,
                    continuity_thread_id,
                    continuity_parent_id,
                    item,
                    simulator_promoted,
                );
            }
        }
        _ => {}
    }
    let Some(heuristic_id) = content.get("heuristic_id").and_then(Value::as_str) else {
        return;
    };

    let exists = state
        .db
        .has_active_proactive_suggestion(user_id, heuristic_id)
        .await
        .unwrap_or(false);
    if exists {
        return;
    }
    let latest_outcome = state
        .db
        .latest_proactive_outcome_accepted(user_id, heuristic_id)
        .await
        .ok()
        .flatten();
    if latest_outcome == Some(false) {
        return;
    }

    if let Ok(suggest_afp) = new_server_message(
        "proactive_engine".to_string(),
        vec![user_id.to_string()],
        format!("proactive:continuity:{user_id}"),
        "proactive_suggestion",
        content.clone(),
        vec![],
        vec![],
        vec![],
        false,
    ) {
        let _ = store_and_prune_proactive_suggestion(state, user_id, &suggest_afp, content).await;
    }
}

pub(super) async fn persist_simulator_review_suggestions_from_continuity(
    state: &Arc<AppState>,
    user_id: &str,
    continuity_summary: &DashboardContinuityStateResponse,
) {
    let continuity_state = preferred_continuity_state_message(continuity_summary);
    let continuity_handoff = continuity_summary.preferred_synthesizer_handoff.as_ref();
    let mut suggestions =
        simulator_review_suggestions_from_continuity(continuity_state.as_ref(), continuity_handoff);
    let current_heuristic_ids = suggestions
        .iter()
        .filter_map(|content| content.get("heuristic_id").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let active_headers = state
        .db
        .list_active_proactive_suggestion_headers(user_id, 200)
        .await
        .unwrap_or_default();
    for suggestion_id in
        stale_simulator_review_suggestion_ids(&active_headers, &current_heuristic_ids)
    {
        let _ = state
            .db
            .dismiss_active_proactive_suggestion(user_id, &suggestion_id)
            .await;
    }

    for mut content in suggestions.drain(..) {
        mark_simulator_review_suggestion_as_continuity_persisted(&mut content);
        let Some(heuristic_id) = content.get("heuristic_id").and_then(Value::as_str) else {
            continue;
        };

        let exists = state
            .db
            .has_active_proactive_suggestion(user_id, heuristic_id)
            .await
            .unwrap_or(false);
        if exists {
            continue;
        }
        let latest_outcome = state
            .db
            .latest_proactive_outcome_accepted(user_id, heuristic_id)
            .await
            .ok()
            .flatten();
        if latest_outcome == Some(false) {
            continue;
        }

        if let Ok(suggest_afp) = new_server_message(
            "proactive_engine".to_string(),
            vec![user_id.to_string()],
            format!("proactive:continuity:{user_id}"),
            "proactive_suggestion",
            content.clone(),
            vec![],
            vec![],
            vec![],
            false,
        ) {
            let _ =
                store_and_prune_proactive_suggestion(state, user_id, &suggest_afp, content).await;
        }
    }
}

async fn store_and_prune_proactive_suggestion(
    state: &Arc<AppState>,
    user_id: &str,
    suggest_afp: &crate::message::AFPMessage,
    content: Value,
) -> Result<bool, sqlx::Error> {
    let proto = afp_to_proto(suggest_afp);
    let stored = state.db.store_message(&proto, content).await?;
    state.db.prune_proactive_suggestion_history(user_id).await?;
    Ok(stored)
}

fn is_simulator_review_heuristic_id(heuristic_id: &str) -> bool {
    heuristic_id.starts_with("simulator-review:")
}

fn is_prepared_draft_heuristic_id(heuristic_id: &str) -> bool {
    heuristic_id.starts_with("prepared-draft:")
}

fn is_context_heuristic_id(heuristic_id: &str) -> bool {
    heuristic_id.starts_with("context-ready:") || heuristic_id.starts_with("context-pack:")
}

fn stale_continuity_suggestion_ids(
    active_headers: &[(String, String)],
    current_heuristic_ids: &HashSet<String>,
    heuristic_id_filter: fn(&str) -> bool,
) -> Vec<String> {
    active_headers
        .iter()
        .filter_map(|(suggestion_id, heuristic_id)| {
            if heuristic_id_filter(heuristic_id) && !current_heuristic_ids.contains(heuristic_id) {
                Some(suggestion_id.clone())
            } else {
                None
            }
        })
        .collect()
}

fn stale_simulator_review_suggestion_ids(
    active_headers: &[(String, String)],
    current_heuristic_ids: &HashSet<String>,
) -> Vec<String> {
    stale_continuity_suggestion_ids(
        active_headers,
        current_heuristic_ids,
        is_simulator_review_heuristic_id,
    )
}

fn simulator_review_suggestions_from_continuity(
    continuity_state: Option<&DashboardContinuityMessage>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Vec<Value> {
    let mut suggestions = Vec::new();
    if let Some(suggestion) =
        simulator_conflict_fusion_suggestion_from_continuity(continuity_state, continuity_handoff)
    {
        suggestions.push(suggestion);
    }
    if let Some(suggestion) =
        simulator_approval_preview_suggestion_from_state(continuity_state, continuity_handoff)
    {
        suggestions.push(suggestion);
    }
    if let Some(suggestion) =
        simulator_reversible_preview_suggestion_from_state(continuity_state, continuity_handoff)
    {
        suggestions.push(suggestion);
    }
    suggestions
}

pub(super) fn simulator_conflict_fusion_suggestion_from_continuity(
    continuity_state: Option<&DashboardContinuityMessage>,
    continuity_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<Value> {
    let state = continuity_state?;
    let approval =
        simulator_approval_preview_suggestion_from_state(Some(state), continuity_handoff)?;
    let reversible =
        simulator_reversible_preview_suggestion_from_state(Some(state), continuity_handoff)?;
    let rollout = simulator_rollout_summary_from_state(state);
    let calibration = simulator_calibration_summary_from_state(state);
    let rollout_summary =
        simulator_rollout_summary_line_from_sources(rollout, calibration, continuity_handoff);
    let review_summary = simulator_review_summary_from_sources(rollout, continuity_handoff);
    let calibration_notes =
        simulator_calibration_notes_from_sources(calibration, continuity_handoff);
    let rollout_stage = simulator_rollout_stage_from_sources(rollout, continuity_handoff);
    let calibration_mode = simulator_calibration_mode_from_sources(calibration, continuity_handoff);

    let approval_title = approval
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let reversible_title = reversible
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let approval_reason = approval
        .get("reason")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let reversible_reason = reversible
        .get("reason")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let source_refs = unique_json_string_values([
        approval.get("source_refs").and_then(Value::as_array),
        reversible.get("source_refs").and_then(Value::as_array),
    ]);
    if source_refs.is_empty() {
        return None;
    }

    let heuristic_family_id = simulator_review_heuristic_family_id("fusion");
    let heuristic_id =
        simulator_review_heuristic_id("fusion", "simulator conflict fusion", &source_refs);
    let mut summary_lines = Vec::new();
    if !approval_reason.trim().is_empty() {
        summary_lines.push(approval_reason.to_string());
    }
    if !reversible_reason.trim().is_empty() && reversible_reason != approval_reason {
        summary_lines.push(reversible_reason.to_string());
    }
    if let Some(summary) =
        continuity_handoff.and_then(|handoff| handoff.simulated_projection_summary.clone())
    {
        summary_lines.push(summary);
    }
    if let Some(summary) = review_summary.clone() {
        summary_lines.push(summary);
    }
    if let Some(summary) = rollout_summary.clone() {
        summary_lines.push(summary);
    }
    if let Some(note) = calibration_notes.first() {
        summary_lines.push(note.clone());
    }
    summary_lines.truncate(3);

    Some(json!({
        "kind": "simulator_conflict_fusion",
        "title": "Simulator conflict fusion summary",
        "summary": "Bounded simulator surfaced both an approval-gated path and a reversible alternative around the same active context.",
        "reason": format!(
            "Fusion summary keeps {} and {} together as one bounded comparison.",
            if approval_title.trim().is_empty() { "the approval path" } else { approval_title },
            if reversible_title.trim().is_empty() { "the reversible path" } else { reversible_title },
        ),
        "confidence": "medium",
        "preview_only": true,
        "requires_approval": false,
        "heuristic_family_id": heuristic_family_id,
        "heuristic_id": heuristic_id,
        "persisted_from_continuity": true,
        "source_refs": source_refs,
        "artifact_summary_lines": summary_lines,
        "linked_preview_kinds": ["simulator_approval_preview", "simulator_reversible_preview"],
        "linked_preview_titles": [approval_title, reversible_title],
        "review_summary": review_summary,
        "calibration_notes": calibration_notes,
        "rollout_summary": rollout_summary,
        "rollout_stage": rollout_stage,
        "calibration_mode": calibration_mode,
    }))
}

fn unique_json_string_values<const N: usize>(arrays: [Option<&Vec<Value>>; N]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut values = Vec::new();
    for array in arrays.into_iter().flatten() {
        for value in array.iter().filter_map(Value::as_str) {
            if value.trim().is_empty() || !seen.insert(value.to_string()) {
                continue;
            }
            values.push(value.to_string());
        }
    }
    values
}

fn mark_simulator_review_suggestion_as_continuity_persisted(content: &mut Value) {
    let Some(root) = content.as_object_mut() else {
        return;
    };
    root.insert("persisted_from_continuity".to_string(), Value::Bool(true));
    root.entry("persistence_reason".to_string()).or_insert_with(|| {
        Value::String(
            "Persisted from continuity so this bounded simulator review remains available between refreshes."
                .to_string(),
        )
    });
}

fn proactive_suggestion_allowed(item: &serde_json::Value, prefs: &AgentPreferences) -> bool {
    let source_event = item
        .get("source_event_content")
        .and_then(serde_json::Value::as_object);
    let Some(source_event) = source_event else {
        return true;
    };
    let source = source_event
        .get("source")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let metadata = source_event
        .get("metadata")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    proactive_source_allowed(source, &metadata, prefs)
}

pub(super) fn proactive_source_allowed(
    source: &str,
    metadata: &serde_json::Value,
    prefs: &AgentPreferences,
) -> bool {
    let filters = match source {
        "calendar" => &prefs.calendar_notification_filters,
        "email" => &prefs.email_notification_filters,
        _ => return true,
    };

    notification_source_allowed(filters, metadata)
}

fn notification_source_allowed(
    filters: &NotificationSourceFilters,
    metadata: &serde_json::Value,
) -> bool {
    let metadata_obj = match metadata.as_object() {
        Some(value) => value,
        None => return true,
    };

    let source_system = metadata_obj
        .get("source_system")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let origin_type = metadata_obj
        .get("origin_type")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_system =
        origin_type == "system" || source_system.contains("omny") || source_system == "system";
    if is_system && !filters.allow_system {
        return false;
    }

    let people_candidates = collect_candidates(
        metadata_obj,
        &[
            "person",
            "person_name",
            "person_email",
            "sender",
            "sender_name",
            "sender_email",
            "from_name",
            "from_email",
            "organizer",
            "organizer_email",
        ],
    );
    let agent_candidates = collect_candidates(metadata_obj, &["agent_id", "agent_ids"]);
    let organization_candidates =
        collect_candidates(metadata_obj, &["organization", "org", "company"]);
    let domain_candidates = collect_domain_candidates(metadata_obj);

    if !filters.allow_people && (!people_candidates.is_empty() || !agent_candidates.is_empty()) {
        return false;
    }
    if !filters.allow_organizations && !organization_candidates.is_empty() {
        return false;
    }
    if !filters.allow_domains && !domain_candidates.is_empty() {
        return false;
    }

    if !filters.allowed_people.is_empty()
        && !people_candidates.is_empty()
        && !filters
            .allowed_people
            .iter()
            .any(|allowed| contains_ci(&people_candidates, allowed))
    {
        return false;
    }
    if !filters.allowed_agent_ids.is_empty()
        && !agent_candidates.is_empty()
        && !filters
            .allowed_agent_ids
            .iter()
            .any(|allowed| contains_ci(&agent_candidates, allowed))
    {
        return false;
    }
    if !filters.allowed_organizations.is_empty()
        && !organization_candidates.is_empty()
        && !filters
            .allowed_organizations
            .iter()
            .any(|allowed| contains_ci(&organization_candidates, allowed))
    {
        return false;
    }
    if !filters.allowed_domains.is_empty()
        && !domain_candidates.is_empty()
        && !filters
            .allowed_domains
            .iter()
            .any(|allowed| contains_ci(&domain_candidates, allowed))
    {
        return false;
    }

    true
}

fn contains_ci(values: &[String], candidate: &str) -> bool {
    values
        .iter()
        .any(|value| value.eq_ignore_ascii_case(candidate.trim()))
}

fn collect_candidates(
    metadata: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Vec<String> {
    let mut out = Vec::new();
    for key in keys {
        if let Some(value) = metadata.get(*key) {
            match value {
                serde_json::Value::String(text) => {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        out.push(trimmed.to_string());
                    }
                }
                serde_json::Value::Array(values) => {
                    for item in values {
                        if let Some(text) = item.as_str() {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                out.push(trimmed.to_string());
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

fn collect_domain_candidates(metadata: &serde_json::Map<String, serde_json::Value>) -> Vec<String> {
    let mut out = collect_candidates(metadata, &["domain", "domains"]);
    for email in collect_candidates(
        metadata,
        &[
            "from_email",
            "sender_email",
            "person_email",
            "organizer_email",
        ],
    ) {
        if let Some((_, domain)) = email.split_once('@') {
            out.push(domain.trim().to_string());
        }
    }
    out.sort();
    out.dedup();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_filters() -> NotificationSourceFilters {
        NotificationSourceFilters::default()
    }

    #[test]
    fn notification_source_allowed_blocks_disallowed_domain() {
        let mut filters = base_filters();
        filters.allowed_domains = vec!["trusted.com".to_string()];

        let metadata = serde_json::json!({
            "from_email": "alerts@other.com",
            "domain": "other.com"
        });

        assert!(!notification_source_allowed(&filters, &metadata));
    }

    #[test]
    fn notification_source_allowed_accepts_matching_person() {
        let mut filters = base_filters();
        filters.allowed_people = vec!["Alex".to_string()];

        let metadata = serde_json::json!({
            "person_name": "Alex",
            "from_email": "alex@example.com"
        });

        assert!(notification_source_allowed(&filters, &metadata));
    }

    #[test]
    fn proactive_suggestion_allowed_uses_calendar_filters() {
        let mut prefs = AgentPreferences::default();
        prefs.calendar_notification_filters.allow_people = false;

        let suggestion = serde_json::json!({
            "id": "s1",
            "content": { "description": "Prep for meeting" },
            "source_event_content": {
                "source": "calendar",
                "metadata": {
                    "person_name": "Dana",
                    "organizer_email": "dana@example.com"
                }
            }
        });

        assert!(!proactive_suggestion_allowed(&suggestion, &prefs));
    }

    #[test]
    fn proactive_source_allowed_uses_email_filters() {
        let mut prefs = AgentPreferences::default();
        prefs.email_notification_filters.allowed_domains = vec!["trusted.com".to_string()];

        let metadata = serde_json::json!({
            "from_email": "alerts@other.com",
            "domain": "other.com"
        });

        assert!(!proactive_source_allowed("email", &metadata, &prefs));
    }

    #[test]
    fn proactive_suggestion_fetch_limit_overfetches_with_cap() {
        assert_eq!(proactive_suggestion_fetch_limit(0), 0);
        assert_eq!(proactive_suggestion_fetch_limit(1), 3);
        assert_eq!(proactive_suggestion_fetch_limit(20), 60);
        assert_eq!(proactive_suggestion_fetch_limit(40), 100);
    }

    #[test]
    fn passive_event_route_sanitizes_message_construction_failures() {
        let source = include_str!("proactive_routes.rs");
        assert!(
            source.contains("AFP_TYPE_PASSIVE_EVENT")
                && source.contains(".map_err(internal_http_error)?;"),
            "passive event AFP construction failures should be sanitized"
        );
    }

    #[test]
    fn watcher_resolution_source_message_matches_only_watcher_outputs_by_id() {
        let messages = vec![
            serde_json::json!({
                "id": "other",
                "type": "watcher_alert",
            }),
            serde_json::json!({
                "id": "target",
                "type": "smart_suggestion",
                "thread_id": "thread_01",
            }),
            serde_json::json!({
                "id": "target",
                "type": "proactive_suggestion",
            }),
        ];

        let matched = watcher_resolution_source_message(&messages, "target").unwrap();
        assert_eq!(matched["type"].as_str(), Some("smart_suggestion"));
        assert!(watcher_resolution_source_message(&messages, "missing").is_none());
    }

    #[test]
    fn watcher_resolution_event_from_outcome_preserves_durable_source_metadata() {
        let source_message = serde_json::json!({
            "id": "watcher_1",
            "type": "watcher_alert",
            "thread_id": "passive:user_01",
            "content": {
                "category": "medication",
                "severity": "urgent",
                "source_event_id": "evt_med_1"
            }
        });

        let event = watcher_resolution_event_from_outcome(
            "user_01",
            "watcher_1",
            false,
            "medication-reminder-evening",
            &source_message,
        );

        assert_eq!(event["type"].as_str(), Some("watcher_resolution_event"));
        assert_eq!(
            event["subtype"].as_str(),
            Some("watcher_resolution:dismissed")
        );
        assert_eq!(event["thread_id"].as_str(), Some("passive:user_01"));
        assert_eq!(event["content"]["category"].as_str(), Some("medication"));
        assert_eq!(event["content"]["severity"].as_str(), Some("urgent"));
        assert_eq!(
            event["metadata"]["searchable_metadata"]["resolved_message_id"].as_str(),
            Some("watcher_1")
        );
    }

    #[test]
    fn synthesis_invalidation_event_from_resolution_preserves_state_refs() {
        let resolution_event = serde_json::json!({
            "id": "resolution_1",
            "type": "watcher_resolution_event",
            "metadata": {
                "heuristic_id": "watcher.deadline",
                "searchable_metadata": {
                    "watcher_category": "schedule"
                }
            }
        });
        let continuity_summary = crate::server::types::DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: Some("synthesis_1".to_string()),
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let event = synthesis_invalidation_event_from_resolution(
            "user_01",
            &resolution_event,
            &continuity_summary,
        )
        .expect("invalidation event should build");

        assert_eq!(
            event["type"].as_str(),
            Some(crate::message::AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT)
        );
        assert_eq!(
            event["content"]["invalidated_snapshot_ref"].as_str(),
            Some("snapshot_1")
        );
        assert_eq!(
            event["content"]["invalidated_synthesis_ref"].as_str(),
            Some("synthesis_1")
        );
        assert_eq!(
            event["content"]["reason_message_id"].as_str(),
            Some("resolution_1")
        );
    }

    #[test]
    fn coordination_reflection_trace_from_outcome_preserves_cycle_context() {
        let req = RecordOutcomeRequest {
            suggestion_id: "suggestion_1".to_string(),
            accepted: true,
            outcome_afp_id: Some("outcome_1".to_string()),
            heuristic_id: "heuristic_1".to_string(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: Some("synthesis_1".to_string()),
            latest_state_snapshot: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_1".to_string(),
                timestamp: "2026-06-29T09:00:00Z".to_string(),
                r#type: crate::state_snapshot::AFP_TYPE_STATE_SNAPSHOT.to_string(),
                subtype: crate::state_snapshot::AFP_SUBTYPE_STATE_SNAPSHOT.to_string(),
                content: serde_json::json!({}),
                parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                    crate::state_snapshot::StateSnapshotContent {
                        snapshot_kind: "homepage_briefing".to_string(),
                        time_window: "today".to_string(),
                        prepared_context_packet: Some(
                            crate::prepared_context_packet::PreparedContextPacket {
                                ready: true,
                                retrieval_mode:
                                    "metadata_first_with_selective_deepening".to_string(),
                                deeper_retrieval_recommended: true,
                                readiness_reason: Some(
                                    "A reply-ready context packet is already assembled."
                                        .to_string(),
                                ),
                                ..crate::prepared_context_packet::PreparedContextPacket::default()
                            },
                        ),
                        prepared_draft_packet: Some(
                            crate::prepared_draft_packet::PreparedDraftPacket {
                                ready: true,
                                drafts: vec![
                                    crate::prepared_draft_packet::PreparedDraftArtifact {
                                        draft_class: "communication_reply".to_string(),
                                        readiness: "ready_now".to_string(),
                                        selection_reason: Some(
                                            "The reply draft is aligned to the current supplier thread."
                                                .to_string(),
                                        ),
                                        approval_required_to_send: true,
                                        ..crate::prepared_draft_packet::PreparedDraftArtifact::default()
                                    },
                                ],
                                ..crate::prepared_draft_packet::PreparedDraftPacket::default()
                            },
                        ),
                        ..crate::state_snapshot::StateSnapshotContent::default()
                    },
                )),
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: Some(crate::server::types::DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Prepared continuity is active".to_string(),
                decision_count: 1,
                commitment_count: 0,
                critical_change_count: 0,
                suggested_actions: vec!["Reply in thread".to_string()],
                staleness_at: Some("2026-06-29T09:00:00Z".to_string()),
            }),
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                field_engine_ready: true,
                field_engine_summary: Some("Relationship field shows high pressure.".to_string()),
                prepared_context_summary: Some("Prepared context ready.".to_string()),
                empathy_context: Some(
                    crate::state_synthesizer_contract::EmpathyCoordinationContext {
                        explanation: Some("Trusted gentle mode is active.".to_string()),
                        ..Default::default()
                    },
                ),
                ..Default::default()
            }),
            preferred_priority_item: Some(ContinuityPriorityItem {
                title: "Reply to supplier".to_string(),
                panel_kind: "response_queue".to_string(),
                requires_approval: false,
                surface_hint: Some("response_queue".to_string()),
                suggested_action: Some("Reply in thread".to_string()),
                confidence: Some("high".to_string()),
                prepared_draft_class: None,
                selection_reason: Some("Prepared reply is already aligned.".to_string()),
                source_refs: vec!["msg_1".to_string()],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let event = coordination_reflection_trace_from_outcome(
            "user_1",
            &req,
            &continuity_summary,
            Some(AfpOutcomeObservabilityContent {
                surface_kind: "response_queue".to_string(),
                dominant_surface_kind: Some("response_queue".to_string()),
                workspace_scope_kind: Some("memory_space".to_string()),
                narrowing_signal: "workspace_scoped".to_string(),
                feedback_status: Some("trusted".to_string()),
                feedback_scope: Some("exact".to_string()),
                acceptance_rate_bucket: Some("high".to_string()),
                dominant_surface_match: true,
                linked_artifact_count: 3,
                source_ref_count: 1,
            }),
            Some("resolution_1"),
            Some("invalidate_1"),
        );

        assert_eq!(event["type"].as_str(), Some(AFP_TYPE_REFLECTION_TRACE));
        assert_eq!(
            event["subtype"].as_str(),
            Some(AFP_SUBTYPE_COORDINATION_CYCLE_TRACE)
        );
        assert_eq!(
            event["content"]["surfaced_priority_title"].as_str(),
            Some("Reply to supplier")
        );
        assert_eq!(
            event["content"]["linked_artifact_ids"]
                .as_array()
                .map(|ids| ids.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec!["outcome_1", "resolution_1", "invalidate_1"])
        );
        assert!(
            event["content"]["reasoning_notes"]
                .as_array()
                .is_some_and(|notes| notes
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|note| note.contains("Field-guided")))
        );
        assert!(
            event["content"]["reasoning_notes"]
                .as_array()
                .is_some_and(|notes| notes
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|note| note.contains(
                        "Prepared context retrieval mode: metadata first with selective deepening."
                    )))
        );
        assert_eq!(
            event["content"]["outcome_observability"]["surface_kind"].as_str(),
            Some("response_queue")
        );
        assert_eq!(
            event["content"]["outcome_observability"]["dominant_surface_match"].as_bool(),
            Some(true)
        );
        assert_eq!(
            event["metadata"]["coordination_event"].as_bool(),
            Some(true)
        );
    }

    #[test]
    fn outcome_observability_from_outcome_captures_scope_surface_and_feedback() {
        let req = RecordOutcomeRequest {
            suggestion_id: "suggestion_1".to_string(),
            accepted: true,
            outcome_afp_id: Some("outcome_1".to_string()),
            heuristic_id: "heuristic_1".to_string(),
            memory_space: Some("work".to_string()),
            author_mask: Some("private".to_string()),
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: Some(ContinuityPriorityItem {
                title: "Reply to supplier".to_string(),
                panel_kind: "response_queue".to_string(),
                requires_approval: false,
                surface_hint: Some("response_queue".to_string()),
                suggested_action: Some("Reply in thread".to_string()),
                confidence: Some("high".to_string()),
                prepared_draft_class: None,
                selection_reason: Some("Prepared reply is already aligned.".to_string()),
                source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_priority_card: Some(ContinuityPriorityCard {
                title: "Reply to supplier".to_string(),
                description: "Prepared reply is waiting.".to_string(),
                panel_kind: "response_queue".to_string(),
                requires_approval: false,
                action_label: "Reply in thread".to_string(),
                surface_hint: Some("response_queue".to_string()),
                confidence: Some("high".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                approval_or_reversibility_hint: None,
                provenance_cue: None,
                autonomy_tier: None,
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                working_set_refs: Vec::new(),
                active_topic_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                project_refs: Vec::new(),
                thread_refs: Vec::new(),
                linked_target_label: None,
                source_refs: vec!["msg_1".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                thread_retrieval_state: None,
                autonomy_decision: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };
        let feedback = HeuristicOutcomeFeedback {
            heuristic_id: "heuristic_1".to_string(),
            total: 8,
            accepted: 6,
            acceptance_rate: 0.75,
            status: "trusted".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        };

        let observability =
            outcome_observability_from_outcome(&req, &continuity_summary, Some(&feedback), 3);

        assert_eq!(observability.surface_kind, "response_queue");
        assert_eq!(
            observability.dominant_surface_kind.as_deref(),
            Some("response_queue")
        );
        assert_eq!(
            observability.workspace_scope_kind.as_deref(),
            Some("memory_and_authorship")
        );
        assert_eq!(observability.narrowing_signal, "workspace_scoped");
        assert_eq!(observability.feedback_status.as_deref(), Some("trusted"));
        assert_eq!(observability.feedback_scope.as_deref(), Some("exact"));
        assert_eq!(
            observability.acceptance_rate_bucket.as_deref(),
            Some("high")
        );
        assert!(observability.dominant_surface_match);
        assert_eq!(observability.linked_artifact_count, 3);
        assert_eq!(observability.source_ref_count, 2);
    }

    #[test]
    fn summarize_outcome_observability_traces_counts_recent_proactive_outcomes() {
        let messages = vec![
            json!({
                "type": AFP_TYPE_REFLECTION_TRACE,
                "subtype": AFP_SUBTYPE_COORDINATION_CYCLE_TRACE,
                "content": {
                    "cycle_kind": "proactive_outcome",
                    "outcome_kind": "accepted",
                    "outcome_observability": {
                        "surface_kind": "response_queue",
                        "narrowing_signal": "workspace_scoped",
                        "feedback_status": "trusted",
                        "acceptance_rate_bucket": "high",
                        "dominant_surface_match": true
                    }
                }
            }),
            json!({
                "type": AFP_TYPE_REFLECTION_TRACE,
                "subtype": AFP_SUBTYPE_COORDINATION_CYCLE_TRACE,
                "content": {
                    "cycle_kind": "proactive_outcome",
                    "outcome_kind": "dismissed",
                    "outcome_observability": {
                        "surface_kind": "decision_queue",
                        "narrowing_signal": "continuity_scoped",
                        "feedback_status": "active",
                        "acceptance_rate_bucket": "medium",
                        "dominant_surface_match": false
                    }
                }
            }),
            json!({
                "type": AFP_TYPE_REFLECTION_TRACE,
                "subtype": AFP_SUBTYPE_COORDINATION_CYCLE_TRACE,
                "content": {
                    "cycle_kind": "other_cycle",
                    "outcome_kind": "accepted",
                    "outcome_observability": {
                        "surface_kind": "context_panel",
                        "narrowing_signal": "broad",
                        "feedback_status": "trusted",
                        "acceptance_rate_bucket": "low",
                        "dominant_surface_match": true
                    }
                }
            }),
        ];

        let summary = summarize_outcome_observability_traces(&messages);

        assert_eq!(summary["total_traces"].as_u64(), Some(2));
        assert_eq!(summary["accepted"].as_u64(), Some(1));
        assert_eq!(summary["dismissed"].as_u64(), Some(1));
        assert_eq!(summary["dominant_surface_matches"].as_u64(), Some(1));
        assert_eq!(
            summary["surface_counts"]["response_queue"].as_u64(),
            Some(1)
        );
        assert_eq!(
            summary["surface_counts"]["decision_queue"].as_u64(),
            Some(1)
        );
        assert_eq!(
            summary["narrowing_counts"]["workspace_scoped"].as_u64(),
            Some(1)
        );
        assert_eq!(
            summary["narrowing_counts"]["continuity_scoped"].as_u64(),
            Some(1)
        );
        assert_eq!(
            summary["feedback_status_counts"]["trusted"].as_u64(),
            Some(1)
        );
        assert_eq!(
            summary["feedback_status_counts"]["active"].as_u64(),
            Some(1)
        );
        assert_eq!(
            summary["acceptance_rate_bucket_counts"]["high"].as_u64(),
            Some(1)
        );
        assert_eq!(
            summary["acceptance_rate_bucket_counts"]["medium"].as_u64(),
            Some(1)
        );
    }

    #[test]
    fn outcome_ranked_proactive_suggestions_trims_after_reprioritization() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "simulator-review:exact-surface".to_string(),
            total: 8,
            accepted: 6,
            acceptance_rate: 0.75,
            status: "trusted".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "fresh-ordinary",
                "content": {
                    "heuristic_id": "fresh-ordinary"
                }
            }),
            serde_json::json!({
                "id": "simulator-trusted-exact",
                "content": {
                    "kind": "simulator_approval_preview",
                    "heuristic_id": "simulator-review:exact-surface"
                }
            }),
            serde_json::json!({
                "id": "ordinary-trusted-exact",
                "content": {
                    "heuristic_id": "simulator-review:exact-surface"
                }
            }),
        ];

        let ranked = outcome_ranked_proactive_suggestions(
            suggestions,
            &feedback,
            &AgentPreferences::default(),
            1,
        );

        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0]["id"].as_str(), Some("simulator-trusted-exact"));
    }

    #[test]
    fn build_proactive_suggestions_response_carries_preferred_continuity_fields() {
        let items = vec![serde_json::json!({
            "id": "suggestion_1",
            "content": { "description": "Review your upcoming meeting" }
        })];
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["thread:aurora".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                        id: "rq_1".to_string(),
                        label: "Aurora rollout thread".to_string(),
                        channel: "chat".to_string(),
                        urgency: "today".to_string(),
                        confidence: "high".to_string(),
                        response_due_hint: "Today".to_string(),
                        source_refs: vec!["thread:aurora".to_string()],
                        suggested_next_action: "Reply in thread".to_string(),
                    }],
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review your schedule".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: Some("synthesis_1".to_string()),
            latest_state_snapshot: Some(continuity_state.clone()),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: Some(DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Review your schedule".to_string(),
                decision_count: 1,
                commitment_count: 2,
                critical_change_count: 0,
                suggested_actions: vec!["Review your schedule".to_string()],
                staleness_at: Some("2026-06-03T12:00:00Z".to_string()),
            }),
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "medium".to_string(),
                surface_recommendation: "decision_queue".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Review your schedule".to_string()],
                escalation_required: true,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: false,
                prepared_context_summary: None,
                prepared_draft_ready: false,
                prepared_draft_summary: None,
                follow_up_write_candidate: None,
                decrypt_trace: None,
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
            }),
            preferred_priority_item: Some(ContinuityPriorityItem {
                title: "Review your schedule".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                surface_hint: Some("decision_queue".to_string()),
                suggested_action: Some("Review your schedule".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                source_refs: vec!["thread:aurora".to_string()],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_priority_card: Some(ContinuityPriorityCard {
                title: "Review your schedule".to_string(),
                description: "Review your schedule requires explicit approval.".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                action_label: "Review your schedule".to_string(),
                surface_hint: Some("decision_queue".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                approval_or_reversibility_hint: None,
                provenance_cue: None,
                autonomy_tier: None,
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                working_set_refs: Vec::new(),
                active_topic_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                project_refs: Vec::new(),
                thread_refs: Vec::new(),
                linked_target_label: None,
                source_refs: vec!["thread:aurora".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                thread_retrieval_state: None,
                autonomy_decision: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let response =
            build_proactive_suggestions_response(items, continuity_summary, None, Vec::new(), None);
        assert_eq!(response.count, 2);
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["kind"].as_str()),
            Some("continuity_priority")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["linked_target_label"].as_str()),
            Some("Aurora rollout thread")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["autonomy_tier"].as_str()),
            Some("ask_always")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["autonomy_decision"]["autonomy_level"].as_str()),
            Some("request_approval")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["provenance_cue"].as_str()),
            Some("Traceable to the currently linked continuity sources behind this suggestion.")
        );
        assert_eq!(
            response
                .continuity_state
                .as_ref()
                .map(|state| state.id.as_str()),
            Some("snapshot_1")
        );
        assert_eq!(
            response
                .continuity_brief
                .as_ref()
                .map(|brief| brief.title.as_str()),
            Some("Review your schedule")
        );
        assert_eq!(
            response
                .continuity_handoff
                .as_ref()
                .map(|handoff| handoff.surface_recommendation.as_str()),
            Some("decision_queue")
        );
        assert_eq!(
            response.continuity_surface_hint.as_deref(),
            Some("decision_queue")
        );
        assert!(response.continuity_requires_approval);
        assert_eq!(response.continuity_panel_kind, "approval_queue");
        assert_eq!(response.continuity_primary_mode, "priority_card");
        assert_eq!(
            response
                .continuity_priority_item
                .as_ref()
                .map(|item| item.panel_kind.as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            response
                .continuity_priority_card
                .as_ref()
                .map(|card| card.panel_kind.as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            response
                .continuity_priority_card
                .as_ref()
                .and_then(|card| card.linked_target_label.as_deref()),
            Some("Aurora rollout thread")
        );
        assert!(response.cost_status.is_none());
    }

    #[test]
    fn normalize_proactive_suggestion_contract_backfills_missing_trust_fields() {
        let items = normalize_proactive_suggestion_contract(vec![serde_json::json!({
            "id": "context_pack_1",
            "kind": "context_pack",
            "title": "Prepared context pack",
            "description": "Context pack ready for review.",
            "requires_approval": false,
            "source_refs": ["msg_1", "msg_2"]
        })]);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["autonomy_tier"].as_str(), Some("notify_then_act"));
        assert_eq!(
            items[0]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
        assert_eq!(
            items[0]["selection_reason"].as_str(),
            Some(
                "Related context was assembled because the current continuity state points to this neighborhood now."
            )
        );
        assert_eq!(
            items[0]["approval_or_reversibility_hint"].as_str(),
            Some(
                "Opening this suggestion reveals prepared context only; it does not execute a side effect."
            )
        );
        assert_eq!(
            items[0]["provenance_cue"].as_str(),
            Some("Traceable to the currently linked continuity sources behind this suggestion.")
        );
        assert_eq!(items[0]["source_count"].as_u64(), Some(2));
    }

    #[test]
    fn normalize_proactive_suggestion_contract_rewrites_invalid_autonomy_tier() {
        let items = normalize_proactive_suggestion_contract(vec![serde_json::json!({
            "id": "priority_1",
            "kind": "continuity_priority",
            "title": "Review renewal path",
            "description": "Prepared support is ready.",
            "requires_approval": true,
            "autonomy_tier": "definitely_auto"
        })]);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["autonomy_tier"].as_str(), Some("ask_always"));
        assert_eq!(
            items[0]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("request_approval")
        );
    }

    #[test]
    fn canonical_proactive_autonomy_tier_normalizes_valid_values() {
        assert_eq!(
            canonical_proactive_autonomy_tier(" notify_then_act "),
            Some("notify_then_act")
        );
        assert_eq!(
            canonical_proactive_autonomy_tier("auto_execute"),
            Some("auto_execute")
        );
        assert_eq!(canonical_proactive_autonomy_tier("definitely_auto"), None);
    }

    #[test]
    fn build_proactive_suggestions_response_surfaces_context_pack_reference_labels() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![ContinuityPreparedContextPackItem {
                id: "topic_1".to_string(),
                pack_kind: "topic_pack".to_string(),
                title: "Aurora topic pack".to_string(),
                summary: "Bounded topic continuity across linked work.".to_string(),
                confidence: "high".to_string(),
                why_surfaced: "Surfaced from linked project continuity.".to_string(),
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                anchor_refs: vec!["msg_1".to_string()],
                source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                reference_refs: vec!["thread:aurora".to_string()],
                reference_labels: vec!["Aurora rollout thread".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                thread_retrieval_state: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            preferred_state_fields: Vec::new(),
        };

        let response = build_proactive_suggestions_response(
            Vec::new(),
            continuity_summary,
            None,
            Vec::new(),
            None,
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["kind"].as_str()),
            Some("context_pack")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["reference_labels"].as_array())
                .map(|labels| labels.len()),
            Some(1)
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["artifact_summary_lines"].as_array())
                .and_then(|lines| lines.get(2))
                .and_then(|line| line.as_str()),
            Some("Linked objects: Aurora rollout thread")
        );
    }

    #[test]
    fn build_proactive_suggestions_response_emits_bounded_observability_summary() {
        let items = vec![
            serde_json::json!({
                "id": "prepared-draft:1",
                "kind": "prepared_draft",
                "surface_hint": "response_queue",
                "readiness": "ready_now",
                "requires_approval": false,
                "source_refs": ["msg_1", "msg_2"],
                "source_count": 2,
            }),
            serde_json::json!({
                "id": "context-pack:1",
                "kind": "context_pack",
                "surface_hint": "context_panel",
                "readiness": "ready_now",
                "requires_approval": true,
                "source_refs": ["msg_3"],
                "source_count": 1,
            }),
            serde_json::json!({
                "id": "prepared-draft:2",
                "kind": "prepared_draft",
                "surface_hint": "response_queue",
                "readiness": "later",
                "requires_approval": false,
                "source_refs": ["msg_4", "msg_5", "msg_6"],
                "source_count": 3,
            }),
        ];
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let response =
            build_proactive_suggestions_response(items, continuity_summary, None, Vec::new(), None);
        assert_eq!(
            response.observability["dominant_kind"].as_str(),
            Some("prepared_draft")
        );
        assert_eq!(
            response.observability["dominant_surface"].as_str(),
            Some("response_queue")
        );
        assert_eq!(response.observability["ready_now_count"].as_u64(), Some(2));
        assert_eq!(
            response.observability["approval_required_count"].as_u64(),
            Some(1)
        );
        assert_eq!(response.observability["grounded_count"].as_u64(), Some(2));
        assert_eq!(
            response.observability["kind_counts"]["prepared_draft"].as_u64(),
            Some(2)
        );
        assert_eq!(
            response.observability["surface_counts"]["response_queue"].as_u64(),
            Some(2)
        );
    }

    #[test]
    fn proactive_response_can_promote_cost_warning_into_priority() {
        let items = vec![serde_json::json!({
            "id": "suggestion_1",
            "content": { "description": "Review your upcoming meeting" }
        })];
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let response = build_proactive_suggestions_response(
            items,
            continuity_summary,
            Some(DashboardCostStatus {
                level: "warning".to_string(),
                title: "Budget pressure is high".to_string(),
                detail: "You are over budget.".to_string(),
                action_label: "Review cost limits".to_string(),
            }),
            Vec::new(),
            None,
        );

        assert_eq!(response.count, 2);
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["kind"].as_str()),
            Some("continuity_priority")
        );
        assert_eq!(response.continuity_panel_kind, "decision_queue");
        assert_eq!(response.continuity_primary_mode, "priority_card");
        assert_eq!(
            response
                .continuity_priority_card
                .as_ref()
                .map(|card| card.title.as_str()),
            Some("Budget pressure is high")
        );
        assert_eq!(
            response
                .cost_status
                .as_ref()
                .map(|status| status.level.as_str()),
            Some("warning")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_prepends_continuity_priority_item() {
        let suggestions = vec![serde_json::json!({
            "id": "suggestion_1",
            "content": { "description": "Review your upcoming meeting" }
        })];
        let priority = ContinuityPriorityItem {
            title: "Approve the suggested action".to_string(),
            panel_kind: "approval_queue".to_string(),
            requires_approval: true,
            surface_hint: Some("decision_queue".to_string()),
            suggested_action: Some("Approve the suggested action".to_string()),
            confidence: Some("medium".to_string()),
            prepared_draft_class: None,
            selection_reason: None,
            source_refs: vec!["msg_1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let priority_card = ContinuityPriorityCard {
            title: "Approve the suggested action".to_string(),
            description: "Approve the suggested action requires explicit approval.".to_string(),
            panel_kind: "approval_queue".to_string(),
            requires_approval: true,
            action_label: "Approve the suggested action".to_string(),
            surface_hint: Some("decision_queue".to_string()),
            confidence: Some("medium".to_string()),
            prepared_draft_class: None,
            selection_reason: None,
            approval_or_reversibility_hint: None,
            provenance_cue: None,
            autonomy_tier: None,
            retrieval_mode: None,
            deeper_retrieval_recommended: false,
            readiness_reason: None,
            topology_budget_used: 0,
            working_set_count: 0,
            active_topic_count: 0,
            working_set_refs: Vec::new(),
            active_topic_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            project_refs: Vec::new(),
            thread_refs: Vec::new(),
            linked_target_label: Some("Aurora rollout thread".to_string()),
            source_refs: vec!["msg_1".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            file_refs: Vec::new(),
            file_labels: Vec::new(),
            thread_retrieval_state: None,
            autonomy_decision: None,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let prioritized = prioritize_proactive_suggestions(
            suggestions,
            Some(&priority),
            Some(&priority_card),
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(prioritized.len(), 2);
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("continuity_priority")
        );
        assert_eq!(
            prioritized
                .first()
                .and_then(|item| item["panel_kind"].as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            prioritized
                .first()
                .and_then(|item| item["destination_view"].as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            prioritized
                .first()
                .and_then(|item| item["action_label"].as_str()),
            Some("Open priority")
        );
        assert_eq!(
            prioritized
                .first()
                .and_then(|item| item["linked_target_label"].as_str()),
            Some("Aurora rollout thread")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_skips_prepared_reply_priority_mirror_when_draft_exists() {
        let suggestions = vec![serde_json::json!({
            "id": "suggestion_1",
            "kind": "generic_nudge",
            "title": "Generic nudge",
        })];
        let priority = ContinuityPriorityItem {
            title: "Prepared 1 communication reply draft for review.".to_string(),
            panel_kind: "response_queue".to_string(),
            requires_approval: false,
            surface_hint: Some("response_queue".to_string()),
            suggested_action: Some("Open responses".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: Some("communication_reply".to_string()),
            selection_reason: Some("Prepared reply is already aligned.".to_string()),
            source_refs: vec!["msg_1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let priority_card = ContinuityPriorityCard {
            title: "Prepared 1 communication reply draft for review.".to_string(),
            description: "Prepared response is ready for review.".to_string(),
            panel_kind: "response_queue".to_string(),
            requires_approval: false,
            action_label: "Open responses".to_string(),
            surface_hint: Some("response_queue".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: Some("communication_reply".to_string()),
            selection_reason: Some("Prepared reply is already aligned.".to_string()),
            approval_or_reversibility_hint: None,
            provenance_cue: None,
            autonomy_tier: None,
            retrieval_mode: None,
            deeper_retrieval_recommended: false,
            readiness_reason: None,
            topology_budget_used: 0,
            working_set_count: 0,
            active_topic_count: 0,
            working_set_refs: Vec::new(),
            active_topic_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            project_refs: Vec::new(),
            thread_refs: Vec::new(),
            linked_target_label: None,
            source_refs: vec!["msg_1".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            file_refs: Vec::new(),
            file_labels: Vec::new(),
            thread_retrieval_state: None,
            autonomy_decision: None,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let prepared_draft = serde_json::json!({
            "id": "prepared_draft_1",
            "kind": "prepared_draft",
            "title": "Reply draft for supplier",
            "draft_class": "communication_reply",
        });

        let prioritized = prioritize_proactive_suggestions(
            suggestions,
            Some(&priority),
            Some(&priority_card),
            Some(prepared_draft),
            None,
            None,
            None,
            None,
        );
        assert_eq!(prioritized.len(), 2);
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("prepared_draft")
        );
        assert!(
            !prioritized
                .iter()
                .any(|item| item["kind"].as_str() == Some("continuity_priority"))
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_skips_prepared_context_priority_mirror_when_context_exists()
    {
        let suggestions = vec![serde_json::json!({
            "id": "suggestion_1",
            "kind": "generic_nudge",
            "title": "Generic nudge",
        })];
        let priority = ContinuityPriorityItem {
            title: "Prepared context ready: 1 context pack.".to_string(),
            panel_kind: "context_panel".to_string(),
            requires_approval: false,
            surface_hint: Some("context_panel".to_string()),
            suggested_action: Some("Open context".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: Some(
                "Selected prepared context because the continuity intent already points toward context review."
                    .to_string(),
            ),
            source_refs: vec!["msg_2".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let priority_card = ContinuityPriorityCard {
            title: "Prepared context ready: 1 context pack.".to_string(),
            description: "Prepared context is ready for review.".to_string(),
            panel_kind: "context_panel".to_string(),
            requires_approval: false,
            action_label: "Open context".to_string(),
            surface_hint: Some("context_panel".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: Some(
                "Selected prepared context because the continuity intent already points toward context review."
                    .to_string(),
            ),
            approval_or_reversibility_hint: None,
            provenance_cue: None,
            autonomy_tier: None,
            retrieval_mode: None,
            deeper_retrieval_recommended: false,
            readiness_reason: None,
            topology_budget_used: 0,
            working_set_count: 0,
            active_topic_count: 0,
            working_set_refs: Vec::new(),
            active_topic_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            project_refs: Vec::new(),
            thread_refs: Vec::new(),
            linked_target_label: None,
            source_refs: vec!["msg_2".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            file_refs: Vec::new(),
            file_labels: Vec::new(),
            thread_retrieval_state: None,
            autonomy_decision: None,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let context_ready = serde_json::json!({
            "id": "context_ready_1",
            "kind": "context_ready",
            "title": "Prepared context ready",
        });

        let prioritized = prioritize_proactive_suggestions(
            suggestions,
            Some(&priority),
            Some(&priority_card),
            None,
            Some(context_ready),
            None,
            None,
            None,
        );
        assert_eq!(prioritized.len(), 2);
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("context_ready")
        );
        assert!(
            !prioritized
                .iter()
                .any(|item| item["kind"].as_str() == Some("continuity_priority"))
        );
    }

    #[test]
    fn synthetic_continuity_priority_suggestion_carries_refs_and_label() {
        let priority = ContinuityPriorityItem {
            title: "Approve the suggested action".to_string(),
            panel_kind: "approval_queue".to_string(),
            requires_approval: true,
            surface_hint: Some("decision_queue".to_string()),
            suggested_action: Some("Approve the suggested action".to_string()),
            confidence: Some("medium".to_string()),
            prepared_draft_class: None,
            selection_reason: Some("Escalated from continuity state.".to_string()),
            source_refs: vec!["thread:aurora".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let priority_card = ContinuityPriorityCard {
            title: "Approve the suggested action".to_string(),
            description: "Approve the suggested action requires explicit approval.".to_string(),
            panel_kind: "approval_queue".to_string(),
            requires_approval: true,
            action_label: "Approve the suggested action".to_string(),
            surface_hint: Some("decision_queue".to_string()),
            confidence: Some("medium".to_string()),
            prepared_draft_class: None,
            selection_reason: Some("Escalated from continuity state.".to_string()),
            approval_or_reversibility_hint: None,
            provenance_cue: None,
            autonomy_tier: None,
            retrieval_mode: None,
            deeper_retrieval_recommended: false,
            readiness_reason: None,
            topology_budget_used: 0,
            working_set_count: 0,
            active_topic_count: 0,
            working_set_refs: Vec::new(),
            active_topic_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            project_refs: Vec::new(),
            thread_refs: Vec::new(),
            linked_target_label: Some("Aurora rollout thread".to_string()),
            source_refs: vec!["thread:aurora".to_string()],
            object_refs: vec!["project_aurora".to_string()],
            object_labels: vec!["Project topic pack".to_string()],
            file_refs: vec!["file:docs/launch-brief.md".to_string()],
            file_labels: vec!["launch-brief.md".to_string()],
            thread_retrieval_state: Some(serde_json::json!({
                "summary": "Surfaced around aurora. Dormant but strongly linked context is being reactivated here. Approval remains in the loop.",
                "badges": [
                    "thread-linked",
                    "object-linked",
                    "file-linked",
                    "reactivated-neighborhood",
                    "priority-driven",
                    "approval-sensitive"
                ]
            })),
            autonomy_decision: None,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let item = synthetic_continuity_priority_suggestion(&priority, Some(&priority_card));
        assert_eq!(item["kind"].as_str(), Some("continuity_priority"));
        assert_eq!(
            item["linked_target_label"].as_str(),
            Some("Aurora rollout thread")
        );
        assert_eq!(item["retrieval_mode"].as_str(), None);
        assert_eq!(item["deeper_retrieval_recommended"].as_bool(), Some(false));
        assert_eq!(item["readiness_reason"].as_str(), None);
        assert_eq!(
            item["source_refs"].as_array().map(|refs| refs.len()),
            Some(1)
        );
        assert_eq!(
            item["object_refs"].as_array().map(|refs| refs.len()),
            Some(1)
        );
        assert_eq!(
            item["object_labels"]
                .as_array()
                .and_then(|labels| labels.first())
                .and_then(Value::as_str),
            Some("Project topic pack")
        );
        assert_eq!(
            item["file_labels"]
                .as_array()
                .and_then(|labels| labels.first())
                .and_then(Value::as_str),
            Some("launch-brief.md")
        );
        assert_eq!(
            item["selection_reason"].as_str(),
            Some("Escalated from continuity state.")
        );
        assert_eq!(
            item["artifact_summary_lines"]
                .as_array()
                .map(|lines| lines.len()),
            Some(1)
        );
        assert_eq!(
            item["thread_retrieval_state"]["badges"]
                .as_array()
                .map(|badges| badges.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "thread-linked",
                "object-linked",
                "file-linked",
                "reactivated-neighborhood",
                "priority-driven",
                "approval-sensitive",
            ])
        );
        assert_eq!(
            item["thread_retrieval_state"]["summary"].as_str(),
            Some(
                "Surfaced around aurora. Dormant but strongly linked context is being reactivated here. Approval remains in the loop."
            )
        );
    }

    #[test]
    fn synthetic_continuity_priority_suggestion_preserves_prepared_context_trust_metadata() {
        let priority = ContinuityPriorityItem {
            title: "Prepared context ready: 1 context pack.".to_string(),
            panel_kind: "context_panel".to_string(),
            requires_approval: false,
            surface_hint: Some("context_panel".to_string()),
            suggested_action: Some("Open context".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: Some(
                "Selected prepared context because the continuity intent already points toward context review."
                    .to_string(),
            ),
            source_refs: vec!["thread:aurora".to_string()],
            memory_space: Some("work".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("human".to_string()),
            author_id: Some("user_01".to_string()),
            is_human_authored: Some(true),
            human_only: Some(true),
        };

        let priority_card = ContinuityPriorityCard {
            title: "Prepared context ready: 1 context pack.".to_string(),
            description: "Prepared context is ready for review.".to_string(),
            panel_kind: "context_panel".to_string(),
            requires_approval: false,
            action_label: "Open context".to_string(),
            surface_hint: Some("context_panel".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: priority.selection_reason.clone(),
            approval_or_reversibility_hint: None,
            provenance_cue: None,
            autonomy_tier: None,
            retrieval_mode: Some("metadata_first_with_deepening".to_string()),
            deeper_retrieval_recommended: true,
            readiness_reason: Some(
                "Metadata-first support is ready, but one decrypt-gated anchor warrants selective deeper retrieval."
                    .to_string(),
            ),
            topology_budget_used: 6,
            working_set_count: 4,
            active_topic_count: 2,
            working_set_refs: Vec::new(),
            active_topic_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            project_refs: Vec::new(),
            thread_refs: Vec::new(),
            linked_target_label: Some("Aurora rollout thread".to_string()),
            source_refs: vec!["thread:aurora".to_string()],
            object_refs: vec!["project_aurora".to_string()],
            object_labels: vec!["Project topic pack".to_string()],
            file_refs: vec!["file:docs/launch-brief.md".to_string()],
            file_labels: vec!["launch-brief.md".to_string()],
            thread_retrieval_state: None,
            autonomy_decision: None,
            memory_space: Some("work".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("human".to_string()),
            author_id: Some("user_01".to_string()),
            is_human_authored: Some(true),
            human_only: Some(true),
        };

        let item = synthetic_continuity_priority_suggestion(&priority, Some(&priority_card));
        assert_eq!(
            item["retrieval_mode"].as_str(),
            Some("metadata_first_with_deepening")
        );
        assert_eq!(item["deeper_retrieval_recommended"].as_bool(), Some(true));
        assert_eq!(
            item["readiness_reason"].as_str(),
            Some(
                "Metadata-first support is ready, but one decrypt-gated anchor warrants selective deeper retrieval."
            )
        );
        assert_eq!(item["topology_budget_used"].as_u64(), Some(6));
        assert_eq!(item["working_set_count"].as_u64(), Some(4));
        assert_eq!(item["active_topic_count"].as_u64(), Some(2));
        assert_eq!(
            item["artifact_summary_lines"]
                .as_array()
                .map(|lines| lines.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "Selected prepared context because the continuity intent already points toward context review.",
                "Metadata-first support is ready, but one decrypt-gated anchor warrants selective deeper retrieval.",
                "metadata_first_with_deepening with deeper retrieval recommended.",
                "Topology budget used: 6",
                "Working set refs: 4",
                "Active topic anchors: 2",
                "Scope: work context, human-grounded",
            ])
        );
    }

    #[test]
    fn synthetic_continuity_priority_suggestion_includes_scope_summary_when_grounded() {
        let priority = ContinuityPriorityItem {
            title: "Reply to team".to_string(),
            panel_kind: "response_queue".to_string(),
            requires_approval: false,
            surface_hint: Some("response_queue".to_string()),
            suggested_action: Some("Reply in thread".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: Some("communication_reply".to_string()),
            selection_reason: Some("Prepared reply is already aligned.".to_string()),
            source_refs: vec!["thread:aurora".to_string()],
            memory_space: Some("work".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("human".to_string()),
            author_id: Some("user_01".to_string()),
            is_human_authored: Some(true),
            human_only: Some(true),
        };

        let item = synthetic_continuity_priority_suggestion(&priority, None);
        let lines = item["artifact_summary_lines"]
            .as_array()
            .expect("summary lines should be present");
        assert!(
            lines
                .iter()
                .any(|line| { line.as_str() == Some("Prepared reply is already aligned.") })
        );
        assert!(
            lines
                .iter()
                .any(|line| { line.as_str() == Some("Scope: work context, human-grounded") })
        );
        assert_eq!(item["memory_space"].as_str(), Some("work"));
        assert_eq!(item["author_mask"].as_str(), Some("private"));
        assert_eq!(item["author_type"].as_str(), Some("human"));
        assert_eq!(item["is_human_authored"].as_bool(), Some(true));
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_prepared_artifacts_over_generic_nudges() {
        let suggestions = vec![
            serde_json::json!({
                "id": "suggestion_generic",
                "kind": "heuristic",
                "title": "Review your upcoming meeting",
                "confidence": "high"
            }),
            serde_json::json!({
                "id": "suggestion_prepared",
                "kind": "prepared_draft",
                "draft_class": "meeting_brief",
                "title": "Meeting brief for supplier sync",
                "confidence": "medium",
                "readiness": "ready_now",
                "requires_approval": false
            }),
        ];

        let prioritized =
            prioritize_proactive_suggestions(suggestions, None, None, None, None, None, None, None);
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("prepared_draft")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_decision_support_over_routine_reply() {
        let suggestions = vec![
            serde_json::json!({
                "id": "suggestion_reply",
                "kind": "prepared_draft",
                "draft_class": "communication_reply",
                "title": "Reply draft for internal sync",
                "confidence": "high",
                "readiness": "ready_now",
                "response_due_hint": "next day",
                "requires_approval": false
            }),
            serde_json::json!({
                "id": "suggestion_comparison",
                "kind": "prepared_draft",
                "draft_class": "comparison_table",
                "title": "Decision comparison table",
                "confidence": "medium",
                "readiness": "ready_now",
                "requires_approval": false
            }),
        ];

        let prioritized =
            prioritize_proactive_suggestions(suggestions, None, None, None, None, None, None, None);
        assert_eq!(
            prioritized
                .first()
                .and_then(|item| item["draft_class"].as_str()),
            Some("comparison_table")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_places_context_pack_above_generic_nudges() {
        let suggestions = vec![serde_json::json!({
            "id": "suggestion_generic",
            "kind": "heuristic",
            "title": "Check something later",
            "confidence": "high"
        })];
        let context_pack = serde_json::json!({
            "id": "context-pack:topic_1",
            "kind": "context_pack",
            "pack_kind": "topic_pack",
            "title": "Project topic pack",
            "confidence": "medium"
        });

        let prioritized = prioritize_proactive_suggestions(
            suggestions,
            None,
            None,
            None,
            None,
            Some(context_pack),
            None,
            None,
        );
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("context_pack")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_context_pack_with_reference_refs() {
        let suggestions = vec![
            serde_json::json!({
                "id": "context-pack:plain",
                "kind": "context_pack",
                "pack_kind": "topic_pack",
                "title": "Project topic pack",
                "confidence": "high",
                "source_refs": ["msg_1"]
            }),
            serde_json::json!({
                "id": "context-pack:linked",
                "kind": "context_pack",
                "pack_kind": "topic_pack",
                "title": "Linked project topic pack",
                "confidence": "high",
                "source_refs": ["msg_1"],
                "reference_refs": ["project_aurora"]
            }),
        ];

        let prioritized =
            prioritize_proactive_suggestions(suggestions, None, None, None, None, None, None, None);
        assert_eq!(
            prioritized.first().and_then(|item| item["id"].as_str()),
            Some("context-pack:linked")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_demotes_suppressed_watcher_reminder_below_generic_nudge() {
        let suggestions = vec![
            serde_json::json!({
                "id": "watcher_suppressed",
                "type": "smart_suggestion",
                "kind": "heuristic",
                "title": "Take a study break",
                "confidence": "high",
                "metadata": {
                    "empathetic_explanation": "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.",
                    "emotional_decay": {
                        "suppressed_until": "2099-06-06T09:30:00Z"
                    }
                }
            }),
            serde_json::json!({
                "id": "generic_nudge",
                "kind": "heuristic",
                "title": "Review your upcoming meeting",
                "confidence": "high"
            }),
        ];

        let prioritized =
            prioritize_proactive_suggestions(suggestions, None, None, None, None, None, None, None);
        assert_eq!(
            prioritized.first().and_then(|item| item["id"].as_str()),
            Some("generic_nudge")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_keeps_trusted_watcher_alert_at_parity() {
        let suggestions = vec![
            serde_json::json!({
                "id": "watcher_trusted",
                "type": "watcher_alert",
                "kind": "heuristic",
                "title": "Follow up with partner thread",
                "confidence": "high",
                "metadata": {
                    "empathetic_explanation": "This heuristic has been helpful before, so its context is retained for about 21 days."
                }
            }),
            serde_json::json!({
                "id": "generic_nudge",
                "kind": "heuristic",
                "title": "Review your upcoming meeting",
                "confidence": "high"
            }),
        ];

        let prioritized =
            prioritize_proactive_suggestions(suggestions, None, None, None, None, None, None, None);
        assert_eq!(
            prioritized.first().and_then(|item| item["id"].as_str()),
            Some("watcher_trusted")
        );
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_relationship_aligned_draft_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_summary: Some(
                "Relationship field shows high pressure with density 0.72 and momentum -0.41."
                    .to_string(),
            ),
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_project".to_string(),
                draft_class: "project_prep_note".to_string(),
                title: "Aurora prep note".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared project note".to_string(),
                body: "- Check blockers".to_string(),
                confidence: "high".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review prepared context".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["thread:aurora".to_string()],
                object_refs: vec!["project_aurora".to_string()],
                object_labels: vec!["project aurora".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_follow_up".to_string(),
                draft_class: "follow_up_draft".to_string(),
                title: "Partner follow-up".to_string(),
                channel: "email".to_string(),
                summary: "Prepared follow-up".to_string(),
                body: "- Reconnect on the open thread".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: "Today".to_string(),
                requires_approval: false,
                suggested_action: "Review follow-up".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["thread:partner".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("follow_up_draft"));
        assert_eq!(
            suggestion["selection_reason"].as_str(),
            Some(
                "Field-guided: Relationship field shows high pressure with density 0.72 and momentum -0.41."
            )
        );
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_project_aligned_pack_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_summary: Some(
                "Project field shows active pressure with density 0.63 and momentum -0.32."
                    .to_string(),
            ),
            ..Default::default()
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_relationship".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Relationship continuity pack".to_string(),
                    summary: "Relationship-linked context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from follow-up continuity.".to_string(),
                    anchor_refs: vec!["msg_rel".to_string()],
                    source_refs: vec!["msg_rel".to_string()],
                    reference_refs: Vec::new(),
                    reference_labels: Vec::new(),
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    evidence_kinds: vec!["relationship".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_project".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Aurora project pack".to_string(),
                    summary: "Project-linked context.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from linked project continuity.".to_string(),
                    anchor_refs: vec!["msg_proj".to_string()],
                    source_refs: vec!["msg_proj".to_string()],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, Some(&handoff))
            .expect("context pack suggestion");
        assert_eq!(suggestion["title"].as_str(), Some("Aurora project pack"));
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_user_grounded_pack_when_other_ranks_tie() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_generic".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Generic context pack".to_string(),
                    summary: "General project context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from current project continuity.".to_string(),
                    anchor_refs: vec!["msg_generic".to_string()],
                    source_refs: vec!["msg_generic".to_string()],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_user".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "User-grounded context pack".to_string(),
                    summary: "General project context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from current project continuity.".to_string(),
                    retrieval_mode: None,
                    deeper_retrieval_recommended: false,
                    readiness_reason: None,
                    topology_budget_used: 0,
                    working_set_count: 0,
                    active_topic_count: 0,
                    anchor_refs: vec!["msg_user".to_string()],
                    source_refs: vec!["msg_user".to_string()],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    memory_space: Some("work".to_string()),
                    author_mask: Some("me".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(true),
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, None)
            .expect("context pack suggestion");
        assert_eq!(
            suggestion["title"].as_str(),
            Some("User-grounded context pack")
        );
        assert_eq!(suggestion["memory_space"].as_str(), Some("work"));
        assert_eq!(suggestion["author_mask"].as_str(), Some("me"));
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_file_linked_pack_when_other_ranks_tie() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_plain".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Plain context pack".to_string(),
                    summary: "General project context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from current project continuity.".to_string(),
                    anchor_refs: vec!["msg_plain".to_string()],
                    source_refs: vec!["msg_plain".to_string()],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_file".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "File-linked context pack".to_string(),
                    summary: "General project context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from current project continuity.".to_string(),
                    anchor_refs: vec!["msg_file".to_string()],
                    source_refs: vec!["msg_file".to_string()],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: vec!["file:docs/launch-brief.md".to_string()],
                    file_labels: vec!["launch-brief.md".to_string()],
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, None)
            .expect("context pack suggestion");
        assert_eq!(
            suggestion["title"].as_str(),
            Some("File-linked context pack")
        );
        assert_eq!(
            suggestion["file_labels"][0].as_str(),
            Some("launch-brief.md")
        );
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_more_evidenced_pack_when_other_ranks_tie() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_light".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Light context pack".to_string(),
                    summary: "General project context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from current project continuity.".to_string(),
                    anchor_refs: vec!["msg_plain".to_string()],
                    source_refs: vec!["msg_plain".to_string()],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_grounded".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Grounded context pack".to_string(),
                    summary: "General project context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from current project continuity.".to_string(),
                    anchor_refs: vec!["msg_grounded".to_string()],
                    source_refs: vec![
                        "msg_grounded".to_string(),
                        "thread:aurora".to_string(),
                        "file:brief".to_string(),
                    ],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, None)
            .expect("context pack suggestion");
        assert_eq!(suggestion["title"].as_str(), Some("Grounded context pack"));
        assert_eq!(
            suggestion["id"].as_str(),
            Some("context-pack:pack_grounded")
        );
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_obligation_pack_when_scope_ties() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_topic".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Project topic pack".to_string(),
                    summary: "Linked project continuity.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from linked project continuity.".to_string(),
                    retrieval_mode: None,
                    deeper_retrieval_recommended: false,
                    readiness_reason: None,
                    topology_budget_used: 0,
                    working_set_count: 0,
                    active_topic_count: 0,
                    anchor_refs: vec!["msg_project".to_string()],
                    source_refs: vec!["msg_project".to_string()],
                    reference_refs: vec!["thread:project".to_string()],
                    reference_labels: vec!["Project thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["project".to_string()],
                    thread_retrieval_state: None,
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(true),
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_obligation".to_string(),
                    pack_kind: "obligation_pack".to_string(),
                    title: "Due obligations".to_string(),
                    summary: "Due obligations continuity.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from due commitments and active follow-up pressure."
                        .to_string(),
                    retrieval_mode: None,
                    deeper_retrieval_recommended: false,
                    readiness_reason: None,
                    topology_budget_used: 0,
                    working_set_count: 0,
                    active_topic_count: 0,
                    anchor_refs: vec!["msg_due".to_string()],
                    source_refs: vec!["msg_due".to_string()],
                    reference_refs: vec!["thread:due".to_string()],
                    reference_labels: vec!["Due thread".to_string()],
                    object_refs: vec!["task_deadline".to_string()],
                    object_labels: vec!["task deadline".to_string()],
                    file_refs: Vec::new(),
                    file_labels: Vec::new(),
                    evidence_kinds: vec!["follow_up".to_string()],
                    thread_retrieval_state: None,
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(true),
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, None)
            .expect("context pack suggestion");
        assert_eq!(
            suggestion["id"].as_str(),
            Some("context-pack:pack_obligation")
        );
        assert_eq!(suggestion["pack_kind"].as_str(), Some("obligation_pack"));
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_goal_aligned_draft_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_summary: Some(
                "Goal field shows active pressure with density 0.61 and momentum 0.28.".to_string(),
            ),
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_reply".to_string(),
                draft_class: "communication_reply".to_string(),
                title: "Stakeholder reply".to_string(),
                channel: "email".to_string(),
                summary: "Prepared reply".to_string(),
                body: "- Thanks and next step".to_string(),
                confidence: "high".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: "Today".to_string(),
                requires_approval: false,
                suggested_action: "Review and send email reply".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["thread:stakeholder".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_goal".to_string(),
                draft_class: "task_bundle".to_string(),
                title: "Launch task bundle".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared task bundle".to_string(),
                body: "- Finish prep\n- Confirm launch path".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review task bundle".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["project:launch".to_string()],
                object_refs: vec!["project_launch".to_string()],
                object_labels: vec!["project launch".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("task_bundle"));
        assert_eq!(
            suggestion["selection_reason"].as_str(),
            Some(
                "Field-guided: Goal field shows active pressure with density 0.61 and momentum 0.28."
            )
        );
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_opportunity_aligned_draft_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_summary: Some(
                "Opportunity field shows open opportunity with density 0.67 and momentum 0.42."
                    .to_string(),
            ),
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_project".to_string(),
                draft_class: "project_prep_note".to_string(),
                title: "Project prep note".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared project note".to_string(),
                body: "- Review inputs".to_string(),
                confidence: "high".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review prepared context".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["project:aurora".to_string()],
                object_refs: vec!["project_aurora".to_string()],
                object_labels: vec!["project aurora".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_opportunity".to_string(),
                draft_class: "decision_memo".to_string(),
                title: "Decision memo".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared decision memo".to_string(),
                body: "- Compare two viable paths".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review decision memo".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["msg_decision".to_string()],
                object_refs: vec!["project_aurora".to_string()],
                object_labels: vec!["project aurora".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("decision_memo"));
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_goal_aligned_pack_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_summary: Some(
                "Goal field shows active pressure with density 0.58 and momentum 0.21.".to_string(),
            ),
            ..Default::default()
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_topic".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Project topic pack".to_string(),
                    summary: "Project-linked context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from linked project continuity.".to_string(),
                    anchor_refs: vec!["msg_proj".to_string()],
                    source_refs: vec!["msg_proj".to_string()],
                    reference_refs: vec!["thread:aurora".to_string()],
                    reference_labels: vec!["Aurora rollout thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    evidence_kinds: vec!["project".to_string(), "reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_goal".to_string(),
                    pack_kind: "obligation_pack".to_string(),
                    title: "Launch obligation pack".to_string(),
                    summary: "Due-soon launch commitments.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from due-soon launch commitments.".to_string(),
                    anchor_refs: vec!["calendar_launch".to_string()],
                    source_refs: vec!["calendar_launch".to_string()],
                    reference_refs: Vec::new(),
                    reference_labels: Vec::new(),
                    object_refs: vec!["project_launch".to_string()],
                    object_labels: vec!["project launch".to_string()],
                    evidence_kinds: vec!["project".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, Some(&handoff))
            .expect("context pack suggestion");
        assert_eq!(suggestion["title"].as_str(), Some("Launch obligation pack"));
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_knowledge_aligned_draft_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_summary: Some(
                "Knowledge field shows active pressure with density 0.64 and momentum -0.18."
                    .to_string(),
            ),
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_follow_up".to_string(),
                draft_class: "follow_up_draft".to_string(),
                title: "Partner follow-up".to_string(),
                channel: "email".to_string(),
                summary: "Prepared follow-up".to_string(),
                body: "- Reconnect on the open thread".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: "Today".to_string(),
                requires_approval: false,
                suggested_action: "Review follow-up".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["thread:partner".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_knowledge".to_string(),
                draft_class: "comparison_table".to_string(),
                title: "Research comparison".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared comparison".to_string(),
                body: "- Compare two evidence paths".to_string(),
                confidence: "high".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review comparison".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["msg_research".to_string()],
                object_refs: vec!["project_aurora".to_string()],
                object_labels: vec!["project aurora".to_string()],
                comparison_headers: vec!["Option".to_string(), "Evidence".to_string()],
                comparison_rows: vec![crate::prepared_draft_packet::PreparedDraftComparisonRow {
                    label: "Option A".to_string(),
                    values: vec!["A".to_string(), "High".to_string()],
                }],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("comparison_table"));
        assert_eq!(
            suggestion["selection_reason"].as_str(),
            Some(
                "Field-guided: Knowledge field shows active pressure with density 0.64 and momentum -0.18."
            )
        );
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_interest_aligned_draft_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_primary_type: Some("interest".to_string()),
            field_engine_summary: Some(
                "Interest field shows active pressure with density 0.61 and momentum 0.22."
                    .to_string(),
            ),
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_follow_up".to_string(),
                draft_class: "follow_up_draft".to_string(),
                title: "Partner follow-up".to_string(),
                channel: "email".to_string(),
                summary: "Prepared follow-up".to_string(),
                body: "- Reconnect on the open thread".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: "Today".to_string(),
                requires_approval: false,
                suggested_action: "Review follow-up".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["thread:partner".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_interest".to_string(),
                draft_class: "comparison_table".to_string(),
                title: "Topic comparison".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared topic comparison".to_string(),
                body: "- Compare clustered references".to_string(),
                confidence: "high".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review comparison".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["msg_topic".to_string()],
                object_refs: vec!["project_interest".to_string()],
                object_labels: vec!["project interest".to_string()],
                comparison_headers: vec!["Cluster".to_string(), "Signal".to_string()],
                comparison_rows: vec![crate::prepared_draft_packet::PreparedDraftComparisonRow {
                    label: "Topic A".to_string(),
                    values: vec!["A".to_string(), "High".to_string()],
                }],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("comparison_table"));
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_obligation_aligned_draft_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_primary_type: Some("obligation".to_string()),
            field_engine_summary: Some(
                "Obligation field shows active pressure with density 0.66 and momentum 0.14."
                    .to_string(),
            ),
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_decision".to_string(),
                draft_class: "decision_memo".to_string(),
                title: "Decision memo".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared decision memo".to_string(),
                body: "- Compare options".to_string(),
                confidence: "high".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review decision memo".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["msg_decision".to_string()],
                object_refs: vec!["project_obligation".to_string()],
                object_labels: vec!["project obligation".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_obligation".to_string(),
                draft_class: "meeting_brief".to_string(),
                title: "Handoff brief".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared meeting brief".to_string(),
                body: "- Cover due commitment and follow-up".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review meeting brief".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["calendar_obligation".to_string()],
                object_refs: vec!["project_obligation".to_string()],
                object_labels: vec!["project obligation".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("meeting_brief"));
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_typed_field_focus_without_summary_text() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_primary_type: Some("knowledge".to_string()),
            field_engine_summary: None,
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_follow_up".to_string(),
                draft_class: "follow_up_draft".to_string(),
                title: "Partner follow-up".to_string(),
                channel: "email".to_string(),
                summary: "Prepared follow-up".to_string(),
                body: "- Reconnect on the open thread".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: "Today".to_string(),
                requires_approval: false,
                suggested_action: "Review follow-up".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["thread:partner".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_knowledge".to_string(),
                draft_class: "comparison_table".to_string(),
                title: "Research comparison".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared comparison".to_string(),
                body: "- Compare two evidence paths".to_string(),
                confidence: "high".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review comparison".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["msg_research".to_string()],
                object_refs: vec!["project_aurora".to_string()],
                object_labels: vec!["project aurora".to_string()],
                comparison_headers: vec!["Option".to_string(), "Evidence".to_string()],
                comparison_rows: vec![crate::prepared_draft_packet::PreparedDraftComparisonRow {
                    label: "Option A".to_string(),
                    values: vec!["A".to_string(), "High".to_string()],
                }],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("comparison_table"));
        assert_eq!(suggestion["selection_reason"].as_str(), None);
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_attention_aligned_draft_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_primary_type: Some("attention".to_string()),
            field_engine_summary: Some(
                "Attention field shows active pressure with density 0.68 and momentum -0.29."
                    .to_string(),
            ),
            ..Default::default()
        };
        let items = vec![
            ContinuityPreparedDraftItem {
                id: "draft_decision".to_string(),
                draft_class: "decision_memo".to_string(),
                title: "Decision memo".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared decision memo".to_string(),
                body: "- Compare options".to_string(),
                confidence: "high".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review decision memo".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["msg_decision".to_string()],
                object_refs: vec!["project_attention".to_string()],
                object_labels: vec!["project attention".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
            ContinuityPreparedDraftItem {
                id: "draft_attention".to_string(),
                draft_class: "task_bundle".to_string(),
                title: "Batch next steps".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared task bundle".to_string(),
                body: "- Batch reply and decision review".to_string(),
                confidence: "medium".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review task bundle".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["msg_attention".to_string()],
                object_refs: vec!["project_attention".to_string()],
                object_labels: vec!["project attention".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            },
        ];

        let suggestion = prepared_draft_suggestion_from_state(&items, None, Some(&handoff))
            .expect("prepared draft suggestion");
        assert_eq!(suggestion["draft_class"].as_str(), Some("task_bundle"));
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_attention_aligned_pack_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_primary_type: Some("attention".to_string()),
            field_engine_summary: Some(
                "Attention field shows active pressure with density 0.65 and momentum -0.24."
                    .to_string(),
            ),
            ..Default::default()
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_reference".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Reference context pack".to_string(),
                    summary: "Reference-backed context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from linked context.".to_string(),
                    anchor_refs: vec!["msg_reference".to_string()],
                    source_refs: vec!["msg_reference".to_string()],
                    reference_refs: vec!["thread:reference".to_string()],
                    reference_labels: vec!["Reference thread".to_string()],
                    object_refs: vec!["project_attention".to_string()],
                    object_labels: vec!["project attention".to_string()],
                    evidence_kinds: vec!["reference".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_attention".to_string(),
                    pack_kind: "obligation_pack".to_string(),
                    title: "Attention release pack".to_string(),
                    summary: "Bundle the active queue before context splits further.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from stacked decision and reply pressure.".to_string(),
                    anchor_refs: vec!["msg_attention".to_string()],
                    source_refs: vec!["msg_attention".to_string()],
                    reference_refs: Vec::new(),
                    reference_labels: Vec::new(),
                    object_refs: vec!["project_attention".to_string()],
                    object_labels: vec!["project attention".to_string()],
                    evidence_kinds: vec!["decision".to_string(), "follow_up".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, Some(&handoff))
            .expect("context pack suggestion");
        assert_eq!(suggestion["title"].as_str(), Some("Attention release pack"));
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_knowledge_aligned_pack_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_summary: Some(
                "Knowledge field shows active pressure with density 0.62 and momentum -0.16."
                    .to_string(),
            ),
            ..Default::default()
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_relationship".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Relationship continuity pack".to_string(),
                    summary: "Relationship-linked context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from follow-up continuity.".to_string(),
                    anchor_refs: vec!["msg_rel".to_string()],
                    source_refs: vec!["msg_rel".to_string()],
                    reference_refs: Vec::new(),
                    reference_labels: Vec::new(),
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    evidence_kinds: vec!["relationship".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_knowledge".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Evidence refresh pack".to_string(),
                    summary: "Reference-backed research context.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from stale evidence and open comparison work."
                        .to_string(),
                    anchor_refs: vec!["msg_research".to_string()],
                    source_refs: vec!["msg_research".to_string()],
                    reference_refs: vec!["thread:aurora-research".to_string()],
                    reference_labels: vec!["Aurora research thread".to_string()],
                    object_refs: vec!["project_aurora".to_string()],
                    object_labels: vec!["project aurora".to_string()],
                    evidence_kinds: vec!["reference".to_string(), "decision".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, Some(&handoff))
            .expect("context pack suggestion");
        assert_eq!(suggestion["title"].as_str(), Some("Evidence refresh pack"));
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_interest_aligned_pack_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_primary_type: Some("interest".to_string()),
            field_engine_summary: Some(
                "Interest field shows active pressure with density 0.59 and momentum 0.18."
                    .to_string(),
            ),
            ..Default::default()
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_obligation".to_string(),
                    pack_kind: "obligation_pack".to_string(),
                    title: "Commitment pack".to_string(),
                    summary: "Due commitments.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from commitments.".to_string(),
                    anchor_refs: vec!["calendar_due".to_string()],
                    source_refs: vec!["calendar_due".to_string()],
                    reference_refs: Vec::new(),
                    reference_labels: Vec::new(),
                    object_refs: vec!["project_interest".to_string()],
                    object_labels: vec!["project interest".to_string()],
                    evidence_kinds: vec!["project".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_interest".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Topic cluster pack".to_string(),
                    summary: "Clustered references around the active topic.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from linked references and object continuity."
                        .to_string(),
                    anchor_refs: vec!["msg_topic".to_string()],
                    source_refs: vec!["msg_topic".to_string()],
                    reference_refs: vec!["thread:topic".to_string()],
                    reference_labels: vec!["Topic thread".to_string()],
                    object_refs: vec!["project_interest".to_string()],
                    object_labels: vec!["project interest".to_string()],
                    evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, Some(&handoff))
            .expect("context pack suggestion");
        assert_eq!(suggestion["title"].as_str(), Some("Topic cluster pack"));
    }

    #[test]
    fn context_pack_suggestion_from_summary_prefers_obligation_aligned_pack_when_field_guided() {
        let handoff = SynthesizerToMasterHandoff {
            field_engine_ready: true,
            field_engine_primary_type: Some("obligation".to_string()),
            field_engine_summary: Some(
                "Obligation field shows active pressure with density 0.62 and momentum 0.12."
                    .to_string(),
            ),
            ..Default::default()
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![
                ContinuityPreparedContextPackItem {
                    id: "pack_topic".to_string(),
                    pack_kind: "topic_pack".to_string(),
                    title: "Topic context pack".to_string(),
                    summary: "Topic-linked context.".to_string(),
                    confidence: "medium".to_string(),
                    why_surfaced: "Surfaced from linked topic continuity.".to_string(),
                    anchor_refs: vec!["msg_topic".to_string()],
                    source_refs: vec!["msg_topic".to_string()],
                    reference_refs: vec!["thread:topic".to_string()],
                    reference_labels: vec!["Topic thread".to_string()],
                    object_refs: vec!["project_obligation".to_string()],
                    object_labels: vec!["project obligation".to_string()],
                    evidence_kinds: vec!["project".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
                ContinuityPreparedContextPackItem {
                    id: "pack_obligation".to_string(),
                    pack_kind: "obligation_pack".to_string(),
                    title: "Due commitment pack".to_string(),
                    summary: "Due commitments and follow-up context.".to_string(),
                    confidence: "high".to_string(),
                    why_surfaced: "Surfaced from due commitments and active follow-up pressure."
                        .to_string(),
                    anchor_refs: vec!["calendar_obligation".to_string()],
                    source_refs: vec!["calendar_obligation".to_string()],
                    reference_refs: Vec::new(),
                    reference_labels: Vec::new(),
                    object_refs: vec!["project_obligation".to_string()],
                    object_labels: vec!["project obligation".to_string()],
                    evidence_kinds: vec!["follow_up".to_string(), "project".to_string()],
                    thread_retrieval_state: None,
                    ..Default::default()
                },
            ],
            preferred_state_fields: Vec::new(),
        };

        let suggestion = context_pack_suggestion_from_summary(&continuity_summary, Some(&handoff))
            .expect("context pack suggestion");
        assert_eq!(suggestion["title"].as_str(), Some("Due commitment pack"));
    }

    #[test]
    fn prioritize_proactive_suggestions_places_context_ready_above_context_pack() {
        let suggestions = vec![serde_json::json!({
            "id": "suggestion_generic",
            "kind": "heuristic",
            "title": "Check something later",
            "confidence": "high"
        })];
        let context_ready = serde_json::json!({
            "id": "context-ready:prepared-context",
            "kind": "context_ready",
            "title": "Prepared context ready",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false
        });
        let context_pack = serde_json::json!({
            "id": "context-pack:topic_1",
            "kind": "context_pack",
            "pack_kind": "topic_pack",
            "title": "Project topic pack",
            "confidence": "high"
        });

        let prioritized = prioritize_proactive_suggestions(
            suggestions,
            None,
            None,
            None,
            Some(context_ready),
            Some(context_pack),
            None,
            None,
        );
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("context_ready")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_places_context_ready_above_plain_continuity_priority() {
        let suggestions = vec![serde_json::json!({
            "id": "suggestion_generic",
            "kind": "heuristic",
            "title": "Check something later",
            "confidence": "high"
        })];
        let context_ready = serde_json::json!({
            "id": "context-ready:prepared-context",
            "kind": "context_ready",
            "title": "Prepared context ready",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false
        });
        let continuity_priority = ContinuityPriorityItem {
            title: "Review continuity state".to_string(),
            panel_kind: "briefing_bar".to_string(),
            requires_approval: false,
            surface_hint: Some("briefing_bar".to_string()),
            suggested_action: Some("Check current continuity".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: Some("Current continuity suggests a review.".to_string()),
            source_refs: vec!["msg_1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let prioritized = prioritize_proactive_suggestions(
            suggestions,
            Some(&continuity_priority),
            None,
            None,
            Some(context_ready),
            None,
            None,
            None,
        );
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("context_ready")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_places_context_ready_above_generic_state_field() {
        let suggestions = vec![serde_json::json!({
            "id": "suggestion_generic",
            "kind": "heuristic",
            "title": "Check something later",
            "confidence": "high"
        })];
        let context_ready = serde_json::json!({
            "id": "context-ready:prepared-context",
            "kind": "context_ready",
            "title": "Prepared context ready",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false
        });
        let state_field = serde_json::json!({
            "id": "state-field:project_scope_drift",
            "kind": "state_field",
            "field_key": crate::state_fields::STATE_FIELD_PROJECT_SCOPE_DRIFT,
            "title": "Project scope drift",
            "confidence": "high",
            "requires_approval": false
        });

        let prioritized = prioritize_proactive_suggestions(
            suggestions,
            None,
            None,
            Some(state_field),
            Some(context_ready),
            None,
            None,
            None,
        );
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("context_ready")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_skips_response_state_field_when_prepared_response_exists() {
        let prepared_draft = serde_json::json!({
            "id": "prepared-draft:reply",
            "kind": "prepared_draft",
            "draft_class": "communication_reply",
            "title": "Prepared reply",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "surface_hint": "response_queue",
            "destination_view": "response_queue",
        });
        let state_field = serde_json::json!({
            "id": "state-field:follow_up_pressure",
            "kind": "state_field",
            "field_key": crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE,
            "title": "Follow-up pressure",
            "confidence": "high",
            "requires_approval": false,
            "surface_hint": "response_queue",
            "destination_view": "response_queue",
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![],
            None,
            None,
            Some(prepared_draft),
            None,
            None,
            Some(state_field),
            None,
        );

        assert_eq!(prioritized.len(), 1);
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("prepared_draft")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_skips_decision_state_field_when_prepared_decision_support_exists()
     {
        let prepared_draft = serde_json::json!({
            "id": "prepared-draft:decision",
            "kind": "prepared_draft",
            "draft_class": "decision_memo",
            "title": "Prepared decision memo",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "surface_hint": "decision_queue",
            "destination_view": "decision_queue",
        });
        let state_field = serde_json::json!({
            "id": "state-field:unresolved_decisions",
            "kind": "state_field",
            "field_key": crate::state_fields::STATE_FIELD_UNRESOLVED_DECISIONS,
            "title": "Unresolved decisions",
            "confidence": "high",
            "requires_approval": false,
            "surface_hint": "decision_queue",
            "destination_view": "decision_queue",
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![],
            None,
            None,
            Some(prepared_draft),
            None,
            None,
            Some(state_field),
            None,
        );

        assert_eq!(prioritized.len(), 1);
        assert_eq!(
            prioritized
                .first()
                .and_then(|item| item["draft_class"].as_str()),
            Some("decision_memo")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_keeps_approval_state_field_even_when_prepared_decision_support_exists()
     {
        let prepared_draft = serde_json::json!({
            "id": "prepared-draft:decision",
            "kind": "prepared_draft",
            "draft_class": "decision_memo",
            "title": "Prepared decision memo",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "surface_hint": "decision_queue",
            "destination_view": "decision_queue",
        });
        let state_field = serde_json::json!({
            "id": "state-field:approval_required_work",
            "kind": "state_field",
            "field_key": crate::state_fields::STATE_FIELD_APPROVAL_REQUIRED_WORK,
            "title": "Approval required work",
            "confidence": "high",
            "requires_approval": true,
            "surface_hint": "decision_queue",
            "destination_view": "decision_queue",
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![],
            None,
            None,
            Some(prepared_draft),
            None,
            None,
            Some(state_field),
            None,
        );

        assert_eq!(prioritized.len(), 2);
        assert!(prioritized.iter().any(|item| {
            item["field_key"].as_str()
                == Some(crate::state_fields::STATE_FIELD_APPROVAL_REQUIRED_WORK)
        }));
    }

    #[test]
    fn synthetic_context_pack_suggestion_prefers_reference_labels_in_summary() {
        let pack = ContinuityPreparedContextPackItem {
            id: "topic_1".to_string(),
            pack_kind: "topic_pack".to_string(),
            title: "Aurora topic pack".to_string(),
            summary: "Bounded topic continuity across linked work.".to_string(),
            confidence: "high".to_string(),
            why_surfaced: "Surfaced from linked project continuity.".to_string(),
            anchor_refs: vec!["msg_1".to_string()],
            source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
            reference_refs: vec!["thread:aurora".to_string()],
            reference_labels: vec!["Aurora rollout thread".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            evidence_kinds: vec!["reference".to_string(), "project".to_string()],
            thread_retrieval_state: None,
            ..Default::default()
        };

        let item = synthetic_context_pack_suggestion(&pack);
        let lines = item["artifact_summary_lines"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|line| line.as_str().map(str::to_string))
            .collect::<Vec<_>>();

        assert!(
            lines
                .iter()
                .any(|line| line == "Surfaced from linked project continuity.")
        );
        assert!(
            lines
                .iter()
                .any(|line| line == "Linked objects: Aurora rollout thread")
        );
        assert_eq!(
            item["reference_labels"]
                .as_array()
                .map(|labels| labels.len()),
            Some(1)
        );
        assert!(item["heuristic_id"].as_str().is_some());
        assert_eq!(
            item["heuristic_family_id"].as_str(),
            Some("context-pack:topic_1")
        );
    }

    #[test]
    fn synthetic_context_pack_suggestion_includes_scope_summary_line_when_grounded() {
        let pack = ContinuityPreparedContextPackItem {
            id: "topic_2".to_string(),
            pack_kind: "topic_pack".to_string(),
            title: "Work topic pack".to_string(),
            summary: "Bounded work continuity.".to_string(),
            confidence: "high".to_string(),
            why_surfaced: "Aligned with current work continuity.".to_string(),
            memory_space: Some("work".to_string()),
            author_type: Some("human".to_string()),
            is_human_authored: Some(true),
            human_only: Some(true),
            ..Default::default()
        };

        let item = synthetic_context_pack_suggestion(&pack);
        let lines = item["artifact_summary_lines"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|line| line.as_str().map(str::to_string))
            .collect::<Vec<_>>();

        assert!(
            lines
                .iter()
                .any(|line| line == "Scope: work context, human-grounded")
        );
    }

    #[test]
    fn prepared_draft_suggestion_from_item_includes_scope_summary_line_when_grounded() {
        let item = ContinuityPreparedDraftItem {
            id: "draft_scope".to_string(),
            draft_class: "communication_reply".to_string(),
            title: "Reply draft".to_string(),
            channel: "email".to_string(),
            summary: "Prepared reply draft.".to_string(),
            body: "- Thank them\n- Confirm next step".to_string(),
            confidence: "high".to_string(),
            readiness: "ready_now".to_string(),
            response_due_hint: "Today".to_string(),
            requires_approval: false,
            suggested_action: "Review and send email reply".to_string(),
            autonomy_decision: None,
            selection_reason: Some(
                "Selected because reply context is already assembled.".to_string(),
            ),
            source_refs: vec!["msg_1".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            memory_space: Some("work".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("human".to_string()),
            author_id: Some("user_01".to_string()),
            is_human_authored: Some(true),
            human_only: Some(true),
        };

        let suggestion = prepared_draft_suggestion_from_item(&item, None, &[], &[]);
        let lines = suggestion["artifact_summary_lines"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|line| line.as_str().map(str::to_string))
            .collect::<Vec<_>>();

        assert!(
            lines
                .iter()
                .any(|line| line == "Scope: work context, human-grounded")
        );
        assert_eq!(
            suggestion["destination_view"].as_str(),
            Some("response_queue")
        );
        assert_eq!(suggestion["surface_hint"].as_str(), Some("response_queue"));
    }

    #[test]
    fn prepared_draft_suggestion_from_state_falls_back_to_simulator_preview() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_promotions": [{
                    "target_kind": "prepared_draft"
                }],
                "simulator_prepared_draft_preview": {
                    "ready": true,
                    "summary": "Prepared 1 project prep note for review.",
                    "drafts": [{
                        "draft_id": "draft:simulator:1",
                        "draft_class": "project_prep_note",
                        "label": "Simulated project prep note",
                        "channel": "project",
                        "summary": "Prepare alternative draft from propose_alternative around Customer demo.",
                        "body": "Prepare alternative draft from propose_alternative around Customer demo.",
                        "confidence": "medium",
                        "readiness": "ready",
                        "response_due_hint": "Next work session",
                        "approval_required_to_send": false,
                        "source_refs": ["msg_1"],
                        "source_count": 1,
                        "storage_type": "ledger",
                        "storage_kind": "rich_note",
                        "comparison_headers": [],
                        "comparison_rows": [],
                        "selection_reason": "Prepared from bounded simulator projection.",
                        "suggested_next_action": "Review simulated prep note",
                        "object_refs": ["project:aurora"]
                    }]
                }
            }),
            views: serde_json::json!([]),
        };

        let suggestion = prepared_draft_suggestion_from_state(&[], Some(&continuity_state), None)
            .expect("should build fallback suggestion");
        assert_eq!(suggestion["kind"].as_str(), Some("prepared_draft"));
        assert_eq!(
            suggestion["draft_class"].as_str(),
            Some("project_prep_note")
        );
        assert_eq!(
            suggestion["selection_reason"].as_str(),
            Some("Prepared from bounded simulator projection.")
        );
    }

    #[test]
    fn context_ready_suggestion_from_state_falls_back_to_simulator_preview() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_2".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_promotions": [{
                    "target_kind": "prepared_context"
                }],
                "simulator_prepared_context_preview": {
                    "packet_kind": "continuity",
                    "ready": true,
                    "summary": "Prepare bounded context from flag_conflict around Calendar conflict.",
                    "anchor_refs": ["msg_2"],
                    "source_refs": ["msg_2"],
                    "decision_refs": [],
                    "decision_history_refs": [],
                    "response_refs": [],
                    "follow_up_refs": [],
                    "relationship_refs": [],
                    "project_refs": [],
                    "reference_refs": [],
                    "object_refs": ["project:aurora"],
                    "thread_refs": [],
                    "file_refs": [],
                    "packs": [{
                        "pack_id": "simulator:context:flag-conflict",
                        "pack_kind": "topic_pack",
                        "title": "Simulated context pack",
                        "summary": "Prepare bounded context from flag_conflict around Calendar conflict.",
                        "confidence": "medium",
                        "why_surfaced": "Prepared from bounded simulator projection.",
                        "anchor_refs": ["msg_2"],
                        "source_refs": ["msg_2"],
                        "reference_refs": [],
                        "object_refs": ["project:aurora"],
                        "evidence_kinds": ["simulator_projection"]
                    }],
                    "decrypt_needed_count": 0
                }
            }),
            views: serde_json::json!([]),
        };
        let handoff = SynthesizerToMasterHandoff {
            confidence: "medium".to_string(),
            surface_recommendation: "context_panel".to_string(),
            prepared_context_ready: false,
            ..Default::default()
        };

        let suggestion =
            context_ready_suggestion_from_state(Some(&continuity_state), Some(&handoff))
                .expect("should build fallback context suggestion");
        assert_eq!(suggestion["kind"].as_str(), Some("context_ready"));
        assert_eq!(
            suggestion["description"].as_str(),
            Some("Prepare bounded context from flag_conflict around Calendar conflict.")
        );
        assert!(suggestion["heuristic_id"].as_str().is_some());
        assert_eq!(
            suggestion["heuristic_family_id"].as_str(),
            Some("context-ready:prepared-context")
        );
    }

    #[test]
    fn simulator_preview_suggestions_surface_approval_and_reversible_fallbacks() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_3".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_reversible_action_preview": {
                    "action_afp": {
                        "content": {
                            "title": "Draft follow-up for Customer demo",
                            "summary": "Suggest reversible next step from defer_task around Customer demo.",
                            "source_refs": ["msg_3"]
                        }
                    }
                },
                "simulator_approval_review_preview": {
                    "title": "Review approval preview",
                    "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                    "approval_kind": "send",
                    "confidence": "high",
                    "source_refs": ["msg_3"],
                    "consequence_summary_lines": ["Outbound summary remains paused for review."],
                    "draft_preview": {
                        "label": "Reply Review: Re: Customer demo",
                        "content": "Confirm the next meeting time. • Draft artifact: .skillcapsule/email/reply.md",
                        "content_type": "text"
                    }
                }
            }),
            views: serde_json::json!([]),
        };
        let mut continuity_state = continuity_state;
        continuity_state.metadata["simulator_approval_review_preview"]["draft_preview"]["content"] =
            Value::String(
                "Confirm the next meeting time. | Draft artifact: .skillcapsule/email/reply.md"
                    .to_string(),
            );
        continuity_state.metadata["simulator_rollout_summary"] = serde_json::json!({
            "stage": "review",
            "review_surface_count": 2
        });
        continuity_state.metadata["simulator_calibration_summary"] = serde_json::json!({
            "mode": "bounded_deterministic",
            "probabilistic_sampling_enabled": false
        });
        continuity_state.metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "reversible_action",
                "review_surface": {
                    "preview_only": true,
                    "review_available": true,
                    "boundary_summary": "Bounded simulator preview only. Reversible action stays inside approval-safe review pathways.",
                    "persistence_reason": "Retained because the reversible preview still maps to an active continuity thread.",
                    "provenance_summary": "Traceable to reversible simulator evidence attached to the current continuity state.",
                    "source_summary": "Prepared from 1 continuity source."
                }
            },
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "preview_only": true,
                    "review_available": true,
                    "boundary_summary": "Bounded simulator preview only. Approval review remains gated before any external action.",
                    "persistence_reason": "Retained because the approval preview still maps to an unresolved continuity decision.",
                    "provenance_summary": "Traceable to approval-gated simulator evidence attached to the current continuity state.",
                    "source_summary": "Prepared from 1 continuity source."
                }
            }
        ]);
        let handoff = SynthesizerToMasterHandoff {
            surface_recommendation: "decision_queue".to_string(),
            ..Default::default()
        };

        let reversible = simulator_reversible_preview_suggestion_from_state(
            Some(&continuity_state),
            Some(&handoff),
        )
        .expect("reversible suggestion");
        let approval = simulator_approval_preview_suggestion_from_state(
            Some(&continuity_state),
            Some(&handoff),
        )
        .expect("approval suggestion");

        assert_eq!(
            reversible["kind"].as_str(),
            Some("simulator_reversible_preview")
        );
        assert_eq!(
            approval["kind"].as_str(),
            Some("simulator_approval_preview")
        );
        assert_eq!(
            reversible["heuristic_family_id"].as_str(),
            Some("simulator-review:reversible")
        );
        assert_eq!(
            approval["heuristic_family_id"].as_str(),
            Some("simulator-review:approval")
        );
        assert!(reversible["heuristic_id"].as_str().is_some());
        assert!(approval["heuristic_id"].as_str().is_some());
        assert_eq!(approval["requires_approval"].as_bool(), Some(true));
        assert_eq!(reversible["preview_only"].as_bool(), Some(true));
        assert_eq!(
            reversible["preview_boundary_summary"].as_str(),
            Some(
                "Bounded simulator preview only. Reversible action stays inside approval-safe review pathways."
            )
        );
        assert_eq!(approval["preview_only"].as_bool(), Some(true));
        assert_eq!(
            approval["preview_boundary_summary"].as_str(),
            Some(
                "Bounded simulator preview only. Approval review remains gated before any external action."
            )
        );
        assert_eq!(reversible["rollout_stage"].as_str(), Some("review"));
        assert_eq!(
            approval["calibration_mode"].as_str(),
            Some("bounded_deterministic")
        );
        assert_eq!(approval["review_surface_available"].as_bool(), Some(true));
        assert_eq!(
            approval["provenance_cue"].as_str(),
            Some(
                "Traceable to approval-gated simulator evidence attached to the current continuity state."
            )
        );
        assert_eq!(
            approval["artifact_summary_lines"]
                .as_array()
                .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "Confirm the next meeting time.",
                "Draft artifact: .skillcapsule/email/reply.md",
            ])
        );
    }

    #[test]
    fn simulator_approval_preview_normalizes_pipe_separated_draft_preview_lines() {
        let mut continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_3".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_approval_review_preview": {
                    "title": "Review approval preview",
                    "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                    "approval_kind": "send",
                    "confidence": "high",
                    "source_refs": ["msg_3"],
                    "consequence_summary_lines": ["Outbound summary remains paused for review."],
                    "draft_preview": {
                        "label": "Reply Review: Re: Customer demo",
                        "content": "Confirm the next meeting time. | Draft artifact: .skillcapsule/email/reply.md",
                        "content_type": "text"
                    }
                }
            }),
            views: serde_json::json!([]),
        };
        continuity_state.metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "review_available": true
                }
            }
        ]);
        let approval = simulator_approval_preview_suggestion_from_state(
            Some(&continuity_state),
            Some(&SynthesizerToMasterHandoff {
                surface_recommendation: "decision_queue".to_string(),
                ..Default::default()
            }),
        )
        .expect("approval suggestion");

        assert_eq!(
            approval["artifact_summary_lines"]
                .as_array()
                .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "Confirm the next meeting time.",
                "Draft artifact: .skillcapsule/email/reply.md",
            ])
        );
    }

    #[test]
    fn simulator_preview_suggestions_read_canonical_rollout_and_calibration_fields() {
        let mut continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_3".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_reversible_action_preview": {
                    "action_afp": {
                        "content": {
                            "title": "Draft follow-up for Customer demo",
                            "summary": "Suggest reversible next step from defer_task around Customer demo.",
                            "source_refs": ["msg_3"]
                        }
                    }
                },
                "simulator_approval_review_preview": {
                    "title": "Review approval preview",
                    "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                    "approval_kind": "send",
                    "confidence": "high",
                    "source_refs": ["msg_3"],
                    "consequence_summary_lines": ["Outbound summary remains paused for review."]
                },
                "simulator_rollout_summary": {
                    "surface": "synthesizer",
                    "rollout_stage": "shadow",
                    "calibration_mode": "bounded_deterministic",
                    "review_surfaces_enabled": true
                },
                "simulator_calibration_summary": {
                    "confidence_posture": "shadow_only",
                    "review_surface_count": 1
                }
            }),
            views: serde_json::json!([]),
        };
        continuity_state.metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "preview_only": true,
                    "review_available": true,
                    "boundary_summary": "Bounded simulator preview only. Approval review remains gated before any external action.",
                    "persistence_reason": "Retained because the approval preview still maps to an unresolved continuity decision.",
                    "provenance_summary": "Traceable to approval-gated simulator evidence attached to the current continuity state.",
                    "source_summary": "Prepared from 1 continuity source."
                }
            }
        ]);

        let approval = simulator_approval_preview_suggestion_from_state(
            Some(&continuity_state),
            Some(&SynthesizerToMasterHandoff {
                surface_recommendation: "decision_queue".to_string(),
                ..Default::default()
            }),
        )
        .expect("approval suggestion");

        assert_eq!(approval["rollout_stage"].as_str(), Some("shadow"));
        assert_eq!(approval["calibration_mode"].as_str(), Some("shadow_only"));
        assert_eq!(
            approval["rollout_summary"].as_str(),
            Some("Simulator rollout stage: shadow. Calibration mode: shadow only.")
        );
    }

    #[test]
    fn simulator_review_suggestions_from_continuity_returns_both_review_items() {
        let mut continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_3".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_reversible_action_preview": {
                    "action_afp": {
                        "content": {
                            "title": "Draft follow-up for Customer demo",
                            "summary": "Suggest reversible next step from defer_task around Customer demo.",
                            "source_refs": ["msg_3"]
                        }
                    }
                },
                "simulator_approval_review_preview": {
                    "title": "Review approval preview",
                    "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                    "approval_kind": "send",
                    "confidence": "high",
                    "source_refs": ["msg_3"],
                    "consequence_summary_lines": ["Outbound summary remains paused for review."]
                }
            }),
            views: serde_json::json!([]),
        };
        let handoff = SynthesizerToMasterHandoff {
            surface_recommendation: "decision_queue".to_string(),
            ..Default::default()
        };
        continuity_state.metadata["simulator_rollout_summary"] = serde_json::json!({
            "stage": "review",
            "review_surface_count": 2
        });
        continuity_state.metadata["simulator_calibration_summary"] = serde_json::json!({
            "mode": "bounded_deterministic",
            "probabilistic_sampling_enabled": false
        });
        continuity_state.metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "reversible_action",
                "review_surface": {
                    "review_available": true
                }
            },
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "review_available": true
                }
            }
        ]);

        let suggestions =
            simulator_review_suggestions_from_continuity(Some(&continuity_state), Some(&handoff));

        assert_eq!(suggestions.len(), 3);
        assert_eq!(
            suggestions[0]["kind"].as_str(),
            Some("simulator_conflict_fusion")
        );
        assert_eq!(
            suggestions[1]["kind"].as_str(),
            Some("simulator_approval_preview")
        );
        assert_eq!(
            suggestions[2]["kind"].as_str(),
            Some("simulator_reversible_preview")
        );
        assert!(suggestions[1]["heuristic_id"].as_str().is_some());
        assert!(suggestions[2]["heuristic_id"].as_str().is_some());
        assert_eq!(
            suggestions[0]["linked_preview_kinds"]
                .as_array()
                .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "simulator_approval_preview",
                "simulator_reversible_preview"
            ])
        );
        assert_eq!(suggestions[0]["rollout_stage"].as_str(), Some("review"));
    }

    #[test]
    fn simulator_conflict_fusion_reads_canonical_rollout_and_calibration_fields() {
        let mut continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_3".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_reversible_action_preview": {
                    "action_afp": {
                        "content": {
                            "title": "Draft follow-up for Customer demo",
                            "summary": "Suggest reversible next step from defer_task around Customer demo.",
                            "source_refs": ["msg_3"]
                        }
                    }
                },
                "simulator_approval_review_preview": {
                    "title": "Review approval preview",
                    "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                    "approval_kind": "send",
                    "confidence": "high",
                    "source_refs": ["msg_3"],
                    "consequence_summary_lines": ["Outbound summary remains paused for review."]
                },
                "simulator_rollout_summary": {
                    "rollout_stage": "shadow",
                    "review_surface_count": 2
                },
                "simulator_calibration_summary": {
                    "confidence_posture": "shadow_only",
                    "probabilistic_sampling_enabled": false
                }
            }),
            views: serde_json::json!([]),
        };
        continuity_state.metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "review_available": true
                }
            },
            {
                "target_kind": "reversible_action",
                "review_surface": {
                    "review_available": true
                }
            }
        ]);

        let suggestion = simulator_conflict_fusion_suggestion_from_continuity(
            Some(&continuity_state),
            Some(&SynthesizerToMasterHandoff {
                surface_recommendation: "decision_queue".to_string(),
                ..Default::default()
            }),
        )
        .expect("fusion suggestion");

        assert_eq!(suggestion["rollout_stage"].as_str(), Some("shadow"));
        assert_eq!(suggestion["calibration_mode"].as_str(), Some("shadow_only"));
        assert_eq!(
            suggestion["rollout_summary"].as_str(),
            Some("Simulator rollout stage: shadow. Calibration mode: shadow only.")
        );
    }

    #[test]
    fn simulator_preview_suggestions_fall_back_to_handoff_rollout_and_calibration() {
        let mut continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_3".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_reversible_action_preview": {
                    "action_afp": {
                        "content": {
                            "title": "Draft follow-up for Customer demo",
                            "summary": "Suggest reversible next step from defer_task around Customer demo.",
                            "source_refs": ["msg_3"]
                        }
                    }
                },
                "simulator_approval_review_preview": {
                    "title": "Review approval preview",
                    "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                    "approval_kind": "send",
                    "confidence": "high",
                    "source_refs": ["msg_3"],
                    "consequence_summary_lines": ["Outbound summary remains paused for review."]
                }
            }),
            views: serde_json::json!([]),
        };
        continuity_state.metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "reversible_action",
                "review_surface": {
                    "review_available": true
                }
            },
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "review_available": true
                }
            }
        ]);
        let handoff = SynthesizerToMasterHandoff {
            surface_recommendation: "decision_queue".to_string(),
            simulated_rollout_stage: Some("shadow".to_string()),
            simulated_calibration_mode: Some("shadow_only".to_string()),
            simulated_review_summary: Some(
                "Simulator preview stays in shadow review before any promotion write-back."
                    .to_string(),
            ),
            simulated_calibration_notes: vec![
                "Promotions remain suppressed during shadow review.".to_string(),
            ],
            simulated_promotion_candidate_count: None,
            simulated_projection_summary: Some(
                "Shadow review path retained for bounded simulator follow-through.".to_string(),
            ),
            ..Default::default()
        };

        let approval = simulator_approval_preview_suggestion_from_state(
            Some(&continuity_state),
            Some(&handoff),
        )
        .expect("approval preview");
        let reversible = simulator_reversible_preview_suggestion_from_state(
            Some(&continuity_state),
            Some(&handoff),
        )
        .expect("reversible preview");
        let fusion = simulator_conflict_fusion_suggestion_from_continuity(
            Some(&continuity_state),
            Some(&handoff),
        )
        .expect("fusion preview");

        for suggestion in [&approval, &reversible, &fusion] {
            assert_eq!(suggestion["rollout_stage"].as_str(), Some("shadow"));
            assert_eq!(suggestion["calibration_mode"].as_str(), Some("shadow_only"));
            assert_eq!(
                suggestion["review_summary"].as_str(),
                Some("Simulator preview stays in shadow review before any promotion write-back.")
            );
            assert_eq!(
                suggestion["calibration_notes"][0].as_str(),
                Some("Promotions remain suppressed during shadow review.")
            );
            assert_eq!(
                suggestion["rollout_summary"].as_str(),
                Some("Simulator rollout stage: shadow. Calibration mode: shadow only.")
            );
        }
        assert_eq!(
            reversible["artifact_summary_lines"][1].as_str(),
            Some("Simulator preview stays in shadow review before any promotion write-back.")
        );
        assert_eq!(
            approval["artifact_summary_lines"][2].as_str(),
            Some("Promotions remain suppressed during shadow review.")
        );
    }

    #[test]
    fn simulator_preview_suggestions_fail_closed_when_review_surfaces_are_disabled() {
        let mut continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_3".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_reversible_action_preview": {
                    "action_afp": {
                        "content": {
                            "title": "Draft follow-up for Customer demo",
                            "summary": "Suggest reversible next step from defer_task around Customer demo.",
                            "source_refs": ["msg_3"]
                        }
                    }
                },
                "simulator_approval_review_preview": {
                    "title": "Review approval preview",
                    "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                    "approval_kind": "send",
                    "confidence": "high",
                    "source_refs": ["msg_3"],
                    "consequence_summary_lines": ["Outbound summary remains paused for review."]
                }
            }),
            views: serde_json::json!([]),
        };
        continuity_state.metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "reversible_action",
                "review_surface": {
                    "review_available": false
                }
            },
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "review_available": false
                }
            }
        ]);

        assert!(
            simulator_reversible_preview_suggestion_from_state(
                Some(&continuity_state),
                Some(&SynthesizerToMasterHandoff {
                    surface_recommendation: "decision_queue".to_string(),
                    ..Default::default()
                }),
            )
            .is_none()
        );
        assert!(
            simulator_approval_preview_suggestion_from_state(
                Some(&continuity_state),
                Some(&SynthesizerToMasterHandoff {
                    surface_recommendation: "decision_queue".to_string(),
                    ..Default::default()
                }),
            )
            .is_none()
        );
        assert!(
            simulator_review_suggestions_from_continuity(
                Some(&continuity_state),
                Some(&SynthesizerToMasterHandoff {
                    surface_recommendation: "decision_queue".to_string(),
                    ..Default::default()
                }),
            )
            .is_empty()
        );
    }

    #[test]
    fn mark_simulator_review_suggestion_as_continuity_persisted_adds_rationale() {
        let mut suggestion = serde_json::json!({
            "id": "simulator:approval_preview",
            "kind": "simulator_approval_preview",
            "heuristic_id": "simulator-review:approval:abcd1234",
            "heuristic_family_id": "simulator-review:approval"
        });

        mark_simulator_review_suggestion_as_continuity_persisted(&mut suggestion);

        assert_eq!(
            suggestion["persisted_from_continuity"].as_bool(),
            Some(true)
        );
        assert!(suggestion["persistence_reason"].as_str().is_some());
    }

    #[test]
    fn stale_simulator_review_suggestion_ids_only_returns_missing_simulator_review_entries() {
        let active_headers = vec![
            (
                "suggestion_keep".to_string(),
                "simulator-review:approval:keep".to_string(),
            ),
            (
                "suggestion_stale".to_string(),
                "simulator-review:reversible:stale".to_string(),
            ),
            (
                "suggestion_other".to_string(),
                "calendar:nudge:other".to_string(),
            ),
        ];
        let current_heuristic_ids = HashSet::from(["simulator-review:approval:keep".to_string()]);

        let stale = stale_simulator_review_suggestion_ids(&active_headers, &current_heuristic_ids);

        assert_eq!(stale, vec!["suggestion_stale".to_string()]);
    }

    #[test]
    fn stale_continuity_suggestion_ids_only_returns_missing_matching_family_entries() {
        let active_headers = vec![
            (
                "draft_keep".to_string(),
                "prepared-draft:reply:keep".to_string(),
            ),
            (
                "draft_stale".to_string(),
                "prepared-draft:reply:stale".to_string(),
            ),
            (
                "context_stale".to_string(),
                "context-ready:prepared-context:stale".to_string(),
            ),
            ("other_keep".to_string(), "calendar:nudge:other".to_string()),
        ];
        let current_heuristic_ids = HashSet::from(["prepared-draft:reply:keep".to_string()]);

        let stale = stale_continuity_suggestion_ids(
            &active_headers,
            &current_heuristic_ids,
            is_prepared_draft_heuristic_id,
        );

        assert_eq!(stale, vec!["draft_stale".to_string()]);
    }

    #[test]
    fn proactive_response_promotes_prepared_reply_draft_from_continuity_state() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply draft ready".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 1 communication reply draft for review.".to_string(),
                        drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                            draft_id: "draft:reply:msg_1".to_string(),
                            draft_class: "communication_reply".to_string(),
                            label: "Reply draft for Supplier quote follow up".to_string(),
                            channel: "email".to_string(),
                            summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                            body: "Thanks for sending this through.".to_string(),
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
                            object_refs: vec!["project_aurora".to_string()],
                            memory_space: Some("work".to_string()),
                            author_mask: Some("me".to_string()),
                            author_type: Some("human".to_string()),
                            author_id: Some("user_01".to_string()),
                            is_human_authored: Some(true),
                            human_only: Some(true),
                    }],
                }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: Some(continuity_state),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "medium".to_string(),
                surface_recommendation: "context_panel".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Review reply draft".to_string()],
                escalation_required: false,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: false,
                prepared_context_summary: None,
                prepared_draft_ready: true,
                prepared_draft_summary: Some(
                    "Prepared 1 communication reply draft for review.".to_string(),
                ),
                follow_up_write_candidate: None,
                decrypt_trace: None,
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
            }),
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let response = build_proactive_suggestions_response(
            Vec::new(),
            continuity_summary,
            None,
            Vec::new(),
            None,
        );
        let first = response.items.first().expect("prepared draft suggestion");
        assert_eq!(response.count, 1);
        assert_eq!(first["kind"].as_str(), Some("prepared_draft"));
        assert_eq!(first["channel"].as_str(), Some("email"));
        assert_eq!(first["surface_hint"].as_str(), Some("response_queue"));
        assert_eq!(first["memory_space"].as_str(), Some("work"));
        assert_eq!(first["author_mask"].as_str(), Some("me"));
        assert_eq!(first["author_type"].as_str(), Some("human"));
        assert_eq!(first["author_id"].as_str(), Some("user_01"));
        assert_eq!(first["is_human_authored"].as_bool(), Some(true));
        assert_eq!(first["human_only"].as_bool(), Some(true));
        assert_eq!(first["destination_view"].as_str(), Some("response_queue"));
        assert_eq!(first["action_label"].as_str(), Some("Open responses"));
        assert_eq!(
            first["approval_or_reversibility_hint"].as_str(),
            Some("Opens a review step first; no external action runs without approval.")
        );
        assert!(
            first["artifact_summary_lines"]
                .as_array()
                .map(|lines| lines.len() >= 4)
                .unwrap_or(false)
        );
        assert!(
            first["artifact_summary_lines"]
                .as_array()
                .map(|lines| {
                    lines
                        .iter()
                        .any(|line| line.as_str() == Some("Scope: work context, human-grounded"))
                })
                .unwrap_or(false)
        );
        assert!(
            first["artifact_summary_lines"]
                .as_array()
                .map(|lines| {
                    lines
                        .iter()
                        .any(|line| line.as_str() == Some("Follow-up timing: Today"))
                })
                .unwrap_or(false)
        );
        assert_eq!(
            first["object_refs"].as_array().map(|refs| refs.len()),
            Some(1)
        );
        assert_eq!(
            first["thread_retrieval_state"]["badges"]
                .as_array()
                .map(|badges| badges.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec!["object-linked", "draft-guided", "approval-sensitive",])
        );
        assert_eq!(
            first["thread_retrieval_state"]["summary"].as_str(),
            Some(
                "Surfaced around linked object focus on project aurora. Linked object focus centers on project aurora. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop."
            )
        );
    }

    #[test]
    fn proactive_response_promotes_file_linked_prepared_reply_when_summary_items_are_empty() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_file_ranked_reply".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_file".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply in thread".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                        packet_kind: "continuity_context".to_string(),
                        ready: true,
                        summary: "Prepared context with file anchors.".to_string(),
                        anchor_refs: Vec::new(),
                        source_refs: vec!["msg_file".to_string()],
                        decision_refs: Vec::new(),
                        decision_history_refs: Vec::new(),
                        response_refs: Vec::new(),
                        follow_up_refs: Vec::new(),
                        relationship_refs: Vec::new(),
                        project_refs: Vec::new(),
                        reference_refs: Vec::new(),
                        object_refs: Vec::new(),
                        thread_refs: Vec::new(),
                        file_refs: vec!["file:docs/launch-brief.md".to_string()],
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
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 2 communication reply drafts for review.".to_string(),
                        drafts: vec![
                            crate::prepared_draft_packet::PreparedDraftArtifact {
                                draft_id: "draft:generic".to_string(),
                                draft_class: "communication_reply".to_string(),
                                label: "Reply today".to_string(),
                                channel: "email".to_string(),
                                summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                                body: "Generic reply.".to_string(),
                                confidence: "high".to_string(),
                                readiness: "ready_now".to_string(),
                                response_due_hint: "Today".to_string(),
                                approval_required_to_send: false,
                                source_refs: vec!["msg_plain".to_string()],
                                source_count: 1,
                                storage_type: "ledger".to_string(),
                                storage_kind: Some("rich_note".to_string()),
                                comparison_headers: Vec::new(),
                                comparison_rows: Vec::new(),
                                selection_reason: Some("Prepared support is ready.".to_string()),
                                suggested_next_action: "Reply in thread".to_string(),
                                object_refs: Vec::new(),
                                memory_space: Some("work".to_string()),
                                author_mask: Some("me".to_string()),
                                author_type: Some("human".to_string()),
                                author_id: Some("user_01".to_string()),
                                is_human_authored: Some(true),
                                human_only: Some(true),
                            },
                            crate::prepared_draft_packet::PreparedDraftArtifact {
                                draft_id: "draft:file".to_string(),
                                draft_class: "communication_reply".to_string(),
                                label: "Reply today".to_string(),
                                channel: "email".to_string(),
                                summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                                body: "File-linked reply.".to_string(),
                                confidence: "high".to_string(),
                                readiness: "ready_now".to_string(),
                                response_due_hint: "Today".to_string(),
                                approval_required_to_send: false,
                                source_refs: vec!["msg_file".to_string()],
                                source_count: 1,
                                storage_type: "ledger".to_string(),
                                storage_kind: Some("rich_note".to_string()),
                                comparison_headers: Vec::new(),
                                comparison_rows: Vec::new(),
                                selection_reason: Some("Prepared support is ready.".to_string()),
                                suggested_next_action: "Reply in thread".to_string(),
                                object_refs: Vec::new(),
                                memory_space: Some("work".to_string()),
                                author_mask: Some("me".to_string()),
                                author_type: Some("human".to_string()),
                                author_id: Some("user_01".to_string()),
                                is_human_authored: Some(true),
                                human_only: Some(true),
                            },
                        ],
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_file_ranked_reply".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: Some(continuity_state),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_file_ranked_reply".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "high".to_string(),
                surface_recommendation: "response_queue".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Reply in thread".to_string()],
                escalation_required: false,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: true,
                prepared_context_summary: Some("Prepared context with file anchors.".to_string()),
                prepared_draft_ready: true,
                prepared_draft_summary: Some(
                    "Prepared 2 communication reply drafts for review.".to_string(),
                ),
                follow_up_write_candidate: None,
                decrypt_trace: None,
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
            }),
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let response = build_proactive_suggestions_response(
            Vec::new(),
            continuity_summary,
            None,
            Vec::new(),
            None,
        );
        let first = response.items.first().expect("prepared draft suggestion");
        assert_eq!(first["kind"].as_str(), Some("prepared_draft"));
        assert_eq!(first["id"].as_str(), Some("prepared-draft:draft:file"));
        assert_eq!(
            first["file_labels"]
                .as_array()
                .and_then(|labels| labels.first())
                .and_then(|label| label.as_str()),
            Some("launch-brief.md")
        );
    }

    #[test]
    fn proactive_prepared_draft_summary_lines_prefer_structured_metadata() {
        let item = ContinuityPreparedDraftItem {
            id: "draft:reply:customer-demo".to_string(),
            draft_class: "communication_reply".to_string(),
            title: "Reply draft for Customer demo".to_string(),
            channel: "email".to_string(),
            summary: "Confirm the next meeting time and attach the agenda draft.".to_string(),
            body: "Thanks again.".to_string(),
            confidence: "medium".to_string(),
            readiness: "ready_now".to_string(),
            response_due_hint: "Today".to_string(),
            requires_approval: true,
            suggested_action: "Review and send email reply".to_string(),
            autonomy_decision: None,
            selection_reason: Some("Prepared from the active response queue.".to_string()),
            source_refs: vec!["msg_customer_demo".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let content = proactive_content_from_prepared_draft_item(&item);
        assert_eq!(
            content["artifact_summary_lines"]
                .as_array()
                .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "Prepared from the active response queue.",
                "Draft: Reply draft for Customer demo",
                "Confirm the next meeting time and attach the agenda draft.",
                "Next action: Review and send email reply",
                "Follow-up timing: Today",
                "Thanks again.",
            ])
        );
    }

    #[test]
    fn proactive_response_prefers_ready_prepared_draft_item_over_first_packet_reply() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Prepared work ready".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 1 communication reply draft for review.".to_string(),
                        drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                            draft_id: "draft:reply:msg_1".to_string(),
                            draft_class: "communication_reply".to_string(),
                            label: "Reply draft for Supplier quote follow up".to_string(),
                            channel: "email".to_string(),
                            summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                            body: "Thanks for sending this through.".to_string(),
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
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: Some(continuity_state),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "medium".to_string(),
                surface_recommendation: "context_panel".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Review prepared work".to_string()],
                escalation_required: false,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: false,
                prepared_context_summary: None,
                prepared_draft_ready: true,
                prepared_draft_summary: Some("Prepared work ready for review.".to_string()),
                follow_up_write_candidate: None,
                decrypt_trace: None,
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
            }),
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: vec![ContinuityPreparedDraftItem {
                id: "draft:project:aurora".to_string(),
                draft_class: "project_prep_note".to_string(),
                title: "Aurora rollout prep note".to_string(),
                channel: "workspace".to_string(),
                summary: "Prepared a rollout prep note from linked project context.".to_string(),
                body: "- Confirm scope\n- Check blockers".to_string(),
                confidence: "high".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: String::new(),
                requires_approval: false,
                suggested_action: "Review prepared context".to_string(),
                autonomy_decision: None,
                selection_reason: Some(
                    "Selected project prep note because linked project context is already ready."
                        .to_string(),
                ),
                source_refs: vec!["thread:aurora".to_string()],
                object_refs: vec!["project_aurora".to_string()],
                object_labels: vec!["project aurora".to_string()],
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let response = build_proactive_suggestions_response(
            Vec::new(),
            continuity_summary,
            None,
            Vec::new(),
            None,
        );
        assert_eq!(response.count, 1);
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["kind"].as_str()),
            Some("prepared_draft")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["draft_class"].as_str()),
            Some("project_prep_note")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["destination_view"].as_str()),
            Some("home")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["surface_hint"].as_str()),
            Some("home")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["action_label"].as_str()),
            Some("Open workspace")
        );
        assert_eq!(
            response
                .items
                .first()
                .and_then(|item| item["approval_or_reversibility_hint"].as_str()),
            Some("Opens prepared work for review rather than executing a side effect.")
        );
    }

    #[test]
    fn proactive_response_promotes_context_ready_from_prepared_context_packet() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Prepared context ready".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                        packet_kind: "continuity_context".to_string(),
                        ready: true,
                        summary: "Prepared context ready: 2 related context items, 1 decision source.".to_string(),
                        anchor_refs: vec!["msg_1".to_string()],
                        working_set_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                        active_topic_refs: vec![
                            "project:aurora".to_string(),
                            "thread:aurora".to_string(),
                            "project_aurora".to_string(),
                        ],
                        source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                        decision_refs: vec!["msg_2".to_string()],
                        decision_history_refs: vec!["decision:1".to_string()],
                        response_refs: Vec::new(),
                        follow_up_refs: Vec::new(),
                        relationship_refs: Vec::new(),
                        project_refs: vec!["project:aurora".to_string()],
                        reference_refs: vec!["thread:aurora".to_string()],
                        object_refs: vec!["project_aurora".to_string()],
                        thread_refs: vec!["thread:aurora".to_string()],
                        file_refs: vec!["file:notes/aurora.md".to_string()],
                        packs: vec![crate::prepared_context_packet::PreparedContextPack {
                            pack_id: "topic_1".to_string(),
                            pack_kind: "topic_pack".to_string(),
                            title: "Aurora topic pack".to_string(),
                            summary: "Bounded topic continuity across linked work.".to_string(),
                            confidence: "high".to_string(),
                            why_surfaced: "Surfaced from linked project continuity.".to_string(),
                            anchor_refs: vec!["msg_1".to_string()],
                            source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                            reference_refs: vec!["thread:aurora".to_string()],
                            object_refs: vec!["project_aurora".to_string()],
                            evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                            ..crate::prepared_context_packet::PreparedContextPack::default()
                        }],
                        decrypt_needed_count: 0,
                        memory_space: Some("work".to_string()),
                        author_mask: Some("me".to_string()),
                        author_type: Some("human".to_string()),
                        author_id: Some("user_01".to_string()),
                        is_human_authored: Some(true),
                        human_only: Some(true),
                        ..crate::prepared_context_packet::PreparedContextPacket::default()
                    }),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: Some(continuity_state),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "high".to_string(),
                surface_recommendation: "context_panel".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Review prepared context".to_string()],
                escalation_required: false,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: true,
                prepared_context_summary: Some(
                    "Prepared context ready: 2 related context items, 1 decision source."
                        .to_string(),
                ),
                prepared_draft_ready: false,
                prepared_draft_summary: None,
                follow_up_write_candidate: None,
                decrypt_trace: None,
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
            }),
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let response = build_proactive_suggestions_response(
            Vec::new(),
            continuity_summary,
            None,
            Vec::new(),
            None,
        );
        let first = response.items.first().expect("context-ready suggestion");
        assert_eq!(response.count, 1);
        assert_eq!(first["kind"].as_str(), Some("context_ready"));
        assert_eq!(first["memory_space"].as_str(), Some("work"));
        assert_eq!(first["author_mask"].as_str(), Some("me"));
        assert_eq!(first["author_type"].as_str(), Some("human"));
        assert_eq!(first["author_id"].as_str(), Some("user_01"));
        assert_eq!(first["is_human_authored"].as_bool(), Some(true));
        assert_eq!(first["human_only"].as_bool(), Some(true));
        assert_eq!(first["action_label"].as_str(), Some("Open workspace"));
        assert_eq!(
            first["approval_or_reversibility_hint"].as_str(),
            Some("Opening this reveals prepared context only; it does not execute a side effect.")
        );
        assert!(
            first["artifact_summary_lines"]
                .as_array()
                .map(|lines| lines.iter().any(|line| {
                    line.as_str()
                        .map(|value| value.starts_with("Object anchors: "))
                        .unwrap_or(false)
                }))
                .unwrap_or(false)
        );
        assert_eq!(
            first["object_labels"]
                .as_array()
                .and_then(|labels| labels.first())
                .and_then(|label| label.as_str()),
            Some("project aurora")
        );
        assert_eq!(
            first["working_set_refs"]
                .as_array()
                .map(|values| values.len()),
            Some(2)
        );
        assert_eq!(
            first["active_topic_refs"]
                .as_array()
                .map(|values| values.len()),
            Some(3)
        );
        assert_eq!(
            first["decision_history_refs"]
                .as_array()
                .and_then(|values| values.first())
                .and_then(|value| value.as_str()),
            Some("decision:1")
        );
        assert_eq!(
            first["project_refs"]
                .as_array()
                .and_then(|values| values.first())
                .and_then(|value| value.as_str()),
            Some("project:aurora")
        );
        assert_eq!(
            first["thread_refs"]
                .as_array()
                .and_then(|values| values.first())
                .and_then(|value| value.as_str()),
            Some("thread:aurora")
        );
        assert_eq!(
            first["file_refs"]
                .as_array()
                .and_then(|values| values.first())
                .and_then(|value| value.as_str()),
            Some("file:notes/aurora.md")
        );
    }

    #[test]
    fn prepared_draft_heuristic_id_changes_when_material_content_changes() {
        let base = ContinuityPreparedDraftItem {
            id: "draft:reply:msg_1".to_string(),
            draft_class: "communication_reply".to_string(),
            title: "Reply draft".to_string(),
            channel: "email".to_string(),
            summary: "Prepared an email reply draft.".to_string(),
            body: "Thanks for the update.".to_string(),
            confidence: "medium".to_string(),
            readiness: "ready_now".to_string(),
            response_due_hint: "Today".to_string(),
            requires_approval: true,
            suggested_action: "Review and send email reply".to_string(),
            autonomy_decision: None,
            selection_reason: None,
            source_refs: vec!["msg_1".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let mut changed = base.clone();
        changed.body = "Thanks for the update. I can confirm tomorrow.".to_string();

        let first = prepared_draft_heuristic_id(&base);
        let second = prepared_draft_heuristic_id(&changed);

        assert_ne!(first, second);
    }

    #[test]
    fn proactive_action_payload_from_prepared_draft_item_marks_simulator_promoted_preview() {
        let item = ContinuityPreparedDraftItem {
            id: "draft:simulator:1".to_string(),
            draft_class: "project_prep_note".to_string(),
            title: "Simulated project prep note".to_string(),
            channel: "project".to_string(),
            summary: "Prepare alternative draft from propose_alternative around Customer demo."
                .to_string(),
            body: "Prepare alternative draft from propose_alternative around Customer demo."
                .to_string(),
            confidence: "medium".to_string(),
            readiness: "ready_now".to_string(),
            response_due_hint: "Next work session".to_string(),
            requires_approval: false,
            suggested_action: "Review prepared context".to_string(),
            autonomy_decision: None,
            selection_reason: Some("Prepared from bounded simulator projection.".to_string()),
            source_refs: vec!["msg_1".to_string()],
            object_refs: vec!["project:aurora".to_string()],
            object_labels: vec!["project aurora".to_string()],
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let payload = proactive_action_payload_from_prepared_draft_item(
            "user_01",
            "continuity:state:user_01",
            Some("snapshot_1"),
            &item,
        );

        assert_eq!(payload["type"].as_str(), Some("ledger"));
        assert_eq!(payload["kind"].as_str(), Some("rich_note"));
        assert_eq!(payload["parent_id"].as_str(), Some("snapshot_1"));
        assert_eq!(
            payload["metadata"]["simulator_preview_promoted"].as_bool(),
            Some(true)
        );
        assert_eq!(
            payload["metadata"]["draft_origin"].as_str(),
            Some("simulator_prepared_draft_preview")
        );
        assert_eq!(
            payload["content"]["draft_class"].as_str(),
            Some("project_prep_note")
        );
    }

    #[test]
    fn proactive_action_payload_from_prepared_context_packet_marks_simulator_promoted_preview() {
        let packet = PreparedContextPacket {
            packet_kind: PREPARED_CONTEXT_KIND_CONTINUITY.to_string(),
            ready: true,
            summary: "Prepared context packet for Aurora launch.".to_string(),
            anchor_refs: vec!["msg_1".to_string()],
            source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
            object_refs: vec!["project:aurora".to_string()],
            packs: vec![PreparedContextPack {
                pack_id: "pack_1".to_string(),
                pack_kind: "topic_pack".to_string(),
                title: "Aurora launch pack".to_string(),
                summary: "Launch context and source anchors.".to_string(),
                confidence: "medium".to_string(),
                why_surfaced: "Shared project and reference overlap.".to_string(),
                anchor_refs: vec!["msg_1".to_string()],
                source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                reference_refs: vec!["thread:aurora".to_string()],
                object_refs: vec!["project:aurora".to_string()],
                evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                ..crate::prepared_context_packet::PreparedContextPack::default()
            }],
            ..PreparedContextPacket::default()
        };

        let payload = proactive_action_payload_from_prepared_context_packet(
            "user_01",
            "continuity:state:user_01",
            Some("snapshot_1"),
            &packet,
            true,
        );

        assert_eq!(payload["type"].as_str(), Some("ledger"));
        assert_eq!(payload["kind"].as_str(), Some("rich_note"));
        assert_eq!(payload["parent_id"].as_str(), Some("snapshot_1"));
        assert_eq!(
            payload["metadata"]["simulator_preview_promoted"].as_bool(),
            Some(true)
        );
        assert_eq!(
            payload["metadata"]["context_origin"].as_str(),
            Some("simulator_prepared_context_preview")
        );
        assert_eq!(
            payload["content"]["packet_kind"].as_str(),
            Some("continuity_context")
        );
    }

    #[test]
    fn proactive_action_payload_from_context_pack_item_preserves_pack_kind() {
        let item = ContinuityPreparedContextPackItem {
            id: "pack_aurora".to_string(),
            pack_kind: "topic_pack".to_string(),
            title: "Aurora context pack".to_string(),
            summary: "Reference-backed context for Aurora launch.".to_string(),
            confidence: "high".to_string(),
            why_surfaced: "Selected for project-aligned context.".to_string(),
            anchor_refs: vec!["msg_1".to_string()],
            source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
            reference_refs: vec!["thread:aurora".to_string()],
            reference_labels: vec!["Aurora thread".to_string()],
            object_refs: vec!["project:aurora".to_string()],
            object_labels: vec!["project aurora".to_string()],
            evidence_kinds: vec!["reference".to_string(), "project".to_string()],
            thread_retrieval_state: None,
            ..Default::default()
        };

        let payload = proactive_action_payload_from_context_pack_item(
            "user_01",
            "continuity:state:user_01",
            Some("snapshot_1"),
            &item,
            false,
        );

        assert_eq!(
            payload["metadata"]["context_origin"].as_str(),
            Some("continuity_context_pack")
        );
        assert_eq!(
            payload["metadata"]["context_pack_kind"].as_str(),
            Some("topic_pack")
        );
        assert_eq!(
            payload["content"]["packs"]
                .as_array()
                .and_then(|packs| packs.first())
                .and_then(|pack| pack.get("pack_kind"))
                .and_then(Value::as_str),
            Some("topic_pack")
        );
    }

    #[test]
    fn record_outcome_request_builds_optional_memory_workspace_scope() {
        let request = RecordOutcomeRequest {
            suggestion_id: "suggestion_1".to_string(),
            accepted: true,
            outcome_afp_id: None,
            heuristic_id: "study-break".to_string(),
            memory_space: Some("work".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("human".to_string()),
            author_id: Some("user_root".to_string()),
            is_human_authored: Some(true),
            human_only: Some(true),
        };

        let scope = request
            .memory_workspace_scope()
            .expect("scope should exist");
        assert_eq!(scope.memory_space.as_deref(), Some("work"));
        assert_eq!(scope.author_mask.as_deref(), Some("private"));
        assert_eq!(scope.author_type.as_deref(), Some("human"));
        assert_eq!(scope.author_id.as_deref(), Some("user_root"));
        assert_eq!(scope.is_human_authored, Some(true));
        assert_eq!(scope.human_only, Some(true));

        let empty = RecordOutcomeRequest {
            suggestion_id: "suggestion_1".to_string(),
            accepted: true,
            outcome_afp_id: None,
            heuristic_id: "study-break".to_string(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        assert!(empty.memory_workspace_scope().is_none());
    }

    #[test]
    fn state_field_suggestion_from_fields_prefers_approval_required_work() {
        let fields = vec![
            crate::state_fields::StateFieldActivation {
                field_key: crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                label: "Follow-up pressure".to_string(),
                status: "active".to_string(),
                confidence: "medium".to_string(),
                surface_hint: "response_queue".to_string(),
                recommended_action: "Review follow-up queue.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Multiple follow-ups are overdue.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            },
            crate::state_fields::StateFieldActivation {
                field_key: crate::state_fields::STATE_FIELD_APPROVAL_REQUIRED_WORK.to_string(),
                label: "Approval required work".to_string(),
                status: "active".to_string(),
                confidence: "high".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Review approval-gated work.".to_string(),
                autonomy_level: "request_approval".to_string(),
                reason: "Explicit approval boundaries are active.".to_string(),
                evidence_refs: vec!["msg_2".to_string()],
            },
        ];

        let suggestion =
            state_field_suggestion_from_fields(&fields, None).expect("should produce suggestion");
        assert_eq!(
            suggestion["field_key"].as_str(),
            Some(crate::state_fields::STATE_FIELD_APPROVAL_REQUIRED_WORK)
        );
        assert_eq!(suggestion["kind"].as_str(), Some("state_field"));
        assert_eq!(suggestion["requires_approval"].as_bool(), Some(true));
        assert_eq!(
            suggestion["destination_view"].as_str(),
            Some("decision_queue")
        );
        assert_eq!(suggestion["action_label"].as_str(), Some("Review required"));
    }

    #[test]
    fn conversation_attention_items_surface_family_labels_and_review_destinations() {
        let communication = crate::db::PersonalAutomationConversationRecord {
            id: "conv_comm_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "gmail".to_string(),
            account_ref: "person@example.com".to_string(),
            conversation_key: "conv:comm:1".to_string(),
            conversation_family: "communications".to_string(),
            display_label: "Coach follow-up".to_string(),
            latest_message_ref: Some("msg_comm_1".to_string()),
            latest_subject: Some("Coach follow-up".to_string()),
            latest_sender: Some("coach@example.com".to_string()),
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "prepared_draft",
                "latest_artifact_id": "artifact_comm_1",
                "latest_artifact_type": "ledger",
                "latest_artifact_subtype": "prepared_draft",
                "latest_artifact_draft_class": "communication_reply",
                "latest_artifact_destination_view": "response_queue",
                "latest_artifact_summary": "Prepared reply ready for coach follow-up."
            }),
        };
        let renewal = crate::db::PersonalAutomationConversationRecord {
            id: "conv_renewal_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "renewal:internet:1".to_string(),
            conversation_family: "renewals".to_string(),
            display_label: "Acme Fiber".to_string(),
            latest_message_ref: Some("renewal_evt_1".to_string()),
            latest_subject: Some("Acme Fiber".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "prepared_draft",
                "latest_artifact_id": "artifact_renewal_1",
                "latest_artifact_type": "ledger",
                "latest_artifact_subtype": "prepared_draft",
                "latest_artifact_draft_class": "decision_memo",
                "latest_artifact_destination_view": "decision_queue",
                "latest_value_hint": "Potential savings: $18.00",
                "latest_artifact_summary": "Prepared renewal review ready for Acme Fiber."
            }),
        };

        let items = conversation_attention_items_from_records(&[communication, renewal]);
        assert_eq!(items.len(), 2);

        assert_eq!(
            items[0]["conversation_family_label"].as_str(),
            Some("communication")
        );
        assert_eq!(
            items[0]["latest_attention_label"].as_str(),
            Some("draft ready")
        );
        assert_eq!(
            items[0]["review_action_label"].as_str(),
            Some("Review draft")
        );
        assert_eq!(
            items[0]["latest_artifact_destination_view"].as_str(),
            Some("response_queue")
        );
        assert_eq!(items[0]["attention_rank"].as_i64(), Some(200));

        assert_eq!(
            items[1]["conversation_family_label"].as_str(),
            Some("renewal")
        );
        assert_eq!(
            items[1]["latest_attention_label"].as_str(),
            Some("review ready")
        );
        assert_eq!(
            items[1]["review_action_label"].as_str(),
            Some("Review renewal")
        );
        assert_eq!(
            items[1]["latest_artifact_destination_view"].as_str(),
            Some("decision_queue")
        );
        assert_eq!(
            items[1]["latest_value_hint"].as_str(),
            Some("Potential savings: $18.00")
        );
        assert_eq!(items[1]["attention_rank"].as_i64(), Some(258));
    }

    #[test]
    fn conversation_attention_items_surface_bill_labels_and_value_hints() {
        let bill = crate::db::PersonalAutomationConversationRecord {
            id: "conv_bill_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "bill:sydney-water:1".to_string(),
            conversation_family: "bills".to_string(),
            display_label: "Sydney Water".to_string(),
            latest_message_ref: Some("bill_evt_1".to_string()),
            latest_subject: Some("Sydney Water".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "prepared_draft",
                "latest_artifact_id": "artifact_bill_1",
                "latest_artifact_type": "ledger",
                "latest_artifact_subtype": "prepared_draft",
                "latest_artifact_draft_class": "decision_memo",
                "latest_artifact_destination_view": "decision_queue",
                "latest_value_hint": "Amount due: $42.50",
                "latest_artifact_summary": "Prepared bill review ready for Sydney Water."
            }),
        };

        let items = conversation_attention_items_from_records(&[bill]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["conversation_family_label"].as_str(), Some("bill"));
        assert_eq!(
            items[0]["latest_attention_label"].as_str(),
            Some("review ready")
        );
        assert_eq!(
            items[0]["review_action_label"].as_str(),
            Some("Review bill")
        );
        assert_eq!(
            items[0]["latest_artifact_destination_view"].as_str(),
            Some("decision_queue")
        );
        assert_eq!(
            items[0]["latest_value_hint"].as_str(),
            Some("Amount due: $42.50")
        );
        assert_eq!(items[0]["attention_rank"].as_i64(), Some(265));
    }

    #[test]
    fn passive_bill_event_value_hint_uses_amount_before_due_window() {
        let hint = passive_event_value_hint(
            "bill_due",
            &json!({
                "amount_usd": 125.0,
                "days_until_due": 2
            }),
        );

        assert_eq!(hint.as_deref(), Some("Amount due: $125.00"));
    }

    #[test]
    fn passive_form_event_value_hint_prefers_signature_requirement() {
        let hint = passive_event_value_hint(
            "form_due",
            &json!({
                "requires_signature": true,
                "days_until_due": 1,
                "submission_mode": "parent_portal"
            }),
        );

        assert_eq!(hint.as_deref(), Some("Signature required"));
    }

    #[test]
    fn passive_form_event_value_hint_falls_back_to_form_owner() {
        let hint = passive_event_value_hint(
            "form_due",
            &json!({
                "form_owner": "Mia"
            }),
        );

        assert_eq!(hint.as_deref(), Some("For Mia"));
    }

    #[test]
    fn conversation_attention_items_surface_form_labels_and_value_hints() {
        let form = crate::db::PersonalAutomationConversationRecord {
            id: "conv_form_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "form:excursion-consent:1".to_string(),
            conversation_family: "forms".to_string(),
            display_label: "Excursion Consent".to_string(),
            latest_message_ref: Some("form_evt_1".to_string()),
            latest_subject: Some("Excursion Consent".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "prepared_draft",
                "latest_artifact_id": "artifact_form_1",
                "latest_artifact_type": "ledger",
                "latest_artifact_subtype": "prepared_draft",
                "latest_artifact_draft_class": "decision_memo",
                "latest_artifact_destination_view": "decision_queue",
                "latest_value_hint": "Form due in 3 days",
                "latest_artifact_summary": "Prepared form review ready for Excursion Consent.",
                "form_owner": "Mia",
                "submission_mode": "parent_portal",
                "requires_signature": false,
                "sensitive_form": false
            }),
        };

        let items = conversation_attention_items_from_records(&[form]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["conversation_family_label"].as_str(), Some("form"));
        assert_eq!(
            items[0]["latest_attention_label"].as_str(),
            Some("review ready")
        );
        assert_eq!(
            items[0]["review_action_label"].as_str(),
            Some("Review form")
        );
        assert_eq!(
            items[0]["latest_artifact_destination_view"].as_str(),
            Some("decision_queue")
        );
        assert_eq!(
            items[0]["latest_value_hint"].as_str(),
            Some("Form due in 3 days")
        );
        assert_eq!(items[0]["latest_form_owner"].as_str(), Some("Mia"));
        assert_eq!(
            items[0]["latest_submission_mode"].as_str(),
            Some("parent_portal")
        );
        assert_eq!(items[0]["latest_requires_signature"].as_bool(), Some(false));
        assert_eq!(items[0]["latest_sensitive_form"].as_bool(), Some(false));
        assert_eq!(items[0]["attention_rank"].as_i64(), Some(253));
    }

    #[test]
    fn conversation_attention_items_surface_urgent_form_approval_semantics() {
        let form = crate::db::PersonalAutomationConversationRecord {
            id: "conv_form_approval_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "form:medical-consent:1".to_string(),
            conversation_family: "forms".to_string(),
            display_label: "Medical Consent".to_string(),
            latest_message_ref: Some("form_evt_approval_1".to_string()),
            latest_subject: Some("Medical Consent".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "approval_request",
                "latest_artifact_id": "artifact_form_approval_1",
                "latest_artifact_type": "watcher_alert",
                "latest_artifact_subtype": "approval_request",
                "latest_artifact_destination_view": "decision_queue",
                "latest_value_hint": "Signature required",
                "latest_artifact_summary": "Approval required for: Medical Consent"
            }),
        };

        let items = conversation_attention_items_from_records(&[form]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["conversation_family_label"].as_str(), Some("form"));
        assert_eq!(
            items[0]["latest_attention_label"].as_str(),
            Some("approval needed")
        );
        assert_eq!(
            items[0]["review_action_label"].as_str(),
            Some("Review approval")
        );
        assert_eq!(
            items[0]["latest_artifact_destination_view"].as_str(),
            Some("decision_queue")
        );
        assert_eq!(
            items[0]["latest_value_hint"].as_str(),
            Some("Signature required")
        );
        assert_eq!(items[0]["attention_rank"].as_i64(), Some(357));
    }

    #[test]
    fn conversation_attention_items_surface_communication_follow_up_semantics() {
        let communication = crate::db::PersonalAutomationConversationRecord {
            id: "conv_comm_follow_up_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "gmail".to_string(),
            account_ref: "person@example.com".to_string(),
            conversation_key: "conv:comm:follow-up:1".to_string(),
            conversation_family: "communications".to_string(),
            display_label: "Landlord follow-up".to_string(),
            latest_message_ref: Some("msg_comm_follow_up_1".to_string()),
            latest_subject: Some("Lease question".to_string()),
            latest_sender: Some("landlord@example.com".to_string()),
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "background_follow_up",
                "thread_id": "thread_comm_follow_up_1",
                "source_event_id": "evt_comm_follow_up_1",
                "latest_value_hint": "Reply due today"
            }),
        };

        let items = conversation_attention_items_from_records(&[communication]);
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0]["conversation_family_label"].as_str(),
            Some("communication")
        );
        assert_eq!(
            items[0]["latest_attention_label"].as_str(),
            Some("follow-up")
        );
        assert_eq!(
            items[0]["review_action_label"].as_str(),
            Some("Open thread")
        );
        assert_eq!(items[0]["latest_artifact_destination_view"].as_str(), None);
        assert_eq!(
            items[0]["source_event_id"].as_str(),
            Some("evt_comm_follow_up_1")
        );
        assert_eq!(
            items[0]["thread_id"].as_str(),
            Some("thread_comm_follow_up_1")
        );
        assert_eq!(
            items[0]["latest_value_hint"].as_str(),
            Some("Reply due today")
        );
        assert_eq!(items[0]["attention_rank"].as_i64(), Some(100));
    }

    #[test]
    fn conversation_attention_summary_from_records_tracks_mixed_queue_counts() {
        let communication = crate::db::PersonalAutomationConversationRecord {
            id: "conv_comm_mix_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "gmail".to_string(),
            account_ref: "person@example.com".to_string(),
            conversation_key: "conv:comm:mix:1".to_string(),
            conversation_family: "communications".to_string(),
            display_label: "Coach follow-up".to_string(),
            latest_message_ref: Some("msg_comm_mix_1".to_string()),
            latest_subject: Some("Coach follow-up".to_string()),
            latest_sender: Some("coach@example.com".to_string()),
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "background_follow_up"
            }),
        };
        let renewal = crate::db::PersonalAutomationConversationRecord {
            id: "conv_renewal_mix_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "renewal:internet:mix:1".to_string(),
            conversation_family: "renewals".to_string(),
            display_label: "Acme Fiber".to_string(),
            latest_message_ref: Some("renewal_evt_mix_1".to_string()),
            latest_subject: Some("Acme Fiber".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "prepared_draft",
                "latest_artifact_destination_view": "decision_queue"
            }),
        };
        let form = crate::db::PersonalAutomationConversationRecord {
            id: "conv_form_mix_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "form:medical-consent:mix:1".to_string(),
            conversation_family: "forms".to_string(),
            display_label: "Medical Consent".to_string(),
            latest_message_ref: Some("form_evt_mix_1".to_string()),
            latest_subject: Some("Medical Consent".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "approval_request",
                "latest_artifact_destination_view": "decision_queue"
            }),
        };

        let summary = conversation_attention_summary_from_records(&[communication, renewal, form])
            .expect("summary should exist");

        assert_eq!(summary["count"].as_u64(), Some(3));
        assert_eq!(summary["prepared_draft_count"].as_u64(), Some(1));
        assert_eq!(summary["approval_request_count"].as_u64(), Some(1));
        assert_eq!(summary["background_follow_up_count"].as_u64(), Some(1));
        assert_eq!(summary["communication_count"].as_u64(), Some(1));
        assert_eq!(summary["renewal_count"].as_u64(), Some(1));
        assert_eq!(summary["bill_count"].as_u64(), Some(0));
        assert_eq!(summary["form_count"].as_u64(), Some(1));
    }

    #[test]
    fn conversation_attention_items_preserve_unknown_family_labels() {
        let travel = crate::db::PersonalAutomationConversationRecord {
            id: "conv_travel_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "travel:trip:1".to_string(),
            conversation_family: "travel".to_string(),
            display_label: "Flight rebooking".to_string(),
            latest_message_ref: Some("travel_evt_1".to_string()),
            latest_subject: Some("Flight rebooking".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "prepared_draft",
                "latest_artifact_destination_view": "home"
            }),
        };

        let items = conversation_attention_items_from_records(&[travel]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["conversation_family"].as_str(), Some("travel"));
        assert_eq!(
            items[0]["conversation_family_label"].as_str(),
            Some("travel")
        );
        assert_eq!(
            items[0]["latest_attention_label"].as_str(),
            Some("draft ready")
        );
        assert_eq!(
            items[0]["review_action_label"].as_str(),
            Some("Review draft")
        );
    }

    #[test]
    fn conversation_attention_items_unknown_follow_up_uses_open_work_item() {
        let travel = crate::db::PersonalAutomationConversationRecord {
            id: "conv_travel_follow_up_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "manual".to_string(),
            account_ref: "".to_string(),
            conversation_key: "travel:follow-up:1".to_string(),
            conversation_family: "travel".to_string(),
            display_label: "Flight rebooking".to_string(),
            latest_message_ref: Some("travel_evt_follow_up_1".to_string()),
            latest_subject: Some("Flight rebooking".to_string()),
            latest_sender: None,
            health_state: "active".to_string(),
            first_observed_at: "2026-07-17T09:00:00Z".to_string(),
            last_observed_at: "2026-07-17T10:00:00Z".to_string(),
            metadata_json: json!({
                "needs_attention": true,
                "latest_attention_kind": "background_follow_up"
            }),
        };

        let items = conversation_attention_items_from_records(&[travel]);
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0]["conversation_family_label"].as_str(),
            Some("travel")
        );
        assert_eq!(
            items[0]["latest_attention_label"].as_str(),
            Some("follow-up")
        );
        assert_eq!(
            items[0]["review_action_label"].as_str(),
            Some("Open work item")
        );
    }

    #[test]
    fn state_field_suggestion_from_fields_returns_none_for_inactive_fields() {
        let fields = vec![crate::state_fields::StateFieldActivation {
            field_key: crate::state_fields::STATE_FIELD_STALE_KNOWLEDGE_RISK.to_string(),
            label: "Stale knowledge risk".to_string(),
            status: "inactive".to_string(),
            confidence: "low".to_string(),
            surface_hint: "context_panel".to_string(),
            recommended_action: "Refresh old context.".to_string(),
            autonomy_level: "prepare_silently".to_string(),
            reason: "Knowledge freshness looks acceptable.".to_string(),
            evidence_refs: Vec::new(),
        }];

        assert!(state_field_suggestion_from_fields(&fields, None).is_none());
    }

    #[test]
    fn state_field_suggestion_from_fields_prefers_unresolved_decisions_over_array_order() {
        let fields = vec![
            crate::state_fields::StateFieldActivation {
                field_key: crate::state_fields::STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
                label: "Project scope drift".to_string(),
                status: "active".to_string(),
                confidence: "high".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Inspect related project context.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Recent changes suggest scope drift.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            },
            crate::state_fields::StateFieldActivation {
                field_key: crate::state_fields::STATE_FIELD_UNRESOLVED_DECISIONS.to_string(),
                label: "Unresolved decisions".to_string(),
                status: "active".to_string(),
                confidence: "medium".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Review the unresolved decision queue.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "The decision queue still contains unresolved items.".to_string(),
                evidence_refs: vec!["msg_2".to_string(), "msg_3".to_string()],
            },
        ];

        let suggestion =
            state_field_suggestion_from_fields(&fields, None).expect("should produce suggestion");
        assert_eq!(
            suggestion["field_key"].as_str(),
            Some(crate::state_fields::STATE_FIELD_UNRESOLVED_DECISIONS)
        );
        assert_eq!(
            suggestion["destination_view"].as_str(),
            Some("decision_queue")
        );
        assert_eq!(
            suggestion["action_label"].as_str(),
            Some("Open decision queue")
        );
    }

    #[test]
    fn state_field_suggestion_from_fields_preserves_context_panel_destination() {
        let fields = vec![crate::state_fields::StateFieldActivation {
            field_key: crate::state_fields::STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
            label: "Project scope drift".to_string(),
            status: "active".to_string(),
            confidence: "high".to_string(),
            surface_hint: "context_panel".to_string(),
            recommended_action: "Inspect related project context.".to_string(),
            autonomy_level: "suggest_with_artifact".to_string(),
            reason: "Recent project-linked changes suggest scope drift.".to_string(),
            evidence_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
        }];

        let suggestion =
            state_field_suggestion_from_fields(&fields, None).expect("should produce suggestion");
        assert_eq!(
            suggestion["field_key"].as_str(),
            Some(crate::state_fields::STATE_FIELD_PROJECT_SCOPE_DRIFT)
        );
        assert_eq!(suggestion["surface_hint"].as_str(), Some("context_panel"));
        assert_eq!(
            suggestion["destination_view"].as_str(),
            Some("context_panel")
        );
        assert_eq!(suggestion["action_label"].as_str(), Some("Open context"));
    }

    #[test]
    fn state_field_suggestion_from_fields_demotes_follow_up_pressure_when_watcher_context_is_suppressed()
     {
        let fields = vec![
            crate::state_fields::StateFieldActivation {
                field_key: crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
                label: "Follow-up pressure".to_string(),
                status: "active".to_string(),
                confidence: "high".to_string(),
                surface_hint: "response_queue".to_string(),
                recommended_action: "Review follow-up queue.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Multiple follow-ups are overdue.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            },
            crate::state_fields::StateFieldActivation {
                field_key: crate::state_fields::STATE_FIELD_PROJECT_SCOPE_DRIFT.to_string(),
                label: "Project scope drift".to_string(),
                status: "active".to_string(),
                confidence: "high".to_string(),
                surface_hint: "context_panel".to_string(),
                recommended_action: "Inspect related project context.".to_string(),
                autonomy_level: "suggest_with_artifact".to_string(),
                reason: "Recent project-linked changes suggest scope drift.".to_string(),
                evidence_refs: vec!["msg_2".to_string(), "msg_3".to_string()],
            },
        ];
        let preferred_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                        id: "sig_1".to_string(),
                        signal_key: "watcher:study".to_string(),
                        category: "study".to_string(),
                        freshness: "fresh".to_string(),
                        urgency: "today".to_string(),
                        confidence: "medium".to_string(),
                        urgency_hint: "Signal stays visible for auditability while suppression remains active.".to_string(),
                        suppression_status: "suppressed".to_string(),
                        suppression_reason: "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.".to_string(),
                        escalation_status: "deferred".to_string(),
                        escalation_reason: "Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.".to_string(),
                        decrypt_needed: false,
                        source_type: "smart_suggestion".to_string(),
                        source_subtype: "study".to_string(),
                        thread_id: "watcher:user_01".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: fields.clone(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let suggestion = state_field_suggestion_from_fields(&fields, Some(&preferred_state))
            .expect("should produce suggestion");
        assert_eq!(
            suggestion["field_key"].as_str(),
            Some(crate::state_fields::STATE_FIELD_PROJECT_SCOPE_DRIFT)
        );
    }

    #[test]
    fn state_field_suggestion_from_fields_carries_watcher_cooldown_reason_for_follow_up_pressure() {
        let fields = vec![crate::state_fields::StateFieldActivation {
            field_key: crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
            label: "Follow-up pressure".to_string(),
            status: "active".to_string(),
            confidence: "high".to_string(),
            surface_hint: "response_queue".to_string(),
            recommended_action: "Review follow-up queue.".to_string(),
            autonomy_level: "suggest_with_artifact".to_string(),
            reason: "Multiple follow-ups are overdue.".to_string(),
            evidence_refs: vec!["msg_1".to_string()],
        }];
        let preferred_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                        id: "sig_1".to_string(),
                        signal_key: "watcher:study".to_string(),
                        category: "study".to_string(),
                        freshness: "fresh".to_string(),
                        urgency: "today".to_string(),
                        confidence: "medium".to_string(),
                        urgency_hint: "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.".to_string(),
                        suppression_status: "suppressed".to_string(),
                        suppression_reason: "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.".to_string(),
                        escalation_status: "deferred".to_string(),
                        escalation_reason: "Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.".to_string(),
                        decrypt_needed: false,
                        source_type: "smart_suggestion".to_string(),
                        source_subtype: "study".to_string(),
                        thread_id: "watcher:user_01".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: fields.clone(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let suggestion = state_field_suggestion_from_fields(&fields, Some(&preferred_state))
            .expect("should produce suggestion");
        assert_eq!(
            suggestion["field_key"].as_str(),
            Some(crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE)
        );
        assert_eq!(
            suggestion["selection_reason"].as_str(),
            Some(
                "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours."
            )
        );
    }

    #[test]
    fn state_field_suggestion_from_fields_carries_empathy_reason_for_follow_up_pressure() {
        let fields = vec![crate::state_fields::StateFieldActivation {
            field_key: crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE.to_string(),
            label: "Follow-up pressure".to_string(),
            status: "active".to_string(),
            confidence: "high".to_string(),
            surface_hint: "response_queue".to_string(),
            recommended_action: "Review follow-up queue.".to_string(),
            autonomy_level: "suggest_with_artifact".to_string(),
            reason: "Multiple follow-ups are overdue.".to_string(),
            evidence_refs: vec!["msg_1".to_string()],
        }];
        let preferred_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                        id: "sig_1".to_string(),
                        signal_key: "watcher:relationship".to_string(),
                        category: "relationship".to_string(),
                        freshness: "fresh".to_string(),
                        urgency: "today".to_string(),
                        confidence: "high".to_string(),
                        urgency_hint: "Trusted relationship pressure should stay gentle.".to_string(),
                        suppression_status: "trusted".to_string(),
                        suppression_reason: String::new(),
                        escalation_status: "steady".to_string(),
                        escalation_reason: String::new(),
                        decrypt_needed: false,
                        source_type: "watcher_alert".to_string(),
                        source_subtype: "relationship".to_string(),
                        thread_id: "watcher:user_01".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: fields.clone(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                empathy_context: Some(
                    crate::state_synthesizer_contract::EmpathyCoordinationContext {
                        profile_id: Some("clarity_partner".to_string()),
                        tone_mode: Some("calm".to_string()),
                        initiative_level: Some("gentle".to_string()),
                        caution_level: Some("medium".to_string()),
                        watcher_mode: "trusted_gentle".to_string(),
                        suppression_active_count: 0,
                        trusted_signal_count: 1,
                        explanation: Some(
                            "1 watcher signal(s) are trusted from prior outcomes, so gentle continuity framing is appropriate."
                                .to_string(),
                        ),
                    },
                ),
                ..Default::default()
            }),
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let suggestion = state_field_suggestion_from_fields(&fields, Some(&preferred_state))
            .expect("should produce suggestion");
        assert_eq!(
            suggestion["selection_reason"].as_str(),
            Some(
                "1 watcher signal(s) are trusted from prior outcomes, so gentle continuity framing is appropriate."
            )
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_ranks_approval_state_field_above_context_pack() {
        let context_pack = serde_json::json!({
            "id": "context-pack:topic_1",
            "kind": "context_pack",
            "pack_kind": "obligation_pack",
            "title": "Obligation pack",
            "confidence": "high"
        });
        let approval_field = serde_json::json!({
            "id": "state-field:approval_required_work",
            "kind": "state_field",
            "field_key": "approval_required_work",
            "title": "Approval required work",
            "confidence": "high",
            "requires_approval": true
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![],
            None,
            None,
            None,
            None,
            Some(context_pack),
            Some(approval_field),
            None,
        );

        assert_eq!(prioritized.len(), 2);
        assert_eq!(
            prioritized
                .first()
                .and_then(|item| item["field_key"].as_str()),
            Some("approval_required_work")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_action_aligned_prepared_draft_when_continuity_intent_exists()
     {
        let reply_draft = serde_json::json!({
            "id": "prepared-draft:reply",
            "kind": "prepared_draft",
            "title": "Reply draft",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "response_due_hint": "Today",
            "suggested_action": "Reply in thread",
        });
        let context_draft = serde_json::json!({
            "id": "prepared-draft:context",
            "kind": "prepared_draft",
            "title": "Prep note",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "response_due_hint": "Today",
            "suggested_action": "Review prepared context",
        });

        let continuity_priority = ContinuityPriorityItem {
            title: "Reply to team".to_string(),
            panel_kind: "response_queue".to_string(),
            requires_approval: false,
            surface_hint: Some("response_queue".to_string()),
            suggested_action: Some("Reply in thread".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: None,
            source_refs: vec!["msg_1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let prioritized = prioritize_proactive_suggestions(
            vec![context_draft, reply_draft],
            Some(&continuity_priority),
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(prioritized[0]["id"].as_str(), Some("prepared-draft:reply"));
    }

    #[test]
    fn prioritize_proactive_suggestions_suppresses_decision_priority_placeholder_when_prepared_decision_support_exists()
     {
        let decision_support_draft = serde_json::json!({
            "id": "prepared-draft:decision-memo",
            "kind": "prepared_draft",
            "title": "Decision memo",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "decision_memo",
            "suggested_action": "Review decision memo",
        });

        let continuity_priority = ContinuityPriorityItem {
            title: "Review renewal decision".to_string(),
            panel_kind: "decision_queue".to_string(),
            requires_approval: false,
            surface_hint: Some("decision_queue".to_string()),
            suggested_action: Some("Review decision memo".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: Some("decision_memo".to_string()),
            selection_reason: Some(
                "Decision support was prepared from the current queue and evidence.".to_string(),
            ),
            source_refs: vec!["msg_decision_1".to_string(), "msg_decision_2".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let continuity_priority_card = ContinuityPriorityCard {
            title: "Review renewal decision".to_string(),
            action_label: "Open decision queue".to_string(),
            description: "Prepared decision support is ready for review.".to_string(),
            panel_kind: "decision_queue".to_string(),
            linked_target_label: Some("Renewal thread".to_string()),
            requires_approval: false,
            surface_hint: Some("decision_queue".to_string()),
            confidence: Some("high".to_string()),
            source_refs: vec!["msg_decision_1".to_string(), "msg_decision_2".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            file_refs: Vec::new(),
            file_labels: Vec::new(),
            selection_reason: continuity_priority.selection_reason.clone(),
            prepared_draft_class: Some("decision_memo".to_string()),
            approval_or_reversibility_hint: None,
            provenance_cue: None,
            autonomy_tier: None,
            retrieval_mode: None,
            deeper_retrieval_recommended: false,
            readiness_reason: None,
            topology_budget_used: 0,
            working_set_count: 0,
            active_topic_count: 0,
            working_set_refs: Vec::new(),
            active_topic_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            project_refs: Vec::new(),
            thread_refs: Vec::new(),
            thread_retrieval_state: None,
            autonomy_decision: None,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let prioritized = prioritize_proactive_suggestions(
            Vec::new(),
            Some(&continuity_priority),
            Some(&continuity_priority_card),
            Some(decision_support_draft),
            None,
            None,
            None,
            None,
        );

        assert_eq!(prioritized.len(), 1);
        assert_eq!(
            prioritized.first().and_then(|item| item["kind"].as_str()),
            Some("prepared_draft")
        );
        assert_eq!(
            prioritized.first().and_then(|item| item["id"].as_str()),
            Some("prepared-draft:decision-memo")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_user_grounded_prepared_draft_when_other_ranks_tie()
    {
        let generic_draft = serde_json::json!({
            "id": "prepared-draft:generic",
            "kind": "prepared_draft",
            "title": "Prepared note",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "project_prep_note",
            "suggested_action": "Review prep note",
            "author_type": "agent",
            "author_mask": "public"
        });
        let grounded_draft = serde_json::json!({
            "id": "prepared-draft:grounded",
            "kind": "prepared_draft",
            "title": "Prepared note",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "project_prep_note",
            "suggested_action": "Review prep note",
            "memory_space": "work",
            "author_type": "human",
            "author_id": "user_01",
            "author_mask": "private",
            "is_human_authored": true
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![generic_draft, grounded_draft],
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(
            prioritized[0]["id"].as_str(),
            Some("prepared-draft:grounded")
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_more_immediate_prepared_draft_when_other_ranks_tie()
    {
        let later_draft = serde_json::json!({
            "id": "prepared-draft:week",
            "kind": "prepared_draft",
            "title": "Reply later this week",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "follow_up_at": "This week",
            "response_due_hint": "This week",
            "memory_space": "work",
            "author_type": "human",
            "author_id": "user_01",
            "author_mask": "private",
            "is_human_authored": true
        });
        let immediate_draft = serde_json::json!({
            "id": "prepared-draft:today",
            "kind": "prepared_draft",
            "title": "Reply today",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "follow_up_at": "Today",
            "response_due_hint": "Today",
            "memory_space": "work",
            "author_type": "human",
            "author_id": "user_01",
            "author_mask": "private",
            "is_human_authored": true
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![later_draft, immediate_draft],
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(prioritized[0]["id"].as_str(), Some("prepared-draft:today"));
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_file_linked_prepared_draft_when_other_ranks_tie() {
        let generic_draft = serde_json::json!({
            "id": "prepared-draft:generic",
            "kind": "prepared_draft",
            "title": "Reply today",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "follow_up_at": "Today",
            "response_due_hint": "Today",
            "memory_space": "work",
            "author_type": "human",
            "author_id": "user_01",
            "author_mask": "private",
            "is_human_authored": true,
            "file_refs": [],
            "file_labels": []
        });
        let file_linked_draft = serde_json::json!({
            "id": "prepared-draft:file",
            "kind": "prepared_draft",
            "title": "Reply today",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "follow_up_at": "Today",
            "response_due_hint": "Today",
            "memory_space": "work",
            "author_type": "human",
            "author_id": "user_01",
            "author_mask": "private",
            "is_human_authored": true,
            "file_refs": ["file:docs/launch-brief.md"],
            "file_labels": ["launch-brief.md"]
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![generic_draft, file_linked_draft],
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(prioritized[0]["id"].as_str(), Some("prepared-draft:file"));
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_attention_window_matched_draft_when_other_ranks_tie()
     {
        let generic_draft = serde_json::json!({
            "id": "prepared-draft:generic",
            "kind": "prepared_draft",
            "title": "Reply today",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "response_due_hint": "Today",
            "source_refs": ["msg_generic"]
        });
        let matched_draft = serde_json::json!({
            "id": "prepared-draft:matched",
            "kind": "prepared_draft",
            "title": "Reply today",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "response_due_hint": "Today",
            "source_refs": ["msg_focus"]
        });
        let attention_window = serde_json::json!({
            "source_refs": ["msg_focus"],
            "object_refs": [],
            "thread_refs": [],
            "file_refs": [],
            "memory_spaces": [],
            "expires_in_seconds": 300
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![generic_draft, matched_draft],
            None,
            None,
            None,
            None,
            None,
            None,
            Some(&attention_window),
        );

        assert_eq!(
            prioritized[0]["id"].as_str(),
            Some("prepared-draft:matched")
        );
        assert_eq!(
            prioritized[0]["attention_window_match_count"].as_u64(),
            Some(1)
        );
        assert_eq!(
            prioritized[0]["attention_window_expires_in_seconds"].as_u64(),
            Some(300)
        );
    }

    #[test]
    fn prioritize_proactive_suggestions_prefers_more_evidenced_prepared_draft_when_other_ranks_tie()
    {
        let light_draft = serde_json::json!({
            "id": "prepared-draft:light",
            "kind": "prepared_draft",
            "title": "Reply today",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "response_due_hint": "Today",
            "memory_space": "work",
            "author_type": "human",
            "author_id": "user_01",
            "author_mask": "private",
            "is_human_authored": true,
            "source_refs": ["msg_light"],
            "source_count": 1
        });
        let grounded_draft = serde_json::json!({
            "id": "prepared-draft:grounded",
            "kind": "prepared_draft",
            "title": "Reply today",
            "confidence": "high",
            "readiness": "ready_now",
            "requires_approval": false,
            "draft_class": "communication_reply",
            "suggested_action": "Reply in thread",
            "response_due_hint": "Today",
            "memory_space": "work",
            "author_type": "human",
            "author_id": "user_01",
            "author_mask": "private",
            "is_human_authored": true,
            "source_refs": ["msg_a", "msg_b", "msg_c"],
            "source_count": 3
        });

        let prioritized = prioritize_proactive_suggestions(
            vec![light_draft, grounded_draft],
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(
            prioritized[0]["id"].as_str(),
            Some("prepared-draft:grounded")
        );
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_file_linked_draft_when_other_ranks_tie() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_file_preference".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                crate::state_snapshot::StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_file".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply in thread".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(
                        crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context ready.".to_string(),
                            anchor_refs: vec!["msg_file".to_string()],
                            source_refs: vec!["msg_file".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: Vec::new(),
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: Vec::new(),
                            thread_refs: Vec::new(),
                            file_refs: vec!["file:docs/launch-brief.md".to_string()],
                            packs: Vec::new(),
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        },
                    ),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let item = prepared_draft_suggestion_from_state(
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_plain".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Plain reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Plain reply path.".to_string()),
                    source_refs: vec!["msg_plain".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                },
                ContinuityPreparedDraftItem {
                    id: "draft_file".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "File-linked reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("File-linked reply path.".to_string()),
                    source_refs: vec!["msg_file".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                },
            ],
            Some(&continuity_state),
            None,
        )
        .expect("prepared draft suggestion");

        assert_eq!(item["id"].as_str(), Some("prepared-draft:draft_file"));
        assert_eq!(item["title"].as_str(), Some("File-linked reply draft"));
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_grounded_draft_when_other_ranks_tie() {
        let item = prepared_draft_suggestion_from_state(
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_generic".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Plain reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Plain reply path.".to_string()),
                    source_refs: vec!["msg_plain".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: None,
                    author_mask: Some("public".to_string()),
                    author_type: Some("agent".to_string()),
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                },
                ContinuityPreparedDraftItem {
                    id: "draft_grounded".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Grounded reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Grounded reply path.".to_string()),
                    source_refs: vec!["msg_grounded".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: None,
                },
            ],
            None,
            None,
        )
        .expect("prepared draft suggestion");

        assert_eq!(item["id"].as_str(), Some("prepared-draft:draft_grounded"));
        assert_eq!(item["title"].as_str(), Some("Grounded reply draft"));
    }

    #[test]
    fn prepared_draft_suggestion_from_state_prefers_more_evidenced_draft_when_other_ranks_tie() {
        let item = prepared_draft_suggestion_from_state(
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_light".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Light reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Prepared support is ready.".to_string()),
                    source_refs: vec!["msg_plain".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: None,
                },
                ContinuityPreparedDraftItem {
                    id: "draft_grounded".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Grounded reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Prepared support is ready.".to_string()),
                    source_refs: vec![
                        "msg_plain".to_string(),
                        "thread:client".to_string(),
                        "file:brief".to_string(),
                    ],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: None,
                },
            ],
            None,
            None,
        )
        .expect("prepared draft suggestion");

        assert_eq!(item["id"].as_str(), Some("prepared-draft:draft_grounded"));
        assert_eq!(item["title"].as_str(), Some("Grounded reply draft"));
    }
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/events/passive", post(ingest_passive_event_http))
        .route(
            "/proactive/suggestions",
            get(list_proactive_suggestions_http),
        )
        .route(
            "/proactive/conversations",
            get(list_personal_automation_conversations_http),
        )
        .route("/proactive/outcomes", post(record_proactive_outcome_http))
        .route("/proactive/audit", get(proactive_audit_log_http))
        .route("/memory/context", get(memory_context_http))
        .route("/proactive/packs", get(list_packs_http))
        .route("/proactive/packs/{pack_id}/enable", post(enable_pack_http))
        .route(
            "/proactive/packs/{pack_id}/disable",
            post(disable_pack_http),
        )
        .route("/proactive/autonomy/{heuristic_id}", get(get_autonomy_http))
        .route("/proactive/autonomy/{heuristic_id}", put(set_autonomy_http))
        .route("/proactive/level", get(get_proactivity_level_http))
        .route("/proactive/level", post(set_proactivity_level_http))
}

// ── P1.2: POST /events/passive ────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct PassiveEventRequest {
    /// AFP subtype (e.g. "calendar_event_completed").
    event_type: String,
    /// Source system: "calendar" | "email" | "workflow" | "keyboard"
    source: String,
    #[serde(default)]
    entity_id: Option<String>,
    /// ISO 8601 timestamp when the external event occurred.
    event_at: String,
    /// Estimated confidence 0.0–1.0 (defaults to 1.0 when omitted).
    #[serde(default = "default_one")]
    confidence: f64,
    /// Arbitrary metadata key/value pairs.
    #[serde(default)]
    metadata: serde_json::Value,
    /// AFP thread_id to store the event on (defaults to a per-user passive events thread).
    #[serde(default)]
    thread_id: Option<String>,
}

fn default_one() -> f64 {
    1.0
}

async fn ingest_passive_event_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PassiveEventRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let prefs = state
        .db
        .get_agent_preferences(&user.id)
        .await
        .unwrap_or(None);

    let thread_id = req
        .thread_id
        .clone()
        .unwrap_or_else(|| format!("passive:{}", user.id));

    let event_content = AfpPassiveEventContent {
        event_type: req.event_type.clone(),
        source: req.source.clone(),
        entity_id: req.entity_id.clone(),
        event_at: req.event_at.clone(),
        confidence: req.confidence,
        metadata: req.metadata.clone(),
        ..Default::default()
    };
    let reply_policy_metadata = if let Some(email) = req
        .metadata
        .get("from_address")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(
            state
                .db
                .get_contact_reply_policy_metadata(&user.id, email)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?,
        )
        .flatten()
    } else {
        None
    };
    let event_content =
        enrich_mail_passive_event_with_reply_policy(&event_content, reply_policy_metadata.as_ref());
    let recent_conversation_context = if let Some(conversation_key) = req
        .metadata
        .get("external_conversation_key")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let exclude_smtp_id = req
            .metadata
            .get("smtp_message_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        state
            .db
            .recent_private_incoming_email_conversation_context(
                &user.id,
                conversation_key,
                exclude_smtp_id,
                4,
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?
    } else {
        Vec::new()
    };
    let event_content = enrich_mail_passive_event_with_recent_conversation_context(
        &event_content,
        &recent_conversation_context,
    );
    let recent_contact_context = if let Some(email) = req
        .metadata
        .get("from_address")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let exclude_smtp_id = req
            .metadata
            .get("smtp_message_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        state
            .db
            .recent_private_incoming_email_context(&user.id, email, exclude_smtp_id, 3)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?
    } else {
        Vec::new()
    };
    let event_content = enrich_mail_passive_event_with_recent_contact_context(
        &event_content,
        &recent_contact_context,
    );
    let recent_thread_context = {
        let mut thread_targets = Vec::new();
        if let Some(in_reply_to) = req
            .metadata
            .get("in_reply_to")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            thread_targets.push(in_reply_to.to_string());
        }
        if let Some(reference_targets) = req
            .metadata
            .get("reference_targets")
            .and_then(Value::as_array)
        {
            for target in reference_targets.iter().filter_map(Value::as_str) {
                let trimmed = target.trim();
                if !trimmed.is_empty() {
                    thread_targets.push(trimmed.to_string());
                }
            }
        }
        thread_targets.sort();
        thread_targets.dedup();
        let exclude_smtp_id = req
            .metadata
            .get("smtp_message_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        state
            .db
            .recent_private_incoming_email_thread_context(
                &user.id,
                &thread_targets,
                exclude_smtp_id,
                3,
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?
    };
    let event_content = enrich_mail_passive_event_with_recent_thread_context(
        &event_content,
        &recent_thread_context,
    );

    // Store as AFP passive_event message (no LLM, 202-style fire-and-store).
    let afp_msg = new_server_message(
        "proactive_engine".to_string(),
        vec![user.id.clone()],
        thread_id.clone(),
        AFP_TYPE_PASSIVE_EVENT,
        serde_json::to_value(&event_content).unwrap_or_default(),
        vec![],
        vec![],
        vec![],
        false,
    )
    .map_err(internal_http_error)?;

    let event_afp_id = afp_msg.id.clone();

    // Persist the passive event message.
    let proto_msg = afp_to_proto(&afp_msg);
    state
        .db
        .store_message(
            &proto_msg,
            serde_json::to_value(&event_content).unwrap_or_default(),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    // Bridge only authenticated, already persisted passive events to the existing
    // daemon AFP ledger. Its post-insert hook re-reads the owner partition.
    if crate::runbook_hooks::HookPolicy::from_env().event_allowed(&user.id, "passive_event") {
        if let Ok(value) = serde_json::to_value(&afp_msg) {
            if crate::runbook_hooks::bridge_passive_event(&state.db, &user.id, &value).await.is_err() {
                tracing::warn!("Runbook passive-event bridge deferred");
            }
        }
    }

    // P2.3: Run heuristic evaluator synchronously — zero token cost.
    // P2.4: Apply acceptance-rate feedback to adjust confidence thresholds.
    // Merge builtin heuristics with any extended packs the user has enabled.
    let acceptance_rates = state
        .db
        .heuristic_acceptance_rates(&user.id)
        .await
        .unwrap_or_default();
    let enabled_packs = state
        .db
        .get_enabled_packs(&user.id)
        .await
        .unwrap_or_default();
    let mut all_heuristics = builtin_heuristics();
    all_heuristics.extend(heuristics_for_packs(&enabled_packs));
    let heuristics = apply_confidence_feedback(all_heuristics, &acceptance_rates);
    let eval_results = evaluate(&event_content, &req.event_type, &heuristics);

    // P4: Resolve LLM backend — privacy-first: prefer user's BYOK key before server env vars.
    // Tier 1 = user's own key; Tier 2 = server-side shared key.
    let llm_backend_opt =
        super::llm_resolution::resolve_user_inference_backend(&state.db, &user.id)
            .await
            .ok()
            .flatten()
            .map(|resolved| (resolved.backend, resolved.model));
    let reasoning_guidance =
        super::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(&user.id)
            .unwrap_or_default();

    // Fetch behavioral + temporal context once for all suggestions in this request.
    let behavioral = state
        .db
        .list_behavioral_memory(&user.id, 5)
        .await
        .unwrap_or_default();
    let temporal = state.db.query_temporal_summary(5).await.unwrap_or_default();
    let prefs_struct: AgentPreferences = prefs
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    let source_allows_suggestions =
        proactive_source_allowed(&req.source, &req.metadata, &prefs_struct);
    // Hoist the global proactivity level — same for all evals in this batch.
    let global_level = state.db.get_proactivity_level(&user.id).await.unwrap_or(2);
    let connected_capabilities = state
        .db
        .list_user_connected_capabilities(&user.id)
        .await
        .unwrap_or_default();
    let priority_rules = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .ok()
        .flatten()
        .and_then(|instance| instance.get("priority_rules").cloned())
        .unwrap_or_else(default_priority_rules);

    let mut suggestion_ids: Vec<String> = Vec::new();
    let mut automation_artifact_ids: Vec<String> = Vec::new();
    let mut automation_registry_artifact_json: Option<Value> = None;
    for eval in &eval_results {
        if !source_allows_suggestions {
            continue;
        }
        // P4: Try LLM gate to improve the suggestion wording (falls back to template on any failure).
        let final_eval: std::borrow::Cow<EvaluationResult> =
            if let Some((ref backend, ref model)) = llm_backend_opt {
                match run_llm_gate(
                    &state.db,
                    backend,
                    model,
                    &user.id,
                    &req.event_type,
                    eval,
                    &behavioral,
                    &temporal,
                    &reasoning_guidance,
                )
                .await
                {
                    Some(improved) => {
                        let mut improved_eval = eval.clone();
                        improved_eval.suggestion = improved;
                        std::borrow::Cow::Owned(improved_eval)
                    }
                    None => std::borrow::Cow::Borrowed(eval),
                }
            } else {
                std::borrow::Cow::Borrowed(eval)
            };

        // P7.1: Resolve autonomy tier — check DB override first, then derive from confidence.
        // Apply global proactivity level cap (1=ask_always, 2=max notify_then_act, 3=full auto).
        let confidence = final_eval.suggestion.confidence;
        let raw_tier = state
            .db
            .get_autonomy_override(&user.id, &final_eval.heuristic_id)
            .await
            .unwrap_or(None)
            .unwrap_or_else(|| {
                ProactiveAutonomyTier::from_confidence(confidence)
                    .as_str()
                    .to_string()
            });
        let tier = ProactiveAutonomyTier::parse(&raw_tier)
            .unwrap_or(ProactiveAutonomyTier::AskAlways)
            .cap_to_proactivity_level(global_level);
        let tier_str = tier.as_str();

        let autonomy_decision = autonomy_decision_for_proactive_enum(tier);
        let bundle = build_suggestion_afp_bundle_with_autonomy(
            &user.id,
            &thread_id,
            &final_eval,
            Some(&event_afp_id),
            tier_str,
            &autonomy_decision,
        );
        let suggestion_json = bundle.suggestion_afp.clone();

        if let Ok(suggestion_afp) =
            serde_json::from_value::<crate::message::AFPMessage>(suggestion_json.clone())
        {
            let content = suggestion_json.get("content").cloned().unwrap_or_default();
            let _ =
                store_and_prune_proactive_suggestion(&state, &user.id, &suggestion_afp, content)
                    .await;
            let suggestion_afp_id = suggestion_afp.id.clone();
            suggestion_ids.push(suggestion_afp_id.clone());
            store_proactive_companion_afps(&state.db, bundle.companion_afps).await;

            // P7.1/P7.2: Auto-execute tier — emit proactive_action_taken AFP immediately.
            if tier == ProactiveAutonomyTier::AutoExecute {
                let audit_content = json!({
                    "heuristic_id": final_eval.heuristic_id,
                    "suggestion_id": suggestion_afp_id,
                    "autonomy_tier": tier_str,
                    "autonomy_decision": autonomy_decision,
                    "action_label": final_eval.suggestion.action_label,
                    "confidence": confidence,
                });
                if let Ok(action_afp) = new_server_message(
                    "proactive_engine".to_string(),
                    vec![user.id.clone()],
                    thread_id.clone(),
                    AFP_TYPE_PROACTIVE_ACTION_TAKEN,
                    audit_content.clone(),
                    vec![],
                    vec![],
                    vec![],
                    false,
                ) {
                    let action_proto = afp_to_proto(&action_afp);
                    let _ = state
                        .db
                        .store_message(&action_proto, audit_content.clone())
                        .await;
                    let _ = state
                        .db
                        .log_proactive_action(
                            &user.id,
                            &final_eval.heuristic_id,
                            &suggestion_ids[suggestion_ids.len() - 1],
                            AFP_TYPE_PROACTIVE_ACTION_TAKEN,
                            Some(audit_content),
                            Some(&action_afp.id),
                            tier_str,
                            0,
                        )
                        .await;
                }
            }
        }
    }

    let automation_source_ref = req
        .metadata
        .get("message_id")
        .and_then(Value::as_str)
        .or_else(|| req.metadata.get("smtp_message_id").and_then(Value::as_str))
        .or(req.entity_id.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("{}:{value}", req.source.trim()))
        .unwrap_or_else(|| event_afp_id.clone());

    if let Some(automation_artifact_json) = plan_passive_event_background_artifact(
        &user.id,
        &thread_id,
        &automation_source_ref,
        &event_content,
        &req.event_type,
        &connected_capabilities,
        &priority_rules,
    ) {
        if let Ok(automation_afp) =
            serde_json::from_value::<crate::message::AFPMessage>(automation_artifact_json.clone())
        {
            let proto = afp_to_proto(&automation_afp);
            let content = automation_artifact_json
                .get("content")
                .cloned()
                .unwrap_or_default();
            let _ = state.db.store_message(&proto, content).await;
            automation_artifact_ids.push(automation_afp.id.clone());
            automation_registry_artifact_json = Some(automation_afp_to_json(&automation_afp));
        }
    }

    let registry_projection = req
        .metadata
        .get("external_conversation_key")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|conversation_key| {
            (
                conversation_key.to_string(),
                "communications".to_string(),
                req.metadata
                    .get("subject")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("Conversation")
                    .to_string(),
                req.metadata
                    .get("from_address")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                req.metadata
                    .get("subject")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                req.metadata
                    .get("message_id")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
                    .or_else(|| req.entity_id.clone()),
                serde_json::json!({
                    "source": req.source,
                    "event_type": req.event_type,
                    "external_conversation_key": conversation_key,
                }),
            )
        })
        .or_else(|| {
            if !matches!(
                req.event_type.trim().to_ascii_lowercase().as_str(),
                "renewal_due" | "subscription_renewal_due" | "insurance_renewal"
            ) {
                return None;
            }
            let renewal_key = req
                .metadata
                .get("renewal_key")
                .or_else(|| req.metadata.get("subscription_id"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .or_else(|| req.entity_id.clone())?;
            let display_label = req
                .metadata
                .get("service_name")
                .or_else(|| req.metadata.get("subject"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Renewal review")
                .to_string();
            Some((
                renewal_key,
                "renewals".to_string(),
                display_label.clone(),
                None,
                Some(display_label),
                req.entity_id.clone(),
                serde_json::json!({
                    "source": req.source,
                    "event_type": req.event_type,
                    "renewal_key": req.metadata.get("renewal_key").cloned().unwrap_or(Value::Null),
                    "subscription_id": req.metadata.get("subscription_id").cloned().unwrap_or(Value::Null),
                    "service_name": req.metadata.get("service_name").cloned().unwrap_or(Value::Null),
                    "renewal_kind": req.metadata.get("renewal_kind").cloned().unwrap_or(Value::Null),
                }),
            ))
        })
        .or_else(|| {
            if !matches!(
                req.event_type.trim().to_ascii_lowercase().as_str(),
                "bill_due" | "utility_bill_due" | "invoice_due"
            ) {
                return None;
            }
            let bill_key = req
                .metadata
                .get("bill_key")
                .or_else(|| req.metadata.get("invoice_id"))
                .or_else(|| req.metadata.get("account_ref"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .or_else(|| req.entity_id.clone())?;
            let display_label = req
                .metadata
                .get("biller_name")
                .or_else(|| req.metadata.get("service_name"))
                .or_else(|| req.metadata.get("subject"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Bill review")
                .to_string();
            Some((
                bill_key,
                "bills".to_string(),
                display_label.clone(),
                None,
                Some(display_label),
                req.entity_id.clone(),
                serde_json::json!({
                    "source": req.source,
                    "event_type": req.event_type,
                    "bill_key": req.metadata.get("bill_key").cloned().unwrap_or(Value::Null),
                    "invoice_id": req.metadata.get("invoice_id").cloned().unwrap_or(Value::Null),
                    "biller_name": req.metadata.get("biller_name").cloned().unwrap_or(Value::Null),
                    "bill_kind": req.metadata.get("bill_kind").cloned().unwrap_or(Value::Null),
                    "amount_usd": req.metadata.get("amount_usd").cloned().unwrap_or(Value::Null),
                    "days_until_due": req.metadata.get("days_until_due").cloned().unwrap_or(Value::Null),
                }),
            ))
        })
        .or_else(|| {
            if !matches!(
                req.event_type.trim().to_ascii_lowercase().as_str(),
                "form_due" | "school_form_due" | "admin_form_due"
            ) {
                return None;
            }
            let form_key = req
                .metadata
                .get("form_key")
                .or_else(|| req.metadata.get("form_id"))
                .or_else(|| req.metadata.get("account_ref"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .or_else(|| req.entity_id.clone())?;
            let display_label = req
                .metadata
                .get("form_name")
                .or_else(|| req.metadata.get("subject"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Form review")
                .to_string();
            Some((
                form_key,
                "forms".to_string(),
                display_label.clone(),
                None,
                Some(display_label),
                req.entity_id.clone(),
                serde_json::json!({
                    "source": req.source,
                    "event_type": req.event_type,
                    "form_key": req.metadata.get("form_key").cloned().unwrap_or(Value::Null),
                    "form_id": req.metadata.get("form_id").cloned().unwrap_or(Value::Null),
                    "form_name": req.metadata.get("form_name").cloned().unwrap_or(Value::Null),
                    "form_kind": req.metadata.get("form_kind").cloned().unwrap_or(Value::Null),
                    "days_until_due": req.metadata.get("days_until_due").cloned().unwrap_or(Value::Null),
                    "form_owner": req.metadata.get("form_owner").cloned().unwrap_or(Value::Null),
                    "submission_mode": req.metadata.get("submission_mode").cloned().unwrap_or(Value::Null),
                    "requires_signature": req.metadata.get("requires_signature").cloned().unwrap_or(Value::Bool(false)),
                    "sensitive_form": req.metadata.get("sensitive_form").cloned().unwrap_or(Value::Bool(false)),
                }),
            ))
        });

    if let Some((
        conversation_key,
        conversation_family,
        display_label,
        latest_sender,
        latest_subject,
        latest_message_ref,
        registry_metadata,
    )) = registry_projection
    {
        let provider = req
            .metadata
            .get("provider")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("gmail");
        let account_ref = req
            .metadata
            .get("account_ref")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or_default();
        let (
            needs_attention,
            latest_attention_kind,
            latest_artifact_id,
            latest_artifact_type,
            latest_artifact_subtype,
            latest_artifact_draft_class,
            latest_artifact_destination_view,
            latest_value_hint,
            latest_artifact_summary,
        ) = conversation_attention_metadata(automation_registry_artifact_json.as_ref());
        let latest_value_hint = latest_value_hint.or_else(|| {
            passive_event_value_hint(
                req.event_type.trim().to_ascii_lowercase().as_str(),
                &req.metadata,
            )
        });
        let attention_rank = crate::conversation_attention::conversation_attention_rank(
            &conversation_family,
            latest_attention_kind,
            latest_value_hint.as_deref(),
        );
        state
            .db
            .upsert_personal_automation_conversation(
                &crate::db::PersonalAutomationConversationRecord {
                    id: String::new(),
                    user_id: user.id.clone(),
                    provider: provider.to_string(),
                    account_ref: account_ref.to_string(),
                    conversation_key,
                    conversation_family,
                    display_label,
                    latest_message_ref,
                    latest_subject,
                    latest_sender,
                    health_state: "active".to_string(),
                    first_observed_at: req.event_at.clone(),
                    last_observed_at: req.event_at.clone(),
                    metadata_json: serde_json::json!({
                        "account_ref": account_ref,
                        "thread_id": thread_id,
                        "source_event_id": event_afp_id,
                        "needs_attention": needs_attention,
                        "attention_rank": attention_rank,
                        "latest_attention_kind": latest_attention_kind,
                        "latest_artifact_id": latest_artifact_id,
                        "latest_artifact_type": latest_artifact_type,
                        "latest_artifact_subtype": latest_artifact_subtype,
                        "latest_artifact_draft_class": latest_artifact_draft_class,
                        "latest_artifact_destination_view": latest_artifact_destination_view,
                        "latest_value_hint": latest_value_hint,
                        "latest_artifact_summary": latest_artifact_summary,
                        "registry_metadata": registry_metadata,
                    }),
                },
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }

    // Emit proactive_trigger AFP once per event batch (transparency + audit).
    if !eval_results.is_empty() {
        let gate = TokenBudgetGate::new(&state.db);
        let (decision, daily_used, daily_limit) = gate
            .check_and_gate(&user.id, "event-batch-summary", 0)
            .await;
        let trigger_val = TokenBudgetGate::build_proactive_trigger_afp(
            &user.id,
            "event-batch-summary",
            daily_used,
            daily_limit,
            &decision,
            "local",
        );
        if let Ok(trigger_afp) =
            serde_json::from_value::<crate::message::AFPMessage>(trigger_val.clone())
        {
            let proto = afp_to_proto(&trigger_afp);
            let _ = state.db.store_message(&proto, trigger_val).await;
        }
    }

    // Emit token_budget_log AFP if LLM gate ran and emitted at least one suggestion.
    if llm_backend_opt.is_some() && !suggestion_ids.is_empty() {
        let daily_total = state
            .db
            .daily_total_token_usage(&user.id)
            .await
            .unwrap_or(0);
        let (daily_limit, _, _) = state
            .db
            .get_user_token_budget(&user.id)
            .await
            .unwrap_or((50_000, 80.0, true));
        let provider_tier = "user_key";
        let model_id = llm_backend_opt
            .as_ref()
            .map(|(_, m)| m.as_str())
            .unwrap_or("unknown");
        let budget_log = TokenBudgetGate::build_token_budget_log_afp(
            &user.id,
            "llm-gate-batch",
            0,
            daily_total,
            daily_limit,
            provider_tier,
            model_id,
        );
        if let Ok(log_afp) =
            serde_json::from_value::<crate::message::AFPMessage>(budget_log.clone())
        {
            let proto = afp_to_proto(&log_afp);
            let _ = state.db.store_message(&proto, budget_log).await;
        }
    }

    // P6.2 / Pack suggester: after evaluating, check if new packs should be suggested.
    let behavioral = state
        .db
        .list_behavioral_memory(&user.id, 10)
        .await
        .unwrap_or_default();
    let temporal_for_suggest = state
        .db
        .query_temporal_summary(10)
        .await
        .unwrap_or_default();
    let suggested = suggest_packs_from_behavior(&behavioral, &temporal_for_suggest, &enabled_packs);
    for (pack_id, reason) in suggested {
        // Emit a proactive_suggestion of subtype "pack_suggestion" so the UI can render it.
        let pack_content = json!({
            "heuristic_id": format!("pack-suggest-{pack_id}"),
            "confidence": 0.72,
            "urgency": "low",
            "action_label": format!("Enable {pack_id} pack"),
            "title": format!("Suggested pack: {pack_id}"),
            "description": reason,
            "pack_id": pack_id,
            "is_pack_suggestion": true,
            "destination_view": "workflows",
            "surface_hint": "workflows",
            "artifact_summary_lines": [reason],
            "source_count": 0,
            "action_afp_payload": null,
            "dismiss_reason": null,
            "source_event_id": null,
            "entity_id": null,
        });
        if let Ok(suggest_afp) = new_server_message(
            "proactive_engine".to_string(),
            vec![user.id.clone()],
            format!("passive:{}", user.id),
            "proactive_suggestion",
            pack_content.clone(),
            vec![],
            vec![],
            vec![],
            false,
        ) {
            let _ =
                store_and_prune_proactive_suggestion(&state, &user.id, &suggest_afp, pack_content)
                    .await;
        }
    }

    Ok(Json(json!({
        "status": "accepted",
        "event_afp_id": event_afp_id,
        "suggestions_emitted": suggestion_ids.len(),
        "suggestion_ids": suggestion_ids,
        "automation_artifacts_emitted": automation_artifact_ids.len(),
        "automation_artifact_ids": automation_artifact_ids,
    })))
}

// ── P3.3: POST /proactive/outcomes ────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct RecordOutcomeRequest {
    suggestion_id: String,
    accepted: bool,
    #[serde(default)]
    outcome_afp_id: Option<String>,
    heuristic_id: String,
    #[serde(default)]
    memory_space: Option<String>,
    #[serde(default)]
    author_mask: Option<String>,
    #[serde(default)]
    author_type: Option<String>,
    #[serde(default)]
    author_id: Option<String>,
    #[serde(default)]
    is_human_authored: Option<bool>,
    #[serde(default)]
    human_only: Option<bool>,
}

impl RecordOutcomeRequest {
    fn memory_workspace_scope(&self) -> Option<MemoryWorkspaceScope> {
        let scope = MemoryWorkspaceScope {
            memory_space: self.memory_space.clone(),
            author_mask: self.author_mask.clone(),
            author_type: self.author_type.clone(),
            author_id: self.author_id.clone(),
            is_human_authored: self.is_human_authored,
            human_only: self.human_only,
        };
        if scope == MemoryWorkspaceScope::default() {
            None
        } else {
            Some(scope)
        }
    }
}

async fn record_proactive_outcome_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<RecordOutcomeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let record = ProactiveOutcomeRecord {
        owner_user_id: user.id.clone(),
        suggestion_id: req.suggestion_id.clone(),
        accepted: req.accepted,
        outcome_afp_id: req.outcome_afp_id.clone(),
        heuristic_id: req.heuristic_id.clone(),
    };

    state
        .db
        .record_proactive_outcome(&record)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let watcher_messages = state
        .db
        .list_afp_messages_by_type(&user.id, &["watcher_alert", "smart_suggestion"], 200)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let continuity_summary = load_continuity_state_summary(&state.db, &user.id, 10)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let watcher_resolution_event =
        watcher_resolution_source_message(&watcher_messages, &req.suggestion_id).map(|message| {
            watcher_resolution_event_from_outcome(
                &user.id,
                &req.suggestion_id,
                req.accepted,
                &req.heuristic_id,
                message,
            )
        });
    let mut watcher_resolution_event_id: Option<String> = None;
    let mut synthesis_invalidation_event_id: Option<String> = None;
    if let Some(resolution_event) = watcher_resolution_event {
        state
            .db
            .insert_daemon_afp_message(&resolution_event)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        watcher_resolution_event_id = resolution_event
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string);
        if let Some(invalidation_event) = synthesis_invalidation_event_from_resolution(
            &user.id,
            &resolution_event,
            &continuity_summary,
        ) {
            state
                .db
                .insert_daemon_afp_message(&invalidation_event)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            synthesis_invalidation_event_id = invalidation_event
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string);
        }
    }
    let outcome_rates = state
        .db
        .heuristic_acceptance_rates(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let heuristic_feedback = feedback_for_heuristic(&outcome_rates, &req.heuristic_id);
    let linked_artifact_count = usize::from(req.outcome_afp_id.is_some())
        + usize::from(watcher_resolution_event_id.is_some())
        + usize::from(synthesis_invalidation_event_id.is_some());
    let outcome_observability = outcome_observability_from_outcome(
        &req,
        &continuity_summary,
        heuristic_feedback.as_ref(),
        linked_artifact_count,
    );
    let reflection_trace = coordination_reflection_trace_from_outcome(
        &user.id,
        &req,
        &continuity_summary,
        Some(outcome_observability.clone()),
        watcher_resolution_event_id.as_deref(),
        synthesis_invalidation_event_id.as_deref(),
    );
    state
        .db
        .insert_daemon_afp_message(&reflection_trace)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let reflection_trace_event_id = reflection_trace
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut agent_memory_id: Option<String> = None;
    let workspace_scope = req.memory_workspace_scope();

    if let Some(captured_memory) = capture_proactive_outcome_memory(
        &user.id,
        &req.heuristic_id,
        &req.suggestion_id,
        req.accepted,
        req.outcome_afp_id.as_deref(),
        heuristic_feedback.as_ref(),
        workspace_scope.as_ref(),
    ) {
        let _ = state
            .db
            .store_message(&captured_memory.proto, captured_memory.content_json)
            .await;
        agent_memory_id = Some(captured_memory.message_id);
    }

    Ok(Json(json!({
        "status": "recorded",
        "heuristic_feedback": heuristic_feedback,
        "outcome_observability": outcome_observability,
        "agent_memory_id": agent_memory_id,
        "watcher_resolution_event_id": watcher_resolution_event_id,
        "synthesis_invalidation_event_id": synthesis_invalidation_event_id,
        "reflection_trace_event_id": reflection_trace_event_id,
    })))
}

// ── List suggestions: GET /proactive/suggestions ──────────────────────────────

async fn list_proactive_suggestions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<ProactiveSuggestionsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(100);

    let prefs = state
        .db
        .get_agent_preferences(&user.id)
        .await
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<AgentPreferences>(v).ok())
        .unwrap_or_default();
    let continuity_summary = load_continuity_state_summary(&state.db, &user.id, 10)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let queue_pressure = queue_pressure_from_continuity_summary(&continuity_summary);
    let outcome_feedback = load_adapted_outcome_feedback(&state.db, &user.id, queue_pressure)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    persist_prepared_draft_suggestions_from_continuity(&state, &user.id, &continuity_summary).await;
    persist_context_suggestions_from_continuity(&state, &user.id, &continuity_summary).await;
    persist_simulator_review_suggestions_from_continuity(&state, &user.id, &continuity_summary)
        .await;
    let fetch_limit = proactive_suggestion_fetch_limit(limit);
    let suggestions = state
        .db
        .list_proactive_suggestions(&user.id, fetch_limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let suggestions =
        outcome_ranked_proactive_suggestions(suggestions, &outcome_feedback, &prefs, limit);
    let conversation_attention_records = state
        .db
        .list_personal_automation_conversations(&user.id, None, Some("active"), Some(true), 6)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let cost_snapshot = load_dashboard_cost_snapshot(&state, &user.id)
        .await
        .map_err(internal_http_error)?;
    let cost_status = cost_snapshot.as_ref().and_then(cost_status_from_snapshot);
    let conversation_attention_items =
        conversation_attention_items_from_records(&conversation_attention_records);
    let conversation_attention_summary =
        conversation_attention_summary_from_records(&conversation_attention_records);

    Ok(Json(build_proactive_suggestions_response_with_persona(
        suggestions,
        continuity_summary,
        cost_status,
        conversation_attention_items,
        conversation_attention_summary,
        active_persona.as_ref(),
    )))
}

pub(super) fn proactive_suggestion_fetch_limit(limit: i64) -> i64 {
    if limit <= 0 {
        0
    } else {
        limit.saturating_mul(3).min(100)
    }
}

pub(super) fn outcome_ranked_proactive_suggestions(
    suggestions: Vec<Value>,
    outcome_feedback: &[HeuristicOutcomeFeedback],
    prefs: &AgentPreferences,
    limit: i64,
) -> Vec<Value> {
    if limit <= 0 {
        return Vec::new();
    }

    let suggestions = filter_suggestions_by_outcome_feedback(suggestions, outcome_feedback);
    let suggestions = filter_proactive_suggestions_by_preferences(suggestions, prefs);
    let suggestions = annotate_suggestions_with_outcome_feedback(suggestions, outcome_feedback);
    let suggestions = reprioritize_suggestions_by_outcome_feedback(suggestions, outcome_feedback);
    suggestions.into_iter().take(limit as usize).collect()
}

pub(super) fn normalize_proactive_suggestion_contract(items: Vec<Value>) -> Vec<Value> {
    items
        .into_iter()
        .map(ensure_proactive_suggestion_trust_fields)
        .collect()
}

fn ensure_proactive_suggestion_trust_fields(mut item: Value) -> Value {
    let Some(record) = item.as_object_mut() else {
        return item;
    };

    let requires_approval = record
        .get("requires_approval")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let autonomy_tier = record
        .get("autonomy_tier")
        .and_then(Value::as_str)
        .and_then(ProactiveAutonomyTier::parse)
        .unwrap_or(if requires_approval {
            ProactiveAutonomyTier::AskAlways
        } else {
            ProactiveAutonomyTier::NotifyThenAct
        });
    record.insert(
        "autonomy_tier".to_string(),
        Value::String(autonomy_tier.as_str().to_string()),
    );

    if !record.contains_key("autonomy_decision") || record["autonomy_decision"].is_null() {
        let autonomy_decision = autonomy_decision_for_proactive_enum(autonomy_tier);
        record.insert(
            "autonomy_decision".to_string(),
            serde_json::to_value(autonomy_decision).unwrap_or_default(),
        );
    }

    if !record.contains_key("selection_reason") || record["selection_reason"].is_null() {
        let fallback = proactive_suggestion_selection_reason_fallback(record);
        if let Some(value) = fallback {
            record.insert("selection_reason".to_string(), Value::String(value));
        }
    }

    if !record.contains_key("approval_or_reversibility_hint")
        || record["approval_or_reversibility_hint"].is_null()
    {
        record.insert(
            "approval_or_reversibility_hint".to_string(),
            Value::String(proactive_suggestion_boundary_hint_fallback(
                record,
                requires_approval,
            )),
        );
    }

    let source_count = record
        .get("source_refs")
        .and_then(Value::as_array)
        .map(|refs| {
            refs.iter()
                .filter(|value| {
                    value
                        .as_str()
                        .map(str::trim)
                        .is_some_and(|text| !text.is_empty())
                })
                .count()
        })
        .unwrap_or(0);
    if !record.contains_key("source_count") || record["source_count"].is_null() {
        record.insert("source_count".to_string(), json!(source_count));
    }

    if !record.contains_key("provenance_cue") || record["provenance_cue"].is_null() {
        record.insert(
            "provenance_cue".to_string(),
            Value::String(proactive_suggestion_provenance_cue_fallback(
                record,
                source_count,
            )),
        );
    }

    item
}

fn proactive_suggestion_selection_reason_fallback(
    record: &serde_json::Map<String, Value>,
) -> Option<String> {
    let kind = record
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match kind {
        "prepared_draft" => Some(
            "Prepared work is already assembled and ready for review in the current continuity context."
                .to_string(),
        ),
        "context_ready" => Some(
            "Prepared context is already assembled from the current continuity state.".to_string(),
        ),
        "context_pack" => Some(
            "Related context was assembled because the current continuity state points to this neighborhood now."
                .to_string(),
        ),
        "state_field" => Some(
            "Current continuity suggests this state field needs attention now.".to_string(),
        ),
        "simulator_reversible_preview" => Some(
            "A bounded simulation found a reversible next step worth review now.".to_string(),
        ),
        "simulator_approval_preview" => Some(
            "A bounded simulation found an approval boundary worth review before execution."
                .to_string(),
        ),
        "simulator_conflict_fusion" => Some(
            "A bounded simulation found competing next steps that benefit from direct review."
                .to_string(),
        ),
        _ => record
            .get("description")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
    }
}

fn proactive_suggestion_boundary_hint_fallback(
    record: &serde_json::Map<String, Value>,
    requires_approval: bool,
) -> String {
    if requires_approval {
        return "This suggestion remains approval-gated; no external action runs until explicitly confirmed."
            .to_string();
    }

    match record.get("kind").and_then(Value::as_str).unwrap_or_default() {
        "context_ready" | "context_pack" => {
            "Opening this suggestion reveals prepared context only; it does not execute a side effect."
                .to_string()
        }
        _ => {
            "Reviewing this suggestion does not execute a side effect; it keeps the prepared next step available for judgment."
                .to_string()
        }
    }
}

fn proactive_suggestion_provenance_cue_fallback(
    record: &serde_json::Map<String, Value>,
    source_count: usize,
) -> String {
    if source_count > 0 {
        return "Traceable to the currently linked continuity sources behind this suggestion."
            .to_string();
    }
    if let Some(heuristic_id) = record
        .get("heuristic_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return format!("Traceable to proactive heuristic {heuristic_id}.");
    }
    "Traceable to the current continuity and ranking state.".to_string()
}

fn build_proactive_suggestions_response(
    items: Vec<Value>,
    continuity_summary: DashboardContinuityStateResponse,
    cost_status: Option<DashboardCostStatus>,
    conversation_attention_items: Vec<Value>,
    conversation_attention_summary: Option<Value>,
) -> ProactiveSuggestionsResponse {
    build_proactive_suggestions_response_with_persona(
        items,
        continuity_summary,
        cost_status,
        conversation_attention_items,
        conversation_attention_summary,
        None,
    )
}

fn style_proactive_suggestion_item(
    mut item: Value,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> Value {
    let Some(active_persona) = active_persona else {
        return item;
    };
    let Some(record) = item.as_object_mut() else {
        return item;
    };

    for key in [
        "description",
        "selection_reason",
        "approval_or_reversibility_hint",
        "provenance_cue",
        "readiness_reason",
        "summary",
        "why_surfaced",
    ] {
        if let Some(text) = record.get(key).and_then(Value::as_str) {
            record.insert(
                key.to_string(),
                Value::String(crate::agent_personas::restyle_user_facing_text(
                    text,
                    active_persona,
                )),
            );
        }
    }

    for key in ["artifact_summary_lines", "consequence_summary_lines"] {
        if let Some(lines) = record.get(key).and_then(Value::as_array) {
            let styled = lines
                .iter()
                .map(|value| {
                    value
                        .as_str()
                        .map(|text| {
                            Value::String(crate::agent_personas::restyle_user_facing_text(
                                text,
                                active_persona,
                            ))
                        })
                        .unwrap_or_else(|| value.clone())
                })
                .collect::<Vec<_>>();
            record.insert(key.to_string(), Value::Array(styled));
        }
    }

    item
}

pub(super) fn style_proactive_suggestion_items(
    items: Vec<Value>,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> Vec<Value> {
    let Some(active_persona) = active_persona else {
        return items;
    };

    items
        .into_iter()
        .map(|item| style_proactive_suggestion_item(item, Some(active_persona)))
        .collect()
}

pub(super) fn style_proactive_suggestions_response(
    mut response: ProactiveSuggestionsResponse,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ProactiveSuggestionsResponse {
    let Some(active_persona) = active_persona else {
        return response;
    };

    response.items = style_proactive_suggestion_items(response.items, Some(active_persona));
    response.continuity_priority_card = response.continuity_priority_card.map(|card| {
        crate::server::continuity_routes::style_continuity_priority_card(card, Some(active_persona))
    });
    response.continuity_response_items = response
        .continuity_response_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_response_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    response.continuity_prepared_draft_items = response
        .continuity_prepared_draft_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_prepared_draft_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    response.continuity_context_panel_items = response
        .continuity_context_panel_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_context_panel_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    response.continuity_context_pack_items = response
        .continuity_context_pack_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_context_pack_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    response
}

fn build_proactive_suggestions_response_with_persona(
    items: Vec<Value>,
    continuity_summary: DashboardContinuityStateResponse,
    cost_status: Option<DashboardCostStatus>,
    conversation_attention_items: Vec<Value>,
    conversation_attention_summary: Option<Value>,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ProactiveSuggestionsResponse {
    let continuity_state = preferred_continuity_state_message(&continuity_summary);
    let continuity_brief = continuity_summary.preferred_state_brief.clone();
    let continuity_handoff = continuity_summary.preferred_synthesizer_handoff.clone();
    let base_surface_hint = continuity_handoff
        .as_ref()
        .map(|handoff| handoff.surface_recommendation.clone());
    let base_requires_approval = continuity_handoff
        .as_ref()
        .map(|handoff| handoff.escalation_required)
        .unwrap_or(false);
    let continuity_priority_item = effective_priority_item_with_cost(
        continuity_summary.preferred_priority_item.as_ref(),
        cost_status.as_ref(),
    );
    let prepared_draft_suggestion = prepared_draft_suggestion_from_state(
        &continuity_summary.preferred_prepared_draft_items,
        continuity_state.as_ref(),
        continuity_handoff.as_ref(),
    );
    let context_ready_suggestion =
        context_ready_suggestion_from_state(continuity_state.as_ref(), continuity_handoff.as_ref());
    let simulator_reversible_preview_suggestion =
        simulator_reversible_preview_suggestion_from_state(
            continuity_state.as_ref(),
            continuity_handoff.as_ref(),
        );
    let simulator_approval_preview_suggestion = simulator_approval_preview_suggestion_from_state(
        continuity_state.as_ref(),
        continuity_handoff.as_ref(),
    );
    let context_pack_suggestion =
        context_pack_suggestion_from_summary(&continuity_summary, continuity_handoff.as_ref());
    let state_field_suggestion = state_field_suggestion_from_fields(
        &continuity_summary.preferred_state_fields,
        continuity_state.as_ref(),
    );
    let continuity_priority_card = crate::server::continuity_routes::continuity_priority_card(
        continuity_priority_item.as_ref(),
        continuity_summary
            .latest_state_snapshot
            .as_ref()
            .or(continuity_summary.latest_state_synthesis.as_ref()),
    );
    let continuity_surface_hint = continuity_priority_item
        .as_ref()
        .and_then(|item| item.surface_hint.clone())
        .or(base_surface_hint);
    let continuity_requires_approval = continuity_priority_item
        .as_ref()
        .map(|item| item.requires_approval)
        .unwrap_or(base_requires_approval);
    let continuity_panel_kind = continuity_priority_item
        .as_ref()
        .map(|item| item.panel_kind.clone())
        .unwrap_or_else(|| {
            continuity_panel_kind(
                continuity_surface_hint.as_deref(),
                continuity_requires_approval,
            )
            .to_string()
        });
    let continuity_primary_mode =
        continuity_primary_mode(continuity_priority_card.as_ref(), &continuity_panel_kind)
            .to_string();
    let mut items = items;
    if let Some(suggestion) = simulator_reversible_preview_suggestion {
        items.push(suggestion);
    }
    if let Some(suggestion) = simulator_approval_preview_suggestion {
        items.push(suggestion);
    }
    let items = prioritize_proactive_suggestions(
        items,
        continuity_priority_item.as_ref(),
        continuity_priority_card.as_ref(),
        prepared_draft_suggestion,
        context_ready_suggestion,
        context_pack_suggestion,
        state_field_suggestion,
        active_attention_window_from_summary(&continuity_summary),
    );
    let items = normalize_proactive_suggestion_contract(items);
    let count = items.len();
    let observability = proactive_suggestion_observability(&items);

    style_proactive_suggestions_response(
        ProactiveSuggestionsResponse {
            items,
            count,
            observability,
            cost_status,
            continuity_state,
            continuity_brief,
            continuity_handoff,
            continuity_surface_hint,
            continuity_requires_approval,
            continuity_panel_kind,
            continuity_primary_mode,
            continuity_priority_item,
            continuity_priority_card,
            continuity_action_items: continuity_summary.preferred_action_items,
            continuity_response_items: continuity_summary.preferred_response_items,
            continuity_prepared_draft_items: continuity_summary.preferred_prepared_draft_items,
            continuity_context_panel_items: continuity_summary.preferred_context_panel_items,
            continuity_context_pack_items: continuity_summary.preferred_context_pack_items,
            continuity_state_fields: continuity_summary.preferred_state_fields,
            conversation_attention_items,
            conversation_attention_summary,
        },
        active_persona,
    )
}

fn conversation_attention_items_from_records(
    records: &[crate::db::PersonalAutomationConversationRecord],
) -> Vec<Value> {
    records
        .iter()
        .map(|record| {
            let latest_attention_kind = record
                .metadata_json
                .get("latest_attention_kind")
                .and_then(Value::as_str)
                .unwrap_or("background_follow_up");
            let latest_artifact_type = record
                .metadata_json
                .get("latest_artifact_type")
                .and_then(Value::as_str);
            let latest_artifact_subtype = record
                .metadata_json
                .get("latest_artifact_subtype")
                .and_then(Value::as_str);
            let latest_subject = record
                .latest_subject
                .as_deref()
                .filter(|value| !value.trim().is_empty());
            let latest_sender = record
                .latest_sender
                .as_deref()
                .filter(|value| !value.trim().is_empty());
            let family_label =
                conversation_attention_family_label(&record.conversation_family);
            let attention_label =
                conversation_attention_badge_label(&record.conversation_family, latest_attention_kind)
                    .to_string();
            let review_action_label =
                conversation_attention_review_action_label(
                    &record.conversation_family,
                    latest_attention_kind,
                )
                .to_string();
            let attention_rank = record
                .metadata_json
                .get("attention_rank")
                .and_then(Value::as_i64)
                .unwrap_or_else(|| {
                    crate::conversation_attention::conversation_attention_rank(
                        &record.conversation_family,
                        latest_attention_kind,
                        record.metadata_json.get("latest_value_hint").and_then(Value::as_str),
                    )
                });
            let summary = conversation_attention_summary_for_record(
                &record.conversation_family,
                latest_attention_kind,
                latest_subject,
                latest_sender,
            );

            serde_json::json!({
                "id": record.id,
                "provider": record.provider,
                "account_ref": record.account_ref,
                "conversation_key": record.conversation_key,
                "conversation_family": record.conversation_family,
                "conversation_family_label": family_label,
                "display_label": record.display_label,
                "latest_message_ref": record.latest_message_ref,
                "latest_subject": record.latest_subject,
                "latest_sender": record.latest_sender,
                "last_observed_at": record.last_observed_at,
                "thread_id": record.metadata_json.get("thread_id").and_then(Value::as_str),
                "source_event_id": record.metadata_json.get("source_event_id").and_then(Value::as_str),
                "latest_artifact_id": record.metadata_json.get("latest_artifact_id").and_then(Value::as_str),
                "latest_artifact_summary": record.metadata_json.get("latest_artifact_summary").and_then(Value::as_str),
                "needs_attention": record
                    .metadata_json
                    .get("needs_attention")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                "attention_rank": attention_rank,
                "latest_attention_kind": latest_attention_kind,
                "latest_attention_label": attention_label,
                "review_action_label": review_action_label,
                "latest_artifact_type": latest_artifact_type,
                "latest_artifact_subtype": latest_artifact_subtype,
                "latest_artifact_draft_class": record.metadata_json.get("latest_artifact_draft_class").and_then(Value::as_str),
                "latest_artifact_destination_view": record.metadata_json.get("latest_artifact_destination_view").and_then(Value::as_str),
                "latest_value_hint": record.metadata_json.get("latest_value_hint").and_then(Value::as_str),
                "latest_form_owner": record.metadata_json.get("form_owner").and_then(Value::as_str),
                "latest_submission_mode": record.metadata_json.get("submission_mode").and_then(Value::as_str),
                "latest_requires_signature": record.metadata_json.get("requires_signature").and_then(Value::as_bool),
                "latest_sensitive_form": record.metadata_json.get("sensitive_form").and_then(Value::as_bool),
                "summary": summary,
            })
        })
        .collect()
}

fn conversation_attention_summary_from_records(
    records: &[crate::db::PersonalAutomationConversationRecord],
) -> Option<Value> {
    if records.is_empty() {
        return None;
    }

    let mut prepared_draft_count = 0usize;
    let mut approval_request_count = 0usize;
    let mut background_follow_up_count = 0usize;
    let mut communication_count = 0usize;
    let mut renewal_count = 0usize;
    let mut bill_count = 0usize;
    let mut form_count = 0usize;

    for record in records {
        match record.conversation_family.trim() {
            "communications" => communication_count += 1,
            "renewals" => renewal_count += 1,
            "bills" => bill_count += 1,
            "forms" => form_count += 1,
            _ => {}
        }
        match record
            .metadata_json
            .get("latest_attention_kind")
            .and_then(Value::as_str)
            .unwrap_or("background_follow_up")
        {
            "prepared_draft" => prepared_draft_count += 1,
            "approval_request" => approval_request_count += 1,
            _ => background_follow_up_count += 1,
        }
    }

    Some(serde_json::json!({
        "count": records.len(),
        "prepared_draft_count": prepared_draft_count,
        "approval_request_count": approval_request_count,
        "background_follow_up_count": background_follow_up_count,
        "communication_count": communication_count,
        "renewal_count": renewal_count,
        "bill_count": bill_count,
        "form_count": form_count,
    }))
}

fn conversation_attention_family_label(family: &str) -> String {
    match family.trim() {
        "renewals" => "renewal".to_string(),
        "bills" => "bill".to_string(),
        "forms" => "form".to_string(),
        "communications" => "communication".to_string(),
        other if !other.is_empty() => other.to_string(),
        _ => "background".to_string(),
    }
}

fn conversation_attention_badge_label(family: &str, latest_attention_kind: &str) -> &'static str {
    match latest_attention_kind {
        "approval_request" => "approval needed",
        "prepared_draft" => {
            if matches!(family.trim(), "renewals" | "bills" | "forms") {
                "review ready"
            } else {
                "draft ready"
            }
        }
        _ => {
            if matches!(family.trim(), "renewals" | "bills" | "forms") {
                "review queued"
            } else {
                "follow-up"
            }
        }
    }
}

fn conversation_attention_review_action_label(
    family: &str,
    latest_attention_kind: &str,
) -> &'static str {
    match latest_attention_kind {
        "approval_request" => "Review approval",
        "prepared_draft" => {
            if family.trim() == "renewals" {
                "Review renewal"
            } else if family.trim() == "bills" {
                "Review bill"
            } else if family.trim() == "forms" {
                "Review form"
            } else {
                "Review draft"
            }
        }
        _ => {
            if matches!(family.trim(), "renewals" | "bills" | "forms") {
                "Open review"
            } else if family.trim() == "communications" {
                "Open thread"
            } else {
                "Open work item"
            }
        }
    }
}

fn conversation_attention_summary_for_record(
    family: &str,
    latest_attention_kind: &str,
    latest_subject: Option<&str>,
    latest_sender: Option<&str>,
) -> String {
    match family.trim() {
        "renewals" => match (latest_attention_kind, latest_subject) {
            ("approval_request", Some(subject)) => {
                format!("Approval needed for the {subject} renewal review.")
            }
            ("approval_request", None) => "Approval needed for a renewal review.".to_string(),
            ("prepared_draft", Some(subject)) => {
                format!("Prepared renewal review ready for {subject}.")
            }
            ("prepared_draft", None) => "Prepared renewal review ready.".to_string(),
            (_, Some(subject)) => format!("Background renewal review ready for {subject}."),
            _ => "Background renewal review ready.".to_string(),
        },
        "bills" => match (latest_attention_kind, latest_subject) {
            ("approval_request", Some(subject)) => {
                format!("Approval needed before paying {subject}.")
            }
            ("approval_request", None) => "Approval needed before paying a bill.".to_string(),
            ("prepared_draft", Some(subject)) => {
                format!("Prepared bill review ready for {subject}.")
            }
            ("prepared_draft", None) => "Prepared bill review ready.".to_string(),
            (_, Some(subject)) => format!("Background bill review ready for {subject}."),
            _ => "Background bill review ready.".to_string(),
        },
        "forms" => match (latest_attention_kind, latest_subject) {
            ("approval_request", Some(subject)) => {
                format!("Approval needed before submitting {subject}.")
            }
            ("approval_request", None) => "Approval needed before submitting a form.".to_string(),
            ("prepared_draft", Some(subject)) => {
                format!("Prepared form review ready for {subject}.")
            }
            ("prepared_draft", None) => "Prepared form review ready.".to_string(),
            (_, Some(subject)) => format!("Background form review ready for {subject}."),
            _ => "Background form review ready.".to_string(),
        },
        _ => match (latest_attention_kind, latest_subject, latest_sender) {
            ("approval_request", Some(subject), Some(sender)) => {
                format!("Approval needed for {subject} from {sender}.")
            }
            ("approval_request", Some(subject), None) => {
                format!("Approval needed for {subject}.")
            }
            ("prepared_draft", Some(subject), Some(sender)) => {
                format!("Prepared reply ready for {subject} from {sender}.")
            }
            ("prepared_draft", Some(subject), None) => {
                format!("Prepared reply ready for {subject}.")
            }
            (_, Some(subject), Some(sender)) => {
                format!("Background follow-up for {subject} from {sender}.")
            }
            (_, Some(subject), None) => {
                format!("Background follow-up for {subject}.")
            }
            (_, None, Some(sender)) => format!("Background follow-up for {sender}."),
            _ => "Background follow-up ready.".to_string(),
        },
    }
}

async fn list_personal_automation_conversations_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let limit: i64 = params
        .get("limit")
        .and_then(|value| value.parse().ok())
        .unwrap_or(20)
        .min(100);
    let family = params
        .get("family")
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let health_state = params
        .get("health_state")
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(Some("active"));
    let needs_attention = params.get("needs_attention").and_then(|value| {
        match value.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Some(true),
            "false" | "0" | "no" => Some(false),
            _ => None,
        }
    });

    let items = state
        .db
        .list_personal_automation_conversations(
            &user.id,
            family,
            health_state,
            needs_attention,
            limit,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let attention_items = conversation_attention_items_from_records(&items);
    let attention_summary = conversation_attention_summary_from_records(&items);

    Ok(Json(json!({
        "items": items,
        "count": items.len(),
        "attention_items": attention_items,
        "attention_summary": attention_summary,
        "filters": {
            "family": family,
            "health_state": health_state,
            "needs_attention": needs_attention,
            "limit": limit.max(1),
        }
    })))
}

fn automation_afp_to_json(afp: &crate::message::AFPMessage) -> Value {
    serde_json::to_value(afp).unwrap_or_default()
}

fn conversation_attention_metadata(
    automation_artifact_json: Option<&Value>,
) -> (
    bool,
    &'static str,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let Some(artifact) = automation_artifact_json else {
        return (false, "none", None, None, None, None, None, None, None);
    };

    let artifact_id = artifact
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let artifact_type = artifact
        .get("type")
        .and_then(Value::as_str)
        .map(str::to_string);
    let artifact_subtype = artifact
        .get("subtype")
        .and_then(Value::as_str)
        .map(str::to_string);
    let artifact_draft_class = artifact
        .get("content")
        .and_then(Value::as_object)
        .and_then(|content| content.get("draft_class"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let artifact_destination_view = artifact
        .get("content")
        .and_then(Value::as_object)
        .and_then(|content| content.get("destination_view"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            artifact_draft_class
                .as_deref()
                .map(crate::prepared_draft_semantics::prepared_draft_destination_view)
                .map(str::to_string)
        });
    let artifact_summary = artifact
        .get("content")
        .and_then(Value::as_object)
        .and_then(|content| {
            content
                .get("summary")
                .and_then(Value::as_str)
                .or_else(|| content.get("message").and_then(Value::as_str))
                .or_else(|| content.get("label").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let value_hint = artifact_value_hint(artifact);
    let attention_kind = match (artifact_type.as_deref(), artifact_subtype.as_deref()) {
        (Some("watcher_alert"), _) => "approval_request",
        (Some("ledger"), Some("prepared_draft")) => "prepared_draft",
        _ => "background_follow_up",
    };

    (
        true,
        attention_kind,
        artifact_id,
        artifact_type,
        artifact_subtype,
        artifact_draft_class,
        artifact_destination_view,
        value_hint,
        artifact_summary,
    )
}

fn artifact_value_hint(artifact: &Value) -> Option<String> {
    let searchable = artifact
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get("searchable_metadata"))
        .and_then(Value::as_object)?;
    let domain = searchable
        .get("prepared_draft_domain")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if domain == "renewal_review" {
        let current_cost = searchable.get("current_cost_usd").and_then(Value::as_f64);
        let alternative_cost = searchable
            .get("alternative_cost_usd")
            .and_then(Value::as_f64);
        if let (Some(current), Some(alternative)) = (current_cost, alternative_cost) {
            if alternative < current {
                return Some(format!("Potential savings: ${:.2}", current - alternative));
            }
        }

        return searchable
            .get("days_until_renewal")
            .and_then(Value::as_i64)
            .map(|days| {
                if days <= 0 {
                    "Renewal is due now".to_string()
                } else if days == 1 {
                    "Renewal due in 1 day".to_string()
                } else {
                    format!("Renewal due in {days} days")
                }
            });
    }

    if domain == "bill_review" {
        if let Some(amount) = searchable.get("amount_usd").and_then(Value::as_f64) {
            return Some(format!("Amount due: ${amount:.2}"));
        }

        return searchable
            .get("days_until_due")
            .and_then(Value::as_i64)
            .map(|days| {
                if days <= 0 {
                    "Bill is due now".to_string()
                } else if days == 1 {
                    "Bill due in 1 day".to_string()
                } else {
                    format!("Bill due in {days} days")
                }
            });
    }

    if domain == "form_review" {
        if searchable
            .get("requires_signature")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Some("Signature required".to_string());
        }

        return searchable
            .get("days_until_due")
            .and_then(Value::as_i64)
            .map(|days| {
                if days <= 0 {
                    "Form is due now".to_string()
                } else if days == 1 {
                    "Form due in 1 day".to_string()
                } else {
                    format!("Form due in {days} days")
                }
            })
            .or_else(|| {
                searchable
                    .get("submission_mode")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|mode| format!("Submit via {mode}"))
            })
            .or_else(|| {
                searchable
                    .get("form_owner")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|owner| format!("For {owner}"))
            });
    }

    None
}

fn passive_event_value_hint(event_type: &str, metadata: &Value) -> Option<String> {
    let normalized = event_type.trim().to_ascii_lowercase();
    let metadata = metadata.as_object()?;

    if matches!(
        normalized.as_str(),
        "bill_due" | "utility_bill_due" | "invoice_due"
    ) {
        if let Some(amount) = metadata.get("amount_usd").and_then(Value::as_f64) {
            return Some(format!("Amount due: ${amount:.2}"));
        }

        return metadata
            .get("days_until_due")
            .and_then(Value::as_i64)
            .map(|days| {
                if days <= 0 {
                    "Bill is due now".to_string()
                } else if days == 1 {
                    "Bill due in 1 day".to_string()
                } else {
                    format!("Bill due in {days} days")
                }
            });
    }

    if matches!(
        normalized.as_str(),
        "form_due" | "school_form_due" | "admin_form_due"
    ) {
        if metadata
            .get("requires_signature")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Some("Signature required".to_string());
        }

        return metadata
            .get("days_until_due")
            .and_then(Value::as_i64)
            .map(|days| {
                if days <= 0 {
                    "Form is due now".to_string()
                } else if days == 1 {
                    "Form due in 1 day".to_string()
                } else {
                    format!("Form due in {days} days")
                }
            })
            .or_else(|| {
                metadata
                    .get("submission_mode")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|mode| format!("Submit via {mode}"))
            })
            .or_else(|| {
                metadata
                    .get("form_owner")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|owner| format!("For {owner}"))
            });
    }

    None
}

fn proactive_suggestion_observability(items: &[Value]) -> Value {
    let mut kind_counts = std::collections::BTreeMap::<String, usize>::new();
    let mut surface_counts = std::collections::BTreeMap::<String, usize>::new();
    let mut ready_now_count = 0usize;
    let mut approval_required_count = 0usize;
    let mut grounded_count = 0usize;

    for item in items {
        if let Some(kind) = item
            .get("kind")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        {
            *kind_counts.entry(kind.to_string()).or_default() += 1;
        }
        if let Some(surface) = item
            .get("surface_hint")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        {
            *surface_counts.entry(surface.to_string()).or_default() += 1;
        }
        if matches!(
            item.get("readiness").and_then(Value::as_str),
            Some("ready_now")
        ) {
            ready_now_count += 1;
        }
        if item
            .get("requires_approval")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            approval_required_count += 1;
        }
        let source_count = item
            .get("source_count")
            .and_then(Value::as_u64)
            .or_else(|| {
                item.get("source_refs")
                    .and_then(Value::as_array)
                    .map(|refs| refs.len() as u64)
            })
            .unwrap_or(0);
        if source_count >= 2 {
            grounded_count += 1;
        }
    }

    let dominant_kind = kind_counts
        .iter()
        .max_by(|(left_kind, left_count), (right_kind, right_count)| {
            left_count
                .cmp(right_count)
                .then_with(|| right_kind.cmp(left_kind))
        })
        .map(|(kind, _)| kind.clone());
    let dominant_surface = surface_counts
        .iter()
        .max_by(|(left_surface, left_count), (right_surface, right_count)| {
            left_count
                .cmp(right_count)
                .then_with(|| right_surface.cmp(left_surface))
        })
        .map(|(surface, _)| surface.clone());

    json!({
        "dominant_kind": dominant_kind,
        "dominant_surface": dominant_surface,
        "ready_now_count": ready_now_count,
        "approval_required_count": approval_required_count,
        "grounded_count": grounded_count,
        "kind_counts": kind_counts,
        "surface_counts": surface_counts,
    })
}

// ── P3.4: GET /memory/context ─────────────────────────────────────────────────

async fn memory_context_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(10)
        .min(50);

    let behavioral = state
        .db
        .list_behavioral_memory(&user.id, limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let outcome_rates = state
        .db
        .heuristic_acceptance_rates(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let heuristic_ids = outcome_rates
        .iter()
        .filter_map(|rate| {
            rate.get("heuristic_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<Vec<_>>();
    let ema_states = state
        .db
        .list_heuristic_ema_states(&user.id, &heuristic_ids)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let temporal = state
        .db
        .query_temporal_summary(limit)
        .await
        .unwrap_or_default();
    let observability_traces = state
        .db
        .list_afp_messages_by_type(&user.id, &[AFP_TYPE_REFLECTION_TRACE], 100)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(json!({
        "behavioral_memory": behavioral,
        "heuristic_acceptance_rates": outcome_rates,
        "heuristic_outcome_feedback": summarize_outcome_rates_adapted(&outcome_rates, &ema_states),
        "outcome_observability_summary": summarize_outcome_observability_traces(&observability_traces),
        "temporal_summary": temporal,
    })))
}

// ── P7.2: GET /proactive/audit ────────────────────────────────────────────────

async fn proactive_audit_log_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(50)
        .min(200);
    let entries = state
        .db
        .list_proactive_audit_log(&user.id, limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "items": entries, "count": entries.len() })))
}

// ── P7.3: Pack management ─────────────────────────────────────────────────────

async fn list_packs_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let enabled = state
        .db
        .get_enabled_packs(&user.id)
        .await
        .unwrap_or_default();
    let enabled_set: std::collections::HashSet<&str> = enabled.iter().map(String::as_str).collect();
    let catalogue = pack_catalogue()
        .into_iter()
        .map(|p| {
            let is_enabled = enabled_set.contains(p.id.as_str());
            json!({
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "icon": p.icon,
                "best_for": p.best_for,
                "requires_external_data": p.requires_external_data,
                "heuristic_count": p.heuristic_count,
                "enabled": is_enabled,
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "packs": catalogue })))
}

async fn enable_pack_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(pack_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .enable_pack(&user.id, &pack_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "status": "enabled", "pack_id": pack_id })))
}

async fn disable_pack_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(pack_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .disable_pack(&user.id, &pack_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "status": "disabled", "pack_id": pack_id })))
}

// ── Autonomy tier overrides ───────────────────────────────────────────────────

async fn get_autonomy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(heuristic_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let tier = state
        .db
        .get_autonomy_override(&user.id, &heuristic_id)
        .await
        .unwrap_or(None)
        .and_then(|value| canonical_proactive_autonomy_tier(&value).map(str::to_string));
    Ok(Json(
        json!({ "heuristic_id": heuristic_id, "autonomy_tier": tier }),
    ))
}

#[derive(serde::Deserialize)]
struct SetAutonomyRequest {
    autonomy_tier: String,
}

async fn set_autonomy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(heuristic_id): Path<String>,
    Json(req): Json<SetAutonomyRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let Some(canonical_tier) = canonical_proactive_autonomy_tier(&req.autonomy_tier) else {
        return Err((
            StatusCode::BAD_REQUEST,
            "autonomy_tier must be ask_always | notify_then_act | auto_execute".to_string(),
        ));
    };
    state
        .db
        .set_autonomy_override(&user.id, &heuristic_id, canonical_tier)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(
        json!({ "status": "saved", "heuristic_id": heuristic_id, "autonomy_tier": canonical_tier }),
    ))
}

fn canonical_proactive_autonomy_tier(value: &str) -> Option<&'static str> {
    ProactiveAutonomyTier::parse(value).map(|tier| tier.as_str())
}

// ── Proactivity level cap ─────────────────────────────────────────────────────

// ── GET /proactive/level ──────────────────────────────────────────────────────

async fn get_proactivity_level_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let level = state.db.get_proactivity_level(&user.id).await.unwrap_or(2);
    Ok(Json(json!({ "level": level })))
}

// ── POST /proactive/level ─────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct SetProactivityLevelRequest {
    level: i32,
}

async fn set_proactivity_level_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<SetProactivityLevelRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !(1..=3).contains(&req.level) {
        return Err((
            StatusCode::BAD_REQUEST,
            "level must be 1, 2, or 3".to_string(),
        ));
    }
    state
        .db
        .set_proactivity_level(&user.id, req.level)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "updated": true, "level": req.level })))
}

// ── Helper: convert AFPMessage to proto Message ───────────────────────────────

/// Convert an `AFPMessage` value type to the gRPC `Message` proto shape used by
/// `Db::store_message`.  Accessible from `server/mod.rs` for P1.4 emission.
pub(super) fn afp_message_to_proto(msg: &crate::message::AFPMessage) -> crate::afp::Message {
    afp_to_proto(msg)
}

fn afp_to_proto(msg: &crate::message::AFPMessage) -> crate::afp::Message {
    crate::afp::Message {
        protocol: msg.protocol.clone(),
        id: msg.id.clone(),
        thread_id: msg.thread_id.clone(),
        parent_id: msg.parent_id.clone().unwrap_or_default(),
        from: msg.from.clone(),
        to: msg.to.clone(),
        timestamp: msg.timestamp.clone(),
        r#type: msg.r#type.clone(),
        kind: msg.kind.clone(),
        supertags: msg.supertags.clone(),
        subtype: msg.subtype.clone().unwrap_or_default(),
        content: serde_json::to_string(&msg.content).unwrap_or_default(),
        metadata: msg
            .metadata
            .as_ref()
            .map(|m| serde_json::to_string(m).unwrap_or_default())
            .unwrap_or_default(),
        signature: msg.signature.clone(),
        encryption: msg
            .encryption
            .as_ref()
            .map(|e| serde_json::to_string(e).unwrap_or_default())
            .unwrap_or_default(),
        views: serde_json::to_string(&msg.views).unwrap_or_else(|_| "[]".to_string()),
        references: serde_json::to_string(&msg.references).unwrap_or_else(|_| "[]".to_string()),
        attachments: serde_json::to_string(&msg.attachments).unwrap_or_else(|_| "[]".to_string()),
        store_in_relational: msg.store_in_relational,
    }
}

#[cfg(test)]
#[path = "proactive_routes/persona_response_tests.rs"]
mod persona_response_tests;
