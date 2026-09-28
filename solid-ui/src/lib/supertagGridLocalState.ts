// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

let supertagGridStorageQuotaHit = false;

export function supertagGridStorageKey(viewId: string, suffix: string): string {
  return `sgrid:${viewId}:${suffix}`;
}

export function loadSupertagGridStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      localStorage.removeItem(key);
      return fallback;
    }
    return parsed.value as T;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
    return fallback;
  }
}

export function saveSupertagGridStored(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    supertagGridStorageQuotaHit = true;
    return false;
  }
}

export function hasSupertagGridStorageQuotaHit(): boolean {
  return supertagGridStorageQuotaHit;
}
