import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  runtimeBackupManifestCreatedAt,
  runtimeBackupManifestExpiresAt,
  runtimeBackupManifestHeaderLabel,
  runtimeBackupManifestId,
  runtimeBackupManifestLifecycleSummary,
  runtimeBackupManifestReviewState,
  runtimeBackupManifestStorageMode,
} from "../src/lib/runtimeBackupManifestState.ts";

test("runtime backup manifest selectors provide stable fallbacks", () => {
  assert.equal(runtimeBackupManifestId(null), "unknown");
  assert.equal(runtimeBackupManifestStorageMode(null), "unknown");
  assert.equal(runtimeBackupManifestCreatedAt(null), null);
  assert.equal(runtimeBackupManifestExpiresAt(null), null);
  assert.equal(runtimeBackupManifestHeaderLabel(null), "Manifest review | unknown");
  assert.equal(
    runtimeBackupManifestLifecycleSummary(null),
    "unknown | created unknown | expires unknown",
  );
  assert.deepEqual(runtimeBackupManifestReviewState(null), {
    title: "Manifest review | unknown",
    lifecycleLine: `unknown | created ${dateTimeLabel(null)} | expires ${dateTimeLabel(null)}`,
    relativeLifecycleLine: `${relativeTimeLabel(null)} | expires ${relativeTimeLabel(null)}`,
    manifestLines: [],
  });
});

test("runtime backup manifest selectors expose manifest labels consistently", () => {
  const manifest = {
    id: "backup-1",
    storage_mode: "encrypted",
    created_at: "2026-08-14T07:00:00Z",
    expires_at: "2026-08-28T07:00:00Z",
    manifest_json: {},
  };

  assert.equal(runtimeBackupManifestId(manifest), "backup-1");
  assert.equal(runtimeBackupManifestStorageMode(manifest), "encrypted");
  assert.equal(runtimeBackupManifestCreatedAt(manifest), "2026-08-14T07:00:00Z");
  assert.equal(runtimeBackupManifestExpiresAt(manifest), "2026-08-28T07:00:00Z");
  assert.equal(runtimeBackupManifestHeaderLabel(manifest), "Manifest review | backup-1");
  assert.equal(
    runtimeBackupManifestLifecycleSummary(manifest),
    "encrypted | created 2026-08-14T07:00:00Z | expires 2026-08-28T07:00:00Z",
  );
  assert.deepEqual(runtimeBackupManifestReviewState(manifest), {
    title: "Manifest review | backup-1",
    lifecycleLine: `encrypted | created ${dateTimeLabel("2026-08-14T07:00:00Z")} | expires ${dateTimeLabel("2026-08-28T07:00:00Z")}`,
    relativeLifecycleLine: `${relativeTimeLabel("2026-08-14T07:00:00Z")} | expires ${relativeTimeLabel("2026-08-28T07:00:00Z")}`,
    manifestLines: [],
  });
});
