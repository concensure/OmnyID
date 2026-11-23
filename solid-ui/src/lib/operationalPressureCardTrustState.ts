// @locs-version: 1.0
import type { TrustSummaryBlockInput } from "@/lib/trustSummaryBlockState";

type OperationalPressureCardTrustInput = {
  boundedReason?: string | null;
  rawReason?: string | null;
  consequencePreview?: string | null;
  provenanceCue?: string | null;
  autonomySummary?: string | null;
  sourceSummary?: string | null;
  previewBoundarySummary?: string | null;
};

export type OperationalPressureCardTrustState = {
  boundedReasonText: string | null;
  showBoundedReason: boolean;
  selectionReasonText: string | null;
  showSelectionReason: boolean;
  trustBlocks: TrustSummaryBlockInput;
};

function trimmed(value?: string | null): string | null {
  const result = value?.trim() ?? "";
  return result ? result : null;
}

export function operationalPressureCardTrustState(
  input: OperationalPressureCardTrustInput,
): OperationalPressureCardTrustState {
  const boundedReasonText = trimmed(input.boundedReason);
  const selectionReasonText = trimmed(input.rawReason);

  return {
    boundedReasonText,
    showBoundedReason: Boolean(boundedReasonText),
    selectionReasonText,
    showSelectionReason: Boolean(selectionReasonText),
    trustBlocks: {
      consequencePreview: trimmed(input.consequencePreview),
      provenanceCue: trimmed(input.provenanceCue),
      autonomySummary: trimmed(input.autonomySummary),
      sourceSummary: trimmed(input.sourceSummary),
      previewBoundarySummary: trimmed(input.previewBoundarySummary),
    },
  };
}
