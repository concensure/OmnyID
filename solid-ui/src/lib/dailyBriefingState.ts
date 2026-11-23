// @locs-version: 1.0
import type { AfpMessage, ContinuityMessage } from "./api";
import { decryptedDisplayContent } from "./decryptedDisplayState";
import { isRecord } from "./eventDetail";

export type DailyBriefingProjectionCard = {
  headline: string;
  body: string;
  urgencyToneClass: string;
  categoryIcon: string;
};

export type DailyBriefingPatternChip = {
  summary: string;
  categoryIcon: string;
};

export type DailyBriefingState = {
  headline: string;
  summaryLine: string | null;
  focusItems: string[];
  projectionCards: DailyBriefingProjectionCard[];
  temporalProjectionSummaries: string[];
  patternChips: DailyBriefingPatternChip[];
  hasContent: boolean;
};

function urgencyToneClass(urgency: string) {
  return urgency === "high"
    ? "text-red-600"
    : urgency === "medium"
      ? "text-amber-600"
      : "text-on-surface-variant";
}

function categoryIcon(category: string) {
  const map: Record<string, string> = {
    deadline_conflict: "!",
    goal_drift: "*",
    interruption_pattern: "~",
    opportunity: "+",
    work_style: "@",
    routine: "~",
    emotional: "<3",
    communication: "->",
  };
  return map[category] ?? "#";
}

function continuityContent(
  message: (ContinuityMessage & Partial<Pick<AfpMessage, "encryption">>) | null | undefined,
): Record<string, unknown> {
  if (!message) return {};
  const content = decryptedDisplayContent(message);
  return isRecord(content) ? content : {};
}

function contentString(
  message: (ContinuityMessage & Partial<Pick<AfpMessage, "encryption">>) | null | undefined,
  key: string,
  fallback = "",
): string {
  const value = continuityContent(message)[key];
  return typeof value === "string" ? value : fallback;
}

function contentNumber(
  message: (ContinuityMessage & Partial<Pick<AfpMessage, "encryption">>) | null | undefined,
  key: string,
  fallback = 0,
): number {
  const value = continuityContent(message)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function contentStringArray(
  message: (ContinuityMessage & Partial<Pick<AfpMessage, "encryption">>) | null | undefined,
  key: string,
): string[] {
  const value = continuityContent(message)[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function dailyBriefingState(messages: ContinuityMessage[]): DailyBriefingState {
  const stateSynthesis = messages.find((message) => message.type === "state_synthesis") ?? null;
  const behaviorPatterns = messages.filter((message) => message.type === "behavior_pattern").slice(0, 3);
  const temporalProjections = messages.filter((message) => message.type === "temporal_projection").slice(0, 2);
  const projections = messages.filter((message) => message.type === "projection").slice(0, 3);

  const focusItems = contentStringArray(stateSynthesis, "focus_items");
  const projectionCards = projections.map((message) => ({
    headline: contentString(message, "headline"),
    body: contentString(message, "body"),
    urgencyToneClass: urgencyToneClass(contentString(message, "urgency")),
    categoryIcon: categoryIcon(contentString(message, "category")),
  }));
  const temporalProjectionSummaries = temporalProjections
    .map((message) => contentString(message, "summary"))
    .filter((summary) => summary.length > 0);
  const patternChips = behaviorPatterns
    .map((message) => ({
      summary: contentString(message, "summary"),
      categoryIcon: categoryIcon(contentString(message, "category")),
    }))
    .filter((chip) => chip.summary.length > 0);

  return {
    headline: contentString(stateSynthesis, "headline", "Daily Briefing"),
    summaryLine: stateSynthesis
      ? `${contentNumber(stateSynthesis, "active_task_count")} tasks · ${contentNumber(stateSynthesis, "pending_decision_count")} decisions · calendar ${contentString(stateSynthesis, "calendar_pressure", "calm")}`
      : null,
    focusItems,
    projectionCards,
    temporalProjectionSummaries,
    patternChips,
    hasContent:
      Boolean(stateSynthesis)
      || focusItems.length > 0
      || projectionCards.length > 0
      || temporalProjectionSummaries.length > 0
      || patternChips.length > 0,
  };
}
