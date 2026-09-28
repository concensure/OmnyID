import test from "node:test";
import assert from "node:assert/strict";

import {
  parseWorkflowJsonRecord,
  workflowJsonAppliedFeedback,
  workflowJsonInvalidFeedback,
} from "../src/lib/workflowJsonEditorState.ts";

test("parseWorkflowJsonRecord accepts JSON objects", () => {
  assert.deepEqual(parseWorkflowJsonRecord('{"temperature":0.2}'), {
    ok: true,
    value: { temperature: 0.2 },
  });
});

test("parseWorkflowJsonRecord rejects malformed and non-object JSON", () => {
  const malformed = parseWorkflowJsonRecord("{bad");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.match(malformed.message, /JSON|property|position|unexpected/i);
  assert.deepEqual(parseWorkflowJsonRecord("[]"), {
    ok: false,
    message: "Expected a JSON object.",
  });
  assert.deepEqual(parseWorkflowJsonRecord("null"), {
    ok: false,
    message: "Expected a JSON object.",
  });
});

test("workflow JSON editor feedback helpers preserve config and policy copy", () => {
  assert.equal(workflowJsonInvalidFeedback("config", "Expected a JSON object."), "Invalid config JSON: Expected a JSON object.");
  assert.equal(workflowJsonInvalidFeedback("policy", "Unexpected token"), "Invalid policy JSON: Unexpected token");
  assert.equal(workflowJsonAppliedFeedback("config"), "Applied node config JSON.");
  assert.equal(workflowJsonAppliedFeedback("policy"), "Applied node policy JSON.");
});
