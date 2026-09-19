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
  };
}

test("buildWeddingNativeExportWorkerReadinessState blocks when workers are absent", () => {
  const state = buildWeddingNativeExportWorkerReadinessState();

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.checks.map((check) => check.status), ["blocked", "blocked", "blocked"]);
  assert.match(state.summary, /3 native export workers/);
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
  assert.ok(docx?.blockerLabels.some((label) => /sensitive-artifact filter/i.test(label)));
  assert.ok(docx?.blockerLabels.some((label) => /durable export receipt/i.test(label)));
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
  assert.match(state.summary, /can be enabled/);
});
