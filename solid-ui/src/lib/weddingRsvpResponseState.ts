// @locs-version: 2.0
import { apiFetch, type AfpMessage } from "@/lib/api";
import type { WeddingBoundaryEventInvitation } from "@/lib/weddingBoundaryLedgerState";
export type WeddingRsvpAttendance = "Attending" | "Not attending" | "Pending";

export type WeddingRsvpOperationalState =
  | "not_sent"
  | "invited"
  | "viewed"
  | "incomplete"
  | "responded"
  | "changed"
  | "locked";

export type WeddingRsvpResponseSource = "guest" | "couple_manual" | "import" | "system_correction" | null;

export type WeddingRsvpEventSnapshot = {
  invitationId: string;
  eventId: string;
  attendance: WeddingRsvpAttendance;
  responseSource: WeddingRsvpResponseSource;
  invitedAt?: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  lockedAt: string | null;
  changed: boolean;
  revision: number | null;
  plusOneAllowed?: boolean;
  childrenInvited?: boolean;
  guestRole?: "primary" | "plus_one" | "child" | null;
  companionToPersonId?: string | null;
  namePending?: boolean;
  seatRequirement?: "standard" | "high_chair" | "booster" | "none" | "unknown" | null;
  mealRequirement?: "adult" | "child" | "none" | "unknown" | null;
};

export type WeddingRsvpGuestSnapshot = {
  id: string;
  displayName: string;
  attendance: WeddingRsvpAttendance;
  mealPreference?: string | null;
  mealRequired?: boolean;
  dietaryNote?: string | null;
  accessibilityNote?: string | null;
  sourceLabel?: string | null;
  eventResponses?: readonly WeddingRsvpEventSnapshot[] | null;
};

export type WeddingRsvpResponseRow = {
  guestId: string;
  displayName: string;
  attendance: WeddingRsvpAttendance;
  operationalState: WeddingRsvpOperationalState;
  statusLabel: string;
  provenanceLabel: string;
  missingDetailLabels: string[];
  eventCount: number;
  hasPrivateRequirements: boolean;
  privacyLabel: string | null;
  changeSummary: string | null;
};

export type WeddingRsvpResponseSummaryState = {
  guestCount: number;
  repliedCount: number;
  awaitingCount: number;
  completeCount: number;
  incompleteCount: number;
  changedCount: number;
  lockedCount: number;
  privateRequirementCount: number;
  rows: WeddingRsvpResponseRow[];
  summaryLabel: string;
};

export type WeddingRsvpResponseCommand = {
  weddingPlanId: string;
  responseWorkspaceId: string;
  invitationId: string;
  personId: string;
  eventId: string;
  attendance: "pending" | "attending" | "not_attending";
  expectedRevision: number;
  idempotencyKey: string;
  privateAnswersCiphertext?: string | null;
};

export type WeddingRsvpResponseCommandResult = {
  response: Record<string, unknown>;
  impact_receipt: Record<string, unknown>;
  replayed: boolean;
  explanation: string;
};

export function recordWeddingRsvpResponse(input: WeddingRsvpResponseCommand) {
  return apiFetch<WeddingRsvpResponseCommandResult>("/wedding/rsvp/responses", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      invitation_id: input.invitationId,
      person_id: input.personId,
      event_id: input.eventId,
      attendance: input.attendance,
      expected_revision: input.expectedRevision,
      idempotency_key: input.idempotencyKey,
      private_answers_ciphertext: input.privateAnswersCiphertext ?? null,
    },
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function messageWorkspaceId(message: AfpMessage): string {
  const metadata = record(message.metadata);
  return clean(metadata.responseWorkspaceId ?? metadata.response_workspace_id);
}

export function weddingRsvpResponseInvitationFromAfpMessage(
  message: AfpMessage,
): WeddingBoundaryEventInvitation | null {
  const content = record(message.content);
  const kind = clean(message.subtype ?? message.kind ?? content.kind);
  if (kind !== "wedding_rsvp_response" || !messageWorkspaceId(message)) return null;
  const invitationId = clean(content.invitation_id);
  const eventId = clean(content.event_id);
  const personId = clean(content.person_id);
  const invitationStatus = clean(content.invitation_status);
  if (!invitationId || !eventId || !personId || !["invited", "rsvp_yes", "rsvp_no"].includes(invitationStatus)) return null;
  const source = clean(content.source);
  return {
    id: invitationId,
    kind: "wedding_boundary_event_invitation",
    title: "Guest RSVP",
    visibility: "approved_shared",
    createdBy: source === "guest" ? "guest" : "couple",
    createdAt: clean(content.responded_at) || message.timestamp,
    invitationId,
    eventId,
    personId,
    invitationStatus: invitationStatus as WeddingBoundaryEventInvitation["invitationStatus"],
    responseSource: ["guest", "couple_manual", "import", "system_correction"].includes(source)
      ? source as WeddingBoundaryEventInvitation["responseSource"]
      : "couple_manual",
    respondedAt: clean(content.responded_at) || message.timestamp,
    lockedAt: clean(content.locked_at) || null,
    previousInvitationStatus: clean(content.previous_invitation_status) as WeddingBoundaryEventInvitation["previousInvitationStatus"] || null,
    responseRevision: number(content.revision),
    plusOneAllowed: content.plus_one_allowed === true,
    childrenInvited: content.children_invited === true,
    guestRole: clean(content.guest_role) as WeddingRsvpEventSnapshot["guestRole"] || "primary",
    companionToPersonId: clean(content.companion_to_person_id) || null,
    namePending: content.name_pending === true,
    seatRequirement: clean(content.seat_requirement) as WeddingRsvpEventSnapshot["seatRequirement"] || "unknown",
    mealRequirement: clean(content.meal_requirement) as WeddingRsvpEventSnapshot["mealRequirement"] || "unknown",
    visibleToGuest: true,
    metadata: {
      persisted_afp_message_id: message.id,
      persisted_rsvp_response: true,
      response_id: clean(content.response_id),
      has_private_answers: content.has_private_answers === true,
    },
  };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sourceFor(snapshot: WeddingRsvpGuestSnapshot): WeddingRsvpResponseSource {
  const sources = (snapshot.eventResponses ?? []).map((event) => event.responseSource).filter(Boolean);
  if (sources.includes("guest")) return "guest";
  if (sources.includes("couple_manual")) return "couple_manual";
  if (sources.includes("system_correction")) return "system_correction";
  if (sources.includes("import")) return "import";
  return /import/i.test(clean(snapshot.sourceLabel)) ? "import" : null;
}

function provenanceLabel(snapshot: WeddingRsvpGuestSnapshot): string {
  const source = sourceFor(snapshot);
  if (source === "guest") return "Submitted by guest";
  if (source === "couple_manual") return "Entered by couple";
  if (source === "system_correction") return "Corrected in OmnyID";
  if (source === "import") return "Imported response";
  return clean(snapshot.sourceLabel) || "Saved guest record";
}

function missingDetailLabels(snapshot: WeddingRsvpGuestSnapshot): string[] {
  if (snapshot.attendance !== "Attending") return [];
  return [
    snapshot.mealRequired === true && !clean(snapshot.mealPreference) ? "Meal choice needed" : null,
  ].filter((label): label is string => Boolean(label));
}

function operationalState(
  snapshot: WeddingRsvpGuestSnapshot,
  missing: readonly string[],
): WeddingRsvpOperationalState {
  const events = snapshot.eventResponses ?? [];
  if (events.some((event) => Boolean(event.lockedAt))) return "locked";
  if (events.some((event) => event.changed)) return "changed";
  if (snapshot.attendance !== "Pending" && missing.length > 0) return "incomplete";
  if (snapshot.attendance !== "Pending") return "responded";
  if (events.some((event) => Boolean(event.viewedAt))) return "viewed";
  if (events.length > 0) return "invited";
  return "not_sent";
}

function statusLabel(state: WeddingRsvpOperationalState, attendance: WeddingRsvpAttendance): string {
  if (state === "incomplete") return "Needs details";
  if (state === "changed") return "Response changed";
  if (state === "locked") return "Response locked";
  if (state === "viewed") return "Invitation viewed";
  if (state === "invited") return "Awaiting reply";
  if (state === "not_sent") return attendance === "Pending" ? "Not sent" : "Response saved";
  return attendance === "Attending" ? "Response complete" : "Declined";
}

export function buildWeddingRsvpResponseSummary(
  snapshots: readonly WeddingRsvpGuestSnapshot[] | null | undefined,
): WeddingRsvpResponseSummaryState {
  const rows = (snapshots ?? []).map((snapshot): WeddingRsvpResponseRow => {
    const missing = missingDetailLabels(snapshot);
    const state = operationalState(snapshot, missing);
    const hasPrivateRequirements = Boolean(clean(snapshot.dietaryNote) || clean(snapshot.accessibilityNote));
    const changedEvent = [...(snapshot.eventResponses ?? [])].reverse().find((event) => event.changed);
    return {
      guestId: snapshot.id,
      displayName: snapshot.displayName,
      attendance: snapshot.attendance,
      operationalState: state,
      statusLabel: statusLabel(state, snapshot.attendance),
      provenanceLabel: provenanceLabel(snapshot),
      missingDetailLabels: missing,
      eventCount: snapshot.eventResponses?.length ?? 0,
      hasPrivateRequirements,
      privacyLabel: hasPrivateRequirements ? "Private to the couple until explicitly shared" : null,
      changeSummary: changedEvent
        ? `${snapshot.displayName} changed their RSVP to ${snapshot.attendance}${changedEvent.respondedAt ? ` on ${new Date(changedEvent.respondedAt).toLocaleDateString()}` : ""}.`
        : null,
    };
  });
  const repliedCount = rows.filter((row) => row.attendance !== "Pending").length;
  const awaitingCount = rows.filter((row) => row.attendance === "Pending").length;
  const completeCount = rows.filter((row) => row.operationalState === "responded").length;
  const incompleteCount = rows.filter((row) => row.missingDetailLabels.length > 0).length;
  const changedCount = rows.filter((row) => row.operationalState === "changed").length;
  const lockedCount = rows.filter((row) => row.operationalState === "locked").length;
  const privateRequirementCount = rows.filter((row) => row.hasPrivateRequirements).length;
  return {
    guestCount: rows.length,
    repliedCount,
    awaitingCount,
    completeCount,
    incompleteCount,
    changedCount,
    lockedCount,
    privateRequirementCount,
    rows,
    summaryLabel: rows.length === 0
      ? "No guest responses yet."
      : `${repliedCount} of ${rows.length} replied; ${awaitingCount} awaiting${incompleteCount > 0 ? `; ${incompleteCount} need details` : ""}.`,
  };
}
