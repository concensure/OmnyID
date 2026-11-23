import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsKeyboardIntent } from "../src/lib/decisionOsKeyboardIntentState.ts";

const base = {
  vimNavigationEnabled: false,
  showShortcuts: false,
  hasGoalModal: false,
  hasFocusMode: false,
  hasFocusedDecision: false,
  hasCalendarTarget: false,
  hasGoalBreakdownTarget: false,
};

test("decisionos keyboard intent prioritizes layered escape handling", () => {
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "Escape", showShortcuts: true }),
    { kind: "escape-close-shortcuts" },
  );
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "Escape", hasGoalModal: true }),
    { kind: "escape-close-goal-modal" },
  );
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "Escape", hasFocusMode: true }),
    { kind: "escape-close-focus-mode" },
  );
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "Escape" }),
    { kind: "escape-clear-selection" },
  );
});

test("decisionos keyboard intent gates focused and target-specific actions", () => {
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "a", hasFocusedDecision: true }),
    { kind: "approve-focused" },
  );
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "a" }),
    { kind: "none" },
  );
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "c", hasCalendarTarget: true }),
    { kind: "open-calendar" },
  );
  assert.deepEqual(
    decisionOsKeyboardIntent({ ...base, key: "g", hasGoalBreakdownTarget: true }),
    { kind: "open-goal-breakdown" },
  );
});

test("decisionos keyboard intent maps navigation, duration, and toggle keys", () => {
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "j" }), { kind: "none" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "k" }), { kind: "none" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "j", vimNavigationEnabled: true }), { kind: "focus-next" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "k", vimNavigationEnabled: true }), { kind: "focus-prev" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "d" }), { kind: "set-duration", value: "day" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "y" }), { kind: "set-duration", value: "year" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "f" }), { kind: "toggle-focus-mode" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "p" }), { kind: "toggle-pin-context" });
  assert.deepEqual(decisionOsKeyboardIntent({ ...base, key: "?" }), { kind: "toggle-shortcuts" });
});
