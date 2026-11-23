import test from "node:test";
import assert from "node:assert/strict";

import { trustSummaryBlockItems } from "../src/lib/trustSummaryBlockState.ts";

test("trustSummaryBlockItems appends compact confidence wording when needed", () => {
  const items = trustSummaryBlockItems({
    boundedReason: "Prepared topic pack is ready.",
    confidence: "high",
  });

  assert.deepEqual(
    items.map((item) => ({ title: item.title, summary: item.summary })),
    [
      { title: "Why Now", summary: "Prepared topic pack is ready." },
      { title: "Confidence", summary: "high confidence" },
    ],
  );
});

test("trustSummaryBlockItems preserves explicit confidence wording", () => {
  const items = trustSummaryBlockItems({
    provenanceCue: "Traceable to append-only continuity artifacts.",
    confidence: "78% confidence",
  });

  assert.deepEqual(
    items.map((item) => ({ title: item.title, summary: item.summary })),
    [
      { title: "Provenance", summary: "Traceable to append-only continuity artifacts." },
      { title: "Confidence", summary: "78% confidence" },
    ],
  );
});

test("trustSummaryBlockItems includes action-boundary summaries in the shared trust block order", () => {
  const items = trustSummaryBlockItems({
    consequencePreview: "Opening this artifact keeps the decision in review.",
    provenanceCue: "Anchored in thread continuity and append-only audit artifacts.",
    autonomySummary: "This remains reversible until you explicitly promote the next action.",
  });

  assert.deepEqual(
    items.map((item) => ({ title: item.title, summary: item.summary })),
    [
      { title: "Consequence Preview", summary: "Opening this artifact keeps the decision in review." },
      { title: "Provenance", summary: "Anchored in thread continuity and append-only audit artifacts." },
      { title: "Action Boundary", summary: "This remains reversible until you explicitly promote the next action." },
    ],
  );
});
