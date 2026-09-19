// @locs-version: 2.0
export type WeddingWorkspaceRefreshScaleProofInput = {
  requestedPageSize?: number | null;
  pageCount?: number | null;
  totalLoaded?: number | null;
  maxPageMs?: number | null;
  pageOffsets?: readonly number[] | null;
  duplicateMessageIds?: readonly string[] | null;
  errorCount?: number | null;
  hasMoreAfterFinalPage?: boolean | null;
  source?: string | null;
  targetLabel?: string | null;
  proofRef?: string | null;
  proofReferencePolicy?: "optional" | "required" | null;
};

export type WeddingWorkspaceRefreshScaleProofState = {
  status: "pass" | "blocked";
  readiness: "oracle_ready" | "needs_live_scale_proof";
  summary: string;
  requiredEvidenceLabels: string[];
  blockerLabels: string[];
  evidenceLabels: string[];
  nextActionLabels: string[];
};

const MAX_PAGE_SIZE = 100;
const MAX_PAGE_MS = 2500;

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

function normalizedOffsets(values: readonly number[] | null | undefined): number[] {
  return (values ?? [])
    .map((value) => Math.trunc(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function offsetsAreSequential(offsets: readonly number[], pageSize: number, pageCount: number): boolean {
  if (offsets.length === 0) return true;
  if (offsets.length !== pageCount) return false;
  return offsets.every((offset, index) => offset === index * pageSize);
}

function nextActionFor(label: string): string {
  if (/page offsets/i.test(label)) return "Record sequential page offsets from the live backend proof run.";
  if (/page size/i.test(label)) return "Run refresh with a bounded page size at or below 100.";
  if (/two backend refresh pages/i.test(label)) return "Exercise at least two saved-workspace refresh pages.";
  if (/enough saved AFP messages/i.test(label)) return "Seed or select a workspace with enough saved AFP messages to prove pagination.";
  if (/final page/i.test(label)) return "Continue pagination until the backend returns has_more:false.";
  if (/Duplicate AFP message IDs/i.test(label)) return "Fix backend pagination cursor/offset handling before Oracle upload.";
  if (/refresh error/i.test(label)) return "Resolve refresh errors and rerun scale proof.";
  if (/Slowest refresh page/i.test(label)) return `Tune refresh query until every page is at or below ${MAX_PAGE_MS}ms.`;
  if (/durable proof reference|local receipt|localhost URL|browser-only file reference/i.test(label)) return "Attach the saved scale-proof receipt ID, artifact path, or audit link.";
  return "Complete saved-workspace refresh scale proof.";
}

export function buildWeddingWorkspaceRefreshScaleProofState(
  input: WeddingWorkspaceRefreshScaleProofInput,
): WeddingWorkspaceRefreshScaleProofState {
  const requestedPageSize = Math.trunc(input.requestedPageSize ?? 0);
  const pageCount = Math.trunc(input.pageCount ?? 0);
  const totalLoaded = Math.trunc(input.totalLoaded ?? 0);
  const maxPageMs = Math.trunc(input.maxPageMs ?? 0);
  const duplicateMessageIds = input.duplicateMessageIds?.filter(Boolean) ?? [];
  const errorCount = Math.trunc(input.errorCount ?? 0);
  const finalPageExhausted = input.hasMoreAfterFinalPage === false;
  const source = clean(input.source) || "wedding workspace refresh scale proof";
  const targetLabel = clean(input.targetLabel);
  const rawProofRef = clean(input.proofRef);
  const proofRef = durableProofRef(rawProofRef);
  const proofReferenceRequired = input.proofReferencePolicy === "required";
  const pageOffsets = normalizedOffsets(input.pageOffsets);

  const requiredEvidenceLabels = [
    "bounded page size at or below 100 messages",
    "at least two refresh pages exercised",
    "final page proves has_more:false",
    "no duplicate AFP message IDs across pages",
    "no refresh errors",
    `slowest page at or below ${MAX_PAGE_MS}ms`,
    "page offsets are sequential when provided",
    "durable scale proof reference is attached when required",
  ];
  const blockerLabels: string[] = [];
  const evidenceLabels: string[] = [];

  if (requestedPageSize < 1 || requestedPageSize > MAX_PAGE_SIZE) {
    blockerLabels.push("Requested refresh page size is missing or exceeds the 100-message cap.");
  } else {
    evidenceLabels.push(`Page size ${requestedPageSize}`);
  }
  if (pageCount < 2) {
    blockerLabels.push("Scale proof must exercise at least two backend refresh pages.");
  } else {
    evidenceLabels.push(`${pageCount} pages exercised`);
  }
  if (totalLoaded < requestedPageSize) {
    blockerLabels.push("Scale proof must load enough saved AFP messages to prove pagination, not only a small workspace.");
  } else {
    evidenceLabels.push(`${totalLoaded} saved AFP messages loaded`);
  }
  if (!finalPageExhausted) {
    blockerLabels.push("Scale proof must end on a final page where has_more is false.");
  } else {
    evidenceLabels.push("Final page reported has_more:false");
  }
  if (duplicateMessageIds.length > 0) {
    blockerLabels.push(`Duplicate AFP message IDs appeared across pages: ${duplicateMessageIds.join(", ")}.`);
  } else {
    evidenceLabels.push("No duplicate message IDs");
  }
  if (errorCount > 0) {
    blockerLabels.push(`${errorCount} refresh error${errorCount === 1 ? "" : "s"} occurred during scale proof.`);
  } else {
    evidenceLabels.push("No refresh errors");
  }
  if (maxPageMs < 1 || maxPageMs > MAX_PAGE_MS) {
    blockerLabels.push(`Slowest refresh page is missing or above ${MAX_PAGE_MS}ms.`);
  } else {
    evidenceLabels.push(`Slowest page ${maxPageMs}ms`);
  }
  if (!offsetsAreSequential(pageOffsets, requestedPageSize, pageCount)) {
    blockerLabels.push("Scale proof page offsets are missing or not sequential for the requested page size.");
  } else if (pageOffsets.length > 0) {
    evidenceLabels.push(`Sequential offsets: ${pageOffsets.join(", ")}`);
  }
  if (proofReferenceRequired && !rawProofRef) {
    blockerLabels.push("Scale proof passed fields but has no durable proof reference.");
  } else if (proofReferenceRequired && rawProofRef && !proofRef) {
    blockerLabels.push("Scale proof reference must be a durable audit ID or remote proof link, not a local receipt, localhost URL, or browser-only file reference.");
  } else if (proofRef) {
    evidenceLabels.push(`Scale proof reference: ${proofRef}`);
  }
  if (targetLabel) evidenceLabels.push(`Target: ${targetLabel}`);

  const status = blockerLabels.length === 0 ? "pass" : "blocked";

  return {
    status,
    readiness: status === "pass" ? "oracle_ready" : "needs_live_scale_proof",
    summary:
      status === "pass"
        ? `${source} passed across ${pageCount} pages and ${totalLoaded} saved AFP messages.`
        : `${source} still needs live scale proof before Oracle upload.`,
    requiredEvidenceLabels,
    blockerLabels,
    evidenceLabels,
    nextActionLabels: blockerLabels.map(nextActionFor),
  };
}
