// @locs-version: 1.0
import { parseJsonValue, parseJsonValueOr } from "@/lib/jsonParseState";
import type { SearchBooleanMode } from "@/lib/searchBooleanMode";

export const MAX_RECENT = 8;
export const MAX_SESSION_HISTORY = 10;

function loadStringArray(raw: string | null | undefined): string[] {
  const parsed = parseJsonValueOr(raw ?? "[]", []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): string[] => {
    if (typeof entry !== "string") return [];
    const trimmed = entry.trim();
    return trimmed ? [trimmed] : [];
  });
}

function writeLocalStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort convenience persistence only.
  }
}

function removeLocalStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Best-effort convenience persistence only.
  }
}

function writeSessionStorageValue(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Best-effort session persistence only.
  }
}

function removeSessionStorageValue(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best-effort session persistence only.
  }
}

export function loadRecentSearchQueries(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeLocalStorageValue(key);
      return [];
    }
    const normalized = loadStringArray(raw).slice(0, MAX_RECENT);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeLocalStorageValue(key, serialized);
    return normalized;
  } catch {
    removeLocalStorageValue(key);
    return [];
  }
}

export function saveRecentSearchQuery(query: string, key: string): string[] {
  const [normalizedQuery] = loadStringArray(JSON.stringify([query]));
  const next = loadStringArray(
    JSON.stringify([
      normalizedQuery,
      ...loadRecentSearchQueries(key).filter((entry) => entry !== normalizedQuery),
    ]),
  ).slice(0, MAX_RECENT);
  writeLocalStorageValue(key, JSON.stringify(next));
  return next;
}

export function clearRecentSearchQueries(key: string): string[] {
  removeLocalStorageValue(key);
  return [];
}

export function loadSessionSearchHistory(key: string): string[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeSessionStorageValue(key);
      return [];
    }
    const normalized = loadStringArray(raw).slice(0, MAX_SESSION_HISTORY);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeSessionStorageValue(key, serialized);
    return normalized;
  } catch {
    removeSessionStorageValue(key);
    return [];
  }
}

export function saveSessionSearchHistory(history: string[], key: string): string[] {
  const next = loadStringArray(JSON.stringify(history)).slice(0, MAX_SESSION_HISTORY);
  writeSessionStorageValue(key, JSON.stringify(next));
  return next;
}

export function clearSessionSearchHistory(key: string): string[] {
  removeSessionStorageValue(key);
  return [];
}

export function loadSearchEnginePreference(key: string): "duckduckgo" | "google" {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "google" || stored === "duckduckgo") return stored;
    if (stored !== null) writeLocalStorageValue(key, "duckduckgo");
    return "duckduckgo";
  } catch {
    return "duckduckgo";
  }
}

export function saveSearchEnginePreference(
  key: string,
  value: string,
): "duckduckgo" | "google" {
  const normalized = value === "google" ? "google" : "duckduckgo";
  writeLocalStorageValue(key, normalized);
  return normalized;
}

export function loadSearchOptimizationMode(key: string): "balanced" | "speed" | "cost" {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "balanced" || stored === "speed" || stored === "cost") return stored;
    if (stored !== null) writeLocalStorageValue(key, "balanced");
    return "balanced";
  } catch {
    return "balanced";
  }
}

export function saveSearchOptimizationMode(
  key: string,
  value: string,
): "balanced" | "speed" | "cost" {
  const normalized = value === "speed" || value === "cost" ? value : "balanced";
  writeLocalStorageValue(key, normalized);
  return normalized;
}

export function loadSearchBooleanModePreference(key: string): SearchBooleanMode {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "all" || stored === "any" || stored === "exclude") return stored;
    if (stored !== null) writeLocalStorageValue(key, "all");
    return "all";
  } catch {
    return "all";
  }
}

export function saveSearchBooleanModePreference(
  key: string,
  value: SearchBooleanMode,
): SearchBooleanMode {
  const normalized = value === "any" || value === "exclude" ? value : "all";
  writeLocalStorageValue(key, normalized);
  return normalized;
}

export function loadSearchSelectHintSeen(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "1") return true;
    if (stored === "0" || stored === null) return false;
    writeLocalStorageValue(key, "0");
    return false;
  } catch {
    return false;
  }
}

export function saveSearchSelectHintSeen(key: string, seen: boolean): void {
  writeLocalStorageValue(key, seen ? "1" : "0");
}
