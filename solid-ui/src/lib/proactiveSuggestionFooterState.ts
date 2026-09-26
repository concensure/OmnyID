// @locs-version: 2.0
export type ProactiveSuggestionFooterState = {
  artifactLineItems: string[];
  showArtifactLines: boolean;
  trustReasonTexts: string[];
  showTrustReasons: boolean;
  comparisonRowsPreview: Array<{ label: string; values: string[] }>;
  showComparisonPreview: boolean;
  provenanceLineItems: string[];
  showProvenanceLines: boolean;
  sourceSummaryText: string | null;
  showSourceSummary: boolean;
  destinationText: string | null;
  showDestinationLabel: boolean;
};

function trimmed(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

function policyLabel(value: string | null): string | null {
  if (!value) return null;
  return value.replaceAll("_", " ");
}

function provenanceLineItems(input: {
  provenanceCueText?: string | null;
  surfacePolicy?: string | null;
  approvalPolicy?: string | null;
  strategicAction?: string | null;
  sourceSummaryText?: string | null;
}): string[] {
  const provenanceCue = trimmed(input.provenanceCueText);
  const sourceSummary = trimmed(input.sourceSummaryText);
  const lines = provenanceCue && provenanceCue !== sourceSummary ? [provenanceCue] : [];
  const surfacePolicy = policyLabel(trimmed(input.surfacePolicy));
  const approvalPolicy = policyLabel(trimmed(input.approvalPolicy));
  const strategicAction = policyLabel(trimmed(input.strategicAction));
  const policyParts = [surfacePolicy, approvalPolicy, strategicAction].filter(
    (part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index,
  );
  if (policyParts.length > 0) lines.push(`Policy: ${policyParts.join(", ")}`);
  return lines.slice(0, 2);
}

export function proactiveSuggestionFooterState(input: {
  artifactLineItems: string[];
  trustReasonTexts: string[];
  comparisonRowsPreview: Array<{ label: string; values: string[] }>;
  sourceSummaryText?: string | null;
  destinationText?: string | null;
  provenanceCueText?: string | null;
  surfacePolicy?: string | null;
  approvalPolicy?: string | null;
  strategicAction?: string | null;
  showSourceSummaryCandidate: boolean;
  contextArtifactShowsSourceSummary: boolean;
  simulatorPreviewShowsSourceSummary: boolean;
}): ProactiveSuggestionFooterState {
  const sourceSummaryText = trimmed(input.sourceSummaryText);
  const destinationText = trimmed(input.destinationText);
  const showSourceSummary =
    input.showSourceSummaryCandidate
    && Boolean(sourceSummaryText)
    && !input.contextArtifactShowsSourceSummary
    && !input.simulatorPreviewShowsSourceSummary;
  const provenanceLines = provenanceLineItems({
    provenanceCueText: input.provenanceCueText,
    surfacePolicy: input.surfacePolicy,
    approvalPolicy: input.approvalPolicy,
    strategicAction: input.strategicAction,
    sourceSummaryText,
  });

  return {
    artifactLineItems: input.artifactLineItems,
    showArtifactLines: input.artifactLineItems.length > 0,
    trustReasonTexts: input.trustReasonTexts,
    showTrustReasons: input.trustReasonTexts.length > 0,
    comparisonRowsPreview: input.comparisonRowsPreview,
    showComparisonPreview: input.comparisonRowsPreview.length > 0,
    provenanceLineItems: provenanceLines,
    showProvenanceLines: provenanceLines.length > 0,
    sourceSummaryText,
    showSourceSummary,
    destinationText,
    showDestinationLabel: Boolean(destinationText),
  };
}
