// @locs-version: 1.0
import {
  normalizeDashboardFeedLayoutValue,
  parseDashboardFeedLayout,
  pruneDashboardFeedLayout,
  type GridLayoutItem,
} from "@/lib/dashboardFeedLayout";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue, parseJsonValueOr } from "@/lib/jsonParseState";

export function readLocalStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore storage write failures */
  }
}

export function removeLocalStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore storage removal failures */
  }
}

export function readSessionStorageValue(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionStorageValue(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore storage write failures */
  }
}

export function loadDashboardFeedStringSet(raw: string | null | undefined): Set<string> {
  return normalizeDashboardFeedStringSetValue(parseJsonValueOr(raw, []));
}

export function normalizeDashboardFeedStringSetValue(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0));
}

export function loadDashboardFeedStoredStringSet(key: string): Set<string> {
  const raw = readLocalStorageValue(key);
  if (!raw) return new Set();
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    removeLocalStorageValue(key);
    return new Set();
  }
  const normalized = normalizeDashboardFeedStringSetValue(parsed.value);
  const serialized = JSON.stringify([...normalized]);
  if (serialized !== raw) writeLocalStorageValue(key, serialized);
  return normalized;
}

export function saveDashboardFeedStoredStringSet(key: string, values: ReadonlySet<string>): Set<string> {
  const normalized = loadDashboardFeedStringSet(JSON.stringify([...values]));
  writeLocalStorageValue(key, JSON.stringify([...normalized]));
  return normalized;
}

export function clearDashboardFeedStoredStringSet(key: string): void {
  removeLocalStorageValue(key);
}

export function loadDashboardFeedSnoozed(raw: string | null | undefined): Map<string, number> {
  return normalizeDashboardFeedSnoozedValue(parseJsonValueOr(raw, {}));
}

export function normalizeDashboardFeedSnoozedValue(value: unknown): Map<string, number> {
  if (!isRecord(value)) return new Map();
  const entries: Array<[string, number]> = [];
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (typeof entryValue !== "number" || !Number.isFinite(entryValue) || entryValue <= 0) continue;
    entries.push([key, entryValue]);
  }
  return new Map(entries);
}

export function loadDashboardFeedStoredSnoozed(key: string): Map<string, number> {
  const raw = readSessionStorageValue(key);
  if (!raw) return new Map();
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore storage removal failures */
    }
    return new Map();
  }
  const normalized = normalizeDashboardFeedSnoozedValue(parsed.value);
  const serialized = serializeDashboardFeedSnoozed(normalized);
  if (serialized !== raw) writeSessionStorageValue(key, serialized);
  return normalized;
}

function normalizeDashboardFeedSnoozedEntries(entries: ReadonlyMap<string, number>): Record<string, number> {
  const normalized: Array<[string, number]> = [];
  for (const [key, value] of entries.entries()) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    normalized.push([key, value]);
  }
  return Object.fromEntries(normalized);
}

export function serializeDashboardFeedSnoozed(entries: Map<string, number>): string {
  return JSON.stringify(normalizeDashboardFeedSnoozedEntries(entries));
}

export function saveDashboardFeedStoredSnoozed(
  key: string,
  entries: ReadonlyMap<string, number>,
): Map<string, number> {
  const normalized = loadDashboardFeedSnoozed(serializeDashboardFeedSnoozed(new Map(entries)));
  writeSessionStorageValue(key, serializeDashboardFeedSnoozed(normalized));
  return normalized;
}

export function loadDashboardFeedMillis(raw: string | null | undefined): number {
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function loadDashboardFeedReadAt(key: string): number {
  return loadDashboardFeedMillis(readLocalStorageValue(key));
}

export function saveDashboardFeedReadAt(key: string, value: number): number {
  const normalized = loadDashboardFeedMillis(String(value));
  writeLocalStorageValue(key, String(normalized));
  return normalized;
}

export function loadDashboardFeedSeenFlag(key: string): boolean {
  return readLocalStorageValue(key) === "1";
}

export function saveDashboardFeedSeenFlag(key: string, seen: boolean): boolean {
  writeLocalStorageValue(key, seen ? "1" : "0");
  return seen;
}

export function clearDashboardFeedLayout(key: string): void {
  removeLocalStorageValue(key);
}

export function loadDashboardFeedStoredLayout(
  key: string,
  visibleIds: Iterable<string>,
): GridLayoutItem[] {
  const raw = readLocalStorageValue(key);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    removeLocalStorageValue(key);
    return [];
  }
  const normalized = normalizeDashboardFeedLayoutValue(parsed.value, visibleIds);
  const serialized = JSON.stringify(normalized);
  if (serialized !== raw) writeLocalStorageValue(key, serialized);
  return normalized;
}

export function saveDashboardFeedStoredLayout(
  key: string,
  layout: GridLayoutItem[],
  visibleIds: Iterable<string>,
): GridLayoutItem[] {
  const normalized = pruneDashboardFeedLayout(layout, visibleIds);
  writeLocalStorageValue(key, JSON.stringify(normalized));
  return normalized;
}

export function saveDashboardFeedGridLayout(
  key: string,
  grid: { save(saveContent?: boolean): unknown },
  visibleIds: Iterable<string>,
): GridLayoutItem[] | null {
  try {
    // saveContent=false: this layout is position/size only. GridStack's
    // default (true) would otherwise capture each card's live innerHTML —
    // drag-handle markup included — into the saved layout, which then gets
    // replayed back into the DOM (or displayed) as stale, escaped markup.
    return saveDashboardFeedStoredLayout(
      key,
      grid.save(false) as Array<Record<string, unknown>>,
      visibleIds,
    );
  } catch {
    return null;
  }
}

export function pruneDashboardFeedStringSet(values: ReadonlySet<string>, validIds: ReadonlySet<string>): Set<string> {
  return new Set([...values].filter((value) => validIds.has(value)));
}

export function removeDashboardFeedStringSetIds(
  values: ReadonlySet<string>,
  removedIds: ReadonlySet<string>,
): Set<string> {
  return new Set([...values].filter((value) => !removedIds.has(value)));
}

export function pruneDashboardFeedSnoozed(values: ReadonlyMap<string, number>, validIds: ReadonlySet<string>): Map<string, number> {
  return new Map([...values.entries()].filter(([key]) => validIds.has(key)));
}

export function removeDashboardFeedSnoozedIds(
  values: ReadonlyMap<string, number>,
  removedIds: ReadonlySet<string>,
): Map<string, number> {
  return new Map([...values.entries()].filter(([key]) => !removedIds.has(key)));
}

export function pruneExpiredDashboardFeedSnoozed(values: ReadonlyMap<string, number>, now: number): Map<string, number> {
  return new Map([...values.entries()].filter(([, wakeAt]) => Number.isFinite(wakeAt) && wakeAt > now));
}

export function pruneDashboardFeedSnoozedAgainstDismissed(
  values: ReadonlyMap<string, number>,
  dismissedIds: ReadonlySet<string>,
): Map<string, number> {
  return new Map([...values.entries()].filter(([key]) => !dismissedIds.has(key)));
}
