/*
 * @module-id: rust.simulator-runtime
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};

use crate::{
    autonomy_policy::{AutonomyDecision, autonomy_decision_for_simulator_action_kind},
    simulator_contract::{
        SIMULATOR_PROMOTION_APPROVAL_REQUIRED, SIMULATOR_PROMOTION_PREPARED_CONTEXT,
        SIMULATOR_PROMOTION_PREPARED_DRAFT, SIMULATOR_PROMOTION_REVERSIBLE_ACTION,
    },
    simulator_graph::{
        SIMULATOR_NODE_COMMITMENT, SIMULATOR_NODE_CONTEXT_ITEM, SIMULATOR_NODE_CRITICAL_CHANGE,
        SIMULATOR_NODE_DECISION, SIMULATOR_NODE_PREPARED_CONTEXT, SIMULATOR_NODE_PREPARED_DRAFT,
        SIMULATOR_NODE_RESPONSE, SIMULATOR_NODE_STATE_FIELD, SIMULATOR_NODE_WATCHER_SIGNAL,
        SimulatorRelevantStateGraph, SimulatorRelevantStateNode,
    },
};

pub const SIMULATOR_ACTION_DEFER_TASK: &str = "defer_task";
pub const SIMULATOR_ACTION_FLAG_CONFLICT: &str = "flag_conflict";
pub const SIMULATOR_ACTION_PROPOSE_ALTERNATIVE: &str = "propose_alternative";
pub const SIMULATOR_ACTION_SEND_SUMMARY: &str = "send_summary";
pub const SIMULATOR_ACTION_SCHEDULE_MEETING: &str = "schedule_meeting";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorActionCondition {
    pub condition_kind: String,
    pub target_node_kind: String,
    pub detail: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SimulatorActionRegistryEntry {
    pub action_kind: String,
    pub label: String,
    pub autonomy_decision: AutonomyDecision,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub promotion_target: Option<String>,
    #[serde(default)]
    pub preconditions: Vec<SimulatorActionCondition>,
    #[serde(default)]
    pub postconditions: Vec<SimulatorActionCondition>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorQueuedEvent {
    pub event_id: String,
    pub event_kind: String,
    pub node_id: String,
    pub node_kind: String,
    pub node_label: String,
    pub scheduled_minute_offset: u32,
    pub priority: u8,
    pub rationale: String,
}

pub fn default_simulator_action_registry() -> Vec<SimulatorActionRegistryEntry> {
    vec![
        SimulatorActionRegistryEntry {
            action_kind: SIMULATOR_ACTION_DEFER_TASK.to_string(),
            label: "Defer task safely".to_string(),
            autonomy_decision: autonomy_decision_for_simulator_action_kind(
                SIMULATOR_ACTION_DEFER_TASK,
            ),
            promotion_target: Some(SIMULATOR_PROMOTION_REVERSIBLE_ACTION.to_string()),
            preconditions: vec![
                SimulatorActionCondition {
                    condition_kind: "requires_node_kind".to_string(),
                    target_node_kind: SIMULATOR_NODE_COMMITMENT.to_string(),
                    detail: "A commitment or scheduled obligation must be active.".to_string(),
                },
                SimulatorActionCondition {
                    condition_kind: "requires_low_consequence".to_string(),
                    target_node_kind: SIMULATOR_NODE_COMMITMENT.to_string(),
                    detail: "Only low-consequence deferrals can stay reversible.".to_string(),
                },
            ],
            postconditions: vec![SimulatorActionCondition {
                condition_kind: "yields_reversible_action".to_string(),
                target_node_kind: SIMULATOR_NODE_COMMITMENT.to_string(),
                detail: "Promotion must stay in the reversible-action lane.".to_string(),
            }],
        },
        SimulatorActionRegistryEntry {
            action_kind: SIMULATOR_ACTION_FLAG_CONFLICT.to_string(),
            label: "Flag likely conflict".to_string(),
            autonomy_decision: autonomy_decision_for_simulator_action_kind(
                SIMULATOR_ACTION_FLAG_CONFLICT,
            ),
            promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_CONTEXT.to_string()),
            preconditions: vec![SimulatorActionCondition {
                condition_kind: "requires_overlap_signal".to_string(),
                target_node_kind: SIMULATOR_NODE_CRITICAL_CHANGE.to_string(),
                detail: "A critical change or conflict indicator must already be present."
                    .to_string(),
            }],
            postconditions: vec![SimulatorActionCondition {
                condition_kind: "yields_prepared_context".to_string(),
                target_node_kind: SIMULATOR_NODE_CRITICAL_CHANGE.to_string(),
                detail: "Conflict projections must remain non-authoritative prepared context."
                    .to_string(),
            }],
        },
        SimulatorActionRegistryEntry {
            action_kind: SIMULATOR_ACTION_PROPOSE_ALTERNATIVE.to_string(),
            label: "Propose alternative".to_string(),
            autonomy_decision: autonomy_decision_for_simulator_action_kind(
                SIMULATOR_ACTION_PROPOSE_ALTERNATIVE,
            ),
            promotion_target: Some(SIMULATOR_PROMOTION_PREPARED_DRAFT.to_string()),
            preconditions: vec![SimulatorActionCondition {
                condition_kind: "requires_branching_state".to_string(),
                target_node_kind: SIMULATOR_NODE_DECISION.to_string(),
                detail: "A decision or response branch with meaningful alternatives must exist."
                    .to_string(),
            }],
            postconditions: vec![SimulatorActionCondition {
                condition_kind: "yields_prepared_draft".to_string(),
                target_node_kind: SIMULATOR_NODE_DECISION.to_string(),
                detail:
                    "Alternatives must be promoted through prepared artifacts, not durable state."
                        .to_string(),
            }],
        },
        SimulatorActionRegistryEntry {
            action_kind: SIMULATOR_ACTION_SEND_SUMMARY.to_string(),
            label: "Prepare summary send".to_string(),
            autonomy_decision: autonomy_decision_for_simulator_action_kind(
                SIMULATOR_ACTION_SEND_SUMMARY,
            ),
            promotion_target: Some(SIMULATOR_PROMOTION_APPROVAL_REQUIRED.to_string()),
            preconditions: vec![SimulatorActionCondition {
                condition_kind: "requires_response_or_context".to_string(),
                target_node_kind: SIMULATOR_NODE_RESPONSE.to_string(),
                detail: "A response or context bundle must already justify outbound summarization."
                    .to_string(),
            }],
            postconditions: vec![SimulatorActionCondition {
                condition_kind: "yields_approval_required".to_string(),
                target_node_kind: SIMULATOR_NODE_RESPONSE.to_string(),
                detail: "Outbound summaries must remain approval-bound until reviewed.".to_string(),
            }],
        },
        SimulatorActionRegistryEntry {
            action_kind: SIMULATOR_ACTION_SCHEDULE_MEETING.to_string(),
            label: "Prepare meeting schedule".to_string(),
            autonomy_decision: autonomy_decision_for_simulator_action_kind(
                SIMULATOR_ACTION_SCHEDULE_MEETING,
            ),
            promotion_target: Some(SIMULATOR_PROMOTION_APPROVAL_REQUIRED.to_string()),
            preconditions: vec![
                SimulatorActionCondition {
                    condition_kind: "requires_commitment_or_conflict".to_string(),
                    target_node_kind: SIMULATOR_NODE_COMMITMENT.to_string(),
                    detail: "A timing pressure node must already be present.".to_string(),
                },
                SimulatorActionCondition {
                    condition_kind: "requires_human_review".to_string(),
                    target_node_kind: SIMULATOR_NODE_COMMITMENT.to_string(),
                    detail: "Calendar coordination must stay human-reviewable.".to_string(),
                },
            ],
            postconditions: vec![SimulatorActionCondition {
                condition_kind: "yields_approval_required".to_string(),
                target_node_kind: SIMULATOR_NODE_COMMITMENT.to_string(),
                detail: "Scheduling outcomes must route through the approval lane.".to_string(),
            }],
        },
    ]
}

pub fn simulator_action_registry() -> Vec<SimulatorActionRegistryEntry> {
    default_simulator_action_registry()
}

pub fn build_simulator_event_queue(
    graph: &SimulatorRelevantStateGraph,
) -> Vec<SimulatorQueuedEvent> {
    build_bounded_simulator_event_queue(graph, usize::MAX)
}

pub fn build_bounded_simulator_event_queue(
    graph: &SimulatorRelevantStateGraph,
    step_cap: usize,
) -> Vec<SimulatorQueuedEvent> {
    let mut events = graph
        .nodes
        .iter()
        .filter_map(simulator_event_for_node)
        .collect::<Vec<_>>();
    events.sort_by_key(|event| {
        (
            event.scheduled_minute_offset,
            event.priority,
            event.event_id.clone(),
        )
    });
    if events.len() > step_cap {
        events.truncate(step_cap);
    }
    events
}

fn simulator_event_for_node(node: &SimulatorRelevantStateNode) -> Option<SimulatorQueuedEvent> {
    let (event_kind, scheduled_minute_offset, priority, rationale) = match node.node_kind.as_str() {
        SIMULATOR_NODE_DECISION => (
            "review_decision_path",
            urgency_offset(node.urgency.as_deref()),
            urgency_priority(node.urgency.as_deref(), true),
            "Decision pressure creates immediate branching value.".to_string(),
        ),
        SIMULATOR_NODE_RESPONSE => (
            "review_follow_up_window",
            urgency_offset(node.urgency.as_deref()),
            urgency_priority(node.urgency.as_deref(), false),
            "Response timing may branch into draft, defer, or summary outcomes.".to_string(),
        ),
        SIMULATOR_NODE_COMMITMENT => (
            "check_commitment_timing",
            10,
            2,
            "Commitment timing can create bounded conflict or defer signals.".to_string(),
        ),
        SIMULATOR_NODE_CRITICAL_CHANGE => (
            "inspect_change_impact",
            0,
            0,
            "Critical changes deserve immediate bounded projection.".to_string(),
        ),
        SIMULATOR_NODE_CONTEXT_ITEM => (
            "inspect_connected_context",
            15,
            3,
            "Connected context may justify prepared alternatives.".to_string(),
        ),
        SIMULATOR_NODE_WATCHER_SIGNAL => (
            "inspect_watcher_signal",
            urgency_offset(node.urgency.as_deref()),
            1,
            "Watcher signal suggests time-sensitive branching.".to_string(),
        ),
        SIMULATOR_NODE_STATE_FIELD => (
            "inspect_state_field",
            5,
            1,
            "Active state fields mark high-coherence simulation candidates.".to_string(),
        ),
        SIMULATOR_NODE_PREPARED_CONTEXT => (
            "inspect_prepared_context",
            20,
            3,
            "Prepared context may already support a bounded projection.".to_string(),
        ),
        SIMULATOR_NODE_PREPARED_DRAFT => (
            "inspect_prepared_draft",
            20,
            3,
            "Prepared draft may reveal low-cost next-step alternatives.".to_string(),
        ),
        _ => return None,
    };

    Some(SimulatorQueuedEvent {
        event_id: format!("event:{}", node.node_id),
        event_kind: event_kind.to_string(),
        node_id: node.node_id.clone(),
        node_kind: node.node_kind.clone(),
        node_label: node.label.clone(),
        scheduled_minute_offset,
        priority,
        rationale,
    })
}

fn urgency_offset(urgency: Option<&str>) -> u32 {
    match urgency.unwrap_or_default() {
        "urgent" => 0,
        "today" | "active" => 5,
        "high" => 10,
        _ => 20,
    }
}

fn urgency_priority(urgency: Option<&str>, approval_weighted: bool) -> u8 {
    match urgency.unwrap_or_default() {
        "urgent" => 0,
        "today" => 1,
        "high" if approval_weighted => 1,
        "high" => 2,
        _ => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulator_graph::{
        SIMULATOR_NODE_RESPONSE, SimulatorRelevantStateEdge, SimulatorRelevantStateGraph,
        SimulatorRelevantStateNode,
    };

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
                    node_id: "decision:1".to_string(),
                    node_kind: SIMULATOR_NODE_DECISION.to_string(),
                    label: "Approve vendor".to_string(),
                    urgency: Some("today".to_string()),
                    confidence: Some("high".to_string()),
                    source_refs: vec!["msg:1".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "response:1".to_string(),
                    node_kind: SIMULATOR_NODE_RESPONSE.to_string(),
                    label: "Reply to thread".to_string(),
                    urgency: Some("urgent".to_string()),
                    confidence: Some("medium".to_string()),
                    source_refs: vec!["msg:2".to_string()],
                    object_refs: Vec::new(),
                },
                SimulatorRelevantStateNode {
                    node_id: "state_field:1".to_string(),
                    node_kind: SIMULATOR_NODE_STATE_FIELD.to_string(),
                    label: "Approval required".to_string(),
                    urgency: Some("active".to_string()),
                    confidence: Some("high".to_string()),
                    source_refs: vec!["msg:1".to_string()],
                    object_refs: Vec::new(),
                },
            ],
            edges: vec![SimulatorRelevantStateEdge {
                from_node_id: "root:snapshot:test".to_string(),
                to_node_id: "decision:1".to_string(),
                relation_kind: "queue_pressure".to_string(),
            }],
        }
    }

    #[test]
    fn simulator_action_registry_reuses_existing_policy_vocabulary() {
        let registry = default_simulator_action_registry();

        assert_eq!(registry.len(), 5);
        assert!(
            registry
                .iter()
                .any(|entry| entry.action_kind == SIMULATOR_ACTION_DEFER_TASK
                    && entry.autonomy_decision.reversible)
        );
        assert!(registry.iter().any(|entry| {
            entry.action_kind == SIMULATOR_ACTION_SEND_SUMMARY
                && entry.autonomy_decision.approval_required
        }));
        assert!(
            registry
                .iter()
                .all(|entry| !entry.preconditions.is_empty() && !entry.postconditions.is_empty())
        );
    }

    #[test]
    fn simulator_event_queue_orders_by_time_then_priority() {
        let queue = build_simulator_event_queue(&sample_graph());

        assert_eq!(queue[0].node_id, "response:1");
        assert_eq!(queue[1].node_id, "decision:1");
        assert_eq!(queue[2].node_id, "state_field:1");
        assert_eq!(queue[0].node_kind, SIMULATOR_NODE_RESPONSE);
        assert_eq!(queue[0].node_label, "Reply to thread");
    }

    #[test]
    fn simulator_event_queue_respects_step_cap() {
        let queue = build_bounded_simulator_event_queue(&sample_graph(), 2);

        assert_eq!(queue.len(), 2);
        assert_eq!(queue[0].node_id, "response:1");
        assert_eq!(queue[1].node_id, "decision:1");
    }

    #[test]
    fn simulator_event_queue_skips_unmapped_nodes() {
        let mut graph = sample_graph();
        graph.nodes.push(SimulatorRelevantStateNode {
            node_id: "root:snapshot:test".to_string(),
            node_kind: "root".to_string(),
            label: "Root".to_string(),
            urgency: None,
            confidence: None,
            source_refs: Vec::new(),
            object_refs: Vec::new(),
        });

        let queue = build_simulator_event_queue(&graph);
        assert_eq!(queue.len(), 3);
    }
}
