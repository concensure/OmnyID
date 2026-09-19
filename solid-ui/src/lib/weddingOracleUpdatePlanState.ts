// @locs-version: 2.0
import type { WeddingProductionReadinessState } from "@/lib/weddingProductionReadinessState";
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingOracleUpdateStepKind =
  | "blocked"
  | "preflight"
  | "deploy"
  | "verify"
  | "record";

export type WeddingOracleUpdateStep = {
  id: string;
  kind: WeddingOracleUpdateStepKind;
  title: string;
  detail: string;
  commandLabel?: string | null;
  required: boolean;
};

export type WeddingOracleUpdatePlanState = {
  status: "blocked" | "ready";
  targetLabel: string;
  canUpdateOracle: boolean;
  summary: string;
  blockerLabels: string[];
  steps: WeddingOracleUpdateStep[];
  guardrailLabels: string[];
};

export type WeddingOracleUpdateTaskItemsInput = {
  oracleUpdatePlan?: WeddingOracleUpdatePlanState | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function blockedStep(blocker: string, index: number): WeddingOracleUpdateStep {
  return {
    id: `oracle-update-blocker:${index + 1}`,
    kind: "blocked",
    title: blocker,
    detail: "Resolve this required production-readiness gate before attempting an Oracle update.",
    required: true,
  };
}

function goNoGoBlockedLabels(packet: WeddingProductionGoNoGoPacketState | null | undefined): string[] {
  if (packet?.canUploadToOracle !== false) return [];
  if (packet.blockerLabels.length > 0) return packet.blockerLabels;
  if (packet.nextActionLabels.length > 0) {
    return packet.nextActionLabels.map((label) => `Next action required: ${label}`);
  }
  const counts = packet.gateCounts;
  return [
    `Aggregate production go/no-go packet is blocked (${counts.ready}/${counts.total} gates ready, ${counts.blocked} blocked, ${counts.missing} missing).`,
  ];
}

function readySteps(targetLabel: string): WeddingOracleUpdateStep[] {
  return [
    {
      id: "oracle-update-preflight",
      kind: "preflight",
      title: "Run Oracle deployment preflight",
      detail: `Confirm build artifacts, file-backed secrets, backups, and ${targetLabel} connectivity before deployment.`,
      commandLabel: "scripts/deployment-rehearsal.ps1",
      required: true,
    },
    {
      id: "oracle-update-deploy",
      kind: "deploy",
      title: "Update Oracle target",
      detail: "Deploy only after preflight passes and the production go/no-go proof remains fresh.",
      commandLabel: "scripts/deploy-oracle.ps1",
      required: true,
    },
    {
      id: "oracle-update-verify",
      kind: "verify",
      title: "Verify remote Oracle runtime",
      detail: "Run health, smoke, backup, restore, secret, provider-executor, and wedding readiness proof checks against the updated target.",
      commandLabel: "scripts/deployment-ops-selftest.sh",
      required: true,
    },
    {
      id: "oracle-update-record-proof",
      kind: "record",
      title: "Record durable Oracle update proof",
      detail: "Save receipt IDs, commit/build identifiers, target labels, and proof references. Do not store API secrets in AFP messages or UI logs.",
      required: true,
    },
  ];
}

export function buildWeddingOracleUpdatePlanState(input: {
  productionReadiness: WeddingProductionReadinessState;
  productionGoNoGoPacket?: WeddingProductionGoNoGoPacketState | null;
  targetLabel?: string | null;
}): WeddingOracleUpdatePlanState {
  const explicitTargetLabel = clean(input.targetLabel);
  const targetLabel = explicitTargetLabel || "Oracle production target";
  const readiness = input.productionReadiness;
  const readinessBlockerLabels = readiness.checks
    .filter((check) => check.requiredForOracle && check.status === "blocked")
    .map((check) => check.label);
  const goNoGoBlockerLabels = input.productionGoNoGoPacket
    ? goNoGoBlockedLabels(input.productionGoNoGoPacket)
    : readiness.oracleUploadAllowed
      ? ["Aggregate production go/no-go packet is missing."]
      : [];
  const blockerLabels = [...new Set([
    ...readinessBlockerLabels,
    ...goNoGoBlockerLabels.map((label) => `Production go/no-go: ${label}`),
  ])];
  const aggregateGoNoGoReady = input.productionGoNoGoPacket?.canUploadToOracle === true;
  const targetBlockerLabels = readiness.oracleUploadAllowed && aggregateGoNoGoReady && !explicitTargetLabel
    ? ["Oracle update target label is missing."]
    : [];
  blockerLabels.push(...targetBlockerLabels.filter((label) => !blockerLabels.includes(label)));
  const canUpdateOracle = readiness.oracleUploadAllowed && aggregateGoNoGoReady && Boolean(explicitTargetLabel) && blockerLabels.length === 0;
  const steps = canUpdateOracle
    ? readySteps(targetLabel)
    : blockerLabels.map(blockedStep);
  return {
    status: canUpdateOracle ? "ready" : "blocked",
    targetLabel,
    canUpdateOracle,
    summary: canUpdateOracle
      ? `${targetLabel} can be updated after preflight, deploy, verification, and proof-record steps complete.`
      : `${targetLabel} update is blocked by ${blockerLabels.length} required readiness gate${blockerLabels.length === 1 ? "" : "s"}.`,
    blockerLabels,
    steps,
    guardrailLabels: [
      "Never upload the wedding template to Oracle while required readiness gates are blocked.",
      "The aggregate wedding production go/no-go proof packet must be ready before Oracle upload.",
      "Run deployment commands outside the UI only after the readiness state allows Oracle update.",
      "Keep secrets file-backed and out of logs, AFP messages, screenshots, and planning artifacts.",
      "Record durable proof references after deployment so future passes can verify what changed.",
    ],
  };
}

function existingOracleUpdateTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = record(item.metadata);
    const stepId = clean(metadata.oracle_update_step_id);
    if (stepId) keys.add(stepId);
  }
  return keys;
}

function priorityForStep(step: WeddingOracleUpdateStep): WeddingPlanningTaskItem["priority"] {
  if (step.kind === "blocked") return "urgent";
  if (step.kind === "deploy" || step.kind === "verify") return "high";
  return "normal";
}

function taskTitleForStep(plan: WeddingOracleUpdatePlanState, step: WeddingOracleUpdateStep): string {
  if (step.kind === "blocked") return `Unblock Oracle update: ${step.title}`;
  return step.title.replace(/\bOracle\b/i, plan.targetLabel);
}

export function buildWeddingOracleUpdateTaskItems(input: WeddingOracleUpdateTaskItemsInput): WeddingPlanningTaskItem[] {
  const plan = input.oracleUpdatePlan;
  if (!plan) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingOracleUpdateTaskKeys(input.existingTaskItems ?? []);
  return plan.steps
    .map((step): WeddingPlanningTaskItem => {
      const id = `wedding_oracle_update_task:${safeWeddingLabel(plan.targetLabel)}:${safeWeddingLabel(step.id)}`;
      return {
        id,
        title: taskTitleForStep(plan, step),
        kind: "other",
        dueLabel: step.kind === "blocked" ? "Before any Oracle upload" : "During Oracle deployment window",
        priority: priorityForStep(step),
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata: {
          ...metadata,
          oracle_update_plan_task: true,
          oracle_update_step_kind: step.kind,
          oracle_update_step_id: step.id,
          oracle_update_target_label: plan.targetLabel,
          oracle_update_blocked: plan.status === "blocked",
          oracle_update_can_update: plan.canUpdateOracle,
          production_readiness_oracle_gate: true,
          no_external_send_without_approval: true,
          preparation_checklist: true,
          preparation_checklist_item: `oracle-update-${safeWeddingLabel(step.id)}`,
          user_selectable: true,
          can_deselect_before_commit: true,
          schedule_basis: plan.status === "blocked" ? "production_readiness_gate" : "oracle_deployment_sequence",
          second_order_loop: "commitment_timing",
          second_order_evidence_labels: plan.status === "blocked"
            ? ["Oracle update blocked", "required readiness gate"]
            : ["Oracle update ready", "preflight deploy verify record"],
          oracle_update_blocker_labels: plan.blockerLabels,
          oracle_update_guardrail_labels: plan.guardrailLabels,
          oracle_update_command_label: step.commandLabel ?? null,
          searchable_terms: [
            step.title,
            step.detail,
            step.kind,
            step.commandLabel,
            plan.targetLabel,
            plan.summary,
            ...plan.blockerLabels,
            ...plan.guardrailLabels,
            "Oracle update",
            "production readiness",
            "deployment gate",
            metadata.weddingPlanId,
            metadata.responseWorkspaceId,
          ].filter(Boolean),
        },
        notes: [
          step.detail,
          step.commandLabel ? `Command: ${step.commandLabel}.` : null,
          plan.status === "blocked"
            ? "Do not upload to Oracle until required production-readiness gates pass."
            : "Execute only after fresh preflight evidence confirms the target is safe.",
        ].filter(Boolean).join(" "),
      };
    })
    .filter((item) => {
      const metadata = record(item.metadata);
      const stepId = clean(metadata.oracle_update_step_id);
      return !existingKeys.has(item.id) && !existingKeys.has(stepId);
    });
}
