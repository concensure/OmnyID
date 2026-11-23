import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsDismissLowImpactPlan,
  decisionOsFocusQueuePriorityFollowUpPlan,
  decisionOsGoalScheduledPlan,
  decisionOsScheduleReviewPlan,
} from "../src/lib/decisionOsHomeFollowUpState.js";

test("decisionos home follow-up state derives low-impact bulk dismiss plan", () => {
  assert.deepEqual(
    decisionOsDismissLowImpactPlan({
      decisions: [
        { id: "a", urgency: "soon", impact: "low" },
        { id: "b", urgency: "later", impact: "high" },
        { id: "c", urgency: "whenever", impact: "medium" },
      ],
      dismissed: new Set(["c"]),
    }),
    {
      ids: ["a"],
      toastMessage: "1 low-impact decision dismissed.",
    },
  );

  assert.equal(
    decisionOsDismissLowImpactPlan({
      decisions: [{ id: "a", urgency: "urgent", impact: "high" }],
      dismissed: new Set(),
    }),
    null,
  );
});

test("decisionos home follow-up state exposes schedule-review action chip", () => {
  const plan = decisionOsScheduleReviewPlan();
  assert.equal(plan.actionChip.label, "Schedule 15-min decision review");
  assert.equal(plan.actionChip.id, "schedule-review");
});

test("decisionos home follow-up state reuses queue priority open planning", () => {
  const plan = decisionOsFocusQueuePriorityFollowUpPlan({
    queueState: {
      queuePriorityCard: {
        title: "Follow up with client",
        source_ref: "thread:client-1",
      },
      queueActionItems: [],
      queueContextPanelItems: [{ id: "ctx_client_1" }] as any,
    },
  });
  assert.equal(plan.kind, "open-queue-priority");
  if (plan.kind === "open-queue-priority") {
    assert.deepEqual(plan.queueState, {
      queuePriorityCard: {
        title: "Follow up with client",
        source_ref: "thread:client-1",
      },
      queueActionItems: [],
      queueContextPanelItems: [{ id: "ctx_client_1" }],
    });
  }
});

test("decisionos home follow-up state honors atomic queue state input at runtime", () => {
  const plan = decisionOsFocusQueuePriorityFollowUpPlan({
    queueState: {
      queuePriorityCard: null,
      queueActionItems: [
        {
          id: "act_queue_1",
          title: "Review renewal comparison",
        },
      ],
      queueContextPanelItems: [{ id: "ctx_queue_1" }],
    },
  });

  assert.equal(plan.kind, "open-queue-priority");
  if (plan.kind === "open-queue-priority") {
    assert.deepEqual(plan.queueState, {
      queuePriorityCard: null,
      queueActionItems: [{ id: "act_queue_1", title: "Review renewal comparison" }],
      queueContextPanelItems: [{ id: "ctx_queue_1" }],
    });
  }
});

test("decisionos home follow-up state applies scheduled goal patch and feedback", () => {
  const plan = decisionOsGoalScheduledPlan({
    decisions: [
      {
        id: "goal-1",
        title: "Learn Japanese",
        goalBreakdown: {
          goalId: "goal-1",
          description: "Study daily",
          status: "ready",
        },
      },
      {
        id: "other",
        title: "Other",
      },
    ],
    decisionId: "goal-1",
    summary: "3h/week on Monday & Thursday until 2027",
  });

  assert.equal(plan.decisions[0].goalBreakdown?.status, "scheduled");
  assert.equal(
    plan.decisions[0].goalBreakdown?.scheduledSummary,
    "3h/week on Monday & Thursday until 2027",
  );
  assert.equal(plan.toastMessage, "Goal scheduled: 3h/week on Monday & Thursday until 2027");
  assert.equal(plan.diaryEntry.type, "calendar");
});
