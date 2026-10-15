import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicPreferenceProfile, mergePreferenceProfile } from "../src/lib/weddingPreferenceProfileState.ts";
import { matchWeddingVendorFacets } from "../src/lib/weddingVendorFacetMatchState.ts";

test("deterministic profiles retain anchors and report unmapped phrases", () => {
  const profile = buildDeterministicPreferenceProfile({ topPriorities: ["Intimacy"], atmosphereDescription: "relaxed garden", preferences: "moonlit opera courtyard" });
  assert.ok(profile.facets.some((facet) => facet.facetId === "scale.intimate" && facet.anchor === "Intimacy" && facet.weight === "strong"));
  assert.ok(profile.facets.some((facet) => facet.facetId === "atmosphere.relaxed"));
  assert.ok(profile.unmapped.includes("moonlit opera courtyard"));
});

test("user profile confirmation wins and unknown facet evidence remains neutral", () => {
  const base = buildDeterministicPreferenceProfile({ topPriorities: ["Intimacy"] });
  const profile = mergePreferenceProfile(base, { facets: [{ facetId: "scale.intimate", weight: "must", polarity: 1, anchor: "Intimacy", anchorSource: "priority", confidence: 1, authority: "user" }], unmapped: [] });
  assert.equal(profile.facets.find((facet) => facet.facetId === "scale.intimate")?.authority, "user");
  const match = matchWeddingVendorFacets(profile, []);
  assert.equal(match.value, 0.5);
  assert.equal(match.confidence, 0);
  assert.equal(match.perFacet[0]?.outcome, "unknown");
});
