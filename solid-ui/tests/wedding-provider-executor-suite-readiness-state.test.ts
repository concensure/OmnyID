import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProviderExecutorSuiteReadinessState,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";
import { buildWeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";

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
    "Brave Search, EXA Search, Google Places, or OSM/Overpass provider readiness proof is missing.",
  ]);
});

test("connected app suite readiness reports stale credentials and missing actions", () => {
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
  assert.ok(state.blockerLabels.includes("Google Calendar or calendar provider connected app action is missing."));
  assert.ok(state.nextActionLabels.some((label) => /Reconnect/i.test(label)));
});

test("connected app suite readiness can require durable proof references", () => {
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
  assert.ok(blocked.blockerLabels.some((label) => /Brave Search, EXA Search, Google Places, or OSM\/Overpass provider.*durable connected app proof reference/i.test(label)));
  assert.ok(blocked.nextActionLabels.some((label) => /Attach a durable connected app proof/i.test(label)));
  assert.equal(ready.productionEvidenceReady, true);
  assert.ok(ready.proofReferenceLabels.some((label) => /vendor-search-smoke:ok/i.test(label)));
});

test("connected app suite readiness rejects local receipt ids and display links as proof refs", () => {
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
  assert.ok(state.blockerLabels.some((label) => /local, dry-run, placeholder, receipt, or display/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Attach a durable connected app proof/i.test(label)));
});

test("connected app suite readiness rejects placeholder proof refs", () => {
  const providers = [
    { capability: "email", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "calendar", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "registry", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "vendor_search", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
  ];
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    providers,
    proofReferencePolicy: "required",
    executorProofRefs: {
      email: "test:email-smoke",
      calendar: "dry-run:calendar-smoke",
      registry: "placeholder:registry-smoke",
      vendor_search: "vendor-search:fake:latest",
    },
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.status, "blocked");
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.ok(state.checks.every((check) => check.proofRef === null));
  assert.equal(
    state.blockerLabels.filter((label) => /local, dry-run, placeholder, receipt, or display/i.test(label)).length,
    4,
  );
});

test("connected app suite readiness rejects test proof tokens but allows smoke receipts", () => {
  const providers = [
    { capability: "email", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
  ];
  const blocked = buildWeddingProviderExecutorSuiteReadinessState({
    providers,
    requiredCapabilities: ["email"],
    proofReferencePolicy: "required",
    executorProofRefs: { email: "gmail:test:latest" },
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.checks[0]?.proofRef, null);

  const ready = buildWeddingProviderExecutorSuiteReadinessState({
    providers,
    requiredCapabilities: ["email"],
    proofReferencePolicy: "required",
    executorProofRefs: { email: "gmail:prod-smoke:2026-09-28" },
  });

  assert.equal(ready.status, "ready");
  assert.equal(ready.checks[0]?.proofRef, "gmail:prod-smoke:2026-09-28");
});

test("connected app suite readiness rejects duplicate proof refs across capabilities", () => {
  const providers = [
    { capability: "email", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    { capability: "calendar", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
  ];
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    providers,
    requiredCapabilities: ["email", "calendar"],
    proofReferencePolicy: "required",
    executorProofRefs: {
      email: "provider-smoke:shared-proof-1",
      calendar: "provider-smoke:shared-proof-1",
    },
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.status, "blocked");
  assert.equal(state.checks[0]?.status, "blocked");
  assert.equal(state.checks[1]?.status, "blocked");
  assert.equal(
    state.blockerLabels.filter((label) => /unique durable connected app proof reference/i.test(label)).length,
    2,
  );
  assert.ok(state.nextActionLabels.some((label) => /separate durable connected app proof/i.test(label)));
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
    "Brave Search, EXA Search, Google Places, or OSM/Overpass provider readiness proof is missing.",
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

  assert.equal(blocked.requiredProvider, "Brave Search, EXA Search, Google Places, or OSM/Overpass provider");
  assert.equal(blocked.productionReady, false);
  assert.equal(blocked.setupView, "connected_apps");
  assert.match(blocked.detail, /needs a connected app/i);
  assert.equal(ready.productionReady, true);
  assert.match(ready.summary, /EXA Search, Google Places, or OSM\/Overpass provider ready/i);
});

test("provider executor suite readiness bounds durable proof labels", () => {
  const longProofRef = `gmail:message-${"x".repeat(400)}`;
  const state = buildWeddingProviderExecutorSuiteReadinessState({
    requiredCapabilities: ["email"],
    proofReferencePolicy: "required",
    executorProofRefs: { email: `  ${longProofRef}  ` },
    providers: [
      {
        capability: "email",
        requiredProvider: "Gmail or email provider",
        credentialStatus: "connected",
        executorStatus: "available",
        productionReady: true,
      } as any,
    ],
  });

  assert.equal(state.status, "ready");
  assert.ok((state.checks[0]?.proofRef?.length ?? 0) <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH);
  assert.ok(state.checks[0]?.proofRef?.endsWith("..."));
  assert.ok(state.proofReferenceLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
});
