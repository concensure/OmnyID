import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorFollowUpPanelPresentationState } from "../src/lib/weddingVendorFollowUpPanelPresentationState.ts";

test("vendor follow-up panel labels active-only state as follow-up work", () => {
  const state = buildWeddingVendorFollowUpPanelPresentationState({
    activeCount: 2,
    closedCount: 0,
  });

  assert.equal(state.title, "Vendors to follow up");
  assert.equal(state.badgeLabel, "2 active");
  assert.match(state.descriptionLabel, /Active vendor outreach/i);
  assert.equal(state.showFollowUpTip, true);
});

test("vendor follow-up panel labels closed-only state as history", () => {
  const state = buildWeddingVendorFollowUpPanelPresentationState({
    activeCount: 0,
    closedCount: 3,
  });

  assert.equal(state.title, "Vendor history");
  assert.equal(state.badgeLabel, "3 history");
  assert.match(state.descriptionLabel, /out of the live queue/i);
  assert.equal(state.showFollowUpTip, false);
});

test("vendor follow-up panel labels mixed active and closed state", () => {
  const state = buildWeddingVendorFollowUpPanelPresentationState({
    activeCount: 1,
    closedCount: 2,
  });

  assert.equal(state.title, "Vendor follow-ups and history");
  assert.equal(state.badgeLabel, "1 active, 2 history");
  assert.match(state.descriptionLabel, /Active vendors stay in follow-up/i);
  assert.equal(state.showFollowUpTip, true);
});

test("vendor follow-up panel counts sent quote replies as history", () => {
  const state = buildWeddingVendorFollowUpPanelPresentationState({
    activeCount: 0,
    closedCount: 1,
    sentQuoteReplyCount: 2,
  });

  assert.equal(state.title, "Vendor history");
  assert.equal(state.badgeLabel, "3 history");
  assert.match(state.descriptionLabel, /out of the live queue/i);
  assert.equal(state.showFollowUpTip, false);
});
