import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingOracleUpdatePlanState,
  buildWeddingOracleUpdateTaskItems,
} from "@/lib/weddingOracleUpdatePlanState";
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import { buildWeddingProductionReadinessState } from "@/lib/weddingProductionReadinessState";

function readyGoNoGoPacket(): WeddingProductionGoNoGoPacketState {
  return {
    status: "ready",
    canUploadToOracle: true,
    title: "Wedding Oracle upload go/no-go ready",
    summary: "All required proof gates are ready.",
    gates: [],
    gateCounts: { ready: 10, blocked: 0, missing: 0, total: 10 },
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
    approval_execution_ui: "pass",
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
    approval_execution_ui: "pass",
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
    approval_execution_ui: "pass",
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

test("buildWeddingOracleUpdatePlanState requires explicit target before update", () => {
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    approval_execution_ui: "pass",
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
    approval_execution_ui: "pass",
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

test("buildWeddingOracleUpdatePlanState keeps blocked go/no-go packets actionable without blocker labels", () => {
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    approval_execution_ui: "pass",
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

test("buildWeddingOracleUpdateTaskItems projects ready Oracle steps and dedupes existing step ids", () => {
  const readiness = buildWeddingProductionReadinessState({
    backend_pagination: "pass",
    approval_execution_ui: "pass",
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
