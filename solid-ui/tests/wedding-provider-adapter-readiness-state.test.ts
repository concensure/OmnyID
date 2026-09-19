import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProviderAdapterReadinessState } from "@/lib/weddingProviderAdapterReadinessState";
import { buildWeddingProductionReadinessEvidenceState } from "@/lib/weddingProductionReadinessEvidenceState";
import { buildWeddingProviderExecutorSuiteReadinessState } from "@/lib/weddingProviderExecutorSuiteReadinessState";

test("provider adapter readiness treats dry-run ports as smoke progress, not production executors", () => {
  const state = buildWeddingProviderAdapterReadinessState({
    mode: "dry_run",
    gmailStatus: { connected: true, configured: true, gmail_email: "planner@example.com" },
    calendarConnected: true,
    registryConnected: true,
    ports: {
      sendEmail: () => ({ ok: true }),
      createCalendarEvent: () => ({ ok: true }),
      publishRegistry: () => ({ ok: true }),
    },
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.providerReadiness.map((provider) => provider.executorStatus), [
    "missing",
    "missing",
    "missing",
  ]);
  assert.ok(state.providerReadiness.every((provider) => provider.productionReady === false));
  assert.equal(state.smokeTestProgressLabels.length, 3);
  assert.ok(state.livePortLabels.includes("email live port registered"));
});

test("provider adapter readiness marks live connected ports as production evidence", () => {
  const state = buildWeddingProviderAdapterReadinessState({
    mode: "live",
    gmailStatus: { connected: true, configured: true, gmail_email: "planner@example.com" },
    calendarConnected: true,
    registryConnected: true,
    ports: {
      sendEmail: () => ({ ok: true }),
      createCalendarEvent: () => ({ ok: true }),
      publishRegistry: () => ({ ok: true }),
    },
  });

  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.providerReadiness.map((provider) => provider.executorStatus), [
    "available",
    "available",
    "available",
  ]);
  assert.deepEqual(state.providerReadiness.map((provider) => provider.capability), [
    "email",
    "calendar",
    "registry",
  ]);
});

test("provider adapter readiness keeps stale credentials blocked even with live ports", () => {
  const state = buildWeddingProviderAdapterReadinessState({
    mode: "live",
    gmailStatus: {
      connected: true,
      configured: true,
      gmail_email: "planner@example.com",
      token_expired: true,
    },
    calendarConnected: true,
    registryConnected: false,
    ports: {
      sendEmail: () => ({ ok: true }),
      createCalendarEvent: () => ({ ok: true }),
      publishRegistry: () => ({ ok: true }),
    },
  });

  const email = state.providerReadiness.find((provider) => provider.capability === "email");
  const registry = state.providerReadiness.find((provider) => provider.capability === "registry");

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(email?.credentialStatus, "stale");
  assert.equal(email?.executorStatus, "available");
  assert.equal(email?.productionReady, false);
  assert.equal(registry?.credentialStatus, "missing");
  assert.equal(registry?.productionReady, false);
});

test("provider adapter readiness feeds existing suite and Oracle evidence gates conservatively", () => {
  const dryRun = buildWeddingProviderAdapterReadinessState({
    mode: "dry_run",
    gmailStatus: { connected: true, configured: true },
    calendarConnected: true,
    registryConnected: true,
    ports: {
      sendEmail: () => ({ ok: true }),
      createCalendarEvent: () => ({ ok: true }),
      publishRegistry: () => ({ ok: true }),
    },
  });
  const live = buildWeddingProviderAdapterReadinessState({
    mode: "live",
    gmailStatus: { connected: true, configured: true },
    calendarConnected: true,
    registryConnected: true,
    ports: {
      sendEmail: () => ({ ok: true }),
      createCalendarEvent: () => ({ ok: true }),
      publishRegistry: () => ({ ok: true }),
    },
  });

  const dryRunSuite = buildWeddingProviderExecutorSuiteReadinessState({
    providers: [
      ...dryRun.providerReadiness,
      { capability: "vendor_search", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    ],
  });
  const liveSuite = buildWeddingProviderExecutorSuiteReadinessState({
    providers: [
      ...live.providerReadiness,
      { capability: "vendor_search", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    ],
  });

  assert.equal(dryRunSuite.productionEvidenceReady, false);
  assert.equal(liveSuite.productionEvidenceReady, true);
  assert.equal(buildWeddingProductionReadinessEvidenceState({ providerExecutorSuite: dryRunSuite }).evidence.providerExecutorsReady, false);
  assert.equal(buildWeddingProductionReadinessEvidenceState({ providerExecutorSuite: liveSuite }).evidence.providerExecutorsReady, true);
});
