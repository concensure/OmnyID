// @locs-version: 1.1
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";
export const WEDDING_CALENDAR_AFP_PROJECTIONS_KEY = "omnyid.wedding-calendar-afp-projections";
export const WEDDING_TASK_AFP_PROJECTIONS_KEY = "omnyid.wedding-task-afp-projections";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function loadWeddingProjectionIds(key: string, storage: Storage = localStorage): string[] {
  const scopedKey = weddingAccountScopedStorageKey(key);
  const raw = storage.getItem(scopedKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    storage.removeItem(scopedKey);
    return [];
  }
}

export function hasSentWeddingProjection(id: string, key: string, storage: Storage = localStorage): boolean {
  const cleanId = clean(id);
  return cleanId ? loadWeddingProjectionIds(key, storage).includes(cleanId) : false;
}

export function markWeddingProjectionSent(id: string, key: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadWeddingProjectionIds(key, storage)])].slice(0, 300);
  storage.setItem(weddingAccountScopedStorageKey(key), JSON.stringify(next));
}

export function unmarkWeddingProjectionSent(id: string, key: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = loadWeddingProjectionIds(key, storage).filter((value) => value !== cleanId);
  const scopedKey = weddingAccountScopedStorageKey(key);
  if (next.length > 0) storage.setItem(scopedKey, JSON.stringify(next));
  else storage.removeItem(scopedKey);
}
