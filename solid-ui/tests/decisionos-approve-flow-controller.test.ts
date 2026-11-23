import test from "node:test";
import assert from "node:assert/strict";

import { createDecisionOsApproveFlowController } from "../src/lib/decisionOsApproveFlowController.ts";

test("approve flow starts pending state and confirms trimmed note", () => {
  let note = "";
  let pending = false;
  let approvedNote: string | undefined;
  let scheduled: (() => void) | null = null;
  const controller = createDecisionOsApproveFlowController({
    getNote: () => note,
    setNote: (value) => {
      note = value;
    },
    setPending: (value) => {
      pending = value;
    },
    onApprove: (value) => {
      approvedNote = value;
    },
    onGoalBreakdown: () => {},
    needsGoalBreakdown: () => false,
    setTimer: (callback) => {
      scheduled = callback;
      return 1 as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {},
  });

  controller.start();
  assert.equal(pending, true);
  controller.updateNote("  keep this  ");
  scheduled?.();

  assert.equal(pending, false);
  assert.equal(note, "");
  assert.equal(approvedNote, "keep this");
});

test("approve flow cancels cleanly and clears note state", () => {
  let note = "";
  let pending = false;
  let cleared = 0;
  const controller = createDecisionOsApproveFlowController({
    getNote: () => note,
    setNote: (value) => {
      note = value;
    },
    setPending: (value) => {
      pending = value;
    },
    onApprove: () => {},
    onGoalBreakdown: () => {},
    needsGoalBreakdown: () => false,
    setTimer: () => 2 as ReturnType<typeof setTimeout>,
    clearTimer: () => {
      cleared += 1;
    },
  });

  controller.start();
  controller.updateNote("note");
  controller.cancel();

  assert.equal(cleared >= 1, true);
  assert.equal(pending, false);
  assert.equal(note, "");
});

test("approve flow routes directly to goal breakdown when required", () => {
  let breakdownCalls = 0;
  let approved = false;
  const controller = createDecisionOsApproveFlowController({
    getNote: () => "",
    setNote: () => {},
    setPending: () => {},
    onApprove: () => {
      approved = true;
    },
    onGoalBreakdown: () => {
      breakdownCalls += 1;
    },
    needsGoalBreakdown: () => true,
  });

  controller.start();

  assert.equal(breakdownCalls, 1);
  assert.equal(approved, false);
});
