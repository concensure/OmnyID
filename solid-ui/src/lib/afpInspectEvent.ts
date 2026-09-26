// @locs-version: 1.0
import { customEventDetail } from "@/lib/eventDetail";

export const AFP_INSPECT_EVENT = "afp:inspect";

export type AfpInspectEventDetail = unknown;

export function dispatchAfpInspectEvent(
  detail: AfpInspectEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(AFP_INSPECT_EVENT, { detail }));
}

export function readAfpInspectEventDetail(
  event: Event,
): AfpInspectEventDetail | null {
  return customEventDetail(event) ?? null;
}

export function subscribeAfpInspectEvent(
  callback: (detail: AfpInspectEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readAfpInspectEventDetail(event);
    if (detail === null) return;
    callback(detail);
  };
  target.addEventListener(AFP_INSPECT_EVENT, handler);
  return () => target.removeEventListener(AFP_INSPECT_EVENT, handler);
}
