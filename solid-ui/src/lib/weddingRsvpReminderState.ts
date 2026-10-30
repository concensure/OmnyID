// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingRsvpReminderCandidate = {
  id: string;
  householdId: string | null;
  householdLabel: string;
  recipientLabels: string[];
  contactLabels: string[];
  invitationIds: string[];
  reasonLabel: string;
  deadline: string;
  exactContent: string;
  sourceReferences: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

export function buildWeddingRsvpReminderCandidates(input: {
  guestTracking: WeddingGuestTrackingState;
  eventId: string;
  eventLabel: string;
  hostLabel: string;
  responseDeadline: string;
  priorReminderHouseholdIds?: readonly string[] | null;
  quietHoursActive?: boolean;
}): WeddingRsvpReminderCandidate[] {
  if (input.quietHoursActive) return [];
  const prior = new Set(input.priorReminderHouseholdIds ?? []);
  const households = new Map<string, typeof input.guestTracking.guestRows>();
  for (const row of input.guestTracking.guestRows ?? []) {
    const eventResponse = row.eventResponses.find((response) => response.eventId === input.eventId);
    if (!eventResponse) continue;
    const responseDetail = input.guestTracking.rsvpResponseSummary.rows.find((item) => item.guestId === row.id);
    if (row.rsvpStatus === "Not attending" || responseDetail?.operationalState === "responded") continue;
    const key = row.householdId || row.householdLabel;
    households.set(key, [...(households.get(key) ?? []), row]);
  }
  return Array.from(households.entries()).flatMap(([key, rows]) => {
    if (!rows || rows.length === 0 || prior.has(key)) return [];
    const contacts = unique(rows.map((row) => row.contactLabel ?? ""));
    if (contacts.length === 0) return [];
    const names = unique(rows.map((row) => row.displayName));
    const invitations = unique(rows.flatMap((row) => row.eventResponses
      .filter((response) => response.eventId === input.eventId)
      .map((response) => response.invitationId)));
    const incomplete = rows.some((row) => input.guestTracking.rsvpResponseSummary.rows
      .find((item) => item.guestId === row.id)?.operationalState === "incomplete");
    const exactContent = incomplete
      ? `Hello ${names.join(" and ")},\n\nThanks for replying about ${input.eventLabel}. A required detail is still missing. Please use your private RSVP link to review it by ${input.responseDeadline}.\n\n${input.hostLabel}`
      : `Hello ${names.join(" and ")},\n\nA gentle reminder to reply about ${input.eventLabel} by ${input.responseDeadline}. Please use your private RSVP link when you are ready.\n\n${input.hostLabel}`;
    return [{
      id: `wedding_rsvp_reminder:${safeWeddingLabel(key)}:${input.responseDeadline}`,
      householdId: rows[0]?.householdId ?? null,
      householdLabel: rows[0]?.householdLabel ?? key,
      recipientLabels: names,
      contactLabels: contacts,
      invitationIds: invitations,
      reasonLabel: incomplete ? "The household replied but a required answer is missing." : "The household has not completed this RSVP.",
      deadline: input.responseDeadline,
      exactContent,
      sourceReferences: invitations.map((id) => `invitation:${id}`),
    }];
  }).sort((left, right) => left.householdLabel.localeCompare(right.householdLabel));
}

export function weddingRsvpReminderDraftToAfpSendInput(
  candidate: WeddingRsvpReminderCandidate,
  metadataInput?: unknown,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const revisionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return {
    id: `${candidate.id}:draft:${revisionId}`,
    thread_id: `wedding_rsvp_reminders:${metadata.responseWorkspaceId}`,
    from: "user://wedding-couple",
    to: ["agent://wedding-planning"],
    type: "ledger",
    kind: "wedding_rsvp_reminder_draft",
    subtype: "wedding_rsvp_reminder_draft",
    content: {
      kind: "wedding_rsvp_reminder_draft",
      contract_version: 1,
      draft_id: candidate.id,
      household_id: candidate.householdId,
      household_label: candidate.householdLabel,
      recipient_labels: candidate.recipientLabels,
      contact_labels: candidate.contactLabels,
      invitation_ids: candidate.invitationIds,
      exact_content: candidate.exactContent,
      response_deadline: candidate.deadline,
      approval_status: "draft",
      sends_message: false,
      created_at: nowIso,
      revision_history: [{ revision: 1, created_at: nowIso, source: "deterministic_template" }],
      model_usage: { model: null, input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    },
    metadata: {
      template: "wedding_planning",
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      origin: "wedding_rsvp_reminder",
      approval_status: "draft",
      requires_human_approval: true,
      sends_message: false,
      model_calls: 0,
    },
    references: [
      { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
      ...candidate.sourceReferences.map((target) => ({ type: "source", target, label: "RSVP source" })),
    ],
    supertags: ["template:wedding_planning", "wedding_rsvp:reminder_draft", "approval:required", "privacy:couple_only"],
    store_in_relational: true,
  };
}
