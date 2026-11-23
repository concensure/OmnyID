import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingVendorSearchProviderEnvState,
  weddingVendorSearchConnectedAppIdsFromEnv,
} from "../src/lib/weddingVendorSearchProviderEnvState.ts";
import {
  buildWeddingVendorSearchProviderReadinessFromConnectedApps,
  connectedAppsHaveWeddingVendorSearchProvider,
} from "../src/lib/weddingProviderExecutorReadinessState.ts";

test("wedding vendor search env state detects Google Places without exposing keys", () => {
  const state = buildWeddingVendorSearchProviderEnvState({
    OMNYID_GOOGLE_PLACES_API_KEY: "secret-google-key",
    OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED: "true",
  });

  assert.equal(state.productionReady, true);
  assert.deepEqual(state.connectedAppIds, ["google-places-api"]);
  assert.deepEqual(state.readyProviderLabels, ["Google Places API"]);
  assert.ok(state.guardrails.some((guardrail) => /server-side/i.test(guardrail)));
  assert.doesNotMatch(JSON.stringify(state), /secret-google-key/);
  assert.equal(connectedAppsHaveWeddingVendorSearchProvider(state.connectedAppIds), true);
});

test("wedding vendor search env state accepts file-backed Oracle secrets", () => {
  const state = buildWeddingVendorSearchProviderEnvState({
    OMNYID_BRAVE_SEARCH_API_KEY_FILE: ".secrets/omnyid_brave_search_api_key",
    OMNYID_GOOGLE_PLACES_API_KEY_FILE: ".secrets/omnyid_google_places_api_key",
    OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API_ALL_USERS_ENABLED: "true",
    OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED: "true",
  });

  assert.equal(state.productionReady, true);
  assert.deepEqual(state.connectedAppIds, ["brave-search-api", "google-places-api"]);
  assert.deepEqual(state.readyProviderLabels, ["Brave Search", "Google Places API"]);
  assert.doesNotMatch(JSON.stringify(state), /omnyid_google_places_api_key/);
});

test("wedding vendor search env state requires Overpass contact and rate-limit policy", () => {
  const partial = buildWeddingVendorSearchProviderEnvState({
    OMNYID_OVERPASS_API_URL: "https://overpass-api.de/api/interpreter",
  });
  const ready = buildWeddingVendorSearchProviderEnvState({
    OMNYID_OVERPASS_API_URL: "https://overpass-api.de/api/interpreter",
    OMNYID_OVERPASS_CONTACT_EMAIL: "ops@example.com",
    OMNYID_OVERPASS_RATE_LIMIT_PER_MINUTE: "30",
  });

  assert.equal(partial.productionReady, false);
  assert.ok(partial.missingLabels.some((label) => /Overpass endpoint, contact email/i.test(label)));
  assert.equal(ready.productionReady, true);
  assert.deepEqual(ready.connectedAppIds, ["overpass-api"]);
});

test("wedding vendor search env connected app ids feed existing readiness gate", () => {
  const connectedAppIds = weddingVendorSearchConnectedAppIdsFromEnv({
    BRAVE_SEARCH_API_KEY: "secret-brave-key",
    OMNYID_GOOGLE_PLACES_API_KEY: "secret-google-key",
    OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API_WEDDING_TEMPLATE_ENABLED: "true",
    OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED: "true",
  });
  const readiness = buildWeddingVendorSearchProviderReadinessFromConnectedApps({
    connectedAppIds,
    executorAvailable: true,
  });

  assert.deepEqual(connectedAppIds, ["brave-search-api", "google-places-api"]);
  assert.equal(readiness.capability, "vendor_search");
  assert.equal(readiness.credentialStatus, "connected");
  assert.equal(readiness.executorStatus, "available");
  assert.equal(readiness.productionReady, true);
  assert.match(readiness.requiredProvider ?? "", /Google Places/);
});

test("wedding vendor search env state funds paid wedding providers unless explicitly disabled", () => {
  const state = buildWeddingVendorSearchProviderEnvState({
    OMNYID_GOOGLE_PLACES_API_KEY: "secret-google-key",
  });
  const disabled = buildWeddingVendorSearchProviderEnvState({
    OMNYID_GOOGLE_PLACES_API_KEY: "secret-google-key",
    OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED: "false",
  });

  assert.equal(state.productionReady, true);
  assert.deepEqual(state.connectedAppIds, ["google-places-api"]);
  assert.equal(disabled.productionReady, false);
  assert.deepEqual(disabled.connectedAppIds, []);
  assert.ok(disabled.missingLabels.some((label) => /admin sharing toggle is off/i.test(label)));
  assert.doesNotMatch(JSON.stringify(state), /secret-google-key/);
});
