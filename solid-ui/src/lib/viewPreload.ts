// @locs-version: 1.0
import type { ViewName } from "@/lib/viewNames";

export const VIEW_PRELOAD_TARGETS: ReadonlyArray<ViewName> = [
  "threads",
  "workflows",
  "email",
  "note",
  "calendar",
];

export function shouldIdlePreloadViews(connection?: {
  saveData?: boolean;
  effectiveType?: string | null;
} | null): boolean {
  if (connection?.saveData) return false;
  const effectiveType = connection?.effectiveType?.toLowerCase() ?? "";
  return !effectiveType.includes("2g");
}

export function idlePreloadViewsForSession(activeView: ViewName): ViewName[] {
  return VIEW_PRELOAD_TARGETS.filter((view) => view !== activeView);
}
