// @locs-version: 2.0
import type { WeddingCollaboratorInviteCard } from "@/lib/weddingCollaborationState";
import type {
  WeddingBoundaryHousehold,
  WeddingBoundaryLedgerObject,
  WeddingBoundaryPolicy,
  WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 40): string[] {
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

const DEFAULT_POLICIES: readonly Omit<WeddingBoundaryPolicy, "id">[] = [{
  kind: "wedding_boundary_policy",
  title: "Guest changes need approval",
  status: "active",
  visibility: "family_visible",
  ruleType: "invitation_scope",
  enforcement: "require_approval",
  scope: "guest_list",
  plainLanguage: "Family and helpers can suggest guest changes, but the couple approves the final list.",
  approvedBy: [],
}, {
  kind: "wedding_boundary_policy",
  title: "No extra plus-ones",
  status: "active",
  visibility: "family_visible",
  ruleType: "plus_one",
  enforcement: "require_approval",
  scope: "guest_list",
  plainLanguage: "Extra plus-ones stay as suggestions until both people in the couple approve them.",
  approvedBy: [],
}];

function roleForInvite(invite: WeddingCollaboratorInviteCard): WeddingBoundaryRoleAssignment {
  const role = invite.role === "co_owner"
    ? "couple"
    : invite.role === "planner" || invite.role === "contributor"
      ? "helper"
      : "guest";
  return {
    id: `role:${safeWeddingLabel(invite.email || invite.displayName)}`,
    kind: "wedding_boundary_role_assignment",
    title: `${invite.displayName} access`,
    visibility: role === "couple" ? "couple_only" : "approved_shared",
    personId: `person:${safeWeddingLabel(invite.email || invite.displayName)}`,
    role,
    canView: role === "couple" ? ["everything"] : role === "helper" ? ["approved_plan", "assigned_tasks", "logistics"] : ["approved_shared_info"],
    canSuggest: role === "couple" ? ["add_guest", "remove_guest", "plus_one_change", "event_invite_change", "household_change"] : ["add_guest", "plus_one_change", "guest_contact_update"],
    canEdit: role === "couple" ? ["add_guest", "remove_guest", "plus_one_change", "event_invite_change", "household_change", "guest_note_change", "guest_contact_update"] : [],
    requiresApprovalFor: role === "couple" ? [] : ["add_guest", "remove_guest", "plus_one_change", "event_invite_change", "household_change"],
    privateNotesVisible: role === "couple",
  };
}

export function buildWeddingBoundaryStarterObjects(input: {
  metadata?: unknown;
  guestNames?: readonly unknown[] | null;
  helperNames?: readonly unknown[] | null;
  collaboratorInvites?: readonly WeddingCollaboratorInviteCard[] | null;
}): WeddingBoundaryLedgerObject[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const policies: WeddingBoundaryLedgerObject[] = DEFAULT_POLICIES.map((policy) => ({
    ...policy,
    id: `policy:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(policy.title)}`,
  }));
  const inviteRoles = (input.collaboratorInvites ?? []).map(roleForInvite);
  const guestNames = uniqueStrings(input.guestNames ?? [], 20);
  const guestNameKeys = new Set(guestNames.map((name) => name.toLowerCase()));
  const householdId = `household:${safeWeddingLabel(metadata.responseWorkspaceId)}:guest-list`;
  const helperRoles = uniqueStrings(input.helperNames ?? [])
    .filter((name) => !guestNameKeys.has(name.toLowerCase()))
    .filter((name) => !inviteRoles.some((role) => role.title.toLowerCase().startsWith(name.toLowerCase())))
    .slice(0, 12)
    .map((name): WeddingBoundaryRoleAssignment => ({
      id: `role:${safeWeddingLabel(name)}`,
      kind: "wedding_boundary_role_assignment",
      title: `${name} helping role`,
      visibility: "approved_shared",
      personId: `person:${safeWeddingLabel(name)}`,
      role: "helper",
      canView: ["assigned_tasks", "approved_logistics"],
      canSuggest: ["guest_contact_update"],
      canEdit: ["guest_contact_update"],
      requiresApprovalFor: ["add_guest", "remove_guest", "plus_one_change", "event_invite_change"],
      privateNotesVisible: false,
    }));
  const household: WeddingBoundaryHousehold | null = guestNames.length > 0
    ? {
      id: householdId,
      kind: "wedding_boundary_household",
      householdId,
      title: "Imported guest list",
      displayName: "Imported guest list",
      visibility: "approved_shared",
      primaryContactPersonId: `person:${safeWeddingLabel(guestNames[0])}`,
      memberPersonIds: guestNames.map((name) => `person:${safeWeddingLabel(name)}`),
      familySide: "shared",
    }
    : null;
  const guests = guestNames.map((name): WeddingBoundaryLedgerObject => ({
    id: `person:${safeWeddingLabel(name)}`,
    kind: "wedding_boundary_guest_profile",
    personId: `person:${safeWeddingLabel(name)}`,
    title: name,
    displayName: name,
    visibility: "approved_shared",
    householdId,
    ageBand: "unknown",
  }));
  return [...policies, ...inviteRoles, ...helperRoles, ...(household ? [household] : []), ...guests];
}
