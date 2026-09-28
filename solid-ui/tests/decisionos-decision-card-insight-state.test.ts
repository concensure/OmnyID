import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsDecisionCardCloseLabel,
  decisionOsDeadlineInsight,
  decisionOsDeadlineInsightTitle,
  decisionOsUrgencyInsightButtonTitle,
  decisionOsUrgencyInsightState,
} from "../src/lib/decisionOsDecisionCardInsightState.ts";

test("decision card insight state derives urgency explainer copy and search label", () => {
  assert.deepEqual(
    decisionOsUrgencyInsightState({
      urgency: "urgent",
      urgencyLabel: "URGENT",
    }),
    {
      heading: "Why URGENT",
      detail: "Hard deadline within 24 h, a waiting blocker, or direct stakeholder watcher pressure.",
      searchTerm: "urgent",
      searchLabel: "Search all urgent items",
    },
  );
});

test("decision card insight state prefers explicit deadline rationale before fallback copy", () => {
  assert.equal(
    decisionOsDeadlineInsight({
      deadline: "Friday EOD",
      impact: "high",
      confidenceReason: "A stakeholder response is blocked on this choice.",
    }),
    "A stakeholder response is blocked on this choice.",
  );

  assert.equal(
    decisionOsDeadlineInsight({
      deadline: "Friday EOD",
      impact: "medium",
    }),
    "Missing this deadline may delay this outcome. Review your options and act before Friday EOD.",
  );
});

test("decision card insight state exposes shared explainer labels", () => {
  assert.equal(
    decisionOsUrgencyInsightButtonTitle(),
    "Click to see why this urgency level was set",
  );
  assert.equal(decisionOsDeadlineInsightTitle(), "Why this deadline matters");
  assert.equal(decisionOsDecisionCardCloseLabel(), "Close");
});
