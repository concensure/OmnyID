import test from "node:test";
import assert from "node:assert/strict";

import {
  threadDashboardTooltipState,
  threadDashboardTrustState,
} from "../src/lib/threadDashboardTrustState.ts";

test("thread dashboard trust state promotes bounded reason when suggested action duplicates it", () => {
  assert.deepEqual(
    threadDashboardTrustState({
      suggestedAction: "Due today.",
      actionReason: "Due today.",
    }),
    {
      boundedReason: "Due today.",
      suggestedActionText: "Due today.",
      actionReasonText: null,
      attentionTitle: "Due today.",
      reasonFilterText: "due today. due today. due today.",
      showBoundedReasonDetail: false,
    },
  );
});

test("thread dashboard trust state preserves distinct action reason detail", () => {
  assert.deepEqual(
    threadDashboardTrustState({
      suggestedAction: "Reply to the customer.",
      actionReason: "Reply today before the contract deadline slips.",
    }),
    {
      boundedReason: "Reply today before the contract deadline slips.",
      suggestedActionText: "Reply to the customer.",
      actionReasonText: null,
      attentionTitle: "Reply today before the contract deadline slips.",
      reasonFilterText:
        "reply to the customer. reply today before the contract deadline slips. reply to the customer. reply today before the contract deadline slips.",
      showBoundedReasonDetail: true,
    },
  );
});

test("thread dashboard trust state falls back to nulls when no trust copy is present", () => {
  assert.deepEqual(
    threadDashboardTrustState({}),
    {
      boundedReason: null,
      suggestedActionText: null,
      actionReasonText: null,
      attentionTitle: null,
      reasonFilterText: "",
      showBoundedReasonDetail: false,
    },
  );
});

test("thread dashboard tooltip state exposes bounded reason detail when it adds meaning beyond the action label", () => {
  assert.deepEqual(
    threadDashboardTooltipState({
      suggestedAction: "Reply to the customer.",
      actionReason: "Reply today before the contract deadline slips.",
      confidence: 0.82,
    }),
    {
      boundedReasonText: "Reply today before the contract deadline slips.",
      selectionReasonText: null,
      confidenceText: "82%",
      showSelectionReason: false,
      showTooltipTrustBlocks: true,
    },
  );
});

test("thread dashboard tooltip state stays hidden when no extra trust detail is available", () => {
  assert.deepEqual(
    threadDashboardTooltipState({
      suggestedAction: "Due today.",
      actionReason: "Due today.",
      confidence: null,
    }),
    {
      boundedReasonText: "Due today.",
      selectionReasonText: null,
      confidenceText: null,
      showSelectionReason: false,
      showTooltipTrustBlocks: false,
    },
  );
});

test("thread dashboard tooltip state stays visible when confidence is the only extra trust detail", () => {
  assert.deepEqual(
    threadDashboardTooltipState({
      suggestedAction: "Due today.",
      actionReason: "Due today.",
      confidence: 0.61,
    }),
    {
      boundedReasonText: "Due today.",
      selectionReasonText: null,
      confidenceText: "61%",
      showSelectionReason: false,
      showTooltipTrustBlocks: true,
    },
  );
});
