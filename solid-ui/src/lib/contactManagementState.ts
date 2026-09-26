// @locs-version: 1.0
import type { Contact } from "@/lib/contactsLocalState";

export type ContactIdentityInput = {
  name: string;
  email?: string;
  phone?: string;
};

export type ContactDuplicateResult = {
  contact: Contact;
  reason: "email" | "phone" | "name";
};

function normalizeLookup(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function findDuplicateContact(
  contacts: Contact[],
  input: ContactIdentityInput,
  excludeId?: string,
): ContactDuplicateResult | null {
  const email = normalizeLookup(input.email);
  const phone = normalizeLookup(input.phone);
  const name = normalizeLookup(input.name);
  for (const contact of contacts) {
    if (contact.id === excludeId) continue;
    if (email && normalizeLookup(contact.email) === email) return { contact, reason: "email" };
    if (phone && normalizeLookup(contact.phone) === phone) return { contact, reason: "phone" };
    if (!email && !phone && name !== "" && normalizeLookup(contact.name) === name) {
      return { contact, reason: "name" };
    }
  }
  return null;
}

export function replaceContact(contacts: Contact[], updated: Contact): Contact[] {
  return contacts.map((contact) => contact.id === updated.id ? updated : contact);
}
