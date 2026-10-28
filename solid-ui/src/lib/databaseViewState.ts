// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";
import {
  compatibleDatabaseRecordFromMessage,
  compatibleDatabaseRevisionFromMessage,
  projectCompatibleDatabaseMessages,
  type CompatibleDatabaseMessage,
} from "@/lib/databaseMessageCompatibility";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type DatabaseViewRecord = {
  id: string;
  databaseId: string;
  table: string;
  data: Record<string, unknown>;
  revision: number;
  timestamp: string;
};

export type DatabaseViewRecordUpdate = {
  databaseId: string;
  targetRecordId: string;
  table: string;
  patch: Record<string, unknown>;
  baseRevision: number | null;
  revision: number | null;
  operation: "upsert" | "tombstone";
  timestamp: string;
};

export type DatabaseViewColumnDef = {
  key: string;
  label: string;
};

export type DatabaseViewSchemaUpdate = {
  databaseId: string;
  table: string;
  column: DatabaseViewColumnDef;
};

export function databaseScalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function databaseRecordFromMessage(msg: {
  id: string;
  type?: string;
  content: unknown;
  metadata?: unknown;
  timestamp?: string;
}): DatabaseViewRecord | null {
  const record = compatibleDatabaseRecordFromMessage(msg);
  if (!record) return null;
  return {
    id: record.id,
    databaseId: record.databaseId,
    table: record.table,
    data: record.data,
    revision: record.revision,
    timestamp: record.timestamp,
  };
}

export function databaseRecordUpdateFromMessage(msg: {
  id?: string;
  type?: string;
  content: unknown;
  metadata?: unknown;
  timestamp?: string;
}): DatabaseViewRecordUpdate | null {
  const update = compatibleDatabaseRevisionFromMessage({ ...msg, id: msg.id ?? "legacy-update" });
  if (!update) return null;
  return {
    databaseId: update.databaseId,
    targetRecordId: update.targetRecordId,
    table: update.table,
    patch: update.patch,
    baseRevision: update.baseRevision,
    revision: update.revision,
    operation: update.operation,
    timestamp: update.timestamp,
  };
}

export function databaseSchemaUpdateFromMessage(msg: { content: unknown }): DatabaseViewSchemaUpdate | null {
  if (!isRecord(msg.content) || msg.content.kind !== "database_schema_update") return null;
  if (msg.content.contract_version !== undefined && msg.content.contract_version !== 1) return null;
  const databaseId = databaseScalarString(msg.content.database_id, "database:legacy");
  const table = databaseScalarString(msg.content.table ?? msg.content.database, "default");
  const column = isRecord(msg.content.column) ? msg.content.column : null;
  const key = databaseScalarString(column?.key, "").trim();
  const label = databaseScalarString(column?.label, key).trim();
  if (!key || !label) return null;
  return { databaseId, table, column: { key, label } };
}

export function databaseSchemaColumnsFromMessages(
  messages: Array<{ content: unknown }>,
  table: string | null,
  databaseId?: string | null,
): DatabaseViewColumnDef[] {
  const columns = new Map<string, DatabaseViewColumnDef>();
  for (const message of messages) {
    const schema = databaseSchemaUpdateFromMessage(message);
    if (!schema || (table && schema.table !== table) || (databaseId && schema.databaseId !== databaseId)) continue;
    columns.set(schema.column.key, schema.column);
  }
  return Array.from(columns.values());
}

export function databaseRecordsFromMessages(
  messages: CompatibleDatabaseMessage[],
): DatabaseViewRecord[] {
  return projectCompatibleDatabaseMessages(messages).records.map((record) => ({
    id: record.id,
    databaseId: record.databaseId,
    table: record.table,
    data: record.data,
    revision: record.revision,
    timestamp: record.timestamp,
  }));
}

export function databaseRecordsForDatabase(
  records: DatabaseViewRecord[],
  databaseId: string | null,
): DatabaseViewRecord[] {
  if (!databaseId) return [];
  return records.filter((record) => record.databaseId === databaseId);
}

export function databaseImportRows(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = parseJsonValue(trimmed);
    if (!parsed.ok) return [];
    return Array.isArray(parsed.value) ? parsed.value.filter(isRecord) : [];
  }
  if (trimmed.startsWith("{")) {
    const parsed = parseJsonValue(trimmed);
    if (!parsed.ok) return [];
    return isRecord(parsed.value) ? [parsed.value] : [];
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return lines.map((line) => ({ value: line }));
  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const columns = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, columns[index]?.trim() ?? ""]));
  });
}

export function databaseImportPreviewRows(rows: Record<string, unknown>[]): string[][] {
  if (rows.length === 0) return [];
  const keys = Array.from(new Set(rows.flatMap(Object.keys))).slice(0, 6);
  return [
    keys,
    ...rows.slice(0, 3).map((row) => keys.map((key) => String(row[key] ?? ""))),
  ];
}

export function databaseColumnDefs(
  records: DatabaseViewRecord[],
  ghostHeaders: string[],
  declaredColumns: DatabaseViewColumnDef[] = [],
  maxColumns = 8,
): DatabaseViewColumnDef[] {
  const columns = new Map<string, DatabaseViewColumnDef>();
  for (const column of declaredColumns) columns.set(column.key, column);
  for (const record of records.slice(0, 20)) {
    for (const key of Object.keys(record.data)) {
      if (!columns.has(key)) columns.set(key, { key, label: key });
    }
  }
  if (columns.size === 0) return ghostHeaders.map((header) => ({ key: header.toLowerCase(), label: header }));
  return Array.from(columns.values()).slice(0, Math.max(1, maxColumns));
}

export function formatDatabaseEditableValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function parseDatabaseEditedValue(raw: string, previous: unknown): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (typeof previous === "number") {
    const nextNumber = Number(trimmed);
    return Number.isNaN(nextNumber) ? raw : nextNumber;
  }
  if (typeof previous === "boolean") {
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
    || (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    const parsed = parseJsonValue(trimmed);
    return parsed.ok ? parsed.value : raw;
  }
  return raw;
}
