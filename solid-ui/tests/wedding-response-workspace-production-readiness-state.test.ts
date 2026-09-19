import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingResponseWorkspaceMetadata as metadata } from "./wedding-response-workspace-fixtures.ts";

test("response workspace defaults to visible fail-closed production proof", () => {
  const state = buildWeddingResponseWorkspaceViewState({ metadata });

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, false);
  assert.equal(state.productionGoNoGoPacket?.status, "blocked");
  assert.ok(state.productionGoNoGoPacket?.blockerLabels.includes("Backend pagination contract is missing."));
  assert.equal(state.oracleUpdatePlan.status, "blocked");
});

test("response workspace exposes derived production evidence and go/no-go packet", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    productionReadinessEvidence: {
      strictOracleProofs: true,
      backendPaginationContractReady: true,
    },
  });

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, true);
  assert.equal(state.productionReadinessEvidence?.evidence.backendScaleProofReady, false);
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
  assert.equal(state.oracleUpdatePlan.status, "blocked");
  assert.ok(state.oracleUpdatePlan.blockerLabels.some((label) => /Production go\/no-go/i.test(label)));
});
