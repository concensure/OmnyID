// @locs-version: 1.0
import type { Contact } from "@/lib/contactsLocalState";

export type ContactRoleContext = "general" | "wedding";

export const GENERAL_CONTACT_ROLES = [
  "Family",
  "Friend",
  "Work",
  "Client",
  "Supplier",
  "Advisor",
  "Emergency contact",
  "Other",
] as const;

export const WEDDING_CONTACT_ROLES = [
  "Guest",
  "Partner",
  "Parent / family",
  "Wedding party",
  "Helper",
  "Vendor",
  "Coordinator",
  "Celebrant / officiant",
  "Venue contact",
  "Plus-one",
  "Child guest",
] as const;

const CONNECTOR_WORDS = new Set(["and", "or", "of", "the", "to", "for", "in"]);

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeContactRoleLabel(value: string): string | null {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return null;
  const known = [...WEDDING_CONTACT_ROLES, ...GENERAL_CONTACT_ROLES].find(
    (role) => normalizeSearchText(role) === normalizeSearchText(compact),
  );
  if (known) return known;
  return compact
    .split(" ")
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index > 0 && CONNECTOR_WORDS.has(lower)) return lower;
      if (part.length >= 2 && part.length <= 4 && part === part.toUpperCase()) return part;
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

export function collectContactRoleLabels(contacts: Contact[]): string[] {
  const roles = new Map<string, string>();
  contacts.forEach((contact) => {
    (contact.roles ?? []).forEach((role) => {
      const normalized = normalizeContactRoleLabel(role);
      if (normalized) roles.set(normalizeSearchText(normalized), normalized);
    });
  });
  return Array.from(roles.values()).sort((a, b) => a.localeCompare(b));
}

export function buildContactRoleOptions(input: {
  contacts?: Contact[];
  context?: ContactRoleContext;
  query?: string;
  limit?: number;
}): string[] {
  const context = input.context ?? "general";
  const query = normalizeSearchText(input.query ?? "");
  const defaults = context === "wedding"
    ? [...WEDDING_CONTACT_ROLES, ...GENERAL_CONTACT_ROLES]
    : [...GENERAL_CONTACT_ROLES, ...WEDDING_CONTACT_ROLES];
  const roleMap = new Map<string, string>();
  [...collectContactRoleLabels(input.contacts ?? []), ...defaults].forEach((role) => {
    const normalized = normalizeContactRoleLabel(role);
    if (normalized) roleMap.set(normalizeSearchText(normalized), normalized);
  });
  const all = Array.from(roleMap.values());
  const ranked = query
    ? all
        .map((role) => {
          const searchable = normalizeSearchText(role);
          const score = searchable === query ? 0
            : searchable.startsWith(query) ? 1
              : searchable.includes(query) ? 2
                : tokenOverlapScore(searchable, query);
          return { role, score };
        })
        .filter((item) => item.score < 10)
        .sort((a, b) => a.score - b.score || a.role.localeCompare(b.role))
        .map((item) => item.role)
    : all;
  return ranked.slice(0, input.limit ?? 18);
}

function tokenOverlapScore(role: string, query: string): number {
  const queryTokens = query.split(/[\s/,-]+/).filter(Boolean);
  if (queryTokens.length === 0) return 10;
  const roleTokens = role.split(/[\s/,-]+/).filter(Boolean);
  const overlap = queryTokens.filter((queryToken) => roleTokens.some((roleToken) => roleToken.startsWith(queryToken))).length;
  return overlap > 0 ? 3 + (queryTokens.length - overlap) : 10;
}

export function addContactRole(roles: string[] | undefined, role: string): string[] {
  const normalized = normalizeContactRoleLabel(role);
  if (!normalized) return roles ?? [];
  const next = new Map<string, string>();
  (roles ?? []).forEach((item) => {
    const normalizedItem = normalizeContactRoleLabel(item);
    if (normalizedItem) next.set(normalizeSearchText(normalizedItem), normalizedItem);
  });
  next.set(normalizeSearchText(normalized), normalized);
  return Array.from(next.values());
}

export function removeContactRole(roles: string[] | undefined, role: string): string[] {
  const removeKey = normalizeSearchText(role);
  return (roles ?? []).filter((item) => normalizeSearchText(item) !== removeKey);
}
