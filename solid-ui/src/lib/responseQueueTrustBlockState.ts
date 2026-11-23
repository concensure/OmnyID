// @locs-version: 1.0
type ResponseQueueTrustBlockInput = {
  sourceSummaryText?: string | null;
  consequencePreviewText?: string | null;
  provenanceCueText?: string | null;
  autonomySummaryText?: string | null;
  previewBoundarySummaryText?: string | null;
};

export type ResponseQueueTrustBlockState = {
  sourceSummaryText: string | null;
  consequencePreviewText: string | null;
  provenanceCueText: string | null;
  autonomySummaryText: string | null;
  previewBoundarySummaryText: string | null;
  showSharedTrustBlocks: boolean;
};

function trimmed(value?: string | null): string | null {
  const result = value?.trim() ?? "";
  return result ? result : null;
}

export function responseQueueTrustBlockState(
  input: ResponseQueueTrustBlockInput,
): ResponseQueueTrustBlockState {
  const sourceSummaryText = trimmed(input.sourceSummaryText);
  const consequencePreviewText = trimmed(input.consequencePreviewText);
  const provenanceCueText = trimmed(input.provenanceCueText);
  const autonomySummaryText = trimmed(input.autonomySummaryText);
  const previewBoundarySummaryText = trimmed(input.previewBoundarySummaryText);

  return {
    sourceSummaryText,
    consequencePreviewText,
    provenanceCueText,
    autonomySummaryText,
    previewBoundarySummaryText,
    showSharedTrustBlocks: Boolean(
      sourceSummaryText
      || consequencePreviewText
      || provenanceCueText
      || autonomySummaryText
      || previewBoundarySummaryText,
    ),
  };
}
