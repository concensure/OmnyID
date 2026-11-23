import assert from "node:assert/strict";
import test from "node:test";

import {
  focusUsageViewRuntimeRemediationQueueForReceipt,
  handleUsageViewOperatorRuntimeRemediationKeyDown,
} from "../src/lib/usageViewOperatorRuntimeRemediationHandlers.ts";

test("focusUsageViewRuntimeRemediationQueueForReceipt applies the derived next filter", () => {
  const calls: string[] = [];
  focusUsageViewRuntimeRemediationQueueForReceipt({
    receipt: { receipt_id: "receipt-1" } as never,
    nextFilterForReceipt: (receipt) => {
      calls.push(`next:${receipt?.receipt_id ?? "none"}`);
      return "completed";
    },
    persistRuntimeRemediationFilter: (value) => calls.push(`persist:${value}`),
  });
  assert.deepEqual(calls, ["next:receipt-1", "persist:completed"]);
});

test("handleUsageViewOperatorRuntimeRemediationKeyDown ignores unmatched shortcuts and dispatches matched ones", () => {
  const ignoredCalls: string[] = [];
  const ignored = handleUsageViewOperatorRuntimeRemediationKeyDown({
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key: "x",
    target: null,
    preventDefault: () => ignoredCalls.push("prevent"),
    featuredReceiptId: null,
    featuredCommand: null,
    featuredDraftReceiptId: null,
    canCompleteFeaturedDraft: false,
    recordShortcutUse: (shortcutId) => ignoredCalls.push(`shortcut:${shortcutId}`),
    issueReceipt: () => ignoredCalls.push("issue"),
    completeReceipt: (receiptId) => ignoredCalls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => ignoredCalls.push("focus"),
    copyOperationalCommand: (command) => ignoredCalls.push(`copy:${command}`),
    setFilter: (filter) => ignoredCalls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => ignoredCalls.push("clear-featured"),
    clearAllDrafts: () => ignoredCalls.push("clear-drafts"),
  });
  assert.equal(ignored, false);
  assert.deepEqual(ignoredCalls, []);

  const matchedCalls: string[] = [];
  const handled = handleUsageViewOperatorRuntimeRemediationKeyDown({
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key: "y",
    target: null,
    preventDefault: () => matchedCalls.push("prevent"),
    featuredReceiptId: "receipt-1",
    featuredCommand: "./cleanup.ps1",
    featuredDraftReceiptId: "receipt-1",
    canCompleteFeaturedDraft: true,
    recordShortcutUse: (shortcutId) => matchedCalls.push(`shortcut:${shortcutId}`),
    issueReceipt: () => matchedCalls.push("issue"),
    completeReceipt: (receiptId) => matchedCalls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => matchedCalls.push("focus"),
    copyOperationalCommand: (command, label) => matchedCalls.push(`copy:${command}:${label}`),
    setFilter: (filter) => matchedCalls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => matchedCalls.push("clear-featured"),
    clearAllDrafts: () => matchedCalls.push("clear-drafts"),
  });
  assert.equal(handled, true);
  assert.deepEqual(matchedCalls, [
    "prevent",
    "shortcut:operator_copy_featured_receipt_command",
    "copy:./cleanup.ps1:operator",
  ]);
});
