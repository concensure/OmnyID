import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionGatePresentationState,
} from "@/lib/weddingProductionGatePresentationState";
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";

const blockedPacket: WeddingProductionGoNoGoPacketState = {
  status: "blocked",
  canUploadToOracle: false,
  title: "Wedding Oracle upload blocked",
  summary: "Do not upload until every required proof gate is ready.",
  gates: [
    {
      kind: "backend_scale",
      title: "Saved workspace backend scale proof",
      status: "blocked",
      detail: "Scale proof is missing.",
      blockerLabels: ["Scale proof missing."],
      nextActionLabels: ["Run saved-workspace backend scale proof."],
    },
  ],
  gateCounts: { ready: 5, blocked: 2, missing: 1, total: 8 },
  proofManifest: [
    {
      kind: "backend_scale",
      title: "Saved workspace backend scale receipt",
      status: "missing",
      proofReferenceLabels: [],
      missingProofLabels: ["Backend saved-workspace scale proof packet is missing."],
    },
  ],
  proofManifestCounts: { attached: 0, missing: 1, blocked: 0, total: 1 },
  blockerLabels: ["one", "two", "three", "four", "five"],
  nextActionLabels: [
    "Run saved-workspace backend scale proof.",
    "Prove approval execution UI and receipt handling.",
    "Prove collaborator lifecycle AFP projections.",
    "Run Oracle release proof.",
    "Record final durable evidence.",
  ],
  guardrailLabels: ["Do not deploy.", "Keep secrets out of logs.", "Record proof.", "Review rollback."],
};

test("production gate presentation shows absent packets as blocked missing proof", () => {
  const state = buildWeddingProductionGatePresentationState(null);

  assert.equal(state.visible, true);
  assert.equal(state.statusLabel, "Needs checks");
  assert.equal(state.canUploadToOracle, false);
  assert.match(state.summary, /Launch checks are not complete/i);
  assert.deepEqual(state.gates, []);
  assert.deepEqual(state.proofManifest, []);
  assert.deepEqual(state.blockerLabels, ["Launch checklist is missing."]);
  assert.ok(state.guardrailLabels.some((label) => /Do not publish/i.test(label)));
  assert.equal(state.gateCountLabel, null);
  assert.equal(state.proofManifestCountLabel, null);
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.deepEqual(state.missingProofLabels, []);
  assert.equal(state.nextActionLabel, "Attach aggregate wedding production go/no-go proof packet.");
  assert.deepEqual(state.nextActionLabels, ["Attach aggregate wedding production go/no-go proof packet."]);
});

test("production gate presentation summarizes blocked packets conservatively", () => {
  const state = buildWeddingProductionGatePresentationState(blockedPacket);

  assert.equal(state.visible, true);
  assert.equal(state.canUploadToOracle, false);
  assert.equal(state.statusLabel, "Needs checks");
  assert.match(state.containerClass, /red/);
  assert.equal(state.gateCountLabel, "5/8 gates ready, 2 blocked, 1 missing");
  assert.equal(state.proofManifestCountLabel, "0/1 receipt groups attached, 1 missing");
  assert.deepEqual(state.blockerLabels, ["one", "two", "three", "four"]);
  assert.deepEqual(state.guardrailLabels, ["Do not deploy.", "Keep secrets out of logs.", "Record proof."]);
  assert.deepEqual(state.missingProofLabels, ["Backend saved-workspace scale proof packet is missing."]);
  assert.equal(state.nextActionLabel, "Run saved-workspace backend scale proof.");
  assert.deepEqual(state.nextActionLabels, [
    "Run saved-workspace backend scale proof.",
    "Prove approval execution UI and receipt handling.",
    "Prove collaborator lifecycle AFP projections.",
    "Run Oracle release proof.",
  ]);
});

test("production gate presentation marks ready packets with ready tone", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    status: "ready",
    canUploadToOracle: true,
    summary: "All proof gates are ready.",
    gateCounts: { ready: 8, blocked: 0, missing: 0, total: 8 },
    proofManifest: [
      {
        kind: "backend_scale",
        title: "Saved workspace backend scale receipt",
        status: "attached",
        proofReferenceLabels: ["Scale proof reference: refresh-scale:ok"],
        missingProofLabels: [],
      },
    ],
    proofManifestCounts: { attached: 1, missing: 0, blocked: 0, total: 1 },
    blockerLabels: [],
    nextActionLabels: [],
  });

  assert.equal(state.statusLabel, "Ready");
  assert.match(state.containerClass, /emerald/);
  assert.equal(state.gateCountLabel, "8/8 gates ready");
  assert.equal(state.proofManifestCountLabel, "1/1 receipt groups attached");
  assert.deepEqual(state.proofReferenceLabels, ["Scale proof reference: refresh-scale:ok"]);
  assert.equal(state.nextActionLabel, null);
  assert.deepEqual(state.nextActionLabels, []);
});
