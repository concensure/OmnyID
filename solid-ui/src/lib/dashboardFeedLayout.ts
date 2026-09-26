// @locs-version: 1.0
import { parseJsonValueOr } from "@/lib/jsonParseState";

export type GridLayoutItem = Record<string, unknown>;

function isGridLayoutItem(value: unknown): value is GridLayoutItem {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function gridLayoutItemId(item: unknown): string | null {
  if (!isGridLayoutItem(item)) return null;
  const raw = item.id ?? item["gs-id"];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

// GridStack.save() can include a "content" field (the live innerHTML of the
// card, drag-handle markup and all) unless saveContent=false is passed at the
// call site. Strip it defensively here too, so any layout already poisoned by
// that â€” saved to localStorage before the call site was fixed â€” self-heals
// instead of re-injecting stale card markup on every future load.
function withoutCardContent(item: GridLayoutItem): GridLayoutItem {
  if (!("content" in item)) return item;
  const { content: _content, ...rest } = item;
  return rest;
}

export function pruneDashboardFeedLayout(
  savedLayout: GridLayoutItem[],
  visibleIds: Iterable<string>,
): GridLayoutItem[] {
  const visible = new Set(visibleIds);
  return savedLayout
    .filter((item): item is GridLayoutItem => {
      const id = gridLayoutItemId(item);
      return !!id && visible.has(id);
    })
    .map(withoutCardContent);
}

export function normalizeDashboardFeedLayoutValue(
  value: unknown,
  visibleIds: Iterable<string>,
): GridLayoutItem[] {
  if (!Array.isArray(value)) return [];
  return pruneDashboardFeedLayout(value.filter(isGridLayoutItem), visibleIds);
}

export function parseDashboardFeedLayout(
  raw: string | null | undefined,
  visibleIds: Iterable<string>,
): GridLayoutItem[] {
  return normalizeDashboardFeedLayoutValue(parseJsonValueOr(raw, []), visibleIds);
}
