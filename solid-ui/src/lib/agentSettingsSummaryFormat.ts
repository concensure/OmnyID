// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export function deviceSyncSliceSummaryLines(
  syncSlices: Record<string, unknown> | unknown[] | null | undefined,
): string[] {
  if (!syncSlices) return [];
  if (Array.isArray(syncSlices)) {
    return syncSlices.slice(0, 4).map((value) => String(value));
  }
  return Object.entries(syncSlices)
    .slice(0, 4)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} slices`;
      if (isRecord(value)) {
        return `${key}: ${Object.keys(value).length} fields`;
      }
      return `${key}: ${String(value)}`;
    });
}

export function compactSummaryLines(summary: Record<string, unknown> | null | undefined): string[] {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  return Object.entries(summary)
    .slice(0, 4)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} entries`;
      if (isRecord(value)) {
        return `${key}: ${Object.keys(value).length} fields`;
      }
      return `${key}: ${String(value)}`;
    });
}

export function compactSummaryLinesExcluding(
  summary: Record<string, unknown> | null | undefined,
  excludedKeys: string[],
): string[] {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  return Object.entries(summary)
    .filter(([key]) => !excludedKeys.includes(key))
    .slice(0, 4)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} entries`;
      if (isRecord(value)) {
        return `${key}: ${Object.keys(value).length} fields`;
      }
      return `${key}: ${String(value)}`;
    });
}
