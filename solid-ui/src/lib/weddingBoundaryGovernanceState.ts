// @locs-version: 1.0
import type {
  WeddingBoundaryChangeRequest,
  WeddingBoundaryEventInvitation,
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryLedgerObject,
  WeddingBoundaryPolicy,
  WeddingBoundaryRole,
  WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";
import type {
  WeddingBoundaryImpactArea,
  WeddingBoundaryImpactPreview,
  WeddingBoundaryRuleConflict,
  WeddingBoundaryRuleScopeKind,
} from "@/lib/weddingBoundaryGovernanceTypes";

export type WeddingBoundaryRoleCapabilityPreset = Pick<WeddingBoundaryRoleAssignment,
  "role" | "canView" | "canSuggest" | "canEdit" | "requiresApprovalFor" | "privateNotesVisible">;

export function weddingBoundaryRoleCapabilityPreset(role: WeddingBoundaryRole): WeddingBoundaryRoleCapabilityPreset {
  const suggestionTypes: WeddingBoundaryRoleAssignment["canSuggest"] = ["add_guest", "remove_guest", "plus_one_change", "event_invite_change", "household_change"];
  if (role === "couple") return { role, canView: ["all_wedding_boundary_records"], canSuggest: suggestionTypes, canEdit: suggestionTypes, requiresApprovalFor: [], privateNotesVisible: true };
  if (role === "planner") return { role, canView: ["approved_guest_logistics", "household_summary", "request_status"], canSuggest: suggestionTypes, canEdit: ["guest_contact_update"], requiresApprovalFor: suggestionTypes, privateNotesVisible: false };
  if (role === "rsvp_guest") return { role, canView: ["own_invitation", "own_rsvp", "published_event_details"], canSuggest: ["plus_one_change", "event_invite_change", "guest_contact_update"], canEdit: ["guest_contact_update"], requiresApprovalFor: ["plus_one_change", "event_invite_change"], privateNotesVisible: false };
  if (role === "parent_family" || role === "helper") return { role, canView: ["granted_household_summary"], canSuggest: suggestionTypes, canEdit: [], requiresApprovalFor: suggestionTypes, privateNotesVisible: false };
  if (role === "vendor") return { role, canView: ["approved_vendor_logistics"], canSuggest: [], canEdit: [], requiresApprovalFor: [], privateNotesVisible: false };
  return { role, canView: ["own_invitation"], canSuggest: ["guest_contact_update"], canEdit: ["guest_contact_update"], requiresApprovalFor: [], privateNotesVisible: false };
}

export type WeddingBoundaryHouseholdCommand =
  | { kind: "split_household"; sourceHouseholdId: string; newHouseholdId: string; movePersonIds: string[] }
  | { kind: "merge_households"; sourceHouseholdIds: string[]; targetHouseholdId: string }
  | { kind: "archive_household"; householdId: string };

export type WeddingBoundaryEffectiveRule = {
  rule: WeddingBoundaryPolicy;
  precedence: number;
  sourceLabel: string;
};

export type WeddingBoundaryHelperProjection = {
  householdId: string;
  householdLabel: string;
  allocation: number | null;
  namedGuestCount: number;
  pendingRequestCount: number;
  requestDeadline: string | null;
};

const ACTIVE_INVITATION_STATUSES = new Set(["invited", "rsvp_yes", "waitlist"]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function currentObjects(objects: readonly WeddingBoundaryLedgerObject[]) {
  const households = objects.filter((item): item is WeddingBoundaryHousehold => item.kind === "wedding_boundary_household");
  const guests = objects.filter((item): item is WeddingBoundaryGuestProfile => item.kind === "wedding_boundary_guest_profile");
  const invitations = objects.filter((item): item is WeddingBoundaryEventInvitation => item.kind === "wedding_boundary_event_invitation");
  const requests = objects.filter((item): item is WeddingBoundaryChangeRequest => item.kind === "wedding_boundary_change_request");
  return { households, guests, invitations, requests };
}

function householdPeople(householdId: string, households: readonly WeddingBoundaryHousehold[], guests: readonly WeddingBoundaryGuestProfile[]): string[] {
  const household = households.find((item) => item.householdId === householdId);
  return unique([
    ...(household?.memberPersonIds ?? []),
    ...guests.filter((item) => item.householdId === householdId).map((item) => item.personId),
  ]);
}

function invitationIdsForPeople(personIds: readonly string[], invitations: readonly WeddingBoundaryEventInvitation[]): string[] {
  const people = new Set(personIds);
  return invitations.filter((item) => people.has(item.personId)).map((item) => item.invitationId);
}

function hasCommittedInvitation(personIds: readonly string[], invitations: readonly WeddingBoundaryEventInvitation[]): boolean {
  const people = new Set(personIds);
  return invitations.some((item) => people.has(item.personId) && ACTIVE_INVITATION_STATUSES.has(item.invitationStatus));
}

function preview(command: WeddingBoundaryImpactPreview["command"], householdIds: string[], personIds: string[], invitationIds: string[], elevated: boolean, warnings: string[], canApply = true): WeddingBoundaryImpactPreview {
  const areas: WeddingBoundaryImpactArea[] = ["guest_list", "invitation_entitlement", "tasks"];
  if (invitationIds.length > 0) areas.push("rsvp", "seating", "catering", "budget_forecast");
  return {
    command,
    affectedHouseholdIds: unique(householdIds),
    affectedPersonIds: unique(personIds),
    affectedInvitationIds: unique(invitationIds),
    impactAreas: unique(areas) as WeddingBoundaryImpactArea[],
    warnings: unique(warnings),
    requiresElevatedConfirmation: elevated,
    canApply,
  };
}

export function previewWeddingBoundaryHouseholdCommand(input: {
  command: WeddingBoundaryHouseholdCommand;
  objects: readonly WeddingBoundaryLedgerObject[];
}): WeddingBoundaryImpactPreview {
  const { households, guests, invitations } = currentObjects(input.objects);
  const command = input.command;
  if (command.kind === "split_household") {
    const source = households.find((item) => item.householdId === command.sourceHouseholdId);
    const sourcePeople = householdPeople(command.sourceHouseholdId, households, guests);
    const moving = unique(command.movePersonIds).filter((id) => sourcePeople.includes(id));
    const invitationIds = invitationIdsForPeople(moving, invitations);
    const invalid = !source || !clean(command.newHouseholdId) || moving.length === 0 || moving.length >= sourcePeople.length;
    return preview("split_household", [command.sourceHouseholdId, command.newHouseholdId], moving, invitationIds, hasCommittedInvitation(moving, invitations), [
      invalid ? "Choose some, but not all, members of an existing household." : "Guest and invitation references will remain stable; only household membership changes.",
      invitationIds.length > 0 ? "Existing RSVP and seating projections will be rechecked after the split." : "",
    ], !invalid);
  }
  if (command.kind === "merge_households") {
    const sourceIds = unique(command.sourceHouseholdIds);
    const present = sourceIds.filter((id) => households.some((item) => item.householdId === id));
    const personIds = unique(present.flatMap((id) => householdPeople(id, households, guests)));
    const invitationIds = invitationIdsForPeople(personIds, invitations);
    const invalid = present.length < 2 || !present.includes(command.targetHouseholdId);
    return preview("merge_households", present, personIds, invitationIds, hasCommittedInvitation(personIds, invitations), [
      invalid ? "Choose at least two current households and one of them as the destination." : "The merged household keeps every stable guest and invitation reference.",
      invitationIds.length > 0 ? "Invitation allocations and accepted responses must be reconciled before confirmation." : "",
    ], !invalid);
  }
  const personIds = householdPeople(command.householdId, households, guests);
  const invitationIds = invitationIdsForPeople(personIds, invitations);
  const invalid = !households.some((item) => item.householdId === command.householdId);
  const committed = hasCommittedInvitation(personIds, invitations);
  return preview("archive_household", [command.householdId], personIds, invitationIds, committed, [
    invalid ? "This household is no longer available." : "Archiving hides the empty household without deleting its audit history.",
    personIds.length > 0 ? "Move or remove every member before archiving this household." : "",
    committed ? "A sent or accepted invitation requires elevated confirmation." : "",
  ], !invalid && personIds.length === 0);
}

function scopeRank(scope: WeddingBoundaryRuleScopeKind): number {
  if (scope === "guest") return 40;
  if (scope === "household") return 30;
  if (scope === "family_group") return 20;
  return 10;
}

function policyScope(policy: WeddingBoundaryPolicy): WeddingBoundaryRuleScopeKind {
  return policy.scopeKind ?? (policy.scope === "household" ? "household" : "wedding");
}

function systemPrivacy(policy: WeddingBoundaryPolicy): boolean {
  return policy.authority === "system" && (policy.ruleType === "access" || policy.ruleType === "visibility") && policy.effect === "deny";
}

export function projectWeddingBoundaryEffectiveRules(input: {
  policies: readonly WeddingBoundaryPolicy[];
  scopeKind: WeddingBoundaryRuleScopeKind;
  scopeId?: string | null;
  at?: Date;
}): { effective: WeddingBoundaryEffectiveRule[]; conflicts: WeddingBoundaryRuleConflict[] } {
  const at = input.at ?? new Date();
  const candidates = input.policies.filter((policy) => {
    if ((policy.ruleStatus ?? policy.status ?? "active") !== "active") return false;
    if (policy.effectiveFrom && Date.parse(policy.effectiveFrom) > at.getTime()) return false;
    if (policy.effectiveUntil && Date.parse(policy.effectiveUntil) <= at.getTime()) return false;
    const scope = policyScope(policy);
    return scope === "wedding" || (scope === input.scopeKind && (!policy.scopeId || policy.scopeId === input.scopeId));
  });
  const byType = new Map<string, WeddingBoundaryPolicy[]>();
  for (const policy of candidates) byType.set(policy.ruleType, [...(byType.get(policy.ruleType) ?? []), policy]);
  const effective: WeddingBoundaryEffectiveRule[] = [];
  const conflicts: WeddingBoundaryRuleConflict[] = [];
  for (const policies of byType.values()) {
    const privacy = policies.filter(systemPrivacy);
    if (privacy.length > 0) {
      for (const rule of privacy) effective.push({ rule, precedence: 100, sourceLabel: "System privacy rule" });
      continue;
    }
    const ranked = policies.map((rule) => ({ rule, precedence: scopeRank(policyScope(rule)) + (rule.authority === "partner_pair" ? 5 : 0) }));
    const highest = Math.max(...ranked.map((item) => item.precedence));
    const winners = ranked.filter((item) => item.precedence === highest);
    const effects = unique(winners.map((item) => item.rule.effect ?? item.rule.enforcement));
    if (effects.length > 1) {
      conflicts.push({
        ruleIds: winners.map((item) => item.rule.id),
        scopeKind: input.scopeKind,
        scopeId: input.scopeId ?? null,
        reason: "Rules at the same scope disagree. Choose which rule should apply before making a guest-list decision.",
      });
      continue;
    }
    effective.push(...winners.map((item) => ({ ...item, sourceLabel: `${policyScope(item.rule).replace("_", " ")} rule` })));
  }
  return { effective, conflicts };
}

export function previewWeddingBoundaryRequestDecision(input: {
  request: WeddingBoundaryChangeRequest;
  objects: readonly WeddingBoundaryLedgerObject[];
}): WeddingBoundaryImpactPreview {
  const { households, guests, invitations } = currentObjects(input.objects);
  const householdId = input.request.targetHouseholdId ?? "";
  const personIds = unique([
    input.request.targetPersonId ?? "",
    ...(householdId ? householdPeople(householdId, households, guests) : []),
  ]);
  const invitationIds = invitationIdsForPeople(personIds, invitations);
  const missingTarget = input.request.changeType !== "household_change" && personIds.length === 0;
  return preview("decide_request", householdId ? [householdId] : [], personIds, invitationIds, hasCommittedInvitation(personIds, invitations), [
    missingTarget ? "Add the exact guest or household before approving this request." : "Approval will recheck the current rule and allocation versions.",
    "Approving does not infer attendance, send an invitation, commit spend, or change a vendor contract.",
  ], !missingTarget && input.request.requestStatus === "pending");
}

export function buildWeddingBoundaryHelperProjection(input: {
  householdIds: readonly string[];
  objects: readonly WeddingBoundaryLedgerObject[];
}): WeddingBoundaryHelperProjection[] {
  const allowed = new Set(input.householdIds);
  const { households, guests, requests } = currentObjects(input.objects);
  return households.filter((item) => allowed.has(item.householdId)).map((household) => ({
    householdId: household.householdId,
    householdLabel: household.displayName,
    allocation: household.invitationAllocation ?? null,
    namedGuestCount: householdPeople(household.householdId, households, guests).length,
    pendingRequestCount: requests.filter((request) => request.targetHouseholdId === household.householdId && request.requestStatus === "pending").length,
    requestDeadline: household.requestDeadline ?? null,
  }));
}
