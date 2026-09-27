// @locs-version: 2.0
import {
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingApprovalUiReadinessInput = {
  approvalControlsRendered?: boolean | null;
  rejectionControlsRendered?: boolean | null;
  executionControlRendered?: boolean | null;
  disclosurePreviewRendered?: boolean | null;
  riskLabelsRendered?: boolean | null;
  providerSetupRoutingRendered?: boolean | null;
  durableReceiptProjectionReady?: boolean | null;
  failureCopyRendered?: boolean | null;
  keyboardFallbackReady?: boolean | null;
  blockedStatePreventsExecution?: boolean | null;
  testedActionKinds?: readonly string[] | null;
  proofReferenceLabels?: readonly string[] | null;
  proofReferencePolicy?: "optional" | "required" | null;
  errorCount?: number | null;
};

export type WeddingApprovalUiReadinessState = {
  status: "ready" | "partial" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  proofReferenceLabels: string[];
  blockerLabels: string[];
};

const REQUIRED_ACTION_KINDS = [
  "send_email",
  "contact_vendor",
  "create_external_calendar_event",
  "share_artifact",
  "export_sensitive_bundle",
];

function cleanSet(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
}

function isApprovalUiProofReference(label: string): boolean {
  if (/^https?:\/\//i.test(label)) return false;
  if (/^(?:local|draft|display|receipt):/i.test(label)) return false;
  return /(?:approval|receipt|projection|ui|playwright|a11y|keyboard|blocked-state)/i.test(label);
}

export function buildWeddingApprovalUiReadinessState(
  input: WeddingApprovalUiReadinessInput = {},
): WeddingApprovalUiReadinessState {
  const testedActionKinds = cleanSet(input.testedActionKinds);
  const missingActionKinds = REQUIRED_ACTION_KINDS.filter((kind) => !testedActionKinds.has(kind));
  const errorCount = Math.max(0, Math.trunc(input.errorCount ?? 0));
  const proofReferencesRequired = input.proofReferencePolicy === "required";
  const proofReferenceLabels = durableWeddingProductionProofLabels(input.proofReferenceLabels)
    .filter(isApprovalUiProofReference);
  const evidenceLabels = cleanWeddingProductionLabels([
    input.approvalControlsRendered ? "approval controls rendered" : null,
    input.rejectionControlsRendered ? "rejection controls rendered" : null,
    input.executionControlRendered ? "execution controls rendered" : null,
    input.disclosurePreviewRendered ? "disclosure preview rendered" : null,
    input.riskLabelsRendered ? "risk labels rendered" : null,
    input.providerSetupRoutingRendered ? "provider setup routing rendered" : null,
    input.durableReceiptProjectionReady ? "durable receipt projection ready" : null,
    input.failureCopyRendered ? "failure copy rendered" : null,
    input.keyboardFallbackReady ? "keyboard fallback ready" : null,
    input.blockedStatePreventsExecution ? "blocked states prevent execution" : null,
    proofReferenceLabels.length ? `${proofReferenceLabels.length} durable approval UI proof reference${proofReferenceLabels.length === 1 ? "" : "s"}` : null,
    `${testedActionKinds.size}/${REQUIRED_ACTION_KINDS.length} required action kinds tested`,
  ]);
  const blockerLabels = cleanWeddingProductionLabels([
    input.approvalControlsRendered ? null : "Approval controls are not proven rendered.",
    input.rejectionControlsRendered ? null : "Reject/cancel controls are not proven rendered.",
    input.executionControlRendered ? null : "Execute-after-approval controls are not proven rendered.",
    input.disclosurePreviewRendered ? null : "Disclosure preview is not proven visible before approval.",
    input.riskLabelsRendered ? null : "Risk labels are not proven visible before approval.",
    input.providerSetupRoutingRendered ? null : "Provider setup routing is not proven visible for blocked provider actions.",
    input.durableReceiptProjectionReady ? null : "Approval receipts are not proven durable/searchable through AFP projection.",
    input.failureCopyRendered ? null : "Failure and retry copy is not proven visible.",
    input.keyboardFallbackReady ? null : "Keyboard/button fallback is not proven for approval controls.",
    input.blockedStatePreventsExecution ? null : "Blocked requests are not proven to prevent execution.",
    proofReferencesRequired && proofReferenceLabels.length === 0
      ? "Durable approval UI proof reference is missing."
      : null,
    missingActionKinds.length > 0 ? `Required action kinds not tested: ${missingActionKinds.join(", ")}.` : null,
    errorCount > 0 ? `${errorCount} approval UI error${errorCount === 1 ? "" : "s"} occurred.` : null,
  ]);

  if (blockerLabels.length === 0) {
    return {
      status: "ready",
      productionEvidenceReady: true,
      summary: "Wedding approval UI is ready with controls, disclosure, provider setup, receipts, fallback access, and blocked-state proof.",
      evidenceLabels,
      proofReferenceLabels,
      blockerLabels,
    };
  }

  const proofReferenceBlocked = proofReferencesRequired && proofReferenceLabels.length === 0;
  const partial = !proofReferenceBlocked
    && Boolean(input.approvalControlsRendered || input.durableReceiptProjectionReady || input.blockedStatePreventsExecution);
  return {
    status: partial ? "partial" : "blocked",
    productionEvidenceReady: false,
    summary: partial
      ? "Wedding approval UI has partial evidence, but is not production-ready yet."
      : "Wedding approval UI is not production-ready yet.",
    evidenceLabels,
    proofReferenceLabels,
    blockerLabels,
  };
}
