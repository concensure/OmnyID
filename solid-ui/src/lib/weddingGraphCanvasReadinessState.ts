// @locs-version: 2.0
import {
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingGraphCanvasReadinessInput = {
  focusNodeIds?: readonly string[] | null;
  focusEdgeIds?: readonly string[] | null;
  highlightedNodeIds?: readonly string[] | null;
  highlightedEdgeIds?: readonly string[] | null;
  dimmedOutsideFocus?: boolean | null;
  arrivalIntentConsumed?: boolean | null;
  hasClearFocusControl?: boolean | null;
  hasPathEmphasisLegend?: boolean | null;
  proofReferenceLabels?: readonly string[] | null;
  errorCount?: number | null;
};

export type WeddingGraphCanvasReadinessState = {
  status: "ready" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  proofReferenceLabels: string[];
  blockerLabels: string[];
};

function cleanIds(values: readonly string[] | null | undefined): string[] {
  return cleanWeddingProductionLabels(values ?? []);
}

function missingIds(expected: readonly string[], actual: readonly string[]): string[] {
  const actualSet = new Set(actual);
  return expected.filter((id) => !actualSet.has(id));
}

export function buildWeddingGraphCanvasReadinessState(
  input: WeddingGraphCanvasReadinessInput = {},
): WeddingGraphCanvasReadinessState {
  const focusNodeIds = cleanIds(input.focusNodeIds);
  const focusEdgeIds = cleanIds(input.focusEdgeIds);
  const highlightedNodeIds = cleanIds(input.highlightedNodeIds);
  const highlightedEdgeIds = cleanIds(input.highlightedEdgeIds);
  const missingNodes = missingIds(focusNodeIds, highlightedNodeIds);
  const missingEdges = missingIds(focusEdgeIds, highlightedEdgeIds);
  const errorCount = Math.max(0, Math.trunc(input.errorCount ?? 0));
  const hasFocus = focusNodeIds.length > 0 || focusEdgeIds.length > 0;
  const proofReferenceLabels = durableWeddingProductionProofLabels(input.proofReferenceLabels);
  const evidenceLabels = cleanWeddingProductionLabels([
    `${focusNodeIds.length} focus node${focusNodeIds.length === 1 ? "" : "s"} carried`,
    `${focusEdgeIds.length} focus edge${focusEdgeIds.length === 1 ? "" : "s"} carried`,
    `${highlightedNodeIds.length} node highlight${highlightedNodeIds.length === 1 ? "" : "s"} rendered`,
    `${highlightedEdgeIds.length} edge highlight${highlightedEdgeIds.length === 1 ? "" : "s"} rendered`,
    input.dimmedOutsideFocus ? "outside-focus graph elements dimmed" : null,
    input.arrivalIntentConsumed ? "arrival intent consumed by Knowledge Graph" : null,
    input.hasClearFocusControl ? "clear-focus control available" : null,
    input.hasPathEmphasisLegend ? "path-emphasis legend visible" : null,
    proofReferenceLabels.length > 0 ? `${proofReferenceLabels.length} durable graph proof reference${proofReferenceLabels.length === 1 ? "" : "s"}` : null,
  ]);
  const blockerLabels: string[] = [];

  if (!hasFocus) blockerLabels.push("No wedding graph focus nodes or edges were supplied.");
  if (missingNodes.length > 0) blockerLabels.push(`Focus nodes not highlighted: ${missingNodes.join(", ")}.`);
  if (missingEdges.length > 0) blockerLabels.push(`Focus edges not highlighted: ${missingEdges.join(", ")}.`);
  if (!input.dimmedOutsideFocus) blockerLabels.push("Canvas does not dim graph elements outside the wedding focus.");
  if (!input.arrivalIntentConsumed) blockerLabels.push("Knowledge Graph did not consume the wedding arrival/focus intent.");
  if (!input.hasClearFocusControl) blockerLabels.push("Clear-focus control is missing.");
  if (!input.hasPathEmphasisLegend) blockerLabels.push("Path-emphasis legend is missing.");
  if (proofReferenceLabels.length === 0) blockerLabels.push("Durable graph canvas proof reference is not mounted.");
  if (errorCount > 0) blockerLabels.push(`${errorCount} graph highlighting error${errorCount === 1 ? "" : "s"} occurred.`);

  if (blockerLabels.length === 0) {
    return {
      status: "ready",
      productionEvidenceReady: true,
      summary: "Wedding Knowledge Graph focus highlighting is ready with node, edge, path, and clear/reset evidence.",
      evidenceLabels,
      proofReferenceLabels,
      blockerLabels: cleanWeddingProductionLabels(blockerLabels),
    };
  }

  const handoffOnly = hasFocus && highlightedNodeIds.length === 0 && highlightedEdgeIds.length === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Wedding graph focus is carried to Knowledge Graph, but canvas highlighting is not proven yet."
      : "Wedding graph canvas highlighting is not production-ready yet.",
    evidenceLabels,
    proofReferenceLabels,
    blockerLabels: cleanWeddingProductionLabels(blockerLabels),
  };
}
