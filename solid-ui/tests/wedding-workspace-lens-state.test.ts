import assert from "node:assert/strict";
import test from "node:test";

import { hasSavedWorkspaceLens, loadWorkspaceLens, nextWorkspaceLens, saveWorkspaceLens } from "@/lib/workspaceLensState";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
}

test("workspace lens defaults and preferences are account scoped", () => {
  const state = storage();
  assert.equal(loadWorkspaceLens("couple-a", "wedding", state), "wedding");
  assert.equal(hasSavedWorkspaceLens("couple-a", state), false);
  saveWorkspaceLens("couple-a", "study", state);
  assert.equal(hasSavedWorkspaceLens("couple-a", state), true);
  assert.equal(loadWorkspaceLens("couple-a", "general", state), "study");
  assert.equal(loadWorkspaceLens("couple-b", "general", state), "general");
});

test("lens switch cycles through general, Wedding and Study", () => {
  assert.equal(nextWorkspaceLens("general"), "wedding");
  assert.equal(nextWorkspaceLens("wedding"), "study");
  assert.equal(nextWorkspaceLens("study"), "general");
});
