// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type ColumnDisplayMode = "truncate" | "wrap";
export type ColumnWidthMap = Record<string, number>;

export const COLUMN_DISPLAY_STORAGE_PREFIX = "omnyid.table.columnDisplay";
export const COLUMN_WIDTH_STORAGE_PREFIX = "omnyid.table.columnWidth";
export const MIN_COLUMN_WIDTH = 120;
export const MAX_COLUMN_WIDTH = 720;

export function tableColumnDisplayStorageKey(scope: string): string {
  return `${COLUMN_DISPLAY_STORAGE_PREFIX}.${scope}`;
}

export function tableColumnWidthStorageKey(scope: string): string {
  return `${COLUMN_WIDTH_STORAGE_PREFIX}.${scope}`;
}

export function clampTableColumnWidth(width: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)));
}

function normalizeColumnDisplayModes(raw: unknown): Record<string, ColumnDisplayMode> {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, ColumnDisplayMode] =>
      typeof entry[0] === "string" && (entry[1] === "truncate" || entry[1] === "wrap"),
    ),
  );
}

function normalizeColumnWidths(raw: unknown): ColumnWidthMap {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter((entry): entry is [string, number] =>
        typeof entry[0] === "string"
        && typeof entry[1] === "number"
        && Number.isFinite(entry[1]),
      )
      .map(([column, width]) => [column, clampTableColumnWidth(width)]),
  );
}

function writeTableRendererStorageValue(storageKey: string, value: string): void {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // ignore storage failures
  }
}

function removeTableRendererStorageValue(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore storage failures
  }
}

export function loadTableColumnDisplayModes(storageKey: string): Record<string, ColumnDisplayMode> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeTableRendererStorageValue(storageKey);
      return {};
    }
    const normalized = normalizeColumnDisplayModes(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeTableRendererStorageValue(storageKey, serialized);
    return normalized;
  } catch {
    removeTableRendererStorageValue(storageKey);
    return {};
  }
}

export function saveTableColumnDisplayModes(
  storageKey: string,
  value: Record<string, ColumnDisplayMode>,
): Record<string, ColumnDisplayMode> {
  const normalized = normalizeColumnDisplayModes(value);
  writeTableRendererStorageValue(storageKey, JSON.stringify(normalized));
  return normalized;
}

export function loadTableColumnWidths(storageKey: string): ColumnWidthMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeTableRendererStorageValue(storageKey);
      return {};
    }
    const normalized = normalizeColumnWidths(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeTableRendererStorageValue(storageKey, serialized);
    return normalized;
  } catch {
    removeTableRendererStorageValue(storageKey);
    return {};
  }
}

export function saveTableColumnWidths(storageKey: string, value: ColumnWidthMap): ColumnWidthMap {
  const normalized = normalizeColumnWidths(value);
  writeTableRendererStorageValue(storageKey, JSON.stringify(normalized));
  return normalized;
}
