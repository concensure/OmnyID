import test from "node:test";
import assert from "node:assert/strict";

import {
  commandPreviewPendingIntentAfterConsumed,
  commandPreviewSelectableSuggestedView,
  commandPreviewShowsWorkflowHandoff,
  commandPreviewSuggestedWorkflowPendingIntentSeed,
  commandPreviewSurfaceKind,
  commandPreviewWorkflowPendingIntentSeed,
} from "../src/lib/commandPreviewRouting.js";

test("commandPreviewSurfaceKind classifies preview branches from intent and preferred view", () => {
  assert.equal(commandPreviewSurfaceKind({ intent: "web_research" }), "search");
  assert.equal(commandPreviewSurfaceKind({ intent: "other", preferredView: "search_result" }), "search");
  assert.equal(commandPreviewSurfaceKind({ intent: "task" }), "task");
  assert.equal(commandPreviewSurfaceKind({ intent: "other", preferredView: "task_board" }), "task");
  assert.equal(commandPreviewSurfaceKind({ intent: "note" }), "note");
  assert.equal(commandPreviewSurfaceKind({ intent: "social" }), "social");
  assert.equal(commandPreviewSurfaceKind({ intent: "spaces" }), "spaces");
  assert.equal(commandPreviewSurfaceKind({ intent: "schedule" }), "schedule");
  assert.equal(commandPreviewSurfaceKind({ intent: "trip_planner" }), "presentation");
  assert.equal(commandPreviewSurfaceKind({ intent: "other", preferredView: "ui_presentation" }), "presentation");
  assert.equal(commandPreviewSurfaceKind({ intent: "orchestrate" }), "orchestrate");
  assert.equal(commandPreviewSurfaceKind({ intent: "dashboard_focus" }), "dashboard_panel");
  assert.equal(commandPreviewSurfaceKind({ intent: "runner_edit" }), "runner_panel");
  assert.equal(commandPreviewSurfaceKind({ intent: "other" }), "generic_panel");
  assert.equal(commandPreviewSurfaceKind({ intent: null, preferredView: null }), "generic_panel");
  assert.equal(
    commandPreviewSurfaceKind({ intent: " other ", preferredView: " UI_Presentation " }),
    "presentation",
  );
});

test("commandPreviewSurfaceKind distinguishes travel card and comparison routes", () => {
  assert.equal(
    commandPreviewSurfaceKind({ intent: "travel", travelPrefersComparison: true }),
    "travel_comparison",
  );
  assert.equal(
    commandPreviewSurfaceKind({ intent: "travel", travelPrefersComparison: false }),
    "travel_card",
  );
  assert.equal(
    commandPreviewSurfaceKind({ intent: "other", preferredView: "comparison_table", travelPrefersComparison: false }),
    "travel_comparison",
  );
  assert.equal(
    commandPreviewSurfaceKind({ intent: "other", preferredView: "route_card", travelPrefersComparison: true }),
    "travel_card",
  );
});

test("commandPreviewWorkflowPendingIntentSeed builds stable workflow handoff seeds", () => {
  const seed = commandPreviewWorkflowPendingIntentSeed({
    intent: "orchestrate",
    preferredView: "orchestrate_progress",
    query: "  Build a workflow for inbox approvals  ",
    summary: " Fallback summary ",
  });
  const repeatedSeed = commandPreviewWorkflowPendingIntentSeed({
    intent: " ORCHESTRATE ",
    preferredView: " ORCHESTRATE_PROGRESS ",
    query: "Build a workflow for inbox approvals",
    summary: "Fallback summary",
  });
  const refreshedSummarySeed = commandPreviewWorkflowPendingIntentSeed({
    intent: "orchestrate",
    preferredView: "orchestrate_progress",
    query: "Build a workflow for inbox approvals",
    summary: "Backend summary changed on refresh",
  });
  const presentationSeed = commandPreviewWorkflowPendingIntentSeed({
    intent: "orchestrate",
    preferredView: "ui_presentation",
    query: "Build a workflow for inbox approvals",
    summary: "Fallback summary",
  });
  const nullishRouteSeed = commandPreviewWorkflowPendingIntentSeed({
    intent: null,
    preferredView: null,
    query: "Build a workflow for inbox approvals",
    summary: "Fallback summary",
  });

  assert.deepEqual(seed, {
    id: repeatedSeed?.id,
    intent: "Build a workflow for inbox approvals",
    source: "master_agent",
    summary: "Fallback summary",
  });
  assert.notEqual(seed?.id, presentationSeed?.id);
  assert.notEqual(seed?.id, nullishRouteSeed?.id);
  assert.equal(seed?.id, refreshedSummarySeed?.id);

  const fallbackSeed = commandPreviewWorkflowPendingIntentSeed({
    intent: "trip_planner",
    query: "   ",
    summary: "Plan a trip workflow",
  });
  const differentFallbackSeed = commandPreviewWorkflowPendingIntentSeed({
    intent: "trip_planner",
    query: "",
    summary: "Plan a different trip workflow",
  });
  assert.deepEqual(fallbackSeed, {
    id: commandPreviewWorkflowPendingIntentSeed({
      intent: "trip_planner",
      query: "",
      summary: " Plan a trip workflow ",
    })?.id,
    intent: "Plan a trip workflow",
    source: "master_agent",
    summary: "Plan a trip workflow",
  });
  assert.notEqual(fallbackSeed?.id, differentFallbackSeed?.id);

  assert.equal(
    commandPreviewWorkflowPendingIntentSeed({
      intent: "",
      query: " ",
      summary: " ",
    }),
    null,
  );

  assert.deepEqual(
    commandPreviewWorkflowPendingIntentSeed({
      id: " explicit-seed ",
      intent: "orchestrate",
      query: "Use the exact id",
    }),
    {
      id: "explicit-seed",
      intent: "Use the exact id",
      source: "master_agent",
      summary: null,
    },
  );

  assert.match(
    commandPreviewWorkflowPendingIntentSeed({
      id: "  ",
      intent: "orchestrate",
      query: "Fall back to deterministic id",
    })?.id ?? "",
    /^command-preview:/,
  );
});

test("commandPreviewShowsWorkflowHandoff follows orchestration and presentation routing", () => {
  assert.equal(commandPreviewShowsWorkflowHandoff({ intent: "orchestrate" }), true);
  assert.equal(commandPreviewShowsWorkflowHandoff({ intent: "other", preferredView: "orchestrate_progress" }), true);
  assert.equal(commandPreviewShowsWorkflowHandoff({ intent: "trip_planner" }), true);
  assert.equal(commandPreviewShowsWorkflowHandoff({ intent: "other", preferredView: "ui_presentation" }), true);
  assert.equal(
    commandPreviewShowsWorkflowHandoff({ intent: " ORCHESTRATE ", preferredView: " ORCHESTRATE_PROGRESS " }),
    true,
  );
  assert.equal(
    commandPreviewShowsWorkflowHandoff({
      intent: "travel",
      preferredView: "comparison_table",
      travelPrefersComparison: true,
    }),
    false,
  );
  assert.equal(commandPreviewShowsWorkflowHandoff({ intent: "web_research" }), false);
});

test("commandPreviewPendingIntentAfterConsumed clears only the matching handoff seed", () => {
  const seed = {
    id: "command-preview:abc",
    intent: "Build a vendor approval workflow",
    source: "master_agent",
    summary: "Coordinate approvals",
  };

  assert.equal(commandPreviewPendingIntentAfterConsumed(null, "command-preview:abc"), null);
  assert.equal(commandPreviewPendingIntentAfterConsumed(seed, "command-preview:abc"), null);
  assert.equal(commandPreviewPendingIntentAfterConsumed(seed, "command-preview:other"), seed);
  assert.equal(commandPreviewPendingIntentAfterConsumed(seed, ""), seed);
  assert.equal(commandPreviewPendingIntentAfterConsumed(seed, null), seed);
});

test("commandPreviewSuggestedWorkflowPendingIntentSeed gates auto-navigation handoffs", () => {
  const seed = commandPreviewSuggestedWorkflowPendingIntentSeed({
    intent: "orchestrate",
    preferredView: "orchestrate_progress",
    query: "Create an approvals workflow",
    summary: "Prepare workflow canvas",
    suggestedView: " workflows ",
  });

  assert.deepEqual(seed, {
    id: commandPreviewWorkflowPendingIntentSeed({
      intent: "orchestrate",
      preferredView: "orchestrate_progress",
      query: "Create an approvals workflow",
      summary: "Prepare workflow canvas",
    })?.id,
    intent: "Create an approvals workflow",
    source: "master_agent",
    summary: "Prepare workflow canvas",
  });

  assert.equal(
    commandPreviewSuggestedWorkflowPendingIntentSeed({
      intent: "orchestrate",
      preferredView: "orchestrate_progress",
      query: "Create an approvals workflow",
      summary: "Prepare workflow canvas",
      suggestedView: "search",
    }),
    null,
  );
  assert.equal(
    commandPreviewSuggestedWorkflowPendingIntentSeed({
      intent: "travel",
      preferredView: "comparison_table",
      query: "Compare flights",
      summary: "Travel comparison",
      suggestedView: "workflows",
      travelPrefersComparison: true,
    }),
    null,
  );
});

test("commandPreviewSelectableSuggestedView normalizes and gates backend navigation suggestions", () => {
  const viewNames = ["search", "workflows", "runner"];
  const blockedViewNames = ["runner"];

  assert.equal(
    commandPreviewSelectableSuggestedView({
      suggestedView: " Workflows ",
      viewNames,
      blockedViewNames,
    }),
    "workflows",
  );
  assert.equal(
    commandPreviewSelectableSuggestedView({
      suggestedView: "runner",
      viewNames,
      blockedViewNames,
    }),
    null,
  );
  assert.equal(
    commandPreviewSelectableSuggestedView({
      suggestedView: "unknown_backend_view",
      viewNames,
      blockedViewNames,
    }),
    null,
  );
  assert.equal(
    commandPreviewSelectableSuggestedView({
      suggestedView: " ",
      viewNames,
      blockedViewNames,
    }),
    null,
  );
});
