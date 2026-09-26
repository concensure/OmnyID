// @locs-version: 1.0
import { defaultPolicy, runtimeHints } from "@/lib/workflowGraphDefaults";
import { isRecord } from "@/lib/eventDetail";
import { cloneJson, makeId } from "@/lib/workflowGraphUtils";
import { nodeSemanticRole } from "@/lib/workflowNodeSemanticRole";
import type {
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";
import type {
  SuggestedTemplateRuntimeLineage,
  TemplateScaffoldStep,
} from "@/lib/workflowReviewTypes";

export type TemplateSuggestionPreference = "accepted" | "dismissed";

function stringArrayFromMetadata(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function workflowTemplateSuggestionPreferenceMetadata(args: {
  metadata: Record<string, unknown>;
  preference: TemplateSuggestionPreference;
  reviewedAt: string;
  templateId: string;
}): Record<string, unknown> {
  const accepted = new Set(stringArrayFromMetadata(args.metadata["accepted_template_suggestions"]));
  const dismissed = new Set(stringArrayFromMetadata(args.metadata["dismissed_template_suggestions"]));
  if (args.preference === "accepted") {
    accepted.add(args.templateId);
    dismissed.delete(args.templateId);
  } else {
    dismissed.add(args.templateId);
    accepted.delete(args.templateId);
  }
  return {
    ...args.metadata,
    accepted_template_suggestions: [...accepted],
    dismissed_template_suggestions: [...dismissed],
    template_suggestion_reviewed_at: args.reviewedAt,
  };
}

export function workflowTemplateSuggestionScaffoldMetadata(args: {
  metadata: Record<string, unknown>;
  runtimeTemplateId?: string | null;
  templateId: string;
}): Record<string, unknown> {
  return {
    ...args.metadata,
    scaffolded_template_suggestions: Array.from(
      new Set([
        ...stringArrayFromMetadata(args.metadata["scaffolded_template_suggestions"]),
        args.templateId,
      ]),
    ),
    suggested_template_runtime_ids: Array.from(
      new Set([
        ...stringArrayFromMetadata(args.metadata["suggested_template_runtime_ids"]),
        ...(args.runtimeTemplateId ? [args.runtimeTemplateId] : []),
      ]),
    ),
    preset_template_ids: Array.from(
      new Set([
        ...stringArrayFromMetadata(args.metadata["preset_template_ids"]),
        ...(args.runtimeTemplateId ? [args.runtimeTemplateId] : []),
      ]),
    ),
  };
}

export function workflowPresetTemplateMetadata(args: {
  metadata: Record<string, unknown>;
  templateId: string;
}): Record<string, unknown> {
  return {
    ...args.metadata,
    preset_template_ids: Array.from(
      new Set([
        ...stringArrayFromMetadata(args.metadata["preset_template_ids"]),
        args.templateId,
      ]),
    ),
  };
}

export function workflowTemplateSuggestionAcceptedFeedback(args: {
  insertedCount: number;
  title: string;
}): string {
  return args.insertedCount > 0
    ? `Marked ${args.title} as the preferred reliable template and scaffolded ${args.insertedCount} supporting node${args.insertedCount === 1 ? "" : "s"}.`
    : `Marked ${args.title} as the preferred reliable template while keeping the graph customizable.`;
}

export function workflowTemplateSuggestionDismissedFeedback(title: string): string {
  return `Kept the custom graph and dismissed the ${title} template suggestion for this draft.`;
}

export function scaffoldNodeFromTemplateStep(
  step: TemplateScaffoldStep,
  position: { x: number; y: number },
): WorkflowNodeDraft {
  const config = cloneJson(step.config);
  if (step.kind === "approval" && isRecord(config)) {
    const approvalConfig = config;
    if (typeof approvalConfig.decision_point_id !== "string" || !approvalConfig.decision_point_id) {
      approvalConfig.decision_point_id = makeId("dp");
    }
  }
  return {
    id: makeId("node"),
    kind: step.kind,
    label: step.label,
    description: step.description,
    position,
    config,
    policy: defaultPolicy(),
    prompt: undefined,
    hidden_runtime_nodes: runtimeHints(step.kind),
    metadata: {
      semantic_role: step.semanticRole,
      scaffolded_from_template_suggestion: true,
    },
  };
}

export function workflowGraphAfterTemplateSuggestionScaffold(args: {
  draft: WorkflowGraphDraft;
  matchedNodeIds: readonly string[];
  runtimeLineage?: SuggestedTemplateRuntimeLineage | null;
  steps: readonly TemplateScaffoldStep[];
  templateId: string;
}): {
  graph: WorkflowGraphDraft;
  insertedCount: number;
} {
  const matchedNodes = args.matchedNodeIds
    .map((id) => args.draft.nodes.find((node) => node.id === id))
    .filter((node): node is WorkflowNodeDraft => Boolean(node));
  if (matchedNodes.length < 2) {
    return { graph: args.draft, insertedCount: 0 };
  }

  const sourceNode = matchedNodes[0];
  const targetNode = matchedNodes[matchedNodes.length - 1];
  const existingRoles = new Set(
    args.draft.nodes
      .map((node) => nodeSemanticRole(node))
      .filter((value): value is string => Boolean(value)),
  );
  const nodesToInsert = args.steps
    .filter((step) => !existingRoles.has(step.semanticRole))
    .map((step, index, filteredSteps) => {
      const ratio = (index + 1) / (filteredSteps.length + 1);
      return scaffoldNodeFromTemplateStep(step, {
        x: sourceNode.position.x + (targetNode.position.x - sourceNode.position.x) * ratio,
        y: sourceNode.position.y + (targetNode.position.y - sourceNode.position.y) * ratio - 56,
      });
    });

  if (nodesToInsert.length === 0 && !args.runtimeLineage) {
    return { graph: args.draft, insertedCount: 0 };
  }

  const directEdgeIndex = args.draft.edges.findIndex(
    (edge) => edge.source === sourceNode.id && edge.target === targetNode.id,
  );
  const chain = [sourceNode.id, ...nodesToInsert.map((node) => node.id), targetNode.id];
  const edgesWithoutDirect = nodesToInsert.length > 0 && directEdgeIndex >= 0
    ? args.draft.edges.filter((_, index) => index !== directEdgeIndex)
    : args.draft.edges;
  const nextEdges = [...edgesWithoutDirect];
  if (nodesToInsert.length > 0) {
    for (let index = 0; index < chain.length - 1; index += 1) {
      const source = chain[index];
      const target = chain[index + 1];
      if (!nextEdges.some((edge) => edge.source === source && edge.target === target)) {
        nextEdges.push({
          id: makeId("edge"),
          source,
          target,
          metadata: {
            scaffolded_from_template_suggestion: args.templateId,
          },
        });
      }
    }
  }

  let nextNodes = [...args.draft.nodes, ...nodesToInsert];
  let nextTemplateBindings = args.draft.template_bindings.map((binding) => ({
    ...binding,
    node_ids: [...binding.node_ids],
    metadata: { ...binding.metadata },
  }));
  if (args.runtimeLineage) {
    const slotSequence = args.runtimeLineage.slotSequence.slice(0, chain.length);
    const relevantNodeIds = new Set(chain);
    nextTemplateBindings = nextTemplateBindings.filter((binding) =>
      !binding.node_ids.some((nodeId) => relevantNodeIds.has(nodeId)),
    );
    chain.forEach((nodeId, index) => {
      const slotName = slotSequence[index] ?? slotSequence[slotSequence.length - 1] ?? "finalize_slot";
      nextTemplateBindings.push({
        template_id: args.runtimeLineage!.runtimeTemplateId,
        slot_name: slotName,
        node_ids: [nodeId],
        metadata: {
          generated_by: "template_suggestion",
          workflow_family: args.templateId,
        },
      });
      nextNodes = nextNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              metadata: {
                ...node.metadata,
                template_id: args.runtimeLineage!.runtimeTemplateId,
                template_slot: slotName,
                template_lineage_source: "template_suggestion",
                suggested_workflow_family: args.templateId,
              },
            }
          : node,
      );
    });
  }

  return {
    graph: {
      ...args.draft,
      nodes: nextNodes,
      edges: nextEdges,
      template_bindings: nextTemplateBindings,
      metadata: workflowTemplateSuggestionScaffoldMetadata({
        metadata: args.draft.metadata,
        templateId: args.templateId,
        runtimeTemplateId: args.runtimeLineage?.runtimeTemplateId ?? null,
      }),
    },
    insertedCount: nodesToInsert.length,
  };
}
