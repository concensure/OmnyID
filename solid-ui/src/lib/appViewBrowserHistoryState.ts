// @locs-version: 1.0
import { normalizeViewName, type ViewName } from "@/lib/viewNames";

export const APP_VIEW_HISTORY_STATE_KEY = "omnyidView";
export const APP_VIEW_QUERY_KEY = "view";

function stateRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function appViewFromBrowserHistory(state: unknown, href: string): ViewName | null {
  const fromState = normalizeViewName(String(stateRecord(state)[APP_VIEW_HISTORY_STATE_KEY] ?? ""));
  if (fromState) return fromState;
  try {
    return normalizeViewName(new URL(href).searchParams.get(APP_VIEW_QUERY_KEY));
  } catch {
    return null;
  }
}

export function browserHistoryStateForAppView(state: unknown, view: ViewName): Record<string, unknown> {
  return { ...stateRecord(state), [APP_VIEW_HISTORY_STATE_KEY]: view };
}

export function browserHistoryUrlForAppView(href: string, view: ViewName): string {
  const url = new URL(href);
  url.searchParams.set(APP_VIEW_QUERY_KEY, view);
  return `${url.pathname}${url.search}${url.hash}`;
}
