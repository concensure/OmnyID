import test from "node:test";
import assert from "node:assert/strict";
import { weddingVendorChoiceActionState } from "../src/lib/weddingVendorChoiceActionState.ts";

test("vendor choice action derives every semantic selection intent", () => {
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "unknown" }).intent, "CHECK_AVAILABILITY_AND_REQUEST_QUOTE");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "confirmed_available" }).intent, "REQUEST_QUOTE");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "unknown", quoteExists: true }).intent, "REVIEW_QUOTE");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "confirmed_available", bookingContractExists: true }).intent, "START_PURCHASE_OR_BOOKING");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "confirmed_unavailable" }).intent, "VIEW_EVIDENCE");
});

test("an existing quote never starts duplicate outreach", () => {
  const action = weddingVendorChoiceActionState({ availabilityState: "unknown", quoteExists: true });
  assert.deepEqual(action, { intent: "REVIEW_QUOTE", label: "Review quote", startsOutreach: false });
});
