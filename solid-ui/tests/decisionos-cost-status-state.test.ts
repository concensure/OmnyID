import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsCostMetricChips,
  decisionOsCostStatusTone,
} from "../src/lib/decisionOsCostStatusState.ts";

test("decisionos cost status state maps tones by alert level", () => {
  assert.equal(
    decisionOsCostStatusTone({ level: "warning", title: "High burn", detail: "Review now" }),
    "border-rose-200/70 bg-rose-50/75 text-rose-700",
  );
  assert.equal(
    decisionOsCostStatusTone({ level: "elevated", title: "Watch spend", detail: "Caution" }),
    "border-amber-200/70 bg-amber-50/75 text-amber-700",
  );
  assert.equal(
    decisionOsCostStatusTone({ level: "normal", title: "Healthy", detail: "Stable" }),
    "border-sky-200/70 bg-sky-50/75 text-sky-700",
  );
});

test("decisionos cost status state derives metric chips from snapshots", () => {
  const snapshot = {
    monthly_budget_usd: 500,
    recent_spend_usd_14d: 125,
    estimated_monthly_margin_usd: -42.2,
    deep_queries_today: 3,
    daily_deep_query_limit: 5,
  };

  assert.deepEqual(decisionOsCostMetricChips(snapshot), [
    "25% of cap",
    "-$42.20 est. margin",
    "3/5 deep queries",
  ]);
});

test("decisionos cost status state formats compact metric chips across thresholds", () => {
  assert.deepEqual(
    decisionOsCostMetricChips({
      monthly_budget_usd: 1000,
      recent_spend_usd_14d: 120.4,
      estimated_monthly_margin_usd: 12.345,
      deep_queries_today: 0,
      daily_deep_query_limit: 0,
    }),
    [
      "12% of cap",
      "$12.35 est. margin",
    ],
  );
  assert.deepEqual(
    decisionOsCostMetricChips({
      monthly_budget_usd: 1000,
      recent_spend_usd_14d: 0,
      estimated_monthly_margin_usd: 120.4,
      deep_queries_today: 0,
      daily_deep_query_limit: 0,
    }),
    [
      "0% of cap",
      "$120 est. margin",
    ],
  );
});
