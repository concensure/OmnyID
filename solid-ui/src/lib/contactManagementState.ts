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

export function normalizeContactNameForMatch(value: string | undefined): string {
  return normalizeLookup(value);
}

export function normalizeContactPhoneForMatch(value: string | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

export function buildContactIdentityKeys(input: ContactIdentityInput): string[] {
  const email = normalizeLookup(input.email);
  const phone = normalizeContactPhoneForMatch(input.phone);
  const name = normalizeLookup(input.name);
  return [
    email ? `email:${email}` : null,
    phone ? `phone:${phone}` : null,
    !email && !phone && name ? `name:${name}` : null,
  ].filter((key): key is string => key !== null);
}

export function findDuplicateContact(
  contacts: Contact[],
  input: ContactIdentityInput,
  excludeId?: string,
): ContactDuplicateResult | null {
  const emailKey = buildContactIdentityKeys({ name: "", email: input.email })[0] ?? "";
  const phoneKey = buildContactIdentityKeys({ name: "", phone: input.phone })[0] ?? "";
  const nameKey = buildContactIdentityKeys(input).find((key) => key.startsWith("name:")) ?? "";
  for (const contact of contacts) {
    if (contact.id === excludeId) continue;
    const contactKeys = new Set(buildContactIdentityKeys(contact));
    if (emailKey && contactKeys.has(emailKey)) return { contact, reason: "email" };
    if (phoneKey && contactKeys.has(phoneKey)) return { contact, reason: "phone" };
    if (nameKey && normalizeContactNameForMatch(contact.name) === nameKey.replace(/^name:/, "")) {
      return { contact, reason: "name" };
    }
  }
  return null;
}

export function replaceContact(contacts: Contact[], updated: Contact): Contact[] {
  return contacts.map((contact) => contact.id === updated.id ? updated : contact);
}
