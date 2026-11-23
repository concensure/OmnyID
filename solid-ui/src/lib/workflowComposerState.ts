// @locs-version: 1.0
import type { SavedWorkflow, WorkflowIntentExpansion } from "@/lib/api";
import {
  workflowComposerIntentExpansionBadgeLabel,
  workflowComposerIntentExpansionCapabilityLabel,
  workflowComposerRegenerationImpactSummary,
  workflowDescribeHistoryCapabilityBadgeLabel,
  workflowDescribeHistoryComparisonLabel,
  workflowDescribeHistoryCurrentGeneratedCoreTitle,
  workflowDescribeHistoryEstimatedPresetLabel,
  workflowDescribeHistoryEventKindBadgeLabel,
  workflowDescribeHistoryGeneratedCountSummary,
  workflowDescribeHistoryMetadataBadgeLabel,
  workflowDescribeHistoryPreservedRegionSummary,
  workflowDescribeHistoryPreviewSummary,
  workflowDescribeHistoryPreviewTitle,
  workflowDescribeHistoryProtectedRegionSummary,
  workflowDescribeHistoryCompareActionLabel,
  workflowDescribeHistoryRegenerateActionLabel,
  workflowDescribeHistoryReuseActionLabel,
  workflowDescribeHistorySaveBranchActionLabel,
  workflowDescribeHistorySelectedEventEstimateTitle,
  workflowDescribeHistorySelectedEventLabel,
  workflowDescribeHistoryTimestampLabel,
  workflowComposerCompiledSnapshotSubject,
  workflowComposerHeaderEyebrow,
  workflowComposerHeaderSummary,
  workflowComposerHeaderTitle,
  workflowComposerIntentActionLabel,
  workflowComposerDescribeWorkflowSummary,
  workflowComposerDescribeWorkflowTitle,
  workflowComposerOverrideOptionLabel,
  workflowComposerPrimaryActionLabel,
  workflowComposerPresetOptionLabel,
  workflowBuildDeployPrerequisiteNote,
  workflowTriggerPreviewEntryPointWarning,
  workflowTriggerReadinessSummaryForWorkflow,
} from "@/lib/workflowDeploymentHelpers";
import {
  describeHistoryComparison,
  describeHistoryEntries,
} from "@/lib/workflowDescribeIntentAnalysis";
import type { DescribeHistoryEntry } from "@/lib/workflowDescribeHistory";
import { normalizeGraph } from "@/lib/workflowGraphDraftState";
import { workflowRegenerationImpactSummary } from "@/lib/workflowRegenerationState";

export type WorkflowComposerBadgeTone = null | "amber" | "emerald" | "rose" | "violet";

export type WorkflowComposerExpansionBadge = {
  label: string;
  tone: WorkflowComposerBadgeTone;
};

export type WorkflowComposerComparisonChip = {
  changed: boolean;
  dimension: "intent" | "mode" | "preset" | "regen_mode";
};

export type WorkflowComposerSavedDescriptionState = {
  recentDescribeHistory: DescribeHistoryEntry[];
  sourceIntent: string;
} | null;

export type WorkflowComposerDescribeHistoryPreviewState = {
  comparisonChips: readonly WorkflowComposerComparisonChip[];
  currentSummaryLines: Array<{ content: string; tone: "primary" | "secondary" }>;
  estimatedCapabilityLabels: string[];
  estimatedGeneratedSummary: string;
  estimatedPresetLabel: string;
  previewSummary: string;
  selectedIntent: string;
} | null;

export type WorkflowComposerDescribeHistoryPreviewChipItem = {
  changed: boolean;
  className: string;
  label: string;
};

export type WorkflowComposerDescribeHistoryPreviewSummaryLineItem = {
  className: string;
  content: string;
};

export type WorkflowComposerDescribeHistoryPreviewSummaryCardState = {
  badgeLabels: string[];
  lineItems: WorkflowComposerDescribeHistoryPreviewSummaryLineItem[];
  title: string;
};

export type WorkflowComposerDescribeHistoryPreviewPanelState = {
  chipItems: WorkflowComposerDescribeHistoryPreviewChipItem[];
  selectedIntent: string;
  selectedIntentLabel: string;
  summaryCards: WorkflowComposerDescribeHistoryPreviewSummaryCardState[];
  title: string;
  previewSummary: string;
} | null;

export type WorkflowComposerIntentEditorRenderState = {
  hasIntent: boolean;
  hasWorkflow: boolean;
  impactSummary: string | null;
  interactionLocked: boolean;
  regenerationModeValue: "preserve_manual" | "rebuild";
};

export type WorkflowComposerActionState = {
  archived: boolean;
  busy: boolean;
  canRunWorkflow: boolean;
  favored: boolean;
  hasCompiledSnapshot: boolean;
  hasWorkflow: boolean;
  runConfirmPending: boolean;
};

export type WorkflowComposerPrimaryActionKind = "build" | "new" | "save" | "validate";

export type WorkflowComposerCoreActionKind = WorkflowComposerPrimaryActionKind;

export type WorkflowComposerWorkflowActionKind = "archive" | "deploy_preview" | "dry_run" | "favorite";

export type WorkflowComposerRunActionKind = "cancel" | "run" | "run_confirm";

export type WorkflowComposerIntentActionKind = "clear" | "generate" | "regenerate_draft";

export type WorkflowComposerDescribeHistoryActionKind =
  | "compare"
  | "regenerate"
  | "reuse"
  | "save_branch";

export type WorkflowComposerActionDescriptor<TKind extends string = string> = {
  className: string;
  disabled?: boolean;
  kind: TKind;
  label: string;
};

export type WorkflowComposerActionItem<TKind extends string, THandler> =
  WorkflowComposerActionDescriptor<TKind> & {
    onClick: THandler;
  };

export type WorkflowComposerPendingIntentSeed = {
  id: string;
  intent: string;
  source?: "master_agent" | string;
  summary?: string | null;
};

export type WorkflowComposerPendingIntentSeedDecision = {
  feedback: string | null;
  nextIntent: string | null;
  seedId: string | null;
};

export type WorkflowComposerRenderState = {
  deployPreviewActive: boolean;
  historyActionsDisabled: boolean;
  persistDisabled: boolean;
  previewWarning: string | null;
  savedDescription: WorkflowComposerSavedDescriptionState;
  showDescribeHistory: boolean;
  showPreviewWarning: boolean;
  showSavedDescription: boolean;
  workflowActionState: WorkflowComposerActionState;
};

export type WorkflowComposerSectionId = "header" | "workflow_status" | "composer_panel";

export type WorkflowComposerPanelSectionId = "saved_description" | "describe_history" | "intent_editor";

export type WorkflowComposerDescribeHistorySectionId = "entry_cards" | "preview_panel";

export type WorkflowComposerSectionView<TContent> = {
  content: TContent;
  id: WorkflowComposerSectionId;
};

export type WorkflowComposerPanelSectionView<TContent> = {
  content: TContent;
  id: WorkflowComposerPanelSectionId;
};

export type WorkflowComposerDescribeHistorySectionView<TContent> = {
  content: TContent;
  id: WorkflowComposerDescribeHistorySectionId;
};

export type WorkflowComposerOption<TValue extends string = string> = {
  label: string;
  value: TValue;
};

export type WorkflowComposerStatusNoticeItem = {
  className: string;
  content: string;
};

export type WorkflowComposerHistoryMetadataBadge = {
  className: string;
  content: string;
};

export type WorkflowComposerIntentEditorSectionState<TActionItem, TOverrideField> = {
  actionItems: TActionItem[];
  expansionBadges: WorkflowComposerExpansionBadge[];
  hasExpansionBadges: boolean;
  impactSummary: string | null;
  overrideFieldItems: TOverrideField[];
  showImpactSummary: boolean;
  showOverrides: boolean;
  summary: string;
  title: string;
};

export type WorkflowComposerHeaderState<TActionItem> = {
  eyebrow: string;
  primaryActionItems: TActionItem[];
  runActionItems: TActionItem[];
  showWorkflowActions: boolean;
  summary: string;
  title: string;
  workflowLeadingActionItems: TActionItem[];
  workflowTrailingActionItems: TActionItem[];
};

export type WorkflowComposerPanelState = {
  savedDescriptionText: string | null;
  sectionIds: WorkflowComposerPanelSectionId[];
};

export type WorkflowComposerViewState<TActionItem> = {
  header: WorkflowComposerHeaderState<TActionItem>;
  panel: WorkflowComposerPanelState;
  sectionIds: WorkflowComposerSectionId[];
  statusNoticeItems: WorkflowComposerStatusNoticeItem[];
};

export const COMPOSER_PRIMARY_ACTION_CLASS =
  "glass-button rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

export const COMPOSER_SECONDARY_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} border border-white/40 bg-white/45 text-on-surface hover:bg-white/60`;

export const COMPOSER_SAVE_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} rounded-full bg-primary text-white hover:opacity-90`;

export const COMPOSER_BUILD_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} border border-emerald-300/70 bg-emerald-500 text-white hover:opacity-90`;

export const COMPOSER_FAVORITE_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} border border-amber-300/70 bg-amber-50/80 text-amber-800 hover:bg-amber-100`;

export const COMPOSER_ARCHIVE_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} border border-slate-300/70 bg-slate-50/80 text-slate-700 hover:bg-slate-100`;

export const COMPOSER_DEPLOY_PREVIEW_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} border border-sky-300/70 bg-sky-500 text-white hover:opacity-90`;

export const COMPOSER_RUN_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} border border-violet-300/70 bg-violet-500 text-white hover:opacity-90`;

export const COMPOSER_DRY_RUN_ACTION_CLASS =
  `${COMPOSER_PRIMARY_ACTION_CLASS} border border-cyan-300/70 bg-cyan-500 text-white hover:opacity-90`;

export const COMPOSER_CANCEL_ACTION_CLASS =
  "glass-button rounded-full border border-white/40 bg-white/45 px-3 py-2 text-sm font-medium text-on-surface transition hover:bg-white/60";

export const COMPOSER_RUN_CONFIRM_ACTION_CLASS =
  "glass-button animate-fade-in rounded-full border border-violet-400/80 bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700";

export const COMPOSER_INTENT_GENERATE_ACTION_CLASS =
  "glass-button rounded-[20px] border border-sky-300/70 bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export const COMPOSER_INTENT_CLEAR_ACTION_CLASS =
  "glass-button rounded-[20px] border border-white/40 bg-white/65 px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60";

export const COMPOSER_INTENT_REGENERATE_ACTION_CLASS =
  "glass-button rounded-[20px] border border-violet-300/70 bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export const COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS =
  "rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700";

export const COMPOSER_DESCRIBE_HISTORY_TIMESTAMP_BADGE_CLASS =
  "text-[10px] uppercase tracking-[0.14em] text-sky-600";

export const COMPOSER_DESCRIBE_HISTORY_REUSE_ACTION_CLASS =
  "rounded-full border border-sky-200/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-white";

export const COMPOSER_DESCRIBE_HISTORY_COMPARE_ACTION_BASE_CLASS =
  "rounded-full border px-3 py-1 text-[11px] font-medium transition";

export const COMPOSER_DESCRIBE_HISTORY_COMPARE_SELECTED_ACTION_CLASS =
  `${COMPOSER_DESCRIBE_HISTORY_COMPARE_ACTION_BASE_CLASS} border-amber-300/80 bg-amber-100/85 text-amber-800`;

export const COMPOSER_DESCRIBE_HISTORY_COMPARE_IDLE_ACTION_CLASS =
  `${COMPOSER_DESCRIBE_HISTORY_COMPARE_ACTION_BASE_CLASS} border-amber-200/80 bg-white/80 text-amber-700 hover:bg-white`;

export const COMPOSER_DESCRIBE_HISTORY_SAVE_BRANCH_ACTION_CLASS =
  "rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60";

export const COMPOSER_DESCRIBE_HISTORY_REGENERATE_ACTION_CLASS =
  "rounded-full border border-violet-200/80 bg-violet-50/80 px-3 py-1 text-[11px] font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60";

export function workflowComposerBadgeToneClass(tone: WorkflowComposerBadgeTone): string {
  if (tone === "amber") return "bg-amber-100 text-amber-700";
  if (tone === "violet") return "bg-violet-100 text-violet-700";
  if (tone === "emerald") return "bg-emerald-100 text-emerald-700";
  if (tone === "rose") return "bg-rose-100 text-rose-700";
  return "bg-white/85 text-sky-700";
}

export function workflowComposerDescribeHistoryCompareActionClass(selected: boolean): string {
  return selected
    ? COMPOSER_DESCRIBE_HISTORY_COMPARE_SELECTED_ACTION_CLASS
    : COMPOSER_DESCRIBE_HISTORY_COMPARE_IDLE_ACTION_CLASS;
}

export function workflowComposerDescribeHistoryActionDescriptors(args: {
  actionsDisabled: boolean;
  selected: boolean;
}): Array<WorkflowComposerActionDescriptor<WorkflowComposerDescribeHistoryActionKind>> {
  return [
    {
      className: COMPOSER_DESCRIBE_HISTORY_REUSE_ACTION_CLASS,
      kind: "reuse",
      label: workflowDescribeHistoryReuseActionLabel(),
    },
    {
      className: workflowComposerDescribeHistoryCompareActionClass(args.selected),
      kind: "compare",
      label: workflowDescribeHistoryCompareActionLabel(args.selected),
    },
    {
      className: COMPOSER_DESCRIBE_HISTORY_SAVE_BRANCH_ACTION_CLASS,
      disabled: args.actionsDisabled,
      kind: "save_branch",
      label: workflowDescribeHistorySaveBranchActionLabel(),
    },
    {
      className: COMPOSER_DESCRIBE_HISTORY_REGENERATE_ACTION_CLASS,
      disabled: args.actionsDisabled,
      kind: "regenerate",
      label: workflowDescribeHistoryRegenerateActionLabel(),
    },
  ];
}

export function workflowComposerActionItems<TKind extends string, THandler>(
  descriptors: Array<WorkflowComposerActionDescriptor<TKind>>,
  handlerForKind: (kind: TKind) => THandler,
): Array<WorkflowComposerActionItem<TKind, THandler>> {
  return descriptors.map((item) => ({
    ...item,
    onClick: handlerForKind(item.kind),
  }));
}

export function workflowComposerDescribeHistoryMetadataBadges(
  entry: Pick<DescribeHistoryEntry, "event_kind" | "optimization_mode" | "preset_kind" | "timestamp">,
): WorkflowComposerHistoryMetadataBadge[] {
  return [
    {
      className: COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS,
      content: workflowDescribeHistoryEventKindBadgeLabel(entry.event_kind),
    },
    ...(entry.preset_kind
      ? [{
          className: COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS,
          content: workflowDescribeHistoryMetadataBadgeLabel("preset", entry.preset_kind),
        }]
      : []),
    ...(entry.optimization_mode
      ? [{
          className: COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS,
          content: workflowDescribeHistoryMetadataBadgeLabel("mode", entry.optimization_mode),
        }]
      : []),
    ...(entry.timestamp
      ? [{
          className: COMPOSER_DESCRIBE_HISTORY_TIMESTAMP_BADGE_CLASS,
          content: workflowDescribeHistoryTimestampLabel(entry.timestamp),
        }]
      : []),
  ];
}

export function workflowComposerPrimaryActionDescriptors(args: {
  compileBusy: boolean;
  persistDisabled: boolean;
  saveBusy: boolean;
  validateBusy: boolean;
}): Array<WorkflowComposerActionDescriptor<WorkflowComposerPrimaryActionKind>> {
  return [
    {
      className: COMPOSER_SECONDARY_ACTION_CLASS,
      kind: "new",
      label: workflowComposerPrimaryActionLabel("new"),
    },
    {
      className: COMPOSER_SAVE_ACTION_CLASS,
      disabled: args.persistDisabled,
      kind: "save",
      label: workflowComposerPrimaryActionLabel("save", { busy: args.saveBusy }),
    },
    {
      className: COMPOSER_SECONDARY_ACTION_CLASS,
      disabled: args.persistDisabled,
      kind: "validate",
      label: workflowComposerPrimaryActionLabel("validate", { busy: args.validateBusy }),
    },
    {
      className: COMPOSER_BUILD_ACTION_CLASS,
      disabled: args.persistDisabled,
      kind: "build",
      label: workflowComposerPrimaryActionLabel("build", { busy: args.compileBusy }),
    },
  ];
}

export const workflowComposerCoreActionDescriptors = workflowComposerPrimaryActionDescriptors;

export function workflowComposerWorkflowActionDescriptors(args: {
  archiveBusy: boolean;
  deployBusy: boolean;
  deployPreviewActive: boolean;
  dryRunBusy: boolean;
  favoriteBusy: boolean;
  state: WorkflowComposerActionState;
}): Array<WorkflowComposerActionDescriptor<WorkflowComposerWorkflowActionKind>> {
  if (!args.state.hasWorkflow) return [];
  return [
    {
      className: COMPOSER_FAVORITE_ACTION_CLASS,
      disabled: args.state.busy,
      kind: "favorite",
      label: workflowComposerPrimaryActionLabel("favorite", {
        busy: args.favoriteBusy,
        favored: args.state.favored,
      }),
    },
    {
      className: COMPOSER_ARCHIVE_ACTION_CLASS,
      disabled: args.state.busy,
      kind: "archive",
      label: workflowComposerPrimaryActionLabel("archive", {
        busy: args.archiveBusy,
        archived: args.state.archived,
      }),
    },
    {
      className: COMPOSER_DEPLOY_PREVIEW_ACTION_CLASS,
      disabled: args.state.busy || !args.state.hasCompiledSnapshot,
      kind: "deploy_preview",
      label: workflowComposerPrimaryActionLabel("deploy_preview", {
        active: args.deployPreviewActive,
        busy: args.deployBusy,
      }),
    },
    {
      className: COMPOSER_DRY_RUN_ACTION_CLASS,
      disabled: !args.state.canRunWorkflow,
      kind: "dry_run",
      label: workflowComposerPrimaryActionLabel("dry_run", { busy: args.dryRunBusy }),
    },
  ];
}

export function workflowComposerRunActionDescriptors(args: {
  runBusy: boolean;
  state: WorkflowComposerActionState;
}): Array<WorkflowComposerActionDescriptor<WorkflowComposerRunActionKind>> {
  return args.state.runConfirmPending
    ? [
        {
          className: COMPOSER_RUN_CONFIRM_ACTION_CLASS,
          kind: "run_confirm",
          label: workflowComposerPrimaryActionLabel("run_confirm"),
        },
        {
          className: COMPOSER_CANCEL_ACTION_CLASS,
          kind: "cancel",
          label: workflowComposerPrimaryActionLabel("cancel"),
        },
      ]
    : [{
        className: COMPOSER_RUN_ACTION_CLASS,
        disabled: !args.state.canRunWorkflow,
        kind: "run",
        label: workflowComposerPrimaryActionLabel("run", { busy: args.runBusy }),
      }];
}

export function workflowComposerIntentActionDescriptors(
  state: WorkflowComposerIntentEditorRenderState,
): Array<WorkflowComposerActionDescriptor<WorkflowComposerIntentActionKind>> {
  return [
    {
      className: COMPOSER_INTENT_GENERATE_ACTION_CLASS,
      disabled: state.interactionLocked || !state.hasIntent,
      kind: "generate",
      label: workflowComposerIntentActionLabel("generate"),
    },
    {
      className: COMPOSER_INTENT_CLEAR_ACTION_CLASS,
      disabled: !state.hasIntent,
      kind: "clear",
      label: workflowComposerIntentActionLabel("clear"),
    },
    {
      className: COMPOSER_INTENT_REGENERATE_ACTION_CLASS,
      disabled: state.interactionLocked || !state.hasWorkflow,
      kind: "regenerate_draft",
      label: workflowComposerIntentActionLabel("regenerate_draft"),
    },
  ];
}

export function workflowComposerPrimaryActionItems(args: {
  compileBusy: boolean;
  createNewWorkflow: () => void;
  handleCompile: () => void;
  handleSave: () => void;
  handleValidate: () => void;
  persistDisabled: boolean;
  saveBusy: boolean;
  validateBusy: boolean;
}): Array<WorkflowComposerActionItem<WorkflowComposerPrimaryActionKind, () => void>> {
  return workflowComposerActionItems(
    workflowComposerPrimaryActionDescriptors({
      compileBusy: args.compileBusy,
      persistDisabled: args.persistDisabled,
      saveBusy: args.saveBusy,
      validateBusy: args.validateBusy,
    }),
    (kind) => {
      if (kind === "new") return args.createNewWorkflow;
      if (kind === "save") return args.handleSave;
      if (kind === "validate") return args.handleValidate;
      return args.handleCompile;
    },
  );
}

export const workflowComposerCoreActionItems = workflowComposerPrimaryActionItems;

export function workflowComposerWorkflowActionItems(args: {
  archiveBusy: boolean;
  deployBusy: boolean;
  deployPreviewActive: boolean;
  dryRunBusy: boolean;
  favoriteBusy: boolean;
  handleArchive: (archived: boolean) => void;
  handleDryRun: () => void;
  handleFavorite: (favored: boolean) => void;
  setDeployPreviewOpen: (updater: (current: boolean) => boolean) => void;
  state: WorkflowComposerActionState;
}): Array<WorkflowComposerActionItem<WorkflowComposerWorkflowActionKind, () => void>> {
  return workflowComposerActionItems(
    workflowComposerWorkflowActionDescriptors({
      archiveBusy: args.archiveBusy,
      deployBusy: args.deployBusy,
      deployPreviewActive: args.deployPreviewActive,
      dryRunBusy: args.dryRunBusy,
      favoriteBusy: args.favoriteBusy,
      state: args.state,
    }),
    (kind) => {
      if (kind === "favorite") return () => args.handleFavorite(!args.state.favored);
      if (kind === "archive") return () => args.handleArchive(!args.state.archived);
      if (kind === "deploy_preview") return () => args.setDeployPreviewOpen((current) => !current);
      return args.handleDryRun;
    },
  );
}

export function workflowComposerRunActionItems(args: {
  clearRunConfirm: () => void;
  handleRunStart: () => void;
  requestRunConfirm: () => void;
  runBusy: boolean;
  state: WorkflowComposerActionState;
}): Array<WorkflowComposerActionItem<WorkflowComposerRunActionKind, () => void>> {
  return workflowComposerActionItems(
    workflowComposerRunActionDescriptors({
      runBusy: args.runBusy,
      state: args.state,
    }),
    (kind) => {
      if (kind === "run_confirm") {
        return () => {
          args.clearRunConfirm();
          args.handleRunStart();
        };
      }
      if (kind === "cancel") return args.clearRunConfirm;
      return () => {
        args.clearRunConfirm();
        args.requestRunConfirm();
      };
    },
  );
}

export function workflowComposerIntentActionItems(args: {
  createWorkflowFromIntent: () => void;
  regenerateCurrentWorkflowFromIntent: () => void;
  renderState: WorkflowComposerIntentEditorRenderState;
  setWorkflowIntent: (value: string) => void;
}): Array<WorkflowComposerActionItem<WorkflowComposerIntentActionKind, () => void>> {
  return workflowComposerActionItems(
    workflowComposerIntentActionDescriptors(args.renderState),
    (kind) => {
      if (kind === "generate") return args.createWorkflowFromIntent;
      if (kind === "clear") return () => args.setWorkflowIntent("");
      return args.regenerateCurrentWorkflowFromIntent;
    },
  );
}

export function workflowComposerPendingIntentSeedDecision(args: {
  currentIntent: string;
  pendingSeed: WorkflowComposerPendingIntentSeed | null | undefined;
  previouslyAppliedSeedId: string | null;
}): WorkflowComposerPendingIntentSeedDecision {
  const seed = args.pendingSeed;
  if (!seed || seed.id === args.previouslyAppliedSeedId) {
    return { feedback: null, nextIntent: null, seedId: null };
  }
  const intent = seed.intent.trim();
  if (!intent) {
    return { feedback: null, nextIntent: null, seedId: seed.id };
  }
  const currentIntent = args.currentIntent.trim();
  if (!currentIntent) {
    return {
      feedback: "Master-agent ask copied into the workflow builder. Review it, then generate the workflow.",
      nextIntent: intent,
      seedId: seed.id,
    };
  }
  if (currentIntent === intent) {
    return {
      feedback: "Master-agent ask is already loaded in the workflow builder.",
      nextIntent: null,
      seedId: seed.id,
    };
  }
  return {
    feedback: "Master-agent ask is ready, but the current workflow description was preserved. Clear it before reopening the workflow preview to use the latest ask.",
    nextIntent: null,
    seedId: null,
  };
}

export function workflowComposerSavedDescriptionState(
  workflow: SavedWorkflow | null,
): WorkflowComposerSavedDescriptionState {
  const normalizedWorkflow = workflow ? normalizeGraph(workflow) : null;
  if (!normalizedWorkflow) return null;
  const sourceIntent =
    typeof normalizedWorkflow.metadata.source_intent === "string"
      ? normalizedWorkflow.metadata.source_intent
      : null;
  if (!sourceIntent) return null;
  return {
    sourceIntent,
    recentDescribeHistory: describeHistoryEntries(normalizedWorkflow).slice(0, 4),
  };
}

export function workflowComposerDescribeHistoryPreviewState(args: {
  comparison: ReturnType<typeof describeHistoryComparison> | null;
  entry: DescribeHistoryEntry | null;
  regenerationMode: "preserve_manual" | "rebuild";
}): WorkflowComposerDescribeHistoryPreviewState {
  const { comparison, entry } = args;
  if (!entry || !comparison) return null;
  return {
    selectedIntent: entry.intent,
    estimatedCapabilityLabels: [
      comparison.estimatedNeedsApproval
        ? workflowDescribeHistoryCapabilityBadgeLabel("approval")
        : null,
      comparison.estimatedNeedsBranching
        ? workflowDescribeHistoryCapabilityBadgeLabel("branching")
        : null,
      comparison.estimatedNeedsResearchSupport
        ? workflowDescribeHistoryCapabilityBadgeLabel("research_support")
        : null,
    ].filter((label): label is string => label !== null),
    currentSummaryLines: [
      {
        tone: "primary",
        content: workflowDescribeHistoryGeneratedCountSummary(
          comparison.currentGeneratedNodeCount,
          comparison.currentGeneratedEdgeCount,
        ),
      },
      {
        tone: "secondary",
        content: workflowDescribeHistoryProtectedRegionSummary(
          comparison.protectedNodeCount,
          comparison.protectedEdgeCount,
        ),
      },
      {
        tone: "secondary",
        content: workflowDescribeHistoryPreservedRegionSummary(
          args.regenerationMode,
          comparison.preservedManualNodeCount,
          comparison.preservedManualEdgeCount,
          comparison.preservedProtectedNodeCount,
          comparison.preservedProtectedEdgeCount,
        ),
      },
    ],
    estimatedGeneratedSummary: workflowDescribeHistoryGeneratedCountSummary(
      comparison.estimatedGeneratedNodeCount,
      comparison.estimatedGeneratedEdgeCount,
    ),
    previewSummary: workflowDescribeHistoryPreviewSummary(
      entry.event_kind,
      comparison.currentNodeCount,
      comparison.currentEdgeCount,
    ),
    estimatedPresetLabel: workflowDescribeHistoryEstimatedPresetLabel(
      comparison.estimatedPresetKind,
    ),
    comparisonChips: [
      { dimension: "intent", changed: comparison.intentChanged },
      { dimension: "preset", changed: comparison.presetChanged },
      { dimension: "mode", changed: comparison.optimizationChanged },
      { dimension: "regen_mode", changed: comparison.regenerationChanged },
    ],
  };
}

export function workflowComposerExpansionBadges(
  expansion: WorkflowIntentExpansion | null,
): WorkflowComposerExpansionBadge[] {
  if (!expansion) return [];
  return [
    {
      label: workflowComposerIntentExpansionBadgeLabel(
        "preset",
        expansion.preset_kind,
      ),
      tone: null,
    },
    {
      label: workflowComposerIntentExpansionBadgeLabel(
        "mode",
        expansion.optimization_mode,
      ),
      tone: null,
    },
    expansion.requires_approval
      ? {
          label: workflowComposerIntentExpansionCapabilityLabel("approval"),
          tone: "amber" as const,
        }
      : null,
    expansion.needs_branching
      ? {
          label: workflowComposerIntentExpansionCapabilityLabel("branching"),
          tone: "violet" as const,
        }
      : null,
    expansion.needs_research_support
      ? {
          label: workflowComposerIntentExpansionCapabilityLabel("research_support"),
          tone: "emerald" as const,
        }
      : null,
    expansion.public_output
      ? {
          label: workflowComposerIntentExpansionCapabilityLabel("public_output"),
          tone: "rose" as const,
        }
      : null,
  ].filter((badge): badge is WorkflowComposerExpansionBadge => badge !== null);
}

export function workflowComposerIntentEditorRenderState(args: {
  currentWorkflow: SavedWorkflow | null;
  regenerationImpact: ReturnType<typeof workflowRegenerationImpactSummary> | null;
  regenerationMode: "preserve_manual" | "rebuild";
  workflowIntent: string;
  workflowInteractionLocked: boolean;
}): WorkflowComposerIntentEditorRenderState {
  const hasIntent = args.workflowIntent.trim().length > 0;
  const impactSummary = args.regenerationImpact
    ? workflowComposerRegenerationImpactSummary(args.regenerationMode, args.regenerationImpact)
    : null;
  return {
    hasIntent,
    regenerationModeValue: args.regenerationMode,
    impactSummary,
    interactionLocked: args.workflowInteractionLocked,
    hasWorkflow: args.currentWorkflow !== null,
  };
}

export function workflowComposerDescribeHistoryPreviewPanelState(
  previewState: WorkflowComposerDescribeHistoryPreviewState,
): WorkflowComposerDescribeHistoryPreviewPanelState {
  if (!previewState) return null;
  return {
    chipItems: previewState.comparisonChips.map((chip) => ({
      changed: chip.changed,
      className: `rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        chip.changed ? "bg-amber-200 text-amber-900" : "bg-white/85 text-amber-800"
      }`,
      label: workflowDescribeHistoryComparisonLabel(
        chip.dimension,
        chip.changed,
      ),
    })),
    previewSummary: previewState.previewSummary,
    selectedIntent: previewState.selectedIntent,
    selectedIntentLabel: workflowDescribeHistorySelectedEventLabel(),
    summaryCards: [
      {
        badgeLabels: [],
        lineItems: previewState.currentSummaryLines.map((line) => ({
          className: `mt-1 text-xs ${
            line.tone === "primary" ? "text-amber-900" : "text-amber-800"
          }`,
          content: line.content,
        })),
        title: workflowDescribeHistoryCurrentGeneratedCoreTitle(),
      },
      {
        badgeLabels: [
          previewState.estimatedPresetLabel,
          ...previewState.estimatedCapabilityLabels,
        ],
        lineItems: [
          {
            className: "mt-1 text-xs text-amber-900",
            content: previewState.estimatedGeneratedSummary,
          },
        ],
        title: workflowDescribeHistorySelectedEventEstimateTitle(),
      },
    ],
    title: workflowDescribeHistoryPreviewTitle(),
  };
}

export function workflowComposerActionState(args: {
  busyAction: string | null;
  deploymentCount: number;
  runConfirmPending: boolean;
  workflow: SavedWorkflow | null;
}): WorkflowComposerActionState {
  const busy = args.busyAction !== null;
  const hasWorkflow = args.workflow !== null;
  const hasCompiledSnapshot = args.workflow?.latest_ir != null;
  const canRunWorkflow = !busy && hasCompiledSnapshot && args.deploymentCount > 0;
  return {
    archived: Boolean(args.workflow?.archived_at),
    busy,
    canRunWorkflow,
    favored: Boolean(args.workflow?.favorite),
    hasCompiledSnapshot,
    hasWorkflow,
    runConfirmPending: args.runConfirmPending,
  };
}

export function workflowComposerRenderState(args: {
  busyAction: string | null;
  deployPreviewOpen: boolean;
  previewSubject?: string;
  savedDescription: WorkflowComposerSavedDescriptionState;
  workflow: SavedWorkflow | null;
  workflowActionState: WorkflowComposerActionState;
  workflowInteractionLocked: boolean;
}): WorkflowComposerRenderState {
  const readiness = args.workflow ? workflowTriggerReadinessSummaryForWorkflow(args.workflow) : null;
  const previewWarning =
    readiness?.live_registration_supported === false
      ? workflowTriggerPreviewEntryPointWarning(readiness, {
          subject: args.previewSubject ?? workflowComposerCompiledSnapshotSubject(),
        })
      : null;
  return {
    deployPreviewActive: args.deployPreviewOpen,
    historyActionsDisabled: args.workflowInteractionLocked,
    persistDisabled: args.workflow === null || args.busyAction !== null,
    previewWarning,
    savedDescription: args.savedDescription,
    showDescribeHistory: Boolean(
      args.savedDescription && args.savedDescription.recentDescribeHistory.length > 0,
    ),
    showPreviewWarning: Boolean(previewWarning),
    showSavedDescription: args.savedDescription !== null,
    workflowActionState: args.workflowActionState,
  };
}

export function workflowComposerPresetOptions(
  presets: readonly string[],
): WorkflowComposerOption[] {
  return presets.map((preset) => ({
    value: preset,
    label: workflowComposerPresetOptionLabel(preset),
  }));
}

export function workflowComposerOptimizationOverrideOptions(): Array<
  WorkflowComposerOption<"balanced" | "speed" | "cost">
> {
  return [
    {
      value: "balanced",
      label: workflowComposerOverrideOptionLabel("optimization_balanced"),
    },
    {
      value: "speed",
      label: workflowComposerOverrideOptionLabel("optimization_speed"),
    },
    {
      value: "cost",
      label: workflowComposerOverrideOptionLabel("optimization_cost"),
    },
  ];
}

export function workflowComposerRegenerationModeOptions(): Array<
  WorkflowComposerOption<"preserve_manual" | "rebuild">
> {
  return [
    {
      value: "preserve_manual",
      label: workflowComposerOverrideOptionLabel("regeneration_preserve_manual"),
    },
    {
      value: "rebuild",
      label: workflowComposerOverrideOptionLabel("regeneration_rebuild"),
    },
  ];
}

export function workflowComposerSectionIds(
  workflowActionState: Pick<WorkflowComposerActionState, "hasWorkflow">,
): WorkflowComposerSectionId[] {
  const sections: WorkflowComposerSectionId[] = ["header", "composer_panel"];
  if (workflowActionState.hasWorkflow) {
    sections.splice(1, 0, "workflow_status");
  }
  return sections;
}

export function workflowComposerPanelSectionIds(
  renderState: Pick<
    WorkflowComposerRenderState,
    "showDescribeHistory" | "showSavedDescription"
  >,
): WorkflowComposerPanelSectionId[] {
  const sectionIds: WorkflowComposerPanelSectionId[] = ["intent_editor"];
  if (renderState.showDescribeHistory) {
    sectionIds.unshift("describe_history");
  }
  if (renderState.showSavedDescription) {
    sectionIds.unshift("saved_description");
  }
  return sectionIds;
}

export function workflowComposerDescribeHistorySectionIds(args: {
  showPreviewPanel: boolean;
}): WorkflowComposerDescribeHistorySectionId[] {
  return args.showPreviewPanel ? ["entry_cards", "preview_panel"] : ["entry_cards"];
}

export function workflowComposerSectionViews<TContent>(args: {
  contentById: Record<WorkflowComposerSectionId, TContent>;
  workflowActionState: Pick<WorkflowComposerActionState, "hasWorkflow">;
}): WorkflowComposerSectionView<TContent>[] {
  return workflowComposerSectionIds(args.workflowActionState).map((sectionId) => ({
    content: args.contentById[sectionId],
    id: sectionId,
  }));
}

export function workflowComposerPanelSectionViews<TContent>(args: {
  contentById: Record<WorkflowComposerPanelSectionId, TContent>;
  renderState: Pick<
    WorkflowComposerRenderState,
    "showDescribeHistory" | "showSavedDescription"
  >;
}): WorkflowComposerPanelSectionView<TContent>[] {
  return workflowComposerPanelSectionIds(args.renderState).map((sectionId) => ({
    content: args.contentById[sectionId],
    id: sectionId,
  }));
}

export function workflowComposerDescribeHistorySectionViews<TContent>(args: {
  contentById: Record<WorkflowComposerDescribeHistorySectionId, TContent>;
  showPreviewPanel: boolean;
}): WorkflowComposerDescribeHistorySectionView<TContent>[] {
  return workflowComposerDescribeHistorySectionIds({
    showPreviewPanel: args.showPreviewPanel,
  }).map((sectionId) => ({
    content: args.contentById[sectionId],
    id: sectionId,
  }));
}

export function workflowComposerIntentEditorSectionState<TActionItem, TOverrideField>(args: {
  actionItems: TActionItem[];
  expansionBadges: WorkflowComposerExpansionBadge[];
  overrideFieldItems: TOverrideField[];
  renderState: WorkflowComposerIntentEditorRenderState;
}): WorkflowComposerIntentEditorSectionState<TActionItem, TOverrideField> {
  return {
    actionItems: args.actionItems,
    expansionBadges: args.expansionBadges,
    hasExpansionBadges: args.expansionBadges.length > 0,
    impactSummary: args.renderState.impactSummary,
    overrideFieldItems: args.overrideFieldItems,
    showImpactSummary: args.renderState.impactSummary !== null,
    showOverrides: args.renderState.hasIntent,
    summary: workflowComposerDescribeWorkflowSummary(),
    title: workflowComposerDescribeWorkflowTitle(),
  };
}

export function workflowComposerStatusNoticeItems(args: {
  deploymentCount: number;
  previewWarning: string | null;
}): WorkflowComposerStatusNoticeItem[] {
  return [
    args.deploymentCount === 0
      ? {
          className: "text-[11px] text-on-surface-variant/60",
          content: workflowBuildDeployPrerequisiteNote(),
        }
      : null,
    args.previewWarning
      ? {
          className: "text-[11px] text-amber-700",
          content: args.previewWarning,
        }
      : null,
  ].filter((item): item is WorkflowComposerStatusNoticeItem => item !== null);
}

export function workflowComposerHeaderState<TActionItem>(args: {
  primaryActionItems: TActionItem[];
  runActionItems: TActionItem[];
  workflowActionItems: TActionItem[];
  workflowActionState: Pick<WorkflowComposerActionState, "hasWorkflow">;
}): WorkflowComposerHeaderState<TActionItem> {
  return {
    eyebrow: workflowComposerHeaderEyebrow(),
    primaryActionItems: args.primaryActionItems,
    runActionItems: args.runActionItems,
    showWorkflowActions: args.workflowActionState.hasWorkflow,
    summary: workflowComposerHeaderSummary(),
    title: workflowComposerHeaderTitle(),
    workflowLeadingActionItems: args.workflowActionItems.slice(0, 3),
    workflowTrailingActionItems: args.workflowActionItems.slice(3),
  };
}

export function workflowComposerViewState<TActionItem>(args: {
  deploymentCount: number;
  primaryActionItems: TActionItem[];
  renderState: WorkflowComposerRenderState;
  runActionItems: TActionItem[];
  workflowActionItems: TActionItem[];
}): WorkflowComposerViewState<TActionItem> {
  return {
    header: workflowComposerHeaderState({
      primaryActionItems: args.primaryActionItems,
      runActionItems: args.runActionItems,
      workflowActionItems: args.workflowActionItems,
      workflowActionState: args.renderState.workflowActionState,
    }),
    panel: {
      savedDescriptionText: args.renderState.savedDescription?.sourceIntent ?? null,
      sectionIds: workflowComposerPanelSectionIds(args.renderState),
    },
    sectionIds: workflowComposerSectionIds(args.renderState.workflowActionState),
    statusNoticeItems: workflowComposerStatusNoticeItems({
      deploymentCount: args.deploymentCount,
      previewWarning: args.renderState.previewWarning,
    }),
  };
}
