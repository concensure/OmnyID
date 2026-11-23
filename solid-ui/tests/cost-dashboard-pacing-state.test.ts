import test from "node:test";
import assert from "node:assert/strict";

import {
  readCostDashboardPaceStatus,
  readCostDashboardProjectionState,
} from "../src/lib/costDashboardPacingState.ts";

test("readCostDashboardPaceStatus does not project pacing from partial spend history", () => {
  assert.match(
    readCostDashboardPaceStatus(
      { max_cost_usd: 100 },
      [{ cost_usd: 12 }, {}],
      Date.UTC(2026, 6, 9),
    ),
    /Retry the dashboard to confirm current daily spend before projecting budget pace\./,
  );
});

test("readCostDashboardProjectionState does not invent cap arrival from partial spend history", () => {
  assert.deepEqual(
    readCostDashboardProjectionState(
      { max_cost_usd: 100 },
      [{ cost_usd: 12 }, {}],
    ),
    { days: null, reason: "retry" },
  );
});

test("readCostDashboardPaceStatus keeps the existing no-cap guidance", () => {
  assert.equal(readCostDashboardPaceStatus(null, [], Date.UTC(2026, 6, 9)), "No monthly cap set");
});

test("readCostDashboardProjectionState renders confirmed cap arrival when spend history is complete", () => {
  assert.deepEqual(
    readCostDashboardProjectionState(
      { max_cost_usd: 100 },
      [{ cost_usd: 10 }, { cost_usd: 15 }],
    ),
    { days: 6, reason: null },
  );
});
