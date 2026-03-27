import { For, Show, createEffect, createResource, createSignal, onCleanup, onMount } from "solid-js";
import {
  compileWorkflow,
  getWorkflow,
  listWorkflowDeployments,
  listWorkflowRuns,
  listWorkflows,
  patchWorkflow,
  runWorkflowAction,
  saveWorkflow,
  startWorkflowRun,
  validateWorkflow,
  type WorkflowDeployment,
  type WorkflowRun,
  type SavedWorkflow,
  type WorkflowValidationResponse,
} from "@/lib/api";

type WorkflowNodeDraft = {
  id: string;
  kind: string;
  label: string;
  description?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  policy: Record<string, unknown>;
  prompt?: {
    system_prompt?: string;
    instruction_prompt?: string;
    user_editable?: boolean;
  };
  hidden_runtime_nodes: string[];
  metadata: Record<string, unknown>;
};

type WorkflowEdgeDraft = {
  id: string;
  source: string;
  target: string;
  metadata: Record<string, unknown>;
};

type WorkflowGraphDraft = {
  version: string;
  workflow_id: string;
  title: string;
  description?: string;
  status: string;
  environment: string;
  owner_user_id: string;
  root_node_ids: string[];
  nodes: WorkflowNodeDraft[];
  edges: WorkflowEdgeDraft[];
  presets: Array<Record<string, unknown>>;
  optimization_mode: string;
  metadata: Record<string, unknown>;
};

const PRIMITIVES = ["trigger", "condition", "transform", "tool", "agent", "delegation", "policy", "approval", "merge", "termination"] as const;
const PRESETS = [
  "email_guardian",
  "calendar_coordinator",
  "receipt_tracker",
  "study_planner",
  "research_assistant",
  "finance_guardian",
  "travel_booker",
  "content_publisher",
] as const;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function runtimeHints(kind: string): string[] {
  switch (kind) {
    case "trigger": return ["goal_intake"];
    case "condition": return ["ambiguity"];
    case "transform": return ["context"];
    case "tool": return ["executor"];
    case "delegation": return ["capability_router"];
    case "policy": return ["policy_runtime"];
    case "approval": return ["approval_runtime"];
    case "merge": return ["merge_runtime"];
    case "termination": return ["termination_runtime"];
    default: return ["plan", "reflection"];
  }
}

function defaultPolicy(): Record<string, unknown> {
  return {
    mask: "private",
    approval_mode: "none",
    allowed_tools: [],
    allowed_capabilities: [],
    max_steps: 1,
    max_cost_cents: 0,
    outbound_allowlist: [],
  };
}

function defaultConfig(kind: string, preset?: string): Record<string, unknown> {
  if (preset) {
    return {
      objective: `Run the ${titleCase(preset)} preset responsibly.`,
      preset_kind: preset,
      memory_scope: "thread_summary",
    };
  }
  switch (kind) {
    case "trigger": return { trigger_kind: "manual", event_filter: {} };
    case "condition": return { expression: "true" };
    case "transform": return { transform_kind: "template", output_contract: {} };
    case "tool": return { capability_id: "web_search", operation: "search", timeout_seconds: 60 };
    case "delegation": return { target_role: "specialist", handoff_contract: {} };
    case "policy": return { enforce_before_node_ids: [] };
    case "approval":
      return {
        approval_reason: "Human review required",
        decision_point_id: makeId("dp"),
        options: [
          { option_id: "approve", label: "Approve", consequence_summary: "Continue the workflow." },
          { option_id: "cancel", label: "Cancel", consequence_summary: "Stop execution." },
        ],
      };
    case "merge": return { merge_strategy: "structured_merge" };
    case "termination": return { output_kind: "chat_reply", final_schema: {} };
    default: return { objective: "Handle this workflow step", memory_scope: "thread_summary" };
  }
}

function normalizeGraph(workflow: SavedWorkflow): WorkflowGraphDraft {
  const graph = cloneJson(workflow.graph as Partial<WorkflowGraphDraft>);
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
      metadata: typeof edge.metadata === "object" && edge.metadata ? edge.metadata : {},
    })) : [],
    presets: Array.isArray(graph.presets) ? graph.presets : [],
    optimization_mode: graph.optimization_mode === "speed" || graph.optimization_mode === "cost" ? graph.optimization_mode : "balanced",
    metadata: typeof graph.metadata === "object" && graph.metadata ? graph.metadata : {},
  };
}

function makeNewWorkflow(): SavedWorkflow {
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
    created_at: now,
    updated_at: now,
    archived_at: null,
  };
}

function edgeLine(graph: WorkflowGraphDraft, edge: WorkflowEdgeDraft) {
  const source = graph.nodes.find((node) => node.id === edge.source);
  const target = graph.nodes.find((node) => node.id === edge.target);
  if (!source || !target) return null;
  return {
    x1: source.position.x + 90,
    y1: source.position.y + 32,
    x2: target.position.x + 90,
    y2: target.position.y + 32,
  };
}

function runNodeStatuses(run: WorkflowRun | null): Map<string, string> {
  const statuses = new Map<string, string>();
  if (!run || !Array.isArray(run.timeline)) return statuses;
  for (const step of run.timeline) {
    const nodeId = typeof step.node_id === "string" ? step.node_id : null;
    const status = typeof step.status === "string" ? step.status : null;
    if (nodeId && status) statuses.set(nodeId, status);
  }
  return statuses;
}

function runStepOrder(run: WorkflowRun | null): Map<string, number> {
  const order = new Map<string, number>();
  if (!run || !Array.isArray(run.timeline)) return order;
  for (const [index, step] of run.timeline.entries()) {
    const nodeId = typeof step.node_id === "string" ? step.node_id : null;
    if (nodeId && !order.has(nodeId)) order.set(nodeId, index + 1);
  }
  return order;
}

function runEdgeStates(
  graph: WorkflowGraphDraft | null,
  run: WorkflowRun | null,
): Map<string, "completed" | "simulated"> {
  const states = new Map<string, "completed" | "simulated">();
  if (!graph || !run || !Array.isArray(run.timeline)) return states;
  const steps = run.timeline
    .map((step) => ({
      nodeId: typeof step.node_id === "string" ? step.node_id : null,
      status: typeof step.status === "string" ? step.status : null,
    }))
    .filter((step): step is { nodeId: string; status: string | null } => Boolean(step.nodeId));

  for (let index = 0; index < steps.length - 1; index += 1) {
    const current = steps[index];
    const next = steps[index + 1];
    const edge = graph.edges.find((candidate) => candidate.source === current.nodeId && candidate.target === next.nodeId);
    if (!edge) continue;
    const state =
      current.status === "simulated" || next.status === "simulated" ? "simulated" : "completed";
    states.set(edge.id, state);
  }
  return states;
}

function summary(workflow: SavedWorkflow) {
  const graph = workflow.graph as { nodes?: unknown[]; edges?: unknown[]; status?: string };
  return {
    nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
    status: typeof graph.status === "string" ? graph.status : "draft",
  };
}

export function WorkflowsView() {
  const [selectedWorkflowId, setSelectedWorkflowId] = createSignal<string | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = createSignal<SavedWorkflow | null>(null);
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [selectedRunId, setSelectedRunId] = createSignal<string | null>(null);
  const [feedback, setFeedback] = createSignal("");
  const [busyAction, setBusyAction] = createSignal<string | null>(null);
  const [liveRefreshUntil, setLiveRefreshUntil] = createSignal(0);
  const [validationResult, setValidationResult] = createSignal<WorkflowValidationResponse | null>(null);
  const [deploymentHistory, setDeploymentHistory] = createSignal<WorkflowDeployment[]>([]);
  const [runHistory, setRunHistory] = createSignal<WorkflowRun[]>([]);
  const [configText, setConfigText] = createSignal("{}");
  const [policyText, setPolicyText] = createSignal("{}");
  const [edgeSource, setEdgeSource] = createSignal("");
  const [edgeTarget, setEdgeTarget] = createSignal("");
  let canvasRef!: HTMLDivElement;
  let dragState: { nodeId: string; offsetX: number; offsetY: number } | null = null;

  const [workflows, { mutate, refetch }] = createResource(async () => {
    const response = await listWorkflows(false, 50);
    return response.workflows;
  });

  const graph = () => {
    const workflow = currentWorkflow();
    return workflow ? normalizeGraph(workflow) : null;
  };

  const selectedNode = () => {
    const draft = graph();
    const nodeId = selectedNodeId();
    return draft?.nodes.find((node) => node.id === nodeId) ?? null;
  };

  const selectedRun = () => {
    const runId = selectedRunId();
    return runHistory().find((run) => run.run_id === runId) ?? runHistory()[0] ?? null;
  };
  const selectedRunStatuses = () => runNodeStatuses(selectedRun());
  const selectedRunStepOrder = () => runStepOrder(selectedRun());
  const selectedRunEdgeStates = () => runEdgeStates(graph(), selectedRun());
  const workflowInteractionLocked = () =>
    ["compile", "deploy", "run", "dry_run", "replay", "rollback"].includes(busyAction() ?? "");
  const workflowExecutionRefreshing = () =>
    ["deploy", "run", "dry_run", "replay", "rollback"].includes(busyAction() ?? "") || liveRefreshUntil() > Date.now();
  const workflowInteractionLockLabel = () => {
    const action = busyAction();
    switch (action) {
      case "compile":
        return "Compiling workflow IR";
      case "deploy":
        return "Deploying workflow";
      case "run":
        return "Running workflow";
      case "dry_run":
        return "Simulating workflow";
      case "replay":
        return "Replaying workflow";
      case "rollback":
        return "Rolling back deployment";
      default:
        return "Workflow locked";
    }
  };

  createEffect(() => {
    const available = workflows();
    if (!available?.length || currentWorkflow()) return;
    void loadWorkflow(available[0].workflow_id);
  });

  createEffect(() => {
    const node = selectedNode();
    setConfigText(JSON.stringify(node?.config ?? {}, null, 2));
    setPolicyText(JSON.stringify(node?.policy ?? {}, null, 2));
  });

  function extendLiveRefreshWindow(durationMs = 15000) {
    setLiveRefreshUntil(Date.now() + durationMs);
  }

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId || !workflowExecutionRefreshing()) return;
    void refreshDeploymentHistory(workflowId);
    void refreshRunHistory(workflowId);
    const interval = window.setInterval(() => {
      void refreshDeploymentHistory(workflowId);
      void refreshRunHistory(workflowId);
    }, 2500);
    onCleanup(() => window.clearInterval(interval));
  });

  onMount(() => {
    const move = (event: PointerEvent) => {
      if (!dragState || !canvasRef) return;
      const rect = canvasRef.getBoundingClientRect();
      const x = Math.max(24, event.clientX - rect.left - dragState.offsetX);
      const y = Math.max(24, event.clientY - rect.top - dragState.offsetY);
      updateSelectedNode((node) => ({ ...node, position: { x, y } }));
    };
    const up = () => {
      if (dragState) {
        const nodeId = dragState.nodeId;
        const draft = graph();
        const node = draft?.nodes.find((entry) => entry.id === nodeId);
        if (node) {
          void handleWorkflowPatch({
            op: "node_move",
            node_id: nodeId,
            x: node.position.x,
            y: node.position.y,
          });
        }
      }
      dragState = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    onCleanup(() => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    });
  });

  async function loadWorkflow(workflowId: string) {
    setBusyAction("load");
    setFeedback("");
    try {
      const [workflow, deployments, runs] = await Promise.all([
        getWorkflow(workflowId),
        listWorkflowDeployments(workflowId),
        listWorkflowRuns(workflowId),
      ]);
      setSelectedWorkflowId(workflow.workflow_id);
      setCurrentWorkflow(cloneJson(workflow));
      setDeploymentHistory(deployments.deployments);
      setRunHistory(runs.runs);
      setSelectedRunId(runs.runs[0]?.run_id ?? null);
      setSelectedNodeId(null);
      setValidationResult(null);
    } catch (error) {
      setFeedback(`Could not load workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function updateGraph(updater: (draft: WorkflowGraphDraft) => WorkflowGraphDraft) {
    setCurrentWorkflow((workflow) => {
      if (!workflow) return workflow;
      const nextGraph = updater(normalizeGraph(workflow));
      return {
        ...workflow,
        title: nextGraph.title,
        description: nextGraph.description,
        graph: nextGraph,
        preset_kinds: nextGraph.presets.map((preset) => preset.preset_kind).filter((value): value is string => typeof value === "string"),
        updated_at: new Date().toISOString(),
      };
    });
  }

  function updateSelectedNode(updater: (node: WorkflowNodeDraft) => WorkflowNodeDraft) {
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    updateGraph((draft) => ({
      ...draft,
      nodes: draft.nodes.map((node) => (node.id === nodeId ? updater(cloneJson(node)) : node)),
    }));
  }

  function addNode(kind: string, preset?: string) {
    if (workflowInteractionLocked()) return;
    const draft = graph();
    const index = draft?.nodes.length ?? 0;
    const node: WorkflowNodeDraft = {
      id: makeId("node"),
      kind: preset ? "agent" : kind,
      label: preset ? titleCase(preset) : `${titleCase(kind)} node`,
      description: preset ? `${titleCase(preset)} preset node.` : `${titleCase(kind)} primitive node.`,
      position: { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 120 },
      config: defaultConfig(kind, preset),
      policy: defaultPolicy(),
      prompt: preset ? { system_prompt: `Run the ${titleCase(preset)} preset safely.`, instruction_prompt: "", user_editable: true } : undefined,
      hidden_runtime_nodes: runtimeHints(preset ? "agent" : kind),
      metadata: preset ? { preset_origin: preset } : {},
    };
    updateGraph((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      presets: preset
        ? [...current.presets, { preset_id: makeId("preset"), preset_kind: preset, label: node.label, root_node_ids: current.root_node_ids.length ? current.root_node_ids : [node.id], favorite_eligible: true, parameter_schema: {} }]
        : current.presets,
      root_node_ids: current.root_node_ids.length ? current.root_node_ids : [node.id],
    }));
    setSelectedNodeId(node.id);
  }

  function removeSelectedNode() {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    updateGraph((draft) => ({
      ...draft,
      nodes: draft.nodes.filter((node) => node.id !== nodeId),
      edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      root_node_ids: draft.root_node_ids.filter((root) => root !== nodeId),
    }));
    setSelectedNodeId(null);
    void handleWorkflowPatch({ op: "node_delete", node_id: nodeId });
  }

  function applyConfig() {
    if (workflowInteractionLocked()) return;
    try {
      const parsed = JSON.parse(configText()) as Record<string, unknown>;
      updateSelectedNode((node) => ({ ...node, config: parsed }));
      const nodeId = selectedNodeId();
      if (nodeId) {
        void handleWorkflowPatch({ op: "node_config_replace", node_id: nodeId, config: parsed });
      }
      setFeedback("Applied node config JSON.");
    } catch (error) {
      setFeedback(`Invalid config JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function applyPolicy() {
    if (workflowInteractionLocked()) return;
    try {
      const parsed = JSON.parse(policyText()) as Record<string, unknown>;
      updateSelectedNode((node) => ({ ...node, policy: parsed }));
      const nodeId = selectedNodeId();
      if (nodeId) {
        void handleWorkflowPatch({ op: "node_policy_replace", node_id: nodeId, policy: parsed });
      }
      setFeedback("Applied node policy JSON.");
    } catch (error) {
      setFeedback(`Invalid policy JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function addEdge() {
    if (workflowInteractionLocked()) return;
    const source = edgeSource();
    const target = edgeTarget();
    if (!source || !target || source === target) {
      setFeedback("Choose two different nodes to create an edge.");
      return;
    }
    updateGraph((draft) => draft.edges.some((edge) => edge.source === source && edge.target === target)
      ? draft
      : { ...draft, edges: [...draft.edges, { id: makeId("edge"), source, target, metadata: {} }] });
    setEdgeTarget("");
    setFeedback("Added edge.");
    void handleWorkflowPatch({ op: "edge_add", source, target });
  }

  function toggleRoot(nodeId: string, checked: boolean) {
    if (workflowInteractionLocked()) return;
    updateGraph((draft) => ({
      ...draft,
      root_node_ids: checked
        ? [...new Set([...draft.root_node_ids, nodeId])]
        : draft.root_node_ids.filter((root) => root !== nodeId),
    }));
    void handleWorkflowPatch({ op: "root_toggle", node_id: nodeId, root_enabled: checked });
  }

  function createNewWorkflow() {
    const workflow = makeNewWorkflow();
    setCurrentWorkflow(workflow);
    setSelectedWorkflowId(workflow.workflow_id);
    setDeploymentHistory([]);
    setRunHistory([]);
    setSelectedRunId(null);
    setSelectedNodeId(normalizeGraph(workflow).nodes[0]?.id ?? null);
    setValidationResult(null);
    setFeedback("Started a new workflow draft.");
  }

  function startDrag(event: PointerEvent & { currentTarget: HTMLButtonElement }, nodeId: string) {
    if (workflowInteractionLocked()) return;
    const draft = graph();
    const node = draft?.nodes.find((entry) => entry.id === nodeId);
    if (!node || !canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    dragState = {
      nodeId,
      offsetX: event.clientX - rect.left - node.position.x,
      offsetY: event.clientY - rect.top - node.position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(nodeId);
  }

  async function ensureWorkflowPersisted(): Promise<SavedWorkflow | null> {
    const workflow = currentWorkflow();
    if (!workflow) return null;
    if ((workflows() ?? []).some((entry) => entry.workflow_id === workflow.workflow_id)) {
      return workflow;
    }
    try {
      const response = await saveWorkflow({
        graph: normalizeGraph(workflow) as unknown as Record<string, unknown>,
        latest_ir: (workflow.latest_ir ?? undefined) as Record<string, unknown> | undefined,
        favorite: workflow.favorite,
        archived: Boolean(workflow.archived_at),
      });
      const saved = cloneJson(response.workflow);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate((current) => [saved, ...(current ?? [])]);
      return saved;
    } catch (error) {
      setFeedback(`Could not persist workflow before patching: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async function handleWorkflowPatch(
    patch:
      | {
          op: "workflow_meta_replace";
          title?: string;
          description?: string;
          environment?: string;
          optimization_mode?: string;
        }
      | {
          op: "node_meta_replace";
          node_id: string;
          label?: string;
          description?: string;
        }
      | { op: "node_move"; node_id: string; x: number; y: number }
      | { op: "root_toggle"; node_id: string; root_enabled: boolean }
      | { op: "edge_add"; source: string; target: string }
      | { op: "edge_remove"; edge_id: string }
      | { op: "node_delete"; node_id: string }
      | { op: "node_config_replace"; node_id: string; config: Record<string, unknown> }
      | { op: "node_policy_replace"; node_id: string; policy: Record<string, unknown> }
      | {
          op: "node_prompt_replace";
          node_id: string;
          prompt: {
            system_prompt?: string;
            instruction_prompt?: string;
            user_editable?: boolean;
          };
        },
  ) {
    const workflow = await ensureWorkflowPersisted();
    if (!workflow) return;
    try {
      const response = await patchWorkflow(workflow.workflow_id, patch);
      const updated = cloneJson(response.workflow);
      setCurrentWorkflow(updated);
      setSelectedWorkflowId(updated.workflow_id);
      mutate((current) => (current ?? []).map((entry) => entry.workflow_id === updated.workflow_id ? updated : entry));
      if (response.ir_invalidated) {
        setFeedback("Workflow graph updated. Compiled IR was cleared and should be rebuilt before deploy.");
      }
    } catch (error) {
      setFeedback(`Could not patch workflow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function refreshDeploymentHistory(workflowId: string) {
    try {
      const response = await listWorkflowDeployments(workflowId);
      setDeploymentHistory(response.deployments);
    } catch {
      setDeploymentHistory([]);
    }
  }

  async function refreshRunHistory(workflowId: string) {
    try {
      const response = await listWorkflowRuns(workflowId);
      setRunHistory(response.runs);
      setSelectedRunId((current) => current ?? response.runs[0]?.run_id ?? null);
    } catch {
      setRunHistory([]);
      setSelectedRunId(null);
    }
  }

  async function handleSave() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("save");
    setFeedback("");
    try {
      const response = await saveWorkflow({
        graph: normalizeGraph(workflow) as unknown as Record<string, unknown>,
        latest_ir: (workflow.latest_ir ?? undefined) as Record<string, unknown> | undefined,
        favorite: workflow.favorite,
        archived: Boolean(workflow.archived_at),
      });
      const saved = cloneJson(response.workflow);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate((current) => {
        const list = current ?? [];
        const idx = list.findIndex((entry) => entry.workflow_id === saved.workflow_id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = saved;
          return next;
        }
        return [saved, ...list];
      });
      setFeedback(`Saved "${saved.title}".`);
    } catch (error) {
      setFeedback(`Could not save workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleValidate() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("validate");
    setFeedback("");
    try {
      const result = await validateWorkflow(normalizeGraph(workflow) as unknown as Record<string, unknown>);
      setValidationResult(result);
      setFeedback(result.valid ? "Workflow validation passed." : "Workflow validation found issues.");
    } catch (error) {
      setFeedback(`Could not validate workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompile() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("compile");
    setFeedback("");
    try {
      if (!(workflows() ?? []).some((entry) => entry.workflow_id === workflow.workflow_id)) {
        await handleSave();
      }
      const response = await compileWorkflow(currentWorkflow()?.workflow_id ?? workflow.workflow_id);
      setCurrentWorkflow((current) => current ? { ...current, latest_ir: response.ir, updated_at: new Date().toISOString() } : current);
      mutate((current) => (current ?? []).map((entry) => entry.workflow_id === response.workflow_id ? { ...entry, latest_ir: response.ir } : entry));
      setFeedback("Compiled workflow into deterministic runtime IR.");
      void refetch();
    } catch (error) {
      setFeedback(`Could not compile workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWorkflowAction(action: "favorite" | "archive" | "deploy" | "rollback", options?: {
    favorite?: boolean;
    archived?: boolean;
    environment?: "dev" | "prod";
    deployment_id?: string;
  }) {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction(action);
    setFeedback("");
    try {
      if (action === "deploy" && !workflow.latest_ir) {
        setFeedback("Compile the workflow before deploying it.");
        return;
      }
      const response = await runWorkflowAction(workflow.workflow_id, {
        action,
        favorite: options?.favorite,
        archived: options?.archived,
        environment: options?.environment,
        deployment_id: options?.deployment_id,
      });
      const updated = response.workflow;
      setCurrentWorkflow(updated);
      mutate((current) => (current ?? []).map((entry) => entry.workflow_id === updated.workflow_id ? updated : entry));
      if (action === "deploy" || action === "rollback") {
        await refreshDeploymentHistory(updated.workflow_id);
      }
      if (action === "deploy" || action === "rollback") {
        extendLiveRefreshWindow();
      }
      if (action === "deploy" && response.deployment_id) {
        setFeedback(`Workflow deployed with deployment id ${response.deployment_id}.`);
      } else if (action === "rollback" && response.deployment_id) {
        setFeedback(`Workflow rolled back with deployment id ${response.deployment_id}.`);
      } else if (action === "favorite") {
        setFeedback(updated.favorite ? "Workflow favorited." : "Workflow removed from favorites.");
      } else {
        setFeedback(updated.archived_at ? "Workflow archived." : "Workflow restored from archive.");
      }
    } catch (error) {
      setFeedback(`Could not ${action} workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunAction(kind: "start" | "replay", options?: {
    deployment_id?: string;
    replay_run_id?: string;
  }) {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction(kind === "start" ? "run" : "replay");
    setFeedback("");
    try {
      const response = await startWorkflowRun(workflow.workflow_id, {
        deployment_id: options?.deployment_id,
        replay_run_id: options?.replay_run_id,
        trigger_kind: kind === "replay" ? "replay" : "manual",
      });
      extendLiveRefreshWindow();
      await refreshRunHistory(workflow.workflow_id);
      setSelectedRunId(response.run.run_id);
      setFeedback(
        kind === "replay"
          ? `Replay started from run ${options?.replay_run_id} as ${response.run.run_id}.`
          : `Workflow run ${response.run.run_id} completed.`,
      );
    } catch (error) {
      setFeedback(`Could not ${kind} workflow run: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDryRun() {
    const workflow = currentWorkflow();
    const deploymentId = deploymentHistory()[0]?.deployment_id;
    if (!workflow || !deploymentId) return;
    setBusyAction("dry_run");
    setFeedback("");
    try {
      const response = await startWorkflowRun(workflow.workflow_id, {
        deployment_id: deploymentId,
        trigger_kind: "dry_run",
      });
      extendLiveRefreshWindow();
      await refreshRunHistory(workflow.workflow_id);
      setSelectedRunId(response.run.run_id);
      setFeedback(`Dry run ${response.run.run_id} completed.`);
    } catch (error) {
      setFeedback(`Could not dry run workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function patchWorkflowMeta(fields: {
    title?: string;
    description?: string;
    environment?: string;
    optimization_mode?: string;
  }) {
    if (workflowInteractionLocked()) return;
    void handleWorkflowPatch({ op: "workflow_meta_replace", ...fields });
  }

  function patchSelectedNodePrompt(prompt: {
    system_prompt?: string;
    instruction_prompt?: string;
    user_editable?: boolean;
  }) {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    void handleWorkflowPatch({ op: "node_prompt_replace", node_id: nodeId, prompt });
  }

  function patchSelectedNodeMeta(fields: {
    label?: string;
    description?: string;
  }) {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    void handleWorkflowPatch({ op: "node_meta_replace", node_id: nodeId, ...fields });
  }

  return (
    <div class="space-y-5">
      <div class="glass-surface rounded-[28px] border border-white/40 p-6 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.28em] text-on-surface-variant">Workflow Builder</p>
            <h2 class="text-2xl font-semibold text-on-surface">Visual workflow editor</h2>
            <p class="max-w-4xl text-sm leading-6 text-on-surface-variant">Save validated workflow graphs, edit primitive and preset-backed nodes, drag the canvas, tune prompts and policies, then compile to deterministic runtime IR before deployment.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="glass-button rounded-full border border-white/40 bg-white/45 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/60" onClick={createNewWorkflow}>New workflow</button>
            <button type="button" class="glass-button rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleSave()} disabled={!currentWorkflow() || busyAction() !== null}>{busyAction() === "save" ? "Saving..." : "Save"}</button>
            <button type="button" class="glass-button rounded-full border border-white/40 bg-white/45 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleValidate()} disabled={!currentWorkflow() || busyAction() !== null}>{busyAction() === "validate" ? "Validating..." : "Validate"}</button>
            <button type="button" class="glass-button rounded-full border border-emerald-300/70 bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleCompile()} disabled={!currentWorkflow() || busyAction() !== null}>{busyAction() === "compile" ? "Compiling..." : "Compile IR"}</button>
            <Show when={currentWorkflow()}>
              {(workflow) => (
                <>
                  <button type="button" class="glass-button rounded-full border border-amber-300/70 bg-amber-50/80 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleWorkflowAction("favorite", { favorite: !workflow().favorite })} disabled={busyAction() !== null}>{busyAction() === "favorite" ? "Updating..." : workflow().favorite ? "Unfavorite" : "Favorite"}</button>
                  <button type="button" class="glass-button rounded-full border border-slate-300/70 bg-slate-50/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleWorkflowAction("archive", { archived: !Boolean(workflow().archived_at) })} disabled={busyAction() !== null}>{busyAction() === "archive" ? "Updating..." : workflow().archived_at ? "Restore" : "Archive"}</button>
                  <button type="button" class="glass-button rounded-full border border-sky-300/70 bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleWorkflowAction("deploy", { environment: (normalizeGraph(workflow()).environment === "prod" ? "prod" : "dev") })} disabled={busyAction() !== null || !workflow().latest_ir}>{busyAction() === "deploy" ? "Deploying..." : "Deploy"}</button>
                  <button type="button" class="glass-button rounded-full border border-violet-300/70 bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleRunAction("start")} disabled={busyAction() !== null || !workflow().latest_ir || deploymentHistory().length === 0}>{busyAction() === "run" ? "Running..." : "Run"}</button>
                  <button type="button" class="glass-button rounded-full border border-cyan-300/70 bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleDryRun()} disabled={busyAction() !== null || !workflow().latest_ir || deploymentHistory().length === 0}>{busyAction() === "dry_run" ? "Simulating..." : "Dry run"}</button>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>

      <Show when={feedback()}>
        <div class="glass-surface rounded-[22px] border border-white/35 px-5 py-4 text-sm text-on-surface-variant shadow-panel">{feedback()}</div>
      </Show>

      <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div class="glass-surface rounded-[26px] border border-white/35 p-4 shadow-panel">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-on-surface">Saved workflows</p>
              <p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">revisit - favorite - compile</p>
            </div>
            <button type="button" class="rounded-full border border-white/40 bg-white/45 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/60" onClick={() => void refetch()}>Refresh</button>
          </div>
          <div class="mt-4 space-y-3">
            <Show when={!workflows.loading} fallback={<p class="text-sm text-on-surface-variant">Loading workflows...</p>}>
              <Show when={(workflows() ?? []).length > 0} fallback={<p class="text-sm text-on-surface-variant">No saved workflows yet.</p>}>
                <For each={workflows()}>
                  {(workflow) => {
                    const info = summary(workflow);
                    const isSelected = selectedWorkflowId() === workflow.workflow_id;
                    return (
                      <button type="button" class={`w-full rounded-[20px] border p-4 text-left transition ${isSelected ? "border-primary/40 bg-primary/10 shadow-soft" : "border-white/35 bg-white/35 hover:bg-white/50"}`} onClick={() => void loadWorkflow(workflow.workflow_id)}>
                        <div class="flex items-center justify-between gap-3">
                          <p class="text-sm font-semibold text-on-surface">{workflow.title}</p>
                          <Show when={workflow.favorite}><span class="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Fav</span></Show>
                        </div>
                        <p class="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">{workflow.description ?? "No description yet."}</p>
                        <div class="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">
                          <span>{info.nodeCount} nodes</span>
                          <span>{workflow.latest_ir ? "compiled" : "draft"}</span>
                        </div>
                      </button>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </div>
        </div>

        <div class="space-y-4">
          <Show when={currentWorkflow()} fallback={<div class="glass-surface rounded-[26px] border border-white/35 p-8 shadow-panel"><p class="text-base font-medium text-on-surface">No workflow selected</p><p class="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">Pick a saved workflow or start a new one to open the visual editor.</p></div>}>
            {(workflowAccessor) => {
              const workflow = workflowAccessor();
              const draft = () => normalizeGraph(workflow);
              const info = () => summary(workflow);
              return (
                <>
                  <div class="glass-surface rounded-[26px] border border-white/35 p-4 shadow-panel">
                    <div class="flex flex-wrap items-start justify-between gap-4">
                      <div class="space-y-1">
                        <p class="text-lg font-semibold text-on-surface">{draft().title}</p>
                        <p class="text-sm text-on-surface-variant">{draft().description ?? "No description yet."}</p>
                      </div>
                      <div class="grid grid-cols-3 gap-3">
                        <div class="rounded-2xl border border-white/35 bg-white/45 px-4 py-3"><p class="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">Nodes</p><p class="mt-1 text-lg font-semibold text-on-surface">{info().nodeCount}</p></div>
                        <div class="rounded-2xl border border-white/35 bg-white/45 px-4 py-3"><p class="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">Edges</p><p class="mt-1 text-lg font-semibold text-on-surface">{info().edgeCount}</p></div>
                        <div class="rounded-2xl border border-white/35 bg-white/45 px-4 py-3"><p class="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">IR</p><p class="mt-1 text-sm font-semibold text-on-surface">{workflow.latest_ir ? "Compiled" : "Pending"}</p><p class="mt-1 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">{deploymentHistory().length} deploys</p></div>
                      </div>
                    </div>

                    <div class="mt-4 grid gap-3 lg:grid-cols-2">
                      <div class="rounded-[22px] border border-white/35 bg-white/40 p-4">
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Primitive palette</p>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <For each={PRIMITIVES}>{(kind) => <button type="button" class="rounded-full border border-white/40 bg-white/60 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => addNode(kind)} disabled={workflowInteractionLocked()}>{titleCase(kind)}</button>}</For>
                        </div>
                      </div>
                      <div class="rounded-[22px] border border-white/35 bg-white/40 p-4">
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Human-friendly presets</p>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <For each={PRESETS}>{(preset) => <button type="button" class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => addNode("agent", preset)} disabled={workflowInteractionLocked()}>{titleCase(preset)}</button>}</For>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="glass-surface rounded-[28px] border border-white/35 p-4 shadow-panel">
                    <div class="mb-3"><p class="text-sm font-semibold text-on-surface">Canvas</p><p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">drag nodes - inspect on selection - compile frozen IR</p></div>
                    <Show when={selectedRun()}>
                      {(runAccessor) => {
                        const run = runAccessor();
                        const executionMode =
                          typeof run.result?.execution_mode === "string" ? run.result.execution_mode : "live";
                        const timelineCount = Array.isArray(run.timeline) ? run.timeline.length : 0;
                        return (
                          <div class="mb-3 flex flex-wrap items-center gap-2 rounded-[20px] border border-violet-200/70 bg-violet-50/70 px-4 py-3">
                            <span class="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                              Canvas overlay
                            </span>
                            <span class="rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-violet-700">
                              {executionMode}
                            </span>
                            <span class="text-xs text-violet-800">
                              {timelineCount} timeline steps projected onto nodes and traversed edges
                            </span>
                          </div>
                        );
                      }}
                    </Show>
                    <div ref={canvasRef!} class="relative min-h-[720px] overflow-hidden rounded-[24px] border border-white/35 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(233,240,247,0.82)_45%,_rgba(225,234,244,0.88))]">
                      <Show when={workflowInteractionLocked()}>
                        <div class="pointer-events-none absolute inset-x-4 top-4 z-20 rounded-[20px] border border-amber-200/80 bg-amber-50/90 px-4 py-3 shadow-soft">
                          <p class="text-sm font-semibold text-amber-900">{workflowInteractionLockLabel()}</p>
                          <p class="mt-1 text-xs uppercase tracking-[0.16em] text-amber-700">Canvas editing is temporarily locked until this operation finishes.</p>
                        </div>
                      </Show>
                      <svg class="pointer-events-none absolute inset-0 h-full w-full">
                        <For each={draft().edges}>{(edge) => {
                          const line = edgeLine(draft(), edge);
                          const edgeState = selectedRunEdgeStates().get(edge.id);
                          const stroke =
                            edgeState === "simulated"
                              ? "rgba(6, 182, 212, 0.88)"
                              : edgeState === "completed"
                                ? "rgba(16, 185, 129, 0.82)"
                                : "rgba(37, 99, 235, 0.52)";
                          const strokeWidth = edgeState ? 4 : 3;
                          return <Show when={line}>{(coords) => <><line x1={coords().x1} y1={coords().y1} x2={coords().x2} y2={coords().y2} stroke={stroke} stroke-width={strokeWidth} stroke-linecap="round" /><circle cx={coords().x1} cy={coords().y1} r="4" fill={edgeState ? stroke : "rgba(37, 99, 235, 0.9)"} /><circle cx={coords().x2} cy={coords().y2} r="4" fill={edgeState ? stroke : "rgba(37, 99, 235, 0.7)"} /></>}</Show>;
                        }}</For>
                      </svg>
                      <For each={draft().nodes}>{(node) => {
                        const nodeStatus = selectedRunStatuses().get(node.id);
                        const stepOrder = selectedRunStepOrder().get(node.id);
                        const statusClass =
                          nodeStatus === "simulated"
                            ? "border-cyan-300/80 bg-cyan-50/85"
                            : nodeStatus === "completed"
                              ? "border-emerald-300/80 bg-emerald-50/80"
                              : nodeStatus === "active"
                                ? "border-sky-300/80 bg-sky-50/80"
                                : selectedNodeId() === node.id
                                  ? "border-primary/45 bg-primary/15"
                                  : "border-white/50 bg-white/78 hover:bg-white";
                        return <button type="button" class={`absolute w-[180px] cursor-grab rounded-[22px] border px-4 py-3 text-left shadow-soft transition active:cursor-grabbing disabled:cursor-default disabled:opacity-90 ${statusClass}`} style={{ left: `${node.position.x}px`, top: `${node.position.y}px` }} onClick={() => setSelectedNodeId(node.id)} onPointerDown={(event) => startDrag(event, node.id)}><div class="flex items-center justify-between gap-2"><p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">{node.kind}</p><div class="flex items-center gap-2"><Show when={stepOrder}><span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">step {stepOrder}</span></Show><Show when={nodeStatus}><span class="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">{nodeStatus}</span></Show></div></div><p class="mt-1 text-sm font-semibold text-on-surface">{node.label}</p><Show when={node.description}><p class="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{node.description}</p></Show><Show when={node.config.preset_kind}><p class="mt-1 text-xs text-sky-700">{String(node.config.preset_kind)}</p></Show><div class="mt-3 flex flex-wrap gap-1"><For each={node.hidden_runtime_nodes.slice(0, 3)}>{(runtimeKind) => <span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">{runtimeKind}</span>}</For></div></button>;
                      }}</For>
                    </div>
                  </div>
                </>
              );
            }}
          </Show>
        </div>
        <div class="glass-surface rounded-[26px] border border-white/35 p-4 shadow-panel">
          <Show when={currentWorkflow()} fallback={<p class="text-sm text-on-surface-variant">Select a workflow to inspect it.</p>}>
            {(workflowAccessor) => {
              const workflow = workflowAccessor();
              const draft = () => normalizeGraph(workflow);
              return (
                <div class="space-y-4">
                  <div class="border-b border-white/30 pb-3">
                    <p class="text-sm font-semibold text-on-surface">{selectedNode() ? "Node inspector" : "Workflow inspector"}</p>
                    <p class="mt-1 text-xs uppercase tracking-[0.18em] text-on-surface-variant">parameters - prompts - roots - connections</p>
                  </div>

                  <div class="space-y-3">
                    <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Title</span><input value={draft().title} onInput={(event) => updateGraph((current) => ({ ...current, title: event.currentTarget.value }))} onBlur={(event) => patchWorkflowMeta({ title: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                    <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Description</span><textarea value={draft().description ?? ""} onInput={(event) => updateGraph((current) => ({ ...current, description: event.currentTarget.value }))} onBlur={(event) => patchWorkflowMeta({ description: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[88px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                    <div class="grid grid-cols-2 gap-3">
                      <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Environment</span><select value={draft().environment} onChange={(event) => { updateGraph((current) => ({ ...current, environment: event.currentTarget.value })); patchWorkflowMeta({ environment: event.currentTarget.value }); }} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"><option value="dev">dev</option><option value="prod">prod</option></select></label>
                      <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Optimization</span><select value={draft().optimization_mode} onChange={(event) => { updateGraph((current) => ({ ...current, optimization_mode: event.currentTarget.value })); patchWorkflowMeta({ optimization_mode: event.currentTarget.value }); }} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"><option value="balanced">balanced</option><option value="speed">speed</option><option value="cost">cost</option></select></label>
                    </div>
                    <label class="flex items-center gap-3 rounded-2xl border border-white/35 bg-white/55 px-4 py-3 text-sm text-on-surface"><input type="checkbox" checked={workflow.favorite} onChange={(event) => setCurrentWorkflow((current) => current ? { ...current, favorite: event.currentTarget.checked } : current)} />Favorite this workflow</label>
                  </div>

                  <div class="rounded-[22px] border border-white/35 bg-white/40 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Root nodes</p>
                    <div class="mt-3 space-y-2"><For each={draft().nodes}>{(node) => <label class="flex items-center gap-3 rounded-2xl border border-white/35 bg-white/55 px-3 py-2 text-sm text-on-surface"><input type="checkbox" checked={draft().root_node_ids.includes(node.id)} onChange={(event) => toggleRoot(node.id, event.currentTarget.checked)} disabled={workflowInteractionLocked()} /><span>{node.label}</span></label>}</For></div>
                  </div>

                  <div class="rounded-[22px] border border-white/35 bg-white/40 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Connections</p>
                    <div class="mt-3 grid grid-cols-2 gap-3">
                      <select value={edgeSource()} onChange={(event) => setEdgeSource(event.currentTarget.value)} disabled={workflowInteractionLocked()} class="rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"><option value="">Source node</option><For each={draft().nodes}>{(node) => <option value={node.id}>{node.label}</option>}</For></select>
                      <select value={edgeTarget()} onChange={(event) => setEdgeTarget(event.currentTarget.value)} disabled={workflowInteractionLocked()} class="rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"><option value="">Target node</option><For each={draft().nodes}>{(node) => <option value={node.id}>{node.label}</option>}</For></select>
                    </div>
                    <button type="button" class="mt-3 rounded-full border border-white/40 bg-white/65 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60" onClick={addEdge} disabled={workflowInteractionLocked()}>Add edge</button>
                    <div class="mt-3 space-y-2"><For each={draft().edges}>{(edge) => <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/35 bg-white/55 px-3 py-2 text-sm text-on-surface"><span>{edge.source} {"->"} {edge.target}</span><button type="button" class="rounded-full border border-rose-200/70 bg-rose-50/80 px-3 py-1 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => { updateGraph((current) => ({ ...current, edges: current.edges.filter((entry) => entry.id !== edge.id) })); void handleWorkflowPatch({ op: "edge_remove", edge_id: edge.id }); }} disabled={workflowInteractionLocked()}>Remove</button></div>}</For></div>
                  </div>

                  <Show when={selectedNode()}>
                    {(node) => (
                      <div class="space-y-4 rounded-[22px] border border-primary/20 bg-primary/5 p-4">
                        <div class="flex items-center justify-between gap-3"><div><p class="text-sm font-semibold text-on-surface">{node().label}</p><p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">{node().kind}</p></div><button type="button" class="rounded-full border border-rose-200/70 bg-rose-50/80 px-3 py-1 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={removeSelectedNode} disabled={workflowInteractionLocked()}>Delete node</button></div>
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Node label</span><input value={node().label} onInput={(event) => updateSelectedNode((current) => ({ ...current, label: event.currentTarget.value }))} onBlur={(event) => patchSelectedNodeMeta({ label: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Description</span><textarea value={node().description ?? ""} onInput={(event) => updateSelectedNode((current) => ({ ...current, description: event.currentTarget.value }))} onBlur={(event) => patchSelectedNodeMeta({ description: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[80px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">System prompt</span><textarea value={node().prompt?.system_prompt ?? ""} onInput={(event) => updateSelectedNode((current) => ({ ...current, prompt: { ...current.prompt, system_prompt: event.currentTarget.value, user_editable: current.prompt?.user_editable ?? true } }))} onBlur={(event) => patchSelectedNodePrompt({ ...node().prompt, system_prompt: event.currentTarget.value, user_editable: node().prompt?.user_editable ?? true })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[92px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Instruction prompt</span><textarea value={node().prompt?.instruction_prompt ?? ""} onInput={(event) => updateSelectedNode((current) => ({ ...current, prompt: { ...current.prompt, instruction_prompt: event.currentTarget.value, user_editable: current.prompt?.user_editable ?? true } }))} onBlur={(event) => patchSelectedNodePrompt({ ...node().prompt, instruction_prompt: event.currentTarget.value, user_editable: node().prompt?.user_editable ?? true })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[88px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <div class="space-y-2"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Node config JSON</span><textarea value={configText()} onInput={(event) => setConfigText(event.currentTarget.value)} disabled={workflowInteractionLocked()} class="min-h-[180px] w-full rounded-2xl border border-white/40 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60" /><button type="button" class="rounded-full border border-white/40 bg-white/65 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60" onClick={applyConfig} disabled={workflowInteractionLocked()}>Apply config</button></div>
                        <div class="space-y-2"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Node policy JSON</span><textarea value={policyText()} onInput={(event) => setPolicyText(event.currentTarget.value)} disabled={workflowInteractionLocked()} class="min-h-[180px] w-full rounded-2xl border border-white/40 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60" /><button type="button" class="rounded-full border border-white/40 bg-white/65 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60" onClick={applyPolicy} disabled={workflowInteractionLocked()}>Apply policy</button></div>
                      </div>
                    )}
                  </Show>

                  <Show when={validationResult()}>
                    {(result) => <div class="rounded-[22px] border border-white/35 bg-white/45 p-4"><p class="text-sm font-semibold text-on-surface">Validation {result().valid ? "passed" : "issues found"}</p><p class="mt-1 text-xs uppercase tracking-[0.18em] text-on-surface-variant">{result().summary?.node_count ?? 0} nodes - {result().summary?.edge_count ?? 0} edges</p><Show when={result().errors.length > 0}><div class="mt-3 space-y-2"><For each={result().errors}>{(error) => <div class="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700">{error}</div>}</For></div></Show><Show when={result().warnings.length > 0}><div class="mt-3 space-y-2"><For each={result().warnings}>{(warning) => <div class="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-700">{warning}</div>}</For></div></Show></div>}
                  </Show>

                  <Show when={workflow.latest_ir}>
                    {(ir) => {
                      const compiled = ir() as Record<string, unknown>;
                      const manifests = Array.isArray(compiled.manifests) ? compiled.manifests.length : 0;
                      const compiledAt = typeof compiled.compiled_at === "string" ? compiled.compiled_at : null;
                      return <div class="rounded-[22px] border border-emerald-200/70 bg-emerald-50/70 p-4"><p class="text-sm font-semibold text-emerald-800">Compiled runtime snapshot</p><p class="mt-1 text-xs uppercase tracking-[0.18em] text-emerald-700">{manifests} manifests - compiled {compiledAt ? new Date(compiledAt).toLocaleString() : "recently"}</p></div>;
                    }}
                  </Show>

                  <div class="rounded-[22px] border border-white/35 bg-white/45 p-4">
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <p class="text-sm font-semibold text-on-surface">Deployment history</p>
                        <p class="mt-1 text-xs uppercase tracking-[0.18em] text-on-surface-variant">versioned deploys - rollback ready</p>
                      </div>
                      <div class="flex items-center gap-2">
                        <Show when={workflowExecutionRefreshing()}>
                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">Auto-refreshing</span>
                        </Show>
                        <button type="button" class="rounded-full border border-white/40 bg-white/65 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white" onClick={() => void refreshDeploymentHistory(workflow.workflow_id)}>Refresh</button>
                      </div>
                    </div>
                    <div class="mt-3 space-y-2">
                      <Show when={deploymentHistory().length > 0} fallback={<p class="text-sm text-on-surface-variant">No deployments yet. Compile and deploy this workflow to create a replayable history.</p>}>
                        <For each={deploymentHistory()}>
                          {(deployment) => (
                            <div class="rounded-2xl border border-white/35 bg-white/60 p-3">
                              <div class="flex items-start justify-between gap-3">
                                <div class="space-y-1">
                                  <p class="text-sm font-semibold text-on-surface">{deployment.deployment_id}</p>
                                  <p class="text-xs uppercase tracking-[0.16em] text-on-surface-variant">{deployment.environment} - {deployment.status}</p>
                                  <Show when={deployment.source_deployment_id}>
                                    {(source) => <p class="text-xs text-on-surface-variant">from {source()}</p>}
                                  </Show>
                                </div>
                                <button
                                  type="button"
                                  class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={busyAction() !== null}
                                  onClick={() => void handleWorkflowAction("rollback", { deployment_id: deployment.deployment_id })}
                                >
                                  Roll back
                                </button>
                              </div>
                              <p class="mt-2 text-xs text-on-surface-variant">Deployed {new Date(deployment.deployed_at).toLocaleString()}</p>
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>

                  <div class="rounded-[22px] border border-white/35 bg-white/45 p-4">
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <p class="text-sm font-semibold text-on-surface">Execution history</p>
                        <p class="mt-1 text-xs uppercase tracking-[0.18em] text-on-surface-variant">run timeline - replay scaffold</p>
                      </div>
                      <div class="flex items-center gap-2">
                        <Show when={workflowExecutionRefreshing()}>
                          <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">Auto-refreshing</span>
                        </Show>
                        <button type="button" class="rounded-full border border-white/40 bg-white/65 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white" onClick={() => void refreshRunHistory(workflow.workflow_id)}>Refresh</button>
                      </div>
                    </div>
                    <div class="mt-3 space-y-2">
                      <Show when={runHistory().length > 0} fallback={<p class="text-sm text-on-surface-variant">No runs yet. Deploy the workflow, then start a run or replay one from this panel.</p>}>
                        <For each={runHistory()}>
                          {(run) => {
                            const timelineCount = Array.isArray(run.timeline) ? run.timeline.length : 0;
                            const summaryText = typeof run.result?.summary === "string" ? run.result.summary : "Run completed.";
                            return (
                              <div class={`w-full rounded-2xl border p-3 text-left ${selectedRunId() === run.run_id ? "border-violet-300/70 bg-violet-50/80" : "border-white/35 bg-white/60"}`}>
                                <div class="flex items-start justify-between gap-3">
                                  <button type="button" class="flex-1 text-left" onClick={() => setSelectedRunId(run.run_id)}>
                                    <div class="space-y-1">
                                      <p class="text-sm font-semibold text-on-surface">{run.run_id}</p>
                                      <p class="text-xs uppercase tracking-[0.16em] text-on-surface-variant">{run.trigger_kind} - {run.status}</p>
                                      <Show when={run.replay_of_run_id}>
                                        {(source) => <p class="text-xs text-on-surface-variant">replay of {source()}</p>}
                                      </Show>
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={busyAction() !== null}
                                    onClick={() => void handleRunAction("replay", { replay_run_id: run.run_id })}
                                  >
                                    Replay
                                  </button>
                                </div>
                                <button type="button" class="mt-2 w-full text-left" onClick={() => setSelectedRunId(run.run_id)}>
                                  <p class="mt-2 text-xs text-on-surface-variant">{summaryText}</p>
                                  <p class="mt-1 text-xs text-on-surface-variant">{timelineCount} timeline steps - started {new Date(run.started_at).toLocaleString()}</p>
                                </button>
                              </div>
                            );
                          }}
                        </For>
                      </Show>
                    </div>
                  </div>

                  <Show when={selectedRun()}>
                    {(runAccessor) => {
                      const run = runAccessor();
                      const timeline = Array.isArray(run.timeline) ? run.timeline : [];
                      const executionMode =
                        typeof run.result?.execution_mode === "string" ? run.result.execution_mode : "live";
                      const summaryText =
                        typeof run.result?.summary === "string" ? run.result.summary : "Run completed.";
                      return (
                        <div class="rounded-[22px] border border-violet-200/70 bg-violet-50/70 p-4">
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="text-sm font-semibold text-violet-900">Run detail</p>
                              <p class="mt-1 text-xs uppercase tracking-[0.18em] text-violet-700">{run.run_id} - {executionMode}</p>
                            </div>
                            <button type="button" class="rounded-full border border-violet-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-white" onClick={() => setSelectedRunId(null)}>Clear</button>
                          </div>
                          <p class="mt-3 text-sm text-violet-900">{summaryText}</p>
                          <div class="mt-3 space-y-2">
                            <For each={timeline}>
                              {(step, index) => {
                                const objective = typeof step.objective === "string" ? step.objective : "Execute workflow node";
                                const runtimeKind = typeof step.runtime_kind === "string" ? step.runtime_kind : "plan";
                                const status = typeof step.status === "string" ? step.status : "completed";
                                return (
                                  <div class="rounded-2xl border border-violet-200/70 bg-white/80 px-3 py-3">
                                    <div class="flex items-center justify-between gap-3">
                                      <p class="text-sm font-semibold text-violet-900">{index() + 1}. {objective}</p>
                                      <span class="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">{status}</span>
                                    </div>
                                    <p class="mt-1 text-xs uppercase tracking-[0.14em] text-violet-600">{runtimeKind}</p>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      );
                    }}
                  </Show>
                </div>
              );
            }}
          </Show>
        </div>
      </div>
    </div>
  );
}
