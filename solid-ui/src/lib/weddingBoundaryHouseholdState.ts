// @locs-version: 1.0
import type {
  WeddingBoundaryChangeRequest,
  WeddingBoundaryEventInvitation,
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryLedgerObject,
} from "@/lib/weddingBoundaryLedgerState";

export type WeddingBoundaryHouseholdRow = {
  householdId: string;
  displayName: string;
  representativeLabel: string;
  familyGroupLabel: string;
  memberCount: number;
  namedInvitationCount: number;
  invitationAllocation: number | null;
  remainingAllocation: number | null;
  rsvpLabel: string;
  pendingRequestCount: number;
  requestDeadline: string | null;
  lastActivityAt: string | null;
  attentionLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown): number {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityAt(object: WeddingBoundaryLedgerObject): string | null {
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata : {};
  const candidates = [metadata.decided_at, metadata.updated_at, object.createdAt]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .sort((left, right) => timestamp(right) - timestamp(left));
  return candidates[0] ?? null;
}

function groupLabel(household: WeddingBoundaryHousehold): string {
  if (clean(household.familyGroupLabel)) return clean(household.familyGroupLabel);
  if (clean(household.familyGroupId)) return clean(household.familyGroupId).replace(/^family_group:/, "").replace(/[_-]+/g, " ");
  if (household.familySide === "bride") return "Partner one's family";
  if (household.familySide === "groom") return "Partner two's family";
  if (household.familySide === "shared") return "Shared family and friends";
  return "Not grouped";
}

function activeInvitation(invitation: WeddingBoundaryEventInvitation): boolean {
  return !["not_invited", "declined_by_couple"].includes(invitation.invitationStatus);
}

export function buildWeddingBoundaryHouseholdRows(
  objects: readonly WeddingBoundaryLedgerObject[],
): WeddingBoundaryHouseholdRow[] {
  const households = objects.filter((object): object is WeddingBoundaryHousehold => (
    object.kind === "wedding_boundary_household" && object.status !== "archived"
  ));
  const guests = objects.filter((object): object is WeddingBoundaryGuestProfile => object.kind === "wedding_boundary_guest_profile");
  const invitations = objects.filter((object): object is WeddingBoundaryEventInvitation => object.kind === "wedding_boundary_event_invitation");
  const requests = objects.filter((object): object is WeddingBoundaryChangeRequest => (
    object.kind === "wedding_boundary_change_request" && object.requestStatus === "pending"
  ));
  const guestById = new Map(guests.map((guest) => [guest.personId, guest]));

  return households.map((household): WeddingBoundaryHouseholdRow => {
    const memberIds = new Set([
      ...(household.memberPersonIds ?? []),
      ...guests.filter((guest) => guest.householdId === household.householdId).map((guest) => guest.personId),
    ].map(clean).filter(Boolean));
    const memberInvitations = invitations.filter((invitation) => memberIds.has(invitation.personId));
    const namedInvitations = new Set(memberInvitations.filter(activeInvitation).map((invitation) => invitation.personId)).size;
    const attending = new Set(memberInvitations.filter((invitation) => invitation.invitationStatus === "rsvp_yes").map((invitation) => invitation.personId)).size;
    const declined = new Set(memberInvitations.filter((invitation) => invitation.invitationStatus === "rsvp_no").map((invitation) => invitation.personId)).size;
    const pending = Math.max(0, namedInvitations - attending - declined);
    const householdRequests = requests.filter((request) => request.targetHouseholdId === household.householdId);
    const allocation = typeof household.invitationAllocation === "number" && Number.isInteger(household.invitationAllocation) && household.invitationAllocation >= 0
      ? household.invitationAllocation
      : null;
    const remaining = allocation === null ? null : allocation - namedInvitations;
    const representative = guestById.get(clean(household.primaryContactPersonId));
    const activityCandidates = [
      activityAt(household),
      ...[...memberIds].map((personId) => guestById.get(personId)).filter((guest): guest is WeddingBoundaryGuestProfile => Boolean(guest)).map(activityAt),
      ...memberInvitations.map(activityAt),
      ...householdRequests.map(activityAt),
    ].filter((value): value is string => value !== null).sort((left, right) => timestamp(right) - timestamp(left));
    const attentionLabels = [
      householdRequests.length > 0 ? `${householdRequests.length} request${householdRequests.length === 1 ? "" : "s"} need review` : null,
      remaining !== null && remaining < 0 ? `${Math.abs(remaining)} over allocation` : null,
      pending > 0 ? `${pending} RSVP${pending === 1 ? "" : "s"} pending` : null,
      !representative ? "Representative not confirmed" : null,
    ].filter((label): label is string => label !== null);
    return {
      householdId: household.householdId,
      displayName: household.displayName,
      representativeLabel: representative?.displayName ?? "Not confirmed",
      familyGroupLabel: groupLabel(household),
      memberCount: memberIds.size,
      namedInvitationCount: namedInvitations,
      invitationAllocation: allocation,
      remainingAllocation: remaining,
      rsvpLabel: namedInvitations === 0 ? "No invitations yet" : `${attending} attending · ${pending} pending · ${declined} declined`,
      pendingRequestCount: householdRequests.length,
      requestDeadline: clean(household.requestDeadline) || null,
      lastActivityAt: activityCandidates[0] ?? null,
      attentionLabels,
    };
  }).sort((left, right) => (
    right.pendingRequestCount - left.pendingRequestCount
    || Number((right.remainingAllocation ?? 0) < 0) - Number((left.remainingAllocation ?? 0) < 0)
    || Number(right.rsvpLabel.includes("pending")) - Number(left.rsvpLabel.includes("pending"))
    || (left.remainingAllocation ?? Number.POSITIVE_INFINITY) - (right.remainingAllocation ?? Number.POSITIVE_INFINITY)
    || (timestamp(left.requestDeadline) || Number.POSITIVE_INFINITY) - (timestamp(right.requestDeadline) || Number.POSITIVE_INFINITY)
    || timestamp(right.lastActivityAt) - timestamp(left.lastActivityAt)
    || left.displayName.localeCompare(right.displayName)
  ));
}
