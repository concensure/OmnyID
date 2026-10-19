// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingPreferenceConflictLifecycleOutcome = "resolved" | "dismissed";

export type WeddingPreferenceConflictLifecycleRecord = {
  id: string;
  conflictId: string;
  sourceMessageId: string;
  revisionFingerprint: string;
  outcome: WeddingPreferenceConflictLifecycleOutcome;
  createdAt: string;
  metadata: WeddingPlanningMetadata;
};

export type WeddingPreferenceConflictLifecycleInput = {
  conflictId: string;
  sourceMessageId: string;
  revisionFingerprint: string;
  outcome: WeddingPreferenceConflictLifecycleOutcome;
  metadata?: unknown;
  createdAt?: string | null;
};

function clean(value: unknown, limit = 600): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function uniqueStrings(values: readonly unknown[], limit = 40): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value, 180);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function lifecycleId(input: WeddingPreferenceConflictLifecycleInput, metadata: WeddingPlanningMetadata): string {
  const material = [input.conflictId, input.revisionFingerprint, input.outcome].join("|");
  return `wedding_preference_conflict_lifecycle:${safeWeddingLabel(metadata.responseWorkspaceId)}:${stableHash(material)}`;
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
  return {
    id: message.id,
    thread_id: message.thread_id,
    parent_id: message.parent_id ?? null,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

function outcomeLabel(outcome: WeddingPreferenceConflictLifecycleOutcome): string {
  return outcome === "resolved" ? "Resolved together" : "Not a conflict";
}

export function weddingPreferenceConflictLifecycleToAfpMessage(
  input: WeddingPreferenceConflictLifecycleInput,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const conflictId = clean(input.conflictId);
  const sourceMessageId = clean(input.sourceMessageId);
  const revisionFingerprint = clean(input.revisionFingerprint, 4_000);
  const timestamp = clean(input.createdAt, 64) || nowIso;
  const id = lifecycleId({ ...input, conflictId, sourceMessageId, revisionFingerprint }, metadata);
  const label = outcomeLabel(input.outcome);
  const references: AfpReference[] = [
    { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
    { type: "response_workspace", target: metadata.responseWorkspaceId, label: "Wedding workspace" },
    { type: "preference_conflict", target: conflictId, label: "Preference conflict" },
    { type: "supersedes", target: sourceMessageId, label: "Reviewed conflict revision" },
  ];
  return {
    id: `afp-${id}`,
    thread_id: `wedding_preference:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    parent_id: sourceMessageId,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph"],
    timestamp,
    type: "ledger",
    kind: "wedding_preference_conflict_lifecycle",
    subtype: "wedding_preference_conflict_lifecycle",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding",
      "wedding_conflict",
      `decision:${input.outcome}`,
      "decisionos:wedding",
    ]),
    content: {
      schema_version: "wedding.preference_conflict_lifecycle.v1",
      lifecycle_id: id,
      conflict_id: conflictId,
      source_message_id: sourceMessageId,
      revision_fingerprint: revisionFingerprint,
      outcome: input.outcome,
      outcome_label: label,
      creates_planning_rule: false,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      privacy_scope: "couple_only",
      created_at: timestamp,
    },
    metadata: {
      ...metadata,
      origin: "wedding_planning",
      projection: "wedding_preference_conflict_lifecycle_to_afp",
      lifecycle_id: id,
      conflict_id: conflictId,
      source_message_id: sourceMessageId,
      revision_fingerprint: revisionFingerprint,
      outcome: input.outcome,
      privacy_scope: "couple_only",
      e2ee_required: true,
      searchable_terms: uniqueStrings([id, conflictId, label, metadata.weddingPlanId, metadata.responseWorkspaceId]),
    },
    views: [{
      format: "a2ui",
      priority: 1,
      content: {
        schema_version: "a2ui.v1",
        kind: "wedding_preference_conflict_lifecycle",
        title: "Partner preference review",
        status: input.outcome,
        summary: label,
      },
    }],
    attachments: [],
    references,
  };
}

export function weddingPreferenceConflictLifecycleToAfpSendInput(
  input: WeddingPreferenceConflictLifecycleInput,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  return messageToSendInput(weddingPreferenceConflictLifecycleToAfpMessage(input, nowIso));
}

export function weddingPreferenceConflictLifecycleActionToAfpSendInput(
  action: WeddingWorkspaceSidebarAction,
  metadata?: unknown,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput | null {
  if (action.kind !== "record_resilience_lifecycle" || !action.enabled) return null;
  const packet = record(action.metadata?.preference_conflict_lifecycle);
  const conflictId = clean(packet?.conflict_id);
  const sourceMessageId = clean(packet?.source_message_id);
  const revisionFingerprint = clean(packet?.revision_fingerprint, 4_000);
  const outcome = packet?.outcome;
  if (!conflictId || !sourceMessageId || !revisionFingerprint || !["resolved", "dismissed"].includes(String(outcome))) return null;
  return weddingPreferenceConflictLifecycleToAfpSendInput({
    conflictId,
    sourceMessageId,
    revisionFingerprint,
    outcome: outcome as WeddingPreferenceConflictLifecycleOutcome,
    metadata,
    createdAt: nowIso,
  }, nowIso);
}

export function weddingPreferenceConflictLifecycleFromAfpMessage(
  message: AfpMessage,
): WeddingPreferenceConflictLifecycleRecord | null {
  if (message.type !== "ledger"
    || message.kind !== "wedding_preference_conflict_lifecycle"
    || message.subtype !== "wedding_preference_conflict_lifecycle") return null;
  const content = record(message.content);
  const metadataRecord = record(message.metadata);
  const conflictId = clean(content?.conflict_id);
  const sourceMessageId = clean(content?.source_message_id);
  const revisionFingerprint = clean(content?.revision_fingerprint, 4_000);
  const lifecycleRecordId = clean(content?.lifecycle_id);
  const createdAt = clean(content?.created_at, 64) || message.timestamp;
  const outcome = content?.outcome;
  const weddingPlanId = clean(content?.wedding_plan_id);
  const responseWorkspaceId = clean(content?.response_workspace_id);
  if (content?.schema_version !== "wedding.preference_conflict_lifecycle.v1"
    || !conflictId
    || !sourceMessageId
    || !revisionFingerprint
    || !lifecycleRecordId
    || !["resolved", "dismissed"].includes(String(outcome))
    || message.parent_id !== sourceMessageId
    || content?.privacy_scope !== "couple_only"
    || metadataRecord?.privacy_scope !== "couple_only"
    || metadataRecord?.e2ee_required !== true
    || clean(metadataRecord?.weddingPlanId ?? metadataRecord?.wedding_plan_id) !== weddingPlanId
    || clean(metadataRecord?.responseWorkspaceId ?? metadataRecord?.response_workspace_id) !== responseWorkspaceId
    || clean(metadataRecord?.lifecycle_id) !== lifecycleRecordId
    || clean(metadataRecord?.conflict_id) !== conflictId
    || clean(metadataRecord?.source_message_id) !== sourceMessageId
    || clean(metadataRecord?.revision_fingerprint, 4_000) !== revisionFingerprint
    || metadataRecord?.outcome !== outcome
    || message.from !== "system://wedding-planning"
    || !weddingPlanId
    || !responseWorkspaceId
    || !Number.isFinite(Date.parse(createdAt))) return null;
  return {
    id: lifecycleRecordId,
    conflictId,
    sourceMessageId,
    revisionFingerprint,
    outcome: outcome as WeddingPreferenceConflictLifecycleOutcome,
    createdAt,
    metadata: normalizeWeddingPlanningMetadata({ weddingPlanId, responseWorkspaceId }),
  };
}
