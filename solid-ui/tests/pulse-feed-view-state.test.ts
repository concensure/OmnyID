import test from "node:test";
import assert from "node:assert/strict";

import {
  pulseFeedDeleteChannelState,
  pulseFeedDismissedItems,
  pulseFeedSavedItems,
  pulseFeedSelectActiveChannelId,
  pulseFeedShouldLoadChannelItems,
  pulseFeedUpsertChannel,
  pulseFeedVisibleItems,
} from "../src/lib/pulseFeedViewState.ts";
import type { PulseNewsChannel, PulseNewsItem } from "../src/lib/pulseFeedResponseState.ts";

function makeChannel(overrides: Partial<PulseNewsChannel> = {}): PulseNewsChannel {
  return {
    channel_id: "chan_1",
    label: "Tech Feed",
    categories: ["technology"],
    granularity: "summaries",
    frequency: "daily",
    sources: [],
    enabled: true,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function makeItem(overrides: Partial<PulseNewsItem> = {}): PulseNewsItem {
  return {
    id: "item_1",
    channel_id: "chan_1",
    goal_relevance: false,
    categories: ["technology"],
    dismissed: false,
    saved_to_knowledge: false,
    ...overrides,
  };
}

test("pulseFeedVisibleItems removes dismissed rows from the feed", () => {
  assert.deepEqual(
    pulseFeedVisibleItems([
      makeItem({ id: "item_1", dismissed: false }),
      makeItem({ id: "item_2", dismissed: true }),
    ]).map((item) => item.id),
    ["item_1"],
  );
});

test("pulseFeedSelectActiveChannelId preserves a valid selection and falls back to the first channel", () => {
  const channels = [makeChannel({ channel_id: "chan_1" }), makeChannel({ channel_id: "chan_2" })];
  assert.equal(pulseFeedSelectActiveChannelId(channels, "chan_2"), "chan_2");
  assert.equal(pulseFeedSelectActiveChannelId(channels, "missing"), "chan_1");
  assert.equal(pulseFeedSelectActiveChannelId([], "chan_2"), null);
});

test("pulseFeedShouldLoadChannelItems only reloads when the selected channel changes", () => {
  assert.equal(pulseFeedShouldLoadChannelItems(null, "chan_1"), true);
  assert.equal(pulseFeedShouldLoadChannelItems("chan_1", "chan_1"), false);
  assert.equal(pulseFeedShouldLoadChannelItems("chan_1", "chan_2"), true);
  assert.equal(pulseFeedShouldLoadChannelItems("chan_1", null), false);
});

test("pulseFeedUpsertChannel adds new channels and replaces existing ones", () => {
  const channels = [makeChannel({ channel_id: "chan_1", label: "Old label" })];
  assert.deepEqual(
    pulseFeedUpsertChannel(channels, makeChannel({ channel_id: "chan_1", label: "New label" })).map((channel) => channel.label),
    ["New label"],
  );
  assert.deepEqual(
    pulseFeedUpsertChannel(channels, makeChannel({ channel_id: "chan_2", label: "Second" })).map((channel) => channel.channel_id),
    ["chan_1", "chan_2"],
  );
});

test("pulseFeedDeleteChannelState returns the next stable active channel", () => {
  const channels = [
    makeChannel({ channel_id: "chan_1" }),
    makeChannel({ channel_id: "chan_2" }),
  ];

  assert.deepEqual(
    pulseFeedDeleteChannelState(channels, "chan_1", "chan_1"),
    {
      channels: [makeChannel({ channel_id: "chan_2" })],
      activeChannelId: "chan_2",
    },
  );

  assert.equal(
    pulseFeedDeleteChannelState(channels, "chan_2", "chan_1").activeChannelId,
    "chan_2",
  );
});

test("pulseFeedDismissedItems and pulseFeedSavedItems update item state predictably", () => {
  const items = [
    makeItem({ id: "item_1" }),
    makeItem({ id: "item_2" }),
  ];

  assert.deepEqual(
    pulseFeedDismissedItems(items, "item_1").map((item) => item.id),
    ["item_2"],
  );
  assert.equal(
    pulseFeedSavedItems(items, "item_2").find((item) => item.id === "item_2")?.saved_to_knowledge,
    true,
  );
});
