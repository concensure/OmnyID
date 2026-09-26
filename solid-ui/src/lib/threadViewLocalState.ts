// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export const THREAD_VIEW_STARRED_KEY = "omnyid.thread.starred";
export const THREAD_VIEW_REACTIONS_KEY = "omnyid.thread.reactions";

function threadViewLastReadStorageKey(threadId: string, userId: string | null | undefined): string | null {
  const normalized = threadId.trim();
  return normalized ? accountScopedStorageKey(`omnyid.thread.lastread.${normalized}`, userId) : null;
}

function legacyThreadViewLastReadStorageKey(threadId: string): string | null {
  const normalized = threadId.trim();
  return normalized ? `omnyid.thread.lastread.${normalized}` : null;
}

function threadViewScrollPositionStorageKey(threadId: string, userId: string | null | undefined): string | null {
  const normalized = threadId.trim();
  return normalized ? accountScopedStorageKey(`omnyid.thread.scrollpos.${normalized}`, userId) : null;
}

function legacyThreadViewScrollPositionStorageKey(threadId: string): string | null {
  const normalized = threadId.trim();
  return normalized ? `omnyid.thread.scrollpos.${normalized}` : null;
}

function normalizeThreadViewStarredMessageIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value.flatMap((entry): string[] => {
      if (typeof entry !== "string") return [];
      const normalized = entry.trim();
      return normalized ? [normalized] : [];
    }),
  );
}

function normalizeThreadViewMessageId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeThreadViewScrollPosition(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function normalizeThreadViewReactions(
  value: unknown,
): Record<string, Record<string, number>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([messageId, reactionCounts]): Array<[string, Record<string, number>]> => {
      const normalizedMessageId = messageId.trim();
      if (!normalizedMessageId || !isRecord(reactionCounts)) return [];
      const normalizedCounts = Object.fromEntries(
        Object.entries(reactionCounts).flatMap(([emoji, count]): Array<[string, number]> => {
          const normalizedEmoji = emoji.trim();
          if (!normalizedEmoji || typeof count !== "number" || !Number.isFinite(count) || count <= 0) return [];
          return [[normalizedEmoji, Math.floor(count)]];
        }),
      );
      return Object.keys(normalizedCounts).length > 0 ? [[normalizedMessageId, normalizedCounts]] : [];
    }),
  );
}

function writeThreadViewLocalStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeThreadViewLocalStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function writeThreadViewSessionStorageValue(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeThreadViewSessionStorageValue(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function loadThreadViewStarredMessageIdsForUser(userId: string | null | undefined): Set<string> {
  try {
    const scopedKey = accountScopedStorageKey(THREAD_VIEW_STARRED_KEY, userId);
    const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(THREAD_VIEW_STARRED_KEY);
    if (!raw) return new Set<string>();
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeThreadViewLocalStorageValue(scopedKey);
      removeThreadViewLocalStorageValue(THREAD_VIEW_STARRED_KEY);
      return new Set<string>();
    }
    const normalized = normalizeThreadViewStarredMessageIds(parsed.value);
    const serialized = JSON.stringify([...normalized]);
    if (serialized !== raw || localStorage.getItem(scopedKey) !== serialized) {
      writeThreadViewLocalStorageValue(scopedKey, serialized);
    }
    if (scopedKey !== THREAD_VIEW_STARRED_KEY) removeThreadViewLocalStorageValue(THREAD_VIEW_STARRED_KEY);
    return normalized;
  } catch {
    const scopedKey = accountScopedStorageKey(THREAD_VIEW_STARRED_KEY, userId);
    removeThreadViewLocalStorageValue(scopedKey);
    removeThreadViewLocalStorageValue(THREAD_VIEW_STARRED_KEY);
    return new Set<string>();
  }
}

export function loadThreadViewStarredMessageIds(userId?: string | null): Set<string> {
  return loadThreadViewStarredMessageIdsForUser(userId);
}

export function saveThreadViewStarredMessageIds(value: ReadonlySet<string>, userId?: string | null): Set<string> {
  const normalized = normalizeThreadViewStarredMessageIds([...value]);
  const scopedKey = accountScopedStorageKey(THREAD_VIEW_STARRED_KEY, userId);
  try {
    localStorage.setItem(scopedKey, JSON.stringify([...normalized]));
    if (scopedKey !== THREAD_VIEW_STARRED_KEY) removeThreadViewLocalStorageValue(THREAD_VIEW_STARRED_KEY);
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function loadThreadViewReactions(userId?: string | null): Record<string, Record<string, number>> {
  try {
    const scopedKey = accountScopedStorageKey(THREAD_VIEW_REACTIONS_KEY, userId);
    const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(THREAD_VIEW_REACTIONS_KEY);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeThreadViewLocalStorageValue(scopedKey);
      removeThreadViewLocalStorageValue(THREAD_VIEW_REACTIONS_KEY);
      return {};
    }
    const normalized = normalizeThreadViewReactions(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedKey) !== serialized) {
      writeThreadViewLocalStorageValue(scopedKey, serialized);
    }
    if (scopedKey !== THREAD_VIEW_REACTIONS_KEY) removeThreadViewLocalStorageValue(THREAD_VIEW_REACTIONS_KEY);
    return normalized;
  } catch {
    const scopedKey = accountScopedStorageKey(THREAD_VIEW_REACTIONS_KEY, userId);
    removeThreadViewLocalStorageValue(scopedKey);
    removeThreadViewLocalStorageValue(THREAD_VIEW_REACTIONS_KEY);
    return {};
  }
}

export function saveThreadViewReactions(
  value: Record<string, Record<string, number>>,
  userId?: string | null,
): Record<string, Record<string, number>> {
  const normalized = normalizeThreadViewReactions(value);
  const scopedKey = accountScopedStorageKey(THREAD_VIEW_REACTIONS_KEY, userId);
  try {
    localStorage.setItem(scopedKey, JSON.stringify(normalized));
    if (scopedKey !== THREAD_VIEW_REACTIONS_KEY) removeThreadViewLocalStorageValue(THREAD_VIEW_REACTIONS_KEY);
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function loadThreadViewLastReadMessageId(threadId: string, userId?: string | null): string | null {
  const storageKey = threadViewLastReadStorageKey(threadId, userId);
  const legacyKey = legacyThreadViewLastReadStorageKey(threadId);
  if (!storageKey) return null;
  try {
    const scopedRaw = localStorage.getItem(storageKey);
    const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null;
    const raw = scopedRaw ?? legacyRaw;
    const normalized = normalizeThreadViewMessageId(raw);
    if (normalized && (raw !== normalized || scopedRaw !== normalized)) {
      writeThreadViewLocalStorageValue(storageKey, normalized);
    }
    if (normalized && legacyRaw !== null && legacyKey) removeThreadViewLocalStorageValue(legacyKey);
    if (!normalized && raw !== null) {
      removeThreadViewLocalStorageValue(storageKey);
      if (legacyKey) removeThreadViewLocalStorageValue(legacyKey);
    }
    return normalized;
  } catch {
    return null;
  }
}

export function saveThreadViewLastReadMessageId(threadId: string, messageId: string, userId?: string | null): string | null {
  const storageKey = threadViewLastReadStorageKey(threadId, userId);
  const normalized = normalizeThreadViewMessageId(messageId);
  if (!storageKey || !normalized) return null;
  try {
    localStorage.setItem(storageKey, normalized);
    const legacyKey = legacyThreadViewLastReadStorageKey(threadId);
    if (legacyKey && legacyKey !== storageKey) removeThreadViewLocalStorageValue(legacyKey);
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function loadThreadViewScrollPosition(threadId: string, userId?: string | null): number | null {
  const storageKey = threadViewScrollPositionStorageKey(threadId, userId);
  const legacyKey = legacyThreadViewScrollPositionStorageKey(threadId);
  if (!storageKey) return null;
  try {
    const scopedRaw = sessionStorage.getItem(storageKey);
    const legacyRaw = legacyKey ? sessionStorage.getItem(legacyKey) : null;
    const raw = scopedRaw ?? legacyRaw;
    const normalized = normalizeThreadViewScrollPosition(raw);
    if (normalized !== null && (String(normalized) !== raw || scopedRaw !== String(normalized))) {
      writeThreadViewSessionStorageValue(storageKey, String(normalized));
    }
    if (normalized !== null && legacyRaw !== null && legacyKey) removeThreadViewSessionStorageValue(legacyKey);
    if (normalized === null && raw !== null) {
      removeThreadViewSessionStorageValue(storageKey);
      if (legacyKey) removeThreadViewSessionStorageValue(legacyKey);
    }
    return normalized;
  } catch {
    return null;
  }
}

export function saveThreadViewScrollPosition(threadId: string, scrollTop: number, userId?: string | null): number | null {
  const storageKey = threadViewScrollPositionStorageKey(threadId, userId);
  const normalized = normalizeThreadViewScrollPosition(scrollTop);
  if (!storageKey || normalized === null) return null;
  try {
    sessionStorage.setItem(storageKey, String(normalized));
    const legacyKey = legacyThreadViewScrollPositionStorageKey(threadId);
    if (legacyKey && legacyKey !== storageKey) removeThreadViewSessionStorageValue(legacyKey);
  } catch {
    // ignore storage failures
  }
  return normalized;
}
