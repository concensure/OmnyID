// @locs-version: 2.1
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingWorkspaceMenuBadgeInput = Pick<
  WeddingResponseWorkspaceViewState,
  "budgetTracking" | "guestTracking" | "seatingPlan" | "vendorContactCards" | "delegation" | "ganttTimeline" | "inspiration"
>;

export type WeddingWorkspaceMenuId =
  | "home"
  | "people"
  | "plan"
  | "tasks"
  | "vision"
  | "documents"
  | "budget"
  | "guests"
  | "inspiration"
  | "seating"
  | "helpers"
  | "response_queue"
  | "timeline"
  | "advanced";

const WEDDING_WORKSPACE_MENU_IDS: readonly WeddingWorkspaceMenuId[] = [
  "home",
  "people",
  "plan",
  "tasks",
  "vision",
  "documents",
  "budget",
  "guests",
  "inspiration",
  "seating",
  "helpers",
  "response_queue",
  "timeline",
  "advanced",
];

export function isWeddingWorkspaceMenuId(value: unknown): value is WeddingWorkspaceMenuId {
  return typeof value === "string" && (WEDDING_WORKSPACE_MENU_IDS as readonly string[]).includes(value);
}

export function canonicalWeddingWorkspaceMenuId(value: WeddingWorkspaceMenuId): WeddingWorkspaceMenuId {
  if (value === "vision") return "inspiration";
  if (value === "helpers") return "people";
  return value;
}

const WEDDING_WORKSPACE_MENU_STORAGE_KEY = "omnyid.wedding.workspace-menu";
const WEDDING_WORKSPACE_MENU_URL_PARAM = "weddingMenu";
export const WEDDING_WORKSPACE_MENU_EVENT = "omnyid:wedding-workspace-menu";

export function loadWeddingWorkspaceMenu(storage: Storage = localStorage): WeddingWorkspaceMenuId {
  try {
    const raw = storage.getItem(WEDDING_WORKSPACE_MENU_STORAGE_KEY);
    return isWeddingWorkspaceMenuId(raw) ? canonicalWeddingWorkspaceMenuId(raw) : "home";
  } catch {
    return "home";
  }
}

export function saveWeddingWorkspaceMenu(id: WeddingWorkspaceMenuId, storage: Storage = localStorage): void {
  try {
    storage.setItem(WEDDING_WORKSPACE_MENU_STORAGE_KEY, canonicalWeddingWorkspaceMenuId(id));
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function loadWeddingWorkspaceMenuFromUrl(search: string, hash = ""): WeddingWorkspaceMenuId | null {
  try {
    const queryValue = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(WEDDING_WORKSPACE_MENU_URL_PARAM);
    if (isWeddingWorkspaceMenuId(queryValue)) return canonicalWeddingWorkspaceMenuId(queryValue);
    const hashValue = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get(WEDDING_WORKSPACE_MENU_URL_PARAM);
    return isWeddingWorkspaceMenuId(hashValue) ? canonicalWeddingWorkspaceMenuId(hashValue) : null;
  } catch {
    return null;
  }
}

export function replaceWeddingWorkspaceMenuInUrl(id: WeddingWorkspaceMenuId, windowLike: Pick<Window, "location" | "history"> = window): void {
  try {
    const url = new URL(windowLike.location.href);
    url.searchParams.set(WEDDING_WORKSPACE_MENU_URL_PARAM, canonicalWeddingWorkspaceMenuId(id));
    windowLike.history.replaceState(windowLike.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL sync is convenience only; localStorage still remembers the tab.
  }
}

export function dispatchWeddingWorkspaceMenuSelection(
  id: WeddingWorkspaceMenuId,
  target: Window = window,
): void {
  try {
    target.dispatchEvent(new CustomEvent(WEDDING_WORKSPACE_MENU_EVENT, { detail: { menu: id } }));
  } catch {
    // Cross-view menu selection is convenience only; URL and local storage still carry the selected tab.
  }
}

export function weddingWorkspaceMenuIdFromEvent(event: Event): WeddingWorkspaceMenuId | null {
  const detail = "detail" in event ? (event as CustomEvent<unknown>).detail : null;
  const menu = detail && typeof detail === "object" && !Array.isArray(detail)
    ? (detail as Record<string, unknown>).menu
    : null;
  return isWeddingWorkspaceMenuId(menu) ? canonicalWeddingWorkspaceMenuId(menu) : null;
}

export type WeddingWorkspaceMenuBadge = {
  label: string;
  tone: "urgent" | "info";
};

/** Small live counts/flags surfaced on each nav pill so a first-time user can see which section needs them without opening it. */
export function weddingWorkspaceMenuBadge(
  id: WeddingWorkspaceMenuId,
  state: WeddingWorkspaceMenuBadgeInput | null,
): WeddingWorkspaceMenuBadge | null {
  if (!state) return null;
  if (id === "budget") {
    const remaining = state.budgetTracking.remainingAmount;
    return remaining !== null && remaining < 0 ? { label: "Over", tone: "urgent" } : null;
  }
  if (id === "guests") {
    const pending = state.guestTracking.pendingCount;
    return pending > 0 ? { label: String(pending), tone: "info" } : null;
  }
  if (id === "people") {
    const pending = state.guestTracking.pendingCount;
    const unassigned = state.seatingPlan.unassignedAttendingCount;
    const total = pending + unassigned;
    return total > 0 ? { label: String(total), tone: "info" } : null;
  }
  if (id === "seating") {
    const unassigned = state.seatingPlan.unassignedAttendingCount;
    return unassigned > 0 ? { label: String(unassigned), tone: "info" } : null;
  }
  if (id === "response_queue") {
    const urgent = state.vendorContactCards.filter((card) => card.tone === "urgent").length;
    return urgent > 0 ? { label: String(urgent), tone: "urgent" } : null;
  }
  if (id === "plan" || id === "tasks") {
    const urgent = state.vendorContactCards.filter((card) => card.tone === "urgent").length;
    return urgent > 0 ? { label: String(urgent), tone: "urgent" } : null;
  }
  return null;
}

/** Gentle "not started" hints for first-run sections. Urgent counts remain handled by weddingWorkspaceMenuBadge. */
export function weddingWorkspaceMenuHint(
  id: WeddingWorkspaceMenuId,
  state: WeddingWorkspaceMenuBadgeInput | null,
): string | null {
  if (!state) return null;
  if (id === "budget") return state.budgetTracking.budgetTargetAmount === null ? "Start" : null;
  if (id === "guests") return state.guestTracking.guestRowCount === 0 ? "Start" : null;
  if (id === "people") {
    return state.guestTracking.guestRowCount === 0 || state.delegation.items.length === 0 ? "Start" : null;
  }
  if (id === "seating") {
    const hasGuestsToSeat = state.guestTracking.attendingCount > 0;
    return hasGuestsToSeat && state.seatingPlan.assignedSeatCount === 0 ? "Start" : null;
  }
  if (id === "inspiration") return state.inspiration.items.length === 0 ? "Start" : null;
  if (id === "timeline") {
    return state.ganttTimeline.rows.length === 0 && state.ganttTimeline.undatedItems.length === 0 ? "Start" : null;
  }
  if (id === "plan" || id === "tasks") {
    return state.ganttTimeline.rows.length === 0 && state.vendorContactCards.length === 0 ? "Start" : null;
  }
  if (id === "documents") return null;
  return null;
}
