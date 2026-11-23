import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUsageViewOperatorQuery,
  clearAllUsageViewRuntimeRemediationDrafts,
  clearUsageViewOperatorQuery,
  clearUsageViewRuntimeRemediationDraft,
  handleUsageViewOperatorQueryShortcut,
  updateUsageViewRuntimeRemediationDraft,
} from "../src/lib/usageViewOperatorUiHandlers.ts";

test("usage view operator query handlers centralize apply, clear, and shortcut behavior", () => {
  const applyCalls: string[] = [];
  applyUsageViewOperatorQuery({
    queryDraft: "  ops  ",
    setOperatorQuery: (value) => applyCalls.push(`query:${value}`),
    refreshOperatorPanel: () => applyCalls.push("refresh"),
  });
  assert.deepEqual(applyCalls, ["query:ops", "refresh"]);

  const clearCalls: string[] = [];
  clearUsageViewOperatorQuery({
    setOperatorQueryDraft: (value) => clearCalls.push(`draft:${value}`),
    setOperatorQuery: (value) => clearCalls.push(`query:${value}`),
    refreshOperatorPanel: () => clearCalls.push("refresh"),
  });
  assert.deepEqual(clearCalls, ["draft:", "query:", "refresh"]);

  const submitCalls: string[] = [];
  const handledSubmit = handleUsageViewOperatorQueryShortcut({
    key: "Enter",
    ctrlKey: true,
    metaKey: false,
    loading: false,
    queryDraft: " wal ",
    preventDefault: () => submitCalls.push("prevent"),
    recordShortcutUse: (shortcutId) => submitCalls.push(`shortcut:${shortcutId}`),
    clearOperatorQuery: () => submitCalls.push("clear"),
    setOperatorQuery: (value) => submitCalls.push(`query:${value}`),
    refreshOperatorPanel: () => submitCalls.push("refresh"),
  });
  assert.equal(handledSubmit, true);
  assert.deepEqual(submitCalls, ["prevent", "shortcut:form_submit", "query:wal", "refresh"]);

  const clearShortcutCalls: string[] = [];
  const handledClear = handleUsageViewOperatorQueryShortcut({
    key: "Escape",
    ctrlKey: false,
    metaKey: false,
    loading: false,
    queryDraft: "anything",
    preventDefault: () => clearShortcutCalls.push("prevent"),
    recordShortcutUse: (shortcutId) => clearShortcutCalls.push(`shortcut:${shortcutId}`),
    clearOperatorQuery: () => clearShortcutCalls.push("clear"),
    setOperatorQuery: (value) => clearShortcutCalls.push(`query:${value}`),
    refreshOperatorPanel: () => clearShortcutCalls.push("refresh"),
  });
  assert.equal(handledClear, true);
  assert.deepEqual(clearShortcutCalls, ["prevent", "shortcut:form_cancel", "clear"]);
});

test("usage view remediation draft handlers centralize draft commit behavior", () => {
  const updateCalls: string[] = [];
  updateUsageViewRuntimeRemediationDraft({
    drafts: {
      outcomeNotes: {},
      proofReferences: {},
    },
    currentFilter: "open",
    receiptId: "receipt-1",
    value: "verified",
    field: "outcome",
    persistRuntimeRemediationOutcomeNotes: (value) => updateCalls.push(`outcomes:${Object.keys(value).length}:${value["receipt-1"]}`),
    persistRuntimeRemediationProofReferences: (value) => updateCalls.push(`proofs:${Object.keys(value).length}`),
    persistRuntimeRemediationFilter: (value) => updateCalls.push(`filter:${value}`),
  });
  assert.deepEqual(updateCalls, ["outcomes:1:verified", "proofs:0", "filter:open"]);

  const clearCalls: string[] = [];
  clearUsageViewRuntimeRemediationDraft({
    drafts: {
      outcomeNotes: { "receipt-1": "verified" },
      proofReferences: { "receipt-1": "artifact-1" },
    },
    currentFilter: "drafts",
    receiptId: "receipt-1",
    persistRuntimeRemediationOutcomeNotes: (value) => clearCalls.push(`outcomes:${Object.keys(value).length}`),
    persistRuntimeRemediationProofReferences: (value) => clearCalls.push(`proofs:${Object.keys(value).length}`),
    persistRuntimeRemediationFilter: (value) => clearCalls.push(`filter:${value}`),
  });
  assert.deepEqual(clearCalls, ["outcomes:0", "proofs:0", "filter:open"]);

  const clearAllCalls: string[] = [];
  clearAllUsageViewRuntimeRemediationDrafts({
    currentFilter: "drafts",
    persistRuntimeRemediationOutcomeNotes: (value) => clearAllCalls.push(`outcomes:${Object.keys(value).length}`),
    persistRuntimeRemediationProofReferences: (value) => clearAllCalls.push(`proofs:${Object.keys(value).length}`),
    persistRuntimeRemediationFilter: (value) => clearAllCalls.push(`filter:${value}`),
  });
  assert.deepEqual(clearAllCalls, ["outcomes:0", "proofs:0", "filter:open"]);
});
