import assert from "node:assert/strict";
import test from "node:test";

import {
  readOperatorQueryApplyState,
  readOperatorQueryClearState,
  readOperatorQueryShortcutState,
  readRuntimeRemediationAllDraftsClearPersistenceState,
  readRuntimeRemediationCompletionPersistenceState,
  readRuntimeRemediationDraftClearPersistenceState,
  readRuntimeRemediationDraftPersistenceState,
} from "../src/lib/usageViewOperatorInteractionState.ts";

test("operator query interaction helpers centralize apply, clear, and shortcut state", () => {
  assert.deepEqual(readOperatorQueryApplyState("  ada  "), { query: "ada" });
  assert.deepEqual(readOperatorQueryClearState(), { queryDraft: "", query: "" });
  assert.deepEqual(
    readOperatorQueryShortcutState({
      shortcutAction: {
        kind: "clear",
        shortcutId: "form_cancel",
      },
    }),
    {
      queryDraft: "",
      query: "",
      shouldClear: true,
    },
  );
  assert.deepEqual(
    readOperatorQueryShortcutState({
      shortcutAction: {
        kind: "submit",
        shortcutId: "form_submit",
        query: "ops",
      },
    }),
    {
      queryDraft: null,
      query: "ops",
      shouldClear: false,
    },
  );
});

test("runtime remediation interaction helpers centralize draft persistence transitions", () => {
  const updated = readRuntimeRemediationDraftPersistenceState({
    drafts: {
      outcomeNotes: {},
      proofReferences: {},
    },
    currentFilter: "open",
    receiptId: "receipt-1",
    value: "verified",
    field: "outcome",
  });
  assert.equal(updated.outcomeNotes["receipt-1"], "verified");
  assert.equal(updated.filter, "open");

  const cleared = readRuntimeRemediationDraftClearPersistenceState({
    drafts: {
      outcomeNotes: { "receipt-1": "verified" },
      proofReferences: { "receipt-1": "proof" },
    },
    currentFilter: "drafts",
    receiptId: "receipt-1",
  });
  assert.deepEqual(cleared.outcomeNotes, {});
  assert.deepEqual(cleared.proofReferences, {});
  assert.equal(cleared.filter, "open");

  const allCleared = readRuntimeRemediationAllDraftsClearPersistenceState("drafts");
  assert.deepEqual(allCleared, {
    outcomeNotes: {},
    proofReferences: {},
    filter: "open",
  });
});

test("runtime remediation completion persistence helper centralizes post-completion cleanup", () => {
  const next = readRuntimeRemediationCompletionPersistenceState({
    drafts: {
      outcomeNotes: { "receipt-open": "done" },
      proofReferences: { "receipt-open": "artifact" },
    },
    currentFilter: "open",
    entries: [{
      receipt_id: "receipt-open",
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
    completedReceiptId: "receipt-open",
  });

  assert.deepEqual(next.outcomeNotes, {});
  assert.deepEqual(next.proofReferences, {});
  assert.equal(next.filter, "completed");
});
