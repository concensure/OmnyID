import assert from "node:assert/strict";
import test from "node:test";

import {
  loadWeddingGuestOperationsLocalState,
  saveWeddingGuestOperationsLocalState,
  weddingGuestOperationsScopeFromMetadata,
  weddingGuestOperationsStorageKey,
} from "@/lib/weddingGuestOperationsLocalState";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("weddingGuestOperationsScopeFromMetadata prefers response workspace ids", () => {
  assert.equal(weddingGuestOperationsScopeFromMetadata({
    response_workspace_id: "response_workspace:snake",
    weddingPlanId: "wedding_plan:camel",
  }), "response_workspace:snake");

  assert.equal(weddingGuestOperationsScopeFromMetadata({
    wedding_plan_id: "wedding_plan:snake",
  }), "wedding_plan:snake");

  assert.equal(weddingGuestOperationsScopeFromMetadata(null), "wedding");
});

test("loadWeddingGuestOperationsLocalState normalizes saved guest drafts", () => {
  const storage = new MemoryStorage();
  storage.setItem(weddingGuestOperationsStorageKey("workspace-a"), JSON.stringify({
    guests: [
      { name: "  Alex Lee  ", group: "  Bride family ", rsvp: " Attending " },
      { name: "   ", group: "Ignored", rsvp: "Pending" },
      { name: "Sam", group: "", rsvp: "" },
      "bad-entry",
    ],
    rules: [" No extra plus-ones ", "", " Children by name only "],
    rsvpOverrides: {
      " guest:1 ": " Attending ",
      "": "Ignored",
      "guest:2": "",
    },
  }));

  const state = loadWeddingGuestOperationsLocalState("workspace-a", storage);

  assert.deepEqual(state.guests, [
    { name: "Alex Lee", group: "Bride family", rsvp: "Attending" },
    { name: "Sam", group: "Ungrouped", rsvp: "Pending" },
  ]);
  assert.deepEqual(state.rules, ["No extra plus-ones", "Children by name only"]);
  assert.deepEqual(state.rsvpOverrides, { "guest:1": "Attending" });
});

test("loadWeddingGuestOperationsLocalState handles malformed browser data", () => {
  const storage = new MemoryStorage();
  storage.setItem(weddingGuestOperationsStorageKey("workspace-a"), "{not json");

  assert.deepEqual(loadWeddingGuestOperationsLocalState("workspace-a", storage), {
    guests: [],
    rules: [],
    rsvpOverrides: {},
  });
});

test("saveWeddingGuestOperationsLocalState caps local drafts and reports storage failures", () => {
  const storage = new MemoryStorage();
  const guests = Array.from({ length: 83 }, (_, index) => ({
    name: `Guest ${index}`,
    group: "Friends",
    rsvp: "Pending",
  }));
  const rules = Array.from({ length: 14 }, (_, index) => `Rule ${index}`);

  assert.equal(saveWeddingGuestOperationsLocalState("workspace-a", {
    guests,
    rules,
    rsvpOverrides: { " guest:1 ": " Not attending ", "guest:2": "" },
  }, storage), true);

  const saved = loadWeddingGuestOperationsLocalState("workspace-a", storage);
  assert.equal(saved.guests.length, 80);
  assert.equal(saved.guests[0]?.name, "Guest 3");
  assert.equal(saved.rules.length, 12);
  assert.equal(saved.rules.at(-1), "Rule 11");
  assert.deepEqual(saved.rsvpOverrides, { "guest:1": "Not attending" });

  const failingStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.equal(saveWeddingGuestOperationsLocalState("workspace-a", { guests: [], rules: [], rsvpOverrides: {} }, failingStorage), false);
});
