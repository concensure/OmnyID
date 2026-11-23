// @locs-version: 1.0
import { customEventDetail, isCustomEvent } from "@/lib/eventDetail";

export const INLINE_ENTITY_PREFERENCE_CHANGED_EVENT =
  "omnyid:inline-entity-pref-changed";

export type InlineEntityPreferenceChangedEventDetail = undefined;

export function dispatchInlineEntityPreferenceChangedEvent(
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(INLINE_ENTITY_PREFERENCE_CHANGED_EVENT));
}

export function readInlineEntityPreferenceChangedEventDetail(
  event: Event,
): InlineEntityPreferenceChangedEventDetail | null {
  if (!isCustomEvent(event)) return null;
  const detail = customEventDetail(event);
  return typeof detail === "undefined" || detail === null ? undefined : null;
}

export function subscribeInlineEntityPreferenceChangedEvent(
  callback: () => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    if (readInlineEntityPreferenceChangedEventDetail(event) === null) return;
    callback();
  };
  target.addEventListener(INLINE_ENTITY_PREFERENCE_CHANGED_EVENT, handler);
  return () => target.removeEventListener(INLINE_ENTITY_PREFERENCE_CHANGED_EVENT, handler);
}
