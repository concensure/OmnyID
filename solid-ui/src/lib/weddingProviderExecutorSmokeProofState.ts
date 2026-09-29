// @locs-version: 2.0
import type { WeddingApprovalActionKind, WeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import type {
  WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";
import type {
  WeddingProviderExecutorSuiteCapability,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

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
  vendor_search: "Brave Search, EXA Search, Google Places, or OSM/Overpass provider",
};

function clean(value: unknown): string {
  return cleanWeddingProductionLabel(typeof value === "string" ? value : null) ?? "";
}

function durableProofRef(value: unknown): string | null {
  const ref = clean(value);
  if (!ref) return null;
  if (ref === "...") return null;
  if (/^(?:test|example|placeholder|fake|stub|mock)$/i.test(ref)) return null;
  if (/^(receipt|local|draft|display|dry-run|test|example|placeholder|fake|stub|mock):/i.test(ref)) return null;
  if (/\b(?:test|example|placeholder|fake|stub|mock)\b/i.test(ref)) return null;
  if (/^(file|blob|data):/i.test(ref)) return null;
  if (/^https?:\/\//i.test(ref)) {
    try {
      const url = new URL(ref);
      const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (url.protocol !== "https:") return null;
      if (
        hostname === "localhost"
        || hostname === "127.0.0.1"
        || hostname === "0.0.0.0"
        || hostname === "::1"
      ) {
        return null;
      }
    } catch {
      return null;
    }
  }
  if (/(?:^|:)wedding_provider_dry_run(?::|$)/i.test(ref)) return null;
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return cleanWeddingProductionLabels(value);
}

function deliveryRecord(receipt: WeddingApprovalReceiptState): Record<string, unknown> | null {
  const delivery = receipt.metadata.delivery;
  return delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? delivery as Record<string, unknown>
    : null;
}

function hasEmailDeliveryPayload(receipt: WeddingApprovalReceiptState): boolean {
  const delivery = deliveryRecord(receipt);
  if (!delivery || delivery.channel !== "email") return false;
  return stringArray(delivery.to).length > 0
    && Boolean(clean(delivery.subject))
    && Boolean(clean(delivery.text));
}

function liveReceiptBlocker(receipt: WeddingApprovalReceiptState): string | null {
  if (receipt.actionKind !== "send_email" && receipt.actionKind !== "contact_vendor" && receipt.actionKind !== "invite_collaborator") {
    return null;
  }
  return hasEmailDeliveryPayload(receipt)
    ? null
    : `${CAPABILITY_LABELS.email} live receipt needs the approved email delivery payload with recipient, subject, and body.`;
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
    .filter((value) => {
      try {
        const url = new URL(value);
        const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
        return (url.protocol === "http:" || url.protocol === "https:")
          && hostname !== "localhost"
          && hostname !== "127.0.0.1"
          && hostname !== "0.0.0.0"
          && hostname !== "::1";
      } catch {
        return false;
      }
    });
}

function proofForApprovalCapability(
  capability: Exclude<WeddingProviderExecutorSuiteCapability, "vendor_search">,
  receipts: readonly WeddingApprovalReceiptState[],
): WeddingProviderExecutorSmokeProofCapability {
  const matching = receipts.filter((receipt) => capabilityForAction(receipt.actionKind) === capability);
  const liveBlockedByPayload = matching
    .filter(isLiveProductionReceipt)
    .map(liveReceiptBlocker)
    .find((blocker): blocker is string => Boolean(blocker));
  const live = matching.find((receipt) => isLiveProductionReceipt(receipt) && !liveReceiptBlocker(receipt));
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
    blockerLabels: [liveBlockedByPayload ?? `${CAPABILITY_LABELS[capability]} smoke proof is missing.`],
  };
}

function vendorSearchProof(
  receipts: readonly WeddingVendorSearchSmokeReceipt[] | null | undefined,
): WeddingProviderExecutorSmokeProofCapability {
  const valid = (receipts ?? []).find((receipt) =>
    Boolean(durableProofRef(receipt.proofRef)) &&
    usableSourceUrls(receipt.sourceUrls).length > 0 &&
    (receipt.providerLabels?.filter((label) => clean(label)).length ?? 0) > 0 &&
    Boolean(clean(receipt.queryContextLabel)),
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
  const providerLabels = cleanWeddingProductionLabels(valid.providerLabels ?? []);
  const queryContextLabel = clean(valid.queryContextLabel);
  return {
    capability: "vendor_search",
    status: "production_ready",
    proofRef: durableProofRef(valid.proofRef),
    evidenceLabels: cleanWeddingProductionLabels([
      `Vendor search providers: ${providerLabels.join(", ")}`,
      `Vendor search source URLs: ${sourceUrls.length}`,
      queryContextLabel ? `Query context: ${queryContextLabel}` : null,
    ]),
    blockerLabels: [],
  };
}

function duplicateProofRefs(
  proofs: readonly WeddingProviderExecutorSmokeProofCapability[],
): Set<string> {
  const counts = new Map<string, number>();
  proofs.forEach((proof) => {
    if (!proof.proofRef) return;
    counts.set(proof.proofRef, (counts.get(proof.proofRef) ?? 0) + 1);
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([proofRef]) => proofRef));
}

function rejectDuplicateProofRefs(
  proofs: readonly WeddingProviderExecutorSmokeProofCapability[],
): WeddingProviderExecutorSmokeProofCapability[] {
  const duplicateRefs = duplicateProofRefs(proofs);
  return proofs.map((proof) => {
    if (!proof.proofRef || !duplicateRefs.has(proof.proofRef)) return proof;
    return {
      ...proof,
      status: "blocked",
      evidenceLabels: [],
      blockerLabels: cleanWeddingProductionLabels([
        ...proof.blockerLabels,
        `${CAPABILITY_LABELS[proof.capability]} needs a unique live provider proof reference.`,
      ]),
    };
  });
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
  const capabilityProofs = rejectDuplicateProofRefs(
    requiredCapabilities.map((capability) =>
      capability === "vendor_search"
        ? vendorSearchProof(input.vendorSearchReceipts)
        : proofForApprovalCapability(capability, approvalReceipts),
    ),
  );
  const providers = capabilityProofs.map(providerFromProof);
  const executorProofRefs = Object.fromEntries(
    capabilityProofs
      .filter((proof) => proof.status === "production_ready" && proof.proofRef)
      .map((proof) => [proof.capability, proof.proofRef]),
  ) as Partial<Record<WeddingProviderExecutorSuiteCapability, string>>;
  const blockerLabels = cleanWeddingProductionLabels(capabilityProofs.flatMap((proof) => proof.blockerLabels));
  const productionEvidenceReady = capabilityProofs.every((proof) => proof.status === "production_ready");

  return {
    status: productionEvidenceReady ? "ready" : "blocked",
    productionEvidenceReady,
    capabilityProofs,
    providers,
    executorProofRefs,
    blockerLabels,
    evidenceLabels: cleanWeddingProductionLabels(capabilityProofs.flatMap((proof) => proof.evidenceLabels)),
  };
}
