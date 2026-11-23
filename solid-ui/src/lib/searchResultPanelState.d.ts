// @locs-version: 1.0
type SearchTone = "success" | "info" | "warning";

type SearchSummary = {
  tone: SearchTone;
  title: string;
  detail: string;
};

type RouterCompanion = {
  tone: SearchTone;
  title: string;
  detail: string;
  stats: Array<{ label: string; value: string }>;
  badges: string[];
};

type SourceItem = {
  title: string;
  url: string;
  subtitle: string;
};

export function buildSearchResultPanelState(copy: {
  query: string;
  summary: string;
  searchConfidence: SearchSummary;
  evidenceOrigin: SearchSummary;
  localRouterCompanion?: RouterCompanion | null;
  bullets: string[];
  refinementSuggestions: string[];
  sourceItems: SourceItem[];
}): {
  schema_version: "a2ui.v1";
  kind: "panel";
  title: string;
  description: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<Record<string, unknown>>;
};
