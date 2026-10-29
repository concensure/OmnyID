// @locs-version: 1.0
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
  viewedAt: string | null;
  respondedAt: string | null;
  lockedAt: string | null;
  changed: boolean;
  revision: number | null;
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
