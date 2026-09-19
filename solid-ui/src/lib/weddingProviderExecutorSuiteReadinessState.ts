// @locs-version: 2.0
import type {
  WeddingProviderCapability,
  WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";

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
  vendor_search: "Brave Search, Google Places, or OSM/Overpass provider",
};

function blockerLabelsFor(provider: WeddingProviderExecutorReadinessState | undefined, capability: WeddingProviderExecutorSuiteCapability) {
  if (!provider) return [`${PROVIDER_LABELS[capability]} readiness proof is missing.`];

  const blockers: string[] = [];
  if (provider.credentialStatus === "missing") blockers.push(`${PROVIDER_LABELS[capability]} credentials are missing.`);
  if (provider.credentialStatus === "stale") blockers.push(`${PROVIDER_LABELS[capability]} credentials need reconnection.`);
  if (provider.executorStatus === "missing") blockers.push(`${PROVIDER_LABELS[capability]} executor implementation is missing.`);
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
  const proofRef = clean(value);
  if (!proofRef) return null;
  if (/^https?:\/\//i.test(proofRef)) return null;
  if (/^receipt:/i.test(proofRef)) return null;
  return proofRef;
}

function nextActionFor(label: string): string {
  if (/credentials/i.test(label)) return "Reconnect or mount fresh provider credentials.";
  if (/executor implementation/i.test(label)) return "Connect the provider executor implementation.";
  if (/durable executor proof/i.test(label)) return "Attach durable executor proof receipt for this provider capability.";
  if (/readiness proof is missing/i.test(label)) return "Add provider readiness proof for the missing capability.";
  return "Complete provider executor production proof.";
}

export function buildWeddingProviderExecutorSuiteReadinessState(
  input: WeddingProviderExecutorSuiteReadinessInput = {},
): WeddingProviderExecutorSuiteReadinessState {
  const providers = input.providers ?? [];
  const proofReferencesRequired = input.proofReferencePolicy === "required";
  const requiredCapabilities = input.requiredCapabilities?.length
    ? input.requiredCapabilities
    : WEDDING_REQUIRED_PROVIDER_EXECUTOR_CAPABILITIES;
  const checks = requiredCapabilities.map((capability): WeddingProviderExecutorSuiteCapabilityCheck => {
    const provider = bestProviderFor(providers, capability);
    const rawProofRef = clean(input.executorProofRefs?.[capability]);
    const proofRef = durableProofRef(rawProofRef);
    const blockerLabels = [
      ...blockerLabelsFor(provider, capability),
      proofReferencesRequired && provider?.productionReady === true && rawProofRef && !proofRef
        ? `${PROVIDER_LABELS[capability]} proof reference must be a durable provider execution ID, not a local receipt ID or display link.`
        : null,
      proofReferencesRequired && provider?.productionReady === true && !proofRef
        ? `${PROVIDER_LABELS[capability]} is ready but has no durable executor proof reference.`
        : null,
    ].filter((label): label is string => Boolean(label));
    return {
      capability,
      requiredProvider: PROVIDER_LABELS[capability],
      status: provider?.productionReady === true && (!proofReferencesRequired || Boolean(proofRef)) ? "ready" : "blocked",
      blockerLabels,
      proofRef,
    };
  });
  const missingCapabilityLabels = checks
    .filter((check) => !providers.some((provider) => provider.capability === check.capability))
    .map((check) => `${check.requiredProvider} readiness proof is missing.`);
  const blockerLabels = checks.flatMap((check) => check.blockerLabels);
  const proofReferenceLabels = checks
    .filter((check) => check.proofRef)
    .map((check) => `${check.requiredProvider} executor proof: ${check.proofRef}`);
  const productionEvidenceReady = checks.every((check) => check.status === "ready");

  return {
    status: productionEvidenceReady ? "ready" : "blocked",
    productionEvidenceReady,
    checks,
    missingCapabilityLabels,
    blockerLabels,
    proofReferenceLabels,
    nextActionLabels: blockerLabels.map(nextActionFor),
    summary: productionEvidenceReady
      ? "Email, calendar, registry, and vendor-search provider executors are production-ready."
      : "External provider executor suite is not production-ready.",
  };
}
