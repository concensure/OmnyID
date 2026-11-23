import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSocialComposerPostsResponse,
  parseSocialComposerPublishResponse,
  parseSocialComposerSuggestionsResponse,
} from "../src/lib/socialComposerResponseState.ts";

test("parseSocialComposerPostsResponse keeps valid posts and normalizes counters", () => {
  assert.deepEqual(
    parseSocialComposerPostsResponse({
      posts: [
        {
          id: " post-1 ",
          platform: "linkedin",
          content: "Hello",
          publishedAt: "2026-08-12T00:00:00Z",
          likes: 2,
          reposts: -1,
          replies: "3",
        },
        { id: "post-2", platform: "mastodon", content: "No", publishedAt: "now" },
      ],
    }),
    [{
      id: "post-1",
      platform: "linkedin",
      content: "Hello",
      publishedAt: "2026-08-12T00:00:00Z",
      likes: 2,
      reposts: 0,
      replies: 0,
    }],
  );
});

test("parseSocialComposerSuggestionsResponse keeps complete supported suggestions", () => {
  assert.deepEqual(
    parseSocialComposerSuggestionsResponse({
      suggestions: [
        { id: "s1", kind: "tone", label: "Tone", body: "Sharper", action: " Rewrite " },
        { id: "s2", kind: "unsupported", label: "Bad", body: "No" },
      ],
    }),
    [{ id: "s1", kind: "tone", label: "Tone", body: "Sharper", action: "Rewrite" }],
  );
});

test("parseSocialComposerPublishResponse accepts only non-empty ids", () => {
  assert.equal(parseSocialComposerPublishResponse({ post_id: " post-1 " }), "post-1");
  assert.equal(parseSocialComposerPublishResponse({ post_id: "" }), null);
  assert.equal(parseSocialComposerPublishResponse({}), null);
});
