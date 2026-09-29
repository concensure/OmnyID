import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorSearchProviderPlanState } from "../src/lib/weddingVendorSearchProviderPlanState.ts";
import { buildWeddingVendorSearchReadinessState } from "../src/lib/weddingVendorSearchReadinessState.ts";

const readiness = buildWeddingVendorSearchReadinessState({
  location: "Sydney",
  vendorCategories: ["venue", "floral_designer", "photographer"],
  vendorPreferences: "transparent pricing, waterfront, documentary photos",
  photographyScope: "day-of coverage and wedding portraits",
  liveSearchProviderReady: true,
});

test("provider plan creates Google Places place-type queries from wedding intake", () => {
  const plan = buildWeddingVendorSearchProviderPlanState({
    readiness,
    providerKinds: ["google_places"],
    maxCategories: 2,
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.providerPlans.length, 1);
  assert.equal(plan.providerPlans[0]?.providerKind, "google_places");
  assert.equal(plan.providerPlans[0]?.queries.length, 2);
  assert.deepEqual(plan.providerPlans[0]?.queries[0]?.googlePlaceTypes, ["event_venue", "restaurant", "lodging"]);
  assert.deepEqual(plan.providerPlans[0]?.queries[1]?.googlePlaceTypes, ["florist"]);
  assert.match(plan.providerPlans[0]?.queries[0]?.query ?? "", /wedding venue near Sydney/i);
  assert.ok(plan.providerPlans[0]?.queries[0]?.expectedFields.includes("place id"));
});

test("provider plan uses approximate location for venue search when venue area is not specified", () => {
  const approximateReadiness = buildWeddingVendorSearchReadinessState({
    location: "Sydney, Australia",
    vendorCategories: ["venue"],
    vendorPreferences: "waterfront ceremony",
    liveSearchProviderReady: true,
  });
  const plan = buildWeddingVendorSearchProviderPlanState({
    readiness: approximateReadiness,
    providerKinds: ["google_places", "brave_search"],
    maxCategories: 1,
    approximateLocation: "Sydney, Australia",
  });

  assert.match(plan.providerPlans[0]?.queries[0]?.query ?? "", /wedding venue near Sydney, Australia/i);
  assert.match(plan.providerPlans[1]?.queries[0]?.query ?? "", /wedding venue near Sydney, Australia services packages/i);
});

test("provider plan carries photography scope and music direction into live-search queries", () => {
  const scopedReadiness = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["photographer", "band"],
    vendorPreferences: "transparent pricing, calm communication",
    photographyScope: "day-of coverage and editorial portraits",
    musicOrBandNeeded: "yes",
    liveSearchProviderReady: true,
  });
  const plan = buildWeddingVendorSearchProviderPlanState({
    readiness: scopedReadiness,
    providerKinds: ["brave_search"],
    maxCategories: 2,
  });

  assert.match(plan.providerPlans[0]?.queries[0]?.query ?? "", /day-of coverage and editorial portraits/i);
  assert.match(plan.providerPlans[0]?.queries[1]?.query ?? "", /music entertainment needed/i);
});

test("provider plan creates Overpass tag queries as open fallback", () => {
  const plan = buildWeddingVendorSearchProviderPlanState({
    readiness,
    providerKinds: ["overpass"],
    maxCategories: 3,
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.providerPlans[0]?.providerKind, "overpass");
  assert.deepEqual(plan.providerPlans[0]?.queries[0]?.overpassTags, [
    "amenity=events_venue",
    "amenity=community_centre",
    "tourism=hotel",
  ]);
  assert.deepEqual(plan.providerPlans[0]?.queries[1]?.overpassTags, ["shop=florist"]);
  assert.deepEqual(plan.providerPlans[0]?.queries[2]?.overpassTags, ["craft=photographer"]);
  assert.ok(plan.providerPlans[0]?.guardrails.some((guardrail) => /rate limit/i.test(guardrail)));
});

test("provider plan orders Google Places, Brave, then Overpass by default", () => {
  const plan = buildWeddingVendorSearchProviderPlanState({
    readiness,
    maxCategories: 1,
  });

  assert.deepEqual(plan.providerPlans.map((provider) => provider.providerKind), [
    "google_places",
    "brave_search",
    "overpass",
  ]);
  assert.equal(plan.queryCount, 3);
  assert.match(plan.summary, /3 provider-specific/i);
});

test("provider plan stays blocked when intake is incomplete", () => {
  const blocked = buildWeddingVendorSearchReadinessState({});
  const plan = buildWeddingVendorSearchProviderPlanState({ readiness: blocked });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.queryCount, 0);
  assert.ok(plan.missing.includes("wedding location or service area"));
});
