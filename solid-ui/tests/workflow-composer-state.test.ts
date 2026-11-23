import test from "node:test";
import assert from "node:assert/strict";

import type { SavedWorkflow } from "../src/lib/api.ts";
import { describeHistoryComparison } from "../src/lib/workflowDescribeIntentAnalysis.ts";
import { normalizeGraph } from "../src/lib/workflowGraphDraftState.ts";
import {
  COMPOSER_ARCHIVE_ACTION_CLASS,
  COMPOSER_BUILD_ACTION_CLASS,
  COMPOSER_CANCEL_ACTION_CLASS,
  COMPOSER_DESCRIBE_HISTORY_COMPARE_IDLE_ACTION_CLASS,
  COMPOSER_DESCRIBE_HISTORY_COMPARE_SELECTED_ACTION_CLASS,
  COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS,
  COMPOSER_DESCRIBE_HISTORY_REGENERATE_ACTION_CLASS,
  COMPOSER_DESCRIBE_HISTORY_REUSE_ACTION_CLASS,
  COMPOSER_DESCRIBE_HISTORY_SAVE_BRANCH_ACTION_CLASS,
  COMPOSER_DESCRIBE_HISTORY_TIMESTAMP_BADGE_CLASS,
  COMPOSER_DEPLOY_PREVIEW_ACTION_CLASS,
  COMPOSER_DRY_RUN_ACTION_CLASS,
  COMPOSER_FAVORITE_ACTION_CLASS,
  COMPOSER_INTENT_CLEAR_ACTION_CLASS,
  COMPOSER_INTENT_GENERATE_ACTION_CLASS,
  COMPOSER_INTENT_REGENERATE_ACTION_CLASS,
  COMPOSER_RUN_ACTION_CLASS,
  COMPOSER_RUN_CONFIRM_ACTION_CLASS,
  COMPOSER_SAVE_ACTION_CLASS,
  COMPOSER_SECONDARY_ACTION_CLASS,
  workflowComposerCoreActionDescriptors,
  workflowComposerCoreActionItems,
  workflowComposerDescribeHistoryPreviewPanelState,
  workflowComposerDescribeHistoryPreviewState,
  workflowComposerActionItems,
  workflowComposerActionState,
  workflowComposerBadgeToneClass,
  workflowComposerDescribeHistoryCompareActionClass,
  workflowComposerDescribeHistoryActionDescriptors,
  workflowComposerDescribeHistoryMetadataBadges,
  workflowComposerDescribeHistorySectionIds,
  workflowComposerDescribeHistorySectionViews,
  workflowComposerExpansionBadges,
  workflowComposerIntentActionItems,
  workflowComposerIntentActionDescriptors,
  workflowComposerHeaderState,
  workflowComposerIntentEditorRenderState,
  workflowComposerIntentEditorSectionState,
  workflowComposerOptimizationOverrideOptions,
  workflowComposerPanelSectionViews,
  workflowComposerPendingIntentSeedDecision,
  workflowComposerPrimaryActionItems,
  workflowComposerPrimaryActionDescriptors,
  workflowComposerPanelSectionIds,
  workflowComposerPresetOptions,
  workflowComposerRegenerationModeOptions,
  workflowComposerRenderState,
  workflowComposerRunActionItems,
  workflowComposerRunActionDescriptors,
  workflowComposerSavedDescriptionState,
  workflowComposerSectionIds,
  workflowComposerSectionViews,
  workflowComposerStatusNoticeItems,
  workflowComposerViewState,
  workflowComposerWorkflowActionItems,
  workflowComposerWorkflowActionDescriptors,
} from "../src/lib/workflowComposerState.ts";

function savedWorkflow(overrides: Partial<SavedWorkflow> = {}): SavedWorkflow {
  return {
    workflow_id: "wf-1",
    owner_user_id: "user-1",
    title: "Workflow",
    favorite: false,
    preset_kinds: [],
    graph: { nodes: [], edges: [] },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function describedWorkflow(): SavedWorkflow {
  return savedWorkflow({
    graph: {
      workflow_id: "wf-1",
      title: "Described workflow",
      description: "A described workflow",
      nodes: [
        {
          id: "node-1",
          kind: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          metadata: { generated_by_intent: true },
        },
        {
          id: "node-2",
          kind: "agent",
          label: "Draft",
          position: { x: 100, y: 0 },
          metadata: { generated_by_intent: true },
        },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
      metadata: {
        source_intent: "summarize inbound mail",
        describe_history: [
          {
            event_id: "event-1",
            event_kind: "create",
            intent: "summarize inbound mail",
            preset_kind: "research_assistant",
            optimization_mode: "balanced",
            timestamp: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
  });
}

test("workflowComposerActionState gates run actions on workflow, busy, IR, and deployments", () => {
  assert.deepEqual(
    workflowComposerActionState({
      busyAction: null,
      deploymentCount: 1,
      runConfirmPending: true,
      workflow: savedWorkflow({ favorite: true, latest_ir: { manifests: [] } }),
    }),
    {
      archived: false,
      busy: false,
      canRunWorkflow: true,
      favored: true,
      hasCompiledSnapshot: true,
      hasWorkflow: true,
      runConfirmPending: true,
    },
  );

  assert.equal(
    workflowComposerActionState({
      busyAction: "save",
      deploymentCount: 1,
      runConfirmPending: false,
      workflow: savedWorkflow({ latest_ir: { manifests: [] } }),
    }).canRunWorkflow,
    false,
  );
  assert.equal(
    workflowComposerActionState({
      busyAction: null,
      deploymentCount: 0,
      runConfirmPending: false,
      workflow: savedWorkflow({ latest_ir: { manifests: [] } }),
    }).canRunWorkflow,
    false,
  );
});

test("workflowComposerRenderState derives preview and visibility flags", () => {
  const actionState = workflowComposerActionState({
    busyAction: null,
    deploymentCount: 1,
    runConfirmPending: false,
    workflow: savedWorkflow({ latest_ir: { manifests: [] } }),
  });
  const state = workflowComposerRenderState({
    busyAction: null,
    deployPreviewOpen: true,
    previewSubject: "compiled snapshot",
    savedDescription: {
      sourceIntent: "summarize the queue",
      recentDescribeHistory: [
        {
          event_id: "event-1",
          event_kind: "create",
          intent: "summarize the queue",
        },
      ],
    },
    workflow: savedWorkflow({
      latest_ir: { manifests: [] },
      trigger_readiness_summary: {
        live_registration_supported: false,
      },
    }),
    workflowActionState: actionState,
    workflowInteractionLocked: true,
  });

  assert.equal(state.deployPreviewActive, true);
  assert.equal(state.historyActionsDisabled, true);
  assert.equal(state.persistDisabled, false);
  assert.equal(state.showDescribeHistory, true);
  assert.equal(state.showSavedDescription, true);
  assert.equal(state.showPreviewWarning, true);
  assert.match(state.previewWarning ?? "", /compiled snapshot/);
});

test("workflowComposerRenderState disables persistence without a workflow", () => {
  const actionState = workflowComposerActionState({
    busyAction: null,
    deploymentCount: 0,
    runConfirmPending: false,
    workflow: null,
  });
  const state = workflowComposerRenderState({
    busyAction: null,
    deployPreviewOpen: false,
    savedDescription: null,
    workflow: null,
    workflowActionState: actionState,
    workflowInteractionLocked: false,
  });

  assert.equal(state.persistDisabled, true);
  assert.equal(state.showDescribeHistory, false);
  assert.equal(state.showSavedDescription, false);
  assert.equal(state.showPreviewWarning, false);
  assert.equal(state.previewWarning, null);
});

test("workflow composer option helpers map preset and override labels", () => {
  assert.deepEqual(
    workflowComposerPresetOptions(["agent", "approval"]).map((option) => option.value),
    ["agent", "approval"],
  );
  assert.deepEqual(
    workflowComposerOptimizationOverrideOptions().map((option) => option.value),
    ["balanced", "speed", "cost"],
  );
  assert.deepEqual(
    workflowComposerRegenerationModeOptions().map((option) => option.value),
    ["preserve_manual", "rebuild"],
  );
});

test("workflow composer section helpers preserve panel ordering", () => {
  assert.deepEqual(workflowComposerSectionIds({ hasWorkflow: false }), [
    "header",
    "composer_panel",
  ]);
  assert.deepEqual(workflowComposerSectionIds({ hasWorkflow: true }), [
    "header",
    "workflow_status",
    "composer_panel",
  ]);
  assert.deepEqual(
    workflowComposerPanelSectionIds({
      showDescribeHistory: true,
      showSavedDescription: true,
    }),
    ["saved_description", "describe_history", "intent_editor"],
  );
  assert.deepEqual(
    workflowComposerPanelSectionIds({
      showDescribeHistory: false,
      showSavedDescription: false,
    }),
    ["intent_editor"],
  );
  assert.deepEqual(
    workflowComposerDescribeHistorySectionIds({ showPreviewPanel: false }),
    ["entry_cards"],
  );
  assert.deepEqual(
    workflowComposerDescribeHistorySectionIds({ showPreviewPanel: true }),
    ["entry_cards", "preview_panel"],
  );

  assert.deepEqual(
    workflowComposerSectionViews({
      contentById: {
        composer_panel: "Composer panel",
        header: "Header",
        workflow_status: "Workflow status",
      },
      workflowActionState: { hasWorkflow: true },
    }).map((section) => `${section.id}:${section.content}`),
    [
      "header:Header",
      "workflow_status:Workflow status",
      "composer_panel:Composer panel",
    ],
  );
  assert.deepEqual(
    workflowComposerPanelSectionViews({
      contentById: {
        describe_history: "Describe history",
        intent_editor: "Intent editor",
        saved_description: "Saved description",
      },
      renderState: {
        showDescribeHistory: true,
        showSavedDescription: false,
      },
    }).map((section) => `${section.id}:${section.content}`),
    ["describe_history:Describe history", "intent_editor:Intent editor"],
  );
  assert.deepEqual(
    workflowComposerDescribeHistorySectionViews({
      contentById: {
        entry_cards: "Entry cards",
        preview_panel: "Preview panel",
      },
      showPreviewPanel: true,
    }).map((section) => `${section.id}:${section.content}`),
    ["entry_cards:Entry cards", "preview_panel:Preview panel"],
  );
});

test("workflow composer intent editor section state bundles render flags and controls", () => {
  const state = workflowComposerIntentEditorSectionState({
    actionItems: ["generate", "clear"],
    expansionBadges: [{ label: "Calendar", tone: "emerald" }],
    overrideFieldItems: ["preset", "mode"],
    renderState: {
      hasIntent: true,
      hasWorkflow: true,
      impactSummary: "2 generated records preserved",
      interactionLocked: false,
      regenerationModeValue: "preserve_manual",
    },
  });

  assert.deepEqual(state.actionItems, ["generate", "clear"]);
  assert.deepEqual(state.overrideFieldItems, ["preset", "mode"]);
  assert.equal(state.hasExpansionBadges, true);
  assert.equal(state.showOverrides, true);
  assert.equal(state.showImpactSummary, true);
  assert.equal(state.impactSummary, "2 generated records preserved");
  assert.match(state.summary, /starter graph/i);
  assert.match(state.title, /workflow/i);

  const emptyState = workflowComposerIntentEditorSectionState({
    actionItems: [],
    expansionBadges: [],
    overrideFieldItems: [],
    renderState: {
      hasIntent: false,
      hasWorkflow: false,
      impactSummary: null,
      interactionLocked: false,
      regenerationModeValue: "rebuild",
    },
  });
  assert.equal(emptyState.hasExpansionBadges, false);
  assert.equal(emptyState.showOverrides, false);
  assert.equal(emptyState.showImpactSummary, false);
});

test("workflow composer status notices include deployment and preview warnings", () => {
  assert.deepEqual(
    workflowComposerStatusNoticeItems({
      deploymentCount: 1,
      previewWarning: null,
    }),
    [],
  );

  const notices = workflowComposerStatusNoticeItems({
    deploymentCount: 0,
    previewWarning: "Preview-only trigger",
  });
  assert.equal(notices.length, 2);
  assert.match(notices[0]?.content ?? "", /Build then Deploy/);
  assert.equal(notices[1]?.content, "Preview-only trigger");
});

test("workflow composer header and view state split action groups", () => {
  const actionState = workflowComposerActionState({
    busyAction: null,
    deploymentCount: 0,
    runConfirmPending: false,
    workflow: savedWorkflow({ latest_ir: { manifests: [] } }),
  });
  const renderState = workflowComposerRenderState({
    busyAction: null,
    deployPreviewOpen: false,
    savedDescription: {
      sourceIntent: "Summarize mail",
      recentDescribeHistory: [],
    },
    workflow: savedWorkflow({ latest_ir: { manifests: [] } }),
    workflowActionState: actionState,
    workflowInteractionLocked: false,
  });
  const workflowActionItems = ["favorite", "archive", "deploy", "dry-run"];

  const header = workflowComposerHeaderState({
    primaryActionItems: ["new", "save"],
    runActionItems: ["run"],
    workflowActionItems,
    workflowActionState: actionState,
  });
  assert.equal(header.showWorkflowActions, true);
  assert.deepEqual(header.workflowLeadingActionItems, ["favorite", "archive", "deploy"]);
  assert.deepEqual(header.workflowTrailingActionItems, ["dry-run"]);

  const view = workflowComposerViewState({
    deploymentCount: 0,
    primaryActionItems: ["new", "save"],
    renderState,
    runActionItems: ["run"],
    workflowActionItems,
  });
  assert.equal(view.panel.savedDescriptionText, "Summarize mail");
  assert.deepEqual(view.sectionIds, ["header", "workflow_status", "composer_panel"]);
  assert.equal(view.statusNoticeItems.length, 1);
});

test("workflow composer presentation classes and badge tones stay stable", () => {
  assert.match(COMPOSER_SECONDARY_ACTION_CLASS, /bg-white\/45/);
  assert.match(COMPOSER_SAVE_ACTION_CLASS, /bg-primary/);
  assert.match(COMPOSER_BUILD_ACTION_CLASS, /bg-emerald-500/);
  assert.match(COMPOSER_FAVORITE_ACTION_CLASS, /text-amber-800/);
  assert.match(COMPOSER_ARCHIVE_ACTION_CLASS, /text-slate-700/);
  assert.match(COMPOSER_DEPLOY_PREVIEW_ACTION_CLASS, /bg-sky-500/);
  assert.match(COMPOSER_RUN_ACTION_CLASS, /bg-violet-500/);
  assert.match(COMPOSER_DRY_RUN_ACTION_CLASS, /bg-cyan-500/);
  assert.match(COMPOSER_CANCEL_ACTION_CLASS, /hover:bg-white\/60/);
  assert.match(COMPOSER_RUN_CONFIRM_ACTION_CLASS, /animate-fade-in/);
  assert.match(COMPOSER_INTENT_GENERATE_ACTION_CLASS, /bg-sky-500/);
  assert.match(COMPOSER_INTENT_CLEAR_ACTION_CLASS, /bg-white\/65/);
  assert.match(COMPOSER_INTENT_REGENERATE_ACTION_CLASS, /bg-violet-500/);
  assert.match(COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS, /text-sky-700/);
  assert.match(COMPOSER_DESCRIBE_HISTORY_TIMESTAMP_BADGE_CLASS, /text-sky-600/);
  assert.match(COMPOSER_DESCRIBE_HISTORY_REUSE_ACTION_CLASS, /text-sky-700/);
  assert.match(COMPOSER_DESCRIBE_HISTORY_SAVE_BRANCH_ACTION_CLASS, /text-emerald-700/);
  assert.match(COMPOSER_DESCRIBE_HISTORY_REGENERATE_ACTION_CLASS, /text-violet-700/);

  assert.equal(workflowComposerBadgeToneClass("amber"), "bg-amber-100 text-amber-700");
  assert.equal(workflowComposerBadgeToneClass("violet"), "bg-violet-100 text-violet-700");
  assert.equal(workflowComposerBadgeToneClass("emerald"), "bg-emerald-100 text-emerald-700");
  assert.equal(workflowComposerBadgeToneClass("rose"), "bg-rose-100 text-rose-700");
  assert.equal(workflowComposerBadgeToneClass(null), "bg-white/85 text-sky-700");
  assert.equal(
    workflowComposerDescribeHistoryCompareActionClass(true),
    COMPOSER_DESCRIBE_HISTORY_COMPARE_SELECTED_ACTION_CLASS,
  );
  assert.equal(
    workflowComposerDescribeHistoryCompareActionClass(false),
    COMPOSER_DESCRIBE_HISTORY_COMPARE_IDLE_ACTION_CLASS,
  );
});

test("workflow composer action descriptors preserve ordering and disabled state", () => {
  const primaryActions = workflowComposerPrimaryActionDescriptors({
    compileBusy: false,
    persistDisabled: true,
    saveBusy: true,
    validateBusy: false,
  });
  assert.deepEqual(primaryActions.map((action) => action.kind), [
    "new",
    "save",
    "validate",
    "build",
  ]);
  assert.equal(primaryActions[0]?.className, COMPOSER_SECONDARY_ACTION_CLASS);
  assert.equal(primaryActions[1]?.className, COMPOSER_SAVE_ACTION_CLASS);
  assert.equal(primaryActions[1]?.disabled, true);
  assert.match(primaryActions[1]?.label ?? "", /Saving/i);
  assert.equal(primaryActions[3]?.className, COMPOSER_BUILD_ACTION_CLASS);
  assert.deepEqual(
    workflowComposerCoreActionDescriptors({
      compileBusy: false,
      persistDisabled: true,
      saveBusy: true,
      validateBusy: false,
    }),
    primaryActions,
  );

  const workflowState = {
    archived: false,
    busy: false,
    canRunWorkflow: true,
    favored: false,
    hasCompiledSnapshot: true,
    hasWorkflow: true,
    runConfirmPending: false,
  };
  const workflowActions = workflowComposerWorkflowActionDescriptors({
    archiveBusy: false,
    deployBusy: true,
    deployPreviewActive: true,
    dryRunBusy: false,
    favoriteBusy: false,
    state: workflowState,
  });
  assert.deepEqual(workflowActions.map((action) => action.kind), [
    "favorite",
    "archive",
    "deploy_preview",
    "dry_run",
  ]);
  assert.equal(workflowActions[0]?.className, COMPOSER_FAVORITE_ACTION_CLASS);
  assert.equal(workflowActions[1]?.className, COMPOSER_ARCHIVE_ACTION_CLASS);
  assert.equal(workflowActions[2]?.className, COMPOSER_DEPLOY_PREVIEW_ACTION_CLASS);
  assert.equal(workflowActions[3]?.className, COMPOSER_DRY_RUN_ACTION_CLASS);
  assert.equal(workflowActions[2]?.disabled, false);
  assert.equal(
    workflowComposerWorkflowActionDescriptors({
      archiveBusy: false,
      deployBusy: false,
      deployPreviewActive: false,
      dryRunBusy: false,
      favoriteBusy: false,
      state: { ...workflowState, hasWorkflow: false },
    }).length,
    0,
  );

  const runActions = workflowComposerRunActionDescriptors({
    runBusy: false,
    state: { ...workflowState, canRunWorkflow: false },
  });
  assert.deepEqual(runActions.map((action) => action.kind), ["run"]);
  assert.equal(runActions[0]?.className, COMPOSER_RUN_ACTION_CLASS);
  assert.equal(runActions[0]?.disabled, true);

  const confirmActions = workflowComposerRunActionDescriptors({
    runBusy: false,
    state: { ...workflowState, runConfirmPending: true },
  });
  assert.deepEqual(confirmActions.map((action) => action.kind), ["run_confirm", "cancel"]);
  assert.equal(confirmActions[0]?.className, COMPOSER_RUN_CONFIRM_ACTION_CLASS);
  assert.equal(confirmActions[1]?.className, COMPOSER_CANCEL_ACTION_CLASS);

  const intentActions = workflowComposerIntentActionDescriptors({
    hasIntent: false,
    hasWorkflow: false,
    impactSummary: null,
    interactionLocked: true,
    regenerationModeValue: "preserve_manual",
  });
  assert.deepEqual(intentActions.map((action) => action.kind), [
    "generate",
    "clear",
    "regenerate_draft",
  ]);
  assert.equal(intentActions[0]?.className, COMPOSER_INTENT_GENERATE_ACTION_CLASS);
  assert.equal(intentActions[1]?.className, COMPOSER_INTENT_CLEAR_ACTION_CLASS);
  assert.equal(intentActions[2]?.className, COMPOSER_INTENT_REGENERATE_ACTION_CLASS);
  assert.equal(intentActions[0]?.disabled, true);
  assert.equal(intentActions[1]?.disabled, true);
  assert.equal(intentActions[2]?.disabled, true);

  const boundActions = workflowComposerActionItems(primaryActions, (kind) => `handle:${kind}`);
  assert.deepEqual(
    boundActions.map((action) => `${action.kind}:${action.label}:${action.onClick}`),
    [
      `new:${primaryActions[0]?.label}:handle:new`,
      `save:${primaryActions[1]?.label}:handle:save`,
      `validate:${primaryActions[2]?.label}:handle:validate`,
      `build:${primaryActions[3]?.label}:handle:build`,
    ],
  );
  assert.equal(boundActions[1]?.disabled, primaryActions[1]?.disabled);
  assert.equal(boundActions[3]?.className, primaryActions[3]?.className);

  const invoked: string[] = [];
  workflowComposerPrimaryActionItems({
    compileBusy: false,
    createNewWorkflow: () => invoked.push("new"),
    handleCompile: () => invoked.push("compile"),
    handleSave: () => invoked.push("save"),
    handleValidate: () => invoked.push("validate"),
    persistDisabled: false,
    saveBusy: false,
    validateBusy: false,
  }).forEach((action) => action.onClick());
  assert.deepEqual(invoked, ["new", "save", "validate", "compile"]);

  workflowComposerCoreActionItems({
    compileBusy: false,
    createNewWorkflow: () => invoked.push("core:new"),
    handleCompile: () => invoked.push("core:compile"),
    handleSave: () => invoked.push("core:save"),
    handleValidate: () => invoked.push("core:validate"),
    persistDisabled: false,
    saveBusy: false,
    validateBusy: false,
  }).forEach((action) => action.onClick());
  assert.deepEqual(invoked.slice(-4), [
    "core:new",
    "core:save",
    "core:validate",
    "core:compile",
  ]);

  workflowComposerIntentActionItems({
    createWorkflowFromIntent: () => invoked.push("generate"),
    regenerateCurrentWorkflowFromIntent: () => invoked.push("regenerate"),
    renderState: {
      hasIntent: true,
      hasWorkflow: true,
      impactSummary: null,
      interactionLocked: false,
      regenerationModeValue: "preserve_manual",
    },
    setWorkflowIntent: (value) => invoked.push(`intent:${value}`),
  }).forEach((action) => action.onClick());
  assert.deepEqual(invoked.slice(-3), ["generate", "intent:", "regenerate"]);

  const workflowBoundActions = workflowComposerWorkflowActionItems({
    archiveBusy: false,
    deployBusy: false,
    deployPreviewActive: false,
    dryRunBusy: false,
    favoriteBusy: false,
    handleArchive: (archived) => invoked.push(`archive:${archived}`),
    handleDryRun: () => invoked.push("dry_run"),
    handleFavorite: (favored) => invoked.push(`favorite:${favored}`),
    setDeployPreviewOpen: (updater) => invoked.push(`deploy_preview:${updater(false)}`),
    state: workflowState,
  });
  workflowBoundActions.forEach((action) => action.onClick());
  assert.deepEqual(invoked.slice(-4), [
    "favorite:true",
    "archive:true",
    "deploy_preview:true",
    "dry_run",
  ]);

  workflowComposerRunActionItems({
    clearRunConfirm: () => invoked.push("clear_confirm"),
    handleRunStart: () => invoked.push("run_start"),
    requestRunConfirm: () => invoked.push("request_confirm"),
    runBusy: false,
    state: workflowState,
  })[0]?.onClick();
  workflowComposerRunActionItems({
    clearRunConfirm: () => invoked.push("clear_confirm"),
    handleRunStart: () => invoked.push("run_start"),
    requestRunConfirm: () => invoked.push("request_confirm"),
    runBusy: false,
    state: { ...workflowState, runConfirmPending: true },
  }).forEach((action) => action.onClick());
  assert.deepEqual(invoked.slice(-5), [
    "clear_confirm",
    "request_confirm",
    "clear_confirm",
    "run_start",
    "clear_confirm",
  ]);
});

test("workflow composer describe history action descriptors preserve ordering and selection state", () => {
  const selectedActions = workflowComposerDescribeHistoryActionDescriptors({
    actionsDisabled: true,
    selected: true,
  });

  assert.deepEqual(selectedActions.map((action) => action.kind), [
    "reuse",
    "compare",
    "save_branch",
    "regenerate",
  ]);
  assert.equal(selectedActions[0]?.className, COMPOSER_DESCRIBE_HISTORY_REUSE_ACTION_CLASS);
  assert.equal(
    selectedActions[1]?.className,
    COMPOSER_DESCRIBE_HISTORY_COMPARE_SELECTED_ACTION_CLASS,
  );
  assert.equal(selectedActions[2]?.className, COMPOSER_DESCRIBE_HISTORY_SAVE_BRANCH_ACTION_CLASS);
  assert.equal(selectedActions[3]?.className, COMPOSER_DESCRIBE_HISTORY_REGENERATE_ACTION_CLASS);
  assert.equal(selectedActions[2]?.disabled, true);
  assert.equal(selectedActions[3]?.disabled, true);
  assert.match(selectedActions[1]?.label ?? "", /Hide/i);

  const idleActions = workflowComposerDescribeHistoryActionDescriptors({
    actionsDisabled: false,
    selected: false,
  });
  assert.equal(
    idleActions[1]?.className,
    COMPOSER_DESCRIBE_HISTORY_COMPARE_IDLE_ACTION_CLASS,
  );
  assert.equal(idleActions[2]?.disabled, false);
  assert.equal(idleActions[3]?.disabled, false);
  assert.match(idleActions[1]?.label ?? "", /Compare/i);
});

test("workflow composer describe history metadata badges preserve ordering and optional fields", () => {
  const badges = workflowComposerDescribeHistoryMetadataBadges({
    event_id: "event-1",
    event_kind: "regenerate",
    intent: "Summarize mail",
    optimization_mode: "balanced",
    preset_kind: "research_assistant",
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(badges.length, 4);
  assert.deepEqual(
    badges.map((badge) => badge.className),
    [
      COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS,
      COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS,
      COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS,
      COMPOSER_DESCRIBE_HISTORY_TIMESTAMP_BADGE_CLASS,
    ],
  );
  assert.match(badges[0]?.content ?? "", /Regenerate/i);
  assert.match(badges[1]?.content ?? "", /research/i);
  assert.match(badges[2]?.content ?? "", /balanced/i);
  assert.match(badges[3]?.content ?? "", /2026/);

  assert.deepEqual(
    workflowComposerDescribeHistoryMetadataBadges({
      event_id: "event-2",
      event_kind: "create",
      intent: "Create workflow",
    }).map((badge) => badge.className),
    [COMPOSER_DESCRIBE_HISTORY_METADATA_BADGE_CLASS],
  );
});

test("workflowComposerSavedDescriptionState extracts source intent and recent history", () => {
  const state = workflowComposerSavedDescriptionState(describedWorkflow());

  assert.equal(state?.sourceIntent, "summarize inbound mail");
  assert.equal(state?.recentDescribeHistory.length, 1);
  assert.equal(state?.recentDescribeHistory[0]?.event_id, "event-1");
  assert.equal(workflowComposerSavedDescriptionState(savedWorkflow()), null);
  assert.equal(workflowComposerSavedDescriptionState(null), null);
});

test("workflowComposerExpansionBadges maps intent expansion capabilities", () => {
  assert.deepEqual(workflowComposerExpansionBadges(null), []);
  assert.deepEqual(
    workflowComposerExpansionBadges({
      preset_kind: "research_assistant",
      optimization_mode: "speed",
      requires_approval: true,
      needs_branching: true,
      needs_research_support: false,
      public_output: true,
    }).map((badge) => badge.tone),
    [null, null, "amber", "violet", "rose"],
  );
});

test("workflowComposerIntentEditorRenderState summarizes intent and regeneration impact", () => {
  const workflow = describedWorkflow();
  const impact = {
    generatedEdges: 1,
    generatedNodes: 2,
    lockedNodes: 0,
    preservedEdges: 0,
    preservedNodes: 0,
  };
  const state = workflowComposerIntentEditorRenderState({
    currentWorkflow: workflow,
    regenerationImpact: impact,
    regenerationMode: "preserve_manual",
    workflowIntent: "  update the workflow  ",
    workflowInteractionLocked: true,
  });

  assert.equal(state.hasIntent, true);
  assert.equal(state.hasWorkflow, true);
  assert.equal(state.interactionLocked, true);
  assert.equal(state.regenerationModeValue, "preserve_manual");
  assert.match(state.impactSummary ?? "", /2 generated nodes/);
});

test("workflowComposerDescribeHistoryPreviewState and panel map comparison copy", () => {
  const workflow = describedWorkflow();
  const draft = normalizeGraph(workflow);
  const entry = workflowComposerSavedDescriptionState(workflow)?.recentDescribeHistory[0] ?? null;
  assert.ok(entry);
  const comparison = describeHistoryComparison({
    draft,
    entry,
    intentOverride: "different intent",
    optimizationOverride: "",
    presetOverride: "",
    regenerationMode: "preserve_manual",
    workflowDescription: workflow.description,
  });
  const preview = workflowComposerDescribeHistoryPreviewState({
    comparison,
    entry,
    regenerationMode: "preserve_manual",
  });
  const panel = workflowComposerDescribeHistoryPreviewPanelState(preview);

  assert.equal(preview?.selectedIntent, "summarize inbound mail");
  assert.equal(preview?.comparisonChips[0]?.changed, true);
  assert.ok((panel?.selectedIntentLabel.length ?? 0) > 0);
  assert.equal(panel?.summaryCards.length, 2);
  assert.equal(workflowComposerDescribeHistoryPreviewState({
    comparison: null,
    entry,
    regenerationMode: "preserve_manual",
  }), null);
  assert.equal(workflowComposerDescribeHistoryPreviewPanelState(null), null);
});

test("workflowComposerPendingIntentSeedDecision seeds master-agent asks without overwriting drafts", () => {
  assert.deepEqual(
    workflowComposerPendingIntentSeedDecision({
      currentIntent: "",
      pendingSeed: {
        id: "seed-1",
        intent: "Research vendors and summarize approvals",
        source: "master_agent",
      },
      previouslyAppliedSeedId: null,
    }),
    {
      feedback: "Master-agent ask copied into the workflow builder. Review it, then generate the workflow.",
      nextIntent: "Research vendors and summarize approvals",
      seedId: "seed-1",
    },
  );

  assert.deepEqual(
    workflowComposerPendingIntentSeedDecision({
      currentIntent: "Existing workflow description",
      pendingSeed: {
        id: "seed-2",
        intent: "New master-agent ask",
        source: "master_agent",
      },
      previouslyAppliedSeedId: null,
    }),
    {
      feedback: "Master-agent ask is ready, but the current workflow description was preserved. Clear it before reopening the workflow preview to use the latest ask.",
      nextIntent: null,
      seedId: null,
    },
  );

  assert.deepEqual(
    workflowComposerPendingIntentSeedDecision({
      currentIntent: "",
      pendingSeed: {
        id: "seed-2",
        intent: "New master-agent ask",
        source: "master_agent",
      },
      previouslyAppliedSeedId: null,
    }),
    {
      feedback: "Master-agent ask copied into the workflow builder. Review it, then generate the workflow.",
      nextIntent: "New master-agent ask",
      seedId: "seed-2",
    },
  );

  assert.deepEqual(
    workflowComposerPendingIntentSeedDecision({
      currentIntent: "",
      pendingSeed: {
        id: "seed-1",
        intent: "Research vendors and summarize approvals",
        source: "master_agent",
      },
      previouslyAppliedSeedId: "seed-1",
    }),
    { feedback: null, nextIntent: null, seedId: null },
  );

  assert.deepEqual(
    workflowComposerPendingIntentSeedDecision({
      currentIntent: "",
      pendingSeed: { id: "blank-seed", intent: "   ", source: "master_agent" },
      previouslyAppliedSeedId: null,
    }),
    { feedback: null, nextIntent: null, seedId: "blank-seed" },
  );
});
