import test from "node:test";
import assert from "node:assert/strict";

import { WEDDING_MOBILE_TABS, weddingMobileTabForMenu } from "../src/lib/weddingMobileTabState.ts";
import type { WeddingWorkspaceMenuId } from "../src/lib/weddingWorkspaceMenuState.ts";

test("wedding mobile navigation exposes exactly five stable destinations", () => {
  assert.deepEqual(WEDDING_MOBILE_TABS.map((tab) => tab.label), ["Today", "Vendors", "Budget", "Plan", "More"]);
});

test("wedding mobile navigation maps every workspace menu into one destination", () => {
  const expected: Record<WeddingWorkspaceMenuId, string> = {
    home: "home",
    response_queue: "vendors",
    budget: "budget",
    timeline: "plan",
    people: "more",
    plan: "plan",
    tasks: "plan",
    vision: "more",
    documents: "more",
    guests: "more",
    inspiration: "more",
    seating: "more",
    helpers: "more",
    advanced: "more",
  };
  for (const [menu, tab] of Object.entries(expected)) {
    assert.equal(weddingMobileTabForMenu(menu as WeddingWorkspaceMenuId), tab);
  }
});
