// @locs-version: 1.0
import { approvalStatusLabel } from "afp-ts/continuity";
import { simulatorPreviewBoundaryFallback } from "@/lib/simulatorPreviewCopy";
import { approvalReviewTrustBlockState } from "@/lib/approvalReviewSummaryState";
import type { ApprovalItem } from "@/lib/approvalPresentationState";

export type ApprovalCardState = {
  titleText: string;
  actionTypeText: string;
  requestedByText: string;
  primaryReasonText: string;
  previewBoundaryText: string;
  sourceSummaryText: string | null;
  consequencePreviewText: string | null;
  provenanceCueText: string | null;
  showDecisionButtons: boolean;
  decisionFeedback: "approved" | "rejected" | null;
  feedbackText: string;
  showFeedbackText: boolean;
  statusText: string;
  statusClass: string;
  busy: boolean;
};

const APPROVAL_PREVIEW_FALLBACK_TEXT = simulatorPreviewBoundaryFallback();
const APPROVAL_STATUS_PREVIEW_TEXT = "preview";
const APPROVAL_CARD_PREVIEW_STATUS_CLASS =
  "bg-amber-400/10 text-amber-300 border-amber-400/20";
const APPROVAL_CARD_APPROVED_STATUS_CLASS =
  "bg-green-500/20 text-green-700 border-green-500/30";
const APPROVAL_CARD_REJECTED_STATUS_CLASS =
  "bg-error/10 text-error border-error/20";
const APPROVAL_CARD_PENDING_STATUS_CLASS =
  "bg-amber-400/20 text-amber-700 border-amber-400/30";

function approvalStatusClass(statusText: string, previewOnly: boolean): string {
  if (previewOnly) {
    return APPROVAL_CARD_PREVIEW_STATUS_CLASS;
  }
  if (statusText === "approved") {
    return APPROVAL_CARD_APPROVED_STATUS_CLASS;
  }
  if (statusText === "rejected") {
    return APPROVAL_CARD_REJECTED_STATUS_CLASS;
  }
  return APPROVAL_CARD_PENDING_STATUS_CLASS;
}

function normalizeTrustText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/[.]+$/g, "").toLowerCase();
}

export function approvalCardState(props: {
  item: ApprovalItem;
  statusText: string;
  busy: boolean;
  feedbackText: string;
  decisionFeedback: "approved" | "rejected" | null;
}): ApprovalCardState {
  const { item, statusText, busy, feedbackText, decisionFeedback } = props;
  const primaryReasonText = item.trustSummary.boundedReason ?? item.summary;
  const approvalReviewTrust = approvalReviewTrustBlockState({
    approvalReview: item.approvalReview,
    autonomyDecision: item.autonomyDecision,
    fallbackReason: primaryReasonText,
  });
  const consequencePreviewText =
    normalizeTrustText(item.trustSummary.consequencePreview)
      === normalizeTrustText(approvalReviewTrust.consequencePreview)
      ? null
      : item.trustSummary.consequencePreview;
  const provenanceCueText =
    normalizeTrustText(item.trustSummary.provenanceCue)
      === normalizeTrustText(approvalReviewTrust.provenanceCue)
      ? null
      : item.trustSummary.provenanceCue;
  const sourceSummaryText =
    normalizeTrustText(item.sourceSummary)
      === normalizeTrustText(approvalReviewTrust.sourceSummary)
      ? null
      : item.sourceSummary ?? null;

  return {
    titleText: item.title,
    actionTypeText: item.actionType,
    requestedByText: item.requestedBy,
    primaryReasonText,
    previewBoundaryText: item.previewBoundarySummary ?? APPROVAL_PREVIEW_FALLBACK_TEXT,
    sourceSummaryText,
    consequencePreviewText,
    provenanceCueText,
    showDecisionButtons: statusText === "pending" && !item.previewOnly,
    decisionFeedback,
    feedbackText,
    showFeedbackText: Boolean(feedbackText),
    statusText: item.previewOnly
      ? APPROVAL_STATUS_PREVIEW_TEXT
      : approvalStatusLabel(statusText),
    statusClass: approvalStatusClass(statusText, Boolean(item.previewOnly)),
    busy,
  };
}
