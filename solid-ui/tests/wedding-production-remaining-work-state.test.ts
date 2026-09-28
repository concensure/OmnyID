import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import {
  buildWeddingProductionReadinessState,
} from "@/lib/weddingProductionReadinessState";
import {
  buildWeddingProductionReadinessEvidenceState,
} from "@/lib/weddingProductionReadinessEvidenceState";
import {
  buildWeddingProductionRemainingWorkState,
} from "@/lib/weddingProductionRemainingWorkState";

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

function readyGoNoGoPacket(): WeddingProductionGoNoGoPacketState {
  return {
    status: "ready",
    canUploadToOracle: true,
    title: "Wedding Oracle upload go/no-go ready",
    summary: "All required proof gates are ready.",
    gates: readyGateKinds.map((kind) => ({
      kind,
      title: `Ready ${kind.replace(/_/g, " ")}`,
      status: "ready",
      detail: "Production proof is complete.",
      blockerLabels: [],
      nextActionLabels: [],
    })),
    gateCounts: { ready: 13, blocked: 0, missing: 0, total: 13 },
    proofManifest: [
      { kind: "backend_scale", title: "Backend receipts", status: "attached", proofReferenceLabels: ["backend-pagination:prod", "refresh-scale:prod"], missingProofLabels: [] },
      { kind: "provider_executors", title: "Provider receipts", status: "attached", proofReferenceLabels: ["email:prod", "calendar:prod", "registry:prod", "vendor-search:prod"], missingProofLabels: [] },
      { kind: "template_launch", title: "Template receipt", status: "attached", proofReferenceLabels: ["template-launch:prod"], missingProofLabels: [] },
      { kind: "vendor_quote_reply", title: "Vendor quote receipt", status: "attached", proofReferenceLabels: ["gmail-message:prod"], missingProofLabels: [] },
      { kind: "collaboration_lifecycle", title: "Collaboration receipt", status: "attached", proofReferenceLabels: ["collaboration-lifecycle:prod"], missingProofLabels: [] },
      { kind: "admin_routing_policy", title: "Admin routing receipt", status: "attached", proofReferenceLabels: ["admin-routing:prod"], missingProofLabels: [] },
      { kind: "admin_ops_metrics", title: "Admin metrics receipt", status: "attached", proofReferenceLabels: ["oracle-metrics:prod"], missingProofLabels: [] },
      { kind: "oracle_release", title: "Oracle release receipt", status: "attached", proofReferenceLabels: ["oracle-release:prod"], missingProofLabels: [] },
    ],
    proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    blockerLabels: [],
    nextActionLabels: [],
    guardrailLabels: [],
  };
}

test("production remaining work separates Oracle blockers from production polish", () => {
  const state = buildWeddingProductionRemainingWorkState(buildWeddingProductionReadinessState());

  assert.equal(state.productionReady, false);
  assert.equal(state.oracleUploadAllowed, false);
  assert.equal(state.totalBlockedItems, 18);
  assert.equal(state.oracleBlockingItems.length, 12);
  assert.equal(state.productionPolishItems.length, 6);
  assert.ok(state.oracleBlockingItems.some((item) => item.id === "backend_pagination"));
  assert.ok(state.oracleBlockingItems.some((item) => item.id === "template_launch_intake"));
  assert.ok(state.oracleBlockingItems.some((item) => item.id === "provider_executor_integrations"));
  assert.ok(state.oracleBlockingItems.some((item) => item.id === "vendor_quote_reply_ui"));
  assert.deepEqual(state.nextRecommendedItems.map((item) => item.id), [
    "provider_executor_integrations",
    "approval_execution_ui",
    "template_launch_intake",
  ]);
  assert.equal(state.estimatedOraclePassesRemaining, 14);
  assert.equal(state.estimatedFullProductionPassesRemaining, 22);
  assert.equal(state.estimatedNextPasses, 4);
  assert.match(state.headline, /Oracle-blocking/i);
});

test("production remaining work reports Oracle-clear state with optional polish still open", () => {
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    template_launch_intake: "pass",
    approval_execution_ui: "pass",
    vendor_comparison_ui: "pass",
    vendor_quote_reply_ui: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    import_parser_readiness: "pass",
    oracle_release_gate: "pass",
  });
  const state = buildWeddingProductionRemainingWorkState(readiness, readyGoNoGoPacket());

  assert.equal(state.productionReady, false);
  assert.equal(state.oracleUploadAllowed, true);
  assert.equal(state.oracleBlockingItems.length, 0);
  assert.equal(state.productionPolishItems.length, 6);
  assert.deepEqual(state.nextRecommendedItems.map((item) => item.id), [
    "expected_behavior_coverage",
    "seeded_vendor_corpus",
    "live_map_geocoding",
  ]);
  assert.equal(state.estimatedOraclePassesRemaining, 0);
  assert.equal(state.estimatedFullProductionPassesRemaining, 8);
  assert.equal(state.estimatedNextPasses, 3);
  assert.match(state.headline, /Oracle upload/i);
});

test("production remaining work carries exact strict evidence proof blockers into polish summaries", () => {
  const evidence = buildWeddingProductionReadinessEvidenceState({
    strictOracleProofs: true,
    seededVendorCorpus: {
      status: "ready",
      vendorCount: 10,
      categoryCount: 6,
      sourceCount: 10,
      staleCount: 0,
      summaryArtifact: {},
      proofReferenceLabels: [],
    } as any,
  });
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    template_launch_intake: "pass",
    approval_execution_ui: "pass",
    vendor_comparison_ui: "pass",
    vendor_quote_reply_ui: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    import_parser_readiness: "pass",
    oracle_release_gate: "pass",
  }, evidence.evidence);
  const state = buildWeddingProductionRemainingWorkState(readiness, readyGoNoGoPacket(), evidence);

  const seededVendorCorpus = state.productionPolishItems.find((item) => item.id === "seeded_vendor_corpus");
  assert.equal(seededVendorCorpus?.summary, "Source-backed seeded vendor corpus proof reference is missing.");
});

test("production remaining work keeps Oracle blocked when aggregate packet is missing", () => {
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    template_launch_intake: "pass",
    approval_execution_ui: "pass",
    vendor_comparison_ui: "pass",
    vendor_quote_reply_ui: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    import_parser_readiness: "pass",
    oracle_release_gate: "pass",
  });
  const state = buildWeddingProductionRemainingWorkState(readiness);

  assert.equal(state.oracleUploadAllowed, false);
  assert.deepEqual(state.oracleBlockingItems.map((item) => item.id), ["aggregate_go_no_go_packet"]);
  assert.equal(state.estimatedOraclePassesRemaining, 1);
  assert.match(state.headline, /aggregate launch proof/i);
});

test("production remaining work rejects forged aggregate ready counts", () => {
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    template_launch_intake: "pass",
    live_map_geocoding: "pass",
    graph_canvas_highlighting: "pass",
    approval_execution_ui: "pass",
    vendor_comparison_ui: "pass",
    vendor_quote_reply_ui: "pass",
    native_export_workers: "pass",
    llm_need_to_know_extraction: "pass",
    seeded_vendor_corpus: "pass",
    expected_behavior_coverage: "pass",
    import_parser_readiness: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    oracle_release_gate: "pass",
  });
  const packet = readyGoNoGoPacket();
  const state = buildWeddingProductionRemainingWorkState(readiness, {
    ...packet,
    gates: [],
    gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.oracleUploadAllowed, false);
  assert.deepEqual(state.nextRecommendedItems.map((item) => item.id), ["aggregate_go_no_go_packet"]);
});

test("production remaining work reports complete readiness", () => {
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    template_launch_intake: "pass",
    live_map_geocoding: "pass",
    graph_canvas_highlighting: "pass",
    approval_execution_ui: "pass",
    vendor_comparison_ui: "pass",
    vendor_quote_reply_ui: "pass",
    native_export_workers: "pass",
    llm_need_to_know_extraction: "pass",
    seeded_vendor_corpus: "pass",
    expected_behavior_coverage: "pass",
    import_parser_readiness: "pass",
    provider_executor_integrations: "pass",
    collaboration_access_controls: "pass",
    collaboration_lifecycle_audit: "pass",
    admin_ai_routing_policy: "pass",
    admin_ops_backend_metrics: "pass",
    oracle_release_gate: "pass",
  });
  const state = buildWeddingProductionRemainingWorkState(readiness, readyGoNoGoPacket());

  assert.equal(state.productionReady, true);
  assert.equal(state.oracleUploadAllowed, true);
  assert.equal(state.totalBlockedItems, 0);
  assert.deepEqual(state.oracleBlockingItems, []);
  assert.deepEqual(state.productionPolishItems, []);
  assert.deepEqual(state.nextRecommendedItems, []);
  assert.equal(state.estimatedOraclePassesRemaining, 0);
  assert.equal(state.estimatedFullProductionPassesRemaining, 0);
  assert.equal(state.estimatedNextPasses, 0);
  assert.match(state.headline, /production-ready/i);
});
