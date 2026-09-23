import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminWeddingAiRoutingPolicyState,
} from "../src/lib/adminWeddingAiRoutingPolicyState.ts";

test("buildAdminWeddingAiRoutingPolicyState blocks admin-funded routing without backend policy proof", () => {
  const state = buildAdminWeddingAiRoutingPolicyState();

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.includes("Backend policy endpoint is not mounted."));
  assert.ok(state.blockerLabels.includes("Direct Master Agent query exclusion is not proven."));
});

test("buildAdminWeddingAiRoutingPolicyState reports partial local proof without claiming production readiness", () => {
  const state = buildAdminWeddingAiRoutingPolicyState({
    backendPolicyEndpointMounted: true,
    auditReceiptProjectionReady: true,
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "local_only");
  assert.deepEqual(state.evidenceLabels, [
    "Backend policy endpoint mounted",
    "AFP/audit receipt projection ready",
  ]);
  assert.ok(state.blockerLabels.some((label) => /Tenant boundary/i.test(label)));
});

test("buildAdminWeddingAiRoutingPolicyState passes only with scope tenant budget audit and Master Agent exclusion proof", () => {
  const state = buildAdminWeddingAiRoutingPolicyState({
    backendPolicyEndpointMounted: true,
    auditReceiptProjectionReady: true,
    tenantBoundaryEnforced: true,
    budgetGuardrailsReady: true,
    weddingTemplateScopeOnly: true,
    masterAgentQueryExcluded: true,
    policySourceLabel: "oracle-prod-policy",
    lastVerifiedAt: "2026-09-14T09:00:00.000Z",
  });

  assert.equal(state.productionReady, true);
  assert.equal(state.status, "ready");
  assert.deepEqual(state.blockerLabels, []);
  assert.match(state.detail, /oracle-prod-policy/);
  assert.equal(state.lastVerifiedLabel, "2026-09-14T09:00:00.000Z");
});

test("buildAdminWeddingAiRoutingPolicyState can require durable policy proof reference", () => {
  const blocked = buildAdminWeddingAiRoutingPolicyState({
    backendPolicyEndpointMounted: true,
    auditReceiptProjectionReady: true,
    tenantBoundaryEnforced: true,
    budgetGuardrailsReady: true,
    weddingTemplateScopeOnly: true,
    masterAgentQueryExcluded: true,
    lastVerifiedAt: "2026-09-14T09:00:00.000Z",
    proofReferencePolicy: "required",
  });
  const ready = buildAdminWeddingAiRoutingPolicyState({
    backendPolicyEndpointMounted: true,
    auditReceiptProjectionReady: true,
    tenantBoundaryEnforced: true,
    budgetGuardrailsReady: true,
    weddingTemplateScopeOnly: true,
    masterAgentQueryExcluded: true,
    lastVerifiedAt: "2026-09-14T09:00:00.000Z",
    policyProofRef: "admin-routing-policy:oracle-prod-1:2026-09-14",
    proofReferencePolicy: "required",
  });

  assert.equal(blocked.productionReady, false);
  assert.ok(blocked.blockerLabels.includes("Admin routing policy proof reference is not mounted."));
  assert.ok(blocked.nextActionLabels.some((label) => /durable admin routing policy proof/i.test(label)));
  assert.equal(ready.productionReady, true);
  assert.ok(ready.proofReferenceLabels.includes("admin routing policy proof: admin-routing-policy:oracle-prod-1:2026-09-14"));
});

test("buildAdminWeddingAiRoutingPolicyState rejects local policy proof references", () => {
  const state = buildAdminWeddingAiRoutingPolicyState({
    backendPolicyEndpointMounted: true,
    auditReceiptProjectionReady: true,
    tenantBoundaryEnforced: true,
    budgetGuardrailsReady: true,
    weddingTemplateScopeOnly: true,
    masterAgentQueryExcluded: true,
    lastVerifiedAt: "2026-09-14T09:00:00.000Z",
    policyProofRef: "http://localhost:8787/admin-policy-proof",
    proofReferencePolicy: "required",
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "local_only");
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.ok(state.blockerLabels.some((label) => /not a local receipt/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /durable admin routing policy proof/i.test(label)));
});
