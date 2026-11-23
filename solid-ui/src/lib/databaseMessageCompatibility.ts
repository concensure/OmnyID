// @locs-version: 1.0
import {
  DATABASE_CONTRACT_VERSION,
  DEFAULT_DATABASE_TABLE,
  LEGACY_DATABASE_ID,
  type DatabaseSourceReference,
} from "@/lib/databaseContract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function sourceReferences(value: unknown): DatabaseSourceReference[] {
  if (!Array.isArray(value) || value.length > 64) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const messageId = stringValue(entry.message_id);
    const kind = stringValue(entry.kind);
    return messageId && kind ? [{ message_id: messageId, kind }] : [];
  });
}

export type CompatibleDatabaseMessage = {
  id: string;
  type?: string;
  content: unknown;
  metadata?: unknown;
  timestamp?: string;
};

export type CompatibleDatabaseRecord = {
  id: string;
  databaseId: string;
  table: string;
  data: Record<string, unknown>;
  revision: number;
  sourceRefs: DatabaseSourceReference[];
  idempotencyKey: string;
  timestamp: string;
  legacy: boolean;
};

export type CompatibleDatabaseRevision = {
  messageId: string;
  databaseId: string;
  targetRecordId: string;
  table: string;
  patch: Record<string, unknown>;
  baseRevision: number | null;
  revision: number | null;
  operation: "upsert" | "tombstone";
  sourceRefs: DatabaseSourceReference[];
  idempotencyKey: string;
  timestamp: string;
  legacy: boolean;
};

export type DatabaseProjectionConflict = {
  messageId: string;
  recordId: string;
  reason: "database_mismatch" | "revision_conflict" | "orphan_revision";
};

export type CompatibleDatabaseProjection = {
  records: CompatibleDatabaseRecord[];
  conflicts: DatabaseProjectionConflict[];
};

const reservedKeys = new Set([
  "kind", "contract_version", "database_id", "record_id", "revision", "base_revision",
  "table", "database", "data", "fields", "record", "source_refs", "idempotency_key",
  "operation", "scope",
]);

function messageMetadata(message: CompatibleDatabaseMessage): Record<string, unknown> {
  return isRecord(message.metadata) ? message.metadata : {};
}

function databaseId(content: Record<string, unknown>, metadata: Record<string, unknown>): string {
  return stringValue(content.database_id) ?? stringValue(metadata.database_id) ?? LEGACY_DATABASE_ID;
}

function tableName(content: Record<string, unknown>, metadata: Record<string, unknown>): string {
  return stringValue(content.table)
    ?? stringValue(content.database)
    ?? stringValue(metadata.database_table)
    ?? DEFAULT_DATABASE_TABLE;
}

function recordData(content: Record<string, unknown>): Record<string, unknown> | null {
  const candidate = content.data ?? content.fields ?? content.record;
  if (candidate !== undefined) return isRecord(candidate) ? candidate : null;
  return Object.fromEntries(Object.entries(content).filter(([key]) => !reservedKeys.has(key)));
}

function supportedVersion(content: Record<string, unknown>): boolean {
  return content.contract_version === undefined || content.contract_version === DATABASE_CONTRACT_VERSION;
}

export function compatibleDatabaseRecordFromMessage(
  message: CompatibleDatabaseMessage,
): CompatibleDatabaseRecord | null {
  if (!isRecord(message.content) || !supportedVersion(message.content)) return null;
  const content = message.content;
  if (content.kind === "database_record_update") return null;
  if (content.kind !== "database_record" && message.type !== "database_record" && message.type !== "database") {
    return null;
  }
  const metadata = messageMetadata(message);
  const data = recordData(content);
  if (!data) return null;
  const legacy = content.contract_version === undefined;
  if (!legacy && (
    !stringValue(content.database_id)
    || !stringValue(content.record_id)
    || !positiveInteger(content.revision)
    || !stringValue(content.idempotency_key)
  )) return null;
  const resolvedDatabaseId = databaseId(content, metadata);
  const recordId = stringValue(content.record_id) ?? stringValue(metadata.record_id) ?? message.id;
  const revision = positiveInteger(content.revision) ?? 1;
  return {
    id: recordId,
    databaseId: resolvedDatabaseId,
    table: tableName(content, metadata),
    data: { ...data },
    revision,
    sourceRefs: sourceReferences(content.source_refs),
    idempotencyKey: stringValue(content.idempotency_key)
      ?? `database:${resolvedDatabaseId}:record:${recordId}:revision:${revision}`,
    timestamp: message.timestamp ?? "",
    legacy,
  };
}

export function compatibleDatabaseRevisionFromMessage(
  message: CompatibleDatabaseMessage,
): CompatibleDatabaseRevision | null {
  if (!isRecord(message.content) || message.content.kind !== "database_record_update") return null;
  const content = message.content;
  if (!supportedVersion(content)) return null;
  const legacy = content.contract_version === undefined;
  const targetRecordId = stringValue(content.target_record_id);
  if (!targetRecordId) return null;
  const patch = content.patch ?? content.data ?? {};
  if (!isRecord(patch)) return null;
  const operation = content.operation === "tombstone" ? "tombstone" : "upsert";
  if (operation === "upsert" && Object.keys(patch).length === 0) return null;
  const metadata = messageMetadata(message);
  const resolvedDatabaseId = databaseId(content, metadata);
  if (!legacy && (
    !stringValue(content.database_id)
    || !positiveInteger(content.base_revision)
    || !positiveInteger(content.revision)
    || !stringValue(content.idempotency_key)
  )) return null;
  return {
    messageId: message.id,
    databaseId: resolvedDatabaseId,
    targetRecordId,
    table: tableName(content, metadata),
    patch: { ...patch },
    baseRevision: positiveInteger(content.base_revision),
    revision: positiveInteger(content.revision),
    operation,
    sourceRefs: sourceReferences(content.source_refs),
    idempotencyKey: stringValue(content.idempotency_key) ?? `legacy-update:${message.id}`,
    timestamp: message.timestamp ?? "",
    legacy,
  };
}

function compareMessages(left: CompatibleDatabaseMessage, right: CompatibleDatabaseMessage): number {
  const byTime = (left.timestamp ?? "").localeCompare(right.timestamp ?? "");
  return byTime || left.id.localeCompare(right.id);
}

export function projectCompatibleDatabaseMessages(
  messages: CompatibleDatabaseMessage[],
): CompatibleDatabaseProjection {
  const ordered = messages.slice().sort(compareMessages);
  const records = new Map<string, CompatibleDatabaseRecord>();
  const idempotencyKeys = new Set<string>();
  const conflicts: DatabaseProjectionConflict[] = [];

  for (const message of ordered) {
    const record = compatibleDatabaseRecordFromMessage(message);
    if (!record || idempotencyKeys.has(record.idempotencyKey) || records.has(record.id)) continue;
    idempotencyKeys.add(record.idempotencyKey);
    records.set(record.id, record);
  }

  for (const message of ordered) {
    const update = compatibleDatabaseRevisionFromMessage(message);
    if (!update || idempotencyKeys.has(update.idempotencyKey)) continue;
    idempotencyKeys.add(update.idempotencyKey);
    const existing = records.get(update.targetRecordId);
    if (!existing) {
      conflicts.push({ messageId: update.messageId, recordId: update.targetRecordId, reason: "orphan_revision" });
      continue;
    }
    if (update.databaseId !== LEGACY_DATABASE_ID && update.databaseId !== existing.databaseId) {
      conflicts.push({ messageId: update.messageId, recordId: update.targetRecordId, reason: "database_mismatch" });
      continue;
    }
    const nextRevision = update.revision ?? existing.revision + 1;
    if (
      (!update.legacy && update.baseRevision !== existing.revision)
      || (!update.legacy && nextRevision !== existing.revision + 1)
    ) {
      conflicts.push({ messageId: update.messageId, recordId: update.targetRecordId, reason: "revision_conflict" });
      continue;
    }
    if (update.operation === "tombstone") {
      records.delete(update.targetRecordId);
      continue;
    }
    records.set(update.targetRecordId, {
      ...existing,
      table: update.table || existing.table,
      data: { ...existing.data, ...update.patch },
      revision: nextRevision,
      sourceRefs: update.sourceRefs.length > 0 ? update.sourceRefs : existing.sourceRefs,
      timestamp: update.timestamp || existing.timestamp,
      legacy: existing.legacy && update.legacy,
    });
  }

  return {
    records: Array.from(records.values()).sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp) || left.id.localeCompare(right.id)),
    conflicts,
  };
}
