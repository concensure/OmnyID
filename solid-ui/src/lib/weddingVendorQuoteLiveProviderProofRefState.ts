// @locs-version: 1.0
import { cleanWeddingProductionLabel } from "@/lib/weddingProductionLabelState";

export type WeddingVendorQuoteLiveProviderProofRefState = {
  proofRef: string | null;
  ready: boolean;
  evidenceLabel: string | null;
  blockerLabel: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLocalOrEphemeralProofRef(ref: string): boolean {
  if (/^(?:local|receipt|draft|display|omnyid:wedding_provider_dry_run):/i.test(ref)) return true;
  if (/^(?:file|blob|data):/i.test(ref)) return true;
  if (/(?:^|:)wedding_provider_dry_run(?::|$)/i.test(ref)) return true;
  if (/^https?:\/\//i.test(ref)) {
    try {
      const url = new URL(ref);
      const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      return hostname === "localhost"
        || hostname === "127.0.0.1"
        || hostname === "0.0.0.0"
        || hostname === "::1";
    } catch {
      return true;
    }
  }
  return false;
}

function looksDurableProviderProofRef(ref: string): boolean {
  return /^(?:https:\/\/|gmail:|google:|gcal:|provider:|audit:|oracle:|proof:|receipt-proof:|vendor-quote-provider:)/i.test(ref)
    || /^[a-z][a-z0-9_-]+:[a-z0-9][a-z0-9:._/-]*$/i.test(ref);
}

export function buildWeddingVendorQuoteLiveProviderProofRefState(input: {
  expectedProviderReceiptId?: string | null;
  proofRef?: string | null;
  verified?: boolean | null;
} = {}): WeddingVendorQuoteLiveProviderProofRefState {
  const rawProofRef = clean(input.proofRef);
  const expectedProviderReceiptId = clean(input.expectedProviderReceiptId);
  const proofRef = rawProofRef && !isLocalOrEphemeralProofRef(rawProofRef) && looksDurableProviderProofRef(rawProofRef)
    ? rawProofRef
    : null;
  if (input.verified !== true) {
    return {
      proofRef,
      ready: false,
      evidenceLabel: null,
      blockerLabel: "Actual connected Gmail/provider send has not been verified.",
    };
  }
  if (!rawProofRef) {
    return {
      proofRef: null,
      ready: false,
      evidenceLabel: null,
      blockerLabel: "Actual connected Gmail/provider send proof is not attached.",
    };
  }
  if (!proofRef) {
    return {
      proofRef: null,
      ready: false,
      evidenceLabel: null,
      blockerLabel: "Actual connected Gmail/provider proof reference must be a durable provider/audit ID or remote HTTPS proof link, not a local receipt, dry-run id, localhost URL, or browser-only file reference.",
    };
  }
  if (expectedProviderReceiptId && !proofRef.toLowerCase().includes(expectedProviderReceiptId.toLowerCase())) {
    return {
      proofRef,
      ready: false,
      evidenceLabel: null,
      blockerLabel: "Actual connected Gmail/provider proof reference does not match the verified provider receipt.",
    };
  }
  return {
    proofRef,
    ready: true,
    evidenceLabel: cleanWeddingProductionLabel(`Actual connected provider send verified: ${proofRef}`),
    blockerLabel: null,
  };
}
