// @locs-version: 1.0
import type { WeddingGuestOperationsLocalDraftGuest } from "@/lib/weddingGuestOperationsLocalState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";

export type WeddingGuestOperationsDisplayCounts = {
  guestRowCount: number;
  attendingCount: number;
  pendingCount: number;
  declinedCount: number;
  needsCount: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guestKey(name: unknown): string {
  return clean(name).toLocaleLowerCase();
}

/** Includes a confirmed local save until the server projection is reloaded. */
export function weddingGuestOperationsDisplayCounts(
  state: WeddingGuestTrackingState,
  drafts: readonly WeddingGuestOperationsLocalDraftGuest[],
): WeddingGuestOperationsDisplayCounts {
  const persistedNames = new Set((state.guestRows ?? []).map((guest) => guestKey(guest.displayName)).filter(Boolean));
  const countedDraftNames = new Set<string>();
  let attendingCount = state.attendingCount;
  let pendingCount = state.pendingCount;
  let declinedCount = state.declinedCount;
  let guestRowCount = state.guestRowCount;

  for (const draft of drafts) {
    const name = guestKey(draft.name);
    if (!name || persistedNames.has(name) || countedDraftNames.has(name)) continue;
    countedDraftNames.add(name);
    guestRowCount += 1;
    if (draft.rsvp === "Attending") attendingCount += 1;
    else if (draft.rsvp === "Not attending") declinedCount += 1;
    else pendingCount += 1;
  }

  return {
    guestRowCount,
    attendingCount,
    pendingCount,
    declinedCount,
    needsCount: state.dietaryCount + state.accessibilityCount,
  };
}
