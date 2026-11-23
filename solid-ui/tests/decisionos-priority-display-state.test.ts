import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsDurationScopeSearchLabel,
  decisionOsImpactIcon,
  decisionOsImpactLabel,
  decisionOsUrgencyStyle,
} from "../src/lib/decisionOsPriorityDisplayState.ts";

test("decisionos priority display state maps urgency styles", () => {
  assert.deepEqual(decisionOsUrgencyStyle("urgent"), {
    badge: "bg-red-100 text-red-700 border-red-200",
    border: "border-red-300/50",
    label: "URGENT",
  });
  assert.equal(decisionOsUrgencyStyle("medium").label, "MEDIUM");
});

test("decisionos priority display state maps impact icons and labels", () => {
  assert.equal(decisionOsImpactIcon("high"), "💥");
  assert.equal(decisionOsImpactIcon("medium"), "⚡");
  assert.equal(decisionOsImpactLabel("low"), "Low impact");
  assert.equal(decisionOsDurationScopeSearchLabel("week"), "View all week items");
});
