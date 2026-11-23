// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type SavedSearchEntry = {
  name: string;
  query: string;
  savedAt: string;
};

function normalizeSavedSearchEntries(raw: unknown): SavedSearchEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): SavedSearchEntry[] => {
    if (!isRecord(entry)) return [];
    if (
      typeof entry.name !== "string"
      || typeof entry.query !== "string"
      || typeof entry.savedAt !== "string"
    ) {
      return [];
    }
    const name = entry.name.trim();
    const query = entry.query.trim();
    const savedAt = entry.savedAt.trim();
    if (!name || !query || !savedAt) return [];
    return [{ name, query, savedAt }];
  });
}

function writeSavedSearchesStorageValue(storageKey: string, value: string): void {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // ignore storage failures
  }
}

function removeSavedSearchesStorageValue(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore storage failures
  }
}

function removeLegacySavedSearchesStorageValues(storageKeys: readonly string[]): void {
  for (const key of storageKeys) {
    removeSavedSearchesStorageValue(key);
  }
}

export function loadSavedSearches(storageKey: string, legacyStorageKeys: readonly string[] = []): SavedSearchEntry[] {
  try {
    const raw = localStorage.getItem(storageKey)
      ?? legacyStorageKeys.map((key) => localStorage.getItem(key)).find((value) => Boolean(value))
      ?? null;
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeSavedSearchesStorageValue(storageKey);
      removeLegacySavedSearchesStorageValues(legacyStorageKeys);
      return [];
    }
    const normalized = normalizeSavedSearchEntries(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeSavedSearchesStorageValue(storageKey, serialized);
    removeLegacySavedSearchesStorageValues(legacyStorageKeys);
    return normalized;
  } catch {
    removeSavedSearchesStorageValue(storageKey);
    removeLegacySavedSearchesStorageValues(legacyStorageKeys);
    return [];
  }
}

export function saveSavedSearches(
  storageKey: string,
  entries: SavedSearchEntry[],
  legacyStorageKeys: readonly string[] = [],
): SavedSearchEntry[] {
  const normalized = normalizeSavedSearchEntries(entries);
  try {
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    removeLegacySavedSearchesStorageValues(legacyStorageKeys);
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function defaultSavedSearchName(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Saved search";
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed;
}

export function upsertSavedSearch(
  existing: SavedSearchEntry[],
  name: string,
  query: string,
  nowIso: string,
  maxEntries = 12,
): SavedSearchEntry[] {
  const normalizedName = name.trim() || defaultSavedSearchName(query);
  const normalizedQuery = query.trim();
  const nextEntry: SavedSearchEntry = {
    name: normalizedName,
    query: normalizedQuery,
    savedAt: nowIso,
  };
  return [
    nextEntry,
    ...existing.filter((entry) => entry.query !== normalizedQuery),
  ].slice(0, maxEntries);
}

export function parseSavedSearchSlashQuery(query: string): string | null {
  const trimmed = query.trimStart();
  if (!trimmed.toLowerCase().startsWith("/search saved")) return null;
  return trimmed.slice("/search saved".length).trim().toLowerCase();
}

export function filterSavedSearches(entries: SavedSearchEntry[], term: string): SavedSearchEntry[] {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) =>
    entry.name.toLowerCase().includes(normalized) || entry.query.toLowerCase().includes(normalized),
  );
}
