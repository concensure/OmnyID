// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
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
  sendAllowedNow: boolean;
  sendBlockReason: string | null;
};

export type WeddingRsvpReminderReceipt = {
  messageId: string;
  threadId: string;
  draftId: string | null;
  householdId: string;
  deliveryStatus: "approved" | "provider_accepted" | "delivered" | "failed";
  providerMessageId: string | null;
  createdAt: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function reminderEmail(value: unknown): string {
  const contact = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) && contact.length <= 254 ? contact : "";
}

function readableDate(value: unknown): string | null {
  const timestamp = clean(value);
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
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
    const contacts = unique(rows.filter((row) => row.rsvpReminderPermission === true).map((row) => reminderEmail(row.contactLabel))).slice(0, 1);
    if (contacts.length === 0) return [];
    const names = unique(rows.map((row) => row.displayName));
    const invitations = unique(rows.flatMap((row) => row.eventResponses
      .filter((response) => response.eventId === input.eventId)
      .map((response) => response.invitationId)));
    const incomplete = rows.some((row) => input.guestTracking.rsvpResponseSummary.rows
      .find((item) => item.guestId === row.id)?.operationalState === "incomplete");
    const sentDate = rows.flatMap((row) => row.eventResponses
      .filter((response) => response.eventId === input.eventId)
      .map((response) => readableDate(response.invitedAt)))
      .find((value): value is string => Boolean(value));
    const invitationContext = sentDate
      ? `We sent your invitation on ${sentDate} for ${input.eventLabel}.`
      : `We recently sent your invitation for ${input.eventLabel}.`;
    const exactContent = incomplete
      ? `Hello ${names.join(" and ")},\n\n${invitationContext} Thank you for replying—a required detail is still missing.\n\nYour response helps us finalise catering, seating and transport without making assumptions. We'd really value having you with us and want to make the day comfortable for you.\n\nPlease use your private RSVP link to review the missing detail by ${input.responseDeadline}.\n\n${input.hostLabel}`
      : `Hello ${names.join(" and ")},\n\n${invitationContext} We are following up because we have not received your RSVP yet.\n\nYour response helps us finalise catering, seating and transport without making assumptions. We'd really value having you with us and hope you can make it.\n\nPlease use your private RSVP link to reply by ${input.responseDeadline}.\n\n${input.hostLabel}`;
    return [{
      id: `wedding_rsvp_reminder:${safeWeddingLabel(key)}:${input.responseDeadline}`,
      householdId: rows[0]?.householdId || safeWeddingLabel(key),
      householdLabel: rows[0]?.householdLabel ?? key,
      recipientLabels: names,
      contactLabels: contacts,
      invitationIds: invitations,
      reasonLabel: incomplete ? "The household replied but a required answer is missing." : "The household has not completed this RSVP.",
      deadline: input.responseDeadline,
      exactContent,
      sourceReferences: invitations.map((id) => `invitation:${id}`),
      sendAllowedNow: input.quietHoursActive !== true,
      sendBlockReason: input.quietHoursActive ? "Quiet hours are active. Review now, but send after 8 am local time." : null,
    }];
  }).sort((left, right) => left.householdLabel.localeCompare(right.householdLabel));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function weddingRsvpReminderReceiptsFromAfpMessages(
  messages: readonly AfpMessage[] | null | undefined,
): WeddingRsvpReminderReceipt[] {
  return (messages ?? []).flatMap((message) => {
    if (message.kind !== "wedding_rsvp_reminder_receipt" && message.kind !== "wedding_rsvp_reminder_approval") return [];
    const content = record(message.content);
    const householdId = clean(content.household_id);
    const rawStatus = message.kind === "wedding_rsvp_reminder_approval" ? "approved" : clean(content.delivery_status);
    if (!householdId || !["approved", "provider_accepted", "delivered", "failed"].includes(rawStatus)) return [];
    return [{
      messageId: message.id,
      threadId: message.thread_id,
      draftId: clean(content.draft_id) || null,
      householdId,
      deliveryStatus: rawStatus as WeddingRsvpReminderReceipt["deliveryStatus"],
      providerMessageId: clean(content.provider_message_id) || null,
      createdAt: clean(content.created_at) || message.timestamp,
    }];
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function weddingRsvpReminderApprovalToAfpSendInput(
  candidate: WeddingRsvpReminderCandidate,
  metadataInput?: unknown,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const approvalId = `${candidate.id}:approval:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
  return {
    id: approvalId,
    thread_id: `wedding_rsvp_reminders:${metadata.responseWorkspaceId}`,
    from: "user://wedding-couple",
    to: ["agent://wedding-planning"],
    type: "ledger",
    kind: "wedding_rsvp_reminder_approval",
    subtype: "wedding_rsvp_reminder_approval",
    content: {
      kind: "wedding_rsvp_reminder_approval",
      contract_version: 1,
      approval_id: approvalId,
      draft_id: candidate.id,
      household_id: candidate.householdId,
      recipient_labels: candidate.recipientLabels,
      contact_labels: candidate.contactLabels,
      invitation_ids: candidate.invitationIds,
      exact_content: candidate.exactContent,
      channel: "email",
      approval_status: "approved",
      sends_message: false,
      created_at: nowIso,
    },
    metadata: {
      template: "wedding_planning",
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      origin: "wedding_rsvp_reminder",
      approval_status: "approved",
      sends_message: false,
      provider_status: "not_submitted",
      model_calls: 0,
    },
    references: candidate.sourceReferences.map((target) => ({ type: "source", target, label: "RSVP source" })),
    supertags: ["template:wedding_planning", "wedding_rsvp:reminder_approval", "approval:recorded", "external_send:not_started"],
    store_in_relational: true,
  };
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
