import test from "node:test";
import assert from "node:assert/strict";

import {
  OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS,
  readOperatorRuntimeRemediationShortcutCatalogEntry,
  readOperatorRuntimeRemediationShortcutsHint,
  readOperatorRuntimeRemediationShortcutIntent,
  targetIsTypingSurface,
} from "../src/lib/operatorRuntimeRemediationKeyboard.ts";

test("targetIsTypingSurface recognizes input-like elements and contenteditable targets", () => {
  assert.equal(targetIsTypingSurface({ tagName: "INPUT", isContentEditable: false } as HTMLElement), true);
  assert.equal(targetIsTypingSurface({ tagName: "TEXTAREA", isContentEditable: false } as HTMLElement), true);
  assert.equal(targetIsTypingSurface({ tagName: "DIV", isContentEditable: true } as HTMLElement), true);
  assert.equal(targetIsTypingSurface({ tagName: "BUTTON", isContentEditable: false } as HTMLElement), false);
});

test("readOperatorRuntimeRemediationShortcutIntent maps operator shortcuts only for plain alt combinations", () => {
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "r",
      target: { tagName: "BUTTON", isContentEditable: false } as HTMLElement,
    }),
    "issue_cleanup_receipt",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "x",
      target: { tagName: "BUTTON", isContentEditable: false } as HTMLElement,
    }),
    "complete_featured_receipt_from_draft",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "j",
      target: { tagName: "BUTTON", isContentEditable: false } as HTMLElement,
    }),
    "focus_featured_receipt_queue",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "y",
      target: { tagName: "BUTTON", isContentEditable: false } as HTMLElement,
    }),
    "copy_featured_receipt_command",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "O",
      target: { tagName: "DIV", isContentEditable: false } as HTMLElement,
    }),
    "filter_open",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "c",
      target: { tagName: "SPAN", isContentEditable: false } as HTMLElement,
    }),
    "filter_completed",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "a",
      target: { tagName: "P", isContentEditable: false } as HTMLElement,
    }),
    "filter_all",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "t",
      target: { tagName: "P", isContentEditable: false } as HTMLElement,
    }),
    "filter_drafts",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "u",
      target: { tagName: "P", isContentEditable: false } as HTMLElement,
    }),
    "clear_featured_receipt",
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "d",
      target: { tagName: "P", isContentEditable: false } as HTMLElement,
    }),
    "clear_all_local_drafts",
  );
});

test("readOperatorRuntimeRemediationShortcutIntent ignores typing surfaces and modifier collisions", () => {
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "r",
      target: { tagName: "TEXTAREA", isContentEditable: false } as HTMLElement,
    }),
    null,
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: true,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      key: "r",
      target: { tagName: "BUTTON", isContentEditable: false } as HTMLElement,
    }),
    null,
  );
  assert.equal(
    readOperatorRuntimeRemediationShortcutIntent({
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "r",
      target: { tagName: "BUTTON", isContentEditable: false } as HTMLElement,
    }),
    null,
  );
});

test("operator remediation shortcut catalog stays aligned with parser and user-facing metadata", () => {
  assert.equal(OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS.length, 10);
  assert.deepEqual(
    OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS.map((entry) => entry.id),
    [
      "operator_issue_cleanup_receipt",
      "operator_complete_featured_receipt_from_draft",
      "operator_focus_featured_receipt_queue",
      "operator_copy_featured_receipt_command",
      "operator_filter_open",
      "operator_filter_completed",
      "operator_filter_all",
      "operator_filter_drafts",
      "operator_clear_featured_receipt",
      "operator_clear_all_local_drafts",
    ],
  );
  for (const entry of OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS) {
    assert.equal(
      readOperatorRuntimeRemediationShortcutIntent({
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        key: entry.key,
        target: { tagName: "DIV", isContentEditable: false } as HTMLElement,
      }),
      entry.intent,
    );
    assert.deepEqual(readOperatorRuntimeRemediationShortcutCatalogEntry(entry.intent), entry);
  }
});

test("operator remediation shortcut hint is derived from the shared catalog", () => {
  assert.equal(
    readOperatorRuntimeRemediationShortcutsHint(),
    "Alt+R issue cleanup receipt, Alt+X complete featured receipt from draft, Alt+J show featured receipt in its queue, Alt+Y copy featured cleanup command, Alt+O open remediation receipts, Alt+C completed remediation receipts, Alt+A all remediation receipts, Alt+T drafted remediation receipts, Alt+U clear summary pin, Alt+D clear all local drafts",
  );
});
