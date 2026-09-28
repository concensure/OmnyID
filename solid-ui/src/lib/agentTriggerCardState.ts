// @locs-version: 1.0
import {
  agentTriggerCronExpression,
  agentTriggerHasRecentRuns,
  agentTriggerIsEnabled,
  agentTriggerLastRunAt,
  agentTriggerNextRunAt,
  agentTriggerRecentRuns,
  type AgentTriggerRecord,
  type AgentTriggerRecentRun,
} from "./agentTriggerResponseState";
import {
  agentTriggerRunCount,
  agentTriggerRunCountClass,
  agentTriggerRunCountLabel,
} from "./agentTriggerRunCountPresentation";
import { cronExpressionSummary } from "./agentTriggerSchedulePresentation";
import { agentTriggerSummaryText } from "./agentTriggerSummaryPresentation";
import {
  lastSuccessfulAgentTriggerRunLabel,
  relativeAgentTriggerTime,
  timeUntilAgentTriggerRun,
} from "./agentTriggerTime";

export type AgentTriggerCardState = {
  fullSummary: string;
  displaySummary: string;
  expandable: boolean;
  isEnabled: boolean;
  runCount: number;
  runCountLabel: string;
  runCountClass: string;
  createdAt: string | null;
  createdRelativeLabel: string | null;
  lastRunAt: string | null;
  lastRunRelativeLabel: string | null;
  nextRunAt: string | null;
  nextRunRelativeLabel: string | null;
  nextRunCountdownLabel: string | null;
  recentRuns: AgentTriggerRecentRun[];
  recentRunsLabel: string | null;
  hasRecentRuns: boolean;
  lastSuccessLabel: string | null;
  cronSummary: string | null;
};

function latestRecentRunTimestamp(runs: AgentTriggerRecentRun[]): string | null {
  let latestTimestamp: string | null = null;
  let latestMs = -Infinity;
  for (const run of runs) {
    const candidate = run.ran_at ?? run.created_at ?? null;
    if (!candidate) continue;
    const candidateMs = new Date(candidate).getTime();
    if (Number.isNaN(candidateMs) || candidateMs <= latestMs) continue;
    latestMs = candidateMs;
    latestTimestamp = candidate;
  }
  return latestTimestamp;
}

function validTriggerTimestamp(value: string | null): string | null {
  if (!value) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

export function agentTriggerCardState(
  trigger: AgentTriggerRecord,
  options?: { expanded?: boolean; nowMs?: number; maxCollapsedSummaryLength?: number },
): AgentTriggerCardState {
  const expanded = options?.expanded ?? false;
  const nowMs = options?.nowMs ?? Date.now();
  const maxCollapsedSummaryLength = options?.maxCollapsedSummaryLength ?? 80;
  const fullSummary = agentTriggerSummaryText(trigger);
  const expandable = fullSummary.length > maxCollapsedSummaryLength;
  const recentRuns = agentTriggerRecentRuns(trigger);
  const hasRecentRuns = agentTriggerHasRecentRuns(trigger);
  const cronExpression = agentTriggerCronExpression(trigger);
  const cronSummary =
    cronExpression && cronExpressionSummary(cronExpression) !== cronExpression
      ? cronExpressionSummary(cronExpression)
      : null;
  const createdAt = trigger.created_at ?? null;
  const lastRunAt = validTriggerTimestamp(agentTriggerLastRunAt(trigger)) ?? latestRecentRunTimestamp(recentRuns);
  const nextRunAt = validTriggerTimestamp(agentTriggerNextRunAt(trigger));
  const runCount = agentTriggerRunCount(trigger);

  return {
    fullSummary,
    displaySummary:
      !expanded && expandable
        ? `${fullSummary.slice(0, maxCollapsedSummaryLength)}...`
        : fullSummary,
    expandable,
    isEnabled: agentTriggerIsEnabled(trigger),
    runCount,
    runCountLabel: agentTriggerRunCountLabel(runCount),
    runCountClass: agentTriggerRunCountClass(runCount),
    createdAt,
    createdRelativeLabel: createdAt ? relativeAgentTriggerTime(createdAt, nowMs) : null,
    lastRunAt,
    lastRunRelativeLabel: lastRunAt ? relativeAgentTriggerTime(lastRunAt, nowMs) : null,
    nextRunAt,
    nextRunRelativeLabel: nextRunAt ? relativeAgentTriggerTime(nextRunAt, nowMs) : null,
    nextRunCountdownLabel: nextRunAt ? timeUntilAgentTriggerRun(nextRunAt, nowMs) : null,
    recentRuns,
    recentRunsLabel: hasRecentRuns ? `Last ${recentRuns.length} runs` : null,
    hasRecentRuns,
    lastSuccessLabel: hasRecentRuns ? lastSuccessfulAgentTriggerRunLabel(recentRuns, nowMs) : null,
    cronSummary,
  };
}
