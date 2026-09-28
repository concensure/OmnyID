import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { buildWeddingTemplateDeepLinkLaunch } from "@/lib/weddingTemplateDeepLinkLaunchState";
import { buildWeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import { weddingResponseWorkspaceMetadata as metadata } from "./wedding-response-workspace-fixtures.ts";

test("response workspace defaults to visible fail-closed production proof", () => {
  const state = buildWeddingResponseWorkspaceViewState({ metadata });

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, false);
  assert.equal(state.productionGoNoGoPacket?.status, "blocked");
  assert.ok(state.productionGoNoGoPacket?.blockerLabels.includes("Backend pagination contract is missing."));
  assert.equal(state.productionGoNoGoPacket?.gates.find((gate) => gate.kind === "vendor_quote_reply")?.status, "blocked");
  assert.ok(state.productionGoNoGoPacket?.blockerLabels.includes("Vendor quote reply live production proof is missing or blocked."));
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

  assert.equal(state.productionReadinessEvidence?.evidence.backendPaginationReady, false);
  assert.equal(state.productionReadinessEvidence?.evidence.backendScaleProofReady, false);
  assert.equal(state.productionGoNoGoPacket?.canUploadToOracle, false);
  assert.equal(state.oracleUpdatePlan.status, "blocked");
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Backend pagination contract proof reference is missing.",
  ));
  assert.ok(state.oracleUpdatePlan.blockerLabels.some((label) => /Production go\/no-go/i.test(label)));
  assert.equal(state.productionRemainingWork.oracleUploadAllowed, false);
  assert.ok(state.productionRemainingWork.oracleBlockingItems.some((item) =>
    item.id === "backend_pagination" && /workspace reload/i.test(item.summary)
  ));
});

test("response workspace derives wedding template launch proof from real launch and intake state", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    templateDeepLinkLaunch: buildWeddingTemplateDeepLinkLaunch(),
    templateLaunch: buildWeddingTemplateLaunchState({
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:planning-pass",
    }),
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
    templateLaunchProofReferencePolicy: "required",
    templateLaunchProofRef: "wedding-template-launch:oracle-prod-1:2026-09-28",
  });
  const templateGate = state.productionGoNoGoPacket?.gates.find((gate) => gate.kind === "template_launch");
  const templateReceipt = state.productionGoNoGoPacket?.proofManifest.find((item) => item.kind === "template_launch");

  assert.equal(state.productionReadinessEvidence?.evidence.templateLaunchIntakeReady, true);
  assert.equal(templateGate?.status, "ready");
  assert.equal(templateReceipt?.status, "attached");
  assert.ok(templateReceipt?.proofReferenceLabels.includes(
    "Wedding template launch proof: wedding-template-launch:oracle-prod-1:2026-09-28",
  ));
  assert.ok(!state.productionReadinessEvidence?.missingRequiredEvidenceLabels.includes(
    "Wedding template launch proof is missing.",
  ));
});

test("response workspace keeps template launch gate blocked for local-only proof refs", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    templateDeepLinkLaunch: buildWeddingTemplateDeepLinkLaunch(),
    templateLaunch: buildWeddingTemplateLaunchState(),
    hasTemplateLaunch: true,
    hasPersistedWorkspaceContent: false,
    followUpRequested: false,
    templateLaunchProofReferencePolicy: "required",
    templateLaunchProofRef: "http://localhost:5173/template-proof",
  });
  const templateGate = state.productionGoNoGoPacket?.gates.find((gate) => gate.kind === "template_launch");

  assert.equal(state.productionReadinessEvidence?.evidence.templateLaunchIntakeReady, false);
  assert.equal(templateGate?.status, "blocked");
  assert.ok(state.productionReadinessEvidence?.missingRequiredEvidenceLabels.some((label) =>
    /durable audit ID or remote HTTPS proof link/i.test(label)
  ));
});

test("response workspace exposes exact production polish proof blockers", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    productionReadinessEvidence: {
      seededVendorCorpus: {
        status: "ready",
        vendorCount: 10,
        categoryCount: 6,
        sourceCount: 10,
        staleCount: 0,
        summaryArtifact: {},
        proofReferenceLabels: [],
      } as any,
    },
  });
  const seededCorpusItem = state.productionRemainingWork.productionPolishItems.find((item) =>
    item.id === "seeded_vendor_corpus"
  );

  assert.equal(seededCorpusItem?.summary, "Source-backed seeded vendor corpus proof reference is missing.");
});

test("response workspace projects next production work into planning tasks", () => {
  const state = buildWeddingResponseWorkspaceViewState({ metadata });

  assert.ok(state.planningTaskItems.some((task) =>
    (task.metadata as Record<string, unknown>).production_remaining_work_task === true
    && /Clear launch blocker/i.test(task.title)
  ));
});
