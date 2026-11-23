import assert from "node:assert/strict";
import test from "node:test";

import { australianWeddingLocationSuggestions } from "../src/lib/australianWeddingLocationSuggestionState.ts";

const directory = [{
  vendorId: "vendor-ryde", vendorSlug: "vendor-ryde", vendorName: "Ryde Venue", category: "Venue",
  serviceArea: "Ryde, Sydney NSW", address: "1 Example Street, Ryde NSW 2112", websiteUrl: null,
  contactPhone: null, contactEmail: null, sourceUrl: null, sourceLabel: null, sourceCheckedAt: null,
  status: "active", claimStatus: "unclaimed", linkedAgentId: null, notes: null, evidence: {},
  caveatLabels: [], createdAt: "", updatedAt: "", photos: [], rooms: [], userContact: null,
}];

test("Australian wedding location suggestions label duplicate suburb names with state", () => {
  const matches = australianWeddingLocationSuggestions("Ry", directory as never[]);
  assert.equal(matches[0]?.label, "Ryde NSW");
  assert.ok(matches.every((item) => /\b(?:ACT|NSW|NT|QLD|SA|TAS|VIC|WA)$/.test(item.label)));
});

test("single-letter matching prefers Australian localities beginning with that letter", () => {
  const matches = australianWeddingLocationSuggestions("y", directory as never[]);
  assert.ok(matches.length > 0);
  assert.ok(matches.slice(0, 4).every((item) => item.locality.toLowerCase().startsWith("y")));
});
