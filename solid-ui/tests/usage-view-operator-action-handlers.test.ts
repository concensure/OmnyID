import assert from "node:assert/strict";
import test from "node:test";

import {
  completeUsageViewRuntimeRemediationReceipt,
  triggerUsageViewOperatorAction,
} from "../src/lib/usageViewOperatorActionHandlers.ts";

test("triggerUsageViewOperatorAction short-circuits when another operator action is already running", async () => {
  const calls: string[] = [];
  await triggerUsageViewOperatorAction({
    userId: "user-1",
    action: "revoke_all_sessions",
    busyUserId: "user-2",
    setOperatorActionBusyUserId: (value) => calls.push(`busy:${value}`),
    setOperatorActionError: (value) => calls.push(`error:${value}`),
    setOperatorActionNotice: (value) => calls.push(`notice:${value}`),
    setSelectedOperatorUserId: (value) => calls.push(`selected:${value}`),
    refreshOperatorPanel: () => calls.push("refresh"),
    refetchOperatorUserDetail: () => calls.push("refetch"),
  });
  assert.deepEqual(calls, []);
});

test("completeUsageViewRuntimeRemediationReceipt surfaces validation failures before any busy state changes", async () => {
  const calls: string[] = [];
  await completeUsageViewRuntimeRemediationReceipt({
    receiptId: "receipt-1",
    busyReceiptId: null,
    drafts: {
      outcomeNotes: { "receipt-1": "   " },
      proofReferences: {},
    },
    currentFilter: "open",
    entries: [],
    setRuntimeRemediationCompleteBusyId: (value) => calls.push(`busy:${value}`),
    setOperatorActionError: (value) => calls.push(`error:${value}`),
    setOperatorActionNotice: (value) => calls.push(`notice:${value}`),
    setRuntimeRemediationReceipt: (value) => calls.push(`receipt:${value?.receipt_id ?? "null"}`),
    persistRuntimeRemediationFeaturedReceiptId: (value) => calls.push(`featured:${value}`),
    persistRuntimeRemediationFilter: (value) => calls.push(`filter:${value}`),
    persistRuntimeRemediationOutcomeNotes: (value) => calls.push(`outcomes:${Object.keys(value).length}`),
    persistRuntimeRemediationProofReferences: (value) => calls.push(`proofs:${Object.keys(value).length}`),
    refetchOperatorRuntimeRemediationHistory: () => calls.push("refetch"),
  });
  assert.deepEqual(calls, [
    "error:Outcome note is required before completing a cleanup receipt.",
  ]);
});
