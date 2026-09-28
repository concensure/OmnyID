import assert from "node:assert/strict";
import test from "node:test";

import { agentTriggerSummaryText } from "../src/lib/agentTriggerSummaryPresentation.ts";

test("agent trigger summary presentation formats scheduled trigger summaries", () => {
  assert.equal(
    agentTriggerSummaryText({
      trigger_type: "scheduled",
      config_json: {
        objective: "Morning brief",
        cron: "0 8 * * *",
      },
    }),
    "Morning brief | cron: 0 8 * * *",
  );
});

test("agent trigger summary presentation formats interval and webhook summaries", () => {
  assert.equal(
    agentTriggerSummaryText({
      trigger_type: "interval",
      config_json: {
        objective: "Heartbeat",
        interval_minutes: 30,
      },
    }),
    "Heartbeat | every 30 min",
  );
  assert.equal(
    agentTriggerSummaryText({
      trigger_type: "webhook",
      config_json: {
        objective: "Inbound webhook",
        path: "/agent/hook",
      },
    }),
    "Inbound webhook | path: /agent/hook",
  );
});

test("agent trigger summary presentation falls back to objective or trigger type", () => {
  assert.equal(
    agentTriggerSummaryText({
      trigger_type: "message",
      config_json: {
        objective: "Watch VIP inbox",
      },
    }),
    "Watch VIP inbox",
  );
  assert.equal(
    agentTriggerSummaryText({
      trigger_type: "custom",
      config_json: {},
    }),
    "custom",
  );
});
