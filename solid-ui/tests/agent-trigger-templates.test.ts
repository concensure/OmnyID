import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_TRIGGER_STARTER_TEMPLATES } from "../src/lib/agentTriggerTemplates.ts";

test("agent trigger starter templates keep the expected stable catalog", () => {
  assert.deepEqual(AGENT_TRIGGER_STARTER_TEMPLATES, [
    {
      label: "Daily inbox summary at 8am",
      kind: "scheduled",
      cron: "0 8 * * *",
      objective: "Check my inbox, summarise emails that need a reply, and present a brief for review.",
    },
    {
      label: "Weekly planning brief every Monday",
      kind: "scheduled",
      cron: "0 9 * * 1",
      objective: "Review my calendar for the week ahead and prepare a planning brief.",
    },
    {
      label: "Alert when a VIP email arrives",
      kind: "message",
      objective: "Watch for emails from VIP contacts and alert me immediately with a summary.",
    },
  ]);
});
