import assert from "node:assert/strict";
import test from "node:test";

import { rankWeddingVendorCandidates, type WeddingVendorAttributeEvidence, type WeddingVendorRankingSource } from "../src/lib/weddingVendorRankingState.ts";
import {
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE,
} from "./fixtures/wedding-vendor-personalised-recommendation-baseline.ts";

const now = new Date("2026-10-15T00:00:00Z");
const attr = (value: unknown): WeddingVendorAttributeEvidence => ({ status: "known", value, confidence: 0.9, authority: "primary_official" });

function venue(id: string, attributes: Record<string, WeddingVendorAttributeEvidence>, snippet = "") : WeddingVendorRankingSource {
  return { id, title: id, provider: "Directory", url: `https://${id}.example.test`, websiteUrl: `https://${id}.example.test`, mapUrl: null, imageUrl: null, address: "Bondi NSW", phone: null, email: null, instagramUrl: null, snippet, category: "venue", attributes };
}

test("policy v2 is opt-in and changes the documented sparse Bondi result from v1", () => {
  const v1 = rankWeddingVendorCandidates({ sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE], requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS, now });
  const v2 = rankWeddingVendorCandidates({ sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE], requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS, rankingPolicy: "2", now });
  assert.equal(v1.verify[0]?.fit, 38);
  assert.equal(v2.verify[0]?.fit, 52);
  assert.equal(v2.verify[0]?.fitUpper, 71);
  assert.equal(v2.verify[0]?.availabilityProbability, 0.5);
});

test("policy v2 does not reward a sparse keyword echo above structured style evidence", () => {
  const sparse = venue("sparse", {}, "intimate waterfront coastal garden rustic venue");
  const evidenced = venue("evidenced", { style_tags: attr(["intimate", "waterfront", "coastal"]), editorial_summary: attr("An intimate waterfront wedding venue.") });
  const result = rankWeddingVendorCandidates({ sources: [sparse, evidenced], requirements: { vendorCategories: ["venue"], preferences: "intimate waterfront coastal" }, rankingPolicy: "2", now });
  assert.deepEqual(result.verify.map((candidate) => candidate.id), ["evidenced", "sparse"]);
});

test("policy v2 retains hard capacity vetoes, keeps unknown availability actionable, and is deterministic", () => {
  const tooSmall = venue("small", { capacity_seated_max: attr(40), style_tags: attr(["waterfront"]) });
  const unknown = venue("unknown", { capacity_seated_max: attr(150), style_tags: attr(["waterfront"]) });
  const input = { sources: [tooSmall, unknown], requirements: { vendorCategories: ["venue"], guestCount: "100", preferences: "waterfront" }, rankingPolicy: "2" as const, now };
  const first = rankWeddingVendorCandidates(input);
  const second = rankWeddingVendorCandidates(input);
  assert.deepEqual(first.excluded.map((candidate) => candidate.id), ["small"]);
  assert.deepEqual(first.verify.map((candidate) => candidate.id), ["unknown"]);
  assert.deepEqual(second, first);
});

test("policy v2 attaches evidence-backed reasons and vetoes a decisive must-have conflict", () => {
  const source = venue("industrial", { style_facets: attr(["aesthetic.ornate_glam"]) });
  const preferenceProfile = { facets: [{ facetId: "aesthetic.modern_minimal", weight: "must" as const, polarity: 1 as const, anchor: "Minimal", anchorSource: "priority" as const, confidence: 1, authority: "user" as const }], unmapped: [] };
  const result = rankWeddingVendorCandidates({ sources: [source], requirements: { vendorCategories: ["venue"] }, preferenceProfile, rankingPolicy: "2", now });
  assert.deepEqual(result.excluded.map((candidate) => candidate.id), ["industrial"]);
  assert.ok(result.excluded[0]?.reasons?.every((reason) => reason.polarity === "unknown" || reason.evidence.length > 0));
});

test("policy v2 records the top-priority component shift and component ledger rows", () => {
  const result = rankWeddingVendorCandidates({ sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE], requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS, rankingPolicy: "2", now });
  const candidate = result.verify[0];
  assert.ok((candidate?.components.find((component) => component.id === "style")?.weightShift ?? 0) < 0);
  assert.equal(candidate?.components.find((component) => component.id === "capacity")?.weightShift, 0.06);
  assert.deepEqual(candidate?.reasons?.map((reason) => reason.id).filter((id) => ["location", "cost", "capacity", "quality"].includes(id)), ["capacity", "cost", "location", "quality"]);
  assert.equal(candidate?.reasons?.find((reason) => reason.id === "location")?.polarity, "pro");
  assert.equal(candidate?.reasons?.find((reason) => reason.id === "cost")?.polarity, "unknown");
  assert.equal(candidate?.reasonLedgerDebug?.droppedUnsupportedReasons, 0);
});

test("policy v2 keeps one strongest reason for a multi-facet couple anchor", () => {
  const preferenceProfile = { facets: [
    { facetId: "aesthetic.modern_minimal", weight: "strong" as const, polarity: 1 as const, anchor: "Modern and warm", anchorSource: "priority" as const, confidence: 1, authority: "user" as const },
    { facetId: "atmosphere.warm", weight: "strong" as const, polarity: 1 as const, anchor: "Modern and warm", anchorSource: "priority" as const, confidence: 1, authority: "user" as const },
  ], unmapped: [] };
  const result = rankWeddingVendorCandidates({ sources: [venue("anchored", { style_facets: attr(["aesthetic.modern_minimal", "atmosphere.warm"]) })], requirements: { vendorCategories: ["venue"] }, preferenceProfile, rankingPolicy: "2", now });
  assert.equal(result.verify[0]?.reasons?.filter((reason) => reason.anchor === "Modern and warm").length, 1);
});
