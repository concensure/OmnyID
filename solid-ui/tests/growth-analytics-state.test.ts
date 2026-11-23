import test from "node:test";
import assert from "node:assert/strict";

import {
  growthKpiDetail,
  growthKpiLabel,
  normalizeGrowthOverview,
} from "../src/lib/growthAnalyticsState.ts";

test("Growth KPI presentation preserves unavailable and provisional states", () => {
  assert.equal(
    growthKpiLabel({ state: "unavailable", reason: "zero_denominator", numerator: 0, denominator: 0 }),
    "Not available",
  );
  assert.equal(
    growthKpiDetail({ state: "provisional", numerator: 2, denominator: 4, mature_on: "2026-11-12" }),
    "Matures 2026-11-12",
  );
  assert.equal(
    growthKpiLabel({ state: "available", numerator: 20_000, denominator: 100, value: 200, unit: "aud_minor_per_unit" }),
    "$2.00",
  );
});

test("Growth overview normalisation keeps server definitions and does not invent values", () => {
  const result = normalizeGrowthOverview({
    meta: { definition_version: "growth-kpi-v1", timezone: "Australia/Sydney", attribution_model: "first_touch", from: "2026-10-01", through: "2026-10-30" },
    comparison: {
      current: { signup_rate: { state: "unavailable", reason: "no_eligible_landing_sessions", numerator: 0, denominator: 0 } },
      previous: {},
    },
    funnel: { landing_sessions: 8, private_wedding_content: "must not render" },
  });
  assert.equal(result.meta.definition_version, "growth-kpi-v1");
  assert.equal(result.comparison.current.signup_rate.state, "unavailable");
  assert.equal(result.funnel.landing_sessions, 8);
  assert.equal("private_wedding_content" in result.funnel, false);
});
