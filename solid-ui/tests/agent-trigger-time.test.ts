import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAgentTriggerUtc,
  lastSuccessfulAgentTriggerRunLabel,
  relativeAgentTriggerTime,
  timeUntilAgentTriggerRun,
} from "../src/lib/agentTriggerTime.ts";

const NOW_MS = Date.UTC(2026, 6, 20, 12, 0, 0);

test("agent trigger time humanizes relative past timestamps", () => {
  assert.equal(relativeAgentTriggerTime(new Date(NOW_MS - 30 * 1000).toISOString(), NOW_MS), "just now");
  assert.equal(relativeAgentTriggerTime(new Date(NOW_MS - 15 * 60000).toISOString(), NOW_MS), "15m ago");
  assert.equal(relativeAgentTriggerTime(new Date(NOW_MS - 3 * 3600000).toISOString(), NOW_MS), "3h ago");
  assert.equal(relativeAgentTriggerTime(new Date(NOW_MS - 5 * 24 * 3600000).toISOString(), NOW_MS), "5d ago");
});

test("agent trigger time preserves invalid relative timestamps", () => {
  assert.equal(relativeAgentTriggerTime("not-a-date", NOW_MS), "not-a-date");
});

test("agent trigger time formats the last successful run label", () => {
  assert.equal(lastSuccessfulAgentTriggerRunLabel(undefined, NOW_MS), "");
  assert.equal(lastSuccessfulAgentTriggerRunLabel([{ status: "failed" }], NOW_MS), "Never succeeded");
  assert.equal(
    lastSuccessfulAgentTriggerRunLabel(
      [
        { status: "failed", created_at: new Date(NOW_MS - 5 * 60000).toISOString() },
        { status: "success", ran_at: new Date(NOW_MS - 2 * 3600000).toISOString() },
      ],
      NOW_MS,
    ),
    "2 h ago",
  );
});

test("agent trigger time formats future countdowns", () => {
  assert.equal(timeUntilAgentTriggerRun(new Date(NOW_MS - 1000).toISOString(), NOW_MS), "running now");
  assert.equal(timeUntilAgentTriggerRun(new Date(NOW_MS + 25 * 60000).toISOString(), NOW_MS), "in 25 m");
  assert.equal(timeUntilAgentTriggerRun(new Date(NOW_MS + 125 * 60000).toISOString(), NOW_MS), "in 2 h 5 m");
});

test("agent trigger time formats UTC preview labels", () => {
  assert.equal(
    formatAgentTriggerUtc(new Date(Date.UTC(2026, 6, 20, 8, 5, 0))),
    "Mon Jul 20 08:05 UTC",
  );
});
