import assert from "node:assert/strict";
import test from "node:test";

import { groupAgentTriggersByKind } from "../src/lib/agentTriggerGrouping.ts";

test("agent trigger grouping preserves insertion order per kind", () => {
  const grouped = groupAgentTriggersByKind([
    { id: "a", trigger_type: "scheduled" },
    { id: "b", trigger_type: "webhook" },
    { id: "c", trigger_type: "scheduled" },
  ]);

  assert.deepEqual(grouped, [
    {
      kind: "scheduled",
      items: [
        { id: "a", trigger_type: "scheduled" },
        { id: "c", trigger_type: "scheduled" },
      ],
    },
    {
      kind: "webhook",
      items: [{ id: "b", trigger_type: "webhook" }],
    },
  ]);
});

test("agent trigger grouping returns an empty list for empty input", () => {
  assert.deepEqual(groupAgentTriggersByKind([]), []);
});
