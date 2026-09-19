import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingWeatherProviderReadinessState } from "@/lib/weddingWeatherProviderReadinessState";

test("buildWeddingWeatherProviderReadinessState passes fresh verified forecast evidence", () => {
  const state = buildWeddingWeatherProviderReadinessState({
    provider: "bom",
    providerConnected: true,
    forecastLocationsRequested: 2,
    forecastLocationsVerified: 2,
    maxForecastAgeMinutes: 45,
    hasSourceTimestamp: true,
    hasUserFacingCaveat: true,
    hasFallbackManualCheck: true,
    errorCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /2\/2 forecast locations verified/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /source timestamp/i.test(label)));
});

test("buildWeddingWeatherProviderReadinessState treats manual fallback as handoff only", () => {
  const state = buildWeddingWeatherProviderReadinessState({
    providerConnected: false,
    forecastLocationsRequested: 1,
    forecastLocationsVerified: 0,
    hasUserFacingCaveat: true,
    hasFallbackManualCheck: true,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual-check handoff/i);
  assert.ok(state.blockerLabels.some((label) => /provider is not connected/i.test(label)));
});

test("buildWeddingWeatherProviderReadinessState blocks stale partial or uncaveated forecasts", () => {
  const state = buildWeddingWeatherProviderReadinessState({
    provider: "open_meteo",
    providerConnected: true,
    forecastLocationsRequested: 2,
    forecastLocationsVerified: 1,
    maxForecastAgeMinutes: 240,
    hasSourceTimestamp: false,
    hasUserFacingCaveat: false,
    hasFallbackManualCheck: false,
    errorCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /Not every requested wedding location/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /fresher than 180 minutes/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /timestamp/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /uncertainty caveat/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /1 weather provider error/i.test(label)));
});
