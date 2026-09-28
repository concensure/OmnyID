// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type SupertagGridDensity = "compact" | "comfortable" | "spacious";
export type SupertagGridFilterCombinator = "and" | "or";

export type SupertagGridSortKey = {
  field: string;
  asc: boolean;
};

export type SupertagGridRuntimeState = {
  sortKeys: SupertagGridSortKey[];
  colOrder: string[];
  activeFilters: string[];
  pinnedCols: string[];
  groupBy?: boolean;
  hiddenCols: string[];
  density?: SupertagGridDensity;
  zebraStripe?: boolean;
  filterCombinator?: SupertagGridFilterCombinator;
};

export type SupertagGridCrossRowDrop = {
  sourceViewId: string;
  sourceTitle: string;
  ledgerId?: string;
  cells: Record<string, unknown>;
  supertags: string[];
};

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(trimmedString).filter((entry): entry is string => Boolean(entry));
}

function sortKeys(value: unknown): SupertagGridSortKey[] {
  if (!Array.isArray(value)) return [];
  const normalized: SupertagGridSortKey[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const field = trimmedString(entry.field);
    if (!field) continue;
    normalized.push({ field, asc: typeof entry.asc === "boolean" ? entry.asc : true });
  }
  return normalized;
}

function density(value: unknown): SupertagGridDensity | undefined {
  return value === "compact" || value === "comfortable" || value === "spacious" ? value : undefined;
}

function filterCombinator(value: unknown): SupertagGridFilterCombinator | undefined {
  return value === "and" || value === "or" ? value : undefined;
}

export function normalizeSupertagGridRuntimeState(value: unknown): SupertagGridRuntimeState | null {
  if (!isRecord(value)) return null;

  const state: SupertagGridRuntimeState = {
    sortKeys: sortKeys(value.sortKeys),
    colOrder: stringArray(value.colOrder),
    activeFilters: stringArray(value.activeFilters),
    pinnedCols: stringArray(value.pinnedCols),
    hiddenCols: stringArray(value.hiddenCols),
  };

  if (typeof value.groupBy === "boolean") state.groupBy = value.groupBy;
  if (typeof value.zebraStripe === "boolean") state.zebraStripe = value.zebraStripe;

  const normalizedDensity = density(value.density);
  if (normalizedDensity) state.density = normalizedDensity;

  const normalizedCombinator = filterCombinator(value.filterCombinator);
  if (normalizedCombinator) state.filterCombinator = normalizedCombinator;

  return state;
}

export function parseSupertagGridShareHash(hash: string, viewId: string): SupertagGridRuntimeState | null {
  const prefix = `#sgrid_${viewId}=`;
  if (!hash.startsWith(prefix)) return null;

  try {
    const parsed = parseJsonValue(atob(hash.slice(prefix.length)));
    return parsed.ok ? normalizeSupertagGridRuntimeState(parsed.value) : null;
  } catch {
    return null;
  }
}

export function parseSupertagGridCrossRowDrop(data: string): SupertagGridCrossRowDrop | null {
  const parsed = parseJsonValue(data);
  if (!parsed.ok) return null;

  if (!isRecord(parsed.value) || !isRecord(parsed.value.cells)) return null;

  const sourceViewId = trimmedString(parsed.value.sourceViewId);
  const sourceTitle = trimmedString(parsed.value.sourceTitle);
  if (!sourceViewId || !sourceTitle) return null;

  const ledgerId = trimmedString(parsed.value.ledger_id);
  return {
    sourceViewId,
    sourceTitle,
    cells: parsed.value.cells,
    supertags: stringArray(parsed.value.supertags),
    ...(ledgerId ? { ledgerId } : {}),
  };
}
