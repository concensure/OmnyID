import test from "node:test";
import assert from "node:assert/strict";

import type { PlanningQueryResponse } from "@/lib/api";
import {
  planningResultMessage,
  planningSessionState,
  planningThreadId,
} from "@/lib/planningViewState";

const RESPONSE: PlanningQueryResponse = {
  thread_id: "thread-1",
  correlation_id: "corr-1",
  goal: "Get to the airport",
  summary: "Three ranked options.",
  options: [
    {
      id: "option-1",
      title: "Train",
      description: "Cheapest route.",
      rationale: "",
      risk_flags: ["delay"],
    },
  ],
  assumptions: [
    { key: "depart_after", value: "6:30 PM", label: "Leave after", editable: true },
    { key: "avoid_tolls", value: "true", label: "Avoid tolls", editable: true },
  ],
  unresolved: ["Do you have luggage?"],
};

test("planning view state centralizes thread id and session shaping", () => {
  assert.equal(planningThreadId(RESPONSE), "thread-1");
  assert.equal(planningThreadId({ ...RESPONSE, thread_id: "" }), null);

  assert.deepEqual(planningSessionState(RESPONSE), {
    goal: "Get to the airport",
    thread_id: "thread-1",
    correlation_id: "corr-1",
    assumptions: RESPONSE.assumptions,
    constraints: {
      depart_after: "6:30 PM",
      avoid_tolls: "true",
    },
    evidence: {},
    unresolved: ["Do you have luggage?"],
  });
});

test("planning view state centralizes planning renderer message payloads", () => {
  assert.deepEqual(
    planningResultMessage(
      {
        ...RESPONSE,
        comparison_headers: undefined,
        comparison_rows: [{ label: "Cost", values: ["$18", "$31"] }],
      },
      "2026-08-31T09:15:00.000Z",
    ),
    {
      id: "plan-corr-1",
      thread_id: "thread-1",
      from: "planning-assistant",
      to: [],
      timestamp: "2026-08-31T09:15:00.000Z",
      type: "planning",
      subtype: "result",
      kind: "planning_result",
      supertags: [],
      content: {
        summary: "Three ranked options.",
        goal: "Get to the airport",
        options: RESPONSE.options,
        assumptions: RESPONSE.assumptions,
        comparison_headers: [],
        comparison_rows: [{ label: "Cost", values: ["$18", "$31"] }],
        unresolved: ["Do you have luggage?"],
      },
      metadata: null,
      views: [],
      attachments: [],
      references: [],
      encryption: null,
      signature: "",
    },
  );
});
