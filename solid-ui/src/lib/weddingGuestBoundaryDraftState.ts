// @locs-version: 2.0
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";
import { evaluateWeddingBoundaryChangeRequest } from "@/lib/weddingBoundaryLedgerState";
import type {
  WeddingBoundaryChangeRequest,
  WeddingBoundaryEventInvitation,
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryLedgerObject,
  WeddingBoundaryPolicy,
  WeddingBoundaryPolicyRuleType,
  WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";
import type {
  WeddingBoundaryRuleAuthority,
  WeddingBoundaryRuleEffect,
  WeddingBoundaryRuleScopeKind,
} from "@/lib/weddingBoundaryGovernanceTypes";

export type WeddingGuestDraftRsvpStatus = "Pending" | "Attending" | "Not attending";

export type WeddingGuestBoundaryDraftInput = {
  displayName: string;
  householdLabel?: string | null;
  rsvpStatus?: WeddingGuestDraftRsvpStatus | null;
  previousRsvpStatus?: WeddingGuestDraftRsvpStatus | null;
  plusOneAllowed?: boolean | null;
  plusOneMode?: "none" | "named" | "unnamed" | null;
  plusOneName?: string | null;
  childrenInvited?: boolean | null;
  childName?: string | null;
  childAgeBand?: WeddingBoundaryGuestProfile["ageBand"];
  childSeatRequirement?: WeddingBoundaryEventInvitation["seatRequirement"];
  childMealRequirement?: WeddingBoundaryEventInvitation["mealRequirement"];
  contactLabel?: string | null;
  rsvpReminderPermission?: boolean | null;
  mealPreference?: string | null;
  dietaryNote?: string | null;
  accessibilityNote?: string | null;
};

export type WeddingGuestBoundaryRuleDraftInput = {
  plusOneRule?: string | null;
  childrenRule?: string | null;
};

export type WeddingFamilyBoundaryRequestDraftInput = {
  requesterLabel: string;
  requestLabel: string;
  changeType?: WeddingBoundaryChangeRequest["changeType"] | null;
  targetHouseholdId?: string | null;
  proposedGuestName?: string | null;
  requiredApprovalCount?: 1 | 2 | null;
  expiresAt?: string | null;
};

export type WeddingFamilyBoundaryPolicyDraftInput = {
  title?: string | null;
  plainLanguage: string;
  ruleType?: WeddingBoundaryPolicyRuleType | null;
  scopeKind?: WeddingBoundaryRuleScopeKind | null;
  scopeId?: string | null;
  effect?: WeddingBoundaryRuleEffect | null;
  authority?: WeddingBoundaryRuleAuthority | null;
  effectiveUntil?: string | null;
  condition?: Record<string, unknown> | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function invitationStatus(status: WeddingGuestDraftRsvpStatus | null | undefined): WeddingBoundaryEventInvitation["invitationStatus"] {
  if (status === "Attending") return "rsvp_yes";
  if (status === "Not attending") return "rsvp_no";
  return "invited";
}

function guestSlug(name: string): string {
  return safeWeddingLabel(name) || "guest";
}

export function buildWeddingGuestBoundaryDraftObjects(
  input: WeddingGuestBoundaryDraftInput,
  metadataInput?: unknown,
  nowIso = new Date().toISOString(),
): WeddingBoundaryLedgerObject[] {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const displayName = clean(input.displayName);
  if (!displayName) return [];
  const householdLabel = clean(input.householdLabel) || "Ungrouped guests";
  const personId = `wedding_guest:${safeWeddingLabel(metadata.responseWorkspaceId)}:${guestSlug(displayName)}`;
  const householdId = `wedding_household:${safeWeddingLabel(metadata.responseWorkspaceId)}:${guestSlug(householdLabel)}`;
  const eventId = `wedding_event:${safeWeddingLabel(metadata.responseWorkspaceId)}:main_wedding`;
  const invitationId = `wedding_invitation:${safeWeddingLabel(metadata.responseWorkspaceId)}:${guestSlug(displayName)}:main_wedding`;
  const nextInvitationStatus = invitationStatus(input.rsvpStatus);
  const previousInvitation = input.previousRsvpStatus ? invitationStatus(input.previousRsvpStatus) : null;
  const responseRecorded = nextInvitationStatus === "rsvp_yes" || nextInvitationStatus === "rsvp_no";
  const plusOneMode = input.plusOneAllowed === true ? input.plusOneMode ?? "none" : "none";
  const plusOneName = clean(input.plusOneName);
  const childName = clean(input.childName);
  const householdMemberPersonIds = [personId];
  const commonMetadata = {
    wedding_guest_draft: true,
    source_surface: "wedding_guest_operations",
  };
  const guest: WeddingBoundaryGuestProfile = {
    id: personId,
    kind: "wedding_boundary_guest_profile",
    title: displayName,
    visibility: "couple_only",
    createdBy: "couple",
    createdAt: nowIso,
    personId,
    displayName,
    householdId,
    ageBand: "unknown",
    familySide: "other",
    contactLabel: clean(input.contactLabel) || null,
    rsvpReminderPermission: input.rsvpReminderPermission === true,
    mealPreference: clean(input.mealPreference) || null,
    dietaryNote: clean(input.dietaryNote) || null,
    accessibilityNote: clean(input.accessibilityNote) || null,
    metadata: commonMetadata,
  };
  const household: WeddingBoundaryHousehold = {
    id: householdId,
    kind: "wedding_boundary_household",
    title: householdLabel,
    visibility: "approved_shared",
    createdBy: "couple",
    createdAt: nowIso,
    householdId,
    displayName: householdLabel,
    primaryContactPersonId: personId,
    memberPersonIds: householdMemberPersonIds,
    familySide: "other",
    revision: 1,
    metadata: commonMetadata,
  };
  const invitation: WeddingBoundaryEventInvitation = {
    id: invitationId,
    kind: "wedding_boundary_event_invitation",
    title: `${displayName} invitation`,
    visibility: "approved_shared",
    createdBy: "couple",
    createdAt: nowIso,
    invitationId,
    eventId,
    personId,
    invitationStatus: nextInvitationStatus,
    responseSource: responseRecorded ? "couple_manual" : null,
    respondedAt: responseRecorded ? nowIso : null,
    previousInvitationStatus: previousInvitation && previousInvitation !== nextInvitationStatus ? previousInvitation : null,
    responseRevision: previousInvitation && previousInvitation !== nextInvitationStatus ? 2 : 1,
    plusOneAllowed: input.plusOneAllowed === true,
    childrenInvited: input.childrenInvited === true,
    guestRole: "primary",
    companionToPersonId: null,
    namePending: false,
    seatRequirement: "standard",
    mealRequirement: "adult",
    visibleToGuest: true,
    metadata: commonMetadata,
  };
  const companions: WeddingBoundaryLedgerObject[] = [];
  if (plusOneMode !== "none") {
    const displayName = plusOneMode === "named" && plusOneName
      ? plusOneName
      : `Guest of ${guest.displayName}`;
    const companionSlug = plusOneMode === "named" && plusOneName
      ? `${guestSlug(plusOneName)}-plus-one`
      : `${guestSlug(guest.displayName)}-plus-one`;
    const companionPersonId = `wedding_guest:${safeWeddingLabel(metadata.responseWorkspaceId)}:${companionSlug}`;
    const companionInvitationId = `wedding_invitation:${safeWeddingLabel(metadata.responseWorkspaceId)}:${companionSlug}:main_wedding`;
    householdMemberPersonIds.push(companionPersonId);
    companions.push({
      ...guest,
      id: companionPersonId,
      title: displayName,
      personId: companionPersonId,
      displayName,
      relationshipLabel: "Plus-one",
      contactLabel: null,
      rsvpReminderPermission: false,
      mealPreference: null,
      dietaryNote: null,
      accessibilityNote: null,
      metadata: { ...commonMetadata, companion_to_person_id: personId, name_pending: plusOneMode === "unnamed" },
    }, {
      ...invitation,
      id: companionInvitationId,
      title: `${displayName} invitation`,
      invitationId: companionInvitationId,
      personId: companionPersonId,
      plusOneAllowed: false,
      childrenInvited: false,
      guestRole: "plus_one",
      companionToPersonId: personId,
      namePending: plusOneMode === "unnamed",
      seatRequirement: "standard",
      mealRequirement: "adult",
      metadata: { ...commonMetadata, companion_to_person_id: personId, name_pending: plusOneMode === "unnamed" },
    } satisfies WeddingBoundaryEventInvitation);
  }
  if (input.childrenInvited === true && childName) {
    const childSlug = `${guestSlug(childName)}-child`;
    const childPersonId = `wedding_guest:${safeWeddingLabel(metadata.responseWorkspaceId)}:${childSlug}`;
    const childInvitationId = `wedding_invitation:${safeWeddingLabel(metadata.responseWorkspaceId)}:${childSlug}:main_wedding`;
    householdMemberPersonIds.push(childPersonId);
    companions.push({
      ...guest,
      id: childPersonId,
      title: childName,
      personId: childPersonId,
      displayName: childName,
      ageBand: input.childAgeBand ?? "unknown",
      relationshipLabel: "Child",
      contactLabel: null,
      rsvpReminderPermission: false,
      mealPreference: null,
      dietaryNote: null,
      accessibilityNote: null,
      metadata: { ...commonMetadata, child_of_person_id: personId },
    }, {
      ...invitation,
      id: childInvitationId,
      title: `${childName} invitation`,
      invitationId: childInvitationId,
      personId: childPersonId,
      plusOneAllowed: false,
      childrenInvited: false,
      guestRole: "child",
      companionToPersonId: personId,
      namePending: false,
      seatRequirement: input.childSeatRequirement ?? "unknown",
      mealRequirement: input.childMealRequirement ?? "unknown",
      metadata: { ...commonMetadata, child_of_person_id: personId },
    } satisfies WeddingBoundaryEventInvitation);
  }
  return [household, guest, invitation, ...companions];
}

export function buildWeddingGuestBoundaryRuleObjects(
  input: WeddingGuestBoundaryRuleDraftInput,
  metadataInput?: unknown,
  nowIso = new Date().toISOString(),
): WeddingBoundaryPolicy[] {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const workspaceSlug = safeWeddingLabel(metadata.responseWorkspaceId);
  const commonMetadata = {
    wedding_guest_rule_draft: true,
    source_surface: "wedding_guest_operations",
  };
  const plusOneRule = clean(input.plusOneRule);
  const childrenRule = clean(input.childrenRule);
  const policies: WeddingBoundaryPolicy[] = [];
  if (plusOneRule) {
    policies.push({
      id: `wedding_policy:${workspaceSlug}:plus_one`,
      kind: "wedding_boundary_policy",
      title: "Plus-one rule",
      status: "active",
      visibility: "family_visible",
      createdBy: "couple",
      createdAt: nowIso,
      ruleType: "plus_one",
      enforcement: "require_approval",
      plainLanguage: plusOneRule,
      scope: "guest_list",
      approvedBy: ["couple"],
      metadata: commonMetadata,
    });
  }
  if (childrenRule) {
    policies.push({
      id: `wedding_policy:${workspaceSlug}:children`,
      kind: "wedding_boundary_policy",
      title: "Children invitation rule",
      status: "active",
      visibility: "family_visible",
      createdBy: "couple",
      createdAt: nowIso,
      ruleType: "children",
      enforcement: "require_approval",
      plainLanguage: childrenRule,
      scope: "guest_list",
      approvedBy: ["couple"],
      metadata: commonMetadata,
    });
  }
  return policies;
}

export function buildWeddingFamilyBoundaryRequestObject(
  input: WeddingFamilyBoundaryRequestDraftInput,
  metadataInput?: unknown,
  nowIso = new Date().toISOString(),
): WeddingBoundaryChangeRequest | null {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const requesterLabel = clean(input.requesterLabel) || "Family";
  const requestLabel = clean(input.requestLabel);
  if (!requestLabel) return null;
  const requestId = `wedding_boundary_request:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(requesterLabel)}:${safeWeddingLabel(requestLabel)}`;
  const proposedGuestName = clean(input.proposedGuestName);
  const targetPersonId = proposedGuestName
    ? `wedding_guest:${safeWeddingLabel(metadata.responseWorkspaceId)}:${guestSlug(proposedGuestName)}`
    : null;
  return {
    id: requestId,
    kind: "wedding_boundary_change_request",
    title: requestLabel,
    visibility: "approved_shared",
    createdBy: "couple",
    createdAt: nowIso,
    requestId,
    requestedBy: `family:${safeWeddingLabel(requesterLabel)}`,
    changeType: input.changeType ?? "add_guest",
    targetHouseholdId: clean(input.targetHouseholdId) || null,
    targetPersonId,
    proposedGuestName: proposedGuestName || null,
    requestStatus: "pending",
    approvalRequired: true,
    approvalCount: 0,
    requiredApprovalCount: input.requiredApprovalCount === 2 ? 2 : 1,
    expiresAt: clean(input.expiresAt) || null,
    revision: 1,
    publicReason: `${requesterLabel} asked: ${requestLabel}`,
    metadata: {
      wedding_family_boundary_draft: true,
      source_surface: "wedding_boundary_management",
      proposed_guest_name: proposedGuestName || null,
    },
  };
}

export function applyWeddingFamilyBoundaryRequestEvaluation(input: {
  request: WeddingBoundaryChangeRequest;
  policies?: readonly WeddingBoundaryPolicy[] | null;
  roleAssignments?: readonly WeddingBoundaryRoleAssignment[] | null;
}): WeddingBoundaryChangeRequest {
  const evaluation = evaluateWeddingBoundaryChangeRequest({
    request: input.request,
    policies: input.policies,
    roleAssignments: input.roleAssignments,
  });
  const requiresPartnerPair = input.request.requiredApprovalCount === 2;
  const publicReason = requiresPartnerPair ? "Both partners chose to approve this kind of request before anything changes." : evaluation.reasonLabels[0] || input.request.publicReason || (
    evaluation.status === "approved"
      ? "This helper is allowed to make this update."
      : "The couple will review this before anything changes."
  );
  return {
    ...input.request,
    status: requiresPartnerPair && evaluation.status === "approved" ? "pending" : evaluation.status,
    requestStatus: requiresPartnerPair && evaluation.status === "approved" ? "pending" : evaluation.status,
    approvalRequired: requiresPartnerPair || evaluation.approvalRequired,
    policyIds: evaluation.policyIds.length > 0 ? evaluation.policyIds : input.request.policyIds,
    policyVersions: Object.fromEntries((input.policies ?? []).filter((policy) => evaluation.policyIds.includes(policy.id)).map((policy) => [policy.id, policy.version ?? 1])),
    publicReason,
    metadata: {
      ...(input.request.metadata ?? {}),
      boundary_evaluation_applied: true,
      boundary_allowed_without_approval: evaluation.allowedWithoutApproval,
      boundary_reason_labels: evaluation.reasonLabels,
    },
  };
}

export function buildWeddingFamilyBoundaryPolicyObject(
  input: WeddingFamilyBoundaryPolicyDraftInput,
  metadataInput?: unknown,
  nowIso = new Date().toISOString(),
): WeddingBoundaryPolicy | null {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const plainLanguage = clean(input.plainLanguage);
  if (!plainLanguage) return null;
  const title = clean(input.title) || "Family boundary rule";
  const ruleType = input.ruleType ?? "invitation_scope";
  return {
    id: `wedding_policy:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(title)}`,
    kind: "wedding_boundary_policy",
    title,
    status: "active",
    visibility: "family_visible",
    createdBy: "couple",
    createdAt: nowIso,
    ruleType,
    enforcement: "require_approval",
    plainLanguage,
    scope: "guest_list",
    approvedBy: ["couple"],
    scopeKind: input.scopeKind ?? "wedding",
    scopeId: clean(input.scopeId) || null,
    condition: input.condition ?? {},
    effect: input.effect ?? "require_approval",
    authority: input.authority ?? "couple",
    effectiveFrom: nowIso,
    effectiveUntil: clean(input.effectiveUntil) || null,
    ruleStatus: "active",
    overridePolicy: "couple_only",
    version: 1,
    metadata: {
      wedding_family_boundary_rule_draft: true,
      source_surface: "wedding_boundary_management",
    },
  };
}
