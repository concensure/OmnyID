// @locs-version: 1.0
import type { DecisionOsKeyboardIntent } from "./decisionOsKeyboardIntentState";

export type DecisionOsKeyboardExecutionDecision = {
  id: string;
  calendarEventId?: string;
  goalBreakdown?: {
    status?: string;
  } | null;
};

export type DecisionOsKeyboardExecutionMood = "focused" | "happy" | "tired" | "stressed" | "neutral";
export type DecisionOsKeyboardExecutionDuration = "day" | "week" | "month" | "year";

export type DecisionOsKeyboardExecutionPlan<TDecision extends DecisionOsKeyboardExecutionDecision> =
  | { kind: "toggle-shortcuts" }
  | { kind: "close-shortcuts" }
  | { kind: "close-goal-modal" }
  | { kind: "close-focus-mode" }
  | { kind: "clear-selection" }
  | { kind: "focus"; selectedId: string | null; focusedIndex: number }
  | { kind: "approve"; decisionId: string; requiresGoalBreakdown: boolean; decision: TDecision }
  | { kind: "dismiss"; decisionId: string; focusedIndex: number }
  | { kind: "snooze"; decisionId: string; snoozeId: string }
  | { kind: "open-calendar"; eventId: string }
  | { kind: "open-goal-breakdown"; decision: TDecision }
  | { kind: "set-duration"; value: DecisionOsKeyboardExecutionDuration }
  | { kind: "set-focus-mode"; value: string | null }
  | { kind: "toggle-mood"; value: DecisionOsKeyboardExecutionMood }
  | { kind: "set-pinned-context"; value: string | null }
  | { kind: "none" };

function nextFocusIndex(currentIndex: number, visibleCount: number): number {
  return Math.min(currentIndex + 1, visibleCount - 1);
}

function previousFocusIndex(currentIndex: number): number {
  return Math.max(currentIndex - 1, 0);
}

function focusIndexAfterDismiss(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}

function toggledFocusModeId(currentId: string | null, focusedDecisionId: string | null): string | null {
  if (!focusedDecisionId) return currentId;
  return currentId === focusedDecisionId ? null : focusedDecisionId;
}

function toggledPinnedContextId(currentPinnedId: string | null, focusTargetId: string | null): string | null {
  if (!focusTargetId) return currentPinnedId;
  return currentPinnedId ? null : focusTargetId;
}

export function decisionOsKeyboardExecutionPlan<
  TDecision extends DecisionOsKeyboardExecutionDecision,
>(args: {
  intent: DecisionOsKeyboardIntent;
  visibleDecisions: readonly TDecision[];
  focusedIndex: number;
  focusedDecision: TDecision | null;
  selectedOrFocused: TDecision | null;
  currentFocusModeId: string | null;
  currentPinnedContextId: string | null;
  currentMood: DecisionOsKeyboardExecutionMood;
}): DecisionOsKeyboardExecutionPlan<TDecision> {
  switch (args.intent.kind) {
    case "toggle-shortcuts":
      return { kind: "toggle-shortcuts" };
    case "escape-close-shortcuts":
      return { kind: "close-shortcuts" };
    case "escape-close-goal-modal":
      return { kind: "close-goal-modal" };
    case "escape-close-focus-mode":
      return { kind: "close-focus-mode" };
    case "escape-clear-selection":
      return { kind: "clear-selection" };
    case "focus-next": {
      const next = nextFocusIndex(args.focusedIndex, args.visibleDecisions.length);
      return {
        kind: "focus",
        selectedId: args.visibleDecisions[next]?.id ?? null,
        focusedIndex: next,
      };
    }
    case "focus-prev": {
      const previous = previousFocusIndex(args.focusedIndex);
      return {
        kind: "focus",
        selectedId: args.visibleDecisions[previous]?.id ?? null,
        focusedIndex: previous,
      };
    }
    case "approve-focused":
      if (!args.focusedDecision) return { kind: "none" };
      return {
        kind: "approve",
        decisionId: args.focusedDecision.id,
        requiresGoalBreakdown: args.focusedDecision.goalBreakdown?.status === "needs_breakdown",
        decision: args.focusedDecision,
      };
    case "dismiss-focused":
      if (!args.focusedDecision) return { kind: "none" };
      return {
        kind: "dismiss",
        decisionId: args.focusedDecision.id,
        focusedIndex: focusIndexAfterDismiss(args.focusedIndex),
      };
    case "snooze-focused":
      return args.focusedDecision
        ? { kind: "snooze", decisionId: args.focusedDecision.id, snoozeId: "tomorrow" }
        : { kind: "none" };
    case "open-calendar":
      return args.selectedOrFocused?.calendarEventId
        ? { kind: "open-calendar", eventId: args.selectedOrFocused.calendarEventId }
        : { kind: "none" };
    case "open-goal-breakdown":
      return args.selectedOrFocused?.goalBreakdown
        ? { kind: "open-goal-breakdown", decision: args.selectedOrFocused }
        : { kind: "none" };
    case "set-duration":
      return { kind: "set-duration", value: args.intent.value };
    case "toggle-focus-mode":
      if (args.focusedDecision) {
        return {
          kind: "set-focus-mode",
          value: toggledFocusModeId(args.currentFocusModeId, args.focusedDecision.id),
        };
      }
      return {
        kind: "toggle-mood",
        value: args.currentMood === "tired" ? "neutral" : "tired",
      };
    case "toggle-pin-context":
      return args.selectedOrFocused
        ? {
            kind: "set-pinned-context",
            value: toggledPinnedContextId(
              args.currentPinnedContextId,
              args.selectedOrFocused.id,
            ),
          }
        : { kind: "none" };
    case "none":
    default:
      return { kind: "none" };
  }
}
