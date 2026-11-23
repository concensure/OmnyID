// @locs-version: 2.0
import type { WeddingCollaboratorInviteCard } from "@/lib/weddingCollaborationState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
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

export type WeddingBoundaryStarterGuest = {
  displayName: string;
  householdLabel: string;
  familyGroupLabel: string | null;
  invitationAllocation: number | null;
  requestDeadline: string | null;
};

function tableCells(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function headerIndex(headers: readonly string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(header));
}

function validDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function weddingBoundaryStarterGuestsFromArtifacts(
  artifacts: readonly WeddingArtifactInput[] | null | undefined,
): WeddingBoundaryStarterGuest[] {
  const output: WeddingBoundaryStarterGuest[] = [];
  const seen = new Set<string>();
  for (const artifact of artifacts ?? []) {
    if (artifact.kind !== "guest_list") continue;
    const lines = clean(artifact.bodyText).split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
    if (lines.length < 3) continue;
    const headers = tableCells(lines[0]!);
    const nameIndex = headerIndex(headers, /\b(name|guest)\b/i);
    const householdIndex = headerIndex(headers, /\b(household|invitation group|party)\b/i);
    const groupIndex = headerIndex(headers, /\b(family group|family side|side)\b/i);
    const allocationIndex = headerIndex(headers, /\b(allocation|invitation limit|guest limit)\b/i);
    const deadlineIndex = headerIndex(headers, /\b(request deadline|family deadline)\b/i);
    if (nameIndex < 0) continue;
    for (const line of lines.slice(2)) {
      const row = tableCells(line);
      const displayName = clean(row[nameIndex]).slice(0, 120);
      const key = displayName.toLowerCase();
      if (!displayName || seen.has(key)) continue;
      seen.add(key);
      const householdLabel = clean(row[householdIndex]).slice(0, 120) || "Imported guest list";
      const familyGroupLabel = clean(row[groupIndex]).slice(0, 120) || null;
      const parsedAllocation = Number.parseInt(clean(row[allocationIndex]), 10);
      output.push({
        displayName,
        householdLabel,
        familyGroupLabel,
        invitationAllocation: Number.isSafeInteger(parsedAllocation) && parsedAllocation >= 0 && parsedAllocation <= 5000 ? parsedAllocation : null,
        requestDeadline: validDate(clean(row[deadlineIndex])),
      });
      if (output.length >= 500) return output;
    }
  }
  return output;
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
  guestRows?: readonly WeddingBoundaryStarterGuest[] | null;
  helperNames?: readonly unknown[] | null;
  collaboratorInvites?: readonly WeddingCollaboratorInviteCard[] | null;
}): WeddingBoundaryLedgerObject[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const policies: WeddingBoundaryLedgerObject[] = DEFAULT_POLICIES.map((policy) => ({
    ...policy,
    id: `policy:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(policy.title)}`,
  }));
  const inviteRoles = (input.collaboratorInvites ?? []).map(roleForInvite);
  const importedRows = (input.guestRows ?? []).slice(0, 500);
  const guestNames = uniqueStrings(importedRows.length > 0 ? importedRows.map((row) => row.displayName) : input.guestNames ?? [], 500);
  const guestNameKeys = new Set(guestNames.map((name) => name.toLowerCase()));
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
  const rowsByName = new Map(importedRows.map((row) => [row.displayName.toLowerCase(), row]));
  const householdGroups = new Map<string, { label: string; members: string[]; row: WeddingBoundaryStarterGuest | null }>();
  for (const name of guestNames) {
    const row = rowsByName.get(name.toLowerCase()) ?? null;
    const label = row?.householdLabel || "Imported guest list";
    const key = label.toLowerCase();
    const group = householdGroups.get(key) ?? { label, members: [], row };
    group.members.push(name);
    if (!group.row && row) group.row = row;
    householdGroups.set(key, group);
  }
  const householdIdFor = (label: string) => `household:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(label) || "guest-list"}`;
  const households: WeddingBoundaryHousehold[] = Array.from(householdGroups.values()).map((group) => {
    const householdId = householdIdFor(group.label);
    const familyGroupLabel = group.row?.familyGroupLabel ?? null;
    return {
      id: householdId,
      kind: "wedding_boundary_household",
      householdId,
      title: group.label,
      displayName: group.label,
      visibility: "approved_shared",
      primaryContactPersonId: `person:${safeWeddingLabel(group.members[0])}`,
      memberPersonIds: group.members.map((name) => `person:${safeWeddingLabel(name)}`),
      familySide: "shared",
      familyGroupId: familyGroupLabel ? `family_group:${safeWeddingLabel(familyGroupLabel)}` : null,
      familyGroupLabel,
      invitationAllocation: group.row?.invitationAllocation ?? null,
      requestDeadline: group.row?.requestDeadline ?? null,
    };
  });
  const guests = guestNames.map((name): WeddingBoundaryLedgerObject => ({
    id: `person:${safeWeddingLabel(name)}`,
    kind: "wedding_boundary_guest_profile",
    personId: `person:${safeWeddingLabel(name)}`,
    title: name,
    displayName: name,
    visibility: "approved_shared",
    householdId: householdIdFor(rowsByName.get(name.toLowerCase())?.householdLabel || "Imported guest list"),
    ageBand: "unknown",
  }));
  return [...policies, ...inviteRoles, ...helperRoles, ...households, ...guests];
}
