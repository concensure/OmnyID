import test from "node:test";
import assert from "node:assert/strict";

import { parseCostBudgetResponse } from "../src/lib/costBudgetResponseState.ts";

test("parseCostBudgetResponse reads finite positive budget fields", () => {
  assert.deepEqual(
    parseCostBudgetResponse({
      max_cost_usd: 1.25,
      max_api_calls: 50,
      max_llm_tokens: 1000,
      soft_limit_ratio: 0.5,
    }),
    {
      maxCostUSD: 1.25,
      maxAPICalls: 50,
      maxLLMTokens: 1000,
      softLimitRatio: 0.5,
    },
  );
});

test("parseCostBudgetResponse falls back for malformed budget fields", () => {
  assert.deepEqual(
    parseCostBudgetResponse({
      max_cost_usd: -1,
      max_api_calls: Number.POSITIVE_INFINITY,
      max_llm_tokens: "500",
      soft_limit_ratio: 2,
    }),
    {
      maxCostUSD: 0.10,
      maxAPICalls: 20,
      maxLLMTokens: 50_000,
      softLimitRatio: 0.80,
    },
  );
});
