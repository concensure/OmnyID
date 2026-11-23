// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export const AFP_EPHEMERAL_TYPES_KEY = "omnyid.afp-ephemeral-types";
export const AFP_EPHEMERAL_CATEGORIES_KEY = "omnyid.afp-ephemeral-categories";

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]): Array<[string, boolean]> => {
      const normalizedKey = key.trim();
      return normalizedKey && typeof entryValue === "boolean" ? [[normalizedKey, entryValue]] : [];
    }),
  );
}

function loadBooleanRecord(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      localStorage.removeItem(key);
      return {};
    }
    const normalized = normalizeBooleanRecord(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) saveBooleanRecord(key, normalized);
    return normalized;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
    return {};
  }
}

function saveBooleanRecord(key: string, value: Record<string, boolean>): void {
  try {
    localStorage.setItem(key, JSON.stringify(normalizeBooleanRecord(value)));
  } catch {
    // ignore storage failures
  }
}

export function loadAfpEphemeralTypeOverrides(): Record<string, boolean> {
  return loadBooleanRecord(AFP_EPHEMERAL_TYPES_KEY);
}

export function saveAfpEphemeralTypeOverrides(value: Record<string, boolean>): void {
  saveBooleanRecord(AFP_EPHEMERAL_TYPES_KEY, value);
}

export function loadAfpEphemeralCategoryOverrides(): Record<string, boolean> {
  return loadBooleanRecord(AFP_EPHEMERAL_CATEGORIES_KEY);
}

export function saveAfpEphemeralCategoryOverrides(value: Record<string, boolean>): void {
  saveBooleanRecord(AFP_EPHEMERAL_CATEGORIES_KEY, value);
}
