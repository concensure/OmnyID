import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorFreshnessState } from "../src/lib/weddingVendorFreshnessState.ts";

test("buildWeddingVendorFreshnessState blocks fake freshness when vendor rows are missing", () => {
  const state = buildWeddingVendorFreshnessState({
    vendors: [
      { vendorName: "No Source Venue", category: "Venue", serviceArea: "Sydney" },
      {
        vendorName: "Bad Source Venue",
        category: "Venue",
        serviceArea: "Sydney",
        sourceUrl: "javascript:alert(1)",
      },
    ],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.vendorCount, 0);
  assert.equal(state.readyForRecommendation, false);
  assert.match(state.summary, /No source-backed vendor rows/i);
});

test("buildWeddingVendorFreshnessState requires price and availability recheck for unverified seeds", () => {
  const state = buildWeddingVendorFreshnessState({
    now: new Date("2026-09-14T12:00:00Z"),
    vendors: [
      {
        vendorSlug: "harbour-venue",
        vendorName: "Harbour Venue",
        category: "Venue",
        serviceArea: "Sydney, NSW",
        sourceUrl: "https://venue.example/weddings",
        sourceCheckedAt: "2026-09-14",
        evidence: {
          price_basis: "not verified; request quote",
          availability_basis: "not verified; request date-specific availability",
        },
      },
    ],
  });

  assert.equal(state.status, "needs_live_recheck");
  assert.equal(state.staleSourceCount, 0);
  assert.equal(state.priceRecheckCount, 1);
  assert.equal(state.availabilityRecheckCount, 1);
  assert.equal(state.readyForRecommendation, false);
  assert.match(state.actionLabels[0] ?? "", /request current quote and date-specific availability/i);
});

test("buildWeddingVendorFreshnessState marks stale sources as needing refresh even with evidence text", () => {
  const state = buildWeddingVendorFreshnessState({
    now: new Date("2026-09-14T12:00:00Z"),
    maxSourceAgeDays: 30,
    vendors: [
      {
        vendorName: "Old Florist",
        category: "Floral Designer",
        serviceArea: "Sydney, NSW",
        sourceUrl: "https://florist.example",
        sourceCheckedAt: "2026-01-01",
        evidence: {
          price_basis: "package starts at AUD 2500 on official page",
          availability_basis: "available dates shown on official page",
        },
      },
    ],
  });

  assert.equal(state.status, "needs_live_recheck");
  assert.equal(state.staleSourceCount, 1);
  assert.equal(state.priceRecheckCount, 1);
  assert.equal(state.availabilityRecheckCount, 1);
  assert.match(state.actionLabels[0] ?? "", /refresh the source page/i);
});

test("buildWeddingVendorFreshnessState allows shortlist review only with current price and availability evidence", () => {
  const state = buildWeddingVendorFreshnessState({
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: ["Photographer"],
    preferenceText: "editorial package",
    vendors: [
      {
        vendorName: "Current Photographer",
        category: "Photographer",
        serviceArea: "Sydney, NSW",
        sourceUrl: "https://photo.example",
        sourceCheckedAt: "2026-09-13",
        evidence: {
          price_basis: "official package page lists AUD 4200 wedding package",
          availability_basis: "official inquiry page confirms date-specific availability check completed",
          service_notes: ["editorial wedding photography package"],
        },
      },
    ],
  });

  assert.equal(state.status, "ready_for_shortlist_review");
  assert.equal(state.readyForRecommendation, true);
  assert.equal(state.priceRecheckCount, 0);
  assert.equal(state.availabilityRecheckCount, 0);
  assert.equal(state.rows[0]?.relevanceStatus, "matched");
  assert.match(state.actionLabels[0] ?? "", /ready for user shortlist review/i);
});

test("buildWeddingVendorFreshnessState blocks recommendation when category or location does not fit", () => {
  const state = buildWeddingVendorFreshnessState({
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: ["Photographer"],
    preferenceText: "editorial transparent pricing",
    vendors: [
      {
        vendorName: "Hunter Valley Florals",
        category: "Floral Designer",
        serviceArea: "Hunter Valley, NSW",
        sourceUrl: "https://florist.example",
        sourceCheckedAt: "2026-09-14",
        evidence: {
          price_basis: "official package page lists AUD 2500 package",
          availability_basis: "official inquiry page confirms date-specific availability check completed",
          service_notes: ["romantic floral installations"],
        },
      },
    ],
  });

  assert.equal(state.status, "needs_live_recheck");
  assert.equal(state.readyForRecommendation, false);
  assert.equal(state.rows[0]?.relevanceStatus, "blocked");
  assert.ok(state.rows[0]?.missingRelevanceLabels.some((label) => /category mismatch/i.test(label)));
  assert.ok(state.rows[0]?.missingRelevanceLabels.some((label) => /service area mismatch/i.test(label)));
  assert.ok(state.rows[0]?.recommendationBlockerLabels.some((label) => /Do not recommend/i.test(label)));
  assert.match(state.summary, /1 relevance/i);
});

test("buildWeddingVendorFreshnessState keeps incomplete preference fit as research only", () => {
  const state = buildWeddingVendorFreshnessState({
    now: new Date("2026-09-14T12:00:00Z"),
    location: "Sydney",
    selectedCategories: ["Venue"],
    preferenceText: "waterfront transparent pricing",
    vendors: [
      {
        vendorName: "Harbour Venue",
        category: "Venue",
        serviceArea: "Sydney, NSW",
        sourceUrl: "https://venue.example",
        sourceCheckedAt: "2026-09-14",
        evidence: {
          price_basis: "official package page lists AUD 12000 venue package",
          availability_basis: "official inquiry page confirms date-specific availability check completed",
          service_notes: ["waterfront ceremony terrace"],
        },
      },
    ],
  });

  assert.equal(state.rows[0]?.relevanceStatus, "partial");
  assert.ok(state.rows[0]?.relevanceLabels.some((label) => /waterfront/i.test(label)));
  assert.ok(state.rows[0]?.missingRelevanceLabels.some((label) => /transparent/i.test(label)));
  assert.ok(state.rows[0]?.recommendationBlockerLabels.some((label) => /Preference fit is incomplete/i.test(label)));
  assert.equal(state.readyForRecommendation, false);
});
