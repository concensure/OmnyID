import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsQueuePriorityPlan,
  decisionOsTopBlockerPlan,
} from "../src/lib/decisionOsBriefingInteractionState.ts";

test("decisionos briefing interaction state derives top blocker focus targets", () => {
  const decisions = [{ id: "a" }, { id: "b" }] as const;
  assert.deepEqual(
    decisionOsTopBlockerPlan({ decisions, blockerId: "b" }),
    { kind: "focus-decision", selectedId: "b", focusedIndex: 1 },
  );
  assert.deepEqual(
    decisionOsTopBlockerPlan({ decisions, blockerId: null }),
    { kind: "none" },
  );
});

test("decisionos briefing interaction state derives queue priority open plans", () => {
  const priorityCard = { thread_ref: "thread:123" };
  const actionItems = [{ source_refs: ["thread:123"] }] as const;
  const queueContextPanelItems = [{ id: "ctx_1" }] as const;
  assert.deepEqual(
    decisionOsQueuePriorityPlan({
      queueState: {
        queuePriorityCard: priorityCard,
        queueActionItems: actionItems,
        queueContextPanelItems,
      },
    }),
    {
      kind: "open-queue-priority",
      queueState: {
        queuePriorityCard: priorityCard,
        queueActionItems: actionItems,
        queueContextPanelItems,
      },
    },
  );
  assert.deepEqual(
    decisionOsQueuePriorityPlan({
      queueState: {
        queuePriorityCard: null,
        queueActionItems: [],
        queueContextPanelItems: [],
      },
    }),
    { kind: "none" },
  );
  assert.deepEqual(
    decisionOsQueuePriorityPlan({
      queueState: {
        queuePriorityCard: priorityCard,
        queueActionItems: actionItems,
        queueContextPanelItems,
      },
    }),
    {
      kind: "open-queue-priority",
      queueState: {
        queuePriorityCard: priorityCard,
        queueActionItems: actionItems,
        queueContextPanelItems,
      },
    },
  );
});
