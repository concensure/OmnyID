// @locs-version: 1.0
import {
  expandWorkflowIntent,
  presetDefaultTriggerConfig,
  suggestWorkflowTitleFromIntent,
  type PresetNodeKind,
} from "afp-ts/workflows";
import type { SavedWorkflow } from "@/lib/api";
import { defaultPolicy, runtimeHints } from "@/lib/workflowGraphDefaults";
import { makeNewWorkflow, normalizeGraph } from "@/lib/workflowGraphDraftState";
import { titleCase } from "@/lib/workflowGraphCopy";
import { cloneJson, makeId } from "@/lib/workflowGraphUtils";
import {
  presetStarterBlueprints,
  presetTemplateId,
} from "@/lib/workflowPresetScaffold";
import {
  isIntentGeneratedRecord,
  nodeRegenerationLocked,
  protectedNodeIdsForGraph,
} from "@/lib/workflowRegenerationState";
import type {
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";

export type WorkflowIntentStarterSubgraph = {
  templateId: string;
  nextNodes: WorkflowNodeDraft[];
  nextEdges: WorkflowEdgeDraft[];
  presetRecord: Record<string, unknown>;
  templateBindings: WorkflowGraphDraft["template_bindings"];
};

export function workflowIntentStarterSubgraph(
  preset: PresetNodeKind,
  index: number,
  source: "palette" | "intent_builder" = "palette",
): WorkflowIntentStarterSubgraph {
  const blueprints = presetStarterBlueprints(preset);
  const templateId = presetTemplateId(preset);
  const baseX = 80 + (index % 3) * 280;
  const baseY = 80 + Math.floor(index / 3) * 180;
  const nextNodes = blueprints.map((blueprint, blueprintIndex) => {
    const id = makeId("node");
    return {
      id,
      kind: blueprint.kind,
      label: blueprint.label,
      description: blueprint.description,
      position: {
        x: baseX + blueprintIndex * 220,
        y: baseY + (blueprint.kind === "approval" ? 30 : 0),
      },
      config: cloneJson(blueprint.config),
      policy: blueprint.policy ? cloneJson(blueprint.policy) : defaultPolicy(),
      prompt: blueprint.prompt ? cloneJson(blueprint.prompt) : undefined,
      hidden_runtime_nodes: runtimeHints(blueprint.runtime_kind_source ?? blueprint.kind),
      metadata: {
        preset_origin: preset,
        subgraph_seed: true,
        ...(source === "intent_builder" ? { generated_by: "intent_builder" } : {}),
        template_id: templateId,
        template_slot: blueprint.slot_name,
      },
    } satisfies WorkflowNodeDraft;
  });

  for (const node of nextNodes) {
    if (node.kind !== "approval") continue;
    const config = node.config;
    if (typeof config.decision_point_id !== "string" || !config.decision_point_id) {
      config.decision_point_id = makeId("dp");
    }
  }

  const nextEdges = nextNodes.slice(0, -1).map((nodeEntry, blueprintIndex) => ({
    id: makeId("edge"),
    source: nodeEntry.id,
    target: nextNodes[blueprintIndex + 1].id,
    metadata: {
      preset_origin: preset,
      ...(source === "intent_builder" ? { generated_by: "intent_builder" } : {}),
    },
  } satisfies WorkflowEdgeDraft));

  const presetRecord = {
    preset_id: makeId("preset"),
    preset_kind: preset,
    label: titleCase(preset),
    root_node_ids: [nextNodes[0].id],
    favorite_eligible: true,
    parameter_schema: {},
    template_id: templateId,
    metadata: source === "intent_builder" ? { generated_by: "intent_builder" } : {},
  };

  const templateBindings = nextNodes.map((nodeEntry, blueprintIndex) => ({
    template_id: templateId,
    slot_name: blueprints[blueprintIndex].slot_name,
    node_ids: [nodeEntry.id],
    metadata: {
      preset_kind: preset,
      subgraph_seed: true,
      ...(source === "intent_builder" ? { generated_by: "intent_builder" } : {}),
    },
  }));

  return {
    templateId,
    nextNodes,
    nextEdges,
    presetRecord,
    templateBindings,
  };
}

export function workflowGraphAfterNodeInsertedBetween(
  graphDraft: WorkflowGraphDraft,
  previousNodeId: string,
  nextNodeId: string,
  node: WorkflowNodeDraft,
  edgeLabel?: string,
): WorkflowGraphDraft {
  const edgeIndex = graphDraft.edges.findIndex((edge) => edge.source === previousNodeId && edge.target === nextNodeId);
  const edges = edgeIndex >= 0
    ? graphDraft.edges.filter((_, index) => index !== edgeIndex)
    : graphDraft.edges;
  return {
    ...graphDraft,
    nodes: [...graphDraft.nodes, node],
    edges: [
      ...edges,
      {
        id: makeId("edge"),
        source: previousNodeId,
        target: node.id,
        condition_label: edgeLabel,
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: makeId("edge"),
        source: node.id,
        target: nextNodeId,
        metadata: { generated_by: "intent_builder" },
      },
    ],
  };
}

export function workflowGraphAfterIntentAugmentation(
  graphDraft: WorkflowGraphDraft,
  intent: string,
  preset: PresetNodeKind,
  templateId: string,
): WorkflowGraphDraft {
  const expansion = expandWorkflowIntent(intent);
  let nextGraph: WorkflowGraphDraft = {
    ...graphDraft,
    nodes: graphDraft.nodes.map((node) => ({ ...node })),
    edges: graphDraft.edges.map((edge) => ({ ...edge })),
    template_bindings: graphDraft.template_bindings.map((binding) => ({ ...binding, node_ids: [...binding.node_ids] })),
    optimization_mode: expansion.optimization_mode,
  };

  if (expansion.public_output) {
    nextGraph = {
      ...nextGraph,
      nodes: nextGraph.nodes.map((node) =>
        node.kind === "agent"
          ? {
              ...node,
              policy: {
                ...node.policy,
                mask: "public",
              },
            }
          : node,
      ),
    };
  }

  if (expansion.needs_research_support && !nextGraph.nodes.some((node) => typeof node.config.capability_id === "string" && node.config.capability_id === "web_search")) {
    const firstToolOrTerminal = nextGraph.nodes.find((node) => node.kind === "tool" || node.kind === "termination");
    const firstAgent = nextGraph.nodes.find((node) => node.kind === "agent");
    if (firstToolOrTerminal && firstAgent && firstToolOrTerminal.id !== firstAgent.id) {
      const supportNode: WorkflowNodeDraft = {
        id: makeId("node"),
        kind: "tool",
        label: "Research Support",
        description: "Gather supporting web evidence for the described workflow.",
        position: {
          x: (firstAgent.position.x + firstToolOrTerminal.position.x) / 2,
          y: firstToolOrTerminal.position.y - 70,
        },
        config: { capability_id: "web_search", operation: "search", timeout_seconds: 120 },
        policy: defaultPolicy(),
        prompt: undefined,
        hidden_runtime_nodes: runtimeHints("tool"),
        metadata: {
          generated_by: "intent_builder",
          template_id: templateId,
          template_slot: "gather_slot",
        },
      };
      nextGraph = workflowGraphAfterNodeInsertedBetween(nextGraph, firstAgent.id, firstToolOrTerminal.id, supportNode);
      nextGraph = {
        ...nextGraph,
        template_bindings: [
          ...nextGraph.template_bindings,
          {
            template_id: templateId,
            slot_name: "gather_slot",
            node_ids: [supportNode.id],
            metadata: {
              preset_kind: preset,
              generated_by: "intent_builder",
              augmentation: "research_support",
            },
          },
        ],
      };
    }
  }

  if (expansion.requires_approval && !nextGraph.nodes.some((node) => node.kind === "approval")) {
    const terminalNode = [...nextGraph.nodes].reverse().find((node) => node.kind === "termination");
    const previousNode = terminalNode
      ? [...nextGraph.edges]
          .reverse()
          .find((edge) => edge.target === terminalNode.id)
          ?.source
      : undefined;
    if (terminalNode && previousNode) {
      const upstreamNode = nextGraph.nodes.find((node) => node.id === previousNode);
      if (upstreamNode) {
        const approvalNode: WorkflowNodeDraft = {
          id: makeId("node"),
          kind: "approval",
          label: "Human Review",
          description: "Pause for review before the workflow continues to its final output.",
          position: {
            x: (upstreamNode.position.x + terminalNode.position.x) / 2,
            y: terminalNode.position.y - 40,
          },
          config: {
            approval_reason: `Review the workflow before completing: ${intent}`,
            decision_point_id: makeId("dp"),
            options: [
              { option_id: "approve", label: "Approve", consequence_summary: "Continue to the final result." },
              { option_id: "hold", label: "Hold", consequence_summary: "Pause before any final action." },
            ],
          },
          policy: defaultPolicy(),
          prompt: undefined,
          hidden_runtime_nodes: runtimeHints("approval"),
          metadata: {
            generated_by: "intent_builder",
            template_id: templateId,
            template_slot: "approval_slot",
          },
        };
        nextGraph = workflowGraphAfterNodeInsertedBetween(nextGraph, upstreamNode.id, terminalNode.id, approvalNode);
        nextGraph = {
          ...nextGraph,
          template_bindings: [
            ...nextGraph.template_bindings,
            {
              template_id: templateId,
              slot_name: "approval_slot",
              node_ids: [approvalNode.id],
              metadata: {
                preset_kind: preset,
                generated_by: "intent_builder",
                augmentation: "approval_gate",
              },
            },
          ],
        };
      }
    }
  }

  if (expansion.needs_branching && !nextGraph.nodes.some((node) => node.kind === "condition")) {
    const firstAgent = nextGraph.nodes.find((node) => node.kind === "agent");
    const firstNonTriggerTarget = firstAgent
      ? nextGraph.edges.find((edge) => edge.source === firstAgent.id)?.target
      : undefined;
    const nextNode = firstNonTriggerTarget
      ? nextGraph.nodes.find((node) => node.id === firstNonTriggerTarget)
      : undefined;
    if (firstAgent && nextNode) {
      const conditionNode: WorkflowNodeDraft = {
        id: makeId("node"),
        kind: "condition",
        label: "Decision Split",
        description: "Branch between the preferred path and a fallback path from the described objective.",
        position: {
          x: (firstAgent.position.x + nextNode.position.x) / 2,
          y: nextNode.position.y - 20,
        },
        config: {
          expression: "preferred_option_available",
        },
        policy: defaultPolicy(),
        prompt: undefined,
        hidden_runtime_nodes: runtimeHints("condition"),
        metadata: {
          generated_by: "intent_builder",
          template_id: templateId,
          template_slot: "check_slot",
        },
      };
      nextGraph = workflowGraphAfterNodeInsertedBetween(nextGraph, firstAgent.id, nextNode.id, conditionNode, "success");
      const fallbackNode: WorkflowNodeDraft = {
        id: makeId("node"),
        kind: "termination",
        label: "Fallback Summary",
        description: "Return the fallback recommendation when the preferred route is not viable.",
        position: {
          x: conditionNode.position.x + 240,
          y: conditionNode.position.y + 120,
        },
        config: {
          output_kind: "chat_reply",
          final_schema: { workflow: preset, branch_outcome: "fallback" },
        },
        policy: defaultPolicy(),
        prompt: undefined,
        hidden_runtime_nodes: runtimeHints("termination"),
        metadata: {
          generated_by: "intent_builder",
          branch_label: "fallback",
        },
      };
      nextGraph = {
        ...nextGraph,
        nodes: [...nextGraph.nodes, fallbackNode],
        edges: [
          ...nextGraph.edges,
          {
            id: makeId("edge"),
            source: conditionNode.id,
            target: fallbackNode.id,
            condition_label: "fallback",
            metadata: {
              generated_by: "intent_builder",
            },
          },
        ],
        template_bindings: [
          ...nextGraph.template_bindings,
          {
            template_id: templateId,
            slot_name: "check_slot",
            node_ids: [conditionNode.id],
            metadata: {
              preset_kind: preset,
              generated_by: "intent_builder",
              augmentation: "branching",
            },
          },
        ],
      };
    }
  }

  return nextGraph;
}

export function workflowBuiltFromIntent(args: {
  intent: string;
  baseWorkflow?: SavedWorkflow | null;
  expansion?: ReturnType<typeof expandWorkflowIntent> | null;
  regenerationMode: "rebuild" | "preserve_manual";
  nowIso?: string;
}): SavedWorkflow {
  const expansion = args.expansion ?? expandWorkflowIntent(args.intent);
  const preset = expansion.preset_kind;
  const workflow = args.baseWorkflow ? cloneJson(args.baseWorkflow) : makeNewWorkflow();
  const draft = normalizeGraph(workflow);
  const triggerNode = { ...draft.nodes[0] };
  const subgraph = workflowIntentStarterSubgraph(preset, draft.nodes.length, "intent_builder");

  const defaultTriggerCfg = presetDefaultTriggerConfig(preset);
  triggerNode.label = "Intent trigger";
  triggerNode.description = "Start this generated workflow from a natural-language objective.";
  triggerNode.config = {
    ...triggerNode.config,
    ...defaultTriggerCfg,
    event_filter: {
      objective: args.intent,
    },
  };
  triggerNode.metadata = {
    ...triggerNode.metadata,
    generated_by: "intent_builder",
  };

  let nextGraph: WorkflowGraphDraft = {
    ...draft,
    title: suggestWorkflowTitleFromIntent(args.intent, preset),
    description: args.intent,
    nodes: [triggerNode, ...subgraph.nextNodes],
    edges: [
      {
        id: makeId("edge"),
        source: triggerNode.id,
        target: subgraph.nextNodes[0].id,
        metadata: {
          generated_by: "intent_builder",
        },
      },
      ...subgraph.nextEdges,
    ],
    presets: [subgraph.presetRecord],
    template_id: subgraph.templateId,
    template_version: "omnyid-subagent-template.v1",
    template_bindings: subgraph.templateBindings,
    root_node_ids: [triggerNode.id],
    metadata: {
      ...draft.metadata,
      origin: "workflow_builder_describe_intent",
      source_intent: args.intent,
      inferred_preset: preset,
      intent_expansion: expansion,
      preset_template_ids: [subgraph.templateId],
    },
  };
  nextGraph = workflowGraphAfterIntentAugmentation(nextGraph, args.intent, preset, subgraph.templateId);

  if (args.baseWorkflow && args.regenerationMode === "preserve_manual") {
    const baseGraph = normalizeGraph(args.baseWorkflow);
    const preservedReachableNodeIds = protectedNodeIdsForGraph(baseGraph);
    for (const node of baseGraph.nodes) {
      if (!isIntentGeneratedRecord(node)) {
        preservedReachableNodeIds.add(node.id);
      }
    }
    const preservedNodes = baseGraph.nodes.filter((node) => preservedReachableNodeIds.has(node.id));
    const preservedNodeIds = new Set(preservedNodes.map((node) => node.id));
    const preservedEdges = baseGraph.edges.filter((edge) => preservedNodeIds.has(edge.source) && preservedNodeIds.has(edge.target));
    const preservedPresets = baseGraph.presets.filter((presetRecord) => !isIntentGeneratedRecord(presetRecord));
    const preservedTemplateBindings = baseGraph.template_bindings.filter((binding) => !isIntentGeneratedRecord(binding));
    const preservedLockedNodes = preservedNodes.filter((node) => nodeRegenerationLocked(node)).length;

    nextGraph = {
      ...nextGraph,
      nodes: [...nextGraph.nodes, ...preservedNodes],
      edges: [...nextGraph.edges, ...preservedEdges],
      presets: [...nextGraph.presets, ...preservedPresets],
      template_bindings: [...nextGraph.template_bindings, ...preservedTemplateBindings],
      metadata: {
        ...nextGraph.metadata,
        preserved_manual_nodes: preservedNodes.length,
        preserved_manual_edges: preservedEdges.length,
        preserved_locked_nodes: preservedLockedNodes,
        regeneration_mode: "preserve_manual",
      },
    };
  } else {
    nextGraph = {
      ...nextGraph,
      metadata: {
        ...nextGraph.metadata,
        regeneration_mode: "rebuild",
      },
    };
  }

  return {
    ...workflow,
    workflow_id: workflow.workflow_id,
    owner_user_id: workflow.owner_user_id,
    title: nextGraph.title,
    description: nextGraph.description,
    preset_kinds: [preset],
    graph: nextGraph,
    latest_ir: null,
    trigger_readiness_summary: null,
    updated_at: args.nowIso ?? new Date().toISOString(),
  };
}
