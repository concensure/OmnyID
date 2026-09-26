// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type ThreadSessionHistoryEntry = {
  threadId: string;
  messageId: string | null;
};

export type ThreadSessionHistoryState = {
  past: ThreadSessionHistoryEntry[];
  future: ThreadSessionHistoryEntry[];
};

export const THREAD_SESSION_HISTORY_KEY = "omnyid.thread.session_history";
const MAX_THREAD_SESSION_HISTORY = 20;

const EMPTY_THREAD_SESSION_HISTORY: ThreadSessionHistoryState = {
  past: [],
  future: [],
};

function normalizeEntry(value: unknown): ThreadSessionHistoryEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.threadId !== "string" || value.threadId.trim().length === 0) return null;
  return {
    threadId: value.threadId,
    messageId: typeof value.messageId === "string" ? value.messageId : null,
  };
}

function normalizeEntries(value: unknown): ThreadSessionHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeEntry)
    .filter((entry): entry is ThreadSessionHistoryEntry => entry !== null)
    .slice(-MAX_THREAD_SESSION_HISTORY);
}

function normalizeThreadSessionHistoryState(value: unknown): ThreadSessionHistoryState {
  if (!isRecord(value)) {
    return EMPTY_THREAD_SESSION_HISTORY;
  }
  return {
    past: normalizeEntries(value.past),
    future: normalizeEntries(value.future),
  };
}

function sameThread(left: ThreadSessionHistoryEntry | null, right: ThreadSessionHistoryEntry | null): boolean {
  if (!left || !right) return false;
  return left.threadId === right.threadId;
}

function threadSessionHistoryStorageKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(THREAD_SESSION_HISTORY_KEY, userId);
}

function removeThreadSessionHistoryStorageValue(storageKey: string): void {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Best-effort session navigation only.
  }
}

export function loadThreadSessionHistory(userId?: string | null): ThreadSessionHistoryState {
  const scopedKey = threadSessionHistoryStorageKey(userId);
  try {
    const raw = sessionStorage.getItem(scopedKey) ?? sessionStorage.getItem(THREAD_SESSION_HISTORY_KEY);
    if (!raw) return EMPTY_THREAD_SESSION_HISTORY;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeThreadSessionHistoryStorageValue(scopedKey);
      if (scopedKey !== THREAD_SESSION_HISTORY_KEY) removeThreadSessionHistoryStorageValue(THREAD_SESSION_HISTORY_KEY);
      return EMPTY_THREAD_SESSION_HISTORY;
    }
    const normalized = normalizeThreadSessionHistoryState(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) {
      try {
        sessionStorage.setItem(scopedKey, serialized);
      } catch {
        // Best-effort session navigation only.
      }
    }
    if (scopedKey !== THREAD_SESSION_HISTORY_KEY) removeThreadSessionHistoryStorageValue(THREAD_SESSION_HISTORY_KEY);
    return normalized;
  } catch {
    removeThreadSessionHistoryStorageValue(scopedKey);
    if (scopedKey !== THREAD_SESSION_HISTORY_KEY) removeThreadSessionHistoryStorageValue(THREAD_SESSION_HISTORY_KEY);
    return EMPTY_THREAD_SESSION_HISTORY;
  }
}

export function saveThreadSessionHistory(next: ThreadSessionHistoryState, userId?: string | null) {
  const scopedKey = threadSessionHistoryStorageKey(userId);
  try {
    sessionStorage.setItem(
      scopedKey,
      JSON.stringify(normalizeThreadSessionHistoryState(next)),
    );
    if (scopedKey !== THREAD_SESSION_HISTORY_KEY) removeThreadSessionHistoryStorageValue(THREAD_SESSION_HISTORY_KEY);
  } catch {
    // Best-effort session navigation only.
  }
}

export function pushThreadSessionHistory(
  state: ThreadSessionHistoryState,
  current: ThreadSessionHistoryEntry | null,
  target: ThreadSessionHistoryEntry,
): ThreadSessionHistoryState {
  if (!current) {
    if (state.future.length === 0) return state;
    return { past: state.past, future: [] };
  }
  if (sameThread(current, target)) return state;
  return {
    past: [...state.past.slice(-(MAX_THREAD_SESSION_HISTORY - 1)), current],
    future: [],
  };
}

export function stepBackThreadSessionHistory(
  state: ThreadSessionHistoryState,
  current: ThreadSessionHistoryEntry | null,
): { state: ThreadSessionHistoryState; target: ThreadSessionHistoryEntry | null } {
  if (!current || state.past.length === 0) {
    return { state, target: null };
  }
  const target = state.past[state.past.length - 1] ?? null;
  if (!target) return { state, target: null };
  return {
    state: {
      past: state.past.slice(0, -1),
      future: [current, ...state.future].slice(0, MAX_THREAD_SESSION_HISTORY),
    },
    target,
  };
}

export function stepForwardThreadSessionHistory(
  state: ThreadSessionHistoryState,
  current: ThreadSessionHistoryEntry | null,
): { state: ThreadSessionHistoryState; target: ThreadSessionHistoryEntry | null } {
  const target = state.future[0] ?? null;
  if (!current || !target) {
    return { state, target: null };
  }
  return {
    state: {
      past: [...state.past.slice(-(MAX_THREAD_SESSION_HISTORY - 1)), current],
      future: state.future.slice(1),
    },
    target,
  };
}
