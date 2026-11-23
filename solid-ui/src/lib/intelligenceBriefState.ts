// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import type { GoalDomain } from "@/lib/profileLedger";
import {
  activeGoalsToGoalPulseItems,
  normalizeActiveGoalRecord,
  normalizeActiveGoalsResponse,
} from "@/lib/activeGoalsResponseState";

export type BriefSectionType = "context" | "goal_pulse" | "ambient" | "peripheral" | "agent_offer";
export type Momentum = "building" | "steady" | "quiet" | "paused" | "recent";

export interface BriefSection {
  type: BriefSectionType;
  title: string;
  body: string;
  priority: number;
  source_message_ids?: string[];
  action?: { label: string; intent: string };
}

export interface GoalPulseItem {
  domain: GoalDomain;
  momentum: Momentum;
  last_signal?: string;
}

export interface BriefApiResponse {
  brief_id?: string;
  brief_date: string;
  greeting?: string;
  sections: BriefSection[];
  goal_pulse?: GoalPulseItem[];
}

const BRIEF_SECTION_TYPES = new Set<BriefSectionType>(["context", "goal_pulse", "ambient", "peripheral", "agent_offer"]);
const MOMENTUM_VALUES = new Set<Momentum>(["building", "steady", "quiet", "paused", "recent"]);
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

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function optionalString(value: unknown): string | undefined {
  const text = scalarString(value);
  return text || undefined;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBriefSectionType(value: unknown): BriefSectionType {
  return typeof value === "string" && BRIEF_SECTION_TYPES.has(value as BriefSectionType)
    ? value as BriefSectionType
    : "ambient";
}

function normalizeMomentum(value: unknown): Momentum {
  return typeof value === "string" && MOMENTUM_VALUES.has(value as Momentum) ? value as Momentum : "quiet";
}

function normalizeGoalDomain(value: unknown): GoalDomain {
  return typeof value === "string" && GOAL_DOMAINS.has(value as GoalDomain) ? value as GoalDomain : "other";
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(optionalString).filter((item): item is string => Boolean(item)) : [];
}

function normalizeBriefAction(value: unknown): BriefSection["action"] {
  if (!isRecord(value)) return undefined;
  const label = optionalString(value.label);
  const intent = optionalString(value.intent);
  return label && intent ? { label, intent } : undefined;
}

export function normalizeBriefSection(value: unknown): BriefSection | null {
  if (!isRecord(value)) return null;
  const title = optionalString(value.title);
  const body = optionalString(value.body);
  if (!title || !body) return null;
  return {
    type: normalizeBriefSectionType(value.type),
    title,
    body,
    priority: finiteNumber(value.priority),
    source_message_ids: normalizeStringList(value.source_message_ids),
    action: normalizeBriefAction(value.action),
  };
}

export function normalizeGoalPulseItem(value: unknown): GoalPulseItem | null {
  const goal = normalizeActiveGoalRecord(value);
  return goal
    ? {
      domain: goal.domain,
      momentum: goal.momentum,
      last_signal: goal.last_signal,
    }
    : null;
}

export function normalizeBriefResponse(value: unknown): BriefApiResponse | null {
  if (!isRecord(value)) return null;
  const briefDate = optionalString(value.brief_date);
  if (!briefDate) return null;
  return {
    brief_id: optionalString(value.brief_id),
    brief_date: briefDate,
    greeting: optionalString(value.greeting),
    sections: Array.isArray(value.sections)
      ? value.sections.map(normalizeBriefSection).filter((section): section is BriefSection => Boolean(section))
      : [],
    goal_pulse: Array.isArray(value.goal_pulse)
      ? value.goal_pulse.map(normalizeGoalPulseItem).filter((item): item is GoalPulseItem => Boolean(item))
      : undefined,
  };
}

export function normalizeGoalsPulseResponse(value: unknown): GoalPulseItem[] {
  return activeGoalsToGoalPulseItems(normalizeActiveGoalsResponse(value));
}

export function shouldLoadIntelligenceBrief(
  settingsEnabled: boolean,
  signedIn: boolean,
): boolean {
  return settingsEnabled && signedIn;
}
