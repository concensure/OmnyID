import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardFeedActivitySpark } from "../src/lib/dashboardFeedActivitySpark.ts";

test("buildDashboardFeedActivitySpark buckets only the last seven days", () => {
  const spark = buildDashboardFeedActivitySpark(
    [
      { timestamp: "2026-07-04T10:00:00" },
      { timestamp: "2026-07-04T15:00:00" },
      { timestamp: "2026-07-02T12:00:00" },
      { timestamp: "2026-06-25T12:00:00" },
    ],
    new Date("2026-07-04T20:00:00"),
  );

  assert.deepEqual(spark?.totals, [0, 0, 0, 0, 1, 0, 2]);
  assert.equal(spark?.max, 2);
  assert.deepEqual(spark?.labels, ["Jun 28", "Jun 29", "Jun 30", "Jul 1", "Jul 2", "Jul 3", "Jul 4"]);
});

test("buildDashboardFeedActivitySpark returns null when no recent valid timestamps exist", () => {
  assert.equal(
    buildDashboardFeedActivitySpark(
      [
        { timestamp: "invalid" },
        { timestamp: "2026-06-01T12:00:00.000Z" },
      ],
      new Date("2026-07-04T20:00:00.000Z"),
    ),
    null,
  );
});
