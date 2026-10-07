// @locs-version: 2.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingSemanticUiKind, WeddingSemanticUiObject } from "@/lib/weddingSemanticUiState";

export type WeddingBoundaryLedgerKind =
  | "wedding_boundary_policy"
  | "wedding_boundary_role_assignment"
  | "wedding_boundary_household"
  | "wedding_boundary_guest_profile"
  | "wedding_boundary_event_invitation"
  | "wedding_boundary_change_request"
  | "wedding_boundary_decision_rationale"
  | "wedding_boundary_decline_template"
  | "wedding_boundary_visibility_page";

export type WeddingBoundaryRole = "couple" | "parent_family" | "helper" | "vendor" | "guest";
export type WeddingBoundaryPolicyRuleType = "plus_one" | "children" | "invitation_scope" | "access" | "seating" | "communication";
export type WeddingBoundaryPolicyEnforcement = "block" | "require_approval" | "warn";
export type WeddingBoundaryChangeType =
  | "add_guest"
  | "remove_guest"
  | "plus_one_change"
  | "event_invite_change"
  | "household_change"
  | "guest_note_change"
  | "guest_contact_update";
export type WeddingBoundaryRequestStatus = "pending" | "approved" | "declined" | "auto_blocked";
export type WeddingBoundaryVisibility = "couple_only" | "approved_shared" | "family_visible" | "vendor_logistics";

export type WeddingBoundaryLedgerObjectBase = {
  id: string;
  kind: WeddingBoundaryLedgerKind;
  title: string;
  status?: string | null;
  visibility?: WeddingBoundaryVisibility | null;
  createdBy?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
  semanticKind?: WeddingSemanticUiKind | null;
  semanticTags?: string[] | null;
  semanticObject?: WeddingSemanticUiObject | null;
};

export type WeddingBoundaryPolicy = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_policy";
  ruleType: WeddingBoundaryPolicyRuleType;
  enforcement: WeddingBoundaryPolicyEnforcement;
  plainLanguage: string;
  scope?: "guest_list" | "event" | "household" | "role" | null;
  appliesToEventIds?: readonly string[] | null;
  appliesToRoleIds?: readonly string[] | null;
  approvedBy?: readonly string[] | null;
  privateRationaleCiphertext?: string | null;
};

export type WeddingBoundaryRoleAssignment = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_role_assignment";
  personId: string;
  role: WeddingBoundaryRole;
  canView?: readonly string[] | null;
  canSuggest?: readonly WeddingBoundaryChangeType[] | null;
  canEdit?: readonly WeddingBoundaryChangeType[] | null;
  requiresApprovalFor?: readonly WeddingBoundaryChangeType[] | null;
  privateNotesVisible?: boolean | null;
};

export type WeddingBoundaryHousehold = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_household";
  householdId: string;
  displayName: string;
  primaryContactPersonId?: string | null;
  memberPersonIds?: readonly string[] | null;
  familySide?: "bride" | "groom" | "shared" | "other" | null;
};

export type WeddingBoundaryGuestProfile = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_guest_profile";
  personId: string;
  displayName: string;
  householdId?: string | null;
  ageBand?: "adult" | "child_under_12" | "teen" | "unknown" | null;
  relationshipLabel?: string | null;
  contactLabel?: string | null;
  mealPreference?: string | null;
  dietaryNote?: string | null;
  accessibilityNote?: string | null;
  familySide?: "bride" | "groom" | "shared" | "other" | null;
  privateNotesCiphertext?: string | null;
};

export type WeddingBoundaryEventInvitation = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_event_invitation";
  invitationId: string;
  eventId: string;
  personId: string;
  invitationStatus: "not_invited" | "invited" | "rsvp_yes" | "rsvp_no" | "waitlist" | "declined_by_couple";
  plusOneAllowed?: boolean | null;
  childrenInvited?: boolean | null;
  visibleToGuest?: boolean | null;
};

export type WeddingBoundaryChangeRequest = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_change_request";
  requestId: string;
  requestedBy: string;
  changeType: WeddingBoundaryChangeType;
  targetPersonId?: string | null;
  targetEventId?: string | null;
  targetHouseholdId?: string | null;
  requestStatus: WeddingBoundaryRequestStatus;
  approvalRequired?: boolean | null;
  policyIds?: readonly string[] | null;
  publicReason?: string | null;
  privateRationaleCiphertext?: string | null;
};

export type WeddingBoundaryDecisionRationale = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_decision_rationale";
  decisionId: string;
  linkedPolicyId?: string | null;
  summaryPublic?: string | null;
  rationaleCiphertext: string;
};

export type WeddingBoundaryDeclineTemplate = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_decline_template";
  templateId: string;
  tone: "warm" | "firm" | "brief";
  useCase: "plus_one_decline" | "child_invite_decline" | "guest_addition_decline" | "event_scope_decline";
  body: string;
  requiresReviewBeforeSend?: boolean | null;
};

export type WeddingBoundaryVisibilityPage = WeddingBoundaryLedgerObjectBase & {
  kind: "wedding_boundary_visibility_page";
  pageId: string;
  audienceRole: Exclude<WeddingBoundaryRole, "couple">;
  visibleSections: readonly string[];
  hiddenSections: readonly string[];
  publishedAt?: string | null;
};

export type WeddingBoundaryLedgerObject =
  | WeddingBoundaryPolicy
  | WeddingBoundaryRoleAssignment
  | WeddingBoundaryHousehold
  | WeddingBoundaryGuestProfile
  | WeddingBoundaryEventInvitation
  | WeddingBoundaryChangeRequest
  | WeddingBoundaryDecisionRationale
  | WeddingBoundaryDeclineTemplate
  | WeddingBoundaryVisibilityPage;

export type WeddingBoundaryChangeEvaluation = {
  status: WeddingBoundaryRequestStatus;
  approvalRequired: boolean;
  policyIds: string[];
  reasonLabels: string[];
  allowedWithoutApproval: boolean;
};

export type WeddingBoundaryState = {
  metadata: WeddingPlanningMetadata;
  activePolicyCount: number;
  pendingApprovalCount: number;
  householdCount: number;
  guestCount: number;
  familyVisibleCount: number;
  privateObjectCount: number;
  approvalQueue: WeddingBoundaryChangeRequest[];
  familyVisibleObjects: WeddingBoundaryLedgerObject[];
  warningLabels: string[];
  summaryLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: readonly unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

const AFP_ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * The authenticated AFP store accepts ULID-shaped transport identifiers only.
 * Wedding objects deliberately use readable logical IDs, so derive a stable
 * transport ID while retaining those logical IDs in message metadata.
 */
function transportUlid(seed: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 0x01000193) >>> 0;
  }
  let result = "";
  for (let index = 0; index < 26; index += 1) {
    hash = Math.imul(hash ^ (index + 1), 0x27d4eb2d) >>> 0;
    result += AFP_ULID_ALPHABET[(hash >>> 27) & 31];
  }
  return result;
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
  const logicalThreadId = message.thread_id;
  return {
    id: transportUlid(`${message.id}|${message.timestamp}|${JSON.stringify(message.content)}`),
    thread_id: transportUlid(`thread|${logicalThreadId}`),
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: {
      ...(message.metadata ?? {}),
      logical_thread_id: logicalThreadId,
    },
    store_in_relational: true,
  };
}

function objectId(object: WeddingBoundaryLedgerObject): string {
  if (object.kind === "wedding_boundary_household") return object.householdId;
  if (object.kind === "wedding_boundary_guest_profile") return object.personId;
  if (object.kind === "wedding_boundary_event_invitation") return object.invitationId;
  if (object.kind === "wedding_boundary_change_request") return object.requestId;
  if (object.kind === "wedding_boundary_decision_rationale") return object.decisionId;
  if (object.kind === "wedding_boundary_decline_template") return object.templateId;
  if (object.kind === "wedding_boundary_visibility_page") return object.pageId;
  return object.id;
}

function objectTimestampMs(object: WeddingBoundaryLedgerObject, index: number): number {
  const metadata = record(object.metadata);
  const timestamp = clean(metadata.decided_at) || clean(object.createdAt);
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : index;
}

function changeRequestNeedsCoupleReview(object: WeddingBoundaryChangeRequest): boolean {
  return object.approvalRequired === true && object.requestStatus === "pending";
}

export function coalesceWeddingBoundaryLedgerObjects(
  objects: readonly WeddingBoundaryLedgerObject[] | null | undefined,
): WeddingBoundaryLedgerObject[] {
  const byIdentity = new Map<string, { object: WeddingBoundaryLedgerObject; rank: number }>();
  (objects ?? []).forEach((object, index) => {
    const key = `${object.kind}:${objectId(object)}`;
    const rank = objectTimestampMs(object, index);
    const existing = byIdentity.get(key);
    if (!existing || rank >= existing.rank) byIdentity.set(key, { object, rank });
  });
  return Array.from(byIdentity.values()).map((entry) => entry.object);
}

function roleTag(role: WeddingBoundaryRole): string {
  return `wedding_boundary_role:${safeWeddingLabel(role)}`;
}

function policyTag(policy: WeddingBoundaryPolicy): string {
  return `wedding_policy:${safeWeddingLabel(policy.ruleType)}`;
}

function supertagsFor(object: WeddingBoundaryLedgerObject, metadata: WeddingPlanningMetadata): string[] {
  const privateTag = object.visibility === "couple_only" || object.kind === "wedding_boundary_decision_rationale"
    ? "wedding_boundary:couple_only"
    : null;
  return uniqueStrings([
    ...metadata.supertags,
    "wedding_boundary",
    `wedding_boundary:${object.kind.replace(/^wedding_boundary_/, "")}`,
    `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
    `response_workspace:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    "topology:wedding_guest_graph",
    "topology:wedding_decision_rights",
    "decisionos:wedding_boundary",
    privateTag,
    object.kind === "wedding_boundary_policy" ? policyTag(object) : null,
    object.kind === "wedding_boundary_role_assignment" ? roleTag(object.role) : null,
    object.kind === "wedding_boundary_event_invitation" ? `wedding_invitation:${safeWeddingLabel(object.invitationStatus)}` : null,
    object.kind === "wedding_boundary_change_request" && changeRequestNeedsCoupleReview(object) ? "wedding_boundary:approval_required" : null,
    object.kind === "wedding_boundary_guest_profile" && object.ageBand ? `wedding_guest:${safeWeddingLabel(object.ageBand)}` : null,
    object.kind === "wedding_boundary_event_invitation" && object.plusOneAllowed === true ? "wedding_guest:plus_one_allowed" : null,
    object.kind === "wedding_boundary_event_invitation" && object.plusOneAllowed === false ? "wedding_guest:plus_one_blocked" : null,
    object.kind === "wedding_boundary_event_invitation" && object.childrenInvited === true ? "wedding_guest:children_invited" : null,
    object.kind === "wedding_boundary_event_invitation" && object.childrenInvited === false ? "wedding_guest:children_blocked" : null,
    object.visibility === "family_visible" || object.visibility === "approved_shared" ? "wedding_boundary:family_visible" : null,
  ]);
}

function ref(type: string, target: unknown, label: string, metadata?: Record<string, unknown>): AfpReference | null {
  const cleanTarget = clean(target);
  if (!cleanTarget) return null;
  return { type, target: cleanTarget, label, ...(metadata ? { metadata } : {}) };
}

function referencesFor(object: WeddingBoundaryLedgerObject, metadata: WeddingPlanningMetadata): AfpReference[] {
  const refs: Array<AfpReference | null> = [
    ref("wedding_plan", metadata.weddingPlanId, "Wedding plan"),
    ref("response_workspace", metadata.responseWorkspaceId, "Wedding workspace"),
  ];
  if (object.kind === "wedding_boundary_policy") {
    refs.push(...(object.appliesToEventIds ?? []).map((id) => ref("policy_applies_to_event", id, "Policy applies to event")));
    refs.push(...(object.appliesToRoleIds ?? []).map((id) => ref("policy_applies_to_role", id, "Policy applies to role")));
  } else if (object.kind === "wedding_boundary_role_assignment") {
    refs.push(ref("role_grants_visibility", object.personId, "Role assigned to person", { role: object.role }));
  } else if (object.kind === "wedding_boundary_household") {
    refs.push(ref("primary_contact_for_household", object.primaryContactPersonId, "Primary household contact"));
    refs.push(...(object.memberPersonIds ?? []).map((id) => ref("member_of_household", id, "Household member")));
  } else if (object.kind === "wedding_boundary_guest_profile") {
    refs.push(ref("member_of_household", object.householdId, "Guest household"));
  } else if (object.kind === "wedding_boundary_event_invitation") {
    refs.push(ref("invited_to_event", object.eventId, "Event invitation", { status: object.invitationStatus }));
    refs.push(ref("request_targets_guest", object.personId, "Invited guest"));
  } else if (object.kind === "wedding_boundary_change_request") {
    refs.push(ref("requested_by", object.requestedBy, "Requested by"));
    refs.push(ref("request_targets_guest", object.targetPersonId, "Request target guest"));
    refs.push(ref("request_targets_event", object.targetEventId, "Request target event"));
    refs.push(ref("request_targets_household", object.targetHouseholdId, "Request target household"));
    refs.push(...(object.policyIds ?? []).map((id) => ref("request_violates_policy", id, "Policy involved")));
  } else if (object.kind === "wedding_boundary_decision_rationale") {
    refs.push(ref("decision_explains_policy", object.linkedPolicyId, "Decision explains policy"));
  }
  return refs.filter((item): item is AfpReference => item !== null);
}

function publicContentFor(object: WeddingBoundaryLedgerObject): Record<string, unknown> {
  const base = {
    ledger_kind: object.kind,
    boundary_object_id: objectId(object),
    title: object.title,
    status: object.status ?? null,
    visibility: object.visibility ?? "couple_only",
  };
  if (object.kind === "wedding_boundary_policy") {
    return {
      ...base,
      rule_type: object.ruleType,
      enforcement: object.enforcement,
      scope: object.scope ?? "guest_list",
      plain_language: object.plainLanguage,
      approved_by: object.approvedBy ?? [],
      private_rationale_encrypted: Boolean(object.privateRationaleCiphertext),
    };
  }
  if (object.kind === "wedding_boundary_role_assignment") {
    return {
      ...base,
      person_id: object.personId,
      role: object.role,
      can_view: object.canView ?? [],
      can_suggest: object.canSuggest ?? [],
      can_edit: object.canEdit ?? [],
      requires_approval_for: object.requiresApprovalFor ?? [],
      private_notes_visible: object.privateNotesVisible === true,
    };
  }
  if (object.kind === "wedding_boundary_household") {
    return {
      ...base,
      household_id: object.householdId,
      display_name: object.displayName,
      primary_contact_person_id: object.primaryContactPersonId ?? null,
      member_person_ids: object.memberPersonIds ?? [],
      family_side: object.familySide ?? null,
    };
  }
  if (object.kind === "wedding_boundary_guest_profile") {
    return {
      ...base,
      person_id: object.personId,
      display_name: object.displayName,
      household_id: object.householdId ?? null,
      age_band: object.ageBand ?? "unknown",
      relationship_label: object.relationshipLabel ?? null,
      contact_label: object.contactLabel ?? null,
      meal_preference: object.mealPreference ?? null,
      dietary_note: object.dietaryNote ?? null,
      accessibility_note: object.accessibilityNote ?? null,
      family_side: object.familySide ?? null,
      private_notes_encrypted: Boolean(object.privateNotesCiphertext),
    };
  }
  if (object.kind === "wedding_boundary_event_invitation") {
    return {
      ...base,
      invitation_id: object.invitationId,
      event_id: object.eventId,
      person_id: object.personId,
      invitation_status: object.invitationStatus,
      plus_one_allowed: object.plusOneAllowed === true,
      children_invited: object.childrenInvited === true,
      visible_to_guest: object.visibleToGuest !== false,
    };
  }
  if (object.kind === "wedding_boundary_change_request") {
    return {
      ...base,
      request_id: object.requestId,
      requested_by: object.requestedBy,
      change_type: object.changeType,
      target_person_id: object.targetPersonId ?? null,
      target_event_id: object.targetEventId ?? null,
      target_household_id: object.targetHouseholdId ?? null,
      request_status: object.requestStatus,
      approval_required: changeRequestNeedsCoupleReview(object),
      approval_gate_recorded: object.approvalRequired === true,
      policy_ids: object.policyIds ?? [],
      public_reason: object.publicReason ?? null,
      private_rationale_encrypted: Boolean(object.privateRationaleCiphertext),
    };
  }
  if (object.kind === "wedding_boundary_decision_rationale") {
    return {
      ...base,
      decision_id: object.decisionId,
      linked_policy_id: object.linkedPolicyId ?? null,
      summary_public: object.summaryPublic ?? null,
      rationale_encrypted: true,
    };
  }
  if (object.kind === "wedding_boundary_decline_template") {
    return {
      ...base,
      template_id: object.templateId,
      tone: object.tone,
      use_case: object.useCase,
      body: object.body,
      requires_review_before_send: object.requiresReviewBeforeSend !== false,
    };
  }
  return {
    ...base,
    page_id: object.pageId,
    audience_role: object.audienceRole,
    visible_sections: object.visibleSections,
    hidden_sections: object.hiddenSections,
    published_at: object.publishedAt ?? null,
  };
}

function semanticKindFor(object: WeddingBoundaryLedgerObject): WeddingSemanticUiKind {
  if (object.semanticObject) return object.semanticObject.kind;
  if (object.kind === "wedding_boundary_change_request" && changeRequestNeedsCoupleReview(object)) return "wedding_approval_required";
  if (object.kind === "wedding_boundary_change_request" && object.requestStatus !== "approved") return "wedding_conflict";
  if (object.kind === "wedding_boundary_policy") return object.enforcement === "block" ? "wedding_conflict" : "wedding_active_loop";
  if (object.kind === "wedding_boundary_decision_rationale") return "wedding_decision";
  return "wedding_active_loop";
}

function semanticToneFor(kind: WeddingSemanticUiKind): WeddingSemanticUiObject["tone"] {
  if (kind === "wedding_approval_required") return "action";
  if (kind === "wedding_conflict") return "risk";
  if (kind === "wedding_comparison") return "options";
  return "status";
}

function semanticStateLabelFor(object: WeddingBoundaryLedgerObject, semanticKind: WeddingSemanticUiKind): string {
  if (object.kind === "wedding_boundary_change_request") {
    if (changeRequestNeedsCoupleReview(object)) return "Needs approval";
    if (object.requestStatus === "auto_blocked") return "Blocked by rule";
    if (object.requestStatus === "approved") return "Approved";
    if (object.requestStatus === "declined") return "Declined";
    return "Waiting";
  }
  if (object.kind === "wedding_boundary_policy") return object.enforcement === "block" ? "Rule blocks changes" : "Rule active";
  if (semanticKind === "wedding_decision") return "Private rationale";
  return "Saved";
}

function semanticSummaryFor(object: WeddingBoundaryLedgerObject): string {
  if (object.kind === "wedding_boundary_policy") return object.plainLanguage;
  if (object.kind === "wedding_boundary_change_request") {
    return object.publicReason ?? (
      changeRequestNeedsCoupleReview(object)
        ? "A guest or family change is waiting for couple approval."
        : "This guest or family change is recorded in the wedding ledger."
    );
  }
  if (object.kind === "wedding_boundary_role_assignment") return "This person has a clear wedding role and visibility scope.";
  if (object.kind === "wedding_boundary_guest_profile") return "This guest profile keeps household, access, and invitation context together.";
  if (object.kind === "wedding_boundary_event_invitation") return "This invitation links a guest to one wedding event and its RSVP state.";
  if (object.kind === "wedding_boundary_visibility_page") return "This shared page controls what this audience can see.";
  return "This family boundary record keeps responsibility and visibility clear.";
}

function semanticObjectFor(object: WeddingBoundaryLedgerObject): WeddingSemanticUiObject {
  if (object.semanticObject) return object.semanticObject;
  const kind = object.semanticKind ?? semanticKindFor(object);
  const tags = uniqueStrings([
    ...(object.semanticTags ?? []),
    "wedding_boundary",
    object.kind,
    kind,
    object.visibility,
    object.kind === "wedding_boundary_change_request" ? object.changeType : null,
    object.kind === "wedding_boundary_policy" ? object.ruleType : null,
  ], 16);
  return {
    id: `semantic:${object.kind}:${safeWeddingLabel(objectId(object))}`,
    kind,
    title: object.title,
    stateLabel: semanticStateLabelFor(object, kind),
    tone: semanticToneFor(kind),
    summary: semanticSummaryFor(object),
    comparison: null,
    actions: object.kind === "wedding_boundary_change_request" && changeRequestNeedsCoupleReview(object)
      ? [{ label: "Review request", kind: "review", enabled: true, targetMenu: "people" }]
      : [{ label: "Open people", kind: "open", enabled: true, targetMenu: "people" }],
    semanticTags: tags,
  };
}

function markdownFor(object: WeddingBoundaryLedgerObject): string {
  if (object.kind === "wedding_boundary_change_request") {
    return [
      "# Guest change request",
      "",
      `Request: ${object.title}`,
      `Status: ${object.requestStatus}`,
      `Change: ${object.changeType.replace(/_/g, " ")}`,
      object.publicReason ? `Reason shown to family: ${object.publicReason}` : null,
      changeRequestNeedsCoupleReview(object) ? "Needs couple approval before it changes the guest list." : "No couple review is waiting for this request.",
    ].filter((line): line is string => line !== null).join("\n");
  }
  if (object.kind === "wedding_boundary_policy") {
    return ["# Guest boundary rule", "", object.plainLanguage, "", `How OmnyID handles it: ${object.enforcement.replace(/_/g, " ")}.`].join("\n");
  }
  return [`# ${object.title}`, "", "This wedding boundary record keeps guest, family, and decision-right information queryable in the AFP ledger."].join("\n");
}

export function weddingBoundaryLedgerObjectToAfpMessage(
  object: WeddingBoundaryLedgerObject,
  metadataInput?: unknown,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const id = objectId(object);
  const content = publicContentFor(object);
  const semanticObject = semanticObjectFor(object);
  const semanticTags = uniqueStrings([
    ...(object.semanticTags ?? []),
    ...semanticObject.semanticTags,
    semanticObject.kind,
  ], 16);
  const privateEncrypted = object.kind === "wedding_boundary_policy" ? clean(object.privateRationaleCiphertext)
    : object.kind === "wedding_boundary_guest_profile" ? clean(object.privateNotesCiphertext)
      : object.kind === "wedding_boundary_change_request" ? clean(object.privateRationaleCiphertext)
        : object.kind === "wedding_boundary_decision_rationale" ? clean(object.rationaleCiphertext)
          : "";
  return {
    id: `afp-wedding-boundary-${safeWeddingLabel(id)}`,
    thread_id: `wedding_boundary:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph", "agent://topology"],
    timestamp: clean(object.createdAt) || nowIso,
    type: "ledger",
    kind: object.kind,
    subtype: object.kind,
    supertags: supertagsFor(object, metadata),
    content: {
      ...content,
      markdown: markdownFor(object),
      encrypted_private_payload: privateEncrypted || undefined,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticTags,
      semantic_object: semanticObject,
      semantic_objects: [semanticObject],
    },
    metadata: {
      ...metadata,
      ...(object.metadata ?? {}),
      boundary_object_id: id,
      boundary_kind: object.kind,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticTags,
      semantic_object: semanticObject,
      semantic_objects: [semanticObject],
      e2ee_required: object.visibility === "couple_only" || object.kind === "wedding_boundary_decision_rationale" || Boolean(privateEncrypted),
      private_fields: privateEncrypted ? ["encrypted_private_payload"] : [],
      searchable_terms: uniqueStrings([
        object.title,
        object.kind,
        id,
        object.visibility,
        object.kind === "wedding_boundary_policy" ? object.ruleType : null,
        object.kind === "wedding_boundary_role_assignment" ? object.role : null,
        object.kind === "wedding_boundary_change_request" ? object.changeType : null,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_boundary_card",
        title: object.title,
        tone: object.kind === "wedding_boundary_change_request" && changeRequestNeedsCoupleReview(object) ? "attention" : "calm",
        summary: object.kind === "wedding_boundary_policy" ? object.plainLanguage : markdownFor(object).split(/\r?\n/)[2] ?? object.title,
        primary_action: object.kind === "wedding_boundary_change_request" && changeRequestNeedsCoupleReview(object) ? "Review request" : "View details",
        semantic_object: semanticObject,
        semantic_objects: [semanticObject],
      },
    }],
    attachments: [],
    references: referencesFor(object, metadata),
  };
}

export function weddingBoundaryLedgerObjectToAfpSendInput(
  object: WeddingBoundaryLedgerObject,
  metadataInput?: unknown,
  nowIso?: string,
): SendAfpMessageInput {
  return messageToSendInput(weddingBoundaryLedgerObjectToAfpMessage(object, metadataInput, nowIso));
}

const SENSITIVE_CHANGES = new Set<WeddingBoundaryChangeType>([
  "add_guest",
  "remove_guest",
  "plus_one_change",
  "event_invite_change",
  "household_change",
]);

function policyMatchesRequest(policy: WeddingBoundaryPolicy, request: WeddingBoundaryChangeRequest): boolean {
  if ((policy.status ?? "active") !== "active") return false;
  if (policy.ruleType === "plus_one") return request.changeType === "plus_one_change";
  if (policy.ruleType === "children") return request.changeType === "add_guest" || request.changeType === "event_invite_change";
  if (policy.ruleType === "invitation_scope") return request.changeType === "add_guest" || request.changeType === "event_invite_change";
  if (policy.ruleType === "access") return request.changeType === "guest_note_change" || request.changeType === "guest_contact_update";
  return request.changeType === "household_change";
}

export function evaluateWeddingBoundaryChangeRequest(input: {
  request: WeddingBoundaryChangeRequest;
  policies?: readonly WeddingBoundaryPolicy[] | null;
  roleAssignments?: readonly WeddingBoundaryRoleAssignment[] | null;
}): WeddingBoundaryChangeEvaluation {
  const matchingPolicies = (input.policies ?? []).filter((policy) => policyMatchesRequest(policy, input.request));
  const requesterRole = (input.roleAssignments ?? []).find((role) => role.personId === input.request.requestedBy);
  const roleRequiresApproval = requesterRole?.requiresApprovalFor?.includes(input.request.changeType) === true;
  const requesterCanEdit = requesterRole?.canEdit?.includes(input.request.changeType) === true;
  const requesterCanSuggest = requesterRole?.canSuggest?.includes(input.request.changeType) === true;
  const sensitive = SENSITIVE_CHANGES.has(input.request.changeType);
  const blocked = matchingPolicies.some((policy) => policy.enforcement === "block");
  const policyRequiresApproval = matchingPolicies.some((policy) => policy.enforcement === "require_approval");
  const approvalRequired = blocked || policyRequiresApproval || roleRequiresApproval || (sensitive && !requesterCanEdit);
  const status: WeddingBoundaryRequestStatus = blocked
    ? "auto_blocked"
    : approvalRequired
      ? "pending"
      : input.request.requestStatus === "approved" || requesterCanEdit
        ? "approved"
        : requesterCanSuggest
          ? "pending"
          : "pending";
  return {
    status,
    approvalRequired,
    policyIds: matchingPolicies.map((policy) => objectId(policy)),
    reasonLabels: uniqueStrings([
      blocked ? "A couple-approved rule blocks this change." : null,
      policyRequiresApproval ? "A couple-approved rule says this needs review." : null,
      roleRequiresApproval ? "This person's role can suggest this change, but cannot make it final." : null,
      sensitive && !requesterCanEdit ? "Guest-list changes need couple approval." : null,
      requesterCanSuggest && !requesterCanEdit ? "Suggestion received for the couple to review." : null,
    ]),
    allowedWithoutApproval: !approvalRequired && requesterCanEdit,
  };
}

function familyVisible(object: WeddingBoundaryLedgerObject): boolean {
  if (object.visibility === "couple_only") return false;
  if (object.kind === "wedding_boundary_decision_rationale") return false;
  if (object.kind === "wedding_boundary_change_request") return object.requestStatus === "approved";
  if (object.kind === "wedding_boundary_policy") return (object.status ?? "active") === "active";
  if (object.kind === "wedding_boundary_event_invitation") return object.visibleToGuest !== false;
  return object.visibility === "family_visible" || object.visibility === "approved_shared" || object.kind === "wedding_boundary_visibility_page";
}

function familySafeObject(object: WeddingBoundaryLedgerObject): WeddingBoundaryLedgerObject {
  if (object.kind === "wedding_boundary_policy") {
    return { ...object, privateRationaleCiphertext: undefined };
  }
  if (object.kind === "wedding_boundary_guest_profile") {
    return { ...object, privateNotesCiphertext: undefined };
  }
  if (object.kind === "wedding_boundary_change_request") {
    return { ...object, privateRationaleCiphertext: undefined };
  }
  if (object.kind === "wedding_boundary_decision_rationale") {
    return { ...object, rationaleCiphertext: "" };
  }
  return object;
}

export function buildWeddingBoundaryState(input: {
  metadata?: unknown;
  objects?: readonly WeddingBoundaryLedgerObject[] | null;
}): WeddingBoundaryState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const objects = coalesceWeddingBoundaryLedgerObjects(input.objects);
  const policies = objects.filter((object): object is WeddingBoundaryPolicy => object.kind === "wedding_boundary_policy");
  const approvals = objects.filter((object): object is WeddingBoundaryChangeRequest => (
    object.kind === "wedding_boundary_change_request"
    && (object.approvalRequired === true || object.requestStatus === "pending")
    && object.requestStatus !== "approved"
    && object.requestStatus !== "declined"
    && object.requestStatus !== "auto_blocked"
  ));
  const households = objects.filter((object) => object.kind === "wedding_boundary_household");
  const guests = objects.filter((object) => object.kind === "wedding_boundary_guest_profile");
  const familyObjects = objects.filter(familyVisible).map(familySafeObject);
  const privateCount = objects.filter((object) => object.visibility === "couple_only" || object.kind === "wedding_boundary_decision_rationale").length;
  const warningLabels = uniqueStrings([
    approvals.length > 0 ? `${approvals.length} family or guest-list request${approvals.length === 1 ? "" : "s"} need review` : null,
    policies.length === 0 ? "No guest boundary rules are active yet." : null,
    households.length === 0 && guests.length > 0 ? "Guests are not grouped into households yet." : null,
  ]);
  return {
    metadata,
    activePolicyCount: policies.filter((policy) => (policy.status ?? "active") === "active").length,
    pendingApprovalCount: approvals.length,
    householdCount: households.length,
    guestCount: guests.length,
    familyVisibleCount: familyObjects.length,
    privateObjectCount: privateCount,
    approvalQueue: approvals,
    familyVisibleObjects: familyObjects,
    warningLabels,
    summaryLabel: `${guests.length} guest profile${guests.length === 1 ? "" : "s"}, ${households.length} household${households.length === 1 ? "" : "s"}, ${approvals.length} request${approvals.length === 1 ? "" : "s"} waiting for review.`,
  };
}
