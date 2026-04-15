// Pure utility functions for run-state analysis, edge-execution mapping, and
// timeline step inspection.  No Solid.js signals or JSX — safe to import from
// any module without pulling in the full component tree.

import type { WorkflowRun } from "@/lib/api";
import type {
  EdgeExecutionState,
  RunTimelineFilterMode,
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "./workflowGraphTypes";

// ---------------------------------------------------------------------------
// Canvas geometry
// ---------------------------------------------------------------------------

export function edgeLine(graph: WorkflowGraphDraft, edge: WorkflowEdgeDraft) {
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

export function truncateCanvasLabel(value: string, maxLength = 46): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Run timeline indexing
// ---------------------------------------------------------------------------

export function runNodeStatuses(run: WorkflowRun | null): Map<string, string> {
  const statuses = new Map<string, string>();
  if (!run || !Array.isArray(run.timeline)) return statuses;
  for (const step of run.timeline) {
    const nodeId = typeof step.node_id === "string" ? step.node_id : null;
    const status = typeof step.status === "string" ? step.status : null;
    if (nodeId && status) statuses.set(nodeId, status);
  }
  return statuses;
}

export function runStepOrder(run: WorkflowRun | null): Map<string, number> {
  const order = new Map<string, number>();
  if (!run || !Array.isArray(run.timeline)) return order;
  for (const [index, step] of run.timeline.entries()) {
    const nodeId = typeof step.node_id === "string" ? step.node_id : null;
    if (nodeId && !order.has(nodeId)) order.set(nodeId, index + 1);
  }
  return order;
}

// ---------------------------------------------------------------------------
// Edge execution state
// ---------------------------------------------------------------------------

export function runEdgeStates(
  graph: WorkflowGraphDraft | null,
  run: WorkflowRun | null,
): Map<string, EdgeExecutionState> {
  const states = new Map<string, EdgeExecutionState>();
  if (!graph || !run || !Array.isArray(run.timeline)) return states;

  const traversedEdgeIds = Array.isArray(run.result?.traversed_edge_ids)
    ? run.result.traversed_edge_ids.filter((value): value is string => typeof value === "string")
    : [];
  const skippedEdgeIds = Array.isArray(run.result?.skipped_edge_ids)
    ? run.result.skipped_edge_ids.filter((value): value is string => typeof value === "string")
    : [];

  if (traversedEdgeIds.length > 0 || skippedEdgeIds.length > 0) {
    for (const edgeId of traversedEdgeIds) {
      const timelineHasSimulation = Array.isArray(run.timeline)
        && run.timeline.some((step) => typeof step.status === "string" && step.status === "simulated");
      states.set(edgeId, timelineHasSimulation ? "simulated" : "completed");
    }
    for (const edgeId of skippedEdgeIds) {
      if (!states.has(edgeId)) states.set(edgeId, "skipped");
    }
    return states;
  }

  const steps = run.timeline
    .map((step) => ({
      nodeId: typeof step.node_id === "string" ? step.node_id : null,
      status: typeof step.status === "string" ? step.status : null,
    }))
    .filter((step): step is { nodeId: string; status: string | null } => Boolean(step.nodeId));

  for (let index = 0; index < steps.length - 1; index += 1) {
    const current = steps[index];
    const next = steps[index + 1];
    const edge = graph.edges.find(
      (candidate) => candidate.source === current.nodeId && candidate.target === next.nodeId,
    );
    if (!edge) continue;
    const state: EdgeExecutionState =
      next.status === "failed"
        ? "failed"
        : next.status === "blocked"
          ? "blocked"
          : next.status === "waiting_for_resume"
            ? "waiting_for_resume"
            : next.status === "waiting_for_approval"
              ? "waiting_for_approval"
              : current.status === "queued" || next.status === "queued"
                ? "queued"
                : current.status === "simulated" || next.status === "simulated"
                  ? "simulated"
                  : "completed";
    states.set(edge.id, state);
  }
  return states;
}

export function edgeExecutionVisual(state?: EdgeExecutionState): {
  stroke: string;
  badgeFill: string;
  badgeBorder: string;
  badgeText: string;
  dasharray?: string;
  label: string;
  legend: string;
} {
  switch (state) {
    case "failed":
      return {
        stroke: "rgba(239, 68, 68, 0.9)",
        badgeFill: "rgba(254, 242, 242, 0.96)",
        badgeBorder: "rgba(252, 165, 165, 0.95)",
        badgeText: "#b91c1c",
        label: "failed path",
        legend: "Failed branch",
      };
    case "blocked":
      return {
        stroke: "rgba(249, 115, 22, 0.9)",
        badgeFill: "rgba(255, 247, 237, 0.96)",
        badgeBorder: "rgba(253, 186, 116, 0.95)",
        badgeText: "#c2410c",
        label: "blocked path",
        legend: "Blocked branch",
      };
    case "waiting_for_approval":
      return {
        stroke: "rgba(245, 158, 11, 0.9)",
        badgeFill: "rgba(255, 251, 235, 0.96)",
        badgeBorder: "rgba(252, 211, 77, 0.95)",
        badgeText: "#b45309",
        label: "approval gate",
        legend: "Approval gate",
      };
    case "waiting_for_resume":
      return {
        stroke: "rgba(59, 130, 246, 0.88)",
        badgeFill: "rgba(239, 246, 255, 0.96)",
        badgeBorder: "rgba(147, 197, 253, 0.95)",
        badgeText: "#1d4ed8",
        label: "delayed resume",
        legend: "Delayed resume",
      };
    case "queued":
      return {
        stroke: "rgba(100, 116, 139, 0.72)",
        badgeFill: "rgba(248, 250, 252, 0.96)",
        badgeBorder: "rgba(203, 213, 225, 0.96)",
        badgeText: "#475569",
        label: "queued path",
        legend: "Queued branch",
      };
    case "skipped":
      return {
        stroke: "rgba(148, 163, 184, 0.5)",
        badgeFill: "rgba(248, 250, 252, 0.92)",
        badgeBorder: "rgba(203, 213, 225, 0.92)",
        badgeText: "#64748b",
        dasharray: "7 7",
        label: "skipped path",
        legend: "Skipped branch",
      };
    case "simulated":
      return {
        stroke: "rgba(6, 182, 212, 0.88)",
        badgeFill: "rgba(236, 254, 255, 0.96)",
        badgeBorder: "rgba(103, 232, 249, 0.96)",
        badgeText: "#0f766e",
        label: "simulated path",
        legend: "Simulated branch",
      };
    case "completed":
      return {
        stroke: "rgba(16, 185, 129, 0.82)",
        badgeFill: "rgba(236, 253, 245, 0.96)",
        badgeBorder: "rgba(110, 231, 183, 0.96)",
        badgeText: "#047857",
        label: "path taken",
        legend: "Taken branch",
      };
    default:
      return {
        stroke: "rgba(37, 99, 235, 0.52)",
        badgeFill: "rgba(255, 255, 255, 0.96)",
        badgeBorder: "rgba(191, 219, 254, 0.96)",
        badgeText: "#1d4ed8",
        label: "route",
        legend: "Available branch",
      };
  }
}

// ---------------------------------------------------------------------------
// Canvas callout for edges
// ---------------------------------------------------------------------------

export function runEdgeCanvasCallout(
  run: WorkflowRun | null,
  edge: WorkflowEdgeDraft,
  edgeState: EdgeExecutionState | undefined,
): { text: string; fill: string; border: string; textColor: string } | null {
  if (!run || !edgeState) return null;
  const result = run.result ?? {};
  const routeLabel = edge.condition_label?.trim();
  const visual = edgeExecutionVisual(edgeState);
  const prefix = routeLabel ? `${routeLabel}: ` : "";

  let text: string;
  switch (edgeState) {
    case "waiting_for_approval": {
      const approvalReason =
        typeof result.approval_reason === "string" && result.approval_reason.trim()
          ? result.approval_reason.trim()
          : "Waiting for approval";
      text = `${prefix}${approvalReason}`;
      break;
    }
    case "blocked": {
      const blockedReason =
        typeof result.blocked_reason === "string" && result.blocked_reason.trim()
          ? result.blocked_reason.trim()
          : "Blocked by policy";
      text = `${prefix}${blockedReason}`;
      break;
    }
    case "failed": {
      const failedReason =
        typeof result.failed_reason === "string" && result.failed_reason.trim()
          ? result.failed_reason.trim()
          : "Execution failed";
      text = `${prefix}${failedReason}`;
      break;
    }
    case "queued":
      text = `${prefix}Queued behind an upstream gate`;
      break;
    case "skipped":
      text = `${prefix}Not taken`;
      break;
    case "simulated":
      text = `${prefix}Dry-run path`;
      break;
    case "completed":
      text = routeLabel ? `${routeLabel}: path taken` : "Path taken";
      break;
    default:
      return null;
  }

  return {
    text: truncateCanvasLabel(text),
    fill: visual.badgeFill,
    border: visual.badgeBorder,
    textColor: visual.badgeText,
  };
}

// ---------------------------------------------------------------------------
// Timeline step helpers
// ---------------------------------------------------------------------------

export function formatTimelineStamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

export function timelineStepTrace(step: Record<string, unknown>): Record<string, unknown> | null {
  return step.trace && typeof step.trace === "object" ? step.trace as Record<string, unknown> : null;
}

export function timelineStepAction(step: Record<string, unknown>): Record<string, unknown> | null {
  const trace = timelineStepTrace(step);
  return trace?.action && typeof trace.action === "object"
    ? trace.action as Record<string, unknown>
    : null;
}

export function timelineStepNodeId(step: Record<string, unknown>): string | null {
  if (typeof step.node_id === "string" && step.node_id.trim()) return step.node_id;
  if (typeof step.manifest_node_id === "string" && step.manifest_node_id.trim()) return step.manifest_node_id;
  return null;
}

export function timelineStepHasDeploymentContext(step: Record<string, unknown>): boolean {
  const action = timelineStepAction(step);
  if (!action) return false;
  return typeof action.deployment_id === "string"
    || typeof action.deployment_environment === "string"
    || typeof action.provider_route === "string"
    || typeof action.delivery_tier === "string"
    || typeof action.auth_mode === "string"
    || typeof action.replay_of_run_id === "string"
    || typeof action.replay_original_deployment_id === "string"
    || typeof action.replay_effective_deployment_id === "string"
    || typeof action.replay_compared_to_deployment_id === "string";
}

export function timelineStepHasReplayDrift(step: Record<string, unknown>): boolean {
  const action = timelineStepAction(step);
  if (!action) return false;
  const matchedOriginalDeployment =
    typeof action.replay_matched_original_deployment === "boolean"
      ? action.replay_matched_original_deployment
      : null;
  const changedNodeCount =
    typeof action.replay_changed_node_count === "number"
      ? action.replay_changed_node_count
      : null;
  return matchedOriginalDeployment === false || (changedNodeCount !== null && changedNodeCount > 0);
}

export function timelineStepMatchesFilter(
  step: Record<string, unknown>,
  filterMode: RunTimelineFilterMode,
): boolean {
  switch (filterMode) {
    case "deployment_context":
      return timelineStepHasDeploymentContext(step);
    case "replay_drift":
      return timelineStepHasReplayDrift(step);
    case "all":
    default:
      return true;
  }
}

export function timelineFilterSummaryLabel(filterMode: RunTimelineFilterMode): string {
  switch (filterMode) {
    case "deployment_context":
      return "deployment context";
    case "replay_drift":
      return "replay drift";
    case "all":
    default:
      return "all steps";
  }
}

// ---------------------------------------------------------------------------
// Timeline slice for edge focus
// ---------------------------------------------------------------------------

export function runTimelineSliceForEdge(
  graph: WorkflowGraphDraft | null,
  run: WorkflowRun | null,
  edgeId: string | null,
): Array<{ step: Record<string, unknown>; timelineIndex: number; relation: "from" | "to" | "related" }> {
  if (!graph || !run || !edgeId || !Array.isArray(run.timeline)) return [];
  const edge = graph.edges.find((entry) => entry.id === edgeId);
  if (!edge) return [];

  const timeline = run.timeline;
  for (let index = 0; index < timeline.length - 1; index += 1) {
    const currentNodeId = typeof timeline[index]?.node_id === "string" ? String(timeline[index].node_id) : null;
    const nextNodeId = typeof timeline[index + 1]?.node_id === "string" ? String(timeline[index + 1].node_id) : null;
    if (currentNodeId === edge.source && nextNodeId === edge.target) {
      return [
        { step: timeline[index], timelineIndex: index, relation: "from" },
        { step: timeline[index + 1], timelineIndex: index + 1, relation: "to" },
      ];
    }
  }

  return timeline
    .map((step, timelineIndex) => ({
      step,
      timelineIndex,
      nodeId: typeof step.node_id === "string" ? String(step.node_id) : null,
    }))
    .filter((entry) => entry.nodeId === edge.source || entry.nodeId === edge.target)
    .map((entry) => ({
      step: entry.step,
      timelineIndex: entry.timelineIndex,
      relation: (entry.nodeId === edge.source ? "from" : "to") as "from" | "to",
    }));
}

// ---------------------------------------------------------------------------
// Timeline trace events and chips
// ---------------------------------------------------------------------------

export function timelineTraceEvents(
  step: Record<string, unknown>,
): Array<{ kind: string; title: string; summary: string; payload: Record<string, unknown> }> {
  const trace = timelineStepTrace(step);
  const raw = Array.isArray(trace?.events) ? trace.events : [];
  return raw
    .map((event) => {
      if (!event || typeof event !== "object") return null;
      const record = event as Record<string, unknown>;
      const kind = typeof record.kind === "string" ? record.kind : "event";
      const title = typeof record.title === "string" ? record.title : "Event";
      const summary = typeof record.summary === "string" ? record.summary : "";
      const payload =
        record.payload && typeof record.payload === "object"
          ? record.payload as Record<string, unknown>
          : {};
      return { kind, title, summary, payload };
    })
    .filter(
      (event): event is { kind: string; title: string; summary: string; payload: Record<string, unknown> } =>
        Boolean(event),
    );
}

export function timelineEventPayloadChips(payload: Record<string, unknown>): string[] {
  const chips: string[] = [];
  const pushIf = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) chips.push(`${label} ${value}`);
    else if (typeof value === "number" && Number.isFinite(value)) chips.push(`${label} ${value}`);
  };
  pushIf("source", payload.trace_source);
  pushIf("detail", payload.trace_detail_mode);
  pushIf("effects", payload.trace_side_effects);
  pushIf("execution", payload.trace_execution_mode);
  pushIf("request", payload.provider_request_id);
  pushIf("provider", payload.provider_status_text);
  pushIf("latency", typeof payload.provider_latency_ms === "number" ? `${payload.provider_latency_ms}ms` : null);
  pushIf("deployment", payload.deployment_id);
  pushIf("env", payload.deployment_environment);
  pushIf("trigger", payload.runtime_trigger_kind);
  pushIf("replay", payload.replay_of_run_id);
  pushIf("tier", payload.delivery_tier);
  pushIf("route", payload.provider_route);
  pushIf("attempt", payload.attempt);
  pushIf("service", payload.service);
  pushIf("operation", payload.operation);
  pushIf("auth", payload.auth_mode);
  pushIf("routing", payload.routing_mode);
  pushIf("decision", payload.decision_point_id);
  pushIf("options", payload.option_count);
  pushIf("status", payload.connector_status);
  pushIf("code", payload.status_code);
  pushIf("retries", payload.retry_count);
  pushIf("attempts", payload.max_attempts);
  pushIf("timeout", typeof payload.timeout_seconds === "number" ? `${payload.timeout_seconds}s` : null);
  pushIf("on timeout", payload.on_timeout);

  const selectedLabels = Array.isArray(payload.selected_labels)
    ? payload.selected_labels.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )
    : [];
  if (selectedLabels.length > 0) chips.push(`labels ${selectedLabels.join(", ")}`);

  return chips;
}

// ---------------------------------------------------------------------------
// Timeline step narrative
// ---------------------------------------------------------------------------

export function timelineStepNarrative(
  step: Record<string, unknown>,
  run: WorkflowRun | null,
): { text: string; toneClass: string } {
  const status = typeof step.status === "string" ? step.status : "completed";
  const label = typeof step.graph_node_label === "string" ? step.graph_node_label : "Workflow node";
  const runtimeKind = typeof step.runtime_kind === "string" ? step.runtime_kind : "plan";
  const explicitReason =
    typeof step.state_reason === "string" && step.state_reason.trim() ? step.state_reason.trim() : null;
  const result = run?.result ?? {};

  switch (status) {
    case "waiting_for_approval": {
      const approvalReason =
        explicitReason
          ?? (typeof result.approval_reason === "string" && result.approval_reason.trim()
            ? result.approval_reason.trim()
            : null)
          ?? `${label} is waiting for approval.`;
      return { text: approvalReason, toneClass: "border-amber-200/70 bg-amber-50/80 text-amber-900" };
    }
    case "blocked": {
      const blockedReason =
        explicitReason
          ?? (typeof result.blocked_reason === "string" && result.blocked_reason.trim()
            ? result.blocked_reason.trim()
            : null)
          ?? `${label} was blocked by policy.`;
      return { text: blockedReason, toneClass: "border-orange-200/70 bg-orange-50/80 text-orange-900" };
    }
    case "failed": {
      const failedReason =
        explicitReason
          ?? (typeof result.failed_reason === "string" && result.failed_reason.trim()
            ? result.failed_reason.trim()
            : null)
          ?? `${label} failed during execution.`;
      return { text: failedReason, toneClass: "border-rose-200/70 bg-rose-50/80 text-rose-900" };
    }
    case "queued":
      return {
        text: explicitReason ?? "Queued behind an upstream gate or unfinished branch outcome.",
        toneClass: "border-slate-200/70 bg-slate-100/90 text-slate-800",
      };
    case "skipped":
      return {
        text: explicitReason ?? "Skipped because another branch path was selected earlier in the run.",
        toneClass: "border-slate-200/70 bg-slate-50/90 text-slate-700",
      };
    case "simulated":
      return {
        text: explicitReason ?? `Simulated ${label} in dry-run mode without executing live side effects.`,
        toneClass: "border-cyan-200/70 bg-cyan-50/80 text-cyan-900",
      };
    case "waiting_for_resume": {
      const waitReason =
        explicitReason
          ?? (typeof result.wait_reason === "string" && result.wait_reason.trim()
            ? result.wait_reason.trim()
            : null)
          ?? `${label} is waiting for a scheduled or event-driven resume.`;
      return { text: waitReason, toneClass: "border-sky-200/70 bg-sky-50/80 text-sky-900" };
    }
    case "resumed_pending_execution": {
      const trace = step.trace && typeof step.trace === "object" ? step.trace as Record<string, unknown> : null;
      const resumeFamily =
        typeof trace?.resume_family === "string" ? trace.resume_family.replaceAll("_", " ") : null;
      const resumeKind =
        typeof trace?.resume_kind === "string" ? trace.resume_kind.replaceAll("_", " ") : null;
      const resumeLabel =
        resumeFamily && resumeKind && resumeFamily !== resumeKind
          ? `${resumeFamily} · ${resumeKind}`
          : resumeFamily ?? resumeKind ?? "wait";
      return {
        text: explicitReason ?? `Workflow resumed after ${resumeLabel} and is ready for downstream execution.`,
        toneClass: "border-sky-200/70 bg-sky-50/80 text-sky-900",
      };
    }
    default:
      return {
        text: explicitReason ?? `${label} completed successfully through ${runtimeKind}.`,
        toneClass: "border-emerald-200/70 bg-emerald-50/80 text-emerald-900",
      };
  }
}

// ---------------------------------------------------------------------------
// Branch execution log (edge focus panel)
// ---------------------------------------------------------------------------

export function branchExecutionLogEntries(
  graph: WorkflowGraphDraft | null,
  run: WorkflowRun | null,
  edgeId: string | null,
): Array<{ title: string; text: string; toneClass: string }> {
  if (!graph || !run || !edgeId) return [];
  const edge = graph.edges.find((entry) => entry.id === edgeId);
  if (!edge) return [];
  const edgeState = runEdgeStates(graph, run).get(edgeId);
  const sourceNode = graph.nodes.find((node) => node.id === edge.source);
  const targetNode = graph.nodes.find((node) => node.id === edge.target);
  const entries: Array<{ title: string; text: string; toneClass: string }> = [];
  const routeLabel = edge.condition_label?.trim();
  const routePrefix = routeLabel ? `${routeLabel} branch` : "Branch";

  if (edgeState) {
    const visual = edgeExecutionVisual(edgeState);
    const branchText =
      edgeState === "completed"
        ? `${routePrefix} was taken during the run.`
        : edgeState === "simulated"
          ? `${routePrefix} was explored during dry-run simulation.`
          : edgeState === "skipped"
            ? `${routePrefix} was available but not selected.`
            : edgeState === "queued"
              ? `${routePrefix} is queued behind an upstream decision or gate.`
              : edgeState === "waiting_for_approval"
                ? `${routePrefix} is paused at an approval boundary.`
                : edgeState === "blocked"
                  ? `${routePrefix} was blocked by policy before continuing.`
                  : `${routePrefix} failed before it could complete.`;
    entries.push({
      title: "Branch state",
      text: branchText,
      toneClass: `border ${
        visual.legend === "Taken branch" ? "border-emerald-200/70 bg-emerald-50/80 text-emerald-900"
        : visual.legend === "Simulated branch" ? "border-cyan-200/70 bg-cyan-50/80 text-cyan-900"
        : visual.legend === "Skipped branch" ? "border-slate-200/70 bg-slate-50/90 text-slate-700"
        : visual.legend === "Queued branch" ? "border-slate-200/70 bg-slate-100/90 text-slate-800"
        : visual.legend === "Approval gate" ? "border-amber-200/70 bg-amber-50/80 text-amber-900"
        : visual.legend === "Blocked branch" ? "border-orange-200/70 bg-orange-50/80 text-orange-900"
        : "border-rose-200/70 bg-rose-50/80 text-rose-900"
      }`,
    });
  }

  const relatedSteps = runTimelineSliceForEdge(graph, run, edgeId);
  for (const related of relatedSteps) {
    const step = related.step;
    const nodeLabel =
      typeof step.graph_node_label === "string"
        ? step.graph_node_label
        : related.relation === "from"
          ? (sourceNode as WorkflowNodeDraft | undefined)?.label ?? edge.source
          : (targetNode as WorkflowNodeDraft | undefined)?.label ?? edge.target;
    const narrative = timelineStepNarrative(step, run);
    entries.push({
      title:
        related.relation === "from"
          ? `Source node · ${nodeLabel}`
          : related.relation === "to"
            ? `Target node · ${nodeLabel}`
            : `Related node · ${nodeLabel}`,
      text: narrative.text,
      toneClass: `border ${narrative.toneClass}`,
    });
  }

  if (entries.length === 0) {
    entries.push({
      title: "Branch state",
      text: `${routePrefix} has no direct timeline steps yet. It may not have been reached in this run.`,
      toneClass: "border border-slate-200/70 bg-slate-50/90 text-slate-700",
    });
  }

  return entries;
}
