// @locs-version: 1.0
import type { RuntimeBackupsResponse } from "./api";
import { compactSummaryLines } from "./agentSettingsSummaryFormat";
import { byteCountLabel, dateTimeLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";
import type { RuntimeRecoveryMetrics } from "./runtimeRecoveryMetricsState";

type RuntimeBackupsCarrier = RuntimeBackupsResponse | null | undefined;
type RuntimeLatestCompletedRestoreDrillByBackupId = RuntimeRecoveryMetrics["latestCompletedRestoreDrillByBackupId"];

export type RuntimeBackupPreviewCard = {
  title: string;
  rehearsalLine: string;
  createdExpiresLine: string;
  relativeExpiryLine: string;
  fileCountLine: string;
  footprintLine: string;
  manifestChips: string[];
};

export function runtimeBackupsEntries(
  runtimeBackups?: RuntimeBackupsCarrier,
): RuntimeBackupsResponse["entries"] {
  return runtimeBackups?.entries ?? [];
}

export function runtimeBackupsPolicy(
  runtimeBackups?: RuntimeBackupsCarrier,
): RuntimeBackupsResponse["policy"] | null {
  return runtimeBackups?.policy ?? null;
}

export function runtimeBackupsRetentionDays(
  runtimeBackups?: RuntimeBackupsCarrier,
  fallback = 0,
): number {
  return runtimeBackupsPolicy(runtimeBackups)?.retention_days ?? fallback;
}

export function runtimeBackupsStorageMode(
  runtimeBackups?: RuntimeBackupsCarrier,
  fallback = "unknown",
): string {
  return runtimeBackupsPolicy(runtimeBackups)?.storage_mode ?? fallback;
}

export function runtimeBackupsLastSnapshotAt(
  runtimeBackups?: RuntimeBackupsCarrier,
): string | null {
  return runtimeBackupsPolicy(runtimeBackups)?.last_snapshot_at ?? null;
}

export function runtimeBackupsSupportPostureLabel(
  runtimeBackups?: RuntimeBackupsCarrier,
): string {
  return runtimeBackupsPolicy(runtimeBackups)?.support_disabled_by_default === false
    ? "customized"
    : "disabled by default";
}

export function runtimeBackupsLatestEntry(
  runtimeBackups?: RuntimeBackupsCarrier,
): RuntimeBackupsResponse["entries"][number] | null {
  return runtimeBackupsEntries(runtimeBackups)[0] ?? null;
}

export function runtimeBackupsLatestEntryId(
  runtimeBackups?: RuntimeBackupsCarrier,
): string | null {
  return runtimeBackupsLatestEntry(runtimeBackups)?.id ?? null;
}

export function runtimeBackupsHasEntries(
  runtimeBackups?: RuntimeBackupsCarrier,
): boolean {
  return runtimeBackupsEntries(runtimeBackups).length > 0;
}

export function runtimeBackupsPreviewEntries(
  runtimeBackups?: RuntimeBackupsCarrier,
  limit = 2,
): RuntimeBackupsResponse["entries"] {
  return runtimeBackupsEntries(runtimeBackups).slice(0, limit);
}

export function runtimeBackupEntryCreatedAtSummary(
  entry: RuntimeBackupsResponse["entries"][number],
): string {
  return `created ${entry.created_at} | expires ${entry.expires_at}`;
}

export function runtimeBackupEntryFileCountLabel(
  entry: RuntimeBackupsResponse["entries"][number],
): string {
  return `${entry.file_count} files`;
}

export function runtimeBackupEntryFootprint(
  entry: RuntimeBackupsResponse["entries"][number],
): { workspaceBytes: number; artifactBytes: number } {
  return {
    workspaceBytes: entry.total_workspace_bytes,
    artifactBytes: entry.artifact_size_bytes,
  };
}

export function runtimeBackupPreviewCard(
  entry: RuntimeBackupsResponse["entries"][number],
  latestCompletedRestoreDrillByBackupId?: RuntimeLatestCompletedRestoreDrillByBackupId,
): RuntimeBackupPreviewCard {
  const latestDrill = latestCompletedRestoreDrillByBackupId?.get(entry.id);
  const footprint = runtimeBackupEntryFootprint(entry);
  return {
    title: `${entry.snapshot_type} | ${entry.status}`,
    rehearsalLine: latestDrill?.completed_at
      ? `rehearsed ${relativeTimeLabel(latestDrill.completed_at)} | ${latestDrill.status}`
      : "not yet rehearsed",
    createdExpiresLine: `created ${dateTimeLabel(entry.created_at)} | expires ${dateTimeLabel(entry.expires_at)}`,
    relativeExpiryLine: `${relativeTimeLabel(entry.created_at)} | expires ${relativeTimeLabel(entry.expires_at)}`,
    fileCountLine: runtimeBackupEntryFileCountLabel(entry),
    footprintLine: `workspace ${byteCountLabel(footprint.workspaceBytes)} | artifact ${byteCountLabel(footprint.artifactBytes)}`,
    manifestChips: compactSummaryLines(entry.manifest_summary),
  };
}

export function runtimeBackupsPreviewCards(
  runtimeBackups?: RuntimeBackupsCarrier,
  latestCompletedRestoreDrillByBackupId?: RuntimeLatestCompletedRestoreDrillByBackupId,
  limit = 2,
): RuntimeBackupPreviewCard[] {
  return runtimeBackupsPreviewEntries(runtimeBackups, limit).map((entry) =>
    runtimeBackupPreviewCard(entry, latestCompletedRestoreDrillByBackupId)
  );
}
