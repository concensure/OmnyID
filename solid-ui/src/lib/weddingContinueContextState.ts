// @locs-version: 2.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingContinueContextPacket = {
  version: 1;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId: string | null;
  summaryLabel: string;
  activeArtifact: {
    id: string;
    title: string;
    kind: string;
    approvalState: string;
  } | null;
  contextLabels: string[];
  decisionScopeLabels: string[];
  decisionSourceProviderLabels: string[];
  approvalReceiptLabels: string[];
  recommendationLabels: string[];
  scheduleLabels: string[];
  taskLabels: string[];
  importedArtifactCount: number;
  importedReviewRequiredCount: number;
  guardrails: string[];
};

function compact(values: readonly unknown[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = typeof value === "string" ? value.trim() : "";
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function isWeddingImportArtifact(artifact: WeddingResponseWorkspaceViewState["workspace"]["results"][number]): boolean {
  return artifact.metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag));
}

export function buildWeddingContinueContextPacket(
  state: WeddingResponseWorkspaceViewState,
): WeddingContinueContextPacket {
  const active = state.activePreview;
  const workspace = state.workspace;
  const importedArtifactIds = new Set(workspace.results.filter(isWeddingImportArtifact).map((artifact) => artifact.id));
  const importedArtifactCount = importedArtifactIds.size;
  const importedReviewRequiredCount = state.bundleExportPayload.excludedArtifactIds
    .filter((artifactId) => importedArtifactIds.has(artifactId)).length;
  return {
    version: 1,
    weddingPlanId: workspace.metadata.weddingPlanId,
    responseWorkspaceId: workspace.metadata.responseWorkspaceId,
    sourceResponseId: workspace.metadata.sourceResponseId,
    summaryLabel: workspace.summaryLabel,
    activeArtifact: active
      ? {
        id: active.artifactId,
        title: active.title,
        kind: active.kind,
        approvalState: active.approvalState,
      }
      : null,
    contextLabels: compact(state.contextCards.flatMap((card) => card.answeredLabels), 8),
    decisionScopeLabels: compact(state.decisionRecordCards.map((card) => `${card.title}: ${card.detailLabel}`), 6),
    decisionSourceProviderLabels: compact(state.decisionRecordCards.flatMap((card) =>
      card.metadataLabels
        .filter((label) => label.toLowerCase().startsWith("provider:"))
        .map((label) => label.replace(/^provider:\s*/i, ""))
    ), 8),
    approvalReceiptLabels: compact(state.approvalReceiptCards.map((card) => `${card.statusLabel}: ${card.title}`), 5),
    recommendationLabels: compact(state.recommendationCards.map((card) => card.title), 5),
    scheduleLabels: compact(workspace.results.flatMap((artifact) => artifact.linkedCalendarEventIds), 8),
    taskLabels: compact(workspace.results.flatMap((artifact) => artifact.linkedTaskIds), 8),
    importedArtifactCount,
    importedReviewRequiredCount,
    guardrails: [
      "Treat carried wedding context as planning memory, not proof of booking, legal compliance, vendor availability, payment, registry publishing, or external calendar sync.",
      "Ask before sending, sharing, booking, publishing, or syncing anything externally.",
      "Preserve source, approval, privacy, and retention labels when creating follow-up artifacts.",
      importedReviewRequiredCount > 0
        ? "Imported wedding files are private planning evidence; do not reuse uploaded-file details in vendor shares, exports, or external messages without explicit review."
        : null,
      "If decisionScopeLabels are present, produce follow-up reports from the selected option first and keep alternatives only as audit context unless the user asks to compare again.",
      "If decisionSourceProviderLabels are present, preserve that source/provider evidence when narrowing reports around selected options.",
    ].filter((guardrail): guardrail is string => Boolean(guardrail)),
  };
}
