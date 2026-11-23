import test from "node:test";
import assert from "node:assert/strict";

import {
  formatKnowledgeGraphBacklinkCountLabel,
  formatKnowledgeGraphCardCountLabel,
  formatKnowledgeGraphInsightCountLabel,
  formatKnowledgeGraphMergeSuggestionCountLabel,
  formatKnowledgeGraphRelativeDate,
  formatKnowledgeGraphSimilarityLabel,
  knowledgeGraphBacklinkOverflowLabel,
  knowledgeGraphMergeSuggestionOverflowLabel,
  shouldShowKnowledgeGraphSummaryToggle,
} from "../src/lib/knowledgeGraphPresentation.ts";
import { surfaceShortDateLabel } from "../src/lib/surfaceTimestampPresentation.ts";

const NOW_MS = Date.UTC(2026, 6, 20, 12, 0, 0);

test("formatKnowledgeGraphRelativeDate humanizes sub-hour timestamps", () => {
  const timestamp = new Date(NOW_MS - 30 * 60 * 1000).toISOString();
  assert.equal(formatKnowledgeGraphRelativeDate(timestamp, NOW_MS), "30m ago");
});

test("formatKnowledgeGraphRelativeDate humanizes same-day timestamps by hour", () => {
  const timestamp = new Date(NOW_MS - 5 * 3_600_000).toISOString();
  assert.equal(formatKnowledgeGraphRelativeDate(timestamp, NOW_MS), "5h ago");
});

test("formatKnowledgeGraphRelativeDate humanizes same-week timestamps by day", () => {
  const timestamp = new Date(NOW_MS - 3 * 24 * 3_600_000).toISOString();
  assert.equal(formatKnowledgeGraphRelativeDate(timestamp, NOW_MS), "3d ago");
});

test("formatKnowledgeGraphRelativeDate falls back to a calendar date for older timestamps", () => {
  const timestamp = new Date(Date.UTC(2026, 6, 10, 9, 0, 0)).toISOString();
  assert.equal(
    formatKnowledgeGraphRelativeDate(timestamp, NOW_MS),
    surfaceShortDateLabel(timestamp),
  );
});

test("formatKnowledgeGraphRelativeDate returns an empty string for invalid timestamps", () => {
  assert.equal(formatKnowledgeGraphRelativeDate("not-a-date", NOW_MS), "");
});

test("knowledge graph presentation exposes the summary-toggle threshold", () => {
  assert.equal(shouldShowKnowledgeGraphSummaryToggle("x".repeat(180)), false);
  assert.equal(shouldShowKnowledgeGraphSummaryToggle("x".repeat(181)), true);
});

test("knowledge graph presentation formats backlink overflow labels", () => {
  assert.equal(knowledgeGraphBacklinkOverflowLabel(4), null);
  assert.equal(knowledgeGraphBacklinkOverflowLabel(6), "+2 more");
  assert.equal(knowledgeGraphBacklinkOverflowLabel(7, 3), "+4 more");
});

test("knowledge graph presentation formats similarity badges", () => {
  assert.equal(formatKnowledgeGraphSimilarityLabel(undefined), null);
  assert.equal(formatKnowledgeGraphSimilarityLabel(null), null);
  assert.equal(formatKnowledgeGraphSimilarityLabel(0.876), "88% similar");
});

test("knowledge graph presentation formats insight count badges", () => {
  assert.equal(formatKnowledgeGraphInsightCountLabel(undefined), null);
  assert.equal(formatKnowledgeGraphInsightCountLabel(null), null);
  assert.equal(formatKnowledgeGraphInsightCountLabel(3), "x3");
});

test("knowledge graph presentation formats header stat labels", () => {
  assert.equal(formatKnowledgeGraphCardCountLabel(1), "1 card");
  assert.equal(formatKnowledgeGraphCardCountLabel(4), "4 cards");
  assert.equal(formatKnowledgeGraphBacklinkCountLabel(1), "1 backlink");
  assert.equal(formatKnowledgeGraphBacklinkCountLabel(6), "6 backlinks");
  assert.equal(formatKnowledgeGraphMergeSuggestionCountLabel(1), "1 merge suggestion");
  assert.equal(formatKnowledgeGraphMergeSuggestionCountLabel(3), "3 merge suggestions");
});

test("knowledge graph presentation formats merge suggestion overflow copy", () => {
  assert.equal(knowledgeGraphMergeSuggestionOverflowLabel(5), null);
  assert.equal(
    knowledgeGraphMergeSuggestionOverflowLabel(7),
    "+2 more suggestions - open the Threads view to review all.",
  );
});
