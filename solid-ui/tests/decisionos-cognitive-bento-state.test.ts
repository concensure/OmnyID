import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsBentoDecisionsSuffix,
  decisionOsBentoDoneTodayLabel,
  decisionOsBentoOutcomeRateLabel,
  decisionOsBentoPendingLabel,
  decisionOsBentoPositiveOutcomeSuffix,
  decisionOsBentoQueueLoadLabel,
  decisionOsBentoReclaimedSuffix,
  decisionOsBentoTimeSavedLabel,
  decisionOsBentoToReviewSuffix,
} from "../src/lib/decisionOsCognitiveBentoState.ts";

test("decisionos cognitive bento state exposes stable metric copy", () => {
  assert.equal(decisionOsBentoDoneTodayLabel(), "Done today");
  assert.equal(decisionOsBentoDecisionsSuffix(), "decisions");
  assert.equal(decisionOsBentoTimeSavedLabel(), "Time saved");
  assert.equal(decisionOsBentoReclaimedSuffix(), "reclaimed");
  assert.equal(decisionOsBentoQueueLoadLabel(), "Queue load");
  assert.equal(decisionOsBentoOutcomeRateLabel(), "Outcome rate");
  assert.equal(decisionOsBentoPositiveOutcomeSuffix(), "positive this week");
  assert.equal(decisionOsBentoPendingLabel(), "Pending");
  assert.equal(decisionOsBentoToReviewSuffix(), "to review");
});
