// @locs-version: 1.0
import type { Contact } from "@/lib/contactsLocalState";
import { defaultResponseQueuePolicy, type ResponseQueuePolicy } from "@/lib/responseQueuePolicy";

export type ContactEngagementStatus =
  | "not_contacted"
  | "awaiting_response"
  | "follow_up_due"
  | "response_recorded"
  | "closed_without_response";

export type ContactEngagementState = {
  status: ContactEngagementStatus;
  statusLabel: string;
  detailLabel: string;
  lastContactedLabel: string | null;
  followUpDueAt: string | null;
  hoursSinceContact: number | null;
  contactedByLabel: "user" | "agent" | null;
  responseSummaryVisible: boolean;
  responseSummaryLabel: string | null;
  responseRecordedLabel: string | null;
  followUpOutcomeLabel: string | null;
};

function relationshipSlaHours(contact: Contact, policy: ResponseQueuePolicy): number {
  if (typeof contact.responseSlaHours === "number" && Number.isFinite(contact.responseSlaHours) && contact.responseSlaHours > 0) {
    return contact.responseSlaHours;
  }
  if (contact.relationshipKind === "supplier") return policy.supplier_due_hours;
  if (contact.relationshipKind === "friend") return policy.friend_due_hours;
  if (contact.relationshipKind === "client") return Math.min(policy.general_due_hours, 24);
  if (contact.relationshipKind === "team") return Math.min(policy.general_due_hours, 12);
  return policy.general_due_hours;
}

function dateFrom(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function outcomeLabel(contact: Contact): string | null {
  const date = dateFrom(contact.followUpOutcomeAt);
  const suffix = date ? ` on ${formatDate(date)}` : "";
  if (contact.followUpOutcome === "called") return `Call logged${suffix}`;
  if (contact.followUpOutcome === "move_on") return `Moved on${suffix}`;
  if (contact.followUpOutcome === "unresponsive") return `Marked unresponsive${suffix}`;
  return null;
}

export function buildContactEngagementState(input: {
  contact: Contact;
  now?: Date | string | null;
  policy?: ResponseQueuePolicy | null;
}): ContactEngagementState {
  const policy = input.policy ?? defaultResponseQueuePolicy();
  const contactedAt = dateFrom(input.contact.lastContactedAt);
  const now = input.now ? new Date(input.now) : new Date();
  const validNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const contactedByLabel = input.contact.lastContactedBy ?? null;
  const respondedAt = dateFrom(input.contact.lastResponseAt);
  const responseSummary = input.contact.responseSummaryEnabled && input.contact.lastResponseSummary
    ? input.contact.lastResponseSummary
    : null;
  const responseSource = input.contact.lastResponseSource ?? "user";
  const responseRecordedLabel = responseSummary
    ? `Response recorded by ${responseSource} ${respondedAt ? `on ${formatDate(respondedAt)}` : "without timestamp"}`
    : null;
  const followUpOutcomeLabel = outcomeLabel(input.contact);

  if (!contactedAt) {
    return {
      status: "not_contacted",
      statusLabel: "Not contacted",
      detailLabel: "No outreach evidence is saved for this contact yet.",
      lastContactedLabel: null,
      followUpDueAt: null,
      hoursSinceContact: null,
      contactedByLabel,
      responseSummaryVisible: Boolean(responseSummary),
      responseSummaryLabel: responseSummary,
      responseRecordedLabel,
      followUpOutcomeLabel,
    };
  }

  const hoursSinceContact = Math.max(0, Math.floor((validNow.getTime() - contactedAt.getTime()) / 3_600_000));
  const slaHours = relationshipSlaHours(input.contact, policy);
  const followUpDue = new Date(contactedAt.getTime() + slaHours * 3_600_000);
  const hasResponse = Boolean(responseSummary);
  const hasClosedOutcome = Boolean(followUpOutcomeLabel);
  const status: ContactEngagementStatus = hasResponse
    ? "response_recorded"
    : hasClosedOutcome ? "closed_without_response"
    : validNow.getTime() >= followUpDue.getTime() ? "follow_up_due" : "awaiting_response";
  const statusLabel = status === "response_recorded"
    ? "Response recorded"
    : status === "closed_without_response" ? "Closed"
      : status === "follow_up_due" ? "Follow-up due" : "Awaiting response";
  const detailLabel = status === "response_recorded"
    ? `${responseRecordedLabel ?? "A response summary is saved"}; continue from the reply instead of sending another generic follow-up.`
    : status === "closed_without_response"
      ? `${followUpOutcomeLabel ?? "Follow-up closed"}; do not keep chasing unless the user reopens this contact.`
    : status === "follow_up_due"
      ? `No response summary is saved ${hoursSinceContact}h after contact; review before sending a follow-up.`
      : `Contacted ${hoursSinceContact}h ago; follow-up due after ${slaHours}h if no response is recorded.`;

  return {
    status,
    statusLabel,
    detailLabel,
    lastContactedLabel: `Last contacted by ${contactedByLabel ?? "user"} on ${formatDate(contactedAt)}`,
    followUpDueAt: followUpDue.toISOString(),
    hoursSinceContact,
    contactedByLabel,
    responseSummaryVisible: Boolean(responseSummary),
    responseSummaryLabel: responseSummary,
    responseRecordedLabel,
    followUpOutcomeLabel,
  };
}
