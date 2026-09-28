import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsFlagReasoningDiaryEntry,
  decisionOsFlagReasoningFallbackDetail,
  decisionOsOutcomeCheckMenuOptions,
  decisionOsOutcomeCheckRescheduleAt,
  decisionOsOutcomeCheckScheduledTitle,
} from "../src/lib/decisionOsDecisionCardPopoverState.ts";

test("decision card popover state exposes stable outcome check menu options", () => {
  assert.deepEqual(
    decisionOsOutcomeCheckMenuOptions(),
    [
      { label: "Tomorrow", days: 1 },
      { label: "3 days", days: 3 },
      { label: "1 week", days: 7 },
    ],
  );
});

test("decision card popover state derives outcome check reschedule timestamps", () => {
  assert.equal(
    decisionOsOutcomeCheckRescheduleAt(3, new Date("2026-06-29T10:30:00.000Z")),
    "2026-07-02T10:30:00.000Z",
  );
});

test("decision card popover state builds flagged reasoning diary entry payloads", () => {
  const entry = decisionOsFlagReasoningDiaryEntry({
    title: "Reply to supplier",
    confidenceReason: "Signal quality is mixed.",
    confidence: 0.82,
  });

  assert.equal(entry.type, "note");
  assert.equal(entry.icon, "!");
  assert.equal(entry.title, "Flagged reasoning: Reply to supplier");
  assert.equal(entry.detail, "Signal quality is mixed.");
  assert.equal(entry.meta, "82% confidence");
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("decision card popover state exposes shared fallback copy", () => {
  assert.equal(decisionOsFlagReasoningFallbackDetail(), "No reason provided.");
  assert.equal(
    decisionOsOutcomeCheckScheduledTitle("2026-06-29T10:30:00.000Z"),
    new Date("2026-06-29T10:30:00.000Z").toLocaleString().replace(/^/, "Outcome check scheduled for "),
  );
});
