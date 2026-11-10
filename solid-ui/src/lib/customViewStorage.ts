// @locs-version: 1.0
import { accountScopedStorageKey, accountScopedStorageReadKey } from "@/lib/accountScopedStorage";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export interface CustomView {
  id: string;
  name: string;
  description: string;
  filterType: string;
  filterSubtype: string;
  keywords: string;
  workflowFamilyId?: string;
  familyAssetWorkflowId?: string;
  instanceWorkflowId?: string;
}

export const CUSTOM_VIEWS_KEY = "omnyid.custom_views";

function normalizeCustomView(entry: unknown): CustomView | null {
  if (!isRecord(entry)) return null;
  if (
    typeof entry.id !== "string"
    || typeof entry.name !== "string"
    || typeof entry.description !== "string"
    || typeof entry.filterType !== "string"
    || typeof entry.filterSubtype !== "string"
    || typeof entry.keywords !== "string"
  ) {
    return null;
  }
  const id = entry.id.trim();
  const name = entry.name.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: entry.description.trim(),
    filterType: entry.filterType.trim(),
    filterSubtype: entry.filterSubtype.trim(),
    keywords: entry.keywords.trim(),
    workflowFamilyId:
      typeof entry.workflowFamilyId === "string" ? entry.workflowFamilyId.trim() : undefined,
    familyAssetWorkflowId:
      typeof entry.familyAssetWorkflowId === "string" ? entry.familyAssetWorkflowId.trim() : undefined,
    instanceWorkflowId:
      typeof entry.instanceWorkflowId === "string" ? entry.instanceWorkflowId.trim() : undefined,
  };
}

function customViewsStorageKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(CUSTOM_VIEWS_KEY, userId);
}

function removeCustomViewsStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures for convenience state.
  }
}

export function loadCustomViews(userId?: string | null): CustomView[] {
  const scopedKey = customViewsStorageKey(userId);
  try {
    const stored = localStorage.getItem(accountScopedStorageReadKey(CUSTOM_VIEWS_KEY, userId));
    if (!stored) return [];
    const raw = parseJsonValue(stored);
    if (!raw.ok) {
      removeCustomViewsStorageValue(scopedKey);
      removeCustomViewsStorageValue(CUSTOM_VIEWS_KEY);
      return [];
    }
    const normalized = Array.isArray(raw.value) ? raw.value.flatMap((entry): CustomView[] => {
      const normalized = normalizeCustomView(entry);
      return normalized ? [normalized] : [];
    }) : [];
    const normalizedJson = JSON.stringify(normalized);
    if (stored !== normalizedJson || localStorage.getItem(scopedKey) !== normalizedJson) {
      localStorage.setItem(scopedKey, normalizedJson);
    }
    if (scopedKey !== CUSTOM_VIEWS_KEY) removeCustomViewsStorageValue(CUSTOM_VIEWS_KEY);
    return normalized;
  } catch {
    removeCustomViewsStorageValue(scopedKey);
    removeCustomViewsStorageValue(CUSTOM_VIEWS_KEY);
    return [];
  }
}

export function saveCustomViews(views: CustomView[], userId?: string | null) {
  const scopedKey = customViewsStorageKey(userId);
  try {
    localStorage.setItem(
      scopedKey,
      JSON.stringify(
        views.flatMap((view): CustomView[] => {
          const normalized = normalizeCustomView(view);
          return normalized ? [normalized] : [];
        }),
      ),
    );
    if (scopedKey !== CUSTOM_VIEWS_KEY) removeCustomViewsStorageValue(CUSTOM_VIEWS_KEY);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}
