import test from "node:test";
import assert from "node:assert/strict";

import {
  readCostDashboardApiCallsGaugeState,
  readCostDashboardRunCostGaugeState,
  readCostDashboardTokenGaugeState,
} from "../src/lib/costDashboardBudgetGaugeState.ts";

test("readCostDashboardRunCostGaugeState does not invent a zero cap from partial budget data", () => {
  assert.equal(
    readCostDashboardRunCostGaugeState(
      {
        soft_limit_ratio: 0.6,
      },
      18.5,
    ),
    null,
  );
});

test("readCostDashboardRunCostGaugeState renders confirmed budget caps when present", () => {
  assert.deepEqual(
    readCostDashboardRunCostGaugeState(
      {
        max_cost_usd: 100,
        soft_limit_ratio: 0.65,
      },
      18.5,
    ),
    {
      used: 18.5,
      max: 100,
      warnAt: 65,
      hint: "Soft warning at 65%.",
    },
  );
});

test("readCostDashboardApiCallsGaugeState does not invent an api call cap from partial budget data", () => {
  assert.equal(readCostDashboardApiCallsGaugeState({}, 250), null);
});

test("readCostDashboardTokenGaugeState does not invent a token cap from partial budget data", () => {
  assert.equal(readCostDashboardTokenGaugeState({}, 1200), null);
});
