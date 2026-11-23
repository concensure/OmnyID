import test from "node:test";
import assert from "node:assert/strict";
import { weddingVendorChoiceActionState } from "../src/lib/weddingVendorChoiceActionState.ts";

test("vendor choice action derives every semantic selection intent", () => {
  const unknown = weddingVendorChoiceActionState({ availabilityState: "unknown" });
  assert.equal(unknown.intent, "CHECK_AVAILABILITY_AND_REQUEST_QUOTE");
  assert.equal(unknown.label, "Prepare enquiry");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "confirmed_available" }).intent, "CHECK_AVAILABILITY_AND_REQUEST_QUOTE");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "unknown", outreachStage: "draft_ready" }).label, "Review enquiry");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "unknown", quoteExists: true }).intent, "REVIEW_QUOTE");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "confirmed_available", bookingContractExists: true }).intent, "START_PURCHASE_OR_BOOKING");
  assert.equal(weddingVendorChoiceActionState({ availabilityState: "confirmed_unavailable" }).intent, "VIEW_EVIDENCE");
});

test("an existing quote never starts duplicate outreach", () => {
  const action = weddingVendorChoiceActionState({ availabilityState: "unknown", quoteExists: true });
  assert.deepEqual(action, { intent: "REVIEW_QUOTE", label: "Compare quote", startsOutreach: false });
});
