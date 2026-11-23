// @locs-version: 1.0
import {
  expandWorkflowIntent,
  presetStarterBlueprintsForPreset,
  type PresetNodeKind,
} from "afp-ts/workflows";
import type { WorkflowGraphDraft } from "@/lib/workflowGraphTypes";
import type { DescribeHistoryEntry } from "@/lib/workflowDescribeHistory";
import { titleCase } from "@/lib/workflowGraphCopy";
import {
  generatedCoreSummary,
  regenerationPreservationEstimate,
} from "@/lib/workflowRegenerationState";
import { isRecord } from "@/lib/eventDetail";

function makeDescribeHistoryId(): string {
  return `wfhist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function estimatedGeneratedCoreForIntent(
  intent: string,
  presetOverride?: PresetNodeKind | "",
): {
  presetKind: PresetNodeKind;
  estimatedNodeCount: number;
  estimatedEdgeCount: number;
  requiresApproval: boolean;
  needsBranching: boolean;
  needsResearchSupport: boolean;
} {
  const expansion = expandWorkflowIntent(intent);
  const presetKind = (presetOverride || expansion.preset_kind) as PresetNodeKind;
  const blueprints = presetStarterBlueprintsForPreset(presetKind);
  const hasApproval = blueprints.some((blueprint) => blueprint.kind === "approval");
  const hasCondition = blueprints.some((blueprint) => blueprint.kind === "condition");
  const hasWebSearch = blueprints.some(
    (blueprint) =>
      blueprint.kind === "tool" &&
      typeof blueprint.config.capability_id === "string" &&
      blueprint.config.capability_id === "web_search",
  );
  const estimatedNodeCount =
    1 +
    blueprints.length +
    (expansion.needs_research_support && !hasWebSearch ? 1 : 0) +
    (expansion.requires_approval && !hasApproval ? 1 : 0) +
    (expansion.needs_branching && !hasCondition ? 2 : 0);
  const estimatedEdgeCount =
    blueprints.length +
    (expansion.needs_research_support && !hasWebSearch ? 1 : 0) +
    (expansion.requires_approval && !hasApproval ? 1 : 0) +
    (expansion.needs_branching && !hasCondition ? 2 : 0);
  return {
    presetKind,
    estimatedNodeCount,
    estimatedEdgeCount,
    requiresApproval: expansion.requires_approval,
    needsBranching: expansion.needs_branching,
    needsResearchSupport: expansion.needs_research_support,
  };
}

export function describeHistoryEntries(draft: WorkflowGraphDraft): DescribeHistoryEntry[] {
  const raw = draft.metadata["describe_history"];
  if (!Array.isArray(raw)) return [];
  return raw
    .map<DescribeHistoryEntry | null>((entry) => {
      if (!isRecord(entry)) return null;
      const record = entry;
      return {
        event_id: typeof record.event_id === "string" ? record.event_id : makeDescribeHistoryId(),
        event_kind: typeof record.event_kind === "string" ? record.event_kind : "created",
        intent: typeof record.intent === "string" ? record.intent : "",
        preset_kind: typeof record.preset_kind === "string" ? record.preset_kind : undefined,
        optimization_mode: typeof record.optimization_mode === "string" ? record.optimization_mode : undefined,
        regeneration_mode: typeof record.regeneration_mode === "string" ? record.regeneration_mode : undefined,
        timestamp: typeof record.timestamp === "string" ? record.timestamp : undefined,
      };
    })
    .filter((entry): entry is DescribeHistoryEntry => entry !== null)
    .reverse();
}

export function describeHistoryComparison(args: {
  draft: WorkflowGraphDraft;
  entry: DescribeHistoryEntry;
  intentOverride: string;
  optimizationOverride: "balanced" | "speed" | "cost" | "";
  presetOverride: PresetNodeKind | "";
  regenerationMode: "rebuild" | "preserve_manual";
  workflowDescription?: string | null;
}) {
  const currentIntent =
    args.intentOverride.trim() ||
    (typeof args.draft.metadata["source_intent"] === "string"
      ? String(args.draft.metadata["source_intent"])
      : "") ||
    (args.workflowDescription ?? "").trim();
  const currentPreset =
    (
      args.presetOverride ||
      (typeof args.draft.metadata["inferred_preset"] === "string"
        ? String(args.draft.metadata["inferred_preset"])
        : "")
    ) || "";
  const currentOptimization =
    (
      args.optimizationOverride ||
      (typeof args.draft.optimization_mode === "string" ? args.draft.optimization_mode : "balanced")
    ) || "balanced";
  const currentCore = generatedCoreSummary(args.draft);
  const preservation = regenerationPreservationEstimate(args.draft, args.regenerationMode);
  const estimatedEntryCore = estimatedGeneratedCoreForIntent(
    args.entry.intent,
    (args.entry.preset_kind as PresetNodeKind | undefined) ?? "",
  );
  return {
    intentChanged: currentIntent.trim() !== args.entry.intent.trim(),
    presetChanged: Boolean(args.entry.preset_kind) && currentPreset !== (args.entry.preset_kind ?? ""),
    optimizationChanged:
      Boolean(args.entry.optimization_mode) && currentOptimization !== (args.entry.optimization_mode ?? ""),
    regenerationChanged:
      Boolean(args.entry.regeneration_mode)
      && args.regenerationMode !== (args.entry.regeneration_mode ?? "preserve_manual"),
    currentNodeCount: args.draft.nodes.length,
    currentEdgeCount: args.draft.edges.length,
    currentGeneratedNodeCount: currentCore.generatedNodeCount,
    currentGeneratedEdgeCount: currentCore.generatedEdgeCount,
    protectedNodeCount: currentCore.protectedNodeCount,
    protectedEdgeCount: currentCore.protectedEdgeCount,
    estimatedGeneratedNodeCount: estimatedEntryCore.estimatedNodeCount,
    estimatedGeneratedEdgeCount: estimatedEntryCore.estimatedEdgeCount,
    estimatedPresetKind: estimatedEntryCore.presetKind,
    estimatedNeedsApproval: estimatedEntryCore.requiresApproval,
    estimatedNeedsBranching: estimatedEntryCore.needsBranching,
    estimatedNeedsResearchSupport: estimatedEntryCore.needsResearchSupport,
    preservedManualNodeCount: preservation.preservedManualNodeCount,
    preservedManualEdgeCount: preservation.preservedManualEdgeCount,
    preservedProtectedNodeCount: preservation.preservedProtectedNodeCount,
    preservedProtectedEdgeCount: preservation.preservedProtectedEdgeCount,
  };
}

export function workflowIntentExpansionWithOverrides(
  intent: string,
  presetOverride: PresetNodeKind | "",
  optimizationOverride: "balanced" | "speed" | "cost" | "",
): ReturnType<typeof expandWorkflowIntent> | null {
  const trimmedIntent = intent.trim();
  if (!trimmedIntent) return null;
  const base = expandWorkflowIntent(trimmedIntent);
  return {
    ...base,
    preset_kind: presetOverride || base.preset_kind,
    optimization_mode: optimizationOverride || base.optimization_mode,
  };
}

export function workflowRegenerationImpactVisible(args: {
  intent: string;
  hasWorkflow: boolean;
}): boolean {
  return args.intent.trim().length > 0 && args.hasWorkflow;
}

export function workflowSourceIntentForRegeneration(args: {
  composerIntent: string;
  description?: string | null;
  draft: WorkflowGraphDraft;
}): string {
  return (
    args.composerIntent.trim()
    || (typeof args.draft.metadata["source_intent"] === "string"
      ? String(args.draft.metadata["source_intent"])
      : "")
    || (args.description ?? "").trim()
  );
}

export function workflowDescribeBranchSavedFeedback(): string {
  return "Saved a new workflow branch from this describe event.";
}

export function workflowDescribeBranchFailureFeedback(error: unknown): string {
  return `Could not save branch from describe history: ${error instanceof Error ? error.message : String(error)}`;
}

export function workflowDescribeCreatePreflightFeedback(intent: string): string | null {
  return intent.trim() ? null : "Describe the workflow you want to build first.";
}

export function workflowDescribeCreatedFeedback(presetKind: string | null | undefined): string {
  return `Generated a ${titleCase(presetKind ?? "research_assistant")} starter workflow from your description.`;
}

export function workflowDescribeFallbackFeedback(error: unknown): string {
  return `Used local describe fallback: ${error instanceof Error ? error.message : String(error)}`;
}

export function workflowRegeneratePreflightFeedback(args: {
  hasWorkflow: boolean;
  sourceIntent: string;
}): string | null {
  if (!args.hasWorkflow) return "Select a workflow to regenerate it from description.";
  return args.sourceIntent ? null : "This workflow does not have a saved description to regenerate from.";
}

export function workflowRegeneratedFeedback(): string {
  return "Regenerated the workflow draft from its description. Save when you're happy with the updated graph.";
}

export function workflowRegenerationFallbackFeedback(error: unknown): string {
  return `Used local regeneration fallback: ${error instanceof Error ? error.message : String(error)}`;
}

export function selectedDescribeHistoryEntryForDraft(
  draft: WorkflowGraphDraft | null | undefined,
  eventId: string | null | undefined,
): DescribeHistoryEntry | null {
  if (!draft || !eventId) return null;
  return describeHistoryEntries(draft).find((entry) => entry.event_id === eventId) ?? null;
}

export function describeHistoryComparisonForDraft(args: {
  draft: WorkflowGraphDraft | null | undefined;
  entry: DescribeHistoryEntry | null | undefined;
  intentOverride: string;
  optimizationOverride: "balanced" | "speed" | "cost" | "";
  presetOverride: PresetNodeKind | "";
  regenerationMode: "rebuild" | "preserve_manual";
  workflowDescription?: string | null;
}): ReturnType<typeof describeHistoryComparison> | null {
  if (!args.draft || !args.entry) return null;
  return describeHistoryComparison({
    draft: args.draft,
    entry: args.entry,
    intentOverride: args.intentOverride,
    optimizationOverride: args.optimizationOverride,
    presetOverride: args.presetOverride,
    regenerationMode: args.regenerationMode,
    workflowDescription: args.workflowDescription,
  });
}

export function describeHistoryEntryComposerState(entry: DescribeHistoryEntry): {
  intent: string;
  optimizationOverride: "balanced" | "speed" | "cost" | "";
  presetOverride: PresetNodeKind | "";
  regenerationMode: "rebuild" | "preserve_manual";
} {
  const optimizationOverride =
    entry.optimization_mode === "balanced" ||
    entry.optimization_mode === "speed" ||
    entry.optimization_mode === "cost"
      ? entry.optimization_mode
      : "";
  return {
    intent: entry.intent,
    presetOverride: (entry.preset_kind as PresetNodeKind | undefined) ?? "",
    optimizationOverride,
    regenerationMode: entry.regeneration_mode === "rebuild" ? "rebuild" : "preserve_manual",
  };
}
