import test from "node:test";
import assert from "node:assert/strict";

import { shellResultRendererState } from "../src/lib/shellResultRendererState.ts";
import type { AfpMessage } from "../src/lib/api.ts";

function shellMessage(overrides: Partial<AfpMessage> = {}): AfpMessage {
  return {
    id: "msg_shell_1",
    thread_id: "thread_shell_1",
    from: "agent:shell",
    to: "agent:user",
    timestamp: "2026-08-15T10:00:00.000Z",
    type: "shell_command",
    subtype: "request",
    content: {},
    metadata: {},
    views: [],
    ...overrides,
  };
}

test("shell result renderer prefers structured view content over message content", () => {
  const message = shellMessage({
    content: {
      command: "echo wrong",
      reason: "wrong reason",
      timeout_seconds: 12,
    },
  });

  const state = shellResultRendererState(message, {
    kind: "callout",
    format: "shell_result",
    content: {
      command: "echo right",
      reason: "right reason",
      timeout_seconds: 45,
      safe_mode: false,
    },
  });

  assert.equal(state.command, "echo right");
  assert.equal(state.reason, "right reason");
  assert.equal(state.timeout, 45);
  assert.equal(state.safeMode, false);
});

test("shell result renderer falls back to metadata approval review", () => {
  const message = shellMessage({
    content: {
      command: "ls",
    },
    metadata: {
      approval_review: {
        title: "Shell review",
        reason: "Needs review before execution",
        confidence: "high",
        approval_kind: "shell_command",
      },
    },
  });

  const state = shellResultRendererState(message);

  assert.equal(state.approvalReview?.title, "Shell review");
  assert.equal(state.approvalReview?.reason, "Needs review before execution");
  assert.equal(state.approvalReview?.confidence, "high");
  assert.equal(state.approvalReview?.approval_kind, "shell_command");
});
