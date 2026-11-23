import assert from "node:assert/strict";
import test from "node:test";

import { readUsageViewOperatorRemediationSyncState } from "../src/lib/usageViewOperatorRemediationSyncState.ts";

test("readUsageViewOperatorRemediationSyncState centralizes prune-and-persist decisions", () => {
  const state = readUsageViewOperatorRemediationSyncState({
    entries: [{
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "open",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: null,
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      approval_status: "not_required",
    }],
    drafts: {
      outcomeNotes: {
        "receipt-1": "verified",
        stale: "remove me",
      },
      proofReferences: {
        stale: "remove me",
      },
    },
    currentFilter: "drafts",
    featuredReceiptId: "stale",
    activeReceipt: {
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "open",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: null,
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      approval_status: "not_required",
    },
  });

  assert.deepEqual(state.outcomeNotes, { "receipt-1": "verified" });
  assert.deepEqual(state.proofReferences, {});
  assert.equal(state.filter, "drafts");
  assert.equal(state.featuredReceiptId, null);
  assert.equal(state.syncedActiveReceipt?.receipt_id, "receipt-1");
  assert.equal(state.shouldPersistOutcomeNotes, true);
  assert.equal(state.shouldPersistProofReferences, true);
  assert.equal(state.shouldPersistFilter, false);
  assert.equal(state.shouldPersistFeaturedReceiptId, true);
});

test("readUsageViewOperatorRemediationSyncState suppresses persistence when nothing changed", () => {
  const state = readUsageViewOperatorRemediationSyncState({
    entries: [{
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "open",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: null,
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      approval_status: "not_required",
    }],
    drafts: {
      outcomeNotes: { "receipt-1": "verified" },
      proofReferences: {},
    },
    currentFilter: "open",
    featuredReceiptId: null,
    activeReceipt: null,
  });

  assert.equal(state.shouldPersistOutcomeNotes, false);
  assert.equal(state.shouldPersistProofReferences, false);
  assert.equal(state.shouldPersistFilter, false);
  assert.equal(state.shouldPersistFeaturedReceiptId, false);
});
