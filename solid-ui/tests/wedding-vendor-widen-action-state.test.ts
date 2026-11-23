import assert from "node:assert/strict";
import test from "node:test";
import { rankWeddingVendorCandidates, type WeddingVendorAttributeEvidence, type WeddingVendorRankingRequirements, type WeddingVendorRankingSource } from "@/lib/weddingVendorRankingState";
import { rerankWeddingVendorWithWiden, weddingVendorNearMisses, weddingVendorWidenActions } from "@/lib/weddingVendorWidenActionState";

const attribute = (value: unknown): WeddingVendorAttributeEvidence => ({ status: "known", value, confidence: 0.9, authority: "primary_official" });
const source: WeddingVendorRankingSource = {
  id: "cocktail-house", title: "Cocktail House", provider: "Directory", url: "https://cocktail.example", websiteUrl: null, mapUrl: null, imageUrl: null, address: "Sydney NSW", phone: null, email: null, instagramUrl: null, snippet: "Venue", category: "venue",
  attributes: { capacity_seated_max: attribute(80), capacity_standing_max: attribute(140) },
};

test("near misses explain their binding constraint and widening re-ranks without mutating input", () => {
  const requirements: WeddingVendorRankingRequirements = { vendorCategories: ["venue"], guestCount: "100" };
  const result = rankWeddingVendorCandidates({ sources: [source], requirements, rankingPolicy: "2", now: new Date("2026-10-16T00:00:00Z") });
  assert.deepEqual(weddingVendorNearMisses(result), [{ id: "cocktail-house", title: "Cocktail House", constraint: "seated capacity 80 is below your 100 guests" }]);
  assert.ok(weddingVendorWidenActions(result, requirements).some((action) => action.id === "allow_standing"));
  const widened = rerankWeddingVendorWithWiden({ action: "allow_standing", sources: [source], requirements, rankingPolicy: "2", now: new Date("2026-10-16T00:00:00Z") });
  assert.deepEqual(widened.result.excluded, []);
  assert.equal(widened.result.verify[0]?.id, "cocktail-house");
  assert.equal(requirements.preferences, undefined);
});
