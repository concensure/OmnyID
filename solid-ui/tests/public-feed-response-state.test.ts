import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePublicArticle,
  normalizePublicFeedResponse,
} from "../src/lib/publicFeedResponseState.ts";

test("normalizePublicFeedResponse keeps valid articles and filters malformed feed rows", () => {
  assert.deepEqual(normalizePublicFeedResponse({
    items: [
      {
        id: "msg_1",
        thread_id: 42,
        from_agent: "agent_a",
        type: "",
        content: { title: " Launch ", body: 123, text: false },
        timestamp: 999,
        engagement: { views: 3.9, shares: -1, replies: Number.NaN },
      },
      { id: "missing agent" },
      null,
    ],
  }), [{
    id: "msg_1",
    thread_id: "42",
    from_agent: "agent_a",
    type: "article",
    content: { title: "Launch", body: "123", text: "false" },
    timestamp: "999",
    engagement: { views: 3, shares: 0, replies: 0 },
  }]);
});

test("normalizePublicArticle accepts scalar content and omits missing engagement", () => {
  assert.deepEqual(normalizePublicArticle({
    id: "msg_2",
    from_agent: "agent_b",
    content: true,
  }), {
    id: "msg_2",
    thread_id: "",
    from_agent: "agent_b",
    type: "article",
    content: "true",
    timestamp: "",
    engagement: undefined,
  });
});

test("normalizePublicArticle rejects records without stable message id or agent id", () => {
  assert.equal(normalizePublicArticle({ from_agent: "agent" }), null);
  assert.equal(normalizePublicArticle({ id: "msg" }), null);
});
