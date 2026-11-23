import test from "node:test";
import assert from "node:assert/strict";

import {
  readCostDashboardSummaryDetail,
  readCostDashboardSummaryValue,
} from "../src/lib/costDashboardSummaryState.ts";

test("readCostDashboardSummaryValue does not invent zero cost from a missing summary", () => {
  assert.equal(readCostDashboardSummaryValue(null), "Unavailable");
});

test("readCostDashboardSummaryValue does not invent a zero total from partial summary data", () => {
  assert.equal(
    readCostDashboardSummaryValue({
      event_count: 18,
      run_count: 4,
    }),
    "Cost unavailable",
  );
});

test("readCostDashboardSummaryDetail does not invent zero counts from partial summary data", () => {
  assert.match(
    readCostDashboardSummaryDetail({
      total_usd: 42.5,
    }),
    /Retry the dashboard to confirm lifetime recorded run cost, event volume, and run volume\./,
  );
});

test("readCostDashboardSummaryDetail renders confirmed lifetime counts when present", () => {
  assert.equal(
    readCostDashboardSummaryDetail({
      total_usd: 42.5,
      event_count: 18,
      run_count: 4,
    }),
    "18 cost events across 4 runs.",
  );
});
