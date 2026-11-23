import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingComparisonColumns,
  weddingComparisonColumnKind,
} from "../src/lib/weddingComparisonColumnState.ts";

test("weddingComparisonColumnKind recognizes wedding comparison primitives", () => {
  assert.equal(weddingComparisonColumnKind("Venue name"), "option");
  assert.equal(weddingComparisonColumnKind("Quoted total"), "price");
  assert.equal(weddingComparisonColumnKind("Style fit %"), "style_match");
  assert.equal(weddingComparisonColumnKind("Availability on date"), "availability");
  assert.equal(weddingComparisonColumnKind("Suburb"), "location");
  assert.equal(weddingComparisonColumnKind("Package includes"), "included");
  assert.equal(weddingComparisonColumnKind("Risks / caveats"), "risk");
  assert.equal(weddingComparisonColumnKind("Approve next step"), "action");
});

test("buildWeddingComparisonColumns returns user-facing labels and tones", () => {
  const columns = buildWeddingComparisonColumns([
    "Supplier",
    "Estimate",
    "Preference match",
    "Booked?",
    "Warning",
    "Decision",
    "Extra detail",
  ]);

  assert.deepEqual(columns.map((column) => column.label), [
    "Option",
    "Price",
    "Style match",
    "Availability",
    "Watch-outs",
    "Next step",
    "Notes",
  ]);
  assert.deepEqual(columns.map((column) => column.tone), [
    "status",
    "money",
    "match",
    "available",
    "risk",
    "action",
    "status",
  ]);
});
