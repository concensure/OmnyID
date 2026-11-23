// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export interface BriefSettings {
  enabled: boolean;
  collapsed: boolean;
  show_goal_pulse: boolean;
  show_agent_offer: boolean;
  show_ambient: boolean;
}

const BRIEF_SETTINGS_KEY = "omnyid.brief.settings";

const DEFAULT_BRIEF_SETTINGS: BriefSettings = {
  enabled: true,
  collapsed: false,
  show_goal_pulse: true,
  show_agent_offer: true,
  show_ambient: true,
};

function normalizeBriefSettings(value: unknown): BriefSettings {
  if (!isRecord(value)) return { ...DEFAULT_BRIEF_SETTINGS };
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_BRIEF_SETTINGS.enabled,
    collapsed: typeof value.collapsed === "boolean" ? value.collapsed : DEFAULT_BRIEF_SETTINGS.collapsed,
    show_goal_pulse:
      typeof value.show_goal_pulse === "boolean" ? value.show_goal_pulse : DEFAULT_BRIEF_SETTINGS.show_goal_pulse,
    show_agent_offer:
      typeof value.show_agent_offer === "boolean" ? value.show_agent_offer : DEFAULT_BRIEF_SETTINGS.show_agent_offer,
    show_ambient:
      typeof value.show_ambient === "boolean" ? value.show_ambient : DEFAULT_BRIEF_SETTINGS.show_ambient,
  };
}

function writeBriefStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeBriefStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function loadBriefSettings(): BriefSettings {
  try {
    const raw = localStorage.getItem(BRIEF_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_BRIEF_SETTINGS };
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeBriefStorageValue(BRIEF_SETTINGS_KEY);
      return { ...DEFAULT_BRIEF_SETTINGS };
    }
    const normalized = normalizeBriefSettings(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeBriefStorageValue(BRIEF_SETTINGS_KEY, serialized);
    return normalized;
  } catch {
    removeBriefStorageValue(BRIEF_SETTINGS_KEY);
    return { ...DEFAULT_BRIEF_SETTINGS };
  }
}

export function saveBriefSettings(settings: BriefSettings): void {
  writeBriefStorageValue(BRIEF_SETTINGS_KEY, JSON.stringify(normalizeBriefSettings(settings)));
}

export function briefReadStorageKey(date: string): string {
  return `omnyid.brief.read.${date}`;
}

export function loadBriefRead(date: string): boolean {
  try {
    const key = briefReadStorageKey(date);
    const stored = localStorage.getItem(key);
    if (stored === "1") return true;
    if (stored === null) return false;
    removeBriefStorageValue(key);
    return false;
  } catch {
    return false;
  }
}

export function saveBriefRead(date: string, read: boolean): void {
  if (read) writeBriefStorageValue(briefReadStorageKey(date), "1");
  else removeBriefStorageValue(briefReadStorageKey(date));
}

function tileEnabledStorageKey(tileId: string): string {
  return `omnyid.tile.enabled.${tileId}`;
}

export function loadTileEnabled(tileId: string): boolean {
  try {
    const key = tileEnabledStorageKey(tileId);
    const stored = localStorage.getItem(key);
    if (stored === "0") return false;
    if (stored === "1" || stored === null) return true;
    writeBriefStorageValue(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function saveTileEnabled(tileId: string, enabled: boolean): void {
  writeBriefStorageValue(tileEnabledStorageKey(tileId), enabled ? "1" : "0");
}
