import test from "node:test";
import assert from "node:assert/strict";

import {
  readCostDashboardLlmBudgetDetail,
  readCostDashboardLlmGaugeState,
  readCostDashboardLlmBudgetValue,
} from "../src/lib/costDashboardLlmState.ts";

test("readCostDashboardLlmBudgetValue does not invent a zero budget from partial llm state", () => {
  assert.equal(
    readCostDashboardLlmBudgetValue({
      usage_cents_current_month: 1250,
    }),
    "Budget unavailable",
  );
});

test("readCostDashboardLlmBudgetDetail does not invent zero usage from partial llm state", () => {
  assert.match(
    readCostDashboardLlmBudgetDetail({
      monthly_budget_cents: 5000,
    }),
    /Retry the dashboard to confirm the hosted model budget and current monthly usage\./,
  );
});

test("readCostDashboardLlmBudgetDetail renders confirmed hosted ai usage when both signals are present", () => {
  assert.equal(
    readCostDashboardLlmBudgetDetail({
      monthly_budget_cents: 5000,
      usage_cents_current_month: 1250,
    }),
    "$12.50 used so far this month.",
  );
});

test("readCostDashboardLlmGaugeState does not invent a $0/$0 meter from partial llm state", () => {
  assert.equal(
    readCostDashboardLlmGaugeState({
      monthly_budget_cents: 5000,
    }),
    null,
  );
});

test("readCostDashboardLlmGaugeState returns confirmed hosted ai meter values when both signals are present", () => {
  assert.deepEqual(
    readCostDashboardLlmGaugeState({
      monthly_budget_cents: 5000,
      usage_cents_current_month: 1250,
    }),
    {
      usedUsd: 12.5,
      maxUsd: 50,
    },
  );
});
