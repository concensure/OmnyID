import test from "node:test";
import assert from "node:assert/strict";

import { weddingVendorFitWord } from "../src/lib/weddingVendorComparisonPresentationState.ts";
import type { WeddingVendorRankedCandidate } from "../src/lib/weddingVendorRankingState.ts";

function candidate(overrides: Partial<WeddingVendorRankedCandidate> = {}): WeddingVendorRankedCandidate {
  return {
    id: "vendor-1", rank: 1, title: "Venue", provider: "directory", url: "https://example.com",
    websiteUrl: "https://example.com", mapUrl: null, imageUrl: null, address: null, phone: null,
    email: null, instagramUrl: null, snippet: "", rooms: [], score: 0, matchedPreferenceTokens: [],
    preferenceMatchLabel: "", situationFitLabel: "", verificationLabel: "Verified official website",
    rationaleLabels: [], group: "verify", fit: null, fitLabel: "Fit not yet assessable",
    confidence: 0, confidenceBucket: "low", confidenceLabel: "low confidence", priorityMatchLabel: "",
    availabilityState: "unknown", availabilityLabel: "Availability unknown", vendorId: "vendor-1",
    riskFlags: [], unknownHardConstraints: ["availability"], components: [], evoi: null,
    exclusionReason: null, hasOfficialWebsite: true,
    ...overrides,
  };
}

test("source verification alone does not claim suitability", () => {
  assert.equal(weddingVendorFitWord(candidate()), "Suggested option");
});

test("suitability labels require preference evidence and material confirmation", () => {
  const components = [
    { id: "location", label: "Location", weight: 1, value: 0.9, confidence: 0.9, known: true },
    { id: "capacity", label: "Capacity", weight: 1, value: 0.9, confidence: 0.9, known: true },
  ];
  assert.equal(weddingVendorFitWord(candidate({ fit: 78, confidenceBucket: "high", components })), "Strong match");
  assert.equal(weddingVendorFitWord(candidate({ fit: 78, confidenceBucket: "high", components, availabilityState: "confirmed_available", unknownHardConstraints: [] })), "Verified match");
});
