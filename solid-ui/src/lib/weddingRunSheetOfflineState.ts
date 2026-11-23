// @locs-version: 1.0
import type { CompatibleDatabaseMessage } from "@/lib/databaseMessageCompatibility";
import { databaseRecordsFromMessages } from "@/lib/databaseViewState";
import { weddingRunSheetEffectiveRows, weddingRunSheetFingerprint } from "@/lib/weddingRunSheetProjectorState";

const SNAPSHOT_VERSION = 1;
const MAX_ROWS = 500;
const MAX_AGE_MS = 72 * 60 * 60 * 1_000;
const SAFE_FIELDS = [
  "runsheet_item_id", "title", "start_at", "end_at", "duration_minutes", "time_status",
  "location", "time_zone", "owner_refs", "participant_refs", "category", "status",
  "visibility", "projection_state", "dependency_refs", "buffer_before_minutes",
  "buffer_after_minutes", "anchor_record_id", "anchor_offset_minutes", "due_at", "updated_at",
] as const;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type WeddingRunSheetOfflineSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  accountScope: string;
  databaseId: string;
  weddingPlanId: string;
  lastSynchronizedAt: string;
  expiresAt: string;
  rows: Array<{
    id: string;
    table: string;
    revision: number;
    timestamp: string;
    data: Record<string, unknown>;
  }>;
};

export type WeddingRunSheetProjectionTelemetry = {
  sourceCount: number;
  batchCount: number;
  writeCount: number;
  modelCalls: 0;
  inputTokens: 0;
  outputTokens: 0;
  modelCostUsd: 0;
};

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => boundedValue(item));
  return undefined;
}

function safeData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(SAFE_FIELDS.flatMap((field) => {
    const value = boundedValue(data[field]);
    return value === undefined ? [] : [[field, value]];
  }));
}

function scopeToken(accountId: string): string {
  return weddingRunSheetFingerprint({ accountId }).replace(/[^a-z0-9-]/gi, "");
}

export function weddingRunSheetOfflineStorageKey(input: {
  accountId: string;
  databaseId: string;
  weddingPlanId: string;
}): string {
  return `omnyid.wedding.runsheet.offline.v1.${scopeToken(input.accountId)}.${weddingRunSheetFingerprint({ databaseId: input.databaseId, weddingPlanId: input.weddingPlanId })}`;
}

export function buildWeddingRunSheetOfflineSnapshot(input: {
  accountId: string;
  databaseId: string;
  weddingPlanId: string;
  messages: CompatibleDatabaseMessage[];
  now?: Date;
}): WeddingRunSheetOfflineSnapshot | null {
  if (!input.accountId.trim() || !input.databaseId.trim() || !input.weddingPlanId.trim()) return null;
  const now = input.now ?? new Date();
  const rows = weddingRunSheetEffectiveRows(databaseRecordsFromMessages(input.messages))
    .filter((row) => row.databaseId === input.databaseId && text(row.data.projection_state) !== "detached")
    .sort((left, right) => text(left.data.start_at).localeCompare(text(right.data.start_at)) || left.id.localeCompare(right.id))
    .slice(0, MAX_ROWS)
    .map((row) => ({
      id: row.id,
      table: row.table,
      revision: row.revision,
      timestamp: row.timestamp,
      data: safeData(row.data),
    }));
  return {
    version: SNAPSHOT_VERSION,
    accountScope: scopeToken(input.accountId),
    databaseId: input.databaseId,
    weddingPlanId: input.weddingPlanId,
    lastSynchronizedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MAX_AGE_MS).toISOString(),
    rows,
  };
}

export function writeWeddingRunSheetOfflineSnapshot(
  storage: StorageLike,
  input: Parameters<typeof buildWeddingRunSheetOfflineSnapshot>[0],
): WeddingRunSheetOfflineSnapshot | null {
  const snapshot = buildWeddingRunSheetOfflineSnapshot(input);
  if (!snapshot) return null;
  const serialized = JSON.stringify(snapshot);
  if (serialized.length > 1_000_000) return null;
  storage.setItem(weddingRunSheetOfflineStorageKey(input), serialized);
  return snapshot;
}

export function readWeddingRunSheetOfflineSnapshot(
  storage: StorageLike,
  input: { accountId: string; databaseId: string; weddingPlanId: string; now?: Date },
): WeddingRunSheetOfflineSnapshot | null {
  const key = weddingRunSheetOfflineStorageKey(input);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = objectValue(JSON.parse(raw));
    const now = input.now ?? new Date();
    const rawRows = Array.isArray(value.rows) ? value.rows : [];
    const rows = rawRows.flatMap((entry) => {
      const row = objectValue(entry);
      const id = text(row.id);
      const table = text(row.table);
      const revision = typeof row.revision === "number" && Number.isSafeInteger(row.revision) ? row.revision : 0;
      if (!id || id.length > 160 || !table || table.length > 120 || revision < 1) return [];
      return [{ id, table, revision, timestamp: text(row.timestamp), data: safeData(objectValue(row.data)) }];
    });
    if (
      value.version !== SNAPSHOT_VERSION
      || value.accountScope !== scopeToken(input.accountId)
      || value.databaseId !== input.databaseId
      || value.weddingPlanId !== input.weddingPlanId
      || !text(value.lastSynchronizedAt)
      || !text(value.expiresAt)
      || new Date(text(value.expiresAt)).getTime() <= now.getTime()
      || rows.length !== rawRows.length
      || rows.length > MAX_ROWS
    ) {
      storage.removeItem(key);
      return null;
    }
    return { ...value, rows } as WeddingRunSheetOfflineSnapshot;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function weddingRunSheetOfflineMessages(snapshot: WeddingRunSheetOfflineSnapshot): CompatibleDatabaseMessage[] {
  return snapshot.rows.map((row) => ({
    id: row.id,
    type: "database_record",
    timestamp: row.timestamp,
    content: {
      kind: "database_record",
      contract_version: 1,
      database_id: snapshot.databaseId,
      record_id: row.id,
      revision: row.revision,
      table: row.table,
      data: safeData(row.data),
      source_refs: [],
      idempotency_key: `offline-copy:${weddingRunSheetFingerprint({ id: row.id, revision: row.revision })}`,
    },
    metadata: { offline_read_only: true, last_synchronized_at: snapshot.lastSynchronizedAt },
  }));
}

export function weddingRunSheetProjectionTelemetry(input: {
  sourceCount: number;
  batchCount: number;
  writeCount: number;
}): WeddingRunSheetProjectionTelemetry {
  return {
    sourceCount: Math.max(0, Math.floor(input.sourceCount)),
    batchCount: Math.max(0, Math.floor(input.batchCount)),
    writeCount: Math.max(0, Math.floor(input.writeCount)),
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    modelCostUsd: 0,
  };
}
