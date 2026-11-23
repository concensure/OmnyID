import test from "node:test";
import assert from "node:assert/strict";

import {
  handleUsageClearUserFilter,
  handleUsageCloseUserDetail,
  handleUsageFeaturedDraftAction,
  handleUsageFeaturedReceiptAction,
  handleUsageOperatorRuntimeRemediationShortcutAction,
} from "../src/lib/usageViewRenderActionState.ts";

test("handleUsageFeaturedReceiptAction routes featured actions to the correct render callback", () => {
  const calls: string[] = [];
  handleUsageFeaturedReceiptAction({
    actionKind: "show_queue",
    featuredCommand: "./cleanup.ps1",
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperatorCommand: (command) => calls.push(`copy:${command}`),
    clearFeaturedReceipt: () => calls.push("clear"),
  });
  handleUsageFeaturedReceiptAction({
    actionKind: "copy_command",
    featuredCommand: "./cleanup.ps1",
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperatorCommand: (command) => calls.push(`copy:${command}`),
    clearFeaturedReceipt: () => calls.push("clear"),
  });
  handleUsageFeaturedReceiptAction({
    actionKind: "clear_summary_pin",
    featuredCommand: "./cleanup.ps1",
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperatorCommand: (command) => calls.push(`copy:${command}`),
    clearFeaturedReceipt: () => calls.push("clear"),
  });

  assert.deepEqual(calls, ["focus", "copy:./cleanup.ps1", "clear"]);
});

test("handleUsageFeaturedDraftAction routes draft actions and ignores missing receipt ids where required", () => {
  const calls: string[] = [];
  handleUsageFeaturedDraftAction({
    actionKind: "complete_from_draft",
    receiptId: "receipt-1",
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    showDrafts: () => calls.push("drafts"),
    clearDraft: (receiptId) => calls.push(`clear:${receiptId}`),
  });
  handleUsageFeaturedDraftAction({
    actionKind: "show_drafts",
    receiptId: null,
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    showDrafts: () => calls.push("drafts"),
    clearDraft: (receiptId) => calls.push(`clear:${receiptId}`),
  });
  handleUsageFeaturedDraftAction({
    actionKind: "clear_local_draft",
    receiptId: "receipt-2",
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    showDrafts: () => calls.push("drafts"),
    clearDraft: (receiptId) => calls.push(`clear:${receiptId}`),
  });
  handleUsageFeaturedDraftAction({
    actionKind: "clear_local_draft",
    receiptId: null,
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    showDrafts: () => calls.push("drafts"),
    clearDraft: (receiptId) => calls.push(`clear:${receiptId}`),
  });

  assert.deepEqual(calls, ["complete:receipt-1", "drafts", "clear:receipt-2"]);
});

test("render-side clear and close helpers preserve required bookkeeping order", () => {
  const calls: string[] = [];
  handleUsageClearUserFilter({
    recordClearShortcut: () => calls.push("shortcut"),
    clearOperatorQuery: () => calls.push("clear-query"),
  });
  handleUsageCloseUserDetail({
    clearSelectedUser: () => calls.push("clear-user"),
    clearOperatorActionError: () => calls.push("clear-error"),
  });

  assert.deepEqual(calls, ["shortcut", "clear-query", "clear-user", "clear-error"]);
});

test("handleUsageOperatorRuntimeRemediationShortcutAction dispatches each shortcut action to the correct callback", () => {
  const calls: string[] = [];
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction: { shortcutId: "issue", kind: "issue_cleanup_receipt" },
    issueReceipt: () => calls.push("issue"),
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperationalCommand: (command, label) => calls.push(`copy:${label}:${command}`),
    setFilter: (filter) => calls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => calls.push("clear-featured"),
    clearAllDrafts: () => calls.push("clear-drafts"),
  });
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction: { shortcutId: "complete", kind: "complete_receipt", receiptId: "receipt-1" },
    issueReceipt: () => calls.push("issue"),
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperationalCommand: (command, label) => calls.push(`copy:${label}:${command}`),
    setFilter: (filter) => calls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => calls.push("clear-featured"),
    clearAllDrafts: () => calls.push("clear-drafts"),
  });
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction: { shortcutId: "focus", kind: "focus_featured_queue" },
    issueReceipt: () => calls.push("issue"),
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperationalCommand: (command, label) => calls.push(`copy:${label}:${command}`),
    setFilter: (filter) => calls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => calls.push("clear-featured"),
    clearAllDrafts: () => calls.push("clear-drafts"),
  });
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction: { shortcutId: "copy", kind: "copy_featured_command", command: "./cleanup.ps1" },
    issueReceipt: () => calls.push("issue"),
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperationalCommand: (command, label) => calls.push(`copy:${label}:${command}`),
    setFilter: (filter) => calls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => calls.push("clear-featured"),
    clearAllDrafts: () => calls.push("clear-drafts"),
  });
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction: { shortcutId: "filter", kind: "set_filter", filter: "drafts" },
    issueReceipt: () => calls.push("issue"),
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperationalCommand: (command, label) => calls.push(`copy:${label}:${command}`),
    setFilter: (filter) => calls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => calls.push("clear-featured"),
    clearAllDrafts: () => calls.push("clear-drafts"),
  });
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction: { shortcutId: "clear-featured", kind: "clear_featured_receipt" },
    issueReceipt: () => calls.push("issue"),
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperationalCommand: (command, label) => calls.push(`copy:${label}:${command}`),
    setFilter: (filter) => calls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => calls.push("clear-featured"),
    clearAllDrafts: () => calls.push("clear-drafts"),
  });
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction: { shortcutId: "clear-drafts", kind: "clear_all_local_drafts" },
    issueReceipt: () => calls.push("issue"),
    completeReceipt: (receiptId) => calls.push(`complete:${receiptId}`),
    focusFeaturedQueue: () => calls.push("focus"),
    copyOperationalCommand: (command, label) => calls.push(`copy:${label}:${command}`),
    setFilter: (filter) => calls.push(`filter:${filter}`),
    clearFeaturedReceipt: () => calls.push("clear-featured"),
    clearAllDrafts: () => calls.push("clear-drafts"),
  });

  assert.deepEqual(calls, [
    "issue",
    "complete:receipt-1",
    "focus",
    "copy:operator:./cleanup.ps1",
    "filter:drafts",
    "clear-featured",
    "clear-drafts",
  ]);
});
