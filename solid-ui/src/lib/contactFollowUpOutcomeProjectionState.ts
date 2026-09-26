// @locs-version: 1.0
import { sendAfpMessage, type SendAfpMessageInput } from "@/lib/api";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import type { Contact } from "@/lib/contactsLocalState";
import { parseJsonValue } from "@/lib/jsonParseState";

export const CONTACT_FOLLOW_UP_OUTCOME_PROJECTIONS_KEY = "omnyid.contact-follow-up-outcome-projections.v1";

export type ContactFollowUpOutcomeProjectionState = {
  outcomeMessages: SendAfpMessageInput[];
  outcomeCount: number;
  sentOutcomeCount: number;
  summaryLabel: string;
  guardrailLabels: string[];
};

export type ContactFollowUpOutcomeDispatchReceipt = {
  attemptedCount: number;
  savedCount: number;
  failedCount: number;
  summaryLabel: string;
  canRetry: boolean;
};

export type ContactFollowUpOutcomeSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeId(value: unknown): string {
  const text = clean(value).toLowerCase();
  return text.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function uniqueStrings(values: readonly unknown[], limit = 64): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function storageKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(CONTACT_FOLLOW_UP_OUTCOME_PROJECTIONS_KEY, userId);
}

function loadSentIds(storage: Storage | null | undefined, userId: string | null | undefined): Set<string> {
  if (!storage) return new Set();
  try {
    const parsed = parseJsonValue(storage.getItem(storageKey(userId)) ?? "[]");
    if (!parsed.ok || !Array.isArray(parsed.value)) return new Set();
    return new Set(parsed.value.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
  } catch {
    return new Set();
  }
}

function saveSentIds(ids: Set<string>, storage: Storage | null | undefined, userId: string | null | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(userId), JSON.stringify([...ids].sort()));
  } catch {
    // Ignore local marker persistence failures.
  }
}

export function contactFollowUpOutcomeProjectionId(contact: Contact): string {
  return `contact_follow_up_outcome:${safeId(contact.id)}:${safeId(contact.followUpOutcomeAt ?? "no-time")}:${safeId(contact.followUpOutcome ?? "none")}`;
}

export function hasSentContactFollowUpOutcomeProjection(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): boolean {
  return loadSentIds(storage, userId).has(projectionId);
}

export function markContactFollowUpOutcomeProjectionSent(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): void {
  const ids = loadSentIds(storage, userId);
  ids.add(projectionId);
  saveSentIds(ids, storage, userId);
}

function outcomeReady(contact: Contact): boolean {
  return Boolean(clean(contact.followUpOutcome) && clean(contact.followUpOutcomeAt));
}

function outcomeLabel(outcome: string): string {
  if (outcome === "called") return "Called instead of sending another follow-up";
  if (outcome === "move_on") return "Moved on to other options";
  if (outcome === "unresponsive") return "Marked unresponsive";
  return "Follow-up outcome recorded";
}

export function buildContactFollowUpOutcomeProjectionState(input: {
  contacts?: readonly Contact[] | null;
  nowIso?: string | null;
  storage?: Storage | null;
  userId?: string | null;
} = {}): ContactFollowUpOutcomeProjectionState {
  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const sentIds = loadSentIds(input.storage, input.userId);
  let sentOutcomeCount = 0;
  const outcomeMessages = (input.contacts ?? []).flatMap((contact): SendAfpMessageInput[] => {
    if (!outcomeReady(contact)) return [];
    const projectionId = contactFollowUpOutcomeProjectionId(contact);
    if (sentIds.has(projectionId)) {
      sentOutcomeCount += 1;
      return [];
    }
    const outcome = clean(contact.followUpOutcome);
    const outcomeAt = clean(contact.followUpOutcomeAt) || nowIso;
    const note = clean(contact.followUpOutcomeNote) || outcomeLabel(outcome);
    const searchableTerms = uniqueStrings([
      projectionId,
      contact.id,
      contact.name,
      contact.email,
      contact.phone,
      contact.relationshipKind,
      outcome,
      note,
      outcomeAt,
      "contact follow-up outcome",
      "closed without response",
      "second order loop",
    ]);
    return [{
      thread_id: `contact_follow_up_outcome:${safeId(contact.id)}`,
      from: "system://contacts",
      to: ["agent://contacts", "agent://search", "agent://knowledge-graph", "agent://decision-os"],
      timestamp: nowIso,
      type: "note",
      kind: "note",
      subtype: "contact_follow_up_outcome_evidence",
      content: {
        kind: "contact_follow_up_outcome_evidence",
        projection_id: projectionId,
        contact_id: contact.id,
        contact_name: contact.name,
        relationship_kind: contact.relationshipKind,
        follow_up_outcome: outcome,
        follow_up_outcome_at: outcomeAt,
        follow_up_outcome_note: note,
        follow_up_status: "closed_without_response",
        privacy_note: "User-entered follow-up decision; no external send implied.",
      },
      views: [
        {
          format: "search_result",
          content: {
            title: `Follow-up outcome: ${contact.name}`,
            excerpt: `${outcomeLabel(outcome)}. ${note}`,
            source: "Contacts",
            timestamp: outcomeAt,
          },
        },
      ],
      attachments: [],
      references: [
        { kind: "contact", id: contact.id, label: contact.name },
      ],
      metadata: {
        origin: "contacts",
        projection: "contact_follow_up_outcome_to_evidence_note",
        projection_id: projectionId,
        contact_id: contact.id,
        relationship_kind: contact.relationshipKind,
        follow_up_outcome: outcome,
        follow_up_outcome_at: outcomeAt,
        closes_second_order_loop: "contact_follow_up",
        no_external_send: true,
        searchable_terms: searchableTerms,
      },
      store_in_relational: true,
    }];
  });

  return {
    outcomeMessages,
    outcomeCount: outcomeMessages.length,
    sentOutcomeCount,
    summaryLabel: outcomeMessages.length > 0
      ? `${outcomeMessages.length} follow-up outcome note${outcomeMessages.length === 1 ? "" : "s"} ready`
      : sentOutcomeCount > 0 ? "All follow-up outcome notes are already saved" : "No follow-up outcome notes are ready",
    guardrailLabels: [
      "Outcome evidence comes from explicit user action only.",
      "Saving outcome evidence does not send or trigger external messages.",
      "DecisionOS can stop chasing closed contacts and suggest alternatives.",
    ],
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function successFromResponse(value: unknown): boolean {
  const success = record(value).success;
  return success === undefined ? true : success === true;
}

export async function runContactFollowUpOutcomeDispatch(input: {
  projection: ContactFollowUpOutcomeProjectionState;
  save?: ContactFollowUpOutcomeSaveFn | null;
  storage?: Storage | null;
  userId?: string | null;
}): Promise<ContactFollowUpOutcomeDispatchReceipt> {
  const save = input.save ?? sendAfpMessage;
  const storage = input.storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  let savedCount = 0;
  let failedCount = 0;
  for (const message of input.projection.outcomeMessages) {
    try {
      const response = await save(message);
      if (successFromResponse(response)) {
        const projectionId = clean(record(message.metadata).projection_id);
        if (projectionId) markContactFollowUpOutcomeProjectionSent(projectionId, storage, input.userId);
        savedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }
  return {
    attemptedCount: input.projection.outcomeMessages.length,
    savedCount,
    failedCount,
    summaryLabel: failedCount > 0
      ? `${savedCount} follow-up outcome note${savedCount === 1 ? "" : "s"} saved, ${failedCount} failed`
      : savedCount > 0 ? `${savedCount} follow-up outcome note${savedCount === 1 ? "" : "s"} saved` : "No follow-up outcome notes to save",
    canRetry: failedCount > 0,
  };
}
