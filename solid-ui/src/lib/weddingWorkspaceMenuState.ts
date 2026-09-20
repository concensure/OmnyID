// @locs-version: 2.1
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingWorkspaceMenuBadgeInput = Pick<
  WeddingResponseWorkspaceViewState,
  "budgetTracking" | "guestTracking" | "seatingPlan" | "vendorContactCards"
>;

export type WeddingWorkspaceMenuId =
  | "home"
  | "budget"
  | "guests"
  | "seating"
  | "helpers"
  | "response_queue"
  | "timeline"
  | "advanced";

const WEDDING_WORKSPACE_MENU_IDS: readonly WeddingWorkspaceMenuId[] = [
  "home",
  "budget",
  "guests",
  "seating",
  "helpers",
  "response_queue",
  "timeline",
  "advanced",
];

export function isWeddingWorkspaceMenuId(value: unknown): value is WeddingWorkspaceMenuId {
  return typeof value === "string" && (WEDDING_WORKSPACE_MENU_IDS as readonly string[]).includes(value);
}

const WEDDING_WORKSPACE_MENU_STORAGE_KEY = "omnyid.wedding.workspace-menu";

export function loadWeddingWorkspaceMenu(storage: Storage = localStorage): WeddingWorkspaceMenuId {
  try {
    const raw = storage.getItem(WEDDING_WORKSPACE_MENU_STORAGE_KEY);
    return isWeddingWorkspaceMenuId(raw) ? raw : "home";
  } catch {
    return "home";
  }
}

export function saveWeddingWorkspaceMenu(id: WeddingWorkspaceMenuId, storage: Storage = localStorage): void {
  try {
    storage.setItem(WEDDING_WORKSPACE_MENU_STORAGE_KEY, id);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
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
  if (id === "seating") {
    const unassigned = state.seatingPlan.unassignedAttendingCount;
    return unassigned > 0 ? { label: String(unassigned), tone: "info" } : null;
  }
  if (id === "response_queue") {
    const urgent = state.vendorContactCards.filter((card) => card.tone === "urgent").length;
    return urgent > 0 ? { label: String(urgent), tone: "urgent" } : null;
  }
  return null;
}

