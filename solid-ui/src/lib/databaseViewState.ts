// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type DatabaseViewRecord = {
  id: string;
  table: string;
  data: Record<string, unknown>;
  timestamp: string;
};

export type DatabaseViewRecordUpdate = {
  targetRecordId: string;
  table: string;
  patch: Record<string, unknown>;
  timestamp: string;
};

export type DatabaseViewColumnDef = {
  key: string;
  label: string;
};

export type DatabaseViewSchemaUpdate = {
  table: string;
  column: DatabaseViewColumnDef;
};

export function databaseScalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function databaseRecordFromMessage(msg: {
  id: string;
  content: unknown;
  timestamp?: string;
}): DatabaseViewRecord | null {
  if (!isRecord(msg.content)) return null;
  const content = msg.content;
  if (content.kind === "database_record_update") return null;
  const table = databaseScalarString(content.table ?? content.database, "default");
  const rawDataCandidate = content.data ?? content.fields ?? content.record ?? content;
  const rawData = isRecord(rawDataCandidate) ? rawDataCandidate : content;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawData)) {
    if (key === "kind" || key === "table" || key === "database") continue;
    data[key] = value;
  }
  return { id: msg.id, table, data, timestamp: msg.timestamp ?? "" };
}

export function databaseRecordUpdateFromMessage(msg: {
  content: unknown;
  timestamp?: string;
}): DatabaseViewRecordUpdate | null {
  if (!isRecord(msg.content)) return null;
  const content = msg.content;
  if (content.kind !== "database_record_update") return null;
  const targetRecordId = typeof content.target_record_id === "string" ? content.target_record_id : "";
  if (!targetRecordId) return null;
  const table = databaseScalarString(content.table ?? content.database, "default");
  const rawPatch = content.patch ?? content.data ?? {};
  if (!isRecord(rawPatch)) return null;
  return {
    targetRecordId,
    table,
    patch: rawPatch,
    timestamp: msg.timestamp ?? "",
  };
}

export function databaseSchemaUpdateFromMessage(msg: { content: unknown }): DatabaseViewSchemaUpdate | null {
  if (!isRecord(msg.content) || msg.content.kind !== "database_schema_update") return null;
  const table = databaseScalarString(msg.content.table ?? msg.content.database, "default");
  const column = isRecord(msg.content.column) ? msg.content.column : null;
  const key = databaseScalarString(column?.key, "").trim();
  const label = databaseScalarString(column?.label, key).trim();
  if (!key || !label) return null;
  return { table, column: { key, label } };
}

export function databaseSchemaColumnsFromMessages(
  messages: Array<{ content: unknown }>,
  table: string | null,
): DatabaseViewColumnDef[] {
  const columns = new Map<string, DatabaseViewColumnDef>();
  for (const message of messages) {
    const schema = databaseSchemaUpdateFromMessage(message);
    if (!schema || (table && schema.table !== table)) continue;
    columns.set(schema.column.key, schema.column);
  }
  return Array.from(columns.values());
}

export function databaseRecordsFromMessages(
  messages: Array<{ id: string; content: unknown; timestamp?: string }>,
): DatabaseViewRecord[] {
  const orderedMessages = messages
    .slice()
    .sort((a, b) => ((a.timestamp ?? "") > (b.timestamp ?? "") ? 1 : -1));

  const baseRows = new Map<string, DatabaseViewRecord>();
  for (const message of orderedMessages) {
    const parsedBase = databaseRecordFromMessage(message);
    if (parsedBase) {
      baseRows.set(parsedBase.id, parsedBase);
      continue;
    }
    const parsedUpdate = databaseRecordUpdateFromMessage(message);
    if (!parsedUpdate) continue;
    const existing = baseRows.get(parsedUpdate.targetRecordId);
    if (!existing) continue;
    baseRows.set(parsedUpdate.targetRecordId, {
      ...existing,
      table: parsedUpdate.table || existing.table,
      data: { ...existing.data, ...parsedUpdate.patch },
      timestamp: parsedUpdate.timestamp || existing.timestamp,
    });
  }

  return Array.from(baseRows.values()).sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
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
): DatabaseViewColumnDef[] {
  const columns = new Map<string, DatabaseViewColumnDef>();
  for (const column of declaredColumns) columns.set(column.key, column);
  for (const record of records.slice(0, 20)) {
    for (const key of Object.keys(record.data)) {
      if (!columns.has(key)) columns.set(key, { key, label: key });
    }
  }
  if (columns.size === 0) return ghostHeaders.map((header) => ({ key: header.toLowerCase(), label: header }));
  return Array.from(columns.values()).slice(0, 8);
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
