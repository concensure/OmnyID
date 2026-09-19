import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingPacketPlannedConversion } from "@/lib/weddingExportState";
import { buildWeddingNativeExportWorkerReadinessState } from "@/lib/weddingNativeExportWorkerReadinessState";
import { runWeddingNativeExportWorkerExecution } from "@/lib/weddingNativeExportWorkerExecutionState";

const zipConversion: WeddingPacketPlannedConversion = {
  id: "zip",
  label: "Native ZIP packet",
  filename: "harbour-packet.zip",
  blockedReason: "Bundle packaging worker is not connected yet.",
  requiresWorker: "zip_packet_worker",
};

const readyReadiness = buildWeddingNativeExportWorkerReadinessState({
  workers: [
    {
      id: "zip_packet_worker",
      connected: true,
      supportsSensitiveFilter: true,
      supportsDeterministicFilename: true,
      supportsReceipt: true,
      supportsFailureCopy: true,
    },
    {
      id: "docx_packet_worker",
      connected: true,
      supportsSensitiveFilter: true,
      supportsDeterministicFilename: true,
      supportsReceipt: true,
      supportsFailureCopy: true,
    },
    {
      id: "image_packet_worker",
      connected: true,
      supportsSensitiveFilter: true,
      supportsDeterministicFilename: true,
      supportsReceipt: true,
      supportsFailureCopy: true,
    },
  ],
});

test("runWeddingNativeExportWorkerExecution blocks when required worker is not ready", async () => {
  const state = await runWeddingNativeExportWorkerExecution({
    readiness: buildWeddingNativeExportWorkerReadinessState(),
    request: {
      conversion: zipConversion,
      sourceContent: "# Packet",
    },
    port: () => ({ ok: true }),
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.workerId, "zip_packet_worker");
  assert.match(state.blockerLabels[0] ?? "", /Worker is not connected/i);
  assert.equal(state.receipt, null);
});

test("runWeddingNativeExportWorkerExecution blocks empty source content before calling worker", async () => {
  let called = false;
  const state = await runWeddingNativeExportWorkerExecution({
    readiness: readyReadiness,
    request: {
      conversion: zipConversion,
      sourceContent: " ",
    },
    port: () => {
      called = true;
      return { ok: true };
    },
  });

  assert.equal(state.status, "blocked");
  assert.equal(called, false);
  assert.ok(state.blockerLabels.some((label) => /Source packet content is empty/i.test(label)));
});

test("runWeddingNativeExportWorkerExecution records successful native export receipts", async () => {
  const state = await runWeddingNativeExportWorkerExecution({
    readiness: readyReadiness,
    request: {
      conversion: zipConversion,
      title: "Harbour packet",
      sourceContent: "# Packet",
      warningLabels: ["Budget warning"],
    },
    port: (request) => {
      assert.equal(request.conversion.filename, "harbour-packet.zip");
      assert.equal(request.sourceFormat, "markdown");
      return {
        ok: true,
        byteLength: 42.9,
        mimeType: "application/zip",
        receiptId: "receipt:zip:1",
      };
    },
  });

  assert.equal(state.status, "executed");
  assert.equal(state.filename, "harbour-packet.zip");
  assert.equal(state.receipt?.byteLength, 42);
  assert.equal(state.receipt?.mimeType, "application/zip");
  assert.equal(state.receipt?.receiptId, "receipt:zip:1");
  assert.deepEqual(state.receipt?.warningLabels, ["Budget warning"]);
});

test("runWeddingNativeExportWorkerExecution records failed worker results safely", async () => {
  const state = await runWeddingNativeExportWorkerExecution({
    readiness: readyReadiness,
    request: {
      conversion: zipConversion,
      sourceContent: "# Packet",
    },
    port: () => ({ ok: false, error: "Conversion service unavailable." }),
  });

  assert.equal(state.status, "failed");
  assert.match(state.message, /Conversion service unavailable/);
  assert.equal(state.receipt, null);
});

test("runWeddingNativeExportWorkerExecution catches thrown worker errors", async () => {
  const state = await runWeddingNativeExportWorkerExecution({
    readiness: readyReadiness,
    request: {
      conversion: zipConversion,
      sourceContent: "# Packet",
    },
    port: () => {
      throw new Error("Worker crashed.");
    },
  });

  assert.equal(state.status, "failed");
  assert.match(state.blockerLabels[0] ?? "", /Worker crashed/);
});
