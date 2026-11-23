// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const DEV_VIEWPORT_EVENT = "omnyid:dev:setViewport";

export type DevViewportEventDetail = {
  width: number;
};

export function dispatchDevViewportEvent(
  detail: DevViewportEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(DEV_VIEWPORT_EVENT, { detail }));
}

export function readDevViewportEventDetail(
  event: Event,
): DevViewportEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.width === "number" ? { width: detail.width } : null;
}

export function subscribeDevViewportEvent(
  callback: (detail: DevViewportEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readDevViewportEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(DEV_VIEWPORT_EVENT, handler);
  return () => target.removeEventListener(DEV_VIEWPORT_EVENT, handler);
}
