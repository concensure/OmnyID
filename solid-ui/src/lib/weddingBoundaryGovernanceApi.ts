// @locs-version: 1.0
import { apiFetch, apiUrlForPath } from "@/lib/api";

export type WeddingBoundaryDecisionReply = {
  request_id: string;
  decision_id?: string;
  impact_receipt_id?: string;
  status: "approved" | "partially_approved" | "declined" | "withdrawn";
  approval_count?: number;
  required_approval_count?: number;
  replayed: boolean;
  explanation: string;
};

export function decideWeddingBoundaryRequest(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  requestId: string;
  decision: "approve" | "decline" | "withdraw";
  expectedRevision: number;
  approvalActorId?: string;
  idempotencyKey: string;
}) {
  return apiFetch<WeddingBoundaryDecisionReply>("/wedding/boundaries/decisions", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      request_id: input.requestId,
      decision: input.decision,
      expected_revision: input.expectedRevision,
      approval_actor_id: input.approvalActorId,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export type WeddingBoundaryHouseholdCommand = {
  weddingPlanId: string;
  responseWorkspaceId: string;
  operation: "split_household" | "merge_households" | "archive_household" | "assign_group" | "change_allocation" | "change_representative" | "close_requests" | "reopen_requests";
  sourceHouseholdIds: string[];
  expectedRevisions: Record<string, number>;
  targetHouseholdId?: string;
  newHouseholdId?: string;
  newHouseholdLabel?: string;
  movePersonIds?: string[];
  familyGroupId?: string;
  invitationAllocation?: number;
  representativePersonId?: string;
  confirmedElevatedImpact?: boolean;
  idempotencyKey: string;
};

export function applyWeddingBoundaryHouseholdCommand(input: WeddingBoundaryHouseholdCommand) {
  return apiFetch<{ status: "applied"; operation: WeddingBoundaryHouseholdCommand["operation"]; impact_receipt_id: string; replayed: boolean; explanation: string }>("/wedding/boundaries/households/commands", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      operation: input.operation,
      source_household_ids: input.sourceHouseholdIds,
      target_household_id: input.targetHouseholdId,
      new_household_id: input.newHouseholdId,
      new_household_label: input.newHouseholdLabel,
      move_person_ids: input.movePersonIds ?? [],
      expected_revisions: input.expectedRevisions,
      family_group_id: input.familyGroupId,
      invitation_allocation: input.invitationAllocation,
      representative_person_id: input.representativePersonId,
      confirmed_elevated_impact: input.confirmedElevatedImpact,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export type WeddingBoundaryHelperGrant = {
  grant_id: string;
  wedding_plan_id: string;
  response_workspace_id: string;
  principal_label: string;
  household_ids: string[];
  allowed_actions: Array<"view_summary" | "propose_request">;
  expires_at: string;
  revoked_at?: string | null;
};

export function listWeddingBoundaryHelperGrants(responseWorkspaceId: string) {
  return apiFetch<WeddingBoundaryHelperGrant[]>(`/wedding/boundaries/grants?response_workspace_id=${encodeURIComponent(responseWorkspaceId)}`);
}

export function createWeddingBoundaryHelperGrant(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  principalLabel: string;
  householdIds: string[];
  allowedActions: Array<"view_summary" | "propose_request">;
  expiresAt: string;
}) {
  return apiFetch<{ grant: WeddingBoundaryHelperGrant; token: string }>("/wedding/boundaries/grants", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      principal_label: input.principalLabel,
      household_ids: input.householdIds,
      allowed_actions: input.allowedActions,
      expires_at: input.expiresAt,
    },
  });
}

export function revokeWeddingBoundaryHelperGrant(grantId: string) {
  return apiFetch<WeddingBoundaryHelperGrant>(`/wedding/boundaries/grants/${encodeURIComponent(grantId)}/revoke`, { method: "POST" });
}

async function publicBoundaryFetch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrlForPath(path), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text() || "This family access link is not available.");
  return response.json() as Promise<T>;
}

export function openWeddingBoundaryHelper(token: string) {
  return publicBoundaryFetch<Record<string, unknown>>("/wedding/boundaries/helpers/open", { token });
}

export function proposeWeddingBoundaryRequest(input: {
  token: string;
  householdId: string;
  requestLabel: string;
  proposedGuestName: string;
  idempotencyKey: string;
}) {
  return publicBoundaryFetch<{ request_id: string; status: string; replayed: boolean; explanation: string }>("/wedding/boundaries/helpers/propose", {
    token: input.token,
    household_id: input.householdId,
    change_type: "add_guest",
    request_label: input.requestLabel,
    proposed_guest_name: input.proposedGuestName,
    idempotency_key: input.idempotencyKey,
  });
}
