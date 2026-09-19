// @locs-version: 2.0
import type { WeddingWorkspaceRefreshScaleProofState } from "@/lib/weddingWorkspaceRefreshScaleProofState";

export type WeddingWorkspaceRefreshScaleProofRequirementKind =
  | "page_size"
  | "multi_page"
  | "message_volume"
  | "final_page"
  | "dedupe"
  | "error_free"
  | "latency"
  | "offsets"
  | "proof_ref";

export type WeddingWorkspaceRefreshScaleProofRequirement = {
  kind: WeddingWorkspaceRefreshScaleProofRequirementKind;
  title: string;
  status: "ready" | "blocked";
  evidenceLabel: string | null;
  blockerLabel: string | null;
  nextActionLabel: string | null;
};

export type WeddingWorkspaceRefreshScaleProofPacketState = {
  status: "ready" | "blocked";
  title: string;
  summary: string;
  canClearBackendScaleGate: boolean;
  requirements: WeddingWorkspaceRefreshScaleProofRequirement[];
  missingEvidenceLabels: string[];
  nextActionLabels: string[];
};

const REQUIREMENTS: readonly {
  kind: WeddingWorkspaceRefreshScaleProofRequirementKind;
  title: string;
  evidencePattern: RegExp;
  blockerPattern: RegExp;
  nextActionPattern: RegExp;
}[] = [
  {
    kind: "page_size",
    title: "Bounded page size",
    evidencePattern: /^Page size \d+/i,
    blockerPattern: /page size/i,
    nextActionPattern: /page size/i,
  },
  {
    kind: "multi_page",
    title: "At least two pages exercised",
    evidencePattern: /^\d+ pages exercised/i,
    blockerPattern: /at least two backend refresh pages/i,
    nextActionPattern: /two saved-workspace refresh pages|two backend refresh pages/i,
  },
  {
    kind: "message_volume",
    title: "Enough saved AFP messages",
    evidencePattern: /^\d+ saved AFP messages loaded/i,
    blockerPattern: /enough saved AFP messages/i,
    nextActionPattern: /enough saved AFP messages/i,
  },
  {
    kind: "final_page",
    title: "Final page exhausted",
    evidencePattern: /has_more:false/i,
    blockerPattern: /final page/i,
    nextActionPattern: /has_more:false|final page/i,
  },
  {
    kind: "dedupe",
    title: "No duplicate message IDs",
    evidencePattern: /^No duplicate message IDs/i,
    blockerPattern: /Duplicate AFP message IDs/i,
    nextActionPattern: /duplicate/i,
  },
  {
    kind: "error_free",
    title: "No refresh errors",
    evidencePattern: /^No refresh errors/i,
    blockerPattern: /refresh error/i,
    nextActionPattern: /refresh errors/i,
  },
  {
    kind: "latency",
    title: "Refresh latency within threshold",
    evidencePattern: /^Slowest page \d+ms/i,
    blockerPattern: /Slowest refresh page/i,
    nextActionPattern: /Tune refresh query/i,
  },
  {
    kind: "offsets",
    title: "Sequential page offsets",
    evidencePattern: /^Sequential offsets:/i,
    blockerPattern: /page offsets/i,
    nextActionPattern: /page offsets/i,
  },
  {
    kind: "proof_ref",
    title: "Durable scale-proof receipt",
    evidencePattern: /^Scale proof reference:/i,
    blockerPattern: /durable proof reference/i,
    nextActionPattern: /scale-proof receipt|proof reference/i,
  },
] as const;

function firstMatching(values: readonly string[] | null | undefined, pattern: RegExp): string | null {
  return (values ?? []).find((value) => pattern.test(value)) ?? null;
}

export function buildWeddingWorkspaceRefreshScaleProofPacketState(
  scaleProof: WeddingWorkspaceRefreshScaleProofState,
): WeddingWorkspaceRefreshScaleProofPacketState {
  const requirements = REQUIREMENTS.map((requirement): WeddingWorkspaceRefreshScaleProofRequirement => {
    const evidenceLabel = firstMatching(scaleProof.evidenceLabels, requirement.evidencePattern);
    const blockerLabel = firstMatching(scaleProof.blockerLabels, requirement.blockerPattern);
    const nextActionLabel = firstMatching(scaleProof.nextActionLabels, requirement.nextActionPattern);
    return {
      kind: requirement.kind,
      title: requirement.title,
      status: blockerLabel || !evidenceLabel ? "blocked" : "ready",
      evidenceLabel,
      blockerLabel,
      nextActionLabel,
    };
  });
  const missingEvidenceLabels = requirements
    .filter((requirement) => requirement.status !== "ready")
    .map((requirement) => `${requirement.title}: evidence required`);
  const canClearBackendScaleGate = scaleProof.status === "pass" && missingEvidenceLabels.length === 0;

  return {
    status: canClearBackendScaleGate ? "ready" : "blocked",
    title: canClearBackendScaleGate
      ? "Backend saved-workspace scale proof ready"
      : "Backend saved-workspace scale proof blocked",
    summary: canClearBackendScaleGate
      ? scaleProof.summary
      : "Backend saved-workspace refresh must prove bounded pagination, volume, dedupe, final-page exhaustion, latency, offsets, and durable proof before Oracle upload.",
    canClearBackendScaleGate,
    requirements,
    missingEvidenceLabels,
    nextActionLabels: scaleProof.nextActionLabels ?? [],
  };
}
