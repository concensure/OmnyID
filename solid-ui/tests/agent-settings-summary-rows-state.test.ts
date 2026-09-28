import assert from "node:assert/strict";
import test from "node:test";

import {
  runtimeBackupSummaryRows,
  runtimeRestoreDrillSummaryRows,
  supportAccessSummaryRows,
} from "../src/lib/agentSettingsSummaryRowsState.ts";
import { relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";

test("runtime backup summary rows provide stable fallbacks", () => {
  const rows = runtimeBackupSummaryRows(null, null);
  assert.equal(rows[0]?.label, "Retention");
  assert.equal(rows[0]?.value, "0 days");
  assert.equal(rows[1]?.value, "unknown");
  assert.equal(rows[3]?.value, 0);
  assert.equal(rows[4]?.value, 0);
  assert.equal(rows.at(-1)?.value, "disabled by default");
});

test("runtime restore drill summary rows aggregate recovery posture", () => {
  const rows = runtimeRestoreDrillSummaryRows(
    {
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
          created_at: "2026-08-13T07:00:00Z",
          expires_at: "2026-08-20T07:00:00Z",
          manifest_summary: null,
        },
      ],
    },
    {
      entries: [
        {
          id: "drill-1",
          backup_id: "backup-1",
          status: "completed",
          started_at: "2026-08-13T08:00:00Z",
          completed_at: "2026-08-13T08:05:00Z",
          notes_summary: null,
        },
      ],
    },
  );

  assert.equal(rows[0]?.label, "Recorded drills");
  assert.equal(rows[0]?.value, 1);
  assert.equal(rows[2]?.value, 1);
  assert.equal(rows[3]?.value, 1);
  assert.equal(rows[4]?.value, "1 / 1 retained backups");
  assert.match(String(rows[6]?.value), /completed \| backup backup-1/);
});

test("support access summary rows expose bounded consent labels", () => {
  const rows = supportAccessSummaryRows({
    status: "granted",
    access_scope: "runtime_recovery",
    reason: "Operator review",
    support_disabled_by_default: false,
    granted_at: "2026-08-20T07:00:00Z",
    expires_at: "2026-08-20T09:00:00Z",
    revoked_at: "2026-08-20T08:00:00Z",
  });

  assert.equal(rows[0]?.value, "granted");
  assert.equal(rows[1]?.value, "runtime_recovery");
  assert.equal(rows[2]?.value, "customized");
  assert.equal(rows[5]?.label, "Consent window");
  assert.equal(rows[6]?.value, `ended ${relativeTimeLabel("2026-08-20T08:00:00Z")}`);
  assert.equal(rows[7]?.label, "Revoked at");
});
