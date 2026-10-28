import assert from "node:assert/strict";
import test from "node:test";

import {
  dismissWeddingVendorFollowUp,
  saveWeddingVendorFollowUpDate,
} from "../src/lib/weddingVendorFollowUpActions.ts";

const card = {
  vendorId: null,
  vendorName: "Harbour House",
} as never;

test("follow-up reminder rejects past dates and persists a future AFP reminder", async () => {
  const inputs: Array<{ type: string; subtype?: string | null }> = [];
  assert.equal(await saveWeddingVendorFollowUpDate({
    card,
    date: "2020-01-01",
    metadata: {},
    saveProjection: async (input) => inputs.push(input),
  }), false);
  assert.equal(inputs.length, 0);

  assert.equal(await saveWeddingVendorFollowUpDate({
    card,
    date: "2099-01-01",
    metadata: {},
    saveProjection: async (input) => inputs.push(input),
  }), true);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0]?.type, "wedding_vendor_follow_up_reminder");
});

test("closing a follow-up writes the account-scoped AFP dismissal event", async () => {
  const inputs: Array<{ type: string; subtype?: string | null }> = [];
  let refreshed = false;
  assert.equal(await dismissWeddingVendorFollowUp({
    card,
    metadata: {},
    saveProjection: async (input) => inputs.push(input),
    onSaved: () => { refreshed = true; },
  }), true);
  assert.equal(inputs[0]?.type, "wedding_vendor_follow_up_dismissed");
  assert.equal(refreshed, true);
});
