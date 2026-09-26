// @locs-version: 1.0
export type ProactiveSuggestionContextArtifactPreviewState = {
  showPanel: boolean;
  titleText: string;
  evidenceSummaryText: string | null;
  showEvidenceSummary: boolean;
  sourceSummaryText: string | null;
  scopeCueText: string | null;
  showScopeCue: boolean;
  artifactLineItems: string[];
  showArtifactLines: boolean;
  referenceLabels: string[];
  showReferenceLabels: boolean;
  objectLabels: string[];
  showObjectLabels: boolean;
  fileLabels: string[];
  showFileLabels: boolean;
  anchorRefs: string[];
  showAnchorRefs: boolean;
  readinessReasonText: string | null;
  showReadinessReason: boolean;
  retrievalModeText: string | null;
  showRetrievalMode: boolean;
  consequenceSummaryText: string | null;
  provenanceSummaryText: string | null;
  showSharedTrustBlocks: boolean;
  topologyBudgetText: string | null;
  showTopologyBudget: boolean;
  workingSetText: string | null;
  showWorkingSet: boolean;
  activeTopicText: string | null;
  showActiveTopicCount: boolean;
};

function trimmed(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export function proactiveSuggestionContextArtifactPreviewState(input: {
  artifactPreviewOpen: boolean;
  hasActionPayload: boolean;
  contextArtifactPreviewAvailable: boolean;
  titleText: string;
  evidenceSummaryText?: string | null;
  sourceSummaryText?: string | null;
  scopeCueText?: string | null;
  artifactLineItems: string[];
  referenceLabels: string[];
  objectLabels: string[];
  fileLabels: string[];
  anchorRefs: string[];
  readinessReasonText?: string | null;
  retrievalModeText?: string | null;
  consequenceSummaryText?: string | null;
  provenanceSummaryText?: string | null;
  topologyBudgetText?: string | null;
  workingSetText?: string | null;
  activeTopicText?: string | null;
}): ProactiveSuggestionContextArtifactPreviewState {
  const evidenceSummaryText = trimmed(input.evidenceSummaryText);
  const sourceSummaryText = trimmed(input.sourceSummaryText);
  const scopeCueText = trimmed(input.scopeCueText);
  const readinessReasonText = trimmed(input.readinessReasonText);
  const retrievalModeText = trimmed(input.retrievalModeText);
  const consequenceSummaryText = trimmed(input.consequenceSummaryText);
  const provenanceSummaryText = trimmed(input.provenanceSummaryText);
  const topologyBudgetText = trimmed(input.topologyBudgetText);
  const workingSetText = trimmed(input.workingSetText);
  const activeTopicText = trimmed(input.activeTopicText);
  const showSharedTrustBlocks = Boolean(
    sourceSummaryText || consequenceSummaryText || provenanceSummaryText,
  );

  return {
    showPanel:
      input.artifactPreviewOpen
      && !input.hasActionPayload
      && input.contextArtifactPreviewAvailable,
    titleText: input.titleText,
    evidenceSummaryText,
    showEvidenceSummary: Boolean(evidenceSummaryText),
    sourceSummaryText,
    scopeCueText,
    showScopeCue: Boolean(scopeCueText),
    artifactLineItems: input.artifactLineItems,
    showArtifactLines: input.artifactLineItems.length > 0,
    referenceLabels: input.referenceLabels,
    showReferenceLabels: input.referenceLabels.length > 0,
    objectLabels: input.objectLabels,
    showObjectLabels: input.objectLabels.length > 0,
    fileLabels: input.fileLabels,
    showFileLabels: input.fileLabels.length > 0,
    anchorRefs: input.anchorRefs,
    showAnchorRefs: input.anchorRefs.length > 0,
    readinessReasonText,
    showReadinessReason: Boolean(readinessReasonText),
    retrievalModeText,
    showRetrievalMode: Boolean(retrievalModeText),
    consequenceSummaryText,
    provenanceSummaryText,
    showSharedTrustBlocks,
    topologyBudgetText,
    showTopologyBudget: Boolean(topologyBudgetText),
    workingSetText,
    showWorkingSet: Boolean(workingSetText),
    activeTopicText,
    showActiveTopicCount: Boolean(activeTopicText),
  };
}
