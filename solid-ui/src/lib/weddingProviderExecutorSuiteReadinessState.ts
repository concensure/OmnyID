// @locs-version: 2.0
import type {
  WeddingProviderCapability,
  WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingProviderExecutorSuiteCapability = Extract<
  WeddingProviderCapability,
  "email" | "calendar" | "registry" | "vendor_search"
>;

export type WeddingProviderExecutorSuiteCapabilityCheck = {
  capability: WeddingProviderExecutorSuiteCapability;
  requiredProvider: string;
  status: "ready" | "blocked";
  blockerLabels: string[];
  proofRef: string | null;
};

export type WeddingProviderExecutorSuiteReadinessState = {
  status: "ready" | "blocked";
  productionEvidenceReady: boolean;
  checks: WeddingProviderExecutorSuiteCapabilityCheck[];
  missingCapabilityLabels: string[];
  blockerLabels: string[];
  proofReferenceLabels: string[];
  nextActionLabels: string[];
  summary: string;
};

export type WeddingProviderExecutorSuiteReadinessInput = {
  providers?: readonly WeddingProviderExecutorReadinessState[] | null;
  requiredCapabilities?: readonly WeddingProviderExecutorSuiteCapability[] | null;
  executorProofRefs?: Partial<Record<WeddingProviderExecutorSuiteCapability, string | null | undefined>> | null;
  proofReferencePolicy?: "optional" | "required" | null;
};

export const WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES: readonly WeddingProviderExecutorSuiteCapability[] = [
  "email",
  "calendar",
  "registry",
  "vendor_search",
] as const;

const PROVIDER_LABELS: Record<WeddingProviderExecutorSuiteCapability, string> = {
  email: "Gmail or email provider",
  calendar: "Google Calendar or calendar provider",
  registry: "Registry provider",
  vendor_search: "Brave Search, EXA Search, Google Places, or OSM/Overpass provider",
};

function blockerLabelsFor(provider: WeddingProviderExecutorReadinessState | undefined, capability: WeddingProviderExecutorSuiteCapability) {
  if (!provider) return [`${PROVIDER_LABELS[capability]} readiness proof is missing.`];

  const blockers: string[] = [];
  if (provider.credentialStatus === "missing") blockers.push(`${PROVIDER_LABELS[capability]} credentials are missing.`);
  if (provider.credentialStatus === "stale") blockers.push(`${PROVIDER_LABELS[capability]} credentials need reconnection.`);
  if (provider.executorStatus === "missing") blockers.push(`${PROVIDER_LABELS[capability]} connected app action is missing.`);
  if (!provider.productionReady && blockers.length === 0) blockers.push(`${PROVIDER_LABELS[capability]} is not production-ready.`);
  return blockers;
}

function bestProviderFor(
  providers: readonly WeddingProviderExecutorReadinessState[],
  capability: WeddingProviderExecutorSuiteCapability,
) {
  const matches = providers.filter((provider) => provider.capability === capability);
  return matches.find((provider) => provider.productionReady) ?? matches[0];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function durableProofRef(value: unknown): string | null {
  const proofRef = cleanWeddingProductionLabel(clean(value));
  if (!proofRef) return null;
  if (proofRef === "...") return null;
  if (/^https?:\/\//i.test(proofRef)) return null;
  if (/^receipt:/i.test(proofRef)) return null;
  if (/^(?:local|draft|display|dry-run|test|example|placeholder|fake|stub|mock):/i.test(proofRef)) return null;
  if (/\b(?:placeholder|fake|stub|mock|test)\b/i.test(proofRef)) return null;
  return proofRef;
}

function nextActionFor(label: string): string {
  if (/credentials/i.test(label)) return "Reconnect or mount fresh provider credentials.";
  if (/connected app action/i.test(label)) return "Connect the app action for this provider.";
  if (/unique durable connected app proof/i.test(label)) return "Attach a separate durable connected app proof receipt for each provider capability.";
  if (/durable connected app proof/i.test(label)) return "Attach a durable connected app proof receipt for this provider capability.";
  if (/readiness proof is missing/i.test(label)) return "Add provider readiness proof for the missing capability.";
  return "Complete connected app production proof.";
}

function duplicateProofRefs(checks: readonly WeddingProviderExecutorSuiteCapabilityCheck[]): Set<string> {
  const counts = new Map<string, number>();
  checks.forEach((check) => {
    if (!check.proofRef) return;
    counts.set(check.proofRef, (counts.get(check.proofRef) ?? 0) + 1);
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([proofRef]) => proofRef));
}

export function buildWeddingProviderExecutorSuiteReadinessState(
  input: WeddingProviderExecutorSuiteReadinessInput = {},
): WeddingProviderExecutorSuiteReadinessState {
  const providers = input.providers ?? [];
  const proofReferencesRequired = input.proofReferencePolicy === "required";
  const requiredCapabilities = input.requiredCapabilities?.length
    ? input.requiredCapabilities
    : WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES;
  const baseChecks = requiredCapabilities.map((capability): WeddingProviderExecutorSuiteCapabilityCheck => {
    const provider = bestProviderFor(providers, capability);
    const rawProofRef = clean(input.executorProofRefs?.[capability]);
    const proofRef = durableProofRef(rawProofRef);
    const blockerLabels = cleanWeddingProductionLabels([
      ...blockerLabelsFor(provider, capability),
      proofReferencesRequired && provider?.productionReady === true && rawProofRef && !proofRef
        ? `${PROVIDER_LABELS[capability]} proof reference must be a durable provider execution ID, not a local, dry-run, placeholder, receipt, or display reference.`
        : null,
      proofReferencesRequired && provider?.productionReady === true && !proofRef
        ? `${PROVIDER_LABELS[capability]} is ready but has no durable connected app proof reference.`
        : null,
    ]);
    return {
      capability,
      requiredProvider: PROVIDER_LABELS[capability],
      status: provider?.productionReady === true && (!proofReferencesRequired || Boolean(proofRef)) ? "ready" : "blocked",
      blockerLabels,
      proofRef,
    };
  });
  const duplicateRefs = duplicateProofRefs(baseChecks);
  const checks = baseChecks.map((check): WeddingProviderExecutorSuiteCapabilityCheck => {
    if (!check.proofRef || !duplicateRefs.has(check.proofRef)) return check;
    return {
      ...check,
      status: "blocked",
      blockerLabels: cleanWeddingProductionLabels([
        ...check.blockerLabels,
        `${check.requiredProvider} must have a unique durable connected app proof reference.`,
      ]),
    };
  });
  const missingCapabilityLabels = cleanWeddingProductionLabels(checks
    .filter((check) => !providers.some((provider) => provider.capability === check.capability))
    .map((check) => `${check.requiredProvider} readiness proof is missing.`));
  const blockerLabels = cleanWeddingProductionLabels(checks.flatMap((check) => check.blockerLabels));
  const proofReferenceLabels = cleanWeddingProductionLabels(checks
    .filter((check) => check.proofRef)
    .map((check) => `${check.requiredProvider} connected app proof: ${check.proofRef}`));
  const productionEvidenceReady = checks.every((check) => check.status === "ready");

  return {
    status: productionEvidenceReady ? "ready" : "blocked",
    productionEvidenceReady,
    checks,
    missingCapabilityLabels,
    blockerLabels,
    proofReferenceLabels,
    nextActionLabels: cleanWeddingProductionLabels(blockerLabels.map(nextActionFor)),
    summary: productionEvidenceReady
      ? "Email, calendar, registry, and vendor-search connected app actions are production-ready."
      : "External connected app suite is not production-ready.",
  };
}
