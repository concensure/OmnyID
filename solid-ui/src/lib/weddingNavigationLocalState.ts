// @locs-version: 2.0
import {
  normalizeWeddingNavigationIntent,
  type WeddingNavigationIntent,
} from "@/lib/weddingNavigationState";

export const WEDDING_NAVIGATION_INTENT_KEY = "omnyid.wedding-navigation-intent";

export type WeddingNavigationStoredIntent = WeddingNavigationIntent & {
  savedAt: string;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function storageOrNull(storage?: Storage | null): Storage | null {
  return storage ?? globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
}

function withStorage<T>(storage: Storage | null, fallback: T, fn: (storage: Storage) => T): T {
  if (!storage) return fallback;
  try {
    return fn(storage);
  } catch {
    return fallback;
  }
}

function normalizeStoredIntent(value: unknown): WeddingNavigationStoredIntent | null {
  const intent = normalizeWeddingNavigationIntent(value);
  if (!intent || !value || typeof value !== "object") return null;
  const savedAt = clean((value as Record<string, unknown>).savedAt);
  return savedAt ? { ...intent, savedAt } : null;
}

export function saveWeddingNavigationIntent(
  intent: WeddingNavigationIntent,
  input?: {
    storage?: Storage | null;
    nowIso?: string | null;
  },
): WeddingNavigationStoredIntent | null {
  const storage = storageOrNull(input?.storage);
  const saved: WeddingNavigationStoredIntent = {
    ...intent,
    savedAt: clean(input?.nowIso) ?? new Date().toISOString(),
  };
  return withStorage(storage, null, (target) => {
    target.setItem(WEDDING_NAVIGATION_INTENT_KEY, JSON.stringify(saved));
    return saved;
  });
}

export function loadWeddingNavigationIntent(storage?: Storage | null): WeddingNavigationStoredIntent | null {
  return withStorage(storageOrNull(storage), null, (target) => {
    const raw = target.getItem(WEDDING_NAVIGATION_INTENT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const intent = normalizeStoredIntent(parsed);
      if (!intent) target.removeItem(WEDDING_NAVIGATION_INTENT_KEY);
      return intent;
    } catch {
      target.removeItem(WEDDING_NAVIGATION_INTENT_KEY);
      return null;
    }
  });
}

export function clearWeddingNavigationIntent(storage?: Storage | null): void {
  withStorage(storageOrNull(storage), undefined, (target) => {
    target.removeItem(WEDDING_NAVIGATION_INTENT_KEY);
  });
}

export function consumeWeddingNavigationIntent(storage?: Storage | null): WeddingNavigationStoredIntent | null {
  const target = storageOrNull(storage);
  const intent = loadWeddingNavigationIntent(target);
  if (intent) clearWeddingNavigationIntent(target);
  return intent;
}
