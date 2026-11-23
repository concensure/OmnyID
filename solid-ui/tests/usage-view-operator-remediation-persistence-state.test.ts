import assert from "node:assert/strict";
import test from "node:test";

import {
  readUsageViewOperatorRemediationPersistenceAdapters,
  syncUsageViewOperatorRemediationPersistence,
} from "../src/lib/usageViewOperatorRemediationPersistenceState.ts";

test("usage view operator remediation persistence adapters bind local storage saves and setters", () => {
  const calls: string[] = [];
  const adapters = readUsageViewOperatorRemediationPersistenceAdapters({
    operatorRuntimeRemediationUserId: () => "user-1",
    setRuntimeRemediationFilter: (value) => calls.push(`set-filter:${value}`),
    setRuntimeRemediationFeaturedReceiptId: (value) => calls.push(`set-featured:${value}`),
    setRuntimeRemediationOutcomeNotes: (value) => calls.push(`set-outcomes:${Object.keys(value).length}`),
    setRuntimeRemediationProofReferences: (value) => calls.push(`set-proofs:${Object.keys(value).length}`),
  });

  adapters.persistRuntimeRemediationFilter("drafts");
  adapters.persistRuntimeRemediationFeaturedReceiptId(" receipt-1 ");
  adapters.persistRuntimeRemediationOutcomeNotes({ "receipt-1": "done" });
  adapters.persistRuntimeRemediationProofReferences({ "receipt-1": "artifact" });

  assert.deepEqual(calls, [
    "set-filter:drafts",
    "set-featured:receipt-1",
    "set-outcomes:1",
    "set-proofs:1",
  ]);
});

test("syncUsageViewOperatorRemediationPersistence applies only the required persistence and active receipt sync", () => {
  const calls: string[] = [];
  syncUsageViewOperatorRemediationPersistence({
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
      outcomeNotes: { "receipt-1": "verified", stale: "drop" },
      proofReferences: { stale: "drop" },
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
    persistRuntimeRemediationOutcomeNotes: (value) => calls.push(`outcomes:${Object.keys(value).join(",")}`),
    persistRuntimeRemediationProofReferences: (value) => calls.push(`proofs:${Object.keys(value).join(",")}`),
    persistRuntimeRemediationFilter: (value) => calls.push(`filter:${value}`),
    persistRuntimeRemediationFeaturedReceiptId: (value) => calls.push(`featured:${value}`),
    setRuntimeRemediationReceipt: (updater) => {
      const current = {
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
      };
      const next = updater(current);
      calls.push(`receipt:${next?.receipt_id ?? "null"}`);
    },
  });

  assert.deepEqual(calls, [
    "outcomes:receipt-1",
    "proofs:",
    "featured:null",
    "receipt:receipt-1",
  ]);
});
