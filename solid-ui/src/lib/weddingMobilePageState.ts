import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

const TITLE_BY_MENU: Record<WeddingWorkspaceMenuId, string> = {
  home: "Your wedding",
  response_queue: "Live vendor search",
  budget: "Budget",
  timeline: "Timeline",
  people: "People",
  plan: "Plan",
  vision: "Vision",
  documents: "Documents",
  guests: "Guests",
  inspiration: "Inspiration",
  seating: "Seating",
  helpers: "Helpers",
  advanced: "Advanced",
};

export function weddingMobilePageTitle(menu: WeddingWorkspaceMenuId): string {
  return TITLE_BY_MENU[menu];
}
