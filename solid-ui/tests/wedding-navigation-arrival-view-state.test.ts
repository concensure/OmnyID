import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingNavigationArrivalBannerState,
  weddingArrivalActionDestinationView,
} from "../src/lib/weddingNavigationArrivalViewState.ts";
import type { WeddingNavigationStoredIntent } from "../src/lib/weddingNavigationLocalState.ts";
import type { WeddingNavigationIntent } from "../src/lib/weddingNavigationState.ts";

const baseIntent: WeddingNavigationIntent = {
  view: "response_queue",
  surface: "planning_files",
  weddingPlanId: "wedding_plan_spring",
  responseWorkspaceId: "wedding_workspace_spring",
  sourceResponseId: "response_spring",
  artifactId: "artifact_vendor_table",
  sectionId: "vendors",
  notice: "Opening wedding planning files for wedding_workspace_spring.",
  metadata: {
    template: "wedding_planning",
  },
};

test("buildWeddingNavigationArrivalBannerState creates a planning workspace banner", () => {
  const state = buildWeddingNavigationArrivalBannerState(baseIntent);

  assert.equal(state?.title, "Your wedding documents are open.");
  assert.equal(state?.badge, "Wedding documents");
  assert.equal(state?.tone, "sky");
  assert.equal(state?.primaryAction.kind, "open_workspace");
  assert.equal(state?.primaryAction.label, "Open wedding documents");
  assert.equal(state?.secondaryActions.find((action) => action.kind === "open_workspace")?.disabled, true);
  assert.match(state?.subtitle ?? "", /selected wedding document/);
});

test("buildWeddingNavigationArrivalBannerState exposes carried context chips", () => {
  const stored: WeddingNavigationStoredIntent = {
    ...baseIntent,
    savedAt: "2026-09-12T09:30:00.000Z",
    metadata: {
      template: "wedding_planning",
      decision_scopes: [{
        selected_option_label: "Harbour Hall",
        artifact_title: "Venue shortlist",
      }],
    },
  };

  const state = buildWeddingNavigationArrivalBannerState(stored);
  const chipValues = new Map(state?.chips.map((chip) => [chip.label, chip.value]));

  assert.equal(chipValues.has("Plan"), false);
  assert.equal(chipValues.has("Workspace"), false);
  assert.equal(chipValues.has("Artifact"), false);
  assert.equal(chipValues.has("Section"), false);
  assert.equal(chipValues.get("Selected"), "1 choice");
  assert.equal(chipValues.get("Loaded"), "2026-09-12T09:30:00.000Z");
});

test("buildWeddingNavigationArrivalBannerState gives approval surfaces stricter action copy", () => {
  const state = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "decision_queue",
    surface: "approval",
    notice: "Opening approval review for artifact_vendor_email.",
    artifactId: "artifact_vendor_email",
  });

  assert.equal(state?.tone, "amber");
  assert.equal(state?.primaryAction.kind, "review_approval");
  assert.match(state?.primaryAction.description ?? "", /before it runs/);
  assert.match(state?.warning ?? "", /not proof that external messages/);
  assert.equal(state?.secondaryActions.some((action) => action.kind === "review_approval"), false);
});

test("buildWeddingNavigationArrivalBannerState maps destination-specific primary actions", () => {
  assert.equal(buildWeddingNavigationArrivalBannerState({ ...baseIntent, view: "calendar", surface: "calendar" })?.primaryAction.kind, "review_calendar");
  assert.equal(buildWeddingNavigationArrivalBannerState({ ...baseIntent, view: "tasks", surface: "tasks" })?.primaryAction.kind, "review_tasks");
  assert.equal(buildWeddingNavigationArrivalBannerState({ ...baseIntent, view: "knowledge_graph", surface: "knowledge_graph" })?.primaryAction.kind, "open_graph");
  assert.equal(buildWeddingNavigationArrivalBannerState({ ...baseIntent, view: "connected_apps", surface: "connected_apps" })?.primaryAction.kind, "open_connected_apps");
  assert.equal(buildWeddingNavigationArrivalBannerState({ ...baseIntent, view: "search", surface: "map" })?.primaryAction.kind, "verify_map");
  assert.equal(buildWeddingNavigationArrivalBannerState({ ...baseIntent, view: "files", surface: "export" })?.primaryAction.kind, "review_export");
});

test("buildWeddingNavigationArrivalBannerState makes research prompts obvious", () => {
  const state = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "threads",
    surface: "continue_chat",
    metadata: {
      template: "wedding_planning",
      wedding_research_prompt: {
        version: 1,
        source: "documents",
        title: "Wedding research",
        requested_output: "research_brief",
        query: "venues with wet-weather backup",
        location: "Sydney",
      },
    },
  });

  assert.equal(state?.primaryAction.kind, "continue_chat");
  assert.equal(state?.primaryAction.label, "Start research brief");
  assert.match(state?.primaryAction.description ?? "", /save useful findings/);
  assert.match(state?.primaryAction.draftPrompt ?? "", /Wedding research/);
  assert.match(state?.primaryAction.draftPrompt ?? "", /venues with wet-weather backup/);
  assert.match(state?.primaryAction.draftPrompt ?? "", /Sydney/);
  assert.match(state?.primaryAction.draftPrompt ?? "", /source-backed findings/);
  assert.match(state?.primaryAction.draftPrompt ?? "", /wedding documents/);
  assert.equal(state?.chips.find((chip) => chip.label === "Request")?.value, "Research brief");
  assert.ok(state?.bodyItems.some((item) => item.label === "Research request" && /wet-weather backup/.test(item.detail)));
});

test("buildWeddingNavigationArrivalBannerState renders connected app provider handoff setup", () => {
  const state = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "connected_apps",
    surface: "connected_apps",
    notice: "Opening Connected Apps for wedding provider setup.",
    metadata: {
      template: "wedding_planning",
      provider_handoff_audit: {
        status: "external_provider_required",
        pending_count: 1,
        pending_capabilities: ["create_calendar_event"],
        setup_views: ["google_calendar"],
      },
    },
  });

  assert.equal(state?.tone, "amber");
  assert.equal(state?.badge, "Provider setup");
  assert.equal(state?.primaryAction.kind, "open_connected_apps");
  assert.equal(state?.primaryAction.label, "Open Connected Apps");
  assert.equal(state?.secondaryActions.find((action) => action.kind === "open_connected_apps")?.disabled, true);
  assert.ok(state?.bodyItems.some((item) => item.label === "Connected apps" && /create_calendar_event/.test(item.detail)));
});

test("buildWeddingNavigationArrivalBannerState adds handoff-aware secondary actions", () => {
  const state = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      handoff_context: {
        version: 1,
        linkedCalendarCount: 2,
        linkedTaskCount: 3,
        decisionScopeCount: 1,
        decisionFocusCount: 2,
        exportIncludedCount: 4,
        exportExcludedSensitiveCount: 1,
      },
    },
  });
  const actions = state?.secondaryActions ?? [];

  assert.ok(actions.some((action) => action.kind === "review_calendar" && action.label === "Calendar (2)"));
  assert.equal(actions.some((action) => action.kind === "review_tasks"), false);
  assert.ok(actions.some((action) => action.kind === "review_export" && action.label === "Download safely"));
  assert.equal(state?.chips.find((chip) => chip.label === "Selected")?.value, "1 choice");
  assert.equal(state?.chips.find((chip) => chip.label === "Focus")?.value, "2 decisions");
});

test("buildWeddingNavigationArrivalBannerState exposes direct decision focus chips", () => {
  const state = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      decision_focus: {
        version: 1,
        summary_label: "Focus on 2 wedding decisions now; 1 can wait.",
        backlog_count: 1,
        focus_items: [
          { title: "Decide final caterer headcount" },
          { title: "Verify venue balance before payment" },
        ],
      },
    },
  });

  assert.equal(state?.chips.find((chip) => chip.label === "Focus")?.value, "2 decisions");
});

test("buildWeddingNavigationArrivalBannerState labels decision focus actions by intent", () => {
  const explainState = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      decision_focus: {
        version: 1,
        intent: "explain_item",
        focus_items: [{ title: "Choose photographer" }],
      },
    },
  });
  const openState = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      decision_focus: {
        version: 1,
        intent: "open_item",
        focus_items: [{ title: "Choose photographer" }],
      },
    },
  });
  const reviewState = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      decision_focus: {
        version: 1,
        intent: "review_all",
        focus_items: [{ title: "Choose photographer" }],
      },
    },
  });

  assert.equal(explainState?.primaryAction.label, "Show why it matters");
  assert.match(explainState?.primaryAction.description ?? "", /top three/i);
  assert.equal(openState?.primaryAction.label, "Open this decision");
  assert.match(openState?.primaryAction.description ?? "", /approved, assigned, or deferred/i);
  assert.equal(reviewState?.primaryAction.label, "Review top decisions");
});

test("buildWeddingNavigationArrivalBannerState foregrounds expected behaviour gap reviews", () => {
  const state = buildWeddingNavigationArrivalBannerState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      expected_behavior_audit: {
        ready_count: 9,
        blocked_count: 4,
        suggested_task_count: 3,
        blocked_capabilities: ["weather_contingency", "run_sheet_adjustments"],
        suggested_task_titles: ["Connect BOM weather source", "Confirm run-sheet delay rule"],
        blocker_labels: ["Weather contingency needs live weather evidence."],
      },
    },
  });

  assert.equal(state?.primaryAction.kind, "review_tasks");
  assert.equal(state?.primaryAction.label, "Review gap tasks");
  assert.match(state?.primaryAction.description ?? "", /planning gap tasks/);
  assert.equal(state?.chips.find((chip) => chip.label === "Gaps")?.value, "4 planning gaps");
  assert.ok(state?.bodyItems.some((item) => item.label === "Planning setup gaps" && /weather contingency/.test(item.detail)));
  assert.match(state?.subtitle ?? "", /Review the suggested wedding gap tasks/);
});

test("buildWeddingNavigationArrivalBannerState returns null for absent or invalid context", () => {
  assert.equal(buildWeddingNavigationArrivalBannerState(null), null);
  assert.equal(buildWeddingNavigationArrivalBannerState(undefined), null);
  assert.equal(buildWeddingNavigationArrivalBannerState({ ...baseIntent, responseWorkspaceId: "" }), null);
});

test("weddingArrivalActionDestinationView maps banner actions to existing views", () => {
  assert.equal(weddingArrivalActionDestinationView({ kind: "open_workspace", label: "", description: "", disabled: false }), "response_queue");
  assert.equal(weddingArrivalActionDestinationView({ kind: "continue_chat", label: "", description: "", disabled: false }), "threads");
  assert.equal(weddingArrivalActionDestinationView({ kind: "review_calendar", label: "", description: "", disabled: false }), "calendar");
  assert.equal(weddingArrivalActionDestinationView({ kind: "review_tasks", label: "", description: "", disabled: false }), "tasks");
  assert.equal(weddingArrivalActionDestinationView({ kind: "open_graph", label: "", description: "", disabled: false }), "knowledge_graph");
  assert.equal(weddingArrivalActionDestinationView({ kind: "open_connected_apps", label: "", description: "", disabled: false }), "connected_apps");
  assert.equal(weddingArrivalActionDestinationView({ kind: "review_approval", label: "", description: "", disabled: false }), "decision_queue");
  assert.equal(weddingArrivalActionDestinationView({ kind: "review_export", label: "", description: "", disabled: false }), "files");
  assert.equal(weddingArrivalActionDestinationView({ kind: "verify_map", label: "", description: "", disabled: false }), "search");
  assert.equal(weddingArrivalActionDestinationView({ kind: "dismiss", label: "", description: "", disabled: false }), null);
  assert.equal(weddingArrivalActionDestinationView({ kind: "open_graph", label: "", description: "", disabled: true }), null);
});
