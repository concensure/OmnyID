// @locs-version: 1.0
import type { IconId } from "@/components/RailIcons";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingWorkspaceDesktopMenuItem = {
  id: WeddingWorkspaceMenuId;
  icon: IconId;
  label: string;
  title: string;
  className: string;
  activeClassName: string;
};

export const WEDDING_WORKSPACE_MENU_ITEMS: readonly WeddingWorkspaceDesktopMenuItem[] = [
  {
    id: "home", icon: "home", label: "Today",
    title: "Main decision queue, budget remaining, days left, and wedding documents.",
    className: "border-pink-100 bg-pink-50/80 text-pink-950 hover:border-pink-200",
    activeClassName: "border-pink-300 bg-pink-100 text-pink-950",
  },
  {
    id: "people", icon: "contacts", label: "Guests",
    title: "Guests, RSVPs, seating, and family decisions.",
    className: "border-amber-100 bg-amber-50/80 text-amber-950 hover:border-amber-200",
    activeClassName: "border-amber-300 bg-amber-100 text-amber-950",
  },
  {
    id: "plan", icon: "timeline", label: "Plan",
    title: "Follow-ups, timeline, sharing, and planning coordination.",
    className: "border-indigo-100 bg-indigo-50/80 text-indigo-950 hover:border-indigo-200",
    activeClassName: "border-indigo-300 bg-indigo-100 text-indigo-950",
  },
  {
    id: "documents", icon: "files", label: "Documents",
    title: "Open planning files, imports, exports, and wedding documents.",
    className: "border-slate-200 bg-slate-50/80 text-slate-800 hover:border-slate-300",
    activeClassName: "border-slate-400 bg-slate-100 text-slate-950",
  },
  {
    id: "budget", icon: "cost_dashboard", label: "Budget",
    title: "Track remaining budget, quotes, payments, and cost risks.",
    className: "border-emerald-100 bg-emerald-50/80 text-emerald-950 hover:border-emerald-200",
    activeClassName: "border-emerald-300 bg-emerald-100 text-emerald-950",
  },
  {
    id: "inspiration", icon: "discover", label: "Inspiration",
    title: "Add photos, screenshots, links, and thoughts so OmnyID can learn the wedding style.",
    className: "border-rose-100 bg-rose-50/80 text-rose-950 hover:border-rose-200",
    activeClassName: "border-rose-300 bg-rose-100 text-rose-950",
  },
  {
    id: "advanced", icon: "tools", label: "Setup checks",
    title: "Connection and safety checks. Most couples can leave this closed.",
    className: "border-stone-200 bg-stone-50/80 text-stone-800 hover:border-stone-300",
    activeClassName: "border-stone-400 bg-stone-100 text-stone-950",
  },
];

const WEDDING_SETUP_CHECK_ADMIN_EMAILS = new Set(["concensure@gmail.com"]);

/** Setup diagnostics are an operator surface, not part of a couple's planner. */
export function weddingWorkspaceMenuItemsForEmail(email: string | null | undefined): readonly WeddingWorkspaceDesktopMenuItem[] {
  const normalized = email?.trim().toLowerCase() ?? "";
  return WEDDING_SETUP_CHECK_ADMIN_EMAILS.has(normalized)
    ? WEDDING_WORKSPACE_MENU_ITEMS
    : WEDDING_WORKSPACE_MENU_ITEMS.filter((item) => item.id !== "advanced");
}

export function weddingMenuKeyDownStep(key: string, currentIndex: number, itemCount: number): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % itemCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + itemCount) % itemCount;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return null;
}
