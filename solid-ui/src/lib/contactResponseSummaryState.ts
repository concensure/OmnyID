// @locs-version: 1.0
import type { Contact } from "@/lib/contactsLocalState";

export type ContactResponseSummaryResult = {
  contacts: Contact[];
  updated: boolean;
  summaryLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function applyContactResponseSummary(input: {
  contacts?: readonly Contact[] | null;
  contactId?: string | null;
  summary?: string | null;
  respondedAt?: string | Date | null;
  source?: "user" | "agent" | "imported" | null;
}): ContactResponseSummaryResult {
  const contacts = [...(input.contacts ?? [])];
  const contactId = clean(input.contactId);
  const summary = clean(input.summary);
  const responseDate = input.respondedAt ? new Date(input.respondedAt) : new Date();
  const lastResponseAt = Number.isNaN(responseDate.getTime())
    ? new Date().toISOString()
    : responseDate.toISOString();
  const lastResponseSource = input.source ?? "user";
  if (!contactId || !summary) {
    return {
      contacts,
      updated: false,
      summaryLabel: "A contact and response summary are required.",
    };
  }

  let updated = false;
  const next = contacts.map((contact) => {
    if (contact.id !== contactId) return contact;
    updated = true;
    return {
      ...contact,
      lastResponseAt,
      lastResponseSource,
      lastResponseSummary: summary,
      responseSummaryEnabled: true,
    };
  });

  return {
    contacts: next,
    updated,
    summaryLabel: updated
      ? "Response summary saved; the contact now counts as replied."
      : "Contact was not found.",
  };
}
