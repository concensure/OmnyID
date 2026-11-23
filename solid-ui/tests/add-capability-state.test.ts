import test from "node:test";
import assert from "node:assert/strict";

import {
  submitAddCapabilityState,
  validateAddCapabilityInput,
} from "../src/lib/addCapabilityState.ts";

test("validateAddCapabilityInput rejects empty names and duplicate field names", () => {
  assert.deepEqual(
    validateAddCapabilityInput("", [{ name: "", type: "string" }]),
    {
      kind: "invalid",
      validationError: "Name is required.",
      duplicateFieldIndex: -1,
    },
  );

  assert.deepEqual(
    validateAddCapabilityInput("email_guardian", [
      { name: "recipient", type: "string" },
      { name: "recipient", type: "string" },
    ]),
    {
      kind: "invalid",
      validationError: "Field names must be unique.",
      duplicateFieldIndex: 1,
    },
  );
});

test("validateAddCapabilityInput accepts valid capability definitions", () => {
  assert.deepEqual(
    validateAddCapabilityInput("email_guardian", [
      { name: "recipient", type: "string" },
      { name: "urgent", type: "boolean" },
    ]),
    {
      kind: "valid",
      validationError: "",
      duplicateFieldIndex: -1,
    },
  );
});

test("submitAddCapabilityState builds the normalized payload for capability creation", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const result = await submitAddCapabilityState(
    {
      name: " email_guardian ",
      description: " Protect the inbox ",
      fields: [
        { name: "recipient", type: "string" },
        { name: "urgent", type: "boolean" },
        { name: "   ", type: "number" },
      ],
    },
    {
      async register(payload) {
        calls.push(payload as Record<string, unknown>);
        return undefined;
      },
    },
  );

  assert.deepEqual(result, {
    kind: "success",
    error: null,
  });
  assert.deepEqual(calls, [{
    name: "email_guardian",
    description: "Protect the inbox",
    input_schema: {
      type: "object",
      properties: {
        recipient: { type: "string" },
        urgent: { type: "boolean" },
      },
      required: ["recipient", "urgent"],
    },
    version: "1.0.0",
    tags: [],
    approval_mode: "suggest_only",
  }]);
});

test("submitAddCapabilityState returns normalized failure receipts", async () => {
  const result = await submitAddCapabilityState(
    {
      name: "email_guardian",
      description: "",
      fields: [{ name: "recipient", type: "string" }],
    },
    {
      async register() {
        throw new Error("403 forbidden");
      },
    },
  );

  assert.equal(result.kind, "failure");
  assert.equal(result.error?.tone, "danger");
  assert.match(result.error?.title ?? "", /fresh sign-in/i);
});
