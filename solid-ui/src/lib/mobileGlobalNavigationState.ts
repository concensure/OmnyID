// @locs-version: 1.0
// @module-id: ui.mobile-global-navigation-state
// @primary-capability: mobile-global-navigation-catalog
// @stability: active
import type { ViewName } from "@/lib/viewNames";

export type MobileNavigationItem = {
  id: ViewName;
  label: string;
  keywords?: string;
  requiresAdvanced?: boolean;
  requiresPara?: boolean;
  requiresStudy?: boolean;
};

export type MobileNavigationGroup = {
  id: string;
  label: string;
  items: readonly MobileNavigationItem[];
};

const MOBILE_NAVIGATION_GROUPS: readonly MobileNavigationGroup[] = [
  {
    id: "start", label: "Start", items: [
      { id: "home", label: "Home", keywords: "workspace wedding" },
      { id: "search", label: "Chat", keywords: "ask search agent" },
      { id: "threads", label: "Threads", keywords: "conversations messages" },
      { id: "workflows", label: "Workflows", keywords: "automations runs" },
    ],
  },
  {
    id: "organize", label: "Organize", items: [
      { id: "email", label: "Email" }, { id: "note", label: "Notes" },
      { id: "calendar", label: "Calendar" }, { id: "database", label: "Database" },
      { id: "templates", label: "Templates" }, { id: "files", label: "Files" },
      { id: "para", label: "PARA Navigator", requiresPara: true },
    ],
  },
  {
    id: "insights", label: "Insights", items: [
      { id: "study", label: "Study", requiresStudy: true },
      { id: "reports", label: "Study Reports" }, { id: "diary", label: "Diary" },
      { id: "discover", label: "Discover" }, { id: "space_feed", label: "Spaces" },
      { id: "public_feed", label: "Public Feed" }, { id: "knowledge_graph", label: "Knowledge Graph" },
    ],
  },
  {
    id: "manage", label: "Manage", items: [
      { id: "contacts", label: "Contacts" }, { id: "connected_apps", label: "Connected Apps" },
      { id: "decision_queue", label: "Decision Queue" }, { id: "cost_dashboard", label: "Cost Dashboard" },
      { id: "cofounder_studio", label: "Co-Founder" }, { id: "pulse", label: "Pulse Feed" },
      { id: "goals", label: "Goals" }, { id: "sovereignty_audit", label: "Sovereignty" },
    ],
  },
  {
    id: "system", label: "System", items: [
      { id: "agent_settings", label: "Settings", keywords: "agent account preferences" },
      { id: "runner", label: "Runner", requiresAdvanced: true },
    ],
  },
];

export type MobileNavigationOptions = {
  advanced: boolean;
  paraViewEnabled: boolean;
  studyLensEnabled: boolean;
  query?: string;
};

export function mobileNavigationGroups(options: MobileNavigationOptions): MobileNavigationGroup[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  return MOBILE_NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.requiresAdvanced && !options.advanced) return false;
      if (item.requiresPara && !options.paraViewEnabled) return false;
      if (item.requiresStudy && !options.studyLensEnabled) return false;
      return !query || `${item.label} ${item.keywords ?? ""}`.toLocaleLowerCase().includes(query);
    }),
  })).filter((group) => group.items.length > 0);
}

export function mobileNavigationLabel(view: ViewName): string {
  for (const group of MOBILE_NAVIGATION_GROUPS) {
    const item = group.items.find((candidate) => candidate.id === view);
    if (item) return item.label;
  }
  return view.replaceAll("_", " ");
}
