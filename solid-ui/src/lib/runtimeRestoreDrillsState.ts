// @locs-version: 1.0
import type { RuntimeRestoreDrillsResponse } from "./api";
import { compactSummaryLines } from "./agentSettingsSummaryFormat";
import { dateTimeLabel, durationLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";

type RuntimeRestoreDrillsCarrier = RuntimeRestoreDrillsResponse | null | undefined;

export type RuntimeRestoreDrillPreviewCard = {
  statusLabel: string;
  timingLine: string;
  relativeTimingLine: string;
  noteChips: string[];
};

export function runtimeRestoreDrillEntries(
  runtimeRestoreDrills?: RuntimeRestoreDrillsCarrier,
): RuntimeRestoreDrillsResponse["entries"] {
  return runtimeRestoreDrills?.entries ?? [];
}

export function runtimeRestoreDrillHasEntries(
  runtimeRestoreDrills?: RuntimeRestoreDrillsCarrier,
): boolean {
  return runtimeRestoreDrillEntries(runtimeRestoreDrills).length > 0;
}

export function runtimeRestoreDrillPreviewEntries(
  runtimeRestoreDrills?: RuntimeRestoreDrillsCarrier,
  limit = 2,
): RuntimeRestoreDrillsResponse["entries"] {
  return runtimeRestoreDrillEntries(runtimeRestoreDrills).slice(0, limit);
}

export function runtimeRestoreDrillStartedCompletedSummary(
  entry: RuntimeRestoreDrillsResponse["entries"][number],
): string {
  return entry.completed_at
    ? `started ${entry.started_at} | completed ${entry.completed_at}`
    : `started ${entry.started_at}`;
}

export function runtimeRestoreDrillStatusLabel(
  entry: RuntimeRestoreDrillsResponse["entries"][number],
): string {
  return `${entry.status} | backup ${entry.backup_id}`;
}

export function runtimeRestoreDrillPreviewCard(
  entry: RuntimeRestoreDrillsResponse["entries"][number],
): RuntimeRestoreDrillPreviewCard {
  const duration = durationLabel(entry.started_at, entry.completed_at);
  return {
    statusLabel: runtimeRestoreDrillStatusLabel(entry),
    timingLine: `${runtimeRestoreDrillStartedCompletedSummary(entry)
      .replace(entry.started_at, dateTimeLabel(entry.started_at))
      .replace(entry.completed_at ?? "", entry.completed_at ? dateTimeLabel(entry.completed_at) : "")}${
        duration ? ` | ${entry.completed_at ? "duration" : "running"} ${duration}` : ""
      }`,
    relativeTimingLine: `${relativeTimeLabel(entry.started_at)}${
      entry.completed_at ? ` | completed ${relativeTimeLabel(entry.completed_at)}` : ""
    }`,
    noteChips: compactSummaryLines(entry.notes_summary),
  };
}

export function runtimeRestoreDrillPreviewCards(
  runtimeRestoreDrills?: RuntimeRestoreDrillsCarrier,
  limit = 2,
): RuntimeRestoreDrillPreviewCard[] {
  return runtimeRestoreDrillPreviewEntries(runtimeRestoreDrills, limit).map((entry) => runtimeRestoreDrillPreviewCard(entry));
}
