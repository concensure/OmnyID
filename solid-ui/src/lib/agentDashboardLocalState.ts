// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValueOr } from "@/lib/jsonParseState";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";

export type AgentDashboardQueryHistoryEntry = {
  query: string;
  view: string;
  ts: string;
};

export const AGENT_DASHBOARD_QUERY_HISTORY_KEY = "omnyid.query_history";
export const AGENT_DASHBOARD_QUERY_HISTORY_CHANGED_EVENT = "omnyid:query-history-changed";
export const AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY = "omnyid.dashboard.shortcuts-dismissed";

const QUERY_HISTORY_FUTURE_SKEW_MS = 5 * 60 * 1000;

function notifyQueryHistoryChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AGENT_DASHBOARD_QUERY_HISTORY_CHANGED_EVENT));
}

function agentDashboardScopedStorageKey(baseKey: string, userId?: string | null): string {
  return accountScopedStorageKey(baseKey, userId ?? null);
}

function removeAgentDashboardStorageValue(baseKey: string, userId?: string | null): void {
  const scopedKey = agentDashboardScopedStorageKey(baseKey, userId);
  try {
    localStorage.removeItem(scopedKey);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // ignore storage failures
  }
}

function loadAgentDashboardStorageValue(baseKey: string, userId?: string | null): string | null {
  const scopedKey = agentDashboardScopedStorageKey(baseKey, userId);
  return localStorage.getItem(scopedKey) ?? localStorage.getItem(baseKey);
}

function writeAgentDashboardStorageValue(baseKey: string, value: string, userId?: string | null): void {
  const scopedKey = agentDashboardScopedStorageKey(baseKey, userId);
  localStorage.setItem(scopedKey, value);
  if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
}

function normalizeQueryHistoryText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeQueryHistoryView(value: string): string {
  const normalized = normalizeQueryHistoryText(value);
  return normalized || "chat";
}

function queryHistoryEntryKey(entry: { query: string; view: string }): string {
  return `${entry.query.toLowerCase()}::${entry.view.toLowerCase()}`;
}

function normalizeQueryHistoryEntry(value: unknown): AgentDashboardQueryHistoryEntry | null {
  if (!isRecord(value)) return null;
  const candidate = value;
  const query = typeof candidate.query === "string" ? normalizeQueryHistoryText(candidate.query) : "";
  if (!query) return null;
  const view = typeof candidate.view === "string" ? normalizeQueryHistoryView(candidate.view) : "chat";
  const rawTs = candidate.ts;
  const tsMillis =
    typeof rawTs === "number"
      ? rawTs
      : typeof rawTs === "string"
        ? Date.parse(rawTs)
        : Number.NaN;
  if (!Number.isFinite(tsMillis) || tsMillis > Date.now() + QUERY_HISTORY_FUTURE_SKEW_MS) return null;
  return { query, view, ts: new Date(tsMillis).toISOString() };
}

function normalizeQueryHistoryEntries(raw: unknown): AgentDashboardQueryHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((entry) => normalizeQueryHistoryEntry(entry))
    .filter((entry): entry is AgentDashboardQueryHistoryEntry => entry !== null)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .filter((entry) => {
      const key = queryHistoryEntryKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

export function loadAgentDashboardQueryHistory(userId?: string | null): AgentDashboardQueryHistoryEntry[] {
  try {
    const stored = loadAgentDashboardStorageValue(AGENT_DASHBOARD_QUERY_HISTORY_KEY, userId);
    const normalized = normalizeQueryHistoryEntries(parseJsonValueOr(stored ?? "[]", []));
    const normalizedJson = JSON.stringify(normalized);
    if (
      stored !== normalizedJson
      || localStorage.getItem(agentDashboardScopedStorageKey(AGENT_DASHBOARD_QUERY_HISTORY_KEY, userId)) !== normalizedJson
    ) {
      try {
        writeAgentDashboardStorageValue(AGENT_DASHBOARD_QUERY_HISTORY_KEY, normalizedJson, userId);
        notifyQueryHistoryChanged();
      } catch {
        // ignore storage failures
      }
    }
    return normalized;
  } catch {
    try {
      writeAgentDashboardStorageValue(AGENT_DASHBOARD_QUERY_HISTORY_KEY, "[]", userId);
      notifyQueryHistoryChanged();
    } catch {
      // ignore storage failures
    }
    return [];
  }
}

export function saveAgentDashboardQueryHistory(
  entries: AgentDashboardQueryHistoryEntry[],
  userId?: string | null,
): AgentDashboardQueryHistoryEntry[] {
  const normalized = normalizeQueryHistoryEntries(entries);
  try {
    writeAgentDashboardStorageValue(
      AGENT_DASHBOARD_QUERY_HISTORY_KEY,
      JSON.stringify(normalized),
      userId,
    );
    notifyQueryHistoryChanged();
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function recordAgentDashboardQueryHistory(query: string, view: string, userId?: string | null): void {
  const normalizedQuery = normalizeQueryHistoryText(query);
  if (!normalizedQuery) return;
  const normalizedView = normalizeQueryHistoryView(view);
  const list = loadAgentDashboardQueryHistory(userId).filter(
    (entry) => queryHistoryEntryKey(entry) !== queryHistoryEntryKey({ query: normalizedQuery, view: normalizedView }),
  );
  list.unshift({ query: normalizedQuery, view: normalizedView, ts: new Date().toISOString() });
  saveAgentDashboardQueryHistory(list, userId);
}

export function loadAgentDashboardShortcutsDismissed(userId?: string | null): boolean {
  try {
    const stored = loadAgentDashboardStorageValue(AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY, userId);
    if (stored === "1") return true;
    if (stored === "0" || stored === null) return false;
    writeAgentDashboardStorageValue(AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY, "0", userId);
    return false;
  } catch {
    return false;
  }
}

export function saveAgentDashboardShortcutsDismissed(dismissed: boolean, userId?: string | null): boolean {
  try {
    writeAgentDashboardStorageValue(AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY, dismissed ? "1" : "0", userId);
  } catch {
    // ignore storage failures
  }
  return dismissed;
}

export function isAgentDashboardQueryHistoryStorageEvent(
  event: { key: string | null },
  userId?: string | null,
): boolean {
  return event.key === AGENT_DASHBOARD_QUERY_HISTORY_KEY
    || event.key === agentDashboardScopedStorageKey(AGENT_DASHBOARD_QUERY_HISTORY_KEY, userId);
}

export function isAgentDashboardShortcutsDismissedStorageEvent(
  event: { key: string | null },
  userId?: string | null,
): boolean {
  return event.key === AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY
    || event.key === agentDashboardScopedStorageKey(AGENT_DASHBOARD_SHORTCUTS_DISMISSED_KEY, userId);
}

export function subscribeAgentDashboardQueryHistoryChanges(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AGENT_DASHBOARD_QUERY_HISTORY_CHANGED_EVENT, callback);
  return () => window.removeEventListener(AGENT_DASHBOARD_QUERY_HISTORY_CHANGED_EVENT, callback);
}

export function subscribeAgentDashboardShortcutsDismissedStorage(
  callback: () => void,
  userId?: string | null,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (!isAgentDashboardShortcutsDismissedStorageEvent(event, userId)) return;
    callback();
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
