// @locs-version: 1.0
export function decisionOsTimeSavedLabel(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function decisionOsCompletedProgressLabel(
  completedToday: number,
  total: number,
): string {
  return `${completedToday}/${total}`;
}

export function decisionOsDismissLowImpactLabel(): string {
  return "Dismiss All Low-Impact";
}

export function decisionOsScheduleReviewLabel(): string {
  return "Schedule 15-min Review";
}

export function decisionOsCompletedTodayTitle(): string {
  return "Decisions Today";
}

export function decisionOsTimeSavedTitle(): string {
  return "Time Saved";
}
