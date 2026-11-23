// @locs-version: 1.0
import type { TrustSummaryBlockInput } from "@/lib/trustSummaryBlockState";

type ResponseQueueCardTrustInput = {
  boundedReasonText?: string | null;
  selectionReasonText?: string | null;
  showSelectionReasonCandidate?: boolean;
  confidenceText?: string | null;
  sourceSummaryText?: string | null;
  consequencePreviewText?: string | null;
  provenanceCueText?: string | null;
};

export type ResponseQueueCardTrustState = {
  boundedReasonText: string | null;
  selectionReasonText: string | null;
  showBoundedReason: boolean;
  showSelectionReason: boolean;
  trustBlocks: TrustSummaryBlockInput;
};

function trimmed(value?: string | null): string | null {
  const result = value?.trim() ?? "";
  return result ? result : null;
}

export function responseQueueCardTrustState(
  input: ResponseQueueCardTrustInput,
): ResponseQueueCardTrustState {
  const boundedReasonText = trimmed(input.boundedReasonText);
  const selectionReasonText = trimmed(input.selectionReasonText);
  const showSelectionReason = Boolean(input.showSelectionReasonCandidate && selectionReasonText);

  return {
    boundedReasonText,
    selectionReasonText,
    showBoundedReason: Boolean(boundedReasonText),
    showSelectionReason,
    trustBlocks: {
      confidence: trimmed(input.confidenceText),
      sourceSummary: trimmed(input.sourceSummaryText),
      consequencePreview: trimmed(input.consequencePreviewText),
      provenanceCue: trimmed(input.provenanceCueText),
    },
  };
}
