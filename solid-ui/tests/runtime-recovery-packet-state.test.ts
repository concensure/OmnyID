import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  runtimeRecoveryPacketBackupArtifactBytes,
  runtimeRecoveryPacketBackupCount,
  runtimeRecoveryPacketBackupEntries,
  runtimeRecoveryPacketBackupLatestCreatedAt,
  runtimeRecoveryPacketBackupPolicy,
  runtimeRecoveryPacketBackupPolicyLabel,
  runtimeRecoveryPacketBackupPolicySupportPostureLabel,
  runtimeRecoveryPacketBackupWorkspaceBytes,
  runtimeRecoveryPacketCurrentVersionLabel,
  runtimeRecoveryPacketDeployment,
  runtimeRecoveryPacketLastCheckedAt,
  runtimeRecoveryPacketLastSnapshotAt,
  runtimeRecoveryPacketLatestVersionLabel,
  runtimeRecoveryPacketRestoreDrillCount,
  runtimeRecoveryPacketRestoreDrillEntries,
  runtimeRecoveryPacketRestoreDrillLatestActivityAt,
  runtimeRecoveryPacketPreviewState,
  runtimeRecoveryPacketUpdateEventCount,
  runtimeRecoveryPacketUpdateEntries,
  runtimeRecoveryPacketUpdateLatestEventAt,
  runtimeRecoveryPacketUpdatePolicy,
  runtimeRecoveryPacketUpdatePolicyLabel,
  runtimeRecoveryPacketUpdatePolicySupportPostureLabel,
} from "../src/lib/runtimeRecoveryPacketState.ts";

test("runtime recovery packet selectors provide stable empty fallbacks", () => {
  const preview = runtimeRecoveryPacketPreviewState(null);
  assert.equal(runtimeRecoveryPacketDeployment(null), null);
  assert.equal(runtimeRecoveryPacketBackupCount(null), 0);
  assert.deepEqual(runtimeRecoveryPacketBackupEntries(null), []);
  assert.equal(runtimeRecoveryPacketBackupLatestCreatedAt(null), null);
  assert.equal(runtimeRecoveryPacketBackupWorkspaceBytes(null), 0);
  assert.equal(runtimeRecoveryPacketBackupArtifactBytes(null), 0);
  assert.equal(runtimeRecoveryPacketBackupPolicy(null), null);
  assert.equal(runtimeRecoveryPacketBackupPolicyLabel(null), "0 day retention | unknown");
  assert.equal(runtimeRecoveryPacketLastSnapshotAt(null), null);
  assert.equal(runtimeRecoveryPacketRestoreDrillCount(null), 0);
  assert.deepEqual(runtimeRecoveryPacketRestoreDrillEntries(null), []);
  assert.equal(runtimeRecoveryPacketRestoreDrillLatestActivityAt(null), null);
  assert.equal(runtimeRecoveryPacketUpdateEventCount(null), 0);
  assert.deepEqual(runtimeRecoveryPacketUpdateEntries(null), []);
  assert.equal(runtimeRecoveryPacketUpdateLatestEventAt(null), null);
  assert.equal(runtimeRecoveryPacketUpdatePolicy(null), null);
  assert.equal(runtimeRecoveryPacketUpdatePolicyLabel(null), "unknown | unknown");
  assert.equal(runtimeRecoveryPacketCurrentVersionLabel(null), "unknown");
  assert.equal(runtimeRecoveryPacketLatestVersionLabel(null), "unknown");
  assert.equal(runtimeRecoveryPacketLastCheckedAt(null), null);
  assert.equal(runtimeRecoveryPacketBackupPolicySupportPostureLabel(null), "disabled by default");
  assert.equal(runtimeRecoveryPacketUpdatePolicySupportPostureLabel(null), "disabled by default");
  assert.equal(preview.title, "Recovery Packet Preview");
  assert.equal(preview.subtitle, `unnamed-packet | generated ${dateTimeLabel(null)} | version unknown`);
  assert.equal(preview.relativeGeneratedAt, relativeTimeLabel(null));
  assert.equal(preview.accountCard.value, "Unknown user");
  assert.equal(preview.metricCards.length, 3);
  assert.equal(preview.deploymentCard, null);
  assert.equal(preview.policyCards.length, 2);
  assert.equal(preview.operationalGuidanceCard, null);
  assert.equal(preview.operationalGuidanceCommand, null);
  assert.deepEqual(preview.recoveryChecklist, []);
  assert.deepEqual(preview.privacyNotes, []);
});

test("runtime recovery packet selectors expose normalized runtime support slices", () => {
  const packet = {
    generated_at: "2026-08-14T09:00:00Z",
    packet_version: "2026.08",
    packet_name: "runtime-packet",
    user: {
      id: "user-1",
      email: "ops@example.com",
      display_name: "Ops User",
      role: "owner",
    },
    runtime_deployment: {
      id: "runtime-1",
      framework: "fastapi",
      status: "healthy",
      workspace_path: "/srv/omnyid",
    },
    recovery_checklist: [],
    privacy_notes: [],
    runtime_backups: {
      policy: {
        retention_days: 14,
        storage_mode: "encrypted",
        support_disabled_by_default: true,
        last_snapshot_at: "2026-08-14T08:00:00Z",
      },
      entries: [
        {
          id: "backup-1",
          created_at: "2026-08-14T07:00:00Z",
          expires_at: "2026-08-28T07:00:00Z",
          storage_mode: "encrypted",
          total_workspace_bytes: 120,
          artifact_size_bytes: 80,
          status: "ready",
          support_disabled_by_default: true,
        },
      ],
    },
    runtime_restore_drills: {
      entries: [
        {
          id: "drill-1",
          backup_id: "backup-1",
          started_at: "2026-08-14T07:30:00Z",
          completed_at: "2026-08-14T07:31:00Z",
          status: "completed",
          notes_summary: null,
        },
      ],
    },
    runtime_updates: {
      current_version: "1.0.0",
      latest_version: "1.1.0",
      update_available: true,
      runtime_status: "healthy",
      last_checked_at: "2026-08-14T08:30:00Z",
      entries: [
        {
          id: "update-1",
          action: "check",
          status: "completed",
          created_at: "2026-08-14T08:30:00Z",
          notes_summary: null,
        },
      ],
      policy: {
        auto_apply: "manual",
        update_channel: "stable",
        support_disabled_by_default: true,
      },
    },
    operational_guidance: {
      status: "no_go",
      summary: "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
      command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      pressure_status: "operational_history_present",
      pressure_total_rows: 19800,
      cleanup_mode: "dry_run",
      generated_at: "2026-08-14T08:45:00Z",
    },
  };
  const preview = runtimeRecoveryPacketPreviewState(packet);

  assert.equal(runtimeRecoveryPacketDeployment(packet)?.id, "runtime-1");
  assert.equal(runtimeRecoveryPacketBackupCount(packet), 1);
  assert.equal(runtimeRecoveryPacketBackupEntries(packet).length, 1);
  assert.equal(runtimeRecoveryPacketBackupLatestCreatedAt(packet), "2026-08-14T07:00:00Z");
  assert.equal(runtimeRecoveryPacketBackupWorkspaceBytes(packet), 120);
  assert.equal(runtimeRecoveryPacketBackupArtifactBytes(packet), 80);
  assert.equal(runtimeRecoveryPacketBackupPolicy(packet)?.retention_days, 14);
  assert.equal(runtimeRecoveryPacketBackupPolicyLabel(packet), "14 day retention | encrypted");
  assert.equal(runtimeRecoveryPacketLastSnapshotAt(packet), "2026-08-14T08:00:00Z");
  assert.equal(runtimeRecoveryPacketRestoreDrillCount(packet), 1);
  assert.equal(runtimeRecoveryPacketRestoreDrillEntries(packet).length, 1);
  assert.equal(runtimeRecoveryPacketRestoreDrillLatestActivityAt(packet), "2026-08-14T07:31:00Z");
  assert.equal(runtimeRecoveryPacketUpdateEventCount(packet), 1);
  assert.equal(runtimeRecoveryPacketUpdateEntries(packet).length, 1);
  assert.equal(runtimeRecoveryPacketUpdateLatestEventAt(packet), "2026-08-14T08:30:00Z");
  assert.equal(runtimeRecoveryPacketUpdatePolicy(packet)?.update_channel, "stable");
  assert.equal(runtimeRecoveryPacketUpdatePolicyLabel(packet), "stable | manual");
  assert.equal(runtimeRecoveryPacketCurrentVersionLabel(packet), "1.0.0");
  assert.equal(runtimeRecoveryPacketLatestVersionLabel(packet), "1.1.0");
  assert.equal(runtimeRecoveryPacketLastCheckedAt(packet), "2026-08-14T08:30:00Z");
  assert.equal(runtimeRecoveryPacketBackupPolicySupportPostureLabel(packet), "disabled by default");
  assert.equal(runtimeRecoveryPacketUpdatePolicySupportPostureLabel(packet), "disabled by default");
  assert.equal(
    preview.subtitle,
    `runtime-packet | generated ${dateTimeLabel(packet.generated_at)} | version 2026.08`,
  );
  assert.equal(preview.relativeGeneratedAt, relativeTimeLabel(packet.generated_at));
  assert.equal(preview.accountCard.value, "Ops User");
  assert.deepEqual(preview.accountCard.lines, ["ops@example.com"]);
  assert.equal(preview.metricCards[0]?.value, "1 snapshots");
  assert.deepEqual(preview.metricCards[0]?.lines, [
    `latest ${dateTimeLabel("2026-08-14T07:00:00Z")}`,
    relativeTimeLabel("2026-08-14T07:00:00Z"),
    "workspace 120 B | artifact 80 B",
  ]);
  assert.equal(preview.deploymentCard?.value, "fastapi | healthy");
  assert.deepEqual(preview.deploymentCard?.lines, [
    "deployment runtime-1",
    "/srv/omnyid",
  ]);
  assert.deepEqual(preview.policyCards[0]?.lines, [
    "14 day retention | encrypted",
    "support posture disabled by default",
    `last snapshot ${relativeTimeLabel("2026-08-14T08:00:00Z")}`,
    `snapshot at ${dateTimeLabel("2026-08-14T08:00:00Z")}`,
  ]);
  assert.deepEqual(preview.policyCards[1]?.lines, [
    "stable | manual",
    "support posture disabled by default",
    `last checked ${relativeTimeLabel("2026-08-14T08:30:00Z")}`,
    `checked at ${dateTimeLabel("2026-08-14T08:30:00Z")}`,
  ]);
  assert.equal(preview.operationalGuidanceCard?.title, "Current operational gate");
  assert.deepEqual(preview.operationalGuidanceCard?.lines, [
    "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
    "pressure operational_history_present | 19,800 rows",
    "cleanup mode dry_run",
    "artifact no_go | artifacts/production-go-no-go-current/production-go-no-go.json",
    `generated ${dateTimeLabel("2026-08-14T08:45:00Z")}`,
  ]);
  assert.equal(
    preview.operationalGuidanceCommand,
    "./scripts/oracle-prune-operational-history.ps1 -Apply",
  );
  assert.deepEqual(preview.recoveryChecklist, []);
  assert.deepEqual(preview.privacyNotes, []);
});
