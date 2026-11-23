import test from "node:test";
import assert from "node:assert/strict";

import { readOperatorRuntimeRemediationShortcutAction } from "../src/lib/operatorRuntimeRemediationShortcutState.ts";

test("readOperatorRuntimeRemediationShortcutAction resolves issue and filter intents directly", () => {
  assert.deepEqual(
    readOperatorRuntimeRemediationShortcutAction({
      intent: "issue_cleanup_receipt",
      featuredReceiptId: null,
      featuredCommand: null,
      featuredDraftReceiptId: null,
      canCompleteFeaturedDraft: false,
    }),
    {
      shortcutId: "operator_issue_cleanup_receipt",
      kind: "issue_cleanup_receipt",
    },
  );

  assert.deepEqual(
    readOperatorRuntimeRemediationShortcutAction({
      intent: "filter_drafts",
      featuredReceiptId: null,
      featuredCommand: null,
      featuredDraftReceiptId: null,
      canCompleteFeaturedDraft: false,
    }),
    {
      shortcutId: "operator_filter_drafts",
      kind: "set_filter",
      filter: "drafts",
    },
  );
});

test("readOperatorRuntimeRemediationShortcutAction only resolves draft completion when the featured draft is actionable", () => {
  assert.equal(
    readOperatorRuntimeRemediationShortcutAction({
      intent: "complete_featured_receipt_from_draft",
      featuredReceiptId: "receipt-1",
      featuredCommand: "./cleanup.ps1",
      featuredDraftReceiptId: null,
      canCompleteFeaturedDraft: true,
    }),
    null,
  );

  assert.deepEqual(
    readOperatorRuntimeRemediationShortcutAction({
      intent: "complete_featured_receipt_from_draft",
      featuredReceiptId: "receipt-1",
      featuredCommand: "./cleanup.ps1",
      featuredDraftReceiptId: " receipt-1 ",
      canCompleteFeaturedDraft: true,
    }),
    {
      shortcutId: "operator_complete_featured_receipt_from_draft",
      kind: "complete_receipt",
      receiptId: "receipt-1",
    },
  );
});

test("readOperatorRuntimeRemediationShortcutAction suppresses featured actions when their target is missing", () => {
  assert.equal(
    readOperatorRuntimeRemediationShortcutAction({
      intent: "focus_featured_receipt_queue",
      featuredReceiptId: null,
      featuredCommand: "./cleanup.ps1",
      featuredDraftReceiptId: null,
      canCompleteFeaturedDraft: false,
    }),
    null,
  );

  assert.equal(
    readOperatorRuntimeRemediationShortcutAction({
      intent: "copy_featured_receipt_command",
      featuredReceiptId: "receipt-1",
      featuredCommand: "   ",
      featuredDraftReceiptId: null,
      canCompleteFeaturedDraft: false,
    }),
    null,
  );

  assert.deepEqual(
    readOperatorRuntimeRemediationShortcutAction({
      intent: "copy_featured_receipt_command",
      featuredReceiptId: "receipt-1",
      featuredCommand: " ./cleanup.ps1 ",
      featuredDraftReceiptId: null,
      canCompleteFeaturedDraft: false,
    }),
    {
      shortcutId: "operator_copy_featured_receipt_command",
      kind: "copy_featured_command",
      command: "./cleanup.ps1",
    },
  );
});
