import test from "node:test";
import assert from "node:assert/strict";

import { costDashboardMountedDateTimeLabel } from "@/lib/costDashboardViewState";

test("cost dashboard view state centralizes mounted timestamp formatting", () => {
  assert.equal(
    costDashboardMountedDateTimeLabel("2026-08-31T06:05:00Z"),
    "Aug 31, 2026, 4:05 PM",
  );
  assert.equal(costDashboardMountedDateTimeLabel(""), null);
  assert.equal(costDashboardMountedDateTimeLabel("not-a-date"), null);
});
