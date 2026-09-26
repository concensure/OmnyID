// @locs-version: 1.0
import type { SavedWorkflow } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";
import { defaultPolicy, runtimeHints } from "@/lib/workflowGraphDefaults";
import { titleCase } from "@/lib/workflowGraphCopy";
import {
  branchOriginRecord,
  workflowFamilyAssetRecord,
} from "@/lib/workflowGraphMetadata";
import { nodeSemanticRole } from "@/lib/workflowNodeSemanticRole";
import { cloneJson, makeId } from "@/lib/workflowGraphUtils";
import { branchScaffoldBlueprint } from "@/lib/workflowPresetScaffold";
import type {
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";
import type { WorkflowFamilyParameterField } from "@/lib/workflowReviewTypes";

function finalSchemaFromNode(node: WorkflowNodeDraft): Record<string, unknown> {
  return isRecord(node.config.final_schema) ? node.config.final_schema : {};
}

export function inferredWorkflowFamilyParameterSchema(templateIds: string[]): WorkflowFamilyParameterField[] {
  const fields: WorkflowFamilyParameterField[] = [];
  if (templateIds.includes("document_to_spreadsheet")) {
    fields.push(
      {
        id: "source_kind",
        label: "Source kind",
        kind: "select",
        description: "How this family usually receives the source document.",
        defaultValue: "attachment_or_url",
        options: [
          { value: "attachment_or_url", label: "Attachment or URL" },
          { value: "thread_artifact", label: "Thread artifact" },
        ],
      },
      {
        id: "export_format",
        label: "Export format",
        kind: "select",
        description: "Preferred spreadsheet export format for new instances.",
        defaultValue: "xlsx",
        options: [
          { value: "xlsx", label: "XLSX" },
          { value: "csv", label: "CSV" },
        ],
      },
      {
        id: "review_mode",
        label: "Review mode",
        kind: "select",
        description: "Whether extracted data should pause for review before export.",
        defaultValue: "required",
        options: [
          { value: "required", label: "Required" },
          { value: "suggest_only", label: "Suggest only" },
        ],
      },
    );
  }
  if (templateIds.includes("weather_to_chart")) {
    fields.push(
      {
        id: "location_query",
        label: "Default location",
        kind: "text",
        description: "Optional default location for new weather-chart instances.",
        defaultValue: "",
      },
      {
        id: "forecast_days",
        label: "Forecast days",
        kind: "number",
        description: "How many days of forecast to request by default.",
        defaultValue: "7",
      },
      {
        id: "chart_type",
        label: "Chart type",
        kind: "select",
        description: "Preferred chart style for forecast output.",
        defaultValue: "line",
        options: [
          { value: "line", label: "Line" },
          { value: "bar", label: "Bar" },
        ],
      },
    );
  }
  if (templateIds.includes("meeting_to_digest")) {
    fields.push(
      {
        id: "meeting_source_kind",
        label: "Meeting source",
        kind: "select",
        description: "Preferred source mode for new meeting-digest runs.",
        defaultValue: "attachment_or_message",
        options: [
          { value: "attachment_or_message", label: "Attachment or message" },
          { value: "thread_artifact", label: "Thread artifact" },
        ],
      },
      {
        id: "digest_style",
        label: "Digest style",
        kind: "select",
        description: "Default digest output emphasis.",
        defaultValue: "summary",
        options: [
          { value: "summary", label: "Summary" },
          { value: "action_items", label: "Action items" },
        ],
      },
    );
  }
  if (templateIds.includes("budget_projection")) {
    fields.push(
      {
        id: "horizon_months",
        label: "Projection horizon",
        kind: "number",
        description: "Default number of months for each new budget projection.",
        defaultValue: "6",
      },
      {
        id: "currency",
        label: "Currency",
        kind: "text",
        description: "Default reporting currency code.",
        defaultValue: "USD",
      },
      {
        id: "chart_type",
        label: "Chart type",
        kind: "select",
        description: "Preferred chart style for budget visualization.",
        defaultValue: "line",
        options: [
          { value: "line", label: "Line" },
          { value: "bar", label: "Bar" },
        ],
      },
    );
  }
  return fields;
}

export function defaultWorkflowFamilyParameters(fields: WorkflowFamilyParameterField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.id, field.defaultValue]));
}

export function branchFamilyWorkflows(
  workflow: SavedWorkflow,
  all: SavedWorkflow[],
): SavedWorkflow[] {
  const origin = branchOriginRecord(workflow);
  const parentId = origin?.parent_workflow_id ?? workflow.workflow_id;
  return all.filter((candidate) => {
    if (candidate.workflow_id === workflow.workflow_id) return false;
    const candidateOrigin = branchOriginRecord(candidate);
    return (
      candidate.workflow_id === parentId ||
      candidateOrigin?.parent_workflow_id === parentId
    );
  });
}

export function orderedWorkflowsForRail(all: SavedWorkflow[]): SavedWorkflow[] {
  const workflows = [...all];
  const workflowById = new Map(workflows.map((workflow) => [workflow.workflow_id, workflow]));
  const branchChildren = new Map<string, SavedWorkflow[]>();
  const standalone: SavedWorkflow[] = [];

  for (const workflow of workflows) {
    const origin = branchOriginRecord(workflow);
    const parentId = origin?.parent_workflow_id;
    if (parentId && workflowById.has(parentId)) {
      const siblings = branchChildren.get(parentId) ?? [];
      siblings.push(workflow);
      branchChildren.set(parentId, siblings);
    } else {
      standalone.push(workflow);
    }
  }

  const sortByRecency = (left: SavedWorkflow, right: SavedWorkflow) =>
    Date.parse(right.updated_at ?? right.created_at ?? "") - Date.parse(left.updated_at ?? left.created_at ?? "");

  standalone.sort(sortByRecency);
  for (const siblings of branchChildren.values()) siblings.sort(sortByRecency);

  const ordered: SavedWorkflow[] = [];
  for (const workflow of standalone) {
    ordered.push(workflow);
    const children = branchChildren.get(workflow.workflow_id);
    if (children) ordered.push(...children);
  }

  const alreadyIncluded = new Set(ordered.map((workflow) => workflow.workflow_id));
  for (const workflow of workflows.sort(sortByRecency)) {
    if (!alreadyIncluded.has(workflow.workflow_id)) ordered.push(workflow);
  }

  return ordered;
}

export function filteredWorkflowsForRail(args: {
  workflows: readonly SavedWorkflow[];
  tagFilter: string | null | undefined;
  tagsByWorkflow: Record<string, readonly string[]>;
  favoritesOnly?: boolean;
}): SavedWorkflow[] {
  const ordered = orderedWorkflowsForRail([...args.workflows]);
  return ordered.filter((workflow) => {
    if (args.favoritesOnly && !workflow.favorite) return false;
    if (!args.tagFilter) return true;
    return (args.tagsByWorkflow[workflow.workflow_id] ?? []).includes(args.tagFilter as string);
  });
}

export function isBranchChildWorkflow(workflow: SavedWorkflow): boolean {
  return Boolean(branchOriginRecord(workflow)?.parent_workflow_id);
}

export function branchFamilyRootId(workflow: SavedWorkflow): string {
  return branchOriginRecord(workflow)?.parent_workflow_id ?? workflow.workflow_id;
}

export function branchFamilyRootIdsWithChildren(all: readonly SavedWorkflow[]): Set<string> {
  return new Set(
    all
      .filter((workflow) =>
        !isBranchChildWorkflow(workflow) && branchFamilyWorkflows(workflow, [...all]).length > 0
      )
      .map((workflow) => workflow.workflow_id),
  );
}

export function workflowBranchVisibleInRail(args: {
  workflow: SavedWorkflow;
  collapsedFamilyIds: ReadonlySet<string>;
  selectedWorkflowId: string | null | undefined;
}): boolean {
  const rootId = branchFamilyRootId(args.workflow);
  if (!args.collapsedFamilyIds.has(rootId)) return true;
  if (!isBranchChildWorkflow(args.workflow)) return true;
  return args.selectedWorkflowId === args.workflow.workflow_id;
}

export function workflowBranchFamilySummary(args: {
  collapsedFamilyIds: ReadonlySet<string>;
  workflows: readonly SavedWorkflow[];
}): { familyCount: number; collapsedCount: number } {
  const familyIds = branchFamilyRootIdsWithChildren(args.workflows);
  const collapsedCount = [...args.collapsedFamilyIds].filter((familyId) => familyIds.has(familyId)).length;
  return {
    familyCount: familyIds.size,
    collapsedCount,
  };
}

export function collapsedBranchFamilyIdsAfterToggle(
  current: ReadonlySet<string>,
  rootId: string,
): Set<string> {
  const next = new Set(current);
  if (next.has(rootId)) next.delete(rootId);
  else next.add(rootId);
  return next;
}

export function collapsedBranchFamilyIdsForAvailableWorkflows(args: {
  collapsedFamilyIds: ReadonlySet<string>;
  workflows: readonly SavedWorkflow[];
}): Set<string> {
  const validFamilyIds = new Set(args.workflows.map((workflow) => branchFamilyRootId(workflow)));
  return new Set([...args.collapsedFamilyIds].filter((familyId) => validFamilyIds.has(familyId)));
}

export function collapsedBranchFamilyIdsAfterSelectedWorkflow(args: {
  collapsedFamilyIds: ReadonlySet<string>;
  selectedWorkflowId: string | null | undefined;
  workflows: readonly SavedWorkflow[];
}): Set<string> {
  if (!args.selectedWorkflowId || args.workflows.length === 0) {
    return new Set(args.collapsedFamilyIds);
  }
  const selected = args.workflows.find((workflow) => workflow.workflow_id === args.selectedWorkflowId);
  if (!selected) return new Set(args.collapsedFamilyIds);
  const selectedRootId = branchFamilyRootId(selected);
  if (!args.collapsedFamilyIds.has(selectedRootId)) return new Set(args.collapsedFamilyIds);
  const next = new Set(args.collapsedFamilyIds);
  next.delete(selectedRootId);
  return next;
}

export function collapsedBranchFamilyIdsExceptSelected(args: {
  selectedWorkflowId: string | null | undefined;
  workflows: readonly SavedWorkflow[];
}): Set<string> {
  const rootIds = branchFamilyRootIdsWithChildren(args.workflows);
  const selected = args.workflows.find((workflow) => workflow.workflow_id === args.selectedWorkflowId);
  const selectedRootId = selected ? branchFamilyRootId(selected) : null;
  const next = new Set<string>();
  for (const rootId of rootIds) {
    if (rootId !== selectedRootId) next.add(rootId);
  }
  return next;
}

export function workflowFamilyNodeWithAppliedParameters(
  node: WorkflowNodeDraft,
  appliedParameters: Record<string, string>,
): WorkflowNodeDraft {
  const semanticRole = nodeSemanticRole(node);
  if (semanticRole === "pdf_source" || semanticRole === "meeting_source") {
    const sourceKind =
      appliedParameters[semanticRole === "meeting_source" ? "meeting_source_kind" : "source_kind"];
    if (typeof sourceKind === "string" && sourceKind) {
      return {
        ...node,
        config: {
          ...node.config,
          source_kind: sourceKind,
        },
      };
    }
  }
  if (semanticRole === "weather_source") {
    return {
      ...node,
      config: {
        ...node.config,
        ...(appliedParameters.location_query ? { location_query: appliedParameters.location_query } : {}),
        ...(appliedParameters.forecast_days ? { forecast_days: Number(appliedParameters.forecast_days) || 7 } : {}),
      },
    };
  }
  if (semanticRole === "budget_source") {
    return {
      ...node,
      config: {
        ...node.config,
        ...(appliedParameters.horizon_months ? { horizon_months: Number(appliedParameters.horizon_months) || 6 } : {}),
        ...(appliedParameters.currency ? { currency: appliedParameters.currency } : {}),
      },
    };
  }
  if (semanticRole === "spreadsheet_output") {
    return {
      ...node,
      config: {
        ...node.config,
        final_schema: {
          ...finalSchemaFromNode(node),
          formats: [appliedParameters.export_format || "xlsx"],
        },
      },
    };
  }
  if (semanticRole === "chart_output") {
    return {
      ...node,
      config: {
        ...node.config,
        final_schema: {
          ...finalSchemaFromNode(node),
          preferred_chart_type: appliedParameters.chart_type || "line",
        },
      },
    };
  }
  if (semanticRole === "digest_output") {
    return {
      ...node,
      config: {
        ...node.config,
        final_schema: {
          ...finalSchemaFromNode(node),
          digest_kind: appliedParameters.digest_style || "summary",
        },
      },
    };
  }
  if (semanticRole === "review_step" && appliedParameters.review_mode === "suggest_only") {
    return {
      ...node,
      policy: {
        ...node.policy,
        approval_mode: "suggest_only",
      },
    };
  }
  return node;
}

export function workflowBranchPresetLabelsForEdges(
  edgeCount: number,
  labels: readonly string[],
): string[] {
  return Array.from({ length: Math.max(0, edgeCount) }, (_, index) =>
    labels[index] ?? labels[labels.length - 1] ?? "",
  );
}

export function workflowGraphAfterBranchPresetLabels(args: {
  draft: WorkflowGraphDraft;
  edgeIds: readonly string[];
  labels: readonly string[];
}): WorkflowGraphDraft {
  const labelsByEdgeId = new Map(
    args.edgeIds.map((edgeId, index) => [edgeId, args.labels[index] || undefined]),
  );
  return {
    ...args.draft,
    edges: args.draft.edges.map((edge) =>
      labelsByEdgeId.has(edge.id)
        ? { ...edge, condition_label: labelsByEdgeId.get(edge.id) }
        : edge,
    ),
  };
}

export function workflowBranchPresetUnavailableFeedback(): string {
  return "Connect this node to downstream branches before applying a branch preset.";
}

export function workflowBranchPresetSuccessFeedback(nodeLabel: string): string {
  return `Applied branch preset to ${nodeLabel}.`;
}

export function workflowBranchPresetFailureFeedback(error: unknown): string {
  return `Could not apply branch preset: ${error instanceof Error ? error.message : String(error)}`;
}

export function workflowBranchScaffoldForNode(args: {
  draft: WorkflowGraphDraft;
  node: WorkflowNodeDraft;
  labels: readonly string[];
}): {
  graph: WorkflowGraphDraft;
  nextNodes: WorkflowNodeDraft[];
  nextEdges: WorkflowEdgeDraft[];
} {
  const nextNodes = args.labels.map((label, index) => {
    const blueprint = branchScaffoldBlueprint(label, args.node.kind);
    const id = makeId("node");
    return {
      id,
      kind: blueprint.kind,
      label: titleCase(label),
      description: blueprint.description,
      position: {
        x: args.node.position.x + 260,
        y: args.node.position.y + index * 120 - ((args.labels.length - 1) * 60),
      },
      config: blueprint.config,
      policy: defaultPolicy(),
      prompt: blueprint.prompt,
      hidden_runtime_nodes: runtimeHints(blueprint.kind),
      metadata: {
        ...blueprint.metadata,
        generated_by: "branch_scaffold",
        source_node_id: args.node.id,
        branch_label: label,
      },
    } satisfies WorkflowNodeDraft;
  });

  const nextEdges = nextNodes.map((branchNode, index) => ({
    id: makeId("edge"),
    source: args.node.id,
    target: branchNode.id,
    condition_label: args.labels[index],
    metadata: {
      generated_by: "branch_scaffold",
    },
  } satisfies WorkflowEdgeDraft));

  return {
    graph: {
      ...args.draft,
      nodes: [...args.draft.nodes, ...nextNodes],
      edges: [...args.draft.edges, ...nextEdges],
    },
    nextNodes,
    nextEdges,
  };
}

export function workflowBranchScaffoldPreflightFeedback(hasOutgoingBranches: boolean): string | null {
  return hasOutgoingBranches
    ? "This node already has outgoing branches. Use branch presets to relabel them or remove them before scaffolding new ones."
    : null;
}

export function workflowBranchScaffoldDraftWorkflow(args: {
  workflow: SavedWorkflow;
  graph: WorkflowGraphDraft;
  updatedAt: string;
}): SavedWorkflow {
  return {
    ...args.workflow,
    title: args.graph.title,
    description: args.graph.description,
    graph: args.graph,
    latest_ir: null,
    trigger_readiness_summary: null,
    updated_at: args.updatedAt,
  };
}

export function workflowBranchScaffoldSelectedNodeId(
  nextNodes: readonly WorkflowNodeDraft[],
  fallbackNodeId: string,
): string {
  return nextNodes[0]?.id ?? fallbackNodeId;
}

export function workflowBranchScaffoldSuccessFeedback(
  labels: readonly string[],
  nodeLabel: string,
): string {
  return `Created a ${labels.join(" / ")} branch scaffold from ${nodeLabel}. Compiled IR was cleared and should be rebuilt before deploy.`;
}

export function workflowBranchScaffoldFailureFeedback(error: unknown): string {
  return `Could not create branch scaffold: ${error instanceof Error ? error.message : String(error)}`;
}

export function workflowFamilyPromotionPreflightFeedback(acceptedTemplateCount: number): string | null {
  return acceptedTemplateCount > 0
    ? null
    : "Accept at least one template suggestion before promoting a reusable workflow family.";
}

export function workflowFamilyPromotionSavedFeedback(title: string): string {
  return `Saved "${title}" as a reusable workflow family asset.`;
}

export function workflowFamilyInstancePreflightFeedback(hasFamilyAsset: boolean): string | null {
  return hasFamilyAsset
    ? null
    : "Select a workflow family asset before creating a new reusable instance.";
}

export function workflowFamilyInstanceCreatedFeedback(title: string): string {
  return `Created "${title}" from the reusable workflow family asset.`;
}

export function acceptedWorkflowTemplateIdsFromMetadata(metadata: Record<string, unknown>): string[] {
  return Array.isArray(metadata["accepted_template_suggestions"])
    ? metadata["accepted_template_suggestions"].filter((value): value is string => typeof value === "string")
    : [];
}

export function suggestedWorkflowRuntimeTemplateIdsFromMetadata(metadata: Record<string, unknown>): string[] {
  return Array.isArray(metadata["suggested_template_runtime_ids"])
    ? metadata["suggested_template_runtime_ids"].filter((value): value is string => typeof value === "string")
    : [];
}

export function workflowFamilyAssetGraphFromDraft(args: {
  draft: WorkflowGraphDraft;
  familyId: string;
  promotedAt: string;
  sourceWorkflowId: string;
  workflowId: string;
}): WorkflowGraphDraft | null {
  const acceptedTemplateIds = acceptedWorkflowTemplateIdsFromMetadata(args.draft.metadata);
  if (acceptedTemplateIds.length === 0) return null;
  const runtimeTemplateIds = suggestedWorkflowRuntimeTemplateIdsFromMetadata(args.draft.metadata);
  const familyLabel = `${args.draft.title} family`;
  const parameterSchema = inferredWorkflowFamilyParameterSchema(acceptedTemplateIds);
  const defaultParameters = defaultWorkflowFamilyParameters(parameterSchema);
  return {
    ...cloneJson(args.draft),
    workflow_id: args.workflowId,
    title: familyLabel,
    description: args.draft.description ?? `Reusable workflow family derived from ${args.draft.title}.`,
    metadata: {
      ...cloneJson(args.draft.metadata),
      workflow_family_asset: {
        family_id: args.familyId,
        family_label: familyLabel,
        source_workflow_id: args.sourceWorkflowId,
        template_ids: acceptedTemplateIds,
        runtime_template_ids: runtimeTemplateIds,
        parameter_schema: parameterSchema,
        default_parameters: defaultParameters,
        promoted_at: args.promotedAt,
      },
    },
  };
}

export function workflowFamilyInstanceGraphFromAsset(args: {
  appliedParameterOverrides?: Record<string, string>;
  draft: WorkflowGraphDraft;
  familyAsset: NonNullable<ReturnType<typeof workflowFamilyAssetRecord>>;
  familyWorkflowId: string;
  instanceWorkflowId: string;
  instantiatedAt: string;
}): WorkflowGraphDraft {
  const instanceTitle = `${args.draft.title.replace(/\s+family$/i, "")} instance`;
  const appliedParameters = {
    ...defaultWorkflowFamilyParameters(args.familyAsset.parameter_schema),
    ...args.familyAsset.default_parameters,
    ...(args.appliedParameterOverrides ?? {}),
  };
  const metadata: Record<string, unknown> = {
    ...cloneJson(args.draft.metadata),
    workflow_family_instance: {
      family_id: args.familyAsset.family_id,
      family_workflow_id: args.familyWorkflowId,
      family_asset_workflow_id: args.familyWorkflowId,
      instance_workflow_id: args.instanceWorkflowId,
      family_label: args.familyAsset.family_label ?? args.draft.title,
      applied_parameters: appliedParameters,
      instantiated_at: args.instantiatedAt,
    },
  };
  delete metadata["workflow_family_asset"];
  return {
    ...cloneJson(args.draft),
    workflow_id: args.instanceWorkflowId,
    title: instanceTitle,
    instance_inputs: {
      family_id: args.familyAsset.family_id,
      family_workflow_id: args.familyWorkflowId,
      family_asset_workflow_id: args.familyWorkflowId,
      instance_workflow_id: args.instanceWorkflowId,
      values: appliedParameters,
    },
    metadata,
    nodes: args.draft.nodes.map((node) =>
      workflowFamilyNodeWithAppliedParameters(node, appliedParameters)
    ),
  };
}
