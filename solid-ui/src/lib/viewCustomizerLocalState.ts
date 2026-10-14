// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { ViewName } from "@/lib/viewNames";

export type OverlayCardType = "text" | "callout" | "stats" | "table" | "custom";
export type OverlayCardGeneratedContent = {
  type: OverlayCardType;
  title?: string;
  body: string;
  imageUrl?: string;
  metrics?: Array<{ label: string; value: string }>;
  tableRows?: Array<{ label: string; value: string }>;
};

export type OverlayCard = {
  id: string;
  x: number;
  y: number;
  kind?: "agent" | "image";
  imageDataUrl?: string;
  imageAlt?: string;
  cardType?: OverlayCardType;
  generated?: OverlayCardGeneratedContent;
  personaTone?: string;
};

function bgKey(viewId: string): string {
  return `omnyid.view.bg.${viewId}`;
}

function cardsKey(viewId: string): string {
  return `omnyid.view.cards.${viewId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBg(value: unknown): string | null {
  return readTrimmedString(value);
}

function normalizeCardType(value: unknown): OverlayCardType | undefined {
  return value === "text" || value === "callout" || value === "stats" || value === "table" || value === "custom"
    ? value
    : undefined;
}

function normalizePairs(value: unknown): Array<{ label: string; value: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const pairs = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = readTrimmedString(item.label);
    const pairValue = readTrimmedString(item.value);
    return label && pairValue ? [{ label, value: pairValue }] : [];
  }).slice(0, 8);
  return pairs.length > 0 ? pairs : undefined;
}

function normalizeGenerated(value: unknown): OverlayCardGeneratedContent | undefined {
  if (!isRecord(value)) return undefined;
  const type = normalizeCardType(value.type);
  const body = readTrimmedString(value.body);
  if (!type || !body) return undefined;
  const title = readTrimmedString(value.title) ?? undefined;
  const imageUrl = readTrimmedString(value.imageUrl) ?? undefined;
  const metrics = normalizePairs(value.metrics);
  const tableRows = normalizePairs(value.tableRows);
  return { type, body, ...(title ? { title } : {}), ...(imageUrl ? { imageUrl } : {}), ...(metrics ? { metrics } : {}), ...(tableRows ? { tableRows } : {}) };
}

function normalizeCards(value: unknown): OverlayCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): OverlayCard[] => {
    if (!isRecord(entry)) return [];
    const id = readTrimmedString(entry.id);
    if (!id || !isFiniteNumber(entry.x) || !isFiniteNumber(entry.y)) return [];
    const personaTone = readTrimmedString(entry.personaTone) ?? undefined;
    const kind = entry.kind === "image" ? "image" as const : entry.kind === "agent" ? "agent" as const : undefined;
    const imageDataUrl = kind === "image" ? readTrimmedString(entry.imageDataUrl) ?? undefined : undefined;
    if (kind === "image" && !imageDataUrl) return [];
    const imageAlt = readTrimmedString(entry.imageAlt) ?? undefined;
    const cardType = kind !== "image" ? normalizeCardType(entry.cardType) : undefined;
    const generated = kind !== "image" ? normalizeGenerated(entry.generated) : undefined;
    return [{
      id,
      x: entry.x,
      y: entry.y,
      ...(kind ? { kind } : {}),
      ...(imageDataUrl ? { imageDataUrl } : {}),
      ...(imageAlt ? { imageAlt } : {}),
      ...(cardType ? { cardType } : {}),
      ...(generated ? { generated } : {}),
      ...(personaTone ? { personaTone } : {}),
    }];
  });
}

function writeViewCustomizerStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeViewCustomizerStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function loadViewCustomizerBg(viewId: ViewName): string | null {
  const key = bgKey(viewId);
  try {
    const raw = localStorage.getItem(key);
    const normalized = normalizeBg(raw);
    if (normalized && normalized !== raw) writeViewCustomizerStorageValue(key, normalized);
    if (!normalized && raw !== null) removeViewCustomizerStorageValue(key);
    return normalized;
  } catch {
    return null;
  }
}

export function saveViewCustomizerBg(viewId: ViewName, value: string | null): void {
  const key = bgKey(viewId);
  const normalized = normalizeBg(value);
  if (normalized) writeViewCustomizerStorageValue(key, normalized);
  else removeViewCustomizerStorageValue(key);
}

export function loadViewCustomizerCards(viewId: ViewName): OverlayCard[] {
  const key = cardsKey(viewId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeViewCustomizerStorageValue(key);
      return [];
    }
    const normalized = normalizeCards(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeViewCustomizerStorageValue(key, serialized);
    return normalized;
  } catch {
    removeViewCustomizerStorageValue(key);
    return [];
  }
}

export function saveViewCustomizerCards(viewId: ViewName, cards: OverlayCard[]): void {
  writeViewCustomizerStorageValue(cardsKey(viewId), JSON.stringify(normalizeCards(cards)));
}
