import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingSeatingDraftCards } from "@/lib/weddingSeatingDraftCardState";
import type { WeddingSeatingOptimizationResult } from "@/lib/weddingSeatingOptimizationState";

function draft(tableLabel: string, savedAt: string, hardViolationCount = 0): WeddingSeatingOptimizationResult {
  return {
    assignments: [{
      personId: "guest-1",
      personLabel: "Guest One",
      tableId: tableLabel.toLowerCase().replace(/\s+/g, "-"),
      tableLabel,
      score: 8,
      reasonLabels: ["Good fit"],
    }],
    totalScore: 8,
    hardViolations: Array.from({ length: hardViolationCount }, (_, index) => ({
      type: "table_capacity",
      tableId: "table-1",
      label: `Rule check ${index + 1}`,
    })),
    softSignals: [],
    explanationLabels: ["Draft ready."],
    proactiveIssueLabels: [],
    applyLabel: "Apply seating plan",
    alternativeLabel: "Show alternatives",
    savedAt,
  };
}

test("buildWeddingSeatingDraftCards shows newest draft first as current", () => {
  const cards = buildWeddingSeatingDraftCards([
    draft("Table 1", "2026-09-25T00:00:00.000Z", 1),
    draft("Table 2", "2026-09-26T00:00:00.000Z"),
    draft("Table 1", "2026-09-27T00:00:00.000Z", 1),
  ]);

  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.title, "Current seating draft");
  assert.equal(cards[0]?.isCurrent, true);
  assert.equal(cards[0]?.result.assignments[0]?.tableLabel, "Table 1");
  assert.match(cards[0]?.detailLabel ?? "", /2026/);
  assert.equal(cards[1]?.statusLabel, "Saved");
  assert.equal(cards[1]?.result.assignments[0]?.tableLabel, "Table 2");
});

test("buildWeddingSeatingDraftCards hides archived draft fingerprints", () => {
  const hiddenDraft = draft("Table 1", "2026-09-25T00:00:00.000Z");
  const visibleDraft = draft("Table 2", "2026-09-26T00:00:00.000Z");
  const hiddenFingerprint = "guest-1:table-1";

  const cards = buildWeddingSeatingDraftCards([hiddenDraft, visibleDraft], [hiddenFingerprint]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.result.assignments[0]?.tableLabel, "Table 2");
  assert.equal(cards[0]?.isCurrent, true);
});
