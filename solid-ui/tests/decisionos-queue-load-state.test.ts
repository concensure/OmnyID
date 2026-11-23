import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsQueueLoadTrend,
  nextQueueMinutesBaseline,
} from "../src/lib/decisionOsQueueLoadState.ts";

test("queue load baseline captures the first non-negative current minutes only once", () => {
  assert.equal(nextQueueMinutesBaseline(-1, -1), -1);
  assert.equal(nextQueueMinutesBaseline(-1, 42), 42);
  assert.equal(nextQueueMinutesBaseline(42, 18), 42);
});

test("queue load trend compares current minutes against captured baseline", () => {
  assert.equal(decisionOsQueueLoadTrend(-1, 30), "steady");
  assert.equal(decisionOsQueueLoadTrend(30, 30), "steady");
  assert.equal(decisionOsQueueLoadTrend(30, 45), "up");
  assert.equal(decisionOsQueueLoadTrend(30, 12), "down");
});
