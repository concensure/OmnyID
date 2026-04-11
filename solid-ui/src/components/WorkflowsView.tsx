import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import {
  compileWorkflow,
  decideWorkflowWaitResume,
  describeWorkflow,
  getWorkflow,
  getWorkflowConnectorAdapters,
  listWorkflowWaitResumeRecords,
  listWorkflowDeployments,
  listWorkflowRuns,
  listWorkflowTriggerRegistrations,
  listWorkflows,
  patchWorkflow,
  runWorkflowAction,
  saveWorkflow,
  startWorkflowRun,
  updateWorkflowTriggerRegistrationStatus,
  validateWorkflow,
  type WorkflowConnectorOverrideFields,
  type WorkflowConnectorOverrides,
  type WorkflowDeployment,
  type WorkflowRun,
  type WorkflowWaitResumeRecord,
  type SavedWorkflow,
  type WorkflowValidationResponse,
} from "@/lib/api";
import {
  expandWorkflowIntent,
  presetDefaultTriggerConfig,
  presetStarterBlueprintsForPreset,
  suggestWorkflowTitleFromIntent,
  templateForPreset,
  type PresetNodeKind,
  type PresetStarterBlueprint,
} from "../../../typescript-sdk/src/workflows";
import {
  BRANCH_PRESETS,
  DEFAULT_DEPLOYMENT_OVERRIDE_DRAFT,
  PRESETS,
  PRIMITIVES,
  type CompiledAfpGapFilter,
  type CompiledAfpReadinessFocus,
  type CompiledOrchestrationRole,
  type DeploymentOverrideDraft,
  type DeploymentPolicyDiffEntry,
  type EdgeExecutionState,
  type NodeDeploymentPolicy,
  type NodeDeploymentPolicyChange,
  type PendingNodeDeploymentPolicy,
  type RunTimelineFilterMode,
  type TargetedDeploymentOverrideDraft,
  type WorkflowEdgeDraft,
  type WorkflowGraphDraft,
  type WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";
import {
  branchExecutionLogEntries,
  edgeExecutionVisual,
  edgeLine,
  formatTimelineStamp,
  runEdgeCanvasCallout,
  runEdgeStates,
  runNodeStatuses,
  runStepOrder,
  runTimelineSliceForEdge,
  timelineEventPayloadChips,
  timelineFilterSummaryLabel,
  timelineStepAction,
  timelineStepHasDeploymentContext,
  timelineStepHasReplayDrift,
  timelineStepMatchesFilter,
  timelineStepNarrative,
  timelineStepNodeId,
  timelineStepTrace,
  timelineTraceEvents,
  truncateCanvasLabel,
} from "@/lib/workflowRunAnalysis";
import {
  compiledAfpGapDescription,
  compiledAfpGapLabel,
  compiledManifestAfpContract,
  compiledManifestAfpGapKinds,
  compiledManifestOrchestrationRole,
  compactOverrideDraft,
  deploymentChangeSummary,
  deploymentChangeSummaryEntries,
  deploymentChangeSummaryFieldChangesForNode,
  deploymentNodePoliciesForEnvironment,
  deploymentOverrideDraftForEnvironment,
  deploymentOverrideSummary,
  deploymentPolicyChanges,
  deploymentPolicyDiff,
  deploymentPolicyDiffEntryForNode,
  deploymentPolicyVisual,
  latestDeploymentForEnvironment,
  mergeOverrideFields,
  nodeDeploymentPolicyFromDeployment,
  pendingDeploymentPolicyForNode,
  replayComparisonSummary,
  runEdgePolicyDeltaSummary,
  runNodePolicyDeltaSummary,
  runPolicyDriftSummary,
  workflowNodeIntegrationFamily,
} from "@/lib/workflowDeploymentHelpers";

type RunHistoryDriftFilter = "all" | "deployment" | "replay" | "any";
type RunHistorySortMode = "recent" | "drift_desc";
type PersistedRunReviewContext = {
  selected_edge_id: string | null;
  timeline_filter: RunTimelineFilterMode;
  focused_node_id: string | null;
  selected_deployment_id: string | null;
  selected_node_id: string | null;
};
type PersistedStoredSharedReviewUiContext = {
  selected_review_id: string | null;
  show_all: boolean;
  filter_text: string;
  sort_mode: "priority" | "recent";
  share_mode_filter: "all" | "workspace" | "core";
  pinned_only: boolean;
};
type ReviewUrlState = {
  workflow_id: string | null;
  run_id: string | null;
  selected_edge_id: string | null;
  timeline_filter: RunTimelineFilterMode;
  focused_node_id: string | null;
  selected_deployment_id: string | null;
  selected_node_id: string | null;
  drift_filter: RunHistoryDriftFilter;
  sort_mode: RunHistorySortMode;
  selected_review_id: string | null;
  show_all_saved_reviews: boolean;
  saved_review_filter: string;
  saved_review_sort_mode: "priority" | "recent";
  saved_review_share_mode_filter: "all" | "workspace" | "core";
  saved_review_pinned_only: boolean;
};

const WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY = "omnyid.workflow.branchFamilies.collapsed.v1";
const WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY = "omnyid.workflow.runHistory.review.v1";
const WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY = "omnyid.workflow.sharedReviewLinks.v1";

type StoredSharedReviewLink = {
  id: string;
  href: string;
  saved_at: string;
  environment: string | null;
  deployment_id: string | null;
  share_mode?: "workspace" | "core";
  title: string | null;
  pinned: boolean;
};

/** Derive trigger family from trigger_kind for provenance display. */
function triggerFamilyFromKind(triggerKind: string): "manual" | "schedule" | "event" | "hybrid" | "delayed_continuation" | "replay" {
  if (triggerKind === "replay") return "replay";
  if (triggerKind === "manual" || triggerKind === "dry_run") return "manual";
  if (triggerKind === "cron" || triggerKind === "once" || triggerKind === "schedule") return "schedule";
  if (triggerKind === "delay_until" || triggerKind === "delay_for" || triggerKind === "wake_request") return "delayed_continuation";
  if (triggerKind === "schedule_plus_condition" || triggerKind === "event_then_delay" || triggerKind === "event_plus_approval_plus_time" || triggerKind === "hybrid") return "hybrid";
  // email, webhook, internal_event, external_event, file_drop, callback
  return "event";
}

/** Return Tailwind class set for a trigger family provenance chip. */
function triggerProvenanceChipClass(family: ReturnType<typeof triggerFamilyFromKind>): string {
  if (family === "schedule") return "border-teal-200/80 bg-teal-50/90 text-teal-700";
  if (family === "event") return "border-sky-200/80 bg-sky-50/90 text-sky-700";
  if (family === "hybrid") return "border-violet-200/80 bg-violet-50/90 text-violet-700";
  if (family === "delayed_continuation") return "border-indigo-200/80 bg-indigo-50/90 text-indigo-700";
  if (family === "replay") return "border-slate-200/80 bg-slate-50/90 text-slate-600";
  return "border-slate-200/70 bg-slate-50/90 text-slate-700"; // manual
}

function parseReviewUrlStateFromSearch(search: string): ReviewUrlState | null {
  const params = new URLSearchParams(search);
  const timelineFilter = params.get("tf");
  const driftFilter = params.get("rdf");
  const sortMode = params.get("rds");
  const savedReviewSortMode = params.get("srsm");
  const savedReviewShareModeFilter = params.get("srmf");
  const savedReviewPinnedOnly = params.get("srpo");
  if (
    timelineFilter !== "all"
    && timelineFilter !== "deployment_context"
    && timelineFilter !== "replay_drift"
    && !params.get("wf")
    && !params.get("run")
  ) {
    return null;
  }
  return {
    workflow_id: params.get("wf"),
    run_id: params.get("run"),
    selected_edge_id: params.get("edge"),
    timeline_filter: timelineFilter === "deployment_context" || timelineFilter === "replay_drift" ? timelineFilter : "all",
    focused_node_id: params.get("focus"),
    selected_deployment_id: params.get("dep"),
    selected_node_id: params.get("node"),
    drift_filter: driftFilter === "deployment" || driftFilter === "replay" || driftFilter === "any" ? driftFilter : "all",
    sort_mode: sortMode === "drift_desc" ? "drift_desc" : "recent",
    selected_review_id: params.get("srid"),
    show_all_saved_reviews: params.get("sra") === "1",
    saved_review_filter: params.get("srf") ?? "",
    saved_review_sort_mode: savedReviewSortMode === "recent" ? "recent" : "priority",
    saved_review_share_mode_filter:
      savedReviewShareModeFilter === "workspace" || savedReviewShareModeFilter === "core"
        ? savedReviewShareModeFilter
        : "all",
    saved_review_pinned_only: savedReviewPinnedOnly === "1",
  };
}

function branchScaffoldBlueprint(
  label: string,
  parentKind: string,
): Pick<WorkflowNodeDraft, "kind" | "description" | "config" | "prompt" | "metadata"> {
  const normalized = label.toLowerCase();
  if (["reject", "cancel", "block"].includes(normalized)) {
    return {
      kind: "termination",
      description: `${titleCase(label)} ends the workflow from this ${parentKind} branch.`,
      config: {
        ...defaultConfig("termination"),
        output_kind: "chat_reply",
        final_schema: { branch_outcome: normalized, parent_kind: parentKind },
      },
      prompt: undefined,
      metadata: { scaffold_role: "terminal_branch" },
    };
  }
  if (normalized === "escalate") {
    return {
      kind: "delegation",
      description: `${titleCase(label)} hands the workflow to a specialist path.`,
      config: {
        ...defaultConfig("delegation"),
        target_role: "specialist_reviewer",
        handoff_contract: { branch_label: normalized, parent_kind: parentKind },
      },
      prompt: {
        system_prompt: "Escalate this workflow branch to a bounded specialist path.",
        instruction_prompt: "Preserve policy context and explain why escalation was required.",
        user_editable: true,
      },
      metadata: { scaffold_role: "delegated_branch" },
    };
  }
  if (["fallback", "secondary"].includes(normalized)) {
    return {
      kind: "agent",
      description: `${titleCase(label)} handles the alternate branch with additional reasoning.`,
      config: {
        ...defaultConfig("agent"),
        objective: `Handle the ${normalized} branch for this workflow.`,
      },
      prompt: {
        system_prompt: `Handle the ${normalized} path safely and keep the workflow moving.`,
        instruction_prompt: "Prefer lower-risk or lower-cost alternatives before escalating.",
        user_editable: true,
      },
      metadata: { scaffold_role: "alternate_branch" },
    };
  }
  if (["approve", "allow", "pass", "success", "primary"].includes(normalized)) {
    return {
      kind: "agent",
      description: `${titleCase(label)} continues the main execution path.`,
      config: {
        ...defaultConfig("agent"),
        objective: `Continue the ${normalized} branch for this workflow.`,
      },
      prompt: {
        system_prompt: `Advance the ${normalized} branch responsibly.`,
        instruction_prompt: "Carry forward the current workflow context and stay within policy.",
        user_editable: true,
      },
      metadata: { scaffold_role: "mainline_branch" },
    };
  }
  return {
    kind: "transform",
    description: `${titleCase(label)} transforms workflow state for the next branch step.`,
    config: {
      ...defaultConfig("transform"),
      transform_kind: "template",
      output_contract: { branch_label: normalized, parent_kind: parentKind },
    },
    prompt: undefined,
    metadata: { scaffold_role: "transform_branch" },
  };
}

function workflowApprovalDecisionForOption(option: Record<string, unknown>): "approved" | "rejected" {
  const raw =
    (typeof option.option_id === "string" && option.option_id.trim()
      ? option.option_id
      : typeof option.label === "string"
        ? option.label
        : "")
      .trim()
      .toLowerCase();
  if (["approve", "approved", "allow", "pass", "success", "primary", "confirm", "yes"].some((token) => raw.includes(token))) {
    return "approved";
  }
  return "rejected";
}

function presetTemplateId(preset: string): string {
  const mapping = templateForPreset(preset as PresetNodeKind);
  return mapping?.template_id ?? "linear_worker";
}

function presetStarterBlueprints(preset: string): PresetStarterBlueprint[] {
  const presetKind = PRESETS.includes(preset as typeof PRESETS[number]) ? preset as PresetNodeKind : null;
  const sharedBlueprints = presetKind ? presetStarterBlueprintsForPreset(presetKind) : null;
  if (!sharedBlueprints) {
    return [
      {
        kind: "agent",
        label: titleCase(preset),
        description: `${titleCase(preset)} preset node.`,
        slot_name: "intake_slot",
        config: defaultConfig("agent", preset),
        runtime_kind_source: "agent",
      },
    ];
  }

  return sharedBlueprints.map((blueprint) => {
    const config = cloneJson(blueprint.config);
    if (blueprint.kind === "approval" && typeof config === "object" && config) {
      const approvalConfig = config as Record<string, unknown>;
      if (typeof approvalConfig.decision_point_id !== "string" || !approvalConfig.decision_point_id) {
        approvalConfig.decision_point_id = makeId("dp");
      }
    }
    return {
      ...blueprint,
      config,
      policy: blueprint.policy ? cloneJson(blueprint.policy) : undefined,
      prompt: blueprint.prompt ? cloneJson(blueprint.prompt) : undefined,
    };
  });
}

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
    case "trigger": return {
      trigger_family: "manual",
      trigger_kind: "manual",
      event_filter: {},
    };
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
    template_bindings: rawTemplateBindings
      .map((binding) => {
        const raw = binding && typeof binding === "object" ? binding as Record<string, unknown> : null;
        return {
          template_id: typeof raw?.template_id === "string" ? raw.template_id : "",
          slot_name: typeof raw?.slot_name === "string" ? raw.slot_name : "",
          node_ids: Array.isArray(raw?.node_ids) ? raw.node_ids.filter((value): value is string => typeof value === "string") : [],
          metadata: typeof raw?.metadata === "object" && raw.metadata ? raw.metadata as Record<string, unknown> : {},
        };
      })
      .filter((binding) => binding.template_id && binding.slot_name && binding.node_ids.length > 0),
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
    created_at: now,
    updated_at: now,
    archived_at: null,
  };
}


function summary(workflow: SavedWorkflow) {
  const graph = workflow.graph as { nodes?: unknown[]; edges?: unknown[]; status?: string };
  return {
    nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
    status: typeof graph.status === "string" ? graph.status : "draft",
  };
}

function formatDurationMs(value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return null;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}


function runStatusChipClass(status: string): string {
  switch (status) {
    case "failed":
      return "bg-rose-100 text-rose-700";
    case "blocked":
      return "bg-orange-100 text-orange-700";
    case "cancelled":
      return "bg-slate-200 text-slate-700";
    case "waiting_for_approval":
      return "bg-amber-100 text-amber-700";
    case "waiting_for_resume":
      return "bg-sky-100 text-sky-700";
    case "simulated":
      return "bg-cyan-100 text-cyan-700";
    case "queued":
      return "bg-slate-200 text-slate-700";
    case "skipped":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

function runStatusSummary(run: WorkflowRun): string | null {
  const result = run.result ?? {};
  if (run.status === "waiting_for_approval") {
    const pausedAt =
      typeof result.paused_at_label === "string" ? result.paused_at_label : "approval checkpoint";
    const approvalReason =
      typeof result.approval_reason === "string" && result.approval_reason.trim()
        ? result.approval_reason.trim()
        : null;
    return approvalReason ? `Waiting at ${pausedAt}: ${approvalReason}` : `Waiting at ${pausedAt}`;
  }
  if (run.status === "waiting_for_resume") {
    const pausedAt =
      typeof result.paused_at_label === "string" ? result.paused_at_label : "delayed checkpoint";
    const waitReason =
      typeof result.wait_reason === "string" && result.wait_reason.trim()
        ? result.wait_reason.trim()
        : null;
    return waitReason ? `Waiting at ${pausedAt}: ${waitReason}` : `Waiting at ${pausedAt} for scheduled resume`;
  }
  if (run.status === "blocked") {
    const blockedAt =
      typeof result.blocked_at_label === "string" ? result.blocked_at_label : "policy node";
    const blockedReason =
      typeof result.blocked_reason === "string" && result.blocked_reason.trim()
        ? result.blocked_reason.trim()
        : null;
    return blockedReason ? `Blocked at ${blockedAt}: ${blockedReason}` : `Blocked at ${blockedAt}`;
  }
  if (run.status === "failed") {
    const failedAt =
      typeof result.failed_at_label === "string" ? result.failed_at_label : "execution step";
    const failedReason =
      typeof result.failed_reason === "string" && result.failed_reason.trim()
        ? result.failed_reason.trim()
        : null;
    return failedReason ? `Failed at ${failedAt}: ${failedReason}` : `Failed at ${failedAt}`;
  }
  if (run.status === "cancelled") {
    const cancelReason =
      typeof result.cancel_reason === "string" && result.cancel_reason.trim()
        ? result.cancel_reason.trim().replaceAll("_", " ")
        : "approval rejected";
    return `Cancelled: ${cancelReason}`;
  }
  if (run.status === "resumed_pending_execution") {
    const summary =
      typeof result.summary === "string" && result.summary.trim()
        ? result.summary.trim()
        : "Workflow resumed and is ready for downstream execution.";
    return summary;
  }
  return null;
}

function waitResumeStatusChipClass(status: string): string {
  switch (status) {
    case "pending":
      return "border-amber-200/70 bg-amber-50/85 text-amber-700";
    case "wake_dispatched":
      return "border-sky-200/70 bg-sky-50/85 text-sky-700";
    case "resumed_pending_execution":
      return "border-cyan-200/70 bg-cyan-50/85 text-cyan-700";
    case "continued_to_new_wait":
      return "border-violet-200/70 bg-violet-50/85 text-violet-700";
    case "completed_after_resume":
      return "border-emerald-200/70 bg-emerald-50/85 text-emerald-700";
    case "blocked_after_resume":
      return "border-orange-200/70 bg-orange-50/85 text-orange-700";
    case "failed_after_resume":
      return "border-rose-200/70 bg-rose-50/85 text-rose-700";
    case "approval_rejected":
      return "border-slate-200/70 bg-slate-100/85 text-slate-700";
    default:
      return "border-slate-200/70 bg-white/85 text-slate-700";
  }
}

function waitResumeStatusLabel(status: string): string {
  switch (status) {
    case "wake_dispatched":
      return "Wake dispatched";
    case "resumed_pending_execution":
      return "Resume dispatched";
    case "continued_to_new_wait":
      return "Continued to new wait";
    case "completed_after_resume":
      return "Completed after resume";
    case "blocked_after_resume":
      return "Blocked after resume";
    case "failed_after_resume":
      return "Failed after resume";
    case "approval_rejected":
      return "Approval rejected";
    default:
      return status.replaceAll("_", " ");
  }
}

function waitResumeFamilyLabel(record: WorkflowWaitResumeRecord): string {
  const family = record.resume_family.replaceAll("_", " ");
  const kind = record.resume_kind.replaceAll("_", " ");
  return family === kind ? family : `${family} · ${kind}`;
}

function runTimelineWaitChainSummary(run: WorkflowRun): { pauseCount: number; resumeCount: number } {
  const timeline = Array.isArray(run.timeline) ? run.timeline : [];
  let pauseCount = 0;
  let resumeCount = 0;
  for (const step of timeline) {
    const status = typeof step.status === "string" ? step.status : "";
    if (status === "waiting_for_approval" || status === "waiting_for_resume") {
      pauseCount++;
    }
    const trace = step.trace && typeof step.trace === "object" ? step.trace as Record<string, unknown> : null;
    if (trace && trace.kind === "wait_resume_dispatch") {
      resumeCount++;
    }
  }
  return { pauseCount, resumeCount };
}

function runNodeCanvasCallout(
  run: WorkflowRun | null,
  node: WorkflowNodeDraft,
  nodeStatus: string | undefined,
): { text: string; className: string } | null {
  if (!run || !nodeStatus) return null;
  const result = run.result ?? {};
  if (nodeStatus === "waiting_for_approval") {
    const approvalReason =
      typeof result.approval_reason === "string" && result.approval_reason.trim()
        ? result.approval_reason.trim()
        : "Approval required before this branch can continue.";
    return {
      text: approvalReason,
      className: "border-amber-200/80 bg-amber-50/90 text-amber-800",
    };
  }
  if (nodeStatus === "waiting_for_resume") {
    const waitReason =
      typeof result.wait_reason === "string" && result.wait_reason.trim()
        ? result.wait_reason.trim()
        : "Waiting for a delayed resume before this branch can continue.";
    return {
      text: waitReason,
      className: "border-sky-200/80 bg-sky-50/90 text-sky-800",
    };
  }
  if (nodeStatus === "blocked") {
    const blockedReason =
      typeof result.blocked_reason === "string" && result.blocked_reason.trim()
        ? result.blocked_reason.trim()
        : "Policy blocked this workflow branch.";
    return {
      text: blockedReason,
      className: "border-orange-200/80 bg-orange-50/90 text-orange-800",
    };
  }
  if (nodeStatus === "failed") {
    const failedReason =
      typeof result.failed_reason === "string" && result.failed_reason.trim()
        ? result.failed_reason.trim()
        : "Execution failed at this step.";
    return {
      text: failedReason,
      className: "border-rose-200/80 bg-rose-50/90 text-rose-800",
    };
  }
  if (nodeStatus === "queued") {
    return {
      text: "Queued behind an upstream gate or unresolved branch.",
      className: "border-slate-200/80 bg-slate-100/90 text-slate-700",
    };
  }
  return null;
}

type DescribeHistoryEntry = {
  event_id: string;
  event_kind: string;
  intent: string;
  preset_kind?: string;
  optimization_mode?: string;
  regeneration_mode?: string;
  timestamp?: string;
};

function generatedCoreSummary(draft: WorkflowGraphDraft) {
  const isGenerated = (value: unknown) => {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const metadata = record.metadata;
    return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).generated_by === "intent_builder");
  };
  return {
    generatedNodeCount: draft.nodes.filter((node) => isGenerated(node)).length,
    generatedEdgeCount: draft.edges.filter((edge) => isGenerated(edge)).length,
    protectedNodeCount: protectedNodeIdsForGraph(draft).size,
    protectedEdgeCount: protectedEdgeIdsForGraph(draft).size,
  };
}

function regenerationPreservationEstimate(
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
  const isGenerated = (value: unknown) => {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const metadata = record.metadata;
    return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).generated_by === "intent_builder");
  };
  const protectedNodeIds = protectedNodeIdsForGraph(draft);
  const protectedEdgeIds = protectedEdgeIdsForGraph(draft);
  const preservedManualNodes = draft.nodes.filter(
    (node) => !isGenerated(node) || protectedNodeIds.has(node.id),
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

function estimatedGeneratedCoreForIntent(
  intent: string,
  presetOverride?: PresetNodeKind | "",
): {
  presetKind: PresetNodeKind;
  estimatedNodeCount: number;
  estimatedEdgeCount: number;
  requiresApproval: boolean;
  needsBranching: boolean;
  needsResearchSupport: boolean;
} {
  const expansion = expandWorkflowIntent(intent);
  const presetKind = (presetOverride || expansion.preset_kind) as PresetNodeKind;
  const blueprints = presetStarterBlueprintsForPreset(presetKind);
  const hasApproval = blueprints.some((blueprint) => blueprint.kind === "approval");
  const hasCondition = blueprints.some((blueprint) => blueprint.kind === "condition");
  const hasWebSearch = blueprints.some(
    (blueprint) =>
      blueprint.kind === "tool" &&
      typeof blueprint.config.capability_id === "string" &&
      blueprint.config.capability_id === "web_search",
  );
  const estimatedNodeCount =
    1 +
    blueprints.length +
    (expansion.needs_research_support && !hasWebSearch ? 1 : 0) +
    (expansion.requires_approval && !hasApproval ? 1 : 0) +
    (expansion.needs_branching && !hasCondition ? 2 : 0);
  const estimatedEdgeCount =
    blueprints.length +
    (expansion.needs_research_support && !hasWebSearch ? 1 : 0) +
    (expansion.requires_approval && !hasApproval ? 1 : 0) +
    (expansion.needs_branching && !hasCondition ? 2 : 0);
  return {
    presetKind,
    estimatedNodeCount,
    estimatedEdgeCount,
    requiresApproval: expansion.requires_approval,
    needsBranching: expansion.needs_branching,
    needsResearchSupport: expansion.needs_research_support,
  };
}

function describeHistoryEntries(draft: WorkflowGraphDraft): DescribeHistoryEntry[] {
  const raw = draft.metadata["describe_history"];
  if (!Array.isArray(raw)) return [];
  return raw
    .map<DescribeHistoryEntry | null>((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      return {
        event_id: typeof record.event_id === "string" ? record.event_id : makeId("wfhist"),
        event_kind: typeof record.event_kind === "string" ? record.event_kind : "created",
        intent: typeof record.intent === "string" ? record.intent : "",
        preset_kind: typeof record.preset_kind === "string" ? record.preset_kind : undefined,
        optimization_mode: typeof record.optimization_mode === "string" ? record.optimization_mode : undefined,
        regeneration_mode: typeof record.regeneration_mode === "string" ? record.regeneration_mode : undefined,
        timestamp: typeof record.timestamp === "string" ? record.timestamp : undefined,
      };
    })
    .filter((entry): entry is DescribeHistoryEntry => entry !== null)
    .reverse();
}

function branchOriginRecord(
  workflow: SavedWorkflow,
): { parent_workflow_id?: string; history_event_id?: string } | null {
  const graph = workflow.graph;
  if (!graph || typeof graph !== "object") return null;
  const metadata =
    "metadata" in graph && graph.metadata && typeof graph.metadata === "object"
      ? (graph.metadata as Record<string, unknown>)
      : null;
  const branchOrigin =
    metadata && metadata["branch_origin"] && typeof metadata["branch_origin"] === "object"
      ? (metadata["branch_origin"] as Record<string, unknown>)
      : null;
  if (!branchOrigin) return null;
  return {
    parent_workflow_id:
      typeof branchOrigin.parent_workflow_id === "string"
        ? branchOrigin.parent_workflow_id
        : undefined,
    history_event_id:
      typeof branchOrigin.history_event_id === "string"
        ? branchOrigin.history_event_id
        : undefined,
  };
}

function branchFamilyWorkflows(
  workflow: SavedWorkflow,
  all: SavedWorkflow[],
): SavedWorkflow[] {
  const origin = branchOriginRecord(workflow);
  const parentId = origin?.parent_workflow_id ?? workflow.workflow_id;
  return all.filter((candidate) => {
    if (candidate.workflow_id === workflow.workflow_id) return false;
    const candidateOrigin = branchOriginRecord(candidate);
    return (
      candidate.workflow_id === parentId ||
      candidateOrigin?.parent_workflow_id === parentId
    );
  });
}

function orderedWorkflowsForRail(all: SavedWorkflow[]): SavedWorkflow[] {
  const workflows = [...all];
  const workflowById = new Map(workflows.map((workflow) => [workflow.workflow_id, workflow]));
  const branchChildren = new Map<string, SavedWorkflow[]>();
  const standalone: SavedWorkflow[] = [];

  for (const workflow of workflows) {
    const origin = branchOriginRecord(workflow);
    const parentId = origin?.parent_workflow_id;
    if (parentId && workflowById.has(parentId)) {
      const siblings = branchChildren.get(parentId) ?? [];
      siblings.push(workflow);
      branchChildren.set(parentId, siblings);
    } else {
      standalone.push(workflow);
    }
  }

  const sortByRecency = (left: SavedWorkflow, right: SavedWorkflow) =>
    Date.parse(right.updated_at ?? right.created_at ?? "") - Date.parse(left.updated_at ?? left.created_at ?? "");

  standalone.sort(sortByRecency);
  for (const siblings of branchChildren.values()) siblings.sort(sortByRecency);

  const ordered: SavedWorkflow[] = [];
  for (const workflow of standalone) {
    ordered.push(workflow);
    const children = branchChildren.get(workflow.workflow_id);
    if (children) ordered.push(...children);
  }

  const alreadyIncluded = new Set(ordered.map((workflow) => workflow.workflow_id));
  for (const workflow of workflows.sort(sortByRecency)) {
    if (!alreadyIncluded.has(workflow.workflow_id)) ordered.push(workflow);
  }

  return ordered;
}

function isBranchChildWorkflow(workflow: SavedWorkflow): boolean {
  return Boolean(branchOriginRecord(workflow)?.parent_workflow_id);
}

function branchFamilyRootId(workflow: SavedWorkflow): string {
  return branchOriginRecord(workflow)?.parent_workflow_id ?? workflow.workflow_id;
}

function nodeRegenerationLocked(node: WorkflowNodeDraft): boolean {
  return node.config["regeneration_lock"] === true;
}

function nodeRegenerationScope(node: WorkflowNodeDraft): "node" | "subgraph" {
  return node.config["regeneration_lock_scope"] === "subgraph" ? "subgraph" : "node";
}

function protectedNodeIdsForGraph(draft: WorkflowGraphDraft): Set<string> {
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

function protectedEdgeIdsForGraph(draft: WorkflowGraphDraft): Set<string> {
  const protectedNodeIds = protectedNodeIdsForGraph(draft);
  return new Set(
    draft.edges
      .filter((edge) => protectedNodeIds.has(edge.source) && protectedNodeIds.has(edge.target))
      .map((edge) => edge.id),
  );
}

function unavailableReviewTargetMessage(kind: "compiled_route" | "compiled_manifest" | "branch_edge" | "compiled_target"): string {
  if (kind === "compiled_route") {
    return "No matching compiled route is available for this review mode yet.";
  }
  if (kind === "compiled_manifest") {
    return "No matching compiled manifest is available for this review mode yet.";
  }
  if (kind === "branch_edge") {
    return "No matching traced branch edge is available for this review mode yet.";
  }
  return "No matching compiled review target is available for this review mode yet.";
}

function availableReviewTargetMessage(kind: "compiled_route" | "compiled_manifest" | "branch_edge" | "contract_focus"): string {
  if (kind === "compiled_route") {
    return "Open the matching compiled route review target for this review mode.";
  }
  if (kind === "compiled_manifest") {
    return "Open the matching compiled manifest review target for this review mode.";
  }
  if (kind === "branch_edge") {
    return "Open the matching traced branch edge for this review mode.";
  }
  return "Open the current contract-focus target for this review mode.";
}

function clearReviewFocusMessage(kind: "manifest_health" | "afp_route" | "route_linkage" | "combined_canvas" | "compiled_manifest" | "compiled_route" | "review_health" | "contract_focus" | "branch_focus"): string {
  if (kind === "manifest_health") {
    return "Clear the current manifest health focus for this review mode.";
  }
  if (kind === "afp_route") {
    return "Clear the current AFP route focus for this review mode.";
  }
  if (kind === "route_linkage") {
    return "Clear the current route linkage focus for this review mode.";
  }
  if (kind === "combined_canvas") {
    return "Clear the current manifest, route, and linkage focus for this review mode.";
  }
  if (kind === "compiled_manifest") {
    return "Clear the current manifest focus for this review mode.";
  }
  if (kind === "compiled_route") {
    return "Clear the current compiled route focus for this review mode.";
  }
  if (kind === "review_health") {
    return "Clear the current review-health focus for this review mode.";
  }
  if (kind === "contract_focus") {
    return "Clear the current contract focus for this review mode.";
  }
  return "Clear the current branch focus for this review mode.";
}

function broadenOrchestrationRoleRouteReviewMessage(): string {
  return "Return to the broader orchestration-role route review while keeping the current role focus.";
}

function clearOverlappingRouteNarrowingMessage(kind: "linked" | "manifest_only"): string {
  return kind === "linked"
    ? "Clear branch-review-ready route focus while keeping the current orchestration role focus."
    : "Clear inspector-only route focus while keeping the current orchestration role focus.";
}

function overlappingOrchestrationRouteSummaryMessage(kind: "linked" | "manifest_only"): string {
  return kind === "linked"
    ? "Showing only branch-review-ready routes that touch this orchestration role. Clear route narrowing to return to the broader role slice."
    : "Showing only inspector-only routes that touch this orchestration role. Clear route narrowing to return to the broader role slice.";
}

function clearOrchestrationRoleFocusMessage(): string {
  return "Clear the current orchestration role focus for this review mode.";
}

function orchestrationRoleRailGuideMessage(): string {
  return "Use this card to review master-agent decomposition while keeping the rest of the canvas review context intact.";
}

function orchestrationRoleOutsideFocusMessage(): string {
  return "Dimmed nodes and routes are outside the current orchestration role focus.";
}

function orchestrationRoleFocusTargetLabel(role: CompiledOrchestrationRole): string {
  if (role === "supervisor_orchestration") {
    return "supervisor orchestration units";
  }
  if (role === "delegated_capability") {
    return "delegated capability units";
  }
  if (role === "delegated_decision") {
    return "delegated decision units";
  }
  return "workflow summary units";
}

function focusOrchestrationRoleReviewMessage(role: CompiledOrchestrationRole): string {
  return `Focus review on ${orchestrationRoleFocusTargetLabel(role)}.`;
}

function focusOrchestrationRouteReviewMessage(role: CompiledOrchestrationRole): string {
  return `Focus route review on routes that touch ${orchestrationRoleFocusTargetLabel(role)}.`;
}

function focusRouteLinkageReviewMessage(kind: "linked" | "manifest_only"): string {
  return kind === "linked"
    ? "Focus route review on branch-review-ready routes."
    : "Focus route review on inspector-only routes.";
}

function clearRouteReviewFilterMessage(): string {
  return "Clear the compiled route review filter.";
}

function resetRouteReviewStatesLabel(): string {
  return "Show all route review states";
}

function clearAfpReadinessFocusMessage(): string {
  return "Clear the current AFP readiness focus for this review mode.";
}

function afpReadinessFocusTitle(kind: CompiledAfpReadinessFocus): string {
  if (kind === "ready_manifests") {
    return "Focus review on AFP-ready manifests.";
  }
  if (kind === "needs_contract_work") {
    return "Focus review on manifests that still need AFP contract work.";
  }
  return "Focus review on AFP-ready handoffs.";
}

function afpReadinessFocusSummary(kind: CompiledAfpReadinessFocus): string {
  if (kind === "ready_manifests") {
    return "Showing manifests that already compile as concrete AFP boundaries without the currently tracked gap signals.";
  }
  if (kind === "needs_contract_work") {
    return "Showing manifests that still act like AFP scaffolds or still expose tracked contract gaps.";
  }
  return "Showing compiled routes that connect two AFP-ready manifests, plus the manifests participating in those handoffs.";
}

function compiledManifestMatchesAfpReadinessFocus(
  kind: CompiledAfpReadinessFocus | null,
  options: {
    manifestNodeId: string | null;
    readyManifestIds: Set<string>;
    readyHandoffManifestIds: Set<string>;
    afpGapKinds: CompiledAfpGapFilter[];
    afpCategory: "capability_boundary" | "decision_boundary" | "summary_boundary" | "orchestration_scaffold";
  },
): boolean {
  if (!kind || !options.manifestNodeId) {
    return true;
  }
  if (kind === "ready_manifests") {
    return options.readyManifestIds.has(options.manifestNodeId);
  }
  if (kind === "ready_handoffs") {
    return options.readyHandoffManifestIds.has(options.manifestNodeId);
  }
  return options.afpCategory === "orchestration_scaffold" || options.afpGapKinds.length > 0;
}

function compiledManifestEmptyStateMessage(options: {
  afpReadinessFocus: CompiledAfpReadinessFocus | null;
  orchestrationRoleFilter: CompiledOrchestrationRole | null;
  afpGapFilter: CompiledAfpGapFilter | null;
  afpFilter: "capability_boundary" | "decision_boundary" | "summary_boundary" | "orchestration_scaffold" | null;
  manifestLinkageFilter: "linked" | "inspector_only" | null;
}): string {
  if (options.afpReadinessFocus === "ready_manifests") {
    return "No AFP-ready manifests remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "needs_contract_work") {
    return "No manifests that still need AFP contract work remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "ready_handoffs") {
    return "No manifests participating in AFP-ready handoffs remain in the current review focus.";
  }
  if (options.manifestLinkageFilter === "linked") {
    return "No node-review-ready manifests remain in the current review focus.";
  }
  if (options.manifestLinkageFilter === "inspector_only") {
    return "No inspector-only manifests remain in the current review focus.";
  }
  if (options.orchestrationRoleFilter) {
    return "No compiled runtime manifests match the current orchestration-role review.";
  }
  if (options.afpGapFilter) {
    return "No compiled runtime manifests match the current AFP contract-gap review.";
  }
  if (options.afpFilter) {
    return "No compiled runtime manifests match the current AFP review focus.";
  }
  return "No compiled runtime manifests match the current review focus.";
}

function compiledRouteEmptyStateMessage(options: {
  afpReadinessFocus: CompiledAfpReadinessFocus | null;
  orchestrationRoleFilter: CompiledOrchestrationRole | null;
  routeLinkageFilter: "linked" | "manifest_only" | null;
  afpRouteFocus: "full" | "partial" | null;
}): string {
  if (options.afpReadinessFocus === "ready_handoffs") {
    return "No AFP-ready handoffs remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "ready_manifests") {
    return "No compiled routes touching AFP-ready manifests remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "needs_contract_work") {
    return "No compiled routes touching manifests that still need AFP contract work remain in the current review focus.";
  }
  if (options.orchestrationRoleFilter && options.routeLinkageFilter) {
    return "No compiled routes remain after applying the current orchestration role and route-review narrowing.";
  }
  if (options.routeLinkageFilter === "linked") {
    return "No branch-review-ready routes remain in the current review focus.";
  }
  if (options.routeLinkageFilter === "manifest_only") {
    return "No inspector-only routes remain in the current review focus.";
  }
  if (options.orchestrationRoleFilter) {
    return "No compiled routes match the current orchestration-role review.";
  }
  if (options.afpRouteFocus) {
    return "No compiled routes match the current AFP route review focus.";
  }
  return "No compiled routes match the current review focus.";
}

function recoveryReviewTargetMessage(kind: "compiled_manifest" | "compiled_route" | "branch_edge"): string {
  if (kind === "compiled_manifest") {
    return "This review target stays in inspector-only review context until its node review target is restored.";
  }
  if (kind === "compiled_route") {
    return "This review target stays in inspector-only review context until its route review target is restored.";
  }
  return "This review target stays in review-only context until its branch review target is restored.";
}

function compiledLinkageStatusLabel(kind: "manifest_linked" | "manifest_only" | "route_linked" | "route_manifest_only" | "route_source_linked" | "route_source_unavailable"): string {
  if (kind === "manifest_linked") {
    return "Node review available";
  }
  if (kind === "manifest_only") {
    return "Inspector-only manifest";
  }
  if (kind === "route_linked") {
    return "Branch review available";
  }
  if (kind === "route_manifest_only") {
    return "Inspector-only route";
  }
  if (kind === "route_source_linked") {
    return "Source review available";
  }
  return "Route review unavailable";
}

export function WorkflowsView() {
  const [selectedWorkflowId, setSelectedWorkflowId] = createSignal<string | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = createSignal<SavedWorkflow | null>(null);
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [selectedInspectorSection, setSelectedInspectorSection] = createSignal<"compiled_runtime_contract" | null>(null);
  const [selectedInspectorFocusSource, setSelectedInspectorFocusSource] = createSignal<"canvas_afp_badge" | "compiled_manifest" | "compiled_route" | null>(null);
  const [selectedInspectorFocusTarget, setSelectedInspectorFocusTarget] = createSignal<string | null>(null);
  const [selectedCompiledAfpFilter, setSelectedCompiledAfpFilter] = createSignal<"capability_boundary" | "decision_boundary" | "summary_boundary" | "orchestration_scaffold" | null>(null);
  const [selectedCompiledAfpGapFilter, setSelectedCompiledAfpGapFilter] = createSignal<CompiledAfpGapFilter | null>(null);
  const [selectedCompiledAfpReadinessFocus, setSelectedCompiledAfpReadinessFocus] = createSignal<CompiledAfpReadinessFocus | null>(null);
  const [selectedCompiledOrchestrationRole, setSelectedCompiledOrchestrationRole] = createSignal<CompiledOrchestrationRole | null>(null);
  const [selectedCompiledAfpRouteFocus, setSelectedCompiledAfpRouteFocus] = createSignal<"full" | "partial" | null>(null);
  const [selectedCompiledManifestLinkageFilter, setSelectedCompiledManifestLinkageFilter] = createSignal<"linked" | "inspector_only" | null>(null);
  const [selectedCompiledRouteLinkageFilter, setSelectedCompiledRouteLinkageFilter] = createSignal<"linked" | "manifest_only" | null>(null);
  const [selectedRunId, setSelectedRunId] = createSignal<string | null>(null);
  const [selectedRunEdgeId, setSelectedRunEdgeId] = createSignal<string | null>(null);
  const [workflowIntent, setWorkflowIntent] = createSignal("");
  const [intentPresetOverride, setIntentPresetOverride] = createSignal<PresetNodeKind | "">("");
  const [intentOptimizationOverride, setIntentOptimizationOverride] = createSignal<"balanced" | "speed" | "cost" | "">("");
  const [regenerationMode, setRegenerationMode] = createSignal<"rebuild" | "preserve_manual">("preserve_manual");
  const [selectedDescribeHistoryEventId, setSelectedDescribeHistoryEventId] = createSignal<string | null>(null);
  const [collapsedBranchFamilies, setCollapsedBranchFamilies] = createSignal<Set<string>>(new Set());
  const [feedback, setFeedback] = createSignal("");
  const [busyAction, setBusyAction] = createSignal<string | null>(null);
  const [liveRefreshUntil, setLiveRefreshUntil] = createSignal(0);
  const [validationResult, setValidationResult] = createSignal<WorkflowValidationResponse | null>(null);
  const [deploymentHistory, setDeploymentHistory] = createSignal<WorkflowDeployment[]>([]);
  const [rollbackPreviewDeploymentId, setRollbackPreviewDeploymentId] = createSignal<string | null>(null);
  const [selectedDeploymentRecordId, setSelectedDeploymentRecordId] = createSignal<string | null>(null);
  const [deployPreviewOpen, setDeployPreviewOpen] = createSignal(false);
  const [replayPreviewRunId, setReplayPreviewRunId] = createSignal<string | null>(null);
  const [runTimelineFilterMode, setRunTimelineFilterMode] = createSignal<RunTimelineFilterMode>("all");
  const [runTimelineFocusNodeId, setRunTimelineFocusNodeId] = createSignal<string | null>(null);
  const [runHistoryDriftFilter, setRunHistoryDriftFilter] = createSignal<RunHistoryDriftFilter>("all");
  const [runHistorySortMode, setRunHistorySortMode] = createSignal<RunHistorySortMode>("recent");
  const [persistedRunSelections, setPersistedRunSelections] = createSignal<Record<string, string>>({});
  const [persistedRunReviewContexts, setPersistedRunReviewContexts] = createSignal<Record<string, PersistedRunReviewContext>>({});
  const [persistedSharedReviewLinks, setPersistedSharedReviewLinks] = createSignal<Record<string, StoredSharedReviewLink[]>>({});
  const [persistedStoredSharedReviewUiContexts, setPersistedStoredSharedReviewUiContexts] = createSignal<Record<string, PersistedStoredSharedReviewUiContext>>({});
  const [selectedStoredSharedReviewId, setSelectedStoredSharedReviewId] = createSignal<string | null>(null);
  const [showAllStoredSharedReviews, setShowAllStoredSharedReviews] = createSignal(false);
  const [storedSharedReviewFilter, setStoredSharedReviewFilter] = createSignal("");
  const [storedSharedReviewSortMode, setStoredSharedReviewSortMode] = createSignal<"priority" | "recent">("priority");
  const [storedSharedReviewShareModeFilter, setStoredSharedReviewShareModeFilter] = createSignal<"all" | "workspace" | "core">("all");
  const [storedSharedReviewPinnedOnly, setStoredSharedReviewPinnedOnly] = createSignal(false);
  const [restoringRunReviewContext, setRestoringRunReviewContext] = createSignal(false);
  const [pendingUrlReviewState, setPendingUrlReviewState] = createSignal<ReviewUrlState | null>(null);
  const [sharedReviewBannerVisible, setSharedReviewBannerVisible] = createSignal(false);
  const [deployOverrideDraft, setDeployOverrideDraft] = createSignal<DeploymentOverrideDraft>(
    deploymentOverrideDraftForEnvironment("dev"),
  );
  const [deployFamilyOverrides, setDeployFamilyOverrides] = createSignal<Record<string, TargetedDeploymentOverrideDraft>>({});
  const [deployNodeOverrides, setDeployNodeOverrides] = createSignal<Record<string, TargetedDeploymentOverrideDraft>>({});
  const [runHistory, setRunHistory] = createSignal<WorkflowRun[]>([]);
  const [selectedRunWaitResumeRecords, setSelectedRunWaitResumeRecords] = createSignal<WorkflowWaitResumeRecord[]>([]);
  const [selectedRunWaitResumeLoading, setSelectedRunWaitResumeLoading] = createSignal(false);
  const [selectedRunWaitResumeError, setSelectedRunWaitResumeError] = createSignal<string | null>(null);
  const [configText, setConfigText] = createSignal("{}");
  const [policyText, setPolicyText] = createSignal("{}");
  const [edgeSource, setEdgeSource] = createSignal("");
  const [edgeTarget, setEdgeTarget] = createSignal("");
  const [edgeConditionLabel, setEdgeConditionLabel] = createSignal("");
  const [connectorAdapters, setConnectorAdapters] = createSignal<Record<string, unknown>>({});
  const [triggerRegistrations, setTriggerRegistrations] = createSignal<Record<string, unknown>[]>([]);
  const [triggerRegistrationsLoading, setTriggerRegistrationsLoading] = createSignal(false);
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
  const selectedRunWaitResumeSummary = createMemo(() => {
    const records = selectedRunWaitResumeRecords();
    let pending = 0;
    let activeFollowup = 0;
    let resolved = 0;
    for (const record of records) {
      if (record.status === "pending" || record.status === "wake_dispatched") pending += 1;
      else if (record.status === "continued_to_new_wait") activeFollowup += 1;
      else resolved += 1;
    }
    return {
      total: records.length,
      pending,
      activeFollowup,
      resolved,
    };
  });
  const latestRunForDeployment = (deploymentId: string | null | undefined) => {
    if (!deploymentId) return null;
    return runHistory().find((run) => run.deployment_id === deploymentId) ?? null;
  };
  const focusDeploymentRecord = (deploymentId: string | null | undefined) => {
    if (!deploymentId) return;
    setSelectedDeploymentRecordId(deploymentId);
    setDeployPreviewOpen(false);
    const deployment = deploymentHistoryById().get(deploymentId);
    if (deployment) {
      const activeForEnvironment = latestDeploymentForEnvironment(deploymentHistory(), deployment.environment);
      setRollbackPreviewDeploymentId(
        activeForEnvironment && activeForEnvironment.deployment_id !== deploymentId ? deploymentId : null,
      );
    } else {
      setRollbackPreviewDeploymentId(null);
    }
  };
  const focusPolicyDiffReview = (
    nodeId: string,
    filterMode: RunTimelineFilterMode,
    runId?: string | null,
  ) => {
    setSelectedNodeId(nodeId);
    setRunTimelineFocusNodeId(nodeId);
    setRunTimelineFilterMode(filterMode);
    setSelectedRunEdgeId(null);
    if (runId) setSelectedRunId(runId);
  };
  const applyRunReviewContext = (
    context: PersistedRunReviewContext | null,
    draft: WorkflowGraphDraft | null,
    deployments: WorkflowDeployment[],
  ) => {
    setRestoringRunReviewContext(true);
    if (!context) {
      setSelectedRunEdgeId(null);
      setRunTimelineFilterMode("all");
      setRunTimelineFocusNodeId(null);
      setSelectedDeploymentRecordId(null);
      Promise.resolve().then(() => setRestoringRunReviewContext(false));
      return;
    }
    const validNodeId = context.selected_node_id && draft?.nodes.some((node) => node.id === context.selected_node_id)
      ? context.selected_node_id
      : null;
    const validFocusedNodeId = context.focused_node_id && draft?.nodes.some((node) => node.id === context.focused_node_id)
      ? context.focused_node_id
      : null;
    const validEdgeId = context.selected_edge_id && draft?.edges.some((edge) => edge.id === context.selected_edge_id)
      ? context.selected_edge_id
      : null;
    const validDeploymentId = context.selected_deployment_id && deployments.some((deployment) => deployment.deployment_id === context.selected_deployment_id)
      ? context.selected_deployment_id
      : null;

    setSelectedNodeId(validNodeId);
    setSelectedRunEdgeId(validEdgeId);
    setRunTimelineFilterMode(context.timeline_filter ?? "all");
    setRunTimelineFocusNodeId(validFocusedNodeId);
    setSelectedDeploymentRecordId(validDeploymentId);
    Promise.resolve().then(() => setRestoringRunReviewContext(false));
  };
  const restoreRunReviewContextForWorkflow = (
    workflowId: string,
    draft: WorkflowGraphDraft | null,
    deployments: WorkflowDeployment[],
  ) => {
    const urlState = pendingUrlReviewState();
    const usingUrlState = urlState?.workflow_id === workflowId;
    const context = urlState?.workflow_id === workflowId
      ? {
          selected_edge_id: urlState.selected_edge_id,
          timeline_filter: urlState.timeline_filter,
          focused_node_id: urlState.focused_node_id,
          selected_deployment_id: urlState.selected_deployment_id,
          selected_node_id: urlState.selected_node_id,
        }
      : persistedRunReviewContexts()[workflowId] ?? null;
    applyRunReviewContext(context, draft, deployments);
    if (usingUrlState) {
      const sharedHref = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      persistSharedReviewLinkForWorkflow(
        workflowId,
        sharedHref,
        urlState?.selected_review_id
          || urlState?.show_all_saved_reviews
          || !!urlState?.saved_review_filter
          || urlState?.saved_review_sort_mode === "recent"
          ? "workspace"
          : "core",
      );
      setSharedReviewBannerVisible(true);
      setPendingUrlReviewState(null);
    }
  };
  const resetSharedInvestigationView = () => {
    setSharedReviewBannerVisible(false);
    setPendingUrlReviewState(null);
    setReplayPreviewRunId(null);
    setSelectedRunId(null);
    setSelectedRunEdgeId(null);
    setRunTimelineFilterMode("all");
    setRunTimelineFocusNodeId(null);
    setSelectedDeploymentRecordId(null);
    setRollbackPreviewDeploymentId(null);
    setSelectedNodeId(null);
    setRunHistoryDriftFilter("all");
    setRunHistorySortMode("recent");
    setFeedback("Reset the shared investigation view to the default workflow state.");
  };
  function inferStoredSharedReviewShareModeFromHref(href: string): "workspace" | "core" {
    try {
      const parsed = new URL(href, window.location.origin);
      const reviewState = parseReviewUrlStateFromSearch(parsed.search);
      if (
        reviewState?.selected_review_id
        || reviewState?.show_all_saved_reviews
        || !!reviewState?.saved_review_filter
        || reviewState?.saved_review_sort_mode === "recent"
      ) {
        return "workspace";
      }
    } catch {
      // Fall back to the lighter core-review mode if the stored URL cannot be parsed.
    }
    return "core";
  }
  function persistSharedReviewLinkForWorkflow(
    workflowId: string,
    href: string,
    shareMode?: "workspace" | "core",
  ) {
    const savedAt = new Date().toISOString();
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    const deploymentId =
      selectedDeploymentRecordId()
      ?? selectedRun()?.deployment_id
      ?? activeDeployment()?.deployment_id
      ?? null;
    const resolvedShareMode = shareMode ?? inferStoredSharedReviewShareModeFromHref(href);
    const nextEntryId = makeId("shared_review");
    setPersistedSharedReviewLinks((current) => {
      const previousEntries = current[workflowId] ?? [];
      const existing = previousEntries.find((entry) =>
        entry.href === href
        && entry.environment === environment
        && entry.deployment_id === deploymentId,
      );
      const nextEntry: StoredSharedReviewLink = existing
        ? { ...existing, saved_at: savedAt, share_mode: resolvedShareMode }
        : {
            id: nextEntryId,
            href,
            saved_at: savedAt,
            environment,
            deployment_id: deploymentId,
            share_mode: resolvedShareMode,
            title: null,
            pinned: false,
          };
      const nextEntries = [
        nextEntry,
        ...previousEntries.filter((entry) => entry.id !== nextEntry.id),
      ]
        .sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return Date.parse(right.saved_at) - Date.parse(left.saved_at);
        })
        .slice(0, 5);
      if (
        previousEntries.length === nextEntries.length
        && previousEntries.every((entry, index) =>
          entry.id === nextEntries[index]?.id
          && entry.saved_at === nextEntries[index]?.saved_at
          && entry.href === nextEntries[index]?.href
          && entry.environment === nextEntries[index]?.environment
          && entry.deployment_id === nextEntries[index]?.deployment_id
          && (entry.share_mode ?? inferStoredSharedReviewShareModeFromHref(entry.href)) === nextEntries[index]?.share_mode
          && entry.title === nextEntries[index]?.title
          && entry.pinned === nextEntries[index]?.pinned
        )
      ) {
        return current;
      }
      return { ...current, [workflowId]: nextEntries };
    });
    setSelectedStoredSharedReviewId(null);
  }
  function updateStoredSharedReviewForWorkflow(
    workflowId: string | null | undefined,
    reviewId: string | null | undefined,
    updater: (record: StoredSharedReviewLink) => StoredSharedReviewLink,
  ) {
    if (!workflowId || !reviewId) return;
    setPersistedSharedReviewLinks((current) => {
      const existing = current[workflowId] ?? [];
      let changed = false;
      const nextEntries = existing
        .map((entry) => {
          if (entry.id !== reviewId) return entry;
          changed = true;
          return updater(entry);
        })
        .sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return Date.parse(right.saved_at) - Date.parse(left.saved_at);
        });
      if (!changed) return current;
      return { ...current, [workflowId]: nextEntries };
    });
  }
  function clearStoredSharedReviewForWorkflow(workflowId: string | null | undefined, reviewId?: string | null) {
    if (!workflowId) return;
    setPersistedSharedReviewLinks((current) => {
      if (!(workflowId in current)) return current;
      const existing = current[workflowId] ?? [];
      if (!reviewId) {
        const next = { ...current };
        delete next[workflowId];
        return next;
      }
      const remaining = existing.filter((entry) => entry.id !== reviewId);
      if (remaining.length === existing.length) return current;
      const next = { ...current };
      if (remaining.length === 0) delete next[workflowId];
      else next[workflowId] = remaining;
      return next;
    });
  }
  const storedSharedReviewRecordsForCurrentWorkflow = createMemo(() => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (!workflowId) return [] as StoredSharedReviewLink[];
    return (persistedSharedReviewLinks()[workflowId] ?? []).filter((record) => {
      if (!record?.href) return false;
      try {
        const parsed = new URL(record.href, window.location.origin);
        const reviewState = parseReviewUrlStateFromSearch(parsed.search);
        return !reviewState?.workflow_id || reviewState.workflow_id === workflowId;
      } catch {
        return false;
      }
    });
  });
  createEffect(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const selectedId = selectedStoredSharedReviewId();
    if (selectedId && records.some((record) => record.id === selectedId)) return;
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const pendingUrlState = pendingUrlReviewState();
    const urlSelectedId = pendingUrlState?.workflow_id === workflowId ? pendingUrlState.selected_review_id : null;
    if (urlSelectedId && records.some((record) => record.id === urlSelectedId)) {
      setSelectedStoredSharedReviewId(urlSelectedId);
      return;
    }
    const persistedContext = workflowId ? persistedStoredSharedReviewUiContexts()[workflowId] : null;
    const persistedSelectedId = persistedContext?.selected_review_id ?? null;
    if (persistedSelectedId && records.some((record) => record.id === persistedSelectedId)) {
      setSelectedStoredSharedReviewId(persistedSelectedId);
      return;
    }
    setSelectedStoredSharedReviewId(records[0]?.id ?? null);
  });
  createEffect((previousWorkflowId: string | null | undefined) => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId() ?? null;
    if (workflowId === previousWorkflowId) return workflowId;
    const pendingUrlState = pendingUrlReviewState();
    const urlContext = pendingUrlState?.workflow_id === workflowId
      ? pendingUrlState
      : null;
    const persistedContext = workflowId ? persistedStoredSharedReviewUiContexts()[workflowId] : null;
    setShowAllStoredSharedReviews(urlContext?.show_all_saved_reviews ?? persistedContext?.show_all ?? false);
    setStoredSharedReviewFilter(urlContext?.saved_review_filter ?? persistedContext?.filter_text ?? "");
    setStoredSharedReviewSortMode(urlContext?.saved_review_sort_mode ?? persistedContext?.sort_mode ?? "priority");
    setStoredSharedReviewShareModeFilter(urlContext?.saved_review_share_mode_filter ?? persistedContext?.share_mode_filter ?? "all");
    setStoredSharedReviewPinnedOnly(urlContext?.saved_review_pinned_only ?? persistedContext?.pinned_only ?? false);
    return workflowId;
  });
  createEffect(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    if (records.length <= 4 && showAllStoredSharedReviews()) {
      setShowAllStoredSharedReviews(false);
    }
  });
  createEffect(() => {
    if (!showAllStoredSharedReviews() && storedSharedReviewFilter()) {
      setStoredSharedReviewFilter("");
    }
  });
  const storedSharedReviewRecordForCurrentWorkflow = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const selectedId = selectedStoredSharedReviewId();
    return records.find((record) => record.id === selectedId) ?? records[0] ?? null;
  });
  const storedSharedReviewLinkForCurrentWorkflow = createMemo(() => {
    return storedSharedReviewRecordForCurrentWorkflow()?.href ?? null;
  });
  const storedSharedReviewSavedAtLabel = createMemo(() => {
    const savedAt = storedSharedReviewRecordForCurrentWorkflow()?.saved_at;
    if (!savedAt) return null;
    const timestamp = Date.parse(savedAt);
    if (Number.isNaN(timestamp)) return savedAt;
    return new Date(timestamp).toLocaleString();
  });
  const storedSharedReviewTitle = createMemo(() => {
    return storedSharedReviewRecordForCurrentWorkflow()?.title?.trim() || null;
  });
  const storedSharedReviewSummary = createMemo(() => {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record?.href) return [] as string[];
    try {
      const parsed = new URL(record.href, window.location.origin);
      const reviewState = parseReviewUrlStateFromSearch(parsed.search);
      if (!reviewState) return [] as string[];
      const entries: string[] = [];
      entries.push((record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href)) === "workspace"
        ? "workspace snapshot"
        : "core review snapshot");
      if (reviewState.run_id) entries.push(`run ${reviewState.run_id.slice(0, 8)}`);
      if (reviewState.selected_edge_id) entries.push("branch focus");
      if (reviewState.timeline_filter !== "all") entries.push(`timeline ${timelineFilterSummaryLabel(reviewState.timeline_filter)}`);
      if (reviewState.focused_node_id) {
        const focusedNodeLabel = nodeLabelById().get(reviewState.focused_node_id) ?? reviewState.focused_node_id;
        entries.push(`focus ${focusedNodeLabel}`);
      }
      if (reviewState.selected_node_id) {
        const selectedNodeLabel = nodeLabelById().get(reviewState.selected_node_id) ?? reviewState.selected_node_id;
        entries.push(`node ${selectedNodeLabel}`);
      }
      if (reviewState.selected_deployment_id) entries.push(`deployment ${reviewState.selected_deployment_id.slice(0, 8)}`);
      if (reviewState.drift_filter !== "all") entries.push(`history ${reviewState.drift_filter} drift`);
      if (reviewState.sort_mode === "drift_desc") entries.push("sorted by highest drift");
      if (record.environment) entries.push(`env ${record.environment}`);
      if (record.deployment_id) entries.push(`saved dep ${record.deployment_id.slice(0, 8)}`);
      return entries;
    } catch {
      return [] as string[];
    }
  });
  const storedSharedReviewSelectorEntries = createMemo(() => {
    return storedSharedReviewRecordsForCurrentWorkflow().map((record, index) => {
      try {
        const parsed = new URL(record.href, window.location.origin);
        const reviewState = parseReviewUrlStateFromSearch(parsed.search);
        const shareModeLabel = (record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href)) === "workspace"
          ? "workspace"
          : "core";
        const labelParts: string[] = [];
        if (reviewState?.run_id) labelParts.push(`run ${reviewState.run_id.slice(0, 6)}`);
        if (record.title?.trim()) {
          return {
            id: record.id,
            label: record.title.trim(),
            pinned: record.pinned,
            share_mode: shareModeLabel,
          };
        }
        if (record.environment) labelParts.push(record.environment);
        if (reviewState?.timeline_filter && reviewState.timeline_filter !== "all") {
          labelParts.push(reviewState.timeline_filter === "deployment_context" ? "deploy" : "replay");
        }
        if (reviewState?.drift_filter && reviewState.drift_filter !== "all") {
          labelParts.push(`${reviewState.drift_filter} drift`);
        }
        if (labelParts.length === 0 && record.deployment_id) {
          labelParts.push(`dep ${record.deployment_id.slice(0, 6)}`);
        }
        return {
          id: record.id,
          label: labelParts.slice(0, 2).join(" - ") || `saved ${index + 1}`,
          pinned: record.pinned,
          share_mode: shareModeLabel,
        };
      } catch {
        return {
          id: record.id,
          label: `saved ${index + 1}`,
          pinned: record.pinned,
          share_mode: "core" as const,
        };
      }
    });
  });
  const selectedStoredSharedReviewSelectorEntry = createMemo(() => {
    const selectedId = selectedStoredSharedReviewId();
    if (!selectedId) return null;
    return storedSharedReviewSelectorEntries().find((entry) => entry.id === selectedId) ?? null;
  });
  const storedSharedReviewShareModeCounts = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    let workspace = 0;
    let core = 0;
    for (const record of records) {
      const shareMode = record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href);
      if (shareMode === "workspace") workspace += 1;
      else core += 1;
    }
    return {
      all: records.length,
      workspace,
      core,
    };
  });
  const storedSharedReviewCompositionSummary = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const pinned = records.filter((record) => record.pinned).length;
    const counts = storedSharedReviewShareModeCounts();
    const entries: Array<{
      key: "all" | "pinned" | "workspace" | "core";
      label: string;
      active: boolean;
    }> = [];
    entries.push({
      key: "all",
      label: `${counts.all} saved`,
      active: storedSharedReviewShareModeFilter() === "all" && !storedSharedReviewFilter().trim() && !storedSharedReviewPinnedOnly(),
    });
    if (pinned > 0) {
      entries.push({
        key: "pinned",
        label: `${pinned} pinned`,
        active: storedSharedReviewPinnedOnly(),
      });
    }
    if (counts.workspace > 0) {
      entries.push({
        key: "workspace",
        label: `${counts.workspace} workspace`,
        active: storedSharedReviewShareModeFilter() === "workspace",
      });
    }
    if (counts.core > 0) {
      entries.push({
        key: "core",
        label: `${counts.core} core`,
        active: storedSharedReviewShareModeFilter() === "core",
      });
    }
    return entries;
  });
  function applyStoredSharedReviewCompositionFocus(key: "all" | "pinned" | "workspace" | "core") {
    setShowAllStoredSharedReviews(true);
    if (key === "all") {
      setStoredSharedReviewPinnedOnly(false);
      setStoredSharedReviewShareModeFilter("all");
      setStoredSharedReviewFilter("");
      return;
    }
    if (key === "pinned") {
      setStoredSharedReviewSortMode("priority");
      setStoredSharedReviewPinnedOnly(true);
      return;
    }
    setStoredSharedReviewPinnedOnly(false);
    setStoredSharedReviewShareModeFilter(key);
  }
  function storedSharedReviewCompositionChipClass(key: "all" | "pinned" | "workspace" | "core", active: boolean) {
    if (key === "all") {
      return active
        ? "border-violet-300 bg-violet-100 text-violet-800"
        : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
    }
    if (key === "pinned") {
      return active
        ? "border-amber-300 bg-amber-100 text-amber-800"
        : "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
    }
    return active
      ? "border-sky-300 bg-sky-100 text-sky-800"
      : "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
  }
  function storedSharedReviewCompositionActionLabel(key: "all" | "pinned" | "workspace" | "core") {
    if (key === "all") return "Show all saved reviews";
    if (key === "pinned") return "Focus pinned saved reviews";
    if (key === "workspace") return "Focus workspace snapshots";
    return "Focus core snapshots";
  }
  function storedSharedReviewShareModeActionLabel(mode: "all" | "workspace" | "core") {
    if (mode === "all") return "Show all saved-review share modes";
    if (mode === "workspace") return "Show only workspace snapshots";
    return "Show only core review snapshots";
  }
  function storedSharedReviewSortActionLabel(mode: "priority" | "recent") {
    if (mode === "priority") return "Sort saved reviews by pinned priority";
    return "Sort saved reviews by most recent first";
  }
  function storedSharedReviewSelectorEntryActionLabel(entry: {
    label: string;
    pinned: boolean;
    share_mode: string;
  }, selected: boolean) {
    const prefix = selected ? "Reopen saved review" : "Open saved review";
    const details = [entry.label];
    if (entry.pinned) details.push("pinned");
    details.push(entry.share_mode === "workspace" ? "workspace snapshot" : "core snapshot");
    return `${prefix}: ${details.join(", ")}`;
  }
  function storedSharedReviewExpandActionLabel(hiddenCount: number) {
    return `Expand saved-review selector to show ${hiddenCount} more snapshots`;
  }
  function storedSharedReviewCollapseActionLabel() {
    return "Collapse the saved-review selector";
  }
  const storedSharedReviewActiveFilters = createMemo(() => {
    const entries: Array<{
      key: "pinned_only" | "share_mode" | "search";
      label: string;
      priority: number;
    }> = [];
    if (storedSharedReviewPinnedOnly()) {
      entries.push({ key: "pinned_only", label: "Pinned only", priority: 0 });
    }
    if (storedSharedReviewShareModeFilter() !== "all") {
      entries.push({
        key: "share_mode",
        label: storedSharedReviewShareModeFilter() === "workspace" ? "Workspace only" : "Core only",
        priority: 1,
      });
    }
    if (storedSharedReviewFilter().trim()) {
      entries.push({
        key: "search",
        label: `Search: ${storedSharedReviewFilter().trim()}`,
        priority: 2,
      });
    }
    return entries.sort((left, right) => left.priority - right.priority);
  });
  const storedSharedReviewHasMultipleActiveFilters = createMemo(() => storedSharedReviewActiveFilters().length > 1);
  const storedSharedReviewPreviewContextSummary = createMemo(() => {
    const entries: Array<{
      key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode";
      label: string;
    }> = [];
    if (showAllStoredSharedReviews()) entries.push({ key: "expanded", label: "expanded selector" });
    if (storedSharedReviewPinnedOnly()) entries.push({ key: "pinned_only", label: "pinned only" });
    if (storedSharedReviewShareModeFilter() !== "all") {
      entries.push({
        key: "share_mode",
        label: storedSharedReviewShareModeFilter() === "workspace" ? "workspace only" : "core only",
      });
    }
    if (storedSharedReviewFilter().trim()) {
      entries.push({ key: "search", label: `search ${storedSharedReviewFilter().trim()}` });
    }
    if (storedSharedReviewSortMode() === "recent") entries.push({ key: "sort_mode", label: "recent sort" });
    return entries;
  });
  const storedSharedReviewHasMultiplePreviewContextEntries = createMemo(
    () => storedSharedReviewPreviewContextSummary().length > 1,
  );
  function clearStoredSharedReviewPreviewContext(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    if (key === "expanded") {
      setShowAllStoredSharedReviews(false);
      return;
    }
    if (key === "sort_mode") {
      setStoredSharedReviewSortMode("priority");
      return;
    }
    if (key === "pinned_only" || key === "share_mode" || key === "search") {
      clearStoredSharedReviewActiveFilter(key);
    }
  }
  function resetStoredSharedReviewPreviewContext() {
    setShowAllStoredSharedReviews(false);
    setStoredSharedReviewSortMode("priority");
    resetStoredSharedReviewSelectorNarrowing();
  }
  function storedSharedReviewPreviewContextClass(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    if (key === "pinned_only") {
      return "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
    }
    if (key === "share_mode") {
      return "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
    }
    if (key === "search") {
      return "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
    }
    return "border-slate-200/70 bg-slate-100/85 text-slate-700 hover:bg-slate-200/80";
  }
  function storedSharedReviewPreviewContextActionLabel(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    if (key === "expanded") return "Collapse the saved-review selector";
    if (key === "pinned_only") return "Clear pinned-only focus";
    if (key === "share_mode") return "Clear share-mode focus";
    if (key === "search") return "Clear saved-review search";
    return "Reset saved-review sort to priority";
  }
  function storedSharedReviewActiveFilterClass(key: "pinned_only" | "share_mode" | "search") {
    if (key === "pinned_only") {
      return "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
    }
    if (key === "share_mode") {
      return "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
    }
    return "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
  }
  function storedSharedReviewActiveFilterActionLabel(key: "pinned_only" | "share_mode" | "search") {
    if (key === "pinned_only") return "Clear pinned-only focus";
    if (key === "share_mode") return "Clear share-mode focus";
    return "Clear saved-review search";
  }
  function storedSharedReviewLegendClass(key: "pinned_only" | "share_mode" | "search") {
    return storedSharedReviewActiveFilterClass(key)
      .replace(" hover:bg-amber-100", "")
      .replace(" hover:bg-sky-100", "")
      .replace(" hover:bg-white", "");
  }
  function storedSharedReviewLegendActionLabel(target: "pinned" | "workspace" | "core" | "clear_search" | null) {
    if (target === "pinned") return "Focus pinned saved reviews";
    if (target === "workspace") return "Focus workspace snapshots";
    if (target === "core") return "Focus core snapshots";
    if (target === "clear_search") return "Clear saved-review search";
    return null;
  }
  const storedSharedReviewToneLegendEntries = createMemo(() => {
    const entries: Array<{
      key: "pinned_only" | "share_mode" | "search";
      label: string;
      target: "pinned" | "workspace" | "core" | "clear_search" | null;
    }> = [];
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const hasPinned = records.some((record) => record.pinned) || storedSharedReviewPinnedOnly();
    const hasShareMode =
      records.some((record) => (record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href)) !== "core")
      || storedSharedReviewShareModeFilter() !== "all";
    const hasSearch = !!storedSharedReviewFilter().trim();
    const counts = storedSharedReviewShareModeCounts();
    if (hasPinned) entries.push({ key: "pinned_only", label: "Pinned focus", target: "pinned" });
    if (hasShareMode) {
      const activeShareMode = storedSharedReviewShareModeFilter();
      const target = activeShareMode === "workspace" || activeShareMode === "core"
        ? activeShareMode
        : counts.workspace > 0
          ? "workspace"
          : counts.core > 0
            ? "core"
            : null;
      entries.push({ key: "share_mode", label: "Share mode", target });
    }
    if (hasSearch || entries.length === 0) {
      entries.push({
        key: "search",
        label: "Search or general",
        target: hasSearch ? "clear_search" : null,
      });
    }
    return entries;
  });
  function clearStoredSharedReviewActiveFilter(key: "pinned_only" | "share_mode" | "search") {
    if (key === "pinned_only") {
      setStoredSharedReviewPinnedOnly(false);
      return;
    }
    if (key === "share_mode") {
      setStoredSharedReviewShareModeFilter("all");
      return;
    }
    setStoredSharedReviewFilter("");
  }
  function resetStoredSharedReviewSelectorNarrowing() {
    setStoredSharedReviewPinnedOnly(false);
    setStoredSharedReviewShareModeFilter("all");
    setStoredSharedReviewFilter("");
  }
  const storedSharedReviewEmptyStateLabel = createMemo(() => {
    const shareModeFilter = storedSharedReviewShareModeFilter();
    if (shareModeFilter === "workspace") {
      return "No workspace snapshots match this view. Share or refresh a full workspace investigation link to create one.";
    }
    if (shareModeFilter === "core") {
      return "No core review snapshots match this view. Share a core review link to create one without the saved-review workspace shell.";
    }
    return "No saved reviews match this filter.";
  });
  const storedSharedReviewEmptyStateActions = createMemo(() => {
    const entries: Array<{
      key: "search" | "share_mode" | "pinned_only";
      label: string;
    }> = [];
    if (storedSharedReviewFilter().trim()) {
      entries.push({ key: "search", label: "Clear search" });
    }
    if (storedSharedReviewShareModeFilter() !== "all") {
      entries.push({ key: "share_mode", label: "Show all share modes" });
    }
    if (storedSharedReviewPinnedOnly()) {
      entries.push({ key: "pinned_only", label: "Show all saved reviews" });
    }
    return entries;
  });
  const filteredStoredSharedReviewSelectorEntries = createMemo(() => {
    const filter = storedSharedReviewFilter().trim().toLowerCase();
    const shareModeFilter = storedSharedReviewShareModeFilter();
    const pinnedOnly = storedSharedReviewPinnedOnly();
    const baseEntries = storedSharedReviewSelectorEntries();
    const entries = storedSharedReviewSortMode() === "recent"
      ? [...baseEntries].sort((left, right) => {
          const leftRecord = storedSharedReviewRecordsForCurrentWorkflow().find((record) => record.id === left.id);
          const rightRecord = storedSharedReviewRecordsForCurrentWorkflow().find((record) => record.id === right.id);
          return Date.parse(rightRecord?.saved_at ?? "") - Date.parse(leftRecord?.saved_at ?? "");
        })
      : baseEntries;
    return entries.filter((entry) => {
      const record = storedSharedReviewRecordsForCurrentWorkflow().find((candidate) => candidate.id === entry.id);
      const entryShareMode = record?.share_mode ?? (record?.href ? inferStoredSharedReviewShareModeFromHref(record.href) : "core");
      if (pinnedOnly && !entry.pinned) return false;
      if (shareModeFilter !== "all" && entryShareMode !== shareModeFilter) return false;
      if (!filter) return true;
      return entry.label.toLowerCase().includes(filter);
    });
  });
  const visibleStoredSharedReviewSelectorEntries = createMemo(() => {
    const entries = filteredStoredSharedReviewSelectorEntries();
    return showAllStoredSharedReviews() ? entries : entries.slice(0, 4);
  });
  const groupedStoredSharedReviewSelectorEntries = createMemo(() => {
    const entries = filteredStoredSharedReviewSelectorEntries();
    if (storedSharedReviewSortMode() === "recent") {
      return {
        pinned: [] as typeof entries,
        recent: entries,
      };
    }
    return {
      pinned: entries.filter((entry) => entry.pinned),
      recent: entries.filter((entry) => !entry.pinned),
    };
  });
  const storedSharedReviewStaleness = createMemo(() => {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record?.saved_at) return null;
    const savedAt = Date.parse(record.saved_at);
    if (Number.isNaN(savedAt)) return null;
    const latestDeploymentTimestamp = deploymentHistory().reduce((latest, deployment) => {
      const next = Date.parse(deployment.deployed_at ?? "");
      return Number.isNaN(next) ? latest : Math.max(latest, next);
    }, 0);
    const latestRunTimestamp = runHistory().reduce((latest, run) => {
      const next = Date.parse(run.started_at ?? "");
      return Number.isNaN(next) ? latest : Math.max(latest, next);
    }, 0);
    const newerDeployment = latestDeploymentTimestamp > savedAt;
    const newerRun = latestRunTimestamp > savedAt;
    if (!newerDeployment && !newerRun) return null;
    const reasons: string[] = [];
    if (newerDeployment) reasons.push("newer deployment");
    if (newerRun) reasons.push("newer run history");
    return {
      reasons,
      label: `stale: ${reasons.join(" and ")}`,
    };
  });
  const storedSharedReviewScopeMismatch = createMemo(() => {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record) return null;
    const currentEnvironment = graph()?.environment === "prod" ? "prod" : "dev";
    const currentDeploymentId =
      selectedDeploymentRecordId()
      ?? selectedRun()?.deployment_id
      ?? activeDeployment()?.deployment_id
      ?? null;
    const reasons: string[] = [];
    if (record.environment && record.environment !== currentEnvironment) {
      reasons.push(`saved for ${record.environment}`);
    }
    if (record.deployment_id && currentDeploymentId && record.deployment_id !== currentDeploymentId) {
      reasons.push("different deployment");
    }
    if (reasons.length === 0) return null;
    return {
      reasons,
      label: `scope mismatch: ${reasons.join(" and ")}`,
    };
  });
  const storedSharedReviewMatchesCurrentView = createMemo(() => {
    const href = storedSharedReviewLinkForCurrentWorkflow();
    if (!href) return false;
    try {
      const stored = new URL(href, window.location.origin);
      const current = new URL(window.location.href);
      return `${stored.pathname}${stored.search}${stored.hash}` === `${current.pathname}${current.search}${current.hash}`;
    } catch {
      return false;
    }
  });
  const applyReviewUrlNavigationState = (urlState: ReviewUrlState | null) => {
    if (!urlState) {
      setSharedReviewBannerVisible(false);
      setPendingUrlReviewState(null);
      setReplayPreviewRunId(null);
      setRollbackPreviewDeploymentId(null);
      setSelectedRunEdgeId(null);
      setRunTimelineFilterMode("all");
      setRunTimelineFocusNodeId(null);
      setSelectedDeploymentRecordId(null);
      setSelectedNodeId(null);
      setRunHistoryDriftFilter("all");
      setRunHistorySortMode("recent");
      const workflowId = currentWorkflow()?.workflow_id;
      const persistedRunId = workflowId ? persistedRunSelections()[workflowId] : null;
      setSelectedRunId(
        persistedRunId && runHistory().some((run) => run.run_id === persistedRunId)
          ? persistedRunId
          : runHistory()[0]?.run_id ?? null,
      );
      return;
    }

    setRunHistoryDriftFilter(urlState.drift_filter);
    setRunHistorySortMode(urlState.sort_mode);
    setReplayPreviewRunId(null);
    setRollbackPreviewDeploymentId(null);

    const currentWorkflowId = currentWorkflow()?.workflow_id;
    if (urlState.workflow_id && urlState.workflow_id !== currentWorkflowId) {
      setPendingUrlReviewState(urlState);
      void loadWorkflow(urlState.workflow_id);
      return;
    }

    setPendingUrlReviewState(urlState);
    const nextRunId = urlState.run_id;
    setSelectedRunId(
      nextRunId && runHistory().some((run) => run.run_id === nextRunId)
        ? nextRunId
        : runHistory()[0]?.run_id ?? null,
    );
    setSelectedStoredSharedReviewId(urlState.selected_review_id);
    setShowAllStoredSharedReviews(urlState.show_all_saved_reviews);
    setStoredSharedReviewFilter(urlState.saved_review_filter);
    setStoredSharedReviewSortMode(urlState.saved_review_sort_mode);
    applyRunReviewContext(
      {
        selected_edge_id: urlState.selected_edge_id,
        timeline_filter: urlState.timeline_filter,
        focused_node_id: urlState.focused_node_id,
        selected_deployment_id: urlState.selected_deployment_id,
        selected_node_id: urlState.selected_node_id,
      },
      graph(),
      deploymentHistory(),
    );
    setSharedReviewBannerVisible(true);
    setPendingUrlReviewState(null);
  };
  createEffect(() => {
    selectedRunId();
    if (restoringRunReviewContext()) return;
    setRunTimelineFilterMode("all");
    setRunTimelineFocusNodeId(null);
  });
  const activeDeployment = createMemo(() => {
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    return latestDeploymentForEnvironment(deploymentHistory(), environment);
  });
  const nodeDeploymentPolicies = createMemo(() => {
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    const deployment = activeDeployment();
    const draft = graph();
    const policies = new Map<string, NodeDeploymentPolicy>();
    if (!draft) return policies;
    for (const node of draft.nodes) {
      const policy = nodeDeploymentPolicyFromDeployment(node, deployment, environment);
      if (policy) policies.set(node.id, policy);
    }
    return policies;
  });
  const pendingNodeDeploymentPolicies = createMemo(() => {
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    const draft = graph();
    const policies = new Map<string, PendingNodeDeploymentPolicy>();
    if (!draft) return policies;
    for (const node of draft.nodes) {
      const policy = pendingDeploymentPolicyForNode(
        node,
        environment,
        deployOverrideDraft(),
        deployFamilyOverrides(),
        deployNodeOverrides(),
      );
      if (policy) policies.set(node.id, policy);
    }
    return policies;
  });
  const pendingDeploymentChangeSummary = createMemo(() => {
    const draft = graph();
    if (!draft) return { changedNodeCount: 0, pendingNodeCount: 0 };
    let changedNodeCount = 0;
    let pendingNodeCount = 0;
    for (const node of draft.nodes) {
      const pendingPolicy = pendingNodeDeploymentPolicies().get(node.id);
      if (!pendingPolicy) continue;
      pendingNodeCount += 1;
      const deployedPolicy = nodeDeploymentPolicies().get(node.id);
      if (deploymentPolicyChanges(deployedPolicy?.fields, pendingPolicy.fields).length > 0) {
        changedNodeCount += 1;
      }
    }
    return { changedNodeCount, pendingNodeCount };
  });
  const deployPreviewDiff = createMemo(() => {
    const draft = graph();
    if (!draft) return [] as Array<{ nodeId: string; label: string; changes: NodeDeploymentPolicyChange[] }>;
    const entries: Array<{ nodeId: string; label: string; changes: NodeDeploymentPolicyChange[] }> = [];
    for (const node of draft.nodes) {
      const pendingPolicy = pendingNodeDeploymentPolicies().get(node.id);
      if (!pendingPolicy) continue;
      const deployedPolicy = nodeDeploymentPolicies().get(node.id);
      const changes = deploymentPolicyChanges(deployedPolicy?.fields, pendingPolicy.fields);
      if (changes.length > 0) {
        entries.push({
          nodeId: node.id,
          label: node.label,
          changes,
        });
      }
    }
    return entries;
  });
  const deploymentHistoryById = createMemo(() => {
    const entries = new Map<string, WorkflowDeployment>();
    for (const deployment of deploymentHistory()) {
      entries.set(deployment.deployment_id, deployment);
    }
    return entries;
  });
  const nodeLabelById = createMemo(() => {
    const labels = new Map<string, string>();
    const draft = graph();
    if (!draft) return labels;
    for (const node of draft.nodes) {
      labels.set(node.id, node.label);
    }
    return labels;
  });
  const selectedRunEdge = () => {
    const draft = graph();
    const edgeId = selectedRunEdgeId();
    return draft?.edges.find((edge) => edge.id === edgeId) ?? null;
  };
  const currentSavedReviewWorkspaceActive = createMemo(() => {
    return !!selectedStoredSharedReviewSelectorEntry()
      || showAllStoredSharedReviews()
      || !!storedSharedReviewFilter().trim()
      || storedSharedReviewSortMode() === "recent";
  });
  const sharedReviewBannerSummary = createMemo(() => {
    if (!sharedReviewBannerVisible()) return [] as string[];
    const entries: string[] = [];
    const workflow = currentWorkflow();
    const run = selectedRun();
    const edge = selectedRunEdge();
    const focusedNodeLabel = runTimelineFocusNodeId()
      ? nodeLabelById().get(runTimelineFocusNodeId()!) ?? runTimelineFocusNodeId()
      : null;
    const selectedNodeLabel = selectedNodeId()
      ? nodeLabelById().get(selectedNodeId()!) ?? selectedNodeId()
      : null;
    const deployment = selectedDeploymentRecordId()
      ? deploymentHistoryById().get(selectedDeploymentRecordId()!) ?? null
      : null;

    if (workflow) entries.push(`workflow ${workflow.title}`);
    if (run) entries.push(`run ${run.run_id.slice(0, 8)}`);
    if (edge) entries.push(`branch ${edge.condition_label?.trim() || `${edge.source} -> ${edge.target}`}`);
    if (runTimelineFilterMode() !== "all") entries.push(`timeline ${timelineFilterSummaryLabel(runTimelineFilterMode())}`);
    if (focusedNodeLabel) entries.push(`focus ${focusedNodeLabel}`);
    if (selectedNodeLabel) entries.push(`node ${selectedNodeLabel}`);
    if (deployment) entries.push(`deployment ${deployment.environment}:${deployment.deployment_id.slice(0, 8)}`);
    if (runHistoryDriftFilter() !== "all") entries.push(`history ${runHistoryDriftFilter()} drift`);
    if (runHistorySortMode() === "drift_desc") entries.push("sorted by highest drift");
    const selectedSavedReview = selectedStoredSharedReviewSelectorEntry();
    if (selectedSavedReview) entries.push(`saved review ${selectedSavedReview.label}`);
    if (showAllStoredSharedReviews()) entries.push("saved reviews expanded");
    if (storedSharedReviewFilter().trim()) entries.push(`saved review filter ${storedSharedReviewFilter().trim()}`);
    if (storedSharedReviewSortMode() === "recent") entries.push("saved reviews sorted by recent");
    if (storedSharedReviewShareModeFilter() !== "all") entries.push(`saved reviews ${storedSharedReviewShareModeFilter()} only`);
    if (storedSharedReviewPinnedOnly()) entries.push("saved reviews pinned only");
    return entries;
  });
  const intentExpansion = () => {
    const intent = workflowIntent().trim();
    if (!intent) return null;
    const base = expandWorkflowIntent(intent);
    return {
      ...base,
      preset_kind: intentPresetOverride() || base.preset_kind,
      optimization_mode: intentOptimizationOverride() || base.optimization_mode,
    };
  };
  const regenerationImpact = () => {
    if (!workflowIntent().trim() || !currentWorkflow()) return null;
    return regenerationImpactSummary();
  };
  const selectedDescribeHistoryEntry = () => {
    const workflow = currentWorkflow();
    const eventId = selectedDescribeHistoryEventId();
    if (!workflow || !eventId) return null;
    return describeHistoryEntries(normalizeGraph(workflow)).find((entry) => entry.event_id === eventId) ?? null;
  };
  const describeHistoryComparison = () => {
    const workflow = currentWorkflow();
    const entry = selectedDescribeHistoryEntry();
    if (!workflow || !entry) return null;
    const draft = normalizeGraph(workflow);
    const currentIntent =
      workflowIntent().trim() ||
      (typeof draft.metadata["source_intent"] === "string" ? String(draft.metadata["source_intent"]) : "") ||
      (workflow.description ?? "").trim();
    const currentPreset =
      (intentPresetOverride() || (typeof draft.metadata["inferred_preset"] === "string" ? String(draft.metadata["inferred_preset"]) : "")) || "";
    const currentOptimization =
      (intentOptimizationOverride() || (typeof draft.optimization_mode === "string" ? draft.optimization_mode : "balanced")) || "balanced";
    const currentRegeneration = regenerationMode();
    const currentCore = generatedCoreSummary(draft);
    const preservation = regenerationPreservationEstimate(draft, currentRegeneration);
    const estimatedEntryCore = estimatedGeneratedCoreForIntent(
      entry.intent,
      (entry.preset_kind as PresetNodeKind | undefined) ?? "",
    );
    return {
      intentChanged: currentIntent.trim() !== entry.intent.trim(),
      presetChanged: Boolean(entry.preset_kind) && currentPreset !== (entry.preset_kind ?? ""),
      optimizationChanged: Boolean(entry.optimization_mode) && currentOptimization !== (entry.optimization_mode ?? ""),
      regenerationChanged: Boolean(entry.regeneration_mode) && currentRegeneration !== (entry.regeneration_mode ?? "preserve_manual"),
      currentNodeCount: draft.nodes.length,
      currentEdgeCount: draft.edges.length,
      currentGeneratedNodeCount: currentCore.generatedNodeCount,
      currentGeneratedEdgeCount: currentCore.generatedEdgeCount,
      protectedNodeCount: currentCore.protectedNodeCount,
      protectedEdgeCount: currentCore.protectedEdgeCount,
      estimatedGeneratedNodeCount: estimatedEntryCore.estimatedNodeCount,
      estimatedGeneratedEdgeCount: estimatedEntryCore.estimatedEdgeCount,
      estimatedPresetKind: estimatedEntryCore.presetKind,
      estimatedNeedsApproval: estimatedEntryCore.requiresApproval,
      estimatedNeedsBranching: estimatedEntryCore.needsBranching,
      estimatedNeedsResearchSupport: estimatedEntryCore.needsResearchSupport,
      preservedManualNodeCount: preservation.preservedManualNodeCount,
      preservedManualEdgeCount: preservation.preservedManualEdgeCount,
      preservedProtectedNodeCount: preservation.preservedProtectedNodeCount,
      preservedProtectedEdgeCount: preservation.preservedProtectedEdgeCount,
    };
  };
  const selectedRunStatuses = () => runNodeStatuses(selectedRun());
  const selectedRunStepOrder = () => runStepOrder(selectedRun());
  const selectedRunEdgeStates = () => runEdgeStates(graph(), selectedRun());
  const selectedRunEdgeTimeline = () => runTimelineSliceForEdge(graph(), selectedRun(), selectedRunEdgeId());
  const selectedRunNodePolicyDeltas = createMemo(() => {
    const run = selectedRun();
    const draft = graph();
    const deltas = new Map<string, { source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null }>();
    if (!run || !draft) return deltas;
    const deploymentLookup = deploymentHistoryById();
    for (const node of draft.nodes) {
      const delta = runNodePolicyDeltaSummary(run, deploymentLookup, node.id);
      if (delta) deltas.set(node.id, delta);
    }
    return deltas;
  });
  const selectedRunEdgePolicyDeltas = createMemo(() => {
    const run = selectedRun();
    const draft = graph();
    const deltas = new Map<string, { nodeId: string; relation: "from" | "to" | "related"; source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null }>();
    if (!run || !draft) return deltas;
    const deploymentLookup = deploymentHistoryById();
    for (const edge of draft.edges) {
      const delta = runEdgePolicyDeltaSummary(draft, run, deploymentLookup, edge.id);
      if (delta) deltas.set(edge.id, delta);
    }
    return deltas;
  });
  const runHistoryEntries = createMemo(() => {
    const draft = graph();
    const deploymentLookup = deploymentHistoryById();
    const filterMode = runHistoryDriftFilter();
    const sortMode = runHistorySortMode();
    const entries = runHistory().map((run) => {
      const drift = runPolicyDriftSummary(draft, run, deploymentLookup);
      const deploymentImpact = drift.deploymentNodeCount + drift.deploymentEdgeCount;
      const replayImpact = drift.replayNodeCount + drift.replayEdgeCount;
      const totalImpact = deploymentImpact + replayImpact;
      return {
        run,
        drift,
        deploymentImpact,
        replayImpact,
        totalImpact,
      };
    }).filter((entry) => {
      switch (filterMode) {
        case "deployment":
          return entry.deploymentImpact > 0;
        case "replay":
          return entry.replayImpact > 0;
        case "any":
          return entry.totalImpact > 0;
        case "all":
        default:
          return true;
      }
    });

    entries.sort((left, right) => {
      if (sortMode === "drift_desc") {
        const impactDelta = right.totalImpact - left.totalImpact;
        if (impactDelta !== 0) return impactDelta;
      }
      return Date.parse(right.run.started_at ?? "") - Date.parse(left.run.started_at ?? "");
    });
    return entries;
  });
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
    const preferredWorkflowId = pendingUrlReviewState()?.workflow_id;
    const nextWorkflowId = preferredWorkflowId && available.some((workflow) => workflow.workflow_id === preferredWorkflowId)
      ? preferredWorkflowId
      : available[0].workflow_id;
    void loadWorkflow(nextWorkflowId);
  });

  createEffect(() => {
    const draft = graph();
    const selectedEdgeId = selectedRunEdgeId();
    if (!selectedEdgeId) return;
    if (!draft?.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedRunEdgeId(null);
    }
  });

  createEffect((previousRunId: string | null | undefined) => {
    const runId = selectedRun()?.run_id ?? null;
    if (!restoringRunReviewContext() && previousRunId !== undefined && runId !== previousRunId) {
      setSelectedRunEdgeId(null);
    }
    return runId;
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const runId = selectedRun()?.run_id ?? selectedRunId();
    if (!workflowId || !runId) {
      setSelectedRunWaitResumeRecords([]);
      setSelectedRunWaitResumeError(null);
      setSelectedRunWaitResumeLoading(false);
      return;
    }
    void refreshSelectedRunWaitResumeRecords(workflowId, runId);
  });

  createEffect(() => {
    const node = selectedNode();
    setConfigText(JSON.stringify(node?.config ?? {}, null, 2));
    setPolicyText(JSON.stringify(node?.policy ?? {}, null, 2));
  });

  createEffect(() => {
    const available = workflows() ?? [];
    if (!available.length) return;
    const validFamilyIds = new Set(available.map((workflow) => branchFamilyRootId(workflow)));
    const current = collapsedBranchFamilies();
    const next = new Set([...current].filter((familyId) => validFamilyIds.has(familyId)));
    if (next.size !== current.size) {
      setCollapsedBranchFamilies(next);
    }
  });

  createEffect(() => {
    const workflowId = selectedWorkflowId();
    const available = workflows() ?? [];
    if (!workflowId || !available.length) return;
    const selected = available.find((workflow) => workflow.workflow_id === workflowId);
    if (!selected) return;
    const familyRootId = branchFamilyRootId(selected);
    if (!collapsedBranchFamilies().has(familyRootId)) return;
    setCollapsedBranchFamilies((current) => {
      if (!current.has(familyRootId)) return current;
      const next = new Set(current);
      next.delete(familyRootId);
      return next;
    });
  });

  createEffect(() => {
    const collapsed = [...collapsedBranchFamilies()];
    try {
      window.localStorage.setItem(
        WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY,
        JSON.stringify(collapsed),
      );
    } catch {
      // Ignore local persistence failures and keep the in-memory session state.
    }
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    const runId = selectedRunId();
    if (!workflowId || !runId) return;
    setPersistedRunSelections((current) => current[workflowId] === runId ? current : { ...current, [workflowId]: runId });
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId) return;
    const nextContext: PersistedRunReviewContext = {
      selected_edge_id: selectedRunEdgeId(),
      timeline_filter: runTimelineFilterMode(),
      focused_node_id: runTimelineFocusNodeId(),
      selected_deployment_id: selectedDeploymentRecordId(),
      selected_node_id: selectedNodeId(),
    };
    setPersistedRunReviewContexts((current) => {
      const previous = current[workflowId];
      if (previous
        && previous.selected_edge_id === nextContext.selected_edge_id
        && previous.timeline_filter === nextContext.timeline_filter
        && previous.focused_node_id === nextContext.focused_node_id
        && previous.selected_deployment_id === nextContext.selected_deployment_id
        && previous.selected_node_id === nextContext.selected_node_id) {
        return current;
      }
      return { ...current, [workflowId]: nextContext };
    });
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId) return;
    const nextContext: PersistedStoredSharedReviewUiContext = {
      selected_review_id: selectedStoredSharedReviewId(),
      show_all: showAllStoredSharedReviews(),
      filter_text: storedSharedReviewFilter(),
      sort_mode: storedSharedReviewSortMode(),
      share_mode_filter: storedSharedReviewShareModeFilter(),
      pinned_only: storedSharedReviewPinnedOnly(),
    };
    setPersistedStoredSharedReviewUiContexts((current) => {
      const previous = current[workflowId];
      if (previous
        && previous.selected_review_id === nextContext.selected_review_id
        && previous.show_all === nextContext.show_all
        && previous.filter_text === nextContext.filter_text
        && previous.sort_mode === nextContext.sort_mode
        && previous.share_mode_filter === nextContext.share_mode_filter
        && previous.pinned_only === nextContext.pinned_only) {
        return current;
      }
      return { ...current, [workflowId]: nextContext };
    });
  });

  createEffect(() => {
    const reviewState = {
      drift_filter: runHistoryDriftFilter(),
      sort_mode: runHistorySortMode(),
      selected_runs: persistedRunSelections(),
      review_contexts: persistedRunReviewContexts(),
      shared_review_ui_contexts: persistedStoredSharedReviewUiContexts(),
    };
    try {
      window.localStorage.setItem(
        WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY,
        JSON.stringify(reviewState),
      );
    } catch {
      // Ignore local persistence failures and keep the in-memory review state.
    }
  });

  createEffect(() => {
    try {
      window.localStorage.setItem(
        WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY,
        JSON.stringify(persistedSharedReviewLinks()),
      );
    } catch {
      // Ignore local persistence failures and keep the in-memory shared review links.
    }
  });

  createEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const runId = selectedRunId();
    const selectedEdgeId = selectedRunEdgeId();
    const timelineFilter = runTimelineFilterMode();
    const focusedNodeId = runTimelineFocusNodeId();
    const selectedDeploymentId = selectedDeploymentRecordId();
    const selectedNode = selectedNodeId();
    const driftFilter = runHistoryDriftFilter();
    const sortMode = runHistorySortMode();
    const selectedReviewId = selectedStoredSharedReviewId();
    const showAllSavedReviews = showAllStoredSharedReviews();
    const savedReviewFilter = storedSharedReviewFilter();
    const savedReviewSortMode = storedSharedReviewSortMode();
    const savedReviewShareModeFilter = storedSharedReviewShareModeFilter();
    const savedReviewPinnedOnly = storedSharedReviewPinnedOnly();

    const setOrDelete = (key: string, value: string | null, defaultValue?: string) => {
      if (!value || (defaultValue !== undefined && value === defaultValue)) params.delete(key);
      else params.set(key, value);
    };

    setOrDelete("wf", workflowId ?? null);
    setOrDelete("run", runId);
    setOrDelete("edge", selectedEdgeId);
    setOrDelete("tf", timelineFilter, "all");
    setOrDelete("focus", focusedNodeId);
    setOrDelete("dep", selectedDeploymentId);
    setOrDelete("node", selectedNode);
    setOrDelete("rdf", driftFilter, "all");
    setOrDelete("rds", sortMode, "recent");
    setOrDelete("srid", selectedReviewId);
    setOrDelete("sra", showAllSavedReviews ? "1" : null);
    setOrDelete("srf", savedReviewFilter);
    setOrDelete("srsm", savedReviewSortMode, "priority");
    setOrDelete("srmf", savedReviewShareModeFilter, "all");
    setOrDelete("srpo", savedReviewPinnedOnly ? "1" : null);

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, "", nextUrl);
    }
  });

  function extendLiveRefreshWindow(durationMs = 15000) {
    setLiveRefreshUntil(Date.now() + durationMs);
  }

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId || !workflowExecutionRefreshing()) return;
    void refreshDeploymentHistory(workflowId);
    void refreshRunHistory(workflowId);
    const runId = selectedRun()?.run_id ?? selectedRunId();
    if (runId) void refreshSelectedRunWaitResumeRecords(workflowId, runId);
    const interval = window.setInterval(() => {
      void refreshDeploymentHistory(workflowId);
      void refreshRunHistory(workflowId);
      const nextRunId = selectedRun()?.run_id ?? selectedRunId();
      if (nextRunId) void refreshSelectedRunWaitResumeRecords(workflowId, nextRunId);
    }, 2500);
    onCleanup(() => window.clearInterval(interval));
  });

  onMount(() => {
    try {
      const raw = window.localStorage.getItem(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCollapsedBranchFamilies(
            new Set(parsed.filter((entry): entry is string => typeof entry === "string")),
          );
        }
      }
    } catch {
      // Ignore local persistence failures and fall back to the default expanded state.
    }
    try {
      const raw = window.localStorage.getItem(WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.drift_filter === "all" || parsed.drift_filter === "deployment" || parsed.drift_filter === "replay" || parsed.drift_filter === "any") {
          setRunHistoryDriftFilter(parsed.drift_filter);
        }
        if (parsed.sort_mode === "recent" || parsed.sort_mode === "drift_desc") {
          setRunHistorySortMode(parsed.sort_mode);
        }
        if (parsed.selected_runs && typeof parsed.selected_runs === "object") {
          setPersistedRunSelections(
            Object.fromEntries(
              Object.entries(parsed.selected_runs as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"),
            ),
          );
        }
        if (parsed.review_contexts && typeof parsed.review_contexts === "object") {
          setPersistedRunReviewContexts(
            Object.fromEntries(
              Object.entries(parsed.review_contexts as Record<string, unknown>)
                .filter((entry): entry is [string, PersistedRunReviewContext] => {
                  if (typeof entry[0] !== "string" || !entry[1] || typeof entry[1] !== "object") return false;
                  const context = entry[1] as Record<string, unknown>;
                  return (context.timeline_filter === "all"
                    || context.timeline_filter === "deployment_context"
                    || context.timeline_filter === "replay_drift");
                })
                .map(([workflowId, context]) => {
                  const record = context as Record<string, unknown>;
                  return [workflowId, {
                    selected_edge_id: typeof record.selected_edge_id === "string" ? record.selected_edge_id : null,
                    timeline_filter: record.timeline_filter as RunTimelineFilterMode,
                    focused_node_id: typeof record.focused_node_id === "string" ? record.focused_node_id : null,
                    selected_deployment_id: typeof record.selected_deployment_id === "string" ? record.selected_deployment_id : null,
                    selected_node_id: typeof record.selected_node_id === "string" ? record.selected_node_id : null,
                  }];
                }),
            ),
          );
        }
        if (parsed.shared_review_ui_contexts && typeof parsed.shared_review_ui_contexts === "object") {
          setPersistedStoredSharedReviewUiContexts(
            Object.fromEntries(
              Object.entries(parsed.shared_review_ui_contexts as Record<string, unknown>)
                .filter((entry): entry is [string, PersistedStoredSharedReviewUiContext] => {
                  if (typeof entry[0] !== "string" || !entry[1] || typeof entry[1] !== "object") return false;
                  const context = entry[1] as Record<string, unknown>;
                  return context.sort_mode === "priority" || context.sort_mode === "recent";
                })
                .map(([workflowId, context]) => {
                  const record = context as Record<string, unknown>;
                  return [workflowId, {
                    selected_review_id: typeof record.selected_review_id === "string" ? record.selected_review_id : null,
                    show_all: record.show_all === true,
                    filter_text: typeof record.filter_text === "string" ? record.filter_text : "",
                    sort_mode: record.sort_mode === "recent" ? "recent" : "priority",
                    share_mode_filter:
                      record.share_mode_filter === "workspace" || record.share_mode_filter === "core"
                        ? record.share_mode_filter
                        : "all",
                    pinned_only: record.pinned_only === true,
                  }];
                }),
            ),
          );
        }
      }
    } catch {
      // Ignore local persistence failures and fall back to the default run review state.
    }
    try {
      const raw = window.localStorage.getItem(WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        setPersistedSharedReviewLinks(
          Object.fromEntries(
            Object.entries(parsed)
              .map(([workflowId, value]) => {
                if (typeof workflowId !== "string") return null;
                const normalizeRecord = (recordValue: unknown): StoredSharedReviewLink | null => {
                if (typeof recordValue === "string") {
                  return {
                      id: makeId("shared_review"),
                      href: recordValue,
                      saved_at: new Date().toISOString(),
                      environment: null,
                      deployment_id: null,
                      share_mode: inferStoredSharedReviewShareModeFromHref(recordValue),
                      title: null,
                      pinned: false,
                    };
                  }
                  if (!recordValue || typeof recordValue !== "object") return null;
                  const record = recordValue as Record<string, unknown>;
                  if (typeof record.href !== "string") return null;
                  return {
                    id: typeof record.id === "string" ? record.id : makeId("shared_review"),
                    href: record.href,
                    saved_at: typeof record.saved_at === "string" ? record.saved_at : new Date().toISOString(),
                    environment: typeof record.environment === "string" ? record.environment : null,
                    deployment_id: typeof record.deployment_id === "string" ? record.deployment_id : null,
                    share_mode:
                      record.share_mode === "workspace" || record.share_mode === "core"
                        ? record.share_mode
                        : inferStoredSharedReviewShareModeFromHref(record.href),
                    title: typeof record.title === "string" ? record.title : null,
                    pinned: record.pinned === true,
                  };
                };
                if (Array.isArray(value)) {
                  const entries = value
                    .map((entry) => normalizeRecord(entry))
                    .filter((entry): entry is StoredSharedReviewLink => Boolean(entry));
                  return entries.length > 0 ? [workflowId, entries.slice(0, 5)] as const : null;
                }
                const normalized = normalizeRecord(value);
                return normalized ? [workflowId, [normalized]] as const : null;
              })
              .filter((entry): entry is readonly [string, StoredSharedReviewLink[]] => Boolean(entry)),
          ),
        );
      }
    } catch {
      // Ignore local persistence failures and fall back to the default shared review link state.
    }
    try {
      const urlState = parseReviewUrlStateFromSearch(window.location.search);
      if (urlState) {
        setRunHistoryDriftFilter(urlState.drift_filter);
        setRunHistorySortMode(urlState.sort_mode);
        setPendingUrlReviewState(urlState);
      }
    } catch {
      // Ignore malformed review URL state and fall back to local defaults.
    }
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
    const handlePopState = () => {
      try {
        applyReviewUrlNavigationState(parseReviewUrlStateFromSearch(window.location.search));
      } catch {
        applyReviewUrlNavigationState(null);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("popstate", handlePopState);
    onCleanup(() => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("popstate", handlePopState);
    });
    // Load connector adapter registry once on mount so node panels can show family descriptions.
    void getWorkflowConnectorAdapters().then((response) => {
      if (response.adapters && typeof response.adapters === "object") {
        setConnectorAdapters(response.adapters);
      }
    }).catch(() => { /* Non-fatal; adapters panel degrades gracefully */ });
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
      // Load trigger registrations non-fatally.
      setTriggerRegistrationsLoading(true);
      void listWorkflowTriggerRegistrations(workflowId).then((response) => {
        setTriggerRegistrations(response.registrations ?? []);
      }).catch(() => {
        setTriggerRegistrations([]);
      }).finally(() => {
        setTriggerRegistrationsLoading(false);
      });
      const pendingUrlState = pendingUrlReviewState();
      const urlRunId = pendingUrlState?.workflow_id === workflow.workflow_id ? pendingUrlState.run_id : null;
      const persistedRunId = persistedRunSelections()[workflow.workflow_id];
      setSelectedRunId(
        urlRunId && runs.runs.some((run) => run.run_id === urlRunId)
          ? urlRunId
          : runs.runs.some((run) => run.run_id === persistedRunId)
          ? persistedRunId
          : runs.runs[0]?.run_id ?? null,
      );
      restoreRunReviewContextForWorkflow(workflow.workflow_id, normalizeGraph(workflow), deployments.deployments);
      setValidationResult(null);
    } catch (error) {
      setFeedback(`Could not load workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function siblingBranchCount(workflow: SavedWorkflow) {
    return branchFamilyWorkflows(workflow, workflows() ?? []).length;
  }

  function siblingBranches(workflow: SavedWorkflow) {
    return branchFamilyWorkflows(workflow, workflows() ?? []);
  }

  function workflowsForRail() {
    return orderedWorkflowsForRail(workflows() ?? []);
  }

  function branchFamilyCollapsed(rootId: string) {
    return collapsedBranchFamilies().has(rootId);
  }

  function toggleBranchFamily(rootId: string) {
    setCollapsedBranchFamilies((current) => {
      const next = new Set(current);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  function branchWorkflowVisibleInRail(workflow: SavedWorkflow) {
    const rootId = branchFamilyRootId(workflow);
    if (!branchFamilyCollapsed(rootId)) return true;
    if (!isBranchChildWorkflow(workflow)) return true;
    return selectedWorkflowId() === workflow.workflow_id;
  }

  function branchFamilyRootIdsWithChildren() {
    const available = workflows() ?? [];
    return new Set<string>(
      available
        .filter((workflow) => !isBranchChildWorkflow(workflow) && siblingBranchCount(workflow) > 0)
        .map((workflow) => workflow.workflow_id),
    );
  }

  function branchFamilySummary() {
    const familyIds = branchFamilyRootIdsWithChildren();
    const collapsed = [...collapsedBranchFamilies()].filter((familyId) => familyIds.has(familyId));
    return {
      familyCount: familyIds.size,
      collapsedCount: collapsed.length,
    };
  }

  function expandAllBranchFamilies() {
    setCollapsedBranchFamilies(new Set<string>());
  }

  function collapseOtherBranchFamilies() {
    const rootIds = branchFamilyRootIdsWithChildren();
    const selected = (workflows() ?? []).find((workflow) => workflow.workflow_id === selectedWorkflowId());
    const selectedRootId = selected ? branchFamilyRootId(selected) : null;
    const next = new Set<string>();
    for (const rootId of rootIds) {
      if (rootId !== selectedRootId) next.add(rootId);
    }
    setCollapsedBranchFamilies(next);
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

  function instantiatePresetStarterSubgraph(
    preset: PresetNodeKind,
    index: number,
    source: "palette" | "intent_builder" = "palette",
  ) {
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
      const config = node.config as Record<string, unknown>;
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

  function insertNodeBetween(
    graphDraft: WorkflowGraphDraft,
    previousNodeId: string,
    nextNodeId: string,
    node: WorkflowNodeDraft,
    edgeLabel?: string,
  ) {
    const edgeIndex = graphDraft.edges.findIndex((edge) => edge.source === previousNodeId && edge.target === nextNodeId);
    if (edgeIndex >= 0) {
      graphDraft.edges.splice(edgeIndex, 1);
    }
    graphDraft.nodes.push(node);
    graphDraft.edges.push(
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
    );
  }

  function augmentWorkflowForIntent(
    graphDraft: WorkflowGraphDraft,
    intent: string,
    preset: PresetNodeKind,
    templateId: string,
  ) {
    const expansion = expandWorkflowIntent(intent);
    graphDraft.optimization_mode = expansion.optimization_mode;

    if (expansion.public_output) {
      const firstAgent = graphDraft.nodes.find((node) => node.kind === "agent");
      if (firstAgent) {
        firstAgent.policy = {
          ...firstAgent.policy,
          mask: "public",
        };
      }
    }

    if (expansion.needs_research_support && !graphDraft.nodes.some((node) => typeof node.config.capability_id === "string" && node.config.capability_id === "web_search")) {
      const firstToolOrTerminal = graphDraft.nodes.find((node) => node.kind === "tool" || node.kind === "termination");
      const firstAgent = graphDraft.nodes.find((node) => node.kind === "agent");
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
        insertNodeBetween(graphDraft, firstAgent.id, firstToolOrTerminal.id, supportNode);
        graphDraft.template_bindings.push({
          template_id: templateId,
          slot_name: "gather_slot",
          node_ids: [supportNode.id],
          metadata: {
            preset_kind: preset,
            generated_by: "intent_builder",
            augmentation: "research_support",
          },
        });
      }
    }

    if (expansion.requires_approval && !graphDraft.nodes.some((node) => node.kind === "approval")) {
      const terminalNode = [...graphDraft.nodes].reverse().find((node) => node.kind === "termination");
      const previousNode = terminalNode
        ? [...graphDraft.edges]
            .reverse()
            .find((edge) => edge.target === terminalNode.id)
            ?.source
        : undefined;
      if (terminalNode && previousNode) {
        const upstreamNode = graphDraft.nodes.find((node) => node.id === previousNode);
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
          insertNodeBetween(graphDraft, upstreamNode.id, terminalNode.id, approvalNode);
          graphDraft.template_bindings.push({
            template_id: templateId,
            slot_name: "approval_slot",
            node_ids: [approvalNode.id],
            metadata: {
              preset_kind: preset,
              generated_by: "intent_builder",
              augmentation: "approval_gate",
            },
          });
        }
      }
    }

    if (expansion.needs_branching && !graphDraft.nodes.some((node) => node.kind === "condition")) {
      const firstAgent = graphDraft.nodes.find((node) => node.kind === "agent");
      const firstNonTriggerTarget = firstAgent
        ? graphDraft.edges.find((edge) => edge.source === firstAgent.id)?.target
        : undefined;
      const nextNode = firstNonTriggerTarget
        ? graphDraft.nodes.find((node) => node.id === firstNonTriggerTarget)
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
        insertNodeBetween(graphDraft, firstAgent.id, nextNode.id, conditionNode, "success");
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
        graphDraft.nodes.push(fallbackNode);
        graphDraft.edges.push({
          id: makeId("edge"),
          source: conditionNode.id,
          target: fallbackNode.id,
          condition_label: "fallback",
          metadata: {
            generated_by: "intent_builder",
          },
        });
        graphDraft.template_bindings.push({
          template_id: templateId,
          slot_name: "check_slot",
          node_ids: [conditionNode.id],
          metadata: {
            preset_kind: preset,
            generated_by: "intent_builder",
            augmentation: "branching",
          },
        });
      }
    }
  }

  function isIntentGeneratedRecord(value: unknown) {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const metadata = record.metadata;
    return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).generated_by === "intent_builder");
  }

  function regenerationImpactSummary() {
    const workflow = currentWorkflow();
    if (!workflow) return null;
    const draft = normalizeGraph(workflow);
    const lockedNodeIds = protectedNodeIdsForGraph(draft);
    const generatedNodes = draft.nodes.filter((node) => isIntentGeneratedRecord(node)).length;
    const lockedNodes = lockedNodeIds.size;
    const preservedNodes = draft.nodes.filter((node) => !isIntentGeneratedRecord(node) || lockedNodeIds.has(node.id)).length;
    const generatedEdges = draft.edges.filter((edge) => isIntentGeneratedRecord(edge)).length;
    const preservedEdges = draft.edges.filter((edge) => !isIntentGeneratedRecord(edge) || lockedNodeIds.has(edge.source) || lockedNodeIds.has(edge.target)).length;
    return {
      generatedNodes,
      lockedNodes,
      preservedNodes,
      generatedEdges,
      preservedEdges,
    };
  }

  function buildWorkflowFromIntent(intent: string, baseWorkflow?: SavedWorkflow | null) {
    const expansion = intentExpansion() ?? expandWorkflowIntent(intent);
    const preset = expansion.preset_kind;
    const workflow = baseWorkflow ? cloneJson(baseWorkflow) : makeNewWorkflow();
    const draft = baseWorkflow ? normalizeGraph(workflow) : normalizeGraph(workflow);
    const triggerNode = draft.nodes[0];
    const subgraph = instantiatePresetStarterSubgraph(preset, draft.nodes.length, "intent_builder");

    const defaultTriggerCfg = presetDefaultTriggerConfig(preset);
    triggerNode.label = "Intent trigger";
    triggerNode.description = "Start this generated workflow from a natural-language objective.";
    triggerNode.config = {
      ...triggerNode.config,
      ...defaultTriggerCfg,
      event_filter: {
        objective: intent,
      },
    };
    triggerNode.metadata = {
      ...triggerNode.metadata,
      generated_by: "intent_builder",
    };

    const nextGraph: WorkflowGraphDraft = {
      ...draft,
      title: suggestWorkflowTitleFromIntent(intent, preset),
      description: intent,
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
        source_intent: intent,
        inferred_preset: preset,
        intent_expansion: expansion as unknown as Record<string, unknown>,
        preset_template_ids: [subgraph.templateId],
      },
    };
    augmentWorkflowForIntent(nextGraph, intent, preset, subgraph.templateId);

    if (baseWorkflow && regenerationMode() === "preserve_manual") {
      const baseGraph = normalizeGraph(baseWorkflow);
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

      nextGraph.nodes = [...nextGraph.nodes, ...preservedNodes];
      nextGraph.edges = [...nextGraph.edges, ...preservedEdges];
      nextGraph.presets = [...nextGraph.presets, ...preservedPresets];
      nextGraph.template_bindings = [...nextGraph.template_bindings, ...preservedTemplateBindings];
      nextGraph.metadata = {
        ...nextGraph.metadata,
        preserved_manual_nodes: preservedNodes.length,
        preserved_manual_edges: preservedEdges.length,
        preserved_locked_nodes: preservedLockedNodes,
        regeneration_mode: "preserve_manual",
      };
    } else {
      nextGraph.metadata = {
        ...nextGraph.metadata,
        regeneration_mode: "rebuild",
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
      updated_at: new Date().toISOString(),
    };
  }

  function applyDescribeHistoryEntry(entry: DescribeHistoryEntry) {
    setWorkflowIntent(entry.intent);
    setIntentPresetOverride((entry.preset_kind as PresetNodeKind | undefined) ?? "");
    setIntentOptimizationOverride(
      entry.optimization_mode === "speed" || entry.optimization_mode === "cost" || entry.optimization_mode === "balanced"
        ? entry.optimization_mode
        : "",
    );
    setRegenerationMode(entry.regeneration_mode === "rebuild" ? "rebuild" : "preserve_manual");
  }

  async function saveWorkflowBranchFromDescribeHistory(entry: DescribeHistoryEntry) {
    setBusyAction("describe");
    setFeedback("");
    try {
      const described = await describeWorkflow({
        intent: entry.intent,
        preset_override: (entry.preset_kind as PresetNodeKind | undefined) ?? undefined,
        optimization_override:
          entry.optimization_mode === "balanced" ||
          entry.optimization_mode === "speed" ||
          entry.optimization_mode === "cost"
            ? entry.optimization_mode
            : undefined,
        regeneration_mode:
          entry.regeneration_mode === "rebuild" ? "rebuild" : "preserve_manual",
        save_draft: true,
        branch_from_workflow_id: currentWorkflow()?.workflow_id,
        branch_from_event_id: entry.event_id,
      });
      const branched = cloneJson(described.workflow);
      setCurrentWorkflow(branched);
      setSelectedWorkflowId(branched.workflow_id);
      setSelectedNodeId(
        normalizeGraph(branched).nodes[1]?.id ??
          normalizeGraph(branched).nodes[0]?.id ??
          null,
      );
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent(entry.intent);
      setIntentPresetOverride((entry.preset_kind as PresetNodeKind | undefined) ?? "");
      setIntentOptimizationOverride(
        entry.optimization_mode === "balanced" ||
          entry.optimization_mode === "speed" ||
          entry.optimization_mode === "cost"
          ? entry.optimization_mode
          : "",
      );
      setRegenerationMode(
        entry.regeneration_mode === "rebuild" ? "rebuild" : "preserve_manual",
      );
      mutate((current) => {
        const list = current ?? [];
        const idx = list.findIndex((item) => item.workflow_id === branched.workflow_id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = branched;
          return next;
        }
        return [branched, ...list];
      });
      setFeedback("Saved a new workflow branch from this describe event.");
    } catch (error) {
      setFeedback(
        `Could not save branch from describe history: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function createWorkflowFromIntent() {
    const intent = workflowIntent().trim();
    if (!intent) {
      setFeedback("Describe the workflow you want to build first.");
      return;
    }
    setBusyAction("describe");
    setFeedback("");
    try {
      const described = await describeWorkflow({
        intent,
        preset_override: intentPresetOverride() || undefined,
        optimization_override: intentOptimizationOverride() || undefined,
        regeneration_mode: regenerationMode(),
        save_draft: true,
      });
      const nextWorkflow = cloneJson(described.workflow);
      setCurrentWorkflow(nextWorkflow);
      setSelectedWorkflowId(nextWorkflow.workflow_id);
      setSelectedNodeId(normalizeGraph(nextWorkflow).nodes[1]?.id ?? normalizeGraph(nextWorkflow).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent("");
      setIntentPresetOverride("");
      setIntentOptimizationOverride("");
      mutate((current) => {
        const list = current ?? [];
        const idx = list.findIndex((entry) => entry.workflow_id === nextWorkflow.workflow_id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = nextWorkflow;
          return next;
        }
        return [nextWorkflow, ...list];
      });
      setFeedback(`Generated a ${titleCase(nextWorkflow.preset_kinds[0] ?? "research_assistant")} starter workflow from your description.`);
    } catch (error) {
      const nextWorkflow = buildWorkflowFromIntent(intent);
      setCurrentWorkflow(nextWorkflow);
      setSelectedWorkflowId(nextWorkflow.workflow_id);
      setSelectedNodeId(normalizeGraph(nextWorkflow).nodes[1]?.id ?? normalizeGraph(nextWorkflow).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setFeedback(`Used local describe fallback: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function regenerateCurrentWorkflowFromIntent() {
    const workflow = currentWorkflow();
    if (!workflow) {
      setFeedback("Select a workflow to regenerate it from description.");
      return;
    }
    const sourceIntent =
      workflowIntent().trim() ||
      (typeof normalizeGraph(workflow).metadata["source_intent"] === "string"
        ? String(normalizeGraph(workflow).metadata["source_intent"])
        : "") ||
      (workflow.description ?? "").trim();
    if (!sourceIntent) {
      setFeedback("This workflow does not have a saved description to regenerate from.");
      return;
    }

    setBusyAction("describe");
    setFeedback("");
    try {
      const described = await describeWorkflow({
        intent: sourceIntent,
        base_workflow: workflow,
        preset_override: intentPresetOverride() || undefined,
        optimization_override: intentOptimizationOverride() || undefined,
        regeneration_mode: regenerationMode(),
      });
      const regenerated = cloneJson(described.workflow);
      setCurrentWorkflow(regenerated);
      setSelectedWorkflowId(regenerated.workflow_id);
      setSelectedNodeId(normalizeGraph(regenerated).nodes[1]?.id ?? normalizeGraph(regenerated).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent(sourceIntent);
    setFeedback("Regenerated the workflow draft from its description. Save when you’re happy with the updated graph.");
    } catch (error) {
      const regenerated = buildWorkflowFromIntent(sourceIntent, workflow);
      setCurrentWorkflow(regenerated);
      setSelectedWorkflowId(regenerated.workflow_id);
      setSelectedNodeId(normalizeGraph(regenerated).nodes[1]?.id ?? normalizeGraph(regenerated).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent(sourceIntent);
      setFeedback(`Used local regeneration fallback: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function addNode(kind: string, preset?: string) {
    if (workflowInteractionLocked()) return;
    const draft = graph();
    const index = draft?.nodes.length ?? 0;
    if (preset) {
      const presetKind = preset as PresetNodeKind;
      const { templateId, nextNodes, nextEdges, presetRecord, templateBindings } = instantiatePresetStarterSubgraph(
        presetKind,
        index,
      );
      updateGraph((current) => ({
        ...current,
        nodes: [...current.nodes, ...nextNodes],
        edges: [...current.edges, ...nextEdges],
        presets: [...current.presets, presetRecord],
        template_id: current.nodes.length === 0 ? templateId : current.template_id,
        template_version: current.nodes.length === 0 ? "omnyid-subagent-template.v1" : current.template_version,
        template_bindings: [...current.template_bindings, ...templateBindings],
        root_node_ids: current.root_node_ids.length ? current.root_node_ids : [nextNodes[0].id],
        metadata: {
          ...current.metadata,
          preset_template_ids: Array.from(
            new Set([
              ...(Array.isArray(current.metadata.preset_template_ids) ? current.metadata.preset_template_ids.filter((value): value is string => typeof value === "string") : []),
              templateId,
            ]),
          ),
        },
      }));
      setSelectedNodeId(nextNodes[0].id);
      setFeedback(`Added ${titleCase(preset)} starter workflow.`);
      return;
    }
    const node: WorkflowNodeDraft = {
      id: makeId("node"),
      kind,
      label: `${titleCase(kind)} node`,
      description: `${titleCase(kind)} primitive node.`,
      position: { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 120 },
      config: defaultConfig(kind),
      policy: defaultPolicy(),
      prompt: undefined,
      hidden_runtime_nodes: runtimeHints(kind),
      metadata: {},
    };
    updateGraph((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      presets: current.presets,
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
      : {
          ...draft,
          edges: [
            ...draft.edges,
            {
              id: makeId("edge"),
              source,
              target,
              condition_label: edgeConditionLabel().trim() || undefined,
              metadata: {},
            },
          ],
        });
    setEdgeTarget("");
    setEdgeConditionLabel("");
    setFeedback("Added edge.");
    void handleWorkflowPatch({
      op: "edge_add",
      source,
      target,
      condition_label: edgeConditionLabel().trim() || undefined,
    });
  }

  function patchEdgeConditionLabel(edgeId: string, conditionLabel: string) {
    if (workflowInteractionLocked()) return;
    updateGraph((draft) => ({
      ...draft,
      edges: draft.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              condition_label: conditionLabel.trim() || undefined,
            }
          : edge,
      ),
    }));
    void handleWorkflowPatch({
      op: "edge_meta_replace",
      edge_id: edgeId,
      condition_label: conditionLabel.trim() || undefined,
    });
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
      | { op: "edge_add"; source: string; target: string; condition_label?: string }
      | { op: "edge_meta_replace"; edge_id: string; condition_label?: string }
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
      const persistedRunId = persistedRunSelections()[workflowId];
      setSelectedRunId((current) => {
        if (current && response.runs.some((run) => run.run_id === current)) return current;
        if (persistedRunId && response.runs.some((run) => run.run_id === persistedRunId)) return persistedRunId;
        return response.runs[0]?.run_id ?? null;
      });
      const workflow = currentWorkflow();
      if (workflow?.workflow_id === workflowId) {
        restoreRunReviewContextForWorkflow(workflowId, normalizeGraph(workflow), deploymentHistory());
      }
    } catch {
      setRunHistory([]);
      setSelectedRunId(null);
    }
  }

  async function refreshSelectedRunWaitResumeRecords(workflowId: string, runId: string) {
    setSelectedRunWaitResumeLoading(true);
    setSelectedRunWaitResumeError(null);
    try {
      const response = await listWorkflowWaitResumeRecords(workflowId, runId);
      setSelectedRunWaitResumeRecords(response.wait_resume_records);
    } catch (error) {
      setSelectedRunWaitResumeRecords([]);
      setSelectedRunWaitResumeError(error instanceof Error ? error.message : String(error));
    } finally {
      setSelectedRunWaitResumeLoading(false);
    }
  }

  function buildReviewLink(includeSavedReviewWorkspace: boolean) {
    const url = new URL(window.location.href);
    if (!includeSavedReviewWorkspace) {
      url.searchParams.delete("srid");
      url.searchParams.delete("sra");
      url.searchParams.delete("srf");
      url.searchParams.delete("srsm");
    }
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  }

  async function copyReviewLink(includeSavedReviewWorkspace = true) {
    setFeedback("");
    const href = buildReviewLink(includeSavedReviewWorkspace);
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (workflowId) {
      persistSharedReviewLinkForWorkflow(workflowId, href, includeSavedReviewWorkspace ? "workspace" : "core");
    }
    const savedReviewWorkspaceActive = currentSavedReviewWorkspaceActive();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
        setFeedback(includeSavedReviewWorkspace && savedReviewWorkspaceActive
          ? "Copied investigation link to clipboard with the current run review and saved-review workspace context."
          : "Copied investigation link to clipboard with the current run review context only.");
        return;
      }
    } catch {
      // Fall through to the manual-copy guidance below.
    }
    setFeedback(includeSavedReviewWorkspace && savedReviewWorkspaceActive
      ? `Copy this investigation link manually. It includes the current run review and saved-review workspace context: ${href}`
      : `Copy this investigation link manually. It includes the current run review context only: ${href}`);
  }

  function resumeStoredSharedReview() {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record?.href) {
      setFeedback("No shared investigation context is stored for this workflow yet.");
      return;
    }
    try {
      const parsed = new URL(record.href, window.location.origin);
      const reviewState = parseReviewUrlStateFromSearch(parsed.search);
      window.history.pushState({}, "", `${parsed.pathname}${parsed.search}${parsed.hash}`);
      applyReviewUrlNavigationState(reviewState);
      const shareMode = record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href);
      setFeedback(shareMode === "workspace"
        ? "Restored the stored shared investigation and its saved-review workspace context for this workflow."
        : "Restored the stored shared investigation context for this workflow.");
    } catch {
      setFeedback("Could not restore the stored shared investigation link.");
    }
  }

  function forgetStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!workflowId || !record) {
      setFeedback("No stored shared investigation context is available to clear.");
      return;
    }
    clearStoredSharedReviewForWorkflow(workflowId, record.id);
    setFeedback("Cleared the stored shared investigation context for this workflow.");
  }

  function refreshStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (!workflowId) {
      setFeedback("Select a workflow before refreshing its stored shared investigation.");
      return;
    }
    const href = window.location.href;
    persistSharedReviewLinkForWorkflow(workflowId, href, currentSavedReviewWorkspaceActive() ? "workspace" : "core");
    setFeedback("Updated the stored shared investigation to match the current review context.");
  }
  function renameStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!workflowId || !record) {
      setFeedback("No stored shared investigation is selected to rename.");
      return;
    }
    const nextTitle = window.prompt("Name this saved investigation", record.title ?? "");
    if (nextTitle === null) return;
    updateStoredSharedReviewForWorkflow(workflowId, record.id, (entry) => ({
      ...entry,
      title: nextTitle.trim() || null,
    }));
    setFeedback(nextTitle.trim()
      ? `Renamed the saved investigation to "${nextTitle.trim()}".`
      : "Cleared the custom name for the saved investigation.");
  }
  function togglePinStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!workflowId || !record) {
      setFeedback("No stored shared investigation is selected to pin.");
      return;
    }
    updateStoredSharedReviewForWorkflow(workflowId, record.id, (entry) => ({
      ...entry,
      pinned: !entry.pinned,
    }));
    setFeedback(record.pinned
      ? "Unpinned the saved investigation."
      : "Pinned the saved investigation.");
  }

  async function copyWorkflowLink() {
    setFeedback("");
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const params = new URLSearchParams();
    if (workflowId) params.set("wf", workflowId);
    const href = `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
        setFeedback("Copied clean workflow link to clipboard without run or investigation state.");
        return;
      }
    } catch {
      // Fall through to the manual-copy guidance below.
    }
    setFeedback(`Copy this workflow link manually. It opens the workflow without run review context: ${href}`);
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
    connector_overrides?: WorkflowConnectorOverrides;
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
        connector_overrides: options?.connector_overrides,
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
      if (action === "deploy") {
        setDeployPreviewOpen(false);
      }
      if (action === "rollback") {
        setRollbackPreviewDeploymentId(null);
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
      if (kind === "replay") {
        setReplayPreviewRunId(null);
      }
      if (response.run.status === "waiting_for_approval") {
        setFeedback(`Workflow run ${response.run.run_id} is waiting for approval.`);
      } else if (response.run.status === "waiting_for_resume") {
        setFeedback(`Workflow run ${response.run.run_id} is waiting for a delayed resume.`);
      } else if (response.run.status === "blocked") {
        setFeedback(`Workflow run ${response.run.run_id} was blocked by policy.`);
      } else if (response.run.status === "failed") {
        setFeedback(`Workflow run ${response.run.run_id} failed.`);
      } else {
        setFeedback(
          kind === "replay"
            ? `Replay started from run ${options?.replay_run_id} as ${response.run.run_id}.`
            : `Workflow run ${response.run.run_id} completed.`,
        );
      }
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
      setFeedback(
        response.run.status === "waiting_for_approval"
          ? `Dry run ${response.run.run_id} paused at an approval boundary.`
          : response.run.status === "waiting_for_resume"
            ? `Dry run ${response.run.run_id} paused at a delayed resume boundary.`
          : response.run.status === "blocked"
            ? `Dry run ${response.run.run_id} was blocked by policy.`
            : response.run.status === "failed"
              ? `Dry run ${response.run.run_id} failed.`
          : `Dry run ${response.run.run_id} completed.`,
      );
    } catch (error) {
      setFeedback(`Could not dry run workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWorkflowApprovalDecision(
    run: WorkflowRun,
    option: Record<string, unknown>,
  ) {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (!workflowId) {
      setFeedback("Select a workflow before recording an approval decision.");
      return;
    }
    const optionId =
      typeof option.option_id === "string" && option.option_id.trim() ? option.option_id.trim() : undefined;
    const optionLabel =
      typeof option.label === "string" && option.label.trim()
        ? option.label.trim()
        : optionId ?? "Approval option";
    const decision = workflowApprovalDecisionForOption(option);
    setBusyAction(`workflow_approval_${decision}`);
    setFeedback("");
    try {
      const waitResume = await listWorkflowWaitResumeRecords(workflowId, run.run_id);
      const pendingApprovalRecord = waitResume.wait_resume_records.find((record) =>
        record.status === "pending" && record.resume_family === "approval",
      );
      if (!pendingApprovalRecord) {
        setFeedback("This run no longer has a pending approval wait to decide.");
        return;
      }
      const response = await decideWorkflowWaitResume(
        workflowId,
        run.run_id,
        pendingApprovalRecord.wait_resume_id,
        {
          decision,
          option_id: optionId,
        },
      );
      extendLiveRefreshWindow();
      await refreshRunHistory(workflowId);
      setSelectedRunId(response.run.run_id);
      setFeedback(
        decision === "approved"
          ? `${optionLabel} resumed workflow run ${response.run.run_id}.`
          : `${optionLabel} cancelled workflow run ${response.run.run_id}.`,
      );
    } catch (error) {
      setFeedback(`Could not record workflow approval decision: ${error instanceof Error ? error.message : String(error)}`);
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

  createEffect(() => {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const environment = normalizeGraph(workflow).environment === "prod" ? "prod" : "dev";
    setDeployOverrideDraft((current) => {
      const currentMatchesProd =
        current.delivery_tier === "production"
        || current.auth_mode === "tenant_credentials"
        || current.side_effects === "executed"
        || current.provider_route === "primary";
      const nextDefault = deploymentOverrideDraftForEnvironment(environment);
      if ((environment === "prod" && currentMatchesProd) || (environment === "dev" && !currentMatchesProd)) {
        return current;
      }
      return nextDefault;
    });
  });

  const connectorOverrideTargets = () => {
    const workflow = currentWorkflow();
    if (!workflow) return { families: [] as string[], nodes: [] as Array<{ id: string; label: string; family: string }> };
    const graph = normalizeGraph(workflow);
    const nodes = graph.nodes
      .filter((node) => node.kind === "tool")
      .map((node) => ({
        id: node.id,
        label: node.label,
        family: workflowNodeIntegrationFamily(node) ?? "integration",
      }));
    const families = Array.from(new Set(nodes.map((node) => node.family))).sort();
    return { families, nodes };
  };

  function deploymentOverridePayload(): WorkflowConnectorOverrides {
    const familyOverrides = Object.fromEntries(
      Object.entries(deployFamilyOverrides())
        .map(([key, value]) => [key, compactOverrideDraft(value)])
        .filter((entry): entry is [string, WorkflowConnectorOverrideFields] => Boolean(entry[1])),
    );
    const nodeOverrides = Object.fromEntries(
      Object.entries(deployNodeOverrides())
        .map(([key, value]) => [key, compactOverrideDraft(value)])
        .filter((entry): entry is [string, WorkflowConnectorOverrideFields] => Boolean(entry[1])),
    );
    return {
      ...deployOverrideDraft(),
      ...(Object.keys(familyOverrides).length > 0 ? { family_overrides: familyOverrides } : {}),
      ...(Object.keys(nodeOverrides).length > 0 ? { node_overrides: nodeOverrides } : {}),
    };
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

  function replaceSelectedNodeConfig(nextConfig: Record<string, unknown>) {
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    updateSelectedNode((current) => ({ ...current, config: nextConfig }));
    setConfigText(JSON.stringify(nextConfig, null, 2));
  }

  function patchSelectedNodeConfig(nextConfig: Record<string, unknown>) {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    replaceSelectedNodeConfig(nextConfig);
    void handleWorkflowPatch({ op: "node_config_replace", node_id: nodeId, config: nextConfig });
  }

  function selectedNodeOutgoingTargets() {
    const draft = graph();
    const node = selectedNode();
    if (!draft || !node) return [] as WorkflowNodeDraft[];
    const targets = draft.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => draft.nodes.find((candidate) => candidate.id === edge.target))
      .filter((candidate): candidate is WorkflowNodeDraft => Boolean(candidate));
    return targets;
  }

  function selectedNodeOutgoingEdges() {
    const draft = graph();
    const node = selectedNode();
    if (!draft || !node) {
      return [] as Array<{ edge: WorkflowEdgeDraft; targetNode: WorkflowNodeDraft }>;
    }
    return draft.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => {
        const targetNode = draft.nodes.find((candidate) => candidate.id === edge.target);
        return targetNode ? { edge, targetNode } : null;
      })
      .filter((candidate): candidate is { edge: WorkflowEdgeDraft; targetNode: WorkflowNodeDraft } => Boolean(candidate));
  }

  async function applyBranchPreset(labels: string[]) {
    if (workflowInteractionLocked()) return;
    const workflow = await ensureWorkflowPersisted();
    const node = selectedNode();
    const outgoingEdges = selectedNodeOutgoingEdges();
    if (!workflow || !node || outgoingEdges.length === 0) {
      setFeedback("Connect this node to downstream branches before applying a branch preset.");
      return;
    }
    const normalizedLabels = outgoingEdges.map((_, index) => labels[index] ?? labels[labels.length - 1] ?? "");
    updateGraph((draft) => ({
      ...draft,
      edges: draft.edges.map((edge) => {
        const edgeIndex = outgoingEdges.findIndex((entry) => entry.edge.id === edge.id);
        return edgeIndex >= 0
          ? { ...edge, condition_label: normalizedLabels[edgeIndex] || undefined }
          : edge;
      }),
    }));
    try {
      let latestWorkflow: SavedWorkflow | null = null;
      for (const [index, entry] of outgoingEdges.entries()) {
        const response = await patchWorkflow(workflow.workflow_id, {
          op: "edge_meta_replace",
          edge_id: entry.edge.id,
          condition_label: normalizedLabels[index] || undefined,
        });
        latestWorkflow = cloneJson(response.workflow);
      }
      if (latestWorkflow) {
        setCurrentWorkflow(latestWorkflow);
        setSelectedWorkflowId(latestWorkflow.workflow_id);
        mutate((current) =>
          (current ?? []).map((entry) =>
            entry.workflow_id === latestWorkflow?.workflow_id ? latestWorkflow : entry,
          ),
        );
      }
      setFeedback(`Applied branch preset to ${node.label}.`);
    } catch (error) {
      setFeedback(`Could not apply branch preset: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function applyBranchScaffold(labels: string[]) {
    if (workflowInteractionLocked()) return;
    const workflow = currentWorkflow();
    const node = selectedNode();
    const draft = graph();
    if (!workflow || !node || !draft) return;
    if (selectedNodeOutgoingEdges().length > 0) {
      setFeedback("This node already has outgoing branches. Use branch presets to relabel them or remove them before scaffolding new ones.");
      return;
    }

    const nextNodes = labels.map((label, index) => {
      const blueprint = branchScaffoldBlueprint(label, node.kind);
      const id = makeId("node");
      return {
        id,
        kind: blueprint.kind,
        label: titleCase(label),
        description: blueprint.description,
        position: {
          x: node.position.x + 260,
          y: node.position.y + index * 120 - ((labels.length - 1) * 60),
        },
        config: blueprint.config,
        policy: defaultPolicy(),
        prompt: blueprint.prompt,
        hidden_runtime_nodes: runtimeHints(blueprint.kind),
        metadata: {
          ...blueprint.metadata,
          generated_by: "branch_scaffold",
          source_node_id: node.id,
          branch_label: label,
        },
      } satisfies WorkflowNodeDraft;
    });

    const nextEdges = nextNodes.map((branchNode, index) => ({
      id: makeId("edge"),
      source: node.id,
      target: branchNode.id,
      condition_label: labels[index],
      metadata: {
        generated_by: "branch_scaffold",
      },
    } satisfies WorkflowEdgeDraft));

    const nextGraph: WorkflowGraphDraft = {
      ...draft,
      nodes: [...draft.nodes, ...nextNodes],
      edges: [...draft.edges, ...nextEdges],
    };

    setCurrentWorkflow({
      ...workflow,
      title: nextGraph.title,
      description: nextGraph.description,
      graph: nextGraph,
      latest_ir: null,
      updated_at: new Date().toISOString(),
    });
    setSelectedNodeId(nextNodes[0]?.id ?? node.id);

    try {
      const response = await saveWorkflow({
        graph: nextGraph as unknown as Record<string, unknown>,
        favorite: workflow.favorite,
        archived: Boolean(workflow.archived_at),
      });
      const saved = cloneJson(response.workflow);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate((current) => {
        const list = current ?? [];
        const index = list.findIndex((entry) => entry.workflow_id === saved.workflow_id);
        if (index >= 0) {
          const next = [...list];
          next[index] = saved;
          return next;
        }
        return [saved, ...list];
      });
      setFeedback(`Created a ${labels.join(" / ")} branch scaffold from ${node.label}. Compiled IR was cleared and should be rebuilt before deploy.`);
    } catch (error) {
      setFeedback(`Could not create branch scaffold: ${error instanceof Error ? error.message : String(error)}`);
    }
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
                  <button type="button" class="glass-button rounded-full border border-sky-300/70 bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => setDeployPreviewOpen((current) => !current)} disabled={busyAction() !== null || !workflow().latest_ir}>{busyAction() === "deploy" ? "Deploying..." : deployPreviewOpen() ? "Hide deploy preview" : "Preview deploy"}</button>
                  <button type="button" class="glass-button rounded-full border border-violet-300/70 bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleRunAction("start")} disabled={busyAction() !== null || !workflow().latest_ir || deploymentHistory().length === 0}>{busyAction() === "run" ? "Running..." : "Run"}</button>
                  <button type="button" class="glass-button rounded-full border border-cyan-300/70 bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleDryRun()} disabled={busyAction() !== null || !workflow().latest_ir || deploymentHistory().length === 0}>{busyAction() === "dry_run" ? "Simulating..." : "Dry run"}</button>
                </>
              )}
            </Show>
          </div>
        </div>
        <div class="mt-5 rounded-[24px] border border-sky-200/70 bg-sky-50/65 p-4">
          <Show when={currentWorkflow() && typeof normalizeGraph(currentWorkflow()!).metadata["source_intent"] === "string"}>
            <div class="mb-3 rounded-[20px] border border-white/45 bg-white/75 px-4 py-3">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Saved description</p>
              <p class="mt-1 text-sm text-sky-900">{String(normalizeGraph(currentWorkflow()!).metadata["source_intent"])}</p>
              <Show when={describeHistoryEntries(normalizeGraph(currentWorkflow()!)).length > 0}>
                <div class="mt-3 space-y-2 border-t border-sky-100 pt-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Describe history</p>
                  <div class="space-y-2">
                    <For each={describeHistoryEntries(normalizeGraph(currentWorkflow()!)).slice(0, 4)}>
                      {(entry) => (
                        <div class="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2">
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">{entry.event_kind}</span>
                            <Show when={entry.preset_kind}>
                              <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">{titleCase(entry.preset_kind!)}</span>
                            </Show>
                            <Show when={entry.optimization_mode}>
                              <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">{entry.optimization_mode}</span>
                            </Show>
                            <Show when={entry.timestamp}>
                              <span class="text-[10px] uppercase tracking-[0.14em] text-sky-600">{new Date(entry.timestamp!).toLocaleString()}</span>
                            </Show>
                          </div>
                          <p class="mt-1 text-xs leading-5 text-sky-900">{entry.intent}</p>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              class="rounded-full border border-sky-200/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-white"
                              onClick={() => {
                                applyDescribeHistoryEntry(entry);
                                setSelectedDescribeHistoryEventId(entry.event_id);
                                setFeedback("Loaded this describe event into the workflow composer.");
                              }}
                            >
                              Reuse in composer
                            </button>
                            <button
                              type="button"
                              class={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                                selectedDescribeHistoryEventId() === entry.event_id
                                  ? "border-amber-300/80 bg-amber-100/85 text-amber-800"
                                  : "border-amber-200/80 bg-white/80 text-amber-700 hover:bg-white"
                              }`}
                              onClick={() =>
                                setSelectedDescribeHistoryEventId((current) =>
                                  current === entry.event_id ? null : entry.event_id,
                                )
                              }
                            >
                              {selectedDescribeHistoryEventId() === entry.event_id ? "Hide compare" : "Compare"}
                            </button>
                            <button
                              type="button"
                              class="rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void saveWorkflowBranchFromDescribeHistory(entry)}
                              disabled={workflowInteractionLocked()}
                            >
                              Save as branch
                            </button>
                            <button
                              type="button"
                              class="rounded-full border border-violet-200/80 bg-violet-50/80 px-3 py-1 text-[11px] font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => {
                                applyDescribeHistoryEntry(entry);
                                setSelectedDescribeHistoryEventId(entry.event_id);
                                void regenerateCurrentWorkflowFromIntent();
                              }}
                              disabled={workflowInteractionLocked()}
                            >
                              Regenerate from this
                            </button>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                  <Show when={selectedDescribeHistoryEntry() && describeHistoryComparison()}>
                    {(comparisonAccessor) => {
                      const comparison = comparisonAccessor();
                      const entry = selectedDescribeHistoryEntry()!;
                      return (
                        <div class="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">History compare preview</p>
                          <p class="mt-1 text-xs leading-5 text-amber-900">
                            Reusing this {entry.event_kind} event would target a workflow with {comparison.currentNodeCount} current nodes and {comparison.currentEdgeCount} edges.
                          </p>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <span class={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${comparison.intentChanged ? "bg-amber-200 text-amber-900" : "bg-white/85 text-amber-800"}`}>
                              {comparison.intentChanged ? "intent changes" : "intent matches"}
                            </span>
                            <span class={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${comparison.presetChanged ? "bg-amber-200 text-amber-900" : "bg-white/85 text-amber-800"}`}>
                              {comparison.presetChanged ? "preset changes" : "preset matches"}
                            </span>
                            <span class={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${comparison.optimizationChanged ? "bg-amber-200 text-amber-900" : "bg-white/85 text-amber-800"}`}>
                              {comparison.optimizationChanged ? "mode changes" : "mode matches"}
                            </span>
                            <span class={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${comparison.regenerationChanged ? "bg-amber-200 text-amber-900" : "bg-white/85 text-amber-800"}`}>
                              {comparison.regenerationChanged ? "regen mode changes" : "regen mode matches"}
                            </span>
                          </div>
                          <div class="mt-3 grid gap-3 md:grid-cols-2">
                            <div class="rounded-2xl border border-amber-200/70 bg-white/70 px-3 py-3">
                              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Current generated core</p>
                              <p class="mt-1 text-xs text-amber-900">
                                {comparison.currentGeneratedNodeCount} generated nodes, {comparison.currentGeneratedEdgeCount} generated edges
                              </p>
                              <p class="mt-1 text-xs text-amber-800">
                                Protected regions stay intact: {comparison.protectedNodeCount} nodes, {comparison.protectedEdgeCount} edges
                              </p>
                              <p class="mt-1 text-xs text-amber-800">
                                In {regenerationMode()} mode, preserved regions would keep {comparison.preservedManualNodeCount} nodes and {comparison.preservedManualEdgeCount} edges,
                                including {comparison.preservedProtectedNodeCount} protected nodes and {comparison.preservedProtectedEdgeCount} protected edges.
                              </p>
                            </div>
                            <div class="rounded-2xl border border-amber-200/70 bg-white/70 px-3 py-3">
                              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Selected event estimate</p>
                              <p class="mt-1 text-xs text-amber-900">
                                {comparison.estimatedGeneratedNodeCount} generated nodes, {comparison.estimatedGeneratedEdgeCount} generated edges
                              </p>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                                  {titleCase(comparison.estimatedPresetKind)}
                                </span>
                                <Show when={comparison.estimatedNeedsApproval}>
                                  <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">approval</span>
                                </Show>
                                <Show when={comparison.estimatedNeedsBranching}>
                                  <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">branching</span>
                                </Show>
                                <Show when={comparison.estimatedNeedsResearchSupport}>
                                  <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">research support</span>
                                </Show>
                              </div>
                            </div>
                          </div>
                          <p class="mt-2 text-xs text-amber-900">
                            Selected event: <span class="font-medium">{entry.intent}</span>
                          </p>
                        </div>
                      );
                    }}
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Describe workflow</p>
              <p class="max-w-3xl text-sm leading-6 text-sky-900">Start from natural language and generate an editable preset-backed starter graph. This path is deterministic for now and uses the shared template registry instead of freeform prose generation.</p>
            </div>
            <Show when={intentExpansion()}>
              {(expansionAccessor) => {
                const expansion = expansionAccessor();
                return (
                  <div class="flex flex-wrap gap-2">
                    <span class="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                      preset {titleCase(expansion.preset_kind)}
                    </span>
                    <span class="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                      mode {expansion.optimization_mode}
                    </span>
                    <Show when={expansion.requires_approval}>
                      <span class="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">approval</span>
                    </Show>
                    <Show when={expansion.needs_branching}>
                      <span class="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">branching</span>
                    </Show>
                    <Show when={expansion.needs_research_support}>
                      <span class="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">research support</span>
                    </Show>
                    <Show when={expansion.public_output}>
                      <span class="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">public output</span>
                    </Show>
                  </div>
                );
              }}
            </Show>
          </div>
          <div class="mt-3 flex flex-col gap-3 lg:flex-row">
            <textarea
              value={workflowIntent()}
              onInput={(event) => setWorkflowIntent(event.currentTarget.value)}
              placeholder="Example: Research solid-state battery suppliers, compare options, and pause for approval before contacting anyone."
              class="min-h-[108px] flex-1 rounded-[22px] border border-white/50 bg-white/80 px-4 py-3 text-sm text-on-surface outline-none"
            />
            <div class="flex flex-col gap-2 lg:w-[220px]">
              <button
                type="button"
                class="glass-button rounded-[20px] border border-sky-300/70 bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={createWorkflowFromIntent}
                disabled={workflowInteractionLocked() || !workflowIntent().trim()}
              >
                Generate starter graph
              </button>
              <button
                type="button"
                class="glass-button rounded-[20px] border border-white/40 bg-white/65 px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setWorkflowIntent("")}
                disabled={!workflowIntent().trim()}
              >
                Clear
              </button>
              <button
                type="button"
                class="glass-button rounded-[20px] border border-violet-300/70 bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={regenerateCurrentWorkflowFromIntent}
                disabled={workflowInteractionLocked() || !currentWorkflow()}
              >
                Regenerate draft
              </button>
            </div>
          </div>
          <Show when={workflowIntent().trim()}>
            <div class="mt-3 grid gap-3 md:grid-cols-3">
              <label class="block">
                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Preset override</span>
                <select
                  value={intentPresetOverride()}
                  onChange={(event) => setIntentPresetOverride(event.currentTarget.value as PresetNodeKind | "")}
                  class="mt-2 w-full rounded-2xl border border-white/50 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none"
                >
                  <option value="">Use inferred preset</option>
                  <For each={PRESETS}>
                    {(preset) => <option value={preset}>{titleCase(preset)}</option>}
                  </For>
                </select>
              </label>
              <label class="block">
                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Optimization override</span>
                <select
                  value={intentOptimizationOverride()}
                  onChange={(event) => setIntentOptimizationOverride(event.currentTarget.value as "balanced" | "speed" | "cost" | "")}
                  class="mt-2 w-full rounded-2xl border border-white/50 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none"
                >
                  <option value="">Use inferred mode</option>
                  <option value="balanced">balanced</option>
                  <option value="speed">speed</option>
                  <option value="cost">cost</option>
                </select>
              </label>
              <label class="block">
                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Regeneration mode</span>
                <select
                  value={regenerationMode()}
                  onChange={(event) => setRegenerationMode(event.currentTarget.value as "rebuild" | "preserve_manual")}
                  class="mt-2 w-full rounded-2xl border border-white/50 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none"
                >
                  <option value="preserve_manual">preserve manual edits</option>
                  <option value="rebuild">rebuild from description</option>
                </select>
              </label>
            </div>
          </Show>
          <Show when={regenerationImpact()}>
            {(impactAccessor) => {
              const impact = impactAccessor();
              return (
                <div class="mt-3 rounded-[20px] border border-white/45 bg-white/75 px-4 py-3">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Regeneration impact</p>
                  <p class="mt-1 text-sm text-sky-900">
                    {regenerationMode() === "preserve_manual"
                      ? `Rebuild ${impact.generatedNodes} generated nodes and ${impact.generatedEdges} generated edges while preserving ${impact.preservedNodes} manual/protected nodes, including ${impact.lockedNodes} explicitly protected nodes, and ${impact.preservedEdges} preserved edges.`
                      : `Rebuild the full described workflow. ${impact.generatedNodes + impact.preservedNodes} nodes and ${impact.generatedEdges + impact.preservedEdges} edges will be replaced by a fresh generated draft.`}
                  </p>
                </div>
              );
            }}
          </Show>
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
              <Show when={branchFamilySummary().familyCount > 0}>
                <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-emerald-700">
                  {branchFamilySummary().familyCount} branch famil{branchFamilySummary().familyCount === 1 ? "y" : "ies"}
                  <Show when={branchFamilySummary().collapsedCount > 0}>
                    {" "}· {branchFamilySummary().collapsedCount} collapsed
                  </Show>
                </p>
              </Show>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                class="rounded-full border border-white/40 bg-white/45 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/60"
                onClick={expandAllBranchFamilies}
              >
                Expand all
              </button>
              <button
                type="button"
                class="rounded-full border border-white/40 bg-white/45 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/60"
                onClick={collapseOtherBranchFamilies}
              >
                Collapse others
              </button>
              <button type="button" class="rounded-full border border-white/40 bg-white/45 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/60" onClick={() => void refetch()}>Refresh</button>
            </div>
          </div>
          <div class="mt-4 space-y-3">
            <Show when={!workflows.loading} fallback={<p class="text-sm text-on-surface-variant">Loading workflows...</p>}>
              <Show when={workflowsForRail().length > 0} fallback={<p class="text-sm text-on-surface-variant">No saved workflows yet.</p>}>
                <For each={workflowsForRail()}>
                  {(workflow) => {
                    const info = summary(workflow);
                    const isSelected = selectedWorkflowId() === workflow.workflow_id;
                    const branchOrigin = branchOriginRecord(workflow);
                    const isBranchChild = isBranchChildWorkflow(workflow);
                    const familyRootId = branchFamilyRootId(workflow);
                    const siblingCount = siblingBranchCount(workflow);
                    const siblings = siblingBranches(workflow);
                    const isBranchFamilyRoot = !isBranchChild && siblingCount > 0;
                    const familyCollapsed = branchFamilyCollapsed(familyRootId);
                    return (
                      <Show when={branchWorkflowVisibleInRail(workflow)}>
                      <div class={`${isBranchChild ? "ml-4 border-l-2 border-emerald-200/80 pl-3" : ""}`}>
                        <div class={`w-full rounded-[20px] border p-4 text-left transition ${isSelected ? "border-primary/40 bg-primary/10 shadow-soft" : "border-white/35 bg-white/35 hover:bg-white/50"}`}>
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <div class="flex flex-wrap items-center gap-2">
                            <Show when={isBranchFamilyRoot}>
                              <span class="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                Family root
                              </span>
                            </Show>
                            <Show when={isBranchChild}>
                              <span class="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                Branch child
                              </span>
                            </Show>
                          </div>
                          <Show when={isBranchFamilyRoot}>
                            <button
                              type="button"
                              class="rounded-full border border-emerald-200/80 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 transition hover:bg-white"
                              onClick={() => toggleBranchFamily(familyRootId)}
                            >
                              {familyCollapsed ? "Expand" : "Collapse"}
                            </button>
                          </Show>
                        </div>
                        <button type="button" class="w-full text-left" onClick={() => void loadWorkflow(workflow.workflow_id)}>
                          <div class="flex items-center justify-between gap-3">
                            <p class="text-sm font-semibold text-on-surface">{workflow.title}</p>
                            <div class="flex items-center gap-2">
                              <Show when={branchOrigin}><span class="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Branch</span></Show>
                              <Show when={workflow.favorite}><span class="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Fav</span></Show>
                            </div>
                          </div>
                          <p class="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">{workflow.description ?? "No description yet."}</p>
                          <Show when={branchOrigin?.parent_workflow_id}>
                            <p class="mt-2 text-[11px] uppercase tracking-[0.14em] text-emerald-700">
                              from {String(branchOrigin?.parent_workflow_id ?? "parent workflow")}
                            </p>
                          </Show>
                          <Show when={siblingCount > 0}>
                            <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-600">
                              {siblingCount} related branch{siblingCount === 1 ? "" : "es"}
                              <Show when={isBranchFamilyRoot && familyCollapsed}>
                                {" "}hidden
                              </Show>
                            </p>
                          </Show>
                          <div class="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">
                            <span>{info.nodeCount} nodes</span>
                            <span>{workflow.latest_ir ? "compiled" : "draft"}</span>
                          </div>
                        </button>
                        <Show when={siblings.length > 0}>
                          <div class="mt-3 border-t border-white/30 pt-3">
                            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
                              Branch family
                            </p>
                            <div class="mt-2 flex flex-wrap gap-2">
                              <For each={siblings.slice(0, 3)}>
                                {(sibling) => (
                                  <button
                                    type="button"
                                    class={`rounded-full border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                                      selectedWorkflowId() === sibling.workflow_id
                                        ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                                        : "border-emerald-200/80 bg-white/80 text-emerald-700 hover:bg-white"
                                    }`}
                                    onClick={() => void loadWorkflow(sibling.workflow_id)}
                                  >
                                    {sibling.title}
                                  </button>
                                )}
                              </For>
                              <Show when={siblings.length > 3}>
                                <span class="rounded-full border border-emerald-200/80 bg-white/80 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                  +{siblings.length - 3} more
                                </span>
                              </Show>
                            </div>
                          </div>
                        </Show>
                        </div>
                      </div>
                      </Show>
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
              const protectedNodeIds = () => protectedNodeIdsForGraph(draft());
              const protectedEdgeIds = () => protectedEdgeIdsForGraph(draft());
              const edgeLegendStates = () => {
                const order: EdgeExecutionState[] = [
                  "failed",
                  "blocked",
                  "waiting_for_approval",
                  "queued",
                  "skipped",
                  "simulated",
                  "completed",
                ];
                const states = new Set(selectedRunEdgeStates().values());
                return order.filter((state) => states.has(state));
              };
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
                    <Show when={branchOriginRecord(workflow)}>
                      <div class="mt-3 rounded-[22px] border border-emerald-200/70 bg-emerald-50/75 p-4">
                        {(() => {
                          const siblings = siblingBranches(workflow);
                          return (
                            <>
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Branch origin</p>
                        <p class="mt-1 text-sm text-emerald-900">
                          Parent workflow{" "}
                          <span class="font-medium">
                            {String(branchOriginRecord(workflow)?.parent_workflow_id ?? "unknown")}
                          </span>
                        </p>
                        <Show when={branchOriginRecord(workflow)?.history_event_id}>
                          <p class="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-700">
                            from history event{" "}
                            {String(branchOriginRecord(workflow)?.history_event_id)}
                          </p>
                        </Show>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            class="rounded-full border border-emerald-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-white"
                            onClick={() => {
                              const parentId = branchOriginRecord(workflow)?.parent_workflow_id;
                              if (!parentId) return;
                              void loadWorkflow(parentId);
                            }}
                          >
                            Go to parent
                          </button>
                          <Show when={siblingBranchCount(workflow) > 0}>
                            <span class="rounded-full border border-emerald-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-700">
                              {siblingBranchCount(workflow)} related branch{siblingBranchCount(workflow) === 1 ? "" : "es"}
                            </span>
                          </Show>
                        </div>
                        <Show when={siblings.length > 0}>
                          <div class="mt-3">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                              Branch family
                            </p>
                            <div class="mt-2 flex flex-wrap gap-2">
                              <For each={siblings.slice(0, 6)}>
                                {(sibling) => (
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                                      selectedWorkflowId() === sibling.workflow_id
                                        ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                                        : "border-emerald-200/80 bg-white/80 text-emerald-700 hover:bg-white"
                                    }`}
                                    onClick={() => void loadWorkflow(sibling.workflow_id)}
                                  >
                                    {sibling.title}
                                  </button>
                                )}
                              </For>
                              <Show when={siblings.length > 6}>
                                <span class="rounded-full border border-emerald-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-700">
                                  +{siblings.length - 6} more
                                </span>
                              </Show>
                            </div>
                          </div>
                        </Show>
                            </>
                          );
                        })()}
                      </div>
                    </Show>
                  </div>

                  <div class="glass-surface rounded-[28px] border border-white/35 p-4 shadow-panel">
                    <div class="mb-3"><p class="text-sm font-semibold text-on-surface">Canvas</p><p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">drag nodes - inspect on selection - compile frozen IR</p></div>
                    <Show when={sharedReviewBannerVisible()}>
                      <div class="mb-3 rounded-[20px] border border-sky-200/70 bg-sky-50/80 px-4 py-3">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                          <div class="space-y-2">
                            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Shared investigation</p>
                            <p class="mt-1 text-sm text-sky-900">
                              This view was opened from a shareable review link, so workflow, run, branch, timeline, and deployment context were restored from the URL.
                            </p>
                            <Show when={sharedReviewBannerSummary().length > 0}>
                              <div>
                                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Link contains</p>
                                <div class="mt-2 flex flex-wrap gap-2">
                                  <For each={sharedReviewBannerSummary()}>
                                    {(entry) => (
                                      <span class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-medium text-sky-800">
                                        {entry}
                                      </span>
                                    )}
                                  </For>
                                </div>
                              </div>
                            </Show>
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <button
                              type="button"
                              class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-white"
                              onClick={() => setSharedReviewBannerVisible(false)}
                            >
                              Dismiss
                            </button>
                            <button
                              type="button"
                              class="rounded-full border border-sky-200/70 bg-sky-100/90 px-3 py-1 text-xs font-medium text-sky-800 transition hover:bg-sky-100"
                              onClick={() => resetSharedInvestigationView()}
                            >
                              Reset to default view
                            </button>
                          </div>
                        </div>
                      </div>
                    </Show>
                    <Show when={selectedRun()}>
                      {(runAccessor) => {
                        const run = runAccessor();
                        const executionMode =
                          typeof run.result?.execution_mode === "string" ? run.result.execution_mode : "live";
                        const timelineCount = Array.isArray(run.timeline) ? run.timeline.length : 0;
                        const durationLabel = formatDurationMs(run.result?.duration_ms);
                        const nodePolicyDeltaCount = selectedRunNodePolicyDeltas().size;
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
                            <Show when={nodePolicyDeltaCount > 0}>
                              <span class="text-xs text-violet-800">
                                {nodePolicyDeltaCount} node policy delta{nodePolicyDeltaCount === 1 ? "" : "s"} highlighted
                              </span>
                            </Show>
                            <Show when={durationLabel}>
                              <span class="text-xs text-violet-800">duration {durationLabel}</span>
                            </Show>
                          </div>
                        );
                      }}
                    </Show>
                    <div ref={canvasRef!} class="relative min-h-[720px] overflow-hidden rounded-[24px] border border-white/35 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(233,240,247,0.82)_45%,_rgba(225,234,244,0.88))]">
                      {(() => {
                        const activeCompiledAfpFilter = selectedCompiledAfpFilter();
                        const activeManifestLinkageFilter = selectedCompiledManifestLinkageFilter();
                        if (!activeCompiledAfpFilter && !activeManifestLinkageFilter) {
                          return null;
                        }
                        const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                          ? workflow.latest_ir as Record<string, unknown>
                          : null;
                        const manifests = Array.isArray(latestIr?.manifests)
                          ? latestIr.manifests as Record<string, unknown>[]
                          : [];
                        const afpMatchingNodeIds = new Set(
                          manifests
                            .filter((manifest) => {
                              const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                              const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                ? manifest.connector_binding as Record<string, unknown>
                                : null;
                              const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                              return activeCompiledAfpFilter
                                ? compiledManifestAfpContract(runtimeKind, capabilityId).category === activeCompiledAfpFilter
                                : true;
                            })
                            .map((manifest) => typeof manifest.source_graph_node_id === "string" ? manifest.source_graph_node_id : null)
                            .filter((nodeId): nodeId is string => Boolean(nodeId)),
                        );
                        const linkedManifestNodeIds = new Set(
                          manifests
                            .map((manifest) => typeof manifest.source_graph_node_id === "string" ? manifest.source_graph_node_id : null)
                            .filter((nodeId): nodeId is string => Boolean(nodeId)),
                        );
                        const matchingNodeIds = activeManifestLinkageFilter === "linked"
                          ? new Set([...afpMatchingNodeIds].filter((nodeId) => linkedManifestNodeIds.has(nodeId)))
                          : activeManifestLinkageFilter === "inspector_only"
                            ? new Set<string>()
                            : afpMatchingNodeIds;
                        const graphNodeCount = draft().nodes.length;
                        const matchingCount = draft().nodes.filter((node) => matchingNodeIds.has(node.id)).length;
                        const fullyMatchingRouteCount = draft().edges.filter((edge) => matchingNodeIds.has(edge.source) && matchingNodeIds.has(edge.target)).length;
                        const partiallyMatchingRouteCount = draft().edges.filter((edge) => {
                          const sourceMatches = matchingNodeIds.has(edge.source);
                          const targetMatches = matchingNodeIds.has(edge.target);
                          return (sourceMatches || targetMatches) && !(sourceMatches && targetMatches);
                        }).length;
                        const activeRouteFocus = selectedCompiledAfpRouteFocus();
                        const firstMatchingNodeId = draft().nodes.find((node) => matchingNodeIds.has(node.id))?.id ?? null;
                        return (
                          <div class="absolute left-4 top-4 z-20 flex max-w-[420px] flex-wrap items-center gap-2 rounded-[20px] border border-emerald-200/80 bg-white/88 px-4 py-3 shadow-soft backdrop-blur">
                            <Show when={activeCompiledAfpFilter}>
                              <span class="rounded-full border border-emerald-200/70 bg-emerald-50/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                AFP focus {activeCompiledAfpFilter?.replaceAll("_", " ")}
                              </span>
                            </Show>
                            <Show when={activeManifestLinkageFilter}>
                              <span class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${activeManifestLinkageFilter === "linked" ? "border-emerald-200/70 bg-white/85 text-emerald-800" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}>
                                {activeManifestLinkageFilter === "linked" ? "node-review-ready manifests" : "inspector-only manifests"}
                              </span>
                            </Show>
                            <span class="rounded-full border border-white/60 bg-white/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                              {matchingCount} of {graphNodeCount} nodes match
                            </span>
                            <Show when={activeManifestLinkageFilter === "inspector_only"}>
                              <span class="text-xs text-amber-800">
                                inspector-only manifests do not yet open editable node review targets
                              </span>
                            </Show>
                            <Show when={fullyMatchingRouteCount > 0}>
                              <button
                                type="button"
                                class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${activeRouteFocus === "full" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-800" : "border-emerald-200/70 bg-white/85 text-emerald-800"}`}
                                onClick={() => setSelectedCompiledAfpRouteFocus("full")}
                                title="Focus the graph on routes that fully match the current AFP slice"
                                aria-label="Focus the graph on routes that fully match the current AFP slice"
                              >
                                {fullyMatchingRouteCount} route review matches
                              </button>
                            </Show>
                            <Show when={partiallyMatchingRouteCount > 0}>
                              <button
                                type="button"
                                class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${activeRouteFocus === "partial" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700" : "border-amber-200/70 bg-white/85 text-amber-700"}`}
                                onClick={() => setSelectedCompiledAfpRouteFocus("partial")}
                                title="Focus the graph on routes that partially intersect the current AFP slice"
                                aria-label="Focus the graph on routes that partially intersect the current AFP slice"
                              >
                                {partiallyMatchingRouteCount} partial route reviews
                              </button>
                            </Show>
                            <Show when={activeRouteFocus}>
                              <button
                                type="button"
                                class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-white"
                                onClick={() => setSelectedCompiledAfpRouteFocus(null)}
                                title="Clear the route participation focus while keeping the AFP node slice"
                                aria-label="Clear the route participation focus while keeping the AFP node slice"
                              >
                                Show all routes
                              </button>
                            </Show>
                            <button
                              type="button"
                              class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-white"
                              onClick={() => {
                                setSelectedNodeId(null);
                                setSelectedInspectorSection(null);
                                setSelectedInspectorFocusSource(null);
                                setSelectedInspectorFocusTarget(null);
                              }}
                              title="Open the workflow inspector with the current AFP-filtered compiled roster"
                              aria-label="Open the workflow inspector with the current AFP-filtered compiled roster"
                            >
                              Review roster
                            </button>
                            <Show when={firstMatchingNodeId}>
                              <button
                                type="button"
                                class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-white"
                                onClick={() => {
                                  setSelectedNodeId(firstMatchingNodeId);
                                  setSelectedInspectorSection("compiled_runtime_contract");
                                  setSelectedInspectorFocusSource("canvas_afp_badge");
                                  setSelectedInspectorFocusTarget(firstMatchingNodeId);
                                }}
                                title="Open the first matching node's compiled runtime contract"
                                aria-label="Open the first matching node's compiled runtime contract"
                              >
                                Open first match
                              </button>
                            </Show>
                            <button
                              type="button"
                              class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                              onClick={() => {
                                setSelectedCompiledAfpFilter(null);
                                setSelectedCompiledAfpRouteFocus(null);
                                setSelectedCompiledManifestLinkageFilter(null);
                              }}
                              title="Clear the active compiled graph focus from the canvas"
                              aria-label="Clear the active compiled graph focus from the canvas"
                            >
                              Show full graph
                            </button>
                          </div>
                        );
                      })()}
                      <Show when={workflowInteractionLocked()}>
                        <div class={`pointer-events-none absolute inset-x-4 z-20 rounded-[20px] border border-amber-200/80 bg-amber-50/90 px-4 py-3 shadow-soft ${selectedCompiledAfpFilter() ? "top-24" : "top-4"}`}>
                          <p class="text-sm font-semibold text-amber-900">{workflowInteractionLockLabel()}</p>
                          <p class="mt-1 text-xs uppercase tracking-[0.16em] text-amber-700">Canvas editing is temporarily locked until this operation finishes.</p>
                        </div>
                      </Show>
                      <Show when={selectedCompiledAfpFilter() && selectedCompiledAfpRouteFocus() || selectedCompiledManifestLinkageFilter() || selectedCompiledRouteLinkageFilter() || selectedCompiledAfpReadinessFocus() || selectedRun() && edgeLegendStates().length > 0}>
                        <div class={`absolute right-4 z-10 flex w-[260px] flex-col gap-3 ${selectedCompiledAfpFilter() ? "top-24" : "top-4"}`}>
                          {(() => {
                            const activeRouteFocus = selectedCompiledAfpRouteFocus();
                            const activeManifestLinkageFocus = selectedCompiledManifestLinkageFilter();
                            const activeLinkageFocus = selectedCompiledRouteLinkageFilter();
                            const activeAfpReadinessFocus = selectedCompiledAfpReadinessFocus();
                            const branchReviewActive = Boolean(selectedRun() && edgeLegendStates().length > 0);
                            const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                              ? workflow.latest_ir as Record<string, unknown>
                              : null;
                            const manifests = Array.isArray(latestIr?.manifests)
                              ? latestIr.manifests as Record<string, unknown>[]
                              : [];
                            const compiledEdges = Array.isArray(latestIr?.edges)
                              ? latestIr.edges as Record<string, unknown>[]
                              : [];
                            const readyManifestIds = new Set(
                              manifests
                                .filter((manifest) => {
                                  const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                  const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                    ? manifest.connector_binding as Record<string, unknown>
                                    : null;
                                  const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                  const memoryConfig = manifest.memory && typeof manifest.memory === "object"
                                    ? manifest.memory as Record<string, unknown>
                                    : null;
                                  const traceConfig = manifest.trace && typeof manifest.trace === "object"
                                    ? manifest.trace as Record<string, unknown>
                                    : null;
                                  const memoryScope = typeof memoryConfig?.scope === "string" ? memoryConfig.scope : null;
                                  const traceSource = typeof traceConfig?.source === "string" ? traceConfig.source : null;
                                  const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
                                  const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
                                  return afpContract.category !== "orchestration_scaffold"
                                    && afpGapKinds.length === 0
                                    && typeof manifest.node_id === "string";
                                })
                                .map((manifest) => manifest.node_id as string),
                            );
                            const readyHandoffManifestIds = new Set(
                              compiledEdges.flatMap((entry) => {
                                const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                const isReadyHandoff = Boolean(
                                  fromManifestNodeId
                                    && toManifestNodeId
                                    && readyManifestIds.has(fromManifestNodeId)
                                    && readyManifestIds.has(toManifestNodeId),
                                );
                                return isReadyHandoff
                                  ? [fromManifestNodeId, toManifestNodeId].filter((value): value is string => Boolean(value))
                                  : [];
                              }),
                            );
                            const activeCompiledAfpFilter = selectedCompiledAfpFilter();
                            const matchingManifestNodeIds = !activeCompiledAfpFilter
                              ? null
                              : new Set(
                                  manifests
                                    .filter((manifest) => {
                                      const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                      const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                        ? manifest.connector_binding as Record<string, unknown>
                                        : null;
                                      const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                      return compiledManifestAfpContract(runtimeKind, capabilityId).category === activeCompiledAfpFilter;
                                    })
                                    .map((manifest) => typeof manifest.node_id === "string" ? manifest.node_id : null)
                                    .filter((nodeId): nodeId is string => Boolean(nodeId)),
                                );
                            const firstCompiledRouteFocusTarget = compiledEdges
                              .map((entry) => {
                                const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                const routeLabel = typeof entry.route_label === "string" ? entry.route_label : null;
                                if (!fromManifestNodeId || !toManifestNodeId) {
                                  return null;
                                }
                                const fromManifest = manifests.find((manifest) => manifest.node_id === fromManifestNodeId) ?? null;
                                const toManifest = manifests.find((manifest) => manifest.node_id === toManifestNodeId) ?? null;
                                const sourceRuntimeKind = typeof fromManifest?.runtime_kind === "string" ? fromManifest.runtime_kind : null;
                                const targetRuntimeKind = typeof toManifest?.runtime_kind === "string" ? toManifest.runtime_kind : null;
                                const sourceCapabilityId = fromManifest?.connector_binding && typeof fromManifest.connector_binding === "object" && typeof (fromManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                  ? (fromManifest.connector_binding as Record<string, unknown>).capability_id as string
                                  : null;
                                const targetCapabilityId = toManifest?.connector_binding && typeof toManifest.connector_binding === "object" && typeof (toManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                  ? (toManifest.connector_binding as Record<string, unknown>).capability_id as string
                                  : null;
                                const sourceMatchesAfp = !matchingManifestNodeIds || matchingManifestNodeIds.has(fromManifestNodeId);
                                const targetMatchesAfp = !matchingManifestNodeIds || matchingManifestNodeIds.has(toManifestNodeId);
                                const graphLinked = Boolean(
                                  draft().edges.find(
                                    (graphEdge) => {
                                      const sourceGraphNodeId = typeof fromManifest?.source_graph_node_id === "string" ? fromManifest.source_graph_node_id : null;
                                      const targetGraphNodeId = typeof toManifest?.source_graph_node_id === "string" ? toManifest.source_graph_node_id : null;
                                      return sourceGraphNodeId
                                        && targetGraphNodeId
                                        && graphEdge.source === sourceGraphNodeId
                                        && graphEdge.target === targetGraphNodeId
                                        && (graphEdge.condition_label ?? null) === routeLabel;
                                    },
                                  ),
                                );
                                if (activeRouteFocus === "full" && !(sourceMatchesAfp && targetMatchesAfp)) return null;
                                if (activeRouteFocus === "partial" && !((sourceMatchesAfp || targetMatchesAfp) && !(sourceMatchesAfp && targetMatchesAfp))) return null;
                                if (!activeRouteFocus && activeCompiledAfpFilter && !(sourceMatchesAfp || targetMatchesAfp)) return null;
                                if (activeLinkageFocus === "linked" && !graphLinked) return null;
                                if (activeLinkageFocus === "manifest_only" && graphLinked) return null;
                                return `${fromManifestNodeId}:${toManifestNodeId}:${routeLabel ?? "default"}`;
                              })
                              .find((target): target is string => Boolean(target)) ?? null;
                            const firstAfpReadyManifestNodeId = manifests
                              .find((manifest) => {
                                const manifestNodeId = typeof manifest.node_id === "string" ? manifest.node_id : null;
                                return Boolean(manifestNodeId && readyManifestIds.has(manifestNodeId) && typeof manifest.source_graph_node_id === "string");
                              })?.source_graph_node_id as string | undefined;
                            const firstAfpContractWorkNodeId = manifests
                              .find((manifest) => {
                                const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                  ? manifest.connector_binding as Record<string, unknown>
                                  : null;
                                const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                const memoryConfig = manifest.memory && typeof manifest.memory === "object"
                                  ? manifest.memory as Record<string, unknown>
                                  : null;
                                const traceConfig = manifest.trace && typeof manifest.trace === "object"
                                  ? manifest.trace as Record<string, unknown>
                                  : null;
                                const memoryScope = typeof memoryConfig?.scope === "string" ? memoryConfig.scope : null;
                                const traceSource = typeof traceConfig?.source === "string" ? traceConfig.source : null;
                                const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
                                const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
                                return typeof manifest.source_graph_node_id === "string"
                                  && (afpContract.category === "orchestration_scaffold" || afpGapKinds.length > 0);
                              })?.source_graph_node_id as string | undefined;
                            const firstAfpReadyHandoffTarget = compiledEdges
                              .map((entry) => {
                                const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                const routeLabel = typeof entry.route_label === "string" ? entry.route_label : null;
                                if (!fromManifestNodeId || !toManifestNodeId) {
                                  return null;
                                }
                                if (!readyManifestIds.has(fromManifestNodeId) || !readyManifestIds.has(toManifestNodeId)) {
                                  return null;
                                }
                                return `${fromManifestNodeId}:${toManifestNodeId}:${routeLabel ?? "default"}`;
                              })
                              .find((target): target is string => Boolean(target)) ?? null;
                            const firstReviewedEdge = draft().edges.find((edge) => selectedRunEdgeStates().has(edge.id)) ?? null;
                            const branchRailFocusAvailable = Boolean(selectedRunEdgeId() || firstReviewedEdge);
                            const firstLinkedManifestNodeId = manifests
                              .map((manifest) => typeof manifest.source_graph_node_id === "string" ? manifest.source_graph_node_id : null)
                              .find((nodeId): nodeId is string => Boolean(nodeId)) ?? null;
                            const activeOrchestrationRoleFocus = selectedCompiledOrchestrationRole();
                            const firstOrchestrationRoleManifest = activeOrchestrationRoleFocus
                              ? manifests.find((manifest) => {
                                const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                  ? manifest.connector_binding as Record<string, unknown>
                                  : null;
                                const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                return compiledManifestOrchestrationRole(runtimeKind, capabilityId).role === activeOrchestrationRoleFocus
                                  && typeof manifest.source_graph_node_id === "string";
                              }) ?? null
                              : null;
                            const firstOrchestrationRoleNodeId = firstOrchestrationRoleManifest && typeof firstOrchestrationRoleManifest.source_graph_node_id === "string"
                              ? firstOrchestrationRoleManifest.source_graph_node_id
                              : null;
                            const primaryRailFocus = activeRouteFocus
                              ? {
                                  label: `Primary: AFP route ${activeRouteFocus === "full" ? "full match" : "partial match"}`,
                                  tone: "border-emerald-200/70 bg-emerald-50/90 text-emerald-700",
                                  available: Boolean(firstCompiledRouteFocusTarget),
                                  onClick: () => {
                                    if (firstCompiledRouteFocusTarget) {
                                      setSelectedNodeId(null);
                                      setSelectedInspectorSection(null);
                                      setSelectedInspectorFocusSource("compiled_route");
                                      setSelectedInspectorFocusTarget(firstCompiledRouteFocusTarget);
                                    }
                                  },
                                  title: firstCompiledRouteFocusTarget
                                    ? availableReviewTargetMessage("compiled_route")
                                    : "No compiled route topology entry is available for the current AFP route focus",
                                }
                              : activeLinkageFocus
                                ? {
                                      label: `Primary: ${activeLinkageFocus === "linked" ? "branch-review-ready routes" : "inspector-only routes"}`,
                                    tone: "border-amber-200/70 bg-amber-50/90 text-amber-700",
                                    available: Boolean(firstCompiledRouteFocusTarget),
                                    onClick: () => {
                                      if (firstCompiledRouteFocusTarget) {
                                        setSelectedNodeId(null);
                                        setSelectedInspectorSection(null);
                                        setSelectedInspectorFocusSource("compiled_route");
                                        setSelectedInspectorFocusTarget(firstCompiledRouteFocusTarget);
                                      }
                                    },
                                    title: firstCompiledRouteFocusTarget
                                      ? availableReviewTargetMessage("compiled_route")
                                      : "No compiled route topology entry is available for the current linkage focus",
                                  }
                                : activeOrchestrationRoleFocus
                                  ? {
                                      label: `Primary: ${compiledManifestOrchestrationRole(
                                        activeOrchestrationRoleFocus === "delegated_capability"
                                          ? "executor"
                                          : activeOrchestrationRoleFocus === "delegated_decision"
                                            ? "approval_runtime"
                                            : activeOrchestrationRoleFocus === "workflow_summary"
                                              ? "termination_runtime"
                                              : "plan",
                                        activeOrchestrationRoleFocus === "delegated_capability" ? "capability" : null,
                                      ).label}`,
                                      tone: "border-cyan-200/70 bg-cyan-50/90 text-cyan-700",
                                      available: Boolean(firstOrchestrationRoleNodeId),
                                      onClick: () => {
                                        if (firstOrchestrationRoleNodeId) {
                                          setSelectedNodeId(firstOrchestrationRoleNodeId);
                                          setSelectedInspectorSection(null);
                                          setSelectedInspectorFocusSource(null);
                                          setSelectedInspectorFocusTarget(null);
                                        }
                                      },
                                      title: firstOrchestrationRoleNodeId
                                        ? availableReviewTargetMessage("compiled_manifest")
                                        : "No editable graph node is available for the current orchestration role focus",
                                    }
                                : activeManifestLinkageFocus
                                  ? {
                                      label: `Primary: ${activeManifestLinkageFocus === "linked" ? "node-review-ready manifests" : "inspector-only manifests"}`,
                                      tone: activeManifestLinkageFocus === "linked"
                                        ? "border-sky-200/70 bg-sky-50/90 text-sky-700"
                                        : "border-amber-200/70 bg-amber-50/90 text-amber-700",
                                      available: activeManifestLinkageFocus === "linked"
                                        ? Boolean(firstLinkedManifestNodeId)
                                        : true,
                                      onClick: () => {
                                        setSelectedInspectorSection(null);
                                        setSelectedInspectorFocusSource(null);
                                        setSelectedInspectorFocusTarget(null);
                                        if (activeManifestLinkageFocus === "linked" && firstLinkedManifestNodeId) {
                                          setSelectedNodeId(firstLinkedManifestNodeId);
                                        } else {
                                          setSelectedNodeId(null);
                                        }
                                      },
                                      title: activeManifestLinkageFocus === "linked"
                                        ? firstLinkedManifestNodeId
                                          ? availableReviewTargetMessage("compiled_manifest")
                                          : "No editable graph node is currently linked to this manifest health focus"
                                        : availableReviewTargetMessage("compiled_manifest"),
                                    }
                                : activeAfpReadinessFocus
                                  ? {
                                      label: `Primary: ${activeAfpReadinessFocus === "ready_manifests"
                                        ? "AFP-ready manifests"
                                        : activeAfpReadinessFocus === "ready_handoffs"
                                          ? "AFP-ready handoffs"
                                          : "AFP contract-work review"}`,
                                      tone: activeAfpReadinessFocus === "needs_contract_work"
                                        ? "border-amber-200/70 bg-amber-50/90 text-amber-700"
                                        : activeAfpReadinessFocus === "ready_handoffs"
                                          ? "border-cyan-200/70 bg-cyan-50/90 text-cyan-700"
                                          : "border-emerald-200/70 bg-emerald-50/90 text-emerald-700",
                                      available: activeAfpReadinessFocus === "ready_handoffs"
                                        ? Boolean(firstAfpReadyHandoffTarget)
                                        : activeAfpReadinessFocus === "needs_contract_work"
                                          ? Boolean(firstAfpContractWorkNodeId)
                                          : Boolean(firstAfpReadyManifestNodeId),
                                      onClick: () => {
                                        if (activeAfpReadinessFocus === "ready_handoffs") {
                                          if (firstAfpReadyHandoffTarget) {
                                            setSelectedNodeId(null);
                                            setSelectedInspectorSection(null);
                                            setSelectedInspectorFocusSource("compiled_route");
                                            setSelectedInspectorFocusTarget(firstAfpReadyHandoffTarget);
                                          }
                                          return;
                                        }
                                        const targetNodeId = activeAfpReadinessFocus === "needs_contract_work"
                                          ? firstAfpContractWorkNodeId
                                          : firstAfpReadyManifestNodeId;
                                        if (targetNodeId) {
                                          setSelectedNodeId(targetNodeId);
                                          setSelectedInspectorSection(null);
                                          setSelectedInspectorFocusSource(null);
                                          setSelectedInspectorFocusTarget(null);
                                        }
                                      },
                                      title: activeAfpReadinessFocus === "ready_handoffs"
                                        ? firstAfpReadyHandoffTarget
                                          ? availableReviewTargetMessage("compiled_route")
                                          : unavailableReviewTargetMessage("compiled_route")
                                        : activeAfpReadinessFocus === "needs_contract_work"
                                          ? firstAfpContractWorkNodeId
                                            ? availableReviewTargetMessage("compiled_manifest")
                                            : unavailableReviewTargetMessage("compiled_manifest")
                                          : firstAfpReadyManifestNodeId
                                            ? availableReviewTargetMessage("compiled_manifest")
                                            : unavailableReviewTargetMessage("compiled_manifest"),
                                    }
                                : branchReviewActive
                                  ? {
                                      label: selectedRunEdgeId() ? "Primary: branch edge focus" : "Primary: branch review",
                                      tone: "border-violet-200/70 bg-violet-50/90 text-violet-700",
                                      available: Boolean(selectedRunEdgeId() || firstReviewedEdge),
                                      onClick: () => {
                                        const targetEdge = selectedRunEdgeId()
                                          ? draft().edges.find((edge) => edge.id === selectedRunEdgeId()) ?? null
                                          : firstReviewedEdge;
                                        if (targetEdge) {
                                          setSelectedRunEdgeId(targetEdge.id);
                                          setSelectedNodeId(targetEdge.target);
                                        }
                                      },
                                      title: selectedRunEdgeId()
                                        ? availableReviewTargetMessage("branch_edge")
                                        : availableReviewTargetMessage("branch_edge"),
                                    }
                                  : null;
                            return (
                          <div class="rounded-[20px] border border-slate-200/70 bg-white/84 px-4 py-3 shadow-soft backdrop-blur">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">Canvas review rail</p>
                              <Show when={selectedCompiledAfpRouteFocus() || selectedCompiledOrchestrationRole() || selectedCompiledManifestLinkageFilter() || selectedCompiledRouteLinkageFilter() || selectedCompiledAfpReadinessFocus()}>
                                <button
                                  type="button"
                                  class="rounded-full border border-slate-200/80 bg-slate-100/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-200/80"
                                  onClick={() => {
                                    setSelectedCompiledAfpRouteFocus(null);
                                    setSelectedCompiledOrchestrationRole(null);
                                    setSelectedCompiledManifestLinkageFilter(null);
                                    setSelectedCompiledRouteLinkageFilter(null);
                                    setSelectedCompiledAfpReadinessFocus(null);
                                  }}
                                  title={clearReviewFocusMessage("combined_canvas")}
                                  aria-label={clearReviewFocusMessage("combined_canvas")}
                                >
                                  Clear orchestration, readiness, manifest, route, and linkage focus
                                </button>
                              </Show>
                            </div>
                            <Show when={primaryRailFocus}>
                              {(focus) => (
                                <div class="mt-3">
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${focus().available ? "hover:bg-white" : "cursor-not-allowed opacity-70" } ${focus().tone}`}
                                    onClick={() => focus().available && focus().onClick()}
                                    title={focus().title}
                                    aria-label={focus().title}
                                    disabled={!focus().available}
                                  >
                                    {focus().label}
                                  </button>
                                  <Show when={!focus().available}>
                                    <p class="mt-2 text-[11px] leading-relaxed text-slate-600">
                                      {activeRouteFocus || activeLinkageFocus
                                        ? unavailableReviewTargetMessage("compiled_route")
                                        : activeOrchestrationRoleFocus || activeManifestLinkageFocus || activeAfpReadinessFocus
                                          ? unavailableReviewTargetMessage("compiled_manifest")
                                        : unavailableReviewTargetMessage("branch_edge")}
                                    </p>
                                  </Show>
                                </div>
                              )}
                            </Show>
                            <div class="mt-3 flex flex-wrap gap-2">
                              <Show when={activeManifestLinkageFocus}>
                                <button
                                  type="button"
                                  class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${activeManifestLinkageFocus === "linked" ? "border-sky-200/70 bg-sky-50/90 text-sky-700" : "border-amber-200/70 bg-amber-50/90 text-amber-700"}`}
                                  onClick={() => setSelectedCompiledManifestLinkageFilter(null)}
                                  title={clearReviewFocusMessage("manifest_health")}
                                  aria-label={clearReviewFocusMessage("manifest_health")}
                                >
                                  {activeManifestLinkageFocus === "linked" ? "Clear node-review-ready manifest focus" : "Clear inspector-only manifest focus"}
                                </button>
                              </Show>
                              <Show when={selectedCompiledOrchestrationRole()}>
                                <button
                                  type="button"
                                  class="rounded-full border border-cyan-200/70 bg-cyan-50/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100/90"
                                  onClick={() => setSelectedCompiledOrchestrationRole(null)}
                                  title={clearOrchestrationRoleFocusMessage()}
                                  aria-label={clearOrchestrationRoleFocusMessage()}
                                >
                                  Clear orchestration role focus
                                </button>
                              </Show>
                              <Show when={selectedCompiledAfpRouteFocus()}>
                                <button
                                  type="button"
                                  class="rounded-full border border-emerald-200/70 bg-emerald-50/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100/90"
                                  onClick={() => setSelectedCompiledAfpRouteFocus(null)}
                                  title={clearReviewFocusMessage("afp_route")}
                                  aria-label={clearReviewFocusMessage("afp_route")}
                                >
                                  Clear AFP route {selectedCompiledAfpRouteFocus() === "full" ? "full match" : "partial match"}
                                </button>
                              </Show>
                              <Show when={selectedCompiledRouteLinkageFilter()}>
                                <button
                                  type="button"
                                  class="rounded-full border border-amber-200/70 bg-amber-50/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 transition hover:border-amber-300 hover:bg-amber-100/90"
                                  onClick={() => setSelectedCompiledRouteLinkageFilter(null)}
                                  title={clearReviewFocusMessage("route_linkage")}
                                  aria-label={clearReviewFocusMessage("route_linkage")}
                                >
                                  {selectedCompiledRouteLinkageFilter() === "linked" ? "Clear branch-review-ready route focus" : "Clear inspector-only route focus"}
                                </button>
                              </Show>
                              <Show when={selectedCompiledAfpReadinessFocus()}>
                                <button
                                  type="button"
                                  class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${selectedCompiledAfpReadinessFocus() === "needs_contract_work" ? "border-amber-200/70 bg-amber-50/90 text-amber-700" : selectedCompiledAfpReadinessFocus() === "ready_handoffs" ? "border-cyan-200/70 bg-cyan-50/90 text-cyan-700" : "border-emerald-200/70 bg-emerald-50/90 text-emerald-700"}`}
                                  onClick={() => setSelectedCompiledAfpReadinessFocus(null)}
                                  title={clearAfpReadinessFocusMessage()}
                                  aria-label={clearAfpReadinessFocusMessage()}
                                >
                                  {selectedCompiledAfpReadinessFocus() === "ready_manifests"
                                    ? "Clear AFP-ready manifest focus"
                                    : selectedCompiledAfpReadinessFocus() === "ready_handoffs"
                                      ? "Clear AFP-ready handoff focus"
                                      : "Clear AFP contract-work focus"}
                                </button>
                              </Show>
                              <Show when={selectedRun() && edgeLegendStates().length > 0}>
                                <button
                                  type="button"
                                  class={`rounded-full border border-violet-200/70 bg-violet-50/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700 transition ${branchRailFocusAvailable ? "hover:border-violet-300 hover:bg-violet-100/90" : "cursor-not-allowed opacity-70"}`}
                                  onClick={() => {
                                    if (!branchRailFocusAvailable) {
                                      return;
                                    }
                                    const activeEdgeId = selectedRunEdgeId();
                                    if (activeEdgeId) {
                                      setSelectedRunEdgeId(null);
                                      return;
                                    }
                                    const firstReviewedEdge = draft().edges.find((edge) => selectedRunEdgeStates().has(edge.id));
                                    if (firstReviewedEdge) {
                                      setSelectedRunEdgeId(firstReviewedEdge.id);
                                      setSelectedNodeId(firstReviewedEdge.target);
                                    }
                                  }}
                                  title={selectedRunEdgeId()
                                    ? clearReviewFocusMessage("branch_focus")
                                    : branchRailFocusAvailable
                                      ? availableReviewTargetMessage("branch_edge")
                                      : "No traced branch edge is available for branch review yet"}
                                  aria-label={selectedRunEdgeId()
                                    ? clearReviewFocusMessage("branch_focus")
                                    : branchRailFocusAvailable
                                      ? availableReviewTargetMessage("branch_edge")
                                      : "No traced branch edge is available for branch review yet"}
                                  disabled={!branchRailFocusAvailable}
                                >
                                  {selectedRunEdgeId() ? "Clear branch focus" : branchRailFocusAvailable ? "Review branch focus" : "No branch edge to review"}
                                </button>
                              </Show>
                            </div>
                            <p class="mt-3 text-[11px] leading-relaxed text-slate-600">
                              These chips now name their actual action directly, so AFP readiness, orchestration role, manifest health, route focus, linkage focus, and branch review all use the same clear interaction language.
                            </p>
                          </div>
                            );
                          })()}
                          <Show when={selectedCompiledAfpReadinessFocus()}>
                            {(() => {
                              const readinessFocus = selectedCompiledAfpReadinessFocus();
                              const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                                ? workflow.latest_ir as Record<string, unknown>
                                : null;
                              const manifests = Array.isArray(latestIr?.manifests)
                                ? latestIr.manifests as Record<string, unknown>[]
                                : [];
                              const compiledEdges = Array.isArray(latestIr?.edges)
                                ? latestIr.edges as Record<string, unknown>[]
                                : [];
                              const readyManifestIds = new Set(
                                manifests
                                  .filter((manifest) => {
                                    const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                    const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                      ? manifest.connector_binding as Record<string, unknown>
                                      : null;
                                    const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                    const memoryConfig = manifest.memory && typeof manifest.memory === "object"
                                      ? manifest.memory as Record<string, unknown>
                                      : null;
                                    const traceConfig = manifest.trace && typeof manifest.trace === "object"
                                      ? manifest.trace as Record<string, unknown>
                                      : null;
                                    const memoryScope = typeof memoryConfig?.scope === "string" ? memoryConfig.scope : null;
                                    const traceSource = typeof traceConfig?.source === "string" ? traceConfig.source : null;
                                    const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
                                    const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
                                    return afpContract.category !== "orchestration_scaffold"
                                      && afpGapKinds.length === 0
                                      && typeof manifest.node_id === "string";
                                  })
                                  .map((manifest) => manifest.node_id as string),
                              );
                              const readyHandoffEdgeEntries = compiledEdges.filter((entry) => {
                                const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                return Boolean(
                                  fromManifestNodeId
                                    && toManifestNodeId
                                    && readyManifestIds.has(fromManifestNodeId)
                                    && readyManifestIds.has(toManifestNodeId),
                                );
                              });
                              const readyHandoffManifestIds = new Set(
                                readyHandoffEdgeEntries.flatMap((entry) => [
                                  entry.from_manifest_node_id,
                                  entry.to_manifest_node_id,
                                ].filter((value): value is string => typeof value === "string")),
                              );
                              const matchingManifestCount = manifests.filter((manifest) => {
                                const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                  ? manifest.connector_binding as Record<string, unknown>
                                  : null;
                                const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                const memoryConfig = manifest.memory && typeof manifest.memory === "object"
                                  ? manifest.memory as Record<string, unknown>
                                  : null;
                                const traceConfig = manifest.trace && typeof manifest.trace === "object"
                                  ? manifest.trace as Record<string, unknown>
                                  : null;
                                const memoryScope = typeof memoryConfig?.scope === "string" ? memoryConfig.scope : null;
                                const traceSource = typeof traceConfig?.source === "string" ? traceConfig.source : null;
                                const manifestNodeId = typeof manifest.node_id === "string" ? manifest.node_id : null;
                                const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
                                const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
                                return compiledManifestMatchesAfpReadinessFocus(readinessFocus, {
                                  manifestNodeId,
                                  readyManifestIds,
                                  readyHandoffManifestIds,
                                  afpGapKinds,
                                  afpCategory: afpContract.category,
                                });
                              }).length;
                              return <div class={`rounded-[20px] border px-4 py-3 shadow-soft backdrop-blur ${readinessFocus === "needs_contract_work" ? "border-amber-200/70 bg-white/82" : readinessFocus === "ready_handoffs" ? "border-cyan-200/70 bg-white/82" : "border-emerald-200/70 bg-white/82"}`}>
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class={`text-[11px] font-semibold uppercase tracking-[0.18em] ${readinessFocus === "needs_contract_work" ? "text-amber-700" : readinessFocus === "ready_handoffs" ? "text-cyan-700" : "text-emerald-700"}`}>AFP readiness focus</p>
                                <button
                                  type="button"
                                  class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${readinessFocus === "needs_contract_work" ? "border-amber-200/80 bg-amber-50/90 text-amber-800" : readinessFocus === "ready_handoffs" ? "border-cyan-200/80 bg-cyan-50/90 text-cyan-800" : "border-emerald-200/80 bg-emerald-50/90 text-emerald-800"}`}
                                  onClick={() => setSelectedCompiledAfpReadinessFocus(null)}
                                  title={clearAfpReadinessFocusMessage()}
                                  aria-label={clearAfpReadinessFocusMessage()}
                                >
                                  {readinessFocus === "ready_manifests"
                                    ? "Clear AFP-ready manifest focus"
                                    : readinessFocus === "ready_handoffs"
                                      ? "Clear AFP-ready handoff focus"
                                      : "Clear AFP contract-work focus"}
                                </button>
                              </div>
                              <p class={`mt-2 text-[11px] leading-relaxed ${readinessFocus === "needs_contract_work" ? "text-amber-700/80" : readinessFocus === "ready_handoffs" ? "text-cyan-700/80" : "text-emerald-700/80"}`}>
                                {afpReadinessFocusSummary(readinessFocus!)}
                              </p>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <span class={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${readinessFocus === "needs_contract_work" ? "border-amber-200/80 bg-amber-50/90 text-amber-800" : readinessFocus === "ready_handoffs" ? "border-cyan-200/80 bg-cyan-50/90 text-cyan-800" : "border-emerald-200/80 bg-emerald-50/90 text-emerald-800"}`}>
                                  {matchingManifestCount} manifests in readiness review
                                </span>
                                <Show when={readinessFocus === "ready_handoffs"}>
                                  <span class="rounded-full border border-cyan-200/80 bg-cyan-50/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800">
                                    {readyHandoffEdgeEntries.length} AFP-ready handoffs in route review
                                  </span>
                                </Show>
                              </div>
                            </div>;
                            })()}
                          </Show>
                          <Show when={selectedCompiledOrchestrationRole()}>
                            {(() => {
                              const orchestrationRole = selectedCompiledOrchestrationRole();
                              const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                                ? workflow.latest_ir as Record<string, unknown>
                                : null;
                              const manifests = Array.isArray(latestIr?.manifests)
                                ? latestIr.manifests as Record<string, unknown>[]
                                : [];
                              const compiledEdges = Array.isArray(latestIr?.edges)
                                ? latestIr.edges as Record<string, unknown>[]
                                : [];
                              const orchestrationRoleFocusedCompiledEdges = !orchestrationRole
                                ? []
                                : compiledEdges.filter((entry: Record<string, unknown>) => {
                                    const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                    const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                    if (!fromManifestNodeId || !toManifestNodeId) {
                                      return false;
                                    }
                                    const fromManifest = manifests.find((manifest: Record<string, unknown>) => manifest.node_id === fromManifestNodeId) ?? null;
                                    const toManifest = manifests.find((manifest: Record<string, unknown>) => manifest.node_id === toManifestNodeId) ?? null;
                                    const sourceRuntimeKind = typeof fromManifest?.runtime_kind === "string" ? fromManifest.runtime_kind : null;
                                    const targetRuntimeKind = typeof toManifest?.runtime_kind === "string" ? toManifest.runtime_kind : null;
                                    const sourceCapabilityId = fromManifest?.connector_binding && typeof fromManifest.connector_binding === "object" && typeof (fromManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                      ? (fromManifest.connector_binding as Record<string, unknown>).capability_id as string
                                      : null;
                                    const targetCapabilityId = toManifest?.connector_binding && typeof toManifest.connector_binding === "object" && typeof (toManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                      ? (toManifest.connector_binding as Record<string, unknown>).capability_id as string
                                      : null;
                                    return compiledManifestOrchestrationRole(sourceRuntimeKind, sourceCapabilityId).role === orchestrationRole
                                      || compiledManifestOrchestrationRole(targetRuntimeKind, targetCapabilityId).role === orchestrationRole;
                                  });
                              const orchestrationRoleFocusedRouteCount = orchestrationRoleFocusedCompiledEdges.length;
                              const orchestrationRoleGraphLinkedRouteCount = orchestrationRoleFocusedCompiledEdges.filter((entry: Record<string, unknown>) => {
                                const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                const routeLabel = typeof entry.route_label === "string" ? entry.route_label : null;
                                if (!fromManifestNodeId || !toManifestNodeId) {
                                  return false;
                                }
                                const fromManifest = manifests.find((manifest: Record<string, unknown>) => manifest.node_id === fromManifestNodeId) ?? null;
                                const toManifest = manifests.find((manifest: Record<string, unknown>) => manifest.node_id === toManifestNodeId) ?? null;
                                const sourceGraphNodeId = typeof fromManifest?.source_graph_node_id === "string" ? fromManifest.source_graph_node_id : null;
                                const targetGraphNodeId = typeof toManifest?.source_graph_node_id === "string" ? toManifest.source_graph_node_id : null;
                                return Boolean(
                                  sourceGraphNodeId
                                    && targetGraphNodeId
                                    && draft().edges.find(
                                      (graphEdge) => graphEdge.source === sourceGraphNodeId
                                        && graphEdge.target === targetGraphNodeId
                                        && (graphEdge.condition_label ?? null) === routeLabel,
                                    ),
                                );
                              }).length;
                              const orchestrationRoleInspectorOnlyRouteCount = Math.max(
                                0,
                                orchestrationRoleFocusedRouteCount - orchestrationRoleGraphLinkedRouteCount,
                              );
                              const activeRouteLinkageFocus = selectedCompiledRouteLinkageFilter();
                              return <div class="rounded-[20px] border border-cyan-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Orchestration role focus</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-cyan-200/80 bg-cyan-100/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800 transition hover:border-cyan-300 hover:bg-cyan-200/70"
                                  onClick={() => setSelectedCompiledOrchestrationRole(null)}
                                  title={clearOrchestrationRoleFocusMessage()}
                                  aria-label={clearOrchestrationRoleFocusMessage()}
                                >
                                  Clear orchestration role focus
                                </button>
                              </div>
                              <p class="mt-2 text-[11px] leading-relaxed text-cyan-700/80">
                                {orchestrationRoleRailGuideMessage()}
                              </p>
                              <div class="mt-3 space-y-2">
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700">
                                  <span class="h-2.5 w-8 rounded-full bg-cyan-500" />
                                  <span>{compiledManifestOrchestrationRole(
                                    orchestrationRole === "delegated_capability"
                                      ? "executor"
                                      : orchestrationRole === "delegated_decision"
                                        ? "approval_runtime"
                                        : orchestrationRole === "workflow_summary"
                                          ? "termination_runtime"
                                          : "plan",
                                    orchestrationRole === "delegated_capability" ? "capability" : null,
                                  ).label} remain in focus</span>
                                </div>
                                <Show when={orchestrationRoleFocusedRouteCount > 0}>
                                  <div class="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      class="rounded-full border border-cyan-200/80 bg-cyan-50/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800 transition hover:bg-white"
                                      onClick={() => setSelectedCompiledRouteLinkageFilter(null)}
                                      title={broadenOrchestrationRoleRouteReviewMessage()}
                                      aria-label={broadenOrchestrationRoleRouteReviewMessage()}
                                    >
                                      {orchestrationRoleFocusedRouteCount} routes support this role review
                                    </button>
                                    <Show when={orchestrationRoleGraphLinkedRouteCount > 0}>
                                      <button
                                        type="button"
                                        class={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${activeRouteLinkageFocus === "linked" ? "border-sky-300 bg-white ring-2 ring-sky-300/70 text-sky-800" : "border-sky-200/80 bg-sky-50/90 text-sky-800"}`}
                                        onClick={() => setSelectedCompiledRouteLinkageFilter(activeRouteLinkageFocus === "linked" ? null : "linked")}
                                        title={activeRouteLinkageFocus === "linked"
                                          ? clearOverlappingRouteNarrowingMessage("linked")
                                          : focusRouteLinkageReviewMessage("linked")}
                                        aria-label={activeRouteLinkageFocus === "linked"
                                          ? clearOverlappingRouteNarrowingMessage("linked")
                                          : focusRouteLinkageReviewMessage("linked")}
                                      >
                                        {orchestrationRoleGraphLinkedRouteCount} branch-review-ready routes
                                      </button>
                                    </Show>
                                    <Show when={orchestrationRoleInspectorOnlyRouteCount > 0}>
                                      <button
                                        type="button"
                                        class={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${activeRouteLinkageFocus === "manifest_only" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-800" : "border-amber-200/80 bg-amber-50/90 text-amber-800"}`}
                                        onClick={() => setSelectedCompiledRouteLinkageFilter(activeRouteLinkageFocus === "manifest_only" ? null : "manifest_only")}
                                        title={activeRouteLinkageFocus === "manifest_only"
                                          ? clearOverlappingRouteNarrowingMessage("manifest_only")
                                          : focusRouteLinkageReviewMessage("manifest_only")}
                                        aria-label={activeRouteLinkageFocus === "manifest_only"
                                          ? clearOverlappingRouteNarrowingMessage("manifest_only")
                                          : focusRouteLinkageReviewMessage("manifest_only")}
                                      >
                                        {orchestrationRoleInspectorOnlyRouteCount} inspector-only routes
                                      </button>
                                    </Show>
                                  </div>
                                </Show>
                                <Show when={activeRouteLinkageFocus}>
                                  <p class="text-[11px] leading-relaxed text-cyan-700/80">
                                    {overlappingOrchestrationRouteSummaryMessage(activeRouteLinkageFocus === "linked" ? "linked" : "manifest_only")}
                                  </p>
                                </Show>
                                <Show when={orchestrationRoleFocusedRouteCount > 0}>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                    <span class="h-2.5 w-8 rounded-full bg-sky-500" />
                                    <span>Branch-review-ready routes touching this role stay visible on the graph</span>
                                  </div>
                                </Show>
                                <Show when={orchestrationRoleInspectorOnlyRouteCount > 0}>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                    <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                    <span>Inspector-only routes for this role stay in compiled review only</span>
                                  </div>
                                </Show>
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                  <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                  <span>{orchestrationRoleOutsideFocusMessage()}</span>
                                </div>
                              </div>
                            </div>;
                            })()}
                          </Show>
                          <Show when={selectedCompiledManifestLinkageFilter()}>
                            <div class="rounded-[20px] border border-sky-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Manifest health focus</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-sky-200/80 bg-sky-100/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-800 transition hover:border-sky-300 hover:bg-sky-200/70"
                                  onClick={() => setSelectedCompiledManifestLinkageFilter(null)}
                                  title={clearReviewFocusMessage("manifest_health")}
                                  aria-label={clearReviewFocusMessage("manifest_health")}
                                >
                                  Clear manifest health focus
                                </button>
                              </div>
                              <div class="mt-3 space-y-2">
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                  <span class="h-2.5 w-8 rounded-full bg-sky-500" />
                                  <span>{selectedCompiledManifestLinkageFilter() === "linked" ? "Node-review-ready manifests remain in focus" : "Node-review-ready manifests are de-emphasized"}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                  <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                  <span>{selectedCompiledManifestLinkageFilter() === "inspector_only" ? "Inspector-only manifests stay in compiled review only" : "Inspector-only manifests are outside canvas node focus"}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                  <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                  <span>Dimmed nodes are outside the current manifest health focus</span>
                                </div>
                              </div>
                            </div>
                          </Show>
                          <Show when={selectedCompiledAfpFilter() && selectedCompiledAfpRouteFocus()}>
                            <div class="rounded-[20px] border border-emerald-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">AFP route focus</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                  onClick={() => setSelectedCompiledAfpRouteFocus(null)}
                                  title={clearReviewFocusMessage("afp_route")}
                                  aria-label={clearReviewFocusMessage("afp_route")}
                                >
                                  Clear AFP route focus
                                </button>
                              </div>
                              <p class="mt-2 text-[11px] leading-relaxed text-emerald-700/80">
                                Use this card to clear AFP route emphasis while keeping the broader AFP node slice active on the graph.
                              </p>
                              <div class="mt-3 space-y-2">
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                  <span class="h-2.5 w-8 rounded-full bg-emerald-600" />
                                  <span>{selectedCompiledAfpRouteFocus() === "full" ? "Full AFP route review focus" : "Matched route review remains in focus"}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                  <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                  <span>{selectedCompiledAfpRouteFocus() === "partial" ? "Partial AFP route review focus" : "Partial AFP route review"}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                  <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                  <span>Dimmed graph elements are outside the current route review focus</span>
                                </div>
                              </div>
                            </div>
                          </Show>
                          <Show when={selectedCompiledRouteLinkageFilter()}>
                            <div class="rounded-[20px] border border-amber-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Route linkage focus</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-amber-200/80 bg-amber-100/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 transition hover:border-amber-300 hover:bg-amber-200/70"
                                  onClick={() => setSelectedCompiledRouteLinkageFilter(null)}
                                  title={clearReviewFocusMessage("route_linkage")}
                                  aria-label={clearReviewFocusMessage("route_linkage")}
                                >
                                  Clear linkage focus
                                </button>
                              </div>
                              <p class="mt-2 text-[11px] leading-relaxed text-amber-700/80">
                                Use this card to clear compiled route review emphasis while keeping the rest of the canvas review context intact.
                              </p>
                              <div class="mt-3 space-y-2">
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                  <span class="h-2.5 w-8 rounded-full bg-emerald-600" />
                                  <span>{selectedCompiledRouteLinkageFilter() === "linked" ? "Branch-review-ready routes remain in focus" : "Branch-review-ready routes are de-emphasized"}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                  <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                  <span>{selectedCompiledRouteLinkageFilter() === "manifest_only" ? "Inspector-only routes remain in focus" : "Inspector-only routes are de-emphasized"}</span>
                                </div>
                                <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                  <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                  <span>Dimmed graph elements are outside the current route linkage review focus</span>
                                </div>
                              </div>
                            </div>
                          </Show>
                          <Show when={selectedRun() && edgeLegendStates().length > 0}>
                            <div class="pointer-events-none rounded-[20px] border border-white/45 bg-white/78 px-4 py-3 shadow-soft backdrop-blur">
                              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Branch legend</p>
                              <p class="mt-2 text-[11px] leading-relaxed text-slate-600">
                                Choose a branch state below to focus the first matching traced edge on the graph.
                              </p>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <For each={edgeLegendStates()}>
                                  {(state) => {
                                    const visual = edgeExecutionVisual(state);
                                    return (
                                      <button
                                        type="button"
                                        class="pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                                        style={{
                                          border: `1px solid ${visual.badgeBorder}`,
                                          "background-color": visual.badgeFill,
                                          color: visual.badgeText,
                                        }}
                                        onClick={() => {
                                          const matchingEdge = draft().edges.find((edge) => selectedRunEdgeStates().get(edge.id) === state);
                                          if (matchingEdge) {
                                            setSelectedRunEdgeId(matchingEdge.id);
                                            setSelectedNodeId(matchingEdge.target);
                                          }
                                        }}
                                      >
                                        <span class="h-2.5 w-2.5 rounded-full" style={{ "background-color": visual.stroke }} />
                                        {visual.legend}
                                      </button>
                                    );
                                  }}
                                </For>
                              </div>
                            </div>
                          </Show>
                        </div>
                      </Show>
                      <svg class="absolute inset-0 h-full w-full">
                        <For each={draft().edges}>{(edge) => {
                          const line = edgeLine(draft(), edge);
                          const edgeState = selectedRunEdgeStates().get(edge.id);
                          const edgeProtected = protectedEdgeIds().has(edge.id);
                          const activeCompiledAfpFilter = selectedCompiledAfpFilter();
                          const activeCompiledAfpReadinessFocus = selectedCompiledAfpReadinessFocus();
                          const activeCompiledRouteLinkageFilter = selectedCompiledRouteLinkageFilter();
                          const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                            ? workflow.latest_ir as Record<string, unknown>
                            : null;
                          const latestManifests = Array.isArray(latestIr?.manifests) ? latestIr.manifests as Record<string, unknown>[] : [];
                          const readyManifestIds = new Set(
                            latestManifests
                              .filter((manifest) => {
                                const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                  ? manifest.connector_binding as Record<string, unknown>
                                  : null;
                                const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                const memoryConfig = manifest.memory && typeof manifest.memory === "object"
                                  ? manifest.memory as Record<string, unknown>
                                  : null;
                                const traceConfig = manifest.trace && typeof manifest.trace === "object"
                                  ? manifest.trace as Record<string, unknown>
                                  : null;
                                const memoryScope = typeof memoryConfig?.scope === "string" ? memoryConfig.scope : null;
                                const traceSource = typeof traceConfig?.source === "string" ? traceConfig.source : null;
                                const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
                                const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
                                return afpContract.category !== "orchestration_scaffold"
                                  && afpGapKinds.length === 0
                                  && typeof manifest.node_id === "string";
                              })
                              .map((manifest) => manifest.node_id as string),
                          );
                          const readyHandoffGraphEdgeIds = new Set(
                            (Array.isArray(latestIr?.edges) ? latestIr.edges as Record<string, unknown>[] : [])
                              .map((entry) => {
                                const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                const routeLabel = typeof entry.route_label === "string" ? entry.route_label : null;
                                if (!fromManifestNodeId || !toManifestNodeId) return null;
                                if (!readyManifestIds.has(fromManifestNodeId) || !readyManifestIds.has(toManifestNodeId)) return null;
                                const fromManifest = latestManifests.find((manifest) => manifest?.node_id === fromManifestNodeId) ?? null;
                                const toManifest = latestManifests.find((manifest) => manifest?.node_id === toManifestNodeId) ?? null;
                                const sourceNodeId = typeof fromManifest?.source_graph_node_id === "string" ? fromManifest.source_graph_node_id : null;
                                const targetNodeId = typeof toManifest?.source_graph_node_id === "string" ? toManifest.source_graph_node_id : null;
                                if (!sourceNodeId || !targetNodeId) return null;
                                return draft().edges.find(
                                  (graphEdge) => graphEdge.source === sourceNodeId
                                    && graphEdge.target === targetNodeId
                                    && (graphEdge.condition_label ?? null) === routeLabel,
                                )?.id ?? null;
                              })
                              .filter((edgeId): edgeId is string => Boolean(edgeId)),
                          );
                          const matchingNodeIds = !activeCompiledAfpFilter
                            ? null
                            : new Set(
                                latestManifests
                                  .filter((manifest) => {
                                    const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                                    const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                      ? manifest.connector_binding as Record<string, unknown>
                                      : null;
                                    const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                                    return compiledManifestAfpContract(runtimeKind, capabilityId).category === activeCompiledAfpFilter;
                                  })
                                  .map((manifest) => typeof manifest.source_graph_node_id === "string" ? manifest.source_graph_node_id : null)
                                  .filter((nodeId): nodeId is string => Boolean(nodeId)),
                              );
                          const activeCompiledAfpRouteFocus = selectedCompiledAfpRouteFocus();
                          const compiledLinkedGraphEdgeIds = new Set(
                            (Array.isArray(latestIr?.edges) ? latestIr.edges as Record<string, unknown>[] : [])
                              .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
                              .map((entry) => {
                                const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                                const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                                const routeLabel = typeof entry.route_label === "string" ? entry.route_label : null;
                                const fromManifest = latestManifests.find((manifest) => manifest?.node_id === fromManifestNodeId) ?? null;
                                const toManifest = latestManifests.find((manifest) => manifest?.node_id === toManifestNodeId) ?? null;
                                const sourceNodeId = typeof fromManifest?.source_graph_node_id === "string" ? fromManifest.source_graph_node_id : null;
                                const targetNodeId = typeof toManifest?.source_graph_node_id === "string" ? toManifest.source_graph_node_id : null;
                                const sourceRuntimeKind = typeof fromManifest?.runtime_kind === "string" ? fromManifest.runtime_kind : null;
                                const targetRuntimeKind = typeof toManifest?.runtime_kind === "string" ? toManifest.runtime_kind : null;
                                const sourceCapabilityId = fromManifest?.connector_binding && typeof fromManifest.connector_binding === "object" && typeof (fromManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                  ? (fromManifest.connector_binding as Record<string, unknown>).capability_id as string
                                  : null;
                                const targetCapabilityId = toManifest?.connector_binding && typeof toManifest.connector_binding === "object" && typeof (toManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                  ? (toManifest.connector_binding as Record<string, unknown>).capability_id as string
                                  : null;
                                const sourceMatches = !activeCompiledAfpFilter || compiledManifestAfpContract(sourceRuntimeKind, sourceCapabilityId).category === activeCompiledAfpFilter;
                                const targetMatches = !activeCompiledAfpFilter || compiledManifestAfpContract(targetRuntimeKind, targetCapabilityId).category === activeCompiledAfpFilter;
                                if (activeCompiledAfpRouteFocus === "full" && !(sourceMatches && targetMatches)) return null;
                                if (activeCompiledAfpRouteFocus === "partial" && !((sourceMatches || targetMatches) && !(sourceMatches && targetMatches))) return null;
                                if (!activeCompiledAfpRouteFocus && activeCompiledAfpFilter && !(sourceMatches || targetMatches)) return null;
                                if (!sourceNodeId || !targetNodeId) return null;
                                return draft().edges.find(
                                  (graphEdge) => graphEdge.source === sourceNodeId
                                    && graphEdge.target === targetNodeId
                                    && (graphEdge.condition_label ?? null) === routeLabel,
                                )?.id ?? null;
                              })
                              .filter((edgeId): edgeId is string => Boolean(edgeId)),
                          );
                          const edgeMatchesCompiledAfpFilter = !matchingNodeIds
                            ? true
                            : matchingNodeIds.has(edge.source) && matchingNodeIds.has(edge.target);
                          const edgeTouchesCompiledAfpFilter = !matchingNodeIds
                            ? false
                            : matchingNodeIds.has(edge.source) || matchingNodeIds.has(edge.target);
                          const edgeMatchesRouteFocus = !activeCompiledAfpRouteFocus
                            ? true
                            : activeCompiledAfpRouteFocus === "full"
                              ? edgeMatchesCompiledAfpFilter
                              : edgeTouchesCompiledAfpFilter && !edgeMatchesCompiledAfpFilter;
                          const edgeMatchesLinkageFocus = !activeCompiledRouteLinkageFilter
                            ? true
                            : activeCompiledRouteLinkageFilter === "linked"
                              ? compiledLinkedGraphEdgeIds.has(edge.id)
                              : false;
                          const edgeTouchesAfpReadyManifest = !activeCompiledAfpReadinessFocus
                            ? true
                            : (() => {
                                const sourceManifest = latestManifests.find((manifest) => manifest?.source_graph_node_id === edge.source) ?? null;
                                const targetManifest = latestManifests.find((manifest) => manifest?.source_graph_node_id === edge.target) ?? null;
                                const sourceManifestNodeId = typeof sourceManifest?.node_id === "string" ? sourceManifest.node_id : null;
                                const targetManifestNodeId = typeof targetManifest?.node_id === "string" ? targetManifest.node_id : null;
                                if (activeCompiledAfpReadinessFocus === "ready_manifests") {
                                  return Boolean(
                                    (sourceManifestNodeId && readyManifestIds.has(sourceManifestNodeId))
                                    || (targetManifestNodeId && readyManifestIds.has(targetManifestNodeId)),
                                  );
                                }
                                if (activeCompiledAfpReadinessFocus === "ready_handoffs") {
                                  return readyHandoffGraphEdgeIds.has(edge.id);
                                }
                                return Boolean(
                                  (sourceManifestNodeId && !readyManifestIds.has(sourceManifestNodeId))
                                  || (targetManifestNodeId && !readyManifestIds.has(targetManifestNodeId)),
                                );
                              })();
                          const edgeAfpOverlayLabel = !activeCompiledAfpFilter
                            ? activeCompiledAfpReadinessFocus === "ready_manifests"
                              ? edgeTouchesAfpReadyManifest
                                ? "AFP-ready route review"
                                : "outside AFP-ready review"
                              : activeCompiledAfpReadinessFocus === "ready_handoffs"
                                ? readyHandoffGraphEdgeIds.has(edge.id)
                                  ? "AFP-ready handoff review"
                                  : "outside AFP-ready handoff review"
                                : activeCompiledAfpReadinessFocus === "needs_contract_work"
                                  ? edgeTouchesAfpReadyManifest
                                    ? "outside AFP contract-work review"
                                    : "AFP contract-work review"
                                  : null
                            : edgeMatchesCompiledAfpFilter
                              ? "AFP route match"
                              : edgeTouchesCompiledAfpFilter
                                ? "partial AFP route"
                                : "outside AFP focus";
                          const visual = edgeExecutionVisual(edgeState);
                          const edgeCallout = runEdgeCanvasCallout(selectedRun(), edge, edgeState);
                          const edgePolicyDelta = selectedRunEdgePolicyDeltas().get(edge.id);
                          const edgeSelected = selectedRunEdgeId() === edge.id;
                          const midX = line ? (line.x1 + line.x2) / 2 : 0;
                          const midY = line ? (line.y1 + line.y2) / 2 : 0;
                          const strokeWidth = edgeSelected ? 6 : edgeProtected ? 5 : edgeState ? 4 : 3;
                          const effectiveStroke = !activeCompiledAfpFilter
                            ? visual.stroke
                            : edgeMatchesCompiledAfpFilter
                              ? "#059669"
                              : edgeTouchesCompiledAfpFilter
                                ? "#f59e0b"
                                : visual.stroke;
                          const readinessStroke = activeCompiledAfpReadinessFocus === "needs_contract_work"
                            ? "#d97706"
                            : activeCompiledAfpReadinessFocus === "ready_handoffs"
                              ? "#0891b2"
                              : "#059669";
                          const effectiveOpacity = activeCompiledAfpReadinessFocus
                            ? edgeTouchesAfpReadyManifest
                              ? activeCompiledRouteLinkageFilter === "linked" && !edgeMatchesLinkageFocus
                                ? 0.18
                                : 1
                              : 0.18
                            : !activeCompiledAfpFilter
                            ? activeCompiledRouteLinkageFilter === "linked"
                              ? edgeMatchesLinkageFocus ? 1 : 0.18
                              : activeCompiledRouteLinkageFilter === "manifest_only"
                                ? 0.12
                                : 1
                            : !edgeMatchesRouteFocus
                              ? 0.16
                            : activeCompiledRouteLinkageFilter === "linked" && !edgeMatchesLinkageFocus
                              ? 0.18
                            : activeCompiledRouteLinkageFilter === "manifest_only"
                              ? 0.12
                            : edgeMatchesCompiledAfpFilter
                              ? 1
                              : edgeTouchesCompiledAfpFilter
                                ? 0.9
                                : 0.35;
                          return (
                            <Show when={line}>
                              {(coords) => (
                                <>
                                  <line
                                    x1={coords().x1}
                                    y1={coords().y1}
                                    x2={coords().x2}
                                    y2={coords().y2}
                                    stroke={activeCompiledAfpReadinessFocus ? readinessStroke : effectiveStroke}
                                    stroke-width={strokeWidth}
                                    stroke-linecap="round"
                                    stroke-dasharray={visual.dasharray}
                                    class="pointer-events-none"
                                    opacity={effectiveOpacity}
                                  />
                                  <circle cx={coords().x1} cy={coords().y1} r={edgeSelected ? "5" : "4"} fill={edgeState ? effectiveStroke : "rgba(37, 99, 235, 0.9)"} class="pointer-events-none" opacity={effectiveOpacity} />
                                  <circle cx={coords().x2} cy={coords().y2} r={edgeSelected ? "5" : "4"} fill={edgeState ? effectiveStroke : "rgba(37, 99, 235, 0.7)"} class="pointer-events-none" opacity={effectiveOpacity} />
                                  <Show when={edge.condition_label}>
                                    <text
                                      x={midX}
                                      y={edgeCallout ? midY - 16 : midY - 8}
                                      text-anchor="middle"
                                      class="fill-slate-600 text-[11px] font-semibold uppercase tracking-[0.14em]"
                                      style={{ "pointer-events": "none" }}
                                    >
                                      {edge.condition_label}
                                    </text>
                                  </Show>
                                  <Show when={edgeAfpOverlayLabel}>
                                    <foreignObject x={midX - 60} y={edgeCallout ? midY + 36 : midY + 6} width="120" height="24">
                                      <div
                                        class={`flex h-6 w-full items-center justify-center rounded-full border text-center text-[10px] font-semibold uppercase tracking-[0.08em] ${edgeMatchesCompiledAfpFilter ? "border-emerald-200/70 bg-white/92 text-emerald-700" : edgeTouchesCompiledAfpFilter ? "border-amber-200/70 bg-white/92 text-amber-700" : "border-slate-200/70 bg-white/92 text-slate-600"}`}
                                      >
                                        {edgeAfpOverlayLabel}
                                      </div>
                                    </foreignObject>
                                  </Show>
                                  <Show when={edgeCallout}>
                                    <foreignObject x={midX - 78} y={edgeAfpOverlayLabel ? midY + 28 : midY + 4} width="156" height="28">
                                      <button
                                        type="button"
                                        class="flex h-7 w-full items-center justify-center rounded-full border text-center text-[10px] font-bold uppercase tracking-[0.06em] transition hover:brightness-[0.98]"
                                        style={{
                                          "background-color": edgeCallout?.fill ?? "rgba(255,255,255,0.96)",
                                          border: `1px solid ${edgeCallout?.border ?? "rgba(191,219,254,0.96)"}`,
                                          color: edgeCallout?.textColor ?? "#334155",
                                          "box-shadow": edgeSelected ? "0 0 0 2px rgba(255,255,255,0.9)" : "none",
                                        }}
                                        onClick={() => {
                                          setSelectedRunEdgeId((current) => current === edge.id ? null : edge.id);
                                          setSelectedNodeId(edge.target);
                                        }}
                                        title={`Focus branch ${edge.condition_label ?? `${edge.source} to ${edge.target}`}`}
                                      >
                                        {edgeCallout?.text}
                                      </button>
                                    </foreignObject>
                                  </Show>
                                  <Show when={edgePolicyDelta}>
                                    <foreignObject x={midX - 52} y={edgeCallout ? (edgeAfpOverlayLabel ? midY + 60 : midY + 36) : (edgeAfpOverlayLabel ? midY + 30 : midY + 6)} width="104" height="24">
                                      <button
                                        type="button"
                                        class="flex h-6 w-full items-center justify-center rounded-full border border-sky-200/70 bg-white/92 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700 transition hover:bg-white"
                                        onClick={() => {
                                          setSelectedRunEdgeId(edge.id);
                                          focusPolicyDiffReview(
                                            edgePolicyDelta?.nodeId ?? edge.target,
                                            edgePolicyDelta?.source === "replay_policy_delta" ? "replay_drift" : "deployment_context",
                                            selectedRun()?.run_id ?? null,
                                          );
                                          focusDeploymentRecord(edgePolicyDelta?.deploymentId ?? null);
                                        }}
                                        title="Review branch policy delta"
                                      >
                                        delta
                                      </button>
                                    </foreignObject>
                                  </Show>
                                </>
                              )}
                            </Show>
                          );
                        }}</For>
                      </svg>
                      <For each={draft().nodes}>{(node) => {
                        const nodeStatus = selectedRunStatuses().get(node.id);
                        const stepOrder = selectedRunStepOrder().get(node.id);
                        const nodeProtected = protectedNodeIds().has(node.id);
                        const canvasCallout = runNodeCanvasCallout(selectedRun(), node, nodeStatus);
                        const runNodePolicyDelta = selectedRunNodePolicyDeltas().get(node.id);
                        const deploymentPolicy = nodeDeploymentPolicies().get(node.id);
                        const deploymentVisual = deploymentPolicy ? deploymentPolicyVisual(deploymentPolicy.source) : null;
                        const pendingPolicy = pendingNodeDeploymentPolicies().get(node.id);
                        const pendingChanges = deploymentPolicyChanges(deploymentPolicy?.fields, pendingPolicy?.fields);
                        const runNodePolicyDeltaSummaryText = runNodePolicyDelta
                          ? runNodePolicyDelta.changes
                            .slice(0, 2)
                            .map((change) => change.field.replaceAll("_", " "))
                            .join(", ")
                          : null;
                        const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                          ? workflow.latest_ir as Record<string, unknown>
                          : null;
                        const compiledManifest = Array.isArray(latestIr?.manifests)
                          ? (latestIr.manifests as Record<string, unknown>[]).find((entry) => entry.source_graph_node_id === node.id) ?? null
                          : null;
                        const compiledRuntimeKind = typeof compiledManifest?.runtime_kind === "string" ? compiledManifest.runtime_kind : null;
                        const compiledManifestNodeId = typeof compiledManifest?.node_id === "string" ? compiledManifest.node_id : null;
                        const compiledCapabilityId =
                          compiledManifest?.connector_binding
                          && typeof compiledManifest.connector_binding === "object"
                          && typeof (compiledManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                            ? (compiledManifest.connector_binding as Record<string, unknown>).capability_id as string
                            : null;
                        const compiledMemoryScope = typeof compiledManifest?.memory_scope === "string" ? compiledManifest.memory_scope : null;
                        const compiledTraceSource =
                          compiledManifest?.connector_binding
                          && typeof compiledManifest.connector_binding === "object"
                          && typeof (compiledManifest.connector_binding as Record<string, unknown>).trace_source === "string"
                            ? (compiledManifest.connector_binding as Record<string, unknown>).trace_source as string
                            : null;
                        const compiledAfpContract = compiledManifestAfpContract(compiledRuntimeKind, compiledCapabilityId);
                        const compiledOrchestrationRole = compiledManifestOrchestrationRole(compiledRuntimeKind, compiledCapabilityId);
                        const compiledAfpGapKinds = compiledManifestAfpGapKinds(compiledRuntimeKind, compiledCapabilityId, compiledMemoryScope, compiledTraceSource);
                        const activeCompiledAfpFilter = selectedCompiledAfpFilter();
                        const activeCompiledAfpGapFilter = selectedCompiledAfpGapFilter();
                        const activeCompiledAfpReadinessFocus = selectedCompiledAfpReadinessFocus();
                        const activeCompiledOrchestrationRole = selectedCompiledOrchestrationRole();
                        const activeCompiledManifestLinkageFilter = selectedCompiledManifestLinkageFilter();
                        const readyManifestIds = new Set(
                          (Array.isArray(latestIr?.manifests) ? latestIr.manifests as Record<string, unknown>[] : [])
                            .filter((manifest) => {
                              const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                              const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                                ? manifest.connector_binding as Record<string, unknown>
                                : null;
                              const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                              const memoryConfig = manifest.memory && typeof manifest.memory === "object"
                                ? manifest.memory as Record<string, unknown>
                                : null;
                              const traceConfig = manifest.trace && typeof manifest.trace === "object"
                                ? manifest.trace as Record<string, unknown>
                                : null;
                              const memoryScope = typeof memoryConfig?.scope === "string" ? memoryConfig.scope : null;
                              const traceSource = typeof traceConfig?.source === "string" ? traceConfig.source : null;
                              const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
                              const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
                              return afpContract.category !== "orchestration_scaffold"
                                && afpGapKinds.length === 0
                                && typeof manifest.node_id === "string";
                            })
                            .map((manifest) => manifest.node_id as string),
                        );
                        const readyHandoffManifestIds = new Set(
                          (Array.isArray(latestIr?.edges) ? latestIr.edges as Record<string, unknown>[] : []).flatMap((entry) => {
                            const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                            const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                            const isReadyHandoff = Boolean(
                              fromManifestNodeId
                                && toManifestNodeId
                                && readyManifestIds.has(fromManifestNodeId)
                                && readyManifestIds.has(toManifestNodeId),
                            );
                            return isReadyHandoff
                              ? [fromManifestNodeId, toManifestNodeId].filter((value): value is string => Boolean(value))
                              : [];
                          }),
                        );
                        const matchesCompiledAfpFilter = !activeCompiledAfpFilter
                          ? true
                          : Boolean(compiledManifest) && compiledAfpContract.category === activeCompiledAfpFilter;
                        const matchesCompiledAfpGapFilter = !activeCompiledAfpGapFilter
                          ? true
                          : Boolean(compiledManifest) && compiledAfpGapKinds.includes(activeCompiledAfpGapFilter);
                        const matchesCompiledOrchestrationRole = !activeCompiledOrchestrationRole
                          ? true
                          : Boolean(compiledManifest) && compiledOrchestrationRole.role === activeCompiledOrchestrationRole;
                        const matchesCompiledManifestLinkageFilter = !activeCompiledManifestLinkageFilter
                          ? true
                          : activeCompiledManifestLinkageFilter === "linked"
                            ? Boolean(compiledManifest)
                            : false;
                        const matchesCompiledAfpReadinessFocus = compiledManifestMatchesAfpReadinessFocus(activeCompiledAfpReadinessFocus, {
                          manifestNodeId: compiledManifestNodeId,
                          readyManifestIds,
                          readyHandoffManifestIds,
                          afpGapKinds: compiledAfpGapKinds,
                          afpCategory: compiledAfpContract.category,
                        });
                        const activeCompiledAfpRouteFocus = selectedCompiledAfpRouteFocus();
                        const nodeParticipatesInRouteFocus = !activeCompiledAfpFilter || !activeCompiledAfpRouteFocus
                          ? true
                          : draft().edges.some((edge) => {
                              const sourceManifest = Array.isArray(latestIr?.manifests)
                                ? (latestIr.manifests as Record<string, unknown>[]).find((entry) => entry.source_graph_node_id === edge.source) ?? null
                                : null;
                              const targetManifest = Array.isArray(latestIr?.manifests)
                                ? (latestIr.manifests as Record<string, unknown>[]).find((entry) => entry.source_graph_node_id === edge.target) ?? null
                                : null;
                              const sourceRuntimeKind = typeof sourceManifest?.runtime_kind === "string" ? sourceManifest.runtime_kind : null;
                              const targetRuntimeKind = typeof targetManifest?.runtime_kind === "string" ? targetManifest.runtime_kind : null;
                              const sourceCapabilityId = sourceManifest?.connector_binding && typeof sourceManifest.connector_binding === "object" && typeof (sourceManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                ? (sourceManifest.connector_binding as Record<string, unknown>).capability_id as string
                                : null;
                              const targetCapabilityId = targetManifest?.connector_binding && typeof targetManifest.connector_binding === "object" && typeof (targetManifest.connector_binding as Record<string, unknown>).capability_id === "string"
                                ? (targetManifest.connector_binding as Record<string, unknown>).capability_id as string
                                : null;
                              const sourceMatches = Boolean(sourceManifest) && compiledManifestAfpContract(sourceRuntimeKind, sourceCapabilityId).category === activeCompiledAfpFilter;
                              const targetMatches = Boolean(targetManifest) && compiledManifestAfpContract(targetRuntimeKind, targetCapabilityId).category === activeCompiledAfpFilter;
                              const routeMatches = activeCompiledAfpRouteFocus === "full"
                                ? sourceMatches && targetMatches
                                : (sourceMatches || targetMatches) && !(sourceMatches && targetMatches);
                              return routeMatches && (edge.source === node.id || edge.target === node.id);
                            });
                        const afpFilterOverlayLabel = activeCompiledOrchestrationRole
                          ? matchesCompiledOrchestrationRole
                            ? compiledOrchestrationRole.label
                            : compiledManifest
                              ? "outside orchestration role focus"
                              : "outside compiled orchestration focus"
                          : activeCompiledAfpReadinessFocus
                          ? matchesCompiledAfpReadinessFocus
                            ? activeCompiledAfpReadinessFocus === "ready_manifests"
                              ? "AFP-ready manifest review"
                              : activeCompiledAfpReadinessFocus === "ready_handoffs"
                                ? "AFP-ready handoff review"
                                : "AFP contract-work review"
                            : compiledManifest
                              ? "outside AFP readiness review"
                              : "outside compiled AFP readiness"
                          : activeCompiledAfpGapFilter
                          ? matchesCompiledAfpGapFilter
                            ? compiledAfpGapLabel(activeCompiledAfpGapFilter)
                            : compiledManifest
                              ? "outside AFP gap focus"
                              : "outside compiled AFP gap focus"
                          : !activeCompiledAfpFilter
                          ? activeCompiledManifestLinkageFilter === "linked"
                            ? matchesCompiledManifestLinkageFilter
                              ? "manifest health match"
                              : "outside manifest health"
                            : activeCompiledManifestLinkageFilter === "inspector_only"
                              ? "inspector-only review context"
                              : null
                          : matchesCompiledAfpFilter
                            ? "AFP review match"
                            : compiledManifest
                              ? "outside AFP review focus"
                              : "outside compiled AFP review";
                        const afpFilterOverlayClass = activeCompiledOrchestrationRole
                          ? matchesCompiledOrchestrationRole
                            ? compiledOrchestrationRole.chipClass
                            : "border-slate-200/70 bg-slate-100/85 text-slate-600"
                          : activeCompiledAfpReadinessFocus
                          ? matchesCompiledAfpReadinessFocus
                            ? activeCompiledAfpReadinessFocus === "needs_contract_work"
                              ? "border-amber-200/70 bg-amber-50/85 text-amber-700"
                              : activeCompiledAfpReadinessFocus === "ready_handoffs"
                                ? "border-cyan-200/70 bg-cyan-50/85 text-cyan-700"
                                : "border-emerald-200/70 bg-emerald-50/85 text-emerald-700"
                            : "border-slate-200/70 bg-slate-100/85 text-slate-600"
                          : activeCompiledAfpGapFilter
                          ? matchesCompiledAfpGapFilter
                            ? "border-violet-200/70 bg-violet-50/85 text-violet-700"
                            : "border-slate-200/70 bg-slate-100/85 text-slate-600"
                          : !activeCompiledAfpFilter
                          ? activeCompiledManifestLinkageFilter === "linked"
                            ? matchesCompiledManifestLinkageFilter
                              ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-700"
                              : "border-slate-200/70 bg-slate-100/85 text-slate-600"
                            : activeCompiledManifestLinkageFilter === "inspector_only"
                              ? "border-amber-200/70 bg-amber-50/85 text-amber-700"
                              : ""
                          : matchesCompiledAfpFilter
                            ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-700"
                            : "border-slate-200/70 bg-slate-100/85 text-slate-600";
                        const policyDeltaFilterMode =
                          runNodePolicyDelta?.source === "replay_policy_delta" ? "replay_drift" as const : "deployment_context" as const;
                        const statusClass =
                          nodeStatus === "simulated"
                            ? "border-cyan-300/80 bg-cyan-50/85"
                            : nodeStatus === "skipped"
                              ? "border-slate-300/80 bg-slate-50/85 opacity-75"
                            : nodeStatus === "failed"
                              ? "border-rose-300/80 bg-rose-50/85"
                              : nodeStatus === "blocked"
                                ? "border-orange-300/80 bg-orange-50/85"
                            : nodeStatus === "waiting_for_approval"
                              ? "border-amber-300/80 bg-amber-50/85"
                              : nodeStatus === "queued"
                                ? "border-slate-300/80 bg-slate-100/90"
                            : nodeStatus === "completed"
                              ? "border-emerald-300/80 bg-emerald-50/80"
                            : nodeStatus === "active"
                                ? "border-sky-300/80 bg-sky-50/80"
                            : selectedNodeId() === node.id
                                  ? "border-primary/45 bg-primary/15"
                                  // Item 7: trigger nodes use family-specific idle colours so
                                  // entry paths are visually distinct from capability nodes.
                                  : node.kind === "trigger"
                                    ? (() => {
                                        const family = typeof node.config.trigger_family === "string"
                                          ? node.config.trigger_family
                                          : "manual";
                                        if (family === "schedule") return "border-teal-300/70 bg-teal-50/80 hover:bg-teal-50";
                                        if (family === "webhook" || family === "event") return "border-sky-300/70 bg-sky-50/80 hover:bg-sky-50";
                                        if (family === "hybrid" || family === "delayed_continuation") return "border-violet-300/70 bg-violet-50/80 hover:bg-violet-50";
                                        return "border-slate-300/70 bg-slate-50/85 hover:bg-slate-50"; // manual
                                      })()
                                    : "border-white/50 bg-white/78 hover:bg-white";
                        return <button type="button" class={`absolute w-[180px] cursor-grab rounded-[22px] border px-4 py-3 text-left shadow-soft transition active:cursor-grabbing disabled:cursor-default disabled:opacity-90 ${statusClass} ${nodeProtected ? "ring-2 ring-slate-500/40 ring-offset-2 ring-offset-transparent" : ""} ${activeCompiledAfpFilter && matchesCompiledAfpFilter ? "ring-2 ring-emerald-300/60 ring-offset-2 ring-offset-transparent" : ""} ${activeCompiledAfpFilter && !matchesCompiledAfpFilter ? "opacity-55 saturate-[0.7]" : ""} ${activeCompiledAfpReadinessFocus && matchesCompiledAfpReadinessFocus ? activeCompiledAfpReadinessFocus === "needs_contract_work" ? "ring-2 ring-amber-300/60 ring-offset-2 ring-offset-transparent" : activeCompiledAfpReadinessFocus === "ready_handoffs" ? "ring-2 ring-cyan-300/60 ring-offset-2 ring-offset-transparent" : "ring-2 ring-emerald-300/60 ring-offset-2 ring-offset-transparent" : ""} ${activeCompiledAfpReadinessFocus && !matchesCompiledAfpReadinessFocus ? "opacity-45 saturate-[0.65]" : ""} ${activeCompiledAfpGapFilter && matchesCompiledAfpGapFilter ? "ring-2 ring-violet-300/60 ring-offset-2 ring-offset-transparent" : ""} ${activeCompiledAfpGapFilter && !matchesCompiledAfpGapFilter ? "opacity-45 saturate-[0.65]" : ""} ${activeCompiledOrchestrationRole && matchesCompiledOrchestrationRole ? "ring-2 ring-cyan-300/60 ring-offset-2 ring-offset-transparent" : ""} ${activeCompiledOrchestrationRole && !matchesCompiledOrchestrationRole ? "opacity-45 saturate-[0.65]" : ""} ${activeCompiledManifestLinkageFilter === "linked" && matchesCompiledManifestLinkageFilter ? "ring-2 ring-sky-300/60 ring-offset-2 ring-offset-transparent" : ""} ${activeCompiledManifestLinkageFilter === "linked" && !matchesCompiledManifestLinkageFilter ? "opacity-45 saturate-[0.65]" : ""} ${activeCompiledManifestLinkageFilter === "inspector_only" ? "opacity-35 saturate-[0.5]" : ""} ${activeCompiledAfpFilter && activeCompiledAfpRouteFocus && !nodeParticipatesInRouteFocus ? "opacity-30 saturate-[0.55]" : ""}`} style={{ left: `${node.position.x}px`, top: `${node.position.y}px` }} onClick={() => { setSelectedNodeId(node.id); setSelectedInspectorSection(null); setSelectedInspectorFocusSource(null); setSelectedInspectorFocusTarget(null); }} onPointerDown={(event) => startDrag(event, node.id)}><div class="flex items-center justify-between gap-2"><p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">{node.kind}</p><Show when={node.kind === "trigger" && typeof node.config.trigger_family === "string" && node.config.trigger_family !== "manual"}><span class={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${node.config.trigger_family === "schedule" ? "bg-teal-100 text-teal-700" : node.config.trigger_family === "webhook" || node.config.trigger_family === "event" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>{String(node.config.trigger_family)}</span></Show><div class="flex items-center gap-2"><Show when={stepOrder}><span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">step {stepOrder}</span></Show><Show when={nodeStatus}><span class="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">{nodeStatus}</span></Show></div></div><p class="mt-1 text-sm font-semibold text-on-surface">{node.label}</p><Show when={compiledManifest}><div class="mt-2 flex flex-wrap gap-1"><span role="button" tabindex={0} class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${compiledAfpContract.chipClass}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setSelectedNodeId(node.id); setSelectedInspectorSection("compiled_runtime_contract"); setSelectedInspectorFocusSource("canvas_afp_badge"); setSelectedInspectorFocusTarget(compiledManifestNodeId ?? node.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setSelectedNodeId(node.id); setSelectedInspectorSection("compiled_runtime_contract"); setSelectedInspectorFocusSource("canvas_afp_badge"); setSelectedInspectorFocusTarget(compiledManifestNodeId ?? node.id); } }} title="Open this node's compiled runtime contract">{compiledAfpContract.category === "orchestration_scaffold" ? "AFP scaffold" : compiledAfpContract.label}</span><Show when={compiledRuntimeKind}><span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{compiledRuntimeKind}</span></Show></div></Show><Show when={afpFilterOverlayLabel}><div class="mt-2 flex flex-wrap gap-1"><span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${afpFilterOverlayClass}`}>{afpFilterOverlayLabel}</span><Show when={activeCompiledManifestLinkageFilter === "linked" && matchesCompiledManifestLinkageFilter}><span class="rounded-full border border-sky-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">{compiledLinkageStatusLabel("manifest_linked")}</span></Show><Show when={activeCompiledManifestLinkageFilter === "inspector_only"}><span class="rounded-full border border-amber-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">{compiledLinkageStatusLabel("manifest_only")}</span></Show><Show when={activeCompiledOrchestrationRole && matchesCompiledOrchestrationRole}><span class="rounded-full border border-cyan-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700">Orchestration role focus</span></Show><Show when={activeCompiledAfpReadinessFocus && matchesCompiledAfpReadinessFocus}><span class={`rounded-full border bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${activeCompiledAfpReadinessFocus === "needs_contract_work" ? "border-amber-200/70 text-amber-700" : activeCompiledAfpReadinessFocus === "ready_handoffs" ? "border-cyan-200/70 text-cyan-700" : "border-emerald-200/70 text-emerald-700"}`}>AFP readiness focus</span></Show><Show when={activeCompiledAfpGapFilter && matchesCompiledAfpGapFilter}><span class="rounded-full border border-violet-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">AFP gap focus</span></Show><Show when={activeCompiledAfpFilter && activeCompiledAfpRouteFocus && nodeParticipatesInRouteFocus}><span class="rounded-full border border-emerald-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Route review focus</span></Show></div></Show><Show when={deploymentPolicy && deploymentVisual}><div class="mt-2 flex flex-wrap gap-1"><span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${deploymentVisual?.chipClass}`}>{deploymentVisual?.label}</span><Show when={deploymentPolicy?.fields.provider_route}><span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">route {deploymentPolicy?.fields.provider_route}</span></Show><Show when={pendingChanges.length > 0}><span class="rounded-full border border-amber-200/70 bg-amber-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">{pendingChanges.length} pending</span></Show></div></Show><Show when={!deploymentPolicy && pendingPolicy}><div class="mt-2 flex flex-wrap gap-1"><span class="rounded-full border border-amber-200/70 bg-amber-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">pending deploy</span><Show when={pendingPolicy?.fields.provider_route}><span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">route {pendingPolicy?.fields.provider_route}</span></Show></div></Show><Show when={runNodePolicyDelta}><div class="mt-2 rounded-2xl border border-sky-200/70 bg-sky-50/80 px-3 py-2"><div class="flex flex-wrap gap-1"><span class="rounded-full border border-sky-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">{runNodePolicyDelta?.source === "replay_policy_delta" ? "replay delta" : "policy delta"}</span><span class="rounded-full border border-sky-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">{runNodePolicyDelta?.changes.length} field{runNodePolicyDelta?.changes.length === 1 ? "" : "s"}</span></div><Show when={runNodePolicyDeltaSummaryText}><p class="mt-1 text-[11px] font-medium text-sky-900">{runNodePolicyDeltaSummaryText}</p></Show><span role="button" tabindex={0} class="mt-2 inline-flex rounded-full border border-sky-200/70 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); focusPolicyDiffReview(node.id, policyDeltaFilterMode, selectedRun()?.run_id ?? null); focusDeploymentRecord(runNodePolicyDelta?.deploymentId ?? null); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); focusPolicyDiffReview(node.id, policyDeltaFilterMode, selectedRun()?.run_id ?? null); focusDeploymentRecord(runNodePolicyDelta?.deploymentId ?? null); } }} title="Open matching run review and deployment snapshot">review delta</span></div></Show><Show when={canvasCallout}><p class={`mt-2 line-clamp-3 rounded-2xl border px-3 py-2 text-[11px] font-medium leading-5 ${canvasCallout?.className}`}>{canvasCallout?.text}</p></Show><Show when={node.description}><p class="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{node.description}</p></Show><Show when={node.config.preset_kind}><p class="mt-1 text-xs text-sky-700">{String(node.config.preset_kind)}</p></Show><Show when={typeof node.metadata.template_slot === "string"}><p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-violet-700">{String(node.metadata.template_slot)}</p></Show><Show when={nodeProtected}><p class="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800">{nodeRegenerationScope(node) === "subgraph" ? "Protected subgraph" : "Protected node"}</p></Show><div class="mt-3 flex flex-wrap gap-1"><For each={node.hidden_runtime_nodes.slice(0, 3)}>{(runtimeKind) => <span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">{runtimeKind}</span>}</For></div></button>;
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
              const presetTemplateIds = () => {
                const raw = draft().metadata["preset_template_ids"];
                return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
              };
              const protectedNodeIds = () => protectedNodeIdsForGraph(draft());
              const protectedEdgeIds = () => protectedEdgeIdsForGraph(draft());
              return (
                <div class="space-y-4">
                  <div class="border-b border-white/30 pb-3">
                    <p class="text-sm font-semibold text-on-surface">{selectedNode() ? "Node inspector" : "Workflow inspector"}</p>
                    <p class="mt-1 text-xs uppercase tracking-[0.18em] text-on-surface-variant">parameters - prompts - roots - connections</p>
                    {(() => {
                      const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                        ? workflow.latest_ir as Record<string, unknown>
                        : null;
                      const manifests = Array.isArray(latestIr?.manifests)
                        ? (latestIr.manifests as Record<string, unknown>[])
                        : [];
                      if (!latestIr || manifests.length === 0) {
                        return null;
                      }
                      const compiledEdges = Array.isArray(latestIr?.edges)
                        ? latestIr.edges as Record<string, unknown>[]
                        : [];
                      const manifestContracts = manifests.map((manifest) => {
                        const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                        const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                          ? manifest.connector_binding as Record<string, unknown>
                          : null;
                        const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                        const memoryConfig = manifest.memory && typeof manifest.memory === "object"
                          ? manifest.memory as Record<string, unknown>
                          : null;
                        const traceConfig = manifest.trace && typeof manifest.trace === "object"
                          ? manifest.trace as Record<string, unknown>
                          : null;
                        const memoryScope = typeof memoryConfig?.scope === "string" ? memoryConfig.scope : null;
                        const traceSource = typeof traceConfig?.source === "string" ? traceConfig.source : null;
                        return {
                          nodeId: typeof manifest.node_id === "string" ? manifest.node_id : null,
                          contract: compiledManifestAfpContract(runtimeKind, capabilityId),
                          gapKinds: compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource),
                        };
                      });
                      const capabilityBoundaries = manifestContracts.filter((entry) => entry.contract.category === "capability_boundary").length;
                      const decisionBoundaries = manifestContracts.filter((entry) => entry.contract.category === "decision_boundary").length;
                      const summaryBoundaries = manifestContracts.filter((entry) => entry.contract.category === "summary_boundary").length;
                      const orchestrationScaffolds = manifestContracts.filter((entry) => entry.contract.category === "orchestration_scaffold").length;
                      const readyManifestIds = new Set(
                        manifestContracts
                          .filter((entry) => entry.contract.category !== "orchestration_scaffold" && entry.gapKinds.length === 0 && entry.nodeId)
                          .map((entry) => entry.nodeId as string),
                      );
                      const readyManifestCount = readyManifestIds.size;
                      const manifestsNeedingContractWorkCount = manifestContracts.filter((entry) =>
                        entry.contract.category === "orchestration_scaffold" || entry.gapKinds.length > 0,
                      ).length;
                      const readyHandoffCount = compiledEdges.filter((entry: Record<string, unknown>) => {
                        const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                        const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                        return Boolean(
                          fromManifestNodeId
                            && toManifestNodeId
                            && readyManifestIds.has(fromManifestNodeId)
                            && readyManifestIds.has(toManifestNodeId),
                        );
                      }).length;
                      return (
                        <div class="mt-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">AFP readiness</p>
                              <p class="mt-1 text-xs text-emerald-900">Latest compiled snapshot shows how much of this workflow is already expressed as AFP-aligned runtime boundaries.</p>
                            </div>
                            <span class="rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                              {manifests.length} manifests
                            </span>
                          </div>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${selectedCompiledAfpReadinessFocus() === "ready_manifests" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-800" : "border-emerald-200/70 bg-white/85 text-emerald-800"}`}
                              onClick={() => setSelectedCompiledAfpReadinessFocus("ready_manifests")}
                              title={afpReadinessFocusTitle("ready_manifests")}
                              aria-label={afpReadinessFocusTitle("ready_manifests")}
                            >
                              {readyManifestCount} AFP-ready manifests
                            </button>
                            <button
                              type="button"
                              class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${selectedCompiledAfpReadinessFocus() === "ready_handoffs" ? "border-cyan-300 bg-white ring-2 ring-cyan-300/70 text-cyan-800" : "border-cyan-200/70 bg-cyan-50/85 text-cyan-800"}`}
                              onClick={() => setSelectedCompiledAfpReadinessFocus("ready_handoffs")}
                              title={afpReadinessFocusTitle("ready_handoffs")}
                              aria-label={afpReadinessFocusTitle("ready_handoffs")}
                            >
                              {readyHandoffCount} AFP-ready handoffs
                            </button>
                            <button
                              type="button"
                              class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${selectedCompiledAfpReadinessFocus() === "needs_contract_work" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-800" : "border-amber-200/70 bg-amber-50/85 text-amber-800"}`}
                              onClick={() => setSelectedCompiledAfpReadinessFocus("needs_contract_work")}
                              title={afpReadinessFocusTitle("needs_contract_work")}
                              aria-label={afpReadinessFocusTitle("needs_contract_work")}
                            >
                              {manifestsNeedingContractWorkCount} still need AFP contract work
                            </button>
                          </div>
                          <p class="mt-2 text-xs text-emerald-800">
                            AFP-ready manifests already compile as concrete capability, decision, or summary boundaries without the currently tracked gap signals. Handoffs count compiled routes that connect two AFP-ready units.
                          </p>
                          <Show when={selectedCompiledAfpReadinessFocus()}>
                            {(focus) => (
                              <div class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200/70 bg-white/80 px-3 py-2">
                                <p class="text-xs text-emerald-800">{afpReadinessFocusSummary(focus())}</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                  onClick={() => setSelectedCompiledAfpReadinessFocus(null)}
                                  title={clearAfpReadinessFocusMessage()}
                                  aria-label={clearAfpReadinessFocusMessage()}
                                >
                                  Clear AFP readiness focus
                                </button>
                              </div>
                            )}
                          </Show>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <Show when={capabilityBoundaries > 0}>
                              <button
                                type="button"
                                class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${selectedCompiledAfpFilter() === "capability_boundary" ? "border-sky-300 bg-white ring-2 ring-sky-300/70 text-sky-700" : "border-sky-200/70 bg-sky-50/85 text-sky-700"}`}
                                onClick={() => setSelectedCompiledAfpFilter("capability_boundary")}
                                title="Show compiled manifests that currently look like AFP capability boundaries"
                                aria-label="Show compiled manifests that currently look like AFP capability boundaries"
                              >
                                {capabilityBoundaries} capability boundaries
                              </button>
                            </Show>
                            <Show when={decisionBoundaries > 0}>
                              <button
                                type="button"
                                class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${selectedCompiledAfpFilter() === "decision_boundary" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}
                                onClick={() => setSelectedCompiledAfpFilter("decision_boundary")}
                                title="Show compiled manifests that currently look like AFP decision boundaries"
                                aria-label="Show compiled manifests that currently look like AFP decision boundaries"
                              >
                                {decisionBoundaries} decision boundaries
                              </button>
                            </Show>
                            <Show when={summaryBoundaries > 0}>
                              <button
                                type="button"
                                class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${selectedCompiledAfpFilter() === "summary_boundary" ? "border-violet-300 bg-white ring-2 ring-violet-300/70 text-violet-700" : "border-violet-200/70 bg-violet-50/85 text-violet-700"}`}
                                onClick={() => setSelectedCompiledAfpFilter("summary_boundary")}
                                title="Show compiled manifests that currently look like AFP summary boundaries"
                                aria-label="Show compiled manifests that currently look like AFP summary boundaries"
                              >
                                {summaryBoundaries} summary boundaries
                              </button>
                            </Show>
                            <Show when={orchestrationScaffolds > 0}>
                              <button
                                type="button"
                                class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${selectedCompiledAfpFilter() === "orchestration_scaffold" ? "border-slate-300 bg-white ring-2 ring-slate-300/70 text-slate-700" : "border-slate-200/70 bg-slate-100/85 text-slate-700"}`}
                                onClick={() => setSelectedCompiledAfpFilter("orchestration_scaffold")}
                                title="Show compiled manifests that still act like orchestration scaffolds"
                                aria-label="Show compiled manifests that still act like orchestration scaffolds"
                              >
                                {orchestrationScaffolds} orchestration scaffolds
                              </button>
                            </Show>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div class="space-y-3">
                    <Show when={draft().template_id || presetTemplateIds().length > 0}>
                      <div class="rounded-[22px] border border-violet-200/70 bg-violet-50/70 p-4">
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Template layer</p>
                        <p class="mt-1 text-sm text-violet-900">
                          Primary template {draft().template_id ?? "mixed"}
                        </p>
                        <Show when={draft().template_version}>
                          {(templateVersion) => <p class="mt-1 text-xs uppercase tracking-[0.14em] text-violet-700">{templateVersion()}</p>}
                        </Show>
                        <Show when={presetTemplateIds().length > 0}>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <For each={presetTemplateIds()}>
                              {(templateId) => <span class="rounded-full bg-white/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">{templateId}</span>}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </Show>
                    <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Title</span><input value={draft().title} onInput={(event) => updateGraph((current) => ({ ...current, title: event.currentTarget.value }))} onBlur={(event) => patchWorkflowMeta({ title: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                    <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Description</span><textarea value={draft().description ?? ""} onInput={(event) => updateGraph((current) => ({ ...current, description: event.currentTarget.value }))} onBlur={(event) => patchWorkflowMeta({ description: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[88px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                    <div class="grid grid-cols-2 gap-3">
                      <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Environment</span><select value={draft().environment} onChange={(event) => { updateGraph((current) => ({ ...current, environment: event.currentTarget.value })); patchWorkflowMeta({ environment: event.currentTarget.value }); }} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"><option value="dev">dev</option><option value="prod">prod</option></select></label>
                      <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Optimization</span><select value={draft().optimization_mode} onChange={(event) => { updateGraph((current) => ({ ...current, optimization_mode: event.currentTarget.value })); patchWorkflowMeta({ optimization_mode: event.currentTarget.value }); }} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"><option value="balanced">balanced</option><option value="speed">speed</option><option value="cost">cost</option></select></label>
                    </div>
                    <div class="rounded-[20px] border border-slate-200/70 bg-slate-50/70 p-4">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Protected regions</p>
                      <p class="mt-1 text-sm text-slate-900">{protectedNodeIds().size} protected nodes and {protectedEdgeIds().size} protected edges are currently shielded from regeneration.</p>
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
                    <label class="mt-3 block">
                      <span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Route label</span>
                      <input value={edgeConditionLabel()} onInput={(event) => setEdgeConditionLabel(event.currentTarget.value)} disabled={workflowInteractionLocked()} placeholder="success, fallback, approved..." class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" />
                    </label>
                    <button type="button" class="mt-3 rounded-full border border-white/40 bg-white/65 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60" onClick={addEdge} disabled={workflowInteractionLocked()}>Add edge</button>
                    <div class="mt-3 space-y-2">
                      <For each={draft().edges}>
                        {(edge) => (
                          <div class="rounded-2xl border border-white/35 bg-white/55 p-3 text-sm text-on-surface">
                            <div class="flex items-center justify-between gap-3">
                              <span>{edge.source} {"->"} {edge.target}</span>
                              <button type="button" class="rounded-full border border-rose-200/70 bg-rose-50/80 px-3 py-1 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => { updateGraph((current) => ({ ...current, edges: current.edges.filter((entry) => entry.id !== edge.id) })); void handleWorkflowPatch({ op: "edge_remove", edge_id: edge.id }); }} disabled={workflowInteractionLocked()}>Remove</button>
                            </div>
                            <label class="mt-3 block">
                              <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Route label</span>
                              <input
                                value={edge.condition_label ?? ""}
                                onInput={(event) => {
                                  const nextValue = event.currentTarget.value;
                                  updateGraph((current) => ({
                                    ...current,
                                    edges: current.edges.map((entry) =>
                                      entry.id === edge.id
                                        ? { ...entry, condition_label: nextValue || undefined }
                                        : entry,
                                    ),
                                  }));
                                }}
                                onBlur={(event) => patchEdgeConditionLabel(edge.id, event.currentTarget.value)}
                                disabled={workflowInteractionLocked()}
                                placeholder="optional branch label"
                                class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  <Show when={selectedNode()}>
                    {(node) => (
                      <div class="space-y-4 rounded-[22px] border border-primary/20 bg-primary/5 p-4">
                        <div class="flex items-center justify-between gap-3"><div><p class="text-sm font-semibold text-on-surface">{node().label}</p><p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">{node().kind}</p></div><button type="button" class="rounded-full border border-rose-200/70 bg-rose-50/80 px-3 py-1 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={removeSelectedNode} disabled={workflowInteractionLocked()}>Delete node</button></div>
                        <Show when={typeof node().metadata.template_id === "string" || typeof node().metadata.template_slot === "string"}>
                          <div class="rounded-2xl border border-violet-200/70 bg-violet-50/80 px-4 py-3">
                            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Template binding</p>
                            <p class="mt-1 text-sm text-violet-900">{typeof node().metadata.template_id === "string" ? String(node().metadata.template_id) : "template-backed node"}</p>
                            <Show when={typeof node().metadata.template_slot === "string"}>
                              <p class="mt-1 text-xs uppercase tracking-[0.14em] text-violet-700">{String(node().metadata.template_slot)}</p>
                            </Show>
                          </div>
                        </Show>
                        {(() => {
                          const latestIr = workflow.latest_ir && typeof workflow.latest_ir === "object"
                            ? workflow.latest_ir as Record<string, unknown>
                            : null;
                          const manifests = Array.isArray(latestIr?.manifests) ? latestIr?.manifests as Record<string, unknown>[] : [];
                          const manifest = manifests.find((entry) => entry.source_graph_node_id === node().id) ?? null;
                          if (!latestIr) {
                            return (
                              <div class="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Compiled runtime contract</p>
                                <p class="mt-1 text-sm text-emerald-900">Compile this workflow to inspect the runtime manifest, model assignment, and capability binding for this node.</p>
                              </div>
                            );
                          }
                          if (!manifest) {
                            return (
                              <div class="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Compiled runtime contract</p>
                                <p class="mt-1 text-sm text-amber-900">This node is not present in the latest compiled runtime snapshot yet. Recompile to refresh its manifest contract.</p>
                              </div>
                            );
                          }
                          const connectorBinding = manifest.connector_binding && typeof manifest.connector_binding === "object"
                            ? manifest.connector_binding as Record<string, unknown>
                            : null;
                          const modelAssignment = manifest.model_assignment && typeof manifest.model_assignment === "object"
                            ? manifest.model_assignment as Record<string, unknown>
                            : null;
                          const retryPolicy = manifest.retry_policy && typeof manifest.retry_policy === "object"
                            ? manifest.retry_policy as Record<string, unknown>
                            : null;
                          const manifestMetadata = manifest.metadata && typeof manifest.metadata === "object"
                            ? manifest.metadata as Record<string, unknown>
                            : null;
                          const manifestNodeId = typeof manifest.node_id === "string" ? manifest.node_id : null;
                          const runtimeKind = typeof manifest.runtime_kind === "string" ? manifest.runtime_kind : null;
                          const manifestVersion = typeof manifest.manifest_version === "string" ? manifest.manifest_version : null;
                          const memoryScope = typeof manifest.memory_scope === "string" ? manifest.memory_scope : null;
                          const capabilityId = typeof connectorBinding?.capability_id === "string" ? connectorBinding.capability_id : null;
                          const operation = typeof connectorBinding?.operation === "string" ? connectorBinding.operation : null;
                          const integrationFamily = typeof connectorBinding?.integration_family === "string" ? connectorBinding.integration_family : null;
                          const service = typeof connectorBinding?.service === "string" ? connectorBinding.service : null;
                          const traceSource = typeof connectorBinding?.trace_source === "string" ? connectorBinding.trace_source : null;
                          const traceDetailMode = typeof connectorBinding?.trace_detail_mode === "string" ? connectorBinding.trace_detail_mode : null;
                          const modelStrategy = typeof modelAssignment?.strategy === "string" ? modelAssignment.strategy : null;
                          const modelName = typeof modelAssignment?.model === "string" ? modelAssignment.model : null;
                          const retryAttempts = typeof retryPolicy?.max_attempts === "number" ? retryPolicy.max_attempts : null;
                          const timeoutBehavior = typeof retryPolicy?.on_timeout === "string" ? retryPolicy.on_timeout : null;
                          const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
                          const orchestrationRole = compiledManifestOrchestrationRole(runtimeKind, capabilityId);
                          const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
                          const manifestIsAfpReady = afpContract.category !== "orchestration_scaffold" && afpGapKinds.length === 0;
                          const compiledKind = typeof manifestMetadata?.compiled_from_kind === "string"
                            ? manifestMetadata.compiled_from_kind
                            : node().kind;
                          return (
                            <div class={`rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 ${selectedInspectorSection() === "compiled_runtime_contract" ? "ring-2 ring-emerald-300/70" : ""}`}>
                              <Show when={selectedInspectorSection() === "compiled_runtime_contract"}>
                                <div class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-white/80 px-3 py-2">
                                  <div>
                                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Contract focus active</p>
                                    <p class="text-xs text-emerald-900">
                                      {selectedInspectorFocusSource() === "canvas_afp_badge"
                                        ? "This runtime contract was opened from the canvas AFP readiness badge."
                                        : selectedInspectorFocusSource() === "compiled_manifest"
                                          ? "This runtime contract was opened from the compiled manifest roster."
                                          : selectedInspectorFocusSource() === "compiled_route"
                                            ? "This runtime contract was opened from the compiled route topology."
                                            : "This runtime contract was opened from a compiled-runtime deep link."}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                    onClick={() => { setSelectedInspectorSection(null); setSelectedInspectorFocusSource(null); setSelectedInspectorFocusTarget(null); }}
                                    title="Return this inspector to ordinary node editing while keeping the current node selected"
                                    aria-label="Return this inspector to ordinary node editing while keeping the current node selected"
                                  >
                                    Return to node editing
                                  </button>
                                </div>
                              </Show>
                              <div class="flex flex-wrap items-center gap-2">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Compiled runtime contract</p>
                                <Show when={manifestVersion}>
                                  <span class="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">{manifestVersion}</span>
                                </Show>
                                <Show when={manifestNodeId}>
                                  <span class="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">{manifestNodeId}</span>
                                </Show>
                                <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${afpContract.chipClass}`}>{afpContract.label}</span>
                                <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${orchestrationRole.chipClass}`}>{orchestrationRole.label}</span>
                              </div>
                              <p class="mt-1 text-sm text-emerald-900">
                                This node currently compiles as a {runtimeKind ?? compiledKind} runtime unit with an AFP-aligned manifest contract.
                              </p>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <Show when={runtimeKind}>
                                  <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                    runtime {runtimeKind}
                                  </span>
                                </Show>
                                <Show when={memoryScope}>
                                  <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                    memory {memoryScope?.replaceAll("_", " ")}
                                  </span>
                                </Show>
                                <Show when={modelStrategy}>
                                  <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                    strategy {modelStrategy}
                                  </span>
                                </Show>
                                <Show when={modelName}>
                                  <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                    model {modelName}
                                  </span>
                                </Show>
                                <Show when={retryAttempts !== null}>
                                  <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                    retries {retryAttempts}
                                  </span>
                                </Show>
                                <Show when={timeoutBehavior}>
                                  <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                    timeout {timeoutBehavior?.replaceAll("_", " ")}
                                  </span>
                                </Show>
                                <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                  AFP {afpContract.primarySubtype}
                                </span>
                                <Show when={afpContract.secondarySubtype}>
                                  <span class="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                    AFP {afpContract.secondarySubtype}
                                  </span>
                                </Show>
                              </div>
                              <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">AFP boundary</p>
                                <p class="mt-1 text-sm text-emerald-900">
                                  {afpContract.category === "capability_boundary"
                                    ? "This manifest is close to a concrete AFP node boundary and should map cleanly onto capability-scoped request and result messages."
                                    : afpContract.category === "decision_boundary"
                                      ? "This manifest is acting like an AFP decision boundary, where approval, clarification, or policy outcomes should travel through explicit request and result style messages."
                                      : afpContract.category === "summary_boundary"
                                        ? "This manifest looks like an AFP summary boundary, where the runtime can emit workflow-level completion or packaged result messages."
                                        : "This manifest is still a derived orchestration scaffold. It participates in the workflow contract, but its AFP role is more about coordination than a concrete capability boundary."}
                                </p>
                              </div>
                              <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">AFP contract readiness</p>
                                <div class="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition hover:bg-white ${manifestIsAfpReady ? "border-emerald-200/70 bg-emerald-50/80 text-emerald-800" : "border-amber-200/70 bg-amber-50/85 text-amber-800"}`}
                                    onClick={() => setSelectedCompiledAfpReadinessFocus(manifestIsAfpReady ? "ready_manifests" : "needs_contract_work")}
                                    title={afpReadinessFocusTitle(manifestIsAfpReady ? "ready_manifests" : "needs_contract_work")}
                                    aria-label={afpReadinessFocusTitle(manifestIsAfpReady ? "ready_manifests" : "needs_contract_work")}
                                  >
                                    {manifestIsAfpReady ? "AFP-ready unit" : "Contract-work-heavy unit"}
                                  </button>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRole.chipClass}`}
                                    onClick={() => {
                                      setSelectedCompiledOrchestrationRole(orchestrationRole.role);
                                      setSelectedCompiledAfpReadinessFocus(manifestIsAfpReady ? "ready_manifests" : "needs_contract_work");
                                    }}
                                    title={manifestIsAfpReady
                                      ? `Focus review on AFP-ready ${orchestrationRole.label}.`
                                      : `Focus review on ${orchestrationRole.label} that still needs AFP contract work.`}
                                    aria-label={manifestIsAfpReady
                                      ? `Focus review on AFP-ready ${orchestrationRole.label}.`
                                      : `Focus review on ${orchestrationRole.label} that still needs AFP contract work.`}
                                  >
                                    {manifestIsAfpReady ? `${orchestrationRole.label} ready` : `${orchestrationRole.label} needs contract work`}
                                  </button>
                                </div>
                                <Show
                                  when={afpGapKinds.length > 0}
                                  fallback={<p class="mt-1 text-sm text-emerald-900">This compiled manifest already exposes the key AFP readiness signals currently tracked in the workflow builder.</p>}
                                >
                                  <p class="mt-1 text-sm text-emerald-900">This compiled manifest still has AFP contract gaps that keep it from reading as a fully bounded capability-facing runtime unit.</p>
                                  <div class="mt-2 flex flex-wrap gap-2">
                                    <For each={afpGapKinds}>
                                      {(gap) => (
                                        <span class="rounded-full border border-violet-200/70 bg-violet-50/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700">
                                          {compiledAfpGapLabel(gap)}
                                        </span>
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              </div>
                              <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Orchestration role</p>
                                <p class="mt-1 text-sm text-emerald-900">{orchestrationRole.description}</p>
                              </div>
                              <Show when={capabilityId || operation || integrationFamily || service || traceSource || traceDetailMode}>
                                <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Capability binding</p>
                                  <div class="mt-2 flex flex-wrap gap-2">
                                    <Show when={capabilityId}>
                                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                        capability {capabilityId}
                                      </span>
                                    </Show>
                                    <Show when={operation}>
                                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                        op {operation}
                                      </span>
                                    </Show>
                                    <Show when={integrationFamily}>
                                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                        family {integrationFamily?.replaceAll("_", " ")}
                                      </span>
                                    </Show>
                                    <Show when={service}>
                                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                        service {service}
                                      </span>
                                    </Show>
                                    <Show when={traceSource}>
                                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                        trace {traceSource?.replaceAll("_", " ")}
                                      </span>
                                    </Show>
                                    <Show when={traceDetailMode}>
                                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                        detail {traceDetailMode}
                                      </span>
                                    </Show>
                                  </div>
                                </div>
                              </Show>
                            </div>
                          );
                        })()}
                        <div class="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Regeneration protection</p>
                          <label class="mt-3 flex items-center gap-3 text-sm text-on-surface">
                            <input
                              type="checkbox"
                              checked={nodeRegenerationLocked(node())}
                              onChange={(event) =>
                                patchSelectedNodeConfig({
                                  ...node().config,
                                  regeneration_lock: event.currentTarget.checked,
                                })}
                              disabled={workflowInteractionLocked()}
                            />
                            <span>Protect this node from describe-flow regeneration</span>
                          </label>
                          <label class="mt-3 flex items-center gap-3 text-sm text-on-surface">
                            <input
                              type="checkbox"
                              checked={nodeRegenerationScope(node()) === "subgraph"}
                              onChange={(event) =>
                                patchSelectedNodeConfig({
                                  ...node().config,
                                  regeneration_lock_scope: event.currentTarget.checked ? "subgraph" : "node",
                                })}
                              disabled={workflowInteractionLocked() || !nodeRegenerationLocked(node())}
                            />
                            <span>Protect downstream branch from this node too</span>
                          </label>
                          <p class="mt-2 text-xs text-on-surface-variant">Protected nodes are preserved even when the generated core is rebuilt from the description.</p>
                        </div>
                        {(() => {
                          const deploymentPolicy = nodeDeploymentPolicies().get(node().id);
                          const deploymentVisual = deploymentPolicy ? deploymentPolicyVisual(deploymentPolicy.source) : null;
                          const pendingPolicy = pendingNodeDeploymentPolicies().get(node().id);
                          const pendingVisual = pendingPolicy ? deploymentPolicyVisual(pendingPolicy.source) : null;
                          const pendingChanges = deploymentPolicyChanges(deploymentPolicy?.fields, pendingPolicy?.fields);
                          if (node().kind !== "tool" && !deploymentPolicy) return null;
                          if (!deploymentPolicy || !deploymentVisual) {
                            return (
                              <div class="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Deployment policy</p>
                                <p class="mt-1 text-sm text-slate-900">This tool has no active deployment snapshot yet for the current environment.</p>
                                <p class="mt-2 text-xs text-on-surface-variant">Deploy the workflow to compare inherited defaults against family or node-level overrides here.</p>
                              </div>
                            );
                          }
                          return (
                            <div class={`rounded-2xl border px-4 py-3 ${deploymentVisual.panelClass}`}>
                              <div class="flex flex-wrap items-center gap-2">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em]">Deployment policy</p>
                                <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${deploymentVisual.chipClass}`}>{deploymentVisual.label}</span>
                              </div>
                              <p class="mt-1 text-sm">
                                {deploymentPolicy.service ?? deploymentPolicy.provider ?? "connector"} in {deploymentPolicy.environment} is running with {deploymentVisual.label.toLowerCase()}.
                              </p>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <Show when={deploymentPolicy.family}>
                                  <span class="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]">
                                    family {deploymentPolicy.family?.replaceAll("_", " ")}
                                  </span>
                                </Show>
                                <Show when={deploymentPolicy.fields.delivery_tier}>
                                  <span class="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]">
                                    tier {deploymentPolicy.fields.delivery_tier}
                                  </span>
                                </Show>
                                <Show when={deploymentPolicy.fields.auth_mode}>
                                  <span class="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]">
                                    auth {deploymentPolicy.fields.auth_mode?.replaceAll("_", " ")}
                                  </span>
                                </Show>
                                <Show when={deploymentPolicy.fields.side_effects}>
                                  <span class="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]">
                                    effects {deploymentPolicy.fields.side_effects?.replaceAll("_", " ")}
                                  </span>
                                </Show>
                                <Show when={deploymentPolicy.fields.provider_route}>
                                  <span class="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em]">
                                    route {deploymentPolicy.fields.provider_route}
                                  </span>
                                </Show>
                              </div>
                              <p class="mt-2 text-xs text-on-surface-variant">Deployment {deploymentPolicy.deploymentId}</p>
                            </div>
                          );
                        })()}
                        {(() => {
                          const deploymentPolicy = nodeDeploymentPolicies().get(node().id);
                          const pendingPolicy = pendingNodeDeploymentPolicies().get(node().id);
                          const pendingVisual = pendingPolicy ? deploymentPolicyVisual(pendingPolicy.source) : null;
                          const pendingChanges = deploymentPolicyChanges(deploymentPolicy?.fields, pendingPolicy?.fields);
                          if (node().kind !== "tool" || !pendingPolicy) return null;
                          if (pendingChanges.length === 0) {
                            return (
                              <div class="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Next deployment impact</p>
                                <p class="mt-1 text-sm text-emerald-900">The current draft would keep this tool on the same effective deployment policy.</p>
                              </div>
                            );
                          }
                          return (
                            <div class="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3">
                              <div class="flex flex-wrap items-center gap-2">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Next deployment impact</p>
                                <Show when={pendingVisual}>
                                  <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${pendingVisual?.chipClass}`}>{pendingVisual?.label}</span>
                                </Show>
                              </div>
                              <p class="mt-1 text-sm text-amber-900">Deploying now would update this node’s effective connector policy.</p>
                              <div class="mt-3 space-y-2">
                                <For each={pendingChanges}>
                                  {(change) => (
                                    <div class="rounded-2xl border border-amber-200/70 bg-white/75 px-3 py-2 text-sm text-amber-900">
                                      <span class="font-semibold uppercase tracking-[0.12em] text-[11px] text-amber-700">{change.field.replaceAll("_", " ")}</span>
                                      <p class="mt-1">{change.current ?? "unset"} {"->"} {change.next ?? "unset"}</p>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </div>
                          );
                        })()}
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Node label</span><input value={node().label} onInput={(event) => updateSelectedNode((current) => ({ ...current, label: event.currentTarget.value }))} onBlur={(event) => patchSelectedNodeMeta({ label: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Description</span><textarea value={node().description ?? ""} onInput={(event) => updateSelectedNode((current) => ({ ...current, description: event.currentTarget.value }))} onBlur={(event) => patchSelectedNodeMeta({ description: event.currentTarget.value })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[80px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">System prompt</span><textarea value={node().prompt?.system_prompt ?? ""} onInput={(event) => updateSelectedNode((current) => ({ ...current, prompt: { ...current.prompt, system_prompt: event.currentTarget.value, user_editable: current.prompt?.user_editable ?? true } }))} onBlur={(event) => patchSelectedNodePrompt({ ...node().prompt, system_prompt: event.currentTarget.value, user_editable: node().prompt?.user_editable ?? true })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[92px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <label class="block"><span class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Instruction prompt</span><textarea value={node().prompt?.instruction_prompt ?? ""} onInput={(event) => updateSelectedNode((current) => ({ ...current, prompt: { ...current.prompt, instruction_prompt: event.currentTarget.value, user_editable: current.prompt?.user_editable ?? true } }))} onBlur={(event) => patchSelectedNodePrompt({ ...node().prompt, instruction_prompt: event.currentTarget.value, user_editable: node().prompt?.user_editable ?? true })} disabled={workflowInteractionLocked()} class="mt-2 min-h-[88px] w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60" /></label>
                        <Show when={node().kind === "condition"}>
                          <div class="rounded-[20px] border border-sky-200/70 bg-sky-50/70 p-4">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Condition routing</p>
                            <p class="mt-1 text-sm text-sky-900">Choose which downstream branch this condition should activate during deterministic runs.</p>
                            <Show when={(BRANCH_PRESETS[node().kind] ?? []).length > 0}>
                              <div class="mt-3 space-y-2">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Branch presets</span>
                                <div class="flex flex-wrap gap-2">
                                  <For each={BRANCH_PRESETS[node().kind] ?? []}>
                                    {(labels) => (
                                      <button
                                        type="button"
                                        class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => void applyBranchPreset(labels)}
                                        disabled={workflowInteractionLocked() || selectedNodeOutgoingEdges().length === 0}
                                      >
                                        {labels.join(" / ")}
                                      </button>
                                    )}
                                  </For>
                                </div>
                              </div>
                            </Show>
                            <Show when={(BRANCH_PRESETS[node().kind] ?? []).length > 0}>
                              <div class="mt-3 space-y-2">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Create scaffold</span>
                                <div class="flex flex-wrap gap-2">
                                  <For each={BRANCH_PRESETS[node().kind] ?? []}>
                                    {(labels) => (
                                      <button
                                        type="button"
                                        class="rounded-full border border-sky-300/70 bg-sky-500 px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => void applyBranchScaffold(labels)}
                                        disabled={workflowInteractionLocked() || selectedNodeOutgoingEdges().length > 0}
                                      >
                                        {labels.join(" / ")}
                                      </button>
                                    )}
                                  </For>
                                </div>
                                <p class="text-xs text-sky-800">Creates downstream branch nodes and labeled edges when this node has no outgoing paths yet.</p>
                              </div>
                            </Show>
                            <Show when={selectedNodeOutgoingEdges().some((entry) => Boolean(entry.edge.condition_label))}>
                              <label class="mt-3 block">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Route by edge label</span>
                                <select
                                  value={typeof node().config.route_to_condition_label === "string" ? String(node().config.route_to_condition_label) : ""}
                                  onChange={(event) => {
                                    const selected = event.currentTarget.value;
                                    const nextConfig = {
                                      ...node().config,
                                      route_to_condition_label: selected || null,
                                      route_to_node_id: selected ? null : node().config.route_to_node_id ?? null,
                                    };
                                    patchSelectedNodeConfig(nextConfig);
                                  }}
                                  disabled={workflowInteractionLocked()}
                                  class="mt-2 w-full rounded-2xl border border-sky-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <option value="">No label preference</option>
                                  <For each={selectedNodeOutgoingEdges().filter((entry) => Boolean(entry.edge.condition_label))}>
                                    {(entry) => <option value={entry.edge.condition_label}>{entry.edge.condition_label} {"->"} {entry.targetNode.label}</option>}
                                  </For>
                                </select>
                              </label>
                            </Show>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Route to node fallback</span>
                              <select
                                value={typeof node().config.route_to_node_id === "string" ? String(node().config.route_to_node_id) : ""}
                                onChange={(event) => {
                                  const selected = event.currentTarget.value;
                                  const nextConfig = {
                                    ...node().config,
                                    route_to_node_id: selected || null,
                                    route_to_condition_label: selected ? null : node().config.route_to_condition_label ?? null,
                                  };
                                  patchSelectedNodeConfig(nextConfig);
                                }}
                                disabled={workflowInteractionLocked()}
                                class="mt-2 w-full rounded-2xl border border-sky-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="">All connected branches</option>
                                <For each={selectedNodeOutgoingTargets()}>{(targetNode) => <option value={targetNode.id}>{targetNode.label}</option>}</For>
                              </select>
                            </label>
                          </div>
                        </Show>
                        <Show when={node().kind === "policy"}>
                          <div class="rounded-[20px] border border-orange-200/70 bg-orange-50/70 p-4">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Policy behavior</p>
                            <p class="mt-1 text-sm text-orange-900">Control whether this node blocks execution or only filters which downstream paths remain eligible.</p>
                            <Show when={(BRANCH_PRESETS[node().kind] ?? []).length > 0}>
                              <div class="mt-3 space-y-2">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Branch presets</span>
                                <div class="flex flex-wrap gap-2">
                                  <For each={BRANCH_PRESETS[node().kind] ?? []}>
                                    {(labels) => (
                                      <button
                                        type="button"
                                        class="rounded-full border border-orange-200/70 bg-white/85 px-3 py-2 text-xs font-medium text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => void applyBranchPreset(labels)}
                                        disabled={workflowInteractionLocked() || selectedNodeOutgoingEdges().length === 0}
                                      >
                                        {labels.join(" / ")}
                                      </button>
                                    )}
                                  </For>
                                </div>
                              </div>
                            </Show>
                            <Show when={(BRANCH_PRESETS[node().kind] ?? []).length > 0}>
                              <div class="mt-3 space-y-2">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Create scaffold</span>
                                <div class="flex flex-wrap gap-2">
                                  <For each={BRANCH_PRESETS[node().kind] ?? []}>
                                    {(labels) => (
                                      <button
                                        type="button"
                                        class="rounded-full border border-orange-300/70 bg-orange-500 px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => void applyBranchScaffold(labels)}
                                        disabled={workflowInteractionLocked() || selectedNodeOutgoingEdges().length > 0}
                                      >
                                        {labels.join(" / ")}
                                      </button>
                                    )}
                                  </For>
                                </div>
                                <p class="text-xs text-orange-800">Creates downstream branch nodes and labeled edges when this node has no outgoing paths yet.</p>
                              </div>
                            </Show>
                            <label class="mt-3 flex items-center gap-3 rounded-2xl border border-orange-200/70 bg-white/75 px-4 py-3 text-sm text-on-surface">
                              <input
                                type="checkbox"
                                checked={Boolean(node().config.block_on_run)}
                                onChange={(event) => {
                                  patchSelectedNodeConfig({
                                    ...node().config,
                                    block_on_run: event.currentTarget.checked,
                                  });
                                }}
                                disabled={workflowInteractionLocked()}
                              />
                              <span>Block execution when this policy runs</span>
                            </label>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Block reason</span>
                              <input
                                value={typeof node().config.block_reason === "string" ? String(node().config.block_reason) : ""}
                                onInput={(event) => replaceSelectedNodeConfig({ ...node().config, block_reason: event.currentTarget.value })}
                                onBlur={(event) => patchSelectedNodeConfig({ ...node().config, block_reason: event.currentTarget.value })}
                                disabled={workflowInteractionLocked()}
                                class="mt-2 w-full rounded-2xl border border-orange-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                            <Show when={selectedNodeOutgoingEdges().some((entry) => Boolean(entry.edge.condition_label))}>
                              <label class="mt-3 block">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Allow branch label</span>
                                <select
                                  value={typeof node().config.allow_target_condition_label === "string" ? String(node().config.allow_target_condition_label) : ""}
                                  onChange={(event) => {
                                    const selected = event.currentTarget.value;
                                    patchSelectedNodeConfig({
                                      ...node().config,
                                      allow_target_condition_label: selected || null,
                                      allow_target_node_ids: selected ? [] : node().config.allow_target_node_ids ?? [],
                                    });
                                  }}
                                  disabled={workflowInteractionLocked()}
                                  class="mt-2 w-full rounded-2xl border border-orange-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <option value="">No label filter</option>
                                  <For each={selectedNodeOutgoingEdges().filter((entry) => Boolean(entry.edge.condition_label))}>
                                    {(entry) => <option value={entry.edge.condition_label}>{entry.edge.condition_label} {"->"} {entry.targetNode.label}</option>}
                                  </For>
                                </select>
                              </label>
                            </Show>
                            <div class="mt-3 space-y-2">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Allowed downstream nodes fallback</span>
                              <Show
                                when={selectedNodeOutgoingTargets().length > 0}
                                fallback={<p class="rounded-2xl border border-orange-200/70 bg-white/75 px-4 py-3 text-sm text-on-surface-variant">Connect this policy node to downstream nodes first to control allowed paths here.</p>}
                              >
                                <div class="space-y-2">
                                  <For each={selectedNodeOutgoingTargets()}>
                                    {(targetNode) => {
                                      const allowTargetNodeIds = node().config["allow_target_node_ids"];
                                      const selectedTargets = Array.isArray(allowTargetNodeIds)
                                        ? allowTargetNodeIds.filter((value: unknown): value is string => typeof value === "string")
                                        : [];
                                      return (
                                        <label class="flex items-center gap-3 rounded-2xl border border-orange-200/70 bg-white/75 px-4 py-3 text-sm text-on-surface">
                                          <input
                                            type="checkbox"
                                            checked={selectedTargets.includes(targetNode.id)}
                                            onChange={(event) => {
                                              const nextSelected = event.currentTarget.checked
                                                ? [...new Set([...selectedTargets, targetNode.id])]
                                                : selectedTargets.filter((value) => value !== targetNode.id);
                                              patchSelectedNodeConfig({
                                                ...node().config,
                                                allow_target_node_ids: nextSelected,
                                                allow_target_condition_label: nextSelected.length > 0 ? null : node().config.allow_target_condition_label ?? null,
                                              });
                                            }}
                                            disabled={workflowInteractionLocked()}
                                          />
                                          <span>{targetNode.label}</span>
                                        </label>
                                      );
                                    }}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </div>
                        </Show>
                        <Show when={node().kind === "approval"}>
                          <div class="rounded-[20px] border border-amber-200/70 bg-amber-50/70 p-4">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Approval contract</p>
                            <p class="mt-1 text-sm text-amber-900">Set the decision context that the run surface will expose when this workflow pauses for review.</p>
                            <Show when={(BRANCH_PRESETS[node().kind] ?? []).length > 0}>
                              <div class="mt-3 space-y-2">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Branch presets</span>
                                <div class="flex flex-wrap gap-2">
                                  <For each={BRANCH_PRESETS[node().kind] ?? []}>
                                    {(labels) => (
                                      <button
                                        type="button"
                                        class="rounded-full border border-amber-200/70 bg-white/85 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => void applyBranchPreset(labels)}
                                        disabled={workflowInteractionLocked() || selectedNodeOutgoingEdges().length === 0}
                                      >
                                        {labels.join(" / ")}
                                      </button>
                                    )}
                                  </For>
                                </div>
                              </div>
                            </Show>
                            <Show when={(BRANCH_PRESETS[node().kind] ?? []).length > 0}>
                              <div class="mt-3 space-y-2">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Create scaffold</span>
                                <div class="flex flex-wrap gap-2">
                                  <For each={BRANCH_PRESETS[node().kind] ?? []}>
                                    {(labels) => (
                                      <button
                                        type="button"
                                        class="rounded-full border border-amber-300/70 bg-amber-500 px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => void applyBranchScaffold(labels)}
                                        disabled={workflowInteractionLocked() || selectedNodeOutgoingEdges().length > 0}
                                      >
                                        {labels.join(" / ")}
                                      </button>
                                    )}
                                  </For>
                                </div>
                                <p class="text-xs text-amber-800">Creates downstream branch nodes and labeled edges when this node has no outgoing paths yet.</p>
                              </div>
                            </Show>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Approval reason</span>
                              <textarea
                                value={typeof node().config.approval_reason === "string" ? String(node().config.approval_reason) : ""}
                                onInput={(event) => replaceSelectedNodeConfig({ ...node().config, approval_reason: event.currentTarget.value })}
                                onBlur={(event) => patchSelectedNodeConfig({ ...node().config, approval_reason: event.currentTarget.value })}
                                disabled={workflowInteractionLocked()}
                                class="mt-2 min-h-[88px] w-full rounded-2xl border border-amber-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Decision point id</span>
                              <input
                                value={typeof node().config.decision_point_id === "string" ? String(node().config.decision_point_id) : ""}
                                onInput={(event) => replaceSelectedNodeConfig({ ...node().config, decision_point_id: event.currentTarget.value })}
                                onBlur={(event) => patchSelectedNodeConfig({ ...node().config, decision_point_id: event.currentTarget.value })}
                                disabled={workflowInteractionLocked()}
                                class="mt-2 w-full rounded-2xl border border-amber-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                          </div>
                        </Show>
                        {/* ── Tool node: connector-family selector + metadata.store toggle ── */}
                        <Show when={node().kind === "tool"}>
                          <div class="rounded-[20px] border border-violet-200/70 bg-violet-50/70 p-4">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Tool connector</p>
                            <p class="mt-1 text-sm text-violet-900">Choose how this tool node connects to external capabilities. The compiler uses connector family to route execution and control token cost.</p>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Connector family</span>
                              <select
                                value={typeof node().config.connector_family === "string" ? String(node().config.connector_family) : ""}
                                onChange={(event) => {
                                  patchSelectedNodeConfig({ ...node().config, connector_family: event.currentTarget.value || null });
                                }}
                                disabled={workflowInteractionLocked()}
                                class="mt-2 w-full rounded-2xl border border-violet-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="">Not set (falls back to internal)</option>
                                <option value="openai_function">openai_function — OpenAI function calling via direct HTTP</option>
                                <option value="mcp">mcp — MCP tool/resource discovery and execution</option>
                                <option value="a2a">a2a — A2A agent-to-agent delegation (use DelegationNode if possible)</option>
                                <option value="internal">internal — Internal OmnyID capability</option>
                              </select>
                            </label>
                            <Show when={node().config.connector_family === "mcp"}>
                              <div class="mt-3 rounded-2xl border border-violet-200/70 bg-white/75 p-3">
                                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">MCP server</p>
                                <p class="mt-1 text-xs text-violet-800">MCP tool discovery uses <code class="rounded bg-violet-100 px-1">subtype: capability_offer</code> AFP messages. The server URL and tool name are resolved at runtime from this node's capability_id.</p>
                                <label class="mt-2 block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">MCP server URL</span>
                                  <input
                                    value={typeof node().config.mcp_server_url === "string" ? String(node().config.mcp_server_url) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, mcp_server_url: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, mcp_server_url: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="https://mcp.example.com"
                                    class="mt-1 w-full rounded-2xl border border-violet-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                                <label class="mt-2 block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Tool name</span>
                                  <input
                                    value={typeof node().config.mcp_tool_name === "string" ? String(node().config.mcp_tool_name) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, mcp_tool_name: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, mcp_tool_name: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="list_tools to discover, or specific tool name"
                                    class="mt-1 w-full rounded-2xl border border-violet-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                              </div>
                            </Show>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Capability ID</span>
                              <input
                                value={typeof node().config.capability_id === "string" ? String(node().config.capability_id) : ""}
                                onInput={(event) => replaceSelectedNodeConfig({ ...node().config, capability_id: event.currentTarget.value })}
                                onBlur={(event) => patchSelectedNodeConfig({ ...node().config, capability_id: event.currentTarget.value })}
                                disabled={workflowInteractionLocked()}
                                placeholder="e.g. web_search, send_email, run_code"
                                class="mt-2 w-full rounded-2xl border border-violet-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                            <label class="mt-3 flex items-center gap-3 rounded-2xl border border-violet-200/70 bg-white/75 px-4 py-3 text-sm text-on-surface">
                              <input
                                type="checkbox"
                                checked={node().config["metadata_store"] !== false}
                                onChange={(event) => {
                                  patchSelectedNodeConfig({ ...node().config, metadata_store: event.currentTarget.checked });
                                }}
                                disabled={workflowInteractionLocked()}
                              />
                              <span>Store in history? <span class="text-xs text-violet-700">(uncheck for ephemeral tool-result messages — saves ElectricSQL write cost)</span></span>
                            </label>
                          </div>
                        </Show>
                        {/* ── Delegation node: A2A target panel ── */}
                        <Show when={node().kind === "delegation"}>
                          <div class="rounded-[20px] border border-cyan-200/70 bg-cyan-50/70 p-4">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Delegation target</p>
                            <p class="mt-1 text-sm text-cyan-900">Configure the agent-to-agent handoff. A2A delegation sends an AFP delegation message to the target agent and waits for its result — this is not a tool call.</p>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Connector family</span>
                              <select
                                value={typeof node().config.connector_family === "string" ? String(node().config.connector_family) : "a2a"}
                                onChange={(event) => {
                                  patchSelectedNodeConfig({ ...node().config, connector_family: event.currentTarget.value });
                                }}
                                disabled={workflowInteractionLocked()}
                                class="mt-2 w-full rounded-2xl border border-cyan-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="a2a">a2a — Google A2A agent task delegation</option>
                                <option value="internal">internal — Internal OmnyID agent delegation</option>
                              </select>
                            </label>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Target role</span>
                              <input
                                value={typeof node().config.target_role === "string" ? String(node().config.target_role) : ""}
                                onInput={(event) => replaceSelectedNodeConfig({ ...node().config, target_role: event.currentTarget.value })}
                                onBlur={(event) => patchSelectedNodeConfig({ ...node().config, target_role: event.currentTarget.value })}
                                disabled={workflowInteractionLocked()}
                                placeholder="e.g. specialist, researcher, code_reviewer"
                                class="mt-2 w-full rounded-2xl border border-cyan-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                            <Show when={node().config.connector_family === "a2a" || !node().config.connector_family}>
                              <label class="mt-3 block">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">A2A agent ID</span>
                                <input
                                  value={typeof node().config.a2a_agent_id === "string" ? String(node().config.a2a_agent_id) : ""}
                                  onInput={(event) => replaceSelectedNodeConfig({ ...node().config, a2a_agent_id: event.currentTarget.value })}
                                  onBlur={(event) => patchSelectedNodeConfig({ ...node().config, a2a_agent_id: event.currentTarget.value })}
                                  disabled={workflowInteractionLocked()}
                                  placeholder="Agent ID or endpoint registered with A2A"
                                  class="mt-2 w-full rounded-2xl border border-cyan-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                />
                              </label>
                              <label class="mt-3 block">
                                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">A2A agent endpoint</span>
                                <input
                                  value={typeof node().config.a2a_agent_endpoint === "string" ? String(node().config.a2a_agent_endpoint) : ""}
                                  onInput={(event) => replaceSelectedNodeConfig({ ...node().config, a2a_agent_endpoint: event.currentTarget.value })}
                                  onBlur={(event) => patchSelectedNodeConfig({ ...node().config, a2a_agent_endpoint: event.currentTarget.value })}
                                  disabled={workflowInteractionLocked()}
                                  placeholder="https://agent.example.com/tasks"
                                  class="mt-2 w-full rounded-2xl border border-cyan-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                />
                              </label>
                            </Show>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Handoff summary instruction</span>
                              <textarea
                                value={typeof node().config.handoff_instruction === "string" ? String(node().config.handoff_instruction) : ""}
                                onInput={(event) => replaceSelectedNodeConfig({ ...node().config, handoff_instruction: event.currentTarget.value })}
                                onBlur={(event) => patchSelectedNodeConfig({ ...node().config, handoff_instruction: event.currentTarget.value })}
                                disabled={workflowInteractionLocked()}
                                placeholder="Describe what to delegate and the expected output format."
                                class="mt-2 min-h-[72px] w-full rounded-2xl border border-cyan-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                          </div>
                        </Show>
                        {/* ── Trigger node: family/kind selector with cron, webhook, event fields ── */}
                        <Show when={node().kind === "trigger"}>
                          <div class="rounded-[20px] border border-teal-200/70 bg-teal-50/70 p-4">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Trigger configuration</p>
                            <p class="mt-1 text-sm text-teal-900">Define how this workflow is activated. Only trigger families that are compiled into the IR, registered at deploy time, and executed by runtime are fully supported.</p>
                            {/* Item 8: inline trigger diagnostics — filter graph validation messages to this node */}
                            <Show when={validationResult()}>
                              {(vr) => {
                                const nodeId = node().id;
                                const triggerErrors = vr().errors.filter((e) => e.includes(nodeId));
                                const triggerWarnings = vr().warnings.filter((w) => w.includes(nodeId));
                                return (
                                  <Show when={triggerErrors.length > 0 || triggerWarnings.length > 0}>
                                    <div class="mt-3 space-y-1.5">
                                      <For each={triggerErrors}>{(err) =>
                                        <div class="flex items-start gap-2 rounded-2xl border border-rose-200/70 bg-rose-50/85 px-3 py-2 text-xs text-rose-700">
                                          <span class="mt-0.5 shrink-0 font-bold">!</span><span>{err}</span>
                                        </div>
                                      }</For>
                                      <For each={triggerWarnings}>{(warn) =>
                                        <div class="flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/85 px-3 py-2 text-xs text-amber-700">
                                          <span class="mt-0.5 shrink-0 font-semibold">⚠</span><span>{warn}</span>
                                        </div>
                                      }</For>
                                    </div>
                                  </Show>
                                );
                              }}
                            </Show>
                            <label class="mt-3 block">
                              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Trigger family</span>
                              <select
                                value={typeof node().config.trigger_family === "string" ? String(node().config.trigger_family) : "manual"}
                                onChange={(event) => {
                                  const family = event.currentTarget.value;
                                  const kindDefault: Record<string, string> = {
                                    manual: "manual",
                                    schedule: "cron",
                                    webhook: "http_post",
                                    event: "internal_event",
                                    delayed_continuation: "delay_until",
                                    hybrid: "schedule_plus_condition",
                                  };
                                  patchSelectedNodeConfig({
                                    ...node().config,
                                    trigger_family: family,
                                    trigger_kind: kindDefault[family] ?? "manual",
                                  });
                                }}
                                disabled={workflowInteractionLocked()}
                                class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="manual">manual — started explicitly by user or API</option>
                                <option value="schedule">schedule — time-based (cron or one-off)</option>
                                <option value="webhook">webhook — external HTTP event ingress</option>
                                <option value="event">event — internal or external event dispatch</option>
                                <option value="delayed_continuation">delayed_continuation — resume after a delay</option>
                                <option value="hybrid">hybrid — schedule + condition or event + delay</option>
                              </select>
                            </label>
                            {/* Schedule fields */}
                            <Show when={node().config.trigger_family === "schedule"}>
                              <div class="mt-3 space-y-3">
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Trigger kind</span>
                                  <select
                                    value={typeof node().config.trigger_kind === "string" ? String(node().config.trigger_kind) : "cron"}
                                    onChange={(event) => patchSelectedNodeConfig({ ...node().config, trigger_kind: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="cron">cron — recurring schedule</option>
                                    <option value="once">once — single future run</option>
                                  </select>
                                </label>
                                {/* Human-friendly schedule preset picker */}
                                <Show when={node().config.trigger_kind === "cron" || !node().config.trigger_kind}>
                                  <label class="block">
                                    <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Schedule preset</span>
                                    <select
                                      value={(() => {
                                        const expr = typeof node().config.cron_expression === "string" ? String(node().config.cron_expression).trim() : "";
                                        if (expr === "0 * * * *") return "every_hour";
                                        if (expr === "0 9 * * *") return "every_day_9am";
                                        if (expr === "0 9 * * 1-5") return "every_weekday_9am";
                                        if (expr === "0 9 * * 1") return "every_monday_9am";
                                        if (expr === "0 8 * * 1") return "every_monday_8am";
                                        if (expr === "0 0 * * *") return "every_day_midnight";
                                        if (expr === "0 0 * * 1") return "every_monday_midnight";
                                        if (expr === "0 9 1 * *") return "first_of_month_9am";
                                        return "custom";
                                      })()}
                                      onChange={(event) => {
                                        const presets: Record<string, { cron_expression: string; schedule_description: string }> = {
                                          every_hour: { cron_expression: "0 * * * *", schedule_description: "Every hour" },
                                          every_day_9am: { cron_expression: "0 9 * * *", schedule_description: "Every day at 9am" },
                                          every_weekday_9am: { cron_expression: "0 9 * * 1-5", schedule_description: "Every weekday at 9am" },
                                          every_monday_9am: { cron_expression: "0 9 * * 1", schedule_description: "Every Monday at 9am" },
                                          every_monday_8am: { cron_expression: "0 8 * * 1", schedule_description: "Every Monday at 8am" },
                                          every_day_midnight: { cron_expression: "0 0 * * *", schedule_description: "Every day at midnight" },
                                          every_monday_midnight: { cron_expression: "0 0 * * 1", schedule_description: "Every Monday at midnight" },
                                          first_of_month_9am: { cron_expression: "0 9 1 * *", schedule_description: "First of every month at 9am" },
                                        };
                                        const chosen = event.currentTarget.value;
                                        if (chosen === "custom") return;
                                        const preset = presets[chosen];
                                        if (preset) {
                                          patchSelectedNodeConfig({
                                            ...node().config,
                                            cron_expression: preset.cron_expression,
                                            schedule_description: preset.schedule_description,
                                          });
                                        }
                                      }}
                                      disabled={workflowInteractionLocked()}
                                      class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      <option value="custom">Custom — enter expression below</option>
                                      <option value="every_hour">Every hour</option>
                                      <option value="every_day_9am">Every day at 9am</option>
                                      <option value="every_weekday_9am">Every weekday at 9am (Mon–Fri)</option>
                                      <option value="every_monday_9am">Every Monday at 9am</option>
                                      <option value="every_monday_8am">Every Monday at 8am</option>
                                      <option value="every_day_midnight">Every day at midnight</option>
                                      <option value="every_monday_midnight">Every Monday at midnight</option>
                                      <option value="first_of_month_9am">First of every month at 9am</option>
                                    </select>
                                  </label>
                                </Show>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Cron expression</span>
                                  <input
                                    value={typeof node().config.cron_expression === "string" ? String(node().config.cron_expression) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, cron_expression: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, cron_expression: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="0 9 * * 1-5  (9am weekdays)"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 font-mono text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Schedule description</span>
                                  <input
                                    value={typeof node().config.schedule_description === "string" ? String(node().config.schedule_description) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, schedule_description: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, schedule_description: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="Human-readable description, e.g. Every weekday at 9am"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Timezone</span>
                                  <select
                                    value={typeof node().config.timezone === "string" ? String(node().config.timezone) : "UTC"}
                                    onChange={(event) => patchSelectedNodeConfig({ ...node().config, timezone: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="UTC">UTC</option>
                                    <option value="America/New_York">America/New_York</option>
                                    <option value="America/Chicago">America/Chicago</option>
                                    <option value="America/Denver">America/Denver</option>
                                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                                    <option value="Europe/London">Europe/London</option>
                                    <option value="Europe/Paris">Europe/Paris</option>
                                    <option value="Europe/Berlin">Europe/Berlin</option>
                                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                                    <option value="Asia/Shanghai">Asia/Shanghai</option>
                                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                                    <option value="Australia/Sydney">Australia/Sydney</option>
                                  </select>
                                </label>
                              </div>
                            </Show>
                            {/* Webhook fields */}
                            <Show when={node().config.trigger_family === "webhook"}>
                              <div class="mt-3 space-y-3">
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Endpoint path</span>
                                  <input
                                    value={typeof node().config.webhook_endpoint_path === "string" ? String(node().config.webhook_endpoint_path) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, webhook_endpoint_path: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, webhook_endpoint_path: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="/webhooks/my-workflow"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 font-mono text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Event source</span>
                                  <input
                                    value={typeof node().config.event_source === "string" ? String(node().config.event_source) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, event_source: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, event_source: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="e.g. github, stripe, zapier"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                              </div>
                            </Show>
                            {/* Event fields */}
                            <Show when={node().config.trigger_family === "event"}>
                              <div class="mt-3 space-y-3">
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Trigger kind</span>
                                  <select
                                    value={typeof node().config.trigger_kind === "string" ? String(node().config.trigger_kind) : "internal_event"}
                                    onChange={(event) => patchSelectedNodeConfig({ ...node().config, trigger_kind: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="internal_event">internal_event — OmnyID system event</option>
                                    <option value="external_event">external_event — external platform event</option>
                                    <option value="email_ingress">email_ingress — incoming email</option>
                                    <option value="file_drop">file_drop — file upload or watcher</option>
                                    <option value="callback">callback — callback from external service</option>
                                  </select>
                                </label>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Event source</span>
                                  <input
                                    value={typeof node().config.event_source === "string" ? String(node().config.event_source) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, event_source: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, event_source: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="e.g. omnyid.internal, gmail, slack"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Event type filter</span>
                                  <input
                                    value={typeof node().config.event_type === "string" ? String(node().config.event_type) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, event_type: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, event_type: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="e.g. email.received, file.created, push"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                              </div>
                            </Show>
                            {/* Delayed continuation fields */}
                            <Show when={node().config.trigger_family === "delayed_continuation"}>
                              <div class="mt-3 space-y-3">
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Trigger kind</span>
                                  <select
                                    value={typeof node().config.trigger_kind === "string" ? String(node().config.trigger_kind) : "delay_until"}
                                    onChange={(event) => patchSelectedNodeConfig({ ...node().config, trigger_kind: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="delay_until">delay_until — resume at a specific future time</option>
                                    <option value="delay_for">delay_for — resume after a duration</option>
                                    <option value="wake_request">wake_request — AFP wake_request dispatch</option>
                                  </select>
                                </label>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Delay seconds</span>
                                  <input
                                    type="number"
                                    value={typeof node().config.delay_seconds === "number" ? String(node().config.delay_seconds) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, delay_seconds: Number(event.currentTarget.value) || null })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, delay_seconds: Number(event.currentTarget.value) || null })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="e.g. 3600 for 1 hour"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Resume condition</span>
                                  <input
                                    value={typeof node().config.resume_condition === "string" ? String(node().config.resume_condition) : ""}
                                    onInput={(event) => replaceSelectedNodeConfig({ ...node().config, resume_condition: event.currentTarget.value })}
                                    onBlur={(event) => patchSelectedNodeConfig({ ...node().config, resume_condition: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    placeholder="Optional condition that must be true before resuming"
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>
                              </div>
                            </Show>
                            {/* Hybrid fields */}
                            <Show when={node().config.trigger_family === "hybrid"}>
                              <div class="mt-3 space-y-3">
                                <label class="block">
                                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Hybrid composition</span>
                                  <select
                                    value={typeof node().config.trigger_kind === "string" ? String(node().config.trigger_kind) : "schedule_plus_condition"}
                                    onChange={(event) => patchSelectedNodeConfig({ ...node().config, trigger_kind: event.currentTarget.value })}
                                    disabled={workflowInteractionLocked()}
                                    class="mt-2 w-full rounded-2xl border border-teal-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="schedule_plus_condition">schedule + condition — run only when condition is true at schedule time</option>
                                    <option value="event_then_delay">event + delay — trigger on event, then wait before continuing</option>
                                    <option value="event_plus_approval_plus_time">event + approval + time — event triggers, human approves, then time gate</option>
                                  </select>
                                </label>
                                <p class="rounded-2xl border border-teal-200/70 bg-white/75 px-4 py-3 text-xs text-teal-800">Hybrid triggers require the runtime durable wait/resume model to be active. Do not configure hybrid triggers as production entry points until the scheduler and event-dispatch runtime are live.</p>
                              </div>
                            </Show>
                            {/* Trigger registration status */}
                            <Show when={triggerRegistrations().length > 0}>
                              <div class="mt-3 rounded-2xl border border-teal-200/70 bg-white/75 p-3">
                                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Registered triggers ({triggerRegistrations().length})</p>
                                <div class="mt-2 space-y-2">
                                  <For each={triggerRegistrations().filter((reg) => {
                                    const triggerId = typeof reg["trigger_node_id"] === "string" ? reg["trigger_node_id"] : null;
                                    return triggerId === selectedNodeId();
                                  })}>
                                    {(reg) => {
                                      const status = typeof reg["registration_status"] === "string" ? reg["registration_status"] : "preview";
                                      const statusClass =
                                        status === "registered" ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-700"
                                        : status === "paused" ? "border-amber-200/70 bg-amber-50/85 text-amber-700"
                                        : status === "unhealthy" ? "border-rose-200/70 bg-rose-50/85 text-rose-700"
                                        : status === "retired" ? "border-slate-200/70 bg-slate-50/85 text-slate-500"
                                        : "border-sky-200/70 bg-sky-50/85 text-sky-700";
                                      const regId = typeof reg["registration_id"] === "string" ? reg["registration_id"] : "";
                                      const workflowId = currentWorkflow()?.workflow_id;
                                      const nextFireAt = typeof reg["next_fire_at"] === "string" ? reg["next_fire_at"] : null;
                                      const lastFiredAt = typeof reg["last_fired_at"] === "string" ? reg["last_fired_at"] : null;
                                      const fmtRelative = (iso: string | null): string | null => {
                                        if (!iso) return null;
                                        try {
                                          const d = new Date(iso);
                                          const diffMs = d.getTime() - Date.now();
                                          const absSecs = Math.abs(Math.round(diffMs / 1000));
                                          if (absSecs < 60) return diffMs > 0 ? `in ${absSecs}s` : `${absSecs}s ago`;
                                          const absMins = Math.round(absSecs / 60);
                                          if (absMins < 60) return diffMs > 0 ? `in ${absMins}m` : `${absMins}m ago`;
                                          const absHrs = Math.round(absMins / 60);
                                          if (absHrs < 48) return diffMs > 0 ? `in ${absHrs}h` : `${absHrs}h ago`;
                                          const absDays = Math.round(absHrs / 24);
                                          return diffMs > 0 ? `in ${absDays}d` : `${absDays}d ago`;
                                        } catch { return null; }
                                      };
                                      return (
                                        <div class={`rounded-2xl border px-3 py-2 ${statusClass}`}>
                                          <div class="flex items-center justify-between gap-3">
                                            <span class="text-xs font-semibold uppercase tracking-[0.12em]">{status}</span>
                                            <div class="flex gap-2">
                                              <Show when={status !== "paused" && status !== "retired"}>
                                                <button
                                                  type="button"
                                                  class="rounded-full border border-current bg-white/70 px-3 py-1 text-xs font-medium transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                                  disabled={workflowInteractionLocked() || triggerRegistrationsLoading()}
                                                  onClick={() => {
                                                    if (!workflowId || !regId) return;
                                                    setTriggerRegistrationsLoading(true);
                                                    void updateWorkflowTriggerRegistrationStatus(workflowId, regId, "paused").then(() => {
                                                      return listWorkflowTriggerRegistrations(workflowId);
                                                    }).then((response) => {
                                                      setTriggerRegistrations(response.registrations ?? []);
                                                    }).finally(() => { setTriggerRegistrationsLoading(false); });
                                                  }}
                                                >Pause</button>
                                              </Show>
                                              <Show when={status === "paused"}>
                                                <button
                                                  type="button"
                                                  class="rounded-full border border-current bg-white/70 px-3 py-1 text-xs font-medium transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                                  disabled={workflowInteractionLocked() || triggerRegistrationsLoading()}
                                                  onClick={() => {
                                                    if (!workflowId || !regId) return;
                                                    setTriggerRegistrationsLoading(true);
                                                    void updateWorkflowTriggerRegistrationStatus(workflowId, regId, "registered").then(() => {
                                                      return listWorkflowTriggerRegistrations(workflowId);
                                                    }).then((response) => {
                                                      setTriggerRegistrations(response.registrations ?? []);
                                                    }).finally(() => { setTriggerRegistrationsLoading(false); });
                                                  }}
                                                >Resume</button>
                                              </Show>
                                            </div>
                                          </div>
                                          <Show when={nextFireAt || lastFiredAt}>
                                            <div class="mt-1.5 flex flex-wrap gap-3">
                                              <Show when={nextFireAt}>
                                                <span class="text-[11px] font-medium opacity-80" title={nextFireAt!}>
                                                  Next fire: {fmtRelative(nextFireAt) ?? nextFireAt}
                                                </span>
                                              </Show>
                                              <Show when={lastFiredAt}>
                                                <span class="text-[11px] font-medium opacity-70" title={lastFiredAt!}>
                                                  Last fired: {fmtRelative(lastFiredAt) ?? lastFiredAt}
                                                </span>
                                              </Show>
                                            </div>
                                          </Show>
                                        </div>
                                      );
                                    }}
                                  </For>
                                  <Show when={triggerRegistrations().filter((reg) => {
                                    const triggerId = typeof reg["trigger_node_id"] === "string" ? reg["trigger_node_id"] : null;
                                    return triggerId === selectedNodeId();
                                  }).length === 0}>
                                    <p class="text-xs text-teal-700">No trigger registrations for this node yet. Deploy the workflow to register triggers.</p>
                                  </Show>
                                </div>
                              </div>
                            </Show>
                          </div>
                        </Show>
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
                      const manifestEntries = Array.isArray(compiled.manifests)
                        ? compiled.manifests
                          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
                          .map((entry) => {
                            const runtimeKind = typeof entry.runtime_kind === "string" ? entry.runtime_kind : null;
                            const capabilityId = entry.connector_binding && typeof entry.connector_binding === "object" && typeof (entry.connector_binding as Record<string, unknown>).capability_id === "string"
                              ? (entry.connector_binding as Record<string, unknown>).capability_id as string
                              : null;
                            return {
                              nodeId: typeof entry.source_graph_node_id === "string" ? entry.source_graph_node_id : null,
                              manifestNodeId: typeof entry.node_id === "string" ? entry.node_id : null,
                              runtimeKind,
                              memoryScope: typeof entry.memory_scope === "string" ? entry.memory_scope : null,
                              label: typeof entry.metadata === "object" && entry.metadata && typeof (entry.metadata as Record<string, unknown>).label === "string"
                                ? (entry.metadata as Record<string, unknown>).label as string
                                : typeof entry.source_graph_node_id === "string"
                                  ? nodeLabelById().get(entry.source_graph_node_id) ?? entry.source_graph_node_id
                                  : "Workflow node",
                              capabilityId,
                              traceSource: entry.connector_binding && typeof entry.connector_binding === "object" && typeof (entry.connector_binding as Record<string, unknown>).trace_source === "string"
                                ? (entry.connector_binding as Record<string, unknown>).trace_source as string
                                : null,
                              afpContract: compiledManifestAfpContract(runtimeKind, capabilityId),
                              orchestrationRole: compiledManifestOrchestrationRole(runtimeKind, capabilityId),
                              afpGapKinds: compiledManifestAfpGapKinds(
                                runtimeKind,
                                capabilityId,
                                typeof entry.memory_scope === "string" ? entry.memory_scope : null,
                                entry.connector_binding && typeof entry.connector_binding === "object" && typeof (entry.connector_binding as Record<string, unknown>).trace_source === "string"
                                  ? (entry.connector_binding as Record<string, unknown>).trace_source as string
                                  : null,
                              ),
                            };
                          })
                        : [];
                      const compiledEdges = Array.isArray(compiled.edges)
                        ? compiled.edges
                          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
                          .map((entry) => {
                            const fromManifestNodeId = typeof entry.from_manifest_node_id === "string" ? entry.from_manifest_node_id : null;
                            const toManifestNodeId = typeof entry.to_manifest_node_id === "string" ? entry.to_manifest_node_id : null;
                            const fromManifest = manifestEntries.find((manifestEntry) => manifestEntry.manifestNodeId === fromManifestNodeId) ?? null;
                            const toManifest = manifestEntries.find((manifestEntry) => manifestEntry.manifestNodeId === toManifestNodeId) ?? null;
                            const routeLabel = typeof entry.route_label === "string" ? entry.route_label : null;
                            const graphEdgeId = fromManifest?.nodeId && toManifest?.nodeId
                              ? draft().edges.find(
                                  (graphEdge) => graphEdge.source === fromManifest.nodeId
                                    && graphEdge.target === toManifest.nodeId
                                    && (graphEdge.condition_label ?? null) === routeLabel,
                                )?.id ?? null
                              : null;
                            return {
                              fromManifestNodeId,
                              toManifestNodeId,
                              routeLabel,
                              fromLabel: fromManifest?.label ?? fromManifestNodeId ?? "Unknown source",
                              toLabel: toManifest?.label ?? toManifestNodeId ?? "Unknown target",
                              sourceNodeId: fromManifest?.nodeId ?? null,
                              sourceOrchestrationRole: fromManifest?.orchestrationRole ?? null,
                              targetOrchestrationRole: toManifest?.orchestrationRole ?? null,
                              graphEdgeId,
                            };
                          })
                        : [];
                      const entryManifestNodeIds = Array.isArray(compiled.entry_manifest_node_ids)
                        ? compiled.entry_manifest_node_ids.filter((value): value is string => typeof value === "string")
                        : [];
                      const entryManifestLabels = entryManifestNodeIds.map((manifestNodeId) => {
                        const manifest = manifestEntries.find((entry) => entry.manifestNodeId === manifestNodeId);
                        return manifest?.label ?? manifestNodeId;
                      });
                      const compiler = compiled.metadata && typeof compiled.metadata === "object" && typeof (compiled.metadata as Record<string, unknown>).compiler === "string"
                        ? (compiled.metadata as Record<string, unknown>).compiler as string
                        : null;
                      const graphNodeCount = compiled.metadata && typeof compiled.metadata === "object" && typeof (compiled.metadata as Record<string, unknown>).graph_node_count === "number"
                        ? (compiled.metadata as Record<string, unknown>).graph_node_count as number
                        : null;
                      const afpCapabilityBoundaryCount = manifestEntries.filter((entry) => entry.afpContract.category === "capability_boundary").length;
                      const afpDecisionBoundaryCount = manifestEntries.filter((entry) => entry.afpContract.category === "decision_boundary").length;
                      const afpSummaryBoundaryCount = manifestEntries.filter((entry) => entry.afpContract.category === "summary_boundary").length;
                      const afpScaffoldCount = manifestEntries.filter((entry) => entry.afpContract.category === "orchestration_scaffold").length;
                      const supervisorOrchestrationCount = manifestEntries.filter((entry) => entry.orchestrationRole.role === "supervisor_orchestration").length;
                      const delegatedCapabilityCount = manifestEntries.filter((entry) => entry.orchestrationRole.role === "delegated_capability").length;
                      const delegatedDecisionCount = manifestEntries.filter((entry) => entry.orchestrationRole.role === "delegated_decision").length;
                      const workflowSummaryCount = manifestEntries.filter((entry) => entry.orchestrationRole.role === "workflow_summary").length;
                      const afpFilter = selectedCompiledAfpFilter();
                      const afpGapFilter = selectedCompiledAfpGapFilter();
                      const afpReadinessFocus = selectedCompiledAfpReadinessFocus();
                      const orchestrationRoleFilter = selectedCompiledOrchestrationRole();
                      const afpRouteFocus = selectedCompiledAfpRouteFocus();
                      const manifestLinkageFilter = selectedCompiledManifestLinkageFilter();
                      const routeLinkageFilter = selectedCompiledRouteLinkageFilter();
                      const readyManifestEntryIds = new Set(
                        manifestEntries
                          .filter((entry) => entry.afpContract.category !== "orchestration_scaffold" && entry.afpGapKinds.length === 0 && entry.manifestNodeId)
                          .map((entry) => entry.manifestNodeId as string),
                      );
                      const readinessFilteredManifestEntries = afpReadinessFocus === "ready_manifests"
                        ? manifestEntries.filter((entry) => Boolean(entry.manifestNodeId) && readyManifestEntryIds.has(entry.manifestNodeId!))
                        : afpReadinessFocus === "needs_contract_work"
                          ? manifestEntries.filter((entry) => entry.afpContract.category === "orchestration_scaffold" || entry.afpGapKinds.length > 0)
                          : afpReadinessFocus === "ready_handoffs"
                            ? manifestEntries
                          : manifestEntries;
                      const afpFilteredManifestEntries = afpFilter
                        ? readinessFilteredManifestEntries.filter((entry) => entry.afpContract.category === afpFilter)
                        : readinessFilteredManifestEntries;
                      const afpGapFilteredManifestEntries = afpGapFilter
                        ? afpFilteredManifestEntries.filter((entry) => entry.afpGapKinds.includes(afpGapFilter))
                        : afpFilteredManifestEntries;
                      const readyHandoffEdgeKeys = new Set(
                        compiledEdges
                          .filter((edge) => Boolean(
                            edge.fromManifestNodeId
                              && edge.toManifestNodeId
                              && readyManifestEntryIds.has(edge.fromManifestNodeId)
                              && readyManifestEntryIds.has(edge.toManifestNodeId),
                          ))
                          .map((edge) => `${edge.fromManifestNodeId ?? "unknown"}:${edge.toManifestNodeId ?? "unknown"}:${edge.routeLabel ?? "default"}`),
                      );
                      const readyHandoffManifestIds = new Set(
                        compiledEdges.flatMap((edge) => {
                          const isReadyHandoff = Boolean(
                            edge.fromManifestNodeId
                              && edge.toManifestNodeId
                              && readyManifestEntryIds.has(edge.fromManifestNodeId)
                              && readyManifestEntryIds.has(edge.toManifestNodeId),
                          );
                          return isReadyHandoff
                            ? [edge.fromManifestNodeId, edge.toManifestNodeId].filter((value): value is string => Boolean(value))
                            : [];
                        }),
                      );
                      const readinessFocusedManifestEntries = afpReadinessFocus === "ready_handoffs"
                        ? afpGapFilteredManifestEntries.filter((entry) => Boolean(entry.manifestNodeId) && readyHandoffManifestIds.has(entry.manifestNodeId!))
                        : afpGapFilteredManifestEntries;
                      const orchestrationRoleFilteredManifestEntries = orchestrationRoleFilter
                        ? readinessFocusedManifestEntries.filter((entry) => entry.orchestrationRole.role === orchestrationRoleFilter)
                        : readinessFocusedManifestEntries;
                      const selectedRoleManifestEntries = orchestrationRoleFilter
                        ? manifestEntries.filter((entry) => entry.orchestrationRole.role === orchestrationRoleFilter)
                        : [];
                      const selectedRoleReadyManifestCount = selectedRoleManifestEntries.filter((entry) =>
                        entry.afpContract.category !== "orchestration_scaffold" && entry.afpGapKinds.length === 0,
                      ).length;
                      const selectedRoleContractWorkCount = selectedRoleManifestEntries.filter((entry) =>
                        entry.afpContract.category === "orchestration_scaffold" || entry.afpGapKinds.length > 0,
                      ).length;
                      const linkedManifestCount = orchestrationRoleFilteredManifestEntries.filter((entry) => Boolean(entry.nodeId)).length;
                      const manifestOnlyFocusCount = orchestrationRoleFilteredManifestEntries.filter((entry) => !entry.nodeId).length;
                      const filteredManifestEntries = manifestLinkageFilter === "linked"
                        ? orchestrationRoleFilteredManifestEntries.filter((entry) => Boolean(entry.nodeId))
                        : manifestLinkageFilter === "inspector_only"
                          ? orchestrationRoleFilteredManifestEntries.filter((entry) => !entry.nodeId)
                          : orchestrationRoleFilteredManifestEntries;
                      const genericBoundaryGapCount = afpFilteredManifestEntries.filter((entry) => entry.afpGapKinds.includes("generic_boundary")).length;
                      const missingMemoryScopeGapCount = afpFilteredManifestEntries.filter((entry) => entry.afpGapKinds.includes("missing_memory_scope")).length;
                      const missingTraceSourceGapCount = afpFilteredManifestEntries.filter((entry) => entry.afpGapKinds.includes("missing_trace_source")).length;
                      const orchestrationScaffoldGapCount = afpFilteredManifestEntries.filter((entry) => entry.afpGapKinds.includes("orchestration_scaffold")).length;
                      const readinessFilteredCompiledEdges = afpReadinessFocus === "ready_handoffs"
                        ? compiledEdges.filter((edge) => readyHandoffEdgeKeys.has(`${edge.fromManifestNodeId ?? "unknown"}:${edge.toManifestNodeId ?? "unknown"}:${edge.routeLabel ?? "default"}`))
                        : afpReadinessFocus === "ready_manifests"
                          ? compiledEdges.filter((edge) =>
                            Boolean(
                              (edge.fromManifestNodeId && readyManifestEntryIds.has(edge.fromManifestNodeId))
                              || (edge.toManifestNodeId && readyManifestEntryIds.has(edge.toManifestNodeId)),
                            ),
                          )
                          : afpReadinessFocus === "needs_contract_work"
                            ? compiledEdges.filter((edge) =>
                              Boolean(
                                (edge.fromManifestNodeId && !readyManifestEntryIds.has(edge.fromManifestNodeId))
                                || (edge.toManifestNodeId && !readyManifestEntryIds.has(edge.toManifestNodeId)),
                              ),
                            )
                            : compiledEdges;
                      const afpFilteredCompiledEdges = afpFilter
                        ? readinessFilteredCompiledEdges.filter((edge) => {
                            const sourceManifest = manifestEntries.find((entry) => entry.manifestNodeId === edge.fromManifestNodeId) ?? null;
                            const targetManifest = manifestEntries.find((entry) => entry.manifestNodeId === edge.toManifestNodeId) ?? null;
                            const sourceMatches = sourceManifest?.afpContract.category === afpFilter;
                            const targetMatches = targetManifest?.afpContract.category === afpFilter;
                            if (afpRouteFocus === "full") {
                              return sourceMatches && targetMatches;
                            }
                            if (afpRouteFocus === "partial") {
                              return (sourceMatches || targetMatches) && !(sourceMatches && targetMatches);
                            }
                            return sourceMatches || targetMatches;
                          })
                        : readinessFilteredCompiledEdges;
                      const orchestrationRoleFilteredCompiledEdges = orchestrationRoleFilter
                        ? afpFilteredCompiledEdges.filter((edge) =>
                          edge.sourceOrchestrationRole?.role === orchestrationRoleFilter
                          || edge.targetOrchestrationRole?.role === orchestrationRoleFilter,
                        )
                        : afpFilteredCompiledEdges;
                      const selectedRoleReadyHandoffCount = orchestrationRoleFilter
                        ? compiledEdges.filter((edge) =>
                          readyHandoffEdgeKeys.has(`${edge.fromManifestNodeId ?? "unknown"}:${edge.toManifestNodeId ?? "unknown"}:${edge.routeLabel ?? "default"}`)
                          && (edge.sourceOrchestrationRole?.role === orchestrationRoleFilter
                            || edge.targetOrchestrationRole?.role === orchestrationRoleFilter)
                        ).length
                        : 0;
                      const supervisorOrchestrationRouteCount = afpFilteredCompiledEdges.filter((edge) =>
                        edge.sourceOrchestrationRole?.role === "supervisor_orchestration"
                        || edge.targetOrchestrationRole?.role === "supervisor_orchestration",
                      ).length;
                      const delegatedCapabilityRouteCount = afpFilteredCompiledEdges.filter((edge) =>
                        edge.sourceOrchestrationRole?.role === "delegated_capability"
                        || edge.targetOrchestrationRole?.role === "delegated_capability",
                      ).length;
                      const delegatedDecisionRouteCount = afpFilteredCompiledEdges.filter((edge) =>
                        edge.sourceOrchestrationRole?.role === "delegated_decision"
                        || edge.targetOrchestrationRole?.role === "delegated_decision",
                      ).length;
                      const workflowSummaryRouteCount = afpFilteredCompiledEdges.filter((edge) =>
                        edge.sourceOrchestrationRole?.role === "workflow_summary"
                        || edge.targetOrchestrationRole?.role === "workflow_summary",
                      ).length;
                      const filteredCompiledEdges = routeLinkageFilter === "linked"
                        ? orchestrationRoleFilteredCompiledEdges.filter((edge) => Boolean(edge.graphEdgeId))
                        : routeLinkageFilter === "manifest_only"
                          ? orchestrationRoleFilteredCompiledEdges.filter((edge) => !edge.graphEdgeId)
                          : orchestrationRoleFilteredCompiledEdges;
                      const linkedCompiledRouteCount = orchestrationRoleFilteredCompiledEdges.filter((edge) => Boolean(edge.graphEdgeId)).length;
                      const manifestOnlyCompiledRouteCount = orchestrationRoleFilteredCompiledEdges.filter((edge) => !edge.graphEdgeId).length;
                      const focusedManifestEntry = selectedInspectorFocusSource() === "compiled_manifest" && selectedInspectorFocusTarget()
                        ? manifestEntries.find((entry) => entry.manifestNodeId === selectedInspectorFocusTarget()) ?? null
                        : null;
                      const focusedCompiledRoute = selectedInspectorFocusSource() === "compiled_route" && selectedInspectorFocusTarget()
                        ? compiledEdges.find(
                            (edge) => `${edge.fromManifestNodeId ?? "unknown"}:${edge.toManifestNodeId ?? "unknown"}:${edge.routeLabel ?? "default"}` === selectedInspectorFocusTarget(),
                          ) ?? null
                        : null;
                      const firstFilteredManifestEntry = filteredManifestEntries[0] ?? null;
                      const firstFilteredCompiledRoute = filteredCompiledEdges[0] ?? null;
                      const primaryCompiledReviewDriver = afpRouteFocus
                        ? {
                            label: `Primary review driver: AFP route ${afpRouteFocus === "full" ? "full match" : "partial match"}`,
                            detail: "Compiled route topology is currently the strongest review emphasis for this snapshot.",
                            tone: "border-emerald-200/80 bg-white/80 text-emerald-800",
                            available: Boolean(firstFilteredCompiledRoute),
                            onClick: () => {
                              if (!firstFilteredCompiledRoute) return;
                              if (firstFilteredCompiledRoute.sourceNodeId) {
                                setSelectedNodeId(firstFilteredCompiledRoute.sourceNodeId);
                              } else {
                                setSelectedNodeId(null);
                              }
                              if (firstFilteredCompiledRoute.graphEdgeId) {
                                setSelectedRunEdgeId(firstFilteredCompiledRoute.graphEdgeId);
                              }
                              setSelectedInspectorSection("compiled_runtime_contract");
                              setSelectedInspectorFocusSource("compiled_route");
                              setSelectedInspectorFocusTarget(`${firstFilteredCompiledRoute.fromManifestNodeId ?? "unknown"}:${firstFilteredCompiledRoute.toManifestNodeId ?? "unknown"}:${firstFilteredCompiledRoute.routeLabel ?? "default"}`);
                            },
                            title: firstFilteredCompiledRoute
                              ? availableReviewTargetMessage("compiled_route")
                              : "No compiled route is available for the current AFP route-focused review subset",
                          }
                        : afpReadinessFocus
                          ? {
                              label: `Primary review driver: ${afpReadinessFocus === "ready_manifests"
                                ? "AFP-ready manifests"
                                : afpReadinessFocus === "ready_handoffs"
                                  ? "AFP-ready handoffs"
                                  : "AFP contract-work review"}`,
                              detail: afpReadinessFocusSummary(afpReadinessFocus),
                              tone: afpReadinessFocus === "needs_contract_work"
                                ? "border-amber-200/80 bg-amber-50/80 text-amber-800"
                                : afpReadinessFocus === "ready_handoffs"
                                  ? "border-cyan-200/80 bg-cyan-50/80 text-cyan-800"
                                  : "border-emerald-200/80 bg-white/80 text-emerald-800",
                              available: afpReadinessFocus === "ready_handoffs"
                                ? Boolean(firstFilteredCompiledRoute)
                                : Boolean(firstFilteredManifestEntry?.manifestNodeId),
                              onClick: () => {
                                if (afpReadinessFocus === "ready_handoffs") {
                                  if (!firstFilteredCompiledRoute) return;
                                  if (firstFilteredCompiledRoute.sourceNodeId) {
                                    setSelectedNodeId(firstFilteredCompiledRoute.sourceNodeId);
                                  } else {
                                    setSelectedNodeId(null);
                                  }
                                  if (firstFilteredCompiledRoute.graphEdgeId) {
                                    setSelectedRunEdgeId(firstFilteredCompiledRoute.graphEdgeId);
                                  }
                                  setSelectedInspectorSection("compiled_runtime_contract");
                                  setSelectedInspectorFocusSource("compiled_route");
                                  setSelectedInspectorFocusTarget(`${firstFilteredCompiledRoute.fromManifestNodeId ?? "unknown"}:${firstFilteredCompiledRoute.toManifestNodeId ?? "unknown"}:${firstFilteredCompiledRoute.routeLabel ?? "default"}`);
                                  return;
                                }
                                if (!firstFilteredManifestEntry?.manifestNodeId) return;
                                setSelectedNodeId(firstFilteredManifestEntry.nodeId ?? null);
                                setSelectedInspectorSection("compiled_runtime_contract");
                                setSelectedInspectorFocusSource("compiled_manifest");
                                setSelectedInspectorFocusTarget(firstFilteredManifestEntry.manifestNodeId);
                              },
                              title: afpReadinessFocus === "ready_handoffs"
                                ? firstFilteredCompiledRoute
                                  ? availableReviewTargetMessage("compiled_route")
                                  : "No compiled route is available for the current AFP readiness handoff review subset"
                                : firstFilteredManifestEntry?.manifestNodeId
                                  ? availableReviewTargetMessage("compiled_manifest")
                                  : "No compiled manifest is available for the current AFP readiness review subset",
                            }
                        : afpGapFilter
                          ? {
                              label: `Primary review driver: ${compiledAfpGapLabel(afpGapFilter)}`,
                              detail: compiledAfpGapDescription(afpGapFilter),
                              tone: "border-violet-200/80 bg-violet-50/80 text-violet-800",
                              available: Boolean(firstFilteredManifestEntry?.manifestNodeId),
                              onClick: () => {
                                if (!firstFilteredManifestEntry?.manifestNodeId) return;
                                setSelectedNodeId(firstFilteredManifestEntry.nodeId ?? null);
                                setSelectedInspectorSection("compiled_runtime_contract");
                                setSelectedInspectorFocusSource("compiled_manifest");
                                setSelectedInspectorFocusTarget(firstFilteredManifestEntry.manifestNodeId);
                              },
                              title: firstFilteredManifestEntry?.manifestNodeId
                                ? availableReviewTargetMessage("compiled_manifest")
                                : "No compiled manifest is available for the current AFP gap-focused review subset",
                            }
                        : manifestLinkageFilter
                          ? {
                              label: `Primary review driver: ${manifestLinkageFilter === "linked" ? "node-review-ready manifests" : "inspector-only manifests"}`,
                              detail: "Manifest health is currently the strongest review emphasis for this snapshot.",
                              tone: manifestLinkageFilter === "linked"
                                ? "border-sky-200/80 bg-sky-50/80 text-sky-800"
                                : "border-amber-200/80 bg-amber-50/80 text-amber-800",
                              available: Boolean(firstFilteredManifestEntry?.manifestNodeId),
                              onClick: () => {
                                if (!firstFilteredManifestEntry?.manifestNodeId) return;
                                setSelectedNodeId(firstFilteredManifestEntry.nodeId ?? null);
                                setSelectedInspectorSection("compiled_runtime_contract");
                                setSelectedInspectorFocusSource("compiled_manifest");
                                setSelectedInspectorFocusTarget(firstFilteredManifestEntry.manifestNodeId);
                              },
                              title: firstFilteredManifestEntry?.manifestNodeId
                                ? availableReviewTargetMessage("compiled_manifest")
                                : "No compiled manifest is available for the current manifest-health review subset",
                            }
                          : routeLinkageFilter
                            ? {
                                label: `Primary review driver: ${routeLinkageFilter === "linked" ? "branch-review-ready routes" : "inspector-only routes"}`,
                                detail: "Route linkage quality is currently the strongest review emphasis for this snapshot.",
                                tone: routeLinkageFilter === "linked"
                                  ? "border-emerald-200/80 bg-white/80 text-emerald-800"
                                  : "border-amber-200/80 bg-amber-50/80 text-amber-800",
                                available: Boolean(firstFilteredCompiledRoute),
                                onClick: () => {
                                  if (!firstFilteredCompiledRoute) return;
                                  if (firstFilteredCompiledRoute.sourceNodeId) {
                                    setSelectedNodeId(firstFilteredCompiledRoute.sourceNodeId);
                                  } else {
                                    setSelectedNodeId(null);
                                  }
                                  if (firstFilteredCompiledRoute.graphEdgeId) {
                                    setSelectedRunEdgeId(firstFilteredCompiledRoute.graphEdgeId);
                                  }
                                  setSelectedInspectorSection("compiled_runtime_contract");
                                  setSelectedInspectorFocusSource("compiled_route");
                                  setSelectedInspectorFocusTarget(`${firstFilteredCompiledRoute.fromManifestNodeId ?? "unknown"}:${firstFilteredCompiledRoute.toManifestNodeId ?? "unknown"}:${firstFilteredCompiledRoute.routeLabel ?? "default"}`);
                                },
                                title: firstFilteredCompiledRoute
                                  ? availableReviewTargetMessage("compiled_route")
                                  : "No compiled route is available for the current linkage-focused review subset",
                              }
                            : focusedManifestEntry || focusedCompiledRoute
                              ? {
                                  label: "Primary review driver: contract focus",
                                  detail: focusedManifestEntry
                                    ? `Contract review is currently anchored to manifest ${focusedManifestEntry.label}.`
                                    : `Contract review is currently anchored to route ${focusedCompiledRoute?.fromLabel} -> ${focusedCompiledRoute?.toLabel}.`,
                                  tone: "border-emerald-200/80 bg-white/80 text-emerald-800",
                                  available: true,
                                  onClick: () => {
                                    setSelectedInspectorSection("compiled_runtime_contract");
                                    if (focusedManifestEntry) {
                                      setSelectedNodeId(focusedManifestEntry.nodeId ?? null);
                                      setSelectedInspectorFocusSource("compiled_manifest");
                                      setSelectedInspectorFocusTarget(focusedManifestEntry.manifestNodeId ?? focusedManifestEntry.nodeId ?? null);
                                      return;
                                    }
                                    if (focusedCompiledRoute) {
                                      setSelectedNodeId(focusedCompiledRoute.sourceNodeId ?? null);
                                      if (focusedCompiledRoute.graphEdgeId) {
                                        setSelectedRunEdgeId(focusedCompiledRoute.graphEdgeId);
                                      }
                                      setSelectedInspectorFocusSource("compiled_route");
                                      setSelectedInspectorFocusTarget(`${focusedCompiledRoute.fromManifestNodeId ?? "unknown"}:${focusedCompiledRoute.toManifestNodeId ?? "unknown"}:${focusedCompiledRoute.routeLabel ?? "default"}`);
                                    }
                                  },
                                  title: availableReviewTargetMessage("contract_focus"),
                                }
                              : null;
                      return (
                        <div class="rounded-[22px] border border-emerald-200/70 bg-emerald-50/70 p-4">
                          <p class="text-sm font-semibold text-emerald-800">Compiled runtime snapshot</p>
                          <p class="mt-1 text-xs uppercase tracking-[0.18em] text-emerald-700">{manifests} manifests - compiled {compiledAt ? new Date(compiledAt).toLocaleString() : "recently"}</p>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <Show when={compiler}>
                              <span class="rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                {compiler}
                              </span>
                            </Show>
                            <Show when={graphNodeCount !== null}>
                              <span class="rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                {graphNodeCount} graph nodes
                              </span>
                            </Show>
                            <Show when={entryManifestNodeIds.length > 0}>
                              <span class="rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                {entryManifestNodeIds.length} entry manifests
                              </span>
                            </Show>
                            <Show when={afpCapabilityBoundaryCount > 0}>
                              <span class="rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                {afpCapabilityBoundaryCount} AFP capability boundaries
                              </span>
                            </Show>
                            <Show when={afpDecisionBoundaryCount > 0}>
                              <span class="rounded-full border border-amber-200/70 bg-amber-50/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                {afpDecisionBoundaryCount} AFP decision boundaries
                              </span>
                            </Show>
                            <Show when={afpSummaryBoundaryCount > 0}>
                              <span class="rounded-full border border-violet-200/70 bg-violet-50/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                {afpSummaryBoundaryCount} AFP summary boundaries
                              </span>
                            </Show>
                            <Show when={afpScaffoldCount > 0}>
                              <span class="rounded-full border border-slate-200/70 bg-slate-100/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                {afpScaffoldCount} orchestration scaffolds
                              </span>
                            </Show>
                          </div>
                          <Show when={genericBoundaryGapCount > 0 || missingMemoryScopeGapCount > 0 || missingTraceSourceGapCount > 0 || orchestrationScaffoldGapCount > 0}>
                            <div class="mt-3 rounded-2xl border border-violet-200/70 bg-violet-50/70 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">AFP contract gaps</p>
                                  <p class="mt-1 text-xs text-violet-900">Use these filters to focus manifests that still need clearer AFP capability binding, memory scope, trace provenance, or scaffold reduction.</p>
                                </div>
                                <Show when={afpGapFilter}>
                                  <button
                                    type="button"
                                    class="rounded-full border border-violet-200/80 bg-white/85 px-3 py-1 text-xs font-medium text-violet-800 transition hover:bg-white"
                                    onClick={() => setSelectedCompiledAfpGapFilter(null)}
                                    title="Clear the current AFP contract gap focus"
                                    aria-label="Clear the current AFP contract gap focus"
                                  >
                                    Clear AFP gap focus
                                  </button>
                                </Show>
                              </div>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <Show when={genericBoundaryGapCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${afpGapFilter === "generic_boundary" ? "border-violet-300 bg-white ring-2 ring-violet-300/70 text-violet-700" : "border-violet-200/70 bg-white/80 text-violet-700"}`}
                                    onClick={() => setSelectedCompiledAfpGapFilter("generic_boundary")}
                                    title={compiledAfpGapDescription("generic_boundary")}
                                    aria-label={compiledAfpGapDescription("generic_boundary")}
                                  >
                                    {genericBoundaryGapCount} {compiledAfpGapLabel("generic_boundary")}
                                  </button>
                                </Show>
                                <Show when={missingMemoryScopeGapCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${afpGapFilter === "missing_memory_scope" ? "border-violet-300 bg-white ring-2 ring-violet-300/70 text-violet-700" : "border-violet-200/70 bg-white/80 text-violet-700"}`}
                                    onClick={() => setSelectedCompiledAfpGapFilter("missing_memory_scope")}
                                    title={compiledAfpGapDescription("missing_memory_scope")}
                                    aria-label={compiledAfpGapDescription("missing_memory_scope")}
                                  >
                                    {missingMemoryScopeGapCount} {compiledAfpGapLabel("missing_memory_scope")}
                                  </button>
                                </Show>
                                <Show when={missingTraceSourceGapCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${afpGapFilter === "missing_trace_source" ? "border-violet-300 bg-white ring-2 ring-violet-300/70 text-violet-700" : "border-violet-200/70 bg-white/80 text-violet-700"}`}
                                    onClick={() => setSelectedCompiledAfpGapFilter("missing_trace_source")}
                                    title={compiledAfpGapDescription("missing_trace_source")}
                                    aria-label={compiledAfpGapDescription("missing_trace_source")}
                                  >
                                    {missingTraceSourceGapCount} {compiledAfpGapLabel("missing_trace_source")}
                                  </button>
                                </Show>
                                <Show when={orchestrationScaffoldGapCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${afpGapFilter === "orchestration_scaffold" ? "border-violet-300 bg-white ring-2 ring-violet-300/70 text-violet-700" : "border-violet-200/70 bg-white/80 text-violet-700"}`}
                                    onClick={() => setSelectedCompiledAfpGapFilter("orchestration_scaffold")}
                                    title={compiledAfpGapDescription("orchestration_scaffold")}
                                    aria-label={compiledAfpGapDescription("orchestration_scaffold")}
                                  >
                                    {orchestrationScaffoldGapCount} {compiledAfpGapLabel("orchestration_scaffold")}
                                  </button>
                                </Show>
                              </div>
                              <Show when={afpGapFilter}>
                                <p class="mt-2 text-xs text-violet-900">{compiledAfpGapDescription(afpGapFilter!)}</p>
                              </Show>
                            </div>
                          </Show>
                          <Show when={manifestEntries.length > 0}>
                            <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 p-3">
                              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Master-agent decomposition</p>
                              <p class="mt-1 text-xs text-sky-900">This view estimates which compiled runtime units still belong to workflow-supervisor orchestration and which already look like delegated bounded sub-agent units.</p>
                              <div class="mt-3 flex flex-wrap gap-2">
                                <Show when={supervisorOrchestrationCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "supervisor_orchestration" ? "border-slate-300 bg-white ring-2 ring-slate-300/70 text-slate-700" : "border-slate-200/70 bg-white/85 text-slate-700"}`}
                                    onClick={() => setSelectedCompiledOrchestrationRole("supervisor_orchestration")}
                                    title={focusOrchestrationRoleReviewMessage("supervisor_orchestration")}
                                    aria-label={focusOrchestrationRoleReviewMessage("supervisor_orchestration")}
                                  >
                                    {supervisorOrchestrationCount} supervisor orchestration units
                                  </button>
                                </Show>
                                <Show when={delegatedCapabilityCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "delegated_capability" ? "border-sky-300 bg-white ring-2 ring-sky-300/70 text-sky-700" : "border-sky-200/70 bg-white/85 text-sky-700"}`}
                                    onClick={() => setSelectedCompiledOrchestrationRole("delegated_capability")}
                                    title={focusOrchestrationRoleReviewMessage("delegated_capability")}
                                    aria-label={focusOrchestrationRoleReviewMessage("delegated_capability")}
                                  >
                                    {delegatedCapabilityCount} delegated capability units
                                  </button>
                                </Show>
                                <Show when={delegatedDecisionCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "delegated_decision" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700" : "border-amber-200/70 bg-white/85 text-amber-700"}`}
                                    onClick={() => setSelectedCompiledOrchestrationRole("delegated_decision")}
                                    title={focusOrchestrationRoleReviewMessage("delegated_decision")}
                                    aria-label={focusOrchestrationRoleReviewMessage("delegated_decision")}
                                  >
                                    {delegatedDecisionCount} delegated decision units
                                  </button>
                                </Show>
                                <Show when={workflowSummaryCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "workflow_summary" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-700" : "border-emerald-200/70 bg-white/85 text-emerald-700"}`}
                                    onClick={() => setSelectedCompiledOrchestrationRole("workflow_summary")}
                                    title={focusOrchestrationRoleReviewMessage("workflow_summary")}
                                    aria-label={focusOrchestrationRoleReviewMessage("workflow_summary")}
                                  >
                                    {workflowSummaryCount} workflow summary units
                                  </button>
                                </Show>
                              </div>
                              <Show when={orchestrationRoleFilter}>
                                <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                                  <p class="text-xs text-sky-900">{compiledManifestOrchestrationRole(
                                    orchestrationRoleFilter === "delegated_capability"
                                      ? "executor"
                                      : orchestrationRoleFilter === "delegated_decision"
                                        ? "approval_runtime"
                                        : orchestrationRoleFilter === "workflow_summary"
                                          ? "termination_runtime"
                                          : "plan",
                                    orchestrationRoleFilter === "delegated_capability" ? "capability" : null,
                                  ).description}</p>
                                  <button
                                    type="button"
                                    class="rounded-full border border-sky-200/80 bg-white/85 px-3 py-1 text-xs font-medium text-sky-800 transition hover:bg-white"
                                    onClick={() => setSelectedCompiledOrchestrationRole(null)}
                                    title={clearOrchestrationRoleFocusMessage()}
                                    aria-label={clearOrchestrationRoleFocusMessage()}
                                  >
                                    Clear orchestration focus
                                  </button>
                                </div>
                              </Show>
                              <Show when={orchestrationRoleFilter}>
                                <div class="mt-3 rounded-2xl border border-sky-200/70 bg-white/85 p-3">
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Role AFP readiness</p>
                                  <p class="mt-1 text-xs text-sky-900">This role slice now shows how much of the selected supervisor or delegated unit type is already AFP-ready versus still contract-work-heavy.</p>
                                  <div class="mt-3 flex flex-wrap gap-2">
                                    <Show when={selectedRoleReadyManifestCount > 0}>
                                      <button
                                        type="button"
                                        class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${afpReadinessFocus === "ready_manifests" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-800" : "border-emerald-200/70 bg-emerald-50/85 text-emerald-800"}`}
                                        onClick={() => setSelectedCompiledAfpReadinessFocus("ready_manifests")}
                                        title={afpReadinessFocusTitle("ready_manifests")}
                                        aria-label={afpReadinessFocusTitle("ready_manifests")}
                                      >
                                        {selectedRoleReadyManifestCount} AFP-ready units
                                      </button>
                                    </Show>
                                    <Show when={selectedRoleContractWorkCount > 0}>
                                      <button
                                        type="button"
                                        class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${afpReadinessFocus === "needs_contract_work" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-800" : "border-amber-200/70 bg-amber-50/85 text-amber-800"}`}
                                        onClick={() => setSelectedCompiledAfpReadinessFocus("needs_contract_work")}
                                        title={afpReadinessFocusTitle("needs_contract_work")}
                                        aria-label={afpReadinessFocusTitle("needs_contract_work")}
                                      >
                                        {selectedRoleContractWorkCount} units still need contract work
                                      </button>
                                    </Show>
                                    <Show when={selectedRoleReadyHandoffCount > 0}>
                                      <button
                                        type="button"
                                        class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${afpReadinessFocus === "ready_handoffs" ? "border-cyan-300 bg-white ring-2 ring-cyan-300/70 text-cyan-800" : "border-cyan-200/70 bg-cyan-50/85 text-cyan-800"}`}
                                        onClick={() => setSelectedCompiledAfpReadinessFocus("ready_handoffs")}
                                        title={afpReadinessFocusTitle("ready_handoffs")}
                                        aria-label={afpReadinessFocusTitle("ready_handoffs")}
                                      >
                                        {selectedRoleReadyHandoffCount} AFP-ready handoffs
                                      </button>
                                    </Show>
                                  </div>
                                  <Show when={afpReadinessFocus}>
                                    <p class="mt-2 text-xs text-sky-900">{afpReadinessFocusSummary(afpReadinessFocus!)}</p>
                                  </Show>
                                </div>
                              </Show>
                            </div>
                          </Show>
                          <Show when={primaryCompiledReviewDriver}>
                            {(driver) => (
                              <div class="mt-3">
                                <button
                                  type="button"
                                  class={`w-full rounded-2xl border p-3 text-left transition ${driver().available ? "hover:bg-white" : "cursor-not-allowed opacity-80"} ${driver().tone}`}
                                  onClick={() => driver().available && driver().onClick()}
                                  title={driver().title}
                                  aria-label={driver().title}
                                  disabled={!driver().available}
                                >
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em]">{driver().label}</p>
                                  <p class="mt-1 text-sm">{driver().detail}</p>
                                </button>
                                <Show when={!driver().available}>
                                  <p class="mt-2 text-[11px] leading-relaxed text-amber-700/85">
                                    {afpRouteFocus || routeLinkageFilter
                                      ? unavailableReviewTargetMessage("compiled_route")
                                      : afpReadinessFocus === "ready_handoffs"
                                      ? unavailableReviewTargetMessage("compiled_route")
                                      : manifestLinkageFilter || afpReadinessFocus
                                        ? unavailableReviewTargetMessage("compiled_manifest")
                                        : unavailableReviewTargetMessage("compiled_target")}
                                  </p>
                                </Show>
                              </div>
                            )}
                          </Show>
                          <Show when={afpFilter}>
                            <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-white/80 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">AFP manifest focus</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                  onClick={() => setSelectedCompiledAfpFilter(null)}
                                  title={clearReviewFocusMessage("compiled_manifest")}
                                  aria-label={clearReviewFocusMessage("compiled_manifest")}
                                >
                                  Clear manifest focus
                                </button>
                              </div>
                              <p class="mt-1 text-sm text-emerald-900">
                                The compiled roster is currently focused on {(afpFilter ?? "all").replaceAll("_", " ")} runtime manifests.
                              </p>
                            </div>
                          </Show>
                          <Show when={manifestEntries.length > 0}>
                            <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">AFP contract alignment</p>
                              <p class="mt-1 text-xs text-emerald-800">Compiled manifests marked as capability or decision boundaries are closest to the preferred AFP node message families; plan, context, reflection, and merge runtimes still act as orchestration scaffolds.</p>
                            </div>
                          </Show>
                          <Show when={filteredManifestEntries.length > 0 || afpFilteredCompiledEdges.length > 0}>
                            <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Review health</p>
                                <Show when={manifestLinkageFilter || routeLinkageFilter}>
                                  <button
                                    type="button"
                                    class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                    onClick={() => {
                                      setSelectedCompiledManifestLinkageFilter(null);
                                      setSelectedCompiledRouteLinkageFilter(null);
                                    }}
                                    title={clearReviewFocusMessage("review_health")}
                                    aria-label={clearReviewFocusMessage("review_health")}
                                  >
                                    Clear health focus
                                  </button>
                                </Show>
                              </div>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <Show when={filteredManifestEntries.length > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${manifestLinkageFilter === "linked" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-800" : "border-emerald-200/70 bg-white/80 text-emerald-800"}`}
                                    onClick={() => setSelectedCompiledManifestLinkageFilter("linked")}
                                    title="Focus the manifest roster on compiled manifests that already open editable node review targets"
                                    aria-label="Focus the manifest roster on compiled manifests that already open editable node review targets"
                                  >
                                    {linkedManifestCount} node-review-ready manifests
                                  </button>
                                </Show>
                                <Show when={manifestOnlyFocusCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${manifestLinkageFilter === "inspector_only" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}
                                    onClick={() => setSelectedCompiledManifestLinkageFilter("inspector_only")}
                                    title="Focus the manifest roster on compiled manifests that currently stay in inspector-only review context"
                                    aria-label="Focus the manifest roster on compiled manifests that currently stay in inspector-only review context"
                                  >
                                    {manifestOnlyFocusCount} inspector-only manifests
                                  </button>
                                </Show>
                                <Show when={afpFilteredCompiledEdges.length > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${routeLinkageFilter === "linked" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-800" : "border-emerald-200/70 bg-white/80 text-emerald-800"}`}
                                    onClick={() => setSelectedCompiledRouteLinkageFilter("linked")}
                                    title="Focus the compiled route topology on routes that already resolve to concrete graph edges"
                                    aria-label="Focus the compiled route topology on routes that already resolve to concrete graph edges"
                                  >
                                    {linkedCompiledRouteCount} branch-review-ready routes
                                  </button>
                                </Show>
                                <Show when={manifestOnlyCompiledRouteCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${routeLinkageFilter === "manifest_only" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}
                                    onClick={() => setSelectedCompiledRouteLinkageFilter("manifest_only")}
                                    title="Focus the compiled route topology on routes that currently stay in inspector-only review context"
                                    aria-label="Focus the compiled route topology on routes that currently stay in inspector-only review context"
                                  >
                                    {manifestOnlyCompiledRouteCount} inspector-only routes
                                  </button>
                                </Show>
                              </div>
                              <p class="mt-2 text-xs text-emerald-800">
                                This summary shows how much of the current compiled review can open concrete node and branch review targets versus staying inside inspector-only review context.
                              </p>
                            </div>
                          </Show>
                          <Show when={afpFilter && afpRouteFocus}>
                            <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-white/80 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">AFP route topology focus</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                  onClick={() => setSelectedCompiledAfpRouteFocus(null)}
                                  title={clearReviewFocusMessage("compiled_route")}
                                  aria-label={clearReviewFocusMessage("compiled_route")}
                                >
                                  Clear route focus
                                </button>
                              </div>
                              <p class="mt-1 text-sm text-emerald-900">
                                The compiled route topology is focused on {afpRouteFocus === "full" ? "fully matching" : "partially matching"} routes for the current {(afpFilter ?? "all").replaceAll("_", " ")} AFP slice.
                              </p>
                            </div>
                          </Show>
                          <Show when={selectedInspectorSection() === "compiled_runtime_contract" && (focusedManifestEntry || focusedCompiledRoute)}>
                            <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-white/80 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Current contract focus</p>
                                <button
                                  type="button"
                                  class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                  onClick={() => {
                                    setSelectedInspectorFocusSource(null);
                                    setSelectedInspectorFocusTarget(null);
                                  }}
                                  title={clearReviewFocusMessage("contract_focus")}
                                  aria-label={clearReviewFocusMessage("contract_focus")}
                                >
                                  Clear contract focus
                                </button>
                              </div>
                              <Show when={focusedManifestEntry}>
                                <p class="mt-1 text-sm text-emerald-900">
                                  Contract focus is currently anchored to manifest {focusedManifestEntry?.label}
                                  <Show when={focusedManifestEntry?.manifestNodeId}>
                                    <span class="ml-1 text-xs uppercase tracking-[0.12em] text-emerald-700">{focusedManifestEntry?.manifestNodeId}</span>
                                  </Show>
                                  {" "}as the source of the current compiled runtime contract view.
                                </p>
                              </Show>
                              <Show when={!focusedManifestEntry && focusedCompiledRoute}>
                                <p class="mt-1 text-sm text-emerald-900">
                                  Contract focus is currently anchored to route {focusedCompiledRoute?.fromLabel} {"->"} {focusedCompiledRoute?.toLabel}
                                  <Show when={focusedCompiledRoute?.routeLabel}>
                                    <span class="ml-1 text-xs uppercase tracking-[0.12em] text-emerald-700">{focusedCompiledRoute?.routeLabel}</span>
                                  </Show>
                                  {" "}as the source of the current compiled runtime contract view.
                                </p>
                              </Show>
                            </div>
                          </Show>
                          <Show when={entryManifestLabels.length > 0}>
                            <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Entry runtime units</p>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <For each={entryManifestLabels}>
                                  {(label) => (
                                    <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                      {label}
                                    </span>
                                  )}
                                </For>
                              </div>
                            </div>
                          </Show>
                          <Show when={manifestEntries.length > 0}>
                            <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Runtime manifest roster</p>
                                <span class="text-[10px] uppercase tracking-[0.14em] text-emerald-700/80">{manifestLinkageFilter === "linked" ? "node-review-ready manifest focus" : manifestLinkageFilter === "inspector_only" ? "inspector-only manifest focus" : afpReadinessFocus === "ready_manifests" ? "AFP-ready manifest review" : afpReadinessFocus === "needs_contract_work" ? "AFP contract-work manifest review" : afpReadinessFocus === "ready_handoffs" ? "AFP-ready handoff manifest review" : orchestrationRoleFilter ? "orchestration-role-focused manifest review" : afpGapFilter ? "AFP-gap-focused manifest review" : afpFilter ? "AFP-focused manifest review" : "choose a manifest to open its review target"}</span>
                              </div>
                              <Show when={manifestLinkageFilter || afpGapFilter || orchestrationRoleFilter || afpReadinessFocus}>
                                <p class="mt-2 text-xs text-emerald-700/80">
                                  {afpReadinessFocus
                                    ? afpReadinessFocusSummary(afpReadinessFocus)
                                    : manifestLinkageFilter === "linked"
                                    ? "Showing only compiled manifests that already open editable node review targets."
                                    : manifestLinkageFilter === "inspector_only"
                                      ? "Showing only compiled manifests that remain in inspector-only review context until their node review targets are restored."
                                      : orchestrationRoleFilter
                                        ? compiledManifestOrchestrationRole(
                                          orchestrationRoleFilter === "delegated_capability"
                                            ? "executor"
                                            : orchestrationRoleFilter === "delegated_decision"
                                              ? "approval_runtime"
                                              : orchestrationRoleFilter === "workflow_summary"
                                                ? "termination_runtime"
                                                : "plan",
                                          orchestrationRoleFilter === "delegated_capability" ? "capability" : null,
                                        ).description
                                      : compiledAfpGapDescription(afpGapFilter!)}
                                </p>
                              </Show>
                              <div class="mt-2 space-y-2">
                                <For each={filteredManifestEntries.slice(0, 6)}>
                                  {(entry) => (
                                    <div class={`w-full rounded-2xl border px-3 py-2 ${selectedInspectorFocusSource() === "compiled_manifest" && selectedInspectorFocusTarget() === entry.manifestNodeId ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70" : "border-emerald-200/70 bg-emerald-50/75"}`}>
                                      <button
                                        type="button"
                                        class={`w-full text-left transition ${entry.nodeId ? "hover:bg-white rounded-xl" : "cursor-not-allowed opacity-80"}`}
                                        disabled={!entry.nodeId}
                                        onClick={() => {
                                          if (entry.nodeId) {
                                            setSelectedNodeId(entry.nodeId);
                                            setSelectedInspectorSection("compiled_runtime_contract");
                                            setSelectedInspectorFocusSource("compiled_manifest");
                                            setSelectedInspectorFocusTarget(entry.manifestNodeId ?? entry.nodeId);
                                          }
                                        }}
                                        title={entry.nodeId ? availableReviewTargetMessage("compiled_manifest") : unavailableReviewTargetMessage("compiled_manifest")}
                                        aria-label={entry.nodeId ? availableReviewTargetMessage("compiled_manifest") : unavailableReviewTargetMessage("compiled_manifest")}
                                      >
                                        <div class="flex flex-wrap items-center gap-2">
                                          <p class="text-sm font-semibold text-emerald-900">{entry.label}</p>
                                          <Show when={entry.manifestNodeId}>
                                            <span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                              {entry.manifestNodeId}
                                            </span>
                                          </Show>
                                          <Show when={entry.runtimeKind}>
                                            <span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                              {entry.runtimeKind}
                                            </span>
                                          </Show>
                                          <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${entry.afpContract.chipClass}`}>
                                            {entry.afpContract.label}
                                          </span>
                                          <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${entry.orchestrationRole.chipClass}`}>
                                            {entry.orchestrationRole.label}
                                          </span>
                                          <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${entry.nodeId ? "border-emerald-200/70 bg-white/80 text-emerald-800" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}>
                                            {entry.nodeId ? compiledLinkageStatusLabel("manifest_linked") : compiledLinkageStatusLabel("manifest_only")}
                                          </span>
                                        </div>
                                        <div class="mt-2 flex flex-wrap gap-2">
                                          <Show when={entry.capabilityId}>
                                            <span class="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                              capability {entry.capabilityId}
                                            </span>
                                          </Show>
                                          <Show when={entry.memoryScope}>
                                            <span class="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                              memory {entry.memoryScope?.replaceAll("_", " ")}
                                            </span>
                                          </Show>
                                          <Show when={entry.traceSource}>
                                            <span class="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                              trace {entry.traceSource?.replaceAll("_", " ")}
                                            </span>
                                          </Show>
                                          <span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                            AFP {entry.afpContract.primarySubtype}
                                          </span>
                                          <Show when={entry.afpContract.secondarySubtype}>
                                            <span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                              AFP {entry.afpContract.secondarySubtype}
                                            </span>
                                          </Show>
                                        </div>
                                      </button>
                                      <Show when={!entry.nodeId}>
                                        <p class="mt-2 text-[11px] leading-relaxed text-amber-700/85">
                                          {recoveryReviewTargetMessage("compiled_manifest")}
                                        </p>
                                      </Show>
                                    </div>
                                  )}
                                </For>
                                <Show when={filteredManifestEntries.length === 0}>
                                  <p class="text-xs text-emerald-700/80">{compiledManifestEmptyStateMessage({
                                    afpReadinessFocus,
                                    orchestrationRoleFilter,
                                    afpGapFilter,
                                    afpFilter,
                                    manifestLinkageFilter,
                                  })}</p>
                                </Show>
                                <Show when={filteredManifestEntries.length > 6}>
                                  <p class="text-xs text-emerald-700/80">{filteredManifestEntries.length - 6} more compiled runtime manifests match this snapshot view.</p>
                                </Show>
                              </div>
                            </div>
                          </Show>
                          <Show when={compiledEdges.length > 0}>
                            <div class="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Compiled route topology</p>
                                <span class="text-[10px] uppercase tracking-[0.14em] text-emerald-700/80">{routeLinkageFilter ? "linkage-focused route review" : afpReadinessFocus === "ready_handoffs" ? "AFP-ready handoff review" : afpReadinessFocus ? "AFP readiness route review" : orchestrationRoleFilter ? "orchestration-role-focused compiled routes" : afpRouteFocus ? "AFP-route-focused compiled edges" : "compiled route review and branch labels"}</span>
                              </div>
                              <Show when={supervisorOrchestrationRouteCount > 0 || delegatedCapabilityRouteCount > 0 || delegatedDecisionRouteCount > 0 || workflowSummaryRouteCount > 0}>
                                <div class="mt-2 flex flex-wrap gap-2">
                                  <Show when={supervisorOrchestrationRouteCount > 0}>
                                    <button
                                      type="button"
                                      class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "supervisor_orchestration" ? "border-slate-300 bg-white ring-2 ring-slate-300/70 text-slate-700" : "border-slate-200/70 bg-white/85 text-slate-700"}`}
                                      onClick={() => setSelectedCompiledOrchestrationRole("supervisor_orchestration")}
                                      title={focusOrchestrationRouteReviewMessage("supervisor_orchestration")}
                                      aria-label={focusOrchestrationRouteReviewMessage("supervisor_orchestration")}
                                    >
                                      {supervisorOrchestrationRouteCount} supervisor-owned routes
                                    </button>
                                  </Show>
                                  <Show when={delegatedCapabilityRouteCount > 0}>
                                    <button
                                      type="button"
                                      class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "delegated_capability" ? "border-sky-300 bg-white ring-2 ring-sky-300/70 text-sky-700" : "border-sky-200/70 bg-white/85 text-sky-700"}`}
                                      onClick={() => setSelectedCompiledOrchestrationRole("delegated_capability")}
                                      title={focusOrchestrationRouteReviewMessage("delegated_capability")}
                                      aria-label={focusOrchestrationRouteReviewMessage("delegated_capability")}
                                    >
                                      {delegatedCapabilityRouteCount} delegated capability routes
                                    </button>
                                  </Show>
                                  <Show when={delegatedDecisionRouteCount > 0}>
                                    <button
                                      type="button"
                                      class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "delegated_decision" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700" : "border-amber-200/70 bg-white/85 text-amber-700"}`}
                                      onClick={() => setSelectedCompiledOrchestrationRole("delegated_decision")}
                                      title={focusOrchestrationRouteReviewMessage("delegated_decision")}
                                      aria-label={focusOrchestrationRouteReviewMessage("delegated_decision")}
                                    >
                                      {delegatedDecisionRouteCount} delegated decision routes
                                    </button>
                                  </Show>
                                  <Show when={workflowSummaryRouteCount > 0}>
                                    <button
                                      type="button"
                                      class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${orchestrationRoleFilter === "workflow_summary" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-700" : "border-emerald-200/70 bg-white/85 text-emerald-700"}`}
                                      onClick={() => setSelectedCompiledOrchestrationRole("workflow_summary")}
                                      title={focusOrchestrationRouteReviewMessage("workflow_summary")}
                                      aria-label={focusOrchestrationRouteReviewMessage("workflow_summary")}
                                    >
                                      {workflowSummaryRouteCount} workflow summary routes
                                    </button>
                                  </Show>
                                </div>
                              </Show>
                              <Show when={orchestrationRoleFilter}>
                                <p class="mt-2 text-xs text-emerald-700/80">
                                  Showing compiled routes that touch {compiledManifestOrchestrationRole(
                                    orchestrationRoleFilter === "delegated_capability"
                                      ? "executor"
                                      : orchestrationRoleFilter === "delegated_decision"
                                        ? "approval_runtime"
                                        : orchestrationRoleFilter === "workflow_summary"
                                          ? "termination_runtime"
                                          : "plan",
                                    orchestrationRoleFilter === "delegated_capability" ? "capability" : null,
                                  ).label}.
                                </p>
                              </Show>
                              <Show when={orchestrationRoleFilter && routeLinkageFilter}>
                                <div class="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    class="rounded-full border border-cyan-200/70 bg-cyan-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800 transition hover:bg-white"
                                    onClick={() => setSelectedCompiledRouteLinkageFilter(null)}
                                    title={broadenOrchestrationRoleRouteReviewMessage()}
                                    aria-label={broadenOrchestrationRoleRouteReviewMessage()}
                                  >
                                    {compiledManifestOrchestrationRole(
                                      orchestrationRoleFilter === "delegated_capability"
                                        ? "executor"
                                        : orchestrationRoleFilter === "delegated_decision"
                                          ? "approval_runtime"
                                          : orchestrationRoleFilter === "workflow_summary"
                                            ? "termination_runtime"
                                        : "plan",
                                      orchestrationRoleFilter === "delegated_capability" ? "capability" : null,
                                    ).label}
                                  </button>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${routeLinkageFilter === "linked" ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-800" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}
                                    onClick={() => setSelectedCompiledRouteLinkageFilter(null)}
                                    title={clearOverlappingRouteNarrowingMessage(routeLinkageFilter === "linked" ? "linked" : "manifest_only")}
                                    aria-label={clearOverlappingRouteNarrowingMessage(routeLinkageFilter === "linked" ? "linked" : "manifest_only")}
                                  >
                                    {routeLinkageFilter === "linked" ? "branch-review-ready route focus" : "inspector-only route focus"}
                                  </button>
                                </div>
                              </Show>
                              <Show when={orchestrationRoleFilter && routeLinkageFilter}>
                                <p class="mt-2 text-xs text-emerald-700/80">
                                  {overlappingOrchestrationRouteSummaryMessage(routeLinkageFilter === "linked" ? "linked" : "manifest_only")}
                                </p>
                              </Show>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <Show when={linkedCompiledRouteCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${routeLinkageFilter === "linked" ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-800" : "border-emerald-200/70 bg-white/80 text-emerald-800"}`}
                                    onClick={() => setSelectedCompiledRouteLinkageFilter("linked")}
                                    title={focusRouteLinkageReviewMessage("linked")}
                                    aria-label={focusRouteLinkageReviewMessage("linked")}
                                  >
                                    {linkedCompiledRouteCount} branch-review-ready routes
                                  </button>
                                </Show>
                                <Show when={manifestOnlyCompiledRouteCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${routeLinkageFilter === "manifest_only" ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}
                                    onClick={() => setSelectedCompiledRouteLinkageFilter("manifest_only")}
                                    title={focusRouteLinkageReviewMessage("manifest_only")}
                                    aria-label={focusRouteLinkageReviewMessage("manifest_only")}
                                  >
                                    {manifestOnlyCompiledRouteCount} inspector-only routes
                                  </button>
                                </Show>
                                <Show when={routeLinkageFilter}>
                                  <button
                                    type="button"
                                    class="rounded-full border border-emerald-200/80 bg-emerald-100/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70"
                                    onClick={() => setSelectedCompiledRouteLinkageFilter(null)}
                                    title={clearRouteReviewFilterMessage()}
                                    aria-label={clearRouteReviewFilterMessage()}
                                  >
                                    {resetRouteReviewStatesLabel()}
                                  </button>
                                </Show>
                              </div>
                              <div class="mt-2 space-y-2">
                                <For each={filteredCompiledEdges.slice(0, 8)}>
                                  {(edge) => {
                                    const edgeKey = `${edge.fromManifestNodeId ?? "unknown"}:${edge.toManifestNodeId ?? "unknown"}:${edge.routeLabel ?? "default"}`;
                                    const edgeIsReadyHandoff = readyHandoffEdgeKeys.has(edgeKey);
                                    const sourceReady = Boolean(edge.fromManifestNodeId && readyManifestEntryIds.has(edge.fromManifestNodeId));
                                    const targetReady = Boolean(edge.toManifestNodeId && readyManifestEntryIds.has(edge.toManifestNodeId));
                                    return <div class={`w-full rounded-2xl border px-3 py-2 ${selectedInspectorFocusSource() === "compiled_route" && selectedInspectorFocusTarget() === edgeKey ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70" : afpRouteFocus ? "border-emerald-200/80 bg-white/90" : "border-emerald-200/70 bg-emerald-50/75"}`}>
                                      <button
                                        type="button"
                                        class={`w-full text-left transition ${edge.sourceNodeId ? "hover:bg-white rounded-xl" : "cursor-not-allowed opacity-80"}`}
                                        disabled={!edge.sourceNodeId}
                                        onClick={() => {
                                          if (edge.sourceNodeId) {
                                            setSelectedNodeId(edge.sourceNodeId);
                                            if (edge.graphEdgeId) setSelectedRunEdgeId(edge.graphEdgeId);
                                            setSelectedInspectorSection("compiled_runtime_contract");
                                            setSelectedInspectorFocusSource("compiled_route");
                                            setSelectedInspectorFocusTarget(edgeKey);
                                          }
                                        }}
                                        title={edge.sourceNodeId ? availableReviewTargetMessage("compiled_route") : unavailableReviewTargetMessage("compiled_route")}
                                        aria-label={edge.sourceNodeId ? availableReviewTargetMessage("compiled_route") : unavailableReviewTargetMessage("compiled_route")}
                                      >
                                        <div class="flex flex-wrap items-center gap-2">
                                          <p class="text-sm font-semibold text-emerald-900">{edge.fromLabel} {"->"} {edge.toLabel}</p>
                                          <Show when={edge.routeLabel}>
                                            <span class="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                              {edge.routeLabel}
                                            </span>
                                          </Show>
                                        </div>
                                        <div class="mt-2 flex flex-wrap gap-2">
                                          <Show when={edge.fromManifestNodeId}>
                                            <span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                              from {edge.fromManifestNodeId}
                                            </span>
                                          </Show>
                                          <Show when={edge.sourceOrchestrationRole}>
                                            <button
                                              type="button"
                                              class={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition hover:bg-white ${edge.sourceOrchestrationRole?.chipClass}`}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setSelectedCompiledOrchestrationRole(edge.sourceOrchestrationRole?.role ?? null);
                                              }}
                                              title={focusOrchestrationRoleReviewMessage(edge.sourceOrchestrationRole?.role ?? "supervisor_orchestration")}
                                              aria-label={focusOrchestrationRoleReviewMessage(edge.sourceOrchestrationRole?.role ?? "supervisor_orchestration")}
                                            >
                                              {edge.sourceOrchestrationRole?.label}
                                            </button>
                                          </Show>
                                          <Show when={edge.toManifestNodeId}>
                                            <span class="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                                              to {edge.toManifestNodeId}
                                            </span>
                                          </Show>
                                          <Show when={edge.targetOrchestrationRole}>
                                            <button
                                              type="button"
                                              class={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition hover:bg-white ${edge.targetOrchestrationRole?.chipClass}`}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setSelectedCompiledOrchestrationRole(edge.targetOrchestrationRole?.role ?? null);
                                              }}
                                              title={focusOrchestrationRoleReviewMessage(edge.targetOrchestrationRole?.role ?? "supervisor_orchestration")}
                                              aria-label={focusOrchestrationRoleReviewMessage(edge.targetOrchestrationRole?.role ?? "supervisor_orchestration")}
                                            >
                                              {edge.targetOrchestrationRole?.label}
                                            </button>
                                          </Show>
                                          <span class={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${edge.graphEdgeId ? "border-emerald-200/70 bg-white/80 text-emerald-800" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}>
                                            {edge.graphEdgeId ? compiledLinkageStatusLabel("route_linked") : compiledLinkageStatusLabel("route_manifest_only")}
                                          </span>
                                          <span class={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${edge.sourceNodeId ? "border-emerald-200/70 bg-white/80 text-emerald-800" : "border-amber-200/70 bg-amber-50/85 text-amber-700"}`}>
                                            {edge.sourceNodeId ? compiledLinkageStatusLabel("route_source_linked") : compiledLinkageStatusLabel("route_source_unavailable")}
                                          </span>
                                          <span
                                            role="button"
                                            tabindex={0}
                                            class={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition hover:bg-white ${edgeIsReadyHandoff ? "border-cyan-200/70 bg-cyan-50/85 text-cyan-800" : sourceReady || targetReady ? "border-emerald-200/70 bg-white/80 text-emerald-800" : "border-amber-200/70 bg-amber-50/85 text-amber-800"}`}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedCompiledAfpReadinessFocus(
                                                edgeIsReadyHandoff
                                                  ? "ready_handoffs"
                                                  : sourceReady || targetReady
                                                    ? "ready_manifests"
                                                    : "needs_contract_work",
                                              );
                                            }}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setSelectedCompiledAfpReadinessFocus(
                                                  edgeIsReadyHandoff
                                                    ? "ready_handoffs"
                                                    : sourceReady || targetReady
                                                      ? "ready_manifests"
                                                      : "needs_contract_work",
                                                );
                                              }
                                            }}
                                            title={edgeIsReadyHandoff
                                              ? afpReadinessFocusTitle("ready_handoffs")
                                              : sourceReady || targetReady
                                                ? afpReadinessFocusTitle("ready_manifests")
                                                : afpReadinessFocusTitle("needs_contract_work")}
                                            aria-label={edgeIsReadyHandoff
                                              ? afpReadinessFocusTitle("ready_handoffs")
                                              : sourceReady || targetReady
                                                ? afpReadinessFocusTitle("ready_manifests")
                                                : afpReadinessFocusTitle("needs_contract_work")}
                                          >
                                            {edgeIsReadyHandoff
                                              ? "AFP-ready handoff"
                                              : sourceReady || targetReady
                                                ? "Touches AFP-ready unit"
                                                : "Touches contract-work-heavy units"}
                                          </span>
                                        </div>
                                      </button>
                                      <Show when={!edge.sourceNodeId}>
                                        <p class="mt-2 text-[11px] leading-relaxed text-amber-700/85">
                                          {recoveryReviewTargetMessage("compiled_route")}
                                        </p>
                                      </Show>
                                      <Show when={edge.sourceNodeId && !edge.graphEdgeId}>
                                        <p class="mt-2 text-[11px] leading-relaxed text-amber-700/85">
                                          {recoveryReviewTargetMessage("branch_edge")}
                                        </p>
                                      </Show>
                                    </div>;
                                  }}
                                </For>
                                <Show when={filteredCompiledEdges.length === 0}>
                                  <p class="text-xs text-emerald-700/80">{compiledRouteEmptyStateMessage({
                                    afpReadinessFocus,
                                    orchestrationRoleFilter,
                                    routeLinkageFilter,
                                    afpRouteFocus,
                                  })}</p>
                                </Show>
                                <Show when={filteredCompiledEdges.length > 8}>
                                  <p class="text-xs text-emerald-700/80">{filteredCompiledEdges.length - 8} more compiled routes match this snapshot view.</p>
                                </Show>
                              </div>
                            </div>
                          </Show>
                        </div>
                      );
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
                    <div class="mt-3 rounded-2xl border border-sky-200/60 bg-sky-50/50 p-3">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Next deployment overrides</p>
                      <p class="mt-1 text-xs text-sky-700/80">These settings are applied to connector bindings when you deploy this workflow into the current environment.</p>
                      <p class="mt-2 text-xs text-sky-800">
                        {pendingDeploymentChangeSummary().changedNodeCount > 0
                          ? `${pendingDeploymentChangeSummary().changedNodeCount} of ${pendingDeploymentChangeSummary().pendingNodeCount} tool nodes would change effective deployment policy.`
                          : pendingDeploymentChangeSummary().pendingNodeCount > 0
                            ? "Current draft matches the effective deployed policy for all tool nodes."
                            : "Add tool nodes to make deployment connector policy relevant here."}
                      </p>
                      <Show when={deployPreviewOpen()}>
                        <div class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-3">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Deploy preview</p>
                            <span class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                              {deployPreviewDiff().length} node policy changes
                            </span>
                            <Show when={activeDeployment()}>
                              {(deployment) => (
                                <span class="rounded-full border border-white/50 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                                  vs {deployment().deployment_id}
                                </span>
                              )}
                            </Show>
                          </div>
                          <Show
                            when={pendingDeploymentChangeSummary().pendingNodeCount > 0}
                            fallback={<p class="mt-2 text-sm text-amber-900">This workflow has no tool nodes yet, so deploy would not apply connector policy settings.</p>}
                          >
                            <p class="mt-1 text-sm text-amber-900">
                              Deploying now would create a new {graph()?.environment === "prod" ? "prod" : "dev"} snapshot from the current override draft.
                            </p>
                            <Show
                              when={deployPreviewDiff().length > 0}
                              fallback={<p class="mt-2 text-xs text-amber-700/80">The current draft matches the effective connector policy of the active deployment.</p>}
                            >
                              <div class="mt-3 space-y-2">
                                <For each={deployPreviewDiff().slice(0, 4)}>
                                  {(diffEntry) => (
                                    <div class="rounded-2xl border border-amber-200/70 bg-white/75 px-3 py-2">
                                      <p class="text-sm font-semibold text-amber-900">{diffEntry.label}</p>
                                      <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-700">
                                        {diffEntry.changes.map((change) => `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`).join(" · ")}
                                      </p>
                                    </div>
                                  )}
                                </For>
                                <Show when={deployPreviewDiff().length > 4}>
                                  <p class="text-xs text-amber-700/80">{deployPreviewDiff().length - 4} more node policy changes would be included in this deployment.</p>
                                </Show>
                              </div>
                            </Show>
                            <div class="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                class="rounded-full border border-sky-300/70 bg-sky-500 px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleWorkflowAction("deploy", {
                                  environment: (graph()?.environment === "prod" ? "prod" : "dev"),
                                  connector_overrides: deploymentOverridePayload(),
                                })}
                                disabled={busyAction() !== null || !workflow.latest_ir}
                              >
                                Confirm deploy
                              </button>
                              <button
                                type="button"
                                class="rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => setDeployPreviewOpen(false)}
                                disabled={busyAction() !== null}
                              >
                                Cancel
                              </button>
                            </div>
                          </Show>
                        </div>
                      </Show>
                      <div class="mt-3 grid gap-3 md:grid-cols-2">
                        <label class="space-y-1 text-xs text-on-surface-variant">
                          <span class="font-semibold uppercase tracking-[0.14em]">Delivery tier</span>
                          <select
                            value={deployOverrideDraft().delivery_tier}
                            onChange={(event) => setDeployOverrideDraft((current) => ({ ...current, delivery_tier: event.currentTarget.value }))}
                            disabled={busyAction() !== null}
                            class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="staging">staging</option>
                            <option value="preview">preview</option>
                            <option value="production">production</option>
                            <option value="high_assurance">high_assurance</option>
                            <option value="replay">replay</option>
                          </select>
                        </label>
                        <label class="space-y-1 text-xs text-on-surface-variant">
                          <span class="font-semibold uppercase tracking-[0.14em]">Auth mode</span>
                          <select
                            value={deployOverrideDraft().auth_mode}
                            onChange={(event) => setDeployOverrideDraft((current) => ({ ...current, auth_mode: event.currentTarget.value }))}
                            disabled={busyAction() !== null}
                            class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="sandbox_credentials">sandbox_credentials</option>
                            <option value="tenant_credentials">tenant_credentials</option>
                            <option value="replay_credentials">replay_credentials</option>
                            <option value="autonomous">autonomous</option>
                          </select>
                        </label>
                        <label class="space-y-1 text-xs text-on-surface-variant">
                          <span class="font-semibold uppercase tracking-[0.14em]">Side effects</span>
                          <select
                            value={deployOverrideDraft().side_effects}
                            onChange={(event) => setDeployOverrideDraft((current) => ({ ...current, side_effects: event.currentTarget.value }))}
                            disabled={busyAction() !== null}
                            class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="preview_only">preview_only</option>
                            <option value="suppressed">suppressed</option>
                            <option value="live_allowed">live_allowed</option>
                            <option value="executed">executed</option>
                          </select>
                        </label>
                        <label class="space-y-1 text-xs text-on-surface-variant">
                          <span class="font-semibold uppercase tracking-[0.14em]">Provider route</span>
                          <select
                            value={deployOverrideDraft().provider_route}
                            onChange={(event) => setDeployOverrideDraft((current) => ({ ...current, provider_route: event.currentTarget.value }))}
                            disabled={busyAction() !== null}
                            class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="sandbox">sandbox</option>
                            <option value="primary">primary</option>
                            <option value="dedicated">dedicated</option>
                            <option value="replay">replay</option>
                            <option value="simulated">simulated</option>
                          </select>
                        </label>
                      </div>
                      <Show when={connectorOverrideTargets().families.length > 0}>
                        <div class="mt-4">
                          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Family-specific overrides</p>
                          <div class="mt-2 space-y-3">
                            <For each={connectorOverrideTargets().families}>
                              {(family) => {
                                const current = () => deployFamilyOverrides()[family] ?? {};
                                return (
                                  <div class="rounded-2xl border border-white/40 bg-white/70 p-3">
                                    <p class="text-sm font-semibold text-on-surface">{family.replaceAll("_", " ")}</p>
                                    <p class="mt-1 text-xs text-on-surface-variant">Override this connector family only. Leave fields on `inherit` to keep deployment defaults.</p>
                                    <div class="mt-3 grid gap-3 md:grid-cols-2">
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Delivery tier</span>
                                        <select
                                          value={current().delivery_tier ?? ""}
                                          onChange={(event) => setDeployFamilyOverrides((overrides) => ({
                                            ...overrides,
                                            [family]: { ...overrides[family], delivery_tier: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="staging">staging</option>
                                          <option value="preview">preview</option>
                                          <option value="production">production</option>
                                          <option value="high_assurance">high_assurance</option>
                                          <option value="replay">replay</option>
                                        </select>
                                      </label>
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Auth mode</span>
                                        <select
                                          value={current().auth_mode ?? ""}
                                          onChange={(event) => setDeployFamilyOverrides((overrides) => ({
                                            ...overrides,
                                            [family]: { ...overrides[family], auth_mode: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="sandbox_credentials">sandbox_credentials</option>
                                          <option value="tenant_credentials">tenant_credentials</option>
                                          <option value="replay_credentials">replay_credentials</option>
                                          <option value="autonomous">autonomous</option>
                                        </select>
                                      </label>
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Side effects</span>
                                        <select
                                          value={current().side_effects ?? ""}
                                          onChange={(event) => setDeployFamilyOverrides((overrides) => ({
                                            ...overrides,
                                            [family]: { ...overrides[family], side_effects: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="preview_only">preview_only</option>
                                          <option value="suppressed">suppressed</option>
                                          <option value="live_allowed">live_allowed</option>
                                          <option value="executed">executed</option>
                                        </select>
                                      </label>
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Provider route</span>
                                        <select
                                          value={current().provider_route ?? ""}
                                          onChange={(event) => setDeployFamilyOverrides((overrides) => ({
                                            ...overrides,
                                            [family]: { ...overrides[family], provider_route: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="sandbox">sandbox</option>
                                          <option value="primary">primary</option>
                                          <option value="dedicated">dedicated</option>
                                          <option value="replay">replay</option>
                                          <option value="simulated">simulated</option>
                                        </select>
                                      </label>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      </Show>
                      <Show when={connectorOverrideTargets().nodes.length > 0}>
                        <div class="mt-4">
                          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Node-specific overrides</p>
                          <div class="mt-2 space-y-3">
                            <For each={connectorOverrideTargets().nodes}>
                              {(node) => {
                                const current = () => deployNodeOverrides()[node.id] ?? {};
                                return (
                                  <div class="rounded-2xl border border-white/40 bg-white/70 p-3">
                                    <p class="text-sm font-semibold text-on-surface">{node.label}</p>
                                    <p class="mt-1 text-xs text-on-surface-variant">{node.family.replaceAll("_", " ")} connector. Leave fields on `inherit` to keep family or deployment defaults.</p>
                                    <div class="mt-3 grid gap-3 md:grid-cols-2">
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Delivery tier</span>
                                        <select
                                          value={current().delivery_tier ?? ""}
                                          onChange={(event) => setDeployNodeOverrides((overrides) => ({
                                            ...overrides,
                                            [node.id]: { ...overrides[node.id], delivery_tier: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="staging">staging</option>
                                          <option value="preview">preview</option>
                                          <option value="production">production</option>
                                          <option value="high_assurance">high_assurance</option>
                                          <option value="replay">replay</option>
                                        </select>
                                      </label>
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Auth mode</span>
                                        <select
                                          value={current().auth_mode ?? ""}
                                          onChange={(event) => setDeployNodeOverrides((overrides) => ({
                                            ...overrides,
                                            [node.id]: { ...overrides[node.id], auth_mode: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="sandbox_credentials">sandbox_credentials</option>
                                          <option value="tenant_credentials">tenant_credentials</option>
                                          <option value="replay_credentials">replay_credentials</option>
                                          <option value="autonomous">autonomous</option>
                                        </select>
                                      </label>
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Side effects</span>
                                        <select
                                          value={current().side_effects ?? ""}
                                          onChange={(event) => setDeployNodeOverrides((overrides) => ({
                                            ...overrides,
                                            [node.id]: { ...overrides[node.id], side_effects: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="preview_only">preview_only</option>
                                          <option value="suppressed">suppressed</option>
                                          <option value="live_allowed">live_allowed</option>
                                          <option value="executed">executed</option>
                                        </select>
                                      </label>
                                      <label class="space-y-1 text-xs text-on-surface-variant">
                                        <span class="font-semibold uppercase tracking-[0.14em]">Provider route</span>
                                        <select
                                          value={current().provider_route ?? ""}
                                          onChange={(event) => setDeployNodeOverrides((overrides) => ({
                                            ...overrides,
                                            [node.id]: { ...overrides[node.id], provider_route: event.currentTarget.value || undefined },
                                          }))}
                                          disabled={busyAction() !== null}
                                          class="w-full rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <option value="">inherit</option>
                                          <option value="sandbox">sandbox</option>
                                          <option value="primary">primary</option>
                                          <option value="dedicated">dedicated</option>
                                          <option value="replay">replay</option>
                                          <option value="simulated">simulated</option>
                                        </select>
                                      </label>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      </Show>
                    </div>
                    <div class="mt-3 space-y-2">
                      <Show when={deploymentHistory().length > 0} fallback={<p class="text-sm text-on-surface-variant">No deployments yet. Compile and deploy this workflow to create a replayable history.</p>}>
                        <For each={deploymentHistory()}>
                          {(deployment, index) => {
                            const overrideSummary = deploymentOverrideSummary(deployment);
                            const storedChangeSummary = deploymentChangeSummary(deployment);
                            const priorSameEnvironment =
                              deployment.source_deployment_id
                                ? deploymentHistoryById().get(deployment.source_deployment_id) ?? null
                                : deploymentHistory()
                                  .slice(index() + 1)
                                  .find((entry) => entry.environment === deployment.environment) ?? null;
                            const policyDiff = deploymentPolicyDiff(priorSameEnvironment, deployment);
                            const changeEntries = Array.isArray(storedChangeSummary?.changed_nodes)
                              ? storedChangeSummary?.changed_nodes.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
                              : [];
                            const changeCount = typeof storedChangeSummary?.changed_node_count === "number"
                              ? storedChangeSummary.changed_node_count
                              : policyDiff.length;
                            const renderedChangeEntries = changeEntries.length > 0
                              ? changeEntries.slice(0, 3).map((entry) => ({
                                nodeId: typeof entry.node_id === "string" ? entry.node_id : "unknown",
                                node_id: typeof entry.node_id === "string" ? entry.node_id : "unknown",
                                previous: null,
                                current: null,
                                field_changes: Array.isArray(entry.field_changes)
                                  ? entry.field_changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object")
                                  : [],
                                changes: [] as NodeDeploymentPolicyChange[],
                                summary: Array.isArray(entry.field_changes)
                                  ? entry.field_changes
                                    .filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object")
                                    .map((change) => `${String(change.field).replaceAll("_", " ")} ${change.previous ?? "unset"} -> ${change.current ?? "unset"}`)
                                    .join(" · ")
                                  : "",
                              }))
                              : policyDiff.slice(0, 3).map((entry) => ({
                                nodeId: entry.nodeId,
                                node_id: entry.nodeId,
                                previous: entry.previous,
                                current: entry.current,
                                field_changes: [] as Record<string, unknown>[],
                                changes: entry.changes,
                                summary: entry.changes.map((change) => `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`).join(" · "),
                              }));
                            const activeEnvironmentDeployment = latestDeploymentForEnvironment(deploymentHistory(), deployment.environment);
                            const rollbackTargetSelected = rollbackPreviewDeploymentId() === deployment.deployment_id;
                            const rollbackWouldChange = deployment.deployment_id !== activeEnvironmentDeployment?.deployment_id;
                            const rollbackPreviewDiff = rollbackWouldChange && activeEnvironmentDeployment
                              ? deploymentPolicyDiff(activeEnvironmentDeployment, deployment)
                              : [];
                            const deploymentInvestigationRun = latestRunForDeployment(deployment.deployment_id);
                            const deploymentRecordSelected = selectedDeploymentRecordId() === deployment.deployment_id;
                            return (
                            <div class={`rounded-2xl border p-3 ${deploymentRecordSelected ? "border-sky-300/80 bg-sky-50/70 ring-2 ring-sky-300/40" : "border-white/35 bg-white/60"}`}>
                              <div class="flex items-start justify-between gap-3">
                                <div class="space-y-1">
                                  <p class="text-sm font-semibold text-on-surface">{deployment.deployment_id}</p>
                                  <p class="text-xs uppercase tracking-[0.16em] text-on-surface-variant">{deployment.environment} - {deployment.status}</p>
                                  <Show when={deployment.source_deployment_id}>
                                    {(source) => <p class="text-xs text-on-surface-variant">from {source()}</p>}
                                  </Show>
                                  <Show when={priorSameEnvironment && !deployment.source_deployment_id}>
                                    <p class="text-xs text-on-surface-variant">compared with {priorSameEnvironment?.deployment_id}</p>
                                  </Show>
                                </div>
                                <button
                                  type="button"
                                  class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={busyAction() !== null}
                                  onClick={() => setRollbackPreviewDeploymentId((current) => current === deployment.deployment_id ? null : deployment.deployment_id)}
                                >
                                  {rollbackTargetSelected ? "Hide rollback preview" : "Preview rollback"}
                                </button>
                              </div>
                              <Show when={overrideSummary}>
                                {(summary) => (
                                  <div class="mt-2 flex flex-wrap gap-2">
                                    <Show when={summary().delivery_tier}>
                                      <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                        tier {summary().delivery_tier}
                                      </span>
                                    </Show>
                                    <Show when={summary().auth_mode}>
                                      <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                        auth {summary().auth_mode}
                                      </span>
                                    </Show>
                                    <Show when={summary().side_effects}>
                                      <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                        effects {summary().side_effects}
                                      </span>
                                    </Show>
                                    <Show when={summary().provider_route}>
                                      <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                        route {summary().provider_route}
                                      </span>
                                    </Show>
                                  </div>
                                )}
                              </Show>
                              <div class="mt-3 rounded-2xl border border-violet-200/60 bg-violet-50/55 p-3">
                                <div class="flex flex-wrap items-center gap-2">
                                  <p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Connector policy delta</p>
                                  <span class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                    {changeCount} nodes changed
                                  </span>
                                </div>
                                <Show
                                  when={changeCount > 0}
                                  fallback={<p class="mt-2 text-xs text-violet-700/80">No effective connector policy changes versus the comparison snapshot.</p>}
                                >
                                  <div class="mt-2 space-y-2">
                                    <For each={renderedChangeEntries}>
                                      {(diffEntry) => (
                                        <button
                                          type="button"
                                          class="w-full rounded-2xl border border-violet-200/70 bg-white/80 px-3 py-2 text-left transition hover:bg-white"
                                          onClick={() => focusPolicyDiffReview(diffEntry.nodeId, "deployment_context", deploymentInvestigationRun?.run_id ?? null)}
                                        >
                                          <p class="text-sm font-semibold text-violet-900">{nodeLabelById().get(diffEntry.nodeId) ?? diffEntry.nodeId}</p>
                                          <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-violet-700">
                                            {Array.isArray(diffEntry.field_changes)
                                              ? diffEntry.field_changes
                                                .filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object")
                                                .map((change) => `${String(change.field).replaceAll("_", " ")} ${change.previous ?? "unset"} -> ${change.current ?? "unset"}`)
                                                .join(" · ")
                                              : (diffEntry as DeploymentPolicyDiffEntry).changes.map((change) => `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`).join(" · ")}
                                          </p>
                                        </button>
                                      )}
                                    </For>
                                    <Show when={changeCount > 3}>
                                      <p class="text-xs text-violet-700/80">{changeCount - 3} more node policy changes in this snapshot.</p>
                                    </Show>
                                  </div>
                                </Show>
                              </div>
                              <Show when={rollbackTargetSelected}>
                                <div class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-3">
                                  <div class="flex flex-wrap items-center gap-2">
                                    <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Rollback preview</p>
                                    <Show when={rollbackWouldChange} fallback={<span class="rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Already active</span>}>
                                      <span class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                        {rollbackPreviewDiff.length} node policy changes
                                      </span>
                                    </Show>
                                  </div>
                                  <Show
                                    when={rollbackWouldChange}
                                    fallback={<p class="mt-2 text-sm text-emerald-900">This deployment is already the latest active snapshot for {deployment.environment}.</p>}
                                  >
                                    <p class="mt-1 text-sm text-amber-900">
                                      Restoring {deployment.deployment_id} would replace the current {deployment.environment} snapshot
                                      {" "}({activeEnvironmentDeployment?.deployment_id}) with this older connector policy state.
                                    </p>
                                    <Show
                                      when={rollbackPreviewDiff.length > 0}
                                      fallback={<p class="mt-2 text-xs text-amber-700/80">Connector policy fields match the active deployment even though the snapshot ids differ.</p>}
                                    >
                                      <div class="mt-3 space-y-2">
                                        <For each={rollbackPreviewDiff.slice(0, 4)}>
                                          {(diffEntry) => (
                                            <button
                                              type="button"
                                              class="w-full rounded-2xl border border-amber-200/70 bg-white/75 px-3 py-2 text-left transition hover:bg-white"
                                              onClick={() => focusPolicyDiffReview(diffEntry.nodeId, "deployment_context", deploymentInvestigationRun?.run_id ?? null)}
                                            >
                                              <p class="text-sm font-semibold text-amber-900">{nodeLabelById().get(diffEntry.nodeId) ?? diffEntry.nodeId}</p>
                                              <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-700">
                                                {diffEntry.changes.map((change) => `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`).join(" · ")}
                                              </p>
                                            </button>
                                          )}
                                        </For>
                                        <Show when={rollbackPreviewDiff.length > 4}>
                                          <p class="text-xs text-amber-700/80">{rollbackPreviewDiff.length - 4} more node policy changes would be restored.</p>
                                        </Show>
                                      </div>
                                    </Show>
                                    <div class="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        class="rounded-full border border-amber-300/70 bg-amber-500 px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={busyAction() !== null}
                                        onClick={() => void handleWorkflowAction("rollback", { deployment_id: deployment.deployment_id })}
                                      >
                                        Confirm rollback
                                      </button>
                                      <button
                                        type="button"
                                        class="rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={busyAction() !== null}
                                        onClick={() => setRollbackPreviewDeploymentId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                              <p class="mt-2 text-xs text-on-surface-variant">Deployed {new Date(deployment.deployed_at).toLocaleString()}</p>
                            </div>
                          )}}
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
                      <div class="flex flex-wrap items-center justify-end gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="button" class="rounded-full border border-slate-200/70 bg-white/85 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-white" onClick={() => void copyWorkflowLink()}>
                            Copy workflow link
                          </button>
                          <Show when={storedSharedReviewLinkForCurrentWorkflow() && !sharedReviewBannerVisible()}>
                            <div class="flex flex-wrap items-center gap-2">
                              <button type="button" class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100" onClick={() => resumeStoredSharedReview()}>
                                Resume shared review
                              </button>
                              <Show when={storedSharedReviewRecordsForCurrentWorkflow().length > 1}>
                                <div class="space-y-2">
                                  <div class="flex flex-wrap gap-1">
                                    <For each={storedSharedReviewCompositionSummary()}>
                                      {(entry) => (
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewCompositionChipClass(entry.key, entry.active)}`}
                                          title={storedSharedReviewCompositionActionLabel(entry.key)}
                                          aria-label={storedSharedReviewCompositionActionLabel(entry.key)}
                                          onClick={() => applyStoredSharedReviewCompositionFocus(entry.key)}
                                        >
                                          {entry.label}
                                        </button>
                                      )}
                                    </For>
                                  </div>
                                  <Show when={storedSharedReviewActiveFilters().length > 0}>
                                    <div class="flex flex-wrap gap-1">
                                      <For each={storedSharedReviewActiveFilters()}>
                                        {(entry) => (
                                          <button
                                            type="button"
                                            class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewActiveFilterClass(entry.key)}`}
                                            title={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                            aria-label={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                            onClick={() => clearStoredSharedReviewActiveFilter(entry.key)}
                                          >
                                            {`${entry.label} x`}
                                          </button>
                                        )}
                                      </For>
                                      <Show when={storedSharedReviewHasMultipleActiveFilters()}>
                                        <button
                                          type="button"
                                          class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                          title="Clear all saved-review narrowing"
                                          aria-label="Clear all saved-review narrowing"
                                          onClick={() => resetStoredSharedReviewSelectorNarrowing()}
                                        >
                                          Reset all
                                        </button>
                                      </Show>
                                    </div>
                                  </Show>
                                  <Show when={showAllStoredSharedReviews()}>
                                    <div class="flex flex-wrap items-center gap-2 text-[10px] font-medium">
                                      <span class="text-violet-700/80">Tone legend:</span>
                                      <For each={storedSharedReviewToneLegendEntries()}>
                                        {(entry) => (
                                          <Show
                                            when={entry.target}
                                            fallback={<span class={`rounded-full border px-2 py-1 ${storedSharedReviewLegendClass(entry.key)}`}>{entry.label}</span>}
                                          >
                                            {(target) => (
                                              <button
                                                type="button"
                                                class={`rounded-full border px-2 py-1 transition ${storedSharedReviewLegendClass(entry.key)}`}
                                                title={storedSharedReviewLegendActionLabel(target()) ?? undefined}
                                                aria-label={storedSharedReviewLegendActionLabel(target()) ?? undefined}
                                                onClick={() => {
                                                  const nextTarget = target();
                                                  if (nextTarget === "clear_search") clearStoredSharedReviewActiveFilter("search");
                                                  else applyStoredSharedReviewCompositionFocus(nextTarget);
                                                }}
                                              >
                                                {entry.label}
                                              </button>
                                            )}
                                          </Show>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                  <Show when={showAllStoredSharedReviews() && storedSharedReviewSelectorEntries().length > 4}>
                                    <div class="flex flex-wrap items-center gap-2">
                                      <input
                                        value={storedSharedReviewFilter()}
                                        onInput={(event) => setStoredSharedReviewFilter(event.currentTarget.value)}
                                        class="rounded-full border border-violet-200/70 bg-white/85 px-3 py-1 text-[11px] text-violet-800 outline-none transition focus:border-violet-300"
                                        title="Filter saved reviews by label, environment, deployment, or drift context"
                                        aria-label="Filter saved reviews by label, environment, deployment, or drift context"
                                        placeholder="Filter labels, env, deployment"
                                      />
                                      <div class="flex flex-wrap gap-1">
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewShareModeFilter() === "all"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewShareModeActionLabel("all")}
                                          aria-label={storedSharedReviewShareModeActionLabel("all")}
                                          onClick={() => setStoredSharedReviewShareModeFilter("all")}
                                        >
                                          {`All modes (${storedSharedReviewShareModeCounts().all})`}
                                        </button>
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewShareModeFilter() === "workspace"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewShareModeActionLabel("workspace")}
                                          aria-label={storedSharedReviewShareModeActionLabel("workspace")}
                                          onClick={() => setStoredSharedReviewShareModeFilter("workspace")}
                                        >
                                          {`Workspace (${storedSharedReviewShareModeCounts().workspace})`}
                                        </button>
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewShareModeFilter() === "core"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewShareModeActionLabel("core")}
                                          aria-label={storedSharedReviewShareModeActionLabel("core")}
                                          onClick={() => setStoredSharedReviewShareModeFilter("core")}
                                        >
                                          {`Core (${storedSharedReviewShareModeCounts().core})`}
                                        </button>
                                      </div>
                                      <div class="flex flex-wrap gap-1">
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewSortMode() === "priority"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewSortActionLabel("priority")}
                                          aria-label={storedSharedReviewSortActionLabel("priority")}
                                          onClick={() => setStoredSharedReviewSortMode("priority")}
                                        >
                                          Priority
                                        </button>
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewSortMode() === "recent"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewSortActionLabel("recent")}
                                          aria-label={storedSharedReviewSortActionLabel("recent")}
                                          onClick={() => setStoredSharedReviewSortMode("recent")}
                                        >
                                          Recent
                                        </button>
                                      </div>
                                    </div>
                                  </Show>
                                  <Show
                                    when={showAllStoredSharedReviews()}
                                    fallback={
                                      <div class="flex flex-wrap gap-1">
                                        <For each={visibleStoredSharedReviewSelectorEntries()}>
                                          {(entry) => (
                                            <button
                                              type="button"
                                              class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id
                                                  ? "border-violet-300 bg-violet-100 text-violet-800"
                                                  : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                              }`}
                                              title={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                              aria-label={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                              onClick={() => setSelectedStoredSharedReviewId(entry.id)}
                                            >
                                              <Show when={entry.pinned}>
                                                <span class="mr-1">pin</span>
                                              </Show>
                                              {entry.label}
                                              <span class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                                entry.share_mode === "workspace"
                                                  ? "border-sky-200/70 bg-sky-50/85 text-sky-700"
                                                  : "border-slate-200/70 bg-slate-100/85 text-slate-700"
                                              }`}>
                                                {entry.share_mode}
                                              </span>
                                            </button>
                                          )}
                                        </For>
                                        <Show when={storedSharedReviewSelectorEntries().length > 4}>
                                          <button
                                            type="button"
                                            class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                            title={storedSharedReviewExpandActionLabel(storedSharedReviewSelectorEntries().length - 4)}
                                            aria-label={storedSharedReviewExpandActionLabel(storedSharedReviewSelectorEntries().length - 4)}
                                            onClick={() => setShowAllStoredSharedReviews(true)}
                                          >
                                            {`+${storedSharedReviewSelectorEntries().length - 4} more`}
                                          </button>
                                        </Show>
                                      </div>
                                    }
                                  >
                                    <div class="space-y-2">
                                      <Show when={storedSharedReviewSortMode() === "priority" && groupedStoredSharedReviewSelectorEntries().pinned.length > 0}>
                                        <div class="space-y-1">
                                          <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700/80">Pinned</p>
                                          <div class="flex flex-wrap gap-1">
                                            <For each={groupedStoredSharedReviewSelectorEntries().pinned}>
                                              {(entry) => (
                                                <button
                                                  type="button"
                                                  class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                    storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id
                                                      ? "border-violet-300 bg-violet-100 text-violet-800"
                                                      : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                                  }`}
                                                  title={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                  aria-label={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                  onClick={() => setSelectedStoredSharedReviewId(entry.id)}
                                                >
                                                  <span class="mr-1">pin</span>
                                                  {entry.label}
                                                  <span class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                                    entry.share_mode === "workspace"
                                                      ? "border-sky-200/70 bg-sky-50/85 text-sky-700"
                                                      : "border-slate-200/70 bg-slate-100/85 text-slate-700"
                                                  }`}>
                                                    {entry.share_mode}
                                                  </span>
                                                </button>
                                              )}
                                            </For>
                                          </div>
                                        </div>
                                      </Show>
                                      <Show when={groupedStoredSharedReviewSelectorEntries().recent.length > 0}>
                                        <div class="space-y-1">
                                          <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700/80">Recent</p>
                                          <div class="flex flex-wrap gap-1">
                                            <For each={groupedStoredSharedReviewSelectorEntries().recent}>
                                              {(entry) => (
                                                <button
                                                  type="button"
                                                  class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                    storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id
                                                      ? "border-violet-300 bg-violet-100 text-violet-800"
                                                      : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                                  }`}
                                                  title={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                  aria-label={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                  onClick={() => setSelectedStoredSharedReviewId(entry.id)}
                                                >
                                                  {entry.label}
                                                  <span class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                                    entry.share_mode === "workspace"
                                                      ? "border-sky-200/70 bg-sky-50/85 text-sky-700"
                                                      : "border-slate-200/70 bg-slate-100/85 text-slate-700"
                                                  }`}>
                                                    {entry.share_mode}
                                                  </span>
                                                </button>
                                              )}
                                            </For>
                                          </div>
                                        </div>
                                      </Show>
                                      <button
                                        type="button"
                                        class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                        title={storedSharedReviewCollapseActionLabel()}
                                        aria-label={storedSharedReviewCollapseActionLabel()}
                                        onClick={() => setShowAllStoredSharedReviews(false)}
                                      >
                                        Less
                                      </button>
                                    </div>
                                  </Show>
                                  <Show when={showAllStoredSharedReviews() && filteredStoredSharedReviewSelectorEntries().length === 0}>
                                    <div class="space-y-2">
                                      <p class="text-[11px] text-violet-700/80">{storedSharedReviewEmptyStateLabel()}</p>
                                      <Show when={storedSharedReviewEmptyStateActions().length > 0}>
                                        <div class="flex flex-wrap gap-1">
                                          <For each={storedSharedReviewEmptyStateActions()}>
                                            {(entry) => (
                                              <button
                                                type="button"
                                                class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewActiveFilterClass(entry.key)}`}
                                                title={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                                aria-label={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                                onClick={() => clearStoredSharedReviewActiveFilter(entry.key)}
                                              >
                                                {entry.label}
                                              </button>
                                            )}
                                          </For>
                                          <Show when={storedSharedReviewHasMultipleActiveFilters()}>
                                            <button
                                              type="button"
                                              class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                              title="Clear all saved-review narrowing"
                                              aria-label="Clear all saved-review narrowing"
                                              onClick={() => resetStoredSharedReviewSelectorNarrowing()}
                                            >
                                              Reset all
                                            </button>
                                          </Show>
                                        </div>
                                      </Show>
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                              <Show when={storedSharedReviewTitle()}>
                                {(title) => (
                                  <span class="rounded-full border border-violet-200/70 bg-violet-100/80 px-2 py-1 text-[10px] font-medium text-violet-800">
                                    {title()}
                                  </span>
                                )}
                              </Show>
                              <Show when={storedSharedReviewSavedAtLabel()}>
                                {(label) => (
                                  <span class="text-[11px] text-violet-700/80">
                                    saved {label()}
                                  </span>
                                )}
                              </Show>
                              <Show when={storedSharedReviewSummary().length > 0}>
                                <div class="space-y-1">
                                  <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700/80">Selected review</p>
                                  <div class="flex flex-wrap gap-1">
                                    <For each={storedSharedReviewSummary().slice(0, 4)}>
                                      {(entry) => (
                                        <span class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700">
                                          {entry}
                                        </span>
                                      )}
                                    </For>
                                  </div>
                                </div>
                              </Show>
                              <Show when={storedSharedReviewPreviewContextSummary().length > 0}>
                                <div class="space-y-1">
                                  <div class="space-y-0.5">
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600/80">Selector context</p>
                                    <p class="text-[10px] text-slate-500/80">Click a chip to clear that selector state.</p>
                                  </div>
                                  <div class="flex flex-wrap gap-1">
                                    <For each={storedSharedReviewPreviewContextSummary()}>
                                      {(entry) => (
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewPreviewContextClass(entry.key)}`}
                                          title={storedSharedReviewPreviewContextActionLabel(entry.key)}
                                          aria-label={storedSharedReviewPreviewContextActionLabel(entry.key)}
                                          onClick={() => clearStoredSharedReviewPreviewContext(entry.key)}
                                        >
                                          {`${entry.label} x`}
                                        </button>
                                      )}
                                    </For>
                                    <Show when={storedSharedReviewHasMultiplePreviewContextEntries()}>
                                      <button
                                        type="button"
                                        class="rounded-full border border-slate-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-white"
                                        title="Clear all selector context"
                                        aria-label="Clear all selector context"
                                        onClick={() => resetStoredSharedReviewPreviewContext()}
                                      >
                                        Reset all
                                      </button>
                                    </Show>
                                  </div>
                                </div>
                              </Show>
                              <Show when={storedSharedReviewStaleness()}>
                                {(staleness) => (
                                  <span class="rounded-full border border-amber-200/70 bg-amber-50/85 px-2 py-1 text-[10px] font-medium text-amber-700">
                                    {staleness().label}
                                  </span>
                                )}
                              </Show>
                              <Show when={storedSharedReviewScopeMismatch()}>
                                {(mismatch) => (
                                  <span class="rounded-full border border-rose-200/70 bg-rose-50/85 px-2 py-1 text-[10px] font-medium text-rose-700">
                                    {mismatch().label}
                                  </span>
                                )}
                              </Show>
                              <button
                                type="button"
                                class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                  storedSharedReviewMatchesCurrentView()
                                    ? "border-emerald-200/70 bg-white/80 text-emerald-700"
                                    : "border-emerald-200/70 bg-emerald-50/85 text-emerald-700 hover:bg-emerald-100"
                                }`}
                                onClick={() => refreshStoredSharedReview()}
                              >
                                {storedSharedReviewMatchesCurrentView() ? "Saved review up to date" : "Refresh saved review"}
                              </button>
                              <button type="button" class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white" onClick={() => renameStoredSharedReview()}>
                                Rename
                              </button>
                              <button type="button" class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white" onClick={() => togglePinStoredSharedReview()}>
                                {storedSharedReviewRecordForCurrentWorkflow()?.pinned ? "Unpin" : "Pin"}
                              </button>
                              <button type="button" class="rounded-full border border-white/50 bg-white/75 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white" onClick={() => forgetStoredSharedReview()}>
                                Forget saved review
                              </button>
                            </div>
                          </Show>
                          <button type="button" class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100" onClick={() => void copyReviewLink(true)}>
                            Share investigation link
                          </button>
                          <button type="button" class="rounded-full border border-sky-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-white" onClick={() => void copyReviewLink(false)}>
                            Share core review link
                          </button>
                        </div>
                        <span class="text-[11px] text-on-surface-variant">
                          Workflow link is clean. Investigation link can include the saved-review workspace or just the core run, filter, and focus state.
                        </span>
                        <Show when={workflowExecutionRefreshing()}>
                          <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">Auto-refreshing</span>
                        </Show>
                        <button type="button" class="rounded-full border border-white/40 bg-white/65 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white" onClick={() => void refreshRunHistory(workflow.workflow_id)}>Refresh</button>
                      </div>
                    </div>
                    <div class="mt-3 rounded-2xl border border-violet-200/60 bg-violet-50/50 p-3">
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">History triage</p>
                          <p class="mt-1 text-sm text-violet-900">
                            {runHistoryEntries().length} of {runHistory().length} run{runHistory().length === 1 ? "" : "s"} visible
                          </p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                              runHistorySortMode() === "recent"
                                ? "border-violet-300 bg-white text-violet-800"
                                : "border-violet-200/70 bg-white/75 text-violet-700 hover:bg-white"
                            }`}
                            onClick={() => setRunHistorySortMode("recent")}
                          >
                            recent
                          </button>
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                              runHistorySortMode() === "drift_desc"
                                ? "border-sky-300 bg-sky-50 text-sky-800"
                                : "border-sky-200/70 bg-white/75 text-sky-700 hover:bg-white"
                            }`}
                            onClick={() => setRunHistorySortMode("drift_desc")}
                          >
                            highest drift
                          </button>
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                              runHistoryDriftFilter() === "all"
                                ? "border-violet-300 bg-white text-violet-800"
                                : "border-violet-200/70 bg-white/75 text-violet-700 hover:bg-white"
                            }`}
                            onClick={() => setRunHistoryDriftFilter("all")}
                          >
                            all
                          </button>
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                              runHistoryDriftFilter() === "any"
                                ? "border-sky-300 bg-sky-50 text-sky-800"
                                : "border-sky-200/70 bg-white/75 text-sky-700 hover:bg-white"
                            }`}
                            onClick={() => setRunHistoryDriftFilter("any")}
                          >
                            any drift
                          </button>
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                              runHistoryDriftFilter() === "deployment"
                                ? "border-sky-300 bg-sky-50 text-sky-800"
                                : "border-sky-200/70 bg-white/75 text-sky-700 hover:bg-white"
                            }`}
                            onClick={() => setRunHistoryDriftFilter("deployment")}
                          >
                            deployment
                          </button>
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                              runHistoryDriftFilter() === "replay"
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-amber-200/70 bg-white/75 text-amber-700 hover:bg-white"
                            }`}
                            onClick={() => setRunHistoryDriftFilter("replay")}
                          >
                            replay
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="mt-3 space-y-2">
                      <Show when={runHistory().length > 0} fallback={<p class="text-sm text-on-surface-variant">No runs yet. Deploy the workflow, then start a run or replay one from this panel.</p>}>
                        <Show when={runHistoryEntries().length > 0} fallback={<p class="text-sm text-on-surface-variant">No runs match the current drift filter. Switch back to `all` or choose a different impact filter.</p>}>
                        <For each={runHistoryEntries()}>
                          {(entry) => {
                            const run = entry.run;
                            const timelineCount = Array.isArray(run.timeline) ? run.timeline.length : 0;
                            const summaryText = typeof run.result?.summary === "string" ? run.result.summary : "Run completed.";
                            const durationLabel = formatDurationMs(run.result?.duration_ms);
                            const statusSummary = runStatusSummary(run);
                            const runDriftSummary = entry.drift;
                            const runDeployment = deploymentHistoryById().get(run.deployment_id);
                            const runDeploymentSummary = deploymentChangeSummary(runDeployment);
                            const runDeploymentEntries = deploymentChangeSummaryEntries(runDeployment);
                            const activeReplayDeployment = runDeployment
                              ? latestDeploymentForEnvironment(deploymentHistory(), runDeployment.environment)
                              : null;
                            const replayPreviewSelected = replayPreviewRunId() === run.run_id;
                            const replayDeploymentDiff = runDeployment && activeReplayDeployment
                              ? deploymentPolicyDiff(runDeployment, activeReplayDeployment)
                              : [];
                            const replayUsesSameDeployment = runDeployment?.deployment_id === activeReplayDeployment?.deployment_id;
                            const waitingNodeCount =
                              typeof run.result?.waiting_node_count === "number" ? run.result.waiting_node_count : 0;
                            const queuedNodeCount =
                              typeof run.result?.queued_node_count === "number" ? run.result.queued_node_count : 0;
                            const waitChain = runTimelineWaitChainSummary(run);
                            const hasWaitChain = waitChain.pauseCount > 0 || waitChain.resumeCount > 0;
                            const isMultiPause = waitChain.pauseCount > 1 || (waitChain.pauseCount >= 1 && waitChain.resumeCount >= 1);
                            const runStatusClass =
                              run.status === "failed"
                                ? "border-rose-300/70 bg-rose-50/80"
                                : run.status === "blocked"
                                  ? "border-orange-300/70 bg-orange-50/80"
                                  : run.status === "waiting_for_resume"
                                    ? "border-sky-300/70 bg-sky-50/80"
                                  : run.status === "waiting_for_approval"
                                ? "border-amber-300/70 bg-amber-50/80"
                                : selectedRunId() === run.run_id
                                  ? "border-violet-300/70 bg-violet-50/80"
                                  : "border-white/35 bg-white/60";
                            return (
                              <div class={`w-full rounded-2xl border p-3 text-left ${runStatusClass}`}>
                                <div class="flex items-start justify-between gap-3">
                                  <button type="button" class="flex-1 text-left" onClick={() => {
                                    setSelectedRunId(run.run_id);
                                    setSelectedRunEdgeId(null);
                                  }}>
                                    <div class="space-y-1">
                                      <p class="text-sm font-semibold text-on-surface">{run.run_id}</p>
                                      {/* Item 10: family-coloured provenance chip in run history card */}
                                      <div class="flex items-center gap-1.5 flex-wrap">
                                        {(() => {
                                          const kind = typeof run.trigger_kind === "string" ? run.trigger_kind : "manual";
                                          const family = triggerFamilyFromKind(kind);
                                          const chipClass = triggerProvenanceChipClass(family);
                                          return <span class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${chipClass}`}>{kind}</span>;
                                        })()}
                                        <span class="text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">{run.status}</span>
                                      </div>
                                      <Show when={run.replay_of_run_id}>
                                        {(source) => <p class="text-xs text-on-surface-variant">replay of {source()}</p>}
                                      </Show>
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={busyAction() !== null}
                                    onClick={() => setReplayPreviewRunId((current) => current === run.run_id ? null : run.run_id)}
                                  >
                                    {replayPreviewSelected ? "Hide replay preview" : "Preview replay"}
                                  </button>
                                </div>
                                <button type="button" class="mt-2 w-full text-left" onClick={() => {
                                  setSelectedRunId(run.run_id);
                                  setSelectedRunEdgeId(null);
                                }}>
                                  <div class="flex flex-wrap gap-2">
                                    <span class={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${runStatusChipClass(run.status)}`}>
                                      {run.status.replaceAll("_", " ")}
                                    </span>
                                    <Show when={runDriftSummary.nodeEntries.length > 0 || runDriftSummary.edgeEntries.length > 0}>
                                      <span class="rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                        {runDriftSummary.nodeEntries.length} node delta{runDriftSummary.nodeEntries.length === 1 ? "" : "s"}
                                      </span>
                                      <span class="rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                        {runDriftSummary.edgeEntries.length} edge delta{runDriftSummary.edgeEntries.length === 1 ? "" : "s"}
                                      </span>
                                    </Show>
                                    <Show when={waitingNodeCount > 0}>
                                      <span class="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                        {waitingNodeCount} waiting
                                      </span>
                                    </Show>
                                    <Show when={queuedNodeCount > 0}>
                                      <span class="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                        {queuedNodeCount} queued
                                      </span>
                                    </Show>
                                    <Show when={hasWaitChain}>
                                      <span class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${isMultiPause ? "border-violet-200/70 bg-violet-50/85 text-violet-700" : "border-sky-200/70 bg-sky-50/85 text-sky-700"}`}>
                                        {waitChain.pauseCount} pause{waitChain.pauseCount === 1 ? "" : "s"}{waitChain.resumeCount > 0 ? ` · ${waitChain.resumeCount} resume${waitChain.resumeCount === 1 ? "" : "s"}` : ""}
                                      </span>
                                    </Show>
                                  </div>
                                  <Show when={statusSummary}>
                                    {(callout) => <p class="mt-2 text-xs font-medium text-on-surface">{callout()}</p>}
                                  </Show>
                                  <Show when={runDeploymentSummary}>
                                    <div class="mt-2 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-2">
                                      <div class="flex flex-wrap items-center gap-2">
                                        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Deploy context</span>
                                        <span class="rounded-full border border-sky-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                          {typeof runDeploymentSummary?.changed_node_count === "number" ? runDeploymentSummary.changed_node_count : runDeploymentEntries.length} node changes
                                        </span>
                                      </div>
                                      <Show when={runDeploymentEntries[0]}>
                                        <p class="mt-1 text-[11px] text-sky-900">
                                          {nodeLabelById().get(runDeploymentEntries[0]?.nodeId ?? "") ?? runDeploymentEntries[0]?.nodeId}: {runDeploymentEntries[0]?.summary}
                                        </p>
                                      </Show>
                                    </div>
                                  </Show>
                                  <p class="mt-2 text-xs text-on-surface-variant">{summaryText}</p>
                                  <Show when={runDriftSummary.nodeEntries.length > 0 || runDriftSummary.edgeEntries.length > 0}>
                                    <p class="mt-1 text-[11px] text-sky-900">
                                      Drift impact: {runDriftSummary.deploymentNodeCount + runDriftSummary.deploymentEdgeCount} deployment-linked and {runDriftSummary.replayNodeCount + runDriftSummary.replayEdgeCount} replay-linked markers.
                                    </p>
                                  </Show>
                                  <p class="mt-1 text-xs text-on-surface-variant">{timelineCount} timeline steps{durationLabel ? ` - ${durationLabel}` : ""}{hasWaitChain ? ` · ${waitChain.pauseCount} pause${waitChain.pauseCount === 1 ? "" : "s"}${waitChain.resumeCount > 0 ? ` · ${waitChain.resumeCount} resume${waitChain.resumeCount === 1 ? "" : "s"}` : ""}` : ""} - started {new Date(run.started_at).toLocaleString()}</p>
                                </button>
                                <Show when={replayPreviewSelected}>
                                  <div class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3">
                                    <div class="flex flex-wrap items-center gap-2">
                                      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Replay preview</p>
                                      <Show
                                        when={!replayUsesSameDeployment}
                                        fallback={<span class="rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Same deployment</span>}
                                      >
                                        <span class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                          {replayDeploymentDiff.length} node policy differences
                                        </span>
                                      </Show>
                                      <Show when={runDriftSummary.replayNodeCount > 0 || runDriftSummary.replayEdgeCount > 0}>
                                        <span class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                          {runDriftSummary.replayNodeCount} node drift · {runDriftSummary.replayEdgeCount} edge drift
                                        </span>
                                      </Show>
                                    </div>
                                    <Show
                                      when={runDeployment && activeReplayDeployment}
                                      fallback={<p class="mt-2 text-sm text-amber-900">Deployment context is unavailable for this run, so replay will use the latest active snapshot.</p>}
                                    >
                                      <p class="mt-1 text-sm text-amber-900">
                                        Replay will run now on {activeReplayDeployment?.deployment_id}. Original run used {run.deployment_id}.
                                      </p>
                                      <Show when={runDriftSummary.nodeEntries.length > 0 || runDriftSummary.edgeEntries.length > 0}>
                                        <p class="mt-2 text-xs text-amber-800">
                                          Current run carried {runDriftSummary.nodeEntries.length} node-level and {runDriftSummary.edgeEntries.length} branch-level drift marker{runDriftSummary.nodeEntries.length + runDriftSummary.edgeEntries.length === 1 ? "" : "s"}.
                                        </p>
                                      </Show>
                                      <Show when={!replayUsesSameDeployment}>
                                        <div class="mt-3 space-y-2">
                                          <For each={replayDeploymentDiff.slice(0, 3)}>
                                            {(diffEntry) => (
                                              <button
                                                type="button"
                                                class="w-full rounded-2xl border border-amber-200/70 bg-white/75 px-3 py-2 text-left transition hover:bg-white"
                                                onClick={() => focusPolicyDiffReview(diffEntry.nodeId, "replay_drift", run.run_id)}
                                              >
                                                <p class="text-sm font-semibold text-amber-900">{nodeLabelById().get(diffEntry.nodeId) ?? diffEntry.nodeId}</p>
                                                <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-700">
                                                  {diffEntry.changes.map((change) => `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`).join(" · ")}
                                                </p>
                                              </button>
                                            )}
                                          </For>
                                          <Show when={replayDeploymentDiff.length > 3}>
                                            <p class="text-xs text-amber-700/80">{replayDeploymentDiff.length - 3} more deployment differences would affect this replay.</p>
                                          </Show>
                                        </div>
                                      </Show>
                                      <div class="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          class="rounded-full border border-violet-300/70 bg-violet-500 px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                          disabled={busyAction() !== null}
                                          onClick={() => void handleRunAction("replay", {
                                            replay_run_id: run.run_id,
                                            deployment_id: activeReplayDeployment?.deployment_id,
                                          })}
                                        >
                                          Confirm replay
                                        </button>
                                        <button
                                          type="button"
                                          class="rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                          disabled={busyAction() !== null}
                                          onClick={() => setReplayPreviewRunId(null)}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </Show>
                                  </div>
                                </Show>
                              </div>
                            );
                          }}
                        </For>
                        </Show>
                      </Show>
                    </div>
                  </div>

                  <Show when={selectedRun()}>
                    {(runAccessor) => {
                      const run = runAccessor();
                      const runDeployment = deploymentHistoryById().get(run.deployment_id);
                      const runDeploymentSummary = deploymentChangeSummary(runDeployment);
                      const runDeploymentEntries = deploymentChangeSummaryEntries(runDeployment);
                      const persistedReplayComparison = replayComparisonSummary(run);
                      const activeReplayDeployment = runDeployment
                        ? latestDeploymentForEnvironment(deploymentHistory(), runDeployment.environment)
                        : null;
                      const replayComparisonDiff = runDeployment && activeReplayDeployment
                        ? deploymentPolicyDiff(runDeployment, activeReplayDeployment)
                        : [];
                      const replayUsesSameDeployment = runDeployment?.deployment_id === activeReplayDeployment?.deployment_id;
                      const timeline = Array.isArray(run.timeline) ? run.timeline : [];
                      const runNodePolicyDeltaEntries = Array.from(selectedRunNodePolicyDeltas().values());
                      const runEdgePolicyDeltaEntries = Array.from(selectedRunEdgePolicyDeltas().values());
                      const deploymentNodeDeltaCount = runNodePolicyDeltaEntries.filter((entry) => entry.source === "deployment_policy_delta").length;
                      const replayNodeDeltaCount = runNodePolicyDeltaEntries.filter((entry) => entry.source === "replay_policy_delta").length;
                      const deploymentEdgeDeltaCount = runEdgePolicyDeltaEntries.filter((entry) => entry.source === "deployment_policy_delta").length;
                      const replayEdgeDeltaCount = runEdgePolicyDeltaEntries.filter((entry) => entry.source === "replay_policy_delta").length;
                      const timelineFilterMode = runTimelineFilterMode();
                      const focusedTimelineNodeId = runTimelineFocusNodeId();
                      const focusedEdge = selectedRunEdge();
                      const focusedEdgeState = focusedEdge ? selectedRunEdgeStates().get(focusedEdge.id) : undefined;
                      const focusedEdgeCallout = focusedEdge ? runEdgeCanvasCallout(run, focusedEdge, focusedEdgeState) : null;
                      const focusedEdgePolicyDelta = focusedEdge ? selectedRunEdgePolicyDeltas().get(focusedEdge.id) ?? null : null;
                      const focusedEdgeTimeline = selectedRunEdgeTimeline();
                      const unfilteredTimelineEntries = focusedEdge
                        ? focusedEdgeTimeline
                        : timeline.map((step, timelineIndex) => ({ step, timelineIndex, relation: "related" as const }));
                      const filteredTimelineEntries = unfilteredTimelineEntries.filter((entry) =>
                        timelineStepMatchesFilter(entry.step, timelineFilterMode)
                        && (!focusedTimelineNodeId || timelineStepNodeId(entry.step) === focusedTimelineNodeId),
                      );
                      const timelineDeploymentContextCount = unfilteredTimelineEntries.filter((entry) =>
                        timelineStepHasDeploymentContext(entry.step),
                      ).length;
                      const timelineReplayDriftCount = unfilteredTimelineEntries.filter((entry) =>
                        timelineStepHasReplayDrift(entry.step),
                      ).length;
                      const focusedTimelineNodeLabel = focusedTimelineNodeId
                        ? nodeLabelById().get(focusedTimelineNodeId) ?? focusedTimelineNodeId
                        : null;
                      const focusedEdgeLogEntries = branchExecutionLogEntries(draft(), run, focusedEdge?.id ?? null);
                      const sourceNode = focusedEdge ? draft().nodes.find((node) => node.id === focusedEdge.source) ?? null : null;
                      const targetNode = focusedEdge ? draft().nodes.find((node) => node.id === focusedEdge.target) ?? null : null;
                      const executionMode =
                        typeof run.result?.execution_mode === "string" ? run.result.execution_mode : "live";
                      const statusSummary = runStatusSummary(run);
                      const summaryText =
                        typeof run.result?.summary === "string" ? run.result.summary : "Run completed.";
                      const durationLabel = formatDurationMs(run.result?.duration_ms);
                      const completedNodeCount =
                        typeof run.result?.completed_node_count === "number" ? run.result.completed_node_count : 0;
                      const simulatedNodeCount =
                        typeof run.result?.simulated_node_count === "number" ? run.result.simulated_node_count : 0;
                      const waitingNodeCount =
                        typeof run.result?.waiting_node_count === "number" ? run.result.waiting_node_count : 0;
                      const queuedNodeCount =
                        typeof run.result?.queued_node_count === "number" ? run.result.queued_node_count : 0;
                      const skippedNodeCount =
                        typeof run.result?.skipped_node_count === "number" ? run.result.skipped_node_count : 0;
                      const pausedAtLabel =
                        typeof run.result?.paused_at_label === "string" ? run.result.paused_at_label : null;
                      const approvalReason =
                        typeof run.result?.approval_reason === "string" ? run.result.approval_reason : null;
                      const waitReason =
                        typeof run.result?.wait_reason === "string" ? run.result.wait_reason : null;
                      const waitResumeFamily =
                        typeof run.result?.wait_resume_family === "string" ? run.result.wait_resume_family : null;
                      const waitResumeKind =
                        typeof run.result?.wait_resume_kind === "string" ? run.result.wait_resume_kind : null;
                      const approvalDecisionPointId =
                        typeof run.result?.approval_decision_point_id === "string"
                          ? run.result.approval_decision_point_id
                          : null;
                      const approvalOptions = Array.isArray(run.result?.approval_options)
                        ? (run.result.approval_options as Array<Record<string, unknown>>)
                        : [];
                      const blockedAtLabel =
                        typeof run.result?.blocked_at_label === "string" ? run.result.blocked_at_label : null;
                      const blockedReason =
                        typeof run.result?.blocked_reason === "string" ? run.result.blocked_reason : null;
                      const failedAtLabel =
                        typeof run.result?.failed_at_label === "string" ? run.result.failed_at_label : null;
                      const failedReason =
                        typeof run.result?.failed_reason === "string" ? run.result.failed_reason : null;
                      const runtimeKindCounts =
                        run.result?.runtime_kind_counts && typeof run.result.runtime_kind_counts === "object"
                          ? Object.entries(run.result.runtime_kind_counts as Record<string, unknown>)
                          : [];
                      const waitResumeRecords = selectedRunWaitResumeRecords();
                      const waitResumeSummary = selectedRunWaitResumeSummary();
                      const waitResumeLoading = selectedRunWaitResumeLoading();
                      const waitResumeError = selectedRunWaitResumeError();
                      const applyRunTimelineFilter = (filterMode: RunTimelineFilterMode) => {
                        setRunTimelineFilterMode(filterMode);
                        if (filterMode !== "all") setSelectedRunEdgeId(null);
                      };
                      const focusRunTimelineNode = (nodeId: string, filterMode: RunTimelineFilterMode) => {
                        setSelectedNodeId(nodeId);
                        setRunTimelineFocusNodeId(nodeId);
                        setRunTimelineFilterMode(filterMode);
                        setSelectedRunEdgeId(null);
                      };
                      return (
                        <div class="rounded-[22px] border border-violet-200/70 bg-violet-50/70 p-4">
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="text-sm font-semibold text-violet-900">Run detail</p>
                              <div class="mt-1 flex flex-wrap items-center gap-2">
                                <p class="text-xs uppercase tracking-[0.18em] text-violet-700">{run.run_id} - {executionMode}</p>
                                <span class={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${runStatusChipClass(run.status)}`}>
                                  {run.status.replaceAll("_", " ")}
                                </span>
                              </div>
                            </div>
                            <div class="flex flex-wrap items-center justify-end gap-2">
                              <button type="button" class="rounded-full border border-slate-200/70 bg-white/85 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-white" onClick={() => void copyWorkflowLink()}>
                                Workflow link
                              </button>
                              <Show when={storedSharedReviewLinkForCurrentWorkflow() && !sharedReviewBannerVisible()}>
                                <div class="flex flex-wrap items-center gap-2">
                                  <button type="button" class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100" onClick={() => resumeStoredSharedReview()}>
                                    Resume review
                                  </button>
                                  <Show when={storedSharedReviewRecordsForCurrentWorkflow().length > 1}>
                                    <div class="space-y-2">
                                      <div class="flex flex-wrap gap-1">
                                        <For each={storedSharedReviewCompositionSummary()}>
                                          {(entry) => (
                                            <button
                                              type="button"
                                              class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewCompositionChipClass(entry.key, entry.active)}`}
                                              title={storedSharedReviewCompositionActionLabel(entry.key)}
                                              aria-label={storedSharedReviewCompositionActionLabel(entry.key)}
                                              onClick={() => applyStoredSharedReviewCompositionFocus(entry.key)}
                                            >
                                              {entry.label}
                                            </button>
                                          )}
                                        </For>
                                      </div>
                                      <Show when={storedSharedReviewActiveFilters().length > 0}>
                                        <div class="flex flex-wrap gap-1">
                                          <For each={storedSharedReviewActiveFilters()}>
                                            {(entry) => (
                                              <button
                                                type="button"
                                                class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewActiveFilterClass(entry.key)}`}
                                                title={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                                aria-label={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                                onClick={() => clearStoredSharedReviewActiveFilter(entry.key)}
                                              >
                                                {`${entry.label} x`}
                                              </button>
                                            )}
                                          </For>
                                          <Show when={storedSharedReviewHasMultipleActiveFilters()}>
                                            <button
                                              type="button"
                                              class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                              title="Clear all saved-review narrowing"
                                              aria-label="Clear all saved-review narrowing"
                                              onClick={() => resetStoredSharedReviewSelectorNarrowing()}
                                            >
                                              Reset all
                                            </button>
                                          </Show>
                                        </div>
                                      </Show>
                                      <Show when={showAllStoredSharedReviews()}>
                                        <div class="flex flex-wrap items-center gap-2 text-[10px] font-medium">
                                          <span class="text-violet-700/80">Tone legend:</span>
                                          <For each={storedSharedReviewToneLegendEntries()}>
                                            {(entry) => (
                                              <Show
                                                when={entry.target}
                                                fallback={<span class={`rounded-full border px-2 py-1 ${storedSharedReviewLegendClass(entry.key)}`}>{entry.label}</span>}
                                              >
                                                {(target) => (
                                                  <button
                                                    type="button"
                                                    class={`rounded-full border px-2 py-1 transition ${storedSharedReviewLegendClass(entry.key)}`}
                                                    title={storedSharedReviewLegendActionLabel(target()) ?? undefined}
                                                    aria-label={storedSharedReviewLegendActionLabel(target()) ?? undefined}
                                                    onClick={() => {
                                                      const nextTarget = target();
                                                      if (nextTarget === "clear_search") clearStoredSharedReviewActiveFilter("search");
                                                      else applyStoredSharedReviewCompositionFocus(nextTarget);
                                                    }}
                                                  >
                                                    {entry.label}
                                                  </button>
                                                )}
                                              </Show>
                                            )}
                                          </For>
                                        </div>
                                      </Show>
                                      <Show when={showAllStoredSharedReviews() && storedSharedReviewSelectorEntries().length > 4}>
                                        <div class="flex flex-wrap items-center gap-2">
                                      <input
                                        value={storedSharedReviewFilter()}
                                        onInput={(event) => setStoredSharedReviewFilter(event.currentTarget.value)}
                                        class="rounded-full border border-violet-200/70 bg-white/85 px-3 py-1 text-[11px] text-violet-800 outline-none transition focus:border-violet-300"
                                        title="Filter saved reviews by label, environment, deployment, or drift context"
                                        aria-label="Filter saved reviews by label, environment, deployment, or drift context"
                                        placeholder="Filter labels, env, deployment"
                                      />
                                      <div class="flex flex-wrap gap-1">
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewShareModeFilter() === "all"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewShareModeActionLabel("all")}
                                          aria-label={storedSharedReviewShareModeActionLabel("all")}
                                          onClick={() => setStoredSharedReviewShareModeFilter("all")}
                                        >
                                          {`All modes (${storedSharedReviewShareModeCounts().all})`}
                                        </button>
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewShareModeFilter() === "workspace"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewShareModeActionLabel("workspace")}
                                          aria-label={storedSharedReviewShareModeActionLabel("workspace")}
                                          onClick={() => setStoredSharedReviewShareModeFilter("workspace")}
                                        >
                                          {`Workspace (${storedSharedReviewShareModeCounts().workspace})`}
                                        </button>
                                        <button
                                          type="button"
                                          class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                            storedSharedReviewShareModeFilter() === "core"
                                              ? "border-violet-300 bg-violet-100 text-violet-800"
                                              : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                          }`}
                                          title={storedSharedReviewShareModeActionLabel("core")}
                                          aria-label={storedSharedReviewShareModeActionLabel("core")}
                                          onClick={() => setStoredSharedReviewShareModeFilter("core")}
                                        >
                                          {`Core (${storedSharedReviewShareModeCounts().core})`}
                                        </button>
                                      </div>
                                      <div class="flex flex-wrap gap-1">
                                            <button
                                              type="button"
                                              class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                storedSharedReviewSortMode() === "priority"
                                                  ? "border-violet-300 bg-violet-100 text-violet-800"
                                                  : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                              }`}
                                              title={storedSharedReviewSortActionLabel("priority")}
                                              aria-label={storedSharedReviewSortActionLabel("priority")}
                                              onClick={() => setStoredSharedReviewSortMode("priority")}
                                            >
                                              Priority
                                            </button>
                                            <button
                                              type="button"
                                              class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                storedSharedReviewSortMode() === "recent"
                                                  ? "border-violet-300 bg-violet-100 text-violet-800"
                                                  : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                              }`}
                                              title={storedSharedReviewSortActionLabel("recent")}
                                              aria-label={storedSharedReviewSortActionLabel("recent")}
                                              onClick={() => setStoredSharedReviewSortMode("recent")}
                                            >
                                              Recent
                                            </button>
                                          </div>
                                        </div>
                                      </Show>
                                      <Show
                                        when={showAllStoredSharedReviews()}
                                        fallback={
                                          <div class="flex flex-wrap gap-1">
                                            <For each={visibleStoredSharedReviewSelectorEntries()}>
                                              {(entry) => (
                                                <button
                                                  type="button"
                                                  class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                    storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id
                                                      ? "border-violet-300 bg-violet-100 text-violet-800"
                                                      : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                                  }`}
                                                  title={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                  aria-label={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                  onClick={() => setSelectedStoredSharedReviewId(entry.id)}
                                                >
                                                  <Show when={entry.pinned}>
                                                    <span class="mr-1">pin</span>
                                                  </Show>
                                                  {entry.label}
                                                  <span class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                                    entry.share_mode === "workspace"
                                                      ? "border-sky-200/70 bg-sky-50/85 text-sky-700"
                                                      : "border-slate-200/70 bg-slate-100/85 text-slate-700"
                                                  }`}>
                                                    {entry.share_mode}
                                                  </span>
                                                </button>
                                              )}
                                            </For>
                                            <Show when={storedSharedReviewSelectorEntries().length > 4}>
                                              <button
                                                type="button"
                                                class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                                title={storedSharedReviewExpandActionLabel(storedSharedReviewSelectorEntries().length - 4)}
                                                aria-label={storedSharedReviewExpandActionLabel(storedSharedReviewSelectorEntries().length - 4)}
                                                onClick={() => setShowAllStoredSharedReviews(true)}
                                              >
                                                {`+${storedSharedReviewSelectorEntries().length - 4} more`}
                                              </button>
                                            </Show>
                                          </div>
                                        }
                                      >
                                        <div class="space-y-2">
                                          <Show when={storedSharedReviewSortMode() === "priority" && groupedStoredSharedReviewSelectorEntries().pinned.length > 0}>
                                            <div class="space-y-1">
                                              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700/80">Pinned</p>
                                              <div class="flex flex-wrap gap-1">
                                                <For each={groupedStoredSharedReviewSelectorEntries().pinned}>
                                                  {(entry) => (
                                                    <button
                                                      type="button"
                                                      class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                        storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id
                                                          ? "border-violet-300 bg-violet-100 text-violet-800"
                                                          : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                                      }`}
                                                      title={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                      aria-label={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                      onClick={() => setSelectedStoredSharedReviewId(entry.id)}
                                                  >
                                                    <span class="mr-1">pin</span>
                                                    {entry.label}
                                                    <span class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                                      entry.share_mode === "workspace"
                                                        ? "border-sky-200/70 bg-sky-50/85 text-sky-700"
                                                        : "border-slate-200/70 bg-slate-100/85 text-slate-700"
                                                    }`}>
                                                      {entry.share_mode}
                                                    </span>
                                                  </button>
                                                )}
                                              </For>
                                              </div>
                                            </div>
                                          </Show>
                                          <Show when={groupedStoredSharedReviewSelectorEntries().recent.length > 0}>
                                            <div class="space-y-1">
                                              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700/80">Recent</p>
                                              <div class="flex flex-wrap gap-1">
                                                <For each={groupedStoredSharedReviewSelectorEntries().recent}>
                                                  {(entry) => (
                                                    <button
                                                      type="button"
                                                      class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                                        storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id
                                                          ? "border-violet-300 bg-violet-100 text-violet-800"
                                                          : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white"
                                                      }`}
                                                      title={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                      aria-label={storedSharedReviewSelectorEntryActionLabel(entry, storedSharedReviewRecordForCurrentWorkflow()?.id === entry.id)}
                                                      onClick={() => setSelectedStoredSharedReviewId(entry.id)}
                                                    >
                                                    {entry.label}
                                                    <span class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                                      entry.share_mode === "workspace"
                                                        ? "border-sky-200/70 bg-sky-50/85 text-sky-700"
                                                        : "border-slate-200/70 bg-slate-100/85 text-slate-700"
                                                    }`}>
                                                      {entry.share_mode}
                                                    </span>
                                                  </button>
                                                )}
                                              </For>
                                              </div>
                                            </div>
                                          </Show>
                                          <button
                                            type="button"
                                            class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                            title={storedSharedReviewCollapseActionLabel()}
                                            aria-label={storedSharedReviewCollapseActionLabel()}
                                            onClick={() => setShowAllStoredSharedReviews(false)}
                                          >
                                            Less
                                          </button>
                                        </div>
                                      </Show>
                                      <Show when={showAllStoredSharedReviews() && filteredStoredSharedReviewSelectorEntries().length === 0}>
                                        <div class="space-y-2">
                                          <p class="text-[11px] text-violet-700/80">{storedSharedReviewEmptyStateLabel()}</p>
                                          <Show when={storedSharedReviewEmptyStateActions().length > 0}>
                                            <div class="flex flex-wrap gap-1">
                                              <For each={storedSharedReviewEmptyStateActions()}>
                                                {(entry) => (
                                                  <button
                                                    type="button"
                                                    class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewActiveFilterClass(entry.key)}`}
                                                    title={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                                    aria-label={storedSharedReviewActiveFilterActionLabel(entry.key)}
                                                    onClick={() => clearStoredSharedReviewActiveFilter(entry.key)}
                                                  >
                                                    {entry.label}
                                                  </button>
                                                )}
                                              </For>
                                              <Show when={storedSharedReviewHasMultipleActiveFilters()}>
                                                <button
                                                  type="button"
                                                  class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white"
                                                  title="Clear all saved-review narrowing"
                                                  aria-label="Clear all saved-review narrowing"
                                                  onClick={() => resetStoredSharedReviewSelectorNarrowing()}
                                                >
                                                  Reset all
                                                </button>
                                              </Show>
                                            </div>
                                          </Show>
                                        </div>
                                      </Show>
                                    </div>
                                  </Show>
                                  <Show when={storedSharedReviewTitle()}>
                                    {(title) => (
                                      <span class="rounded-full border border-violet-200/70 bg-violet-100/80 px-2 py-1 text-[10px] font-medium text-violet-800">
                                        {title()}
                                      </span>
                                    )}
                                  </Show>
                                  <Show when={storedSharedReviewSavedAtLabel()}>
                                    {(label) => (
                                      <span class="text-[11px] text-violet-700/80">
                                        saved {label()}
                                      </span>
                                    )}
                                  </Show>
                                  <Show when={storedSharedReviewSummary().length > 0}>
                                    <div class="space-y-1">
                                      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700/80">Selected review</p>
                                      <div class="flex flex-wrap gap-1">
                                        <For each={storedSharedReviewSummary().slice(0, 4)}>
                                          {(entry) => (
                                            <span class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700">
                                              {entry}
                                            </span>
                                          )}
                                        </For>
                                      </div>
                                    </div>
                                  </Show>
                                  <Show when={storedSharedReviewPreviewContextSummary().length > 0}>
                                    <div class="space-y-1">
                                      <div class="space-y-0.5">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600/80">Selector context</p>
                                        <p class="text-[10px] text-slate-500/80">Click a chip to clear that selector state.</p>
                                      </div>
                                      <div class="flex flex-wrap gap-1">
                                        <For each={storedSharedReviewPreviewContextSummary()}>
                                        {(entry) => (
                                          <button
                                            type="button"
                                            class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${storedSharedReviewPreviewContextClass(entry.key)}`}
                                            title={storedSharedReviewPreviewContextActionLabel(entry.key)}
                                            aria-label={storedSharedReviewPreviewContextActionLabel(entry.key)}
                                            onClick={() => clearStoredSharedReviewPreviewContext(entry.key)}
                                          >
                                            {`${entry.label} x`}
                                          </button>
                                          )}
                                        </For>
                                        <Show when={storedSharedReviewHasMultiplePreviewContextEntries()}>
                                          <button
                                            type="button"
                                            class="rounded-full border border-slate-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-white"
                                            title="Clear all selector context"
                                            aria-label="Clear all selector context"
                                            onClick={() => resetStoredSharedReviewPreviewContext()}
                                          >
                                            Reset all
                                          </button>
                                        </Show>
                                      </div>
                                    </div>
                                  </Show>
                                  <Show when={storedSharedReviewStaleness()}>
                                    {(staleness) => (
                                      <span class="rounded-full border border-amber-200/70 bg-amber-50/85 px-2 py-1 text-[10px] font-medium text-amber-700">
                                        {staleness().label}
                                      </span>
                                    )}
                                  </Show>
                                  <Show when={storedSharedReviewScopeMismatch()}>
                                    {(mismatch) => (
                                      <span class="rounded-full border border-rose-200/70 bg-rose-50/85 px-2 py-1 text-[10px] font-medium text-rose-700">
                                        {mismatch().label}
                                      </span>
                                    )}
                                  </Show>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-2 py-1 text-[10px] font-medium transition ${
                                      storedSharedReviewMatchesCurrentView()
                                        ? "border-emerald-200/70 bg-white/80 text-emerald-700"
                                        : "border-emerald-200/70 bg-emerald-50/85 text-emerald-700 hover:bg-emerald-100"
                                    }`}
                                    onClick={() => refreshStoredSharedReview()}
                                  >
                                    {storedSharedReviewMatchesCurrentView() ? "Saved review up to date" : "Refresh saved review"}
                                  </button>
                                  <button type="button" class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white" onClick={() => renameStoredSharedReview()}>
                                    Rename
                                  </button>
                                  <button type="button" class="rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white" onClick={() => togglePinStoredSharedReview()}>
                                    {storedSharedReviewRecordForCurrentWorkflow()?.pinned ? "Unpin" : "Pin"}
                                  </button>
                                  <button type="button" class="rounded-full border border-white/50 bg-white/75 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white" onClick={() => forgetStoredSharedReview()}>
                                    Forget saved review
                                  </button>
                                </div>
                              </Show>
                              <button type="button" class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100" onClick={() => void copyReviewLink(true)}>
                                Share link
                              </button>
                              <button type="button" class="rounded-full border border-sky-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-white" onClick={() => void copyReviewLink(false)}>
                                Core review link
                              </button>
                              <span class="text-[11px] text-violet-700/80">
                                Workflow link is clean. Share link can preserve this full workspace or just this run review.
                              </span>
                              <button type="button" class="rounded-full border border-violet-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-white" onClick={() => {
                                setSelectedRunId(null);
                                setSelectedRunEdgeId(null);
                              }}>Clear</button>
                            </div>
                          </div>
                          <Show when={statusSummary}>
                            {(callout) => (
                              <div class="mt-3 rounded-2xl border border-violet-200/70 bg-white/80 px-4 py-3 text-sm font-medium text-violet-900">
                                {callout()}
                              </div>
                            )}
                          </Show>
                          <p class="mt-3 text-sm text-violet-900">{summaryText}</p>
                          <Show when={runDeployment}>
                            <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 p-4">
                              <div class="flex flex-wrap items-center gap-2">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Deployment context</p>
                                <span class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                  {run.deployment_id}
                                </span>
                                <Show when={typeof runDeploymentSummary?.changed_node_count === "number"}>
                                  <span class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                    {typeof runDeploymentSummary?.changed_node_count === "number" ? runDeploymentSummary.changed_node_count : 0} node changes
                                  </span>
                                </Show>
                                <Show when={typeof runDeploymentSummary?.compared_to_deployment_id === "string"}>
                                  <span class="rounded-full border border-white/50 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                                    vs {typeof runDeploymentSummary?.compared_to_deployment_id === "string" ? runDeploymentSummary.compared_to_deployment_id : ""}
                                  </span>
                                </Show>
                                <Show when={timelineDeploymentContextCount > 0}>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                                      timelineFilterMode === "deployment_context"
                                        ? "border-sky-300 bg-sky-100 text-sky-800"
                                        : "border-sky-200/70 bg-white/85 text-sky-700 hover:bg-white"
                                    }`}
                                    onClick={() => applyRunTimelineFilter("deployment_context")}
                                  >
                                    review {timelineDeploymentContextCount} deployment step{timelineDeploymentContextCount === 1 ? "" : "s"}
                                  </button>
                                </Show>
                              </div>
                              <Show when={runDeploymentEntries.length > 0}>
                                <div class="mt-3 space-y-2">
                                  <For each={runDeploymentEntries.slice(0, 3)}>
                                    {(entry) => (
                                      <button
                                        type="button"
                                        class={`w-full rounded-2xl border border-sky-200/70 bg-white/80 px-3 py-2 text-left transition hover:bg-white ${
                                          focusedTimelineNodeId === entry.nodeId ? "ring-2 ring-sky-300/70" : ""
                                        }`}
                                        onClick={() => focusRunTimelineNode(entry.nodeId, "deployment_context")}
                                      >
                                        <p class="text-sm font-semibold text-sky-900">{nodeLabelById().get(entry.nodeId) ?? entry.nodeId}</p>
                                        <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-sky-700">{entry.summary}</p>
                                      </button>
                                    )}
                                  </For>
                                  <Show when={runDeploymentEntries.length > 3}>
                                    <p class="text-xs text-sky-700/80">{runDeploymentEntries.length - 3} more deployment policy changes are attached to this run.</p>
                                  </Show>
                                </div>
                              </Show>
                              <Show when={run.replay_of_run_id}>
                                <div class="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3">
                                  <div class="flex flex-wrap items-center gap-2">
                                    <p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Replay deployment comparison</p>
                                    <Show
                                      when={persistedReplayComparison?.matched_original_deployment === false || !replayUsesSameDeployment}
                                      fallback={<span class="rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Same deployment</span>}
                                    >
                                      <span class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                        {typeof persistedReplayComparison?.changed_node_count === "number" ? persistedReplayComparison.changed_node_count : replayComparisonDiff.length} policy differences
                                      </span>
                                    </Show>
                                    <Show when={timelineReplayDriftCount > 0}>
                                      <button
                                        type="button"
                                        class={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                                          timelineFilterMode === "replay_drift"
                                            ? "border-amber-300 bg-amber-100 text-amber-800"
                                            : "border-amber-200/70 bg-white/80 text-amber-700 hover:bg-white"
                                        }`}
                                        onClick={() => applyRunTimelineFilter("replay_drift")}
                                      >
                                        review {timelineReplayDriftCount} drifted step{timelineReplayDriftCount === 1 ? "" : "s"}
                                      </button>
                                    </Show>
                                  </div>
                                  <p class="mt-1 text-sm text-amber-900">
                                    This replay references run {run.replay_of_run_id} and executed on {typeof persistedReplayComparison?.replay_deployment_id === "string" ? persistedReplayComparison.replay_deployment_id : run.deployment_id}.
                                  </p>
                                  <Show when={persistedReplayComparison?.matched_original_deployment === false || !replayUsesSameDeployment}>
                                    <div class="mt-3 space-y-2">
                                      <For each={Array.isArray(persistedReplayComparison?.changed_nodes)
                                        ? persistedReplayComparison.changed_nodes
                                          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
                                          .slice(0, 3)
                                          .map((entry) => ({
                                            nodeId: typeof entry.node_id === "string" ? entry.node_id : "unknown",
                                            summary: Array.isArray(entry.field_changes)
                                              ? entry.field_changes
                                                .filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object")
                                                .map((change) => `${String(change.field).replaceAll("_", " ")} ${change.previous ?? "unset"} -> ${change.current ?? "unset"}`)
                                                .join(" · ")
                                              : "",
                                          }))
                                        : replayComparisonDiff.slice(0, 3).map((entry) => ({
                                            nodeId: entry.nodeId,
                                            summary: entry.changes.map((change) => `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`).join(" · "),
                                          }))}>
                                        {(entry) => (
                                          <button
                                            type="button"
                                            class={`w-full rounded-2xl border border-amber-200/70 bg-white/75 px-3 py-2 text-left transition hover:bg-white ${
                                              focusedTimelineNodeId === entry.nodeId ? "ring-2 ring-amber-300/70" : ""
                                            }`}
                                            onClick={() => focusRunTimelineNode(entry.nodeId, "replay_drift")}
                                          >
                                            <p class="text-sm font-semibold text-amber-900">{nodeLabelById().get(entry.nodeId) ?? entry.nodeId}</p>
                                            <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-700">{entry.summary}</p>
                                          </button>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            </div>
                          </Show>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <span class="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                              {timeline.length} steps
                            </span>
                            <Show when={runNodePolicyDeltaEntries.length > 0 || runEdgePolicyDeltaEntries.length > 0}>
                              <span class="rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                {runNodePolicyDeltaEntries.length} node delta{runNodePolicyDeltaEntries.length === 1 ? "" : "s"}
                              </span>
                              <span class="rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                {runEdgePolicyDeltaEntries.length} edge delta{runEdgePolicyDeltaEntries.length === 1 ? "" : "s"}
                              </span>
                            </Show>
                            <Show when={timelineFilterMode !== "all"}>
                              <button
                                type="button"
                                class="rounded-full border border-violet-200/70 bg-violet-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800 transition hover:bg-violet-100"
                                onClick={() => applyRunTimelineFilter("all")}
                              >
                                viewing {timelineFilterSummaryLabel(timelineFilterMode)}
                              </button>
                            </Show>
                            <Show when={focusedTimelineNodeLabel}>
                              <button
                                type="button"
                                class="rounded-full border border-sky-200/70 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800 transition hover:bg-sky-100"
                                onClick={() => setRunTimelineFocusNodeId(null)}
                              >
                                node {focusedTimelineNodeLabel}
                              </button>
                            </Show>
                            <Show when={durationLabel}>
                              <span class="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                                {durationLabel}
                              </span>
                            </Show>
                            <Show when={completedNodeCount > 0}>
                              <span class="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                {completedNodeCount} completed
                              </span>
                            </Show>
                            <Show when={simulatedNodeCount > 0}>
                              <span class="rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                                {simulatedNodeCount} simulated
                              </span>
                            </Show>
                            <Show when={waitingNodeCount > 0}>
                              <span class="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                                {waitingNodeCount} waiting
                              </span>
                            </Show>
                            <Show when={queuedNodeCount > 0}>
                              <span class="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                                {queuedNodeCount} queued
                              </span>
                            </Show>
                            <Show when={skippedNodeCount > 0}>
                              <span class="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                {skippedNodeCount} skipped
                              </span>
                            </Show>
                          </div>
                          <Show when={runNodePolicyDeltaEntries.length > 0 || runEdgePolicyDeltaEntries.length > 0}>
                            <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 p-3">
                              <div class="flex flex-wrap items-center gap-2">
                                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Policy drift summary</p>
                                <Show when={deploymentNodeDeltaCount > 0 || deploymentEdgeDeltaCount > 0}>
                                  <button
                                    type="button"
                                    class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white"
                                    onClick={() => setRunTimelineFilterMode("deployment_context")}
                                  >
                                    deployment {deploymentNodeDeltaCount} node{deploymentNodeDeltaCount === 1 ? "" : "s"} · {deploymentEdgeDeltaCount} edge{deploymentEdgeDeltaCount === 1 ? "" : "s"}
                                  </button>
                                </Show>
                                <Show when={replayNodeDeltaCount > 0 || replayEdgeDeltaCount > 0}>
                                  <button
                                    type="button"
                                    class="rounded-full border border-amber-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 transition hover:bg-white"
                                    onClick={() => setRunTimelineFilterMode("replay_drift")}
                                  >
                                    replay {replayNodeDeltaCount} node{replayNodeDeltaCount === 1 ? "" : "s"} · {replayEdgeDeltaCount} edge{replayEdgeDeltaCount === 1 ? "" : "s"}
                                  </button>
                                </Show>
                              </div>
                              <p class="mt-2 text-sm text-sky-900">
                                This run shows {runNodePolicyDeltaEntries.length} node-level and {runEdgePolicyDeltaEntries.length} branch-level policy drift marker{runNodePolicyDeltaEntries.length + runEdgePolicyDeltaEntries.length === 1 ? "" : "s"} on the canvas.
                              </p>
                            </div>
                          </Show>
                          <Show when={pausedAtLabel}>
                            <p class="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-amber-700">
                              Paused at {pausedAtLabel}
                            </p>
                          </Show>
                          <Show when={approvalReason}>
                            <p class="mt-2 text-sm text-amber-900">{approvalReason}</p>
                          </Show>
                          <Show when={run.status === "waiting_for_resume" && waitReason}>
                            <p class="mt-2 text-sm text-sky-900">{waitReason}</p>
                          </Show>
                          <Show when={approvalDecisionPointId}>
                            <p class="mt-2 text-xs uppercase tracking-[0.14em] text-amber-700">
                              Decision point {approvalDecisionPointId}
                            </p>
                          </Show>
                          <Show when={run.status === "waiting_for_resume" && (waitResumeFamily || waitResumeKind)}>
                            <p class="mt-2 text-xs uppercase tracking-[0.14em] text-sky-700">
                              {(waitResumeFamily ?? "timer").replaceAll("_", " ")} {waitResumeKind ? `· ${waitResumeKind.replaceAll("_", " ")}` : ""}
                            </p>
                          </Show>
                          <Show when={run.status === "waiting_for_approval" || run.status === "waiting_for_resume" || waitResumeLoading || waitResumeRecords.length > 0 || waitResumeError}>
                            <div class="mt-4 rounded-[20px] border border-sky-200/70 bg-sky-50/70 p-4">
                              <div class="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Wait / resume chain</p>
                                  <p class="mt-1 text-sm text-sky-900">
                                    Review every persisted pause, wake, approval decision, and follow-up wait for this run.
                                  </p>
                                </div>
                                <Show when={waitResumeSummary.total > 0}>
                                  <div class="flex flex-wrap gap-2">
                                    <span class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                      {waitResumeSummary.total} recorded waits
                                    </span>
                                    <Show when={waitResumeSummary.pending > 0}>
                                      <span class="rounded-full border border-amber-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                        {waitResumeSummary.pending} pending or dispatched
                                      </span>
                                    </Show>
                                    <Show when={waitResumeSummary.activeFollowup > 0}>
                                      <span class="rounded-full border border-violet-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                        {waitResumeSummary.activeFollowup} continued to new wait
                                      </span>
                                    </Show>
                                    <Show when={waitResumeSummary.resolved > 0}>
                                      <span class="rounded-full border border-emerald-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                        {waitResumeSummary.resolved} resolved
                                      </span>
                                    </Show>
                                  </div>
                                </Show>
                              </div>
                              <Show when={waitResumeLoading}>
                                <p class="mt-3 text-sm text-sky-800">Loading persisted wait records for this run.</p>
                              </Show>
                              <Show when={waitResumeError}>
                                <p class="mt-3 text-sm text-rose-700">
                                  Could not load the wait / resume chain: {waitResumeError}
                                </p>
                              </Show>
                              <Show when={!waitResumeLoading && !waitResumeError && waitResumeRecords.length === 0}>
                                <p class="mt-3 text-sm text-sky-800">
                                  This run has not recorded any durable wait / resume checkpoints yet.
                                </p>
                              </Show>
                              <Show when={waitResumeRecords.length > 0}>
                                <div class="mt-4 space-y-3">
                                  <For each={waitResumeRecords}>
                                    {(record) => {
                                      const focusNodeId = record.source_graph_node_id || record.manifest_node_id;
                                      const sourceLabel =
                                        nodeLabelById().get(record.source_graph_node_id)
                                        ?? nodeLabelById().get(record.manifest_node_id)
                                        ?? record.source_graph_node_id
                                        ?? record.manifest_node_id;
                                      const createdAtLabel = formatTimelineStamp(record.created_at);
                                      const scheduledForLabel = formatTimelineStamp(record.scheduled_for);
                                      const resumedAtLabel = formatTimelineStamp(record.resumed_at);
                                      return (
                                        <div class="rounded-[18px] border border-sky-200/70 bg-white/85 p-3">
                                          <div class="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                              <div class="flex flex-wrap items-center gap-2">
                                                <span class={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${waitResumeStatusChipClass(record.status)}`}>
                                                  {waitResumeStatusLabel(record.status)}
                                                </span>
                                                <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                                  {waitResumeFamilyLabel(record)}
                                                </span>
                                              </div>
                                              <p class="mt-2 text-sm font-semibold text-sky-950">
                                                {sourceLabel || record.wait_resume_id}
                                              </p>
                                              <Show when={record.wait_reason}>
                                                <p class="mt-1 text-sm text-sky-900">{record.wait_reason}</p>
                                              </Show>
                                            </div>
                                            <Show when={focusNodeId}>
                                              <button
                                                type="button"
                                                class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100"
                                                onClick={() => focusRunTimelineNode(focusNodeId, "all")}
                                              >
                                                Focus node
                                              </button>
                                            </Show>
                                          </div>
                                          <div class="mt-3 flex flex-wrap gap-2">
                                            <Show when={createdAtLabel}>
                                              <span class="rounded-full border border-slate-200/70 bg-slate-50/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                                Recorded {createdAtLabel}
                                              </span>
                                            </Show>
                                            <Show when={scheduledForLabel}>
                                              <span class="rounded-full border border-cyan-200/70 bg-cyan-50/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700">
                                                Scheduled {scheduledForLabel}
                                              </span>
                                            </Show>
                                            <Show when={resumedAtLabel}>
                                              <span class="rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                                Resolved {resumedAtLabel}
                                              </span>
                                            </Show>
                                            <span class="rounded-full border border-slate-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                              {record.wait_resume_id}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    }}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </Show>
                          <Show when={run.status === "waiting_for_approval" && approvalOptions.length > 0}>
                            <div class="mt-3 flex flex-wrap gap-2">
                              <For each={approvalOptions}>
                                {(option) => {
                                  const label =
                                    typeof option.label === "string"
                                      ? option.label
                                      : typeof option.option_id === "string"
                                        ? option.option_id
                                        : "Option";
                                  const decision = workflowApprovalDecisionForOption(option);
                                  return (
                                    <button
                                      type="button"
                                      class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition ${
                                        decision === "approved"
                                          ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-700 hover:bg-emerald-100"
                                          : "border-rose-200/70 bg-rose-50/85 text-rose-700 hover:bg-rose-100"
                                      } disabled:cursor-not-allowed disabled:opacity-60`}
                                      disabled={busyAction() === "workflow_approval_approved" || busyAction() === "workflow_approval_rejected"}
                                      title={
                                        decision === "approved"
                                          ? `Approve and resume this workflow run via ${label}`
                                          : `Reject and cancel this workflow run via ${label}`
                                      }
                                      aria-label={
                                        decision === "approved"
                                          ? `Approve and resume this workflow run via ${label}`
                                          : `Reject and cancel this workflow run via ${label}`
                                      }
                                      onClick={() => void handleWorkflowApprovalDecision(run, option)}
                                    >
                                      {label}
                                    </button>
                                  );
                                }}
                              </For>
                            </div>
                          </Show>
                          <Show when={blockedAtLabel}>
                            <p class="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-orange-700">
                              Blocked at {blockedAtLabel}{blockedReason ? ` · ${blockedReason}` : ""}
                            </p>
                          </Show>
                          <Show when={failedAtLabel}>
                            <p class="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-rose-700">
                              Failed at {failedAtLabel}{failedReason ? ` · ${failedReason}` : ""}
                            </p>
                          </Show>
                          <Show when={runtimeKindCounts.length > 0}>
                            <div class="mt-3 flex flex-wrap gap-2">
                              <For each={runtimeKindCounts}>
                                {(entry) => (
                                  <span class="rounded-full border border-violet-200/70 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700">
                                    {entry[0]}: {String(entry[1])}
                                  </span>
                                )}
                              </For>
                            </div>
                          </Show>
                          <Show when={focusedEdge}>
                            {(edge) => {
                              const visual = edgeExecutionVisual(focusedEdgeState);
                              return (
                                <div class="mt-4 rounded-[20px] border border-violet-200/70 bg-white/80 p-4">
                                  <div class="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Branch focus</p>
                                      <p class="mt-1 text-sm font-semibold text-violet-900">
                                        {(sourceNode?.label ?? edge().source)} {"->"} {(targetNode?.label ?? edge().target)}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
                                      onClick={() => setSelectedRunEdgeId(null)}
                                    >
                                      Clear branch
                                    </button>
                                  </div>
                                  <div class="mt-3 flex flex-wrap gap-2">
                                    <Show when={edge().condition_label}>
                                      <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                        {edge().condition_label}
                                      </span>
                                    </Show>
                                    <span
                                      class="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                                      style={{
                                        border: `1px solid ${visual.badgeBorder}`,
                                        "background-color": visual.badgeFill,
                                        color: visual.badgeText,
                                      }}
                                    >
                                      {visual.legend}
                                    </span>
                                    <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                      {focusedEdgeTimeline.length > 0 ? `${focusedEdgeTimeline.length} related steps` : "No direct timeline steps"}
                                    </span>
                                  </div>
                                  <Show when={focusedEdgeCallout}>
                                    <p class="mt-3 text-sm text-violet-900">{focusedEdgeCallout?.text}</p>
                                  </Show>
                                  <Show when={focusedEdgePolicyDelta}>
                                    <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 px-3 py-3">
                                      <div class="flex flex-wrap items-center gap-2">
                                        <span class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                          {focusedEdgePolicyDelta?.source === "replay_policy_delta" ? "Replay branch delta" : "Branch policy delta"}
                                        </span>
                                        <span class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                          {focusedEdgePolicyDelta?.relation} node
                                        </span>
                                        <span class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                          {focusedEdgePolicyDelta?.changes.length} field{focusedEdgePolicyDelta?.changes.length === 1 ? "" : "s"}
                                        </span>
                                      </div>
                                      <p class="mt-2 text-sm text-sky-900">
                                        {(nodeLabelById().get(focusedEdgePolicyDelta?.nodeId ?? "") ?? focusedEdgePolicyDelta?.nodeId ?? "Node")} influenced this branch with
                                        {" "}
                                        {focusedEdgePolicyDelta?.changes.slice(0, 3).map((change) => change.field.replaceAll("_", " ")).join(", ")}.
                                      </p>
                                      <div class="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white"
                                          onClick={() => focusPolicyDiffReview(
                                            focusedEdgePolicyDelta?.nodeId ?? edge().target,
                                            focusedEdgePolicyDelta?.source === "replay_policy_delta" ? "replay_drift" : "deployment_context",
                                            run.run_id,
                                          )}
                                        >
                                          review node delta
                                        </button>
                                        <Show when={focusedEdgePolicyDelta?.deploymentId}>
                                          <button
                                            type="button"
                                            class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white"
                                            onClick={() => focusDeploymentRecord(focusedEdgePolicyDelta?.deploymentId ?? null)}
                                          >
                                            review snapshot
                                          </button>
                                        </Show>
                                      </div>
                                    </div>
                                  </Show>
                                  <Show when={focusedEdgeTimeline.length === 0}>
                                    <p class="mt-2 text-xs text-on-surface-variant">
                                      This branch was not directly traversed in the timeline. That usually means the route was skipped before the target node executed.
                                    </p>
                                  </Show>
                                  <div class="mt-4 space-y-2">
                                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Execution log</p>
                                    <For each={focusedEdgeLogEntries}>
                                      {(entry) => (
                                        <div class={`rounded-2xl border px-3 py-3 ${entry.toneClass}`}>
                                          <p class="text-[11px] font-semibold uppercase tracking-[0.14em]">{entry.title}</p>
                                          <p class="mt-1 text-sm">{entry.text}</p>
                                        </div>
                                      )}
                                    </For>
                                  </div>
                                </div>
                              );
                            }}
                          </Show>
                          <div class="mt-3 space-y-2">
                            <Show when={focusedEdge}>
                              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Filtered timeline for selected branch</p>
                            </Show>
                            <div class="rounded-2xl border border-violet-200/70 bg-violet-100/60 px-3 py-3">
                              <div class="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Timeline review</p>
                                  <p class="mt-1 text-sm text-violet-900">
                                    {filteredTimelineEntries.length} of {unfilteredTimelineEntries.length} step{unfilteredTimelineEntries.length === 1 ? "" : "s"} visible
                                    {timelineFilterMode === "replay_drift"
                                      ? " for replay drift"
                                      : timelineFilterMode === "deployment_context"
                                        ? " with deployment context"
                                        : ""}
                                  </p>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                                      timelineFilterMode === "all"
                                        ? "border-violet-300 bg-white text-violet-800"
                                        : "border-violet-200/70 bg-white/75 text-violet-700 hover:bg-white"
                                    }`}
                                    onClick={() => setRunTimelineFilterMode("all")}
                                  >
                                    all {unfilteredTimelineEntries.length}
                                  </button>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                                      timelineFilterMode === "deployment_context"
                                        ? "border-sky-300 bg-sky-50 text-sky-800"
                                        : "border-sky-200/70 bg-white/75 text-sky-700 hover:bg-white"
                                    }`}
                                    onClick={() => setRunTimelineFilterMode("deployment_context")}
                                  >
                                    deployment context {timelineDeploymentContextCount}
                                  </button>
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                                      timelineFilterMode === "replay_drift"
                                        ? "border-amber-300 bg-amber-50 text-amber-800"
                                        : "border-amber-200/70 bg-white/75 text-amber-700 hover:bg-white"
                                    }`}
                                    onClick={() => setRunTimelineFilterMode("replay_drift")}
                                  >
                                    replay drift {timelineReplayDriftCount}
                                  </button>
                                </div>
                              </div>
                              <Show when={focusedEdge && timelineFilterMode !== "all"}>
                                <p class="mt-2 text-xs text-violet-700/80">
                                  Branch focus is cleared while reviewing {timelineFilterSummaryLabel(timelineFilterMode)} so the full run context stays visible.
                                </p>
                              </Show>
                              <Show when={focusedTimelineNodeLabel}>
                                <p class="mt-2 text-xs text-violet-700/80">
                                  Timeline review is focused on {focusedTimelineNodeLabel}. Clear the node chip above to return to all nodes in this run.
                                </p>
                              </Show>
                              <Show when={selectedDeploymentRecordId()}>
                                <p class="mt-2 text-xs text-violet-700/80">
                                  Deployment-linked timeline chips highlight the matching snapshot in deployment history below.
                                </p>
                              </Show>
                              <Show when={timelineFilterMode === "replay_drift" && timelineReplayDriftCount === 0}>
                                <p class="mt-2 text-xs text-violet-700/80">
                                  No steps in this view carry replay drift metadata yet.
                                </p>
                              </Show>
                              <Show when={timelineFilterMode === "deployment_context" && timelineDeploymentContextCount === 0}>
                                <p class="mt-2 text-xs text-violet-700/80">
                                  No steps in this view carry deployment context metadata yet.
                                </p>
                              </Show>
                            </div>
                            <Show
                              when={filteredTimelineEntries.length > 0}
                              fallback={
                                <div class="rounded-2xl border border-dashed border-violet-200/80 bg-white/60 px-4 py-4 text-sm text-violet-800">
                                  No timeline steps match the current filter in this view.
                                </div>
                              }
                            >
                              <For each={filteredTimelineEntries}>
                              {(entry, index) => {
                                const step = entry.step;
                                const stepNodeId = timelineStepNodeId(step);
                                const objective = typeof step.objective === "string" ? step.objective : "Execute workflow node";
                                const runtimeKind = typeof step.runtime_kind === "string" ? step.runtime_kind : "plan";
                                const graphNodeLabel = typeof step.graph_node_label === "string" ? step.graph_node_label : "Workflow node";
                                const graphNodeKind = typeof step.graph_node_kind === "string" ? step.graph_node_kind : "agent";
                                const manifestNodeId = typeof step.manifest_node_id === "string" ? step.manifest_node_id : null;
                                const startedAtLabel = formatTimelineStamp(step.started_at);
                                const completedAtLabel = formatTimelineStamp(step.completed_at);
                                const status = typeof step.status === "string" ? step.status : "completed";
                                const stepDuration = formatDurationMs(step.duration_ms);
                                const narrative = timelineStepNarrative(step, run);
                                const trace = timelineStepTrace(step);
                                const traceEvents = timelineTraceEvents(step);
                                const traceKind = typeof trace?.kind === "string" ? trace.kind : null;
                                const traceResumeFamily = typeof trace?.resume_family === "string" ? trace.resume_family : null;
                                const traceResumeKind = typeof trace?.resume_kind === "string" ? trace.resume_kind : null;
                                const traceWaitResumeId = typeof trace?.wait_resume_id === "string" ? trace.wait_resume_id : null;
                                const isWaitResumeEvent = traceKind === "wait_resume_dispatch";
                                const traceSource = typeof trace?.source === "string" ? trace.source : null;
                                const traceDetailMode = typeof trace?.detail_mode === "string" ? trace.detail_mode : null;
                                const traceSideEffects = typeof trace?.side_effects === "string" ? trace.side_effects : null;
                                const traceExecutionMode = typeof trace?.execution_mode === "string" ? trace.execution_mode : null;
                                const routing = trace?.routing && typeof trace.routing === "object" ? trace.routing as Record<string, unknown> : null;
                                const action = trace?.action && typeof trace.action === "object" ? trace.action as Record<string, unknown> : null;
                                const routingMode = typeof routing?.mode === "string" ? routing.mode : null;
                                const selectedConditionLabel =
                                  typeof routing?.selected_condition_label === "string" ? routing.selected_condition_label : null;
                                const selectedNodeId =
                                  typeof routing?.selected_node_id === "string" ? routing.selected_node_id : null;
                                const selectedOutgoingLabels = Array.isArray(routing?.selected_outgoing_labels)
                                  ? routing?.selected_outgoing_labels.filter((value): value is string => typeof value === "string")
                                  : [];
                                const selectedOutgoingEdgeIds = Array.isArray(routing?.selected_outgoing_edge_ids)
                                  ? routing?.selected_outgoing_edge_ids.filter((value): value is string => typeof value === "string")
                                  : [];
                                const skippedOutgoingEdgeIds = Array.isArray(routing?.skipped_outgoing_edge_ids)
                                  ? routing?.skipped_outgoing_edge_ids.filter((value): value is string => typeof value === "string")
                                  : [];
                                const decisionPointId =
                                  typeof trace?.decision_point_id === "string" ? trace.decision_point_id : null;
                                const traceReason =
                                  typeof trace?.reason === "string" ? trace.reason : null;
                                const optionCount =
                                  typeof trace?.option_count === "number" ? trace.option_count : null;
                                const actionCategory =
                                  typeof action?.action_category === "string" ? action.action_category : null;
                                const actionService =
                                  typeof action?.service === "string" ? action.service : null;
                                const actionCapabilityId =
                                  typeof action?.capability_id === "string" ? action.capability_id : null;
                                const actionOperation =
                                  typeof action?.operation === "string" ? action.operation : null;
                                const integrationFamily =
                                  typeof action?.integration_family === "string" ? action.integration_family : null;
                                const actionProvider =
                                  typeof action?.provider === "string" ? action.provider : null;
                                const actionProviderRequestId =
                                  typeof action?.provider_request_id === "string" ? action.provider_request_id : null;
                                const actionProviderStatusText =
                                  typeof action?.provider_status_text === "string" ? action.provider_status_text : null;
                                const actionProviderLatencyMs =
                                  typeof action?.provider_latency_ms === "number" ? action.provider_latency_ms : null;
                                const actionDeploymentId =
                                  typeof action?.deployment_id === "string" ? action.deployment_id : null;
                                const actionDeploymentEnvironment =
                                  typeof action?.deployment_environment === "string" ? action.deployment_environment : null;
                                const actionRuntimeTriggerKind =
                                  typeof action?.runtime_trigger_kind === "string" ? action.runtime_trigger_kind : null;
                                const actionReplayOfRunId =
                                  typeof action?.replay_of_run_id === "string" ? action.replay_of_run_id : null;
                                const actionReplayOriginalDeploymentId =
                                  typeof action?.replay_original_deployment_id === "string" ? action.replay_original_deployment_id : null;
                                const actionReplayEffectiveDeploymentId =
                                  typeof action?.replay_effective_deployment_id === "string" ? action.replay_effective_deployment_id : null;
                                const actionReplayComparedToDeploymentId =
                                  typeof action?.replay_compared_to_deployment_id === "string" ? action.replay_compared_to_deployment_id : null;
                                const actionReplayMatchedOriginalDeployment =
                                  typeof action?.replay_matched_original_deployment === "boolean" ? action.replay_matched_original_deployment : null;
                                const actionReplayChangedNodeCount =
                                  typeof action?.replay_changed_node_count === "number" ? action.replay_changed_node_count : null;
                                const actionDeliveryTier =
                                  typeof action?.delivery_tier === "string" ? action.delivery_tier : null;
                                const actionProviderRoute =
                                  typeof action?.provider_route === "string" ? action.provider_route : null;
                                const actionAuthMode =
                                  typeof action?.auth_mode === "string" ? action.auth_mode : null;
                                const actionApprovalMode =
                                  typeof action?.approval_mode === "string" ? action.approval_mode : null;
                                const actionOutcome =
                                  typeof action?.outcome === "string" ? action.outcome : null;
                                const actionConnectorStatus =
                                  typeof action?.connector_status === "string" ? action.connector_status : null;
                                const actionStatusCode =
                                  typeof action?.status_code === "number" ? action.status_code : null;
                                const actionOnTimeout =
                                  typeof action?.on_timeout === "string" ? action.on_timeout : null;
                                const actionTimeoutSeconds =
                                  typeof action?.timeout_seconds === "number" ? action.timeout_seconds : null;
                                const actionMaxAttempts =
                                  typeof action?.max_attempts === "number" ? action.max_attempts : null;
                                const actionRetryCount =
                                  typeof action?.retry_count === "number" ? action.retry_count : null;
                                const actionAllowedTools = Array.isArray(action?.allowed_tools)
                                  ? action?.allowed_tools.filter((value): value is string => typeof value === "string")
                                  : [];
                                const actionAllowedCapabilities = Array.isArray(action?.allowed_capabilities)
                                  ? action?.allowed_capabilities.filter((value): value is string => typeof value === "string")
                                  : [];
                                const actionOutboundAllowlist = Array.isArray(action?.outbound_allowlist)
                                  ? action?.outbound_allowlist.filter((value): value is string => typeof value === "string")
                                  : [];
                                const actionRequestSummary =
                                  typeof action?.request_summary === "string" ? action.request_summary : null;
                                const actionResultSummary =
                                  typeof action?.result_summary === "string" ? action.result_summary : null;
                                const actionDeployment = actionDeploymentId ? deploymentHistoryById().get(actionDeploymentId) ?? null : null;
                                const actionReplayEffectiveDeployment =
                                  actionReplayEffectiveDeploymentId ? deploymentHistoryById().get(actionReplayEffectiveDeploymentId) ?? null : null;
                                const actionReplayComparedDeployment =
                                  actionReplayComparedToDeploymentId ? deploymentHistoryById().get(actionReplayComparedToDeploymentId) ?? null : null;
                                const stepDeploymentFieldChanges = deploymentChangeSummaryFieldChangesForNode(
                                  actionDeployment,
                                  stepNodeId,
                                );
                                const replayPolicyDiffEntry = deploymentPolicyDiffEntryForNode(
                                  actionReplayComparedDeployment,
                                  actionReplayEffectiveDeployment,
                                  stepNodeId,
                                );
                                const stepPolicyFieldChanges = replayPolicyDiffEntry?.changes.length
                                  ? replayPolicyDiffEntry.changes
                                  : stepDeploymentFieldChanges;
                                const stepPolicyFieldSummary = stepPolicyFieldChanges
                                  .map((change) => `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`)
                                  .join(" · ");
                                const stepPolicyFieldSource = replayPolicyDiffEntry?.changes.length
                                  ? "Replay policy delta"
                                  : stepDeploymentFieldChanges.length > 0
                                    ? "Deployment policy delta"
                                    : null;
                                const relationBadge =
                                  entry.relation === "from"
                                    ? "bg-sky-100 text-sky-700"
                                    : entry.relation === "to"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-violet-100 text-violet-700";
                                const statusClass =
                                  status === "failed"
                                    ? "bg-rose-100 text-rose-700"
                                    : status === "blocked"
                                      ? "bg-orange-100 text-orange-700"
                                      : status === "waiting_for_resume"
                                        ? "bg-sky-100 text-sky-700"
                                      : status === "skipped"
                                        ? "bg-slate-100 text-slate-600"
                                      : status === "waiting_for_approval"
                                    ? "bg-amber-100 text-amber-700"
                                    : status === "queued"
                                      ? "bg-slate-200 text-slate-700"
                                      : status === "simulated"
                                        ? "bg-cyan-100 text-cyan-700"
                                        : "bg-violet-100 text-violet-700";
                                return (
                                  <div class={`rounded-2xl border px-3 py-3 ${isWaitResumeEvent ? "border-sky-200/70 bg-sky-50/40" : "border-violet-200/70 bg-white/80"}`}>
                                    <div class="flex items-center justify-between gap-3">
                                      <p class={`text-sm font-semibold ${isWaitResumeEvent ? "text-sky-900" : "text-violet-900"}`}>{focusedEdge ? entry.timelineIndex + 1 : index() + 1}. {objective}</p>
                                      <div class="flex flex-wrap items-center gap-2">
                                        <Show when={focusedEdge}>
                                          <span class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${relationBadge}`}>
                                            {entry.relation}
                                          </span>
                                        </Show>
                                        <span class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass}`}>{status}</span>
                                      </div>
                                    </div>
                                    <div class="mt-1 flex flex-wrap gap-2">
                                      <span class="text-xs uppercase tracking-[0.14em] text-violet-600">{graphNodeLabel}</span>
                                      <span class="text-xs uppercase tracking-[0.14em] text-violet-500">{graphNodeKind}</span>
                                      <span class="text-xs uppercase tracking-[0.14em] text-violet-500">{runtimeKind}{stepDuration ? ` · ${stepDuration}` : ""}</span>
                                      <Show when={manifestNodeId}>
                                        <span class="text-xs uppercase tracking-[0.14em] text-violet-500">{manifestNodeId}</span>
                                      </Show>
                                    </div>
                                    <Show when={startedAtLabel || completedAtLabel}>
                                      <p class="mt-1 text-xs text-on-surface-variant">
                                        {startedAtLabel ? `started ${startedAtLabel}` : ""}
                                        {startedAtLabel && completedAtLabel ? " · " : ""}
                                        {completedAtLabel ? `completed ${completedAtLabel}` : ""}
                                      </p>
                                    </Show>
                                    <Show when={traceKind || traceSource || traceDetailMode || traceSideEffects || traceExecutionMode || routingMode || selectedOutgoingLabels.length > 0 || selectedOutgoingEdgeIds.length > 0 || skippedOutgoingEdgeIds.length > 0 || decisionPointId || traceReason || optionCount !== null || actionCategory || actionService || actionCapabilityId || actionOperation || integrationFamily || actionProvider || actionProviderRequestId || actionProviderStatusText || actionProviderLatencyMs !== null || actionDeploymentId || actionDeploymentEnvironment || actionRuntimeTriggerKind || actionReplayOfRunId || actionReplayOriginalDeploymentId || actionReplayEffectiveDeploymentId || actionReplayComparedToDeploymentId || actionReplayMatchedOriginalDeployment !== null || actionReplayChangedNodeCount !== null || actionDeliveryTier || actionProviderRoute || actionAuthMode || actionApprovalMode || actionOutcome || actionConnectorStatus || actionStatusCode !== null || actionOnTimeout || actionTimeoutSeconds !== null || actionMaxAttempts !== null || actionRetryCount !== null || actionAllowedTools.length > 0 || actionAllowedCapabilities.length > 0 || actionOutboundAllowlist.length > 0 || actionRequestSummary || actionResultSummary}>
                                      <div class="mt-3 flex flex-wrap gap-2">
                                        <Show when={traceSource}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            source {traceSource?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={traceDetailMode}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            detail {traceDetailMode?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={traceSideEffects}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            effects {traceSideEffects?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={traceExecutionMode}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            execution {traceExecutionMode?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={actionCategory}>
                                          <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700">
                                            {actionCategory?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={integrationFamily}>
                                          <span class="rounded-full border border-fuchsia-200/70 bg-fuchsia-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-fuchsia-700">
                                            {integrationFamily?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={actionOutcome}>
                                          <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700">
                                            outcome {actionOutcome}
                                          </span>
                                        </Show>
                                        <Show when={actionConnectorStatus}>
                                          <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700">
                                            status {actionConnectorStatus?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={actionStatusCode !== null}>
                                          <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700">
                                            code {actionStatusCode}
                                          </span>
                                        </Show>
                                        <Show when={actionAuthMode}>
                                          <span class="rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-700">
                                            auth {actionAuthMode?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={actionApprovalMode}>
                                          <span class="rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-700">
                                            approval {actionApprovalMode?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={actionService}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            service {actionService}
                                          </span>
                                        </Show>
                                        <Show when={actionProvider}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            provider {actionProvider}
                                          </span>
                                        </Show>
                                        <Show when={actionProviderRequestId}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            request {actionProviderRequestId}
                                          </span>
                                        </Show>
                                        <Show when={actionProviderStatusText}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            provider {actionProviderStatusText}
                                          </span>
                                        </Show>
                                        <Show when={actionProviderLatencyMs !== null}>
                                          <span class="rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700">
                                            latency {actionProviderLatencyMs}ms
                                          </span>
                                        </Show>
                                        <Show when={actionDeploymentId}>
                                          <button
                                            type="button"
                                            class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition ${
                                              selectedDeploymentRecordId() === actionDeploymentId
                                                ? "border-sky-300/80 bg-sky-100 text-sky-800"
                                                : "border-slate-200/70 bg-slate-50/90 text-slate-700 hover:bg-slate-100"
                                            }`}
                                            onClick={() => focusDeploymentRecord(actionDeploymentId)}
                                          >
                                            deployment {actionDeploymentId}
                                          </button>
                                        </Show>
                                        <Show when={actionDeploymentEnvironment}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            env {actionDeploymentEnvironment}
                                          </span>
                                        </Show>
                                        {/* Item 10: family-coloured trigger provenance chip */}
                                        <Show when={actionRuntimeTriggerKind}>
                                          {(kind) => {
                                            const family = triggerFamilyFromKind(kind());
                                            const chipClass = triggerProvenanceChipClass(family);
                                            return (
                                              <span class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${chipClass}`}
                                                title={`Activated by ${family} trigger (kind: ${kind()})`}>
                                                {family === "manual" || family === "replay" ? kind() : `${family} · ${kind()}`}
                                              </span>
                                            );
                                          }}
                                        </Show>
                                        <Show when={actionReplayOfRunId}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            replay {actionReplayOfRunId}
                                          </span>
                                        </Show>
                                        <Show when={actionReplayOriginalDeploymentId}>
                                          <button
                                            type="button"
                                            class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition ${
                                              selectedDeploymentRecordId() === actionReplayOriginalDeploymentId
                                                ? "border-indigo-300/80 bg-indigo-100 text-indigo-800"
                                                : "border-indigo-200/70 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100"
                                            }`}
                                            onClick={() => focusDeploymentRecord(actionReplayOriginalDeploymentId)}
                                          >
                                            original deploy {actionReplayOriginalDeploymentId}
                                          </button>
                                        </Show>
                                        <Show when={actionReplayEffectiveDeploymentId}>
                                          <button
                                            type="button"
                                            class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition ${
                                              selectedDeploymentRecordId() === actionReplayEffectiveDeploymentId
                                                ? "border-indigo-300/80 bg-indigo-100 text-indigo-800"
                                                : "border-indigo-200/70 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100"
                                            }`}
                                            onClick={() => focusDeploymentRecord(actionReplayEffectiveDeploymentId)}
                                          >
                                            replay deploy {actionReplayEffectiveDeploymentId}
                                          </button>
                                        </Show>
                                        <Show when={actionReplayComparedToDeploymentId}>
                                          <button
                                            type="button"
                                            class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition ${
                                              selectedDeploymentRecordId() === actionReplayComparedToDeploymentId
                                                ? "border-indigo-300/80 bg-indigo-100 text-indigo-800"
                                                : "border-indigo-200/70 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100"
                                            }`}
                                            onClick={() => focusDeploymentRecord(actionReplayComparedToDeploymentId)}
                                          >
                                            compared {actionReplayComparedToDeploymentId}
                                          </button>
                                        </Show>
                                        <Show when={actionReplayMatchedOriginalDeployment !== null}>
                                          <span class={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${actionReplayMatchedOriginalDeployment ? "border-emerald-200/70 bg-emerald-50/80 text-emerald-700" : "border-amber-200/70 bg-amber-50/80 text-amber-700"}`}>
                                            {actionReplayMatchedOriginalDeployment ? "matched replay" : "drifted replay"}
                                          </span>
                                        </Show>
                                        <Show when={actionReplayChangedNodeCount !== null}>
                                          <span class="rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700">
                                            replay delta {actionReplayChangedNodeCount}
                                          </span>
                                        </Show>
                                        <Show when={actionDeliveryTier}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            tier {actionDeliveryTier}
                                          </span>
                                        </Show>
                                        <Show when={actionProviderRoute}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            route {actionProviderRoute}
                                          </span>
                                        </Show>
                                        <Show when={actionCapabilityId}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            capability {actionCapabilityId}
                                          </span>
                                        </Show>
                                        <Show when={actionOperation}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            action {actionOperation}
                                          </span>
                                        </Show>
                                        <Show when={actionTimeoutSeconds !== null}>
                                          <span class="rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700">
                                            timeout {actionTimeoutSeconds}s
                                          </span>
                                        </Show>
                                        <Show when={actionMaxAttempts !== null}>
                                          <span class="rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700">
                                            attempts {actionMaxAttempts}
                                          </span>
                                        </Show>
                                        <Show when={actionRetryCount !== null}>
                                          <span class="rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700">
                                            retries {actionRetryCount}
                                          </span>
                                        </Show>
                                        <Show when={actionOnTimeout}>
                                          <span class="rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700">
                                            on timeout {actionOnTimeout}
                                          </span>
                                        </Show>
                                        <Show when={actionAllowedTools.length > 0}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            tools {actionAllowedTools.join(", ")}
                                          </span>
                                        </Show>
                                        <Show when={actionAllowedCapabilities.length > 0}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            allowed caps {actionAllowedCapabilities.join(", ")}
                                          </span>
                                        </Show>
                                        <Show when={actionOutboundAllowlist.length > 0}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            outbound {actionOutboundAllowlist.join(", ")}
                                          </span>
                                        </Show>
                                        <Show when={traceKind}>
                                          <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700">
                                            {traceKind?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={routingMode}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            {routingMode?.replaceAll("_", " ")}
                                          </span>
                                        </Show>
                                        <Show when={selectedConditionLabel}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            route {selectedConditionLabel}
                                          </span>
                                        </Show>
                                        <Show when={selectedNodeId}>
                                          <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700">
                                            target {selectedNodeId}
                                          </span>
                                        </Show>
                                        <Show when={selectedOutgoingLabels.length > 0}>
                                          <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700">
                                            labels {selectedOutgoingLabels.join(", ")}
                                          </span>
                                        </Show>
                                        <Show when={selectedOutgoingEdgeIds.length > 0}>
                                          <span class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700">
                                            {selectedOutgoingEdgeIds.length} selected edge{selectedOutgoingEdgeIds.length === 1 ? "" : "s"}
                                          </span>
                                        </Show>
                                        <Show when={skippedOutgoingEdgeIds.length > 0}>
                                          <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
                                            {skippedOutgoingEdgeIds.length} skipped edge{skippedOutgoingEdgeIds.length === 1 ? "" : "s"}
                                          </span>
                                        </Show>
                                        <Show when={decisionPointId}>
                                          <span class="rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-700">
                                            decision {decisionPointId}
                                          </span>
                                        </Show>
                                        <Show when={optionCount !== null}>
                                          <span class="rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-700">
                                            {optionCount} option{optionCount === 1 ? "" : "s"}
                                          </span>
                                        </Show>
                                      </div>
                                    </Show>
                                    <Show when={actionRequestSummary}>
                                      <p class="mt-2 text-xs text-on-surface-variant">{actionRequestSummary}</p>
                                    </Show>
                                    <Show when={actionResultSummary}>
                                      <p class="mt-1 text-xs text-on-surface-variant">{actionResultSummary}</p>
                                    </Show>
                                    <Show when={stepPolicyFieldChanges.length > 0}>
                                      <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-3">
                                        <div class="flex flex-wrap items-center gap-2">
                                          <span class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                            {stepPolicyFieldSource}
                                          </span>
                                          <Show when={stepNodeId}>
                                            <button
                                              type="button"
                                              class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white"
                                              onClick={() => setSelectedNodeId(stepNodeId)}
                                            >
                                              node {nodeLabelById().get(stepNodeId ?? "") ?? stepNodeId}
                                            </button>
                                          </Show>
                                          <Show when={actionReplayEffectiveDeploymentId ?? actionDeploymentId}>
                                            <button
                                              type="button"
                                              class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white"
                                              onClick={() => focusDeploymentRecord(actionReplayEffectiveDeploymentId ?? actionDeploymentId)}
                                            >
                                              review snapshot
                                            </button>
                                          </Show>
                                        </div>
                                        <p class="mt-2 text-xs text-sky-900">{stepPolicyFieldSummary}</p>
                                      </div>
                                    </Show>
                                    <Show when={traceReason}>
                                      <p class="mt-2 text-xs text-on-surface-variant">{traceReason}</p>
                                    </Show>
                                    <Show when={traceEvents.length > 0}>
                                      <div class="mt-3 space-y-2 rounded-2xl border border-violet-200/60 bg-violet-50/50 px-3 py-3">
                                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">Step events</p>
                                        <For each={traceEvents}>
                                          {(event) => {
                                            const payloadChips = timelineEventPayloadChips(event.payload);
                                            return (
                                            <div class="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                                              <div class="flex flex-wrap items-center gap-2">
                                                <span class="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                                  {event.kind.replaceAll("_", " ")}
                                                </span>
                                                <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                                                  {event.title}
                                                </span>
                                              </div>
                                              <p class="mt-1 text-xs text-on-surface-variant">{event.summary}</p>
                                              <Show when={payloadChips.length > 0}>
                                                <div class="mt-2 flex flex-wrap gap-2">
                                                  <For each={payloadChips}>
                                                    {(chip) => (
                                                      <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-700">
                                                        {chip}
                                                      </span>
                                                    )}
                                                  </For>
                                                </div>
                                              </Show>
                                            </div>
                                          )}}
                                        </For>
                                      </div>
                                    </Show>
                                    <div class={`mt-3 rounded-2xl border px-3 py-2 text-sm ${narrative.toneClass}`}>
                                      {narrative.text}
                                    </div>
                                    <Show when={isWaitResumeEvent}>
                                      <div class="mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-2">
                                        <div class="flex flex-wrap items-center gap-2">
                                          <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Wait / resume event</span>
                                          <Show when={traceResumeFamily}>
                                            <span class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                              {traceResumeFamily?.replaceAll("_", " ")}
                                            </span>
                                          </Show>
                                          <Show when={traceResumeKind && traceResumeKind !== traceResumeFamily}>
                                            <span class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                              {traceResumeKind?.replaceAll("_", " ")}
                                            </span>
                                          </Show>
                                          <Show when={traceWaitResumeId}>
                                            <span class="rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sky-600">
                                              {traceWaitResumeId}
                                            </span>
                                          </Show>
                                        </div>
                                      </div>
                                    </Show>
                                  </div>
                                );
                              }}
                              </For>
                            </Show>
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
