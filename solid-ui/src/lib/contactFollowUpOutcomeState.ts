// @locs-version: 1.0
import type { Contact } from "@/lib/contactsLocalState";

export type ContactFollowUpOutcome = "called" | "move_on" | "unresponsive";

export type ContactFollowUpOutcomeResult = {
  contacts: Contact[];
  updated: boolean;
  summaryLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function outcomeLabel(outcome: ContactFollowUpOutcome): string {
  if (outcome === "called") return "Call logged";
  if (outcome === "move_on") return "Moved on";
  return "Marked unresponsive";
}

export function applyContactFollowUpOutcome(input: {
  contacts?: readonly Contact[] | null;
  contactId?: string | null;
  outcome?: ContactFollowUpOutcome | null;
  note?: string | null;
  decidedAt?: string | Date | null;
}): ContactFollowUpOutcomeResult {
  const contacts = [...(input.contacts ?? [])];
  const contactId = clean(input.contactId);
  const outcome = input.outcome ?? null;
  const decidedDate = input.decidedAt ? new Date(input.decidedAt) : new Date();
  const followUpOutcomeAt = Number.isNaN(decidedDate.getTime())
    ? new Date().toISOString()
    : decidedDate.toISOString();
  if (!contactId || !outcome) {
    return {
      contacts,
      updated: false,
      summaryLabel: "A contact and follow-up outcome are required.",
    };
  }

  let updated = false;
  const note = clean(input.note) || outcomeLabel(outcome);
  const next = contacts.map((contact) => {
    if (contact.id !== contactId) return contact;
    updated = true;
    return {
      ...contact,
      followUpOutcome: outcome,
      followUpOutcomeAt,
      followUpOutcomeNote: note,
    };
  });

  return {
    contacts: next,
    updated,
    summaryLabel: updated
      ? `${outcomeLabel(outcome)}; this contact is removed from generic follow-up chasing.`
      : "Contact was not found.",
  };
}
