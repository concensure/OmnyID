import test from "node:test";
import assert from "node:assert/strict";

import {
  loadShouldShowWeddingPlannerWalkthrough,
  saveWeddingPlannerWalkthroughSeen,
} from "../src/lib/weddingPlannerWalkthroughLocalState.ts";

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

test("wedding planner walkthrough defaults to showing until seen", () => {
  const storage = fakeStorage();
  assert.equal(loadShouldShowWeddingPlannerWalkthrough("user-1", storage), true);
  saveWeddingPlannerWalkthroughSeen("user-1", storage);
  assert.equal(loadShouldShowWeddingPlannerWalkthrough("user-1", storage), false);
  assert.equal(loadShouldShowWeddingPlannerWalkthrough("user-2", storage), true);
});

test("wedding planner walkthrough supports an unscoped guest flag", () => {
  const storage = fakeStorage();
  assert.equal(loadShouldShowWeddingPlannerWalkthrough(null, storage), true);
  saveWeddingPlannerWalkthroughSeen(null, storage);
  assert.equal(loadShouldShowWeddingPlannerWalkthrough(null, storage), false);
});
