// @locs-version: 1.0
export type DecisionOsKeyboardIntent =
  | { kind: "toggle-shortcuts" }
  | { kind: "escape-close-shortcuts" }
  | { kind: "escape-close-goal-modal" }
  | { kind: "escape-close-focus-mode" }
  | { kind: "escape-clear-selection" }
  | { kind: "focus-next" }
  | { kind: "focus-prev" }
  | { kind: "approve-focused" }
  | { kind: "dismiss-focused" }
  | { kind: "snooze-focused" }
  | { kind: "open-calendar" }
  | { kind: "open-goal-breakdown" }
  | { kind: "set-duration"; value: "day" | "week" | "month" | "year" }
  | { kind: "toggle-focus-mode" }
  | { kind: "toggle-pin-context" }
  | { kind: "none" };

export function decisionOsKeyboardIntent(args: {
  key: string;
  vimNavigationEnabled?: boolean;
  showShortcuts: boolean;
  hasGoalModal: boolean;
  hasFocusMode: boolean;
  hasFocusedDecision: boolean;
  hasCalendarTarget: boolean;
  hasGoalBreakdownTarget: boolean;
}): DecisionOsKeyboardIntent {
  switch (args.key) {
    case "?":
      return { kind: "toggle-shortcuts" };
    case "Escape":
      if (args.showShortcuts) return { kind: "escape-close-shortcuts" };
      if (args.hasGoalModal) return { kind: "escape-close-goal-modal" };
      if (args.hasFocusMode) return { kind: "escape-close-focus-mode" };
      return { kind: "escape-clear-selection" };
    case "j":
      return args.vimNavigationEnabled ? { kind: "focus-next" } : { kind: "none" };
    case "k":
      return args.vimNavigationEnabled ? { kind: "focus-prev" } : { kind: "none" };
    case "a":
      return args.hasFocusedDecision ? { kind: "approve-focused" } : { kind: "none" };
    case "x":
      return args.hasFocusedDecision ? { kind: "dismiss-focused" } : { kind: "none" };
    case "z":
      return args.hasFocusedDecision ? { kind: "snooze-focused" } : { kind: "none" };
    case "c":
      return args.hasCalendarTarget ? { kind: "open-calendar" } : { kind: "none" };
    case "g":
      return args.hasGoalBreakdownTarget ? { kind: "open-goal-breakdown" } : { kind: "none" };
    case "d":
      return { kind: "set-duration", value: "day" };
    case "w":
      return { kind: "set-duration", value: "week" };
    case "m":
      return { kind: "set-duration", value: "month" };
    case "y":
      return { kind: "set-duration", value: "year" };
    case "f":
      return { kind: "toggle-focus-mode" };
    case "p":
      return { kind: "toggle-pin-context" };
    default:
      return { kind: "none" };
  }
}
