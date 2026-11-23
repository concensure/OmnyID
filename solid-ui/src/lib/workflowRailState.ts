// @locs-version: 1.0
import {
  deploymentPolicyChanges,
  latestDeploymentForEnvironment,
  nodeDeploymentPolicyFromDeployment,
  pendingDeploymentPolicyForNode,
  runEdgePolicyDeltaSummary,
  runNodePolicyDeltaSummary,
  runPolicyDriftSummary,
  workflowTriggerReadinessBadgeLabel,
  workflowTriggerReadinessSummaryFromStatus,
} from "@/lib/workflowDeploymentHelpers";
import type { WorkflowDeployment, WorkflowRun } from "@/lib/api";
import { parseWorkflowFamilyContext } from "@/lib/workflowFamilyContext";
import type {
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  NodeDeploymentPolicy,
  NodeDeploymentPolicyChange,
  PendingNodeDeploymentPolicy,
  RunTimelineFilterMode,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";
import { runTimelineSteps, timelineFilterSummaryLabel } from "@/lib/workflowRunAnalysis";
import type {
  ReviewUrlState,
  RunHistoryDriftFilter,
  RunHistorySortMode,
  WorkflowFamilyContext,
} from "@/lib/workflowReviewTypes";
import { isRecord } from "@/lib/eventDetail";
import { surfaceDateTimeLabel, surfaceTimeLabel } from "@/lib/surfaceTimestampPresentation";

export type WorkflowVersionSnapshot = { nodes: unknown[]; ts: string };

export type WorkflowRailVersionItem = {
  diffActive: boolean;
  hasPrev: boolean;
  index: number;
  timeLabel: string;
  versionNumber: number;
};

export type WorkflowRailVersionDiff = {
  added: string[];
  label: string;
  removed: string[];
};

export type WorkflowRailBadgeView = {
  className: string;
  label: string;
  title?: string;
};

export type WorkflowPendingDeploymentChangeSummary = {
  changedNodeCount: number;
  pendingNodeCount: number;
};

export type WorkflowDeployPreviewDiffEntry = {
  changes: NodeDeploymentPolicyChange[];
  label: string;
  nodeId: string;
};

export type WorkflowDeploymentEnvironment = "dev" | "prod";

export type WorkflowMinimapBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  nodes: readonly Pick<WorkflowNodeDraft, "position">[];
};

export type WorkflowOutgoingEdgeTarget = {
  edge: WorkflowEdgeDraft;
  targetNode: WorkflowNodeDraft;
};

export type WorkflowRunNodePolicyDelta = {
  changes: NodeDeploymentPolicyChange[];
  deploymentId: string | null;
  source: string;
};

export type WorkflowRunEdgePolicyDelta = WorkflowRunNodePolicyDelta & {
  nodeId: string;
  relation: "from" | "to" | "related";
};

export type WorkflowRailFamilySummary = {
  collapsedCount: number;
  familyCount: number;
};

export type WorkflowRailFamilySummaryLabel = {
  collapsedCount: number;
  familyLabel: string;
};

export type WorkflowRailSearchNode = {
  id: string;
  kind: string;
  label: string;
};

export type WorkflowWaitResumeSummary = {
  activeFollowup: number;
  pending: number;
  resolved: number;
  total: number;
};

export type WorkflowSavedReviewStaleness = {
  label: string;
  reasons: string[];
};

export type WorkflowSavedReviewScopeMismatch = {
  label: string;
  reasons: string[];
};

export type WorkflowSavedReviewShareModeFilter = "all" | "workspace" | "core";
export type WorkflowSavedReviewSortMode = "priority" | "recent";
export type WorkflowSavedReviewFilterKey = "pinned_only" | "share_mode" | "search";
export type WorkflowSavedReviewPreviewContextKey =
  | "expanded"
  | "pinned_only"
  | "share_mode"
  | "search"
  | "sort_mode";

export type WorkflowSavedReviewLabelEntry<TKey extends string> = {
  key: TKey;
  label: string;
};

export type WorkflowSharedReviewBannerSummaryArgs = {
  deployment?: { deployment_id?: string | null; environment?: string | null } | null;
  edge?: Pick<WorkflowEdgeDraft, "condition_label" | "source" | "target"> | null;
  focusedNodeLabel?: string | null;
  run?: { run_id?: string | null } | null;
  runHistoryDriftFilter: RunHistoryDriftFilter;
  runHistorySortMode: RunHistorySortMode;
  runTimelineFilterMode: RunTimelineFilterMode;
  savedReviewLabel?: string | null;
  selectedNodeLabel?: string | null;
  showAllSavedReviews: boolean;
  storedSharedReviewFilter: string;
  storedSharedReviewPinnedOnly: boolean;
  storedSharedReviewShareModeFilter: WorkflowSavedReviewShareModeFilter;
  storedSharedReviewSortMode: WorkflowSavedReviewSortMode;
  visible: boolean;
  workflow?: { title?: string | null } | null;
};

export type WorkflowSharedReviewBannerViewArgs = Omit<
  WorkflowSharedReviewBannerSummaryArgs,
  "deployment" | "edge" | "focusedNodeLabel" | "savedReviewLabel" | "selectedNodeLabel"
> & {
  deploymentId: string | null | undefined;
  deploymentLookup: ReadonlyMap<string, { deployment_id?: string | null; environment?: string | null }>;
  focusedNodeId: string | null | undefined;
  graph: Pick<WorkflowGraphDraft, "edges"> | null | undefined;
  nodeLabels: ReadonlyMap<string, string>;
  selectedEdgeId: string | null | undefined;
  selectedNodeId: string | null | undefined;
  selectedSavedReview?: { label?: string | null } | null;
};

export type WorkflowSavedReviewActiveFilterEntry =
  WorkflowSavedReviewLabelEntry<WorkflowSavedReviewFilterKey> & { priority: number };

export type WorkflowSavedReviewCompositionKey = "all" | "pinned" | "workspace" | "core";

export type WorkflowSavedReviewCompositionEntry =
  WorkflowSavedReviewLabelEntry<WorkflowSavedReviewCompositionKey> & { active: boolean };

export type WorkflowSavedReviewLegendTarget = "pinned" | "workspace" | "core" | "clear_search" | null;

export type WorkflowSavedReviewLegendEntry = WorkflowSavedReviewLabelEntry<WorkflowSavedReviewFilterKey> & {
  target: WorkflowSavedReviewLegendTarget;
};

export type WorkflowSavedReviewSelectorEntry = {
  id: string;
  label: string;
  pinned: boolean;
  share_mode: "workspace" | "core";
};

export type WorkflowSavedReviewSelectorRecord = {
  id: string;
  saved_at?: string | null;
  shareMode: "workspace" | "core";
};

export type WorkflowSavedReviewShareModeCounts = {
  all: number;
  core: number;
  workspace: number;
};

export type WorkflowSavedReviewGroupedSelectorEntries<TEntry extends WorkflowSavedReviewSelectorEntry> = {
  pinned: TEntry[];
  recent: TEntry[];
};

export type WorkflowRunHistoryEntryLike = {
  deploymentImpact: number;
  lineage: Pick<WorkflowFamilyContext, "familyAssetWorkflowId" | "familyId" | "instanceWorkflowId"> | null;
  replayImpact: number;
  run: { started_at?: string | null };
  totalImpact: number;
};

export type WorkflowRunHistoryViewEntry = {
  deploymentImpact: number;
  drift: ReturnType<typeof runPolicyDriftSummary>;
  lineage: WorkflowFamilyContext | null;
  replayImpact: number;
  run: WorkflowRun;
  totalImpact: number;
};

export type WorkflowRunHistoryLineageOptions = {
  assetWorkflowIds: string[];
  familyIds: string[];
  instanceWorkflowIds: string[];
};

export type WorkflowBusyAction =
  | "archive"
  | "compile"
  | "deploy"
  | "dry_run"
  | "favorite"
  | "rollback"
  | "run"
  | "replay"
  | "save"
  | "validate"
  | string;

export function workflowTimestampMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function workflowVersionNodeLabels(nodes: unknown[]): string[] {
  return nodes.map((node) => {
    if (!isRecord(node)) return "?";
    const record = node;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (label) return label;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    return id || "?";
  });
}

export function workflowRailVersionTimeLabel(timestamp: string): string {
  const parsed = workflowTimestampMs(timestamp);
  if (parsed === 0) return "unknown";
  return surfaceTimeLabel(new Date(parsed).toISOString()) || "unknown";
}

export function workflowRailVersionItems(args: {
  activeDiff: [number, number] | null;
  versions: WorkflowVersionSnapshot[];
}): WorkflowRailVersionItem[] {
  return args.versions.map((version, index) => ({
    diffActive: args.activeDiff !== null && args.activeDiff[0] === index && args.activeDiff[1] === index + 1,
    hasPrev: index < args.versions.length - 1,
    index,
    timeLabel: workflowRailVersionTimeLabel(version.ts),
    versionNumber: args.versions.length - index,
  }));
}

export function workflowRailVersionDiff(args: {
  diffIds: [number, number] | null;
  versions: WorkflowVersionSnapshot[];
}): WorkflowRailVersionDiff | null {
  const ids = args.diffIds;
  if (!ids) return null;
  const vA = args.versions[ids[0]];
  const vB = args.versions[ids[1]];
  if (!vA || !vB) return null;
  const labelsA = new Set(workflowVersionNodeLabels(vA.nodes));
  const labelsB = new Set(workflowVersionNodeLabels(vB.nodes));
  return {
    added: [...labelsA].filter((label) => !labelsB.has(label)),
    label: `v${args.versions.length - ids[1]} -> v${args.versions.length - ids[0]}`,
    removed: [...labelsB].filter((label) => !labelsA.has(label)),
  };
}

export function workflowRailFamilySummaryLabel(
  summary: WorkflowRailFamilySummary,
): WorkflowRailFamilySummaryLabel | null {
  if (summary.familyCount <= 0) return null;
  return {
    collapsedCount: Math.max(0, summary.collapsedCount),
    familyLabel: `${summary.familyCount} branch famil${summary.familyCount === 1 ? "y" : "ies"}`,
  };
}

export function workflowRailNormalizeTags(tags: readonly string[]): string[] {
  const normalized = tags.flatMap((tag) => {
    const trimmed = tag.trim();
    return trimmed ? [trimmed] : [];
  });
  return [...new Map(normalized.map((tag) => [tag.toLowerCase(), tag])).values()];
}

export function workflowRailTagItems(tagsByWorkflow: Record<string, readonly string[]>): string[] {
  return workflowRailNormalizeTags(Object.values(tagsByWorkflow).flat());
}

export function workflowRailTagsAfterSave(
  current: Record<string, readonly string[]>,
  workflowId: string,
  tags: readonly string[],
): Record<string, string[]> {
  const dedupedTags = workflowRailNormalizeTags(tags);
  const next = Object.fromEntries(
    Object.entries(current).map(([key, value]) => [key, [...value]]),
  );
  if (dedupedTags.length > 0) next[workflowId] = dedupedTags;
  else delete next[workflowId];
  return next;
}

export function workflowRailMatchingNodeIds(
  nodes: readonly WorkflowRailSearchNode[],
  rawQuery: string,
): Set<string> | null {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return null;
  const matched = new Set<string>();
  for (const node of nodes) {
    if (
      node.id.toLowerCase().includes(query) ||
      node.label.toLowerCase().includes(query) ||
      node.kind.toLowerCase().includes(query)
    ) {
      matched.add(node.id);
    }
  }
  return matched;
}

export function workflowRailFirstMatchingNodeId(
  nodes: readonly WorkflowRailSearchNode[],
  matchingNodeIds: ReadonlySet<string> | null,
): string | null {
  if (!matchingNodeIds) return null;
  return nodes.find((node) => matchingNodeIds.has(node.id))?.id ?? null;
}

export function workflowRailMatchingNodeSummary(matchCount: number | null): string | null {
  if (matchCount === null) return null;
  return matchCount === 0
    ? "No matches"
    : `${matchCount} node${matchCount === 1 ? "" : "s"} - press Enter to focus first`;
}

export function workflowIdleNodes<TNode extends Pick<WorkflowNodeDraft, "kind">>(
  nodes: readonly TNode[],
): TNode[] {
  return nodes.filter((node) => {
    const kind = node.kind ?? "";
    return kind === "idle" || kind === "failed" || kind === "never_executed";
  });
}

export function workflowSelectedNode<TNode extends { id: string }>(
  graph: { nodes: readonly TNode[] } | null | undefined,
  nodeId: string | null | undefined,
): TNode | null {
  if (!nodeId) return null;
  return graph?.nodes.find((node) => node.id === nodeId) ?? null;
}

export function workflowSelectedEdge<TEdge extends { id: string }>(
  graph: { edges: readonly TEdge[] } | null | undefined,
  edgeId: string | null | undefined,
): TEdge | null {
  if (!edgeId) return null;
  return graph?.edges.find((edge) => edge.id === edgeId) ?? null;
}

export function workflowSelectedRunEdgeIdAfterGraphChange(
  selectedEdgeId: string | null | undefined,
  edges: readonly { id: string }[] | null | undefined,
): string | null {
  if (!selectedEdgeId) return null;
  return edges?.some((edge) => edge.id === selectedEdgeId) ? selectedEdgeId : null;
}

export function workflowSelectedRunEdgeIdAfterRunChange(args: {
  selectedEdgeId: string | null | undefined;
  currentRunId: string | null | undefined;
  previousRunId: string | null | undefined;
  restoringRunReviewContext: boolean;
}): string | null | undefined {
  if (args.restoringRunReviewContext || args.previousRunId === undefined) {
    return args.selectedEdgeId ?? null;
  }
  return args.currentRunId !== args.previousRunId ? null : args.selectedEdgeId ?? null;
}

export function workflowSelectedRun<TRun extends { run_id: string }>(
  runs: readonly TRun[],
  runId: string | null | undefined,
): TRun | null {
  if (runId) {
    const selected = runs.find((run) => run.run_id === runId);
    if (selected) return selected;
  }
  return runs[0] ?? null;
}

export function workflowLatestRunForDeployment<TRun extends { deployment_id?: string | null }>(
  runs: readonly TRun[],
  deploymentId: string | null | undefined,
): TRun | null {
  if (!deploymentId) return null;
  return runs.find((run) => run.deployment_id === deploymentId) ?? null;
}

export function workflowSavedReviewWorkspaceActive(args: {
  selectedSavedReview: unknown;
  showAll: boolean;
  filterText: string;
  sortMode: WorkflowSavedReviewSortMode;
}): boolean {
  return Boolean(args.selectedSavedReview)
    || args.showAll
    || args.filterText.trim().length > 0
    || args.sortMode === "recent";
}

export function workflowMinimapBounds(
  nodes: readonly Pick<WorkflowNodeDraft, "position">[],
): WorkflowMinimapBounds | null {
  if (nodes.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + 180);
    maxY = Math.max(maxY, node.position.y + 80);
  }
  return { minX, minY, maxX, maxY, nodes };
}

export function workflowUpstreamNodeIds(
  nodeId: string | null | undefined,
  edges: readonly Pick<WorkflowEdgeDraft, "source" | "target">[],
): Set<string> {
  const upstream = new Set<string>();
  if (!nodeId) return upstream;
  const walkUp = (currentNodeId: string) => {
    for (const edge of edges) {
      if (edge.target === currentNodeId && !upstream.has(edge.source)) {
        upstream.add(edge.source);
        walkUp(edge.source);
      }
    }
  };
  walkUp(nodeId);
  return upstream;
}

export function workflowDownstreamNodeIds(
  nodeId: string | null | undefined,
  edges: readonly Pick<WorkflowEdgeDraft, "source" | "target">[],
): Set<string> {
  const downstream = new Set<string>();
  if (!nodeId) return downstream;
  const walkDown = (currentNodeId: string) => {
    for (const edge of edges) {
      if (edge.source === currentNodeId && !downstream.has(edge.target)) {
        downstream.add(edge.target);
        walkDown(edge.target);
      }
    }
  };
  walkDown(nodeId);
  return downstream;
}

export function workflowOutgoingTargetNodes(
  nodeId: string | null | undefined,
  nodes: readonly WorkflowNodeDraft[],
  edges: readonly WorkflowEdgeDraft[],
): WorkflowNodeDraft[] {
  if (!nodeId) return [];
  return edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.target))
    .filter((candidate): candidate is WorkflowNodeDraft => Boolean(candidate));
}

export function workflowOutgoingEdgeTargets(
  nodeId: string | null | undefined,
  nodes: readonly WorkflowNodeDraft[],
  edges: readonly WorkflowEdgeDraft[],
): WorkflowOutgoingEdgeTarget[] {
  if (!nodeId) return [];
  return edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => {
      const targetNode = nodes.find((candidate) => candidate.id === edge.target);
      return targetNode ? { edge, targetNode } : null;
    })
    .filter((candidate): candidate is WorkflowOutgoingEdgeTarget => Boolean(candidate));
}

export function workflowSelectedNodeOutgoingTargetNodes(
  graph: WorkflowGraphDraft | null | undefined,
  node: WorkflowNodeDraft | null | undefined,
): WorkflowNodeDraft[] {
  return workflowOutgoingTargetNodes(node?.id, graph?.nodes ?? [], graph?.edges ?? []);
}

export function workflowSelectedNodeOutgoingEdgeTargets(
  graph: WorkflowGraphDraft | null | undefined,
  node: WorkflowNodeDraft | null | undefined,
): WorkflowOutgoingEdgeTarget[] {
  return workflowOutgoingEdgeTargets(node?.id, graph?.nodes ?? [], graph?.edges ?? []);
}

export function workflowElapsedLabel(startedAt: string | undefined, nowMs: number): string | null {
  if (!startedAt) return null;
  const startedMs = workflowTimestampMs(startedAt);
  if (startedMs === 0) return null;
  const elapsed = Math.floor((nowMs - startedMs) / 1000);
  if (elapsed < 0) return null;
  if (elapsed < 60) return `${elapsed}s`;
  return `${Math.floor(elapsed / 60)}m${elapsed % 60}s`;
}

export function workflowRunEtaLabel(durationsMs: readonly unknown[]): string | null {
  const completedDurations = durationsMs.filter(
    (duration): duration is number => typeof duration === "number" && Number.isFinite(duration) && duration >= 0,
  );
  if (completedDurations.length === 0) return null;
  const meanMs = completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length;
  if (meanMs < 1000) return "<1s";
  if (meanMs < 60000) return `~${Math.round(meanMs / 1000)}s`;
  return `~${Math.round(meanMs / 60000)}m`;
}

export function workflowNodeSuccessRates(runs: readonly unknown[]): Map<string, number> {
  const rates = new Map<string, number>();
  const totals = new Map<string, number>();
  const successes = new Map<string, number>();
  for (const run of runs) {
    for (const step of runTimelineSteps(run)) {
      const nodeId = typeof step.node_id === "string" ? step.node_id : null;
      if (!nodeId) continue;
      totals.set(nodeId, (totals.get(nodeId) ?? 0) + 1);
      if (step.status === "completed") successes.set(nodeId, (successes.get(nodeId) ?? 0) + 1);
    }
  }
  for (const [nodeId, total] of totals) {
    rates.set(nodeId, (successes.get(nodeId) ?? 0) / total);
  }
  return rates;
}

export function workflowWaitResumeSummary(
  records: readonly { status?: unknown }[],
): WorkflowWaitResumeSummary {
  let pending = 0;
  let activeFollowup = 0;
  let resolved = 0;
  for (const record of records) {
    if (record.status === "pending" || record.status === "wake_dispatched") pending += 1;
    else if (record.status === "continued_to_new_wait") activeFollowup += 1;
    else resolved += 1;
  }
  return {
    activeFollowup,
    pending,
    resolved,
    total: records.length,
  };
}

export function workflowDeploymentEnvironment(
  graph: Pick<WorkflowGraphDraft, "environment"> | null | undefined,
): WorkflowDeploymentEnvironment {
  return graph?.environment === "prod" ? "prod" : "dev";
}

export function workflowActiveDeployment(args: {
  deployments: readonly WorkflowDeployment[];
  graph: Pick<WorkflowGraphDraft, "environment"> | null | undefined;
}): WorkflowDeployment | null {
  return latestDeploymentForEnvironment([...args.deployments], workflowDeploymentEnvironment(args.graph));
}

export function workflowDeploymentHistoryById(
  deployments: readonly WorkflowDeployment[],
): Map<string, WorkflowDeployment> {
  const entries = new Map<string, WorkflowDeployment>();
  for (const deployment of deployments) {
    entries.set(deployment.deployment_id, deployment);
  }
  return entries;
}

export function workflowNodeLabelsById(
  graph: Pick<WorkflowGraphDraft, "nodes"> | null | undefined,
): Map<string, string> {
  const labels = new Map<string, string>();
  if (!graph) return labels;
  for (const node of graph.nodes) {
    labels.set(node.id, node.label);
  }
  return labels;
}

export function workflowNodeDeploymentPolicies(args: {
  deployment: WorkflowDeployment | null | undefined;
  graph: Pick<WorkflowGraphDraft, "environment" | "nodes"> | null | undefined;
}): Map<string, NodeDeploymentPolicy> {
  const policies = new Map<string, NodeDeploymentPolicy>();
  if (!args.graph) return policies;
  const environment = workflowDeploymentEnvironment(args.graph);
  for (const node of args.graph.nodes) {
    const policy = nodeDeploymentPolicyFromDeployment(node, args.deployment ?? null, environment);
    if (policy) policies.set(node.id, policy);
  }
  return policies;
}

export function workflowPendingNodeDeploymentPolicies(args: {
  deploymentDraft: Parameters<typeof pendingDeploymentPolicyForNode>[2];
  familyOverrides: Parameters<typeof pendingDeploymentPolicyForNode>[3];
  graph: Pick<WorkflowGraphDraft, "environment" | "nodes"> | null | undefined;
  nodeOverrides: Parameters<typeof pendingDeploymentPolicyForNode>[4];
}): Map<string, PendingNodeDeploymentPolicy> {
  const policies = new Map<string, PendingNodeDeploymentPolicy>();
  if (!args.graph) return policies;
  const environment = workflowDeploymentEnvironment(args.graph);
  for (const node of args.graph.nodes) {
    const policy = pendingDeploymentPolicyForNode(
      node,
      environment,
      args.deploymentDraft,
      args.familyOverrides,
      args.nodeOverrides,
    );
    if (policy) policies.set(node.id, policy);
  }
  return policies;
}

export function workflowPendingDeploymentChangeSummary(args: {
  deployedPolicies: ReadonlyMap<string, NodeDeploymentPolicy>;
  nodes: readonly Pick<WorkflowNodeDraft, "id">[];
  pendingPolicies: ReadonlyMap<string, PendingNodeDeploymentPolicy>;
}): WorkflowPendingDeploymentChangeSummary {
  let changedNodeCount = 0;
  let pendingNodeCount = 0;
  for (const node of args.nodes) {
    const pendingPolicy = args.pendingPolicies.get(node.id);
    if (!pendingPolicy) continue;
    pendingNodeCount += 1;
    const deployedPolicy = args.deployedPolicies.get(node.id);
    if (deploymentPolicyChanges(deployedPolicy?.fields, pendingPolicy.fields).length > 0) {
      changedNodeCount += 1;
    }
  }
  return { changedNodeCount, pendingNodeCount };
}

export function workflowDeployPreviewDiff(args: {
  deployedPolicies: ReadonlyMap<string, NodeDeploymentPolicy>;
  nodes: readonly Pick<WorkflowNodeDraft, "id" | "label">[];
  pendingPolicies: ReadonlyMap<string, PendingNodeDeploymentPolicy>;
}): WorkflowDeployPreviewDiffEntry[] {
  const entries: WorkflowDeployPreviewDiffEntry[] = [];
  for (const node of args.nodes) {
    const pendingPolicy = args.pendingPolicies.get(node.id);
    if (!pendingPolicy) continue;
    const deployedPolicy = args.deployedPolicies.get(node.id);
    const changes = deploymentPolicyChanges(deployedPolicy?.fields, pendingPolicy.fields);
    if (changes.length > 0) {
      entries.push({
        changes,
        label: node.label,
        nodeId: node.id,
      });
    }
  }
  return entries;
}

export function workflowSharedReviewBannerSummary(args: WorkflowSharedReviewBannerSummaryArgs): string[] {
  if (!args.visible) return [];
  const entries: string[] = [];
  const workflowTitle = args.workflow?.title?.trim();
  const runId = args.run?.run_id;
  const edge = args.edge;
  const deploymentId = args.deployment?.deployment_id;
  const deploymentEnvironment = args.deployment?.environment;
  const filterText = args.storedSharedReviewFilter.trim();

  if (workflowTitle) entries.push(`workflow ${workflowTitle}`);
  if (runId) entries.push(`run ${runId.slice(0, 8)}`);
  if (edge) entries.push(`branch ${edge.condition_label?.trim() || `${edge.source} -> ${edge.target}`}`);
  if (args.runTimelineFilterMode !== "all") {
    entries.push(`timeline ${timelineFilterSummaryLabel(args.runTimelineFilterMode)}`);
  }
  if (args.focusedNodeLabel) entries.push(`focus ${args.focusedNodeLabel}`);
  if (args.selectedNodeLabel) entries.push(`node ${args.selectedNodeLabel}`);
  if (deploymentId && deploymentEnvironment) {
    entries.push(`deployment ${deploymentEnvironment}:${deploymentId.slice(0, 8)}`);
  }
  if (args.runHistoryDriftFilter !== "all") entries.push(`history ${args.runHistoryDriftFilter} drift`);
  if (args.runHistorySortMode === "drift_desc") entries.push("sorted by highest drift");
  if (args.savedReviewLabel) entries.push(`saved review ${args.savedReviewLabel}`);
  if (args.showAllSavedReviews) entries.push("saved reviews expanded");
  if (filterText) entries.push(`saved review filter ${filterText}`);
  if (args.storedSharedReviewSortMode === "recent") entries.push("saved reviews sorted by recent");
  if (args.storedSharedReviewShareModeFilter !== "all") {
    entries.push(`saved reviews ${args.storedSharedReviewShareModeFilter} only`);
  }
  if (args.storedSharedReviewPinnedOnly) entries.push("saved reviews pinned only");
  return entries;
}

export function workflowSharedReviewBannerSummaryForView(
  args: WorkflowSharedReviewBannerViewArgs,
): string[] {
  const focusedNodeLabel = args.focusedNodeId
    ? args.nodeLabels.get(args.focusedNodeId) ?? args.focusedNodeId
    : null;
  const selectedNodeLabel = args.selectedNodeId
    ? args.nodeLabels.get(args.selectedNodeId) ?? args.selectedNodeId
    : null;
  const deployment = args.deploymentId
    ? args.deploymentLookup.get(args.deploymentId) ?? null
    : null;

  return workflowSharedReviewBannerSummary({
    deployment,
    edge: workflowSelectedEdge(args.graph, args.selectedEdgeId),
    focusedNodeLabel,
    run: args.run,
    runHistoryDriftFilter: args.runHistoryDriftFilter,
    runHistorySortMode: args.runHistorySortMode,
    runTimelineFilterMode: args.runTimelineFilterMode,
    savedReviewLabel: args.selectedSavedReview?.label ?? null,
    selectedNodeLabel,
    showAllSavedReviews: args.showAllSavedReviews,
    storedSharedReviewFilter: args.storedSharedReviewFilter,
    storedSharedReviewPinnedOnly: args.storedSharedReviewPinnedOnly,
    storedSharedReviewShareModeFilter: args.storedSharedReviewShareModeFilter,
    storedSharedReviewSortMode: args.storedSharedReviewSortMode,
    visible: args.visible,
    workflow: args.workflow,
  });
}

export function workflowSavedReviewStaleness(args: {
  deploymentTimestamps: readonly unknown[];
  runTimestamps: readonly unknown[];
  savedAt: unknown;
}): WorkflowSavedReviewStaleness | null {
  const savedAt = workflowTimestampMs(args.savedAt);
  if (savedAt === 0) return null;
  const latestTimestamp = (values: readonly unknown[]) => {
    let latest = 0;
    for (const value of values) {
      latest = Math.max(latest, workflowTimestampMs(value));
    }
    return latest;
  };
  const latestDeploymentTimestamp = latestTimestamp(args.deploymentTimestamps);
  const latestRunTimestamp = latestTimestamp(args.runTimestamps);
  const newerDeployment = latestDeploymentTimestamp > savedAt;
  const newerRun = latestRunTimestamp > savedAt;
  if (!newerDeployment && !newerRun) return null;
  const reasons: string[] = [];
  if (newerDeployment) reasons.push("newer deployment");
  if (newerRun) reasons.push("newer run history");
  return {
    reasons,
    label: `stale: ${reasons.join(" and ")}`,
  };
}

export function workflowSavedReviewSavedAtLabel(savedAt: unknown): string | null {
  if (typeof savedAt !== "string" || !savedAt) return null;
  const timestamp = workflowTimestampMs(savedAt);
  if (timestamp === 0) return savedAt;
  return surfaceDateTimeLabel(new Date(timestamp).toISOString()) || savedAt;
}

export function workflowSavedReviewScopeMismatch(args: {
  currentDeploymentId: string | null | undefined;
  currentEnvironment: "dev" | "prod";
  recordDeploymentId: string | null | undefined;
  recordEnvironment: string | null | undefined;
}): WorkflowSavedReviewScopeMismatch | null {
  const reasons: string[] = [];
  if (args.recordEnvironment && args.recordEnvironment !== args.currentEnvironment) {
    reasons.push(`saved for ${args.recordEnvironment}`);
  }
  if (
    args.recordDeploymentId
    && args.currentDeploymentId
    && args.recordDeploymentId !== args.currentDeploymentId
  ) {
    reasons.push("different deployment");
  }
  if (reasons.length === 0) return null;
  return {
    reasons,
    label: `scope mismatch: ${reasons.join(" and ")}`,
  };
}

export function workflowSavedReviewSummary(args: {
  deploymentId: string | null | undefined;
  environment: string | null | undefined;
  nodeLabels: ReadonlyMap<string, string>;
  reviewState: ReviewUrlState | null | undefined;
  shareMode: "workspace" | "core";
}): string[] {
  const reviewState = args.reviewState;
  if (!reviewState) return [];
  const entries: string[] = [
    args.shareMode === "workspace" ? "workspace snapshot" : "core review snapshot",
  ];
  if (reviewState.run_id) entries.push(`run ${reviewState.run_id.slice(0, 8)}`);
  if (reviewState.selected_edge_id) entries.push("branch focus");
  if (reviewState.timeline_filter !== "all") {
    entries.push(`timeline ${timelineFilterSummaryLabel(reviewState.timeline_filter)}`);
  }
  if (reviewState.focused_node_id) {
    const focusedNodeLabel = args.nodeLabels.get(reviewState.focused_node_id) ?? reviewState.focused_node_id;
    entries.push(`focus ${focusedNodeLabel}`);
  }
  if (reviewState.selected_node_id) {
    const selectedNodeLabel = args.nodeLabels.get(reviewState.selected_node_id) ?? reviewState.selected_node_id;
    entries.push(`node ${selectedNodeLabel}`);
  }
  if (reviewState.selected_deployment_id) {
    entries.push(`deployment ${reviewState.selected_deployment_id.slice(0, 8)}`);
  }
  if (reviewState.drift_filter !== "all") entries.push(`history ${reviewState.drift_filter} drift`);
  if (reviewState.sort_mode === "drift_desc") entries.push("sorted by highest drift");
  if (args.environment) entries.push(`env ${args.environment}`);
  if (args.deploymentId) entries.push(`saved dep ${args.deploymentId.slice(0, 8)}`);
  return entries;
}

export function workflowSavedReviewSelectorEntry(args: {
  deploymentId: string | null | undefined;
  id: string;
  index: number;
  pinned: boolean;
  reviewState: ReviewUrlState | null | undefined;
  shareMode: "workspace" | "core";
  title: string | null | undefined;
  environment: string | null | undefined;
}): WorkflowSavedReviewSelectorEntry {
  const title = args.title?.trim();
  if (title) {
    return {
      id: args.id,
      label: title,
      pinned: args.pinned,
      share_mode: args.shareMode,
    };
  }
  const labelParts: string[] = [];
  if (args.reviewState?.run_id) labelParts.push(`run ${args.reviewState.run_id.slice(0, 6)}`);
  if (args.environment) labelParts.push(args.environment);
  if (args.reviewState?.timeline_filter && args.reviewState.timeline_filter !== "all") {
    labelParts.push(args.reviewState.timeline_filter === "deployment_context" ? "deploy" : "replay");
  }
  if (args.reviewState?.drift_filter && args.reviewState.drift_filter !== "all") {
    labelParts.push(`${args.reviewState.drift_filter} drift`);
  }
  if (labelParts.length === 0 && args.deploymentId) {
    labelParts.push(`dep ${args.deploymentId.slice(0, 6)}`);
  }
  return {
    id: args.id,
    label: labelParts.slice(0, 2).join(" - ") || `saved ${args.index + 1}`,
    pinned: args.pinned,
    share_mode: args.shareMode,
  };
}

export function workflowSavedReviewFilteredSelectorEntries<TEntry extends WorkflowSavedReviewSelectorEntry>(args: {
  entries: readonly TEntry[];
  filterText: string;
  pinnedOnly: boolean;
  records: readonly WorkflowSavedReviewSelectorRecord[];
  shareModeFilter: WorkflowSavedReviewShareModeFilter;
  sortMode: WorkflowSavedReviewSortMode;
}): TEntry[] {
  const recordsById = new Map(args.records.map((record) => [record.id, record]));
  const filter = args.filterText.trim().toLowerCase();
  const entries = args.sortMode === "recent"
    ? [...args.entries].sort((left, right) => {
        const leftRecord = recordsById.get(left.id);
        const rightRecord = recordsById.get(right.id);
        return workflowTimestampMs(rightRecord?.saved_at) - workflowTimestampMs(leftRecord?.saved_at);
      })
    : [...args.entries];
  return entries.filter((entry) => {
    const entryShareMode = recordsById.get(entry.id)?.shareMode ?? "core";
    if (args.pinnedOnly && !entry.pinned) return false;
    if (args.shareModeFilter !== "all" && entryShareMode !== args.shareModeFilter) return false;
    if (!filter) return true;
    return entry.label.toLowerCase().includes(filter);
  });
}

export function workflowSavedReviewGroupedSelectorEntries<TEntry extends WorkflowSavedReviewSelectorEntry>(args: {
  entries: readonly TEntry[];
  sortMode: WorkflowSavedReviewSortMode;
}): WorkflowSavedReviewGroupedSelectorEntries<TEntry> {
  if (args.sortMode === "recent") {
    return {
      pinned: [],
      recent: [...args.entries],
    };
  }
  return {
    pinned: args.entries.filter((entry) => entry.pinned),
    recent: args.entries.filter((entry) => !entry.pinned),
  };
}

export function workflowSavedReviewShareModeCounts(
  records: readonly Pick<WorkflowSavedReviewSelectorRecord, "shareMode">[],
): WorkflowSavedReviewShareModeCounts {
  let workspace = 0;
  let core = 0;
  for (const record of records) {
    if (record.shareMode === "workspace") workspace += 1;
    else core += 1;
  }
  return {
    all: records.length,
    workspace,
    core,
  };
}

export function workflowSavedReviewActiveFilters(args: {
  filterText: string;
  pinnedOnly: boolean;
  shareModeFilter: WorkflowSavedReviewShareModeFilter;
}): WorkflowSavedReviewActiveFilterEntry[] {
  const entries: WorkflowSavedReviewActiveFilterEntry[] = [];
  if (args.pinnedOnly) {
    entries.push({ key: "pinned_only", label: "Pinned only", priority: 0 });
  }
  if (args.shareModeFilter !== "all") {
    entries.push({
      key: "share_mode",
      label: args.shareModeFilter === "workspace" ? "Workspace only" : "Core only",
      priority: 1,
    });
  }
  const filterText = args.filterText.trim();
  if (filterText) {
    entries.push({ key: "search", label: `Search: ${filterText}`, priority: 2 });
  }
  return entries.sort((left, right) => left.priority - right.priority);
}

export function workflowSavedReviewCompositionSummary(args: {
  counts: { all: number; core: number; workspace: number };
  filterText: string;
  pinnedCount: number;
  pinnedOnly: boolean;
  shareModeFilter: WorkflowSavedReviewShareModeFilter;
}): WorkflowSavedReviewCompositionEntry[] {
  const entries: WorkflowSavedReviewCompositionEntry[] = [{
    key: "all",
    label: `${args.counts.all} saved`,
    active: args.shareModeFilter === "all" && !args.filterText.trim() && !args.pinnedOnly,
  }];
  if (args.pinnedCount > 0) {
    entries.push({
      key: "pinned",
      label: `${args.pinnedCount} pinned`,
      active: args.pinnedOnly,
    });
  }
  if (args.counts.workspace > 0) {
    entries.push({
      key: "workspace",
      label: `${args.counts.workspace} workspace`,
      active: args.shareModeFilter === "workspace",
    });
  }
  if (args.counts.core > 0) {
    entries.push({
      key: "core",
      label: `${args.counts.core} core`,
      active: args.shareModeFilter === "core",
    });
  }
  return entries;
}

export function workflowSavedReviewPreviewContextSummary(args: {
  filterText: string;
  pinnedOnly: boolean;
  shareModeFilter: WorkflowSavedReviewShareModeFilter;
  showAll: boolean;
  sortMode: WorkflowSavedReviewSortMode;
}): Array<WorkflowSavedReviewLabelEntry<WorkflowSavedReviewPreviewContextKey>> {
  const entries: Array<WorkflowSavedReviewLabelEntry<WorkflowSavedReviewPreviewContextKey>> = [];
  if (args.showAll) entries.push({ key: "expanded", label: "expanded selector" });
  if (args.pinnedOnly) entries.push({ key: "pinned_only", label: "pinned only" });
  if (args.shareModeFilter !== "all") {
    entries.push({
      key: "share_mode",
      label: args.shareModeFilter === "workspace" ? "workspace only" : "core only",
    });
  }
  const filterText = args.filterText.trim();
  if (filterText) entries.push({ key: "search", label: `search ${filterText}` });
  if (args.sortMode === "recent") entries.push({ key: "sort_mode", label: "recent sort" });
  return entries;
}

export function workflowSavedReviewEmptyStateLabel(
  shareModeFilter: WorkflowSavedReviewShareModeFilter,
): string {
  if (shareModeFilter === "workspace") {
    return "No workspace snapshots match this view. Share or refresh a full workspace investigation link to create one.";
  }
  if (shareModeFilter === "core") {
    return "No core review snapshots match this view. Share a core review link to create one without the saved-review workspace shell.";
  }
  return "No saved reviews match this filter.";
}

export function workflowSavedReviewEmptyStateActions(args: {
  filterText: string;
  pinnedOnly: boolean;
  shareModeFilter: WorkflowSavedReviewShareModeFilter;
}): Array<WorkflowSavedReviewLabelEntry<WorkflowSavedReviewFilterKey>> {
  const entries: Array<WorkflowSavedReviewLabelEntry<WorkflowSavedReviewFilterKey>> = [];
  if (args.filterText.trim()) entries.push({ key: "search", label: "Clear search" });
  if (args.shareModeFilter !== "all") entries.push({ key: "share_mode", label: "Show all share modes" });
  if (args.pinnedOnly) entries.push({ key: "pinned_only", label: "Show all saved reviews" });
  return entries;
}

export function workflowSavedReviewCompositionChipClass(
  key: WorkflowSavedReviewCompositionKey,
  active: boolean,
): string {
  if (key === "all") {
    return active
      ? "border-violet-300 bg-violet-100 text-violet-800"
      : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
  }
  if (key === "pinned") {
    return active
      ? "border-amber-300 bg-amber-100 text-amber-800"
      : "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
  }
  return active
    ? "border-sky-300 bg-sky-100 text-sky-800"
    : "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
}

export function workflowSavedReviewCompositionActionLabel(
  key: WorkflowSavedReviewCompositionKey,
): string {
  if (key === "all") return "Show all saved reviews";
  if (key === "pinned") return "Focus pinned saved reviews";
  if (key === "workspace") return "Focus workspace snapshots";
  return "Focus core snapshots";
}

export function workflowSavedReviewShareModeActionLabel(
  mode: WorkflowSavedReviewShareModeFilter,
): string {
  if (mode === "all") return "Show all saved-review share modes";
  if (mode === "workspace") return "Show only workspace snapshots";
  return "Show only core review snapshots";
}

export function workflowSavedReviewSortActionLabel(mode: WorkflowSavedReviewSortMode): string {
  if (mode === "priority") return "Sort saved reviews by pinned priority";
  return "Sort saved reviews by most recent first";
}

export function workflowSavedReviewSelectorEntryActionLabel(entry: {
  label: string;
  pinned: boolean;
  share_mode: string;
}, selected: boolean): string {
  const prefix = selected ? "Reopen saved review" : "Open saved review";
  const details = [entry.label];
  if (entry.pinned) details.push("pinned");
  details.push(entry.share_mode === "workspace" ? "workspace snapshot" : "core snapshot");
  return `${prefix}: ${details.join(", ")}`;
}

export function workflowSavedReviewExpandActionLabel(hiddenCount: number): string {
  return `Expand saved-review selector to show ${hiddenCount} more snapshots`;
}

export function workflowSavedReviewCollapseActionLabel(): string {
  return "Collapse the saved-review selector";
}

export function workflowSavedReviewFilterClass(key: WorkflowSavedReviewFilterKey): string {
  if (key === "pinned_only") {
    return "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
  }
  if (key === "share_mode") {
    return "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
  }
  return "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
}

export function workflowSavedReviewPreviewContextClass(
  key: WorkflowSavedReviewPreviewContextKey,
): string {
  if (key === "expanded" || key === "sort_mode") {
    return "border-slate-200/70 bg-slate-100/85 text-slate-700 hover:bg-slate-200/80";
  }
  return workflowSavedReviewFilterClass(key);
}

export function workflowSavedReviewPreviewContextActionLabel(
  key: WorkflowSavedReviewPreviewContextKey,
): string {
  if (key === "expanded") return "Collapse the saved-review selector";
  if (key === "pinned_only") return "Clear pinned-only focus";
  if (key === "share_mode") return "Clear share-mode focus";
  if (key === "search") return "Clear saved-review search";
  return "Reset saved-review sort to priority";
}

export function workflowSavedReviewActiveFilterActionLabel(
  key: WorkflowSavedReviewFilterKey,
): string {
  if (key === "pinned_only") return "Clear pinned-only focus";
  if (key === "share_mode") return "Clear share-mode focus";
  return "Clear saved-review search";
}

export function workflowSavedReviewLegendClass(key: WorkflowSavedReviewFilterKey): string {
  return workflowSavedReviewFilterClass(key)
    .replace(" hover:bg-amber-100", "")
    .replace(" hover:bg-sky-100", "")
    .replace(" hover:bg-white", "");
}

export function workflowSavedReviewLegendActionLabel(target: WorkflowSavedReviewLegendTarget): string | null {
  if (target === "pinned") return "Focus pinned saved reviews";
  if (target === "workspace") return "Focus workspace snapshots";
  if (target === "core") return "Focus core snapshots";
  if (target === "clear_search") return "Clear saved-review search";
  return null;
}

export function workflowSavedReviewToneLegendEntries(args: {
  counts: { core: number; workspace: number };
  filterText: string;
  hasPinnedRecord: boolean;
  hasWorkspaceRecord: boolean;
  pinnedOnly: boolean;
  shareModeFilter: WorkflowSavedReviewShareModeFilter;
}): WorkflowSavedReviewLegendEntry[] {
  const entries: WorkflowSavedReviewLegendEntry[] = [];
  const hasPinned = args.hasPinnedRecord || args.pinnedOnly;
  const hasShareMode = args.hasWorkspaceRecord || args.shareModeFilter !== "all";
  const hasSearch = !!args.filterText.trim();
  if (hasPinned) entries.push({ key: "pinned_only", label: "Pinned focus", target: "pinned" });
  if (hasShareMode) {
    const target = args.shareModeFilter === "workspace" || args.shareModeFilter === "core"
      ? args.shareModeFilter
      : args.counts.workspace > 0
        ? "workspace"
        : args.counts.core > 0
          ? "core"
          : null;
    entries.push({ key: "share_mode", label: "Share mode", target });
  }
  if (hasSearch || entries.length === 0) {
    entries.push({
      key: "search",
      label: "Search or general",
      target: hasSearch ? "clear_search" : null,
    });
  }
  return entries;
}

export function workflowRunHistoryEntriesForView<TEntry extends WorkflowRunHistoryEntryLike>(args: {
  assetFilter: string;
  entries: readonly TEntry[];
  familyFilter: string;
  filterMode: RunHistoryDriftFilter;
  instanceFilter: string;
  sortMode: RunHistorySortMode;
}): TEntry[] {
  const entries = args.entries.filter((entry) => {
    if (args.familyFilter !== "all" && entry.lineage?.familyId !== args.familyFilter) return false;
    if (args.assetFilter !== "all" && entry.lineage?.familyAssetWorkflowId !== args.assetFilter) return false;
    if (args.instanceFilter !== "all" && entry.lineage?.instanceWorkflowId !== args.instanceFilter) return false;
    switch (args.filterMode) {
      case "deployment":
        return entry.deploymentImpact > 0;
      case "replay":
        return entry.replayImpact > 0;
      case "any":
        return entry.totalImpact > 0;
      case "all":
      default:
        return true;
    }
  });

  entries.sort((left, right) => {
    if (args.sortMode === "drift_desc") {
      const impactDelta = right.totalImpact - left.totalImpact;
      if (impactDelta !== 0) return impactDelta;
    }
    return workflowTimestampMs(right.run.started_at) - workflowTimestampMs(left.run.started_at);
  });
  return entries;
}

export function workflowSelectedRunNodePolicyDeltas(args: {
  deploymentLookup: Map<string, WorkflowDeployment>;
  graph: WorkflowGraphDraft | null;
  run: WorkflowRun | null | undefined;
}): Map<string, WorkflowRunNodePolicyDelta> {
  const deltas = new Map<string, WorkflowRunNodePolicyDelta>();
  if (!args.run || !args.graph) return deltas;
  for (const node of args.graph.nodes) {
    const delta = runNodePolicyDeltaSummary(args.run, args.deploymentLookup, node.id);
    if (delta) deltas.set(node.id, delta);
  }
  return deltas;
}

export function workflowSelectedRunEdgePolicyDeltas(args: {
  deploymentLookup: Map<string, WorkflowDeployment>;
  graph: WorkflowGraphDraft | null;
  run: WorkflowRun | null | undefined;
}): Map<string, WorkflowRunEdgePolicyDelta> {
  const deltas = new Map<string, WorkflowRunEdgePolicyDelta>();
  if (!args.run || !args.graph) return deltas;
  for (const edge of args.graph.edges) {
    const delta = runEdgePolicyDeltaSummary(args.graph, args.run, args.deploymentLookup, edge.id);
    if (delta) deltas.set(edge.id, delta);
  }
  return deltas;
}

export function workflowRunHistoryEntries(args: {
  assetFilter: string;
  deploymentLookup: Map<string, WorkflowDeployment>;
  familyFilter: string;
  filterMode: RunHistoryDriftFilter;
  graph: WorkflowGraphDraft | null;
  instanceFilter: string;
  runs: readonly WorkflowRun[];
  sortMode: RunHistorySortMode;
}): WorkflowRunHistoryViewEntry[] {
  const entries = args.runs.map((run) => {
    const drift = runPolicyDriftSummary(args.graph, run, args.deploymentLookup);
    const deploymentImpact = drift.deploymentNodeCount + drift.deploymentEdgeCount;
    const replayImpact = drift.replayNodeCount + drift.replayEdgeCount;
    const totalImpact = deploymentImpact + replayImpact;
    const lineage = parseWorkflowFamilyContext(run.result?.workflow_family_context);
    return {
      deploymentImpact,
      drift,
      lineage,
      replayImpact,
      run,
      totalImpact,
    };
  });
  return workflowRunHistoryEntriesForView({
    assetFilter: args.assetFilter,
    entries,
    familyFilter: args.familyFilter,
    filterMode: args.filterMode,
    instanceFilter: args.instanceFilter,
    sortMode: args.sortMode,
  });
}

export function workflowRunHistoryLineageOptions(
  lineages: readonly (Pick<WorkflowFamilyContext, "familyAssetWorkflowId" | "familyId" | "instanceWorkflowId"> | null)[],
): WorkflowRunHistoryLineageOptions {
  const familyIds = new Set<string>();
  const assetWorkflowIds = new Set<string>();
  const instanceWorkflowIds = new Set<string>();
  for (const lineage of lineages) {
    if (lineage?.familyId) familyIds.add(lineage.familyId);
    if (lineage?.familyAssetWorkflowId) assetWorkflowIds.add(lineage.familyAssetWorkflowId);
    if (lineage?.instanceWorkflowId) instanceWorkflowIds.add(lineage.instanceWorkflowId);
  }
  return {
    familyIds: [...familyIds].sort(),
    assetWorkflowIds: [...assetWorkflowIds].sort(),
    instanceWorkflowIds: [...instanceWorkflowIds].sort(),
  };
}

export function workflowInteractionLocked(action: WorkflowBusyAction | null | undefined): boolean {
  return ["compile", "deploy", "run", "dry_run", "replay", "rollback"].includes(action ?? "");
}

export function workflowExecutionRefreshing(action: WorkflowBusyAction | null | undefined, liveRefreshUntil: number, nowMs: number): boolean {
  return ["deploy", "run", "dry_run", "replay", "rollback"].includes(action ?? "") || liveRefreshUntil > nowMs;
}

export function workflowInteractionLockLabel(action: WorkflowBusyAction | null | undefined): string {
  switch (action) {
    case "compile":
      return "Compiling workflow IR";
    case "deploy":
      return "Deploying workflow";
    case "run":
      return "Running workflow";
    case "dry_run":
      return "Simulating workflow";
    case "replay":
      return "Replaying workflow";
    case "rollback":
      return "Rolling back deployment";
    default:
      return "Workflow locked";
  }
}

export function workflowRailRunStatsBadge(
  stats: { ok: number; fail: number } | null | undefined,
): WorkflowRailBadgeView | null {
  if (!stats) return null;
  const total = stats.ok + stats.fail;
  if (total === 0) return null;
  const rate = Math.round((stats.ok / total) * 100);
  const className = rate >= 90
    ? "text-emerald-600 border-emerald-500/25 bg-emerald-500/8"
    : rate >= 60
      ? "text-amber-500 border-amber-400/25 bg-amber-400/8"
      : "text-red-500 border-red-400/25 bg-red-400/8";
  return {
    className,
    label: `${rate}% ok - ${total} run${total === 1 ? "" : "s"}`,
  };
}

export function workflowRailTriggerBadge(info: {
  triggerLiveRegistrationSupported: boolean | null;
  triggerPreviewStatus?: string | null;
}): WorkflowRailBadgeView | null {
  if (info.triggerLiveRegistrationSupported === null && !info.triggerPreviewStatus) return null;
  const previewOnly = info.triggerLiveRegistrationSupported === false;
  return {
    className: previewOnly
      ? "border-amber-400/25 bg-amber-400/8 text-amber-600"
      : "border-emerald-500/25 bg-emerald-500/8 text-emerald-600",
    label: workflowTriggerReadinessBadgeLabel(
      workflowTriggerReadinessSummaryFromStatus(
        info.triggerPreviewStatus,
        info.triggerLiveRegistrationSupported,
      ),
      { capitalize: true },
    ) ?? "Trigger readiness",
    title: previewOnly
      ? "Compiled trigger wiring is still preview-only; do not treat this workflow as a live trigger entry point yet."
      : "Compiled trigger wiring reports live registration support.",
  };
}
