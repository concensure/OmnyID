import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentTriggerConfig } from "../src/lib/agentTriggerConfig.ts";

test("agent trigger config builds scheduled trigger payloads", () => {
  assert.deepEqual(
    buildAgentTriggerConfig({
      kind: "scheduled",
      objective: " Morning brief ",
      cron: "0 8 * * *",
      intervalMinutes: "30",
      webhookPath: "/ignored",
    }),
    {
      objective: "Morning brief",
      cron: "0 8 * * *",
    },
  );
});

test("agent trigger config builds interval trigger payloads with fallback minutes", () => {
  assert.deepEqual(
    buildAgentTriggerConfig({
      kind: "interval",
      objective: "Heartbeat",
      cron: "ignored",
      intervalMinutes: "not-a-number",
      webhookPath: "/ignored",
    }),
    {
      objective: "Heartbeat",
      interval_minutes: 60,
    },
  );
});

test("agent trigger config builds webhook payloads with fallback path", () => {
  assert.deepEqual(
    buildAgentTriggerConfig({
      kind: "webhook",
      objective: "Inbound hook",
      cron: "ignored",
      intervalMinutes: "15",
      webhookPath: "",
    }),
    {
      objective: "Inbound hook",
      path: "/hook/agent",
    },
  );
});

test("agent trigger config leaves message triggers with objective-only payloads", () => {
  assert.deepEqual(
    buildAgentTriggerConfig({
      kind: "message",
      objective: "Watch VIP inbox",
      cron: "ignored",
      intervalMinutes: "15",
      webhookPath: "/ignored",
    }),
    {
      objective: "Watch VIP inbox",
    },
  );
});
