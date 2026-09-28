import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsCompletedProgressLabel,
  decisionOsCompletedTodayTitle,
  decisionOsDismissLowImpactLabel,
  decisionOsScheduleReviewLabel,
  decisionOsTimeSavedLabel,
  decisionOsTimeSavedTitle,
} from "../src/lib/decisionOsProgressState.ts";

test("decisionos progress state formats time saved compactly", () => {
  assert.equal(decisionOsTimeSavedLabel(12), "12m");
  assert.equal(decisionOsTimeSavedLabel(132), "2h 12m");
});

test("decisionos progress state formats completed progress labels", () => {
  assert.equal(decisionOsCompletedProgressLabel(3, 8), "3/8");
  assert.equal(decisionOsCompletedProgressLabel(0, 0), "0/0");
});

test("decisionos progress state exposes footer copy", () => {
  assert.equal(decisionOsDismissLowImpactLabel(), "Dismiss All Low-Impact");
  assert.equal(decisionOsScheduleReviewLabel(), "Schedule 15-min Review");
  assert.equal(decisionOsCompletedTodayTitle(), "Decisions Today");
  assert.equal(decisionOsTimeSavedTitle(), "Time Saved");
});
