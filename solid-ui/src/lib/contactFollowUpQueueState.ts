// @locs-version: 1.0
import type { Contact } from "@/lib/contactsLocalState";
import {
  buildContactEngagementState,
  type ContactEngagementState,
} from "@/lib/contactEngagementState";
import type { ResponseQueuePolicy } from "@/lib/responseQueuePolicy";

export type ContactFollowUpQueueItem = {
  id: string;
  contactId: string;
  title: string;
  priority: "urgent" | "high" | "normal";
  escalationStage: "follow_up_due" | "escalate_to_user" | "mark_unresponsive";
  escalationLabel: string;
  relationshipKind: Contact["relationshipKind"];
  contactedBy: "user" | "agent" | null;
  dueAt: string | null;
  statusLabel: string;
  reasonLabel: string;
  evidenceLabels: string[];
};

export type ContactFollowUpQueueState = {
  items: ContactFollowUpQueueItem[];
  dueCount: number;
  awaitingCount: number;
  responseRecordedCount: number;
  summaryLabel: string;
  nextActionLabel: string;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function priorityFor(contact: Contact, engagement: ContactEngagementState): ContactFollowUpQueueItem["priority"] {
  if (engagement.status !== "follow_up_due") return "normal";
  if (contact.relationshipKind === "supplier" || contact.relationshipKind === "client") return "urgent";
  if (contact.relationshipKind === "team") return "high";
  return "normal";
}

function taskTitle(contact: Contact): string {
  if (contact.relationshipKind === "supplier") return `Follow up with supplier: ${contact.name}`;
  if (contact.relationshipKind === "client") return `Follow up with client: ${contact.name}`;
  return `Follow up with ${contact.name}`;
}

function escalationStage(engagement: ContactEngagementState): ContactFollowUpQueueItem["escalationStage"] {
  const hours = engagement.hoursSinceContact ?? 0;
  if (hours >= 240) return "mark_unresponsive";
  if (hours >= 168) return "escalate_to_user";
  return "follow_up_due";
}

function escalationLabel(stage: ContactFollowUpQueueItem["escalationStage"]): string {
  if (stage === "mark_unresponsive") return "Day 10: mark unresponsive or choose alternatives";
  if (stage === "escalate_to_user") return "Day 7: escalate to user for decision";
  return "Day 5: one follow-up due";
}

export function buildContactFollowUpQueueState(input: {
  contacts?: readonly Contact[] | null;
  now?: Date | string | null;
  policy?: ResponseQueuePolicy | null;
} = {}): ContactFollowUpQueueState {
  const rows = (input.contacts ?? []).map((contact) => ({
    contact,
    engagement: buildContactEngagementState({ contact, now: input.now, policy: input.policy }),
  }));
  const dueRows = rows.filter((row) => row.engagement.status === "follow_up_due");
  const items = dueRows.map(({ contact, engagement }): ContactFollowUpQueueItem => ({
    id: `contact-follow-up:${contact.id}`,
    contactId: contact.id,
    title: taskTitle(contact),
    priority: priorityFor(contact, engagement),
    escalationStage: escalationStage(engagement),
    escalationLabel: escalationLabel(escalationStage(engagement)),
    relationshipKind: contact.relationshipKind,
    contactedBy: contact.lastContactedBy ?? null,
    dueAt: engagement.followUpDueAt,
    statusLabel: engagement.statusLabel,
    reasonLabel: engagement.detailLabel,
    evidenceLabels: [
      engagement.lastContactedLabel,
      escalationLabel(escalationStage(engagement)),
      engagement.contactedByLabel ? `contacted by ${engagement.contactedByLabel}` : null,
      clean(contact.email) ? `email: ${contact.email}` : null,
      clean(contact.phone) ? `phone: ${contact.phone}` : null,
      clean(contact.notes),
    ].filter((label): label is string => Boolean(label)).slice(0, 6),
  })).sort((left, right) => {
    const priorityRank = { urgent: 0, high: 1, normal: 2 };
    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }
    return (left.dueAt ?? "").localeCompare(right.dueAt ?? "") || left.title.localeCompare(right.title);
  });
  const awaitingCount = rows.filter((row) => row.engagement.status === "awaiting_response").length;
  const responseRecordedCount = rows.filter((row) => row.engagement.status === "response_recorded").length;
  const dueCount = items.length;
  return {
    items,
    dueCount,
    awaitingCount,
    responseRecordedCount,
    summaryLabel: dueCount > 0
      ? `${dueCount} follow-up${dueCount === 1 ? "" : "s"} due`
      : awaitingCount > 0 ? `${awaitingCount} contact${awaitingCount === 1 ? "" : "s"} awaiting response` : "No contact follow-ups due",
    nextActionLabel: dueCount > 0
      ? "Review due follow-ups before sending anything; keep the no-spam rule and user approval gate."
      : awaitingCount > 0 ? "Wait for responses or adjust the reply SLA if this contact is more urgent." : "Import contacts or mark outreach when a new conversation starts.",
  };
}
