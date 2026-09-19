// @locs-version: 2.0
import type { WeddingApprovalActionKind, WeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import type {
  WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";
import type {
  WeddingProviderExecutorSuiteCapability,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";

export type WeddingVendorSearchSmokeReceipt = {
  proofRef?: string | null;
  providerLabels?: readonly string[] | null;
  sourceUrls?: readonly string[] | null;
  sourceUrlCount?: number | null;
  queryContextLabel?: string | null;
  executedAt?: string | null;
};

export type WeddingProviderExecutorSmokeProofCapability = {
  capability: WeddingProviderExecutorSuiteCapability;
  status: "production_ready" | "dry_run_only" | "blocked";
  proofRef: string | null;
  evidenceLabels: string[];
  blockerLabels: string[];
};

export type WeddingProviderExecutorSmokeProofState = {
  status: "ready" | "blocked";
  productionEvidenceReady: boolean;
  capabilityProofs: WeddingProviderExecutorSmokeProofCapability[];
  providers: WeddingProviderExecutorReadinessState[];
  executorProofRefs: Partial<Record<WeddingProviderExecutorSuiteCapability, string>>;
  blockerLabels: string[];
  evidenceLabels: string[];
};

const REQUIRED_CAPABILITIES: readonly WeddingProviderExecutorSuiteCapability[] = [
  "email",
  "calendar",
  "registry",
  "vendor_search",
] as const;

const CAPABILITY_LABELS: Record<WeddingProviderExecutorSuiteCapability, string> = {
  email: "Gmail or email provider",
  calendar: "Google Calendar or calendar provider",
  registry: "Registry provider",
  vendor_search: "Brave Search, Google Places, or OSM/Overpass provider",
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function durableProofRef(value: unknown): string | null {
  const ref = clean(value);
  if (!ref) return null;
  if (/^(receipt|local|draft|display):/i.test(ref)) return null;
  if (/^(file|blob|data):/i.test(ref)) return null;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|::1)(?::|\/|$)/i.test(ref)) return null;
  return ref;
}

function capabilityForAction(actionKind: WeddingApprovalActionKind): WeddingProviderExecutorSuiteCapability | null {
  if (actionKind === "send_email" || actionKind === "contact_vendor" || actionKind === "invite_collaborator") return "email";
  if (actionKind === "create_external_calendar_event") return "calendar";
  if (actionKind === "publish_registry") return "registry";
  return null;
}

function receiptProofRef(receipt: WeddingApprovalReceiptState): string | null {
  return durableProofRef(receipt.metadata.external_id)
    || durableProofRef(receipt.metadata.provider_receipt_id)
    || durableProofRef(receipt.metadata.provider_message_id)
    || durableProofRef(receipt.metadata.provider_event_id)
    || durableProofRef(receipt.metadata.provider_publish_id)
    || durableProofRef(receipt.metadata.message_id)
    || null;
}

function isLiveProductionReceipt(receipt: WeddingApprovalReceiptState): boolean {
  return receipt.status === "executed"
    && receipt.metadata.provider_executor_mode === "live"
    && receipt.metadata.external_delivery_performed === true
    && receipt.metadata.provider_smoke_test_only !== true
    && Boolean(receiptProofRef(receipt));
}

function isDryRunReceipt(receipt: WeddingApprovalReceiptState): boolean {
  return receipt.status === "executed"
    && receipt.metadata.provider_executor_mode === "dry_run"
    && receipt.metadata.provider_smoke_test_only === true
    && receipt.metadata.external_delivery_performed === false;
}

function usableSourceUrls(value: readonly unknown[] | null | undefined): string[] {
  return (value ?? [])
    .map((item) => clean(item))
    .filter((url) => /^https?:\/\//i.test(url));
}

function proofForApprovalCapability(
  capability: Exclude<WeddingProviderExecutorSuiteCapability, "vendor_search">,
  receipts: readonly WeddingApprovalReceiptState[],
): WeddingProviderExecutorSmokeProofCapability {
  const matching = receipts.filter((receipt) => capabilityForAction(receipt.actionKind) === capability);
  const live = matching.find(isLiveProductionReceipt);
  if (live) {
    return {
      capability,
      status: "production_ready",
      proofRef: receiptProofRef(live),
      evidenceLabels: [
        `${CAPABILITY_LABELS[capability]} live executor receipt found.`,
        `Action: ${live.actionKind.replace(/_/g, " ")}`,
      ],
      blockerLabels: [],
    };
  }
  const dryRun = matching.find(isDryRunReceipt);
  if (dryRun) {
    return {
      capability,
      status: "dry_run_only",
      proofRef: receiptProofRef(dryRun),
      evidenceLabels: [`${CAPABILITY_LABELS[capability]} dry-run smoke receipt found.`],
      blockerLabels: [`${CAPABILITY_LABELS[capability]} still needs a live approved executor receipt before production.`],
    };
  }
  return {
    capability,
    status: "blocked",
    proofRef: null,
    evidenceLabels: [],
    blockerLabels: [`${CAPABILITY_LABELS[capability]} smoke proof is missing.`],
  };
}

function vendorSearchProof(
  receipts: readonly WeddingVendorSearchSmokeReceipt[] | null | undefined,
): WeddingProviderExecutorSmokeProofCapability {
  const valid = (receipts ?? []).find((receipt) =>
    Boolean(durableProofRef(receipt.proofRef)) &&
    usableSourceUrls(receipt.sourceUrls).length > 0 &&
    (receipt.providerLabels?.filter((label) => clean(label)).length ?? 0) > 0,
  );
  if (!valid) {
    return {
      capability: "vendor_search",
      status: "blocked",
      proofRef: null,
      evidenceLabels: [],
      blockerLabels: ["Vendor-search executor needs a provider receipt with source URLs and query context."],
    };
  }
  const sourceUrls = usableSourceUrls(valid.sourceUrls);
  return {
    capability: "vendor_search",
    status: "production_ready",
    proofRef: durableProofRef(valid.proofRef),
    evidenceLabels: [
      `Vendor search providers: ${valid.providerLabels?.filter((label) => clean(label)).join(", ")}`,
      `Vendor search source URLs: ${sourceUrls.length}`,
      clean(valid.queryContextLabel) ? `Query context: ${clean(valid.queryContextLabel)}` : null,
    ].filter((label): label is string => Boolean(label)),
    blockerLabels: [],
  };
}

function providerFromProof(proof: WeddingProviderExecutorSmokeProofCapability): WeddingProviderExecutorReadinessState {
  return {
    capability: proof.capability,
    requiredProvider: CAPABILITY_LABELS[proof.capability],
    credentialStatus: proof.status === "production_ready" ? "connected" : "missing",
    executorStatus: proof.status === "blocked" ? "missing" : "available",
    productionReady: proof.status === "production_ready",
    setupView: proof.capability === "email"
      ? "email"
      : proof.capability === "calendar"
        ? "calendar"
        : "connected_apps",
    summary: proof.status === "production_ready"
      ? `${CAPABILITY_LABELS[proof.capability]} executor smoke proof ready`
      : `${CAPABILITY_LABELS[proof.capability]} executor smoke proof blocked`,
    detail: proof.blockerLabels[0] ?? proof.evidenceLabels[0] ?? "Provider executor smoke proof evaluated.",
  };
}

export function buildWeddingProviderExecutorSmokeProofState(input: {
  approvalReceipts?: readonly WeddingApprovalReceiptState[] | null;
  vendorSearchReceipts?: readonly WeddingVendorSearchSmokeReceipt[] | null;
  requiredCapabilities?: readonly WeddingProviderExecutorSuiteCapability[] | null;
} = {}): WeddingProviderExecutorSmokeProofState {
  const requiredCapabilities = input.requiredCapabilities?.length
    ? input.requiredCapabilities
    : REQUIRED_CAPABILITIES;
  const approvalReceipts = input.approvalReceipts ?? [];
  const capabilityProofs = requiredCapabilities.map((capability) =>
    capability === "vendor_search"
      ? vendorSearchProof(input.vendorSearchReceipts)
      : proofForApprovalCapability(capability, approvalReceipts),
  );
  const providers = capabilityProofs.map(providerFromProof);
  const executorProofRefs = Object.fromEntries(
    capabilityProofs
      .filter((proof) => proof.status === "production_ready" && proof.proofRef)
      .map((proof) => [proof.capability, proof.proofRef]),
  ) as Partial<Record<WeddingProviderExecutorSuiteCapability, string>>;
  const blockerLabels = capabilityProofs.flatMap((proof) => proof.blockerLabels);
  const productionEvidenceReady = capabilityProofs.every((proof) => proof.status === "production_ready");

  return {
    status: productionEvidenceReady ? "ready" : "blocked",
    productionEvidenceReady,
    capabilityProofs,
    providers,
    executorProofRefs,
    blockerLabels,
    evidenceLabels: capabilityProofs.flatMap((proof) => proof.evidenceLabels),
  };
}
