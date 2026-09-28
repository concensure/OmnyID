import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsDaysOfWeek,
  decisionOsDurationScopeOrder,
  decisionOsDurationViews,
  decisionOsMoodEffortFilter,
  decisionOsMoodOptions,
} from "../src/lib/decisionOsHomeOptionsState.ts";

test("decisionos home options state exposes stable mood options and effort filters", () => {
  const moods = decisionOsMoodOptions();
  assert.equal(moods.length, 5);
  assert.equal(moods[0]?.id, "neutral");
  assert.equal(decisionOsMoodEffortFilter("tired"), "quick");
  assert.equal(decisionOsMoodEffortFilter("happy"), "all-normal");
  assert.equal(decisionOsMoodEffortFilter(undefined), "all");
});

test("decisionos home options state exposes duration tabs and weekday ordering", () => {
  const views = decisionOsDurationViews();
  assert.deepEqual(
    decisionOsDurationScopeOrder(),
    ["day", "week", "month", "year"],
  );
  assert.equal(views[0]?.label, "Today");
  assert.match(views[2]?.hint ?? "", /monthly goals/i);
  assert.deepEqual(decisionOsDaysOfWeek().slice(0, 3), ["Monday", "Tuesday", "Wednesday"]);
});
