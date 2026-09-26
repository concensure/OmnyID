// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import type {
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";

export function nodeRegenerationLocked(node: WorkflowNodeDraft): boolean {
  return node.config["regeneration_lock"] === true;
}

export function nodeRegenerationScope(node: WorkflowNodeDraft): "node" | "subgraph" {
  return node.config["regeneration_lock_scope"] === "subgraph" ? "subgraph" : "node";
}

export function isIntentGeneratedRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const record = value;
  const metadata = record.metadata;
  return Boolean(isRecord(metadata) && metadata.generated_by === "intent_builder");
}

export function protectedNodeIdsForGraph(draft: WorkflowGraphDraft): Set<string> {
  const lockedRootIds = new Set(
    draft.nodes.filter((node) => nodeRegenerationLocked(node)).map((node) => node.id),
  );
  const adjacency = new Map<string, string[]>();
  for (const edge of draft.edges) {
    const current = adjacency.get(edge.source) ?? [];
    current.push(edge.target);
    adjacency.set(edge.source, current);
  }
  const protectedIds = new Set<string>(lockedRootIds);
  const queue = [...lockedRootIds].filter((id) =>
    draft.nodes.some((node) => node.id === id && nodeRegenerationScope(node) === "subgraph"),
  );
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const target of adjacency.get(current) ?? []) {
      if (!protectedIds.has(target)) {
        protectedIds.add(target);
        queue.push(target);
      }
    }
  }
  return protectedIds;
}

export function protectedEdgeIdsForGraph(draft: WorkflowGraphDraft): Set<string> {
  const protectedNodeIds = protectedNodeIdsForGraph(draft);
  return new Set(
    draft.edges
      .filter((edge) => protectedNodeIds.has(edge.source) && protectedNodeIds.has(edge.target))
      .map((edge) => edge.id),
  );
}

export function generatedCoreSummary(draft: WorkflowGraphDraft) {
  return {
    generatedNodeCount: draft.nodes.filter((node) => isIntentGeneratedRecord(node)).length,
    generatedEdgeCount: draft.edges.filter((edge) => isIntentGeneratedRecord(edge)).length,
    protectedNodeCount: protectedNodeIdsForGraph(draft).size,
    protectedEdgeCount: protectedEdgeIdsForGraph(draft).size,
  };
}

export function workflowRegenerationImpactSummary(draft: WorkflowGraphDraft) {
  const lockedNodeIds = protectedNodeIdsForGraph(draft);
  return {
    generatedNodes: draft.nodes.filter((node) => isIntentGeneratedRecord(node)).length,
    lockedNodes: lockedNodeIds.size,
    preservedNodes: draft.nodes.filter((node) =>
      !isIntentGeneratedRecord(node) || lockedNodeIds.has(node.id)
    ).length,
    generatedEdges: draft.edges.filter((edge) => isIntentGeneratedRecord(edge)).length,
    preservedEdges: draft.edges.filter((edge) =>
      !isIntentGeneratedRecord(edge)
      || lockedNodeIds.has(edge.source)
      || lockedNodeIds.has(edge.target)
    ).length,
  };
}

export function regenerationPreservationEstimate(
  draft: WorkflowGraphDraft,
  mode: "rebuild" | "preserve_manual",
) {
  if (mode === "rebuild") {
    return {
      preservedManualNodeCount: 0,
      preservedManualEdgeCount: 0,
      preservedProtectedNodeCount: 0,
      preservedProtectedEdgeCount: 0,
    };
  }
  const protectedNodeIds = protectedNodeIdsForGraph(draft);
  const protectedEdgeIds = protectedEdgeIdsForGraph(draft);
  const preservedManualNodes = draft.nodes.filter(
    (node) => !isIntentGeneratedRecord(node) || protectedNodeIds.has(node.id),
  );
  const preservedManualNodeIds = new Set(preservedManualNodes.map((node) => node.id));
  const preservedManualEdges = draft.edges.filter(
    (edge) =>
      preservedManualNodeIds.has(edge.source) &&
      preservedManualNodeIds.has(edge.target),
  );
  return {
    preservedManualNodeCount: preservedManualNodes.length,
    preservedManualEdgeCount: preservedManualEdges.length,
    preservedProtectedNodeCount: protectedNodeIds.size,
    preservedProtectedEdgeCount: protectedEdgeIds.size,
  };
}
