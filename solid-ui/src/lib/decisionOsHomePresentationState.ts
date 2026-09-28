// @locs-version: 1.0
export type DecisionOsGreetingInput = {
  urgentCount?: number;
  highImpactCount?: number;
  estimatedMinutes?: number;
};

export type DecisionOsSnoozeOption = {
  id: string;
  label: string;
  wakeAt: number;
};

export type DecisionOsEffortLike = {
  effort: string;
};

export function decisionOsGreeting(
  data?: DecisionOsGreetingInput,
  now = new Date(),
): string {
  const h = now.getHours();
  const urgentCount = data?.urgentCount ?? 0;
  const highImpactCount = data?.highImpactCount ?? 0;
  const estimatedMinutes = data?.estimatedMinutes ?? 0;

  if (h < 5) {
    return urgentCount > 0
      ? `Still up? ${urgentCount} urgent item${urgentCount === 1 ? "" : "s"} still need attention.`
      : "Still up? Here's what needs your attention.";
  }
  if (h < 10) {
    return urgentCount > 0
      ? `Good morning. Clear ${urgentCount} urgent item${urgentCount === 1 ? "" : "s"} before 10 AM.`
      : "Good morning. Here is what needs your attention before 10 AM.";
  }
  if (h < 12) {
    return highImpactCount > 0
      ? `Good morning. ${highImpactCount} high-impact item${highImpactCount === 1 ? "" : "s"} are ready for review.`
      : "Good morning. Here is what needs your attention.";
  }
  if (h < 17) {
    return estimatedMinutes > 0 && estimatedMinutes <= 30
      ? `Good afternoon. You can likely clear this queue in about ${estimatedMinutes} minutes.`
      : "Good afternoon. Here is your current queue.";
  }
  if (h < 21) {
    return urgentCount > 0
      ? `Good evening. ${urgentCount} item${urgentCount === 1 ? "" : "s"} still need review tonight.`
      : "Good evening. A few items need your review.";
  }
  return estimatedMinutes > 0
    ? `Winding down? Here's a ${estimatedMinutes}-minute summary before you rest.`
    : "Winding down? Here's a quick summary before you rest.";
}

export function decisionEffortMinutes(effort: string): number {
  const minutesMatch = effort.match(/(\d+)\s*min/i);
  if (minutesMatch) return parseInt(minutesMatch[1], 10);
  const hoursMatch = effort.match(/(\d+)\s*h/i);
  if (hoursMatch) return parseInt(hoursMatch[1], 10) * 60;
  return 30;
}

export function isDecisionOsQuickWin(
  effort: string,
  maxMinutes = 15,
): boolean {
  return decisionEffortMinutes(effort) <= maxMinutes;
}

export function totalDecisionOsEffortMinutes(
  items: readonly DecisionOsEffortLike[],
): number {
  return items.reduce((sum, item) => sum + decisionEffortMinutes(item.effort), 0);
}

export function outcomeCheckLabel(checkAt: string, now = Date.now()): string {
  return relativeShortDuration(checkAt, now) ?? "soon";
}

export function decisionOsOutcomeCheckBadgeLabel(checkAt: string, now = Date.now()): string {
  return `Check in ${outcomeCheckLabel(checkAt, now)}`;
}

export function decisionOsEmptyQueueSummary(durationView: string): string {
  return durationView === "day"
    ? "Your agent will surface new decisions as they arise."
    : `No ${durationView} decisions in your queue.`;
}

export function decisionOsEmptyQueueDayReturnLabel(): string {
  return "Back to Today's view";
}

export function decisionOsEmptyQueueNextStepsLabel(): string {
  return "What's next";
}

export function decisionOsEmptyQueueTitle(): string {
  return "Queue is clear";
}

export function decisionOsEmptyQueueReviewWeekLabel(): string {
  return "Review this week";
}

export function decisionOsEmptyQueueOpenResponseQueueLabel(): string {
  return "Open response queue";
}

export function decisionOsClearStreakLabel(streakCount: number): string {
  return `${streakCount}-day streak`;
}

export function inferDecisionOsSnoozeOptions(args: {
  nextTentativeStartAt?: string | null;
  latestTentativeTitle?: string | null;
  latestTentativeNoteKind?: string | null;
  latestTentativePrepLeadMinutes?: number | null;
  confirmedEventCount?: number;
  now?: Date;
}): DecisionOsSnoozeOption[] {
  const now = args.now ? new Date(args.now) : new Date();
  const options: DecisionOsSnoozeOption[] = [];
  const seen = new Set<string>();
  const push = (option: DecisionOsSnoozeOption) => {
    if (seen.has(option.id)) return;
    seen.add(option.id);
    options.push(option);
  };

  const nextTentative = args.nextTentativeStartAt ? new Date(args.nextTentativeStartAt) : null;
  if (nextTentative && !Number.isNaN(nextTentative.getTime())) {
    const afterTentative = new Date(nextTentative.getTime() + 90 * 60 * 1000);
    const tentativeMode = args.latestTentativeNoteKind?.trim().replaceAll("_", " ");
    const prepLead = typeof args.latestTentativePrepLeadMinutes === "number"
      ? `${args.latestTentativePrepLeadMinutes}m prep`
      : null;
    const tentativeLabelPrefix = [
      args.latestTentativeTitle?.trim() ?? null,
      tentativeMode ? `(${tentativeMode})` : null,
      prepLead ? `[${prepLead}]` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");
    push({
      id: "after_next_hold",
      label: tentativeLabelPrefix
        ? `After ${tentativeLabelPrefix}`
        : `After ${formatSnoozeDateLabel(nextTentative)}`,
      wakeAt: nextTentative.getTime(),
    });
    push({
      id: "after_next_hold_window",
      label: `After ${formatSnoozeDateLabel(afterTentative)}`,
      wakeAt: afterTentative.getTime(),
    });
  }

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);
  push({ id: "tomorrow", label: "Tomorrow morning", wakeAt: tomorrowMorning.getTime() });

  if ((args.confirmedEventCount ?? 0) >= 3) {
    const afterLunch = new Date(now);
    afterLunch.setHours(14, 0, 0, 0);
    if (afterLunch.getTime() > now.getTime()) {
      push({ id: "after_lunch", label: "After lunch", wakeAt: afterLunch.getTime() });
    }
  } else {
    const tonight = new Date(now);
    tonight.setHours(18, 0, 0, 0);
    if (tonight.getTime() <= now.getTime()) tonight.setDate(tonight.getDate() + 1);
    push({ id: "tonight", label: "Tonight 6PM", wakeAt: tonight.getTime() });
  }

  const friday = new Date(now);
  const fridayOffset = (5 - friday.getDay() + 7) % 7 || 7;
  friday.setDate(friday.getDate() + fridayOffset);
  friday.setHours(9, 0, 0, 0);
  push({ id: "friday", label: "This Friday", wakeAt: friday.getTime() });

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);
  push({ id: "nextweek", label: "Next week", wakeAt: nextWeek.getTime() });

  return options.slice(0, 4);
}

function formatSnoozeDateLabel(value: Date): string {
  return value.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeShortDuration(fromIso: string, now = Date.now()): string | null {
  const diffMs = new Date(fromIso).getTime() - now;
  if (Number.isNaN(diffMs)) return null;
  const absMs = Math.abs(diffMs);
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  if (absMs >= dayMs) return `${Math.max(1, Math.round(absMs / dayMs))}d`;
  return `${Math.max(1, Math.round(absMs / hourMs))}h`;
}
