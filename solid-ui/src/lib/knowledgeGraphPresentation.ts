// @locs-version: 1.0
import { surfaceRelativeTimestamp, surfaceShortDateLabel } from "./surfaceTimestampPresentation";

export function formatKnowledgeGraphRelativeDate(timestamp: string, nowMs: number = Date.now()): string {
  const date = new Date(timestamp);
  const timeMs = date.getTime();
  if (!Number.isFinite(timeMs)) return "";

  const diffMs = nowMs - timeMs;
  if (diffMs < 7 * 24 * 3_600_000) {
    return surfaceRelativeTimestamp(timestamp, nowMs);
  }

  return surfaceShortDateLabel(timestamp);
}

export function shouldShowKnowledgeGraphSummaryToggle(summary: string, maxCollapsedLength: number = 180): boolean {
  return summary.length > maxCollapsedLength;
}

export function knowledgeGraphBacklinkOverflowLabel(totalBacklinks: number, visibleBacklinks: number = 4): string | null {
  const hiddenCount = totalBacklinks - visibleBacklinks;
  return hiddenCount > 0 ? `+${hiddenCount} more` : null;
}

export function formatKnowledgeGraphSimilarityLabel(similarityScore: number | null | undefined): string | null {
  if (typeof similarityScore !== "number") return null;
  return `${Math.round(similarityScore * 100)}% similar`;
}

export function formatKnowledgeGraphInsightCountLabel(count: number | null | undefined): string | null {
  if (typeof count !== "number") return null;
  return `x${count}`;
}

export function formatKnowledgeGraphCardCountLabel(cardCount: number): string {
  return `${cardCount} card${cardCount === 1 ? "" : "s"}`;
}

export function formatKnowledgeGraphBacklinkCountLabel(backlinkCount: number): string {
  return `${backlinkCount} backlink${backlinkCount === 1 ? "" : "s"}`;
}

export function formatKnowledgeGraphMergeSuggestionCountLabel(mergeSuggestionCount: number): string {
  return `${mergeSuggestionCount} merge suggestion${mergeSuggestionCount === 1 ? "" : "s"}`;
}

export function knowledgeGraphMergeSuggestionOverflowLabel(totalSuggestions: number, visibleSuggestions: number = 5): string | null {
  const hiddenCount = totalSuggestions - visibleSuggestions;
  return hiddenCount > 0 ? `+${hiddenCount} more suggestions - open the Threads view to review all.` : null;
}
