import test from "node:test";
import assert from "node:assert/strict";

import type { OperatorRuntimeRemediationReceipt } from "../src/lib/api.ts";
import {
  readPrunedRuntimeRemediationDraftState,
  readRuntimeRemediationAllDraftsClearedState,
  readRuntimeRemediationDraftClearedState,
  readRuntimeRemediationDraftUpdate,
  readRuntimeRemediationPostCompletionState,
} from "../src/lib/operatorRuntimeRemediationDraftState.ts";

function receipt(
  receiptId: string,
  overrides: Partial<OperatorRuntimeRemediationReceipt> = {},
): OperatorRuntimeRemediationReceipt {
  return {
    ok: true,
    action: "issue_cleanup_receipt",
    receipt_id: receiptId,
    lifecycle_status: "issued",
    issued_at: "2026-08-28T10:00:00Z",
    execution_mode: "manual_operator_shell",
    approval_required: true,
    summary: receiptId,
    command: "./scripts/oracle-runtime-cleanup-execute.ps1 -Apply",
    source: null,
    guidance_status: null,
    pressure_status: null,
    pressure_total_rows: null,
    cleanup_mode: null,
    artifact_generated_at: null,
    note: null,
    completed_at: null,
    outcome_note: null,
    proof_reference: null,
    ...overrides,
  };
}

test("readPrunedRuntimeRemediationDraftState prunes stale drafts and syncs selection state", () => {
  const openReceipt = receipt("open-1");
  const completedReceipt = receipt("completed-1", {
    lifecycle_status: "completed",
    completed_at: "2026-08-28T12:00:00Z",
  });

  assert.deepEqual(
    readPrunedRuntimeRemediationDraftState({
      entries: [openReceipt, completedReceipt],
      drafts: {
        outcomeNotes: {
          "open-1": "verified",
          "completed-1": "done",
          "missing-1": "stale",
        },
        proofReferences: {
          "open-1": "ticket-22",
          "completed-1": "report-9",
        },
      },
      currentFilter: "drafts",
      featuredReceiptId: "missing-1",
      activeReceipt: receipt("open-1"),
    }),
    {
      outcomeNotes: { "open-1": "verified" },
      proofReferences: { "open-1": "ticket-22" },
      filter: "drafts",
      featuredReceiptId: null,
      syncedActiveReceipt: openReceipt,
    },
  );
});

test("readRuntimeRemediationDraftUpdate rewrites one draft map and preserves draft filter when drafts remain", () => {
  assert.deepEqual(
    readRuntimeRemediationDraftUpdate({
      drafts: {
        outcomeNotes: {},
        proofReferences: {},
      },
      currentFilter: "drafts",
      receiptId: " receipt-1 ",
      value: "verified cleanup",
      field: "outcome",
    }),
    {
      outcomeNotes: { "receipt-1": "verified cleanup" },
      proofReferences: {},
      filter: "drafts",
    },
  );
});

test("readRuntimeRemediationDraftClearedState clears only the targeted receipt and reverts empty draft views to open", () => {
  assert.deepEqual(
    readRuntimeRemediationDraftClearedState({
      drafts: {
        outcomeNotes: { "receipt-1": "verified" },
        proofReferences: { "receipt-1": "ticket-22" },
      },
      currentFilter: "drafts",
      receiptId: "receipt-1",
    }),
    {
      outcomeNotes: {},
      proofReferences: {},
      filter: "open",
    },
  );
});

test("readRuntimeRemediationAllDraftsClearedState returns the canonical empty draft payload", () => {
  assert.deepEqual(
    readRuntimeRemediationAllDraftsClearedState("drafts"),
    {
      outcomeNotes: {},
      proofReferences: {},
      filter: "open",
    },
  );
});

test("readRuntimeRemediationPostCompletionState clears local drafts and flips the filter when the last open receipt closes", () => {
  assert.deepEqual(
    readRuntimeRemediationPostCompletionState({
      drafts: {
        outcomeNotes: {
          "open-1": "verified cleanup",
          "open-2": "other",
        },
        proofReferences: {
          "open-1": "ticket-22",
        },
      },
      currentFilter: "open",
      entries: [
        receipt("open-1"),
        receipt("completed-1", {
          lifecycle_status: "completed",
          completed_at: "2026-08-28T12:00:00Z",
        }),
      ],
      completedReceiptId: "open-1",
    }),
    {
      outcomeNotes: { "open-2": "other" },
      proofReferences: {},
      filter: "completed",
    },
  );
});
