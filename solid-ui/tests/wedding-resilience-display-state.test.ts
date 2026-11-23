import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingPreferenceConflictToAfpMessage,
} from "../src/lib/weddingPreferenceConflictAfpProjectionState.ts";
import { buildWeddingPreferenceConflictState } from "../src/lib/weddingPreferenceConflictState.ts";
import {
  weddingRealityChangeRecoveryToAfpMessage,
} from "../src/lib/weddingRealityChangeRecoveryAfpProjectionState.ts";
import { buildWeddingRealityChangeRecoveryState } from "../src/lib/weddingRealityChangeRecoveryState.ts";
import {
  buildWeddingResilienceDisplayState,
} from "../src/lib/weddingResilienceDisplayState.ts";
import { buildWeddingResilienceLedgerState } from "../src/lib/weddingResilienceLedgerState.ts";

function ledgerState() {
  const conflict = weddingPreferenceConflictToAfpMessage(buildWeddingPreferenceConflictState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    decisionArea: "wedding scale",
    preferences: [
      { personLabel: "Claire", preferenceLabel: "40 guests", underlyingValue: "meaningful interaction", strength: 0.91 },
      { personLabel: "James", preferenceLabel: "120 guests", underlyingValue: "family inclusion", strength: 0.88 },
    ],
  }), "2026-09-27T00:00:00.000Z");
  const recovery = weddingRealityChangeRecoveryToAfpMessage(buildWeddingRealityChangeRecoveryState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    disruptionText: "The photographer cancelled.",
    vendorName: "Northlight Studio",
    vendorCategory: "photographer",
    contractText: "Deposit $1200 refundable if supplier cancels.",
    originalPreferenceText: "candid documentary photography",
    budgetLimit: 5_000,
    replacementCandidates: [{
      id: "vendor:aurora",
      label: "Aurora Documentary Weddings",
      availableOnDate: true,
      priceEstimate: 4_800,
      fitLabels: ["documentary"],
      sourceLabel: "Google Places",
    }],
  }), "2026-09-27T00:02:00.000Z");
  return buildWeddingResilienceLedgerState({ messages: [conflict, recovery] });
}

test("buildWeddingResilienceDisplayState creates calm user-facing cards", () => {
  const display = buildWeddingResilienceDisplayState(ledgerState());

  assert.equal(display.title, "Changes and disagreements");
  assert.equal(display.cards.length, 2);
  assert.equal(display.emptyLabel, null);
  assert.equal(display.hasUrgentItem, true);
  assert.equal(display.shouldShow, true);
  assert.equal(display.a2ui.kind, "wedding_resilience_chain");
  const a2uiCards = display.a2ui.cards as Array<Record<string, unknown>>;
  assert.equal(a2uiCards.length, 2);
  assert.ok(a2uiCards.every((card) => card.has_inline_action === true));
  const semanticObjects = display.a2ui.semantic_objects as Array<Record<string, unknown>>;
  assert.ok(semanticObjects.some((object) => object.kind === "wedding_conflict"));
  assert.ok(semanticObjects.some((object) => object.kind === "wedding_active_loop"));
  assert.ok(semanticObjects.every((object) => Array.isArray(object.semanticTags)));
  assert.equal(display.semanticSurface.source, "semantic");
  assert.equal(display.semanticSurface.ignoredRendererFormat, "a2ui.v1");
  assert.ok(display.semanticSurface.primitives.some((primitive) => primitive.primitiveKind === "conflict_resolution"));
  assert.ok(display.semanticSurface.primitives.some((primitive) => primitive.primitiveKind === "decision_comparison"));
  assert.ok(display.cards.every((card) => !/afp|ledger|subtype|projection/i.test([
    card.eyebrowLabel,
    card.detailLabel,
    card.statusLabel,
    card.evidenceLabel,
  ].join(" "))));
  assert.ok(display.cards.every((card) => !/\bstring\b|secured/i.test([
    card.eyebrowLabel,
    card.detailLabel,
    card.statusLabel,
    card.evidenceLabel,
    card.primaryAction.label,
    card.secondaryAction.label,
  ].join(" "))));
});

test("buildWeddingResilienceDisplayState exposes recovery card actions", () => {
  const display = buildWeddingResilienceDisplayState(ledgerState());
  const recoveryCard = display.cards.find((card) => card.eyebrowLabel === "Change to handle now");

  assert.ok(recoveryCard);
  assert.equal(recoveryCard.tone, "urgent");
  assert.equal(recoveryCard.primaryAction.kind, "open_workspace_menu");
  assert.equal(recoveryCard.primaryAction.label, "Compare replacements");
  assert.equal(recoveryCard.primaryAction.metadata?.wedding_workspace_menu, "response_queue");
  assert.equal(recoveryCard.secondaryAction.kind, "defer_decision");
  assert.match(recoveryCard.evidenceLabel, /Northlight Studio/);
  assert.equal(recoveryCard.comparisonPreview?.title, "Replacement shortlist");
  assert.deepEqual(recoveryCard.comparisonPreview?.columns.map((column) => column.label), ["Option", "Price", "Style match", "Availability", "Next step"]);
  assert.deepEqual(recoveryCard.comparisonPreview?.columns.map((column) => column.kind), ["option", "price", "style_match", "availability", "action"]);
  assert.equal(recoveryCard.hasInlineAction, true);
  assert.deepEqual(recoveryCard.comparisonPreview?.rows[0]?.cells, [
    "Aurora Documentary Weddings",
    "$4,800",
    "documentary",
    "Available",
    "Compare portfolio",
  ]);
  assert.deepEqual(
    (recoveryCard.primaryAction.metadata?.wedding_resilience as Record<string, unknown>).comparison_preview,
    recoveryCard.comparisonPreview,
  );
  assert.deepEqual(recoveryCard.flowSteps.map((step) => step.label), [
    "Change found",
    "Compare options",
    "Compare replacements",
    "Approve before sending",
  ]);
  assert.deepEqual(recoveryCard.flowSteps.map((step) => step.tone), [
    "risk",
    "options",
    "action",
    "action",
  ]);
  assert.deepEqual(recoveryCard.chainPanels.map((panel) => panel.label), [
    "Compare",
    "Decide",
    "Approve",
  ]);
  assert.equal(recoveryCard.chainPanels[0]?.tone, "options");
  assert.match(recoveryCard.chainPanels[0]?.detail ?? "", /Aurora Documentary Weddings/);
  assert.equal(recoveryCard.chainPanels[1]?.tone, "action");
  assert.match(recoveryCard.chainPanels[1]?.detail ?? "", /replacement photographer/i);
  assert.equal(recoveryCard.chainPanels[2]?.tone, "approval");
});

test("buildWeddingResilienceDisplayState explains preference conflicts without averaging", () => {
  const display = buildWeddingResilienceDisplayState(ledgerState());
  const conflictCard = display.cards.find((card) => card.eyebrowLabel === "Preference to align");

  assert.ok(conflictCard);
  assert.equal(conflictCard.tone, "review");
  assert.equal(conflictCard.primaryAction.label, "Review values");
  assert.deepEqual(conflictCard.lifecycleActions.map((action) => action.label), ["Resolved together", "Not a conflict"]);
  assert.ok(conflictCard.lifecycleActions.every((action) => action.kind === "record_resilience_lifecycle"));
  assert.match(conflictCard.statusLabel, /without averaging/i);
  assert.match(conflictCard.evidenceLabel, /meaningful interaction/);
  assert.equal(conflictCard.comparisonPreview?.title, "Ways through");
  assert.deepEqual(conflictCard.comparisonPreview?.columns.map((column) => column.label), ["Option", "Protects", "Trade-off", "Next step"]);
  assert.deepEqual(conflictCard.comparisonPreview?.columns.map((column) => column.kind), ["option", "text", "text", "action"]);
  assert.equal(conflictCard.hasInlineAction, true);
  assert.match(conflictCard.comparisonPreview?.rows[0]?.cells[0] ?? "", /Larger guest list/i);
  assert.equal(conflictCard.comparisonPreview?.rows[0]?.cells[3], "Review together");
  assert.deepEqual(conflictCard.flowSteps.map((step) => step.label), [
    "Values differ",
    "Compare compromises",
    "Review values",
    "Save decision",
  ]);
  assert.deepEqual(conflictCard.chainPanels.map((panel) => panel.label), [
    "Compare",
    "Decide",
    "Approve",
  ]);
  assert.equal(conflictCard.chainPanels[0]?.tone, "options");
  assert.match(conflictCard.chainPanels[0]?.detail ?? "", /meaningful interaction/);
  assert.equal(conflictCard.chainPanels[1]?.tone, "action");
  assert.match(conflictCard.chainPanels[1]?.detail ?? "", /Invite the wider family/i);
});

test("buildWeddingResilienceDisplayState keeps empty state actionable but quiet", () => {
  const display = buildWeddingResilienceDisplayState(buildWeddingResilienceLedgerState({ messages: [] }));

  assert.deepEqual(display.cards, []);
  assert.equal(display.reviewAllAction.enabled, false);
  assert.equal(display.shouldShow, false);
  assert.equal(display.semanticSurface.source, "fallback");
  assert.equal(display.semanticSurface.primitives.length, 0);
  assert.match(display.summaryLabel, /No wedding changes/i);
  assert.match(display.emptyLabel ?? "", /one clear next step/i);
});
