import test from "node:test";
import assert from "node:assert/strict";

import type { PublicArticle } from "@/lib/publicFeedResponseState";
import {
  publicFeedArticleBody,
  publicFeedArticleTitle,
  publicFeedDateLabel,
  publicFeedEngagementRows,
  publicFeedFollowLabel,
  publicFeedSearchHeadline,
  publicFeedSearchResults,
  publicFeedShareLabel,
} from "@/lib/publicFeedPresentationState";

function article(overrides: Partial<PublicArticle> & Pick<PublicArticle, "id" | "from_agent">): PublicArticle {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id ?? "thread-1",
    from_agent: overrides.from_agent,
    type: overrides.type ?? "article",
    content: overrides.content ?? {},
    timestamp: overrides.timestamp ?? "2026-08-31T12:00:00.000Z",
    engagement: overrides.engagement,
  };
}

test("public feed presentation centralizes title and body extraction", () => {
  const rich = article({
    id: "msg-1",
    from_agent: "atlas",
    content: { title: "Launch update", body: "System green", text: "ignored" },
  });
  const scalar = article({
    id: "msg-2",
    from_agent: "beacon",
    content: "Scalar content body",
  });

  assert.equal(publicFeedArticleTitle(rich), "Launch update");
  assert.equal(publicFeedArticleBody(rich), "System green");
  assert.equal(publicFeedArticleTitle(scalar), "Scalar content body");
  assert.equal(publicFeedArticleBody(scalar), "Scalar content body");
});

test("public feed presentation centralizes deterministic date and engagement labels", () => {
  const item = article({
    id: "msg-3",
    from_agent: "atlas",
    timestamp: "2026-08-31T23:45:00.000Z",
    engagement: { views: 12, shares: 3, replies: 2 },
  });

  assert.equal(publicFeedDateLabel(item.timestamp), "Aug 31, 2026");
  assert.deepEqual(publicFeedEngagementRows(item), ["Views 12", "Replies 2"]);
  assert.equal(publicFeedShareLabel(item, false), "Share (3)");
  assert.equal(publicFeedShareLabel(item, true), "Sharing...");
});

test("public feed presentation centralizes follow and search labels", () => {
  assert.equal(
    publicFeedFollowLabel({
      agentId: "atlas",
      followingSet: new Set<string>(["atlas"]),
      followingInProgressAgentId: null,
    }),
    "Following",
  );
  assert.equal(
    publicFeedFollowLabel({
      agentId: "atlas",
      followingSet: new Set<string>(),
      followingInProgressAgentId: "atlas",
    }),
    "Following...",
  );
  assert.equal(
    publicFeedFollowLabel({
      agentId: "atlas",
      followingSet: new Set<string>(),
      followingInProgressAgentId: null,
    }),
    "Follow",
  );
  assert.equal(publicFeedSearchHeadline("planning"), 'Agents matching "planning"');
  assert.deepEqual(publicFeedSearchResults(null), []);
});
