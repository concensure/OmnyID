import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionReadinessEvidenceState,
} from "@/lib/weddingProductionReadinessEvidenceState";

test("buildWeddingProductionReadinessEvidenceState requires backend pagination proof reference in strict mode", () => {
  const missingRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    backendPaginationContractReady: true,
  });
  const weakRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    backendPaginationContractReady: true,
    backendPaginationProofRef: "backend-pagination:fake:test",
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    backendPaginationContractReady: true,
    backendPaginationProofRef: "backend-pagination:oracle-prod-1:2026-09-28",
  });

  assert.equal(missingRef.evidence.backendPaginationReady, false);
  assert.equal(weakRef.evidence.backendPaginationReady, false);
  assert.ok(missingRef.missingRequiredEvidenceLabels.includes(
    "Backend pagination contract proof reference is missing.",
  ));
  assert.equal(ready.evidence.backendPaginationReady, true);
  assert.ok(ready.durableProofReferenceLabels.includes(
    "Backend pagination contract proof: backend-pagination:oracle-prod-1:2026-09-28",
  ));
});
