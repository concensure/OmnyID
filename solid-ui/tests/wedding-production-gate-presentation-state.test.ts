import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionGatePresentationState,
} from "@/lib/weddingProductionGatePresentationState";
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";

const readyGateKinds: readonly WeddingProductionGoNoGoPacketState["gates"][number]["kind"][] = [
  "backend_scale",
  "template_launch",
  "approval_ui",
  "vendor_comparison_ui",
  "vendor_quote_reply",
  "provider_executors",
  "expected_behavior",
  "import_parser",
  "collaboration_access",
  "collaboration_lifecycle",
  "admin_routing_policy",
  "admin_ops_metrics",
  "oracle_release",
];

function completeReadyGates(): WeddingProductionGoNoGoPacketState["gates"] {
  return readyGateKinds.map((kind) => ({
    kind,
    title: `Ready ${kind.replace(/_/g, " ")}`,
    status: "ready",
    detail: "Production proof is complete.",
    blockerLabels: [],
    nextActionLabels: [],
  }));
}

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

const completeProofManifest: WeddingProductionGoNoGoPacketState["proofManifest"] = [
  {
    kind: "backend_scale",
    title: "Saved workspace backend pagination and scale receipts",
    status: "attached",
    proofReferenceLabels: ["backend-pagination:prod", "refresh-scale:prod"],
    missingProofLabels: [],
  },
  {
    kind: "provider_executors",
    title: "External provider executor receipts",
    status: "attached",
    proofReferenceLabels: ["email:prod", "calendar:prod", "registry:prod", "vendor-search:prod"],
    missingProofLabels: [],
  },
  {
    kind: "template_launch",
    title: "Wedding template launch receipt",
    status: "attached",
    proofReferenceLabels: ["template-launch:prod"],
    missingProofLabels: [],
  },
  {
    kind: "vendor_quote_reply",
    title: "Vendor quote reply live-send receipt",
    status: "attached",
    proofReferenceLabels: ["Actual connected provider send verified: gmail-message:prod"],
    missingProofLabels: [],
  },
  {
    kind: "collaboration_lifecycle",
    title: "Collaborator lifecycle receipt",
    status: "attached",
    proofReferenceLabels: ["collaboration-lifecycle:prod"],
    missingProofLabels: [],
  },
  {
    kind: "admin_routing_policy",
    title: "Admin-funded AI routing policy receipt",
    status: "attached",
    proofReferenceLabels: ["admin-routing:prod"],
    missingProofLabels: [],
  },
  {
    kind: "admin_ops_metrics",
    title: "Admin Oracle metrics receipt",
    status: "attached",
    proofReferenceLabels: ["oracle-metrics:prod"],
    missingProofLabels: [],
  },
  {
    kind: "oracle_release",
    title: "Oracle release receipts",
    status: "attached",
    proofReferenceLabels: ["oracle-release:prod"],
    missingProofLabels: [],
  },
];

test("production gate presentation shows absent packets as blocked missing proof", () => {
  const state = buildWeddingProductionGatePresentationState(null);

  assert.equal(state.visible, true);
  assert.equal(state.statusLabel, "Needs checks");
  assert.equal(state.canUploadToOracle, false);
  assert.match(state.summary, /Launch checks are not complete/i);
  assert.deepEqual(state.gates, []);
  assert.deepEqual(state.proofManifest, []);
  assert.deepEqual(state.proofManifestLabels, []);
  assert.deepEqual(state.blockerLabels, ["Launch checklist is missing."]);
  assert.ok(state.guardrailLabels.some((label) => /Do not publish/i.test(label)));
  assert.equal(state.gateCountLabel, null);
  assert.equal(state.proofManifestCountLabel, null);
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.deepEqual(state.missingProofLabels, []);
  assert.equal(state.nextActionLabel, "Attach launch-readiness proof.");
  assert.deepEqual(state.nextActionLabels, ["Attach launch-readiness proof."]);
});

test("production gate presentation summarizes blocked packets conservatively", () => {
  const state = buildWeddingProductionGatePresentationState(blockedPacket);

  assert.equal(state.visible, true);
  assert.equal(state.canUploadToOracle, false);
  assert.equal(state.statusLabel, "Needs checks");
  assert.match(state.containerClass, /red/);
  assert.equal(state.gateCountLabel, "5/8 gates ready, 2 blocked, 1 missing");
  assert.equal(state.proofManifestCountLabel, "0/1 receipt groups attached, 1 missing");
  assert.deepEqual(state.proofManifestLabels, [
    "Saved workspace backend scale receipt: missing, 1 missing",
  ]);
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
    gates: completeReadyGates(),
    gateCounts: { ready: 13, blocked: 0, missing: 0, total: 13 },
    proofManifest: completeProofManifest,
    proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    blockerLabels: [],
    nextActionLabels: [],
  });

  assert.equal(state.statusLabel, "Ready");
  assert.match(state.containerClass, /emerald/);
  assert.equal(state.gateCountLabel, "13/13 gates ready");
  assert.equal(state.proofManifestCountLabel, "8/8 receipt groups attached");
  assert.ok(state.proofManifestLabels.some((label) => /Vendor quote reply live-send receipt: attached/i.test(label)));
  assert.ok(state.proofManifestLabels.some((label) => /Wedding template launch receipt: attached/i.test(label)));
  assert.equal(state.proofReferenceLabels[0], "Actual connected provider send verified: gmail-message:prod");
  assert.equal(state.nextActionLabel, null);
  assert.deepEqual(state.nextActionLabels, []);
});

test("production gate presentation does not mark forged ready packets as uploadable", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    status: "ready",
    canUploadToOracle: true,
    summary: "All proof gates are ready.",
    gates: completeReadyGates(),
    gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
    proofManifest: [],
    proofManifestCounts: { attached: 0, missing: 0, blocked: 0, total: 0 },
    blockerLabels: [],
    nextActionLabels: [],
  });

  assert.equal(state.statusLabel, "Needs checks");
  assert.equal(state.canUploadToOracle, false);
  assert.match(state.containerClass, /red/);
  assert.equal(state.proofManifestCountLabel, "0/0 receipt groups attached");
  assert.ok(state.blockerLabels.includes(
    "Launch checklist is marked ready but is missing complete gate counts or proof manifest receipts.",
  ));
});

test("production gate presentation does not mark forged gate counts as uploadable", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    status: "ready",
    canUploadToOracle: true,
    summary: "All proof gates are ready.",
    gates: [],
    gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
    proofManifest: completeProofManifest,
    proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    blockerLabels: [],
    nextActionLabels: [],
  });

  assert.equal(state.statusLabel, "Needs checks");
  assert.equal(state.canUploadToOracle, false);
  assert.equal(state.gateCountLabel, "12/12 gates ready");
  assert.ok(state.blockerLabels.includes(
    "Launch checklist is marked ready but is missing complete gate counts or proof manifest receipts.",
  ));
});

test("production gate presentation does not mark weak proof refs as uploadable", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    status: "ready",
    canUploadToOracle: true,
    summary: "All proof gates are ready.",
    gates: completeReadyGates(),
    gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
    proofManifest: completeProofManifest.map((item) =>
      item.kind === "vendor_quote_reply"
        ? {
            ...item,
            proofReferenceLabels: ["Actual connected provider send verified: placeholder-gmail-message"],
          }
        : item,
    ),
    proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    blockerLabels: [],
    nextActionLabels: [],
  });

  assert.equal(state.statusLabel, "Needs checks");
  assert.equal(state.canUploadToOracle, false);
  assert.match(state.containerClass, /red/);
  assert.ok(state.blockerLabels.includes(
    "Launch checklist is marked ready but is missing complete gate counts or proof manifest receipts.",
  ));
});

test("production gate presentation keeps vendor quote blockers visible when many gates are blocked", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    blockerLabels: [
      "Backend pagination contract is missing.",
      "Approval UI proof is missing.",
      "Wedding import parser readiness is blocked.",
      "Collaborator lifecycle audit projection proof is missing.",
      "Vendor quote reply UI proof is missing.",
      "Actual connected Gmail/provider send proof is not attached.",
    ],
    nextActionLabels: [
      "Run saved-workspace backend scale proof.",
      "Prove approval execution UI and receipt handling.",
      "Review unprocessed wedding imports.",
      "Prove collaborator lifecycle AFP projections.",
      "Prove inline quote summary, state-derived decision CTAs, conditional Tiptap editor, undo-send, sent-history proof, live regions, and telemetry.",
      "Run a real connected-provider send verification and attach the durable provider proof reference.",
    ],
    proofManifest: [
      ...blockedPacket.proofManifest,
      {
        kind: "vendor_quote_reply",
        title: "Vendor quote reply live-send receipt",
        status: "blocked",
        proofReferenceLabels: [],
        missingProofLabels: [
          "Server thread proof round-trip has not been verified.",
          "Proof drawer does not reconstruct durable provider receipt.",
        ],
      },
    ],
    proofManifestCounts: { attached: 0, missing: 1, blocked: 1, total: 2 },
  });

  assert.deepEqual(state.blockerLabels.slice(0, 2), [
    "Vendor quote reply UI proof is missing.",
    "Actual connected Gmail/provider send proof is not attached.",
  ]);
  assert.equal(
    state.nextActionLabel,
    "Prove inline quote summary, state-derived decision CTAs, conditional Tiptap editor, undo-send, sent-history proof, live regions, and telemetry.",
  );
  assert.ok(state.nextActionLabels.some((label) => /connected-provider send verification/i.test(label)));
  assert.ok(state.missingProofLabels.some((label) => /proof drawer/i.test(label)));
  assert.equal(state.proofManifestCountLabel, "0/2 receipt groups attached, 1 blocked, 1 missing");
});

test("production gate presentation exposes attached vendor quote receipt refs", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    proofManifest: [
      {
        kind: "vendor_quote_reply",
        title: "Vendor quote reply live-send receipt",
        status: "attached",
        proofReferenceLabels: [
          "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
        ],
        missingProofLabels: [],
      },
    ],
    proofManifestCounts: { attached: 1, missing: 0, blocked: 0, total: 1 },
  });

  assert.equal(state.proofManifestCountLabel, "1/1 receipt groups attached");
  assert.deepEqual(state.proofManifestLabels, [
    "Vendor quote reply live-send receipt: attached, 1 proof ref",
  ]);
  assert.deepEqual(state.proofReferenceLabels, [
    "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
  ]);
  assert.deepEqual(state.missingProofLabels, []);
});

test("production gate presentation prioritizes vendor quote attached receipt refs in noisy packets", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    proofManifest: [
      {
        kind: "backend_scale",
        title: "Saved workspace backend scale receipt",
        status: "attached",
        proofReferenceLabels: [
          "Scale proof reference: refresh-scale:ok",
          "Scale proof reference: refresh-scale:page-2",
        ],
        missingProofLabels: [],
      },
      {
        kind: "provider_executors",
        title: "External provider executor receipts",
        status: "attached",
        proofReferenceLabels: [
          "calendar: calendar-smoke:ok",
          "registry: registry-smoke:ok",
          "weather: weather-smoke:ok",
          "vendor-search: search-smoke:ok",
          "email: email-smoke:ok",
          "maps: maps-smoke:ok",
          "sms: sms-smoke:ok",
        ],
        missingProofLabels: [],
      },
      {
        kind: "vendor_quote_reply",
        title: "Vendor quote reply live-send receipt",
        status: "attached",
        proofReferenceLabels: [
          "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
        ],
        missingProofLabels: [],
      },
    ],
    proofManifestCounts: { attached: 3, missing: 0, blocked: 0, total: 3 },
  });

  assert.equal(
    state.proofReferenceLabels[0],
    "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
  );
  assert.equal(state.proofReferenceLabels.length, 8);
  assert.ok(state.proofManifestLabels.some((label) => /Vendor quote reply live-send receipt: attached/i.test(label)));
});

test("production gate presentation keeps template launch proof visible in noisy packets", () => {
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    blockerLabels: [
      "Backend pagination contract is missing.",
      "Admin Oracle and user metrics proof is missing.",
      "Wedding template launch proof is blocked: Wedding template first-run intake gate is not proven before generated planning work.",
      "Provider executor proof is missing.",
      "Oracle release proof is missing.",
    ],
    nextActionLabels: [
      "Run saved-workspace backend scale proof.",
      "Mount admin Oracle metrics.",
      "Prove first-run intake appears before generated planning work for new template launches.",
      "Attach provider executor proof.",
      "Run Oracle release proof.",
    ],
    proofManifest: [
      {
        kind: "backend_scale",
        title: "Saved workspace backend scale receipt",
        status: "attached",
        proofReferenceLabels: ["Scale proof reference: refresh-scale:ok"],
        missingProofLabels: [],
      },
      {
        kind: "provider_executors",
        title: "External provider executor receipts",
        status: "attached",
        proofReferenceLabels: ["Gmail or email provider: email-smoke:ok"],
        missingProofLabels: [],
      },
      {
        kind: "template_launch",
        title: "Wedding template launch receipt",
        status: "attached",
        proofReferenceLabels: ["Wedding template launch proof: wedding-template-launch:oracle-prod-1:2026-09-28"],
        missingProofLabels: [],
      },
      {
        kind: "oracle_release",
        title: "Oracle release receipts",
        status: "attached",
        proofReferenceLabels: [
          "Release readiness: release:ok",
          "Production go/no-go: go-no-go:ok",
          "Backup verification: backup:ok",
          "Restore drill: restore:ok",
          "Secret sync: secret:ok",
          "Oracle remote proof: remote:ok",
        ],
        missingProofLabels: [],
      },
    ],
    proofManifestCounts: { attached: 4, missing: 0, blocked: 0, total: 4 },
  });

  assert.equal(
    state.blockerLabels[0],
    "Wedding template launch proof is blocked: Wedding template first-run intake gate is not proven before generated planning work.",
  );
  assert.equal(
    state.nextActionLabel,
    "Prove first-run intake appears before generated planning work for new template launches.",
  );
  assert.equal(state.proofManifestLabels[0], "Wedding template launch receipt: attached, 1 proof ref");
  assert.equal(
    state.proofReferenceLabels[0],
    "Wedding template launch proof: wedding-template-launch:oracle-prod-1:2026-09-28",
  );
});

test("production gate presentation cleans duplicate and oversized receipt labels", () => {
  const longProofRef = `Actual connected provider send verified: ${"x".repeat(240)}`;
  const state = buildWeddingProductionGatePresentationState({
    ...blockedPacket,
    guardrailLabels: [" Keep secrets out of logs. ", "Keep secrets out of logs.", "", "Record proof."],
    blockerLabels: [
      "  Vendor quote reply UI proof is missing.  ",
      "Vendor quote reply UI proof is missing.",
      "",
      "Other blocker",
    ],
    proofManifest: [
      {
        kind: "vendor_quote_reply",
        title: `Vendor quote reply live-send receipt ${"title ".repeat(40)}`,
        status: "attached",
        proofReferenceLabels: [
          " Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123 ",
          "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
          "",
          longProofRef,
        ],
        missingProofLabels: ["", "  Proof drawer does not reconstruct durable provider receipt.  "],
      },
      {
        kind: "backend_scale",
        title: "Saved workspace backend scale receipt",
        status: "missing",
        proofReferenceLabels: ["Scale proof reference: refresh-scale:ok", "Scale proof reference: refresh-scale:ok"],
        missingProofLabels: ["Backend proof missing.", "Backend proof missing."],
      },
    ],
    proofManifestCounts: { attached: 1, missing: 1, blocked: 0, total: 2 },
  });

  assert.deepEqual(state.guardrailLabels, ["Keep secrets out of logs.", "Record proof."]);
  assert.deepEqual(state.blockerLabels, ["Vendor quote reply UI proof is missing.", "Other blocker"]);
  assert.equal(state.proofReferenceLabels[0], "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123");
  assert.equal(state.proofReferenceLabels.length, 3);
  assert.ok(state.proofReferenceLabels[1].endsWith("..."));
  assert.ok(state.proofReferenceLabels[1].length <= 180);
  assert.match(state.proofManifestLabels[0] ?? "", /^Vendor quote reply live-send receipt .*: attached, 2 proof refs, 1 missing$/);
  assert.ok((state.proofManifestLabels[0] ?? "").includes("...: attached"));
  assert.doesNotMatch(state.proofManifestLabels[0] ?? "", /\bti\.\.\./);
  assert.ok(state.missingProofLabels.includes("Proof drawer does not reconstruct durable provider receipt."));
});
