import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingArtifactSummary } from "../src/lib/weddingArtifactState.ts";
import { buildWeddingKnowledgeGraphState } from "../src/lib/weddingKnowledgeGraphState.ts";
import { buildWeddingRecommendationExplanationState } from "../src/lib/weddingRecommendationExplanationState.ts";
import { buildWeddingVendorPursuitClosureTaskItem } from "../src/lib/weddingBudgetTrackingState.ts";
import {
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  markWeddingProjectionSent,
} from "../src/lib/weddingCalendarProjectionState.ts";
import {
  markWeddingDecisionAfpProjectionSent,
} from "../src/lib/weddingDecisionAfpProjectionState.ts";
import {
  setWeddingDecisionSelection,
  setWeddingDecisionSelections,
} from "../src/lib/weddingDecisionSelectionState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import { buildWeddingTemplateFollowUpState } from "../src/lib/weddingTemplateFollowUpState.ts";
import { weddingVendorQuoteIncomingAfpMessage } from "../src/lib/weddingVendorQuoteReplyFlowState.ts";
import { buildWeddingVendorComparisonArtifactState } from "../src/lib/weddingVendorSearchArtifactState.ts";
import { runWeddingVendorSearchExecution } from "../src/lib/weddingVendorSearchExecutorState.ts";
import { buildWeddingVendorSearchReadinessState } from "../src/lib/weddingVendorSearchReadinessState.ts";
import {
  weddingArtifact as artifact,
  weddingMemoryStorage as memoryStorage,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

test("buildWeddingResponseWorkspaceViewState includes selected shortlist decisions in projection queue", () => {
  const storage = memoryStorage();
  setWeddingDecisionSelection("artifact:venue-shortlist", "0:harbour-house", storage);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "artifact:venue-shortlist",
    artifacts: [
      artifact({
        id: "artifact:venue-shortlist",
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: [
          "# Venue shortlist",
          "",
          "| Name | Location | Fit |",
          "| --- | --- | --- |",
          "| Harbour House | Sydney | Water view and indoor backup |",
          "| Garden Hall | Sydney | Lower cost but weather exposed |",
        ].join("\n"),
      }),
    ],
    projectionStorage: storage,
  });

  const decisionGroup = state.projectionQueue?.groups.find((group) => group.kind === "decision");
  assert.equal(decisionGroup?.label, "Decisions");
  assert.equal(decisionGroup?.pendingCount, 1);
  assert.equal(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) => input.type === "decision"), true);
});

test("buildWeddingResponseWorkspaceViewState projects selected top-three vendor comparison choices", async () => {
  const readiness = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["photographer"],
    vendorPreferences: "documentary style and transparent pricing",
    photographyScope: "day-of coverage and portraits",
    liveSearchProviderReady: true,
  });
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          photo_url: "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fphoto_abc&max_width_px=720",
          snippet: "Sydney documentary wedding photographer with transparent packages, portfolio, and date availability.",
          provider: "Brave Search",
        },
        {
          title: "Budget Lens",
          url: "https://budget-lens.example",
          snippet: "Wedding photography rates and simple packages for Sydney couples.",
          provider: "Brave Search",
        },
        {
          title: "Portrait Hall",
          url: "https://portrait-hall.example",
          snippet: "Editorial portraits and gallery reviews.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    budgetComfort: "balanced budget",
    vendorCategories: ["photographer"],
  });
  const comparisonArtifact = comparison.artifactInput;
  assert.ok(comparisonArtifact);

  const storage = memoryStorage();
  setWeddingDecisionSelections(comparisonArtifact.id, [
    "vendor_choice:harbour_studio:1",
    "vendor_choice:budget_lens:2",
  ], storage);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: comparisonArtifact.id,
    artifacts: [comparisonArtifact],
    projectionStorage: storage,
  });

  const decisionGroup = state.projectionQueue?.groups.find((group) => group.kind === "decision");
  const taskGroup = state.projectionQueue?.groups.find((group) => group.kind === "task");
  const decisionInputs = state.projectionQueue?.dispatchPayload?.sendInputs.filter((input) => input.type === "decision") ?? [];

  assert.equal(state.activePreview?.preview?.kind, "table");
  assert.equal(state.activePreview?.a2uiContent?.schema_version, "a2ui.v1");
  assert.equal(state.activePreview?.a2uiContent?.kind, "panel");
  assert.ok((state.activePreview?.a2uiContent?.nodes as Array<Record<string, unknown>> | undefined)?.some((node) =>
    node.type === "vendor_recommendation_cards"
  ));
  assert.ok((state.activePreview?.a2uiContent?.nodes as Array<Record<string, unknown>> | undefined)?.some((node) =>
    node.type === "comparison_table"
  ));
  const comparisonNode = (state.activePreview?.a2uiContent?.nodes as Array<Record<string, unknown>> | undefined)
    ?.find((node) => node.type === "comparison_table");
  const comparisonNodeProps = comparisonNode?.props as Record<string, unknown> | undefined;
  assert.ok(Array.isArray(comparisonNodeProps?.column_actions));
  assert.ok(JSON.stringify(comparisonNodeProps?.column_actions).includes("open_vendor_source"));
  assert.ok(Array.isArray(comparisonNodeProps?.footer_actions));
  assert.equal((comparisonNodeProps?.selection as Record<string, unknown> | undefined)?.mode, "multi");
  assert.match(state.activePreview?.vendorComparisonHandoff?.recommendationLabel ?? "", /Harbour Studio/i);
  assert.equal(state.activePreview?.vendorComparisonHandoff?.confidenceLabel, "Confidence: low");
  assert.ok(state.activePreview?.vendorComparisonHandoff?.whyLabels.some((label) => /source-backed vendors found/i.test(label)));
  assert.equal(
    state.activePreview?.vendorComparisonCards.find((card) => card.title === "Harbour Studio")?.imageUrl,
    "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fphoto_abc&max_width_px=720",
  );
  assert.equal(decisionGroup?.pendingCount, 2);
  assert.deepEqual(decisionInputs.map((input) => input.metadata?.selected_option_label), ["Harbour Studio", "Budget Lens"]);
  assert.deepEqual(decisionInputs[0]?.metadata?.source_provider_labels, ["Brave Search"]);
  assert.deepEqual(decisionInputs[0]?.metadata?.source_counts_by_provider, { "Brave Search": 3 });
  assert.ok(taskGroup?.items.some((item) =>
    /approval-gated quote request for Harbour Studio/i.test(item.title)
    && item.sendInput?.metadata?.approval_required_before_outreach === true
    && item.sendInput?.metadata?.no_external_send_without_approval === true
  ));
  assert.ok(taskGroup?.items.some((item) =>
    /approval-gated quote request for Budget Lens/i.test(item.title)
    && item.sendInput?.metadata?.approval_required_before_outreach === true
    && item.sendInput?.metadata?.no_external_send_without_approval === true
  ));
  assert.equal(taskGroup?.items.some((item) => /Portrait Hall/i.test(item.title)), false);
  assert.equal(taskGroup?.items.some((item) => /Choose preferred vendors from the top-three comparison/i.test(item.title)), false);
  assert.equal(taskGroup?.items.some((item) => /Prepare approval-gated vendor outreach and follow-up/i.test(item.title)), false);
  assert.ok(state.personalOsProjection.rankedItems.some((item) =>
    /Confirm selected wedding option: Harbour Studio/i.test(item.title)
  ));
  assert.equal(state.personalOsProjection.rankedItems.some((item) => /Portrait Hall/i.test(item.title)), false);
});

test("buildWeddingResponseWorkspaceViewState stops resaving selected vendor decisions after projection", async () => {
  const readiness = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["photographer"],
    vendorPreferences: "documentary style and transparent pricing",
    photographyScope: "day-of coverage and portraits",
    liveSearchProviderReady: true,
  });
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          snippet: "Sydney documentary wedding photographer with transparent packages, portfolio, and date availability.",
          provider: "Brave Search",
        },
        {
          title: "Budget Lens",
          url: "https://budget-lens.example",
          snippet: "Wedding photography rates and simple packages for Sydney couples.",
          provider: "Brave Search",
        },
        {
          title: "Portrait Hall",
          url: "https://portrait-hall.example",
          snippet: "Editorial portraits and gallery reviews.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    budgetComfort: "balanced budget",
    vendorCategories: ["photographer"],
  });
  const comparisonArtifact = comparison.artifactInput;
  assert.ok(comparisonArtifact);

  const storage = memoryStorage();
  setWeddingDecisionSelections(comparisonArtifact.id, [
    "vendor_choice:harbour_studio:1",
    "vendor_choice:budget_lens:2",
  ], storage);
  const openState = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: comparisonArtifact.id,
    artifacts: [comparisonArtifact],
    projectionStorage: storage,
  });
  const harbourDecision = openState.projectionQueue?.groups
    .find((group) => group.kind === "decision")
    ?.items.find((item) => /Harbour Studio/i.test(item.title));
  assert.ok(harbourDecision);
  markWeddingDecisionAfpProjectionSent(harbourDecision.sourceId, storage);

  const savedState = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: comparisonArtifact.id,
    artifacts: [comparisonArtifact],
    projectionStorage: storage,
  });
  const decisionGroup = savedState.projectionQueue?.groups.find((group) => group.kind === "decision");
  const taskGroup = savedState.projectionQueue?.groups.find((group) => group.kind === "task");
  const decisionInputs = savedState.projectionQueue?.dispatchPayload?.sendInputs.filter((input) => input.type === "decision") ?? [];

  assert.equal(decisionGroup?.pendingCount, 1);
  assert.equal(decisionGroup?.sentCount, 1);
  assert.deepEqual(decisionInputs.map((input) => input.metadata?.selected_option_label), ["Budget Lens"]);
  assert.ok(taskGroup?.items.some((item) => /approval-gated quote request for Harbour Studio/i.test(item.title)));
  assert.ok(taskGroup?.items.some((item) => /approval-gated quote request for Budget Lens/i.test(item.title)));
});

test("buildWeddingResponseWorkspaceViewState stops resaving selected vendor outreach tasks after projection", async () => {
  const readiness = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["photographer"],
    vendorPreferences: "documentary style and transparent pricing",
    photographyScope: "day-of coverage and portraits",
    liveSearchProviderReady: true,
  });
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          snippet: "Sydney documentary wedding photographer with transparent packages, portfolio, and date availability.",
          provider: "Brave Search",
        },
        {
          title: "Budget Lens",
          url: "https://budget-lens.example",
          snippet: "Wedding photography rates and simple packages for Sydney couples.",
          provider: "Brave Search",
        },
        {
          title: "Portrait Hall",
          url: "https://portrait-hall.example",
          snippet: "Editorial portraits and gallery reviews.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    budgetComfort: "balanced budget",
    vendorCategories: ["photographer"],
  });
  const comparisonArtifact = comparison.artifactInput;
  assert.ok(comparisonArtifact);

  const storage = memoryStorage();
  setWeddingDecisionSelections(comparisonArtifact.id, [
    "vendor_choice:harbour_studio:1",
    "vendor_choice:budget_lens:2",
  ], storage);
  const openState = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: comparisonArtifact.id,
    artifacts: [comparisonArtifact],
    projectionStorage: storage,
  });
  const harbourTask = openState.projectionQueue?.groups
    .find((group) => group.kind === "task")
    ?.items.find((item) => /approval-gated quote request for Harbour Studio/i.test(item.title));
  assert.ok(harbourTask);
  markWeddingProjectionSent(harbourTask.sourceId, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage);

  const savedState = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: comparisonArtifact.id,
    artifacts: [comparisonArtifact],
    projectionStorage: storage,
  });
  const taskGroup = savedState.projectionQueue?.groups.find((group) => group.kind === "task");
  const vendorOutreachItems = taskGroup?.items.filter((item) =>
    item.sendInput?.metadata?.vendor_outreach_from_selected_decision === true
    || /approval-gated quote request for (Harbour Studio|Budget Lens)/i.test(item.title)
  ) ?? [];
  const taskInputs = savedState.projectionQueue?.dispatchPayload?.sendInputs.filter((input) =>
    input.type === "task"
    && input.metadata?.vendor_outreach_from_selected_decision === true
  ) ?? [];

  assert.equal(vendorOutreachItems.filter((item) => item.status === "pending").length, 1);
  assert.equal(vendorOutreachItems.filter((item) => item.status === "sent").length, 1);
  assert.ok(vendorOutreachItems.some((item) =>
    /approval-gated quote request for Harbour Studio/i.test(item.title)
    && item.status === "sent"
    && item.sendInput === null
  ));
  assert.ok(vendorOutreachItems.some((item) =>
    /approval-gated quote request for Budget Lens/i.test(item.title)
    && item.status === "pending"
    && item.sendInput?.metadata?.vendor_outreach_from_selected_decision === true
  ));
  assert.deepEqual(taskInputs.map((input) => input.metadata?.vendor_outreach_vendor_label), ["Budget Lens"]);
});

test("buildWeddingResponseWorkspaceViewState drops closed selected vendors from active follow-up queue", async () => {
  const readiness = buildWeddingVendorSearchReadinessState({
    location: "Sydney",
    vendorCategories: ["photographer"],
    vendorPreferences: "documentary style and transparent pricing",
    photographyScope: "day-of coverage and portraits",
    liveSearchProviderReady: true,
  });
  const execution = await runWeddingVendorSearchExecution({
    readiness,
    mode: "live",
    providerLabel: "Brave Search",
    maxQueries: 1,
    port: (query) => ({
      ok: true,
      query,
      sources: [
        {
          title: "Harbour Studio",
          url: "https://harbour-studio.example",
          snippet: "Sydney documentary wedding photographer with transparent packages.",
          provider: "Brave Search",
        },
        {
          title: "Budget Lens",
          url: "https://budget-lens.example",
          snippet: "Wedding photography rates and simple packages for Sydney couples.",
          provider: "Brave Search",
        },
        {
          title: "Portrait Hall",
          url: "https://portrait-hall.example",
          snippet: "Editorial portraits and gallery reviews.",
          provider: "Brave Search",
        },
      ],
    }),
  });
  const comparison = buildWeddingVendorComparisonArtifactState({
    metadata,
    execution,
    preferences: "documentary style and transparent pricing",
    location: "Sydney",
    budgetComfort: "balanced budget",
    vendorCategories: ["photographer"],
  });
  const comparisonArtifact = comparison.artifactInput;
  assert.ok(comparisonArtifact);

  const storage = memoryStorage();
  setWeddingDecisionSelections(comparisonArtifact.id, [
    "vendor_choice:harbour_studio:1",
    "vendor_choice:budget_lens:2",
  ], storage);
  const openState = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: comparisonArtifact.id,
    artifacts: [comparisonArtifact],
    projectionStorage: storage,
  });
  const budgetLens = openState.budgetTracking.lineItems.find((item) => item.vendorName === "Budget Lens");
  assert.ok(budgetLens);
  const closure = buildWeddingVendorPursuitClosureTaskItem({
    lineItem: budgetLens,
    metadata,
    reason: "not_suitable",
    note: "The style is less aligned than Harbour Studio.",
    closedAt: "2026-09-28T00:00:00.000Z",
  });

  const closedState = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: comparisonArtifact.id,
    artifacts: [comparisonArtifact],
    projectionStorage: storage,
    taskItems: [closure],
  });
  const taskGroup = closedState.projectionQueue?.groups.find((group) => group.kind === "task");

  assert.ok(taskGroup?.items.some((item) => /approval-gated quote request for Harbour Studio/i.test(item.title)));
  assert.equal(taskGroup?.items.some((item) => /Budget Lens/i.test(item.title)), false);
  assert.equal(taskGroup?.items.some((item) => /Stopped pursuing Budget Lens/i.test(item.title)), false);
  assert.equal(closedState.personalOsProjection.rankedItems.some((item) => /Budget Lens/i.test(item.title)), false);
  assert.ok(closedState.vendorPursuitLogTaskItems.some((item) =>
    /Stopped pursuing Budget Lens/i.test(item.title)
    && record(item.metadata).vendor_outreach_pursuit_status === "not_pursuing"
  ));
  assert.equal(closedState.vendorPursuitLogCards.length, 1);
  assert.equal(closedState.vendorPursuitLogCards[0]?.vendorLabel, "Budget Lens");
  assert.equal(closedState.vendorPursuitLogCards[0]?.reasonLabel, "Not suitable");
  assert.equal(closedState.vendorPursuitLogCards[0]?.closedAtLabel, "Closed 2026-09-28");
  assert.equal(closedState.planningTaskItems.some((item) => /Stopped pursuing Budget Lens/i.test(item.title)), false);
});

test("buildWeddingResponseWorkspaceViewState projects committed preparation task alerts as calendar reminders", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    taskItems: [{
      id: "prep-cake",
      title: "Book cake baker",
      kind: "cake",
      dueAt: "2027-07-20T10:00:00.000Z",
      dueLabel: "6-9 months out",
      priority: "high",
      metadata: {
        ...metadata,
        preparation_checklist: true,
        preparation_checklist_item: "cake",
        alert_offset_days: [60, 30, 14],
        alert_dates: ["2027-05-21", "2027-06-20", "2027-07-06"],
      },
    }],
    projectionStorage: memoryStorage(),
  });

  const calendarGroup = state.projectionQueue?.groups.find((group) => group.kind === "calendar_event");
  assert.equal(calendarGroup?.pendingCount, 3);
  assert.equal(
    calendarGroup?.items.some((item) => item.title === "Reminder: Book cake baker"),
    true,
  );
  assert.equal(
    state.projectionQueue?.dispatchPayload?.sendInputs.filter((input) => input.type === "calendar_event").length,
    3,
  );
  assert.equal(
    state.ganttTimeline.rows.some((item) => item.id === "wedding_calendar:task-alert:prep-cake:2027-06-20"),
    true,
  );
});

test("buildWeddingResponseWorkspaceViewState updates budget tracking from selected vendor decisions", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    decisionRecords: [
      {
        id: "decision:photographer",
        artifactId: "artifact:photographer-shortlist",
        artifactTitle: "Photographer shortlist",
        artifactKind: "vendor_table",
        selectedOptionId: "0:harbour-photos",
        selectedOptionLabel: "Harbour Photos",
        selectedOptionDetail: "Projected package $4,000-$5,000; request current quote",
        selectedOptionCells: ["Harbour Photos", "Photographer", "$4,000-$5,000", "Projected package"],
        createdAt: "2026-09-14T00:00:00.000Z",
        source: "local_selection",
        metadataLabels: [],
      },
      {
        id: "decision:venue",
        artifactId: "artifact:venue-shortlist",
        artifactTitle: "Venue shortlist",
        artifactKind: "vendor_table",
        selectedOptionId: "0:garden-hall",
        selectedOptionLabel: "Garden Hall",
        selectedOptionDetail: "Quoted package AUD 12,000 including ceremony room",
        selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000", "Contract quote"],
        createdAt: "2026-09-14T00:00:00.000Z",
        source: "local_selection",
        metadataLabels: [],
      },
    ],
  });

  assert.equal(state.budgetTracking.lineItems.length, 2);
  assert.equal(state.budgetTracking.totalProjectedAmount, 4500);
  assert.equal(state.budgetTracking.totalQuotedAmount, 12000);
  assert.equal(state.budgetTracking.totalKnownAmount, 16500);
  assert.ok(state.budgetTracking.warningLabels.some((label) => /still projected/i.test(label)));
});

test("buildWeddingResponseWorkspaceViewState sanitizes selected decision source URLs in reusable context", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:venue-shortlist",
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: "# Venue shortlist\n\nHarbour Hall",
      }),
    ],
    decisionRecords: [{
      id: "decision:venue",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "0:harbour-hall",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Venue", "Sydney"],
      sourceLabels: ["Mixed source packet"],
      sourceUrls: [
        "javascript:alert(1)",
        "not-a-url",
        "http://localhost:8787/venue",
        "https://127.0.0.1/venue",
        "https://example.com/venue",
      ],
      sourceProviderLabels: ["manual_review"],
      createdAt: "2026-09-14T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
  });
  const continueAction = state.sidebarActions.find((action) => action.kind === "continue_chat");
  const scopes = continueAction?.metadata?.decision_scopes as Array<Record<string, unknown>> | undefined;

  assert.deepEqual(state.activePreview?.persistedSelectedVendorChoices, [{
    optionId: "0:harbour-hall",
    label: "Harbour Hall",
  }]);
  assert.deepEqual(scopes?.[0]?.source_urls, ["https://example.com/venue"]);
  assert.match(state.bundleExportPayload.content, /1 source web link/);
  assert.doesNotMatch(state.bundleExportPayload.content, /javascript:alert/);
  assert.doesNotMatch(state.bundleExportPayload.content, /not-a-url/);
  assert.doesNotMatch(state.bundleExportPayload.content, /localhost/);
  assert.doesNotMatch(state.bundleExportPayload.content, /127\.0\.0\.1/);
});
