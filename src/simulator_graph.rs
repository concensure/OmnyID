/*
 * @module-id: rust.simulator-graph
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::collections::{BTreeSet, HashMap};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::{
    simulator_contract::{SIMULATOR_CONTRACT_VERSION, SimulatorBoundaryInput},
    state_fields::StateFieldActivation,
    state_snapshot::{
        StateSnapshotCommitment, StateSnapshotContextItem, StateSnapshotCriticalChange,
        StateSnapshotDecisionItem, StateSnapshotResponseItem, StateSnapshotWatcherSignal,
    },
};

pub const SIMULATOR_NODE_ROOT: &str = "root";
pub const SIMULATOR_NODE_DECISION: &str = "decision";
pub const SIMULATOR_NODE_RESPONSE: &str = "response";
pub const SIMULATOR_NODE_COMMITMENT: &str = "commitment";
pub const SIMULATOR_NODE_CRITICAL_CHANGE: &str = "critical_change";
pub const SIMULATOR_NODE_CONTEXT_ITEM: &str = "context_item";
pub const SIMULATOR_NODE_WATCHER_SIGNAL: &str = "watcher_signal";
pub const SIMULATOR_NODE_STATE_FIELD: &str = "state_field";
pub const SIMULATOR_NODE_PREPARED_CONTEXT: &str = "prepared_context";
pub const SIMULATOR_NODE_CONTEXT_PACK: &str = "context_pack";
pub const SIMULATOR_NODE_PREPARED_DRAFT_PACKET: &str = "prepared_draft_packet";
pub const SIMULATOR_NODE_PREPARED_DRAFT: &str = "prepared_draft";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorRelevantStateNode {
    pub node_id: String,
    pub node_kind: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub urgency: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub object_refs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorRelevantStateEdge {
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation_kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SimulatorRelevantStateGraph {
    pub contract_version: String,
    pub snapshot_ref: String,
    pub node_cap: usize,
    pub edge_cap: usize,
    pub nodes_truncated: bool,
    pub edges_truncated: bool,
    pub budget_exhausted: bool,
    pub assembly_time_ms: u64,
    #[serde(default)]
    pub nodes: Vec<SimulatorRelevantStateNode>,
    #[serde(default)]
    pub edges: Vec<SimulatorRelevantStateEdge>,
}

pub fn build_relevant_state_graph(input: &SimulatorBoundaryInput) -> SimulatorRelevantStateGraph {
    let started_at = Instant::now();
    let budget_ms = input.guardrails.assembly_budget_ms;
    let mut graph = SimulatorRelevantStateGraph {
        contract_version: SIMULATOR_CONTRACT_VERSION.to_string(),
        snapshot_ref: input.snapshot_ref.clone(),
        node_cap: input.guardrails.node_cap,
        edge_cap: input.guardrails.edge_cap,
        nodes_truncated: false,
        edges_truncated: false,
        budget_exhausted: false,
        assembly_time_ms: 0,
        nodes: Vec::new(),
        edges: Vec::new(),
    };

    push_node(
        &mut graph,
        SimulatorRelevantStateNode {
            node_id: format!("{}:{}", SIMULATOR_NODE_ROOT, input.snapshot_ref),
            node_kind: SIMULATOR_NODE_ROOT.to_string(),
            label: "Current relevant state".to_string(),
            urgency: None,
            confidence: input
                .synthesizer_handoff
                .as_ref()
                .map(|handoff| handoff.confidence.clone()),
            source_refs: unique_strings(
                input
                    .relevant_state
                    .source_refs
                    .iter()
                    .cloned()
                    .chain(input.snapshot.sources.iter().cloned())
                    .collect(),
            ),
            object_refs: input.relevant_state.object_refs.clone(),
        },
    );

    let root_node_id = graph.nodes[0].node_id.clone();

    if budget_exhausted(&mut graph, started_at, budget_ms) {
        return finish_graph(graph, started_at);
    }

    let mut indexed_nodes = Vec::new();
    let snapshot = &input.snapshot;

    index_snapshot_items(
        &mut graph,
        &mut indexed_nodes,
        &root_node_id,
        snapshot.decision_queue.iter().map(decision_node),
        "queue_pressure",
        started_at,
        budget_ms,
    );
    index_snapshot_items(
        &mut graph,
        &mut indexed_nodes,
        &root_node_id,
        snapshot.response_queue.iter().map(response_node),
        "follow_up_timing",
        started_at,
        budget_ms,
    );
    index_snapshot_items(
        &mut graph,
        &mut indexed_nodes,
        &root_node_id,
        snapshot.active_commitments.iter().map(commitment_node),
        "active_thread_or_commitment",
        started_at,
        budget_ms,
    );
    index_snapshot_items(
        &mut graph,
        &mut indexed_nodes,
        &root_node_id,
        snapshot.critical_changes.iter().map(critical_change_node),
        "critical_change",
        started_at,
        budget_ms,
    );
    index_snapshot_items(
        &mut graph,
        &mut indexed_nodes,
        &root_node_id,
        snapshot.context_panel_items.iter().map(context_item_node),
        "connected_reference",
        started_at,
        budget_ms,
    );
    index_snapshot_items(
        &mut graph,
        &mut indexed_nodes,
        &root_node_id,
        snapshot.watcher_signals.iter().map(watcher_signal_node),
        "watcher_signal",
        started_at,
        budget_ms,
    );
    index_snapshot_items(
        &mut graph,
        &mut indexed_nodes,
        &root_node_id,
        snapshot
            .state_fields
            .iter()
            .filter(|field| field.status == "active")
            .map(state_field_node),
        "high_coherence_state",
        started_at,
        budget_ms,
    );

    if let Some(packet) = snapshot
        .prepared_context_packet
        .as_ref()
        .filter(|packet| packet.ready)
    {
        let node = SimulatorRelevantStateNode {
            node_id: "prepared_context:packet".to_string(),
            node_kind: SIMULATOR_NODE_PREPARED_CONTEXT.to_string(),
            label: packet.summary.clone(),
            urgency: None,
            confidence: Some("prepared".to_string()),
            source_refs: packet.source_refs.clone(),
            object_refs: packet.object_refs.clone(),
        };
        if let Some(node_id) = push_indexed_node(
            &mut graph,
            &root_node_id,
            node,
            "prepared_context",
            started_at,
            budget_ms,
        ) {
            indexed_nodes.push(node_id);
        }
        index_snapshot_items(
            &mut graph,
            &mut indexed_nodes,
            "prepared_context:packet",
            packet.packs.iter().map(context_pack_node),
            "connected_reference",
            started_at,
            budget_ms,
        );
    }

    if let Some(packet) = snapshot
        .prepared_draft_packet
        .as_ref()
        .filter(|packet| packet.ready)
    {
        let node = SimulatorRelevantStateNode {
            node_id: "prepared_draft:packet".to_string(),
            node_kind: SIMULATOR_NODE_PREPARED_DRAFT_PACKET.to_string(),
            label: packet.summary.clone(),
            urgency: None,
            confidence: Some("prepared".to_string()),
            source_refs: packet
                .drafts
                .iter()
                .flat_map(|draft| draft.source_refs.iter().cloned())
                .collect(),
            object_refs: packet
                .drafts
                .iter()
                .flat_map(|draft| draft.object_refs.iter().cloned())
                .collect(),
        };
        if let Some(node_id) = push_indexed_node(
            &mut graph,
            &root_node_id,
            node,
            "prepared_draft",
            started_at,
            budget_ms,
        ) {
            indexed_nodes.push(node_id);
        }
        index_snapshot_items(
            &mut graph,
            &mut indexed_nodes,
            "prepared_draft:packet",
            packet.drafts.iter().map(prepared_draft_node),
            "prepared_draft",
            started_at,
            budget_ms,
        );
    }

    link_shared_references(&mut graph, &indexed_nodes, started_at, budget_ms);
    finish_graph(graph, started_at)
}

fn finish_graph(
    mut graph: SimulatorRelevantStateGraph,
    started_at: Instant,
) -> SimulatorRelevantStateGraph {
    graph.assembly_time_ms = started_at.elapsed().as_millis() as u64;
    graph
}

fn budget_exhausted(
    graph: &mut SimulatorRelevantStateGraph,
    started_at: Instant,
    budget_ms: u64,
) -> bool {
    if started_at.elapsed().as_millis() as u64 > budget_ms {
        graph.budget_exhausted = true;
        true
    } else {
        false
    }
}

fn push_node(graph: &mut SimulatorRelevantStateGraph, node: SimulatorRelevantStateNode) -> bool {
    if graph.nodes.len() >= graph.node_cap {
        graph.nodes_truncated = true;
        return false;
    }
    graph.nodes.push(node);
    true
}

fn push_edge(graph: &mut SimulatorRelevantStateGraph, edge: SimulatorRelevantStateEdge) -> bool {
    if graph.edges.len() >= graph.edge_cap {
        graph.edges_truncated = true;
        return false;
    }
    graph.edges.push(edge);
    true
}

fn push_indexed_node(
    graph: &mut SimulatorRelevantStateGraph,
    root_node_id: &str,
    node: SimulatorRelevantStateNode,
    relation_kind: &str,
    started_at: Instant,
    budget_ms: u64,
) -> Option<String> {
    if budget_exhausted(graph, started_at, budget_ms) {
        return None;
    }
    let node_id = node.node_id.clone();
    if !push_node(graph, node) {
        return None;
    }
    let _ = push_edge(
        graph,
        SimulatorRelevantStateEdge {
            from_node_id: root_node_id.to_string(),
            to_node_id: node_id.clone(),
            relation_kind: relation_kind.to_string(),
        },
    );
    Some(node_id)
}

fn index_snapshot_items<I>(
    graph: &mut SimulatorRelevantStateGraph,
    indexed_nodes: &mut Vec<String>,
    root_node_id: &str,
    nodes: I,
    relation_kind: &str,
    started_at: Instant,
    budget_ms: u64,
) where
    I: Iterator<Item = SimulatorRelevantStateNode>,
{
    for node in nodes {
        if let Some(node_id) = push_indexed_node(
            graph,
            root_node_id,
            node,
            relation_kind,
            started_at,
            budget_ms,
        ) {
            indexed_nodes.push(node_id);
        }
        if graph.nodes_truncated || graph.budget_exhausted {
            break;
        }
    }
}

fn link_shared_references(
    graph: &mut SimulatorRelevantStateGraph,
    indexed_nodes: &[String],
    started_at: Instant,
    budget_ms: u64,
) {
    let mut by_source_ref: HashMap<String, Vec<String>> = HashMap::new();
    let mut by_object_ref: HashMap<String, Vec<String>> = HashMap::new();

    for node in graph
        .nodes
        .iter()
        .filter(|node| indexed_nodes.contains(&node.node_id))
    {
        for source_ref in &node.source_refs {
            by_source_ref
                .entry(source_ref.clone())
                .or_default()
                .push(node.node_id.clone());
        }
        for object_ref in &node.object_refs {
            by_object_ref
                .entry(object_ref.clone())
                .or_default()
                .push(node.node_id.clone());
        }
    }

    for linked_nodes in by_source_ref.values().chain(by_object_ref.values()) {
        if budget_exhausted(graph, started_at, budget_ms) {
            break;
        }
        for pair in linked_nodes.windows(2) {
            if let [from_node_id, to_node_id] = pair {
                let relation_kind = if by_object_ref
                    .values()
                    .any(|ids| ids.windows(2).any(|window| window == pair))
                {
                    "shared_object"
                } else {
                    "shared_source_ref"
                };
                if !push_edge(
                    graph,
                    SimulatorRelevantStateEdge {
                        from_node_id: from_node_id.clone(),
                        to_node_id: to_node_id.clone(),
                        relation_kind: relation_kind.to_string(),
                    },
                ) {
                    return;
                }
            }
        }
    }
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn decision_node(item: &StateSnapshotDecisionItem) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("decision:{}", item.id),
        node_kind: SIMULATOR_NODE_DECISION.to_string(),
        label: item.label.clone(),
        urgency: Some(item.urgency.clone()),
        confidence: Some(item.confidence.clone()),
        source_refs: item.source_refs.clone(),
        object_refs: Vec::new(),
    }
}

fn response_node(item: &StateSnapshotResponseItem) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("response:{}", item.id),
        node_kind: SIMULATOR_NODE_RESPONSE.to_string(),
        label: format!("{} ({})", item.label, item.response_due_hint),
        urgency: Some(item.urgency.clone()),
        confidence: Some(item.confidence.clone()),
        source_refs: item.source_refs.clone(),
        object_refs: Vec::new(),
    }
}

fn commitment_node(item: &StateSnapshotCommitment) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("commitment:{}", item.label),
        node_kind: SIMULATOR_NODE_COMMITMENT.to_string(),
        label: format!("{} ({})", item.label, item.time_horizon),
        urgency: Some(item.time_horizon.clone()),
        confidence: None,
        source_refs: item.source_refs.clone(),
        object_refs: Vec::new(),
    }
}

fn critical_change_node(item: &StateSnapshotCriticalChange) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("change:{}", item.label),
        node_kind: SIMULATOR_NODE_CRITICAL_CHANGE.to_string(),
        label: format!("{} ({})", item.label, item.delta_type),
        urgency: Some("active".to_string()),
        confidence: None,
        source_refs: item.source_refs.clone(),
        object_refs: Vec::new(),
    }
}

fn context_item_node(item: &StateSnapshotContextItem) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("context:{}", item.id),
        node_kind: SIMULATOR_NODE_CONTEXT_ITEM.to_string(),
        label: item.label.clone(),
        urgency: None,
        confidence: Some(item.confidence.clone()),
        source_refs: item.source_refs.clone(),
        object_refs: Vec::new(),
    }
}

fn watcher_signal_node(item: &StateSnapshotWatcherSignal) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("signal:{}", item.id),
        node_kind: SIMULATOR_NODE_WATCHER_SIGNAL.to_string(),
        label: format!("{} ({})", item.signal_key, item.category),
        urgency: Some(item.urgency.clone()),
        confidence: Some(item.confidence.clone()),
        source_refs: item.source_refs.clone(),
        object_refs: Vec::new(),
    }
}

fn state_field_node(item: &StateFieldActivation) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("state_field:{}", item.field_key),
        node_kind: SIMULATOR_NODE_STATE_FIELD.to_string(),
        label: item.label.clone(),
        urgency: Some(item.status.clone()),
        confidence: Some(item.confidence.clone()),
        source_refs: item.evidence_refs.clone(),
        object_refs: Vec::new(),
    }
}

fn context_pack_node(
    item: &crate::prepared_context_packet::PreparedContextPack,
) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("context_pack:{}", item.pack_id),
        node_kind: SIMULATOR_NODE_CONTEXT_PACK.to_string(),
        label: item.title.clone(),
        urgency: None,
        confidence: Some(item.confidence.clone()),
        source_refs: item.source_refs.clone(),
        object_refs: item.object_refs.clone(),
    }
}

fn prepared_draft_node(
    item: &crate::prepared_draft_packet::PreparedDraftArtifact,
) -> SimulatorRelevantStateNode {
    SimulatorRelevantStateNode {
        node_id: format!("prepared_draft:{}", item.draft_id),
        node_kind: SIMULATOR_NODE_PREPARED_DRAFT.to_string(),
        label: item.label.clone(),
        urgency: Some(item.readiness.clone()),
        confidence: Some(item.confidence.clone()),
        source_refs: item.source_refs.clone(),
        object_refs: item.object_refs.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        prepared_context_packet::{PreparedContextPack, PreparedContextPacket},
        prepared_draft_packet::{PreparedDraftArtifact, PreparedDraftPacket},
        simulator_contract::{SimulatorBoundaryInput, SimulatorRelevantStateSeed},
        state_fields::StateFieldActivation,
        state_snapshot::{
            StateSnapshotContent, StateSnapshotDecisionItem, StateSnapshotResponseItem,
        },
    };

    fn sample_input() -> SimulatorBoundaryInput {
        SimulatorBoundaryInput::new(
            "snapshot:test",
            StateSnapshotContent {
                snapshot_kind: "homepage_briefing".to_string(),
                time_window: "today".to_string(),
                sources: vec!["calendar:today".to_string()],
                decision_queue: vec![StateSnapshotDecisionItem {
                    id: "decision-1".to_string(),
                    label: "Approve vendor choice".to_string(),
                    category: "decision".to_string(),
                    urgency: "today".to_string(),
                    confidence: "high".to_string(),
                    source_refs: vec!["msg:1".to_string()],
                    suggested_next_action: "Review options".to_string(),
                    approval_required: true,
                }],
                response_queue: vec![StateSnapshotResponseItem {
                    id: "response-1".to_string(),
                    label: "Reply to Aurora vendor".to_string(),
                    channel: "email".to_string(),
                    urgency: "today".to_string(),
                    confidence: "medium".to_string(),
                    response_due_hint: "Within 24h".to_string(),
                    source_refs: vec!["msg:2".to_string()],
                    suggested_next_action: "Draft reply".to_string(),
                }],
                state_fields: vec![StateFieldActivation {
                    field_key: "approval_required_work".to_string(),
                    label: "Approval required".to_string(),
                    status: "active".to_string(),
                    confidence: "high".to_string(),
                    surface_hint: "decision_queue".to_string(),
                    recommended_action: "Review approval work.".to_string(),
                    autonomy_level: "request_approval".to_string(),
                    reason: "Approval lane is active.".to_string(),
                    evidence_refs: vec!["msg:1".to_string()],
                }],
                prepared_context_packet: Some(PreparedContextPacket {
                    packet_kind: "continuity_context".to_string(),
                    ready: true,
                    summary: "Prepared context ready.".to_string(),
                    source_refs: vec!["msg:1".to_string(), "msg:2".to_string()],
                    object_refs: vec!["object:aurora".to_string()],
                    packs: vec![PreparedContextPack {
                        pack_id: "pack-1".to_string(),
                        pack_kind: "topic_pack".to_string(),
                        title: "Aurora topic pack".to_string(),
                        summary: "Aurora continuity bundle.".to_string(),
                        confidence: "high".to_string(),
                        why_surfaced: "Shared topic pressure.".to_string(),
                        anchor_refs: Vec::new(),
                        source_refs: vec!["msg:1".to_string()],
                        reference_refs: Vec::new(),
                        object_refs: vec!["object:aurora".to_string()],
                        evidence_kinds: vec!["shared_object".to_string()],
                        ..crate::prepared_context_packet::PreparedContextPack::default()
                    }],
                    ..PreparedContextPacket::default()
                }),
                prepared_draft_packet: Some(PreparedDraftPacket {
                    ready: true,
                    summary: "Prepared one draft.".to_string(),
                    drafts: vec![PreparedDraftArtifact {
                        draft_id: "draft-1".to_string(),
                        draft_class: "communication_reply".to_string(),
                        label: "Aurora reply draft".to_string(),
                        channel: "email".to_string(),
                        summary: "Prepared reply draft.".to_string(),
                        body: "Hello".to_string(),
                        confidence: "medium".to_string(),
                        readiness: "ready_now".to_string(),
                        response_due_hint: "Within 24h".to_string(),
                        approval_required_to_send: true,
                        source_refs: vec!["msg:2".to_string()],
                        source_count: 1,
                        storage_type: "ledger".to_string(),
                        storage_kind: None,
                        comparison_headers: Vec::new(),
                        comparison_rows: Vec::new(),
                        selection_reason: Some("Reply draft is ready.".to_string()),
                        suggested_next_action: "Review and send".to_string(),
                        object_refs: vec!["object:aurora".to_string()],
                        memory_space: None,
                        author_mask: None,
                        author_type: None,
                        author_id: None,
                        is_human_authored: None,
                        human_only: None,
                    }],
                }),
                ..StateSnapshotContent::default()
            },
            None,
            SimulatorRelevantStateSeed {
                source_refs: vec!["msg:1".to_string(), "msg:2".to_string()],
                object_refs: vec!["object:aurora".to_string()],
                thread_refs: vec!["thread:aurora".to_string()],
                active_state_fields: vec!["approval_required_work".to_string()],
                field_engine_focus_summary: None,
                field_engine_focus_type: None,
            },
        )
    }

    #[test]
    fn relevant_state_graph_includes_prepared_and_queue_nodes() {
        let graph = build_relevant_state_graph(&sample_input());

        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.node_kind == SIMULATOR_NODE_DECISION)
        );
        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.node_kind == SIMULATOR_NODE_RESPONSE)
        );
        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.node_kind == SIMULATOR_NODE_STATE_FIELD)
        );
        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.node_kind == SIMULATOR_NODE_PREPARED_CONTEXT)
        );
        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.node_kind == SIMULATOR_NODE_PREPARED_DRAFT)
        );
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.relation_kind == "shared_object")
        );
    }

    #[test]
    fn relevant_state_graph_respects_node_cap() {
        let mut input = sample_input();
        input.guardrails.node_cap = 3;
        let graph = build_relevant_state_graph(&input.normalized());

        assert_eq!(graph.nodes.len(), 3);
        assert!(graph.nodes_truncated);
    }

    #[test]
    fn relevant_state_graph_respects_edge_cap() {
        let mut input = sample_input();
        input.guardrails.edge_cap = 2;
        let graph = build_relevant_state_graph(&input.normalized());

        assert_eq!(graph.edges.len(), 2);
        assert!(graph.edges_truncated);
    }
}
