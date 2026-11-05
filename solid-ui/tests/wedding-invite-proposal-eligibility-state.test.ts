import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingVendor } from "../src/lib/api.ts";
import { weddingInviteProposalRecipientEligibility } from "../src/lib/weddingInviteProposalEligibilityState.ts";

function vendor(patch: Partial<WeddingVendor> = {}): WeddingVendor {
  return {
    vendorId: "vendor-1", vendorSlug: "harbour-light-photo", vendorName: "Harbour Light Photo",
    category: "photographer", serviceArea: "Sydney NSW", contactEmail: "studio@example.test",
    status: "active", claimStatus: "unclaimed", linkedAgentId: null,
    evidence: {}, caveatLabels: [], photos: [], rooms: [], userContact: null,
    ...patch,
  } as unknown as WeddingVendor;
}

const candidate = { vendorId: "vendor-1", vendorName: "Harbour Light Photo", category: "Wedding photographers", email: "studio@example.test" };

test("verified claimed vendor uses its authenticated private channel", () => {
  const result = weddingInviteProposalRecipientEligibility({
    candidate,
    vendorDirectory: [vendor({ claimStatus: "verified", linkedAgentId: "agent-vendor-1" })],
    requestedCategory: "Wedding photographers",
    requestedLocation: "Sydney NSW",
  });
  assert.equal(result.eligible, true);
  assert.equal(result.route, "authenticated_vendor");
});

test("verified business email and unclaimed listing use distinct routes", () => {
  const verified = weddingInviteProposalRecipientEligibility({
    candidate, vendorDirectory: [vendor({ evidence: { contact_email_verified: true } })],
    requestedCategory: "Photography", requestedLocation: "Sydney",
  });
  const referral = weddingInviteProposalRecipientEligibility({
    candidate, vendorDirectory: [vendor()], requestedCategory: "Photography", requestedLocation: "Sydney",
  });
  assert.equal(verified.route, "verified_email");
  assert.equal(referral.route, "unclaimed_referral");
});

test("category, interstate service area, ownership dispute and opt-out fail closed", () => {
  const cases: Array<[Partial<WeddingVendor>, string | null, RegExp]> = [
    [{ category: "venue" }, "Sydney NSW", /Different vendor category/],
    [{ serviceArea: "Melbourne VIC" }, "Sydney NSW", /Outside the service area/],
    [{ claimStatus: "disputed" }, "Sydney NSW", /Ownership under review/],
    [{ evidence: { proposal_opt_out: true } }, "Sydney NSW", /Does not accept invitations/],
  ];
  for (const [patch, location, label] of cases) {
    const result = weddingInviteProposalRecipientEligibility({
      candidate, vendorDirectory: [vendor(patch)], requestedCategory: "Photography", requestedLocation: location,
    });
    assert.equal(result.eligible, false);
    assert.match(result.label, label);
  }
});

test("missing directory record or delivery channel is not selectable", () => {
  const missing = weddingInviteProposalRecipientEligibility({ candidate, vendorDirectory: [], requestedCategory: "Photography" });
  const noChannel = weddingInviteProposalRecipientEligibility({
    candidate: { ...candidate, email: null }, vendorDirectory: [vendor({ contactEmail: null })], requestedCategory: "Photography",
  });
  assert.equal(missing.route, "ineligible");
  assert.equal(noChannel.route, "ineligible");
});
