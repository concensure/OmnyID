import test from "node:test";
import assert from "node:assert/strict";

import {
  readOperationalCommandCopiedNotice,
  readOperatorQueryShortcutAction,
  readUpgradeRequestCopiedNotice,
  readUsageViewAsyncFailureReceipt,
  readUsageViewClipboardUnavailableFailure,
  shouldBlockBillingInteraction,
} from "../src/lib/usageViewInteractionState.ts";

test("readOperatorQueryShortcutAction resolves clear and submit shortcuts with trimmed query payloads", () => {
  assert.deepEqual(
    readOperatorQueryShortcutAction({
      key: "Escape",
      ctrlKey: false,
      metaKey: false,
      loading: false,
      queryDraft: "ignored",
    }),
    {
      kind: "clear",
      shortcutId: "form_cancel",
    },
  );

  assert.deepEqual(
    readOperatorQueryShortcutAction({
      key: "Enter",
      ctrlKey: true,
      metaKey: false,
      loading: true,
      queryDraft: "  oracle wal  ",
    }),
    {
      kind: "submit",
      shortcutId: "form_submit",
      query: "oracle wal",
    },
  );

  assert.equal(
    readOperatorQueryShortcutAction({
      key: "Enter",
      ctrlKey: false,
      metaKey: false,
      loading: false,
      queryDraft: "oracle wal",
    }),
    null,
  );
});

test("shouldBlockBillingInteraction centralizes mode, busy, and billing-required guards", () => {
  assert.equal(shouldBlockBillingInteraction({
    modeSaving: true,
    busyAction: null,
  }), true);
  assert.equal(shouldBlockBillingInteraction({
    modeSaving: false,
    busyAction: "copy",
  }), true);
  assert.equal(shouldBlockBillingInteraction({
    modeSaving: false,
    busyAction: null,
    requiresBilling: true,
    hasBilling: false,
  }), true);
  assert.equal(shouldBlockBillingInteraction({
    modeSaving: false,
    busyAction: null,
    requiresBilling: true,
    hasBilling: true,
  }), false);
});

test("usage view interaction helpers centralize copy notices and failure receipts", () => {
  assert.equal(readOperationalCommandCopiedNotice("workspace"), "Cleanup command copied.");
  assert.equal(readOperationalCommandCopiedNotice("operator"), "Operator cleanup command copied.");
  assert.equal(readUpgradeRequestCopiedNotice(), "Upgrade request details copied.");

  assert.deepEqual(
    readUsageViewClipboardUnavailableFailure("Copy cleanup command"),
    {
      tone: "warning",
      title: "Copy cleanup command needs browser clipboard access",
      summary: "The browser blocked this billing helper action before it could place the request details on the clipboard.",
      nextStep: "Retry from the same usage view after granting clipboard access or using a browser context that allows copy actions.",
    },
  );

  assert.deepEqual(
    readUsageViewAsyncFailureReceipt(
      "Open billing portal",
      "Could not open the Stripe billing portal.",
      new Error("network down"),
    ),
    {
      tone: "warning",
      title: "Open billing portal failed",
      summary: "The billing request did not complete successfully.",
      nextStep: "Retry from the same usage view. If it keeps failing, check session health and workspace status.",
    },
  );
});
