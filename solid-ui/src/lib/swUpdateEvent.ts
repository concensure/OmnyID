// @locs-version: 1.0
import { customEventRecordDetail, isRecord } from "@/lib/eventDetail";

export const SW_UPDATE_READY_EVENT = "omnyid:update-ready";

export type SwUpdateReadyEventDetail = {
  sw: ServiceWorker;
};

function isServiceWorkerLike(value: unknown): value is ServiceWorker {
  return isRecord(value) && typeof value.postMessage === "function";
}

export function dispatchSwUpdateReadyEvent(
  detail: SwUpdateReadyEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(SW_UPDATE_READY_EVENT, { detail }));
}

export function readSwUpdateReadyEventDetail(
  event: Event,
): SwUpdateReadyEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  const sw = detail.sw;
  return isServiceWorkerLike(sw)
    ? { sw }
    : null;
}

export function subscribeSwUpdateReadyEvent(
  callback: (detail: SwUpdateReadyEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readSwUpdateReadyEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(SW_UPDATE_READY_EVENT, handler);
  return () => target.removeEventListener(SW_UPDATE_READY_EVENT, handler);
}
