import assert from "node:assert/strict";
import test from "node:test";

import {
  readUsageViewClearUserFilterHandler,
  readUsageViewCloseUserDetailHandler,
  readUsageViewCopyOperatorCommand,
  readUsageViewCopyWorkspaceOperationalCommand,
  readUsageViewFeaturedDraftActionHandler,
  readUsageViewFeaturedReceiptActionHandler,
  readUsageViewFocusFeaturedQueueHandler,
  readUsageViewFocusLatestQueueHandler,
} from "../src/lib/usageViewBindingsState.ts";

test("usage view binding helpers centralize copy and queue focus closures", async () => {
  const copyCalls: string[] = [];
  const copyWorkspace = readUsageViewCopyWorkspaceOperationalCommand({
    billing: {
      plan: "free",
      status: "active",
      checkout_available: true,
      billing_portal_available: false,
      archive_only_enabled: false,
      storage_used_bytes: 0,
      storage_quota_bytes: 0,
      quota_state: "ok",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
      operational_guidance: {
        tone: "info",
        title: "Cleanup",
        detail: "Run cleanup",
        artifact_updated_at: null,
        source: "daemon_heartbeats",
        command: "./cleanup.ps1",
      },
    } as never,
    copyOperationalCommand: async (command, label) => {
      copyCalls.push(`workspace:${command}:${label}`);
    },
  });
  copyWorkspace();

  const copyOperator = readUsageViewCopyOperatorCommand({
    copyOperationalCommand: async (command, label) => {
      copyCalls.push(`operator:${command}:${label}`);
    },
  });
  copyOperator("./cmd");

  const focusCalls: string[] = [];
  readUsageViewFocusFeaturedQueueHandler({
    focusQueueForReceipt: (receipt) => focusCalls.push(`featured:${receipt?.receipt_id ?? "none"}`),
    featuredReceipt: () => ({ receipt_id: "featured-1" } as never),
  })();
  readUsageViewFocusLatestQueueHandler({
    focusQueueForReceipt: (receipt) => focusCalls.push(`latest:${receipt?.receipt_id ?? "none"}`),
    latestReceipt: () => ({ receipt_id: "latest-1" } as never),
  })();

  await Promise.resolve();
  assert.deepEqual(copyCalls, [
    "workspace:./cleanup.ps1:workspace",
    "operator:./cmd:operator",
  ]);
  assert.deepEqual(focusCalls, [
    "featured:featured-1",
    "latest:latest-1",
  ]);
});

test("usage view binding helpers centralize featured, clear, and close actions", () => {
  const receiptCalls: string[] = [];
  const handleReceipt = readUsageViewFeaturedReceiptActionHandler({
    featuredCommand: () => "./cleanup.ps1",
    focusFeaturedQueue: () => receiptCalls.push("focus"),
    copyOperatorCommand: (command) => receiptCalls.push(`copy:${command}`),
    clearFeaturedReceipt: () => receiptCalls.push("clear"),
  });
  handleReceipt("show_queue");
  handleReceipt("copy_command");
  handleReceipt("clear_summary_pin");
  assert.deepEqual(receiptCalls, ["focus", "copy:./cleanup.ps1", "clear"]);

  const draftCalls: string[] = [];
  const handleDraft = readUsageViewFeaturedDraftActionHandler({
    completeReceipt: (receiptId) => draftCalls.push(`complete:${receiptId}`),
    showDrafts: () => draftCalls.push("show"),
    clearDraft: (receiptId) => draftCalls.push(`clear:${receiptId}`),
  });
  handleDraft("complete_from_draft", "receipt-1");
  handleDraft("show_drafts", null);
  handleDraft("clear_local_draft", "receipt-2");
  assert.deepEqual(draftCalls, ["complete:receipt-1", "show", "clear:receipt-2"]);

  const utilityCalls: string[] = [];
  readUsageViewClearUserFilterHandler({
    recordClearShortcut: () => utilityCalls.push("shortcut"),
    clearOperatorQuery: () => utilityCalls.push("clear-query"),
  })();
  readUsageViewCloseUserDetailHandler({
    clearSelectedUser: () => utilityCalls.push("clear-user"),
    clearOperatorActionError: () => utilityCalls.push("clear-error"),
  })();
  assert.deepEqual(utilityCalls, ["shortcut", "clear-query", "clear-user", "clear-error"]);
});
