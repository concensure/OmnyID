import assert from "node:assert/strict";
import test from "node:test";

import {
  persistUsageViewRuntimeRemediationFeaturedReceiptId,
  persistUsageViewRuntimeRemediationFilter,
  persistUsageViewRuntimeRemediationOutcomeNotes,
  persistUsageViewRuntimeRemediationProofReferences,
} from "../src/lib/usageViewOperatorLocalPersistence.ts";

test("usage view operator local persistence normalizes and applies persisted state in stable order", () => {
  const calls: string[] = [];
  persistUsageViewRuntimeRemediationFilter({
    value: "drafts",
    setRuntimeRemediationFilter: (value) => calls.push(`set-filter:${value}`),
    saveRuntimeRemediationFilter: (value) => calls.push(`save-filter:${value}`),
  });
  persistUsageViewRuntimeRemediationFeaturedReceiptId({
    receiptId: "  receipt-1  ",
    setRuntimeRemediationFeaturedReceiptId: (value) => calls.push(`set-featured:${value}`),
    saveRuntimeRemediationFeaturedReceiptId: (value) => calls.push(`save-featured:${value}`),
  });
  persistUsageViewRuntimeRemediationOutcomeNotes({
    value: { "receipt-1": "verified" },
    setRuntimeRemediationOutcomeNotes: (value) => calls.push(`set-outcomes:${Object.keys(value).length}`),
    saveRuntimeRemediationOutcomeNotes: (value) => calls.push(`save-outcomes:${Object.keys(value).length}`),
  });
  persistUsageViewRuntimeRemediationProofReferences({
    value: { "receipt-1": "artifact-1" },
    setRuntimeRemediationProofReferences: (value) => calls.push(`set-proofs:${Object.keys(value).length}`),
    saveRuntimeRemediationProofReferences: (value) => calls.push(`save-proofs:${Object.keys(value).length}`),
  });

  assert.deepEqual(calls, [
    "set-filter:drafts",
    "save-filter:drafts",
    "set-featured:receipt-1",
    "save-featured:receipt-1",
    "set-outcomes:1",
    "save-outcomes:1",
    "set-proofs:1",
    "save-proofs:1",
  ]);
});
