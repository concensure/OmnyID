import assert from "node:assert/strict";
import test from "node:test";

import { runtimeRecoveryMetrics } from "../src/lib/runtimeRecoveryMetricsState.ts";

test("runtime recovery metrics provide stable empty fallbacks", () => {
  const metrics = runtimeRecoveryMetrics(null, null);
  assert.equal(metrics.rehearsedRuntimeBackupCount, 0);
  assert.equal(metrics.unrehearsedRuntimeBackupCount, 0);
  assert.equal(metrics.activeRehearsedRuntimeBackupCount, 0);
  assert.equal(metrics.activeUnrehearsedRuntimeBackupCount, 0);
  assert.equal(metrics.retainedRehearsalCoverageLabel, "no retained snapshots");
  assert.equal(metrics.activeRehearsalCoverageLabel, "no active snapshots");
  assert.equal(metrics.nextRuntimeBackupExpiry, null);
  assert.equal(metrics.expiredRuntimeBackupCount, 0);
  assert.equal(metrics.restoreDrillRecordedCount, 0);
  assert.equal(metrics.restoreDrillInProgressCount, 0);
  assert.equal(metrics.restoreDrillCompletedCount, 0);
  assert.equal(metrics.restoreDrillRehearsedBackupCount, 0);
  assert.equal(metrics.restoreDrillRetainedCoverageLabel, "no retained backups");
  assert.equal(metrics.totalWorkspaceBytes, 0);
  assert.equal(metrics.totalArtifactBytes, 0);
  assert.equal(metrics.latestRestoreDrill, null);
  assert.equal(metrics.latestCompletedRestoreDrill, null);
  assert.equal(metrics.latestRetainedCompletedRestoreDrill, null);
  assert.equal(metrics.latestCompletedRestoreDrillByBackupId.size, 0);
});

test("runtime recovery metrics aggregate backup and drill posture consistently", () => {
  const future = "2026-08-20T07:00:00Z";
  const past = "2026-08-10T07:00:00Z";
  const backups = {
    policy: {
      retention_days: 14,
      storage_mode: "encrypted",
      support_disabled_by_default: true,
    },
    entries: [
      {
        id: "backup-1",
        snapshot_type: "scheduled",
        storage_mode: "encrypted",
        status: "ready",
        file_count: 12,
        total_workspace_bytes: 120,
        artifact_size_bytes: 80,
        created_at: "2026-08-14T07:00:00Z",
        expires_at: future,
        manifest_summary: null,
      },
      {
        id: "backup-2",
        snapshot_type: "manual",
        storage_mode: "encrypted",
        status: "ready",
        file_count: 8,
        total_workspace_bytes: 40,
        artifact_size_bytes: 20,
        created_at: "2026-08-13T07:00:00Z",
        expires_at: past,
        manifest_summary: null,
      },
    ],
  };
  const drills = {
    entries: [
      {
        id: "drill-1",
        backup_id: "backup-1",
        status: "completed",
        started_at: "2026-08-14T07:30:00Z",
        completed_at: "2026-08-14T07:31:00Z",
        notes_summary: null,
      },
      {
        id: "drill-2",
        backup_id: "backup-2",
        status: "running",
        started_at: "2026-08-14T08:00:00Z",
        notes_summary: null,
      },
    ],
  };

  const metrics = runtimeRecoveryMetrics(backups, drills);
  assert.equal(metrics.rehearsedRuntimeBackupCount, 1);
  assert.equal(metrics.unrehearsedRuntimeBackupCount, 1);
  assert.equal(metrics.activeRehearsedRuntimeBackupCount, 1);
  assert.equal(metrics.activeUnrehearsedRuntimeBackupCount, 0);
  assert.equal(metrics.retainedRehearsalCoverageLabel, "1 / 2");
  assert.equal(metrics.activeRehearsalCoverageLabel, "1 / 1");
  assert.equal(metrics.nextRuntimeBackupExpiry, future);
  assert.equal(metrics.expiredRuntimeBackupCount, 1);
  assert.equal(metrics.restoreDrillRecordedCount, 2);
  assert.equal(metrics.restoreDrillInProgressCount, 1);
  assert.equal(metrics.restoreDrillCompletedCount, 1);
  assert.equal(metrics.restoreDrillRehearsedBackupCount, 2);
  assert.equal(metrics.restoreDrillRetainedCoverageLabel, "2 / 2 retained backups");
  assert.equal(metrics.totalWorkspaceBytes, 160);
  assert.equal(metrics.totalArtifactBytes, 100);
  assert.equal(metrics.latestRestoreDrill?.id, "drill-1");
  assert.equal(metrics.latestCompletedRestoreDrill?.id, "drill-1");
  assert.equal(metrics.latestRetainedCompletedRestoreDrill?.id, "drill-1");
  assert.equal(metrics.latestCompletedRestoreDrillByBackupId.get("backup-1")?.id, "drill-1");
});
