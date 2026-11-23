import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsDecisionCardCalendarActionLabel,
  decisionOsDecisionCardImpactSearchLabel,
  decisionOsDecisionCardImpactTooltipTitle,
  decisionOsDecisionCardOpenThreadLabel,
  decisionOsDecisionCardProvenancePrefix,
  decisionOsDecisionCardSourceCount,
  decisionOsDecisionCardSourcePreviewItems,
  decisionOsDecisionCardSourceSearchLabel,
  decisionOsDecisionCardSourcesTooltipTitle,
  decisionOsDecisionCardThreadContextItem,
} from "../src/lib/decisionOsDecisionCardContextPreviewState.ts";

test("decision card context preview state resolves the first thread context item", () => {
  const items = [
    { sourceType: "email", title: "Supplier email" },
    { sourceType: "thread", title: "Q3 Budget thread" },
    { sourceType: "thread", title: "Backup thread" },
  ];

  assert.deepEqual(decisionOsDecisionCardThreadContextItem(items), items[1]);
  assert.equal(decisionOsDecisionCardThreadContextItem([{ sourceType: "email" }]), null);
});

test("decision card context preview state counts and bounds source preview items", () => {
  const items = [
    { icon: "A", title: "Alpha" },
    { icon: "B", title: "Beta" },
    { icon: "C", title: "Gamma" },
    { icon: "D", title: "Delta" },
  ];

  assert.equal(decisionOsDecisionCardSourceCount(items), 4);
  assert.deepEqual(decisionOsDecisionCardSourcePreviewItems(items), items.slice(0, 3));
  assert.deepEqual(decisionOsDecisionCardSourcePreviewItems(items, 2), items.slice(0, 2));
});

test("decision card context preview state builds affordance labels", () => {
  assert.equal(
    decisionOsDecisionCardOpenThreadLabel("Q3 Budget thread"),
    "Open thread: Q3 Budget thread",
  );
  assert.equal(decisionOsDecisionCardOpenThreadLabel(" "), "Open thread: Thread");
  assert.equal(decisionOsDecisionCardCalendarActionLabel(), "View in Calendar");
  assert.equal(decisionOsDecisionCardImpactSearchLabel("high"), "Search high impact");
  assert.equal(decisionOsDecisionCardImpactTooltipTitle(), "Impact level");
  assert.equal(
    decisionOsDecisionCardSourceSearchLabel("Reply to supplier"),
    "Search sources: Reply to supplier",
  );
  assert.equal(decisionOsDecisionCardSourceSearchLabel(" "), "Search sources: decision");
  assert.equal(decisionOsDecisionCardSourcesTooltipTitle(), "Sources");
  assert.equal(decisionOsDecisionCardProvenancePrefix(), "From:");
});
