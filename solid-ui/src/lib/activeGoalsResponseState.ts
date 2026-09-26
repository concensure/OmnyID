// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import type { GoalDomain } from "@/lib/profileLedger";
import type { GoalPulseItem, Momentum } from "@/lib/intelligenceBriefState";
import type { PulseGoalOption } from "@/lib/pulseFeedResponseState";

export interface ActiveGoalRecord {
  goal_id?: string;
  domain: GoalDomain;
  title?: string;
  momentum: Momentum;
  last_signal?: string;
}

const GOAL_DOMAINS = new Set<GoalDomain>([
  "career",
  "finance",
  "health",
  "relationships",
  "personal_growth",
  "creativity",
  "community",
  "lifestyle",
  "other",
]);

const MOMENTUM_VALUES = new Set<Momentum>(["building", "steady", "quiet", "paused", "recent"]);

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function optionalString(value: unknown): string | undefined {
  const text = scalarString(value);
  return text || undefined;
}

function normalizeGoalDomain(value: unknown): GoalDomain {
  return typeof value === "string" && GOAL_DOMAINS.has(value as GoalDomain) ? value as GoalDomain : "other";
}

function normalizeMomentum(value: unknown): Momentum {
  return typeof value === "string" && MOMENTUM_VALUES.has(value as Momentum) ? value as Momentum : "quiet";
}

export function normalizeActiveGoalRecord(value: unknown): ActiveGoalRecord | null {
  if (!isRecord(value)) return null;
  return {
    goal_id: optionalString(value.goal_id),
    domain: normalizeGoalDomain(value.domain),
    title: optionalString(value.title),
    momentum: normalizeMomentum(value.momentum),
    last_signal: optionalString(value.last_signal ?? value.last_signal_at),
  };
}

export function normalizeActiveGoalsResponse(value: unknown): ActiveGoalRecord[] {
  const record = isRecord(value) ? value : {};
  return Array.isArray(record.goals)
    ? record.goals
      .map(normalizeActiveGoalRecord)
      .filter((goal): goal is ActiveGoalRecord => Boolean(goal))
    : [];
}

export function activeGoalsToGoalPulseItems(goals: readonly ActiveGoalRecord[]): GoalPulseItem[] {
  return goals.map((goal) => ({
    domain: goal.domain,
    momentum: goal.momentum,
    last_signal: goal.last_signal,
  }));
}

export function activeGoalsToPulseGoalOptions(goals: readonly ActiveGoalRecord[]): PulseGoalOption[] {
  return goals.flatMap((goal): PulseGoalOption[] =>
    goal.goal_id && goal.title
      ? [{
        goal_id: goal.goal_id,
        domain: goal.domain,
        title: goal.title,
      }]
      : [],
  );
}
