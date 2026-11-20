// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import type { WeddingRsvpReminderReceipt } from "@/lib/weddingRsvpReminderState";

export type WeddingRsvpHouseholdLifecycle = {
  householdId: string;
  householdLabel: string;
  recipientLabels: string[];
  invitationIds: string[];
  responseState: "not_started" | "incomplete" | "complete";
  linkState: "not_created" | "created" | "opened";
  reminderState: "none" | "approved" | "provider_accepted" | "delivered" | "failed";
  followUpDue: boolean;
  evidenceLabels: string[];
  nextAction: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildWeddingRsvpHouseholdLifecycles(input: {
  guestTracking: WeddingGuestTrackingState;
  afpMessages: readonly AfpMessage[];
  reminderReceipts: readonly WeddingRsvpReminderReceipt[];
  eventId: string;
  responseDeadline: string;
  nowIso?: string;
}): WeddingRsvpHouseholdLifecycle[] {
  const households = new Map<string, {
    householdId: string;
    householdLabel: string;
    recipientLabels: string[];
    invitationIds: string[];
    operationalStates: string[];
  }>();
  for (const row of input.guestTracking.guestRows ?? []) {
    const eventResponse = row.eventResponses.find((response) => response.eventId === input.eventId);
    if (!eventResponse) continue;
    const householdId = row.householdId || row.householdLabel;
    const current = households.get(householdId) ?? {
      householdId,
      householdLabel: row.householdLabel,
      recipientLabels: [],
      invitationIds: [],
      operationalStates: [],
    };
    current.recipientLabels.push(row.displayName);
    current.invitationIds.push(eventResponse.invitationId);
    current.operationalStates.push(input.guestTracking.rsvpResponseSummary.rows
      .find((response) => response.guestId === row.id)?.operationalState ?? "not_started");
    households.set(householdId, current);
  }

  const capabilityEvents = input.afpMessages.flatMap((message) => {
    const kind = clean(message.kind) || clean(record(message.content).kind);
    if (!kind.startsWith("wedding_rsvp_capability_")) return [];
    const content = record(message.content);
    const householdId = clean(content.household_id);
    if (!householdId) return [];
    return [{ householdId, capabilityId: clean(content.capability_id) || householdId, kind, timestamp: message.timestamp }];
  });
  const nowDate = (input.nowIso ?? new Date().toISOString()).slice(0, 10);

  return Array.from(households.values()).map((household) => {
    const capabilityStates = new Map<string, "not_created" | "created" | "opened">();
    const events = capabilityEvents
      .filter((event) => event.householdId === household.householdId)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    for (const event of events) {
      if (event.kind === "wedding_rsvp_capability_granted" || event.kind === "wedding_rsvp_capability_regenerated") capabilityStates.set(event.capabilityId, "created");
      if (event.kind === "wedding_rsvp_capability_opened") capabilityStates.set(event.capabilityId, "opened");
      if (event.kind === "wedding_rsvp_capability_revoked" || event.kind === "wedding_rsvp_capability_expired") capabilityStates.set(event.capabilityId, "not_created");
    }
    const linkState: WeddingRsvpHouseholdLifecycle["linkState"] = [...capabilityStates.values()].includes("opened")
      ? "opened"
      : [...capabilityStates.values()].includes("created") ? "created" : "not_created";
    const responseState: WeddingRsvpHouseholdLifecycle["responseState"] = household.operationalStates.every((state) => state === "responded")
      ? "complete"
      : household.operationalStates.some((state) => state === "responded" || state === "incomplete")
        ? "incomplete"
        : "not_started";
    const receipt = input.reminderReceipts.find((item) => item.householdId === household.householdId);
    const reminderState: WeddingRsvpHouseholdLifecycle["reminderState"] = receipt?.deliveryStatus ?? "none";
    const followUpDue = responseState !== "complete" && input.responseDeadline <= nowDate
      && reminderState !== "provider_accepted" && reminderState !== "delivered";
    const evidenceLabels = [
      linkState === "opened" ? "Private link opened" : linkState === "created" ? "Private link created — open not recorded" : "No protected link evidence",
      responseState === "complete" ? "RSVP complete" : responseState === "incomplete" ? "RSVP incomplete" : "No RSVP recorded",
      reminderState === "delivered" ? "Reminder delivered" : reminderState === "provider_accepted" ? "Reminder accepted by provider" : reminderState === "approved" ? "Reminder approved — not submitted" : reminderState === "failed" ? "Reminder delivery failed" : null,
      followUpDue ? `Follow-up due · deadline ${input.responseDeadline}` : null,
    ].filter((label): label is string => Boolean(label));
    const nextAction = responseState === "complete"
      ? "No follow-up needed."
      : reminderState === "provider_accepted" || reminderState === "delivered"
        ? "Wait for the recorded reminder outcome before sending again."
        : linkState === "not_created"
          ? "Create or share a protected household link from Guests."
          : linkState === "created"
            ? "Confirm the link reached the household before reminding them."
            : responseState === "incomplete"
              ? "Ask only for the missing required RSVP detail."
              : "Review the exact recipient and reminder before sending.";
    return {
      householdId: household.householdId,
      householdLabel: household.householdLabel,
      recipientLabels: [...new Set(household.recipientLabels)].sort(),
      invitationIds: [...new Set(household.invitationIds)].sort(),
      responseState,
      linkState,
      reminderState,
      followUpDue,
      evidenceLabels,
      nextAction,
    };
  }).sort((left, right) => left.householdLabel.localeCompare(right.householdLabel));
}
