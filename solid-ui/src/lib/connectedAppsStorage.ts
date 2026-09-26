// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { parseJsonValue } from "@/lib/jsonParseState";

export const CONNECTED_KEY = "omnyid.connected_apps.v1";

export function loadConnectedAppIds(
  userId: string | null,
  validIds: ReadonlySet<string>,
): string[] {
  const key = accountScopedStorageKey(CONNECTED_KEY, userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore storage cleanup failures for convenience state.
      }
      return [];
    }
    const normalized = normalizeConnectedAppIds(parsed.value, validIds);
    const normalizedJson = JSON.stringify(normalized);
    if (raw !== normalizedJson) localStorage.setItem(key, normalizedJson);
    return normalized;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures for convenience state.
    }
    return [];
  }
}

function normalizeConnectedAppIds(ids: unknown, validIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter(
    (value, index, values): value is string =>
      typeof value === "string"
      && value.length > 0
      && validIds.has(value)
      && values.indexOf(value) === index,
  );
}

export function saveConnectedAppIds(userId: string | null, ids: string[], validIds: ReadonlySet<string>) {
  try {
    localStorage.setItem(
      accountScopedStorageKey(CONNECTED_KEY, userId),
      JSON.stringify(normalizeConnectedAppIds(ids, validIds)),
    );
  } catch {
    // Ignore storage failures for convenience state.
  }
}

export function clearConnectedAppIds(userId: string | null) {
  try {
    localStorage.removeItem(accountScopedStorageKey(CONNECTED_KEY, userId));
  } catch {
    // Ignore storage cleanup failures for convenience state.
  }
}
