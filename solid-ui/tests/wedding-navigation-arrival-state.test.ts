import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingNavigationArrivalState } from "../src/lib/weddingNavigationArrivalState.ts";
import type { WeddingNavigationStoredIntent } from "../src/lib/weddingNavigationLocalState.ts";
import type { WeddingNavigationIntent } from "../src/lib/weddingNavigationState.ts";

const baseIntent: WeddingNavigationIntent = {
  view: "response_queue",
  surface: "planning_files",
  weddingPlanId: "wedding_plan_123",
  responseWorkspaceId: "wedding_workspace_123",
  sourceResponseId: "response_1",
  artifactId: "artifact_budget",
  sectionId: "budget",
  notice: "Opening wedding planning files for wedding_workspace_123.",
  metadata: {
    template: "wedding_planning",
  },
};

test("buildWeddingNavigationArrivalState explains planning file arrival context", () => {
  const state = buildWeddingNavigationArrivalState(baseIntent);

  assert.equal(state?.headline, "Your wedding documents are open.");
  assert.equal(state?.badge, "Wedding documents");
  assert.equal(state?.view, "response_queue");
  assert.equal(state?.artifactId, "artifact_budget");
  assert.equal(state?.cards.some((card) => card.label === "What carried over"), false);
  assert.equal(state?.cards.some((card) => card.label === "Why this surface"), false);
  assert.match(state?.detail ?? "", /research, tables, drafts/i);
  assert.match(state?.nextStep ?? "", /selected wedding document/i);
});

test("buildWeddingNavigationArrivalState keeps savedAt from stored intents", () => {
  const stored: WeddingNavigationStoredIntent = {
    ...baseIntent,
    savedAt: "2026-09-12T10:00:00.000Z",
  };

  const state = buildWeddingNavigationArrivalState(stored);

  assert.equal(state?.savedAt, "2026-09-12T10:00:00.000Z");
});

test("buildWeddingNavigationArrivalState gives calendar-specific guidance", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "calendar",
    surface: "calendar",
    artifactId: null,
    sectionId: null,
    notice: "Opening wedding dates in Calendar.",
  });

  assert.equal(state?.badge, "Calendar context");
  assert.match(state?.detail ?? "", /calendar context/i);
  assert.match(state?.nextStep ?? "", /before syncing or inviting/);
});

test("buildWeddingNavigationArrivalState gives task and graph guidance", () => {
  const taskState = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    notice: "Opening wedding tasks and critical-path items.",
  });
  const graphState = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "knowledge_graph",
    surface: "knowledge_graph",
    notice: "Opening wedding topology in Knowledge Graph.",
  });

  assert.equal(taskState?.badge, "Wedding tasks");
  assert.match(taskState?.nextStep ?? "", /Confirm owner/);
  assert.equal(graphState?.badge, "Related details");
  assert.match(graphState?.nextStep ?? "", /connected details and missing proof/);
});

test("buildWeddingNavigationArrivalState surfaces decision-focus task context", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      decision_focus: {
        version: 1,
        summary_label: "Focus on 2 wedding decisions now; 1 can wait.",
        backlog_count: 1,
        top_source_surface: "tasks",
        focus_items: [{
          id: "task:final-count",
          kind: "task",
          title: "Decide final caterer headcount",
          pressure_family: "obligation",
          source_surface: "tasks",
          evidence_labels: ["final guest count decision"],
        }],
      },
    },
  });

  const focusCard = state?.cards.find((card) => card.label === "Needs your yes/no");
  assert.ok(focusCard);
  assert.match(focusCard.detail, /Focus on 2 wedding decisions now/);
  assert.match(focusCard.detail, /Decide final caterer headcount/);
  assert.match(focusCard.detail, /1 lower-priority decision kept in backlog/);
});

test("buildWeddingNavigationArrivalState surfaces expected behaviour audit task context", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    notice: "Opening wedding tasks and critical-path items.",
    metadata: {
      template: "wedding_planning",
      expected_behavior_audit: {
        ready_count: 5,
        blocked_count: 10,
        suggested_task_count: 8,
        blocked_capabilities: ["vendor_matching", "weather_contingency"],
        suggested_task_titles: [
          "Connect source-verified vendor search before presenting shortlist claims",
          "Connect verified weather contingency evidence",
        ],
        blocker_labels: [
          "Weather backup planning is connected to real forecast evidence: Needs BOM/weather provider evidence.",
        ],
      },
    },
  });

  const auditCard = state?.cards.find((card) => card.label === "Planning setup gaps");
  assert.ok(auditCard);
  assert.match(auditCard.detail, /5 ready checks/);
  assert.match(auditCard.detail, /10 planning gaps/);
  assert.match(auditCard.detail, /8 suggested tasks/);
  assert.match(auditCard.detail, /vendor matching, weather contingency/);
  assert.match(auditCard.detail, /Connect source-verified vendor search/);
  assert.match(state?.nextStep ?? "", /Review the suggested wedding gap tasks/);
});

test("buildWeddingNavigationArrivalState explains connected app provider setup context", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "connected_apps",
    surface: "connected_apps",
    artifactId: null,
    sectionId: null,
    notice: "Opening Connected Apps for wedding provider setup.",
    metadata: {
      template: "wedding_planning",
      provider_handoff_audit: {
        status: "external_provider_required",
        pending_count: 2,
        connected_count: 1,
        pending_capabilities: ["send_email", "publish_registry"],
        setup_views: ["gmail", "registry_provider"],
      },
    },
  });

  const providerCard = state?.cards.find((card) => card.label === "Connected apps");
  assert.equal(state?.badge, "Provider setup");
  assert.match(state?.headline ?? "", /provider setup/i);
  assert.match(state?.nextStep ?? "", /Connect missing providers/);
  assert.ok(providerCard);
  assert.match(providerCard.detail, /external provider required/);
  assert.match(providerCard.detail, /2 connected app setups still needed/);
  assert.match(providerCard.detail, /1 connected app ready/);
  assert.match(providerCard.detail, /send_email, publish_registry/);
  assert.match(providerCard.detail, /gmail, registry_provider/);
});

test("buildWeddingNavigationArrivalState surfaces graph focus packets", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "knowledge_graph",
    surface: "knowledge_graph",
    metadata: {
      template: "wedding_planning",
      graph_context: {
        recommendation_id: "wedding_recommendation:risk:no-backup",
        recommendation_kind: "risk",
        recommendation_title: "No wet-weather backup confirmed",
        source_node_ids: ["risk:no-backup", "artifact:venue"],
        edge_ids: ["edge:venue-risk"],
        next_action_label: "Confirm wet-weather backup before treating the venue plan as ready.",
      },
    },
  });

  const graphCard = state?.cards.find((card) => card.label === "Related details");
  assert.ok(graphCard);
  assert.match(graphCard.detail, /No wet-weather backup confirmed/);
  assert.match(graphCard.detail, /2 related details/);
  assert.match(graphCard.detail, /1 connection/);
  assert.match(graphCard.detail, /Confirm wet-weather backup/);
});

test("buildWeddingNavigationArrivalState surfaces continue-chat context packets", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "threads",
    surface: "continue_chat",
    metadata: {
      template: "wedding_planning",
      continue_context: {
        summaryLabel: "3 planning files",
        activeArtifact: { title: "Venue email" },
        decisionScopeLabels: ["Harbour Hall: selected waterfront venue"],
        importedArtifactCount: 1,
        importedReviewRequiredCount: 1,
      },
    },
  });

  const packetCard = state?.cards.find((card) => card.label === "Chat context");
  const decisionCard = state?.cards.find((card) => card.label === "Selected choice");
  const guidanceCard = state?.cards.find((card) => card.label === "How to use selected scope");
  assert.ok(packetCard);
  assert.match(packetCard.detail, /3 planning files/);
  assert.match(packetCard.detail, /Venue email/);
  assert.match(packetCard.detail, /1 imported private planning file/);
  assert.match(packetCard.detail, /1 import needs review before reuse/);
  assert.ok(decisionCard);
  assert.match(decisionCard.detail, /Harbour Hall/);
  assert.ok(guidanceCard);
  assert.match(guidanceCard.detail, /selected option/i);
  assert.match(state?.nextStep ?? "", /selected option first/i);
});

test("buildWeddingNavigationArrivalState surfaces workspace handoff packets", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      handoff_context: {
        version: 1,
        summaryLabel: "4 planning files",
        linkedCalendarCount: 2,
        linkedTaskCount: 3,
        decisionScopeCount: 1,
        sourceLinkedCount: 1,
        sourceLabelledCount: 2,
        sourceUnverifiedCount: 1,
        approvalPromptCount: 1,
        exportExcludedSensitiveCount: 2,
        importedArtifactCount: 1,
        importedHandoffReviewCount: 1,
        projectionPendingCount: 5,
      },
    },
  });

  const packetCard = state?.cards.find((card) => card.label === "Planning handoff");
  assert.ok(packetCard);
  assert.match(packetCard.detail, /4 planning files/);
  assert.match(packetCard.detail, /2 linked dates/);
  assert.match(packetCard.detail, /3 linked tasks/);
  assert.match(packetCard.detail, /1 selected decision scope/);
  assert.match(packetCard.detail, /1 source-linked file/);
  assert.match(packetCard.detail, /2 source-labelled files/);
  assert.match(packetCard.detail, /1 file needs a fact check/);
  assert.match(packetCard.detail, /1 approval prompt/);
  assert.match(packetCard.detail, /2 sensitive exports excluded by default/);
  assert.match(packetCard.detail, /1 imported private planning file in workspace/);
  assert.match(packetCard.detail, /1 imported file requires handoff review/);
  assert.match(packetCard.detail, /5 planning outputs waiting to be approved/);
});

test("buildWeddingNavigationArrivalState accepts generated provider handoff audit metadata", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "connected_apps",
    surface: "connected_apps",
    metadata: {
      template: "wedding_planning",
      provider_handoff_audit: {
        external_handoff_count: 3,
        pending_executor_count: 2,
        capabilities: ["send_email", "calendar"],
        setup_views: ["gmail", "google_calendar"],
      },
    },
  });

  const providerCard = state?.cards.find((card) => card.label === "Connected apps");
  assert.ok(providerCard);
  assert.match(providerCard.detail, /2 connected app setups still needed/);
  assert.match(providerCard.detail, /1 connected app ready/);
  assert.match(providerCard.detail, /send_email, calendar/);
  assert.match(providerCard.detail, /gmail, google_calendar/);
});

test("buildWeddingNavigationArrivalState surfaces structured selected decision scopes", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "knowledge_graph",
    surface: "knowledge_graph",
    metadata: {
      template: "wedding_planning",
      decision_scopes: [{
        artifact_title: "Venue shortlist",
        artifact_kind: "vendor_table",
        selected_option_label: "Harbour Hall",
        selected_option_detail: "Selected waterfront venue.",
      }],
    },
  });

  const decisionCard = state?.cards.find((card) => card.label === "Selected choice");
  const guidanceCard = state?.cards.find((card) => card.label === "How to use selected scope");
  assert.ok(decisionCard);
  assert.match(decisionCard.detail, /Harbour Hall from Venue shortlist/);
  assert.ok(guidanceCard);
  assert.match(guidanceCard.detail, /dependencies, missing evidence/i);
  assert.match(state?.nextStep ?? "", /selected option/i);
});

test("buildWeddingNavigationArrivalState redacts imported selected decision scope artifact titles", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "knowledge_graph",
    surface: "knowledge_graph",
    metadata: {
      template: "wedding_planning",
      decision_scopes: [{
        artifact_title: "Imported XLSX: private-family-budget.xlsx",
        artifact_kind: "budget_sheet",
        selected_option_label: "Garden Hall",
      }],
    },
  });
  const serialized = JSON.stringify(state);
  const decisionCard = state?.cards.find((card) => card.label === "Selected choice");

  assert.ok(decisionCard);
  assert.match(decisionCard.detail, /Garden Hall from Imported private planning file/);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("Imported XLSX"), false);
});

test("buildWeddingNavigationArrivalState gives task guidance for selected decision scopes", () => {
  const state = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "tasks",
    surface: "tasks",
    metadata: {
      template: "wedding_planning",
      decision_scopes: [{
        artifact_title: "Celebrant shortlist",
        artifact_kind: "vendor_table",
        selected_option_label: "Registry office celebrant",
      }],
    },
  });

  const guidanceCard = state?.cards.find((card) => card.label === "How to use selected scope");
  assert.ok(guidanceCard);
  assert.match(guidanceCard.detail, /close the loop for the selected option/i);
  assert.match(state?.nextStep ?? "", /selected-option tasks/i);
});

test("buildWeddingNavigationArrivalState gives approval and export safety warnings", () => {
  const approvalState = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "decision_queue",
    surface: "approval",
    notice: "Opening approval review for artifact_email.",
    artifactId: "artifact_email",
  });
  const exportState = buildWeddingNavigationArrivalState({
    ...baseIntent,
    view: "files",
    surface: "export",
    notice: "Opening export options for artifact_budget.",
  });

  assert.equal(approvalState?.badge, "Approval gate");
  assert.match(approvalState?.cards.find((card) => card.label === "What not to assume")?.detail ?? "", /explicitly approved/);
  assert.equal(exportState?.badge, "Export context");
  assert.match(exportState?.nextStep ?? "", /review sensitive files/);
});

test("buildWeddingNavigationArrivalState returns null without required intent context", () => {
  assert.equal(buildWeddingNavigationArrivalState(null), null);
  assert.equal(buildWeddingNavigationArrivalState(undefined), null);
  assert.equal(buildWeddingNavigationArrivalState({ ...baseIntent, weddingPlanId: "" }), null);
  assert.equal(buildWeddingNavigationArrivalState({ ...baseIntent, responseWorkspaceId: " " }), null);
});
