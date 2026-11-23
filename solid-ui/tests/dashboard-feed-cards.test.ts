import test from "node:test";
import assert from "node:assert/strict";

import {
  collectDashboardDismissedMessages,
  collectDashboardRenderableMessages,
  collectDashboardVisibleCards,
  countDashboardNewCards,
  countDashboardOldCards,
} from "../src/lib/dashboardFeedCards.ts";
import type { AfpMessage } from "../src/lib/api.ts";

function makeMessage(id: string, type: string, timestamp: string): AfpMessage {
  return {
    id,
    thread_id: "thread-1",
    sender: "agent",
    type,
    timestamp,
    content: {},
    kind: null,
    supertags: [],
  };
}

test("collectDashboardRenderableMessages excludes card section updates", () => {
  const messages = [
    makeMessage("card-1", "generative_card", "2026-07-01T00:00:00.000Z"),
    makeMessage("update-1", "card_section_update", "2026-07-01T00:01:00.000Z"),
    makeMessage("search-1", "search_result", "2026-07-01T00:02:00.000Z"),
  ];

  assert.deepEqual(
    collectDashboardRenderableMessages(messages).map((message) => message.id),
    ["card-1", "search-1"],
  );
});

test("countDashboardOldCards counts only renderable unpinned undismissed cards", () => {
  const now = Date.parse("2026-07-04T00:00:00.000Z");
  const messages = [
    makeMessage("card-1", "generative_card", "2026-06-29T00:00:00.000Z"),
    makeMessage("update-1", "card_section_update", "2026-06-29T00:05:00.000Z"),
    makeMessage("card-2", "search_result", "2026-06-29T01:00:00.000Z"),
    makeMessage("card-3", "search_result", "2026-07-03T23:00:00.000Z"),
  ];

  assert.equal(
    countDashboardOldCards(messages, new Set(["card-2"]), new Set(["card-9"]), now),
    1,
  );
});

test("collectDashboardDismissedMessages ignores hidden update messages", () => {
  const messages = [
    makeMessage("card-1", "generative_card", "2026-07-01T00:00:00.000Z"),
    makeMessage("update-1", "card_section_update", "2026-07-01T00:01:00.000Z"),
    makeMessage("card-2", "search_result", "2026-07-01T00:02:00.000Z"),
  ];

  assert.deepEqual(
    collectDashboardDismissedMessages(messages, new Set(["update-1", "card-2"])).map((message) => message.id),
    ["card-2"],
  );
});

test("collectDashboardVisibleCards does not let hidden updates consume the visible window", () => {
  const messages = [
    makeMessage("card-1", "generative_card", "2026-07-01T00:00:00.000Z"),
    makeMessage("update-1", "card_section_update", "2026-07-01T00:01:00.000Z"),
    makeMessage("card-2", "search_result", "2026-07-01T00:02:00.000Z"),
    makeMessage("update-2", "card_section_update", "2026-07-01T00:03:00.000Z"),
    makeMessage("card-3", "search_result", "2026-07-01T00:04:00.000Z"),
  ];

  assert.deepEqual(
    collectDashboardVisibleCards(messages, 2).map((message) => message.id),
    ["card-1", "card-2"],
  );
});

test("countDashboardNewCards counts all renderable cards newer than the global read marker", () => {
  const messages = [
    makeMessage("card-1", "generative_card", "2026-07-01T00:00:00.000Z"),
    makeMessage("update-1", "card_section_update", "2026-07-01T00:01:00.000Z"),
    makeMessage("card-2", "search_result", "2026-07-02T00:00:00.000Z"),
    makeMessage("card-3", "search_result", "2026-07-03T00:00:00.000Z"),
  ];

  assert.equal(
    countDashboardNewCards(messages, Date.parse("2026-07-01T12:00:00.000Z")),
    2,
  );
});
