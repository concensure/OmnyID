// @locs-version: 1.0
export type DecisionOsUrgency = "urgent" | "high" | "medium" | "low";
export type DecisionOsImpact = "high" | "medium" | "low";
export type DecisionOsDurationView = "day" | "week" | "month" | "year";

export type DecisionOsShortcut = {
  key: string;
  desc: string;
};

const URGENCY_EXPLANATION: Record<DecisionOsUrgency, string> = {
  urgent: "Hard deadline within 24 h, a waiting blocker, or direct stakeholder watcher pressure.",
  high: "Due this week or directly blocks a high-impact deliverable.",
  medium: "Important but not time-critical. Can safely shift 1-2 days without downstream consequences.",
  low: "No near-term blocking effect — safe to snooze or batch with other low-priority work.",
};

const IMPACT_EXPLANATION: Record<DecisionOsImpact, string> = {
  high: "Affects a primary OKR, a major deliverable, or a stakeholder milestone.",
  medium: "Has meaningful downstream effects but is not on the critical path.",
  low: "Useful but its absence does not block other work.",
};

const DURATION_SCOPE_EXPLANATION: Record<DecisionOsDurationView, string> = {
  day: "Due or relevant today.",
  week: "No daily hard deadline, but needs action within 7 days.",
  month: "Monthly-scope item — best addressed in the weekly cadence, not urgently.",
  year: "Annual goal or long-range item — break it into milestones before tackling.",
};

const SHORTCUTS: DecisionOsShortcut[] = [
  { key: "j / k", desc: "Navigate down / up in queue" },
  { key: "a", desc: "Approve focused decision" },
  { key: "x", desc: "Dismiss focused decision" },
  { key: "z", desc: "Snooze focused decision" },
  { key: "c", desc: "Open linked calendar event" },
  { key: "g", desc: "Open goal breakdown for focused item" },
  { key: "p", desc: "Pin or unpin the context panel" },
  { key: "d", desc: "Switch to Day view" },
  { key: "w", desc: "Switch to Week view" },
  { key: "m", desc: "Switch to Month view" },
  { key: "y", desc: "Switch to Year view" },
  { key: "f", desc: "Focus the selected decision or toggle quick-wins" },
  { key: "Esc", desc: "Close panel / modal" },
  { key: "?", desc: "Toggle this shortcuts panel" },
];

export function decisionOsUrgencyExplanation(urgency: DecisionOsUrgency): string {
  return URGENCY_EXPLANATION[urgency];
}

export function decisionOsImpactExplanation(impact: DecisionOsImpact): string {
  return IMPACT_EXPLANATION[impact];
}

export function decisionOsDurationScopeExplanation(scope: DecisionOsDurationView): string {
  return DURATION_SCOPE_EXPLANATION[scope];
}

export function decisionOsShortcuts(): readonly DecisionOsShortcut[] {
  return SHORTCUTS;
}

export function decisionOsShortcutsTitle(): string {
  return "Keyboard Shortcuts";
}

export function decisionOsShortcutsCloseAriaLabel(): string {
  return "Close shortcuts panel";
}

export function decisionOsShortcutsTypingHint(): string {
  return "Shortcuts are inactive when typing in a field";
}
