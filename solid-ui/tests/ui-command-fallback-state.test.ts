import test from "node:test";
import assert from "node:assert/strict";

import { readUiCommandFallbackNotice } from "../src/lib/uiCommandFallbackState.ts";

test("readUiCommandFallbackNotice returns null when there is no fallback boundary", () => {
  assert.equal(readUiCommandFallbackNotice(null), null);
  assert.equal(readUiCommandFallbackNotice({ boundary: null }), null);
  assert.equal(readUiCommandFallbackNotice({ boundary: ["command_fallback"] as never }), null);
  assert.equal(
    readUiCommandFallbackNotice({
      boundary: { kind: "approval_boundary", label: "Approval", detail: "Human review required." },
    }),
    null,
  );
});

test("readUiCommandFallbackNotice returns normalized fallback copy", () => {
  assert.deepEqual(
    readUiCommandFallbackNotice({
      boundary: {
        kind: "command_fallback",
        label: "Deterministic fallback",
        detail: "No LLM backend is connected.",
        llm_connected: false,
      },
    }),
    {
      label: "AI model not connected",
      detail: "No LLM backend is connected.",
      actionLabel: "Connect AI model",
      actionView: "agent_settings",
      tone: "amber",
    },
  );
});

test("readUiCommandFallbackNotice uses defaults when boundary copy is blank", () => {
  assert.deepEqual(
    readUiCommandFallbackNotice({
      boundary: {
        kind: "command_fallback",
        label: "   ",
        detail: "",
      },
    }),
    {
      label: "Deterministic fallback",
      detail: "This result came from a non-LLM fallback path.",
      tone: "neutral",
    },
  );
});

test("readUiCommandFallbackNotice preserves neutral fallback when llm flag is absent", () => {
  assert.deepEqual(
    readUiCommandFallbackNotice({
      boundary: {
        kind: "command_fallback",
        label: "Deterministic fallback",
        detail: "This result used a deterministic shortcut.",
        llm_connected: null,
      },
    }),
    {
      label: "Deterministic fallback",
      detail: "This result used a deterministic shortcut.",
      tone: "neutral",
    },
  );
});
