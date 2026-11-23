import test from "node:test";
import assert from "node:assert/strict";

import { parseCapabilityImportFile } from "../src/lib/agentSettingsCapabilityImportState.ts";

test("parseCapabilityImportFile rejects malformed capability imports", () => {
  assert.throws(() => parseCapabilityImportFile("{bad-json"), /valid JSON/);
  assert.throws(() => parseCapabilityImportFile("{}"), /JSON array/);
  assert.throws(
    () => parseCapabilityImportFile(JSON.stringify([{ name: "email_guardian", description: "Email", input_schema: [] }])),
    /name, description, and input_schema object/,
  );
});

test("parseCapabilityImportFile normalizes supported capability descriptors", () => {
  assert.deepEqual(
    parseCapabilityImportFile(JSON.stringify([
      {
        id: "ignored",
        created_at: "ignored",
        name: " email_guardian ",
        description: " Protects email ",
        input_schema: { type: "object" },
        output_schema: { type: "object" },
        version: " 2.0.0 ",
        tags: [" email ", "", 7, "privacy"],
        approval_mode: "human_approval_required",
        enabled: true,
      },
      {
        name: "quick_note",
        description: "Creates notes",
        input_schema: { type: "object" },
        output_schema: [],
        approval_mode: "unknown",
      },
    ])),
    [
      {
        name: "email_guardian",
        description: "Protects email",
        input_schema: { type: "object" },
        output_schema: { type: "object" },
        version: "2.0.0",
        tags: ["email", "privacy"],
        approval_mode: "human_approval_required",
        enabled: true,
      },
      {
        name: "quick_note",
        description: "Creates notes",
        input_schema: { type: "object" },
        output_schema: null,
        version: "1.0.0",
        tags: [],
        approval_mode: "suggest_only",
        enabled: undefined,
      },
    ],
  );
});
