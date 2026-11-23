import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilityDowBars,
  capabilityStaleSummary,
  capabilityUsageCardState,
  capabilityUsageSummary,
} from "../src/lib/agentSettingsCapabilityUsageState.ts";

test("capability usage selectors provide stable fallbacks", () => {
  assert.equal(capabilityUsageSummary(null, null, 1_000), null);
  assert.deepEqual(capabilityDowBars(null), []);
  assert.equal(capabilityStaleSummary(null, 1_000), null);
  assert.deepEqual(capabilityUsageCardState({
    usageCount: null,
    lastUsedAt: null,
    dowUsage: null,
    now: 1_000,
  }), {
    usageSummary: null,
    dowBars: [],
    staleSummary: null,
  });
});

test("capability usage selectors normalize usage summary bars and stale messaging", () => {
  const now = 1_000_000_000_000;
  const lastUsedAt = now - 3 * 86_400_000;
  assert.equal(capabilityUsageSummary(4, lastUsedAt, now), "used 4x | last 3d ago");
  assert.deepEqual(capabilityDowBars([1, 0, 2, 0, 0, 0, 1]), [
    { label: "S", count: 1, height: 6, active: true },
    { label: "M", count: 0, height: 2, active: false },
    { label: "T", count: 2, height: 12, active: true },
    { label: "W", count: 0, height: 2, active: false },
    { label: "T", count: 0, height: 2, active: false },
    { label: "F", count: 0, height: 2, active: false },
    { label: "S", count: 1, height: 6, active: true },
  ]);
  assert.equal(capabilityStaleSummary(now - 20 * 86_400_000, now), "not used in 20d - may be redundant");
  assert.deepEqual(capabilityUsageCardState({
    usageCount: 4,
    lastUsedAt,
    dowUsage: [1, 0, 2, 0, 0, 0, 1],
    now,
  }), {
    usageSummary: "used 4x | last 3d ago",
    dowBars: [
      { label: "S", count: 1, height: 6, active: true },
      { label: "M", count: 0, height: 2, active: false },
      { label: "T", count: 2, height: 12, active: true },
      { label: "W", count: 0, height: 2, active: false },
      { label: "T", count: 0, height: 2, active: false },
      { label: "F", count: 0, height: 2, active: false },
      { label: "S", count: 1, height: 6, active: true },
    ],
    staleSummary: null,
  });
});
