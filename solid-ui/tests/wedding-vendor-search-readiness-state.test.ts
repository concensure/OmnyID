import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorSearchReadinessState } from "../src/lib/weddingVendorSearchReadinessState.ts";

test("buildWeddingVendorSearchReadinessState blocks generic vendor searches without intake", () => {
  const state = buildWeddingVendorSearchReadinessState({});

  assert.equal(state.status, "blocked");
  assert.ok(state.missing.includes("wedding location or service area"));
  assert.ok(state.missing.includes("vendor categories needed"));
  assert.ok(state.missing.includes("vendor fit preferences"));
  assert.ok(state.guardrails.some((guardrail) => /Do not recommend specific vendors/i.test(guardrail)));
});

test("buildWeddingVendorSearchReadinessState distinguishes photography scope", () => {
  const state = buildWeddingVendorSearchReadinessState({
    location: "Hunter Valley",
    vendorCategories: ["photographer"],
    vendorPreferences: "editorial style, calm communication",
    liveSearchProviderReady: false,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.missing.some((missing) => /photography scope/i.test(missing)));
});

test("buildWeddingVendorSearchReadinessState allows structured briefs before live provider search", () => {
  const state = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["photographer", "band"],
    vendorPreferences: "natural photos, acoustic music, transparent pricing",
    photographyScope: "day-of coverage and shot list",
    musicOrBandNeeded: "yes",
    liveSearchProviderReady: false,
  });

  assert.equal(state.status, "partial");
  assert.match(state.label, /structured search brief/i);
  assert.ok(state.missing.includes("live vendor-search provider"));
  assert.ok(state.searchBrief.some((line) => /photographer, band/i.test(line)));
  assert.ok(state.searchQueries.some((query) => /Sydney wedding photographer packages price/i.test(query)));
  assert.ok(state.searchQueries.some((query) => /Sydney wedding band reviews/i.test(query)));
});

test("buildWeddingVendorSearchReadinessState marks ready only with provider proof", () => {
  const state = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["celebrant"],
    vendorPreferences: "public registry-style option",
    liveSearchProviderReady: true,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.missing.length, 0);
});
