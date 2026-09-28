import test from "node:test";
import assert from "node:assert/strict";

import {
  idlePreloadViewsForSession,
  shouldIdlePreloadViews,
  VIEW_PRELOAD_TARGETS,
} from "../src/lib/viewPreload.ts";

test("view preload policy skips constrained connections", () => {
  assert.equal(shouldIdlePreloadViews({ saveData: true, effectiveType: "4g" }), false);
  assert.equal(shouldIdlePreloadViews({ saveData: false, effectiveType: "2g" }), false);
  assert.equal(shouldIdlePreloadViews({ saveData: false, effectiveType: "slow-2g" }), false);
  assert.equal(shouldIdlePreloadViews({ saveData: false, effectiveType: "3g" }), true);
  assert.equal(shouldIdlePreloadViews(null), true);
});

test("view preload targets omit the active view only", () => {
  assert.deepEqual(VIEW_PRELOAD_TARGETS, ["threads", "workflows", "email", "note", "calendar"]);
  assert.deepEqual(
    idlePreloadViewsForSession("search"),
    ["threads", "workflows", "email", "note", "calendar"],
  );
  assert.deepEqual(
    idlePreloadViewsForSession("threads"),
    ["workflows", "email", "note", "calendar"],
  );
});

