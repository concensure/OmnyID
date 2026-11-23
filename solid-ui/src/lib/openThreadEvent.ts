// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const OPEN_THREAD_EVENT = "omnyid:open-thread";

export type OpenThreadEventDetail = {
  threadId: string;
  messageId?: string | null;
};

export function dispatchOpenThreadEvent(
  detail: OpenThreadEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(OPEN_THREAD_EVENT, { detail }));
}

export function readOpenThreadEventDetail(
  event: Event,
): OpenThreadEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  const messageId = detail.messageId;
  return (
    typeof detail.threadId === "string"
    && (
      typeof messageId === "undefined"
      || messageId === null
      || typeof messageId === "string"
    )
  )
    ? {
        threadId: detail.threadId,
        ...(typeof messageId !== "undefined" ? { messageId } : {}),
      }
    : null;
}

export function subscribeOpenThreadEvent(
  callback: (detail: OpenThreadEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readOpenThreadEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(OPEN_THREAD_EVENT, handler);
  return () => target.removeEventListener(OPEN_THREAD_EVENT, handler);
}
