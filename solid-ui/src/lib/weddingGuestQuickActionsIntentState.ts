// @locs-version: 1.0
let pendingGuestRsvpQuickActions = false;

export const WEDDING_GUEST_RSVP_QUICK_ACTIONS_EVENT = "omnyid:wedding-open-guest-rsvp-quick-actions";

export function requestWeddingGuestRsvpQuickActions(): void {
  pendingGuestRsvpQuickActions = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WEDDING_GUEST_RSVP_QUICK_ACTIONS_EVENT));
}

export function consumeWeddingGuestRsvpQuickActionsIntent(): boolean {
  const pending = pendingGuestRsvpQuickActions;
  pendingGuestRsvpQuickActions = false;
  return pending;
}
