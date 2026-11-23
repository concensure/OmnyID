import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingLiveEvidenceArtifactState } from "@/lib/weddingLiveEvidenceArtifactState";
import type { WeddingLiveEvidenceResponse } from "@/lib/api";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

test("buildWeddingLiveEvidenceArtifactState creates a map artifact from live evidence", () => {
  const response: WeddingLiveEvidenceResponse = {
    ok: true,
    status: "verified",
    locationsRequested: 1,
    geocodes: [{
      query: "Sydney Opera House",
      formatted_address: "Bennelong Point, Sydney NSW, Australia",
      lat: -33.8568,
      lng: 151.2153,
      provider: "Google Maps Platform",
      api_key: "should-not-render",
    }],
    weather: [{
      location: { name: "Sydney", region: "New South Wales", country: "Australia" },
      forecast: {
        forecastday: [{
          date: "2026-10-03",
          day: {
            avgtemp_c: 18,
            maxtemp_c: 22,
            daily_chance_of_rain: 30,
            condition: { text: "Partly cloudy" },
          },
        }],
      },
    }],
    failures: ["debug api_key=should-not-render"],
    receiptMetadata: {
      providers: ["google_maps", "weatherapi"],
      api_key: "should-not-render",
      diagnostic: "token=should-not-render",
    },
    guardrails: ["Weather is planning evidence, not a safety guarantee."],
  };

  const state = buildWeddingLiveEvidenceArtifactState({
    metadata,
    locations: ["Sydney Opera House"],
    response,
  });

  assert.equal(state.status, "created");
  assert.equal(state.evidenceCount, 2);
  assert.equal(state.summary?.kind, "map_collection");
  assert.deepEqual(state.summary?.sourceLabels.includes("Google Maps Platform"), true);
  assert.deepEqual(state.summary?.sourceLabels.includes("WeatherAPI"), true);
  assert.match(state.markdown ?? "", /Live location and weather evidence/);
  assert.match(state.markdown ?? "", /Bennelong Point/);
  assert.match(state.markdown ?? "", /Partly cloudy/);
  assert.doesNotMatch(state.markdown ?? "", /should-not-render/);
  assert.equal((state.artifactInput?.metadata.receiptMetadata as Record<string, unknown>).api_key, undefined);
  assert.equal((state.artifactInput?.metadata.receiptMetadata as Record<string, unknown>).diagnostic, "token=[redacted]");
});

test("buildWeddingLiveEvidenceArtifactState blocks empty or failed evidence", () => {
  const state = buildWeddingLiveEvidenceArtifactState({
    metadata,
    locations: ["Sydney"],
    response: {
      ok: false,
      status: "blocked",
      locationsRequested: 1,
      geocodes: [],
      weather: [],
      failures: ["WeatherAPI is not configured."],
      receiptMetadata: {},
      guardrails: [],
    },
  });

  assert.equal(state.status, "not_created");
  assert.match(state.reason ?? "", /WeatherAPI is not configured/);
  assert.equal(state.summary, null);
});
