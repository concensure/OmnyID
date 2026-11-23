// @locs-version: 1.0
import { sendAfpMessage, type SendAfpMessageInput } from "@/lib/api";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import {
  buildContactOutreachHealthState,
  type ContactOutreachHealthState,
} from "@/lib/contactOutreachHealthState";
import type { Contact } from "@/lib/contactsLocalState";
import { parseJsonValue } from "@/lib/jsonParseState";

export const CONTACT_OUTREACH_HEALTH_PROJECTIONS_KEY = "omnyid.contact-outreach-health-projections.v1";

export type ContactOutreachHealthProjectionState = {
  messages: SendAfpMessageInput[];
  snapshotCount: number;
  sentSnapshotCount: number;
  summaryLabel: string;
  guardrailLabels: string[];
};

export type ContactOutreachHealthDispatchReceipt = {
  attemptedCount: number;
  savedCount: number;
  failedCount: number;
  summaryLabel: string;
  canRetry: boolean;
};

export type ContactOutreachHealthSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;

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
  return accountScopedStorageKey(CONTACT_OUTREACH_HEALTH_PROJECTIONS_KEY, userId);
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

export function contactOutreachHealthProjectionId(health: ContactOutreachHealthState): string {
  return [
    "contact_outreach_health",
    health.status,
    health.contactCount,
    health.notContactedCount,
    health.awaitingCount,
    health.dueCount,
    health.responseRecordedCount,
    health.taskReadyCount,
    health.evidenceReadyCount,
  ].map(safeId).join(":");
}

export function hasSentContactOutreachHealthProjection(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): boolean {
  return loadSentIds(storage, userId).has(projectionId);
}

export function markContactOutreachHealthProjectionSent(
  projectionId: string,
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
  userId?: string | null,
): void {
  const ids = loadSentIds(storage, userId);
  ids.add(projectionId);
  saveSentIds(ids, storage, userId);
}

export function buildContactOutreachHealthProjectionState(input: {
  health?: ContactOutreachHealthState | null;
  contacts?: readonly Contact[] | null;
  nowIso?: string | null;
  storage?: Storage | null;
  userId?: string | null;
} = {}): ContactOutreachHealthProjectionState {
  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const health = input.health ?? buildContactOutreachHealthState({
    contacts: input.contacts,
    storage: input.storage,
    userId: input.userId,
  });
  if (health.contactCount === 0) {
    return {
      messages: [],
      snapshotCount: 0,
      sentSnapshotCount: 0,
      summaryLabel: "No outreach health snapshot is ready until contacts exist",
      guardrailLabels: ["Add or import contacts before saving outreach health."],
    };
  }

  const sentIds = loadSentIds(input.storage, input.userId);
  const projectionId = contactOutreachHealthProjectionId(health);
  if (sentIds.has(projectionId)) {
    return {
      messages: [],
      snapshotCount: 0,
      sentSnapshotCount: 1,
      summaryLabel: "Current outreach health snapshot is already saved",
      guardrailLabels: ["The saved marker is local and account-scoped."],
    };
  }

  const searchableTerms = uniqueStrings([
    projectionId,
    health.status,
    health.summaryLabel,
    health.nextActionLabel,
    ...health.metricLabels,
    "contact outreach health",
    "contact follow-up loop",
    "decisionos",
    "no external send",
  ]);

  return {
    messages: [{
      thread_id: `contact_outreach_health:${safeId(health.status)}`,
      from: "system://contacts",
      to: ["agent://contacts", "agent://search", "agent://knowledge-graph", "agent://decision-os"],
      timestamp: nowIso,
      type: "note",
      kind: "note",
      subtype: "contact_outreach_health_snapshot",
      content: {
        kind: "contact_outreach_health_snapshot",
        projection_id: projectionId,
        status: health.status,
        summary: health.summaryLabel,
        next_action: health.nextActionLabel,
        metrics: {
          contacts: health.contactCount,
          untouched: health.notContactedCount,
          awaiting: health.awaitingCount,
          due: health.dueCount,
          replied: health.responseRecordedCount,
          task_ready: health.taskReadyCount,
          evidence_ready: health.evidenceReadyCount,
          saved_tasks: health.savedTaskCount,
          saved_evidence: health.savedEvidenceCount,
        },
        metric_labels: health.metricLabels,
        no_external_send: true,
      },
      views: [
        {
          format: "search_result",
          content: {
            title: `Contact outreach: ${health.summaryLabel}`,
            excerpt: health.nextActionLabel,
            source: "Contacts",
            timestamp: nowIso,
          },
        },
      ],
      attachments: [],
      references: [],
      metadata: {
        origin: "contacts",
        projection: "contact_outreach_health_to_evidence_note",
        projection_id: projectionId,
        outreach_health_status: health.status,
        no_external_send: true,
        searchable_terms: searchableTerms,
      },
      store_in_relational: true,
    }],
    snapshotCount: 1,
    sentSnapshotCount: 0,
    summaryLabel: "Outreach health snapshot ready",
    guardrailLabels: [
      "This saves internal loop-health evidence only.",
      "It does not contact vendors, guests, helpers, or family.",
      "DecisionOS can use this snapshot to rank contact work alongside other daily obligations.",
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

export async function runContactOutreachHealthDispatch(input: {
  projection: ContactOutreachHealthProjectionState;
  save?: ContactOutreachHealthSaveFn | null;
  storage?: Storage | null;
  userId?: string | null;
}): Promise<ContactOutreachHealthDispatchReceipt> {
  const save = input.save ?? sendAfpMessage;
  const storage = input.storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  let savedCount = 0;
  let failedCount = 0;
  for (const message of input.projection.messages) {
    try {
      const response = await save(message);
      if (successFromResponse(response)) {
        const projectionId = clean(record(message.metadata).projection_id);
        if (projectionId) markContactOutreachHealthProjectionSent(projectionId, storage, input.userId);
        savedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }
  return {
    attemptedCount: input.projection.messages.length,
    savedCount,
    failedCount,
    summaryLabel: failedCount > 0
      ? `${savedCount} outreach health snapshot${savedCount === 1 ? "" : "s"} saved, ${failedCount} failed`
      : savedCount > 0 ? `${savedCount} outreach health snapshot${savedCount === 1 ? "" : "s"} saved` : "No outreach health snapshots to save",
    canRetry: failedCount > 0,
  };
}
