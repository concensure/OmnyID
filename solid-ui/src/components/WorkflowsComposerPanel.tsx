// @locs-version: 1.0
import { For, Show, createMemo, createSignal, onCleanup, type JSX, type JSXElement } from "solid-js";
import { PRESETS } from "@/lib/workflowGraphTypes";
import {
  describeHistoryComparison as describeHistoryComparisonState,
} from "@/lib/workflowDescribeIntentAnalysis";
import type { DescribeHistoryEntry } from "@/lib/workflowDescribeHistory";
import {
  workflowComposerIntentPlaceholder,
  workflowComposerOverrideLabel,
  workflowComposerOverrideOptionLabel,
  workflowComposerRegenerationImpactTitle,
  workflowComposerDescribeHistoryTitle,
  workflowComposerCompiledSnapshotSubject,
  workflowComposerSavedDescriptionTitle,
  workflowDescribeHistoryReuseFeedback,
} from "@/lib/workflowDeploymentHelpers";
import { workflowRegenerationImpactSummary } from "@/lib/workflowRegenerationState";
import {
  workflowComposerActionState,
  workflowComposerActionItems,
  workflowComposerBadgeToneClass,
  workflowComposerDescribeHistoryActionDescriptors,
  workflowComposerDescribeHistoryMetadataBadges,
  workflowComposerDescribeHistoryPreviewPanelState,
  workflowComposerDescribeHistoryPreviewState,
  workflowComposerDescribeHistorySectionViews,
  workflowComposerCoreActionItems,
  workflowComposerExpansionBadges,
  workflowComposerOptimizationOverrideOptions,
  workflowComposerPanelSectionViews,
  workflowComposerPresetOptions,
  workflowComposerRegenerationModeOptions,
  workflowComposerIntentEditorRenderState,
  workflowComposerIntentEditorSectionState,
  workflowComposerIntentActionItems,
  workflowComposerRenderState,
  workflowComposerRunActionItems,
  workflowComposerSavedDescriptionState,
  workflowComposerSectionViews,
  workflowComposerViewState,
  workflowComposerWorkflowActionItems,
  type WorkflowComposerActionState,
  type WorkflowComposerDescribeHistoryActionKind,
  type WorkflowComposerDescribeHistoryPreviewPanelState,
  type WorkflowComposerDescribeHistoryPreviewState,
  type WorkflowComposerExpansionBadge,
  type WorkflowComposerHistoryMetadataBadge,
  type WorkflowComposerIntentEditorSectionState,
  type WorkflowComposerIntentEditorRenderState,
  type WorkflowComposerRenderState,
  type WorkflowComposerSavedDescriptionState,
  type WorkflowComposerViewState,
} from "@/lib/workflowComposerState";
import type { PresetNodeKind } from "afp-ts/workflows";
import type { SavedWorkflow, WorkflowDeployment, WorkflowIntentExpansion } from "@/lib/api";
import { useWorkflowsCtx } from "@/components/graph";
import { TiptapEditor } from "@/components/editor/TiptapEditor";

type ComposerActionItem = {
  className: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

type ComposerHistoryMetadataBadge = WorkflowComposerHistoryMetadataBadge;

type ComposerHistoryEntryCardState = {
  actionItems: ComposerActionItem[];
  entry: DescribeHistoryEntry;
  metadataBadges: ComposerHistoryMetadataBadge[];
};

type ComposerExpansionBadge = WorkflowComposerExpansionBadge;

type SavedDescriptionPanelState = WorkflowComposerSavedDescriptionState;

type DescribeHistoryPreviewState = WorkflowComposerDescribeHistoryPreviewState;

type DescribeHistoryPreviewPanelState = WorkflowComposerDescribeHistoryPreviewPanelState;

type IntentEditorRenderState = WorkflowComposerIntentEditorRenderState;

type ComposerIntentOverrideFieldItem = {
  children: JSXElement;
  label: string;
  onChange: (value: string) => void;
  value: string;
};

type WorkflowActionState = WorkflowComposerActionState;

type ComposerRenderState = WorkflowComposerRenderState;

type ComposerViewState = WorkflowComposerViewState<ComposerActionItem>;
type IntentEditorSectionState = WorkflowComposerIntentEditorSectionState<
  ComposerActionItem,
  ComposerIntentOverrideFieldItem
>;

type ComposerSetter<T> = (value: T | ((current: T) => T)) => void;

type WorkflowsComposerContext = {
  applyDescribeHistoryEntry: (entry: DescribeHistoryEntry) => void;
  busyAction: () => string | null;
  createNewWorkflow: () => void;
  createWorkflowFromIntent: () => void;
  currentWorkflow: () => SavedWorkflow | null;
  deploymentHistory: () => WorkflowDeployment[];
  deployPreviewOpen: () => boolean;
  describeHistoryComparison: () => ReturnType<typeof describeHistoryComparisonState> | null;
  handleCompile: () => Promise<void>;
  handleDryRun: () => Promise<void>;
  handleRunAction: (kind: "start" | "replay") => Promise<void>;
  handleSave: () => Promise<void>;
  handleValidate: () => Promise<void>;
  handleWorkflowAction: (action: string, patch: Record<string, unknown>) => Promise<void>;
  intentExpansion: () => WorkflowIntentExpansion | null;
  intentOptimizationOverride: () => "balanced" | "speed" | "cost" | "";
  intentPresetOverride: () => PresetNodeKind | "";
  regenerationImpact: () => ReturnType<typeof workflowRegenerationImpactSummary> | null;
  regenerationMode: () => "preserve_manual" | "rebuild";
  regenerateCurrentWorkflowFromIntent: () => Promise<void>;
  saveWorkflowBranchFromDescribeHistory: (entry: DescribeHistoryEntry) => Promise<void>;
  selectedDescribeHistoryEntry: () => DescribeHistoryEntry | null;
  selectedDescribeHistoryEventId: () => string | null;
  setDeployPreviewOpen: ComposerSetter<boolean>;
  setFeedback: (message: string) => void;
  setIntentOptimizationOverride: (value: "balanced" | "speed" | "cost" | "") => void;
  setIntentPresetOverride: (value: PresetNodeKind | "") => void;
  setRegenerationMode: (value: "preserve_manual" | "rebuild") => void;
  setSelectedDescribeHistoryEventId: ComposerSetter<string | null>;
  setWorkflowIntent: (value: string) => void;
  workflowIntent: () => string;
  workflowInteractionLocked: () => boolean;
};

export function WorkflowsComposerPanel() {
  const ctx = useWorkflowsCtx<WorkflowsComposerContext>();
  const {
    busyAction,
    currentWorkflow,
    deploymentHistory,
    deployPreviewOpen,
    intentExpansion,
    intentOptimizationOverride,
    intentPresetOverride,
    regenerationImpact,
    regenerationMode,
    selectedDescribeHistoryEventId,
    selectedDescribeHistoryEntry,
    describeHistoryComparison,
    workflowIntent,
    workflowInteractionLocked,
    applyDescribeHistoryEntry,
    createNewWorkflow,
    createWorkflowFromIntent,
    handleCompile,
    handleDryRun,
    handleRunAction,
    handleSave,
    handleValidate,
    handleWorkflowAction,
    regenerateCurrentWorkflowFromIntent,
    saveWorkflowBranchFromDescribeHistory,
    setDeployPreviewOpen,
    setFeedback,
    setIntentOptimizationOverride,
    setIntentPresetOverride,
    setRegenerationMode,
    setSelectedDescribeHistoryEventId,
    setWorkflowIntent,
  } = ctx;

  const [runConfirmPending, setRunConfirmPending] = createSignal(false);
  let runConfirmTimer: ReturnType<typeof setTimeout> | undefined;

  function clearRunConfirm() {
    if (runConfirmTimer !== undefined) {
      clearTimeout(runConfirmTimer);
      runConfirmTimer = undefined;
    }
    setRunConfirmPending(false);
  }

  function applyDescribeHistorySelection(entry: DescribeHistoryEntry) {
    applyDescribeHistoryEntry(entry);
    setSelectedDescribeHistoryEventId(entry.event_id);
  }

  function isBusyAction(
    action:
      | "archive"
      | "compile"
      | "deploy"
      | "dry_run"
      | "favorite"
      | "run"
      | "save"
      | "validate",
  ) {
    return busyAction() === action;
  }

  onCleanup(() => {
    clearRunConfirm();
  });

  const optimizationOverrideOptions = workflowComposerOptimizationOverrideOptions();

  const regenerationModeOptions = workflowComposerRegenerationModeOptions();

  const presetOptions = workflowComposerPresetOptions(PRESETS);

  const renderIntentOverrideField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    children: JSX.Element,
  ) => (
    <label class="block">
      <span class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        class="mt-2 w-full rounded-2xl border border-white/50 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none"
      >
        {children}
      </select>
    </label>
  );

  const savedDescriptionPanelState = createMemo<SavedDescriptionPanelState>(() => {
    return workflowComposerSavedDescriptionState(currentWorkflow());
  });

  const describeHistoryPreviewState = createMemo<DescribeHistoryPreviewState>(() => {
    return workflowComposerDescribeHistoryPreviewState({
      comparison: describeHistoryComparison(),
      entry: selectedDescribeHistoryEntry(),
      regenerationMode: regenerationMode(),
    });
  });

  const intentExpansionBadges = createMemo<ComposerExpansionBadge[]>(() => {
    return workflowComposerExpansionBadges(intentExpansion());
  });

  const intentEditorRenderState = createMemo<IntentEditorRenderState>(() => {
    return workflowComposerIntentEditorRenderState({
      currentWorkflow: currentWorkflow(),
      regenerationImpact: regenerationImpact(),
      regenerationMode: regenerationMode(),
      workflowIntent: workflowIntent(),
      workflowInteractionLocked: workflowInteractionLocked(),
    });
  });

  const describeHistoryPreviewPanelState = createMemo<DescribeHistoryPreviewPanelState>(() => {
    return workflowComposerDescribeHistoryPreviewPanelState(describeHistoryPreviewState());
  });

  const describeHistoryEntryCards = createMemo<ComposerHistoryEntryCardState[]>(() => {
    const historyActionsDisabled = composerRenderState().historyActionsDisabled;
    const selectedEventId = selectedDescribeHistoryEventId();
    const actionHandler = (
      kind: WorkflowComposerDescribeHistoryActionKind,
      entry: DescribeHistoryEntry,
    ): (() => void) => {
      if (kind === "reuse") {
        return () => {
          applyDescribeHistorySelection(entry);
          setFeedback(workflowDescribeHistoryReuseFeedback());
        };
      }
      if (kind === "compare") {
        return () =>
          setSelectedDescribeHistoryEventId((current: string | null) =>
            current === entry.event_id ? null : entry.event_id
          );
      }
      if (kind === "save_branch") {
        return () => void saveWorkflowBranchFromDescribeHistory(entry);
      }
      return () => {
        applyDescribeHistorySelection(entry);
        void regenerateCurrentWorkflowFromIntent();
      };
    };
    return (composerRenderState().savedDescription?.recentDescribeHistory ?? []).map((entry) => {
      const selected = selectedEventId === entry.event_id;
      return {
        actionItems: workflowComposerActionItems(
          workflowComposerDescribeHistoryActionDescriptors({
            actionsDisabled: historyActionsDisabled,
            selected,
          }),
          (kind) => actionHandler(kind, entry),
        ),
        entry,
        metadataBadges: workflowComposerDescribeHistoryMetadataBadges(entry),
      };
    });
  });

  const intentEditorActionItems = createMemo<ComposerActionItem[]>(() =>
    workflowComposerIntentActionItems({
      createWorkflowFromIntent,
      regenerateCurrentWorkflowFromIntent: () => void regenerateCurrentWorkflowFromIntent(),
      renderState: intentEditorRenderState(),
      setWorkflowIntent,
    }),
  );

  const intentOverrideFieldItems = createMemo<ComposerIntentOverrideFieldItem[]>(() => [
    {
      children: (
        <>
          <option value="">
            {workflowComposerOverrideOptionLabel("preset_inferred")}
          </option>
          <For each={presetOptions}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </>
      ),
      label: workflowComposerOverrideLabel("preset"),
      onChange: (value) => setIntentPresetOverride(value as PresetNodeKind | ""),
      value: intentPresetOverride(),
    },
    {
      children: (
        <>
          <option value="">
            {workflowComposerOverrideOptionLabel("optimization_inferred")}
          </option>
          <For each={optimizationOverrideOptions}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </>
      ),
      label: workflowComposerOverrideLabel("optimization"),
      onChange: (value) =>
        setIntentOptimizationOverride(value as "balanced" | "speed" | "cost" | ""),
      value: intentOptimizationOverride(),
    },
    {
      children: (
        <For each={regenerationModeOptions}>
          {(option) => <option value={option.value}>{option.label}</option>}
        </For>
      ),
      label: workflowComposerOverrideLabel("regeneration_mode"),
      onChange: (value) =>
        setRegenerationMode(value as "rebuild" | "preserve_manual"),
      value: intentEditorRenderState().regenerationModeValue,
    },
  ]);

  const intentEditorSectionState = createMemo<IntentEditorSectionState>(() => {
    const editorState = intentEditorRenderState();
    const expansionBadges = intentExpansionBadges();
    const overrideFieldItems = intentOverrideFieldItems();
    return workflowComposerIntentEditorSectionState({
      actionItems: intentEditorActionItems(),
      expansionBadges,
      overrideFieldItems,
      renderState: editorState,
    });
  });

  const workflowActionState = createMemo<WorkflowActionState>(() => {
    return workflowComposerActionState({
      busyAction: busyAction(),
      deploymentCount: deploymentHistory().length,
      runConfirmPending: runConfirmPending(),
      workflow: currentWorkflow(),
    });
  });

  const composerRenderState = createMemo<ComposerRenderState>(() => {
    return workflowComposerRenderState({
      busyAction: busyAction(),
      deployPreviewOpen: deployPreviewOpen(),
      previewSubject: workflowComposerCompiledSnapshotSubject(),
      savedDescription: savedDescriptionPanelState(),
      workflow: currentWorkflow(),
      workflowActionState: workflowActionState(),
      workflowInteractionLocked: workflowInteractionLocked(),
    });
  });

  const primaryActionItems = createMemo<ComposerActionItem[]>(() =>
    workflowComposerCoreActionItems({
      compileBusy: isBusyAction("compile"),
      createNewWorkflow,
      handleCompile: () => void handleCompile(),
      handleSave: () => void handleSave(),
      handleValidate: () => void handleValidate(),
      persistDisabled: composerRenderState().persistDisabled,
      saveBusy: isBusyAction("save"),
      validateBusy: isBusyAction("validate"),
    }),
  );

  const workflowActionItems = createMemo<ComposerActionItem[]>(() => {
    const state = composerRenderState().workflowActionState;
    return workflowComposerWorkflowActionItems({
      archiveBusy: isBusyAction("archive"),
      deployBusy: isBusyAction("deploy"),
      deployPreviewActive: composerRenderState().deployPreviewActive,
      dryRunBusy: isBusyAction("dry_run"),
      favoriteBusy: isBusyAction("favorite"),
      handleArchive: (archived) => void handleWorkflowAction("archive", { archived }),
      handleDryRun: () => void handleDryRun(),
      handleFavorite: (favorite) => void handleWorkflowAction("favorite", { favorite }),
      setDeployPreviewOpen,
      state,
    });
  });

  const composerViewState = createMemo<ComposerViewState>(() => {
    const renderState = composerRenderState();
    const workflowState = renderState.workflowActionState;
    const requestRunConfirm = () => {
      setRunConfirmPending(true);
      runConfirmTimer = setTimeout(() => {
        runConfirmTimer = undefined;
        setRunConfirmPending(false);
      }, 3000);
    };
    const runActionItems = workflowComposerRunActionItems({
      clearRunConfirm,
      handleRunStart: () => void handleRunAction("start"),
      requestRunConfirm,
      runBusy: isBusyAction("run"),
      state: workflowState,
    });

    return workflowComposerViewState({
      deploymentCount: deploymentHistory().length,
      primaryActionItems: primaryActionItems(),
      renderState,
      runActionItems,
      workflowActionItems: workflowActionItems(),
    });
  });

  const HeaderSection = (): JSXElement => (
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-on-surface-variant">
          {composerViewState().header.eyebrow}
        </p>
        <h2 class="text-2xl font-semibold text-on-surface">
          {composerViewState().header.title}
        </h2>
        <p class="max-w-4xl text-sm leading-6 text-on-surface-variant">
          {composerViewState().header.summary}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <For each={composerViewState().header.primaryActionItems}>
          {(item) => (
            <button
              type="button"
              class={item.className}
              onClick={item.onClick}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          )}
        </For>
        <Show when={composerViewState().header.showWorkflowActions}>
          <For each={composerViewState().header.workflowLeadingActionItems}>
            {(item) => (
              <button
                type="button"
                class={item.className}
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.label}
              </button>
            )}
          </For>
          <div class="flex items-center gap-1.5">
            <For each={composerViewState().header.runActionItems}>
              {(item) => (
                <button
                  type="button"
                  class={item.className}
                  onClick={item.onClick}
                  disabled={item.disabled}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
          <For each={composerViewState().header.workflowTrailingActionItems}>
            {(item) => (
              <button
                type="button"
                class={item.className}
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.label}
              </button>
            )}
          </For>
        </Show>
      </div>
    </div>
  );

  const WorkflowStatusSection = (): JSXElement => (
    <div class="mt-2 space-y-1">
      <For each={composerViewState().statusNoticeItems}>
        {(item) => <p class={item.className}>{item.content}</p>}
      </For>
    </div>
  );

  const SavedDescriptionSection = (): JSXElement => (
    <div class="mb-3 rounded-[20px] border border-white/45 bg-white/75 px-4 py-3">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
        {workflowComposerSavedDescriptionTitle()}
      </p>
      <p class="mt-1 text-sm text-sky-900">
        {composerViewState().panel.savedDescriptionText}
      </p>
    </div>
  );

  const DescribeHistoryEntryCardsSection = (): JSXElement => (
    <div class="space-y-2">
      <For each={describeHistoryEntryCards()}>
        {(card) => (
          <div class="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2">
            <div class="flex flex-wrap items-center gap-2">
              <For each={card.metadataBadges}>
                {(item) => <span class={item.className}>{item.content}</span>}
              </For>
            </div>
            <p class="mt-1 text-xs leading-5 text-sky-900">{card.entry.intent}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={card.actionItems}>
                {(item) => (
                  <button
                    type="button"
                    class={item.className}
                    onClick={item.onClick}
                    disabled={item.disabled}
                  >
                    {item.label}
                  </button>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );

  const DescribeHistoryPreviewSection = (): JSXElement => (
    <Show when={describeHistoryPreviewPanelState()}>
      {(previewPanelState: () => NonNullable<DescribeHistoryPreviewPanelState>) => (
        <div class="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
            {previewPanelState().title}
          </p>
          <p class="mt-1 text-xs leading-5 text-amber-900">
            {previewPanelState().previewSummary}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <For each={previewPanelState().chipItems}>
              {(chip) => (
                <span class={chip.className}>
                  {chip.label}
                </span>
              )}
            </For>
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <For each={previewPanelState().summaryCards}>
              {(card) => (
                <div class="rounded-2xl border border-amber-200/70 bg-white/70 px-3 py-3">
                  <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    {card.title}
                  </p>
                  <For each={card.lineItems}>
                    {(line) => <p class={line.className}>{line.content}</p>}
                  </For>
                  <Show when={card.badgeLabels.length > 0}>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <For each={card.badgeLabels}>
                        {(label) => (
                          <span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                            {label}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <p class="mt-2 text-xs text-amber-900">
            {previewPanelState().selectedIntentLabel}{" "}
            <span class="font-medium">{previewPanelState().selectedIntent}</span>
          </p>
        </div>
      )}
    </Show>
  );

  const describeHistorySectionViews = createMemo(() => {
    return workflowComposerDescribeHistorySectionViews<JSXElement>({
      contentById: {
        entry_cards: <DescribeHistoryEntryCardsSection />,
        preview_panel: <DescribeHistoryPreviewSection />,
      },
      showPreviewPanel: describeHistoryPreviewPanelState() !== null,
    });
  });

  const DescribeHistorySection = (): JSXElement => (
    <div class="mt-3 space-y-2 border-t border-sky-100 pt-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
        {workflowComposerDescribeHistoryTitle()}
      </p>
      <For each={describeHistorySectionViews()}>
        {(section) => section.content}
      </For>
    </div>
  );

  const IntentEditorSection = (): JSXElement => (
    <>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            {intentEditorSectionState().title}
          </p>
          <p class="max-w-3xl text-sm leading-6 text-sky-900">
            {intentEditorSectionState().summary}
          </p>
        </div>
        <Show when={intentEditorSectionState().hasExpansionBadges}>
          <div class="flex flex-wrap gap-2">
            <For each={intentEditorSectionState().expansionBadges}>
              {(badge) => (
                <span
                  class={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${workflowComposerBadgeToneClass(badge.tone)}`}
                >
                  {badge.label}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="mt-3 flex flex-col gap-3 lg:flex-row">
        <div class="flex-1">
          <TiptapEditor
            mode="compact"
            initialContent={workflowIntent()}
            disabled={intentEditorRenderState().interactionLocked}
            placeholder={workflowComposerIntentPlaceholder()}
            submitLabel={
              intentEditorRenderState().hasWorkflow ? "Regenerate workflow" : "Generate workflow"
            }
            clearOnSend={false}
            onChange={(_text, markdown) => setWorkflowIntent(markdown)}
            onSend={async (payload) => {
              setWorkflowIntent(payload.markdown || payload.text);
              if (intentEditorRenderState().hasWorkflow) {
                await regenerateCurrentWorkflowFromIntent();
                return;
              }
              await createWorkflowFromIntent();
            }}
          />
        </div>
        <div class="flex flex-col gap-2 lg:w-[220px]">
          <For each={intentEditorSectionState().actionItems}>
            {(item) => (
              <button
                type="button"
                class={item.className}
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={intentEditorSectionState().showOverrides}>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <For each={intentEditorSectionState().overrideFieldItems}>
            {(item) =>
              renderIntentOverrideField(
                item.label,
                item.value,
                item.onChange,
                item.children,
              )}
          </For>
        </div>
      </Show>

      <Show when={intentEditorSectionState().showImpactSummary}>
        <div class="mt-3">
          <div class="rounded-[20px] border border-white/45 bg-white/75 px-4 py-3">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              {workflowComposerRegenerationImpactTitle()}
            </p>
            <p class="mt-1 text-sm text-sky-900">
              {intentEditorSectionState().impactSummary}
            </p>
          </div>
        </div>
      </Show>
    </>
  );

  const composerPanelSectionViews = createMemo(() =>
    workflowComposerPanelSectionViews<JSXElement>({
      contentById: {
        describe_history: <DescribeHistorySection />,
        intent_editor: <IntentEditorSection />,
        saved_description: <SavedDescriptionSection />,
      },
      renderState: composerRenderState(),
    })
  );

  const composerSectionViews = createMemo(() =>
    workflowComposerSectionViews<JSXElement>({
      contentById: {
        composer_panel: (
          <div class="mt-5 rounded-[24px] border border-sky-200/70 bg-sky-50/65 p-4">
            <For each={composerPanelSectionViews()}>
              {(section) => section.content}
            </For>
          </div>
        ),
        header: <HeaderSection />,
        workflow_status: <WorkflowStatusSection />,
      },
      workflowActionState: composerRenderState().workflowActionState,
    })
  );

  return (
    <div class="glass-surface rounded-[28px] border border-white/40 p-6 shadow-panel">
      <For each={composerSectionViews()}>
        {(section) => section.content}
      </For>
    </div>
  );
}
