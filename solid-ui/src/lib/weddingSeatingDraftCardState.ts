// @locs-version: 1.0
import {
  compactWeddingSeatingOptimizationResults,
  type WeddingSeatingOptimizationResult,
  weddingSeatingOptimizationFingerprint,
} from "@/lib/weddingSeatingOptimizationState";

export type WeddingSeatingDraftCard = {
  id: string;
  title: string;
  statusLabel: string;
  detailLabel: string;
  metadataLabels: string[];
  isCurrent: boolean;
  result: WeddingSeatingOptimizationResult;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateLabel(value: string | null | undefined): string | null {
  const timestamp = clean(value);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
}

export function buildWeddingSeatingDraftCards(
  results: readonly WeddingSeatingOptimizationResult[] | null | undefined,
  hiddenFingerprints?: readonly string[] | null,
): WeddingSeatingDraftCard[] {
  const hidden = new Set((hiddenFingerprints ?? []).map((fingerprint) => clean(fingerprint)).filter(Boolean));
  const drafts = compactWeddingSeatingOptimizationResults(results)
    .filter((result) => !hidden.has(clean(result.fingerprint) || weddingSeatingOptimizationFingerprint(result)));
  const currentIndex = drafts.length - 1;
  return drafts.map((result, index) => {
    const savedLabel = dateLabel(result.savedAt);
    const ruleCheckCount = result.hardViolations.length;
    return {
      id: `wedding_seating_draft:${index + 1}`,
      title: index === currentIndex ? "Current seating draft" : `Saved seating draft ${index + 1}`,
      statusLabel: index === currentIndex ? "Current" : "Saved",
      detailLabel: savedLabel ? `Saved ${savedLabel}` : `${result.assignments.length} guests placed`,
      metadataLabels: [
        `${result.assignments.length} guests placed`,
        ruleCheckCount === 0 ? "Rules clear" : `${ruleCheckCount} rule check${ruleCheckCount === 1 ? "" : "s"}`,
      ],
      isCurrent: index === currentIndex,
      result,
    };
  }).reverse();
}
