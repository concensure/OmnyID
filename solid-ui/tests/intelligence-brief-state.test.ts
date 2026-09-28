import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeBriefResponse,
  normalizeGoalsPulseResponse,
  shouldLoadIntelligenceBrief,
} from "../src/lib/intelligenceBriefState.ts";

test("shouldLoadIntelligenceBrief requires both enabled settings and a signed-in session", () => {
  assert.equal(shouldLoadIntelligenceBrief(true, true), true);
  assert.equal(shouldLoadIntelligenceBrief(true, false), false);
  assert.equal(shouldLoadIntelligenceBrief(false, true), false);
  assert.equal(shouldLoadIntelligenceBrief(false, false), false);
});

test("normalizeBriefResponse filters malformed sections and defaults unsupported fields", () => {
  assert.deepEqual(normalizeBriefResponse({
    brief_id: 123,
    brief_date: "2026-08-12",
    greeting: true,
    sections: [
      {
        type: "agent_offer",
        title: "Prepare plan",
        body: "Draft the next step.",
        priority: 2,
        source_message_ids: ["msg_1", "", 99],
        action: { label: "Queue it", intent: "build_plan" },
      },
      { type: "bad", title: "No body" },
      { type: "bad", title: "Ambient", body: "Fallback type", priority: Number.NaN, action: { label: "No intent" } },
    ],
    goal_pulse: [{ domain: "career", momentum: "recent", last_signal: "today" }],
  }), {
    brief_id: "123",
    brief_date: "2026-08-12",
    greeting: "true",
    sections: [
      {
        type: "agent_offer",
        title: "Prepare plan",
        body: "Draft the next step.",
        priority: 2,
        source_message_ids: ["msg_1", "99"],
        action: { label: "Queue it", intent: "build_plan" },
      },
      {
        type: "ambient",
        title: "Ambient",
        body: "Fallback type",
        priority: 0,
        source_message_ids: [],
        action: undefined,
      },
    ],
    goal_pulse: [{ domain: "career", momentum: "recent", last_signal: "today" }],
  });
});

test("normalizeBriefResponse rejects payloads without a stable brief date", () => {
  assert.equal(normalizeBriefResponse({ sections: [] }), null);
});

test("normalizeGoalsPulseResponse maps active goals into guarded pulse items", () => {
  assert.deepEqual(normalizeGoalsPulseResponse({
    goals: [
      { domain: "finance", momentum: "building", last_signal_at: "2026-08-11" },
      { domain: "unsupported", momentum: "bad" },
      "bad",
    ],
  }), [
    { domain: "finance", momentum: "building", last_signal: "2026-08-11" },
    { domain: "other", momentum: "quiet", last_signal: undefined },
  ]);
});
