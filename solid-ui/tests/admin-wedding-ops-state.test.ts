import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminWeddingAiRoutingPolicyState } from "../src/lib/adminWeddingAiRoutingPolicyState.ts";
import { buildAdminWeddingOpsPanelState } from "../src/lib/adminWeddingOpsState.ts";
import { buildWeddingProviderExecutorProofPacketState } from "../src/lib/weddingProviderExecutorProofPacketState.ts";
import { buildWeddingProviderExecutorSuiteReadinessState } from "../src/lib/weddingProviderExecutorSuiteReadinessState.ts";
import { buildWeddingVendorSearchProviderEnvState } from "../src/lib/weddingVendorSearchProviderEnvState.ts";

test("buildAdminWeddingOpsPanelState shows exact users live Oracle metrics and enforced wedding AI routing", () => {
  const state = buildAdminWeddingOpsPanelState({
    operatorUsers: { users: [], limit: 25, total_users: 42 },
    oracleMetrics: {
      diskUsedLabel: "31 GB",
      diskTotalLabel: "100 GB",
      ramUsedLabel: "3.2 GB",
      ramTotalLabel: "8 GB",
      sourceLabel: "oracle-prod-1",
      collectedAtLabel: "2026-09-14T10:00:00Z",
      proofRef: "oracle-metrics:prod-1:2026-09-14T10",
    },
    vendorSearchProviders: buildWeddingVendorSearchProviderEnvState({
      OMNYID_GOOGLE_PLACES_API_KEY: "secret-google-key",
      OMNYID_OVERPASS_API_URL: "https://overpass-api.de/api/interpreter",
      OMNYID_OVERPASS_CONTACT_EMAIL: "ops@example.com",
      OMNYID_OVERPASS_RATE_LIMIT_PER_MINUTE: "30",
    }),
    weddingAiRoutingPolicy: buildAdminWeddingAiRoutingPolicyState({
      backendPolicyEndpointMounted: true,
      auditReceiptProjectionReady: true,
      tenantBoundaryEnforced: true,
      budgetGuardrailsReady: true,
      weddingTemplateScopeOnly: true,
      masterAgentQueryExcluded: true,
      policySourceLabel: "oracle-prod-policy",
    }),
    routeWeddingAiThroughAdmin: true,
  });

  assert.equal(state.metrics.find((metric) => metric.title === "Oracle disk")?.value, "31 GB / 100 GB");
  assert.equal(state.metrics.find((metric) => metric.title === "Oracle RAM")?.value, "3.2 GB / 8 GB");
  assert.match(state.metrics.find((metric) => metric.title === "Oracle disk")?.detail ?? "", /proof oracle-metrics:prod-1/i);
  assert.match(state.metrics.find((metric) => metric.title === "Oracle RAM")?.detail ?? "", /2026-09-14T10:00:00Z/i);
  assert.equal(state.metrics.find((metric) => metric.title === "Signed-up users")?.value, "42");
  assert.equal(state.metrics.find((metric) => metric.title === "Wedding vendor search")?.value, "Google Places API, OSM / Overpass API");
  assert.equal(state.metrics.find((metric) => metric.title === "Wedding AI routing policy")?.value, "Backend enforced");
  assert.equal(state.metrics.find((metric) => metric.title === "Ops backend metrics")?.value, "Backend mounted");
  assert.doesNotMatch(JSON.stringify(state), /secret-google-key/);
  assert.equal(state.toggle.enabled, true);
  assert.equal(state.toggle.statusLabel, "Backend-enforced wedding routing");
  assert.match(state.toggle.warning, /exclude direct Master Agent/i);
});

test("buildAdminWeddingOpsPanelState does not invent unavailable backend metrics", () => {
  const state = buildAdminWeddingOpsPanelState({
    operatorUsers: {
      users: [
        {
          user_id: "usr_1",
          email: "a@example.com",
          email_verified: true,
          plan: "free",
          billing_status: "none",
          account_status: "active",
        },
      ],
      limit: 25,
    },
    routeWeddingAiThroughAdmin: false,
  });

  assert.equal(state.metrics.find((metric) => metric.title === "Oracle disk")?.status, "needs_backend");
  assert.equal(state.metrics.find((metric) => metric.title === "Oracle RAM")?.value, "Metric needed");
  assert.equal(state.metrics.find((metric) => metric.title === "Signed-up users")?.value, "At least 1");
  assert.equal(state.metrics.find((metric) => metric.title === "Wedding vendor search")?.status, "needs_backend");
  assert.equal(state.metrics.find((metric) => metric.title === "Wedding AI routing policy")?.status, "needs_backend");
  assert.equal(state.metrics.find((metric) => metric.title === "Ops backend metrics")?.status, "needs_backend");
  assert.equal(state.metrics.find((metric) => metric.title === "Provider executor proof")?.status, "needs_backend");
  assert.equal(state.toggle.statusLabel, "User-scoped by default");
  assert.ok(state.guardrails.some((guardrail) => /user-owned wedding memory/i.test(guardrail)));
  assert.ok(state.guardrails.some((guardrail) => /provider executor proof packet/i.test(guardrail)));
});

test("buildAdminWeddingOpsPanelState keeps local admin toggle disabled until policy is enforced", () => {
  const state = buildAdminWeddingOpsPanelState({
    operatorUsers: { users: [], limit: 25, total_users: 1 },
    weddingAiRoutingPolicy: buildAdminWeddingAiRoutingPolicyState({
      backendPolicyEndpointMounted: true,
      auditReceiptProjectionReady: true,
    }),
    routeWeddingAiThroughAdmin: true,
  });

  assert.equal(state.toggle.enabled, false);
  assert.equal(state.toggle.statusLabel, "Staged locally; backend policy blocked");
  assert.equal(state.metrics.find((metric) => metric.title === "Wedding AI routing policy")?.value, "Partial proof");
  assert.ok(state.guardrails.some((guardrail) => /toggle as disabled in production/i.test(guardrail)));
});

test("buildAdminWeddingOpsPanelState surfaces provider executor proof packet status", () => {
  const blockedPacket = buildWeddingProviderExecutorProofPacketState(
    buildWeddingProviderExecutorSuiteReadinessState({
      requiredCapabilities: ["vendor_search"],
      providers: [],
    }),
  );
  const blockedState = buildAdminWeddingOpsPanelState({
    operatorUsers: { users: [], limit: 25, total_users: 1 },
    providerExecutorProofPacket: blockedPacket,
    routeWeddingAiThroughAdmin: false,
  });

  assert.equal(blockedState.metrics.find((metric) => metric.title === "Provider executor proof")?.value, "Proof blocked");
  assert.equal(blockedState.metrics.find((metric) => metric.title === "Provider executor proof")?.status, "local_only");
  assert.match(blockedState.metrics.find((metric) => metric.title === "Provider executor proof")?.detail ?? "", /proof receipt required|readiness proof is missing/i);

  const readyPacket = buildWeddingProviderExecutorProofPacketState(
    buildWeddingProviderExecutorSuiteReadinessState({
      proofReferencePolicy: "required",
      requiredCapabilities: ["vendor_search"],
      executorProofRefs: { vendor_search: "vendor-search-smoke:oracle-prod-1:2026-09-15" },
      providers: [
        {
          capability: "vendor_search",
          requiredProvider: "Brave Search, Google Places, or OSM/Overpass provider",
          credentialStatus: "connected",
          executorStatus: "available",
          productionReady: true,
        } as any,
      ],
    }),
  );
  const readyState = buildAdminWeddingOpsPanelState({
    operatorUsers: { users: [], limit: 25, total_users: 1 },
    providerExecutorProofPacket: readyPacket,
    routeWeddingAiThroughAdmin: false,
  });

  assert.equal(readyState.metrics.find((metric) => metric.title === "Provider executor proof")?.value, "Proof complete");
  assert.equal(readyState.metrics.find((metric) => metric.title === "Provider executor proof")?.status, "ready");
  assert.ok(readyState.guardrails.some((guardrail) => /can clear the Oracle provider gate/i.test(guardrail)));
});
