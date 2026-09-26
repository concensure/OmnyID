// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import type { ThreadSortMode } from "@/lib/threadSort";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type ThreadDensity = "comfortable" | "compact";
export type ThreadPriorityLevel = "high" | "medium" | "low";
export type ThreadQueryHistoryEntry = {
  query: string;
  timestamp: string;
  result?: string;
};

export const QUERY_HISTORY_KEY = "omnyid.query-history";
export const THREAD_ARCHIVED_KEY = "omnyid.archived-threads";
export const THREAD_STARS_KEY = "omnyid.thread-stars";
export const THREAD_LOCKED_KEY = "omnyid.locked-threads";
export const THREAD_PINNED_KEY = "omnyid.thread-pinned";
export const THREAD_ORDER_KEY = "omnyid.thread-order";
export const THREAD_PRIORITY_KEY = "omnyid.thread-priority";
export const DISMISSED_MERGE_PAIRS_KEY = "omnyid.dismissed-merge-pairs";
export const THREAD_TITLES_KEY = "omnyid.thread-titles";
export const THREAD_LAST_READ_KEY = "omnyid.thread-last-read";
export const THREAD_DENSITY_KEY = "omnyid.threads.density";
export const THREAD_SORT_MODE_KEY = "omnyid.threads.sort-mode";

function normalizeThreadDensity(value: unknown): ThreadDensity {
  return value === "compact" ? "compact" : "comfortable";
}

function normalizeThreadSortMode(value: unknown): ThreadSortMode {
  return value === "recently_edited" ? "recently_edited" : "activity";
}

function normalizeThreadLastRead(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([threadId, timestamp]): Array<[string, string]> => {
      const normalizedThreadId = threadId.trim();
      const normalizedTimestamp =
        typeof timestamp === "string" && timestamp.trim().length > 0 ? timestamp.trim() : null;
      return normalizedThreadId && normalizedTimestamp ? [[normalizedThreadId, normalizedTimestamp]] : [];
    }),
  );
}

function normalizeThreadIdSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value.flatMap((entry): string[] => {
      if (typeof entry !== "string") return [];
      const normalized = entry.trim();
      return normalized ? [normalized] : [];
    }),
  );
}

function normalizeThreadIdList(value: unknown): string[] {
  return [...normalizeThreadIdSet(value)];
}

function normalizeThreadPriorityLevel(value: unknown): ThreadPriorityLevel | null {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function normalizeThreadPriorityMap(value: unknown): Record<string, ThreadPriorityLevel | null> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([threadId, level]): Array<[string, ThreadPriorityLevel | null]> => {
      const normalizedThreadId = threadId.trim();
      const normalizedLevel = level === null ? null : normalizeThreadPriorityLevel(level);
      return normalizedThreadId && (normalizedLevel !== null || level === null)
        ? [[normalizedThreadId, normalizedLevel]]
        : [];
    }),
  );
}

function normalizeThreadTitleMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([threadId, title]): Array<[string, string]> => {
      const normalizedThreadId = threadId.trim();
      const normalizedTitle = typeof title === "string" && title.trim().length > 0 ? title.trim() : null;
      return normalizedThreadId && normalizedTitle ? [[normalizedThreadId, normalizedTitle]] : [];
    }),
  );
}

function normalizeThreadQueryHistory(value: unknown): ThreadQueryHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ThreadQueryHistoryEntry[] => {
    if (!isRecord(entry)) return [];
    const query = typeof entry.query === "string" && entry.query.trim().length > 0 ? entry.query.trim() : null;
    const timestamp =
      typeof entry.timestamp === "string" && entry.timestamp.trim().length > 0
        ? entry.timestamp.trim()
        : null;
    const result =
      typeof entry.result === "string" && entry.result.trim().length > 0
        ? entry.result.trim()
        : undefined;
    return query && timestamp ? [{ query, timestamp, ...(result ? { result } : {}) }] : [];
  });
}

function removeMalformedStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage cleanup failures
  }
}

function scopedThreadListStorageKey(baseKey: string, userId: string | null | undefined): string {
  return accountScopedStorageKey(baseKey, userId);
}

function removeScopedThreadListStorageValue(baseKey: string, userId: string | null | undefined): void {
  const scopedKey = scopedThreadListStorageKey(baseKey, userId);
  removeMalformedStorageValue(scopedKey);
  if (scopedKey !== baseKey) removeMalformedStorageValue(baseKey);
}

function loadRawThreadListStorageValue(baseKey: string, userId: string | null | undefined): string | null {
  const scopedKey = scopedThreadListStorageKey(baseKey, userId);
  return localStorage.getItem(scopedKey) ?? localStorage.getItem(baseKey);
}

function writeScopedThreadListStorageValue(baseKey: string, userId: string | null | undefined, value: string): void {
  const scopedKey = scopedThreadListStorageKey(baseKey, userId);
  try {
    localStorage.setItem(scopedKey, value);
  } catch {
    // ignore storage failures
  }
  if (scopedKey !== baseKey) removeMalformedStorageValue(baseKey);
}

function loadNormalizedJsonValue<T>(
  key: string,
  userId: string | null | undefined,
  fallback: T,
  normalize: (value: unknown) => T,
): T {
  try {
    const raw = loadRawThreadListStorageValue(key, userId);
    if (!raw) return fallback;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeScopedThreadListStorageValue(key, userId);
      return fallback;
    }
    const normalized = normalize(parsed.value);
    const normalizedJson = JSON.stringify(normalized);
    const scopedKey = scopedThreadListStorageKey(key, userId);
    if (raw !== normalizedJson || localStorage.getItem(scopedKey) !== normalizedJson) {
      writeScopedThreadListStorageValue(key, userId, normalizedJson);
    }
    return normalized;
  } catch {
    removeScopedThreadListStorageValue(key, userId);
    return fallback;
  }
}

function loadNormalizedJsonSet(key: string, userId: string | null | undefined): Set<string> {
  return normalizeThreadIdSet(loadNormalizedJsonValue<string[]>(key, userId, [], normalizeThreadIdList));
}

export function loadThreadDensity(userId?: string | null): ThreadDensity {
  try {
    const raw = loadRawThreadListStorageValue(THREAD_DENSITY_KEY, userId);
    const normalized = normalizeThreadDensity(raw);
    if (raw !== null && (raw !== normalized || localStorage.getItem(scopedThreadListStorageKey(THREAD_DENSITY_KEY, userId)) !== normalized)) {
      writeScopedThreadListStorageValue(THREAD_DENSITY_KEY, userId, normalized);
    }
    return normalized;
  } catch {
    return "comfortable";
  }
}

export function saveThreadDensity(value: ThreadDensity, userId?: string | null): void {
  writeScopedThreadListStorageValue(THREAD_DENSITY_KEY, userId, normalizeThreadDensity(value));
}

export function loadThreadSortMode(userId?: string | null): ThreadSortMode {
  try {
    const raw = loadRawThreadListStorageValue(THREAD_SORT_MODE_KEY, userId);
    const normalized = normalizeThreadSortMode(raw);
    if (raw !== null && (raw !== normalized || localStorage.getItem(scopedThreadListStorageKey(THREAD_SORT_MODE_KEY, userId)) !== normalized)) {
      writeScopedThreadListStorageValue(THREAD_SORT_MODE_KEY, userId, normalized);
    }
    return normalized;
  } catch {
    return "activity";
  }
}

export function saveThreadSortMode(value: ThreadSortMode, userId?: string | null): void {
  writeScopedThreadListStorageValue(THREAD_SORT_MODE_KEY, userId, normalizeThreadSortMode(value));
}

export function loadArchivedThreadIds(userId?: string | null): Set<string> {
  return loadNormalizedJsonSet(THREAD_ARCHIVED_KEY, userId);
}

export function saveArchivedThreadIds(value: ReadonlySet<string>, userId?: string | null): Set<string> {
  const normalized = normalizeThreadIdSet([...value]);
  writeScopedThreadListStorageValue(THREAD_ARCHIVED_KEY, userId, JSON.stringify([...normalized]));
  return normalized;
}

export function loadStarredThreadIds(userId?: string | null): Set<string> {
  return loadNormalizedJsonSet(THREAD_STARS_KEY, userId);
}

export function saveStarredThreadIds(value: ReadonlySet<string>, userId?: string | null): Set<string> {
  const normalized = normalizeThreadIdSet([...value]);
  writeScopedThreadListStorageValue(THREAD_STARS_KEY, userId, JSON.stringify([...normalized]));
  return normalized;
}

export function loadLockedThreadIds(userId?: string | null): Set<string> {
  return loadNormalizedJsonSet(THREAD_LOCKED_KEY, userId);
}

export function saveLockedThreadIds(value: ReadonlySet<string>, userId?: string | null): Set<string> {
  const normalized = normalizeThreadIdSet([...value]);
  writeScopedThreadListStorageValue(THREAD_LOCKED_KEY, userId, JSON.stringify([...normalized]));
  return normalized;
}

export function loadPinnedThreadIds(userId?: string | null): Set<string> {
  return loadNormalizedJsonSet(THREAD_PINNED_KEY, userId);
}

export function savePinnedThreadIds(value: ReadonlySet<string>, userId?: string | null): Set<string> {
  const normalized = normalizeThreadIdSet([...value]);
  writeScopedThreadListStorageValue(THREAD_PINNED_KEY, userId, JSON.stringify([...normalized]));
  return normalized;
}

export function loadThreadOrder(userId?: string | null): string[] {
  return loadNormalizedJsonValue(THREAD_ORDER_KEY, userId, [], normalizeThreadIdList);
}

export function saveThreadOrder(value: readonly string[], userId?: string | null): string[] {
  const normalized = normalizeThreadIdList(value);
  writeScopedThreadListStorageValue(THREAD_ORDER_KEY, userId, JSON.stringify(normalized));
  return normalized;
}

export function loadThreadPriority(userId?: string | null): Record<string, ThreadPriorityLevel | null> {
  return loadNormalizedJsonValue(THREAD_PRIORITY_KEY, userId, {}, normalizeThreadPriorityMap);
}

export function saveThreadPriority(
  value: Record<string, ThreadPriorityLevel | null>,
  userId?: string | null,
): Record<string, ThreadPriorityLevel | null> {
  const normalized = normalizeThreadPriorityMap(value);
  writeScopedThreadListStorageValue(THREAD_PRIORITY_KEY, userId, JSON.stringify(normalized));
  return normalized;
}

export function loadDismissedMergePairs(userId?: string | null): Set<string> {
  return loadNormalizedJsonSet(DISMISSED_MERGE_PAIRS_KEY, userId);
}

export function saveDismissedMergePairs(value: ReadonlySet<string>, userId?: string | null): Set<string> {
  const normalized = normalizeThreadIdSet([...value]);
  writeScopedThreadListStorageValue(DISMISSED_MERGE_PAIRS_KEY, userId, JSON.stringify([...normalized]));
  return normalized;
}

export function loadThreadTitles(userId?: string | null): Record<string, string> {
  return loadNormalizedJsonValue(THREAD_TITLES_KEY, userId, {}, normalizeThreadTitleMap);
}

export function saveThreadTitles(value: Record<string, string>, userId?: string | null): Record<string, string> {
  const normalized = normalizeThreadTitleMap(value);
  writeScopedThreadListStorageValue(THREAD_TITLES_KEY, userId, JSON.stringify(normalized));
  return normalized;
}

export function loadThreadQueryHistory(userId?: string | null): ThreadQueryHistoryEntry[] {
  return loadNormalizedJsonValue(QUERY_HISTORY_KEY, userId, [], normalizeThreadQueryHistory);
}

export function loadThreadLastRead(userId?: string | null): Record<string, string> {
  return loadNormalizedJsonValue(THREAD_LAST_READ_KEY, userId, {}, normalizeThreadLastRead);
}

export function saveThreadLastRead(value: Record<string, string>, userId?: string | null): void {
  writeScopedThreadListStorageValue(THREAD_LAST_READ_KEY, userId, JSON.stringify(normalizeThreadLastRead(value)));
}
