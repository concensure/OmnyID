// @locs-version: 1.0
import { sendAfpMessage, type SendAfpMessageInput } from "@/lib/api";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import type { Contact } from "@/lib/contactsLocalState";
import { parseJsonValue } from "@/lib/jsonParseState";

export const CONTACT_RESPONSE_EVIDENCE_PROJECTIONS_KEY = "omnyid.contact-response-evidence-projections.v1";

export type ContactResponseEvidenceProjectionState = {
  evidenceMessages: SendAfpMessageInput[];
  evidenceCount: number;
  sentEvidenceCount: number;
  summaryLabel: string;
  guardrailLabels: string[];
};

export type ContactResponseEvidenceDispatchReceipt = {
  attemptedCount: number;
  savedCount: number;
  failedCount: number;
  summaryLabel: string;
  canRetry: boolean;
};

export type ContactResponseEvidenceSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;

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
  return accountScopedStorageKey(CONTACT_RESPONSE_EVIDENCE_PROJECTIONS_KEY, userId);
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

export function contactResponseEvidenceProjectionId(contact: Contact): string {
  return `contact_response:${safeId(contact.id)}:${safeId(contact.lastResponseAt ?? "no-time")}`;
}

export function hasSentContactResponseEvidenceProjection(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): boolean {
  return loadSentIds(storage, userId).has(projectionId);
}

export function markContactResponseEvidenceProjectionSent(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): void {
  const ids = loadSentIds(storage, userId);
  ids.add(projectionId);
  saveSentIds(ids, storage, userId);
}

function responseReady(contact: Contact): boolean {
  return Boolean(contact.responseSummaryEnabled && clean(contact.lastResponseSummary));
}

export function buildContactResponseEvidenceProjectionState(input: {
  contacts?: readonly Contact[] | null;
  nowIso?: string | null;
  storage?: Storage | null;
  userId?: string | null;
} = {}): ContactResponseEvidenceProjectionState {
  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const sentIds = loadSentIds(input.storage, input.userId);
  let sentEvidenceCount = 0;
  const evidenceMessages = (input.contacts ?? []).flatMap((contact): SendAfpMessageInput[] => {
    if (!responseReady(contact)) return [];
    const projectionId = contactResponseEvidenceProjectionId(contact);
    if (sentIds.has(projectionId)) {
      sentEvidenceCount += 1;
      return [];
    }
    const summary = clean(contact.lastResponseSummary);
    const responseAt = clean(contact.lastResponseAt) || nowIso;
    const source = contact.lastResponseSource ?? "user";
    const searchableTerms = uniqueStrings([
      projectionId,
      contact.id,
      contact.name,
      contact.email,
      contact.phone,
      contact.relationshipKind,
      summary,
      responseAt,
      source,
      "contact response",
      "reply evidence",
      "follow-up closed",
    ]);
    return [{
      thread_id: `contact_response:${safeId(contact.id)}`,
      from: "system://contacts",
      to: ["agent://contacts", "agent://search", "agent://knowledge-graph", "agent://decision-os"],
      timestamp: nowIso,
      type: "note",
      kind: "note",
      subtype: "contact_response_evidence",
      content: {
        kind: "contact_response_evidence",
        projection_id: projectionId,
        contact_id: contact.id,
        contact_name: contact.name,
        relationship_kind: contact.relationshipKind,
        response_summary: summary,
        response_at: responseAt,
        response_source: source,
        follow_up_status: "closed_by_response_evidence",
        privacy_note: "User-entered response evidence; no inbox scraping implied.",
      },
      views: [
        {
          format: "search_result",
          content: {
            title: `Response recorded: ${contact.name}`,
            excerpt: summary,
            source: "Contacts",
            timestamp: responseAt,
          },
        },
      ],
      attachments: [],
      references: [
        { kind: "contact", id: contact.id, label: contact.name },
      ],
      metadata: {
        origin: "contacts",
        projection: "contact_response_summary_to_evidence_note",
        projection_id: projectionId,
        contact_id: contact.id,
        relationship_kind: contact.relationshipKind,
        response_at: responseAt,
        response_source: source,
        closes_second_order_loop: "contact_follow_up",
        no_inbox_scraping: true,
        searchable_terms: searchableTerms,
      },
      store_in_relational: true,
    }];
  });

  return {
    evidenceMessages,
    evidenceCount: evidenceMessages.length,
    sentEvidenceCount,
    summaryLabel: evidenceMessages.length > 0
      ? `${evidenceMessages.length} response evidence note${evidenceMessages.length === 1 ? "" : "s"} ready`
      : sentEvidenceCount > 0 ? "All response evidence notes are already saved" : "No response evidence notes are ready",
    guardrailLabels: [
      "Evidence comes from user-entered summaries or approved imports only.",
      "Saving evidence does not send any external message.",
      "Search, Knowledge Graph, Contacts, and DecisionOS can reuse the response without reading the inbox.",
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

export async function runContactResponseEvidenceDispatch(input: {
  projection: ContactResponseEvidenceProjectionState;
  save?: ContactResponseEvidenceSaveFn | null;
  storage?: Storage | null;
  userId?: string | null;
}): Promise<ContactResponseEvidenceDispatchReceipt> {
  const save = input.save ?? sendAfpMessage;
  const storage = input.storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  let savedCount = 0;
  let failedCount = 0;
  for (const message of input.projection.evidenceMessages) {
    try {
      const response = await save(message);
      if (successFromResponse(response)) {
        const projectionId = clean(record(message.metadata).projection_id);
        if (projectionId) markContactResponseEvidenceProjectionSent(projectionId, storage, input.userId);
        savedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }
  return {
    attemptedCount: input.projection.evidenceMessages.length,
    savedCount,
    failedCount,
    summaryLabel: failedCount > 0
      ? `${savedCount} response evidence note${savedCount === 1 ? "" : "s"} saved, ${failedCount} failed`
      : savedCount > 0 ? `${savedCount} response evidence note${savedCount === 1 ? "" : "s"} saved` : "No response evidence notes to save",
    canRetry: failedCount > 0,
  };
}
