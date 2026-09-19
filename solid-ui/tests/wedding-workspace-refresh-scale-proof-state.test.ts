import assert from "node:assert/strict";
import test from "node:test";

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
  const state = buildWeddingWorkspaceRefreshScaleProofState({
    requestedPageSize: 96,
    pageCount: 2,
    totalLoaded: 160,
    maxPageMs: 700,
    pageOffsets: [0, 96],
    errorCount: 0,
    hasMoreAfterFinalPage: false,
    proofReferencePolicy: "required",
    proofRef: "http://localhost:8787/scale-proof",
  });

  assert.equal(state.status, "blocked");
  assert.match(state.blockerLabels.join(" "), /not a local receipt/i);
  assert.ok(!state.evidenceLabels.some((label) => /Scale proof reference/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /scale-proof receipt/i.test(label)));
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
