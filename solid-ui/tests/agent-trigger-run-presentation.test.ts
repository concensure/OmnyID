import assert from "node:assert/strict";
import test from "node:test";

import {
  agentTriggerRunSparklineColor,
  agentTriggerRunSparklineWindow,
} from "../src/lib/agentTriggerRunPresentation.ts";

test("agent trigger run presentation maps run statuses to sparkline colors", () => {
  assert.equal(agentTriggerRunSparklineColor(undefined), "#d1d5db");
  assert.equal(agentTriggerRunSparklineColor({ status: "success" }), "#22c55e");
  assert.equal(agentTriggerRunSparklineColor({ status: "failed" }), "#ef4444");
  assert.equal(agentTriggerRunSparklineColor({ status: "error" }), "#ef4444");
  assert.equal(agentTriggerRunSparklineColor({ status: "queued" }), "#d1d5db");
});

test("agent trigger run presentation builds a fixed sparkline window from recent runs", () => {
  const runs = Array.from({ length: 16 }, (_, index) => ({ status: `s${index}` }));
  assert.deepEqual(
    agentTriggerRunSparklineWindow(runs, 4),
    [{ status: "s12" }, { status: "s13" }, { status: "s14" }, { status: "s15" }],
  );
  assert.deepEqual(
    agentTriggerRunSparklineWindow([{ status: "only" }], 3),
    [{ status: "only" }, undefined, undefined],
  );
});
