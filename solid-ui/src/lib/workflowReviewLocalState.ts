// @locs-version: 1.0
import { accountScopedStorageKey, accountScopedStorageReadKey } from "@/lib/accountScopedStorage";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { RunTimelineFilterMode } from "@/lib/workflowGraphTypes";
import type {
  PersistedRunReviewContext,
  PersistedStoredSharedReviewUiContext,
  ReviewUrlState,
  RunHistoryDriftFilter,
  RunHistorySortMode,
  StoredSharedReviewLink,
} from "@/lib/workflowReviewTypes";

const WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY = "omnyid.workflow.runHistory.review.v1";
const WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY = "omnyid.workflow.sharedReviewLinks.v1";

export type WorkflowRunHistoryReviewStorageState = {
  driftFilter: RunHistoryDriftFilter;
  sortMode: RunHistorySortMode;
  selectedRuns: Record<string, string>;
  reviewContexts: Record<string, PersistedRunReviewContext>;
  sharedReviewUiContexts: Record<string, PersistedStoredSharedReviewUiContext>;
};

export type WorkflowStoredSharedReviewUiState = {
  selectedReviewId: string | null;
  showAll: boolean;
  filterText: string;
  sortMode: "priority" | "recent";
  shareModeFilter: "all" | "workspace" | "core";
  pinnedOnly: boolean;
};

export type WorkflowStoredSharedReviewCompositionFocus = "all" | "pinned" | "workspace" | "core";
export type WorkflowStoredSharedReviewActiveFilterKey = "pinned_only" | "share_mode" | "search";
export type WorkflowStoredSharedReviewPreviewContextKey =
  | "expanded"
  | "pinned_only"
  | "share_mode"
  | "search"
  | "sort_mode";

export type WorkflowStoredSharedReviewRecordState = {
  parsedUrl: URL;
  reviewState: ReviewUrlState | null;
  shareMode: "workspace" | "core";
};

export type WorkflowStoredSharedReviewRecordStateEntry = {
  record: StoredSharedReviewLink;
  recordState: WorkflowStoredSharedReviewRecordState | null;
};

export type WorkflowStoredSharedReviewResumeTarget = {
  nextUrl: string;
  reviewState: ReviewUrlState | null;
  shareMode: "workspace" | "core";
};

type WorkflowRunLike = {
  run_id: string;
};

type WorkflowLike = {
  workflow_id: string;
};

type WorkflowReviewNodeLike = {
  id: string;
};

type WorkflowReviewEdgeLike = {
  id: string;
};

type WorkflowReviewDeploymentLike = {
  deployment_id: string;
};

export type WorkflowRunReviewContextSelection = {
  selectedNodeId: string | null;
  selectedRunEdgeId: string | null;
  runTimelineFilterMode: RunTimelineFilterMode;
  runTimelineFocusNodeId: string | null;
  selectedDeploymentRecordId: string | null;
};

export type WorkflowRunReviewContextRestorePlan = {
  clearPendingUrlReviewState: boolean;
  context: PersistedRunReviewContext | null;
  persistSharedReviewLink: boolean;
  shareMode: "workspace" | "core" | null;
  showSharedReviewBanner: boolean;
  workflowUrlState: ReviewUrlState | null;
};

export type WorkflowReviewUrlNavigationPlan =
  | {
      kind: "clear";
      driftFilter: "all";
      sortMode: "recent";
      selectedRunId: string | null;
    }
  | {
      kind: "load-workflow";
      driftFilter: RunHistoryDriftFilter;
      sortMode: RunHistorySortMode;
      pendingUrlState: ReviewUrlState;
      workflowIdToLoad: string;
    }
  | {
      kind: "apply";
      driftFilter: RunHistoryDriftFilter;
      sortMode: RunHistorySortMode;
      pendingUrlState: ReviewUrlState;
      selectedRunId: string | null;
      runReviewContext: PersistedRunReviewContext;
      sharedReviewUiState: WorkflowStoredSharedReviewUiState;
    };

export function readWorkflowReviewUrlStateFromSearch(search: string): ReviewUrlState | null {
  const params = new URLSearchParams(search);
  const timelineFilter = params.get("tf");
  const driftFilter = params.get("rdf");
  const sortMode = params.get("rds");
  const savedReviewSortMode = params.get("srsm");
  const savedReviewShareModeFilter = params.get("srmf");
  const savedReviewPinnedOnly = params.get("srpo");
  if (
    timelineFilter !== "all"
    && timelineFilter !== "deployment_context"
    && timelineFilter !== "replay_drift"
    && !params.get("wf")
    && !params.get("run")
  ) {
    return null;
  }
  return {
    workflow_id: params.get("wf"),
    run_id: params.get("run"),
    selected_edge_id: params.get("edge"),
    timeline_filter:
      timelineFilter === "deployment_context" || timelineFilter === "replay_drift"
        ? timelineFilter
        : "all",
    focused_node_id: params.get("focus"),
    selected_deployment_id: params.get("dep"),
    selected_node_id: params.get("node"),
    drift_filter:
      driftFilter === "deployment" || driftFilter === "replay" || driftFilter === "any"
        ? driftFilter
        : "all",
    sort_mode: sortMode === "drift_desc" ? "drift_desc" : "recent",
    selected_review_id: params.get("srid"),
    show_all_saved_reviews: params.get("sra") === "1",
    saved_review_filter: params.get("srf") ?? "",
    saved_review_sort_mode: savedReviewSortMode === "recent" ? "recent" : "priority",
    saved_review_share_mode_filter:
      savedReviewShareModeFilter === "workspace" || savedReviewShareModeFilter === "core"
        ? savedReviewShareModeFilter
        : "all",
    saved_review_pinned_only: savedReviewPinnedOnly === "1",
  };
}

export function workflowReviewUrlStateForWorkflow(
  urlState: ReviewUrlState | null,
  workflowId: string | null,
): ReviewUrlState | null {
  return urlState?.workflow_id === workflowId ? urlState : null;
}

export function inferWorkflowSharedReviewShareModeFromHref(
  href: string,
  origin: string,
): "workspace" | "core" {
  try {
    const parsed = new URL(href, origin);
    const reviewState = readWorkflowReviewUrlStateFromSearch(parsed.search);
    if (
      reviewState?.selected_review_id
      || reviewState?.show_all_saved_reviews
      || !!reviewState?.saved_review_filter
      || reviewState?.saved_review_sort_mode === "recent"
    ) {
      return "workspace";
    }
  } catch {
    // Fall back to the lighter core-review mode if the stored URL cannot be parsed.
  }
  return "core";
}

export function workflowSharedReviewShareModeFromUrlState(
  urlState: ReviewUrlState,
): "workspace" | "core" {
  return (
    urlState.selected_review_id
    || urlState.show_all_saved_reviews
    || !!urlState.saved_review_filter
    || urlState.saved_review_sort_mode === "recent"
  )
    ? "workspace"
    : "core";
}

export function workflowSharedReviewMatchesWorkflowId(
  href: string,
  workflowId: string,
  origin: string,
): boolean {
  try {
    const parsed = new URL(href, origin);
    const reviewState = readWorkflowReviewUrlStateFromSearch(parsed.search);
    return !reviewState?.workflow_id || reviewState.workflow_id === workflowId;
  } catch {
    return false;
  }
}

export function workflowStoredSharedReviewRecordsForWorkflow(
  linksByWorkflow: Record<string, readonly StoredSharedReviewLink[]>,
  workflowId: string | null | undefined,
  origin: string,
): StoredSharedReviewLink[] {
  if (!workflowId) return [];
  return [...(linksByWorkflow[workflowId] ?? [])].filter((record) =>
    !!record?.href && workflowSharedReviewMatchesWorkflowId(record.href, workflowId, origin)
  );
}

export function readWorkflowStoredSharedReviewRecordState(
  record: Pick<StoredSharedReviewLink, "href" | "share_mode">,
  origin: string,
): WorkflowStoredSharedReviewRecordState | null {
  try {
    const parsedUrl = new URL(record.href, origin);
    const reviewState = readWorkflowReviewUrlStateFromSearch(parsedUrl.search);
    return {
      parsedUrl,
      reviewState,
      shareMode:
        record.share_mode === "workspace" || record.share_mode === "core"
          ? record.share_mode
          : reviewState
            ? workflowSharedReviewShareModeFromUrlState(reviewState)
            : "core",
    };
  } catch {
    return null;
  }
}

export function workflowStoredSharedReviewRecordStatesForWorkflow(
  records: readonly StoredSharedReviewLink[],
  origin: string,
): WorkflowStoredSharedReviewRecordStateEntry[] {
  return records.map((record) => ({
    record,
    recordState: readWorkflowStoredSharedReviewRecordState(record, origin),
  }));
}

export function workflowSelectedStoredSharedReviewRecord(
  records: readonly StoredSharedReviewLink[],
  selectedId: string | null | undefined,
): StoredSharedReviewLink | null {
  return records.find((record) => record.id === selectedId) ?? records[0] ?? null;
}

export function workflowSelectedStoredSharedReviewRecordState(
  entries: readonly WorkflowStoredSharedReviewRecordStateEntry[],
  recordId: string | null | undefined,
): WorkflowStoredSharedReviewRecordStateEntry | null {
  if (!recordId) return null;
  return entries.find((entry) => entry.record.id === recordId) ?? null;
}

export function workflowReviewLinkFeedback(args: {
  copied: boolean;
  href: string;
  includeSavedReviewWorkspace: boolean;
  savedReviewWorkspaceActive: boolean;
}): string {
  if (args.copied) {
    return args.includeSavedReviewWorkspace && args.savedReviewWorkspaceActive
      ? "Copied investigation link to clipboard with the current run review and saved-review workspace context."
      : "Copied investigation link to clipboard with the current run review context only.";
  }
  return args.includeSavedReviewWorkspace && args.savedReviewWorkspaceActive
    ? `Copy this investigation link manually. It includes the current run review and saved-review workspace context: ${args.href}`
    : `Copy this investigation link manually. It includes the current run review context only: ${args.href}`;
}

export function workflowStoredSharedReviewClearPreflightFeedback(
  workflowId: string | null | undefined,
  record: StoredSharedReviewLink | null | undefined,
): string | null {
  return workflowId && record
    ? null
    : "No stored shared investigation context is available to clear.";
}

export function workflowStoredSharedReviewClearedFeedback(): string {
  return "Cleared the stored shared investigation context for this workflow.";
}

export function workflowStoredSharedReviewRefreshPreflightFeedback(
  workflowId: string | null | undefined,
): string | null {
  return workflowId
    ? null
    : "Select a workflow before refreshing its stored shared investigation.";
}

export function workflowStoredSharedReviewRefreshedFeedback(): string {
  return "Updated the stored shared investigation to match the current review context.";
}

export function workflowStoredSharedReviewRenamePreflightFeedback(
  workflowId: string | null | undefined,
  record: StoredSharedReviewLink | null | undefined,
): string | null {
  return workflowId && record
    ? null
    : "No stored shared investigation is selected to rename.";
}

export function workflowStoredSharedReviewRenamePromptUnavailableFeedback(): string {
  return "Could not open the saved investigation rename prompt.";
}

export function workflowStoredSharedReviewPinPreflightFeedback(
  workflowId: string | null | undefined,
  record: StoredSharedReviewLink | null | undefined,
): string | null {
  return workflowId && record
    ? null
    : "No stored shared investigation is selected to pin.";
}

export function workflowStoredSharedReviewResumeTarget(
  entry: WorkflowStoredSharedReviewRecordStateEntry | null | undefined,
): WorkflowStoredSharedReviewResumeTarget | null {
  const record = entry?.record;
  const recordState = entry?.recordState;
  if (!record?.href || !recordState) return null;
  return {
    nextUrl: `${recordState.parsedUrl.pathname}${recordState.parsedUrl.search}${recordState.parsedUrl.hash}`,
    reviewState: recordState.reviewState,
    shareMode: recordState.shareMode,
  };
}

export function workflowStoredSharedReviewResumeFeedback(
  shareMode: "workspace" | "core",
): string {
  return shareMode === "workspace"
    ? "Restored the stored shared investigation and its saved-review workspace context for this workflow."
    : "Restored the stored shared investigation context for this workflow.";
}

export function workflowStoredSharedReviewRenameFeedback(rawTitle: string): string {
  const title = rawTitle.trim();
  return title
    ? `Renamed the saved investigation to "${title}".`
    : "Cleared the custom name for the saved investigation.";
}

export function workflowStoredSharedReviewPinFeedback(wasPinned: boolean): string {
  return wasPinned
    ? "Unpinned the saved investigation."
    : "Pinned the saved investigation.";
}

export function workflowRunReviewContextFromUrlState(
  urlState: ReviewUrlState,
): PersistedRunReviewContext {
  return {
    selected_edge_id: urlState.selected_edge_id,
    timeline_filter: urlState.timeline_filter,
    focused_node_id: urlState.focused_node_id,
    selected_deployment_id: urlState.selected_deployment_id,
    selected_node_id: urlState.selected_node_id,
  };
}

export function resolveWorkflowRunReviewContextSelection(args: {
  context: PersistedRunReviewContext | null;
  nodes: readonly WorkflowReviewNodeLike[] | null | undefined;
  edges: readonly WorkflowReviewEdgeLike[] | null | undefined;
  deployments: readonly WorkflowReviewDeploymentLike[] | null | undefined;
}): WorkflowRunReviewContextSelection {
  const { context, nodes, edges, deployments } = args;
  if (!context) {
    return {
      selectedNodeId: null,
      selectedRunEdgeId: null,
      runTimelineFilterMode: "all",
      runTimelineFocusNodeId: null,
      selectedDeploymentRecordId: null,
    };
  }

  const hasNode = (nodeId: string | null | undefined) =>
    !!nodeId && !!nodes?.some((node) => node.id === nodeId);
  const hasEdge = (edgeId: string | null | undefined) =>
    !!edgeId && !!edges?.some((edge) => edge.id === edgeId);
  const hasDeployment = (deploymentId: string | null | undefined) =>
    !!deploymentId && !!deployments?.some((deployment) => deployment.deployment_id === deploymentId);

  return {
    selectedNodeId: hasNode(context.selected_node_id) ? context.selected_node_id : null,
    selectedRunEdgeId: hasEdge(context.selected_edge_id) ? context.selected_edge_id : null,
    runTimelineFilterMode: context.timeline_filter ?? "all",
    runTimelineFocusNodeId: hasNode(context.focused_node_id) ? context.focused_node_id : null,
    selectedDeploymentRecordId: hasDeployment(context.selected_deployment_id)
      ? context.selected_deployment_id
      : null,
  };
}

export function workflowStoredSharedReviewUiStateFromUrlState(
  urlState: ReviewUrlState,
): WorkflowStoredSharedReviewUiState {
  return {
    selectedReviewId: urlState.selected_review_id,
    showAll: urlState.show_all_saved_reviews,
    filterText: urlState.saved_review_filter,
    sortMode: urlState.saved_review_sort_mode,
    shareModeFilter: urlState.saved_review_share_mode_filter,
    pinnedOnly: urlState.saved_review_pinned_only,
  };
}

export function workflowStoredSharedReviewUiStateAfterCompositionFocus(
  current: WorkflowStoredSharedReviewUiState,
  key: WorkflowStoredSharedReviewCompositionFocus,
): WorkflowStoredSharedReviewUiState {
  if (key === "all") {
    return {
      ...current,
      showAll: true,
      filterText: "",
      shareModeFilter: "all",
      pinnedOnly: false,
    };
  }
  if (key === "pinned") {
    return {
      ...current,
      showAll: true,
      sortMode: "priority",
      pinnedOnly: true,
    };
  }
  return {
    ...current,
    showAll: true,
    shareModeFilter: key,
    pinnedOnly: false,
  };
}

export function workflowStoredSharedReviewUiStateAfterActiveFilterClear(
  current: WorkflowStoredSharedReviewUiState,
  key: WorkflowStoredSharedReviewActiveFilterKey,
): WorkflowStoredSharedReviewUiState {
  if (key === "pinned_only") return { ...current, pinnedOnly: false };
  if (key === "share_mode") return { ...current, shareModeFilter: "all" };
  return { ...current, filterText: "" };
}

export function workflowStoredSharedReviewUiStateAfterPreviewContextClear(
  current: WorkflowStoredSharedReviewUiState,
  key: WorkflowStoredSharedReviewPreviewContextKey,
): WorkflowStoredSharedReviewUiState {
  if (key === "expanded") return { ...current, showAll: false };
  if (key === "sort_mode") return { ...current, sortMode: "priority" };
  return workflowStoredSharedReviewUiStateAfterActiveFilterClear(current, key);
}

export function workflowStoredSharedReviewUiStateAfterPreviewContextReset(
  current: WorkflowStoredSharedReviewUiState,
): WorkflowStoredSharedReviewUiState {
  return {
    ...current,
    showAll: false,
    filterText: "",
    sortMode: "priority",
    shareModeFilter: "all",
    pinnedOnly: false,
  };
}

export function upsertWorkflowRunSelection(
  current: Record<string, string>,
  workflowId: string | null | undefined,
  runId: string | null | undefined,
): Record<string, string> {
  if (!workflowId || !runId) return current;
  return current[workflowId] === runId ? current : { ...current, [workflowId]: runId };
}

export function workflowRunReviewContextForPersistence(args: {
  focusedNodeId: string | null;
  runTimelineFilterMode: RunTimelineFilterMode;
  selectedDeploymentRecordId: string | null;
  selectedNodeId: string | null;
  selectedRunEdgeId: string | null;
}): PersistedRunReviewContext {
  return {
    selected_edge_id: args.selectedRunEdgeId,
    timeline_filter: args.runTimelineFilterMode,
    focused_node_id: args.focusedNodeId,
    selected_deployment_id: args.selectedDeploymentRecordId,
    selected_node_id: args.selectedNodeId,
  };
}

export function upsertWorkflowRunReviewContext(
  current: Record<string, PersistedRunReviewContext>,
  workflowId: string | null | undefined,
  nextContext: PersistedRunReviewContext,
): Record<string, PersistedRunReviewContext> {
  if (!workflowId) return current;
  const previous = current[workflowId];
  if (
    previous
    && previous.selected_edge_id === nextContext.selected_edge_id
    && previous.timeline_filter === nextContext.timeline_filter
    && previous.focused_node_id === nextContext.focused_node_id
    && previous.selected_deployment_id === nextContext.selected_deployment_id
    && previous.selected_node_id === nextContext.selected_node_id
  ) {
    return current;
  }
  return { ...current, [workflowId]: nextContext };
}

export function workflowStoredSharedReviewUiContextForPersistence(args: {
  filterText: string;
  pinnedOnly: boolean;
  selectedReviewId: string | null;
  shareModeFilter: "all" | "workspace" | "core";
  showAll: boolean;
  sortMode: "priority" | "recent";
}): PersistedStoredSharedReviewUiContext {
  return {
    selected_review_id: args.selectedReviewId,
    show_all: args.showAll,
    filter_text: args.filterText,
    sort_mode: args.sortMode,
    share_mode_filter: args.shareModeFilter,
    pinned_only: args.pinnedOnly,
  };
}

export function upsertWorkflowStoredSharedReviewUiContext(
  current: Record<string, PersistedStoredSharedReviewUiContext>,
  workflowId: string | null | undefined,
  nextContext: PersistedStoredSharedReviewUiContext,
): Record<string, PersistedStoredSharedReviewUiContext> {
  if (!workflowId) return current;
  const previous = current[workflowId];
  if (
    previous
    && previous.selected_review_id === nextContext.selected_review_id
    && previous.show_all === nextContext.show_all
    && previous.filter_text === nextContext.filter_text
    && previous.sort_mode === nextContext.sort_mode
    && previous.share_mode_filter === nextContext.share_mode_filter
    && previous.pinned_only === nextContext.pinned_only
  ) {
    return current;
  }
  return { ...current, [workflowId]: nextContext };
}

export function resolveWorkflowStoredSharedReviewUiState(args: {
  workflowId: string | null;
  pendingUrlState: ReviewUrlState | null;
  persistedContext: PersistedStoredSharedReviewUiContext | null;
}): WorkflowStoredSharedReviewUiState {
  const urlContext = workflowReviewUrlStateForWorkflow(args.pendingUrlState, args.workflowId);
  return {
    selectedReviewId: urlContext?.selected_review_id ?? args.persistedContext?.selected_review_id ?? null,
    showAll: urlContext?.show_all_saved_reviews ?? args.persistedContext?.show_all ?? false,
    filterText: urlContext?.saved_review_filter ?? args.persistedContext?.filter_text ?? "",
    sortMode: urlContext?.saved_review_sort_mode ?? args.persistedContext?.sort_mode ?? "priority",
    shareModeFilter:
      urlContext?.saved_review_share_mode_filter
      ?? args.persistedContext?.share_mode_filter
      ?? "all",
    pinnedOnly: urlContext?.saved_review_pinned_only ?? args.persistedContext?.pinned_only ?? false,
  };
}

export function resolveWorkflowStoredSharedReviewSelection(args: {
  records: readonly Pick<StoredSharedReviewLink, "id">[];
  selectedId: string | null | undefined;
  urlSelectedId: string | null | undefined;
  persistedSelectedId: string | null | undefined;
}): string | null {
  const hasRecord = (id: string | null | undefined): id is string =>
    typeof id === "string" && args.records.some((record) => record.id === id);

  if (hasRecord(args.selectedId)) return args.selectedId;
  if (hasRecord(args.urlSelectedId)) return args.urlSelectedId;
  if (hasRecord(args.persistedSelectedId)) return args.persistedSelectedId;
  return args.records[0]?.id ?? null;
}

export function workflowStoredSharedReviewNarrowingState(args: {
  recordCount: number;
  showAll: boolean;
  filterText: string;
}): { showAll: boolean; filterText: string } {
  const showAll = args.recordCount > 4 && args.showAll;
  return {
    showAll,
    filterText: showAll ? args.filterText : "",
  };
}

function workflowStoredSharedReviewTimestampMs(value: string | null | undefined): number {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : 0;
}

function sortWorkflowStoredSharedReviewLinks(
  records: StoredSharedReviewLink[],
): StoredSharedReviewLink[] {
  return [...records].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return workflowStoredSharedReviewTimestampMs(right.saved_at)
      - workflowStoredSharedReviewTimestampMs(left.saved_at);
  });
}

export function upsertWorkflowStoredSharedReviewLink(
  current: Record<string, StoredSharedReviewLink[]>,
  args: {
    workflowId: string | null | undefined;
    href: string;
    savedAt: string;
    environment: string | null;
    deploymentId: string | null;
    shareMode: "workspace" | "core";
    createId: () => string;
    shareModeForRecord?: (record: Pick<StoredSharedReviewLink, "href" | "share_mode">) => "workspace" | "core";
    limit?: number;
  },
): Record<string, StoredSharedReviewLink[]> {
  if (!args.workflowId) return current;
  const previousEntries = current[args.workflowId] ?? [];
  const existing = previousEntries.find((entry) =>
    entry.href === args.href
    && entry.environment === args.environment
    && entry.deployment_id === args.deploymentId,
  );
  const nextEntry: StoredSharedReviewLink = existing
    ? { ...existing, saved_at: args.savedAt, share_mode: args.shareMode }
    : {
        id: args.createId(),
        href: args.href,
        saved_at: args.savedAt,
        environment: args.environment,
        deployment_id: args.deploymentId,
        share_mode: args.shareMode,
        title: null,
        pinned: false,
      };
  const nextEntries = sortWorkflowStoredSharedReviewLinks([
    nextEntry,
    ...previousEntries.filter((entry) => entry.id !== nextEntry.id),
  ]).slice(0, args.limit ?? 5);
  const shareModeForRecord = args.shareModeForRecord ?? ((record) => record.share_mode ?? "core");
  if (
    previousEntries.length === nextEntries.length
    && previousEntries.every((entry, index) => {
      const next = nextEntries[index];
      return !!next
        && entry.id === next.id
        && entry.saved_at === next.saved_at
        && entry.href === next.href
        && entry.environment === next.environment
        && entry.deployment_id === next.deployment_id
        && shareModeForRecord(entry) === next.share_mode
        && entry.title === next.title
        && entry.pinned === next.pinned;
    })
  ) {
    return current;
  }
  return { ...current, [args.workflowId]: nextEntries };
}

export function updateWorkflowStoredSharedReviewLink(
  current: Record<string, StoredSharedReviewLink[]>,
  workflowId: string | null | undefined,
  reviewId: string | null | undefined,
  updater: (record: StoredSharedReviewLink) => StoredSharedReviewLink,
): Record<string, StoredSharedReviewLink[]> {
  if (!workflowId || !reviewId) return current;
  const existing = current[workflowId] ?? [];
  let changed = false;
  const nextEntries = sortWorkflowStoredSharedReviewLinks(
    existing.map((entry) => {
      if (entry.id !== reviewId) return entry;
      changed = true;
      return updater(entry);
    }),
  );
  if (!changed) return current;
  return { ...current, [workflowId]: nextEntries };
}

export function clearWorkflowStoredSharedReviewLinks(
  current: Record<string, StoredSharedReviewLink[]>,
  workflowId: string | null | undefined,
  reviewId?: string | null,
): Record<string, StoredSharedReviewLink[]> {
  if (!workflowId || !(workflowId in current)) return current;
  const existing = current[workflowId] ?? [];
  if (!reviewId) {
    const next = { ...current };
    delete next[workflowId];
    return next;
  }
  const remaining = existing.filter((entry) => entry.id !== reviewId);
  if (remaining.length === existing.length) return current;
  const next = { ...current };
  if (remaining.length === 0) delete next[workflowId];
  else next[workflowId] = remaining;
  return next;
}

export function resolveWorkflowSelectedRunId(args: {
  runs: WorkflowRunLike[];
  preferredRunId?: string | null;
  persistedRunId?: string | null;
  currentRunId?: string | null;
}): string | null {
  const hasRunId = (runId: string | null | undefined): runId is string =>
    typeof runId === "string" && args.runs.some((run) => run.run_id === runId);

  if (hasRunId(args.currentRunId)) return args.currentRunId;
  if (hasRunId(args.preferredRunId)) return args.preferredRunId;
  if (hasRunId(args.persistedRunId)) return args.persistedRunId;
  return args.runs[0]?.run_id ?? null;
}

export function resolveWorkflowIdToLoad(args: {
  workflows: WorkflowLike[];
  preferredWorkflowId?: string | null;
  currentWorkflowPresent: boolean;
}): string | null {
  if (args.currentWorkflowPresent || args.workflows.length === 0) return null;
  const preferredWorkflowId = args.preferredWorkflowId;
  if (
    typeof preferredWorkflowId === "string"
    && args.workflows.some((workflow) => workflow.workflow_id === preferredWorkflowId)
  ) {
    return preferredWorkflowId;
  }
  return args.workflows[0]?.workflow_id ?? null;
}

export function resolveWorkflowRunReviewContextRestorePlan(args: {
  workflowId: string | null | undefined;
  pendingUrlState: ReviewUrlState | null;
  persistedContext?: PersistedRunReviewContext | null;
}): WorkflowRunReviewContextRestorePlan {
  const workflowUrlState = workflowReviewUrlStateForWorkflow(args.pendingUrlState, args.workflowId ?? null);
  if (workflowUrlState) {
    return {
      clearPendingUrlReviewState: true,
      context: workflowRunReviewContextFromUrlState(workflowUrlState),
      persistSharedReviewLink: true,
      shareMode: workflowSharedReviewShareModeFromUrlState(workflowUrlState),
      showSharedReviewBanner: true,
      workflowUrlState,
    };
  }
  return {
    clearPendingUrlReviewState: false,
    context: args.persistedContext ?? null,
    persistSharedReviewLink: false,
    shareMode: null,
    showSharedReviewBanner: false,
    workflowUrlState: null,
  };
}

export function resolveWorkflowReviewUrlNavigationPlan(args: {
  urlState: ReviewUrlState | null;
  currentWorkflowId: string | null;
  runs: WorkflowRunLike[];
  persistedRunId?: string | null;
}): WorkflowReviewUrlNavigationPlan {
  if (!args.urlState) {
    return {
      kind: "clear",
      driftFilter: "all",
      sortMode: "recent",
      selectedRunId: resolveWorkflowSelectedRunId({
        runs: args.runs,
        persistedRunId: args.persistedRunId,
      }),
    };
  }

  if (args.urlState.workflow_id && args.urlState.workflow_id !== args.currentWorkflowId) {
    return {
      kind: "load-workflow",
      driftFilter: args.urlState.drift_filter,
      sortMode: args.urlState.sort_mode,
      pendingUrlState: args.urlState,
      workflowIdToLoad: args.urlState.workflow_id,
    };
  }

  return {
    kind: "apply",
    driftFilter: args.urlState.drift_filter,
    sortMode: args.urlState.sort_mode,
    pendingUrlState: args.urlState,
    selectedRunId: resolveWorkflowSelectedRunId({
      runs: args.runs,
      preferredRunId: args.urlState.run_id,
    }),
    runReviewContext: workflowRunReviewContextFromUrlState(args.urlState),
    sharedReviewUiState: workflowStoredSharedReviewUiStateFromUrlState(args.urlState),
  };
}

type WorkflowRunHistoryReviewStoragePayload = {
  drift_filter: RunHistoryDriftFilter;
  sort_mode: RunHistorySortMode;
  selected_runs: Record<string, string>;
  review_contexts: Record<string, PersistedRunReviewContext>;
  shared_review_ui_contexts: Record<string, PersistedStoredSharedReviewUiContext>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function workflowReviewLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function scopedWorkflowReviewStorageKey(baseKey: string, userId?: string | null): string {
  return accountScopedStorageKey(baseKey, userId ?? null);
}

function loadWorkflowReviewStorageValue(baseKey: string, userId?: string | null): string | null {
  const storage = workflowReviewLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(accountScopedStorageReadKey(baseKey, userId));
  } catch {
    return null;
  }
}

function removeStoredJson(key: string, userId?: string | null): void {
  const storage = workflowReviewLocalStorage();
  if (!storage) return;
  try {
    const scopedKey = scopedWorkflowReviewStorageKey(key, userId);
    storage.removeItem(scopedKey);
    if (scopedKey !== key) storage.removeItem(key);
  } catch {
    // Review persistence is opportunistic; the current in-memory state remains authoritative.
  }
}

function readStoredJson(key: string, userId?: string | null): unknown {
  const storage = workflowReviewLocalStorage();
  if (!storage) return null;
  try {
    const scopedKey = scopedWorkflowReviewStorageKey(key, userId);
    const raw = loadWorkflowReviewStorageValue(key, userId);
    const parsed = parseStoredJson(raw);
    if (parsed === null && raw !== null) {
      removeStoredJson(key, userId);
      return null;
    }
    if (raw !== null) {
      if (storage.getItem(scopedKey) !== raw) storage.setItem(scopedKey, raw);
      if (scopedKey !== key) storage.removeItem(key);
    }
    return parsed;
  } catch {
    removeStoredJson(key, userId);
    return null;
  }
}

function writeStoredJson(key: string, value: unknown, userId?: string | null): void {
  const storage = workflowReviewLocalStorage();
  if (!storage) return;
  try {
    const scopedKey = scopedWorkflowReviewStorageKey(key, userId);
    storage.setItem(scopedKey, JSON.stringify(value));
    if (scopedKey !== key) storage.removeItem(key);
  } catch {
    // Review persistence is opportunistic; the current in-memory state remains authoritative.
  }
}

function parseStoredJson(raw: string | null): unknown {
  if (!raw) return null;
  const parsed = parseJsonValue(raw);
  return parsed.ok ? parsed.value : null;
}

function isRunTimelineFilterMode(value: unknown): value is RunTimelineFilterMode {
  return value === "all" || value === "deployment_context" || value === "replay_drift";
}

function normalizePersistedRunReviewContext(
  value: unknown,
): PersistedRunReviewContext | null {
  if (!isRecord(value) || !isRunTimelineFilterMode(value.timeline_filter)) return null;
  return {
    selected_edge_id: readTrimmedString(value.selected_edge_id),
    timeline_filter: value.timeline_filter,
    focused_node_id: readTrimmedString(value.focused_node_id),
    selected_deployment_id: readTrimmedString(value.selected_deployment_id),
    selected_node_id: readTrimmedString(value.selected_node_id),
  };
}

function normalizePersistedStoredSharedReviewUiContext(
  value: unknown,
): PersistedStoredSharedReviewUiContext | null {
  if (!isRecord(value)) return null;
  if (value.sort_mode !== "priority" && value.sort_mode !== "recent") return null;
  return {
    selected_review_id: readTrimmedString(value.selected_review_id),
    show_all: value.show_all === true,
    filter_text: typeof value.filter_text === "string" ? value.filter_text : "",
    sort_mode: value.sort_mode,
    share_mode_filter:
      value.share_mode_filter === "workspace" || value.share_mode_filter === "core"
        ? value.share_mode_filter
        : "all",
    pinned_only: value.pinned_only === true,
  };
}

export function loadWorkflowRunHistoryReviewStorageState(
  userId?: string | null,
): WorkflowRunHistoryReviewStorageState {
  const parsed = readStoredJson(WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY, userId);
  const defaultState: WorkflowRunHistoryReviewStorageState = {
    driftFilter: "all",
    sortMode: "recent",
    selectedRuns: {},
    reviewContexts: {},
    sharedReviewUiContexts: {},
  };
  if (!isRecord(parsed)) {
    return defaultState;
  }

  const selectedRuns = isRecord(parsed.selected_runs)
    ? Object.fromEntries(
        Object.entries(parsed.selected_runs)
          .flatMap(([workflowId, runId]) => {
            const normalizedWorkflowId = readTrimmedString(workflowId);
            const normalizedRunId = readTrimmedString(runId);
            return normalizedWorkflowId && normalizedRunId
              ? [[normalizedWorkflowId, normalizedRunId] as const]
              : [];
          }),
      )
    : {};

  const reviewContexts = isRecord(parsed.review_contexts)
    ? Object.fromEntries(
        Object.entries(parsed.review_contexts)
          .flatMap(([workflowId, context]) => {
            const normalizedWorkflowId = readTrimmedString(workflowId);
            const normalizedContext = normalizePersistedRunReviewContext(context);
            return normalizedWorkflowId && normalizedContext
              ? [[normalizedWorkflowId, normalizedContext] as const]
              : [];
          }),
      )
    : {};

  const sharedReviewUiContexts = isRecord(parsed.shared_review_ui_contexts)
    ? Object.fromEntries(
        Object.entries(parsed.shared_review_ui_contexts)
          .flatMap(([workflowId, context]) => {
            const normalizedWorkflowId = readTrimmedString(workflowId);
            const normalizedContext = normalizePersistedStoredSharedReviewUiContext(context);
            return normalizedWorkflowId && normalizedContext
              ? [[normalizedWorkflowId, normalizedContext] as const]
              : [];
          }),
      )
    : {};

  const normalizedState: WorkflowRunHistoryReviewStorageState = {
    driftFilter:
      parsed.drift_filter === "deployment"
      || parsed.drift_filter === "replay"
      || parsed.drift_filter === "any"
        ? parsed.drift_filter
        : "all",
    sortMode: parsed.sort_mode === "drift_desc" ? "drift_desc" : "recent",
    selectedRuns,
    reviewContexts,
    sharedReviewUiContexts,
  };
  writeStoredJson(
    WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY,
    serializeWorkflowRunHistoryReviewStorageState(normalizedState),
    userId,
  );
  return normalizedState;
}

function normalizeSelectedRuns(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([workflowId, runId]) => {
      const normalizedWorkflowId = readTrimmedString(workflowId);
      const normalizedRunId = readTrimmedString(runId);
      return normalizedWorkflowId && normalizedRunId
        ? [[normalizedWorkflowId, normalizedRunId] as const]
        : [];
    }),
  );
}

function normalizePersistedRunReviewContexts(
  value: Record<string, PersistedRunReviewContext>,
): Record<string, PersistedRunReviewContext> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([workflowId, context]) => {
      const normalizedWorkflowId = readTrimmedString(workflowId);
      const normalizedContext = normalizePersistedRunReviewContext(context);
      return normalizedWorkflowId && normalizedContext
        ? [[normalizedWorkflowId, normalizedContext] as const]
        : [];
    }),
  );
}

function normalizePersistedStoredSharedReviewUiContexts(
  value: Record<string, PersistedStoredSharedReviewUiContext>,
): Record<string, PersistedStoredSharedReviewUiContext> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([workflowId, context]) => {
      const normalizedWorkflowId = readTrimmedString(workflowId);
      const normalizedContext = normalizePersistedStoredSharedReviewUiContext(context);
      return normalizedWorkflowId && normalizedContext
        ? [[normalizedWorkflowId, normalizedContext] as const]
        : [];
    }),
  );
}

function serializeWorkflowRunHistoryReviewStorageState(
  state: WorkflowRunHistoryReviewStorageState,
): WorkflowRunHistoryReviewStoragePayload {
  return {
    drift_filter:
      state.driftFilter === "deployment"
      || state.driftFilter === "replay"
      || state.driftFilter === "any"
        ? state.driftFilter
        : "all",
    sort_mode: state.sortMode === "drift_desc" ? "drift_desc" : "recent",
    selected_runs: normalizeSelectedRuns(state.selectedRuns),
    review_contexts: normalizePersistedRunReviewContexts(state.reviewContexts),
    shared_review_ui_contexts: normalizePersistedStoredSharedReviewUiContexts(
      state.sharedReviewUiContexts,
    ),
  };
}

export function persistWorkflowRunHistoryReviewStorageState(
  state: WorkflowRunHistoryReviewStorageState,
  userId?: string | null,
): void {
  writeStoredJson(
    WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY,
    serializeWorkflowRunHistoryReviewStorageState(state),
    userId,
  );
}

type WorkflowSharedReviewLoaderOptions = {
  createId: (prefix: string) => string;
  inferShareMode: (href: string) => "workspace" | "core";
  now?: () => string;
};

function normalizeStoredSharedReviewLink(
  value: unknown,
  options: Required<WorkflowSharedReviewLoaderOptions>,
): StoredSharedReviewLink | null {
  if (typeof value === "string") {
    const href = readTrimmedString(value);
    return href
      ? {
          id: options.createId("shared_review"),
          href,
          saved_at: options.now(),
          environment: null,
          deployment_id: null,
          share_mode: options.inferShareMode(href),
          title: null,
          pinned: false,
        }
      : null;
  }
  if (!isRecord(value)) return null;
  const href = readTrimmedString(value.href);
  if (!href) return null;
  return {
    id: readTrimmedString(value.id) ?? options.createId("shared_review"),
    href,
    saved_at: readTrimmedString(value.saved_at) ?? options.now(),
    environment: readTrimmedString(value.environment),
    deployment_id: readTrimmedString(value.deployment_id),
    share_mode:
      value.share_mode === "workspace" || value.share_mode === "core"
        ? value.share_mode
        : options.inferShareMode(href),
    title: readTrimmedString(value.title),
    pinned: value.pinned === true,
  };
}

export function loadWorkflowSharedReviewLinksStorage(
  options: WorkflowSharedReviewLoaderOptions,
  userId?: string | null,
): Record<string, StoredSharedReviewLink[]> {
  const parsed = readStoredJson(WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY, userId);
  if (!isRecord(parsed)) return {};

  const normalizedOptions: Required<WorkflowSharedReviewLoaderOptions> = {
    ...options,
    now: options.now ?? (() => new Date().toISOString()),
  };

  const normalizedEntries = Object.entries(parsed).flatMap(
    ([workflowId, value]): [string, StoredSharedReviewLink[]][] => {
      const normalizedWorkflowId = readTrimmedString(workflowId);
      if (!normalizedWorkflowId) return [];
      if (Array.isArray(value)) {
        const entries = value
          .map((entry) => normalizeStoredSharedReviewLink(entry, normalizedOptions))
          .filter((entry): entry is StoredSharedReviewLink => entry !== null);
        return entries.length > 0
          ? [[normalizedWorkflowId, entries.slice(0, 5)]]
          : [];
      }
      const normalized = normalizeStoredSharedReviewLink(value, normalizedOptions);
      return normalized ? [[normalizedWorkflowId, [normalized]]] : [];
    },
  );
  const normalized = Object.fromEntries(normalizedEntries);
  writeStoredJson(WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY, normalized, userId);
  return normalized;
}

type WorkflowSharedReviewPersistOptions = {
  inferShareMode: (href: string) => "workspace" | "core";
};

function normalizeStoredSharedReviewLinkForPersistence(
  value: StoredSharedReviewLink,
  options: WorkflowSharedReviewPersistOptions,
): StoredSharedReviewLink | null {
  const href = readTrimmedString(value.href);
  if (!href) return null;
  return {
    id: readTrimmedString(value.id) ?? "shared_review",
    href,
    saved_at: readTrimmedString(value.saved_at) ?? new Date().toISOString(),
    environment: readTrimmedString(value.environment),
    deployment_id: readTrimmedString(value.deployment_id),
    share_mode:
      value.share_mode === "workspace" || value.share_mode === "core"
        ? value.share_mode
        : options.inferShareMode(href),
    title: readTrimmedString(value.title),
    pinned: value.pinned === true,
  };
}

function serializeWorkflowSharedReviewLinksStorage(
  value: Record<string, StoredSharedReviewLink[]>,
  options: WorkflowSharedReviewPersistOptions,
): Record<string, StoredSharedReviewLink[]> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([workflowId, records]) => {
      const normalizedWorkflowId = readTrimmedString(workflowId);
      if (!normalizedWorkflowId || !Array.isArray(records)) return [];
      const normalizedRecords = records
        .map((record) => normalizeStoredSharedReviewLinkForPersistence(record, options))
        .filter((record): record is StoredSharedReviewLink => record !== null)
        .slice(0, 5);
      return normalizedRecords.length > 0
        ? [[normalizedWorkflowId, normalizedRecords] as const]
        : [];
    }),
  );
}

export function persistWorkflowSharedReviewLinksStorage(
  value: Record<string, StoredSharedReviewLink[]>,
  options: WorkflowSharedReviewPersistOptions,
  userId?: string | null,
): void {
  writeStoredJson(
    WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY,
    serializeWorkflowSharedReviewLinksStorage(value, options),
    userId,
  );
}
