// @locs-version: 2.0
import type {
  WeddingProviderExecutorSuiteCapability,
  WeddingProviderExecutorSuiteReadinessState,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";
import {
  buildWeddingProviderExecutorUnblockPlanState,
  type WeddingProviderExecutorUnblockPlanState,
} from "@/lib/weddingProviderExecutorUnblockPlanState";

export type WeddingProviderExecutorProofPacketCapability = {
  capability: WeddingProviderExecutorSuiteCapability;
  requiredProvider: string;
  status: "ready" | "blocked";
  blockers: string[];
  proofRef: string | null;
  nextRequiredStepKinds: string[];
  envHints: string[];
  proofHints: string[];
  setupSurfaces: string[];
};

export type WeddingProviderExecutorProofPacketState = {
  status: "ready" | "blocked";
  title: string;
  summary: string;
  canClearOracleProviderGate: boolean;
  capabilityPackets: WeddingProviderExecutorProofPacketCapability[];
  missingProofRefs: string[];
  nextActionLabels: string[];
  operatorChecklist: string[];
};

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stepsForCapability(
  plan: WeddingProviderExecutorUnblockPlanState,
  capability: WeddingProviderExecutorSuiteCapability,
) {
  return plan.steps.filter((step) => step.capability === capability && step.kind !== "ready");
}

export function buildWeddingProviderExecutorProofPacketState(
  suite: WeddingProviderExecutorSuiteReadinessState,
): WeddingProviderExecutorProofPacketState {
  const plan = buildWeddingProviderExecutorUnblockPlanState(suite);
  const capabilityPackets = suite.checks.map((check): WeddingProviderExecutorProofPacketCapability => {
    const steps = stepsForCapability(plan, check.capability);
    return {
      capability: check.capability,
      requiredProvider: check.requiredProvider,
      status: check.status,
      blockers: check.blockerLabels,
      proofRef: check.proofRef,
      nextRequiredStepKinds: unique(steps.map((step) => step.kind)),
      envHints: unique(steps.flatMap((step) => step.envHints)),
      proofHints: unique(steps.flatMap((step) => step.proofHints)),
      setupSurfaces: unique(steps.map((step) => step.setupSurface)),
    };
  });
  const missingProofRefs = capabilityPackets
    .filter((packet) => packet.status !== "ready" || !packet.proofRef)
    .map((packet) => `${packet.requiredProvider}: proof receipt required`);

  return {
    status: suite.productionEvidenceReady ? "ready" : "blocked",
    title: suite.productionEvidenceReady
      ? "Provider executor proof packet ready"
      : "Provider executor proof packet blocked",
    summary: suite.productionEvidenceReady
      ? "All required wedding provider executor capabilities have credential, executor, and proof coverage."
      : "Oracle provider gate remains blocked until every required wedding provider executor has fresh credentials, callable handlers, smoke receipts, and durable proof references.",
    canClearOracleProviderGate: suite.productionEvidenceReady && missingProofRefs.length === 0,
    capabilityPackets,
    missingProofRefs,
    nextActionLabels: suite.nextActionLabels.length
      ? suite.nextActionLabels
      : plan.nextStep
        ? [plan.nextStep.title]
        : [],
    operatorChecklist: [
      "Run only approval-gated wedding actions through these executors.",
      "Keep wedding-template background work separate from direct Master Agent queries.",
      "Store smoke-test and production execution receipts as searchable AFP evidence.",
      "Attach proof references before clearing the Oracle provider-executor gate.",
    ],
  };
}
