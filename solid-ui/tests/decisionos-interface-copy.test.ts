import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsShortcutsCloseAriaLabel,
  decisionOsDurationScopeExplanation,
  decisionOsImpactExplanation,
  decisionOsShortcuts,
  decisionOsShortcutsTitle,
  decisionOsShortcutsTypingHint,
  decisionOsUrgencyExplanation,
} from "../src/lib/decisionOsInterfaceCopy.ts";

test("decisionos interface copy exposes stable urgency, impact, and duration explanations", () => {
  assert.match(decisionOsUrgencyExplanation("urgent"), /deadline within 24 h/i);
  assert.match(decisionOsImpactExplanation("high"), /primary OKR/i);
  assert.match(decisionOsDurationScopeExplanation("month"), /weekly cadence/i);
});

test("decisionos interface copy exposes keyboard shortcuts including recent additions", () => {
  const shortcuts = decisionOsShortcuts();
  assert.ok(shortcuts.some((shortcut) => shortcut.key === "p" && /context panel/i.test(shortcut.desc)));
  assert.ok(shortcuts.some((shortcut) => shortcut.key === "f" && /quick-wins/i.test(shortcut.desc)));
  assert.equal(shortcuts.find((shortcut) => shortcut.key === "x")?.desc, "Dismiss focused decision");
});

test("decisionos interface copy exposes shortcuts modal copy", () => {
  assert.equal(decisionOsShortcutsTitle(), "Keyboard Shortcuts");
  assert.equal(decisionOsShortcutsCloseAriaLabel(), "Close shortcuts panel");
  assert.equal(decisionOsShortcutsTypingHint(), "Shortcuts are inactive when typing in a field");
});
