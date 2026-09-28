import assert from "node:assert/strict";
import test from "node:test";

import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";
import {
  buildWeddingWorkspaceRefreshScaleProofPacketState,
} from "@/lib/weddingWorkspaceRefreshScaleProofPacketState";
import {
  buildWeddingWorkspaceRefreshScaleProofState,
} from "@/lib/weddingWorkspaceRefreshScaleProofState";

test("buildWeddingWorkspaceRefreshScaleProofState passes complete multi-page proof", () => {
  const state = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 3,
    totalLoaded: 240,
    maxPageMs: 820,
    pageOffsets: [0, 96, 192],
    duplicateMessageIds: [],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofRef: "refresh-scale:oracle-prod-1:2026-09-14",
    targetLabel: "oracle-prod-1",
    source: "seeded wedding refresh run",
  });

  assert.equal(state.status, "pass");
  assert.equal(state.readiness, "oracle_ready");
  assert.match(state.summary, /seeded wedding refresh run passed/);
  assert.equal(state.blockerLabels.length, 0);
  assert.ok(state.evidenceLabels.includes("Sequential offsets: 0, 96, 192"));
  assert.ok(state.evidenceLabels.includes("Scale proof reference: refresh-scale:oracle-prod-1:2026-09-14"));
});

test("buildWeddingWorkspaceRefreshScaleProofState blocks duplicate message IDs", () => {
  const state = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 150,
    maxPageMs: 700,
    duplicateMessageIds: ["msg_1"],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
  });

  assert.equal(state.status, "blocked");
  assert.match(state.blockerLabels.join(" "), /Duplicate AFP message IDs/);
});

test("buildWeddingWorkspaceRefreshScaleProofState blocks slow or incomplete proof", () => {
  const state = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 120,
    maxPageMs: 3100,
    errorCount: 0,
    hasMoreAfterFinalPage: true,
  });

  assert.equal(state.status, "blocked");
  assert.match(state.blockerLabels.join(" "), /final page/);
  assert.match(state.blockerLabels.join(" "), /2500ms/);
});

test("buildWeddingWorkspaceRefreshScaleProofState blocks non-sequential offsets", () => {
  const state = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 3,
    totalLoaded: 240,
    maxPageMs: 700,
    pageOffsets: [0, 120, 216],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
  });

  assert.equal(state.status, "blocked");
  assert.match(state.blockerLabels.join(" "), /page offsets/i);
  assert.ok(state.nextActionLabels.some((label) => /Record sequential page offsets/i.test(label)));
});

test("buildWeddingWorkspaceRefreshScaleProofState can require durable proof reference", () => {
  const blocked = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    pageOffsets: [0, 96],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
  });

  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blockerLabels.join(" "), /durable proof reference/i);
  assert.ok(blocked.nextActionLabels.some((label) => /scale-proof receipt/i.test(label)));

  const ready = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    pageOffsets: [0, 96],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
    proofRef: "refresh-scale:ok",
  });

  assert.equal(ready.status, "pass");
  assert.ok(ready.evidenceLabels.includes("Scale proof reference: refresh-scale:ok"));
});

test("buildWeddingWorkspaceRefreshScaleProofState rejects local proof references", () => {
  for (const proofRef of [
    "http://localhost:8787/scale-proof",
    "http://audit.omnyid.com/scale-proof",
    "https://127.0.0.1/scale-proof",
    "https://0.0.0.0/scale-proof",
    "https://[::1]/scale-proof",
    "file:///tmp/scale-proof.json",
    "blob:https://app.example/scale-proof",
    "data:application/json,{}",
  ]) {
    const state = buildWeddingWorkspaceRefreshScaleProofState({
      requestedPageSize: 96,
      pageCount: 2,
      totalLoaded: 160,
      maxPageMs: 700,
      pageOffsets: [0, 96],
      errorCount: 0,
      hasMoreAfterFinalPage: false,
      proofReferencePolicy: "required",
      proofRef,
    });

    assert.equal(state.status, "blocked", proofRef);
    assert.match(state.blockerLabels.join(" "), /remote HTTPS proof link/i, proofRef);
    assert.ok(!state.evidenceLabels.some((label) => /Scale proof reference/i.test(label)), proofRef);
    assert.ok(state.nextActionLabels.some((label) => /scale-proof receipt/i.test(label)), proofRef);
  }
});

test("buildWeddingWorkspaceRefreshScaleProofState rejects placeholder proof references", () => {
  for (const proofRef of [
    "...",
    "test:scale-proof",
    "dry-run:scale-proof",
    "placeholder:latest",
    "refresh-scale:fake:latest",
    "refresh-scale:mock:latest",
  ]) {
    const state = buildWeddingWorkspaceRefreshScaleProofState({
      requestedPageSize: 96,
      pageCount: 2,
      totalLoaded: 160,
      maxPageMs: 700,
      pageOffsets: [0, 96],
      errorCount: 0,
      hasMoreAfterFinalPage: false,
      proofReferencePolicy: "required",
      proofRef,
    });
    const packet = buildWeddingWorkspaceRefreshScaleProofPacketState(state);

    assert.equal(state.status, "blocked", proofRef);
    assert.ok(!state.evidenceLabels.some((label) => /Scale proof reference/i.test(label)), proofRef);
    assert.ok(
      state.blockerLabels.some((label) => /local, dry-run, placeholder, localhost, or browser-only/i.test(label)),
      proofRef,
    );
    assert.equal(packet.canClearBackendScaleGate, false, proofRef);
    assert.ok(packet.missingEvidenceLabels.includes("Durable scale-proof receipt: evidence required"), proofRef);
  }
});

test("buildWeddingWorkspaceRefreshScaleProofState rejects test proof tokens but allows smoke receipts", () => {
  const blocked = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    pageOffsets: [0, 96],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
    proofRef: "refresh-scale:test:latest",
  });

  assert.equal(blocked.status, "blocked");
  assert.ok(!blocked.evidenceLabels.some((label) => /refresh-scale:test/i.test(label)));

  const ready = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    pageOffsets: [0, 96],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
    proofRef: "refresh-scale:prod-smoke:2026-09-28",
  });

  assert.equal(ready.status, "pass");
  assert.ok(ready.evidenceLabels.includes("Scale proof reference: refresh-scale:prod-smoke:2026-09-28"));
});

test("buildWeddingWorkspaceRefreshScaleProofState bounds noisy proof labels", () => {
  const longDuplicateId = `msg_${"duplicate-".repeat(50)}`;
  const longProofRef = `refresh-scale:oracle-prod-1:${"proof-".repeat(50)}`;
  const state = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    pageOffsets: [0, 96],
    duplicateMessageIds: [`  ${longDuplicateId}  `, longDuplicateId],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofRef: longProofRef,
    targetLabel: `  Oracle   ${"production ".repeat(40)} `,
    source: `  Saved   workspace   refresh   ${"scale proof ".repeat(30)} `,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.summary.startsWith("Saved workspace refresh scale proof"));
  assert.ok(state.summary.length < 220);
  assert.ok(state.blockerLabels.every((label) => label.length <= 240));
  assert.ok(state.evidenceLabels.every((label) => label.length <= 240));
  assert.ok(state.blockerLabels.some((label) => label.startsWith("Duplicate AFP message IDs appeared across pages: msg_duplicate")));
  assert.ok(state.blockerLabels.some((label) => label.endsWith("...")));
  assert.ok(state.evidenceLabels.some((label) => label.startsWith("Scale proof reference: refresh-scale:oracle-prod-1")));
  assert.ok(state.evidenceLabels.some((label) => label.startsWith("Target: Oracle production")));
});

test("buildWeddingWorkspaceRefreshScaleProofState blocks small one-page workspaces", () => {
  const state = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 1,
    totalLoaded: 12,
    maxPageMs: 300,
    errorCount: 0,
    hasMoreAfterFinalPage: false,
  });

  assert.equal(state.status, "blocked");
  assert.match(state.blockerLabels.join(" "), /at least two backend refresh pages/);
  assert.match(state.blockerLabels.join(" "), /enough saved AFP messages/);
});

test("workspace refresh scale proof packet bounds noisy bypass labels", () => {
  const noisyNext = `Record page offsets ${"with backend proof ".repeat(80)}`;
  const packet = buildWeddingWorkspaceRefreshScaleProofPacketState({
    status: "blocked",
    readiness: "blocked",
    summary: "Scale proof blocked.",
    blockerLabels: [`Scale proof page offsets are missing ${"from the backend run ".repeat(60)}`],
    evidenceLabels: [
      `Sequential offsets: 0, 96, ${"192, ".repeat(80)}`,
      `Scale proof reference: refresh-scale:${"x".repeat(400)}`,
    ],
    nextActionLabels: [noisyNext, noisyNext],
  } as any);

  assert.equal(packet.status, "blocked");
  assert.ok(packet.requirements.every((requirement) =>
    !requirement.evidenceLabel || requirement.evidenceLabel.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH,
  ));
  assert.ok(packet.nextActionLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.equal(packet.nextActionLabels.length, 1);
});

test("workspace refresh scale proof packet independently rejects forged weak proof refs", () => {
  for (const proofLabel of [
    "Scale proof reference: http://audit.omnyid.example/scale-proof",
    "Scale proof reference: https://localhost/scale-proof",
    "Scale proof reference: https://127.0.0.1/scale-proof",
    "Scale proof reference: data:application/json,{}",
    "Scale proof reference: refresh-scale:fake:latest",
    "Scale proof reference: refresh-scale:test:latest",
  ]) {
    const packet = buildWeddingWorkspaceRefreshScaleProofPacketState({
      status: "pass",
      readiness: "oracle_ready",
      summary: "Forged scale proof passed.",
      blockerLabels: [],
      evidenceLabels: [
        "Page size 96",
        "2 pages exercised",
        "160 saved AFP messages loaded",
        "Final page reported has_more:false",
        "No duplicate message IDs",
        "No refresh errors",
        "Slowest page 700ms",
        "Sequential offsets: 0, 96",
        proofLabel,
      ],
      nextActionLabels: [],
    } as any);
    const proofRequirement = packet.requirements.find((requirement) => requirement.kind === "proof_ref");

    assert.equal(packet.status, "blocked", proofLabel);
    assert.equal(packet.canClearBackendScaleGate, false, proofLabel);
    assert.equal(proofRequirement?.status, "blocked", proofLabel);
    assert.equal(proofRequirement?.evidenceLabel, null, proofLabel);
    assert.match(proofRequirement?.blockerLabel ?? "", /durable audit ID or remote HTTPS proof link/i, proofLabel);
    assert.ok(packet.missingEvidenceLabels.includes("Durable scale-proof receipt: evidence required"), proofLabel);
  }
});
