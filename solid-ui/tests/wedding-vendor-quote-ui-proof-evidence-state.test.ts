import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionReadinessEvidenceState,
} from "@/lib/weddingProductionReadinessEvidenceState";
import { buildWeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";

const readyEmailProvider = {
  capability: "email",
  requiredProvider: "Gmail or email provider",
  credentialStatus: "connected",
  executorStatus: "available",
  productionReady: true,
  setupView: "email",
  summary: "Gmail or email provider ready",
  detail: "The connected app is ready.",
} as const;

function readyVendorQuoteReplyUi() {
  return buildWeddingVendorQuoteReplyUiReadinessState({
    quoteSummaryMounted: true,
    originalQuoteActionMounted: true,
    inlineEmailEditorMounted: true,
    wordingApprovalControlMounted: true,
    budgetAcknowledgementControlMounted: true,
    sendActionMounted: true,
    primaryDecisionActionMounted: true,
    secondaryDecisionActionMounted: true,
    conditionalReplyEditorMounted: true,
    sentReplyHistoryMounted: true,
    undoWindowMounted: true,
    persistentSentConfirmationMounted: true,
    proofDrawerActionMounted: true,
    proofDrawerStatusMounted: true,
    liveRegionsMounted: true,
    failureTelemetryMounted: true,
    providerReadiness: readyEmailProvider,
  });
}

test("buildWeddingProductionReadinessEvidenceState requires vendor quote UI safeguard evidence in strict mode", () => {
  const missingSafeguards = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    vendorQuoteReplyUi: {
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
    vendorQuoteReplyUi: readyVendorQuoteReplyUi(),
  });

  assert.equal(missingSafeguards.evidence.vendorQuoteReplyUiReady, false);
  assert.ok(missingSafeguards.missingRequiredEvidenceLabels.includes(
    "Vendor quote reply UI safeguard evidence is incomplete.",
  ));
  assert.equal(ready.evidence.vendorQuoteReplyUiReady, true);
  assert.ok(ready.summaryLabels.includes("vendor quote reply UI proof ready"));
});
