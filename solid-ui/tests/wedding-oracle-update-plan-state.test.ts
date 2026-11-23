import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingOracleUpdatePlanState,
  buildWeddingOracleUpdateTaskItems,
} from "@/lib/weddingOracleUpdatePlanState";
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import { buildWeddingProductionReadinessState } from "@/lib/weddingProductionReadinessState";

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

function readyGoNoGoPacket(): WeddingProductionGoNoGoPacketState {
  return {
    status: "ready",
    canUploadToOracle: true,
    title: "Wedding Oracle upload go/no-go ready",
    summary: "All required proof gates are ready.",
    gates: completeReadyGates(),
    gateCounts: { ready: 13, blocked: 0, missing: 0, total: 13 },
    proofManifest: [
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
        proofReferenceLabels: ["gmail-message:prod"],
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
    ],
    proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    blockerLabels: [],
    nextActionLabels: [],
    guardrailLabels: [],
  };
}

test("buildWeddingOracleUpdatePlanState blocks Oracle update while required readiness gates fail", () => {
  const readiness = buildWeddingProductionReadinessState();
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: readyGoNoGoPacket(),
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.ok(plan.blockerLabels.includes("Backend refresh pagination and query tuning"));
  assert.ok(plan.steps.every((step) => step.kind === "blocked"));
  assert.ok(plan.guardrailLabels.some((label) => /Never update the live wedding planner/i.test(label)));
  assert.match(plan.summary, /blocked by/i);
});

test("buildWeddingOracleUpdatePlanState returns preflight/deploy/verify steps only when Oracle gates pass", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: readyGoNoGoPacket(),
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "ready");
  assert.equal(plan.canUpdateOracle, true);
  assert.deepEqual(plan.steps.map((step) => step.kind), ["preflight", "deploy", "verify", "record"]);
  assert.ok(plan.steps.some((step) => step.commandLabel === "scripts/deploy-oracle.ps1"));
  assert.match(plan.summary, /can be updated/i);
});

test("buildWeddingOracleUpdatePlanState does not require optional gates for Oracle update", () => {
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
  const optionalBlockers = readiness.checks.filter((check) => !check.requiredForOracle && check.status === "blocked");
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: readyGoNoGoPacket(),
    targetLabel: "Oracle wedding prod",
  });

  assert.ok(optionalBlockers.length > 0);
  assert.equal(plan.blockerLabels.length, 0);
  assert.equal(plan.canUpdateOracle, true);
});

test("buildWeddingOracleUpdatePlanState requires aggregate go/no-go packet even when legacy gates pass", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({ productionReadiness: readiness });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.deepEqual(plan.blockerLabels, ["Production go/no-go: Aggregate production go/no-go packet is missing."]);
});

test("buildWeddingOracleUpdatePlanState rejects forged ready packets without proof manifest", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: {
      ...readyGoNoGoPacket(),
      gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
      proofManifest: [],
      proofManifestCounts: { attached: 0, missing: 0, blocked: 0, total: 0 },
    },
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.deepEqual(plan.blockerLabels, [
    "Production go/no-go: Aggregate production go/no-go packet is marked ready but is missing complete gate counts or proof manifest receipts.",
  ]);
});

test("buildWeddingOracleUpdatePlanState rejects ready packets with forged proof manifest counts", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: {
      ...readyGoNoGoPacket(),
      proofManifest: [],
      proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    },
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.deepEqual(plan.blockerLabels, [
    "Production go/no-go: Aggregate production go/no-go packet is marked ready but is missing complete gate counts or proof manifest receipts.",
  ]);
});

test("buildWeddingOracleUpdatePlanState rejects ready packets with forged gate counts", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: {
      ...readyGoNoGoPacket(),
      gates: [],
      gateCounts: { ready: 12, blocked: 0, missing: 0, total: 12 },
    },
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.deepEqual(plan.blockerLabels, [
    "Production go/no-go: Aggregate production go/no-go packet is marked ready but is missing complete gate counts or proof manifest receipts.",
  ]);
});

test("buildWeddingOracleUpdatePlanState rejects ready packets missing a required proof manifest kind", () => {
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
  const forgedManifest = readyGoNoGoPacket().proofManifest.map((item) =>
    item.kind === "vendor_quote_reply"
      ? {
          ...item,
          kind: "backend_scale" as const,
          title: "Duplicate backend receipt pretending to fill the manifest.",
          proofReferenceLabels: ["backend-duplicate:prod"],
        }
      : item,
  );
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: {
      ...readyGoNoGoPacket(),
      proofManifest: forgedManifest,
      proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    },
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.deepEqual(plan.blockerLabels, [
    "Production go/no-go: Aggregate production go/no-go packet is marked ready but is missing complete gate counts or proof manifest receipts.",
  ]);
});

test("buildWeddingOracleUpdatePlanState rejects ready packets with weak proof manifest refs", () => {
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
  const weakManifest = readyGoNoGoPacket().proofManifest.map((item) =>
    item.kind === "vendor_quote_reply"
      ? {
          ...item,
          proofReferenceLabels: ["Actual connected provider send verified: mock-gmail-message-placeholder"],
        }
      : item,
  );
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: {
      ...readyGoNoGoPacket(),
      proofManifest: weakManifest,
      proofManifestCounts: { attached: 8, missing: 0, blocked: 0, total: 8 },
    },
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.deepEqual(plan.blockerLabels, [
    "Production go/no-go: Aggregate production go/no-go packet is marked ready but is missing complete gate counts or proof manifest receipts.",
  ]);
});

test("buildWeddingOracleUpdatePlanState requires explicit target before update", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: readyGoNoGoPacket(),
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.equal(plan.targetLabel, "Oracle production target");
  assert.deepEqual(plan.blockerLabels, ["Live launch target label is missing."]);
  assert.deepEqual(plan.steps.map((step) => step.kind), ["blocked"]);
});

test("buildWeddingOracleUpdatePlanState blocks Oracle update when aggregate go/no-go packet is blocked", () => {
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
  const productionGoNoGoPacket: WeddingProductionGoNoGoPacketState = {
    status: "blocked",
    canUploadToOracle: false,
    title: "Wedding Oracle upload blocked",
    summary: "Do not upload until proof packets are ready.",
    gates: [],
    gateCounts: { ready: 6, blocked: 2, missing: 0, total: 8 },
    blockerLabels: [
      "Backend saved-workspace scale proof packet is missing.",
      "Live provider executor proof is missing.",
    ],
    nextActionLabels: [],
    guardrailLabels: [],
  };
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket,
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(readiness.oracleUploadAllowed, true);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.ok(plan.blockerLabels.includes("Production go/no-go: Backend saved-workspace scale proof packet is missing."));
  assert.ok(plan.steps.every((step) => step.kind === "blocked"));
  assert.ok(plan.guardrailLabels.some((label) => /launch-readiness proof/i.test(label)));
});

test("buildWeddingOracleUpdatePlanState makes vendor quote go/no-go blockers specific", () => {
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
  const productionGoNoGoPacket: WeddingProductionGoNoGoPacketState = {
    ...readyGoNoGoPacket(),
    status: "blocked",
    canUploadToOracle: false,
    gateCounts: { ready: 10, blocked: 1, missing: 0, total: 11 },
    blockerLabels: [
      "Vendor quote reply live production proof is blocked: Actual connected Gmail/provider send proof is not attached.",
    ],
  };
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket,
    targetLabel: "Oracle wedding prod",
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.steps.length, 1);
  assert.match(plan.steps[0]?.detail ?? "", /vendor quote reply live-send proof/i);
  assert.match(plan.steps[0]?.detail ?? "", /durable receipt/i);
  assert.match(plan.steps[0]?.detail ?? "", /proof drawer/i);
});

test("buildWeddingOracleUpdatePlanState keeps blocked go/no-go packets actionable without blocker labels", () => {
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
  const productionGoNoGoPacket: WeddingProductionGoNoGoPacketState = {
    status: "blocked",
    canUploadToOracle: false,
    title: "Wedding Oracle upload blocked",
    summary: "Do not upload until proof packets are ready.",
    gates: [],
    gateCounts: { ready: 7, blocked: 1, missing: 0, total: 8 },
    blockerLabels: [],
    nextActionLabels: ["Run Oracle release proof."],
    guardrailLabels: [],
  };
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket,
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.canUpdateOracle, false);
  assert.deepEqual(plan.blockerLabels, ["Production go/no-go: Next action required: Run Oracle release proof."]);
  assert.deepEqual(plan.steps.map((step) => step.title), ["Production go/no-go: Next action required: Run Oracle release proof."]);
});

test("buildWeddingOracleUpdatePlanState normalizes noisy go/no-go labels before task projection", () => {
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
  const longBlockerLabel = `Vendor quote reply live production proof is blocked because ${"receipt ".repeat(40)}`;
  const productionGoNoGoPacket: WeddingProductionGoNoGoPacketState = {
    ...readyGoNoGoPacket(),
    status: "blocked",
    canUploadToOracle: false,
    gateCounts: { ready: 10, blocked: 1, missing: 0, total: 11 },
    blockerLabels: [
      "  Vendor quote reply live production proof is blocked: Server thread proof round-trip has not been verified.  ",
      "Vendor   quote reply live production proof is blocked: Server thread proof round-trip has not been verified.",
      longBlockerLabel,
      "",
    ],
  };
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket,
    targetLabel: "  Oracle   wedding   prod  ",
  });
  const tasks = buildWeddingOracleUpdateTaskItems({ oracleUpdatePlan: plan });

  assert.equal(plan.targetLabel, "Oracle wedding prod");
  assert.deepEqual(plan.blockerLabels, [
    "Production go/no-go: Vendor quote reply live production proof is blocked: Server thread proof round-trip has not been verified.",
    `Production go/no-go: ${longBlockerLabel}`.slice(0, 237) + "...",
  ]);
  assert.ok(plan.blockerLabels.every((label) => label.length <= 240));
  assert.deepEqual(tasks.map((task) => task.title), plan.blockerLabels.map((label) => `Finish launch check: ${label}`));
  assert.ok(tasks.every((task) => (task.metadata as Record<string, unknown>).oracle_update_target_label === "Oracle wedding prod"));
});

test("buildWeddingOracleUpdatePlanState falls back when blocked go/no-go labels clean to empty", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: {
      ...readyGoNoGoPacket(),
      status: "blocked",
      canUploadToOracle: false,
      gateCounts: { ready: 10, blocked: 1, missing: 0, total: 11 },
      blockerLabels: ["", "   "],
      nextActionLabels: ["", "   "],
    },
    targetLabel: "Oracle wedding prod",
  });

  assert.deepEqual(plan.blockerLabels, [
    "Production go/no-go: Aggregate production go/no-go packet is blocked (10/11 gates ready, 1 blocked, 0 missing).",
  ]);
});

test("buildWeddingOracleUpdateTaskItems projects blocked Oracle gates into existing wedding tasks", () => {
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: buildWeddingProductionReadinessState(),
    targetLabel: "Oracle wedding prod",
  });
  const tasks = buildWeddingOracleUpdateTaskItems({
    oracleUpdatePlan: plan,
    metadata: {
      wedding_plan_id: "wedding_plan:oracle",
      response_workspace_id: "response_workspace:oracle",
    },
  });

  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((task) => task.kind === "other"));
  assert.ok(tasks.every((task) => task.priority === "urgent"));
  assert.ok(tasks.every((task) => (task.metadata as Record<string, unknown>).oracle_update_plan_task === true));
  assert.ok(tasks.every((task) => (task.metadata as Record<string, unknown>).oracle_update_blocked === true));
  assert.ok(tasks.some((task) => /Finish launch check/i.test(task.title)));
});

test("buildWeddingOracleUpdateTaskItems carries vendor quote proof blockers into task notes", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: {
      ...readyGoNoGoPacket(),
      status: "blocked",
      canUploadToOracle: false,
      gateCounts: { ready: 10, blocked: 1, missing: 0, total: 11 },
      blockerLabels: [
        "Vendor quote reply live production proof is blocked: Server thread proof round-trip has not been verified.",
      ],
    },
    targetLabel: "Oracle wedding prod",
  });
  const tasks = buildWeddingOracleUpdateTaskItems({ oracleUpdatePlan: plan });
  const task = tasks[0];
  const metadata = task?.metadata as Record<string, unknown> | undefined;

  assert.equal(tasks.length, 1);
  assert.match(task?.notes ?? "", /vendor quote reply live-send proof/i);
  assert.match(task?.notes ?? "", /proof drawer reconstructs quote, draft, and sent proof/i);
  assert.ok((metadata?.searchable_terms as unknown[]).some((term) =>
    typeof term === "string" && /Server thread proof round-trip/i.test(term)
  ));
});

test("buildWeddingOracleUpdateTaskItems projects ready Oracle steps and dedupes existing step ids", () => {
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
  const plan = buildWeddingOracleUpdatePlanState({
    productionReadiness: readiness,
    productionGoNoGoPacket: readyGoNoGoPacket(),
    targetLabel: "Oracle wedding prod",
  });
  const tasks = buildWeddingOracleUpdateTaskItems({
    oracleUpdatePlan: plan,
    existingTaskItems: [{
      id: "existing-preflight",
      title: "Existing preflight",
      kind: "other",
      metadata: { oracle_update_step_id: "oracle-update-preflight" },
    }],
  });

  assert.deepEqual(tasks.map((task) => (task.metadata as Record<string, unknown>).oracle_update_step_kind), [
    "deploy",
    "verify",
    "record",
  ]);
  assert.ok(tasks.some((task) => (task.metadata as Record<string, unknown>).oracle_update_command_label === "scripts/deploy-oracle.ps1"));
  assert.ok(tasks.every((task) => (task.metadata as Record<string, unknown>).oracle_update_can_update === true));
});
