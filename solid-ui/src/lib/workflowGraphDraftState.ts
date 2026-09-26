// @locs-version: 1.0
import type { SavedWorkflow } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";
import { defaultConfig, defaultPolicy, runtimeHints } from "@/lib/workflowGraphDefaults";
import { cloneJson, makeId } from "@/lib/workflowGraphUtils";
import type {
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";

export function normalizeGraph(workflow: SavedWorkflow): WorkflowGraphDraft {
  const graph = cloneJson(workflow.graph as Partial<WorkflowGraphDraft>);
  const rawTemplateBindings = Array.isArray(graph.template_bindings) ? graph.template_bindings : [];
  return {
    version: graph.version ?? "omnyid-workflow.v1",
    workflow_id: graph.workflow_id ?? workflow.workflow_id,
    title: graph.title ?? workflow.title,
    description: graph.description ?? workflow.description ?? undefined,
    status: graph.status ?? "draft",
    environment: graph.environment === "prod" ? "prod" : "dev",
    owner_user_id: graph.owner_user_id ?? workflow.owner_user_id,
    root_node_ids: Array.isArray(graph.root_node_ids) ? graph.root_node_ids.filter((id): id is string => typeof id === "string") : [],
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map((node) => ({
      id: node.id ?? makeId("node"),
      kind: node.kind ?? "agent",
      label: node.label ?? "Workflow node",
      description: node.description,
      position: {
        x: typeof node.position?.x === "number" ? node.position.x : 80,
        y: typeof node.position?.y === "number" ? node.position.y : 80,
      },
      config: typeof node.config === "object" && node.config ? node.config : defaultConfig(node.kind ?? "agent"),
      policy: typeof node.policy === "object" && node.policy ? node.policy : defaultPolicy(),
      prompt: typeof node.prompt === "object" && node.prompt ? node.prompt : undefined,
      hidden_runtime_nodes: Array.isArray(node.hidden_runtime_nodes) ? node.hidden_runtime_nodes.filter((v): v is string => typeof v === "string") : runtimeHints(node.kind ?? "agent"),
      metadata: typeof node.metadata === "object" && node.metadata ? node.metadata : {},
    })) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map((edge) => ({
      id: edge.id ?? makeId("edge"),
      source: edge.source ?? "",
      target: edge.target ?? "",
      condition_label: typeof edge.condition_label === "string" ? edge.condition_label : undefined,
      metadata: typeof edge.metadata === "object" && edge.metadata ? edge.metadata : {},
    })) : [],
    presets: Array.isArray(graph.presets) ? graph.presets : [],
    template_id: typeof graph.template_id === "string" ? graph.template_id : undefined,
    template_version: typeof graph.template_version === "string" ? graph.template_version : undefined,
    instance_inputs:
      graph.instance_inputs && typeof graph.instance_inputs === "object"
        ? {
            family_id: typeof graph.instance_inputs.family_id === "string" ? graph.instance_inputs.family_id : undefined,
            family_workflow_id: typeof graph.instance_inputs.family_workflow_id === "string" ? graph.instance_inputs.family_workflow_id : undefined,
            family_asset_workflow_id:
              typeof graph.instance_inputs.family_asset_workflow_id === "string"
                ? graph.instance_inputs.family_asset_workflow_id
                : undefined,
            instance_workflow_id:
              typeof graph.instance_inputs.instance_workflow_id === "string"
                ? graph.instance_inputs.instance_workflow_id
                : undefined,
            values:
              isRecord(graph.instance_inputs.values)
                ? Object.fromEntries(
                    Object.entries(graph.instance_inputs.values)
                      .filter(([, value]) => typeof value === "string")
                      .map(([key, value]) => [key, value as string]),
                  )
                : {},
          }
        : undefined,
    template_bindings: rawTemplateBindings
      .map((binding) => {
        const raw = isRecord(binding) ? binding : null;
        return {
          template_id: typeof raw?.template_id === "string" ? raw.template_id : "",
          slot_name: typeof raw?.slot_name === "string" ? raw.slot_name : "",
          node_ids: Array.isArray(raw?.node_ids) ? raw.node_ids.filter((value): value is string => typeof value === "string") : [],
          metadata: isRecord(raw?.metadata) ? raw.metadata : {},
        };
      })
      .filter((binding) => binding.template_id && binding.slot_name && binding.node_ids.length > 0),
    optimization_mode: graph.optimization_mode === "speed" || graph.optimization_mode === "cost" ? graph.optimization_mode : "balanced",
    metadata: typeof graph.metadata === "object" && graph.metadata ? graph.metadata : {},
  };
}

export function makeNewWorkflow(): SavedWorkflow {
  const node: WorkflowNodeDraft = {
    id: makeId("node"),
    kind: "trigger",
    label: "Manual start",
    description: "Start this workflow manually.",
    position: { x: 120, y: 120 },
    config: defaultConfig("trigger"),
    policy: defaultPolicy(),
    hidden_runtime_nodes: runtimeHints("trigger"),
    metadata: {},
  };
  const graph: WorkflowGraphDraft = {
    version: "omnyid-workflow.v1",
    workflow_id: makeId("wf"),
    title: "Untitled workflow",
    description: "A new visual workflow draft.",
    status: "draft",
    environment: "dev",
    owner_user_id: "pending",
    root_node_ids: [node.id],
    nodes: [node],
    edges: [],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: { origin: "workflow_builder_new_draft" },
  };
  const now = new Date().toISOString();
  return {
    workflow_id: graph.workflow_id,
    owner_user_id: graph.owner_user_id,
    title: graph.title,
    description: graph.description,
    favorite: false,
    preset_kinds: [],
    graph,
    latest_ir: null,
    trigger_readiness_summary: null,
    created_at: now,
    updated_at: now,
    archived_at: null,
  };
}

export function workflowInitialSelectedNodeId(
  graph: WorkflowGraphDraft,
  mode: "first" | "prefer_second" = "first",
): string | null {
  if (mode === "prefer_second") {
    return graph.nodes[1]?.id ?? graph.nodes[0]?.id ?? null;
  }
  return graph.nodes[0]?.id ?? null;
}

export function workflowNewDraftFeedback(): string {
  return "Started a new workflow draft.";
}
