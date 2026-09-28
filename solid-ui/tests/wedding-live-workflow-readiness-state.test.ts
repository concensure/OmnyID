import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingLiveWorkflowReadinessState } from "@/lib/weddingLiveWorkflowReadinessState";

test("buildWeddingLiveWorkflowReadinessState blocks live vendor search without intake basics", () => {
  const state = buildWeddingLiveWorkflowReadinessState({
    workflow: "vendor_search",
    location: "Hunter Valley",
    vendorCategories: ["florist"],
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.missing.includes("date or season"));
  assert.ok(state.missing.includes("estimated guest count"));
  assert.ok(state.missing.includes("budget comfort"));
  assert.ok(state.missing.includes("priorities or vendor fit preferences"));
  assert.match(state.label, /vendor search needs intake basics/i);
});

test("buildWeddingLiveWorkflowReadinessState marks vendor search ready with full basics", () => {
  const state = buildWeddingLiveWorkflowReadinessState({
    workflow: "vendor_search",
    dateOrSeason: "April 2027",
    location: "Hunter Valley",
    guestCount: "90",
    budgetComfort: "$45k",
    prioritiesCsv: "good food, live music, low stress",
    vendorCategories: ["florist", "band"],
  });

  assert.equal(state.status, "ready");
  assert.deepEqual(state.missing, []);
  assert.match(state.label, /ready for live vendor search/i);
});

test("buildWeddingLiveWorkflowReadinessState only hard-requires location for live evidence", () => {
  const blocked = buildWeddingLiveWorkflowReadinessState({ workflow: "live_evidence" });
  const ready = buildWeddingLiveWorkflowReadinessState({
    workflow: "live_evidence",
    location: "Bennelong Point, Sydney",
  });

  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.missing, ["wedding location or service area"]);
  assert.equal(ready.status, "ready");
});
