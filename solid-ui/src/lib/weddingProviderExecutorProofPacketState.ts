// @locs-version: 2.0
import type {
  WeddingProviderExecutorSuiteCapability,
  WeddingProviderExecutorSuiteReadinessState,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";
import {
  buildWeddingProviderExecutorUnblockPlanState,
  type WeddingProviderExecutorUnblockPlanState,
} from "@/lib/weddingProviderExecutorUnblockPlanState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
} from "@/lib/weddingProductionLabelState";

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
  return cleanWeddingProductionLabels(values);
}

function durableProofRef(value: string | null): string | null {
  const proofRef = cleanWeddingProductionLabel(value);
  if (!proofRef) return null;
  if (durableWeddingProductionProofLabels([proofRef]).length === 0) return null;
  if (/^https?:\/\//i.test(proofRef)) return null;
  return proofRef;
}

function invalidProofRefBlocker(requiredProvider: string, rawProofRef: string | null, proofRef: string | null): string | null {
  if (!rawProofRef || proofRef) return null;
  return `${requiredProvider} proof reference must be a durable provider execution ID, not a local, dry-run, placeholder, receipt, display, browser-only, or HTTP link.`;
}

function duplicateProofRefs(packets: readonly Pick<WeddingProviderExecutorProofPacketCapability, "proofRef">[]): Set<string> {
  const counts = new Map<string, number>();
  packets.forEach((packet) => {
    if (!packet.proofRef) return;
    counts.set(packet.proofRef, (counts.get(packet.proofRef) ?? 0) + 1);
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([proofRef]) => proofRef));
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
  const baseCapabilityPackets = suite.checks.map((check): WeddingProviderExecutorProofPacketCapability => {
    const steps = stepsForCapability(plan, check.capability);
    const rawProofRef = cleanWeddingProductionLabel(check.proofRef);
    const proofRef = durableProofRef(rawProofRef);
    return {
      capability: check.capability,
      requiredProvider: check.requiredProvider,
      status: check.status,
      blockers: cleanWeddingProductionLabels([
        ...check.blockerLabels,
        invalidProofRefBlocker(check.requiredProvider, rawProofRef, proofRef),
      ]),
      proofRef,
      nextRequiredStepKinds: unique(steps.map((step) => step.kind)),
      envHints: unique(steps.flatMap((step) => step.envHints)),
      proofHints: unique(steps.flatMap((step) => step.proofHints)),
      setupSurfaces: unique(steps.map((step) => step.setupSurface)),
    };
  });
  const duplicateRefs = duplicateProofRefs(baseCapabilityPackets);
  const capabilityPackets = baseCapabilityPackets.map((packet): WeddingProviderExecutorProofPacketCapability => {
    if (!packet.proofRef || !duplicateRefs.has(packet.proofRef)) return packet;
    return {
      ...packet,
      status: "blocked",
      blockers: cleanWeddingProductionLabels([
        ...packet.blockers,
        `${packet.requiredProvider} must have a unique durable connected app proof reference.`,
      ]),
    };
  });
  const missingProofRefs = capabilityPackets
    .filter((packet) => packet.status !== "ready" || !packet.proofRef)
    .map((packet) => `${packet.requiredProvider}: proof receipt required`);
  const nextActionLabels = cleanWeddingProductionLabels(
    suite.nextActionLabels.length
      ? suite.nextActionLabels
      : plan.nextStep
        ? [plan.nextStep.title]
        : [],
  );
  const canClearOracleProviderGate = suite.productionEvidenceReady && missingProofRefs.length === 0;

  return {
    status: canClearOracleProviderGate ? "ready" : "blocked",
    title: canClearOracleProviderGate
      ? "Connected app proof packet ready"
      : "Connected app proof packet blocked",
    summary: canClearOracleProviderGate
      ? "All required wedding connected app actions have sign-in, callable action, and proof coverage."
      : "Oracle connected-app gate remains blocked until every required wedding app has fresh sign-in, callable actions, smoke receipts, and durable proof references.",
    canClearOracleProviderGate,
    capabilityPackets,
    missingProofRefs: cleanWeddingProductionLabels(missingProofRefs),
    nextActionLabels,
    operatorChecklist: [
      "Run only approval-gated wedding actions through connected apps.",
      "Keep wedding-template background work separate from direct Master Agent queries.",
      "Store smoke-test and production execution receipts as searchable AFP evidence.",
      "Attach proof references before clearing the Oracle connected-app gate.",
    ],
  };
}
