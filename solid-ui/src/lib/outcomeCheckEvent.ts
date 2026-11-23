// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const OUTCOME_CHECK_SCHEDULED_EVENT = "omnyid:outcome-check-scheduled";

export type OutcomeCheckScheduledEventDetail = {
  id: string;
  title: string;
  checkAt: string;
};

export function dispatchOutcomeCheckScheduledEvent(
  detail: OutcomeCheckScheduledEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(
    new CustomEvent(OUTCOME_CHECK_SCHEDULED_EVENT, { detail }),
  );
}

export function readOutcomeCheckScheduledEventDetail(
  event: Event,
): OutcomeCheckScheduledEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  if (typeof detail.id !== "string") return null;
  if (typeof detail.title !== "string") return null;
  if (typeof detail.checkAt !== "string") return null;
  return {
    id: detail.id,
    title: detail.title,
    checkAt: detail.checkAt,
  };
}
