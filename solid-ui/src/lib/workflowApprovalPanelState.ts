// @locs-version: 1.0
import { workflowApprovalDecisionFollowUpParts } from "@/lib/workflowApprovalState";

export type WorkflowApprovalPanelSummaryState = {
  detailLines: string[];
  showSection: boolean;
};

export type WorkflowStatusContextDecisionLineItem = {
  className: string;
  key: string;
  label: string;
};

export function workflowApprovalPanelSummaryState(input: {
  approvalDecisionConsequence?: string | null;
  approvalDecisionLabel?: string | null;
  approvalDecisionNote?: string | null;
}): WorkflowApprovalPanelSummaryState {
  const detailLines = workflowApprovalDecisionFollowUpParts({
    optionLabel: input.approvalDecisionLabel,
    consequenceSummary: input.approvalDecisionConsequence,
    note: input.approvalDecisionNote,
  });
  return {
    detailLines,
    showSection: detailLines.length > 0,
  };
}

export function workflowStatusContextDecisionLineItems(input: {
  approvalDecisionConsequence?: string | null;
  approvalDecisionLabel?: string | null;
  approvalDecisionNote?: string | null;
  approvalDecisionPointId?: string | null;
  decisionClassName: string;
  detailClassName: string;
}): WorkflowStatusContextDecisionLineItem[] {
  const items: WorkflowStatusContextDecisionLineItem[] = [];
  if (input.approvalDecisionPointId) {
    items.push({
      className: input.decisionClassName,
      key: "decision_point",
      label: `Decision point ${input.approvalDecisionPointId}`,
    });
  }
  for (const [index, label] of workflowApprovalDecisionFollowUpParts({
    optionLabel: input.approvalDecisionLabel,
    consequenceSummary: input.approvalDecisionConsequence,
    note: input.approvalDecisionNote,
  }).entries()) {
    items.push({
      className: index === 0 ? input.decisionClassName : input.detailClassName,
      key: `decision_follow_up_${index}`,
      label,
    });
  }
  return items;
}

export function workflowWaitResumeDecisionSummaryState(input: {
  approvalDecisionConsequence?: string | null;
  approvalDecisionLabel?: string | null;
  approvalDecisionNote?: string | null;
}): { detailLines: string[] } | null {
  const detailLines = workflowApprovalDecisionFollowUpParts({
    optionLabel: input.approvalDecisionLabel,
    consequenceSummary: input.approvalDecisionConsequence,
    note: input.approvalDecisionNote,
  });
  return detailLines.length > 0 ? { detailLines } : null;
}
