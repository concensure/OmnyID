// @locs-version: 1.0
import {
  approvalDraftPreviewSummary,
  approvalEventLabel,
  sourceCountSummary,
} from "afp-ts/continuity";

import type { WorkflowRun } from "@/lib/api";
import {
  approvalDraftPreviewFromUnknown,
  approvalStateRecord,
  approvalStateString,
  approvalStateStringArray,
} from "@/lib/approvalReviewState";
import { workflowApprovalDecisionFollowUpSummary } from "@/lib/workflowApprovalState";
import { workflowApprovalReviewCompactSummary } from "@/lib/workflowRunAnalysis";
import type { WorkflowNodeDraft } from "@/lib/workflowGraphTypes";

type WorkflowApprovalReviewSummaryState = {
  reasonText: string | null;
  trustSummaryText: string | null;
  consequenceSummaryText: string | null;
  provenanceSummaryText: string | null;
  sourceSummaryText: string | null;
  previewSummaryText: string | null;
};

type WorkflowApprovalDecisionSummaryState = {
  decision: "approved" | "rejected" | null;
  consequenceSummaryText: string | null;
  noteText: string | null;
  optionLabelText: string | null;
};

type WorkflowSkillCapsuleState = {
  outcomeKind: string | null;
  receiptStatus: string | null;
};

type WorkflowRunResultState = {
  result: Record<string, unknown>;
  status: WorkflowRun["status"];
  structuredReasonText: string | null;
  pausedAtLabel: string | null;
  approvalReasonText: string | null;
  waitReasonText: string | null;
  blockedAtLabel: string | null;
  blockedReasonText: string | null;
  failedAtLabel: string | null;
  failedReasonText: string | null;
  cancelReasonText: string | null;
  summaryText: string | null;
  approvalReview: WorkflowApprovalReviewSummaryState;
  approvalDecision: WorkflowApprovalDecisionSummaryState;
};

type WorkflowNodeCanvasCalloutState = {
  text: string;
  className: string;
} | null;

const WORKFLOW_RUN_WAITING_FOR_APPROVAL_FALLBACK =
  "Approval is required before this branch can continue.";
const WORKFLOW_RUN_RESUMED_PENDING_EXECUTION_FALLBACK =
  "Workflow resumed and is ready for downstream execution.";
const WORKFLOW_RUN_BLOCKED_LOCATION_FALLBACK = "policy node";
const WORKFLOW_RUN_FAILED_LOCATION_FALLBACK = "execution step";
const WORKFLOW_RUN_BLOCKED_REASON_FALLBACK = "Policy blocked this workflow branch.";
const WORKFLOW_RUN_FAILED_REASON_FALLBACK = "Execution failed at this step.";
const WORKFLOW_RUN_QUEUED_TEXT =
  "Queued behind an upstream gate or unresolved branch.";

const WORKFLOW_NODE_APPROVAL_CALLOUT_CLASS =
  "border-amber-200/80 bg-amber-50/90 text-amber-800";
const WORKFLOW_NODE_RESUME_CALLOUT_CLASS =
  "border-sky-200/80 bg-sky-50/90 text-sky-800";
const WORKFLOW_NODE_BLOCKED_CALLOUT_CLASS =
  "border-orange-200/80 bg-orange-50/90 text-orange-800";
const WORKFLOW_NODE_FAILED_CALLOUT_CLASS =
  "border-rose-200/80 bg-rose-50/90 text-rose-800";
const WORKFLOW_NODE_QUEUED_CALLOUT_CLASS =
  "border-slate-200/80 bg-slate-100/90 text-slate-700";

function workflowApprovalBoundaryDetailSuffix(
  summary: WorkflowApprovalReviewSummaryState,
): string {
  const trustText = summary.trustSummaryText ? ` ${summary.trustSummaryText}` : "";
  const consequenceText = summary.consequenceSummaryText
    ? ` Next consequence: ${summary.consequenceSummaryText}`
    : "";
  const previewText = !summary.consequenceSummaryText && summary.previewSummaryText
    ? ` Preview: ${summary.previewSummaryText}`
    : "";
  const provenanceText =
    !summary.consequenceSummaryText
    && !summary.previewSummaryText
    && summary.provenanceSummaryText
    && summary.provenanceSummaryText !== summary.reasonText
      ? ` ${summary.provenanceSummaryText}`
      : "";
  const sourceText =
    !summary.consequenceSummaryText
    && !summary.previewSummaryText
    && !summary.provenanceSummaryText
    && summary.sourceSummaryText
    && summary.sourceSummaryText !== summary.reasonText
      ? ` ${summary.sourceSummaryText}`
      : "";
  return `${trustText}${consequenceText}${previewText}${provenanceText}${sourceText}`;
}

export function workflowPauseCheckpointLabel(
  kind: "approval" | "delayed_resume",
): string {
  return kind === "approval" ? "approval checkpoint" : "delayed checkpoint";
}

export function workflowWaitingAtSummary(
  pausedAt: string,
  reason?: string | null,
  scheduledResume = false,
): string {
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason) return `Waiting at ${pausedAt}: ${normalizedReason}`;
  return scheduledResume
    ? `Waiting at ${pausedAt} for scheduled resume`
    : `Waiting at ${pausedAt}`;
}

function workflowApprovalReviewSummaryState(
  run: WorkflowRun,
): WorkflowApprovalReviewSummaryState {
  const review = approvalStateRecord(run.result?.approval_review);
  if (!review) {
    return {
      reasonText: null,
      trustSummaryText: null,
      consequenceSummaryText: null,
      provenanceSummaryText: null,
      sourceSummaryText: null,
      previewSummaryText: null,
    };
  }

  const consequenceSummaryLines = approvalStateStringArray(review.consequence_summary_lines);
  const draftPreview = approvalDraftPreviewFromUnknown(review.draft_preview);
  const provenanceSummaryText = approvalStateString(review.provenance_summary);
  const sourceRefs = approvalStateStringArray(review.source_refs);
  return {
    reasonText: approvalStateString(review.reason),
    trustSummaryText: workflowApprovalReviewCompactSummary({
      title: approvalStateString(review.title) ?? "Approval review",
      reason: approvalStateString(review.reason) ?? WORKFLOW_RUN_WAITING_FOR_APPROVAL_FALLBACK,
      approvalKind: approvalStateString(review.approval_kind),
      confidence: approvalStateString(review.confidence),
      provenanceSummary: approvalStateString(review.provenance_summary),
      sourceRefs,
      consequenceSummaryLines,
      optionCount: 0,
      draftPreviewLabel: draftPreview?.label ?? null,
      draftPreviewContent: draftPreview?.content ?? null,
      draftPreviewContentType: draftPreview?.content_type ?? null,
      autonomy_decision: null,
    }),
    consequenceSummaryText: consequenceSummaryLines[0] ?? null,
    provenanceSummaryText,
    sourceSummaryText: sourceCountSummary(sourceRefs),
    previewSummaryText: approvalDraftPreviewSummary({
      draft_preview: draftPreview ?? undefined,
    }),
  };
}

function workflowApprovalDecisionSummaryState(
  run: WorkflowRun,
): WorkflowApprovalDecisionSummaryState {
  const decisionRecord = approvalStateRecord(run.result?.approval_decision);
  if (!decisionRecord) {
    return {
      decision: null,
      consequenceSummaryText: null,
      noteText: null,
      optionLabelText: null,
    };
  }

  const rawDecision = approvalStateString(decisionRecord.decision)?.toLowerCase() ?? null;
  const decision =
    rawDecision === "approved" || rawDecision === "rejected" ? rawDecision : null;
  const selectedOption = approvalStateRecord(decisionRecord.selected_option);

  return {
    decision,
    consequenceSummaryText: approvalStateString(selectedOption?.consequence_summary),
    noteText: approvalStateString(decisionRecord.note),
    optionLabelText:
      approvalStateString(selectedOption?.label)
      ?? approvalStateString(selectedOption?.option_id),
  };
}

export function workflowDelayedResumeSummary(
  context: "branch" | "run" = "branch",
): string {
  return context === "branch"
    ? "Waiting for a delayed resume before this branch can continue."
    : "Waiting for a delayed resume before this run can continue.";
}

export function workflowLocatedStatusSummary(
  state: "blocked" | "failed",
  location: string,
  reason?: string | null,
): string {
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  const prefix = state === "blocked" ? "Blocked" : "Failed";
  if (normalizedReason) return `${prefix} at ${location}: ${normalizedReason}`;
  return `${prefix} at ${location}`;
}

function workflowSkillCapsuleState(
  result: Record<string, unknown>,
): WorkflowSkillCapsuleState {
  return {
    outcomeKind: approvalStateString(result.skill_capsule_outcome_kind),
    receiptStatus: approvalStateString(result.skill_capsule_receipt_status),
  };
}

export function workflowSkillCapsuleStructuredReason(
  state: "blocked" | "failed",
  result: Record<string, unknown>,
  label: string,
): string | null {
  const capsuleState = workflowSkillCapsuleState(result);
  switch (capsuleState.outcomeKind) {
    case "receipt_blocked":
      return `${label} was blocked by the skill capsule runtime receipt.`;
    case "receipt_failed":
      return state === "failed"
        ? `${label} failed because the skill capsule runtime receipt reported a failed execution.`
        : `${label} was blocked after the skill capsule runtime receipt reported a failed execution.`;
    case "bridge_error":
      return `${label} could not reach the skill capsule runtime bridge during execution.`;
    case "receipt_completed":
      return state === "failed"
        ? `${label} failed after the skill capsule runtime completed.`
        : `${label} was blocked after the skill capsule runtime completed.`;
    default:
      if (capsuleState.receiptStatus === "BLOCKED") {
        return `${label} was blocked by the skill capsule runtime receipt.`;
      }
      if (capsuleState.receiptStatus === "FAILED") {
        return `${label} failed because the skill capsule runtime receipt reported a failed execution.`;
      }
      return null;
  }
}

export function workflowCancelledSummary(reason?: string | null): string {
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  return normalizedReason ? `Cancelled: ${normalizedReason}` : "Cancelled";
}

function workflowRunResultState(run: WorkflowRun): WorkflowRunResultState {
  const result = run.result ?? {};
  const approvalReview = workflowApprovalReviewSummaryState(run);
  const approvalDecision = workflowApprovalDecisionSummaryState(run);
  const structuredReasonText = workflowSkillCapsuleStructuredReason(
    run.status === "blocked" ? "blocked" : "failed",
    result,
    "This run",
  );

  return {
    result,
    status: run.status,
    structuredReasonText,
    pausedAtLabel: approvalStateString(result.paused_at_label),
    approvalReasonText:
      approvalReview.reasonText ?? approvalStateString(result.approval_reason),
    waitReasonText: approvalStateString(result.wait_reason),
    blockedAtLabel: approvalStateString(result.blocked_at_label),
    blockedReasonText:
      structuredReasonText ?? approvalStateString(result.blocked_reason),
    failedAtLabel: approvalStateString(result.failed_at_label),
    failedReasonText:
      structuredReasonText ?? approvalStateString(result.failed_reason),
    cancelReasonText: approvalStateString(result.cancel_reason)?.replaceAll("_", " ") ?? null,
    summaryText: approvalStateString(result.summary),
    approvalReview,
    approvalDecision,
  };
}

function workflowApprovalDecisionSuffix(
  state: WorkflowApprovalDecisionSummaryState,
): string {
  const followUpSummary = workflowApprovalDecisionFollowUpSummary({
    optionLabel: state.optionLabelText,
    consequenceSummary: state.consequenceSummaryText,
    note: state.noteText,
  });
  return followUpSummary ? ` ${followUpSummary}` : "";
}

export function runStatusSummary(run: WorkflowRun): string | null {
  const state = workflowRunResultState(run);

  if (state.status === "waiting_for_approval") {
    const pausedAt =
      state.pausedAtLabel ?? workflowPauseCheckpointLabel("approval");
    const baseSummary = workflowWaitingAtSummary(pausedAt, state.approvalReasonText);
    return `${baseSummary}${workflowApprovalBoundaryDetailSuffix(state.approvalReview)}`;
  }

  if (state.status === "waiting_for_resume") {
    const pausedAt =
      state.pausedAtLabel ?? workflowPauseCheckpointLabel("delayed_resume");
    return workflowWaitingAtSummary(pausedAt, state.waitReasonText, true);
  }

  if (state.status === "blocked") {
    return workflowLocatedStatusSummary(
      "blocked",
      state.blockedAtLabel ?? WORKFLOW_RUN_BLOCKED_LOCATION_FALLBACK,
      state.blockedReasonText,
    );
  }

  if (state.status === "failed") {
    return workflowLocatedStatusSummary(
      "failed",
      state.failedAtLabel ?? WORKFLOW_RUN_FAILED_LOCATION_FALLBACK,
      state.failedReasonText,
    );
  }

  if (state.status === "cancelled") {
    const baseSummary = workflowCancelledSummary(
      state.cancelReasonText ?? approvalEventLabel("rejected"),
    );
    return `${baseSummary}${workflowApprovalDecisionSuffix(state.approvalDecision)}`;
  }

  if (state.status === "resumed_pending_execution") {
    return `${state.summaryText ?? WORKFLOW_RUN_RESUMED_PENDING_EXECUTION_FALLBACK}${workflowApprovalDecisionSuffix(state.approvalDecision)}`;
  }

  return null;
}

function runNodeCanvasCalloutState(
  run: WorkflowRun | null,
  node: WorkflowNodeDraft,
  nodeStatus: string | undefined,
): WorkflowNodeCanvasCalloutState {
  if (!run || !nodeStatus) return null;

  const result = run.result ?? {};
  const structuredReasonText =
    nodeStatus === "blocked" || nodeStatus === "failed"
      ? workflowSkillCapsuleStructuredReason(
        nodeStatus,
        result,
        node.label || "This workflow branch",
      )
      : null;

  if (nodeStatus === "waiting_for_approval") {
    const approvalReview = workflowApprovalReviewSummaryState(run);
    const reasonText =
      approvalReview.reasonText
      ?? approvalStateString(result.approval_reason)
      ?? WORKFLOW_RUN_WAITING_FOR_APPROVAL_FALLBACK;
    return {
      text: `${reasonText}${workflowApprovalBoundaryDetailSuffix(approvalReview)}`,
      className: WORKFLOW_NODE_APPROVAL_CALLOUT_CLASS,
    };
  }

  if (nodeStatus === "waiting_for_resume") {
    return {
      text:
        approvalStateString(result.wait_reason)
        ?? workflowDelayedResumeSummary("branch"),
      className: WORKFLOW_NODE_RESUME_CALLOUT_CLASS,
    };
  }

  if (nodeStatus === "blocked") {
    return {
      text:
        structuredReasonText
        ?? approvalStateString(result.blocked_reason)
        ?? WORKFLOW_RUN_BLOCKED_REASON_FALLBACK,
      className: WORKFLOW_NODE_BLOCKED_CALLOUT_CLASS,
    };
  }

  if (nodeStatus === "failed") {
    return {
      text:
        structuredReasonText
        ?? approvalStateString(result.failed_reason)
        ?? WORKFLOW_RUN_FAILED_REASON_FALLBACK,
      className: WORKFLOW_NODE_FAILED_CALLOUT_CLASS,
    };
  }

  if (nodeStatus === "queued") {
    return {
      text: WORKFLOW_RUN_QUEUED_TEXT,
      className: WORKFLOW_NODE_QUEUED_CALLOUT_CLASS,
    };
  }

  return null;
}

export function runNodeCanvasCallout(
  run: WorkflowRun | null,
  node: WorkflowNodeDraft,
  nodeStatus: string | undefined,
): { text: string; className: string } | null {
  return runNodeCanvasCalloutState(run, node, nodeStatus);
}
