// @locs-version: 1.0

export type WeddingHelperTaskTab = "open" | "done";

export const WEDDING_HELPER_TASK_TAB_EVENT = "omnyid:wedding-helper-task-tab";

export function isWeddingHelperTaskTab(value: unknown): value is WeddingHelperTaskTab {
  return value === "open" || value === "done";
}

export function dispatchWeddingHelperTaskTab(
  tab: WeddingHelperTaskTab,
  target: Window = window,
): void {
  try {
    target.dispatchEvent(new CustomEvent(WEDDING_HELPER_TASK_TAB_EVENT, { detail: { tab } }));
  } catch {
    // This is a convenience hint for an already-mounted UI surface.
  }
}

export function weddingHelperTaskTabFromEvent(event: Event): WeddingHelperTaskTab | null {
  const detail = "detail" in event ? (event as CustomEvent<unknown>).detail : null;
  const tab = detail && typeof detail === "object" && !Array.isArray(detail)
    ? (detail as Record<string, unknown>).tab
    : null;
  return isWeddingHelperTaskTab(tab) ? tab : null;
}
