// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { ViewName } from "@/lib/viewNames";
import { normalizeViewName } from "@/lib/viewNames";

export type BentoTileConfig = {
  id: string;
  viewId: ViewName;
  colSpan: number;
  rowSpan: number;
  bgKey?: string;
  bgImage?: string;
  displayMode?: "default" | "compact" | "graph";
};

export const BENTO_LAYOUT_KEY = "omnyid.tile.bento-v1";

export function bentoTileEnabledStorageKey(tileId: string): string {
  return `omnyid.tile.enabled.${tileId}`;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTileSpan(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function normalizeTileDisplayMode(value: unknown): BentoTileConfig["displayMode"] | undefined {
  return value === "default" || value === "compact" || value === "graph" ? value : undefined;
}

function normalizeBentoTileConfig(value: unknown): BentoTileConfig | null {
  if (!isRecord(value)) return null;
  const id = readTrimmedString(value.id);
  const viewId = normalizeViewName(readTrimmedString(value.viewId));
  const colSpan = normalizeTileSpan(value.colSpan);
  const rowSpan = normalizeTileSpan(value.rowSpan);
  if (!id || !viewId || colSpan === null || rowSpan === null) return null;
  const bgKey = readTrimmedString(value.bgKey) ?? undefined;
  const bgImage = readTrimmedString(value.bgImage) ?? undefined;
  const displayMode = normalizeTileDisplayMode(value.displayMode);
  return {
    id,
    viewId,
    colSpan,
    rowSpan,
    ...(bgKey ? { bgKey } : {}),
    ...(bgImage ? { bgImage } : {}),
    ...(displayMode ? { displayMode } : {}),
  };
}

function normalizeBentoLayout(tiles: BentoTileConfig[]): BentoTileConfig[] {
  return tiles
    .map((tile) => normalizeBentoTileConfig(tile))
    .filter((tile): tile is BentoTileConfig => tile !== null);
}

function writeBentoStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

function removeBentoStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function loadBentoGridLayoutState(defaultTiles: BentoTileConfig[]): {
  tiles: BentoTileConfig[];
  hasSavedLayout: boolean;
} {
  try {
    const raw = localStorage.getItem(BENTO_LAYOUT_KEY);
    if (!raw) return { tiles: defaultTiles, hasSavedLayout: false };
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeBentoStorageValue(BENTO_LAYOUT_KEY);
      return { tiles: defaultTiles, hasSavedLayout: false };
    }
    const tiles = Array.isArray(parsed.value) ? normalizeBentoLayout(parsed.value) : [];
    if (tiles.length === 0) {
      removeBentoStorageValue(BENTO_LAYOUT_KEY);
      return { tiles: defaultTiles, hasSavedLayout: false };
    }
    const serialized = JSON.stringify(tiles);
    if (serialized !== raw) writeBentoStorageValue(BENTO_LAYOUT_KEY, serialized);
    return { tiles, hasSavedLayout: true };
  } catch {
    removeBentoStorageValue(BENTO_LAYOUT_KEY);
    return { tiles: defaultTiles, hasSavedLayout: false };
  }
}

export function saveBentoGridLayout(tiles: BentoTileConfig[]) {
  writeBentoStorageValue(BENTO_LAYOUT_KEY, JSON.stringify(normalizeBentoLayout(tiles)));
}

export function clearBentoGridLayout(): void {
  removeBentoStorageValue(BENTO_LAYOUT_KEY);
}

export function loadHiddenBentoTileIds(tileIds: readonly string[]): Set<string> {
  const hidden = new Set<string>();
  try {
    for (const tileId of tileIds) {
      const key = bentoTileEnabledStorageKey(tileId);
      const stored = localStorage.getItem(key);
      if (stored === "0") {
        hidden.add(tileId);
      } else if (stored !== "1" && stored !== null) {
        writeBentoStorageValue(key, "1");
      }
    }
  } catch {
    return new Set<string>();
  }
  return hidden;
}

export function saveBentoTileEnabled(tileId: string, enabled: boolean): void {
  writeBentoStorageValue(bentoTileEnabledStorageKey(tileId), enabled ? "1" : "0");
}

export function clearBentoTileEnabled(tileId: string): void {
  removeBentoStorageValue(bentoTileEnabledStorageKey(tileId));
}
