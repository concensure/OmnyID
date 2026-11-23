// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const ACTION_CHIP_EVENT = "omnyid:action-chip";

export type ActionChipEventDetail = {
  id: string;
  label: string;
};

export function dispatchActionChipEvent(
  detail: ActionChipEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(ACTION_CHIP_EVENT, { detail }));
}

export function readActionChipEventDetail(
  event: Event,
): ActionChipEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.id === "string" && typeof detail.label === "string"
    ? { id: detail.id, label: detail.label }
    : null;
}
