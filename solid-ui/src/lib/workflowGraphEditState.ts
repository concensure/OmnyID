// @locs-version: 1.0
import type {
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";
import { titleCase } from "@/lib/workflowGraphCopy";
import { defaultConfig, defaultPolicy, runtimeHints } from "@/lib/workflowGraphDefaults";
import { cloneJson } from "@/lib/workflowGraphUtils";
import { workflowPresetTemplateMetadata } from "@/lib/workflowTemplateScaffold";
import type { WorkflowIntentStarterSubgraph } from "@/lib/workflowIntentBuildState";
import type { SemanticStarterDefinition } from "@/lib/workflowReviewTypes";

export type WorkflowNodePromptPatchPayload = {
  op: "node_prompt_replace";
  node_id: string;
  prompt: NonNullable<WorkflowNodeDraft["prompt"]>;
};

export type WorkflowNodeMetaPatchPayload = {
  op: "node_meta_replace";
  node_id: string;
  label?: string;
  description?: string;
};

export type WorkflowNodeConfigPatchPayload = {
  op: "node_config_replace";
  node_id: string;
  config: Record<string, unknown>;
};

export type WorkflowNodePolicyPatchPayload = {
  op: "node_policy_replace";
  node_id: string;
  policy: Record<string, unknown>;
};

export type WorkflowNodeDeletePatchPayload = {
  op: "node_delete";
  node_id: string;
};

export type WorkflowEdgeAddPatchPayload = {
  op: "edge_add";
  source: string;
  target: string;
  condition_label?: string;
};

export type WorkflowEdgeAddRequest = {
  edge: WorkflowEdgeDraft;
  patch: WorkflowEdgeAddPatchPayload;
};

export type WorkflowEdgeMetaPatchPayload = {
  op: "edge_meta_replace";
  edge_id: string;
  condition_label?: string;
};

export type WorkflowRootTogglePatchPayload = {
  op: "root_toggle";
  node_id: string;
  root_enabled: boolean;
};

export function workflowNodeGridPosition(index: number): { x: number; y: number } {
  return {
    x: 80 + (index % 4) * 220,
    y: 80 + Math.floor(index / 4) * 120,
  };
}

export function workflowPrimitiveNode(
  kind: string,
  nextNodeId: string,
  index: number,
): WorkflowNodeDraft {
  return {
    id: nextNodeId,
    kind,
    label: `${titleCase(kind)} node`,
    description: `${titleCase(kind)} primitive node.`,
    position: workflowNodeGridPosition(index),
    config: defaultConfig(kind),
    policy: defaultPolicy(),
    prompt: undefined,
    hidden_runtime_nodes: runtimeHints(kind),
    metadata: {},
  };
}

export function workflowGraphAfterPrimitiveNodeAdd(
  draft: WorkflowGraphDraft,
  kind: string,
  nextNodeId: string,
): { graph: WorkflowGraphDraft; node: WorkflowNodeDraft } {
  const node = workflowPrimitiveNode(kind, nextNodeId, draft.nodes.length);
  return {
    graph: {
      ...draft,
      nodes: [...draft.nodes, node],
      presets: draft.presets,
      root_node_ids: draft.root_node_ids.length ? draft.root_node_ids : [node.id],
    },
    node,
  };
}

export function workflowSemanticNode(
  starter: SemanticStarterDefinition,
  nextNodeId: string,
  index: number,
): WorkflowNodeDraft {
  return {
    id: nextNodeId,
    kind: starter.nodeKind,
    label: starter.label,
    description: starter.description,
    position: workflowNodeGridPosition(index),
    config: cloneJson(starter.config),
    policy: defaultPolicy(),
    prompt: undefined,
    hidden_runtime_nodes: runtimeHints(starter.nodeKind),
    metadata: {
      semantic_node_kind: starter.id,
      semantic_role: starter.semanticRole,
      human_facing_node: true,
    },
  };
}

export function workflowGraphAfterSemanticNodeAdd(
  draft: WorkflowGraphDraft,
  starter: SemanticStarterDefinition,
  nextNodeId: string,
): { graph: WorkflowGraphDraft; node: WorkflowNodeDraft } {
  const node = workflowSemanticNode(starter, nextNodeId, draft.nodes.length);
  return {
    graph: {
      ...draft,
      nodes: [...draft.nodes, node],
      root_node_ids: draft.root_node_ids.length ? draft.root_node_ids : [node.id],
      metadata: {
        ...draft.metadata,
        semantic_builder_enabled: true,
      },
    },
    node,
  };
}

export function workflowGraphAfterPresetStarterAdd(
  draft: WorkflowGraphDraft,
  subgraph: WorkflowIntentStarterSubgraph,
): WorkflowGraphDraft {
  return {
    ...draft,
    nodes: [...draft.nodes, ...subgraph.nextNodes],
    edges: [...draft.edges, ...subgraph.nextEdges],
    presets: [...draft.presets, subgraph.presetRecord],
    template_id: draft.nodes.length === 0 ? subgraph.templateId : draft.template_id,
    template_version: draft.nodes.length === 0 ? "omnyid-subagent-template.v1" : draft.template_version,
    template_bindings: [...draft.template_bindings, ...subgraph.templateBindings],
    root_node_ids: draft.root_node_ids.length ? draft.root_node_ids : [subgraph.nextNodes[0].id],
    metadata: workflowPresetTemplateMetadata({
      metadata: draft.metadata,
      templateId: subgraph.templateId,
    }),
  };
}

export function workflowPresetStarterAddedFeedback(preset: string): string {
  return `Added ${titleCase(preset)} starter workflow.`;
}

export function workflowUnknownSemanticStarterFeedback(starterId: string): string {
  return `Unknown semantic starter: ${starterId}`;
}

export function workflowSemanticNodeAddedFeedback(label: string): string {
  return `Added ${label} semantic node.`;
}

export function workflowGraphAfterNodeUpdate(
  draft: WorkflowGraphDraft,
  nodeId: string,
  updater: (node: WorkflowNodeDraft) => WorkflowNodeDraft,
): WorkflowGraphDraft {
  return {
    ...draft,
    nodes: draft.nodes.map((node) => (node.id === nodeId ? updater(cloneJson(node)) : node)),
  };
}

export function workflowGraphAfterNodePosition(
  draft: WorkflowGraphDraft,
  nodeId: string,
  position: WorkflowNodeDraft["position"],
): WorkflowGraphDraft {
  return workflowGraphAfterNodeUpdate(draft, nodeId, (node) => ({ ...node, position }));
}

export function workflowGraphAfterNodeConfig(
  draft: WorkflowGraphDraft,
  nodeId: string,
  config: Record<string, unknown>,
): WorkflowGraphDraft {
  return workflowGraphAfterNodeUpdate(draft, nodeId, (node) => ({ ...node, config }));
}

export function workflowGraphAfterNodePolicy(
  draft: WorkflowGraphDraft,
  nodeId: string,
  policy: Record<string, unknown>,
): WorkflowGraphDraft {
  return workflowGraphAfterNodeUpdate(draft, nodeId, (node) => ({ ...node, policy }));
}

export function workflowGraphAfterNodePrompt(
  draft: WorkflowGraphDraft,
  nodeId: string,
  prompt: WorkflowNodeDraft["prompt"],
): WorkflowGraphDraft {
  return workflowGraphAfterNodeUpdate(draft, nodeId, (node) => ({ ...node, prompt }));
}

export function workflowGraphAfterNodeMetaPatch(
  draft: WorkflowGraphDraft,
  nodeId: string,
  fields: Pick<Partial<WorkflowNodeDraft>, "description" | "label">,
): WorkflowGraphDraft {
  return workflowGraphAfterNodeUpdate(draft, nodeId, (node) => ({ ...node, ...fields }));
}

export function workflowSelectedNodePromptPatchPayload(
  nodeId: string | null | undefined,
  prompt: NonNullable<WorkflowNodeDraft["prompt"]>,
): WorkflowNodePromptPatchPayload | null {
  return nodeId ? { op: "node_prompt_replace", node_id: nodeId, prompt } : null;
}

export function workflowSelectedNodeMetaPatchPayload(
  nodeId: string | null | undefined,
  fields: Pick<Partial<WorkflowNodeDraft>, "description" | "label">,
): WorkflowNodeMetaPatchPayload | null {
  return nodeId ? { op: "node_meta_replace", node_id: nodeId, ...fields } : null;
}

export function workflowSelectedNodeConfigPatchPayload(
  nodeId: string | null | undefined,
  config: Record<string, unknown>,
): WorkflowNodeConfigPatchPayload | null {
  return nodeId ? { op: "node_config_replace", node_id: nodeId, config } : null;
}

export function workflowSelectedNodePolicyPatchPayload(
  nodeId: string | null | undefined,
  policy: Record<string, unknown>,
): WorkflowNodePolicyPatchPayload | null {
  return nodeId ? { op: "node_policy_replace", node_id: nodeId, policy } : null;
}

export function workflowSelectedNodeDeletePatchPayload(
  nodeId: string | null | undefined,
): WorkflowNodeDeletePatchPayload | null {
  return nodeId ? { op: "node_delete", node_id: nodeId } : null;
}

function workflowNodeRecordText(record?: Record<string, unknown> | null): string {
  return JSON.stringify(record ?? {}, null, 2);
}

export function workflowNodeConfigText(config?: Record<string, unknown> | null): string {
  return workflowNodeRecordText(config);
}

export function workflowNodePolicyText(policy?: Record<string, unknown> | null): string {
  return workflowNodeRecordText(policy);
}

export function workflowSelectedNodeEditorText(
  node?: Pick<WorkflowNodeDraft, "config" | "policy"> | null,
): { configText: string; policyText: string } {
  return {
    configText: workflowNodeConfigText(node?.config),
    policyText: workflowNodePolicyText(node?.policy),
  };
}

export function workflowGraphAfterNodeDelete(
  draft: WorkflowGraphDraft,
  nodeId: string,
): WorkflowGraphDraft {
  return {
    ...draft,
    nodes: draft.nodes.filter((node) => node.id !== nodeId),
    edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    root_node_ids: draft.root_node_ids.filter((root) => root !== nodeId),
  };
}

export function workflowDuplicatedNode(
  source: WorkflowNodeDraft,
  nextNodeId: string,
  offset = 80,
): WorkflowNodeDraft {
  return {
    ...source,
    id: nextNodeId,
    label: `${source.label} copy`,
    position: {
      x: source.position.x + offset,
      y: source.position.y + offset,
    },
  };
}

export function workflowGraphAfterNodeDuplicate(
  draft: WorkflowGraphDraft,
  sourceNodeId: string,
  nextNodeId: string,
): { graph: WorkflowGraphDraft; duplicatedNode: WorkflowNodeDraft | null } {
  const source = draft.nodes.find((node) => node.id === sourceNodeId);
  if (!source) return { graph: draft, duplicatedNode: null };
  const duplicatedNode = workflowDuplicatedNode(source, nextNodeId);
  return {
    graph: {
      ...draft,
      nodes: [...draft.nodes, duplicatedNode],
    },
    duplicatedNode,
  };
}

export function workflowGraphAfterEdgeAdd(
  draft: WorkflowGraphDraft,
  edge: WorkflowEdgeDraft,
): WorkflowGraphDraft {
  if (draft.edges.some((candidate) => candidate.source === edge.source && candidate.target === edge.target)) {
    return draft;
  }
  return {
    ...draft,
    edges: [...draft.edges, edge],
  };
}

export function workflowEdgeConditionLabelValue(conditionLabel: string): string | undefined {
  return conditionLabel.trim() || undefined;
}

export function workflowEdgeAddRequest(args: {
  source: string | null | undefined;
  target: string | null | undefined;
  conditionLabel: string;
  edgeId: string;
}): WorkflowEdgeAddRequest | null {
  if (!args.source || !args.target || args.source === args.target) return null;
  const conditionLabel = workflowEdgeConditionLabelValue(args.conditionLabel);
  return {
    edge: {
      id: args.edgeId,
      source: args.source,
      target: args.target,
      condition_label: conditionLabel,
      metadata: {},
    },
    patch: {
      op: "edge_add",
      source: args.source,
      target: args.target,
      condition_label: conditionLabel,
    },
  };
}

export function workflowEdgeAddPreflightFeedback(
  request: WorkflowEdgeAddRequest | null,
): string | null {
  return request ? null : "Choose two different nodes to create an edge.";
}

export function workflowEdgeAddedFeedback(): string {
  return "Added edge.";
}

export function workflowPatchIrInvalidatedFeedback(irInvalidated: boolean): string | null {
  return irInvalidated
    ? "Workflow graph updated. Compiled IR was cleared and should be rebuilt before deploy."
    : null;
}

export function workflowGraphAfterEdgeConditionLabel(
  draft: WorkflowGraphDraft,
  edgeId: string,
  conditionLabel: string,
): WorkflowGraphDraft {
  const trimmedLabel = workflowEdgeConditionLabelValue(conditionLabel);
  return {
    ...draft,
    edges: draft.edges.map((edge) =>
      edge.id === edgeId
        ? { ...edge, condition_label: trimmedLabel }
        : edge,
    ),
  };
}

export function workflowEdgeMetaPatchPayload(
  edgeId: string,
  conditionLabel: string,
): WorkflowEdgeMetaPatchPayload {
  return {
    op: "edge_meta_replace",
    edge_id: edgeId,
    condition_label: workflowEdgeConditionLabelValue(conditionLabel),
  };
}

export function workflowRootNodeIdsAfterToggle(
  rootNodeIds: readonly string[],
  nodeId: string,
  checked: boolean,
): string[] {
  if (checked) return [...new Set([...rootNodeIds, nodeId])];
  return rootNodeIds.filter((root) => root !== nodeId);
}

export function workflowGraphAfterRootToggle(
  draft: WorkflowGraphDraft,
  nodeId: string,
  checked: boolean,
): WorkflowGraphDraft {
  return {
    ...draft,
    root_node_ids: workflowRootNodeIdsAfterToggle(draft.root_node_ids, nodeId, checked),
  };
}

export function workflowRootTogglePatchPayload(
  nodeId: string,
  checked: boolean,
): WorkflowRootTogglePatchPayload {
  return { op: "root_toggle", node_id: nodeId, root_enabled: checked };
}
