import test from "node:test";
import assert from "node:assert/strict";

import {
  approvalMessageContent,
  approvalReviewForMessage,
  autonomyDecisionForMessage,
} from "../src/lib/approvalReviewState.ts";
import type { AfpMessage } from "../src/lib/api.ts";

function approvalMessage(overrides: Partial<AfpMessage> = {}): AfpMessage {
  return {
    id: "msg_approval_1",
    thread_id: "thread_approval_1",
    from: "agent:test",
    to: "agent:user",
    timestamp: "2026-08-15T10:00:00.000Z",
    type: "approval_request",
    subtype: null,
    content: {},
    metadata: {},
    views: [],
    ...overrides,
  };
}

test("approval message content prefers view content over message content", () => {
  const message = approvalMessage({
    content: {
      title: "wrong",
      approval_review: { title: "Wrong review" },
    },
  });

  const content = approvalMessageContent(message, {
    content: {
      title: "right",
      approval_review: { title: "Right review" },
    },
  });

  assert.equal(content.title, "right");
  assert.deepEqual(content.approval_review, { title: "Right review" });
});

test("approval review for message uses view content before metadata fallback", () => {
  const message = approvalMessage({
    metadata: {
      approval_review: {
        title: "Metadata review",
        reason: "from metadata",
      },
    },
  });

  const reviewFromView = approvalReviewForMessage(message, {
    content: {
      approval_review: {
        title: "View review",
        reason: "from view",
      },
    },
  });
  const reviewFromMetadata = approvalReviewForMessage(message);

  assert.equal(reviewFromView?.title, "View review");
  assert.equal(reviewFromView?.reason, "from view");
  assert.equal(reviewFromMetadata?.title, "Metadata review");
  assert.equal(reviewFromMetadata?.reason, "from metadata");
});

test("autonomy decision for message uses content before metadata fallback", () => {
  const message = approvalMessage({
    content: {
      autonomy_decision: {
        autonomy_level: "soft_confirm",
        reason: "from content",
      },
    },
    metadata: {
      autonomy_decision: {
        autonomy_level: "hard_confirm",
        reason: "from metadata",
      },
    },
  });

  const fromContent = autonomyDecisionForMessage(message);
  const fromView = autonomyDecisionForMessage(message, {
    content: {
      autonomy_decision: {
        autonomy_level: "silent",
        reason: "from view",
      },
    },
  });

  assert.equal(fromContent?.autonomy_level, "soft_confirm");
  assert.equal(fromContent?.reason, "from content");
  assert.equal(fromView?.autonomy_level, "silent");
  assert.equal(fromView?.reason, "from view");
});

test("autonomy decision for message falls back to autonomy tiers when structured policy is absent", () => {
  const message = approvalMessage({
    metadata: {
      autonomy_tier: "ask_always",
    },
  });

  const fromMetadata = autonomyDecisionForMessage(message);
  const fromView = autonomyDecisionForMessage(message, {
    content: {
      autonomy_tier: "notify_then_act",
    },
  });

  assert.equal(fromMetadata?.autonomy_level, "ask_always");
  assert.equal(fromView?.autonomy_level, "notify_then_act");
});

test("autonomy decision for message ignores malformed proactive autonomy tiers", () => {
  const message = approvalMessage({
    metadata: {
      autonomy_tier: "hard_confirm",
    },
  });

  const fromMetadata = autonomyDecisionForMessage(message);
  const fromView = autonomyDecisionForMessage(message, {
    content: {
      autonomy_tier: "definitely_auto",
    },
  });

  assert.equal(fromMetadata, null);
  assert.equal(fromView, null);
});
