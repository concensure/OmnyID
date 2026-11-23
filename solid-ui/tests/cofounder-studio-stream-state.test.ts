import test from "node:test";
import assert from "node:assert/strict";

import { parseCofounderStudioStreamEvent } from "../src/lib/cofounderStudioStreamState.ts";

test("parseCofounderStudioStreamEvent rejects malformed stream payloads", () => {
  assert.equal(parseCofounderStudioStreamEvent("{bad json"), null);
  assert.equal(parseCofounderStudioStreamEvent("[]"), null);
  assert.equal(parseCofounderStudioStreamEvent("{}"), null);
  assert.equal(parseCofounderStudioStreamEvent({ slot_name: "   ", node_id: "" }), null);
});

test("parseCofounderStudioStreamEvent normalizes supported stream fields", () => {
  assert.deepEqual(
    parseCofounderStudioStreamEvent(JSON.stringify({
      node_id: " node-a ",
      slot_name: " intake_slot ",
      output: { summary: "Ready", count: 2 },
      error: " failed ",
      ignored: "field",
    })),
    {
      nodeId: "node-a",
      slotName: "intake_slot",
      output: { summary: "Ready", count: 2 },
      error: "failed",
    },
  );
});

test("parseCofounderStudioStreamEvent ignores unsafe output shapes", () => {
  assert.deepEqual(
    parseCofounderStudioStreamEvent({
      slot_name: "planner_slot",
      output: ["not", "a", "record"],
    }),
    { slotName: "planner_slot" },
  );
});
