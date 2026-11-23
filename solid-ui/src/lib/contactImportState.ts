// @locs-version: 1.0
import type { Contact } from "@/lib/contactsLocalState";
import { buildContactIdentityKeys, findDuplicateContact } from "@/lib/contactManagementState";
import { addContactRole } from "@/lib/contactRoleState";
import type { ResponseQueueRelationship } from "@/lib/responseQueuePolicy";

export type ContactImportSource = "gmail" | "contact_file" | "ai_file";

export type ContactImportInput = {
  source: ContactImportSource;
  text?: string | null;
  defaultRelationshipKind?: ResponseQueueRelationship | null;
  defaultRoles?: readonly string[] | null;
  existingContacts?: readonly Contact[] | null;
};

export type ContactImportCandidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  relationshipKind: ResponseQueueRelationship;
  source: ContactImportSource;
  confidence: "high" | "medium" | "needs_ai";
  duplicateOfContactId: string | null;
  contact: Contact | null;
};

export type ContactImportState = {
  title: string;
  detail: string;
  candidates: ContactImportCandidate[];
  importableContacts: Contact[];
  blockerLabels: string[];
  aiHandoffRequired: boolean;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function relationship(value: unknown): ResponseQueueRelationship {
  return value === "supplier" || value === "client" || value === "team" || value === "friend" || value === "other"
    ? value
    : "other";
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contact";
}

function normalizePhone(value: string | null): string | null {
  return value?.replace(/\s+/g, " ").trim() ?? null;
}

function labelForSource(source: ContactImportSource): string {
  if (source === "gmail") return "Gmail contact import";
  if (source === "contact_file") return "Contact file import";
  return "AI-assisted contact extraction";
}

function inferName(line: string, email: string | null, phone: string | null): string | null {
  const withoutEmail = email ? line.replace(email, " ") : line;
  const withoutPhone = phone ? withoutEmail.replace(phone, " ") : withoutEmail;
  const cleaned = withoutPhone
    .replace(/^BEGIN:VCARD|^END:VCARD|^FN:|^N:/i, " ")
    .replace(/["<>]/g, " ")
    .replace(/[;,|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && /[a-z]/i.test(cleaned)) return cleaned.slice(0, 80);
  if (email) return email.split("@")[0].replace(/[._-]+/g, " ");
  return null;
}

export function buildContactImportState(input: ContactImportInput): ContactImportState {
  const source = input.source;
  const text = clean(input.text) ?? "";
  const defaultRelationshipKind = relationship(input.defaultRelationshipKind);
  const defaultRoles = (input.defaultRoles ?? []).reduce<string[]>((roles, role) => addContactRole(roles, role), []);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sourceBlocks = source === "ai_file" && !/[,@]|\bTEL\b|\bEMAIL\b/i.test(text)
    ? []
    : lines.length > 0 ? lines : text ? [text] : [];
  const seen = new Set<string>();
  const candidates = sourceBlocks.flatMap((line, index): ContactImportCandidate[] => {
    const emails = line.match(EMAIL_RE) ?? [];
    const phones = line.match(PHONE_RE) ?? [];
    const pairs = emails.length > 0 ? emails : phones.length > 0 ? [null] : [];
    return pairs.map((emailValue, pairIndex) => {
      const email = clean(emailValue);
      const phone = normalizePhone(phones[pairIndex] ?? phones[0] ?? null);
      const name = inferName(line, email, phone);
      if (!name || (!email && !phone)) return null;
      const dedupeKeys = buildContactIdentityKeys({ name, email: email ?? undefined, phone: phone ?? undefined });
      if (dedupeKeys.some((key) => seen.has(key))) return null;
      dedupeKeys.forEach((key) => seen.add(key));
      const duplicate = findDuplicateContact([...(input.existingContacts ?? [])], {
        name,
        email: email ?? undefined,
        phone: phone ?? undefined,
      });
      const duplicateOfContactId = duplicate?.contact.id ?? null;
      const id = `import:${source}:${safeId(email ?? phone ?? name)}:${index}`;
      const confidence: ContactImportCandidate["confidence"] = email ? "high" : source === "ai_file" ? "needs_ai" : "medium";
      const contact: Contact | null = duplicateOfContactId
        ? null
        : {
          id: `contact:${source}:${safeId(email ?? phone ?? name)}`,
          name,
          relationshipKind: defaultRelationshipKind,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(defaultRoles.length > 0 ? { roles: defaultRoles } : {}),
          notes: `Imported from ${labelForSource(source)}.`,
        };
      return {
        id,
        name,
        email,
        phone,
        relationshipKind: defaultRelationshipKind,
        source,
        confidence,
        duplicateOfContactId,
        contact,
      };
    }).filter((candidate): candidate is ContactImportCandidate => candidate !== null);
  });
  const importableContacts = candidates.map((candidate) => candidate.contact).filter((contact): contact is Contact => contact !== null);
  const aiHandoffRequired = source === "ai_file" && (text.length > 0 && candidates.length === 0);
  return {
    title: labelForSource(source),
    detail: source === "gmail"
      ? "Use Gmail/Google Contacts export or connected Gmail evidence to add vendor, guest, and collaborator contacts."
      : source === "contact_file"
        ? "Paste or upload CSV, vCard, spreadsheet-export text, or a contact list with names, emails, and phone numbers."
        : "For arbitrary PDFs, screenshots, or messy files, local parsing extracts obvious contacts and queues the rest for AI extraction.",
    candidates,
    importableContacts,
    blockerLabels: [
      text ? null : "Paste contact text or upload a contact file first.",
      aiHandoffRequired ? "This file needs AI extraction before contacts can be trusted." : null,
      candidates.some((candidate) => candidate.duplicateOfContactId) ? "Duplicate contacts were detected and skipped." : null,
    ].filter((label): label is string => Boolean(label)),
    aiHandoffRequired,
  };
}
