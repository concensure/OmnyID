// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";

export type ThreadSearchLaunchContext = {
  sourceLabel?: string;
  reason?: string;
};

export type ThreadSearchLaunchDetail = {
  query: string;
  launchContext?: ThreadSearchLaunchContext | null;
};

export const OPEN_THREAD_SEARCH_EVENT = "omnyid:open-thread-search";

function isThreadSearchLaunchContext(value: unknown): value is ThreadSearchLaunchContext {
  if (value == null) return true;
  const context = afpOptionalRecord(value);
  if (!context) return false;
  return (
    (typeof context.sourceLabel === "undefined" || typeof context.sourceLabel === "string")
    && (typeof context.reason === "undefined" || typeof context.reason === "string")
  );
}

export function dispatchOpenThreadSearchEvent(
  detail: ThreadSearchLaunchDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(OPEN_THREAD_SEARCH_EVENT, { detail }));
}

export function readOpenThreadSearchEventDetail(
  event: Event,
): ThreadSearchLaunchDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.query === "string" && isThreadSearchLaunchContext(detail.launchContext)
    ? {
        query: detail.query,
        ...(typeof detail.launchContext !== "undefined" ? { launchContext: detail.launchContext } : {}),
      }
    : null;
}

export function openThreadSearch(detail: ThreadSearchLaunchDetail) {
  dispatchOpenThreadSearchEvent(detail);
}

export function subscribeOpenThreadSearchEvent(
  callback: (detail: ThreadSearchLaunchDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readOpenThreadSearchEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(OPEN_THREAD_SEARCH_EVENT, handler);
  return () => target.removeEventListener(OPEN_THREAD_SEARCH_EVENT, handler);
}
