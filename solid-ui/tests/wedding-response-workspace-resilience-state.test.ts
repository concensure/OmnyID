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
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import { weddingResponseWorkspaceMetadata as metadata } from "./wedding-response-workspace-fixtures.ts";

function conflictMessage() {
  return weddingPreferenceConflictToAfpMessage(buildWeddingPreferenceConflictState({
    metadata,
    decisionArea: "wedding scale",
    preferences: [
      { personLabel: "Claire", preferenceLabel: "40 guests", underlyingValue: "meaningful interaction", strength: 0.91 },
      { personLabel: "James", preferenceLabel: "120 guests", underlyingValue: "family inclusion", strength: 0.88 },
    ],
  }), "2026-09-27T00:00:00.000Z");
}

function recoveryMessage() {
  return weddingRealityChangeRecoveryToAfpMessage(buildWeddingRealityChangeRecoveryState({
    metadata,
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
}

test("buildWeddingResponseWorkspaceViewState exposes resilience display cards from AFP messages", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    afpMessages: [conflictMessage(), recoveryMessage()],
  });

  assert.equal(state.resilience.cards.length, 2);
  assert.equal(state.resilience.hasUrgentItem, true);
  assert.ok(state.resilience.cards.some((card) => card.primaryAction.label === "Review values"));
  assert.ok(state.resilience.cards.some((card) => card.primaryAction.label === "Compare replacements"));
  assert.ok(state.resilience.cards.every((card) => !/afp|ledger|projection/i.test([
    card.title,
    card.eyebrowLabel,
    card.detailLabel,
    card.statusLabel,
    card.evidenceLabel,
    card.primaryAction.label,
    card.secondaryAction.label,
  ].join(" "))));
});

test("buildWeddingResponseWorkspaceViewState keeps resilience quiet without AFP resilience messages", () => {
  const state = buildWeddingResponseWorkspaceViewState({ metadata });

  assert.deepEqual(state.resilience.cards, []);
  assert.equal(state.resilience.reviewAllAction.enabled, false);
  assert.match(state.resilience.emptyLabel ?? "", /one clear next step/i);
});
