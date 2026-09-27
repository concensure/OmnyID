import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingNativeExportWorkerReadinessState,
  type WeddingNativeExportWorkerInput,
} from "@/lib/weddingNativeExportWorkerReadinessState";

function readyWorker(id: WeddingNativeExportWorkerInput["id"]): WeddingNativeExportWorkerInput {
  return {
    id,
    connected: true,
    supportsSensitiveFilter: true,
    supportsDeterministicFilename: true,
    supportsReceipt: true,
    supportsFailureCopy: true,
    proofReferenceLabel: `native-export:${id}:oracle-prod-1:2026-09-28`,
  };
}

test("buildWeddingNativeExportWorkerReadinessState blocks when workers are absent", () => {
  const state = buildWeddingNativeExportWorkerReadinessState();

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.checks.map((check) => check.status), ["blocked", "blocked", "blocked"]);
  assert.match(state.summary, /3 download services/);
});

test("buildWeddingNativeExportWorkerReadinessState requires privacy, receipts, filenames, and failure copy", () => {
  const state = buildWeddingNativeExportWorkerReadinessState({
    workers: [{
      id: "docx_packet_worker",
      connected: true,
      supportsSensitiveFilter: false,
      supportsDeterministicFilename: true,
      supportsReceipt: false,
      supportsFailureCopy: true,
    }],
  });

  const docx = state.checks.find((check) => check.id === "docx_packet_worker");
  assert.equal(docx?.status, "blocked");
  assert.ok(docx?.blockerLabels.some((label) => /private-file filter/i.test(label)));
  assert.ok(docx?.blockerLabels.some((label) => /saved export receipt/i.test(label)));
  assert.ok(docx?.blockerLabels.some((label) => /proof receipt reference/i.test(label)));
});

test("buildWeddingNativeExportWorkerReadinessState rejects placeholder proof references", () => {
  const state = buildWeddingNativeExportWorkerReadinessState({
    workers: [
      {
        ...readyWorker("zip_packet_worker"),
        proofReferenceLabel: "native-export:zip:fake:test",
      },
      readyWorker("docx_packet_worker"),
      readyWorker("image_packet_worker"),
    ],
  });

  const zip = state.checks.find((check) => check.id === "zip_packet_worker");
  assert.equal(state.productionEvidenceReady, false);
  assert.equal(zip?.status, "blocked");
  assert.equal(zip?.proofReferenceLabel, null);
  assert.ok(zip?.blockerLabels.some((label) => /proof receipt reference/i.test(label)));
});

test("buildWeddingNativeExportWorkerReadinessState rejects bare test proof references while accepting prod-smoke", () => {
  const testProof = buildWeddingNativeExportWorkerReadinessState({
    workers: [
      {
        ...readyWorker("zip_packet_worker"),
        proofReferenceLabel: "native-export:zip:test:latest",
      },
      readyWorker("docx_packet_worker"),
      readyWorker("image_packet_worker"),
    ],
  });
  const prodSmokeProof = buildWeddingNativeExportWorkerReadinessState({
    workers: [
      {
        ...readyWorker("zip_packet_worker"),
        proofReferenceLabel: "native-export:zip:prod-smoke:2026-09-28",
      },
      readyWorker("docx_packet_worker"),
      readyWorker("image_packet_worker"),
    ],
  });

  assert.equal(testProof.productionEvidenceReady, false);
  assert.equal(testProof.checks.find((check) => check.id === "zip_packet_worker")?.proofReferenceLabel, null);
  assert.equal(prodSmokeProof.productionEvidenceReady, true);
  assert.ok(prodSmokeProof.proofReferenceLabels.includes("native-export:zip:prod-smoke:2026-09-28"));
});

test("buildWeddingNativeExportWorkerReadinessState rejects local-only proof references", () => {
  const state = buildWeddingNativeExportWorkerReadinessState({
    workers: [
      {
        ...readyWorker("zip_packet_worker"),
        proofReferenceLabel: "native-export:zip:local-only:2026-09-28",
      },
      {
        ...readyWorker("docx_packet_worker"),
        proofReferenceLabel: "native-export:docx:http://localhost:5173/proof",
      },
      {
        ...readyWorker("image_packet_worker"),
        proofReferenceLabel: "file:///tmp/native-export-proof.json",
      },
    ],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.equal(state.checks.every((check) => check.proofReferenceLabel === null), true);
});

test("buildWeddingNativeExportWorkerReadinessState passes when every planned worker is proven", () => {
  const state = buildWeddingNativeExportWorkerReadinessState({
    workers: [
      readyWorker("zip_packet_worker"),
      readyWorker("docx_packet_worker"),
      readyWorker("image_packet_worker"),
    ],
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.nextActions.length, 0);
  assert.equal(state.proofReferenceLabels.length, 3);
  assert.ok(state.proofReferenceLabels.every((label) => /native-export:/i.test(label)));
  assert.match(state.summary, /can be enabled/);
});
