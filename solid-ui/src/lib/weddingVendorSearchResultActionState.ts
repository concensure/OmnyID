// @locs-version: 1.0
import type { WeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingVendorSearchResultAction = {
  label: string;
  detail: string;
  artifactId: string;
  menu: WeddingWorkspaceMenuId;
};

export type WeddingVendorSearchQueryEditState = {
  resultAction: null;
  notice: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function artifactSearchText(artifact: WeddingArtifactSummary): string {
  const metadata = metadataRecord(artifact.metadata);
  const semanticObject = metadataRecord(metadata.semantic_object);
  return [
    artifact.id,
    artifact.title,
    artifact.searchText,
    artifact.sourceLabels.join(" "),
    artifact.sourceLinks.map((source) => source.label).join(" "),
    clean(metadata.source),
    clean(semanticObject.id),
    clean(semanticObject.kind),
  ].join("\n").toLowerCase();
}

function isVendorSearchSummary(artifact: WeddingArtifactSummary): boolean {
  return artifact.kind === "vendor_table"
    && /vendor_search_executor|source-backed vendor-search|vendor search source packet|vendor shortlist|google_places|brave search|overpass/.test(
      artifactSearchText(artifact),
    );
}

function isVendorComparisonSummary(artifact: WeddingArtifactSummary): boolean {
  return artifact.kind === "vendor_table"
    && /vendor_search_comparison|top vendor comparison|top-three|top three vendor|top three vendor choices|wedding_vendor_comparison/.test(
      artifactSearchText(artifact),
    );
}

function newestFirst(a: WeddingArtifactSummary, b: WeddingArtifactSummary): number {
  return b.createdAt - a.createdAt;
}

export function buildWeddingVendorSearchResultAction(input: {
  sourceArtifactId?: string | null;
  comparisonArtifactId?: string | null;
  comparisonCreated?: boolean | null;
  topChoiceCount?: number | null;
}): WeddingVendorSearchResultAction | null {
  const comparisonArtifactId = clean(input.comparisonArtifactId);
  if (input.comparisonCreated && comparisonArtifactId) {
    const boundedCount = Number.isFinite(input.topChoiceCount ?? NaN)
      ? Math.max(1, Math.min(5, Math.round(input.topChoiceCount ?? 3)))
      : null;
    return {
      label: boundedCount ? `Review top-${boundedCount} comparison` : "Review top comparison",
      detail: "Open the saved source-backed comparison in Documents.",
      artifactId: comparisonArtifactId,
      menu: "documents",
    };
  }

  const sourceArtifactId = clean(input.sourceArtifactId);
  if (!sourceArtifactId) return null;
  return {
    label: "Open vendor notes",
    detail: "Open the saved source-backed vendor notes in Documents.",
    artifactId: sourceArtifactId,
    menu: "documents",
  };
}

export function buildWeddingVendorSearchQueryEditState(query: string): WeddingVendorSearchQueryEditState {
  return {
    resultAction: null,
    notice: clean(query)
      ? "Search query updated. Run live search to refresh the saved vendor results."
      : "Search query cleared. Add a vendor search query or use your onboarding answers.",
  };
}

export function buildWeddingVendorSearchResultActionFromArtifacts(
  artifacts: readonly WeddingArtifactSummary[],
): WeddingVendorSearchResultAction | null {
  const comparison = [...artifacts].filter(isVendorComparisonSummary).sort(newestFirst)[0] ?? null;
  if (comparison) {
    const metadata = metadataRecord(comparison.metadata);
    const topChoiceCount = Number(metadata.topChoiceCount);
    return buildWeddingVendorSearchResultAction({
      sourceArtifactId: null,
      comparisonArtifactId: comparison.id,
      comparisonCreated: true,
      topChoiceCount: Number.isFinite(topChoiceCount) ? topChoiceCount : null,
    });
  }

  const source = [...artifacts].filter(isVendorSearchSummary).sort(newestFirst)[0] ?? null;
  return buildWeddingVendorSearchResultAction({
    sourceArtifactId: source?.id ?? null,
    comparisonArtifactId: null,
    comparisonCreated: false,
  });
}

export function hasWeddingVendorSearchArtifactSummary(artifacts: readonly WeddingArtifactSummary[]): boolean {
  return artifacts.some(isVendorSearchSummary);
}

export function hasWeddingVendorComparisonArtifactSummary(artifacts: readonly WeddingArtifactSummary[]): boolean {
  return artifacts.some(isVendorComparisonSummary);
}

export function hasWeddingVendorTopFiveComparisonExpansion(artifacts: readonly WeddingArtifactSummary[]): boolean {
  return artifacts.some((artifact) => {
    if (!isVendorComparisonSummary(artifact)) return false;
    const metadata = metadataRecord(artifact.metadata);
    const topChoiceCount = Number(metadata.topChoiceCount);
    const handoff = metadata.vendorComparisonHandoff;
    return metadata.source === "vendor_search_comparison"
      && Number.isFinite(topChoiceCount)
      && topChoiceCount > 3
      && handoff !== null
      && typeof handoff === "object"
      && !Array.isArray(handoff);
  });
}
