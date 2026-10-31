// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type {
  WeddingBoundaryChangeRequest,
  WeddingBoundaryDecisionRationale,
  WeddingBoundaryEventInvitation,
  WeddingBoundaryFamilyGroupObject,
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryLedgerKind,
  WeddingBoundaryLedgerObject,
  WeddingBoundaryPolicy,
  WeddingBoundaryPolicyEnforcement,
  WeddingBoundaryPolicyRuleType,
  WeddingBoundaryRequestStatus,
  WeddingBoundaryRole,
  WeddingBoundaryRoleAssignment,
  WeddingBoundaryVisibility,
} from "@/lib/weddingBoundaryLedgerState";
import type {
  WeddingBoundaryOverridePolicy,
  WeddingBoundaryRuleAuthority,
  WeddingBoundaryRuleEffect,
  WeddingBoundaryRuleScopeKind,
  WeddingBoundaryRuleStatus,
} from "@/lib/weddingBoundaryGovernanceTypes";
import {
  normalizeWeddingPlanningMetadata,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type {
  WeddingSeatingConstraintAction,
  WeddingSeatingConstraintKind,
} from "@/lib/weddingSeatingConstraintActionState";
import {
  isWeddingSemanticUiKind,
  weddingSemanticUiObjectsFromAfpLikeMessage,
  type WeddingSemanticUiKind,
  type WeddingSemanticUiObject,
} from "@/lib/weddingSemanticUiState";

const BOUNDARY_KINDS = new Set<WeddingBoundaryLedgerKind>([
  "wedding_boundary_policy",
  "wedding_boundary_family_group",
  "wedding_boundary_role_assignment",
  "wedding_boundary_household",
  "wedding_boundary_guest_profile",
  "wedding_boundary_event_invitation",
  "wedding_boundary_change_request",
  "wedding_boundary_decision_rationale",
  "wedding_boundary_decline_template",
  "wedding_boundary_visibility_page",
]);

const BOUNDARY_VISIBILITIES = new Set<WeddingBoundaryVisibility>([
  "couple_only",
  "approved_shared",
  "family_visible",
  "vendor_logistics",
]);

const BOUNDARY_POLICY_RULE_TYPES = new Set<WeddingBoundaryPolicyRuleType>([
  "plus_one",
  "children",
  "invitation_scope",
  "allocation",
  "deadline",
  "visibility",
  "access",
  "seating",
  "communication",
]);

const BOUNDARY_POLICY_ENFORCEMENTS = new Set<WeddingBoundaryPolicyEnforcement>([
  "block",
  "require_approval",
  "warn",
]);

const BOUNDARY_ROLES = new Set<WeddingBoundaryRole>([
  "couple",
  "parent_family",
  "helper",
  "vendor",
  "guest",
]);

const BOUNDARY_REQUEST_STATUSES = new Set<WeddingBoundaryRequestStatus>([
  "draft",
  "pending",
  "approved",
  "partially_approved",
  "declined",
  "withdrawn",
  "expired",
  "auto_blocked",
]);

const SEATING_CONSTRAINT_KINDS = new Set<WeddingSeatingConstraintKind>([
  "keep_apart",
  "prefer_together",
  "prefer_quiet",
  "social_group_together",
]);

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => clean(item) ?? []) : [];
}

function bool(value: unknown): boolean {
  return value === true;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function contentValue(message: AfpMessage, key: string): unknown {
  return decryptedDisplayContent(message)[key] ?? message.metadata?.[key];
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const parsed = Number(item);
    return key && Number.isInteger(parsed) && parsed > 0 ? [[key, parsed]] : [];
  }));
}

function workspaceIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "response_workspace_id")) ?? clean(message.metadata?.responseWorkspaceId);
}

function baseMetadata(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingPlanningMetadata {
  return normalizeWeddingPlanningMetadata({
    ...(message.metadata ?? {}),
    weddingPlanId: clean(contentValue(message, "wedding_plan_id")) ?? fallback.weddingPlanId,
    responseWorkspaceId: clean(contentValue(message, "response_workspace_id")) ?? fallback.responseWorkspaceId,
    sourceResponseId: clean(contentValue(message, "source_response_id")) ?? fallback.sourceResponseId,
    supertags: strings(message.supertags).length > 0 ? strings(message.supertags) : fallback.supertags,
  });
}

function boundaryKindFrom(value: unknown): WeddingBoundaryLedgerKind | null {
  return typeof value === "string" && BOUNDARY_KINDS.has(value as WeddingBoundaryLedgerKind)
    ? value as WeddingBoundaryLedgerKind
    : null;
}

function boundaryVisibilityFrom(value: unknown): WeddingBoundaryVisibility | null {
  return typeof value === "string" && BOUNDARY_VISIBILITIES.has(value as WeddingBoundaryVisibility)
    ? value as WeddingBoundaryVisibility
    : null;
}

function boundaryPolicyRuleTypeFrom(value: unknown): WeddingBoundaryPolicyRuleType {
  return typeof value === "string" && BOUNDARY_POLICY_RULE_TYPES.has(value as WeddingBoundaryPolicyRuleType)
    ? value as WeddingBoundaryPolicyRuleType
    : "invitation_scope";
}

function boundaryPolicyEnforcementFrom(value: unknown): WeddingBoundaryPolicyEnforcement {
  return typeof value === "string" && BOUNDARY_POLICY_ENFORCEMENTS.has(value as WeddingBoundaryPolicyEnforcement)
    ? value as WeddingBoundaryPolicyEnforcement
    : "require_approval";
}

function boundaryRoleFrom(value: unknown): WeddingBoundaryRole {
  return typeof value === "string" && BOUNDARY_ROLES.has(value as WeddingBoundaryRole)
    ? value as WeddingBoundaryRole
    : "helper";
}

function boundaryRequestStatusFrom(value: unknown): WeddingBoundaryRequestStatus {
  return typeof value === "string" && BOUNDARY_REQUEST_STATUSES.has(value as WeddingBoundaryRequestStatus)
    ? value as WeddingBoundaryRequestStatus
    : "pending";
}

function seatingConstraintKindFrom(value: unknown): WeddingSeatingConstraintKind | null {
  return typeof value === "string" && SEATING_CONSTRAINT_KINDS.has(value as WeddingSeatingConstraintKind)
    ? value as WeddingSeatingConstraintKind
    : null;
}

export function weddingPersistedSeatingConstraintFromAfpMessage(
  message: AfpMessage,
): WeddingSeatingConstraintAction | null {
  if (message.subtype !== "wedding_seating_constraint" || workspaceIdFrom(message) === null) return null;
  const kind = seatingConstraintKindFrom(contentValue(message, "constraint_kind") ?? message.metadata?.seating_constraint_kind);
  const instruction = clean(contentValue(message, "instruction"));
  if (!kind || !instruction) return null;
  const confidenceValue = clean(contentValue(message, "confidence"));
  const confidence = confidenceValue === "high" || confidenceValue === "medium" || confidenceValue === "low"
    ? confidenceValue
    : "medium";
  return {
    id: clean(contentValue(message, "constraint_id")) ?? message.id,
    kind,
    instruction,
    primaryPersonId: clean(message.references?.find((reference) => reference.type === "seating_constraint_primary_person")?.target),
    relatedPersonId: clean(message.references?.find((reference) => reference.type === "seating_constraint_related_person")?.target),
    socialGroup: clean(message.references?.find((reference) => reference.type === "seating_constraint_social_group")?.target),
    confidence,
    statusLabel: clean(contentValue(message, "status_label")) ?? "Seating instruction saved.",
  };
}

function boundaryBase(message: AfpMessage, fallback: WeddingPlanningMetadata): {
  id: string;
  title: string;
  status: string | null;
  visibility: WeddingBoundaryVisibility | null;
  createdAt: string;
  metadata: Record<string, unknown>;
  semanticKind: WeddingSemanticUiKind | null;
  semanticTags: string[];
  semanticObject: WeddingSemanticUiObject | null;
} {
  const [semanticObject = null] = weddingSemanticUiObjectsFromAfpLikeMessage(message);
  const semanticKind = semanticObject?.kind ?? (isWeddingSemanticUiKind(message.metadata?.semantic_kind) ? message.metadata.semantic_kind : null);
  const semanticTags = [...new Set([
    ...strings(message.metadata?.semantic_tags),
    ...(semanticObject?.semanticTags ?? []),
    semanticKind,
  ].filter((item): item is string => Boolean(item)))].slice(0, 16);
  return {
    id: clean(contentValue(message, "boundary_object_id")) ?? clean(message.metadata?.boundary_object_id) ?? message.id,
    title: clean(contentValue(message, "title")) ?? "Wedding boundary record",
    status: clean(contentValue(message, "status")),
    visibility: boundaryVisibilityFrom(contentValue(message, "visibility")),
    createdAt: clean(contentValue(message, "created_at")) ?? message.timestamp,
    metadata: {
      ...baseMetadata(message, fallback),
      persisted_afp_message_id: message.id,
      persisted_boundary_ledger: true,
      semantic_kind: semanticKind,
      semantic_tags: semanticTags,
    },
    semanticKind,
    semanticTags,
    semanticObject,
  };
}

export function weddingPersistedBoundaryObjectFromAfpMessage(
  message: AfpMessage,
  fallback: WeddingPlanningMetadata,
): WeddingBoundaryLedgerObject | null {
  const kind = boundaryKindFrom(message.subtype ?? message.kind ?? contentValue(message, "ledger_kind"));
  if (!kind || workspaceIdFrom(message) === null) return null;
  const base = boundaryBase(message, fallback);
  if (kind === "wedding_boundary_policy") {
    return {
      ...base,
      kind,
      ruleType: boundaryPolicyRuleTypeFrom(contentValue(message, "rule_type")),
      enforcement: boundaryPolicyEnforcementFrom(contentValue(message, "enforcement")),
      plainLanguage: clean(contentValue(message, "plain_language")) ?? base.title,
      scope: clean(contentValue(message, "scope")) as WeddingBoundaryPolicy["scope"],
      approvedBy: strings(contentValue(message, "approved_by")),
      scopeKind: clean(contentValue(message, "scope_kind")) as WeddingBoundaryRuleScopeKind,
      scopeId: clean(contentValue(message, "scope_id")),
      condition: contentValue(message, "condition") as Record<string, unknown> ?? {},
      effect: clean(contentValue(message, "effect")) as WeddingBoundaryRuleEffect,
      authority: clean(contentValue(message, "authority")) as WeddingBoundaryRuleAuthority,
      effectiveFrom: clean(contentValue(message, "effective_from")),
      effectiveUntil: clean(contentValue(message, "effective_until")),
      ruleStatus: clean(contentValue(message, "rule_status")) as WeddingBoundaryRuleStatus,
      overridePolicy: clean(contentValue(message, "override_policy")) as WeddingBoundaryOverridePolicy,
      version: positiveInteger(contentValue(message, "version")) ?? 1,
      supersedesId: clean(contentValue(message, "supersedes_id")),
    };
  }
  if (kind === "wedding_boundary_family_group") {
    const familyGroupId = clean(contentValue(message, "family_group_id"));
    if (!familyGroupId) return null;
    return {
      ...base,
      kind,
      familyGroupId,
      label: clean(contentValue(message, "label")) ?? base.title,
      householdIds: strings(contentValue(message, "household_ids")),
      invitationAllocation: nonNegativeInteger(contentValue(message, "invitation_allocation")),
      ruleIds: strings(contentValue(message, "rule_ids")),
      version: positiveInteger(contentValue(message, "version")) ?? 1,
      supersedesId: clean(contentValue(message, "supersedes_id")),
    } satisfies WeddingBoundaryFamilyGroupObject;
  }
  if (kind === "wedding_boundary_role_assignment") {
    const personId = clean(contentValue(message, "person_id"));
    if (!personId) return null;
    return {
      ...base,
      kind,
      personId,
      role: boundaryRoleFrom(contentValue(message, "role")),
      canView: strings(contentValue(message, "can_view")),
      canSuggest: strings(contentValue(message, "can_suggest")) as WeddingBoundaryRoleAssignment["canSuggest"],
      canEdit: strings(contentValue(message, "can_edit")) as WeddingBoundaryRoleAssignment["canEdit"],
      requiresApprovalFor: strings(contentValue(message, "requires_approval_for")) as WeddingBoundaryRoleAssignment["requiresApprovalFor"],
      privateNotesVisible: bool(contentValue(message, "private_notes_visible")),
    };
  }
  if (kind === "wedding_boundary_household") {
    const householdId = clean(contentValue(message, "household_id"));
    if (!householdId) return null;
    return {
      ...base,
      kind,
      householdId,
      displayName: clean(contentValue(message, "display_name")) ?? base.title,
      primaryContactPersonId: clean(contentValue(message, "primary_contact_person_id")),
      memberPersonIds: strings(contentValue(message, "member_person_ids")),
      familySide: clean(contentValue(message, "family_side")) as WeddingBoundaryHousehold["familySide"],
      familyGroupId: clean(contentValue(message, "family_group_id")),
      familyGroupLabel: clean(contentValue(message, "family_group_label")),
      invitationAllocation: nonNegativeInteger(contentValue(message, "invitation_allocation")),
      requestDeadline: clean(contentValue(message, "request_deadline")),
      revision: positiveInteger(contentValue(message, "revision")) ?? 1,
    };
  }
  if (kind === "wedding_boundary_guest_profile") {
    const personId = clean(contentValue(message, "person_id"));
    if (!personId) return null;
    return {
      ...base,
      kind,
      personId,
      displayName: clean(contentValue(message, "display_name")) ?? base.title,
      householdId: clean(contentValue(message, "household_id")),
      ageBand: clean(contentValue(message, "age_band")) as WeddingBoundaryGuestProfile["ageBand"],
      relationshipLabel: clean(contentValue(message, "relationship_label")),
      contactLabel: clean(contentValue(message, "contact_label")),
      rsvpReminderPermission: contentValue(message, "rsvp_reminder_permission") === true,
      mealPreference: clean(contentValue(message, "meal_preference")),
      dietaryNote: clean(contentValue(message, "dietary_note")),
      accessibilityNote: clean(contentValue(message, "accessibility_note")),
      familySide: clean(contentValue(message, "family_side")) as WeddingBoundaryGuestProfile["familySide"],
    };
  }
  if (kind === "wedding_boundary_event_invitation") {
    const invitationId = clean(contentValue(message, "invitation_id"));
    const eventId = clean(contentValue(message, "event_id"));
    const personId = clean(contentValue(message, "person_id"));
    if (!invitationId || !eventId || !personId) return null;
    return {
      ...base,
      kind,
      invitationId,
      eventId,
      personId,
      invitationStatus: clean(contentValue(message, "invitation_status")) as WeddingBoundaryEventInvitation["invitationStatus"] ?? "invited",
      responseSource: clean(contentValue(message, "response_source")) as WeddingBoundaryEventInvitation["responseSource"],
      viewedAt: clean(contentValue(message, "viewed_at")),
      respondedAt: clean(contentValue(message, "responded_at")),
      lockedAt: clean(contentValue(message, "locked_at")),
      previousInvitationStatus: clean(contentValue(message, "previous_invitation_status")) as WeddingBoundaryEventInvitation["previousInvitationStatus"],
      responseRevision: positiveInteger(contentValue(message, "response_revision")),
      plusOneAllowed: bool(contentValue(message, "plus_one_allowed")),
      childrenInvited: bool(contentValue(message, "children_invited")),
      guestRole: clean(contentValue(message, "guest_role")) as WeddingBoundaryEventInvitation["guestRole"],
      companionToPersonId: clean(contentValue(message, "companion_to_person_id")),
      namePending: bool(contentValue(message, "name_pending")),
      seatRequirement: clean(contentValue(message, "seat_requirement")) as WeddingBoundaryEventInvitation["seatRequirement"],
      mealRequirement: clean(contentValue(message, "meal_requirement")) as WeddingBoundaryEventInvitation["mealRequirement"],
      visibleToGuest: contentValue(message, "visible_to_guest") !== false,
    };
  }
  if (kind === "wedding_boundary_change_request") {
    const requestId = clean(contentValue(message, "request_id"));
    const requestedBy = clean(contentValue(message, "requested_by"));
    if (!requestId || !requestedBy) return null;
    return {
      ...base,
      kind,
      requestId,
      requestedBy,
      changeType: clean(contentValue(message, "change_type")) as WeddingBoundaryChangeRequest["changeType"] ?? "add_guest",
      targetPersonId: clean(contentValue(message, "target_person_id")),
      targetEventId: clean(contentValue(message, "target_event_id")),
      targetHouseholdId: clean(contentValue(message, "target_household_id")),
      requestStatus: boundaryRequestStatusFrom(contentValue(message, "request_status")),
      approvalRequired: bool(contentValue(message, "approval_gate_recorded")) || bool(contentValue(message, "approval_required")),
      policyIds: strings(contentValue(message, "policy_ids")),
      policyVersions: numberRecord(contentValue(message, "policy_versions")),
      publicReason: clean(contentValue(message, "public_reason")),
      revision: positiveInteger(contentValue(message, "revision")) ?? 1,
      proposedGuestName: clean(contentValue(message, "proposed_guest_name")),
      expectedHouseholdRevision: positiveInteger(contentValue(message, "expected_household_revision")),
    };
  }
  if (kind === "wedding_boundary_decision_rationale") {
    const decisionId = clean(contentValue(message, "decision_id"));
    if (!decisionId) return null;
    return {
      ...base,
      kind,
      decisionId,
      linkedPolicyId: clean(contentValue(message, "linked_policy_id")),
      summaryPublic: clean(contentValue(message, "summary_public")),
      rationaleCiphertext: clean(contentValue(message, "encrypted_private_payload")) ?? "",
    } satisfies WeddingBoundaryDecisionRationale;
  }
  return null;
}
