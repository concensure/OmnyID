import type { Contact } from "@/lib/contactsLocalState";

export type WeddingSharedContactFieldSelection = {
  email: boolean;
  phone: boolean;
  relationship: boolean;
  roles: boolean;
};

export type WeddingSharedContactDraft = {
  contactRef: string;
  contact: {
    name: string;
    email?: string;
    phone?: string;
    relationshipKind?: string;
    roles?: string[];
  };
  includedFieldLabels: string[];
  privateFieldLabels: string[];
};

export const DEFAULT_WEDDING_SHARED_CONTACT_FIELDS: WeddingSharedContactFieldSelection = {
  email: true,
  phone: true,
  relationship: true,
  roles: true,
};

function clean(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function uniqueLabels(values: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of (values ?? []).map(clean).filter((item): item is string => Boolean(item))) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function buildWeddingSharedContactDraft(
  contact: Contact,
  fields: WeddingSharedContactFieldSelection,
): WeddingSharedContactDraft | null {
  const name = clean(contact.name);
  const contactRef = clean(contact.id);
  if (!name || !contactRef) return null;

  const email = fields.email ? clean(contact.email) : undefined;
  const phone = fields.phone ? clean(contact.phone) : undefined;
  const relationshipKind = fields.relationship ? clean(contact.relationshipKind) : undefined;
  const roles = fields.roles ? uniqueLabels(contact.roles) : [];
  const includedFieldLabels = [
    "Name",
    email ? "Email" : null,
    phone ? "Phone" : null,
    relationshipKind ? "Relationship" : null,
    roles.length > 0 ? "Roles" : null,
  ].filter((value): value is string => Boolean(value));
  const privateFieldLabels = [
    contact.email && !email ? "Email" : null,
    contact.phone && !phone ? "Phone" : null,
    contact.relationshipKind && !relationshipKind ? "Relationship" : null,
    (contact.roles?.length ?? 0) > 0 && roles.length === 0 ? "Roles" : null,
    contact.notes ? "Notes" : null,
    contact.agentId ? "Agent ID" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    contactRef,
    contact: {
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(relationshipKind ? { relationshipKind } : {}),
      ...(roles.length > 0 ? { roles } : {}),
    },
    includedFieldLabels,
    privateFieldLabels,
  };
}

export function buildWeddingSharedContactDrafts(
  contacts: Contact[],
  selectedContactIds: string[],
  fields: WeddingSharedContactFieldSelection,
): WeddingSharedContactDraft[] {
  const selected = new Set(selectedContactIds);
  return contacts
    .filter((contact) => selected.has(contact.id))
    .map((contact) => buildWeddingSharedContactDraft(contact, fields))
    .filter((draft): draft is WeddingSharedContactDraft => draft !== null);
}
