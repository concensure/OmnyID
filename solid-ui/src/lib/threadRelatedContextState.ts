// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export type ThreadRelatedContextItem = {
  id: string;
  label: string;
  type: string;
};

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function relatedContextLabel(content: unknown, fallback: string): string {
  const record = isRecord(content) ? content : {};
  const value = record.claim ?? record.title ?? record.text;
  return scalarString(value, fallback).slice(0, 60);
}

export function normalizeThreadRelatedContextItem(value: unknown): ThreadRelatedContextItem | null {
  if (!isRecord(value)) return null;
  const id = scalarString(value.id);
  if (!id) return null;
  const type = scalarString(value.type, "knowledge_card");
  return {
    id,
    type,
    label: relatedContextLabel(value.content, type),
  };
}

export function normalizeThreadRelatedContextResponse(value: unknown, limit = 5): ThreadRelatedContextItem[] {
  const record = isRecord(value) ? value : {};
  return Array.isArray(record.messages)
    ? record.messages
      .map(normalizeThreadRelatedContextItem)
      .filter((item): item is ThreadRelatedContextItem => Boolean(item))
      .slice(0, Math.max(0, limit))
    : [];
}
