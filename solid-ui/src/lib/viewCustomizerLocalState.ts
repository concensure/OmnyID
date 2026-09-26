// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { ViewName } from "@/lib/viewNames";

export type OverlayCard = {
  id: string;
  x: number;
  y: number;
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

function normalizeCards(value: unknown): OverlayCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): OverlayCard[] => {
    if (!isRecord(entry)) return [];
    const id = readTrimmedString(entry.id);
    if (!id || !isFiniteNumber(entry.x) || !isFiniteNumber(entry.y)) return [];
    const personaTone = readTrimmedString(entry.personaTone) ?? undefined;
    return [{
      id,
      x: entry.x,
      y: entry.y,
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
