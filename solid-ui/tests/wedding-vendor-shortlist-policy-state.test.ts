import assert from "node:assert/strict";
import test from "node:test";

import {
  isWeddingVendorMvpSuitable,
  selectWeddingVendorCategory,
  selectWeddingVendorShortlist,
  weddingVendorMaterialFingerprint,
  weddingVendorShortlistMedia,
  type WeddingVendorShortlistCandidate,
} from "../src/lib/weddingVendorShortlistPolicyState.ts";

function candidate(id: string, group: "bookable" | "verify" = "bookable", overrides: Partial<WeddingVendorShortlistCandidate> = {}): WeddingVendorShortlistCandidate {
  return {
    id, vendorId: id, canonicalId: id, title: `Vendor ${id}`, group, category: "Venue",
    url: `https://${id}.example`, websiteUrl: `https://${id}.example`, email: null, phone: null, imageUrl: null, availabilityState: "unknown", ...overrides,
  };
}

test("shortlist selects exactly three in bookable then verify order for directory counts zero through four", () => {
  for (const count of [0, 1, 2]) {
    const result = selectWeddingVendorShortlist({ targetCategory: "Venue", bookable: Array.from({ length: count }, (_, index) => candidate(String(index + 1))) });
    assert.equal(result.status, "needs_online_shortfall");
    assert.equal(result.shortfall, 3 - count);
  }
  const complete = selectWeddingVendorShortlist({ targetCategory: "Venue", bookable: [candidate("1"), candidate("2")], verify: [candidate("3", "verify"), candidate("4", "verify")] });
  assert.equal(complete.status, "complete");
  assert.deepEqual(complete.candidates.map((item) => item.id), ["1", "2", "3"]);
});

test("shortlist removes canonical duplicates and unsuitable booked, excluded, category, and contactless candidates", () => {
  const duplicate = candidate("second", "bookable", { canonicalId: "one" });
  const result = selectWeddingVendorShortlist({
    targetCategory: "Venue",
    bookable: [candidate("one"), duplicate, candidate("booked", "bookable", { group: "booked" }), candidate("wrong", "bookable", { category: "Florist" }), candidate("no-route", "bookable", { url: "", websiteUrl: null })],
    verify: [candidate("three", "verify"), candidate("four", "verify")],
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.candidates.map((item) => item.id), ["one", "three", "four"]);
  assert.equal(isWeddingVendorMvpSuitable(candidate("excluded", "bookable", { group: "excluded" }), "Venue"), false);
});

test("media is always verified photo or an honest placeholder", () => {
  assert.deepEqual(weddingVendorShortlistMedia({ vendorName: "Harbour House", imageUrl: "https://images.example/harbour.jpg" }), {
    kind: "verified_photo", url: "https://images.example/harbour.jpg", alt: "Harbour House vendor photo", label: "Vendor photo",
  });
  const placeholder = weddingVendorShortlistMedia({ vendorName: "Harbour House", imageUrl: "javascript:bad" });
  assert.equal(placeholder.kind, "placeholder");
  assert.match(placeholder.label, /placeholder/i);
  assert.doesNotMatch(placeholder.label, /verified/i);
});

test("category policy honours explicit intent, detects competing priorities, and fingerprints material inputs", () => {
  assert.equal(selectWeddingVendorCategory({ explicitCategory: "Florist", onboardingPriorities: ["Venue"], unbookedCategories: ["Venue"] }).category, "Florist");
  assert.equal(selectWeddingVendorCategory({ onboardingPriorities: ["Venue", "Florist"], unbookedCategories: ["Venue", "Florist"] }).status, "ambiguous");
  const stable = weddingVendorMaterialFingerprint({ weddingPlanId: "plan", category: "Venue", location: "Sydney", priorities: ["budget", "style"] });
  assert.equal(stable, weddingVendorMaterialFingerprint({ weddingPlanId: "plan", category: " venue ", location: "Sydney", priorities: ["style", "budget"] }));
  assert.notEqual(stable, weddingVendorMaterialFingerprint({ weddingPlanId: "plan", category: "Florist", location: "Sydney", priorities: ["style", "budget"] }));
});
