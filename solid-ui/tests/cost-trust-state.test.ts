import test from "node:test";
import assert from "node:assert/strict";

import { buildCostTrustGuidance } from "../src/lib/costTrustState.ts";

test("buildCostTrustGuidance describes active hosted budget coverage when hosted AI is enabled", () => {
  const guidance = buildCostTrustGuidance({
    hostedBudgetCents: 2500,
    quotaState: "ok",
  });

  assert.match(guidance.coverage[1] ?? "", /current-month hosted LLM usage are tracked here/i);
  assert.equal(guidance.caveats.length, 2);
});

test("buildCostTrustGuidance calls out archive-only performance caveat when quota is exceeded", () => {
  const guidance = buildCostTrustGuidance({
    hostedBudgetCents: 0,
    quotaState: "exceeded",
  });

  assert.match(guidance.coverage[1] ?? "", /once hosted AI is enabled with a monthly budget/i);
  assert.ok(guidance.caveats.some((entry) => /archive-only mode/i.test(entry)));
});

test("buildCostTrustGuidance avoids claiming billing-backed storage coverage when billing is unavailable", () => {
  const guidance = buildCostTrustGuidance({
    billingStatusAvailable: false,
    hostedBudgetCents: 0,
    quotaState: null,
  });

  assert.match(guidance.coverage[0] ?? "", /once billing status is available/i);
  assert.ok(guidance.caveats.some((entry) => /billing-backed storage signals are temporarily unavailable/i.test(entry)));
});
