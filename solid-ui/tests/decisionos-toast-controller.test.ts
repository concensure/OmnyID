import test from "node:test";
import assert from "node:assert/strict";

import {
  createDecisionOsToastController,
  type DecisionOsToastState,
} from "../src/lib/decisionOsToastController.ts";

test("toast controller shows toast and runs timeout callback when timer completes", () => {
  let current: DecisionOsToastState | null = null;
  let scheduled: (() => void) | null = null;
  let timedOut = false;
  const controller = createDecisionOsToastController({
    getToast: () => current,
    setToast: (toast) => {
      current = toast;
    },
    now: () => 123,
    setTimer: (callback) => {
      scheduled = callback;
      return 1 as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {},
  });

  controller.show("Saved.", null, {
    actionLabel: "Undo",
    onTimeout: () => {
      timedOut = true;
    },
    durationMs: 3000,
  });

  assert.equal(current?.key, 123);
  assert.equal(current?.message, "Saved.");
  assert.equal(current?.actionLabel, "Undo");
  assert.ok(scheduled);

  scheduled?.();

  assert.equal(timedOut, true);
  assert.equal(current, null);
});

test("toast controller dismiss clears active toast and timer", () => {
  let current: DecisionOsToastState | null = null;
  let cleared = 0;
  const controller = createDecisionOsToastController({
    getToast: () => current,
    setToast: (toast) => {
      current = toast;
    },
    setTimer: () => 7 as ReturnType<typeof setTimeout>,
    clearTimer: () => {
      cleared += 1;
    },
  });

  controller.show("Dismissed.", null);
  controller.dismiss();

  assert.equal(cleared, 1);
  assert.equal(current, null);
});

test("toast controller replaces earlier timer before showing a new toast", () => {
  let current: DecisionOsToastState | null = null;
  let cleared = 0;
  const controller = createDecisionOsToastController({
    getToast: () => current,
    setToast: (toast) => {
      current = toast;
    },
    now: (() => {
      let value = 10;
      return () => value++;
    })(),
    setTimer: () => ({} as ReturnType<typeof setTimeout>),
    clearTimer: () => {
      cleared += 1;
    },
  });

  controller.show("First", null);
  controller.show("Second", null);

  assert.equal(cleared, 1);
  assert.equal(current?.message, "Second");
  assert.equal(current?.key, 11);
});
