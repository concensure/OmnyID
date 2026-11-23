// @locs-version: 1.0
import {
  customEventDetail,
  isRecord,
  optionalStringArrayProperty,
  optionalStringProperty,
} from "@/lib/eventDetail";

export const GOAL_BREAKDOWN_EVENT = "omnyid:goal-breakdown";

export type GoalBreakdownEventDetail = {
  goalId: string;
  action: "conversation" | "infer" | "scheduled";
  message?: string;
  selectedDays?: string[];
  summary?: string;
};

const GOAL_BREAKDOWN_ACTIONS = ["conversation", "infer", "scheduled"] as const;

function isGoalBreakdownEventDetail(value: unknown): value is GoalBreakdownEventDetail {
  if (!isRecord(value)) return false;
  const detail = value;
  return (
    typeof detail.goalId === "string"
    && typeof detail.action === "string"
    && (GOAL_BREAKDOWN_ACTIONS as readonly string[]).includes(detail.action)
    && optionalStringProperty(detail, "message") !== null
    && optionalStringArrayProperty(detail, "selectedDays") !== null
    && optionalStringProperty(detail, "summary") !== null
  );
}

export function dispatchGoalBreakdownEvent(
  detail: GoalBreakdownEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(GOAL_BREAKDOWN_EVENT, { detail }));
}

export function readGoalBreakdownEventDetail(
  event: Event,
): GoalBreakdownEventDetail | null {
  const detail = customEventDetail(event);
  return isGoalBreakdownEventDetail(detail) ? detail : null;
}
