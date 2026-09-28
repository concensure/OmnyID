import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionReadinessEvidenceState,
} from "@/lib/weddingProductionReadinessEvidenceState";

test("buildWeddingProductionReadinessEvidenceState requires vendor quote live provider proof in strict mode", () => {
  const missingRef = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    vendorQuoteReplyProduction: {
      status: "ready",
      productionReady: true,
      summary: "Ready",
      detail: "Ready",
      evidenceLabels: [],
      blockerLabels: [],
      nextActionLabels: [],
      telemetryEvent: null,
    } as any,
  });
  const ready = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    vendorQuoteReplyProduction: {
      status: "ready",
      productionReady: true,
      summary: "Ready",
      detail: "Ready",
      evidenceLabels: [
        "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
      ],
      blockerLabels: [],
      nextActionLabels: [],
      telemetryEvent: null,
    } as any,
  });

  assert.equal(missingRef.evidence.vendorQuoteReplyProductionReady, false);
  assert.ok(missingRef.missingRequiredEvidenceLabels.includes(
    "Vendor quote reply live provider proof reference is missing.",
  ));
  assert.equal(ready.evidence.vendorQuoteReplyProductionReady, true);
  assert.ok(ready.durableProofReferenceLabels.includes(
    "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
  ));
});
