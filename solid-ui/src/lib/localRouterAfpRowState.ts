// @locs-version: 1.0
import type { AfpAttachment, AfpMessage, AfpReference, AfpView } from "@/lib/api";

export type LocalRouterAfpRow = {
  id: string;
  thread_id: string;
  from_agent: string;
  to_agents?: unknown;
  timestamp: string;
  type: string;
  subtype?: unknown;
  content?: unknown;
  metadata?: unknown;
  views?: unknown;
  references?: unknown;
  attachments?: unknown;
  encryption?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry): string[] => {
      const normalized = nonEmptyString(entry);
      return normalized ? [normalized] : [];
    })
    : [];
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return recordOrNull(value) ?? {};
}

export function normalizeLocalRouterAfpViews(value: unknown): AfpView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AfpView[] => {
    if (!isRecord(entry)) return [];
    const format = nonEmptyString(entry.format);
    if (!format) return [];
    const priority = entry.priority;
    return [{
      format,
      content: recordOrEmpty(entry.content),
      priority: typeof priority === "number" && Number.isFinite(priority) ? priority : undefined,
    }];
  });
}

export function normalizeLocalRouterAfpAttachments(value: unknown): AfpAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AfpAttachment[] => {
    if (!isRecord(entry)) return [];
    const id = nonEmptyString(entry.id);
    const name = nonEmptyString(entry.name);
    const mimeType = nonEmptyString(entry.mime_type);
    const sizeBytes = entry.size_bytes;
    if (
      !id
      || !name
      || !mimeType
      || typeof sizeBytes !== "number"
      || !Number.isFinite(sizeBytes)
      || sizeBytes < 0
    ) {
      return [];
    }
    return [{
      id,
      name,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      storage: recordOrEmpty(entry.storage),
      encryption: recordOrEmpty(entry.encryption),
      sha256: nonEmptyString(entry.sha256) ?? undefined,
    }];
  });
}

export function normalizeLocalRouterAfpReferences(value: unknown): AfpReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AfpReference[] => {
    if (!isRecord(entry)) return [];
    const type = nonEmptyString(entry.type);
    const target = nonEmptyString(entry.target);
    if (!type || !target) return [];
    return [{
      type,
      target,
      label: nonEmptyString(entry.label) ?? undefined,
      metadata: recordOrNull(entry.metadata) ?? undefined,
    }];
  });
}

export function rowToLocalRouterAfpMessage(row: LocalRouterAfpRow): AfpMessage {
  return {
    id: row.id,
    thread_id: row.thread_id,
    from: row.from_agent,
    to: stringList(row.to_agents),
    timestamp: row.timestamp,
    type: row.type,
    subtype: nonEmptyString(row.subtype) ?? undefined,
    content: recordOrEmpty(row.content),
    metadata: recordOrNull(row.metadata),
    views: normalizeLocalRouterAfpViews(row.views),
    attachments: normalizeLocalRouterAfpAttachments(row.attachments),
    references: normalizeLocalRouterAfpReferences(row.references),
    encryption: recordOrNull(row.encryption),
  };
}
