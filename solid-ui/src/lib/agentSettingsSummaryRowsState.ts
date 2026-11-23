// @locs-version: 1.0
import type {
  DashboardBootstrap,
  RuntimeBackupsResponse,
  RuntimeRestoreDrillsResponse,
} from "./api";
import {
  byteCountLabel,
  dateTimeLabel,
  durationLabel,
  relativeTimeLabel,
} from "./agentSettingsRuntimeFormat";
import {
  runtimeBackupsLastSnapshotAt,
  runtimeBackupsRetentionDays,
  runtimeBackupsStorageMode,
  runtimeBackupsSupportPostureLabel,
} from "./runtimeBackupsState";
import { runtimeRecoveryMetrics } from "./runtimeRecoveryMetricsState";
import {
  supportAccessBoundaryEndAt,
  supportAccessExpiresAt,
  supportAccessGrantedAt,
  supportAccessRevokedAt,
  supportAccessScope,
  supportAccessStatus,
  supportAccessSupportPostureLabel,
} from "./supportAccessState";

export type AgentSettingsSummaryRow = {
  label: string;
  value: string | number;
};

export function runtimeBackupSummaryRows(
  runtimeBackups?: RuntimeBackupsResponse | null,
  runtimeRestoreDrills?: RuntimeRestoreDrillsResponse | null,
): AgentSettingsSummaryRow[] {
  const metrics = runtimeRecoveryMetrics(runtimeBackups, runtimeRestoreDrills);
  return [
    { label: "Retention", value: `${runtimeBackupsRetentionDays(runtimeBackups)} days` },
    { label: "Storage", value: runtimeBackupsStorageMode(runtimeBackups) },
    {
      label: "Last snapshot",
      value: `${dateTimeLabel(runtimeBackupsLastSnapshotAt(runtimeBackups))} | ${relativeTimeLabel(runtimeBackupsLastSnapshotAt(runtimeBackups))}`,
    },
    { label: "Recorded snapshots", value: metrics.retainedBackupIds.size },
    { label: "Rehearsed snapshots", value: metrics.rehearsedRuntimeBackupCount },
    { label: "Retained rehearsal coverage", value: metrics.retainedRehearsalCoverageLabel },
    {
      label: "Latest retained rehearsal",
      value: metrics.latestRetainedCompletedRestoreDrill?.completed_at
        ? `${dateTimeLabel(metrics.latestRetainedCompletedRestoreDrill.completed_at)} | ${relativeTimeLabel(metrics.latestRetainedCompletedRestoreDrill.completed_at)}`
        : "none",
    },
    { label: "Unrehearsed snapshots", value: metrics.unrehearsedRuntimeBackupCount },
    { label: "Active unrehearsed", value: metrics.activeUnrehearsedRuntimeBackupCount },
    { label: "Active rehearsed", value: metrics.activeRehearsedRuntimeBackupCount },
    { label: "Active rehearsal coverage", value: metrics.activeRehearsalCoverageLabel },
    { label: "Active snapshots", value: metrics.activeRuntimeBackupEntries.length },
    { label: "Workspace footprint", value: byteCountLabel(metrics.totalWorkspaceBytes) },
    { label: "Artifact footprint", value: byteCountLabel(metrics.totalArtifactBytes) },
    {
      label: "Next expiry",
      value: metrics.nextRuntimeBackupExpiry
        ? `${dateTimeLabel(metrics.nextRuntimeBackupExpiry)} | ${relativeTimeLabel(metrics.nextRuntimeBackupExpiry)}`
        : "no upcoming expiry",
    },
    { label: "Expired snapshots", value: metrics.expiredRuntimeBackupCount },
    { label: "Support posture", value: runtimeBackupsSupportPostureLabel(runtimeBackups) },
  ];
}

export function runtimeRestoreDrillSummaryRows(
  runtimeBackups?: RuntimeBackupsResponse | null,
  runtimeRestoreDrills?: RuntimeRestoreDrillsResponse | null,
): AgentSettingsSummaryRow[] {
  const metrics = runtimeRecoveryMetrics(runtimeBackups, runtimeRestoreDrills);
  return [
    { label: "Recorded drills", value: metrics.restoreDrillRecordedCount },
    { label: "In progress", value: metrics.restoreDrillInProgressCount },
    { label: "Completed drills", value: metrics.restoreDrillCompletedCount },
    { label: "Rehearsed backups", value: metrics.restoreDrillRehearsedBackupCount },
    { label: "Coverage", value: metrics.restoreDrillRetainedCoverageLabel },
    {
      label: "Latest completed",
      value: metrics.latestCompletedRestoreDrill?.completed_at
        ? `${dateTimeLabel(metrics.latestCompletedRestoreDrill.completed_at)} | ${relativeTimeLabel(metrics.latestCompletedRestoreDrill.completed_at)}`
        : "none",
    },
    {
      label: "Latest completed outcome",
      value: metrics.latestCompletedRestoreDrill
        ? `${metrics.latestCompletedRestoreDrill.status ?? "unknown"} | backup ${metrics.latestCompletedRestoreDrill.backup_id ?? "unknown"}`
        : "none",
    },
    {
      label: "Latest completed duration",
      value: metrics.latestCompletedRestoreDrill
        ? (durationLabel(
          metrics.latestCompletedRestoreDrill.started_at,
          metrics.latestCompletedRestoreDrill.completed_at,
        ) ?? "unknown")
        : "none",
    },
    {
      label: "Latest drill",
      value: `${metrics.latestRestoreDrill?.status ?? "unknown"} | ${relativeTimeLabel(metrics.latestRestoreDrill?.completed_at ?? metrics.latestRestoreDrill?.started_at)}`,
    },
  ];
}

export function supportAccessSummaryRows(
  supportAccess?: DashboardBootstrap["support_access"] | null,
): AgentSettingsSummaryRow[] {
  return [
    { label: "Access status", value: supportAccessStatus(supportAccess) },
    { label: "Scope", value: supportAccessScope(supportAccess) },
    { label: "Consent posture", value: supportAccessSupportPostureLabel(supportAccess) },
    {
      label: "Granted at",
      value: `${dateTimeLabel(supportAccessGrantedAt(supportAccess))} | ${relativeTimeLabel(supportAccessGrantedAt(supportAccess))}`,
    },
    {
      label: "Expires at",
      value: `${dateTimeLabel(supportAccessExpiresAt(supportAccess))} | ${relativeTimeLabel(supportAccessExpiresAt(supportAccess))}`,
    },
    {
      label: "Consent window",
      value: durationLabel(
        supportAccessGrantedAt(supportAccess),
        supportAccessBoundaryEndAt(supportAccess),
      ) ?? "unknown",
    },
    {
      label: "Boundary timing",
      value: supportAccessRevokedAt(supportAccess)
        ? `ended ${relativeTimeLabel(supportAccessRevokedAt(supportAccess))}`
        : supportAccessExpiresAt(supportAccess)
          ? `ends ${relativeTimeLabel(supportAccessExpiresAt(supportAccess))}`
          : "unknown",
    },
    ...(supportAccessRevokedAt(supportAccess)
      ? [{
          label: "Revoked at",
          value: `${dateTimeLabel(supportAccessRevokedAt(supportAccess))} | ${relativeTimeLabel(supportAccessRevokedAt(supportAccess))}`,
        }]
      : []),
  ];
}
