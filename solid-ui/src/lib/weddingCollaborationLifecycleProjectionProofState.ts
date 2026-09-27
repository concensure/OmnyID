// @locs-version: 2.0
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingCollaborationLifecycleProjectionKind =
  | "invite"
  | "expire"
  | "revoke"
  | "review";

export type WeddingCollaborationLifecycleProjectionProofInput = {
  projectedKinds?: readonly WeddingCollaborationLifecycleProjectionKind[] | null;
  guardedAccessControlProjection?: boolean | null;
  sharedEditingDisabledByDefault?: boolean | null;
  backendGrantBlockedWithoutAcl?: boolean | null;
  searchableAfpRecords?: boolean | null;
  proofRef?: string | null;
  proofReferencePolicy?: "optional" | "required" | null;
};

export type WeddingCollaborationLifecycleProjectionProofState = {
  status: "ready" | "blocked";
  productionEvidenceReady: boolean;
  projectedKinds: WeddingCollaborationLifecycleProjectionKind[];
  evidenceLabels: string[];
  blockerLabels: string[];
  missingKindLabels: string[];
  proofReferenceLabel: string | null;
  summary: string;
};

const REQUIRED_KINDS: readonly WeddingCollaborationLifecycleProjectionKind[] = [
  "invite",
  "expire",
  "revoke",
  "review",
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function durableProofRef(value: unknown): string | null {
  const ref = clean(value);
  if (!ref) return null;
  if (durableWeddingProductionProofLabels([ref]).length === 0) return null;
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
  return ref;
}

function kindLabel(kind: WeddingCollaborationLifecycleProjectionKind): string {
  if (kind === "expire") return "expiry";
  if (kind === "revoke") return "revocation";
  if (kind === "review") return "stale-access review";
  return "invite";
}

export function buildWeddingCollaborationLifecycleProjectionProofState(
  input: WeddingCollaborationLifecycleProjectionProofInput = {},
): WeddingCollaborationLifecycleProjectionProofState {
  const projectedKinds = Array.from(new Set((input.projectedKinds ?? []).filter((kind): kind is WeddingCollaborationLifecycleProjectionKind =>
    kind === "invite" || kind === "expire" || kind === "revoke" || kind === "review",
  )));
  const missingKinds = REQUIRED_KINDS.filter((kind) => !projectedKinds.includes(kind));
  const rawProofRef = clean(input.proofRef);
  const proofRef = durableProofRef(rawProofRef);
  const proofReferenceRequired = input.proofReferencePolicy === "required";
  const blockerLabels = [
    ...missingKinds.map((kind) => `${kindLabel(kind)} projection proof is missing.`),
    ...(!input.guardedAccessControlProjection ? ["Guarded AFP access-control projection proof is missing."] : []),
    ...(!input.sharedEditingDisabledByDefault ? ["Shared editing disabled-by-default proof is missing."] : []),
    ...(!input.backendGrantBlockedWithoutAcl ? ["Backend grant-blocked-without-ACL proof is missing."] : []),
    ...(!input.searchableAfpRecords ? ["Searchable collaborator lifecycle AFP record proof is missing."] : []),
    ...(proofReferenceRequired && !rawProofRef ? ["Collaboration lifecycle proof reference is not mounted."] : []),
    ...(proofReferenceRequired && rawProofRef && !proofRef
      ? ["Collaboration lifecycle proof reference must be a durable audit ID or remote HTTPS proof link, not a local, dry-run, placeholder, localhost, or browser-only reference."]
      : []),
  ];
  const evidenceLabels = [
    ...projectedKinds.map((kind) => `${kindLabel(kind)} projection covered`),
    input.guardedAccessControlProjection ? "guarded AFP access-control projection covered" : null,
    input.sharedEditingDisabledByDefault ? "shared editing disabled by default" : null,
    input.backendGrantBlockedWithoutAcl ? "backend grant blocked without ACL" : null,
    input.searchableAfpRecords ? "searchable AFP lifecycle records covered" : null,
    proofRef ? `collaboration lifecycle proof: ${proofRef}` : null,
  ].filter((value): value is string => Boolean(value));
  const productionEvidenceReady = blockerLabels.length === 0;
  const proofReferenceLabel = proofRef
    ? cleanWeddingProductionLabel(`collaboration lifecycle proof: ${proofRef}`)
    : null;

  return {
    status: productionEvidenceReady ? "ready" : "blocked",
    productionEvidenceReady,
    projectedKinds,
    evidenceLabels: cleanWeddingProductionLabels(evidenceLabels),
    blockerLabels: cleanWeddingProductionLabels(blockerLabels),
    missingKindLabels: missingKinds.map(kindLabel),
    proofReferenceLabel,
    summary: productionEvidenceReady
      ? "Collaborator invite, expiry, revocation, and stale-access review projection proof is complete."
      : "Collaborator lifecycle projection proof is incomplete; keep shared wedding access fail-closed.",
  };
}
