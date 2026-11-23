import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDecisionCardContent, formatWeddingDecisionDate } from "../src/lib/weddingDecisionCardContentState.ts";
import type { FocusDeckItem } from "../src/lib/mobileFocusHomeState.ts";

const transport: FocusDeckItem = {
  id: "task:transport",
  kind: "decision",
  sourceSurface: "tasks",
  title: "Book limousine or wedding transport and pickup schedule",
  recommendedActionLabel: "The saved evidence identifies ranked by hard constraints first, then fit",
  whyNowLabel: "This planning check is backed by the wedding plan and ready to review.",
  dueAt: "2028-09-18T00:00:00Z",
  evidenceLabels: ["Transport budget A$2,000", "Prepared wedding research brief"],
  deferCount: 0,
  returnedFromLater: false,
  external: false,
};

test("transport card asks for the requirement before suggesting a booking", () => {
  const content = buildWeddingDecisionCardContent(transport);
  assert.equal(content.title, "How should your wedding party travel?");
  assert.equal(content.primaryActionLabel, "Confirm who needs transport");
  assert.match(content.support.oneThingToConfirm ?? "", /Who needs a lift/);
  assert.doesNotMatch(JSON.stringify(content), /saved evidence|hard constraints|ready to review/i);
  assert.equal(content.timeSensitivity?.label, "Task due 18 September 2028");
});

test("decision dates are presented for people rather than as raw ISO values", () => {
  assert.equal(formatWeddingDecisionDate("2028-09-18"), "18 September 2028");
  assert.equal(formatWeddingDecisionDate("not-a-date"), null);
});

test("the declared decision contract drives non-transport card question, action and evidence", () => {
  const contractItem: FocusDeckItem = {
    ...transport,
    id: "task:venue-quote",
    title: "Compare venue quote and approve booking",
    recommendedActionLabel: "Venue A currently fits the stated scope",
    decisionContract: {
      decisionType: "quote_choice",
      question: "Which venue quote fits the agreed scope and budget?",
      options: [{ id: "a", label: "Venue A", summary: "A$5,000 minimum spend" }, { id: "open", label: "Keep it open", summary: "Confirm staffing first" }],
      prerequisites: [],
      missingPrerequisite: null,
      answerRecord: "quotation_comparison",
      deadlinePolicy: "hard_deadline",
      deadlineReason: "The saved quote expiry determines priority.",
      primaryActionLabel: "Compare your quotes",
      primaryOutcome: "Save a preference without booking or sending anything.",
      knownFacts: ["Venue A food and beverage minimum: A$5,000"],
      oneThingToConfirm: "Staffing fee",
      evidence: [{ label: "Food and beverage minimum A$5,000", ref: "https://example.com/quote-a", sourceKind: "quote", status: "confirmed" }],
      recommendationSupported: true,
      approvalRequiredBeforeExternalAction: true,
      settled: false,
    },
  };
  const content = buildWeddingDecisionCardContent(contractItem);

  assert.equal(content.title, "Which venue quote fits the agreed scope and budget?");
  assert.equal(content.primaryActionLabel, "Compare your quotes");
  assert.equal(content.recommendationSummary, "Venue A currently fits the stated scope");
  assert.match(content.support.knownFacts[0] ?? "", /A\$5,000/);
  assert.equal(content.support.oneThingToConfirm, "Staffing fee");
});
