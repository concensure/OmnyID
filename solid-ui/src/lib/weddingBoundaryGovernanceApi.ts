// @locs-version: 1.0
import { apiFetch, apiUrlForPath } from "@/lib/api";

export type WeddingBoundaryDecisionReply = {
  request_id: string;
  decision_id?: string;
  impact_receipt_id?: string;
  status: "approved" | "partially_approved" | "declined" | "withdrawn" | "expired";
  approval_count?: number;
  required_approval_count?: number;
  replayed: boolean;
  explanation: string;
  connected_updates?: string[];
  response_history_preserved?: boolean;
};

export function decideWeddingBoundaryRequest(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  requestId: string;
  decision: "approve" | "decline" | "withdraw";
  expectedRevision: number;
  approvalActorId?: string;
  confirmedElevatedImpact?: boolean;
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
      confirmed_elevated_impact: input.confirmedElevatedImpact ?? false,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export function transitionWeddingBoundaryRequest(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  requestId: string;
  operation: "submit" | "withdraw";
  expectedRevision: number;
  idempotencyKey: string;
}) {
  return apiFetch<{ request_id: string; status: "pending" | "withdrawn" | "expired" | "auto_blocked"; revision: number; replayed: boolean; explanation: string; connected_updates: string[] }>("/wedding/boundaries/requests/transitions", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      request_id: input.requestId,
      operation: input.operation,
      expected_revision: input.expectedRevision,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export type WeddingBoundaryHouseholdCommand = {
  weddingPlanId: string;
  responseWorkspaceId: string;
  operation: "split_household" | "merge_households" | "archive_household" | "assign_group" | "change_allocation" | "change_representative" | "close_requests" | "reopen_requests" | "apply_group_plus_one_policy";
  sourceHouseholdIds: string[];
  expectedRevisions: Record<string, number>;
  targetHouseholdId?: string;
  newHouseholdId?: string;
  newHouseholdLabel?: string;
  movePersonIds?: string[];
  familyGroupId?: string;
  invitationAllocation?: number;
  representativePersonId?: string;
  plusOneAllowed?: boolean;
  exceptionPersonIds?: string[];
  confirmedElevatedImpact?: boolean;
  idempotencyKey: string;
};

export function applyWeddingBoundaryHouseholdCommand(input: WeddingBoundaryHouseholdCommand) {
  return apiFetch<{ status: "applied"; operation: WeddingBoundaryHouseholdCommand["operation"]; impact_receipt_id: string; replayed: boolean; explanation: string; connected_updates?: string[]; response_history_preserved?: boolean }>("/wedding/boundaries/households/commands", {
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
      plus_one_allowed: input.plusOneAllowed,
      exception_person_ids: input.exceptionPersonIds ?? [],
      confirmed_elevated_impact: input.confirmedElevatedImpact,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export type WeddingBoundaryRuleReplacement = {
  title: string;
  plainLanguage: string;
  ruleType: "plus_one" | "children" | "invitation_scope" | "allocation" | "deadline" | "visibility" | "access" | "seating" | "communication";
  scopeKind: "wedding" | "family_group" | "household" | "guest";
  scopeId?: string;
  effect: "allow" | "deny" | "require_approval" | "notify" | "limit";
  authority: "couple" | "partner_pair" | "planner";
  effectiveUntil?: string;
  condition?: Record<string, unknown>;
};

export function applyWeddingBoundaryRuleCommand(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  operation: "archive_rule" | "supersede_rule";
  ruleId: string;
  expectedVersion: number;
  replacement?: WeddingBoundaryRuleReplacement;
  confirmedElevatedImpact?: boolean;
  idempotencyKey: string;
}) {
  return apiFetch<{
    status: "applied";
    operation: "archive_rule" | "supersede_rule";
    rule_id: string;
    replacement_rule_id?: string | null;
    impact_receipt_id: string;
    replayed: boolean;
    explanation: string;
    connected_updates?: string[];
    response_history_preserved?: boolean;
  }>("/wedding/boundaries/rules/commands", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      operation: input.operation,
      rule_id: input.ruleId,
      expected_version: input.expectedVersion,
      replacement: input.replacement ? {
        title: input.replacement.title,
        plain_language: input.replacement.plainLanguage,
        rule_type: input.replacement.ruleType,
        scope_kind: input.replacement.scopeKind,
        scope_id: input.replacement.scopeId,
        effect: input.replacement.effect,
        authority: input.replacement.authority,
        effective_until: input.replacement.effectiveUntil,
        condition: input.replacement.condition ?? {},
      } : undefined,
      confirmed_elevated_impact: input.confirmedElevatedImpact ?? false,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export type WeddingBoundaryDelegatedRole = "planner" | "rsvp_guest";

export type WeddingBoundaryAccessCapabilities = {
  helper_links_enabled: boolean;
  authenticated_delegates_enabled: boolean;
};

export function loadWeddingBoundaryAccessCapabilities() {
  return apiFetch<WeddingBoundaryAccessCapabilities>("/wedding/boundaries/access/capabilities");
}

export type WeddingBoundaryDelegatedGrant = {
  grant_id: string;
  wedding_plan_id: string;
  response_workspace_id: string;
  role: WeddingBoundaryDelegatedRole;
  person_id?: string | null;
  household_ids: string[];
  allowed_actions: string[];
  expires_at: string;
  revoked_at?: string | null;
};

export function createWeddingBoundaryDelegatedGrant(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  delegateEmail: string;
  role: WeddingBoundaryDelegatedRole;
  personId?: string;
  householdIds?: string[];
  expiresAt: string;
}) {
  return apiFetch<WeddingBoundaryDelegatedGrant>("/wedding/boundaries/delegates/grants", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      delegate_email: input.delegateEmail,
      role: input.role,
      person_id: input.personId,
      household_ids: input.householdIds ?? [],
      expires_at: input.expiresAt,
    },
  });
}

export function listWeddingBoundaryDelegatedGrants(responseWorkspaceId: string) {
  return apiFetch<WeddingBoundaryDelegatedGrant[]>(`/wedding/boundaries/delegates/grants?response_workspace_id=${encodeURIComponent(responseWorkspaceId)}`);
}

export function revokeWeddingBoundaryDelegatedGrant(grantId: string) {
  return apiFetch<WeddingBoundaryDelegatedGrant>(`/wedding/boundaries/delegates/grants/${encodeURIComponent(grantId)}/revoke`, { method: "POST" });
}

export function openWeddingBoundaryDelegatedGrant(grantId: string) {
  return apiFetch<Record<string, unknown>>(`/wedding/boundaries/delegates/grants/${encodeURIComponent(grantId)}/open`);
}

export function proposeWeddingBoundaryDelegatedChange(input: {
  grantId: string;
  changeType: "add_guest" | "remove_guest" | "plus_one_change" | "event_invite_change" | "guest_contact_update";
  requestLabel: string;
  targetHouseholdId?: string;
  targetPersonId?: string;
  proposedGuestName?: string;
  proposedPlusOneAllowed?: boolean;
  proposedInvitationStatus?: string;
  proposedContactLabel?: string;
  idempotencyKey: string;
}) {
  return apiFetch<{ request_id: string; status: "pending"; replayed: boolean; explanation: string }>(`/wedding/boundaries/delegates/grants/${encodeURIComponent(input.grantId)}/propose`, {
    method: "POST",
    bodyJson: {
      change_type: input.changeType,
      request_label: input.requestLabel,
      target_household_id: input.targetHouseholdId,
      target_person_id: input.targetPersonId,
      proposed_guest_name: input.proposedGuestName,
      proposed_plus_one_allowed: input.proposedPlusOneAllowed,
      proposed_invitation_status: input.proposedInvitationStatus,
      proposed_contact_label: input.proposedContactLabel,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export function readWeddingBoundaryPrivateNote(input: { weddingPlanId: string; responseWorkspaceId: string; personId: string }) {
  const query = new URLSearchParams({
    wedding_plan_id: input.weddingPlanId,
    response_workspace_id: input.responseWorkspaceId,
    person_id: input.personId,
  });
  return apiFetch<{ person_id: string; ciphertext: string | null; version: number; updated_at?: string }>(`/wedding/boundaries/private-notes?${query.toString()}`);
}

export function saveWeddingBoundaryPrivateNote(input: { weddingPlanId: string; responseWorkspaceId: string; personId: string; ciphertext: string; expectedVersion?: number; idempotencyKey: string }) {
  return apiFetch<{ person_id: string; version: number; note_ref: string; replayed: boolean }>("/wedding/boundaries/private-notes", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      person_id: input.personId,
      ciphertext: input.ciphertext,
      expected_version: input.expectedVersion,
      idempotency_key: input.idempotencyKey,
    },
  });
}

export function removeWeddingBoundaryPrivateNote(input: { weddingPlanId: string; responseWorkspaceId: string; personId: string; expectedVersion: number; idempotencyKey: string }) {
  return apiFetch<{ person_id: string; removed: boolean; replayed: boolean }>("/wedding/boundaries/private-notes/remove", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      person_id: input.personId,
      expected_version: input.expectedVersion,
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
