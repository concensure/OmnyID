// @locs-version: 1.0
import type { RuntimeBackupsResponse, RuntimeRestoreDrillsResponse } from "./api";
import {
  expiredTimestampCount,
  nextFutureTimestampValue,
  totalNumber,
} from "./agentSettingsRuntimeFormat";
import { runtimeBackupsEntries } from "./runtimeBackupsState";
import { runtimeRestoreDrillEntries } from "./runtimeRestoreDrillsState";

export type RuntimeRecoveryMetrics = {
  retainedBackupIds: Set<string>;
  activeRuntimeBackupEntries: RuntimeBackupsResponse["entries"];
  latestRestoreDrill: RuntimeRestoreDrillsResponse["entries"][number] | null;
  latestCompletedRestoreDrill: RuntimeRestoreDrillsResponse["entries"][number] | null;
  latestCompletedRestoreDrillByBackupId: Map<string, RuntimeRestoreDrillsResponse["entries"][number]>;
  latestRetainedCompletedRestoreDrill: RuntimeRestoreDrillsResponse["entries"][number] | null;
  rehearsedRuntimeBackupCount: number;
  unrehearsedRuntimeBackupCount: number;
  activeRehearsedRuntimeBackupCount: number;
  activeUnrehearsedRuntimeBackupCount: number;
  retainedRehearsalCoverageLabel: string;
  activeRehearsalCoverageLabel: string;
  nextRuntimeBackupExpiry: string | null;
  expiredRuntimeBackupCount: number;
  restoreDrillRecordedCount: number;
  restoreDrillInProgressCount: number;
  restoreDrillCompletedCount: number;
  restoreDrillRehearsedBackupCount: number;
  restoreDrillRetainedCoverageLabel: string;
  totalWorkspaceBytes: number;
  totalArtifactBytes: number;
};

function latestCompletedRestoreDrill(
  restoreDrills: RuntimeRestoreDrillsResponse["entries"],
): RuntimeRestoreDrillsResponse["entries"][number] | null {
  let latest: RuntimeRestoreDrillsResponse["entries"][number] | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const entry of restoreDrills) {
    if (!entry.completed_at) continue;
    const parsed = Date.parse(entry.completed_at);
    if (Number.isNaN(parsed) || parsed <= latestMs) continue;
    latestMs = parsed;
    latest = entry;
  }
  return latest;
}

function latestCompletedRestoreDrillByBackupId(
  restoreDrills: RuntimeRestoreDrillsResponse["entries"],
): Map<string, RuntimeRestoreDrillsResponse["entries"][number]> {
  const latestByBackupId = new Map<string, RuntimeRestoreDrillsResponse["entries"][number]>();
  for (const entry of restoreDrills) {
    if (!entry.completed_at) continue;
    const parsed = Date.parse(entry.completed_at);
    if (Number.isNaN(parsed)) continue;
    const current = latestByBackupId.get(entry.backup_id);
    const currentParsed = current?.completed_at ? Date.parse(current.completed_at) : Number.NEGATIVE_INFINITY;
    if (!current || Number.isNaN(currentParsed) || parsed > currentParsed) {
      latestByBackupId.set(entry.backup_id, entry);
    }
  }
  return latestByBackupId;
}

function latestRetainedCompletedRestoreDrill(
  restoreDrills: RuntimeRestoreDrillsResponse["entries"],
  retainedBackupIds: Set<string>,
): RuntimeRestoreDrillsResponse["entries"][number] | null {
  let latest: RuntimeRestoreDrillsResponse["entries"][number] | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const entry of restoreDrills) {
    if (!entry.completed_at || !retainedBackupIds.has(entry.backup_id)) continue;
    const parsed = Date.parse(entry.completed_at);
    if (Number.isNaN(parsed) || parsed <= latestMs) continue;
    latestMs = parsed;
    latest = entry;
  }
  return latest;
}

export function runtimeRecoveryMetrics(
  runtimeBackups?: RuntimeBackupsResponse | null,
  runtimeRestoreDrills?: RuntimeRestoreDrillsResponse | null,
): RuntimeRecoveryMetrics {
  const backupEntries = runtimeBackupsEntries(runtimeBackups);
  const restoreDrillEntries = runtimeRestoreDrillEntries(runtimeRestoreDrills);
  const retainedBackupIds = new Set(backupEntries.map((entry) => entry.id));
  const activeRuntimeBackupEntries = backupEntries.filter((entry) => {
    const expiresAt = Date.parse(entry.expires_at);
    return !Number.isNaN(expiresAt) && expiresAt >= Date.now();
  });
  const latestRestoreDrill = restoreDrillEntries[0] ?? null;
  const latestCompleted = latestCompletedRestoreDrill(restoreDrillEntries);
  const latestCompletedByBackupId = latestCompletedRestoreDrillByBackupId(restoreDrillEntries);
  const latestRetainedCompleted = latestRetainedCompletedRestoreDrill(restoreDrillEntries, retainedBackupIds);
  const rehearsedRuntimeBackupCount = backupEntries.filter((entry) => latestCompletedByBackupId.has(entry.id)).length;
  const unrehearsedRuntimeBackupCount = backupEntries.length - rehearsedRuntimeBackupCount;
  const activeRehearsedRuntimeBackupCount = activeRuntimeBackupEntries.filter((entry) =>
    latestCompletedByBackupId.has(entry.id)
  ).length;
  const activeUnrehearsedRuntimeBackupCount = activeRuntimeBackupEntries.length - activeRehearsedRuntimeBackupCount;
  const restoreDrillRehearsedBackupCount = new Set(restoreDrillEntries.map((entry) => entry.backup_id)).size;
  return {
    retainedBackupIds,
    activeRuntimeBackupEntries,
    latestRestoreDrill,
    latestCompletedRestoreDrill: latestCompleted,
    latestCompletedRestoreDrillByBackupId: latestCompletedByBackupId,
    latestRetainedCompletedRestoreDrill: latestRetainedCompleted,
    rehearsedRuntimeBackupCount,
    unrehearsedRuntimeBackupCount,
    activeRehearsedRuntimeBackupCount,
    activeUnrehearsedRuntimeBackupCount,
    retainedRehearsalCoverageLabel: backupEntries.length === 0
      ? "no retained snapshots"
      : `${rehearsedRuntimeBackupCount} / ${backupEntries.length}`,
    activeRehearsalCoverageLabel: activeRuntimeBackupEntries.length === 0
      ? "no active snapshots"
      : `${activeRehearsedRuntimeBackupCount} / ${activeRuntimeBackupEntries.length}`,
    nextRuntimeBackupExpiry: nextFutureTimestampValue(backupEntries.map((entry) => entry.expires_at)),
    expiredRuntimeBackupCount: expiredTimestampCount(backupEntries.map((entry) => entry.expires_at)),
    restoreDrillRecordedCount: restoreDrillEntries.length,
    restoreDrillInProgressCount: restoreDrillEntries.filter((entry) => !entry.completed_at).length,
    restoreDrillCompletedCount: restoreDrillEntries.filter((entry) => Boolean(entry.completed_at)).length,
    restoreDrillRehearsedBackupCount,
    restoreDrillRetainedCoverageLabel: backupEntries.length === 0
      ? "no retained backups"
      : `${restoreDrillRehearsedBackupCount} / ${backupEntries.length} retained backups`,
    totalWorkspaceBytes: totalNumber(backupEntries.map((entry) => entry.total_workspace_bytes)),
    totalArtifactBytes: totalNumber(backupEntries.map((entry) => entry.artifact_size_bytes)),
  };
}
