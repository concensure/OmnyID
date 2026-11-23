import test from "node:test";
import assert from "node:assert/strict";

import {
  collectPinnedFeedIdsInVisibleOrder,
  normalizePinnedFeedNavIndex,
} from "../src/lib/dashboardFeedPinnedNav.ts";

test("collectPinnedFeedIdsInVisibleOrder follows current visible card order", () => {
  const visibleIds = ["card-c", "card-a", "card-b", "card-d"];
  const pinnedIds = new Set(["card-a", "card-d", "card-z"]);
  assert.deepEqual(
    collectPinnedFeedIdsInVisibleOrder(visibleIds, pinnedIds),
    ["card-a", "card-d"],
  );
});

test("normalizePinnedFeedNavIndex clamps empty and wraps non-empty indexes", () => {
  assert.equal(normalizePinnedFeedNavIndex(3, 0), 0);
  assert.equal(normalizePinnedFeedNavIndex(0, 3), 0);
  assert.equal(normalizePinnedFeedNavIndex(3, 3), 0);
  assert.equal(normalizePinnedFeedNavIndex(-1, 3), 2);
});
