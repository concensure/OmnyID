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

export type WeddingGuestDraftRsvpStatus = "Pending" | "Attending" | "Not attending";

export type WeddingGuestBoundaryDraftInput = {
  displayName: string;
  householdLabel?: string | null;
  rsvpStatus?: WeddingGuestDraftRsvpStatus | null;
  plusOneAllowed?: boolean | null;
  childrenInvited?: boolean | null;
  contactLabel?: string | null;
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
};

export type WeddingFamilyBoundaryPolicyDraftInput = {
  title?: string | null;
  plainLanguage: string;
  ruleType?: WeddingBoundaryPolicyRuleType | null;
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
  const commonMetadata = {
    wedding_guest_draft: true,
    source_surface: "wedding_guest_operations",
  };
  const guest: WeddingBoundaryGuestProfile = {
    id: personId,
    kind: "wedding_boundary_guest_profile",
    title: displayName,
    visibility: "approved_shared",
    createdBy: "couple",
    createdAt: nowIso,
    personId,
    displayName,
    householdId,
    ageBand: "unknown",
    familySide: "other",
    contactLabel: clean(input.contactLabel) || null,
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
    memberPersonIds: [personId],
    familySide: "other",
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
    invitationStatus: invitationStatus(input.rsvpStatus),
    plusOneAllowed: input.plusOneAllowed === true,
    childrenInvited: input.childrenInvited === true,
    visibleToGuest: true,
    metadata: commonMetadata,
  };
  return [household, guest, invitation];
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
    requestStatus: "pending",
    approvalRequired: true,
    publicReason: `${requesterLabel} asked: ${requestLabel}`,
    metadata: {
      wedding_family_boundary_draft: true,
      source_surface: "wedding_boundary_management",
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
  const publicReason = evaluation.reasonLabels[0] || input.request.publicReason || (
    evaluation.status === "approved"
      ? "This helper is allowed to make this update."
      : "The couple will review this before anything changes."
  );
  return {
    ...input.request,
    status: evaluation.status,
    requestStatus: evaluation.status,
    approvalRequired: evaluation.approvalRequired,
    policyIds: evaluation.policyIds.length > 0 ? evaluation.policyIds : input.request.policyIds,
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
    metadata: {
      wedding_family_boundary_rule_draft: true,
      source_surface: "wedding_boundary_management",
    },
  };
}
