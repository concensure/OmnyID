import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePulseChannelsResponse,
  normalizePulseGoalsResponse,
  normalizePulseItemsResponse,
  normalizePulseNewsChannel,
} from "../src/lib/pulseFeedResponseState.ts";

test("normalizePulseChannelsResponse keeps valid channels and defaults unsupported fields", () => {
  const channels = normalizePulseChannelsResponse({
    channels: [
      {
        channel_id: "chan_1",
        label: 123,
        categories: ["technology", "unsupported", "finance"],
        locality: 99,
        granularity: "unsupported",
        frequency: "realtime",
        sources: [" https://example.com/feed.xml ", "", { url: "bad" }],
        enabled: "yes",
        created_at: "2026-08-01T00:00:00Z",
      },
      { label: "missing id" },
    ],
  });

  assert.deepEqual(channels, [{
    channel_id: "chan_1",
    label: "123",
    categories: ["technology", "finance"],
    locality: undefined,
    granularity: "summaries",
    frequency: "realtime",
    sources: ["https://example.com/feed.xml"],
    goal_id: undefined,
    enabled: true,
    created_at: "2026-08-01T00:00:00Z",
  }]);
});

test("normalizePulseItemsResponse filters malformed rows and scalar fields", () => {
  const items = normalizePulseItemsResponse({
    items: [
      {
        id: "item_1",
        channel_id: "chan_1",
        url: "https://example.com/story",
        headline: "Story",
        reading_time_min: Number.NaN,
        goal_relevance: "true",
        categories: ["science", "bad"],
        dismissed: true,
        saved_to_knowledge: false,
      },
      { id: "missing channel" },
    ],
  });

  assert.deepEqual(items, [{
    id: "item_1",
    channel_id: "chan_1",
    url: "https://example.com/story",
    headline: "Story",
    summary: undefined,
    source_name: undefined,
    published_at: undefined,
    reading_time_min: undefined,
    goal_relevance: false,
    categories: ["science"],
    deep_content: undefined,
    dismissed: true,
    saved_to_knowledge: false,
  }]);
});

test("normalizePulseGoalsResponse requires stable goal ids and titles", () => {
  assert.deepEqual(
    normalizePulseGoalsResponse({
      goals: [
        { goal_id: "goal_1", domain: "career", title: "Launch" },
        { goal_id: "missing title" },
      ],
    }),
    [{ goal_id: "goal_1", domain: "career", title: "Launch" }],
  );
});

test("normalizePulseNewsChannel returns null when save response omits channel id", () => {
  assert.equal(normalizePulseNewsChannel({ label: "No id" }), null);
  assert.equal(normalizePulseNewsChannel({ channel_id: "chan_2" })?.label, "Untitled channel");
});
