// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import type { ResponseQueueRelationship } from "@/lib/responseQueuePolicy";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  agentId?: string;
  relationshipKind: ResponseQueueRelationship;
  roles?: string[];
  responseSlaHours?: number;
  lastContactedAt?: string;
  lastContactedBy?: "user" | "agent";
  lastResponseAt?: string;
  lastResponseSource?: "user" | "agent" | "imported";
  lastResponseSummary?: string;
  responseSummaryEnabled?: boolean;
  followUpOutcome?: "called" | "move_on" | "unresponsive";
  followUpOutcomeAt?: string;
  followUpOutcomeNote?: string;
};

export const CONTACTS_KEY = "omnyid.contacts.v1";

const RESPONSE_QUEUE_RELATIONSHIPS = ["supplier", "client", "team", "friend", "other"] as const;

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeRelationship(value: unknown): ResponseQueueRelationship | null {
  return typeof value === "string" && RESPONSE_QUEUE_RELATIONSHIPS.includes(value as ResponseQueueRelationship)
    ? value as ResponseQueueRelationship
    : null;
}

function normalizeRoles(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const roles = value
    .filter((role): role is string => typeof role === "string")
    .map((role) => role.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const unique = Array.from(new Set(roles));
  return unique.length > 0 ? unique : undefined;
}

function normalizeResponseSlaHours(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeContact(value: unknown): Contact | null {
  if (!isRecord(value)) return null;
  const id = normalizeText(value.id);
  const name = normalizeText(value.name);
  const relationshipKind = normalizeRelationship(value.relationshipKind);
  if (!id || !name || !relationshipKind) return null;
  const email = normalizeText(value.email) ?? undefined;
  const phone = normalizeText(value.phone) ?? undefined;
  const notes = normalizeText(value.notes) ?? undefined;
  const agentId = normalizeText(value.agentId) ?? undefined;
  const roles = normalizeRoles(value.roles);
  const responseSlaHours = normalizeResponseSlaHours(value.responseSlaHours);
  const lastContactedAt = normalizeText(value.lastContactedAt) ?? undefined;
  const lastContactedBy = value.lastContactedBy === "user" || value.lastContactedBy === "agent"
    ? value.lastContactedBy
    : undefined;
  const lastResponseAt = normalizeText(value.lastResponseAt) ?? undefined;
  const lastResponseSource = value.lastResponseSource === "user"
    || value.lastResponseSource === "agent"
    || value.lastResponseSource === "imported"
    ? value.lastResponseSource
    : undefined;
  const lastResponseSummary = normalizeText(value.lastResponseSummary) ?? undefined;
  const responseSummaryEnabled = typeof value.responseSummaryEnabled === "boolean"
    ? value.responseSummaryEnabled
    : undefined;
  const followUpOutcome = value.followUpOutcome === "called"
    || value.followUpOutcome === "move_on"
    || value.followUpOutcome === "unresponsive"
    ? value.followUpOutcome
    : undefined;
  const followUpOutcomeAt = normalizeText(value.followUpOutcomeAt) ?? undefined;
  const followUpOutcomeNote = normalizeText(value.followUpOutcomeNote) ?? undefined;
  return {
    id,
    name,
    relationshipKind,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(notes ? { notes } : {}),
    ...(agentId ? { agentId } : {}),
    ...(roles ? { roles } : {}),
    ...(responseSlaHours !== undefined ? { responseSlaHours } : {}),
    ...(lastContactedAt ? { lastContactedAt } : {}),
    ...(lastContactedBy ? { lastContactedBy } : {}),
    ...(lastResponseAt ? { lastResponseAt } : {}),
    ...(lastResponseSource ? { lastResponseSource } : {}),
    ...(lastResponseSummary ? { lastResponseSummary } : {}),
    ...(responseSummaryEnabled !== undefined ? { responseSummaryEnabled } : {}),
    ...(followUpOutcome ? { followUpOutcome } : {}),
    ...(followUpOutcomeAt ? { followUpOutcomeAt } : {}),
    ...(followUpOutcomeNote ? { followUpOutcomeNote } : {}),
  };
}

function contactsStorageKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(CONTACTS_KEY, userId);
}

function removeContactsStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures for convenience state.
  }
}

export function loadContacts(userId?: string | null): Contact[] {
  const scopedKey = contactsStorageKey(userId);
  try {
    const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(CONTACTS_KEY);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeContactsStorageValue(scopedKey);
      removeContactsStorageValue(CONTACTS_KEY);
      return [];
    }
    const normalized = Array.isArray(parsed.value)
      ? parsed.value.map(normalizeContact).filter((contact): contact is Contact => contact !== null)
      : [];
    const normalizedJson = JSON.stringify(normalized);
    if (raw !== normalizedJson || localStorage.getItem(scopedKey) !== normalizedJson) {
      localStorage.setItem(scopedKey, normalizedJson);
    }
    if (scopedKey !== CONTACTS_KEY) removeContactsStorageValue(CONTACTS_KEY);
    return normalized;
  } catch {
    removeContactsStorageValue(scopedKey);
    removeContactsStorageValue(CONTACTS_KEY);
    return [];
  }
}

export function saveContacts(contacts: Contact[], userId?: string | null) {
  const scopedKey = contactsStorageKey(userId);
  try {
    localStorage.setItem(
      scopedKey,
      JSON.stringify(
        contacts.map(normalizeContact).filter((contact): contact is Contact => contact !== null),
      ),
    );
    if (scopedKey !== CONTACTS_KEY) removeContactsStorageValue(CONTACTS_KEY);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}
