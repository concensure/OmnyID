// @locs-version: 2.0
import type { WeddingOracleReleaseGateReadinessState } from "@/lib/weddingOracleReleaseGateReadinessState";

export type WeddingOracleReleaseProofRequirementKind =
  | "release_readiness"
  | "production_go_no_go"
  | "backup_verification"
  | "restore_drill"
  | "secret_sync"
  | "remote_proof";

export type WeddingOracleReleaseProofRequirement = {
  kind: WeddingOracleReleaseProofRequirementKind;
  title: string;
  status: "ready" | "blocked";
  proofRef: string | null;
  blockerLabel: string | null;
  nextActionLabel: string | null;
};

export type WeddingOracleReleaseProofPacketState = {
  status: "ready" | "blocked";
  title: string;
  summary: string;
  canClearOracleReleaseGate: boolean;
  requirements: WeddingOracleReleaseProofRequirement[];
  missingProofLabels: string[];
  nextActionLabels: string[];
  runbookLabels: string[];
};

const REQUIREMENTS: readonly {
  kind: WeddingOracleReleaseProofRequirementKind;
  title: string;
  proofPattern: RegExp;
  blockerPattern: RegExp;
  nextActionPattern: RegExp;
}[] = [
  {
    kind: "release_readiness",
    title: "Repository release-readiness",
    proofPattern: /^release-readiness proof:/i,
    blockerPattern: /release-readiness/i,
    nextActionPattern: /release-readiness/i,
  },
  {
    kind: "production_go_no_go",
    title: "Production go/no-go approval",
    proofPattern: /^production go\/no-go proof:/i,
    blockerPattern: /production go\/no-go/i,
    nextActionPattern: /go\/no-go/i,
  },
  {
    kind: "backup_verification",
    title: "Backup verification",
    proofPattern: /^backup verification proof:/i,
    blockerPattern: /backup verification/i,
    nextActionPattern: /backup verification/i,
  },
  {
    kind: "restore_drill",
    title: "Restore drill",
    proofPattern: /^restore drill proof:/i,
    blockerPattern: /restore drill/i,
    nextActionPattern: /restore drill/i,
  },
  {
    kind: "secret_sync",
    title: "File-backed secret sync",
    proofPattern: /^secret sync proof:/i,
    blockerPattern: /secret/i,
    nextActionPattern: /secret/i,
  },
  {
    kind: "remote_proof",
    title: "Fresh Oracle remote proof",
    proofPattern: /^Oracle remote proof:/i,
    blockerPattern: /Oracle remote proof|stale Oracle remote proof/i,
    nextActionPattern: /Oracle remote proof|stale Oracle remote proof/i,
  },
] as const;

function firstMatching(values: readonly string[], pattern: RegExp): string | null {
  return values.find((value) => pattern.test(value)) ?? null;
}

function stripProofPrefix(label: string | null): string | null {
  if (!label) return null;
  const [, ref] = label.split(/:\s(.+)/, 2);
  return ref?.trim() || label;
}

export function buildWeddingOracleReleaseProofPacketState(
  gate: WeddingOracleReleaseGateReadinessState,
): WeddingOracleReleaseProofPacketState {
  const proofReferenceLabels = gate.proofReferenceLabels ?? [];
  const blockerLabels = gate.blockerLabels ?? [];
  const nextActionLabels = gate.nextActionLabels ?? [];
  const requirements = REQUIREMENTS.map((requirement): WeddingOracleReleaseProofRequirement => {
    const proofLabel = firstMatching(proofReferenceLabels, requirement.proofPattern);
    const proofRef = stripProofPrefix(proofLabel);
    const blockerLabel = firstMatching(blockerLabels, requirement.blockerPattern);
    const nextActionLabel = firstMatching(nextActionLabels, requirement.nextActionPattern);
    return {
      kind: requirement.kind,
      title: requirement.title,
      status: blockerLabel || !proofRef ? "blocked" : "ready",
      proofRef,
      blockerLabel,
      nextActionLabel,
    };
  });
  const missingProofLabels = requirements
    .filter((requirement) => requirement.status !== "ready" || !requirement.proofRef)
    .map((requirement) => `${requirement.title}: proof receipt required`);
  const canClearOracleReleaseGate = gate.productionEvidenceReady && missingProofLabels.length === 0;

  return {
    status: canClearOracleReleaseGate ? "ready" : "blocked",
    title: canClearOracleReleaseGate ? "Oracle release proof packet ready" : "Oracle release proof packet blocked",
    summary: canClearOracleReleaseGate
      ? "Oracle upload release evidence is complete and fresh for the intended target."
      : "Oracle upload remains blocked until release-readiness, go/no-go, backup, restore, secret-sync, and remote target proof are complete.",
    canClearOracleReleaseGate,
    requirements,
    missingProofLabels,
    nextActionLabels,
    runbookLabels: gate.runbookLabels ?? [],
  };
}
