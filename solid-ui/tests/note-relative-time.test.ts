import assert from "node:assert/strict";
import test from "node:test";

import { noteRelativeTime } from "../src/lib/noteRelativeTime.ts";

test("note relative time humanizes recent note timestamps", () => {
  const now = Date.now();
  assert.equal(noteRelativeTime(new Date(now - 15_000).toISOString()), "just now");
  assert.equal(noteRelativeTime(new Date(now - 5 * 60_000).toISOString()), "5m ago");
  assert.equal(noteRelativeTime(new Date(now - 2 * 60 * 60_000).toISOString()), "2h ago");
  assert.equal(noteRelativeTime(new Date(now - 3 * 24 * 60 * 60_000).toISOString()), "3d ago");
});
