import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProviderExecutorSuiteReadinessState,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";
import { buildWeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";

test("provider executor suite readiness requires email calendar registry and vendor-search coverage", () => {
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    providers: [
      { capability: "email", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
      { capability: "calendar", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
      { capability: "registry", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
      { capability: "vendor_search", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    ],
  });

  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.status, "ready");
  assert.deepEqual(state.missingCapabilityLabels, []);
});

test("provider executor suite readiness blocks partial provider proof", () => {
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    providers: [
      { capability: "email", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    ],
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.status, "blocked");
  assert.deepEqual(state.missingCapabilityLabels, [
    "Google Calendar or calendar provider readiness proof is missing.",
    "Registry provider readiness proof is missing.",
    "Brave Search, Google Places, or OSM/Overpass provider readiness proof is missing.",
  ]);
});

test("provider executor suite readiness reports stale credentials and missing executors", () => {
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    providers: [
      { capability: "email", credentialStatus: "stale", executorStatus: "available", productionReady: false } as any,
      { capability: "calendar", credentialStatus: "connected", executorStatus: "missing", productionReady: false } as any,
      { capability: "registry", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
      { capability: "vendor_search", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    ],
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.includes("Gmail or email provider credentials need reconnection."));
  assert.ok(state.blockerLabels.includes("Google Calendar or calendar provider executor implementation is missing."));
  assert.ok(state.nextActionLabels.some((label) => /Reconnect/i.test(label)));
});

test("provider executor suite readiness can require durable executor proof references", () => {
  const providers = [
    { capability: "email", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "calendar", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "registry", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "vendor_search", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
  ];
  const blocked = buildWeddingProviderExecutorSuiteReadinessState({
    providers,
    proofReferencePolicy: "required",
    executorProofRefs: {
      email: "email-smoke:ok",
      calendar: "calendar-smoke:ok",
      registry: "registry-smoke:ok",
    },
  });
  const ready = buildWeddingProviderExecutorSuiteReadinessState({
    providers,
    proofReferencePolicy: "required",
    executorProofRefs: {
      email: "email-smoke:ok",
      calendar: "calendar-smoke:ok",
      registry: "registry-smoke:ok",
      vendor_search: "vendor-search-smoke:ok",
    },
  });

  assert.equal(blocked.productionEvidenceReady, false);
  assert.ok(blocked.blockerLabels.some((label) => /Brave Search, Google Places, or OSM\/Overpass provider.*durable executor proof reference/i.test(label)));
  assert.ok(blocked.nextActionLabels.some((label) => /Attach durable executor proof/i.test(label)));
  assert.equal(ready.productionEvidenceReady, true);
  assert.ok(ready.proofReferenceLabels.some((label) => /vendor-search-smoke:ok/i.test(label)));
});

test("provider executor suite readiness rejects local receipt ids and display links as proof refs", () => {
  const providers = [
    { capability: "email", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "calendar", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
  ];
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    providers,
    requiredCapabilities: ["email", "calendar"],
    proofReferencePolicy: "required",
    executorProofRefs: {
      email: "receipt:local-email-1",
      calendar: "https://calendar.example/event-1",
    },
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.status, "blocked");
  assert.equal(state.checks[0]?.proofRef, null);
  assert.equal(state.checks[1]?.proofRef, null);
  assert.equal(state.proofReferenceLabels.length, 0);
  assert.ok(state.blockerLabels.some((label) => /local receipt ID or display link/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Attach durable executor proof/i.test(label)));
});

test("provider executor suite readiness ignores OmnyID-only sharing for external coverage", () => {
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    providers: [
      { capability: "sharing", credentialStatus: "not_required", executorStatus: "not_required", productionReady: true } as any,
      { capability: "none", credentialStatus: "not_required", executorStatus: "not_required", productionReady: true } as any,
    ],
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.missingCapabilityLabels, [
    "Gmail or email provider readiness proof is missing.",
    "Google Calendar or calendar provider readiness proof is missing.",
    "Registry provider readiness proof is missing.",
    "Brave Search, Google Places, or OSM/Overpass provider readiness proof is missing.",
  ]);
});

test("provider executor readiness can represent multi-provider vendor research proof", () => {
  const blocked = buildWeddingProviderExecutorReadinessState({
    request: null,
    capabilityOverride: "vendor_search",
    vendorSearchConnected: true,
    vendorSearchExecutorAvailable: false,
  });
  const ready = buildWeddingProviderExecutorReadinessState({
    request: null,
    capabilityOverride: "vendor_search",
    vendorSearchConnected: true,
    vendorSearchExecutorAvailable: true,
  });

  assert.equal(blocked.requiredProvider, "Brave Search, Google Places, or OSM/Overpass provider");
  assert.equal(blocked.productionReady, false);
  assert.equal(blocked.setupView, "connected_apps");
  assert.match(blocked.detail, /needs a connected app/i);
  assert.equal(ready.productionReady, true);
  assert.match(ready.summary, /Google Places, or OSM\/Overpass provider ready/i);
});
