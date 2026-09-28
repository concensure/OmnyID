// @locs-version: 1.0
export type DecisionOsMoodOption = {
  id: "neutral" | "focused" | "happy" | "tired" | "stressed";
  emoji: string;
  label: string;
  effortFilter: "all" | "quick" | "all-normal";
};

export type DecisionOsDurationViewOption = {
  id: "day" | "week" | "month" | "year";
  label: string;
  hint: string;
};

const MOOD_OPTIONS: readonly DecisionOsMoodOption[] = [
  { id: "neutral", emoji: "\uD83D\uDE10", label: "Neutral", effortFilter: "all" },
  { id: "focused", emoji: "\uD83C\uDFAF", label: "Focused", effortFilter: "all" },
  { id: "happy", emoji: "\uD83D\uDE0A", label: "Happy", effortFilter: "all-normal" },
  { id: "tired", emoji: "\uD83D\uDE34", label: "Tired", effortFilter: "quick" },
  { id: "stressed", emoji: "\uD83D\uDE24", label: "Stressed", effortFilter: "quick" },
];

const DURATION_VIEWS: readonly DecisionOsDurationViewOption[] = [
  { id: "day", label: "Today", hint: "Decisions due or relevant today" },
  { id: "week", label: "Week", hint: "This week's tasks and milestones" },
  { id: "month", label: "Month", hint: "Monthly goals and recurring items" },
  { id: "year", label: "Year", hint: "Annual goals and long-range planning" },
];

const DURATION_SCOPE_ORDER = ["day", "week", "month", "year"] as const;

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function decisionOsMoodOptions(): readonly DecisionOsMoodOption[] {
  return MOOD_OPTIONS;
}

export function decisionOsMoodEffortFilter(
  mood: DecisionOsMoodOption["id"] | null | undefined,
): DecisionOsMoodOption["effortFilter"] {
  return MOOD_OPTIONS.find((option) => option.id === mood)?.effortFilter ?? "all";
}

export function decisionOsDurationViews(): readonly DecisionOsDurationViewOption[] {
  return DURATION_VIEWS;
}

export function decisionOsDurationScopeOrder(): readonly DecisionOsDurationViewOption["id"][] {
  return DURATION_SCOPE_ORDER;
}

export function decisionOsDaysOfWeek(): readonly string[] {
  return DAYS_OF_WEEK;
}
