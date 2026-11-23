import test from "node:test";
import assert from "node:assert/strict";

import { autonomySummaryWithFallback } from "../src/lib/autonomyDecisionState.ts";

test("autonomy summary with fallback prefers explicit autonomy decisions", () => {
  const summary = autonomySummaryWithFallback({
    autonomyDecision: {
      autonomy_level: "prepare_silently",
      reason: "Prepared in the background to avoid interruption.",
    },
    requiresApproval: true,
    reason: "This fallback should not be used.",
  });

  assert.equal(summary, "prepare silently: Prepared in the background to avoid interruption.");
});

test("autonomy summary with fallback derives approval language from requiresApproval", () => {
  const summary = autonomySummaryWithFallback({
    requiresApproval: true,
    reason: "This action still needs explicit approval before execution.",
  });

  assert.equal(summary, "Approval boundary: This action still needs explicit approval before execution.");
});

test("autonomy summary with fallback keeps suggest-with-artifact semantics when approval is false", () => {
  const summary = autonomySummaryWithFallback({
    requiresApproval: false,
    reason: "Suggested next step stays reviewable before execution.",
  });

  assert.equal(summary, "suggest with artifact: Suggested next step stays reviewable before execution.");
});

test("autonomy summary with fallback uses autonomy tier when approval state is unavailable", () => {
  const summary = autonomySummaryWithFallback({
    autonomyTier: "prepare_silently",
    reason: "Prepared quietly until it is worth surfacing.",
  });

  assert.equal(summary, "prepare silently: Prepared quietly until it is worth surfacing.");
});

test("autonomy summary with fallback maps legacy action autonomy into the normalized ladder", () => {
  const summary = autonomySummaryWithFallback({
    actionAutonomy: "soft_confirm",
    reason: "This stays inside a reversible execution pathway.",
  });

  assert.equal(summary, "execute reversible: This stays inside a reversible execution pathway.");
});

test("autonomy summary with fallback preserves explicit ladder levels beyond the older reduced set", () => {
  const summary = autonomySummaryWithFallback({
    autonomyDecision: {
      autonomy_level: "draft_silently",
      reason: "Quietly draft the next step before any interruption.",
    },
  });

  assert.equal(summary, "draft silently: Quietly draft the next step before any interruption.");
});
