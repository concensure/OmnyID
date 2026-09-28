import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingSemanticSurfaceState,
  weddingSemanticObjectFromDecisionProjection,
  weddingSemanticObjectFromNeedToKnowContext,
  weddingSemanticObjectFromPreferenceConflictState,
  weddingSemanticObjectFromPlanningThreadItem,
  weddingSemanticObjectFromRecoveryState,
  weddingSemanticObjectFromResilienceCard,
  weddingSemanticSurfacePrimitiveFromObject,
  weddingSemanticUiObjectFromUnknown,
  weddingSemanticUiObjectsFromAfpLikeMessage,
} from "../src/lib/weddingSemanticUiState.ts";

test("weddingSemanticObjectFromResilienceCard keeps conflict meaning separate from layout", () => {
  const object = weddingSemanticObjectFromResilienceCard({
    id: "resilience:guest-scale",
    title: "Wedding scale: values to balance",
    detailLabel: "Do not average this decision.",
    statusLabel: "OmnyID found different preferences without averaging them.",
    tone: "review",
    comparisonPreview: {
      title: "Ways through",
      columns: [
        { label: "Option", kind: "option" },
        { label: "Next step", kind: "action" },
      ],
      rows: [{ id: "compromise:1", cells: ["Larger guest list, smaller-feeling experience", "Review together"] }],
    },
    primaryAction: {
      label: "Review values",
      kind: "open_workspace_menu",
      enabled: true,
      metadata: { wedding_workspace_menu: "home" },
    },
    secondaryAction: {
      label: "Review later",
      kind: "defer_decision",
      enabled: true,
      metadata: null,
    },
  });

  assert.equal(object.kind, "wedding_conflict");
  assert.equal(object.comparison?.columns[1]?.kind, "action");
  assert.deepEqual(object.semanticTags, [
    "wedding_conflict",
    "wedding_comparison",
    "wedding_approval_required",
  ]);
  assert.equal(object.actions[0]?.targetMenu, "home");
});

test("weddingSemanticObjectFromResilienceCard maps recovery previews to active loops", () => {
  const object = weddingSemanticObjectFromResilienceCard({
    id: "resilience:photographer",
    title: "Photographer cancelled",
    detailLabel: "Choose one replacement photographer to contact first.",
    statusLabel: "OmnyID found a disruption and prepared next steps.",
    tone: "urgent",
    comparisonPreview: {
      title: "Replacement shortlist",
      columns: [
        { label: "Option", kind: "option" },
        { label: "Price", kind: "price" },
        { label: "Next step", kind: "action" },
      ],
      rows: [{ id: "vendor:aurora", cells: ["Aurora", "$4,800", "Compare portfolio"] }],
    },
    primaryAction: {
      label: "Compare replacements",
      kind: "open_workspace_menu",
      enabled: true,
      metadata: { wedding_workspace_menu: "response_queue" },
    },
    secondaryAction: {
      label: "Review later",
      kind: "defer_decision",
      enabled: true,
      metadata: null,
    },
  });

  assert.equal(object.kind, "wedding_active_loop");
  assert.equal(object.tone, "risk");
  assert.ok(object.semanticTags.includes("wedding_comparison"));
  assert.equal(object.actions[0]?.targetMenu, "response_queue");
});

test("weddingSemanticObjectFromPlanningThreadItem classifies homepage work by meaning", () => {
  assert.equal(weddingSemanticObjectFromPlanningThreadItem({
    id: "top-decisions",
    title: "2 decisions",
    detail: "Choices waiting for the couple.",
    menuId: "home",
    actionLabel: "Review top decisions",
    stateLabel: "Needs your choice",
    stateTone: "action",
  }).kind, "wedding_decision");

  assert.equal(weddingSemanticObjectFromPlanningThreadItem({
    id: "budget-risk",
    title: "Budget needs review",
    detail: "$1,500 is over the current target.",
    menuId: "budget",
    actionLabel: "Open budget",
    stateLabel: "High risk",
    stateTone: "risk",
  }).kind, "wedding_budget_impact");

  assert.equal(weddingSemanticObjectFromPlanningThreadItem({
    id: "vendor-follow-ups",
    title: "2 vendor follow-ups",
    detail: "Vendor outreach needs a reply.",
    menuId: "response_queue",
    actionLabel: "Open follow-ups",
    stateLabel: "No response / high risk",
    stateTone: "risk",
  }).kind, "wedding_external_wait");
});

test("weddingSemanticObjectFromDecisionProjection preserves selected option meaning", () => {
  const object = weddingSemanticObjectFromDecisionProjection({
    id: "decision:photo:aurora",
    artifactTitle: "Photography shortlist",
    selectedOption: {
      label: "Aurora Weddings",
      detail: "Photography - $4,800 - Available",
    },
    columnCells: [
      { label: "Option", kind: "option", value: "Aurora Weddings" },
      { label: "Price", kind: "price", value: "$4,800" },
      { label: "Availability", kind: "availability", value: "Available" },
    ],
    reportScope: {
      status: "scoped_ready",
      nextActionLabels: ["Generate follow-up reports from the selected option first."],
    },
  });

  assert.equal(object.kind, "wedding_decision");
  assert.equal(object.stateLabel, "Ready for follow-up");
  assert.deepEqual(object.comparison?.columns.map((column) => column.kind), ["option", "price", "availability"]);
  assert.deepEqual(object.comparison?.rows[0]?.cells, ["Aurora Weddings", "$4,800", "Available"]);
  assert.equal(object.actions[0]?.label, "Generate follow-up reports from the selected option first.");
  assert.ok(object.semanticTags.includes("wedding_approval_required"));
});

test("weddingSemanticObjectFromPreferenceConflictState emits conflict semantics", () => {
  const object = weddingSemanticObjectFromPreferenceConflictState({
    status: "conflict",
    decisionArea: "wedding scale",
    summaryLabel: "Do not average this decision.",
    conflictObject: {
      id: "conflict:scale",
      title: "Wedding scale: values to balance",
    },
    compromiseOptions: [{
      id: "option:larger-small-feel",
      title: "Larger guest list, smaller-feeling experience",
      satisfiesValues: ["meaningful interaction", "family inclusion"],
      tradeoffLabels: ["Higher catering load"],
    }],
  });

  assert.equal(object.kind, "wedding_conflict");
  assert.equal(object.actions[0]?.label, "Review values");
  assert.equal(object.comparison?.columns[3]?.kind, "action");
  assert.equal(object.comparison?.rows[0]?.cells[3], "Review together");
});

test("weddingSemanticObjectFromRecoveryState emits active-loop semantics", () => {
  const object = weddingSemanticObjectFromRecoveryState({
    recoveryPlanObject: {
      id: "recovery:photographer",
      title: "Recovery plan for photographer",
    },
    disruptionObject: {
      title: "Photographer cancelled",
      severity: "urgent",
    },
    decisionNeededLabel: "Choose one replacement photographer to contact first.",
    shortlist: [{
      id: "vendor:aurora",
      label: "Aurora Documentary Weddings",
      priceEstimate: 4800,
      fitLabels: ["documentary"],
      availableOnDate: true,
    }],
  });

  assert.equal(object.kind, "wedding_active_loop");
  assert.equal(object.tone, "risk");
  assert.deepEqual(object.comparison?.rows[0]?.cells, [
    "Aurora Documentary Weddings",
    "$4,800",
    "documentary",
    "Available",
    "Compare portfolio",
  ]);
  assert.equal(object.actions[0]?.targetMenu, "response_queue");
});

test("weddingSemanticObjectFromNeedToKnowContext emits context loop semantics", () => {
  const needsAnswer = weddingSemanticObjectFromNeedToKnowContext({
    id: "wedding_need_to_know:workspace",
    readyForFirstRecommendations: false,
    answeredLabels: ["Date: 2027-10-03"],
    nextQuestionLabel: "Which city should I plan around?",
  });
  const ready = weddingSemanticObjectFromNeedToKnowContext({
    id: "wedding_need_to_know:workspace",
    readyForFirstRecommendations: true,
    answeredLabels: ["Date: 2027-10-03", "Location: Sydney", "Budget: Mid-range"],
    nextQuestionLabel: "Ready to generate recommendations.",
  });

  assert.equal(needsAnswer.kind, "wedding_active_loop");
  assert.equal(needsAnswer.stateLabel, "Needs one answer");
  assert.equal(needsAnswer.actions[0]?.kind, "answer_wedding_context");
  assert.ok(needsAnswer.semanticTags.includes("wedding_context_needed"));
  assert.equal(ready.stateLabel, "Ready for first recommendations");
  assert.equal(ready.actions[0]?.kind, "generate_wedding_recommendations");
  assert.ok(ready.semanticTags.includes("wedding_recommendations_ready"));
});

test("weddingSemanticSurfacePrimitiveFromObject maps meaning to product-owned primitives", () => {
  const decision = weddingSemanticObjectFromDecisionProjection({
    id: "decision:venue:harbour",
    artifactTitle: "Venue shortlist",
    selectedOption: {
      label: "Harbour House",
      detail: "Water view and indoor backup.",
    },
    columnCells: [
      { label: "Option", kind: "option", value: "Harbour House" },
      { label: "Availability", kind: "availability", value: "Available" },
    ],
    reportScope: {
      status: "scoped_ready",
      nextActionLabels: ["Draft venue follow-up."],
    },
  });
  const waiting = weddingSemanticObjectFromPlanningThreadItem({
    id: "vendor-follow-ups",
    title: "2 vendor follow-ups",
    detail: "Vendor outreach needs a reply.",
    menuId: "response_queue",
    actionLabel: "Open follow-ups",
    stateLabel: "No response / high risk",
    stateTone: "risk",
  });
  const budget = weddingSemanticObjectFromPlanningThreadItem({
    id: "budget-risk",
    title: "Budget needs review",
    detail: "$1,500 is over the current target.",
    menuId: "budget",
    actionLabel: "Open budget",
    stateLabel: "High risk",
    stateTone: "risk",
  });
  const conflict = weddingSemanticObjectFromPreferenceConflictState({
    status: "conflict",
    decisionArea: "guest count",
    summaryLabel: "Balance intimacy and family inclusion.",
    conflictObject: {
      id: "conflict:guest-count",
      title: "Guest count: values to balance",
    },
    compromiseOptions: [],
  });

  assert.equal(weddingSemanticSurfacePrimitiveFromObject(decision).primitiveKind, "decision_comparison");
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(decision).label, "Decision to review");
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(decision).requiresApproval, true);
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(waiting).primitiveKind, "waiting_dependency");
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(waiting).label, "Waiting on someone");
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(budget).primitiveKind, "budget_delta");
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(budget).label, "Budget impact");
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(conflict).primitiveKind, "conflict_resolution");
  assert.equal(weddingSemanticSurfacePrimitiveFromObject(conflict).label, "Values to balance");
});

test("buildWeddingSemanticSurfaceState makes semantic objects canonical over renderer hints", () => {
  const object = weddingSemanticObjectFromNeedToKnowContext({
    id: "wedding_need_to_know:workspace",
    readyForFirstRecommendations: true,
    answeredLabels: ["Date: 2027-10-03", "Location: Sydney"],
    nextQuestionLabel: "Ready to generate recommendations.",
  });
  const semantic = buildWeddingSemanticSurfaceState({
    semanticObjects: [object],
    rendererFormatHint: "generative_card",
  });
  const fallback = buildWeddingSemanticSurfaceState({
    semanticObjects: [],
    rendererFormatHint: "a2ui.v1",
  });

  assert.equal(semantic.source, "semantic");
  assert.equal(semantic.ignoredRendererFormat, "generative_card");
  assert.equal(semantic.primitives[0]?.primitiveKind, "progress_loop");
  assert.equal(fallback.source, "fallback");
  assert.equal(fallback.ignoredRendererFormat, null);
  assert.match(fallback.fallbackReason ?? "", /a2ui\.v1/);
});

test("weddingSemanticUiObjectFromUnknown normalizes external semantic objects safely", () => {
  const object = weddingSemanticUiObjectFromUnknown({
    id: "semantic:vendor-wait",
    kind: "wedding_external_wait",
    title: "Waiting for caterer reply",
    state_label: "No response yet",
    tone: "risk",
    summary: "The caterer has not replied.",
    semantic_tags: ["vendor", "wedding_external_wait"],
    comparison: {
      title: "Reply options",
      columns: [
        { label: "Option", kind: "option" },
        { label: "", kind: "ignored" },
        { label: "Next step" },
      ],
      rows: [
        { id: "row:a", cells: ["Call caterer", "Approve follow-up"] },
        { id: "", cells: ["Wait one more day", "Review tomorrow"] },
        { id: "empty", cells: [] },
      ],
    },
    actions: [{
      label: "Open follow-ups",
      kind: "open_wedding_menu",
      enabled: true,
      target_menu: "response_queue",
    }],
  });

  assert.equal(object?.kind, "wedding_external_wait");
  assert.equal(object?.stateLabel, "No response yet");
  assert.deepEqual(object?.comparison?.columns.map((column) => column.kind), ["option", "text"]);
  assert.deepEqual(object?.comparison?.rows.map((row) => row.id), ["row:a", "row:2"]);
  assert.equal(object?.actions[0]?.targetMenu, "response_queue");
  assert.ok(object?.semanticTags.includes("wedding_external_wait"));
  assert.equal(weddingSemanticUiObjectFromUnknown({ kind: "table", id: "bad", title: "Bad" }), null);
});

test("weddingSemanticUiObjectsFromAfpLikeMessage extracts content metadata and view semantics", () => {
  const objects = weddingSemanticUiObjectsFromAfpLikeMessage({
    content: {
      semantic_object: {
        id: "semantic:content",
        kind: "wedding_active_loop",
        title: "Wedding basics",
        stateLabel: "Needs one answer",
      },
    },
    metadata: {
      semantic_object: {
        id: "semantic:metadata",
        kind: "wedding_budget_impact",
        title: "Budget changed",
        stateLabel: "Review impact",
      },
    },
    views: [{
      format: "a2ui",
      content: {
        semantic_objects: [{
          id: "semantic:view",
          kind: "wedding_conflict",
          title: "Guest count values",
          stateLabel: "Review together",
        }],
      },
    }],
  });

  assert.deepEqual(objects.map((object) => object.id), [
    "semantic:content",
    "semantic:metadata",
    "semantic:view",
  ]);
});
