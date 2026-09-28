// @locs-version: 1.0
type SourceItem = {
  title: string;
  url: string;
  subtitle: string;
};

type RunnerDraft = {
  target_file_id: string;
  requires_confirmation: boolean;
  content: string;
};

export function buildGenericCommandPanelState(copy: {
  intent: string;
  query: string;
  summary: string;
  bullets: string[];
  runnerDraft?: RunnerDraft | null;
  sourceItems: SourceItem[];
}): {
  schema_version: "a2ui.v1";
  kind: "panel";
  title: string;
  description: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<Record<string, unknown>>;
};

export function buildRunnerEditPanelState(copy: {
  query: string;
  summary: string;
  bullets: string[];
  runnerDraft?: RunnerDraft | null;
}): {
  schema_version: "a2ui.v1";
  kind: "panel";
  title: string;
  description: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<Record<string, unknown>>;
};

export function buildDashboardFocusPanelState(copy: {
  query: string;
  summary: string;
  bullets: string[];
}): {
  schema_version: "a2ui.v1";
  kind: "panel";
  title: string;
  description: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<Record<string, unknown>>;
};
