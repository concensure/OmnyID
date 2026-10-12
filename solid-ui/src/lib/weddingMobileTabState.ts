import type { WeddingDashboardIconId } from "@/components/WeddingDashboardIcons";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingMobileTabId = "home" | "vendors" | "budget" | "timeline" | "more";

export type WeddingMobileTab = {
  id: WeddingMobileTabId;
  label: string;
  icon: WeddingDashboardIconId;
  menu: WeddingWorkspaceMenuId | null;
};

export const WEDDING_MOBILE_TABS: readonly WeddingMobileTab[] = [
  { id: "home", label: "Home", icon: "users", menu: "home" },
  { id: "vendors", label: "Vendors", icon: "user-plus", menu: "response_queue" },
  { id: "budget", label: "Budget", icon: "banknotes", menu: "budget" },
  { id: "timeline", label: "Timeline", icon: "calendar-days", menu: "timeline" },
  { id: "more", label: "More", icon: "shield-check", menu: null },
] as const;

export function weddingMobileTabForMenu(menu: WeddingWorkspaceMenuId): WeddingMobileTabId {
  if (menu === "home") return "home";
  if (menu === "response_queue") return "vendors";
  if (menu === "budget") return "budget";
  if (menu === "timeline") return "timeline";
  return "more";
}
