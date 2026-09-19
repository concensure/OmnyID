import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingMapGeocodingReadinessState } from "@/lib/weddingMapGeocodingReadinessState";

test("buildWeddingMapGeocodingReadinessState passes verified geocodes and fresh routes", () => {
  const state = buildWeddingMapGeocodingReadinessState({
    provider: "google_maps",
    geocodingConnected: true,
    routingConnected: true,
    locationsRequested: 3,
    locationsVerified: 3,
    routesRequested: 2,
    routesVerified: 2,
    maxRouteAgeMinutes: 15,
    hasTravelTimeCaveat: true,
    hasFallbackMapUrl: true,
    errorCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.ok(state.evidenceLabels.some((label) => /3\/3 locations geocoded/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /2\/2 routes verified/i.test(label)));
});

test("buildWeddingMapGeocodingReadinessState treats conservative map URLs as handoff only", () => {
  const state = buildWeddingMapGeocodingReadinessState({
    geocodingConnected: false,
    routingConnected: false,
    locationsRequested: 2,
    locationsVerified: 0,
    routesRequested: 0,
    routesVerified: 0,
    hasTravelTimeCaveat: true,
    hasFallbackMapUrl: true,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /not as verified live travel data/i);
  assert.ok(state.blockerLabels.some((label) => /provider is not connected/i.test(label)));
});

test("buildWeddingMapGeocodingReadinessState blocks stale or partial route evidence", () => {
  const state = buildWeddingMapGeocodingReadinessState({
    geocodingConnected: true,
    routingConnected: true,
    locationsRequested: 2,
    locationsVerified: 1,
    routesRequested: 1,
    routesVerified: 1,
    maxRouteAgeMinutes: 95,
    hasTravelTimeCaveat: false,
    hasFallbackMapUrl: true,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /Not every requested wedding location/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /fresher than 60 minutes/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /travel-time caveat/i.test(label)));
});
