// @locs-version: 2.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingArtifactEvidenceStatus } from "@/lib/weddingArtifactState";

export type WeddingHandoffPacket = {
  version: 1;
  summaryLabel: string;
  artifactCount: number;
  resultCount: number;
  activeArtifactTitle: string | null;
  activeArtifactKind: string | null;
  linkedCalendarCount: number;
  linkedTaskCount: number;
  approvalPromptCount: number;
  decisionScopeCount: number;
  decisionFocusCount: number;
  decisionFocusBacklogCount: number;
  decisionFocusLabels: string[];
  recommendationCount: number;
  exportIncludedCount: number;
  exportExcludedSensitiveCount: number;
  importedArtifactCount: number;
  importedHandoffReviewCount: number;
  sourceLinkedCount: number;
  sourceLabelledCount: number;
  sourceUnverifiedCount: number;
  decisionSourceProviderLabels: string[];
  projectionPendingCount: number;
  projectionBlockedCount: number;
  projectionSentCount: number;
  labels: string[];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isWeddingImportArtifact(artifact: WeddingResponseWorkspaceViewState["workspace"]["results"][number]): boolean {
  return artifact.metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag));
}

export function buildWeddingHandoffPacketState(
  state: WeddingResponseWorkspaceViewState,
): WeddingHandoffPacket {
  const artifacts = state.workspace.results;
  const linkedCalendarCount = unique(artifacts.flatMap((artifact) => artifact.linkedCalendarEventIds)).length;
  const linkedTaskCount = unique(artifacts.flatMap((artifact) => artifact.linkedTaskIds)).length;
  const approvalPromptCount = artifacts.filter((artifact) => artifact.approvalState === "pending_user_approval").length;
  const evidenceStatuses = artifacts.map((artifact) => weddingArtifactEvidenceStatus(artifact));
  const sourceLinkedCount = evidenceStatuses.filter((status) => status === "source_linked").length;
  const sourceLabelledCount = evidenceStatuses.filter((status) => status === "source_labelled").length;
  const sourceUnverifiedCount = evidenceStatuses.filter((status) => status === "source_unverified").length;
  const importedArtifactIds = new Set(artifacts.filter(isWeddingImportArtifact).map((artifact) => artifact.id));
  const importedArtifactCount = importedArtifactIds.size;
  const importedHandoffReviewCount = state.bundleExportPayload.excludedArtifactIds
    .filter((artifactId) => importedArtifactIds.has(artifactId)).length;
  const queue = state.projectionQueue?.queue;
  const decisionFocus = state.personalOsProjection.decisionLoadRelief;
  const decisionSourceProviderLabels = unique(state.decisionRecordCards.flatMap((card) =>
    card.metadataLabels
      .filter((label) => label.toLowerCase().startsWith("provider:"))
      .map((label) => label.replace(/^provider:\s*/i, ""))
  )).slice(0, 8);

  return {
    version: 1,
    summaryLabel: state.workspace.summaryLabel,
    artifactCount: state.workspace.totalArtifacts,
    resultCount: state.workspace.resultCount,
    activeArtifactTitle: state.activePreview?.title ?? null,
    activeArtifactKind: state.activePreview?.kind ?? null,
    linkedCalendarCount,
    linkedTaskCount,
    approvalPromptCount,
    decisionScopeCount: state.decisionRecordCards.length,
    decisionFocusCount: decisionFocus.focusItems.length,
    decisionFocusBacklogCount: decisionFocus.backlogCount,
    decisionFocusLabels: decisionFocus.focusItems.map((item) => item.title).slice(0, 5),
    recommendationCount: state.recommendationCards.length,
    exportIncludedCount: state.bundleExportPayload.includedArtifactIds.length,
    exportExcludedSensitiveCount: state.bundleExportPayload.excludedArtifactIds.length,
    importedArtifactCount,
    importedHandoffReviewCount,
    sourceLinkedCount,
    sourceLabelledCount,
    sourceUnverifiedCount,
    decisionSourceProviderLabels,
    projectionPendingCount: queue?.pendingItems.length ?? 0,
    projectionBlockedCount: queue?.blockedItems.length ?? 0,
    projectionSentCount: queue?.sentItems.length ?? 0,
    labels: [
      `${state.workspace.totalArtifacts} planning file${state.workspace.totalArtifacts === 1 ? "" : "s"}`,
      linkedCalendarCount > 0 ? `${linkedCalendarCount} linked date${linkedCalendarCount === 1 ? "" : "s"}` : "no linked dates",
      linkedTaskCount > 0 ? `${linkedTaskCount} linked task${linkedTaskCount === 1 ? "" : "s"}` : "no linked tasks",
      approvalPromptCount > 0 ? `${approvalPromptCount} approval prompt${approvalPromptCount === 1 ? "" : "s"}` : "no approval prompts",
      state.decisionRecordCards.length > 0
        ? `${state.decisionRecordCards.length} selected decision scope${state.decisionRecordCards.length === 1 ? "" : "s"}`
        : "no selected decision scope",
      decisionFocus.focusItems.length > 0
        ? `${decisionFocus.focusItems.length} decision focus item${decisionFocus.focusItems.length === 1 ? "" : "s"}`
        : "no decision focus items",
      decisionFocus.backlogCount > 0
        ? `${decisionFocus.backlogCount} decision backlog item${decisionFocus.backlogCount === 1 ? "" : "s"}`
        : "no decision backlog",
      decisionSourceProviderLabels.length > 0 ? `decision providers: ${decisionSourceProviderLabels.join(", ")}` : "no decision provider evidence",
      sourceLinkedCount > 0 ? `${sourceLinkedCount} source-linked file${sourceLinkedCount === 1 ? "" : "s"}` : "no source-linked files",
      sourceUnverifiedCount > 0 ? `${sourceUnverifiedCount} source-unverified file${sourceUnverifiedCount === 1 ? "" : "s"}` : "no source-unverified files",
      importedArtifactCount > 0
        ? `${importedArtifactCount} imported private planning file${importedArtifactCount === 1 ? "" : "s"} in workspace`
        : "no imported planning files",
      importedHandoffReviewCount > 0
        ? `${importedHandoffReviewCount} imported file${importedHandoffReviewCount === 1 ? " requires" : "s require"} handoff review`
        : "no imported handoff review blockers",
      state.bundleExportPayload.excludedArtifactIds.length > 0
        ? `${state.bundleExportPayload.excludedArtifactIds.length} sensitive export${state.bundleExportPayload.excludedArtifactIds.length === 1 ? "" : "s"} excluded`
        : "safe export packet ready",
    ],
  };
}
