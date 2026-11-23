// @locs-version: 1.0
import { customEventRecordDetail, isRecord } from "@/lib/eventDetail";

export const OPEN_INLINE_ENTITY_EVENT = "omnyid:open-inline-entity";

export type OpenInlineEntityEventDetail = {
  kind: string;
  text: string;
  value: string;
  metadata: Record<string, unknown>;
};

export function dispatchOpenInlineEntityEvent(
  detail: OpenInlineEntityEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(OPEN_INLINE_ENTITY_EVENT, { detail }));
}

export function readOpenInlineEntityEventDetail(
  event: Event,
): OpenInlineEntityEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return (
    typeof detail.kind === "string"
    && typeof detail.text === "string"
    && typeof detail.value === "string"
    && isRecord(detail.metadata)
  )
    ? {
        kind: detail.kind,
        text: detail.text,
        value: detail.value,
        metadata: detail.metadata,
      }
    : null;
}
