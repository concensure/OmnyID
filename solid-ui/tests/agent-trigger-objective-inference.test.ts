import assert from "node:assert/strict";
import test from "node:test";

import { inferAgentTriggerObjectiveSuggestion } from "../src/lib/agentTriggerObjectiveInference.ts";

test("agent trigger objective inference suggests morning and weekly cron schedules", () => {
  assert.deepEqual(
    inferAgentTriggerObjectiveSuggestion("Send a morning summary every day at 8am"),
    { cron: "0 8 * * *" },
  );
  assert.deepEqual(
    inferAgentTriggerObjectiveSuggestion("Prepare a weekly brief every Monday"),
    { cron: "0 9 * * 1" },
  );
});

test("agent trigger objective inference detects interval triggers", () => {
  assert.deepEqual(
    inferAgentTriggerObjectiveSuggestion("Run an hourly heartbeat check"),
    { kind: "interval", intervalMinutes: "60" },
  );
});

test("agent trigger objective inference detects webhook and message triggers", () => {
  assert.deepEqual(
    inferAgentTriggerObjectiveSuggestion("Trigger on webhook http request"),
    { kind: "webhook" },
  );
  assert.deepEqual(
    inferAgentTriggerObjectiveSuggestion("Trigger on message in inbox"),
    { kind: "message" },
  );
});

test("agent trigger objective inference combines timing and trigger kind hints", () => {
  assert.deepEqual(
    inferAgentTriggerObjectiveSuggestion("Webhook for evening processing at 6 pm"),
    { kind: "webhook", cron: "0 18 * * 1-5" },
  );
});
