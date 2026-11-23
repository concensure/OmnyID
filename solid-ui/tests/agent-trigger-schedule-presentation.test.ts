import assert from "node:assert/strict";
import test from "node:test";

import { cronExpressionSummary, nextCronFireTimes } from "../src/lib/agentTriggerSchedulePresentation.ts";

test("agent trigger schedule presentation summarizes common daily schedules", () => {
  assert.equal(cronExpressionSummary("0 8 * * *"), "Daily at 08:00 UTC");
  assert.equal(cronExpressionSummary("0 9 * * 1-5"), "Every weekday at 09:00 UTC");
  assert.equal(cronExpressionSummary("0 7 * * 1"), "Every Monday at 07:00 UTC");
});

test("agent trigger schedule presentation summarizes hourly schedules", () => {
  assert.equal(cronExpressionSummary("15 * * * *"), "Every hour at :15 UTC");
  assert.equal(cronExpressionSummary("0 * * * *"), "Every hour");
  assert.equal(cronExpressionSummary("*/30 * * * *"), "Every 30 minutes");
});

test("agent trigger schedule presentation preserves unsupported expressions", () => {
  assert.equal(cronExpressionSummary(""), "");
  assert.equal(cronExpressionSummary("0 8 1 * *"), "0 8 1 * *");
  assert.equal(cronExpressionSummary("not cron"), "not cron");
});

test("agent trigger schedule presentation calculates upcoming cron fires", () => {
  const fires = nextCronFireTimes(
    "0 8 * * *",
    3,
    new Date(Date.UTC(2026, 6, 20, 7, 58, 0)),
  );
  assert.deepEqual(
    fires.map((date) => date.toISOString()),
    [
      "2026-07-20T08:00:00.000Z",
      "2026-07-21T08:00:00.000Z",
      "2026-07-22T08:00:00.000Z",
    ],
  );
});

test("agent trigger schedule presentation returns no cron preview for invalid expressions", () => {
  assert.deepEqual(nextCronFireTimes("not cron"), []);
});
