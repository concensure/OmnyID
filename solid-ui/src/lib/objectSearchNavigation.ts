// @locs-version: 1.0
import {
  customEventRecordDetail,
  optionalNullableStringProperty,
} from "@/lib/eventDetail";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";

export type ObjectSearchLaunchContext = {
  sourceLabel?: string;
  reason?: string;
};

export type ObjectSearchLaunchDetail = {
  query: string;
  focusThreadId?: string | null;
  focusObjectId?: string | null;
  launchContext?: ObjectSearchLaunchContext | null;
};

export const OPEN_OBJECT_SEARCH_EVENT = "omnyid:open-object-search";

function isObjectSearchLaunchContext(value: unknown): value is ObjectSearchLaunchContext {
  if (value == null) return true;
  const context = afpOptionalRecord(value);
  if (!context) return false;
  return (
    (typeof context.sourceLabel === "undefined" || typeof context.sourceLabel === "string")
    && (typeof context.reason === "undefined" || typeof context.reason === "string")
  );
}

export function dispatchOpenObjectSearchEvent(
  detail: ObjectSearchLaunchDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(OPEN_OBJECT_SEARCH_EVENT, { detail }));
}

export function readOpenObjectSearchEventDetail(
  event: Event,
): ObjectSearchLaunchDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  const focusThreadId = optionalNullableStringProperty(detail, "focusThreadId");
  const focusObjectId = optionalNullableStringProperty(detail, "focusObjectId");
  return (
    typeof detail.query === "string"
    && focusThreadId !== false
    && focusObjectId !== false
    && isObjectSearchLaunchContext(detail.launchContext)
  )
    ? {
        query: detail.query,
        ...(typeof focusThreadId !== "undefined" ? { focusThreadId: focusThreadId ?? null } : {}),
        ...(typeof focusObjectId !== "undefined" ? { focusObjectId: focusObjectId ?? null } : {}),
        ...(typeof detail.launchContext !== "undefined" ? { launchContext: detail.launchContext } : {}),
      }
    : null;
}

export function openObjectSearch(detail: ObjectSearchLaunchDetail) {
  dispatchOpenObjectSearchEvent(detail);
}

export function subscribeOpenObjectSearchEvent(
  callback: (detail: ObjectSearchLaunchDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readOpenObjectSearchEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(OPEN_OBJECT_SEARCH_EVENT, handler);
  return () => target.removeEventListener(OPEN_OBJECT_SEARCH_EVENT, handler);
}
