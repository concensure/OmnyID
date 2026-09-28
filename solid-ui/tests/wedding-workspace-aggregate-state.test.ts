import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingPeopleAggregateState,
  buildWeddingPlanAggregateState,
} from "../src/lib/weddingWorkspaceAggregateState.ts";
import type { WeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";

function state(overrides: Partial<WeddingResponseWorkspaceViewState> = {}): WeddingResponseWorkspaceViewState {
  return {
    guestTracking: {
      guestRowCount: 82,
      pendingCount: 17,
      boundaryRuleLabels: ["No extra plus-ones"],
      invitationScopeLabels: ["Reception only: cousins"],
    },
    seatingPlan: {
      assignedSeatCount: 48,
      unassignedAttendingCount: 12,
    },
    boundaryState: {
      pendingApprovalCount: 3,
      privateObjectCount: 1,
    },
    vendorContactCards: [
      { tone: "urgent" },
      { tone: "due" },
      { tone: "waiting" },
      { tone: "closed" },
    ],
    ganttTimeline: {
      rows: [{ id: "date-1" }, { id: "date-2", status: "Done" }],
      undatedItems: [{ id: "anytime-1" }],
    },
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

test("people aggregate state summarizes guests seating and family-boundary actions", () => {
  const people = buildWeddingPeopleAggregateState(state());

  assert.equal(people.title, "People");
  assert.deepEqual(people.summaryPills, [
    "82 guests",
    "17 replies waiting",
    "12 seats unassigned",
    "2 rules active",
    "3 family requests waiting",
  ]);
  assert.equal(people.actions[0]?.targetMenu, "guests");
  assert.equal(people.actions[0]?.title, "Guests and family boundaries");
  assert.equal(people.actions[0]?.metaLabel, "3 requests waiting for review - 2 rules active - 1 private note couple-only");
  assert.equal(people.actions[1]?.targetMenu, "seating");
  assert.equal(people.actions[1]?.title, "Seating Plan");
  assert.equal(people.actions[1]?.metaLabel, "48 guests already seated");
  assert.equal(people.a2ui.kind, "wedding_workspace_aggregate");
});

test("plan aggregate state summarizes follow-ups timeline and sharing", () => {
  const plan = buildWeddingPlanAggregateState(state(), {
    sharePlanOpen: true,
    sharePlanAvailable: true,
  });

  assert.equal(plan.title, "Plan");
  assert.deepEqual(plan.summaryPills, [
    "1 urgent follow-up needs attention",
    "1 upcoming item",
    "1 anytime item",
    "Sharing open",
  ]);
  assert.equal(plan.actions[0]?.targetMenu, "response_queue");
  assert.equal(plan.actions[0]?.metaLabel, "1 urgent item - 1 due item - 1 vendor waiting - 1 closed loop");
  assert.equal(plan.actions[1]?.targetMenu, "timeline");
  assert.equal(plan.actions[1]?.metaLabel, "1 upcoming item - 1 done item - 1 anytime item");
  assert.equal(plan.actions[2]?.targetMenu, "share_plan");
  assert.equal(plan.actions[2]?.enabled, true);
  assert.equal(plan.actions[2]?.metaLabel, "Sharing options are visible.");
});

test("plan aggregate disables share action when no share handler is connected", () => {
  const plan = buildWeddingPlanAggregateState(state(), {
    sharePlanOpen: false,
    sharePlanAvailable: false,
  });

  assert.equal(plan.summaryPills[3], "Sharing unavailable");
  assert.equal(plan.actions[2]?.enabled, false);
  assert.equal(plan.actions[2]?.metaLabel, "Sharing setup is not connected.");
});
