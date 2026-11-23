// @locs-version: 1.0
import { workflowApprovalBoundaryLabel } from "@/lib/workflowGraphCopy";
import type { WorkflowWaitResumeRecord } from "@/lib/api";

export type WorkflowApprovalDecision = "approved" | "rejected";

type WorkflowApprovalOptionState = {
  identifierText: string;
  normalizedText: string;
};

type WorkflowApprovalFeedbackState = {
  decision: WorkflowApprovalDecision;
  labelText: string;
  runIdText: string;
  followUpSummaryText: string | null;
  baseFeedbackText: string;
};

type WorkflowApprovalRunSummaryState = {
  subjectText: string;
  boundaryLabelText: string;
  reasonText: string | null;
  trustSummaryText: string | null;
  consequenceSummaryText: string | null;
  provenanceSummaryText: string | null;
  previewSummaryText: string | null;
};

export type WorkflowApprovalDecisionRequest = {
  busyAction: `workflow_approval_${WorkflowApprovalDecision}`;
  decision: WorkflowApprovalDecision;
  optionId: string | undefined;
  optionLabel: string;
};

export type WorkflowApprovalDecisionFollowUpSummaryInput = {
  optionLabel?: string | null;
  consequenceSummary?: string | null;
  note?: string | null;
};

const WORKFLOW_APPROVAL_APPROVED_TOKENS = [
  "approve",
  "approved",
  "allow",
  "pass",
  "success",
  "primary",
  "confirm",
  "yes",
] as const;

function workflowApprovalOptionState(
  option: Record<string, unknown>,
): WorkflowApprovalOptionState {
  const identifierText =
    (typeof option.option_id === "string" && option.option_id.trim()
      ? option.option_id
      : typeof option.label === "string"
        ? option.label
        : "") ?? "";

  return {
    identifierText,
    normalizedText: identifierText.trim().toLowerCase(),
  };
}

function workflowApprovalFeedbackState(input: {
  decision: WorkflowApprovalDecision;
  label: string;
  runId: string;
  followUpSummary?: string | null;
}): WorkflowApprovalFeedbackState {
  const followUpSummaryText = input.followUpSummary?.trim() || null;
  return {
    decision: input.decision,
    labelText: input.label,
    runIdText: input.runId,
    followUpSummaryText,
    baseFeedbackText: input.decision === "approved"
      ? `${input.label} resumed workflow run ${input.runId}.`
      : `${input.label} cancelled workflow run ${input.runId}.`,
  };
}

function workflowApprovalRunSummaryState(input: {
  runId: string;
  subjectText?: string | null;
  reason?: string | null;
  trustSummary?: string | null;
  consequenceSummary?: string | null;
  provenanceSummary?: string | null;
  previewSummary?: string | null;
  dryRun?: boolean;
}): WorkflowApprovalRunSummaryState {
  return {
    subjectText: input.subjectText?.trim() || (input.dryRun ? `Dry run ${input.runId}` : `Workflow run ${input.runId}`),
    boundaryLabelText: workflowApprovalBoundaryLabel(input.dryRun ? "paused" : "waiting"),
    reasonText: input.reason?.trim() || null,
    trustSummaryText: input.trustSummary?.trim() || null,
    consequenceSummaryText: input.consequenceSummary?.trim() || null,
    provenanceSummaryText: input.provenanceSummary?.trim() || null,
    previewSummaryText: input.previewSummary?.trim() || null,
  };
}

export function workflowApprovalDecisionForOption(
  option: Record<string, unknown>,
): WorkflowApprovalDecision {
  const optionState = workflowApprovalOptionState(option);
  if (
    WORKFLOW_APPROVAL_APPROVED_TOKENS.some((token) =>
      optionState.normalizedText.includes(token)
    )
  ) {
    return "approved";
  }
  return "rejected";
}

export function workflowApprovalDecisionRequestForOption(
  option: Record<string, unknown>,
): WorkflowApprovalDecisionRequest {
  const optionId =
    typeof option.option_id === "string" && option.option_id.trim() ? option.option_id.trim() : undefined;
  const optionLabel =
    typeof option.label === "string" && option.label.trim()
      ? option.label.trim()
      : optionId ?? "Approval option";
  const decision = workflowApprovalDecisionForOption(option);
  return {
    busyAction: `workflow_approval_${decision}`,
    decision,
    optionId,
    optionLabel,
  };
}

export function workflowApprovalDecisionPreflightFeedback(
  workflowId: string | null | undefined,
): string | null {
  return workflowId ? null : "Select a workflow before recording an approval decision.";
}

export function workflowPendingApprovalWaitResumeRecord(
  records: readonly WorkflowWaitResumeRecord[],
): WorkflowWaitResumeRecord | null {
  return records.find((record) =>
    record.status === "pending" && record.resume_family === "approval"
  ) ?? null;
}

export function workflowPendingApprovalMissingFeedback(): string {
  return "This run no longer has a pending approval wait to decide.";
}

export function workflowApprovalDecisionFeedbackLabel(
  decision: WorkflowApprovalDecision,
  label: string,
  runId: string,
  followUpSummary?: string | null,
): string {
  const feedbackState = workflowApprovalFeedbackState({
    decision,
    label,
    runId,
    followUpSummary,
  });
  return feedbackState.followUpSummaryText
    ? `${feedbackState.baseFeedbackText} ${feedbackState.followUpSummaryText}`
    : feedbackState.baseFeedbackText;
}

export function workflowApprovalRunStatusSummary(input: {
  runId: string;
  subjectText?: string | null;
  reason?: string | null;
  trustSummary?: string | null;
  consequenceSummary?: string | null;
  provenanceSummary?: string | null;
  previewSummary?: string | null;
  dryRun?: boolean;
}): string {
  const summaryState = workflowApprovalRunSummaryState(input);
  if (!summaryState.reasonText) {
    return `${summaryState.subjectText} ${summaryState.boundaryLabelText}.`;
  }

  const detailText = summaryState.consequenceSummaryText
    ? ` Next consequence: ${summaryState.consequenceSummaryText}`
    : summaryState.previewSummaryText
      ? ` Preview: ${summaryState.previewSummaryText}`
      : summaryState.provenanceSummaryText && summaryState.provenanceSummaryText !== summaryState.reasonText
        ? ` ${summaryState.provenanceSummaryText}`
        : "";

  return `${summaryState.subjectText} ${summaryState.boundaryLabelText}: ${summaryState.reasonText}${summaryState.trustSummaryText ? ` ${summaryState.trustSummaryText}` : ""}${detailText}`;
}

export function workflowApprovalDecisionFollowUpSummary(
  input: WorkflowApprovalDecisionFollowUpSummaryInput,
): string | null {
  const parts = workflowApprovalDecisionFollowUpParts(input);
  return parts.join(" ") || null;
}

export function workflowApprovalDecisionFollowUpParts(
  input: WorkflowApprovalDecisionFollowUpSummaryInput,
): string[] {
  return [
    input.optionLabel?.trim() ? `Decision: ${input.optionLabel.trim()}.` : null,
    input.consequenceSummary?.trim() || null,
    input.note?.trim() ? `Note: ${input.note.trim()}` : null,
  ]
    .filter((value): value is string => Boolean(value));
}
