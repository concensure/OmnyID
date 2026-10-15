import assert from "node:assert/strict";
import test from "node:test";
import { deriveWeddingVendorFacets } from "../src/lib/weddingVendorFacetDerivationState.ts";
import { WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE } from "./fixtures/wedding-vendor-personalised-recommendation-baseline.ts";

const attr = (value: unknown, confidence = 0.8) => ({ status: "known" as const, value, confidence, authority: "primary_official" });
const ids = (input: Parameters<typeof deriveWeddingVendorFacets>[0]) => deriveWeddingVendorFacets(input).map((facet) => facet.facetId);

test("Bondi derives setting, beach-tag and view facets without a scale guess", () => {
  const facets = deriveWeddingVendorFacets({ source: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE });
  assert.ok(facets.some((facet) => facet.facetId === "setting.waterfront"));
  assert.ok(facets.some((facet) => facet.facetId === "setting.beach"));
  assert.ok(facets.some((facet) => facet.facetId === "experience.views_led"));
  assert.equal(facets.some((facet) => facet.facetId.startsWith("scale.")), false);
});

test("room and capacity evidence derive scale facets with provenance and no persistence", () => {
  const source = { ...WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE, attributes: { capacity_seated_max: attr(300, 0.9) }, rooms: [] };
  assert.ok(ids({ source, guestCount: 40 }).includes("scale.large"));
  const roomSource = { ...source, rooms: [
    { room_id: "small", name: "Small", pricing_label: null, price_from_cents: null, minimum_spend_cents: null, minimum_spend_note: null, capacity_seated: 50, capacity_standing: null, inclusions: [], availability_note: null, photo_urls: [] },
    { room_id: "large", name: "Large", pricing_label: null, price_from_cents: null, minimum_spend_cents: null, minimum_spend_note: null, capacity_seated: 200, capacity_standing: null, inclusions: [], availability_note: null, photo_urls: [] },
  ] };
  const intimate = deriveWeddingVendorFacets({ source: roomSource, guestCount: 45 }).find((facet) => facet.facetId === "scale.intimate");
  assert.equal(intimate?.confidence, 0.9);
  assert.equal(intimate?.evidence[0]?.attributeKey, "capacity_seated_max");
});

test("stored and derived copies retain the highest confidence and every evidence item", () => {
  const source = { ...WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE, attributes: {
    style_tags: attr(["waterfront"], 0.5), style_facets: attr(["setting.waterfront"], 0.95),
  } };
  const waterfront = deriveWeddingVendorFacets({ source }).find((facet) => facet.facetId === "setting.waterfront");
  assert.equal(waterfront?.confidence, 0.95);
  assert.ok((waterfront?.evidence.length ?? 0) >= 2);
});
