/*
 * @module-id: rust.state-snapshot
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::prepared_context_packet::PreparedContextPacket;
use crate::prepared_draft_packet::PreparedDraftPacket;
use crate::state_fields::StateFieldActivation;

pub const AFP_TYPE_STATE_SNAPSHOT: &str = "state_snapshot";
pub const AFP_SUBTYPE_STATE_SNAPSHOT: &str = "homepage_briefing";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotDecisionItem {
    pub id: String,
    pub label: String,
    pub category: String,
    pub urgency: String,
    pub confidence: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
    pub suggested_next_action: String,
    #[serde(default)]
    pub approval_required: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotResponseItem {
    pub id: String,
    pub label: String,
    pub channel: String,
    pub urgency: String,
    pub confidence: String,
    pub response_due_hint: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
    pub suggested_next_action: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotCommitment {
    pub label: String,
    pub time_horizon: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotCriticalChange {
    pub label: String,
    pub delta_type: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotContextItem {
    pub id: String,
    pub label: String,
    pub why_surfaced: String,
    pub confidence: String,
    #[serde(default)]
    pub freshness: String,
    #[serde(default)]
    pub relation_path: Vec<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub decrypt_needed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotWatcherSignal {
    pub id: String,
    pub signal_key: String,
    pub category: String,
    pub freshness: String,
    pub urgency: String,
    pub confidence: String,
    #[serde(default)]
    pub urgency_hint: String,
    #[serde(default)]
    pub suppression_status: String,
    #[serde(default)]
    pub suppression_reason: String,
    #[serde(default)]
    pub escalation_status: String,
    #[serde(default)]
    pub escalation_reason: String,
    #[serde(default)]
    pub decrypt_needed: bool,
    pub source_type: String,
    pub source_subtype: String,
    pub thread_id: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotContinuityMetrics {
    pub recent_signal_count: u32,
    pub fresh_signal_count: u32,
    pub burst_signal_count: u32,
    pub reactivation_signal_count: u32,
    pub deadline_signal_count: u32,
    #[serde(default)]
    pub activity_velocity: f64,
    #[serde(default)]
    pub urgency_acceleration: f64,
    #[serde(default)]
    pub context_switch_rate: f64,
    #[serde(default)]
    pub unresolved_queue_pressure: f64,
    #[serde(default)]
    pub follow_up_drift_score: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct StateSnapshotContent {
    pub snapshot_kind: String,
    pub time_window: String,
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub decision_queue: Vec<StateSnapshotDecisionItem>,
    #[serde(default)]
    pub response_queue: Vec<StateSnapshotResponseItem>,
    #[serde(default)]
    pub active_commitments: Vec<StateSnapshotCommitment>,
    #[serde(default)]
    pub critical_changes: Vec<StateSnapshotCriticalChange>,
    #[serde(default)]
    pub context_panel_items: Vec<StateSnapshotContextItem>,
    #[serde(default)]
    pub watcher_signals: Vec<StateSnapshotWatcherSignal>,
    #[serde(default)]
    pub continuity_metrics: StateSnapshotContinuityMetrics,
    #[serde(default)]
    pub suggested_actions: Vec<String>,
    #[serde(default)]
    pub confidence_notes: Vec<String>,
    #[serde(default)]
    pub state_fields: Vec<StateFieldActivation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepared_context_packet: Option<PreparedContextPacket>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepared_draft_packet: Option<PreparedDraftPacket>,
    pub staleness_at: String,
}

pub fn build_state_snapshot_afp(
    owner_user_id: &str,
    thread_id: &str,
    view_id: &str,
    content: &StateSnapshotContent,
) -> Value {
    let title = content
        .suggested_actions
        .first()
        .cloned()
        .unwrap_or_else(|| "State updated".to_string());

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "state_synthesizer",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_STATE_SNAPSHOT,
        "subtype": AFP_SUBTYPE_STATE_SNAPSHOT,
        "content": serde_json::to_value(content).unwrap_or(Value::Null),
        "views": [{
            "schema_version": "a2ui.v1",
            "kind": "decision_brief",
            "props": {
                "view_id": view_id,
                "snapshot_kind": content.snapshot_kind,
                "title": title,
                "decision_queue": content.decision_queue,
                "response_queue": content.response_queue,
                "active_commitments": content.active_commitments,
                "critical_changes": content.critical_changes,
                "context_panel_items": content.context_panel_items,
                "watcher_signals": content.watcher_signals,
                "continuity_metrics": content.continuity_metrics,
                "suggested_actions": content.suggested_actions,
                "confidence_notes": content.confidence_notes,
                "state_fields": content.state_fields,
                "prepared_context_packet": content.prepared_context_packet,
                "prepared_draft_packet": content.prepared_draft_packet,
            },
        }],
        "metadata": {
            "store": true,
            "continuity": true,
            "intent_route": {
                "primary_intent": "state_snapshot",
                "route_mode": "special",
            }
        },
        "store_in_relational": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_content() -> StateSnapshotContent {
        StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["calendar:today".to_string(), "inbox:summary".to_string()],
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "dq_1".to_string(),
                label: "Approve grocery order".to_string(),
                category: "shopping".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review total".to_string(),
                approval_required: true,
            }],
            response_queue: vec![StateSnapshotResponseItem {
                id: "rq_1".to_string(),
                label: "Reply to supplier timeline update".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                response_due_hint: "Within 24h".to_string(),
                source_refs: vec!["msg_2".to_string()],
                suggested_next_action: "Draft reply".to_string(),
            }],
            active_commitments: vec![StateSnapshotCommitment {
                label: "Dentist at 3 PM".to_string(),
                time_horizon: "today".to_string(),
                source_refs: vec!["calendar:evt1".to_string()],
            }],
            critical_changes: vec![StateSnapshotCriticalChange {
                label: "Meeting moved by 30 minutes".to_string(),
                delta_type: "schedule_shift".to_string(),
                source_refs: vec!["calendar:evt2".to_string()],
            }],
            context_panel_items: vec![StateSnapshotContextItem {
                id: "ctx_1".to_string(),
                label: "Reply from supplier thread".to_string(),
                why_surfaced:
                    "Reply from supplier thread surfaced through 1 topology hop via same thread."
                        .to_string(),
                confidence: "medium".to_string(),
                freshness: "fresh".to_string(),
                relation_path: vec!["same_thread".to_string()],
                source_refs: vec!["msg_3".to_string()],
                decrypt_needed: false,
            }],
            watcher_signals: vec![StateSnapshotWatcherSignal {
                id: "sig_1".to_string(),
                signal_key: "passive_event:calendar".to_string(),
                category: "schedule".to_string(),
                freshness: "fresh".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                urgency_hint: "Fresh schedule signal still needs attention today.".to_string(),
                suppression_status: "active".to_string(),
                suppression_reason: "Recent passive event observed directly from source metadata."
                    .to_string(),
                escalation_status: "watch".to_string(),
                escalation_reason:
                    "Fresh today-scoped signal is still active, but no interruptive escalation is required yet."
                        .to_string(),
                decrypt_needed: false,
                source_type: "passive_event".to_string(),
                source_subtype: "appointment_approaching".to_string(),
                thread_id: "thread_1".to_string(),
                source_refs: vec!["sig_1".to_string()],
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                recent_signal_count: 1,
                fresh_signal_count: 1,
                burst_signal_count: 0,
                reactivation_signal_count: 0,
                deadline_signal_count: 1,
                activity_velocity: 0.45,
                urgency_acceleration: 0.75,
                context_switch_rate: 0.2,
                unresolved_queue_pressure: 0.4,
                follow_up_drift_score: 0.15,
            },
            suggested_actions: vec!["Review your schedule changes".to_string()],
            confidence_notes: vec!["Calendar is current".to_string()],
            state_fields: vec![StateFieldActivation {
                field_key: "unresolved_decisions".to_string(),
                label: "Unresolved decisions".to_string(),
                status: "active".to_string(),
                confidence: "high".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Review the unresolved decision queue.".to_string(),
                autonomy_level: "request_approval".to_string(),
                reason: "The decision queue still contains unresolved items.".to_string(),
                evidence_refs: vec!["msg_1".to_string()],
            }],
            prepared_context_packet: Some(PreparedContextPacket {
                packet_kind: "continuity_context".to_string(),
                ready: true,
                summary: "Prepared context ready: 1 related context item, 1 decision source.".to_string(),
                anchor_refs: vec!["calendar:today".to_string()],
                source_refs: vec!["msg_1".to_string(), "msg_3".to_string()],
                decision_refs: vec!["msg_1".to_string()],
                decision_history_refs: vec!["msg_1".to_string()],
                response_refs: vec!["msg_2".to_string()],
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
            prepared_draft_packet: Some(PreparedDraftPacket {
                ready: true,
                summary: "Prepared 1 communication reply draft for review.".to_string(),
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft:reply:rq_1".to_string(),
                    draft_class: "communication_reply".to_string(),
                    label: "Reply draft for Reply to supplier timeline update".to_string(),
                    channel: "email".to_string(),
                    summary: "Prepared an email reply draft for review. Suggested timing: Within 24h.".to_string(),
                    body: "Thanks for the update.\n\nI am reviewing the details now and will follow up Within 24h.\n\nBest,\n[Your Name]".to_string(),
                    confidence: "medium".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    approval_required_to_send: true,
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
        }
    }

    #[test]
    fn build_state_snapshot_afp_emits_expected_type_and_view_id() {
        let afp = build_state_snapshot_afp(
            "user_01",
            "continuity:state:user_01",
            "home_view_01",
            &sample_content(),
        );

        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_STATE_SNAPSHOT));
        assert_eq!(
            afp["views"][0]["props"]["view_id"].as_str(),
            Some("home_view_01")
        );
        assert_eq!(
            afp["content"]["snapshot_kind"].as_str(),
            Some("homepage_briefing")
        );
        assert_eq!(
            afp["views"][0]["props"]["context_panel_items"][0]["id"].as_str(),
            Some("ctx_1")
        );
        assert_eq!(
            afp["views"][0]["props"]["watcher_signals"][0]["signal_key"].as_str(),
            Some("passive_event:calendar")
        );
        assert_eq!(
            afp["views"][0]["props"]["continuity_metrics"]["deadline_signal_count"].as_u64(),
            Some(1)
        );
        assert_eq!(
            afp["views"][0]["props"]["continuity_metrics"]["urgency_acceleration"].as_f64(),
            Some(0.75)
        );
        assert_eq!(
            afp["views"][0]["props"]["suggested_actions"][0].as_str(),
            Some("Review your schedule changes")
        );
        assert_eq!(
            afp["views"][0]["props"]["prepared_context_packet"]["ready"].as_bool(),
            Some(true)
        );
        assert_eq!(
            afp["views"][0]["props"]["prepared_draft_packet"]["ready"].as_bool(),
            Some(true)
        );
        assert_eq!(
            afp["views"][0]["props"]["prepared_draft_packet"]["drafts"][0]["draft_class"].as_str(),
            Some("communication_reply")
        );
        assert_eq!(
            afp["views"][0]["props"]["state_fields"][0]["field_key"].as_str(),
            Some("unresolved_decisions")
        );
    }
}
