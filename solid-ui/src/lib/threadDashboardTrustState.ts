// @locs-version: 1.0
import {
  boundedReasonSummary,
  hasDistinctReasonSummary,
} from "afp-ts/continuity";

export type ThreadDashboardTrustInput = {
  suggestedAction?: string | null;
  actionReason?: string | null;
};

export type ThreadDashboardTrustState = {
  boundedReason: string | null;
  suggestedActionText: string | null;
  actionReasonText: string | null;
  attentionTitle: string | null;
  reasonFilterText: string;
  showBoundedReasonDetail: boolean;
};

export type ThreadDashboardTooltipState = {
  boundedReasonText: string | null;
  selectionReasonText: string | null;
  confidenceText: string | null;
  showSelectionReason: boolean;
  showTooltipTrustBlocks: boolean;
};

function nonEmptyString(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export function threadDashboardTrustState(
  input: ThreadDashboardTrustInput,
): ThreadDashboardTrustState {
  const suggestedAction = nonEmptyString(input.suggestedAction);
  const actionReason = nonEmptyString(input.actionReason);
  const boundedReason = boundedReasonSummary({
    selection_reason: actionReason ?? suggestedAction ?? undefined,
  });
  const suggestedActionText = hasDistinctReasonSummary(suggestedAction, boundedReason)
    ? suggestedAction
    : boundedReason;
  const actionReasonText =
    hasDistinctReasonSummary(actionReason, boundedReason)
    && hasDistinctReasonSummary(actionReason, suggestedAction)
      ? actionReason
      : null;
  const showBoundedReasonDetail = hasDistinctReasonSummary(boundedReason, suggestedActionText);
  const reasonFilterText = [
    suggestedActionText,
    actionReasonText,
    showBoundedReasonDetail ? boundedReason : null,
    suggestedAction,
    actionReason,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return {
    boundedReason,
    suggestedActionText,
    actionReasonText,
    attentionTitle: boundedReason ?? actionReasonText ?? suggestedActionText ?? null,
    reasonFilterText,
    showBoundedReasonDetail,
  };
}

export function threadDashboardTooltipState(input: ThreadDashboardTrustInput & {
  confidence?: number | null;
}): ThreadDashboardTooltipState {
  const trustState = threadDashboardTrustState(input);
  const confidenceText =
    typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? `${Math.round(input.confidence * 100)}%`
      : null;
  const showSelectionReason = Boolean(trustState.actionReasonText);
  const showTooltipTrustBlocks =
    trustState.showBoundedReasonDetail
    || showSelectionReason
    || confidenceText !== null;

  return {
    boundedReasonText: trustState.boundedReason,
    selectionReasonText: trustState.actionReasonText,
    confidenceText,
    showSelectionReason,
    showTooltipTrustBlocks,
  };
}
