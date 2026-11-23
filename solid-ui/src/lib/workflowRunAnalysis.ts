// Pure utility functions for run-state analysis, edge-execution mapping, and
// timeline step inspection.  No Solid.js signals or JSX — safe to import from
// any module without pulling in the full component tree.

import {
  approvalDraftPreviewSummary,
  approvalReviewTrustSummary,
  type AutonomyDecisionLike,
} from "afp-ts/continuity";
import type { WorkflowRun } from "@/lib/api";
import {
  approvalReviewFromUnknown,
  approvalDraftPreviewFromUnknown,
  approvalStateRecord,
  approvalStateString,
  approvalStateStringArray,
  autonomyDecisionWithTierFallback,
} from "@/lib/approvalReviewState";
import { isRecord } from "@/lib/eventDetail";
import type { WorkflowExecutionExplanationChip } from "@/lib/workflowExecutionExplanationChip";
import {
  workflowApprovalGateLabel,
  workflowApprovalBranchStatusSummary,
  workflowApprovalPendingSummary,
  workflowApprovalReasonSummary,
} from "@/lib/workflowGraphCopy";
import {
  workflowApprovalDecisionFollowUpParts,
  workflowApprovalDecisionFollowUpSummary,
  workflowApprovalRunStatusSummary,
} from "@/lib/workflowApprovalState";
import type {
  EdgeExecutionState,
  RunTimelineFilterMode,
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "./workflowGraphTypes";

type WorkflowApprovalReview = {
  title: string;
  reason: string;
  approvalKind: string | null;
  confidence: string | null;
  provenanceSummary: string | null;
  sourceRefs: string[];
  consequenceSummaryLines: string[];
  optionCount: number;
  draftPreviewLabel: string | null;
  draftPreviewContent: string | null;
  draftPreviewContentType: string | null;
  autonomy_decision: AutonomyDecisionLike | null;
};

export type WorkflowApprovalReviewPanelState = {
  reviewValue: ReturnType<typeof approvalReviewFromUnknown>;
  showPanel: boolean;
  fallbackReasonText: string | null;
  autonomyDecision: AutonomyDecisionLike | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function skillCapsuleTraceRecord(trace: Record<string, unknown> | null): Record<string, unknown> | null {
  return isRecord(trace?.skill_capsule) ? trace.skill_capsule : null;
}

function skillCapsuleOutcomeKind(
  result: Record<string, unknown> | null,
  trace?: Record<string, unknown> | null,
): string | null {
  const traceSkillCapsule = skillCapsuleTraceRecord(trace ?? null);
  return approvalStateString(trace?.skill_capsule_outcome_kind)
    ?? approvalStateString(traceSkillCapsule?.outcome_kind)
    ?? approvalStateString(result?.skill_capsule_outcome_kind);
}

function skillCapsuleReceiptStatus(
  result: Record<string, unknown> | null,
  trace?: Record<string, unknown> | null,
): string | null {
  const traceSkillCapsule = skillCapsuleTraceRecord(trace ?? null);
  return approvalStateString(traceSkillCapsule?.receipt_status)
    ?? approvalStateString(result?.skill_capsule_receipt_status);
}

function skillCapsuleOutcomeMessage(args: {
  label?: string | null;
  outcomeKind: string | null;
  receiptStatus?: string | null;
  status: "blocked" | "failed";
}): string | null {
  const label = args.label?.trim() || "This workflow step";
  switch (args.outcomeKind) {
    case "receipt_blocked":
      return `${label} was blocked by the skill capsule runtime receipt.`;
    case "receipt_failed":
      return args.status === "failed"
        ? `${label} failed because the skill capsule runtime receipt reported a failed execution.`
        : `${label} was blocked after the skill capsule runtime receipt reported a failed execution.`;
    case "bridge_error":
      return `${label} could not reach the skill capsule runtime bridge during execution.`;
    case "receipt_completed":
      return args.status === "failed"
        ? `${label} failed after the skill capsule runtime completed.`
        : `${label} was blocked after the skill capsule runtime completed.`;
    default:
      if (args.receiptStatus === "BLOCKED") {
        return `${label} was blocked by the skill capsule runtime receipt.`;
      }
      if (args.receiptStatus === "FAILED") {
        return `${label} failed because the skill capsule runtime receipt reported a failed execution.`;
      }
      return null;
  }
}

export function workflowRunApprovalReview(run: WorkflowRun | null): WorkflowApprovalReview | null {
  const review = approvalStateRecord(run?.result?.approval_review);
  if (!review) return null;
  const title = approvalStateString(review.title) ?? "Approval review";
  const reason = approvalStateString(review.reason) ?? workflowApprovalReasonSummary();
  const consequenceSummaryLines = approvalStateStringArray(review.consequence_summary_lines);
  const draftPreview = approvalDraftPreviewFromUnknown(review.draft_preview);
  const optionCountRaw = review.option_count;
  const optionCount =
    typeof optionCountRaw === "number" && Number.isFinite(optionCountRaw) ? optionCountRaw : 0;
  return {
    title,
    reason,
    approvalKind: approvalStateString(review.approval_kind),
    confidence: approvalStateString(review.confidence),
    provenanceSummary: approvalStateString(review.provenance_summary),
    sourceRefs: approvalStateStringArray(review.source_refs),
    consequenceSummaryLines,
    optionCount,
    draftPreviewLabel: draftPreview?.label ?? null,
    draftPreviewContent: draftPreview?.content ?? null,
    draftPreviewContentType: draftPreview?.content_type ?? null,
    autonomy_decision: autonomyDecisionWithTierFallback(
      review.autonomy_decision,
      review.autonomy_tier,
    ),
  };
}

export function workflowRunApprovalReviewPanelState(
  run: WorkflowRun | null,
): WorkflowApprovalReviewPanelState {
  const reviewRecord = approvalStateRecord(run?.result?.approval_review);
  const reviewValue = approvalReviewFromUnknown(reviewRecord) ?? null;
  const fallbackReasonText = approvalStateString(reviewRecord?.reason)
    ?? approvalStateString(run?.result?.approval_reason)
    ?? null;
  const autonomyDecision =
    autonomyDecisionWithTierFallback(reviewRecord?.autonomy_decision, reviewRecord?.autonomy_tier)
    ?? reviewValue?.autonomy_decision
    ?? null;
  return {
    reviewValue,
    showPanel: Boolean(reviewValue || autonomyDecision),
    fallbackReasonText,
    autonomyDecision,
  };
}

export function workflowApprovalPreviewSummary(review: WorkflowApprovalReview | null): string | null {
  return approvalDraftPreviewSummary({
    draft_preview: review
      ? {
          content: review.draftPreviewContent,
          content_type: review.draftPreviewContentType,
        }
      : null,
  });
}

function workflowApprovalReviewTrustSummary(review: WorkflowApprovalReview | null): string | null {
  if (!review) return null;
  return approvalReviewTrustSummary({
    source_refs: review.sourceRefs,
    provenance_summary: review.provenanceSummary,
    consequence_summary_lines: review.consequenceSummaryLines,
  });
}

function workflowApprovalReviewConfidenceSummary(review: WorkflowApprovalReview | null): string | null {
  const confidence = review?.confidence?.trim() ?? "";
  return confidence ? `${confidence} confidence.` : null;
}

export function workflowApprovalReviewCompactSummary(review: WorkflowApprovalReview | null): string | null {
  return [
    workflowApprovalReviewConfidenceSummary(review),
    workflowApprovalReviewTrustSummary(review),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    || null;
}

export function workflowRunActionFeedback(args: {
  kind: "start" | "replay";
  replayRunId?: string | null;
  run: WorkflowRun;
}): string {
  if (args.run.status === "waiting_for_approval") {
    const approvalReview = workflowRunApprovalReview(args.run);
    return workflowApprovalRunStatusSummary({
      runId: args.run.run_id,
      reason: approvalReview?.reason,
      trustSummary: workflowApprovalReviewCompactSummary(approvalReview),
      consequenceSummary: approvalReview?.consequenceSummaryLines?.[0] ?? null,
      provenanceSummary: approvalReview?.provenanceSummary ?? null,
      previewSummary: workflowApprovalPreviewSummary(approvalReview),
    });
  }
  if (args.run.status === "waiting_for_resume") {
    return `Workflow run ${args.run.run_id} is waiting for a delayed resume.`;
  }
  if (args.run.status === "blocked") {
    return `Workflow run ${args.run.run_id} was blocked by policy.`;
  }
  if (args.run.status === "failed") {
    return `Workflow run ${args.run.run_id} failed.`;
  }
  return args.kind === "replay"
    ? `Replay started from run ${args.replayRunId} as ${args.run.run_id}.`
    : `Workflow run ${args.run.run_id} completed.`;
}

export function workflowDryRunFeedback(run: WorkflowRun): string {
  if (run.status === "waiting_for_approval") {
    const approvalReview = workflowRunApprovalReview(run);
    return workflowApprovalRunStatusSummary({
      runId: run.run_id,
      reason: approvalReview?.reason,
      trustSummary: workflowApprovalReviewCompactSummary(approvalReview),
      consequenceSummary: approvalReview?.consequenceSummaryLines?.[0] ?? null,
      provenanceSummary: approvalReview?.provenanceSummary ?? null,
      previewSummary: workflowApprovalPreviewSummary(approvalReview),
      dryRun: true,
    });
  }
  if (run.status === "waiting_for_resume") {
    return `Dry run ${run.run_id} paused at a delayed resume boundary.`;
  }
  if (run.status === "blocked") {
    return `Dry run ${run.run_id} was blocked by policy.`;
  }
  if (run.status === "failed") {
    return `Dry run ${run.run_id} failed.`;
  }
  return `Dry run ${run.run_id} completed.`;
}

function workflowRunApprovalDecisionSummary(run: WorkflowRun | null): {
  decision: string | null;
  consequenceSummary: string | null;
  note: string | null;
  optionLabel: string | null;
} {
  const decisionRecord = asRecord(run?.result?.approval_decision);
  const selectedOption = approvalStateRecord(decisionRecord?.selected_option);
  return {
    decision: approvalStateString(decisionRecord?.decision),
    consequenceSummary: approvalStateString(selectedOption?.consequence_summary),
    note: approvalStateString(decisionRecord?.note),
    optionLabel: approvalStateString(selectedOption?.label) ?? approvalStateString(selectedOption?.option_id),
  };
}

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
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

// ---------------------------------------------------------------------------
// Run timeline indexing
// ---------------------------------------------------------------------------

export function runTimelineSteps(run: unknown): Array<Record<string, unknown>> {
  if (!run || typeof run !== "object") return [];
  const timeline = (run as { timeline?: unknown }).timeline;
  return Array.isArray(timeline)
    ? timeline.filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object" && !Array.isArray(step))
    : [];
}

export function runNodeStatuses(run: WorkflowRun | null): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const step of runTimelineSteps(run)) {
    const nodeId = typeof step.node_id === "string" ? step.node_id : null;
    const status = typeof step.status === "string" ? step.status : null;
    if (nodeId && status) statuses.set(nodeId, status);
  }
  return statuses;
}

export function runStepOrder(run: WorkflowRun | null): Map<string, number> {
  const order = new Map<string, number>();
  for (const [index, step] of runTimelineSteps(run).entries()) {
    const nodeId = typeof step.node_id === "string" ? step.node_id : null;
    if (nodeId && !order.has(nodeId)) order.set(nodeId, index + 1);
  }
  return order;
}

export function recentFailedRunNodeIds(runs: readonly unknown[], recentRunLimit = 3): Set<string> {
  const failedNodeIds = new Set<string>();
  if (recentRunLimit <= 0) return failedNodeIds;
  for (const run of runs.slice(0, recentRunLimit)) {
    for (const step of runTimelineSteps(run)) {
      if (step.status !== "failed" && step.status !== "error") continue;
      const nodeId = typeof step.node_id === "string" && step.node_id.trim()
        ? step.node_id.trim()
        : null;
      if (nodeId) failedNodeIds.add(nodeId);
    }
  }
  return failedNodeIds;
}

export type ReplayStepState = {
  done: boolean;
  nextIndex: number;
  nextNodeId: string | null;
};

export function nextReplayStepState(
  currentIndex: number,
  steps: readonly Record<string, unknown>[],
): ReplayStepState {
  if (currentIndex >= steps.length - 1) {
    return { done: true, nextIndex: currentIndex, nextNodeId: null };
  }
  const nextIndex = currentIndex + 1;
  const step = steps[nextIndex];
  const nextNodeId = typeof step?.node_id === "string" && step.node_id.trim()
    ? step.node_id.trim()
    : null;
  return { done: false, nextIndex, nextNodeId };
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
        label: workflowApprovalGateLabel(),
        legend: workflowApprovalGateLabel(1, true),
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
      const approvalReview = workflowRunApprovalReview(run);
      const approvalReason =
        approvalReview?.reason
          ?? (typeof result.approval_reason === "string" && result.approval_reason.trim()
            ? result.approval_reason.trim()
            : null)
          ?? workflowApprovalPendingSummary();
      const compactTrustSummary = workflowApprovalReviewCompactSummary(approvalReview);
      const consequencePreview = approvalReview?.consequenceSummaryLines?.[0];
      const draftPreview = workflowApprovalPreviewSummary(approvalReview);
      text = consequencePreview
        ? `${prefix}${approvalReason}${compactTrustSummary ? ` ${compactTrustSummary}` : ""} Next: ${consequencePreview}`
        : draftPreview
          ? `${prefix}${approvalReason}${compactTrustSummary ? ` ${compactTrustSummary}` : ""} Preview: ${draftPreview}`
          : workflowApprovalPendingSummary();
      if (!consequencePreview && !draftPreview) {
        text = `${prefix}${approvalReason}${compactTrustSummary ? ` ${compactTrustSummary}` : ""}`;
      }
      break;
    }
    case "blocked": {
      const blockedReason =
        skillCapsuleOutcomeMessage({
          label: routeLabel ? `${routeLabel} path` : "This path",
          outcomeKind: skillCapsuleOutcomeKind(result),
          receiptStatus: skillCapsuleReceiptStatus(result),
          status: "blocked",
        })
        ?? (typeof result.blocked_reason === "string" && result.blocked_reason.trim()
          ? result.blocked_reason.trim()
          : "Blocked by policy");
      text = `${prefix}${blockedReason}`;
      break;
    }
    case "failed": {
      const failedReason =
        skillCapsuleOutcomeMessage({
          label: routeLabel ? `${routeLabel} path` : "This path",
          outcomeKind: skillCapsuleOutcomeKind(result),
          receiptStatus: skillCapsuleReceiptStatus(result),
          status: "failed",
        })
        ?? (typeof result.failed_reason === "string" && result.failed_reason.trim()
          ? result.failed_reason.trim()
          : "Execution failed");
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

import { surfaceDateTimeLabel } from "./surfaceTimestampPresentation";

// ---------------------------------------------------------------------------
// Timeline step helpers
// ---------------------------------------------------------------------------

export function formatTimelineStamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return surfaceDateTimeLabel(parsed.toISOString()) || null;
}

export function timelineStepTrace(step: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(step.trace) ? step.trace : null;
}

export function timelineStepAction(step: Record<string, unknown>): Record<string, unknown> | null {
  const trace = timelineStepTrace(step);
  return isRecord(trace?.action) ? trace.action : null;
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
    case "failed":
      return typeof step.status === "string" && step.status === "failed";
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
    case "failed":
      return "failed steps";
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
      if (!isRecord(event)) return null;
      const record = event;
      const kind = typeof record.kind === "string" ? record.kind : "event";
      const title = typeof record.title === "string" ? record.title : "Event";
      const summary = typeof record.summary === "string" ? record.summary : "";
      const payload = isRecord(record.payload) ? record.payload : {};
      return { kind, title, summary, payload };
    })
    .filter(
      (event): event is { kind: string; title: string; summary: string; payload: Record<string, unknown> } =>
        Boolean(event),
    );
}

export function timelineEventPayloadChips(payload: unknown): string[] {
  const normalizedPayload = asRecord(payload) ?? {};
  const chips: string[] = [];
  const actionPayload = asRecord(normalizedPayload.action);
  const pushIf = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) chips.push(`${label} ${value}`);
    else if (typeof value === "number" && Number.isFinite(value)) chips.push(`${label} ${value}`);
  };
  pushIf("source", normalizedPayload.trace_source);
  pushIf("detail", normalizedPayload.trace_detail_mode);
  pushIf("effects", normalizedPayload.trace_side_effects);
  pushIf("execution", normalizedPayload.trace_execution_mode);
  pushIf("request", normalizedPayload.provider_request_id);
  pushIf("provider", normalizedPayload.provider_status_text);
  pushIf(
    "latency",
    typeof normalizedPayload.provider_latency_ms === "number"
      ? `${normalizedPayload.provider_latency_ms}ms`
      : null,
  );
  pushIf("deployment", normalizedPayload.deployment_id);
  pushIf("env", normalizedPayload.deployment_environment);
  pushIf("trigger", normalizedPayload.runtime_trigger_kind);
  pushIf("replay", normalizedPayload.replay_of_run_id);
  pushIf("tier", normalizedPayload.delivery_tier);
  pushIf("route", normalizedPayload.provider_route);
  pushIf("attempt", normalizedPayload.attempt);
  pushIf("service", normalizedPayload.service);
  pushIf("operation", normalizedPayload.operation);
  pushIf("auth", normalizedPayload.auth_mode);
  pushIf("routing", normalizedPayload.routing_mode);
  pushIf("approval", normalizedPayload.decision);
  pushIf("decision", normalizedPayload.decision_point_id);
  pushIf("option", normalizedPayload.option_id);
  pushIf("option label", normalizedPayload.option_label);
  pushIf("options", normalizedPayload.option_count);
  pushIf("status", normalizedPayload.connector_status);
  pushIf("code", normalizedPayload.status_code);
  pushIf("retries", normalizedPayload.retry_count);
  pushIf("attempts", normalizedPayload.max_attempts);
  pushIf(
    "timeout",
    typeof normalizedPayload.timeout_seconds === "number" ? `${normalizedPayload.timeout_seconds}s` : null,
  );
  pushIf("on timeout", normalizedPayload.on_timeout);
  pushIf("consequence", normalizedPayload.consequence_summary ?? normalizedPayload.option_consequence);
  pushIf("result", normalizedPayload.result_summary ?? actionPayload?.result_summary);
  pushIf("note", normalizedPayload.note);

  const selectedLabels = Array.isArray(normalizedPayload.selected_labels)
    ? normalizedPayload.selected_labels.filter(
        (value: unknown): value is string => typeof value === "string" && value.trim().length > 0,
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
  options?: { includeApprovalDecisionDetails?: boolean },
): { text: string; toneClass: string } {
  const status = typeof step.status === "string" ? step.status : "completed";
  const label = typeof step.graph_node_label === "string" ? step.graph_node_label : "Workflow node";
  const runtimeKind = typeof step.runtime_kind === "string" ? step.runtime_kind : "plan";
  const explicitReason =
    typeof step.state_reason === "string" && step.state_reason.trim() ? step.state_reason.trim() : null;
  const result = run?.result ?? {};
  const trace = timelineStepTrace(step);
  const skillCapsuleOutcome = skillCapsuleOutcomeKind(result, trace);
  const skillCapsuleReceipt = skillCapsuleReceiptStatus(result, trace);
  const approvalDecision = workflowRunApprovalDecisionSummary(run);
  const includeApprovalDecisionDetails = options?.includeApprovalDecisionDetails ?? true;
  const approvalDecisionSuffix =
    includeApprovalDecisionDetails
      ? workflowApprovalDecisionFollowUpSummary({
          optionLabel: approvalDecision.optionLabel,
          consequenceSummary: approvalDecision.consequenceSummary,
          note: approvalDecision.note,
        })
      : null;

  switch (status) {
    case "waiting_for_approval": {
      const approvalReview = workflowRunApprovalReview(run);
      const approvalReason =
        explicitReason
          ?? approvalReview?.reason
          ?? (typeof result.approval_reason === "string" && result.approval_reason.trim()
            ? result.approval_reason.trim()
            : null)
          ?? workflowApprovalReasonSummary(label);
      const trustSummary = workflowApprovalReviewCompactSummary(approvalReview);
      const consequencePreview = approvalReview?.consequenceSummaryLines?.[0];
      const draftPreview = workflowApprovalPreviewSummary(approvalReview);
      const provenanceSummary = approvalReview?.provenanceSummary;
      const narrative = consequencePreview
        ? `${approvalReason}${trustSummary ? ` ${trustSummary}` : ""} Next consequence: ${consequencePreview}`
        : draftPreview
          ? `${approvalReason}${trustSummary ? ` ${trustSummary}` : ""} Preview: ${draftPreview}`
        : provenanceSummary && provenanceSummary !== approvalReason
          ? `${approvalReason}${trustSummary ? ` ${trustSummary}` : ""} ${provenanceSummary}`
          : trustSummary
            ? `${approvalReason} ${trustSummary}`
            : approvalReason;
      return { text: narrative, toneClass: "border-amber-200/70 bg-amber-50/80 text-amber-900" };
    }
    case "blocked": {
      const blockedReason =
        explicitReason
          ?? skillCapsuleOutcomeMessage({
            label,
            outcomeKind: skillCapsuleOutcome,
            receiptStatus: skillCapsuleReceipt,
            status: "blocked",
          })
          ?? (typeof result.blocked_reason === "string" && result.blocked_reason.trim()
            ? result.blocked_reason.trim()
            : null)
          ?? `${label} was blocked by policy.`;
      return { text: blockedReason, toneClass: "border-orange-200/70 bg-orange-50/80 text-orange-900" };
    }
    case "failed": {
      const failedReason =
        explicitReason
          ?? skillCapsuleOutcomeMessage({
            label,
            outcomeKind: skillCapsuleOutcome,
            receiptStatus: skillCapsuleReceipt,
            status: "failed",
          })
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
      const trace = isRecord(step.trace) ? step.trace : null;
      const resumeFamily =
        typeof trace?.resume_family === "string" ? trace.resume_family.replaceAll("_", " ") : null;
      const resumeKind =
        typeof trace?.resume_kind === "string" ? trace.resume_kind.replaceAll("_", " ") : null;
      const resumeLabel =
        resumeFamily && resumeKind && resumeFamily !== resumeKind
          ? `${resumeFamily} · ${resumeKind}`
          : resumeFamily ?? resumeKind ?? "wait";
      return {
        text:
          explicitReason
          ?? [
            `Workflow resumed after ${resumeLabel} and is ready for downstream execution.`,
            approvalDecisionSuffix,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" "),
        toneClass: "border-sky-200/70 bg-sky-50/80 text-sky-900",
      };
    }
    case "cancelled": {
      const cancelReason =
        explicitReason
          ?? (typeof result.cancel_reason === "string" && result.cancel_reason.trim()
            ? result.cancel_reason.replaceAll("_", " ").trim()
            : null)
          ?? "Workflow was cancelled.";
      return {
        text: [cancelReason, approvalDecisionSuffix]
          .filter((value): value is string => Boolean(value))
          .join(" "),
        toneClass: "border-slate-200/70 bg-slate-50/90 text-slate-700",
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
    const approvalTrustSummary =
      edgeState === "waiting_for_approval"
        ? workflowApprovalReviewCompactSummary(workflowRunApprovalReview(run))
        : null;
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
                ? workflowApprovalBranchStatusSummary(routePrefix, approvalTrustSummary)
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
        : visual.legend === workflowApprovalGateLabel(1, true) ? "border-amber-200/70 bg-amber-50/80 text-amber-900"
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

export function compactExecutionLogEntries(
  run: WorkflowRun | null,
): Array<{
  detailLines: string[];
  index: number;
  phase: string;
  title: string;
  text: string;
  toneClass: string;
}> {
  if (!run || !Array.isArray(run.timeline)) return [];
  return run.timeline.map((step, i) => {
    const nodeId = timelineStepNodeId(step) ?? `step-${i}`;
    const status = typeof step["status"] === "string" ? step["status"] : "unknown";
    const narrative = timelineStepNarrative(step, run, { includeApprovalDecisionDetails: false });
    const rawLabel = step["label"] ?? step["node_type"];
    const title = typeof rawLabel === "string" ? rawLabel : nodeId;
    const approvalDecision = workflowRunApprovalDecisionSummary(run);
    const detailLines =
      status === "resumed_pending_execution" || status === "cancelled"
        ? workflowApprovalDecisionFollowUpParts({
            optionLabel: approvalDecision.optionLabel,
            consequenceSummary: approvalDecision.consequenceSummary,
            note: approvalDecision.note,
          })
        : [];
    return {
      detailLines,
      index: i,
      phase: status,
      title,
      text: narrative.text,
      toneClass: narrative.toneClass,
    };
  });
}

export function workflowExecutionExplanationChip(
  run: WorkflowRun | null,
): WorkflowExecutionExplanationChip | null {
  if (!run) return null;
  if (run.status === "waiting_for_approval") return { label: "Approval", className: "text-amber-600" };
  if (run.status === "waiting_for_resume") return { label: "Waiting", className: "text-sky-600" };
  if (run.status === "resumed_pending_execution") return { label: "Resumed", className: "text-cyan-600" };
  if (run.status === "blocked") return { label: "Blocked", className: "text-orange-600" };
  if (run.status === "failed") return { label: "Failed", className: "text-red-500" };
  if (run.status === "queued") return { label: "Queued", className: "text-slate-600" };
  if (run.status === "cancelled") return { label: "Cancelled", className: "text-outline" };
  if (run.status === "partial") return { label: "Partial", className: "text-amber-400" };
  const hasSimulated =
    Array.isArray(run.timeline) &&
    run.timeline.some((s) => s["status"] === "simulated");
  if (hasSimulated) return { label: "Simulated", className: "text-blue-400" };
  if (run.replay_of_run_id) return { label: "Replay", className: "text-amber-500" };
  return null;
}

export function workflowExecutionExplanationText(run: WorkflowRun | null): string | null {
  if (!run) return null;
  const result = asRecord(run.result);
  const skillCapsuleOutcome = skillCapsuleOutcomeKind(result);
  const skillCapsuleReceipt = skillCapsuleReceiptStatus(result);
  if (run.replay_of_run_id) return `Replay of run ${run.replay_of_run_id.slice(0, 8)}...`;
  if (run.status === "waiting_for_approval") {
    const approvalReview = workflowRunApprovalReview(run);
    const explicitApprovalReason =
      typeof run.result?.approval_reason === "string" && run.result.approval_reason.trim()
        ? run.result.approval_reason.trim()
        : null;
    if (!approvalReview && !explicitApprovalReason) {
      return workflowApprovalPendingSummary();
    }
    return workflowApprovalRunStatusSummary({
      runId: run.run_id,
      subjectText: "This run",
      reason:
        approvalReview?.reason
        ?? explicitApprovalReason
        ?? workflowApprovalPendingSummary(),
      trustSummary: workflowApprovalReviewCompactSummary(approvalReview),
      consequenceSummary: approvalReview?.consequenceSummaryLines?.[0] ?? null,
      provenanceSummary: approvalReview?.provenanceSummary ?? null,
      previewSummary: workflowApprovalPreviewSummary(approvalReview),
    });
  }
  if (run.status === "waiting_for_resume") {
    return typeof run.result?.wait_reason === "string" && run.result.wait_reason.trim()
      ? run.result.wait_reason.trim()
      : "Waiting for a scheduled or event-driven resume.";
  }
  if (run.status === "blocked") {
    return skillCapsuleOutcomeMessage({
      label: "This run",
      outcomeKind: skillCapsuleOutcome,
      receiptStatus: skillCapsuleReceipt,
      status: "blocked",
    })
      ?? (typeof run.result?.blocked_reason === "string" && run.result.blocked_reason.trim()
        ? run.result.blocked_reason.trim()
        : "Blocked by policy before completion.");
  }
  if (run.status === "failed") {
    const reason =
      skillCapsuleOutcomeMessage({
        label: "This run",
        outcomeKind: skillCapsuleOutcome,
        receiptStatus: skillCapsuleReceipt,
        status: "failed",
      })
      ?? (typeof run.result?.failure_reason === "string" && run.result.failure_reason.trim()
        ? run.result.failure_reason.trim()
        : typeof run.result?.failed_reason === "string" && run.result.failed_reason.trim()
          ? run.result.failed_reason.trim()
          : undefined);
    return reason ? `Failed: ${reason}` : "This run encountered an error and stopped early.";
  }
  if (run.status === "queued") {
    return typeof run.result?.queued_reason === "string" && run.result.queued_reason.trim()
      ? run.result.queued_reason.trim()
      : "Queued behind an upstream gate or unfinished branch outcome.";
  }
  if (run.status === "cancelled") {
    const approvalDecision = workflowRunApprovalDecisionSummary(run);
    const cancelReason =
      typeof run.result?.cancel_reason === "string" && run.result.cancel_reason.trim()
        ? run.result.cancel_reason.trim().replaceAll("_", " ")
        : "Run was cancelled before completion.";
    return [
      cancelReason,
      workflowApprovalDecisionFollowUpSummary({
        optionLabel: approvalDecision.optionLabel,
        consequenceSummary: approvalDecision.consequenceSummary,
        note: approvalDecision.note,
      }),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }
  if (run.status === "resumed_pending_execution") {
    const approvalDecision = workflowRunApprovalDecisionSummary(run);
    const resumeSummary =
      typeof run.result?.summary === "string" && run.result.summary.trim()
        ? run.result.summary.trim()
        : "Workflow resumed and is ready for downstream execution.";
    return [
      resumeSummary,
      workflowApprovalDecisionFollowUpSummary({
        optionLabel: approvalDecision.optionLabel,
        consequenceSummary: approvalDecision.consequenceSummary,
        note: approvalDecision.note,
      }),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }
  if (run.status === "partial") return "Some steps were skipped or did not complete.";
  const hasSimulated =
    Array.isArray(run.timeline) &&
    run.timeline.some((s) => s["status"] === "simulated");
  if (hasSimulated) return "One or more steps ran in simulation mode without real side-effects.";
  return null;
}

export function workflowExecutionCurrentStateExplanationText(run: WorkflowRun | null): string | null {
  if (!run) return null;
  if (!run.replay_of_run_id) return workflowExecutionExplanationText(run);
  const currentRun: WorkflowRun = {
    ...run,
    replay_of_run_id: null,
  };
  return workflowExecutionExplanationText(currentRun);
}
