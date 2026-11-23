// @locs-version: 1.0
import type { RunTimelineFilterMode, WorkflowNodeDraft } from "@/lib/workflowGraphTypes";

export type RunHistoryDriftFilter = "all" | "deployment" | "replay" | "any";
export type RunHistorySortMode = "recent" | "drift_desc";

export type PersistedRunReviewContext = {
  selected_edge_id: string | null;
  timeline_filter: RunTimelineFilterMode;
  focused_node_id: string | null;
  selected_deployment_id: string | null;
  selected_node_id: string | null;
};

export type PersistedStoredSharedReviewUiContext = {
  selected_review_id: string | null;
  show_all: boolean;
  filter_text: string;
  sort_mode: "priority" | "recent";
  share_mode_filter: "all" | "workspace" | "core";
  pinned_only: boolean;
};

export type ReviewUrlState = {
  workflow_id: string | null;
  run_id: string | null;
  selected_edge_id: string | null;
  timeline_filter: RunTimelineFilterMode;
  focused_node_id: string | null;
  selected_deployment_id: string | null;
  selected_node_id: string | null;
  drift_filter: RunHistoryDriftFilter;
  sort_mode: RunHistorySortMode;
  selected_review_id: string | null;
  show_all_saved_reviews: boolean;
  saved_review_filter: string;
  saved_review_sort_mode: "priority" | "recent";
  saved_review_share_mode_filter: "all" | "workspace" | "core";
  saved_review_pinned_only: boolean;
};

export type StoredSharedReviewLink = {
  id: string;
  href: string;
  saved_at: string;
  environment: string | null;
  deployment_id: string | null;
  share_mode?: "workspace" | "core";
  title: string | null;
  pinned: boolean;
};

export type LiveRunStreamEvent = {
  decision?: string;
  event: string;
  node_id?: string;
  label?: string;
  note?: string;
  option_consequence?: string;
  option_id?: string;
  option_label?: string;
  result_summary?: string;
  status?: string;
  index?: number;
  ts?: string;
  phase?: string;
  trace_kind?: string;
  outcome_checkpoint?: string;
  reason?: string;
  runtime_kind?: string;
  graph_node_kind?: string;
  complexity_score?: number;
  risk_score?: number;
};

export type WorkflowFamilyContext = {
  semanticRole: string | null;
  familyId: string | null;
  familyWorkflowId: string | null;
  familyAssetWorkflowId: string | null;
  instanceWorkflowId: string | null;
  values: Array<{ key: string; value: string }>;
};

export type LiveRunNodeOverlay = {
  status: string;
  stepOrder: number | null;
  phase: string | null;
  checkpoint: string | null;
  reason: string | null;
};

export type SemanticStarterDefinition = {
  id: string;
  label: string;
  nodeKind: WorkflowNodeDraft["kind"];
  description: string;
  config: Record<string, unknown>;
  semanticRole: string;
};

export type TemplateScaffoldStep = {
  label: string;
  kind: WorkflowNodeDraft["kind"];
  description: string;
  semanticRole: string;
  config: Record<string, unknown>;
};

export type SuggestedTemplateRuntimeLineage = {
  runtimeTemplateId: string;
  slotSequence: string[];
};

export type WorkflowFamilyParameterField = {
  id: string;
  label: string;
  kind: "text" | "number" | "select";
  description?: string;
  defaultValue: string;
  options?: Array<{ value: string; label: string }>;
};

export type WorkflowFamilyParameterFieldDraft = {
  id: string;
  label: string;
  kind: "text" | "number" | "select";
  description: string | undefined;
  defaultValue: string;
  options?: Array<{ value: string; label: string }>;
};
