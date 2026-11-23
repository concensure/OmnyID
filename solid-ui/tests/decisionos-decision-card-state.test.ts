import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsAiRecommendationBadgeLabel,
  decisionOsAiRecommendationDetail,
  decisionOsAiRecommendationTitle,
  decisionOsApproveActionLabel,
  decisionOsApproveConfirmLabel,
  decisionOsUsedLastTimeLabel,
  decisionOsApproveMagicLabel,
  decisionOsApproveNotePlaceholder,
  decisionOsDelegateDecisionLabel,
  decisionOsDismissMagicLabel,
  decisionOsDismissDecisionTitle,
  decisionOsFocusDecisionLabel,
  decisionOsFocusDecisionTitle,
  decisionOsHiddenOptionCount,
  decisionOsMoreOptionsLabel,
  decisionOsQuickWinFilterTitle,
  decisionOsVisibleOptions,
} from "../src/lib/decisionOsDecisionCardState.ts";

test("decision card state bounds visible options unless expanded", () => {
  const options = [
    { id: "a", label: "Approve $45k" },
    { id: "b", label: "Hold for review" },
    { id: "c", label: "Cut scope" },
    { id: "d", label: "Defer to next quarter" },
  ];

  assert.deepEqual(decisionOsVisibleOptions(options, false), options.slice(0, 3));
  assert.deepEqual(decisionOsVisibleOptions(options, true), options);
});

test("decision card state derives hidden option count and label", () => {
  assert.equal(decisionOsHiddenOptionCount(2), 0);
  assert.equal(decisionOsHiddenOptionCount(4), 1);
  assert.equal(decisionOsHiddenOptionCount(6), 3);
  assert.equal(decisionOsMoreOptionsLabel(1), "View 1 more option ->");
  assert.equal(decisionOsMoreOptionsLabel(3), "View 3 more options ->");
  assert.equal(decisionOsMoreOptionsLabel(0), "View 0 more options ->");
});

test("decision card state derives approve action label from breakdown and chosen option", () => {
  const decision = {
    options: [
      { id: "a", label: "Approve $45k" },
      { id: "b", label: "Hold for review" },
    ],
  };

  assert.equal(decisionOsApproveActionLabel(decision, null), "Approve");
  assert.equal(decisionOsApproveActionLabel(decision, "a"), "Approve Approve");
  assert.equal(decisionOsApproveActionLabel(decision, "b"), "Approve Hold");
  assert.equal(
    decisionOsApproveActionLabel(
      {
        ...decision,
        goalBreakdown: { status: "needs_breakdown" },
      },
      "a",
    ),
    "Break Down Goal",
  );
});

test("decision card state derives ai recommendation tooltip detail", () => {
  assert.equal(decisionOsAiRecommendationBadgeLabel(), "AI");
  assert.equal(decisionOsUsedLastTimeLabel(), "Used last time");
  assert.equal(decisionOsAiRecommendationTitle(), "Why AI recommends this");
  assert.equal(
    decisionOsAiRecommendationDetail("Reply drafted for supplier"),
    "Reply drafted for supplier - highest-confidence path based on current context.",
  );
  assert.equal(
    decisionOsAiRecommendationDetail("  "),
    "Highest-confidence path based on context, past decisions, and available data.",
  );
});

test("decision card state exposes shared control copy", () => {
  assert.equal(decisionOsQuickWinFilterTitle(), "Filter queue to quick wins");
  assert.equal(
    decisionOsApproveNotePlaceholder(),
    "Add a note for the record (optional)",
  );
  assert.equal(decisionOsApproveConfirmLabel(), "Confirm");
  assert.equal(decisionOsApproveMagicLabel(true), "Break Down Goal");
  assert.equal(decisionOsApproveMagicLabel(false), "Approve");
  assert.equal(decisionOsDismissMagicLabel(), "Dismiss");
  assert.equal(decisionOsFocusDecisionTitle(), "Focus this decision");
  assert.equal(decisionOsFocusDecisionLabel(), "Focus");
  assert.equal(decisionOsDelegateDecisionLabel(), "Delegate");
  assert.equal(decisionOsDismissDecisionTitle(), "Dismiss");
});
