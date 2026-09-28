import assert from "node:assert/strict";
import test from "node:test";

import {
  runtimeBackupControlsState,
  runtimeRecoveryPacketControlsState,
} from "../src/lib/runtimeControlsState.ts";

test("runtime control selectors provide stable fallbacks", () => {
  assert.deepEqual(runtimeBackupControlsState({
    busy: null,
    manifestBusyId: null,
    latestBackupId: null,
    hasBackupEntries: false,
    drillBusyBackupId: null,
  }), {
    controlsDisabled: false,
    retentionBusy: false,
    snapshotBusy: false,
    snapshotLabel: "Create snapshot",
    manifestReviewDisabled: true,
    manifestReviewLabel: "Review latest manifest",
    drillDisabled: true,
    drillBusy: false,
    drillLabel: "Run drill from latest snapshot",
  });
  assert.deepEqual(runtimeRecoveryPacketControlsState(false), {
    busy: false,
    disabled: false,
    previewLabel: "Preview recovery packet",
    downloadLabel: "Download recovery packet",
  });
});

test("runtime control selectors expose busy and availability state consistently", () => {
  assert.deepEqual(runtimeBackupControlsState({
    busy: "snapshot",
    manifestBusyId: "backup-1",
    latestBackupId: "backup-1",
    hasBackupEntries: true,
    drillBusyBackupId: "backup-1",
  }), {
    controlsDisabled: true,
    retentionBusy: false,
    snapshotBusy: true,
    snapshotLabel: "Creating snapshot...",
    manifestReviewDisabled: true,
    manifestReviewLabel: "Loading manifest...",
    drillDisabled: true,
    drillBusy: true,
    drillLabel: "Running drill...",
  });
  assert.deepEqual(runtimeRecoveryPacketControlsState(true), {
    busy: true,
    disabled: true,
    previewLabel: "Preparing packet...",
    downloadLabel: "Preparing packet...",
  });
});
