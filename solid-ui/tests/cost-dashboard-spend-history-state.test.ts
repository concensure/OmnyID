import test from "node:test";
import assert from "node:assert/strict";

import {
  readCostDashboardSpendBars,
  readCostDashboardSpendHistoryDetail,
  readCostDashboardSpendHistoryTotals,
  readCostDashboardSpendHistoryValue,
} from "../src/lib/costDashboardSpendHistoryState.ts";

test("readCostDashboardSpendHistoryValue does not invent zero spend from partial history", () => {
  assert.equal(
    readCostDashboardSpendHistoryValue([{ cost_usd: 12.5, api_calls: 4 }]),
    "Spend unavailable",
  );
});

test("readCostDashboardSpendHistoryDetail does not invent zero calls or tokens from partial history", () => {
  assert.match(
    readCostDashboardSpendHistoryDetail([{ cost_usd: 12.5, api_calls: 4 }]),
    /Retry the dashboard to confirm recent spend, API calls, and token usage\./,
  );
});

test("readCostDashboardSpendHistoryTotals returns confirmed 30-day totals when all signals are present", () => {
  assert.deepEqual(
    readCostDashboardSpendHistoryTotals([
      { cost_usd: 12.5, api_calls: 4, tokens: 1200 },
      { cost_usd: 7.5, api_calls: 6, tokens: 1800 },
    ]),
    { usedUsd: 20, usedCalls: 10, usedTokens: 3000 },
  );
});

test("readCostDashboardSpendBars does not invent spend bars from partial history", () => {
  assert.equal(
    readCostDashboardSpendBars([{ day: "2026-07-09" }]),
    null,
  );
});

test("readCostDashboardSpendBars returns confirmed visible spend bars when day and cost are present", () => {
  assert.deepEqual(
    readCostDashboardSpendBars([
      { day: "2026-07-08", cost_usd: 10 },
      { day: "2026-07-09", cost_usd: 20 },
    ]),
    [
      { dayLabel: "07-08", title: "2026-07-08: $10.00", costUsd: 10, ratio: 0.5 },
      { dayLabel: "07-09", title: "2026-07-09: $20.00", costUsd: 20, ratio: 1 },
    ],
  );
});
