// @locs-version: 1.0
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";

export type WeddingRsvpReconciliationCandidate = {
  id: string;
  guestId: string;
  guestLabel: string;
  kind: "meal" | "dietary" | "accessibility" | "late_change";
  label: string;
  sourceReferences: string[];
};

export type WeddingRsvpReconciliationState = {
  eventId: string | null;
  attendingGuestIds: string[];
  seatingEligibleCount: number;
  cateringHeadcount: number;
  contractedHeadcount: number | null;
  contractualVariance: number | null;
  estimatedBudgetImpact: number | null;
  missingDetailCandidates: WeddingRsvpReconciliationCandidate[];
  lateChangeExceptions: WeddingRsvpReconciliationCandidate[];
  connectedChangeLabels: string[];
  sourceReferences: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildWeddingRsvpReconciliationState(input: {
  guestTracking: WeddingGuestTrackingState;
  eventId?: string | null;
  contractedHeadcount?: number | null;
  estimatedCostPerGuest?: number | null;
}): WeddingRsvpReconciliationState {
  const eventId = clean(input.eventId) || null;
  const rows = input.guestTracking.guestRows ?? [];
  const relevantRows = eventId
    ? rows.filter((row) => row.eventResponses.some((response) => response.eventId === eventId))
    : rows;
  const attendingRows = relevantRows.filter((row) => {
    if (!eventId) return row.rsvpStatus === "Attending";
    return row.eventResponses.some((response) => response.eventId === eventId && response.attendance === "Attending");
  });
  const missingDetailCandidates: WeddingRsvpReconciliationCandidate[] = [];
  const lateChangeExceptions: WeddingRsvpReconciliationCandidate[] = [];
  for (const row of attendingRows) {
    const sourceReferences = unique([
      `guest:${row.id}`,
      ...row.eventResponses
        .filter((response) => !eventId || response.eventId === eventId)
        .map((response) => `invitation:${response.invitationId}`),
    ]);
    if (row.mealRequired && !clean(row.mealPreference)) {
      missingDetailCandidates.push({
        id: `rsvp-follow-up:${row.id}:meal`,
        guestId: row.id,
        guestLabel: row.displayName,
        kind: "meal",
        label: `${row.displayName} still needs a meal choice.`,
        sourceReferences,
      });
    }
    for (const response of row.eventResponses.filter((item) => !eventId || item.eventId === eventId)) {
      if (response.changed && response.lockedAt) {
        lateChangeExceptions.push({
          id: `rsvp-exception:${response.invitationId}:${response.revision ?? 0}`,
          guestId: row.id,
          guestLabel: row.displayName,
          kind: "late_change",
          label: `${row.displayName}'s response changed after the planning lock. Review catering and seating before applying it.`,
          sourceReferences,
        });
      }
    }
  }
  const cateringHeadcount = attendingRows.length;
  const contractedHeadcount = Number.isInteger(input.contractedHeadcount) && Number(input.contractedHeadcount) >= 0
    ? Number(input.contractedHeadcount)
    : null;
  const costPerGuest = typeof input.estimatedCostPerGuest === "number" && Number.isFinite(input.estimatedCostPerGuest) && input.estimatedCostPerGuest >= 0
    ? input.estimatedCostPerGuest
    : null;
  const contractualVariance = contractedHeadcount === null ? null : cateringHeadcount - contractedHeadcount;
  const estimatedBudgetImpact = costPerGuest === null ? null : cateringHeadcount * costPerGuest;
  const sourceReferences = unique([
    ...attendingRows.map((row) => `guest:${row.id}`),
    ...attendingRows.flatMap((row) => row.eventResponses
      .filter((response) => !eventId || response.eventId === eventId)
      .map((response) => `invitation:${response.invitationId}`)),
  ]);
  return {
    eventId,
    attendingGuestIds: attendingRows.map((row) => row.id),
    seatingEligibleCount: cateringHeadcount,
    cateringHeadcount,
    contractedHeadcount,
    contractualVariance,
    estimatedBudgetImpact,
    missingDetailCandidates,
    lateChangeExceptions,
    connectedChangeLabels: [
      `${cateringHeadcount} attending guest${cateringHeadcount === 1 ? "" : "s"} now feed seating and catering from the same RSVP records.`,
      contractedHeadcount === null
        ? "No vendor commitment was changed. Add a contracted headcount to compare it with the live RSVP count."
        : `The saved vendor commitment remains ${contractedHeadcount}; the live RSVP count is ${contractualVariance === 0 ? "aligned" : `${Math.abs(contractualVariance ?? 0)} ${Number(contractualVariance) > 0 ? "over" : "under"}`}.`,
      lateChangeExceptions.length > 0
        ? `${lateChangeExceptions.length} late change${lateChangeExceptions.length === 1 ? " is" : "s are"} held for review instead of silently changing a commitment.`
        : "No locked response changes need review.",
    ],
    sourceReferences,
  };
}
