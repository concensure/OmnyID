import assert from "node:assert/strict";
import test from "node:test";

import { byteCountLabel, dateTimeLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  runtimeBackupEntryCreatedAtSummary,
  runtimeBackupEntryFileCountLabel,
  runtimeBackupEntryFootprint,
  runtimeBackupPreviewCard,
  runtimeBackupsEntries,
  runtimeBackupsHasEntries,
  runtimeBackupsLastSnapshotAt,
  runtimeBackupsLatestEntry,
  runtimeBackupsLatestEntryId,
  runtimeBackupsPolicy,
  runtimeBackupsPreviewCards,
  runtimeBackupsPreviewEntries,
  runtimeBackupsRetentionDays,
  runtimeBackupsStorageMode,
  runtimeBackupsSupportPostureLabel,
} from "../src/lib/runtimeBackupsState.ts";

test("runtime backup selectors provide stable fallbacks", () => {
  assert.deepEqual(runtimeBackupsEntries(null), []);
  assert.equal(runtimeBackupsPolicy(null), null);
  assert.equal(runtimeBackupsRetentionDays(null), 0);
  assert.equal(runtimeBackupsStorageMode(null), "unknown");
  assert.equal(runtimeBackupsLastSnapshotAt(null), null);
  assert.equal(runtimeBackupsSupportPostureLabel(null), "disabled by default");
  assert.equal(runtimeBackupsLatestEntry(null), null);
  assert.equal(runtimeBackupsLatestEntryId(null), null);
  assert.equal(runtimeBackupsHasEntries(null), false);
  assert.deepEqual(runtimeBackupsPreviewEntries(null), []);
  assert.deepEqual(runtimeBackupsPreviewCards(null), []);
});

test("runtime backup selectors expose policy and latest entry state", () => {
  const runtimeBackups = {
    policy: {
      retention_days: 14,
      storage_mode: "encrypted",
      last_snapshot_at: "2026-08-14T08:00:00Z",
      support_disabled_by_default: false,
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
        expires_at: "2026-08-28T07:00:00Z",
        manifest_summary: null,
      },
    ],
  };

  assert.equal(runtimeBackupsRetentionDays(runtimeBackups), 14);
  assert.equal(runtimeBackupsStorageMode(runtimeBackups), "encrypted");
  assert.equal(runtimeBackupsLastSnapshotAt(runtimeBackups), "2026-08-14T08:00:00Z");
  assert.equal(runtimeBackupsSupportPostureLabel(runtimeBackups), "customized");
  assert.equal(runtimeBackupsLatestEntry(runtimeBackups)?.id, "backup-1");
  assert.equal(runtimeBackupsLatestEntryId(runtimeBackups), "backup-1");
  assert.equal(runtimeBackupsHasEntries(runtimeBackups), true);
  assert.equal(runtimeBackupsPreviewEntries(runtimeBackups).length, 1);
  assert.equal(
    runtimeBackupEntryCreatedAtSummary(runtimeBackups.entries[0]),
    "created 2026-08-14T07:00:00Z | expires 2026-08-28T07:00:00Z",
  );
  assert.equal(runtimeBackupEntryFileCountLabel(runtimeBackups.entries[0]), "12 files");
  assert.deepEqual(runtimeBackupEntryFootprint(runtimeBackups.entries[0]), {
    workspaceBytes: 120,
    artifactBytes: 80,
  });
  assert.deepEqual(
    runtimeBackupPreviewCard(runtimeBackups.entries[0], new Map([
      [
        "backup-1",
        {
          id: "drill-1",
          backup_id: "backup-1",
          started_at: "2026-08-14T07:30:00Z",
          completed_at: "2026-08-14T07:31:00Z",
          status: "completed",
          notes_summary: null,
        },
      ],
    ])),
    {
      title: "scheduled | ready",
      rehearsalLine: `rehearsed ${relativeTimeLabel("2026-08-14T07:31:00Z")} | completed`,
      createdExpiresLine: `created ${dateTimeLabel("2026-08-14T07:00:00Z")} | expires ${dateTimeLabel("2026-08-28T07:00:00Z")}`,
      relativeExpiryLine: `${relativeTimeLabel("2026-08-14T07:00:00Z")} | expires ${relativeTimeLabel("2026-08-28T07:00:00Z")}`,
      fileCountLine: "12 files",
      footprintLine: `workspace ${byteCountLabel(120)} | artifact ${byteCountLabel(80)}`,
      manifestChips: [],
    },
  );
  assert.equal(runtimeBackupsPreviewCards(runtimeBackups).length, 1);
});
