// @locs-version: 1.0
import {
  approvalReviewDetailLines,
  sourceCountSummary,
  type ApprovalReviewLike,
  type AutonomyDecisionLike,
} from "afp-ts/continuity";

export type ApprovalReviewTrustBlockState = {
  boundedReason: string | null;
  consequencePreview: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  detailLines: string[];
};

function trimmed(value?: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export function approvalReviewTrustBlockState(input: {
  approvalReview?: ApprovalReviewLike | null;
  autonomyDecision?: AutonomyDecisionLike | null;
  fallbackReason?: string | null;
}): ApprovalReviewTrustBlockState {
  const boundedReason = trimmed(input.approvalReview?.reason) ?? trimmed(input.fallbackReason);
  const consequencePreview = trimmed(input.approvalReview?.consequence_summary_lines?.[0] ?? null);
  const provenanceCue = trimmed(input.approvalReview?.provenance_summary);
  const sourceSummary = sourceCountSummary(input.approvalReview?.source_refs);
  const hiddenLines = new Set(
    [boundedReason, consequencePreview, provenanceCue, sourceSummary].filter(
      (value): value is string => Boolean(value),
    ),
  );

  return {
    boundedReason,
    consequencePreview,
    provenanceCue,
    sourceSummary,
    detailLines: approvalReviewDetailLines({
      approvalReview: input.approvalReview,
      autonomyDecision: input.autonomyDecision,
      fallbackReason: input.fallbackReason,
    }).filter((line) => !hiddenLines.has(line.trim())),
  };
}
