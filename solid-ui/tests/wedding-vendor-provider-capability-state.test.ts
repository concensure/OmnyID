import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingConfiguredVendorSearchProviderKinds,
  weddingConfiguredVendorSearchProviderLabel,
} from "../src/lib/weddingVendorProviderCapabilityState.ts";
import type { WeddingProviderCapabilitiesResponse } from "../src/lib/api.ts";

const capabilities = (providers: WeddingProviderCapabilitiesResponse["providers"]): WeddingProviderCapabilitiesResponse => ({
  providers,
  connectedAppIds: providers.filter((provider) => provider.configured).map((provider) => provider.connectedAppId),
  guardrails: ["Only redacted readiness metadata is exposed to the browser."],
});

test("wedding provider capability state selects configured admin-funded vendor search providers", () => {
  const state = capabilities([
    {
      kind: "brave_search",
      connectedAppId: "brave-search-api",
      label: "Brave Search",
      credentialRequired: true,
      credentialConfigured: true,
      sharedCreditEnabled: true,
      configured: true,
      sourceLabel: "admin_shared",
    },
    {
      kind: "google_places",
      connectedAppId: "google-places-api",
      label: "Google Places API",
      credentialRequired: true,
      credentialConfigured: true,
      sharedCreditEnabled: true,
      configured: true,
      sourceLabel: "admin_shared",
    },
  ]);

  const kinds = weddingConfiguredVendorSearchProviderKinds(state);
  assert.deepEqual(kinds, ["brave_search", "google_places"]);
  assert.equal(weddingConfiguredVendorSearchProviderLabel(state, kinds), "Brave Search, Google Places API");
  assert.doesNotMatch(JSON.stringify(state), /api[-_]?key|secret|token/i);
});

test("wedding provider capability state excludes disabled providers and unrelated capabilities", () => {
  const state = capabilities([
    {
      kind: "brave_search",
      connectedAppId: "brave-search-api",
      label: "Brave Search",
      credentialRequired: true,
      credentialConfigured: true,
      sharedCreditEnabled: false,
      configured: false,
      sourceLabel: "admin_disabled",
    },
    {
      kind: "weatherapi",
      connectedAppId: "weatherapi",
      label: "Weather API",
      credentialRequired: true,
      credentialConfigured: true,
      sharedCreditEnabled: true,
      configured: true,
      sourceLabel: "admin_shared",
    },
    {
      kind: "overpass",
      connectedAppId: "overpass-api",
      label: "OSM / Overpass API",
      credentialRequired: false,
      credentialConfigured: true,
      sharedCreditEnabled: true,
      configured: true,
      sourceLabel: "open",
    },
  ]);

  const kinds = weddingConfiguredVendorSearchProviderKinds(state);
  assert.deepEqual(kinds, ["overpass"]);
  assert.equal(weddingConfiguredVendorSearchProviderLabel(state, kinds), "OSM / Overpass API");
});

test("wedding provider capability state falls back to a neutral label for stale or empty capabilities", () => {
  assert.deepEqual(weddingConfiguredVendorSearchProviderKinds(null), []);
  assert.equal(weddingConfiguredVendorSearchProviderLabel(null, []), "connected providers");
  assert.deepEqual(weddingConfiguredVendorSearchProviderKinds(capabilities([])), []);
});
