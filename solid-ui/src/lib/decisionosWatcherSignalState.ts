// @locs-version: 2.0
import { sourceCountSummary } from "afp-ts/continuity";
import type { DashboardBootstrap } from "@/lib/api";

export type DecisionOsWatcherSignal = NonNullable<DashboardBootstrap["continuity_watcher_signals"]>[number];

export type DecisionOsWatcherSignalChip = {
  id: string;
  label: string;
  tone: "urgent" | "warning" | "quiet" | "muted";
  title: string | null;
};

export type DecisionOsWatcherSignalState = {
  chips: DecisionOsWatcherSignalChip[];
  count: number;
  hasSignals: boolean;
};

function normalized(value: string | null | undefined): string | null {
  const next = value?.trim().toLowerCase();
  return next ? next : null;
}

function display(value: string | null | undefined): string | null {
  const next = value?.trim().replaceAll("_", " ");
  return next ? next : null;
}

function toneForSignal(signal: DecisionOsWatcherSignal): DecisionOsWatcherSignalChip["tone"] {
  const urgency = normalized(signal.urgency);
  const escalation = normalized(signal.escalation_status);
  const suppression = normalized(signal.suppression_status);
  if (signal.decrypt_needed || suppression === "suppressed") return "muted";
  if (escalation === "escalated" || escalation === "required" || urgency === "critical") return "urgent";
  if (urgency === "high" || urgency === "today" || signal.urgency_hint) return "warning";
  return "quiet";
}

function chipTitle(signal: DecisionOsWatcherSignal): string | null {
  return (
    display(signal.escalation_reason)
    ?? display(signal.suppression_reason)
    ?? display(signal.urgency_hint)
    ?? sourceCountSummary(signal.source_refs)
  );
}

function chipLabel(signal: DecisionOsWatcherSignal): string {
  const category = display(signal.category) ?? display(signal.signal_key) ?? "watcher";
  const urgency = display(signal.urgency);
  const freshness = display(signal.freshness);
  const parts = [category, urgency, freshness].filter(Boolean);
  return parts.join(" · ");
}

export function decisionOsWatcherSignalState(
  signals: DecisionOsWatcherSignal[] | null | undefined,
  limit = 4,
): DecisionOsWatcherSignalState {
  const chips = (signals ?? [])
    .filter((signal) => signal.id.trim().length > 0)
    .map((signal) => ({
      id: signal.id,
      label: chipLabel(signal),
      tone: toneForSignal(signal),
      title: chipTitle(signal),
    }))
    .slice(0, Math.max(0, limit));

  return {
    chips,
    count: signals?.length ?? 0,
    hasSignals: chips.length > 0,
  };
}
