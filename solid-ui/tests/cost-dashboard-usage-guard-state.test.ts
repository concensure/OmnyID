import test from "node:test";
import assert from "node:assert/strict";

import {
  readCostDashboardUsageGuardDetail,
  readCostDashboardUsageGuardSummary,
} from "../src/lib/costDashboardUsageGuardState.ts";

test("readCostDashboardUsageGuardSummary does not invent guard states from a missing profit snapshot", () => {
  assert.match(
    readCostDashboardUsageGuardSummary(null),
    /Retry the dashboard to confirm margin and usage guard coverage\./,
  );
});

test("readCostDashboardUsageGuardSummary does not invent guard states from partial profit data", () => {
  assert.match(
    readCostDashboardUsageGuardSummary({
      usage_guard_active: true,
    }),
    /Retry the dashboard to confirm margin and usage guard coverage\./,
  );
});

test("readCostDashboardUsageGuardDetail does not invent deep-query counts from partial profit data", () => {
  assert.match(
    readCostDashboardUsageGuardDetail({
      deep_queries_today: 4,
    }),
    /Retry the dashboard to confirm today's deep-query usage and limit\./,
  );
});

test("readCostDashboardUsageGuard state renders confirmed guard coverage and deep-query limits when present", () => {
  assert.equal(
    readCostDashboardUsageGuardSummary({
      margin_guard_active: true,
      usage_guard_active: false,
    }),
    "Margin guard active, usage guard inactive.",
  );
  assert.equal(
    readCostDashboardUsageGuardDetail({
      deep_queries_today: 4,
      daily_deep_query_limit: 25,
    }),
    "Deep queries today: 4 / 25",
  );
});
