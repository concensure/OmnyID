// @locs-version: 1.0
import { approvalPendingStatusLabel } from "afp-ts/continuity";

export function workflowApprovalBoundaryLabel(
  kind: "paused" | "waiting" = "waiting",
): string {
  return kind === "paused" ? "paused at an approval boundary" : "is waiting for approval";
}

export function workflowApprovalGateLabel(count = 1, capitalize = false): string {
  const label = count === 1 ? "approval gate" : "approval gates";
  return capitalize ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}

export function workflowApprovalBranchStatusSummary(
  routePrefix: string,
  trustSummary?: string | null,
): string {
  return `${routePrefix} ${workflowApprovalBoundaryLabel("paused")}.${trustSummary ? ` ${trustSummary}` : ""}`;
}

export function workflowApprovalReasonSummary(label?: string | null): string {
  const normalized = typeof label === "string" ? label.trim() : "";
  if (normalized) return `${normalized} is waiting for approval.`;
  return workflowApprovalPendingSummary();
}

export function workflowApprovalPendingSummary(): string {
  return approvalPendingStatusLabel();
}

export function workflowApprovalDecisionActionTitle(
  decision: "approved" | "rejected",
  label: string,
): string {
  return decision === "approved"
    ? `Approve and resume this workflow run via ${label}`
    : `Reject and cancel this workflow run via ${label}`;
}

export function workflowApprovalGateCountSummary(count: number): string {
  return `${count} ${workflowApprovalGateLabel(count)} set`;
}

export function workflowApprovalGateRequirementSummary(): string {
  return `Side-effectful actions detected - add at least one ${workflowApprovalGateLabel()}`;
}

export function workflowWaitResumeChainSummary(): string {
  return "Review every persisted pause, wake, approval decision, and follow-up wait for this run.";
}

export function workflowWaitResumePendingSummary(count: number): string {
  return `${count} pending or dispatched`;
}

export function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
