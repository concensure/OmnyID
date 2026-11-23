import test from "node:test";
import assert from "node:assert/strict";

import {
  readCostDashboardProfitDetail,
  readCostDashboardProfitTitle,
  readCostDashboardProfitValue,
} from "../src/lib/costDashboardProfitState.ts";

test("readCostDashboardProfitValue does not invent a zero margin from a missing profit snapshot", () => {
  assert.equal(readCostDashboardProfitValue(null), "Unavailable");
});

test("readCostDashboardProfitValue does not render NaN from partial profit data", () => {
  assert.equal(
    readCostDashboardProfitValue({
      cost_month_usd: 18.5,
      estimated_monthly_revenue_usd: 42,
    }),
    "Margin unavailable",
  );
});

test("readCostDashboardProfitDetail does not invent revenue text from partial profit data", () => {
  assert.match(
    readCostDashboardProfitDetail({
      estimated_monthly_margin_usd: 23.5,
    }),
    /Retry the dashboard to confirm margin, revenue, and usage-guard outlook\./,
  );
});

test("readCostDashboardProfitDetail renders confirmed cost and revenue when present", () => {
  assert.equal(
    readCostDashboardProfitDetail({
      estimated_monthly_margin_usd: 23.5,
      cost_month_usd: 18.5,
      estimated_monthly_revenue_usd: 42,
    }),
    "Month cost $18.50 vs estimated revenue $42.00.",
  );
});

test("readCostDashboardProfitTitle does not echo unsupported tier metadata", () => {
  assert.equal(
    readCostDashboardProfitTitle({
      pricing_tier: "enterprise_plus",
    }),
    "Margin outlook",
  );
});

test("readCostDashboardProfitTitle renders recognized tier labels when present", () => {
  assert.equal(
    readCostDashboardProfitTitle({
      pricing_tier: "paid",
    }),
    "Paid tier outlook",
  );
});
