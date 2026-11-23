// @locs-version: 2.0
import type {
  WeddingBoundaryChangeRequest,
  WeddingBoundaryDecisionRationale,
  WeddingBoundaryRequestStatus,
} from "@/lib/weddingBoundaryLedgerState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingBoundaryRequestDecision = "approve" | "decline";

export type WeddingBoundaryRequestDecisionResult = {
  updatedRequest: WeddingBoundaryChangeRequest;
  rationale: WeddingBoundaryDecisionRationale | null;
  statusLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nextStatus(decision: WeddingBoundaryRequestDecision): WeddingBoundaryRequestStatus {
  return decision === "approve" ? "approved" : "declined";
}

function decisionTitle(decision: WeddingBoundaryRequestDecision, request: WeddingBoundaryChangeRequest): string {
  return `${decision === "approve" ? "Approved" : "Declined"}: ${request.title}`;
}

export function buildWeddingBoundaryRequestDecision(input: {
  request: WeddingBoundaryChangeRequest;
  decision: WeddingBoundaryRequestDecision;
  decidedBy?: unknown;
  decidedAt?: unknown;
  publicReason?: unknown;
  privateRationaleCiphertext?: unknown;
}): WeddingBoundaryRequestDecisionResult {
  const existingStatus = clean(input.request.status);
  const alreadyFinal = input.request.requestStatus !== "pending"
    || existingStatus === "approved"
    || existingStatus === "declined"
    || existingStatus === "auto_blocked";
  if (alreadyFinal) {
    return {
      updatedRequest: input.request,
      rationale: null,
      statusLabel: "This guest-list request is already recorded.",
    };
  }
  const status = nextStatus(input.decision);
  const decidedAt = clean(input.decidedAt) || new Date().toISOString();
  const decidedBy = clean(input.decidedBy) || "couple";
  const publicReason = clean(input.publicReason) || input.request.publicReason || null;
  const privateRationaleCiphertext = clean(input.privateRationaleCiphertext);
  const updatedRequest: WeddingBoundaryChangeRequest = {
    ...input.request,
    status,
    requestStatus: status,
    approvalRequired: false,
    publicReason,
    metadata: {
      ...(input.request.metadata ?? {}),
      decision: input.decision,
      decided_by: decidedBy,
      decided_at: decidedAt,
    },
  };
  const rationale: WeddingBoundaryDecisionRationale | null = privateRationaleCiphertext
    ? {
      id: `rationale:${safeWeddingLabel(input.request.requestId)}:${input.decision}`,
      kind: "wedding_boundary_decision_rationale",
      title: decisionTitle(input.decision, input.request),
      status,
      visibility: "couple_only",
      decisionId: `decision:${safeWeddingLabel(input.request.requestId)}:${input.decision}`,
      linkedPolicyId: input.request.policyIds?.[0] ?? null,
      summaryPublic: publicReason,
      rationaleCiphertext: privateRationaleCiphertext,
      metadata: {
        boundary_request_id: input.request.requestId,
        decision: input.decision,
        decided_by: decidedBy,
        decided_at: decidedAt,
      },
    }
    : null;
  return {
    updatedRequest,
    rationale,
    statusLabel: input.decision === "approve"
      ? "Request approved. The guest-list decision is now recorded."
      : "Request declined. The reason is recorded so it does not need to be argued again.",
  };
}
