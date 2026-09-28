// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const COMPOSE_QUERY_FRAGMENT_EVENT = "omnyid:compose-query-fragment";

export type ComposeQueryFragmentEventDetail = {
  query: string;
  submit: boolean;
};

export function dispatchComposeQueryFragmentEvent(
  detail: ComposeQueryFragmentEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(COMPOSE_QUERY_FRAGMENT_EVENT, { detail }));
}

export function readComposeQueryFragmentEventDetail(
  event: Event,
): ComposeQueryFragmentEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.query === "string" && typeof detail.submit === "boolean"
    ? { query: detail.query, submit: detail.submit }
    : null;
}
