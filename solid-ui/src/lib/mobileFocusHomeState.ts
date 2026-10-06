// @locs-version: 1.0
import { createSignal, type Accessor } from "solid-js";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";

export type FocusMode = "decisions" | "responses" | "overview";
export type FocusDeckItem = {
  id: string;
  kind: "decision" | "response" | "vendor_comparison" | "vendor_draft" | "vendor_receipt" | "vendor_blocked";
  sourceSurface: string;
  title: string;
  recommendedActionLabel: string;
  whyNowLabel: string;
  dueAt: string | null;
  evidenceLabels: string[];
  deferCount: number;
  returnedFromLater: boolean;
  external: boolean;
  vendorComparison?: {
    artifactId: string;
    cards: WeddingWorkspaceArtifactPreview["vendorComparisonCards"];
  } | null;
  vendorOutreachFlow?: WeddingVendorOutreachFlowState | null;
};
export type MobileHomeSection = { id: string; title: string; summary: string };

export const FOCUS_DECK_HORIZONTAL_MAPPING = "left_is_prev" as const;
const [viewport, setViewport] = createSignal(false);
const [mode, setMode] = createSignal<FocusMode>("decisions");
const [menuOpen, setMenuOpen] = createSignal(false);
const [menuAttentionCount, setMenuAttentionCountSignal] = createSignal(0);
const [mobileAskOpen, setMobileAskOpen] = createSignal(false);
const [singleCardSectionId, setSingleCardSectionId] = createSignal<string | null>(null);
const [homeSections, setHomeSections] = createSignal<MobileHomeSection[]>([]);
let listenerInstalled = false;
let mediaQuery: MediaQueryList | null = null;

function storageKey(userId: string | null | undefined, suffix: string): string {
  return accountScopedStorageKey(`omnyid.mobile-focus.${suffix}`, userId);
}

export function installMobileFocusViewportListener(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  if (!mediaQuery) mediaQuery = window.matchMedia("(max-width: 39.99em)");
  const sync = () => setViewport(mediaQuery?.matches === true);
  sync();
  if (!listenerInstalled) {
    mediaQuery.addEventListener("change", sync);
    listenerInstalled = true;
  }
  return () => {};
}

export const isMobileFocusViewport: Accessor<boolean> = viewport;
export const mobileFocusMode: Accessor<FocusMode> = mode;
export const mobileFocusMenuOpen: Accessor<boolean> = menuOpen;
export const mobileFocusMenuAttentionCount: Accessor<number> = menuAttentionCount;
export const mobileFocusAskOpen: Accessor<boolean> = mobileAskOpen;
export const mobileFocusSingleCardSectionId: Accessor<string | null> = singleCardSectionId;
export const mobileFocusHomeSections: Accessor<MobileHomeSection[]> = homeSections;

export function setMobileFocusMode(next: FocusMode, userId?: string | null): void {
  setMode(next);
  try { localStorage.setItem(storageKey(userId, "mode"), next); } catch { /* convenience preference only */ }
}
export function loadMobileFocusMode(userId?: string | null): FocusMode {
  try {
    const saved = localStorage.getItem(storageKey(userId, "mode"));
    if (saved === "decisions" || saved === "responses" || saved === "overview") setMode(saved);
  } catch { /* storage can be unavailable in privacy modes */ }
  return mode();
}
export function setMobileFocusMenuOpen(open: boolean): void { setMenuOpen(open); }
export function setMobileFocusMenuAttentionCount(count: number): void {
  setMenuAttentionCountSignal(Math.max(0, Math.floor(count)));
}
export function setMobileFocusAskOpen(open: boolean): void { setMobileAskOpen(open); }
export function setMobileFocusSingleCardSectionId(id: string | null): void { setSingleCardSectionId(id); }
export function publishMobileFocusHomeSections(sections: MobileHomeSection[]): void { setHomeSections(sections); }

function dueTier(value: string | null, now: Date): number {
  const at = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(at)) return 2;
  const days = (at - now.getTime()) / 86_400_000;
  if (days <= 3) return 0;
  return days <= 14 ? 1 : 2;
}
export function rankFocusDeckItems<T extends FocusDeckItem>(items: readonly T[], now = new Date()): T[] {
  return items.map((item, index) => ({ item, index, tier: dueTier(item.dueAt, now) }))
    .sort((left, right) => left.tier - right.tier || right.item.deferCount - left.item.deferCount || left.index - right.index)
    .map(({ item }) => item);
}
export function hiddenAttentionCount(input: { responseCount: number; overdueDecisionCount: number }): number {
  return Math.max(0, input.responseCount) + Math.max(0, input.overdueDecisionCount);
}
