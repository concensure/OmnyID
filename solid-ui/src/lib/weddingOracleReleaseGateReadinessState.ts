// @locs-version: 2.0
export type WeddingOracleReleaseGateReadinessInput = {
  releaseReadinessPassed?: boolean | null;
  releaseReadinessRef?: string | null;
  productionGoNoGoPassed?: boolean | null;
  productionGoNoGoRef?: string | null;
  backupVerified?: boolean | null;
  backupVerificationRef?: string | null;
  restoreDrillPassed?: boolean | null;
  restoreDrillRef?: string | null;
  secretsSynced?: boolean | null;
  secretsSyncRef?: string | null;
  remoteProofPassed?: boolean | null;
  remoteProofRef?: string | null;
  targetLabel?: string | null;
  proofAgeHours?: number | null;
  maxProofAgeHours?: number | null;
  proofReferencePolicy?: "optional" | "required" | null;
};

export type WeddingOracleReleaseGateReadinessState = {
  status: "ready" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
  proofReferenceLabels: string[];
  nextActionLabels: string[];
  runbookLabels: string[];
};

const DEFAULT_MAX_PROOF_AGE_HOURS = 24;

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

function age(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

function proofLabel(label: string, ref: unknown): string | null {
  const cleaned = durableProofRef(ref);
  return cleaned ? `${label}: ${cleaned}` : null;
}

function missingProofRefBlocker(label: string, passed: boolean | null | undefined, ref: unknown): string | null {
  if (!passed) return null;
  const raw = clean(ref);
  if (!raw) return `${label} passed but has no durable proof reference.`;
  return durableProofRef(raw)
    ? null
    : `${label} proof reference must be a durable audit ID or remote proof link, not a local receipt, localhost URL, or browser-only file reference.`;
}

export function buildWeddingOracleReleaseGateReadinessState(
  input: WeddingOracleReleaseGateReadinessInput = {},
): WeddingOracleReleaseGateReadinessState {
  const targetLabel = clean(input.targetLabel) || "Oracle target";
  const proofAgeHours = age(input.proofAgeHours);
  const maxProofAgeHours = Math.max(1, age(input.maxProofAgeHours) || DEFAULT_MAX_PROOF_AGE_HOURS);
  const proofReferencesRequired = input.proofReferencePolicy === "required";
  const proofReferenceLabels = [
    proofLabel("release-readiness proof", input.releaseReadinessRef),
    proofLabel("production go/no-go proof", input.productionGoNoGoRef),
    proofLabel("backup verification proof", input.backupVerificationRef),
    proofLabel("restore drill proof", input.restoreDrillRef),
    proofLabel("secret sync proof", input.secretsSyncRef),
    proofLabel("Oracle remote proof", input.remoteProofRef),
  ].filter((value): value is string => Boolean(value));
  const evidenceLabels = [
    input.releaseReadinessPassed ? "release-readiness passed" : null,
    input.productionGoNoGoPassed ? "production-go/no-go passed" : null,
    input.backupVerified ? "backup verification passed" : null,
    input.restoreDrillPassed ? "restore drill passed" : null,
    input.secretsSynced ? "secrets synced to file-backed runtime policy" : null,
    input.remoteProofPassed ? "Oracle remote proof passed" : null,
    input.remoteProofPassed ? `${targetLabel} proof age ${proofAgeHours}h` : null,
    ...proofReferenceLabels,
  ].filter((value): value is string => Boolean(value));
  const blockerLabels = [
    input.releaseReadinessPassed ? null : "Repository release-readiness gate has not passed.",
    input.productionGoNoGoPassed ? null : "Production go/no-go gate has not passed.",
    input.backupVerified ? null : "Backup verification has not passed.",
    input.restoreDrillPassed ? null : "Restore drill has not passed.",
    input.secretsSynced ? null : "Secrets are not proven synced under file-backed runtime policy.",
    input.remoteProofPassed ? null : "Oracle remote proof has not passed on the intended target.",
    input.remoteProofPassed && proofAgeHours > maxProofAgeHours
      ? `Oracle remote proof is stale: ${proofAgeHours}h old, max ${maxProofAgeHours}h.`
      : null,
    proofReferencesRequired
      ? missingProofRefBlocker("Repository release-readiness gate", input.releaseReadinessPassed, input.releaseReadinessRef)
      : null,
    proofReferencesRequired
      ? missingProofRefBlocker("Production go/no-go gate", input.productionGoNoGoPassed, input.productionGoNoGoRef)
      : null,
    proofReferencesRequired
      ? missingProofRefBlocker("Backup verification", input.backupVerified, input.backupVerificationRef)
      : null,
    proofReferencesRequired
      ? missingProofRefBlocker("Restore drill", input.restoreDrillPassed, input.restoreDrillRef)
      : null,
    proofReferencesRequired
      ? missingProofRefBlocker("File-backed secret sync", input.secretsSynced, input.secretsSyncRef)
      : null,
    proofReferencesRequired
      ? missingProofRefBlocker("Oracle remote proof", input.remoteProofPassed, input.remoteProofRef)
      : null,
  ].filter((value): value is string => Boolean(value));
  const status = blockerLabels.length === 0 ? "ready" : "blocked";
  const nextActionLabels = [
    input.releaseReadinessPassed ? null : "Run repository release-readiness checks.",
    input.productionGoNoGoPassed ? null : "Record production go/no-go approval.",
    input.backupVerified ? null : "Run and record backup verification.",
    input.restoreDrillPassed ? null : "Run and record restore drill.",
    input.secretsSynced ? null : "Sync secrets to file-backed Oracle runtime policy.",
    input.remoteProofPassed ? null : "Run fresh Oracle remote proof on the intended target.",
    input.remoteProofPassed && proofAgeHours > maxProofAgeHours ? "Refresh stale Oracle remote proof." : null,
    proofReferencesRequired && blockerLabels.some((label) => /durable proof reference/i.test(label))
      ? "Attach durable proof references before marking Oracle upload ready."
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    status,
    productionEvidenceReady: status === "ready",
    summary: status === "ready"
      ? `${targetLabel} is ready for wedding planner Oracle upload.`
      : `${targetLabel} is still blocked from wedding planner Oracle upload.`,
    evidenceLabels,
    blockerLabels,
    proofReferenceLabels,
    nextActionLabels,
    runbookLabels: [
      "Keep production upload blocked until release-readiness, production go/no-go, backup, restore, secret-sync, and remote target proof all pass.",
      "Prefer file-backed secrets for Oracle runtime keys; do not paste API secrets into UI logs or AFP messages.",
      "Keep remote proof fresh for the intended target and store only receipt IDs, paths, or audit links in readiness state.",
    ],
  };
}
