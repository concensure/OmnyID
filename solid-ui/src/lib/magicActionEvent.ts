// @locs-version: 1.0
import {
  customEventRecordDetail,
  optionalNullableStringProperty,
  optionalStringProperty,
} from "@/lib/eventDetail";

export const MAGIC_ACTION_EVENT = "magic-action";

export type MagicActionEventDetail = {
  action: string;
  el?: Element;
  label?: string;
  icon?: string;
  msgId: string | null;
};

export function dispatchMagicActionEvent(
  detail: MagicActionEventDetail,
  target: Document = document,
): void {
  target.dispatchEvent(new CustomEvent(MAGIC_ACTION_EVENT, { detail }));
}

export function readMagicActionEventDetail(
  event: Event,
): MagicActionEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  const msgId = optionalNullableStringProperty(detail, "msgId");
  const label = optionalStringProperty(detail, "label");
  const icon = optionalStringProperty(detail, "icon");
  if (typeof detail.action !== "string") return null;
  if (msgId === false) return null;
  if (label === null) return null;
  if (icon === null) return null;
  let el: Element | undefined;
  if (detail.el !== undefined) {
    if (typeof Element === "undefined" || !(detail.el instanceof Element)) {
      return null;
    }
    el = detail.el;
  }
  return {
    action: detail.action,
    el,
    label,
    icon,
    msgId: msgId ?? null,
  };
}

export function subscribeMagicActionEvent(
  callback: (detail: MagicActionEventDetail) => void,
  target: Document = document,
): () => void {
  const handler = (event: Event) => {
    const detail = readMagicActionEventDetail(event);
    if (detail === null) return;
    callback(detail);
  };
  target.addEventListener(MAGIC_ACTION_EVENT, handler);
  return () => target.removeEventListener(MAGIC_ACTION_EVENT, handler);
}
