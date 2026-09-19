import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingResponseWorkspaceProductionReadinessState,
} from "@/lib/weddingResponseWorkspaceProductionReadinessState";

test("response workspace production readiness defaults to strict fail-closed evidence", () => {
  const state = buildWeddingResponseWorkspaceProductionReadinessState({});

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, false);
  assert.equal(state.productionGoNoGoPacket?.status, "blocked");
  assert.equal(state.oracleUpdatePlan.status, "blocked");
  assert.ok(state.oracleUpdatePlan.blockerLabels.some((label) => /Production go\/no-go/i.test(label)));
});

test("response workspace production readiness preserves supplied evidence", () => {
  const state = buildWeddingResponseWorkspaceProductionReadinessState({
    productionReadinessEvidence: {
      strictOracleProofs: true,
      backendPaginationContractReady: true,
    },
  });

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, true);
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
});
