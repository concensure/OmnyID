// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const SKILL_DEACTIVATION_EVENT = "omnyid:deactivate-skill";

export type SkillDeactivationEventDetail = {
  skillId: string;
};

export function dispatchSkillDeactivationEvent(
  detail: SkillDeactivationEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(SKILL_DEACTIVATION_EVENT, { detail }));
}

export function readSkillDeactivationEventDetail(
  event: Event,
): SkillDeactivationEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.skillId === "string"
    ? { skillId: detail.skillId }
    : null;
}

export function subscribeSkillDeactivationEvent(
  callback: (detail: SkillDeactivationEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readSkillDeactivationEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(SKILL_DEACTIVATION_EVENT, handler);
  return () => target.removeEventListener(SKILL_DEACTIVATION_EVENT, handler);
}
