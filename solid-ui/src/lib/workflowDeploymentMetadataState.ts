// Pure utility functions for workflow deployment metadata and readiness copy.

import type {
  WorkflowCompiledIr,
  WorkflowConnectorOverrideFields,
  WorkflowConnectorOverrides,
  WorkflowDeployment,
  WorkflowRun,
  SavedWorkflow,
  WorkflowTriggerReadinessSummary,
  WorkflowTriggerRegistrationPreview,
  WorkflowValidationResponse,
} from "@/lib/api";
import type {
  NodeDeploymentPolicyChange,
  WorkflowGraphDraft,
} from "./workflowGraphTypes";
import { isRecord } from "@/lib/eventDetail";
import { titleCase } from "@/lib/workflowGraphCopy";
import { surfaceDateTimeLabel } from "./surfaceTimestampPresentation";

// ---------------------------------------------------------------------------
// Workflow action metadata
// ---------------------------------------------------------------------------

export function workflowCompiledStateForWorkflow(
  workflow: SavedWorkflow,
  compiled: {
    ir: WorkflowCompiledIr | null;
    triggerReadinessSummary?: WorkflowTriggerReadinessSummary;
    updatedAt: string;
  },
): SavedWorkflow {
  return {
    ...workflow,
    latest_ir: compiled.ir,
    trigger_readiness_summary: compiled.triggerReadinessSummary,
    updated_at: compiled.updatedAt,
  };
}

export function workflowCompileFeedback(
  summary: WorkflowTriggerReadinessSummary | null | undefined,
): string {
  return `Compiled workflow into deterministic runtime IR.${workflowTriggerReadinessFeedback(summary)}`;
}

export function workflowGraphPayload(graphDraft: WorkflowGraphDraft): Record<string, unknown> {
  return { ...graphDraft };
}

export function workflowValidationFeedback(
  result: Pick<WorkflowValidationResponse, "valid" | "summary">,
): string {
  if (!result.valid) {
    return "Workflow validation found validation or compile-time issues.";
  }
  return result.summary?.trigger_readiness_summary?.live_registration_supported === false
    ? "Workflow validation passed with readiness limits. Compiled trigger wiring is still preview-only."
    : "Workflow validation passed.";
}

export function workflowSavedFeedback(title: string): string {
  return `Saved "${title}".`;
}

export function workflowActionPreflightFeedback(
  action: "favorite" | "archive" | "deploy" | "rollback",
  workflow: SavedWorkflow,
): string | null {
  if (action === "deploy" && !workflow.latest_ir) {
    return "Compile the workflow before deploying it.";
  }
  return null;
}

export function workflowActionSuccessUiEffects(
  action: "favorite" | "archive" | "deploy" | "rollback",
): {
  closeDeployPreview: boolean;
  clearRollbackPreview: boolean;
  extendLiveRefreshWindow: boolean;
  refreshDeploymentHistory: boolean;
} {
  const deploymentAction = action === "deploy" || action === "rollback";
  return {
    closeDeployPreview: action === "deploy",
    clearRollbackPreview: action === "rollback",
    extendLiveRefreshWindow: deploymentAction,
    refreshDeploymentHistory: deploymentAction,
  };
}

export function workflowTriggerReadinessSummaryFromPreview(
  preview: WorkflowTriggerRegistrationPreview | null | undefined,
): WorkflowTriggerReadinessSummary | null {
  if (!preview) return null;
  return {
    status: preview.status ?? null,
    activation_count: typeof preview.activation_count === "number" ? preview.activation_count : null,
    live_registration_supported:
      typeof preview.live_registration_supported === "boolean"
        ? preview.live_registration_supported
        : null,
    registration_targets: Array.isArray(preview.registration_targets) ? preview.registration_targets : [],
    runtime_requirements: Array.isArray(preview.runtime_requirements) ? preview.runtime_requirements : [],
    missing_runtime_capabilities: Array.isArray(preview.missing_runtime_capabilities)
      ? preview.missing_runtime_capabilities
      : [],
  };
}

export function workflowTriggerReadinessSummaryFromStatus(
  status: string | null | undefined,
  liveRegistrationSupported: boolean | null | undefined,
): WorkflowTriggerReadinessSummary | null {
  if (!status && typeof liveRegistrationSupported !== "boolean") return null;
  return {
    status: status ?? null,
    activation_count: null,
    live_registration_supported:
      typeof liveRegistrationSupported === "boolean" ? liveRegistrationSupported : null,
    registration_targets: [],
    runtime_requirements: [],
    missing_runtime_capabilities: [],
  };
}

export function workflowTriggerReadinessSummaryForCompiledIr(
  compiledIr: WorkflowCompiledIr | null | undefined,
): WorkflowTriggerReadinessSummary | null {
  return workflowTriggerReadinessSummaryFromPreview(compiledIr?.activation_registration_preview ?? null);
}

export function workflowTriggerReadinessSummaryForWorkflow(
  workflow: SavedWorkflow | null | undefined,
): WorkflowTriggerReadinessSummary | null {
  if (!workflow) return null;
  return workflow.trigger_readiness_summary
    ?? workflowTriggerReadinessSummaryForCompiledIr(workflow.latest_ir ?? null);
}

export function workflowHasCompiledContract(
  workflow: SavedWorkflow | null | undefined,
): boolean {
  if (!workflow) return false;
  return Boolean(workflowTriggerReadinessSummaryForWorkflow(workflow)) || Boolean(workflow.latest_ir);
}

export function workflowTriggerReadinessFeedback(
  summary: WorkflowTriggerReadinessSummary | null | undefined,
): string {
  if (!summary || summary.status === "not_applicable") return "";
  if (summary.live_registration_supported === false) {
    return " Trigger wiring is still preview-only.";
  }
  if (summary.live_registration_supported === true) {
    return " Trigger registration is live-ready.";
  }
  return typeof summary.status === "string" && summary.status.length > 0
    ? ` Trigger readiness: ${summary.status.replaceAll("_", " ")}.`
    : "";
}

export function workflowActionFeedback(args: {
  action: "favorite" | "archive" | "deploy" | "rollback";
  archivedAt?: string | null;
  deploymentId?: string | null;
  favorite?: boolean | null;
  triggerReadinessSummary?: WorkflowTriggerReadinessSummary | null;
}): string {
  if (args.action === "deploy" && args.deploymentId) {
    return `Workflow deployed with deployment id ${args.deploymentId}.${workflowTriggerReadinessFeedback(args.triggerReadinessSummary)}`;
  }
  if (args.action === "rollback" && args.deploymentId) {
    return `Workflow rolled back with deployment id ${args.deploymentId}.${workflowTriggerReadinessFeedback(args.triggerReadinessSummary)}`;
  }
  if (args.action === "favorite") {
    return args.favorite ? "Workflow favorited." : "Workflow removed from favorites.";
  }
  return args.archivedAt ? "Workflow archived." : "Workflow restored from archive.";
}

export function workflowTriggerReadinessBadgeLabel(
  summary: WorkflowTriggerReadinessSummary | null | undefined,
  options: { capitalize?: boolean } = {},
): string | null {
  if (!summary || summary.status === "not_applicable") return null;
  const prefix = options.capitalize ? "Trigger" : "trigger";
  if (summary.live_registration_supported === false) {
    return `${prefix} preview-only`;
  }
  if (summary.live_registration_supported === true) {
    return `${prefix} live-ready`;
  }
  return typeof summary.status === "string" && summary.status.length > 0
    ? `${prefix} ${summary.status.replaceAll("_", " ")}`
    : null;
}

export function workflowTriggerPreviewEntryPointWarning(
  summary: WorkflowTriggerReadinessSummary | null | undefined,
  options: { subject?: string } = {},
): string | null {
  if (!summary || summary.status === "not_applicable") return null;
  if (summary.live_registration_supported !== false) return null;
  const subject = options.subject ?? "This workflow";
  return `${subject} is still trigger preview-only. Treat deploy review as available, but do not treat it as a live trigger entry point yet.`;
}

function workflowTriggerReadinessStatusText(
  summary: NonNullable<WorkflowTriggerReadinessSummary>,
): string | null {
  return typeof summary.status === "string" && summary.status.length > 0
    ? summary.status.replaceAll("_", " ")
    : null;
}

function workflowTriggerReadinessStatusSentence(
  summary: NonNullable<WorkflowTriggerReadinessSummary>,
  subject: string,
  options: { trailingPeriod?: boolean } = {},
): string | null {
  const statusText = workflowTriggerReadinessStatusText(summary);
  if (!statusText) return null;
  const suffix = options.trailingPeriod ? "." : "";
  return `${subject} reports trigger readiness status: ${statusText}${suffix}`;
}

export function workflowTriggerReadinessSupportNote(
  summary: WorkflowTriggerReadinessSummary | null | undefined,
  options: { subject?: string } = {},
): string | null {
  if (!summary || summary.status === "not_applicable") return null;
  const subject = options.subject ?? "Compiled trigger wiring";
  if (summary.live_registration_supported === false) {
    return `${subject} is still trigger preview-only and should not be treated as a live trigger entry point`;
  }
  if (summary.live_registration_supported === true) {
    return `${subject} reports live registration support`;
  }
  return workflowTriggerReadinessStatusSentence(summary, subject);
}

export function workflowTriggerReadinessTooltip(
  summary: WorkflowTriggerReadinessSummary | null | undefined,
  options: { subject?: string } = {},
): string | null {
  if (!summary || summary.status === "not_applicable") return null;
  const subject = options.subject ?? "Compiled trigger wiring";
  if (summary.live_registration_supported === false) {
    return `${subject} is still preview-only; do not treat it as a live trigger entry point yet.`;
  }
  if (summary.live_registration_supported === true) {
    return `${subject} reports live registration support.`;
  }
  return workflowTriggerReadinessStatusSentence(summary, subject, { trailingPeriod: true });
}

export function workflowTriggerReadinessAvailabilityNote(
  subject = "Trigger readiness state",
): string {
  return `${subject} is available for this workflow shape.`;
}

export function workflowCompiledContractTooltip(
  workflow: SavedWorkflow | null | undefined,
): string {
  const readinessSummary = workflowTriggerReadinessSummaryForWorkflow(workflow);
  return workflowTriggerReadinessTooltip(readinessSummary, {
    subject: "Compiled trigger wiring",
  }) ?? (workflowHasCompiledContract(workflow)
    ? "Compiled contract available."
    : "Compiled contract not available yet.");
}

export function workflowActivationFollowThroughNote(): string {
  return "The workflow shape validates, but one or more activation-readiness checks still need follow-through.";
}

export function workflowCompiledContractUnavailableNote(): string {
  return "Compiled contract preview is unavailable until the current validation or compile-time issues are resolved.";
}

export function workflowBuildDeployPrerequisiteNote(): string {
  return "Build then Deploy this workflow before using Run or Dry run.";
}

export function workflowValidationClearNote(issueCount: number): string {
  return issueCount > 0
    ? `${issueCount} validation or compile-time issue(s) must be resolved`
    : "No validation or compile-time issues";
}

export function workflowCompiledContractChecklistNote(
  manifestCount: number | null | undefined,
  hasErrors: boolean,
): string {
  if (typeof manifestCount === "number" && manifestCount > 0) {
    return `${manifestCount} manifest(s) ready`;
  }
  if (hasErrors) {
    return "Resolve validation or compile-time issues before activation";
  }
  return "Run compile step before activation";
}

export function workflowWaitResumeChecklistNote(count: number): string {
  return count > 0
    ? `${count} wait/resume pair(s) defined`
    : "Long-running nodes detected - add wait/resume contracts to avoid timeouts";
}

export function workflowWarningsChecklistNote(count: number): string {
  return count > 0
    ? `${count} warning(s) - review before activating`
    : "Clean";
}

export function workflowValidationHeadline(
  valid: boolean,
  allChecksPassed: boolean,
): string {
  if (!valid) return "Validation or compile-time issues found";
  if (!allChecksPassed) return "Validation passed with readiness limits";
  return "Validation passed";
}

export function workflowValidationSummaryLine(
  nodeCount: number,
  edgeCount: number,
): string {
  return `${nodeCount} nodes - ${edgeCount} edges`;
}

export function workflowPreActivationChecklistTitle(): string {
  return "Pre-activation checklist";
}

export function workflowValidationChecklistLabel(
  kind: "validation" | "compiled" | "approval" | "wait_resume" | "warnings" | "trigger_readiness",
): string {
  switch (kind) {
    case "validation":
      return "Validation clear";
    case "compiled":
      return "Contract compiled";
    case "approval":
      return "Approval mode configured";
    case "wait_resume":
      return "Wait/resume contracts";
    case "warnings":
      return "No warnings";
    case "trigger_readiness":
      return "Trigger registration readiness";
  }
}

export function workflowValidationChecklistMarker(ok: boolean): string {
  return ok ? "OK" : "!";
}

export function workflowCompiledContractPreviewTitle(): string {
  return "Compiled contract preview";
}

export function workflowRuntimeKindsTitle(): string {
  return "Runtime kinds";
}

export function workflowRuntimeKindsEmptyState(): string {
  return "No compiled runtime kinds reported.";
}

export function workflowAfpFamiliesTitle(): string {
  return "AFP families";
}

export function workflowAfpFamiliesEmptyState(): string {
  return "No compiled AFP family coverage reported.";
}

export function workflowCompiledContractPreviewSummaryNote(): string {
  return "Validation now includes the runtime topology, AFP family mix, and trigger-readiness view this graph compiles into.";
}

export function workflowCompiledManifestCountLabel(count: number): string {
  return `${count} manifests`;
}

export function workflowCompiledWaitResumeCountLabel(count: number): string {
  return `${count} wait/resume contracts`;
}

export function workflowCompiledApprovalManifestCountLabel(count: number): string {
  return `${count} approval manifests`;
}

export function workflowTriggerReadinessTitle(): string {
  return "Trigger readiness";
}

export function workflowCompiledTriggerReadinessSubject(): string {
  return "The compiled trigger wiring";
}

export function workflowCompiledRuntimeKindLabel(kind: string, count: number): string {
  return `${kind} x ${count}`;
}

export function workflowCompiledAfpFamilyLabel(family: string, count: number): string {
  return `${family} x ${count}`;
}

export function workflowTemplateSuggestionsTitle(): string {
  return "Template suggestions";
}

export function workflowTemplateSuggestionsSummaryNote(): string {
  return "The graph already resembles one or more reusable workflow families. These are advisory only.";
}

export function workflowTemplateSuggestionMatchCountLabel(count: number): string {
  return `${count} match${count === 1 ? "" : "es"}`;
}

export function workflowTemplateSuggestionFamilyStatusLabel(
  workflowFamily: string,
  implementationStatus: string,
): string {
  return `${workflowFamily.replaceAll("_", " ")} · ${implementationStatus.replaceAll("_", " ")}`;
}

export function workflowTemplateSuggestionScoreLabel(score: number): string {
  return `score ${score}`;
}

export function workflowTemplateSuggestionReliabilityLabel(reliability: string): string {
  return `${reliability} reliability`;
}

export function workflowTemplateSuggestionAlignedLabel(): string {
  return "already aligned";
}

export function workflowTemplateSuggestionRoleLabel(role: string): string {
  return role.replaceAll("_", " ");
}

export function workflowTemplateSuggestionAcceptLabel(): string {
  return "Prefer template";
}

export function workflowTemplateSuggestionDismissLabel(): string {
  return "Keep custom";
}

export function workflowDescribeHistoryComparisonLabel(
  kind: "intent" | "preset" | "mode" | "regen_mode",
  changed: boolean,
): string {
  switch (kind) {
    case "intent":
      return changed ? "intent changes" : "intent matches";
    case "preset":
      return changed ? "preset changes" : "preset matches";
    case "mode":
      return changed ? "mode changes" : "mode matches";
    case "regen_mode":
      return changed ? "regen mode changes" : "regen mode matches";
  }
}

export function workflowDescribeHistoryPreviewTitle(): string {
  return "History compare preview";
}

export function workflowDescribeHistoryPreviewSummary(
  eventKind: string,
  currentNodeCount: number,
  currentEdgeCount: number,
): string {
  return `Reusing this ${eventKind} event would target a workflow with ${currentNodeCount} current nodes and ${currentEdgeCount} edges.`;
}

export function workflowDescribeHistoryCurrentGeneratedCoreTitle(): string {
  return "Current generated core";
}

export function workflowDescribeHistorySelectedEventEstimateTitle(): string {
  return "Selected event estimate";
}

export function workflowDescribeHistoryGeneratedCountSummary(
  nodeCount: number,
  edgeCount: number,
): string {
  return `${nodeCount} generated nodes, ${edgeCount} generated edges`;
}

export function workflowDescribeHistoryProtectedRegionSummary(
  protectedNodeCount: number,
  protectedEdgeCount: number,
): string {
  return `Protected regions stay intact: ${protectedNodeCount} nodes, ${protectedEdgeCount} edges`;
}

export function workflowDescribeHistoryPreservedRegionSummary(
  regenerationMode: string,
  preservedManualNodeCount: number,
  preservedManualEdgeCount: number,
  preservedProtectedNodeCount: number,
  preservedProtectedEdgeCount: number,
): string {
  return `In ${regenerationMode} mode, preserved regions would keep ${preservedManualNodeCount} nodes and ${preservedManualEdgeCount} edges, including ${preservedProtectedNodeCount} protected nodes and ${preservedProtectedEdgeCount} protected edges.`;
}

export function workflowDescribeHistoryCapabilityBadgeLabel(
  kind: "approval" | "branching" | "research_support",
): string {
  switch (kind) {
    case "approval":
      return "approval";
    case "branching":
      return "branching";
    case "research_support":
      return "research support";
  }
}

export function workflowDescribeHistoryEstimatedPresetLabel(presetKind: string): string {
  return titleCase(presetKind);
}

export function workflowComposerSavedDescriptionTitle(): string {
  return "Saved description";
}

export function workflowComposerDescribeHistoryTitle(): string {
  return "Describe history";
}

export function workflowComposerDescribeWorkflowTitle(): string {
  return "Describe workflow";
}

export function workflowComposerDescribeWorkflowSummary(): string {
  return "Start from natural language and generate an editable preset-backed starter graph. This path is deterministic for now and uses the shared template registry instead of freeform prose generation.";
}

export function workflowComposerHeaderEyebrow(): string {
  return "Workflow Builder";
}

export function workflowComposerHeaderTitle(): string {
  return "Visual workflow editor";
}

export function workflowComposerHeaderSummary(): string {
  return "Save validated workflow graphs, edit primitive and preset-backed nodes, drag the canvas, tune prompts and policies, then compile to deterministic runtime IR before deployment.";
}

export function workflowComposerPrimaryActionLabel(
  kind:
    | "new"
    | "save"
    | "validate"
    | "build"
    | "favorite"
    | "archive"
    | "deploy_preview"
    | "run"
    | "run_confirm"
    | "cancel"
    | "dry_run",
  options?: {
    busy?: boolean;
    active?: boolean;
    favored?: boolean;
    archived?: boolean;
  },
): string {
  switch (kind) {
    case "new":
      return "New workflow";
    case "save":
      return options?.busy ? "Saving..." : "Save";
    case "validate":
      return options?.busy ? "Validating..." : "Validate";
    case "build":
      return options?.busy ? "Building..." : "Build Workflow";
    case "favorite":
      if (options?.busy) return "Updating...";
      return options?.favored ? "Unfavorite" : "Favorite";
    case "archive":
      if (options?.busy) return "Updating...";
      return options?.archived ? "Restore" : "Archive";
    case "deploy_preview":
      if (options?.busy) return "Deploying...";
      return options?.active ? "Hide deploy preview" : "Preview deploy";
    case "run":
      return options?.busy ? "Running..." : "Run";
    case "run_confirm":
      return "Confirm run OK";
    case "cancel":
      return "Cancel";
    case "dry_run":
      return options?.busy ? "Simulating..." : "Dry run";
  }
}

export function workflowComposerIntentExpansionBadgeLabel(
  kind: "preset" | "mode",
  value: string,
): string {
  return `${kind} ${kind === "preset" ? titleCase(value) : value}`;
}

export function workflowComposerIntentExpansionCapabilityLabel(
  kind: "approval" | "branching" | "research_support" | "public_output",
): string {
  switch (kind) {
    case "approval":
      return "approval";
    case "branching":
      return "branching";
    case "research_support":
      return "research support";
    case "public_output":
      return "public output";
  }
}

export function workflowComposerIntentPlaceholder(): string {
  return "Example: Research solid-state battery suppliers, compare options, and pause for approval before contacting anyone.";
}

export function workflowComposerIntentActionLabel(
  kind: "generate" | "clear" | "regenerate_draft",
): string {
  switch (kind) {
    case "generate":
      return "Generate starter graph";
    case "clear":
      return "Clear";
    case "regenerate_draft":
      return "Regenerate draft";
  }
}

export function workflowComposerOverrideLabel(
  kind: "preset" | "optimization" | "regeneration_mode",
): string {
  switch (kind) {
    case "preset":
      return "Preset override";
    case "optimization":
      return "Optimization override";
    case "regeneration_mode":
      return "Regeneration mode";
  }
}

export function workflowComposerOverrideOptionLabel(
  kind:
    | "preset_inferred"
    | "optimization_inferred"
    | "optimization_balanced"
    | "optimization_speed"
    | "optimization_cost"
    | "regeneration_preserve_manual"
    | "regeneration_rebuild",
): string {
  switch (kind) {
    case "preset_inferred":
      return "Use inferred preset";
    case "optimization_inferred":
      return "Use inferred mode";
    case "optimization_balanced":
      return "balanced";
    case "optimization_speed":
      return "speed";
    case "optimization_cost":
      return "cost";
    case "regeneration_preserve_manual":
      return "preserve manual edits";
    case "regeneration_rebuild":
      return "rebuild from description";
  }
}

export function workflowComposerPresetOptionLabel(preset: string): string {
  return titleCase(preset);
}

export function workflowComposerRegenerationImpactTitle(): string {
  return "Regeneration impact";
}

export function workflowComposerRegenerationImpactSummary(
  regenerationMode: "rebuild" | "preserve_manual",
  impact: {
    generatedNodes: number;
    generatedEdges: number;
    preservedNodes: number;
    preservedEdges: number;
    lockedNodes: number;
  },
): string {
  if (regenerationMode === "preserve_manual") {
    return `Rebuild ${impact.generatedNodes} generated nodes and ${impact.generatedEdges} generated edges while preserving ${impact.preservedNodes} manual/protected nodes, including ${impact.lockedNodes} explicitly protected nodes, and ${impact.preservedEdges} preserved edges.`;
  }
  return `Rebuild the full described workflow. ${impact.generatedNodes + impact.preservedNodes} nodes and ${impact.generatedEdges + impact.preservedEdges} edges will be replaced by a fresh generated draft.`;
}


export function workflowComposerCompiledSnapshotSubject(): string {
  return "The latest compiled runtime snapshot";
}

export function workflowDescribeHistoryMetadataBadgeLabel(
  kind: "preset" | "mode",
  value: string | undefined,
): string {
  if (!value) return "";
  return kind === "preset" ? titleCase(value) : value;
}

export function workflowDescribeHistoryEventKindBadgeLabel(eventKind: string): string {
  return eventKind.replaceAll("_", " ");
}

export function workflowDescribeHistoryTimestampLabel(timestamp: string): string {
  return surfaceDateTimeLabel(timestamp) || timestamp;
}

export function workflowDescribeHistorySelectedEventLabel(): string {
  return "Selected event:";
}

export function workflowDescribeHistoryReuseFeedback(): string {
  return "Loaded this describe event into the workflow composer.";
}

export function workflowDescribeHistoryReuseActionLabel(): string {
  return "Reuse in composer";
}

export function workflowDescribeHistoryCompareActionLabel(active: boolean): string {
  return active ? "Hide compare" : "Compare";
}

export function workflowDescribeHistorySaveBranchActionLabel(): string {
  return "Save as branch";
}

export function workflowDescribeHistoryRegenerateActionLabel(): string {
  return "Regenerate from this";
}

export function workflowRailBadgeLabel(
  kind: "family_root" | "branch_child" | "family_asset" | "family_instance" | "branch" | "favorite",
): string {
  switch (kind) {
    case "family_root":
      return "Family root";
    case "branch_child":
      return "Branch child";
    case "family_asset":
      return "Family asset";
    case "family_instance":
      return "Family instance";
    case "branch":
      return "Branch";
    case "favorite":
      return "Fav";
  }
}

export function workflowRailFamilyToggleLabel(collapsed: boolean): string {
  return collapsed ? "Expand" : "Collapse";
}

export function workflowRailDescriptionFallback(): string {
  return "No description yet.";
}

export function workflowRailBranchOriginLabel(parentWorkflowId: string): string {
  return `from ${parentWorkflowId}`;
}

export function workflowRailSiblingSummaryLabel(
  siblingCount: number,
  hidden: boolean,
): string {
  return `${siblingCount} related branch${siblingCount === 1 ? "" : "es"}${hidden ? " hidden" : ""}`;
}

export function workflowRailNodeCountLabel(nodeCount: number): string {
  return `${nodeCount} nodes`;
}

export function workflowRailBranchFamilyTitle(): string {
  return "Branch family";
}

export function workflowRailMoreSiblingsLabel(extraCount: number): string {
  return `+${extraCount} more`;
}

export function workflowCompiledContractStatusLabel(
  workflow: SavedWorkflow | null | undefined,
): "draft" | "compiled preview" | "compiled" {
  if (!workflowHasCompiledContract(workflow)) return "draft";
  return workflowTriggerReadinessSummaryForWorkflow(workflow)?.live_registration_supported === false
    ? "compiled preview"
    : "compiled";
}

export function workflowTriggerReadinessSummaryForDeployment(
  deployment: WorkflowDeployment | null | undefined,
): WorkflowTriggerReadinessSummary | null {
  if (!deployment) return null;
  return deployment.trigger_readiness_summary
    ?? workflowTriggerReadinessSummaryForCompiledIr(deployment.ir_snapshot);
}

export function deploymentOverrideSummary(
  deployment: WorkflowDeployment,
): WorkflowConnectorOverrides | null {
  const metadata = deployment.ir_snapshot?.metadata;
  if (!isRecord(metadata)) return null;
  const defaults = metadata.deployment_connector_defaults;
  if (!isRecord(defaults)) return null;
  return normalizeWorkflowConnectorOverrides(defaults.overrides);
}

function overrideFieldValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeOverrideFields(value: unknown): WorkflowConnectorOverrideFields {
  const record = isRecord(value) ? value : {};
  return {
    delivery_tier: overrideFieldValue(record.delivery_tier),
    auth_mode: overrideFieldValue(record.auth_mode),
    side_effects: overrideFieldValue(record.side_effects),
    provider_route: overrideFieldValue(record.provider_route),
  };
}

function normalizeOverrideFieldMap(value: unknown): Record<string, WorkflowConnectorOverrideFields> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, entry]) => [key, normalizeOverrideFields(entry)] as const)
    .filter(([, entry]) => Object.values(entry).some(Boolean));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeWorkflowConnectorOverrides(value: unknown): WorkflowConnectorOverrides | null {
  if (!isRecord(value)) return null;
  const normalized: WorkflowConnectorOverrides = {
    ...normalizeOverrideFields(value),
    family_overrides: normalizeOverrideFieldMap(value.family_overrides),
    node_overrides: normalizeOverrideFieldMap(value.node_overrides),
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

export function deploymentChangeSummary(
  deployment: WorkflowDeployment | null | undefined,
): Record<string, unknown> | null {
  if (!deployment) return null;
  const metadata = deployment.ir_snapshot?.metadata;
  if (!isRecord(metadata)) return null;
  const summary = metadata.deployment_change_summary;
  return isRecord(summary) ? summary : null;
}

export function deploymentChangeSummaryEntries(
  deployment: WorkflowDeployment | null | undefined,
): Array<{ nodeId: string; summary: string }> {
  if (!deployment) return [];
  const summary = deploymentChangeSummary(deployment);
  const changedNodes = Array.isArray(summary?.changed_nodes)
    ? summary.changed_nodes.filter(isRecord)
    : [];
  return changedNodes.map((entry) => ({
    nodeId: typeof entry.node_id === "string" ? entry.node_id : "unknown",
    summary: Array.isArray(entry.field_changes)
      ? entry.field_changes
          .filter(isRecord)
          .map((change) => `${String(change.field).replaceAll("_", " ")} ${change.previous ?? "unset"} -> ${change.current ?? "unset"}`)
          .join(" · ")
      : "",
  }));
}

export function deploymentChangeSummaryFieldChangesForNode(
  deployment: WorkflowDeployment | null | undefined,
  nodeId: string | null | undefined,
): NodeDeploymentPolicyChange[] {
  if (!deployment || !nodeId) return [];
  const summary = deploymentChangeSummary(deployment);
  const changedNodes = Array.isArray(summary?.changed_nodes)
    ? summary.changed_nodes.filter(isRecord)
    : [];
  const match = changedNodes.find(
    (entry) => typeof entry.node_id === "string" && entry.node_id === nodeId,
  );
  if (!match || !Array.isArray(match.field_changes)) return [];
  return match.field_changes
    .filter(isRecord)
    .map((change) => ({
      field: String(change.field) as keyof WorkflowConnectorOverrideFields,
      current: change.previous == null ? null : String(change.previous),
      next: change.current == null ? null : String(change.current),
    }));
}

export function replayComparisonSummary(run: WorkflowRun): Record<string, unknown> | null {
  const result = run.result;
  if (!isRecord(result)) return null;
  const summary = result.replay_comparison;
  return isRecord(summary) ? summary : null;
}
