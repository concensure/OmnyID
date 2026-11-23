import assert from "node:assert/strict";
import test from "node:test";

import { trustSummaryBlockItems } from "../src/lib/trustSummaryBlockState.ts";

test("trustSummaryBlockItems keeps ordinary proactive trust cues grouped in shared blocks", () => {
  const items = trustSummaryBlockItems({
    boundedReason: "Prepared work is ready for review now.",
    selectionReason: "A due reply already has a prepared draft.",
    showSelectionReason: true,
    consequencePreview: "Reviewing this draft stays reversible before any outbound send.",
    provenanceCue: "Built from 3 source refs and 1 prepared object.",
    sourceSummary: "3 sources",
    autonomySummary: "This stays reversible until you approve an outbound send.",
    confidence: "high",
  });

  assert.deepEqual(
    items.map((item) => [item.title, item.summary]),
    [
      ["Why Now", "Prepared work is ready for review now."],
      ["Selection Reason", "A due reply already has a prepared draft."],
      ["Consequence Preview", "Reviewing this draft stays reversible before any outbound send."],
      ["Provenance", "Built from 3 source refs and 1 prepared object."],
      ["Sources", "3 sources"],
      ["Action Boundary", "This stays reversible until you approve an outbound send."],
      ["Confidence", "high confidence"],
    ],
  );
});

test("trustSummaryBlockItems applies shared class overrides to every emitted block", () => {
  const items = trustSummaryBlockItems({
    boundedReason: "Prepared work is ready for review now.",
    sourceSummary: "3 sources",
    blockContainerClass: "ring-1 ring-amber-200/70",
    blockTitleClass: "text-amber-700",
    blockSummaryClass: "text-amber-900/85",
  });

  assert.equal(items.length, 2);
  for (const item of items) {
    assert.match(item.containerClass, /ring-1 ring-amber-200\/70/);
    assert.match(item.titleClass, /text-amber-700/);
    assert.match(item.summaryClass, /text-amber-900\/85/);
  }
});
