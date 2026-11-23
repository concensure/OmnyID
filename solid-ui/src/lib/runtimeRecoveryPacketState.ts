// @locs-version: 1.0
import type { RuntimeRecoveryPacketResponse } from "./api";
import { byteCountLabel, dateTimeLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";
import {
  runtimeDeploymentFramework,
  runtimeDeploymentStatus,
  runtimeDeploymentWorkspacePath,
} from "./runtimeDeploymentState";

type RuntimeRecoveryPacketCarrier = RuntimeRecoveryPacketResponse | null | undefined;

export type RuntimeRecoveryPacketPreviewMetricCard = {
  label: string;
  value: string;
  lines: string[];
};

export type RuntimeRecoveryPacketPreviewDetailCard = {
  title: string;
  lines: string[];
};

export type RuntimeRecoveryPacketPreviewState = {
  title: string;
  subtitle: string;
  relativeGeneratedAt: string;
  accountCard: RuntimeRecoveryPacketPreviewMetricCard;
  metricCards: RuntimeRecoveryPacketPreviewMetricCard[];
  deploymentCard: RuntimeRecoveryPacketPreviewMetricCard | null;
  policyCards: RuntimeRecoveryPacketPreviewDetailCard[];
  operationalGuidanceCard: RuntimeRecoveryPacketPreviewDetailCard | null;
  operationalGuidanceCommand: string | null;
  recoveryChecklist: string[];
  privacyNotes: string[];
};

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed) || parsed <= latestMs) continue;
    latest = value;
    latestMs = parsed;
  }
  return latest;
}

function totalNumber(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
    }
  }
  return total;
}

export function runtimeRecoveryPacketDeployment(
  packet?: RuntimeRecoveryPacketCarrier,
): RuntimeRecoveryPacketResponse["runtime_deployment"] | null {
  return packet?.runtime_deployment ?? null;
}

export function runtimeRecoveryPacketBackupEntries(
  packet?: RuntimeRecoveryPacketCarrier,
): RuntimeRecoveryPacketResponse["runtime_backups"]["entries"] {
  return packet?.runtime_backups.entries ?? [];
}

export function runtimeRecoveryPacketBackupPolicy(
  packet?: RuntimeRecoveryPacketCarrier,
): RuntimeRecoveryPacketResponse["runtime_backups"]["policy"] | null {
  return packet?.runtime_backups.policy ?? null;
}

export function runtimeRecoveryPacketBackupCount(
  packet?: RuntimeRecoveryPacketCarrier,
): number {
  return runtimeRecoveryPacketBackupEntries(packet).length;
}

export function runtimeRecoveryPacketBackupLatestCreatedAt(
  packet?: RuntimeRecoveryPacketCarrier,
): string | null {
  return latestTimestamp(runtimeRecoveryPacketBackupEntries(packet).map((entry) => entry.created_at));
}

export function runtimeRecoveryPacketBackupWorkspaceBytes(
  packet?: RuntimeRecoveryPacketCarrier,
): number {
  return totalNumber(runtimeRecoveryPacketBackupEntries(packet).map((entry) => entry.total_workspace_bytes));
}

export function runtimeRecoveryPacketBackupArtifactBytes(
  packet?: RuntimeRecoveryPacketCarrier,
): number {
  return totalNumber(runtimeRecoveryPacketBackupEntries(packet).map((entry) => entry.artifact_size_bytes));
}

export function runtimeRecoveryPacketBackupPolicyLabel(
  packet?: RuntimeRecoveryPacketCarrier,
): string {
  const policy = runtimeRecoveryPacketBackupPolicy(packet);
  return `${policy?.retention_days ?? 0} day retention | ${policy?.storage_mode ?? "unknown"}`;
}

export function runtimeRecoveryPacketLastSnapshotAt(
  packet?: RuntimeRecoveryPacketCarrier,
): string | null {
  return runtimeRecoveryPacketBackupPolicy(packet)?.last_snapshot_at ?? null;
}

export function runtimeRecoveryPacketRestoreDrillEntries(
  packet?: RuntimeRecoveryPacketCarrier,
): RuntimeRecoveryPacketResponse["runtime_restore_drills"]["entries"] {
  return packet?.runtime_restore_drills.entries ?? [];
}

export function runtimeRecoveryPacketRestoreDrillCount(
  packet?: RuntimeRecoveryPacketCarrier,
): number {
  return runtimeRecoveryPacketRestoreDrillEntries(packet).length;
}

export function runtimeRecoveryPacketRestoreDrillLatestActivityAt(
  packet?: RuntimeRecoveryPacketCarrier,
): string | null {
  return latestTimestamp(
    runtimeRecoveryPacketRestoreDrillEntries(packet).map((entry) => entry.completed_at ?? entry.started_at),
  );
}

export function runtimeRecoveryPacketUpdateEntries(
  packet?: RuntimeRecoveryPacketCarrier,
): RuntimeRecoveryPacketResponse["runtime_updates"]["entries"] {
  return packet?.runtime_updates.entries ?? [];
}

export function runtimeRecoveryPacketUpdateEventCount(
  packet?: RuntimeRecoveryPacketCarrier,
): number {
  return runtimeRecoveryPacketUpdateEntries(packet).length;
}

export function runtimeRecoveryPacketUpdateLatestEventAt(
  packet?: RuntimeRecoveryPacketCarrier,
): string | null {
  return latestTimestamp(runtimeRecoveryPacketUpdateEntries(packet).map((entry) => entry.created_at));
}

export function runtimeRecoveryPacketUpdatePolicy(
  packet?: RuntimeRecoveryPacketCarrier,
): RuntimeRecoveryPacketResponse["runtime_updates"]["policy"] | null {
  return packet?.runtime_updates.policy ?? null;
}

export function runtimeRecoveryPacketUpdatePolicyLabel(
  packet?: RuntimeRecoveryPacketCarrier,
): string {
  const policy = runtimeRecoveryPacketUpdatePolicy(packet);
  return `${policy?.update_channel ?? "unknown"} | ${policy?.auto_apply ?? "unknown"}`;
}

export function runtimeRecoveryPacketCurrentVersionLabel(
  packet?: RuntimeRecoveryPacketCarrier,
  fallback = "unknown",
): string {
  return packet?.runtime_updates.current_version ?? fallback;
}

export function runtimeRecoveryPacketLatestVersionLabel(
  packet?: RuntimeRecoveryPacketCarrier,
  fallback = "unknown",
): string {
  return packet?.runtime_updates.latest_version ?? fallback;
}

export function runtimeRecoveryPacketLastCheckedAt(
  packet?: RuntimeRecoveryPacketCarrier,
): string | null {
  return packet?.runtime_updates.last_checked_at ?? null;
}

export function runtimeRecoveryPacketBackupPolicySupportPostureLabel(
  packet?: RuntimeRecoveryPacketCarrier,
): string {
  return runtimeRecoveryPacketBackupPolicy(packet)?.support_disabled_by_default === false
    ? "customized"
    : "disabled by default";
}

export function runtimeRecoveryPacketUpdatePolicySupportPostureLabel(
  packet?: RuntimeRecoveryPacketCarrier,
): string {
  return runtimeRecoveryPacketUpdatePolicy(packet)?.support_disabled_by_default === false
    ? "customized"
    : "disabled by default";
}

export function runtimeRecoveryPacketPreviewState(
  packet?: RuntimeRecoveryPacketCarrier,
): RuntimeRecoveryPacketPreviewState {
  const backupLatestCreatedAt = runtimeRecoveryPacketBackupLatestCreatedAt(packet);
  const restoreDrillLatestActivityAt = runtimeRecoveryPacketRestoreDrillLatestActivityAt(packet);
  const updateLatestEventAt = runtimeRecoveryPacketUpdateLatestEventAt(packet);
  const deployment = runtimeRecoveryPacketDeployment(packet);
  const generatedAt = packet?.generated_at ?? null;
  const operationalGuidance = packet?.operational_guidance ?? null;
  const operationalGuidanceLines = operationalGuidance
    ? [
        operationalGuidance.summary,
        [
          operationalGuidance.pressure_status ? `pressure ${operationalGuidance.pressure_status}` : null,
          typeof operationalGuidance.pressure_total_rows === "number"
            ? `${operationalGuidance.pressure_total_rows.toLocaleString()} rows`
            : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" | "),
        operationalGuidance.cleanup_mode ? `cleanup mode ${operationalGuidance.cleanup_mode}` : "",
        `artifact ${operationalGuidance.status} | ${operationalGuidance.source}`,
        `generated ${dateTimeLabel(operationalGuidance.generated_at ?? null)}`,
      ].filter((value): value is string => Boolean(value))
    : [];

  return {
    title: "Recovery Packet Preview",
    subtitle: `${packet?.packet_name ?? "unnamed-packet"} | generated ${dateTimeLabel(generatedAt)} | version ${packet?.packet_version ?? "unknown"}`,
    relativeGeneratedAt: relativeTimeLabel(generatedAt),
    accountCard: {
      label: "Account",
      value: packet?.user.display_name ?? "Unknown user",
      lines: [packet?.user.email ?? "No email attached"],
    },
    metricCards: [
      {
        label: "Backups",
        value: `${runtimeRecoveryPacketBackupCount(packet)} snapshots`,
        lines: [
          `latest ${dateTimeLabel(backupLatestCreatedAt)}`,
          relativeTimeLabel(backupLatestCreatedAt),
          `workspace ${byteCountLabel(runtimeRecoveryPacketBackupWorkspaceBytes(packet))} | artifact ${byteCountLabel(runtimeRecoveryPacketBackupArtifactBytes(packet))}`,
        ],
      },
      {
        label: "Restore drills",
        value: `${runtimeRecoveryPacketRestoreDrillCount(packet)} drills`,
        lines: [
          `latest ${dateTimeLabel(restoreDrillLatestActivityAt)}`,
          relativeTimeLabel(restoreDrillLatestActivityAt),
        ],
      },
      {
        label: "Update events",
        value: `${runtimeRecoveryPacketUpdateEventCount(packet)} events`,
        lines: [
          `latest ${dateTimeLabel(updateLatestEventAt)}`,
          relativeTimeLabel(updateLatestEventAt),
          `current ${runtimeRecoveryPacketCurrentVersionLabel(packet)} | latest ${runtimeRecoveryPacketLatestVersionLabel(packet)}`,
        ],
      },
    ],
    deploymentCard: deployment
      ? {
          label: "Runtime deployment context",
          value: `${runtimeDeploymentFramework(deployment) ?? "unknown"} | ${runtimeDeploymentStatus(deployment)}`,
          lines: [
            `deployment ${deployment.id ?? "unknown"}`,
            runtimeDeploymentWorkspacePath(deployment) ?? "unknown",
          ],
        }
      : null,
    policyCards: [
      {
        title: "Backup policy snapshot",
        lines: [
          runtimeRecoveryPacketBackupPolicyLabel(packet),
          `support posture ${runtimeRecoveryPacketBackupPolicySupportPostureLabel(packet)}`,
          `last snapshot ${relativeTimeLabel(runtimeRecoveryPacketLastSnapshotAt(packet))}`,
          `snapshot at ${dateTimeLabel(runtimeRecoveryPacketLastSnapshotAt(packet))}`,
        ],
      },
      {
        title: "Update policy snapshot",
        lines: [
          runtimeRecoveryPacketUpdatePolicyLabel(packet),
          `support posture ${runtimeRecoveryPacketUpdatePolicySupportPostureLabel(packet)}`,
          `last checked ${relativeTimeLabel(runtimeRecoveryPacketLastCheckedAt(packet))}`,
          `checked at ${dateTimeLabel(runtimeRecoveryPacketLastCheckedAt(packet))}`,
        ],
      },
    ],
    operationalGuidanceCard: operationalGuidance
      ? {
          title: "Current operational gate",
          lines: operationalGuidanceLines,
        }
      : null,
    operationalGuidanceCommand: operationalGuidance?.command ?? null,
    recoveryChecklist: packet?.recovery_checklist ?? [],
    privacyNotes: packet?.privacy_notes ?? [],
  };
}
