import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsAutoTriageActionChip,
  decisionOsDurationTabPlan,
  decisionOsLowImpactDismissIds,
  decisionOsQueueOverloadMoodPlan,
  decisionOsScheduleReviewActionChip,
} from "../src/lib/decisionOsQueueInteractionState.ts";

test("decisionos queue interaction state resets focus when duration tabs change", () => {
  assert.deepEqual(decisionOsDurationTabPlan("week"), {
    durationView: "week",
    focusedIndex: -1,
  });
});

test("decisionos queue interaction state returns stable overload intents", () => {
  assert.deepEqual(decisionOsQueueOverloadMoodPlan(), { mood: "tired" });
  assert.deepEqual(decisionOsAutoTriageActionChip(), {
    id: "auto-triage",
    label: "Auto-triage queue",
  });
});

test("decisionos queue interaction state derives dismissible low-impact ids", () => {
  assert.deepEqual(
    decisionOsLowImpactDismissIds(
      [
        { id: "a", impact: "low" },
        { id: "b", impact: "high" },
        { id: "c", impact: "low" },
      ],
      new Set(["c"]),
    ),
    ["a"],
  );
});

test("decisionos queue interaction state returns a stable schedule-review action chip", () => {
  assert.deepEqual(decisionOsScheduleReviewActionChip(), {
    id: "schedule-review",
    label: "Schedule 15-min decision review",
  });
});
