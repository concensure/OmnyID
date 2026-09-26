// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export type PriorityEmail = {
  id: string;
  sender: string;
  subject: string;
  preview: string;
};

export type DraftReply = {
  email_id: string;
  to: string;
  subject: string;
  body: string;
};

export type InboxSummary = {
  total_unread: number;
  needs_reply: number;
  newsletters: number;
  priority_emails: PriorityEmail[];
  draft: DraftReply | null;
};

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function nonNegativeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function normalizePriorityEmail(value: unknown): PriorityEmail | null {
  if (!isRecord(value)) return null;
  const id = scalarString(value.id);
  if (!id) return null;
  return {
    id,
    sender: scalarString(value.sender, "Unknown sender"),
    subject: scalarString(value.subject, "No subject"),
    preview: scalarString(value.preview),
  };
}

export function normalizeDraftReply(value: unknown): DraftReply | null {
  if (!isRecord(value)) return null;
  const emailId = scalarString(value.email_id);
  const body = scalarString(value.body);
  if (!emailId || !body) return null;
  return {
    email_id: emailId,
    to: scalarString(value.to, "Unknown recipient"),
    subject: scalarString(value.subject, "Re:"),
    body,
  };
}

export function normalizeInboxSummary(value: unknown): InboxSummary {
  const record = isRecord(value) ? value : {};
  return {
    total_unread: nonNegativeCount(record.total_unread),
    needs_reply: nonNegativeCount(record.needs_reply),
    newsletters: nonNegativeCount(record.newsletters),
    priority_emails: Array.isArray(record.priority_emails)
      ? record.priority_emails.map(normalizePriorityEmail).filter((email): email is PriorityEmail => Boolean(email))
      : [],
    draft: normalizeDraftReply(record.draft),
  };
}
