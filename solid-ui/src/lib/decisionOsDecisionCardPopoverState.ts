// @locs-version: 1.0
import { missingReasonFallbackText } from "@/lib/reasonFallbackText";

export type DecisionOsOutcomeCheckMenuOption = {
  label: string;
  days: number;
};

const DEFAULT_OUTCOME_CHECK_MENU_OPTIONS: readonly DecisionOsOutcomeCheckMenuOption[] = [
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
];

const FLAGGED_REASONING_ICON = "!";

export function decisionOsOutcomeCheckMenuOptions(): DecisionOsOutcomeCheckMenuOption[] {
  return [...DEFAULT_OUTCOME_CHECK_MENU_OPTIONS];
}

export function decisionOsOutcomeCheckScheduledTitle(checkAt: string): string {
  return `Outcome check scheduled for ${new Date(checkAt).toLocaleString()}`;
}

export function decisionOsOutcomeCheckRescheduleAt(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function decisionOsFlagReasoningFallbackDetail(): string {
  return missingReasonFallbackText();
}

export function decisionOsFlagReasoningDiaryEntry(args: {
  title: string;
  confidenceReason?: string | null;
  confidence: number;
}): {
  ts: string;
  type: "note";
  icon: string;
  title: string;
  detail: string;
  meta: string;
} {
  const confidencePct = Math.round(args.confidence * 100);
  return {
    ts: new Date().toISOString(),
    type: "note",
    icon: FLAGGED_REASONING_ICON,
    title: `Flagged reasoning: ${args.title}`,
    detail: args.confidenceReason?.trim() || decisionOsFlagReasoningFallbackDetail(),
    meta: `${confidencePct}% confidence`,
  };
}
