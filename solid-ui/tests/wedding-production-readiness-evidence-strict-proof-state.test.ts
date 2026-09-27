import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionReadinessEvidenceState,
} from "@/lib/weddingProductionReadinessEvidenceState";

test("strict wedding production evidence rejects weak helper proof references", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    templateLaunchReadiness: {
      productionEvidenceReady: true,
      proofReferenceLabel: "template-launch:test-placeholder",
      blockerLabels: [],
    } as any,
    approvalUi: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["approval-ui:http://localhost:5173"],
    } as any,
    liveMapGeocoding: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["map-proof:dry-run"],
    } as any,
    graphCanvasHighlighting: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["data:application/json,{}"],
    } as any,
    llmNeedToKnowExtraction: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["file:///tmp/need-to-know-proof.json"],
    } as any,
    importParserReadiness: {
      productionReady: true,
      blockerLabels: [],
      proofReferenceLabels: ["import-parser:local-only"],
    } as any,
    expectedBehaviorAudit: {
      productionBlockerLabels: [],
      proofReferenceLabels: ["expected-behavior:mock"],
    } as any,
    collaboration: {
      productionReady: true,
      proofReferenceLabels: ["collaboration-access:example"],
    } as any,
    vendorQuoteReplyProduction: {
      productionReady: true,
      blockerLabels: [],
      evidenceLabels: ["Actual connected provider send verified: gmail:test-message"],
    } as any,
  });

  assert.equal(state.evidence.templateLaunchIntakeReady, false);
  assert.equal(state.evidence.approvalExecutionUiReady, false);
  assert.equal(state.evidence.liveMapGeocodingReady, false);
  assert.equal(state.evidence.graphCanvasHighlightingReady, false);
  assert.equal(state.evidence.llmNeedToKnowExtractionReady, false);
  assert.equal(state.evidence.importParserReady, false);
  assert.equal(state.evidence.expectedBehaviorCoverageReady, false);
  assert.equal(state.evidence.collaborationAccessControlsReady, false);
  assert.equal(state.evidence.vendorQuoteReplyProductionReady, false);
  assert.equal(state.durableProofReferenceLabels.some((label) => /localhost|dry-run|file:|data:|mock|example|test-message/i.test(label)), false);
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /template launch proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /Approval UI proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /Live map\/geocoding proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /Graph canvas proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /Need-To-Know LLM extraction proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /Wedding import parser readiness proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /expected behavior audit proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /access-control proof reference is missing/i.test(label)));
  assert.ok(state.missingRequiredEvidenceLabels.some((label) => /Vendor quote reply live provider proof reference is missing/i.test(label)));
});

test("strict wedding production evidence accepts durable helper proof references", () => {
  const state = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    templateLaunchReadiness: {
      productionEvidenceReady: true,
      proofReferenceLabel: "template-launch:oracle-prod-1:2026-09-28",
      blockerLabels: [],
    } as any,
    approvalUi: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["approval-ui:oracle-prod-1:2026-09-28"],
    } as any,
    liveMapGeocoding: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["map-proof:oracle-prod-1:2026-09-28"],
    } as any,
    graphCanvasHighlighting: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["graph-proof:oracle-prod-1:2026-09-28"],
    } as any,
    llmNeedToKnowExtraction: {
      productionEvidenceReady: true,
      proofReferenceLabels: ["ntk-llm:oracle-prod-1:2026-09-28"],
    } as any,
    importParserReadiness: {
      productionReady: true,
      blockerLabels: [],
      proofReferenceLabels: ["import-parser:oracle-prod-1:2026-09-28"],
    } as any,
    expectedBehaviorAudit: {
      productionBlockerLabels: [],
      proofReferenceLabels: ["expected-behavior:oracle-prod-1:2026-09-28"],
    } as any,
    collaboration: {
      productionReady: true,
      proofReferenceLabels: ["collaboration-access:oracle-prod-1:2026-09-28"],
    } as any,
    vendorQuoteReplyProduction: {
      productionReady: true,
      blockerLabels: [],
      evidenceLabels: ["Actual connected provider send verified: gmail:oracle-prod-1:gmail-message-123"],
    } as any,
  });

  assert.equal(state.evidence.templateLaunchIntakeReady, true);
  assert.equal(state.evidence.approvalExecutionUiReady, true);
  assert.equal(state.evidence.liveMapGeocodingReady, true);
  assert.equal(state.evidence.graphCanvasHighlightingReady, true);
  assert.equal(state.evidence.llmNeedToKnowExtractionReady, true);
  assert.equal(state.evidence.importParserReady, true);
  assert.equal(state.evidence.expectedBehaviorCoverageReady, true);
  assert.equal(state.evidence.collaborationAccessControlsReady, true);
  assert.equal(state.evidence.vendorQuoteReplyProductionReady, true);
  assert.ok(state.durableProofReferenceLabels.includes("template-launch:oracle-prod-1:2026-09-28"));
  assert.ok(state.durableProofReferenceLabels.includes("Actual connected provider send verified: gmail:oracle-prod-1:gmail-message-123"));
});
