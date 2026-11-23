import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingPreferenceConflictState } from "../src/lib/weddingPreferenceConflictState.ts";

test("buildWeddingPreferenceConflictState preserves partner preferences instead of averaging guest count", () => {
  const state = buildWeddingPreferenceConflictState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    decisionArea: "wedding scale",
    preferences: [
      {
        personId: "person:claire",
        personLabel: "Claire",
        preferenceLabel: "40 guests, intimate",
        strength: 0.91,
        underlyingValue: "meaningful interaction",
      },
      {
        personId: "person:james",
        personLabel: "James",
        preferenceLabel: "120 guests, huge celebration",
        strength: 0.88,
        underlyingValue: "family inclusion",
      },
    ],
  });

  assert.equal(state.status, "conflict");
  assert.equal(state.conflictAxis, "guest_count");
  assert.match(state.summaryLabel, /Do not average/i);
  assert.equal(state.preferenceSignals.length, 2);
  assert.equal(state.preferenceSignals[0]?.kind, "wedding_preference_signal");
  assert.equal(state.preferenceSignals[0]?.visibility, "couple_only");
  assert.equal(state.conflictObject?.kind, "wedding_preference_conflict");
  assert.deepEqual(state.conflictObject?.underlyingValueLabels, ["meaningful interaction", "family inclusion"]);
  assert.ok(state.conflictObject?.references.some((ref) => ref.type === "balances_preference"));
  assert.ok(state.compromiseOptions[0]?.plainLanguage.includes("wider family"));
  assert.ok(state.approvalGateLabel?.includes("Both partners"));
  assert.equal(state.a2ui.kind, "wedding_preference_conflict");
  assert.equal(state.interventionPresentation.title, "wedding scale: values to balance");
  assert.deepEqual(state.interventionPresentation.reasonLabels, ["meaningful interaction", "family inclusion"]);
  assert.equal(state.interventionPresentation.constraintLabels?.length, 2);
  assert.equal(
    (state.a2ui.presentation as { verificationLabel: string }).verificationLabel,
    "Current stated preferences checked",
  );
});

test("buildWeddingPreferenceConflictState asks for reasons before solving thin preferences", () => {
  const state = buildWeddingPreferenceConflictState({
    decisionArea: "music",
    preferences: [
      { personLabel: "Partner 1", preferenceLabel: "DJ" },
      { personLabel: "Partner 2", preferenceLabel: "String quartet" },
    ],
  });

  assert.equal(state.status, "conflict");
  assert.match(state.nextQuestionLabel ?? "", /why this preference matters/i);
  assert.ok(state.compromiseOptions[0]?.plainLanguage.includes("values"));
});

test("buildWeddingPreferenceConflictState treats compatible preferences as aligned", () => {
  const state = buildWeddingPreferenceConflictState({
    decisionArea: "wedding feel",
    preferences: [
      { personLabel: "Maya", preferenceLabel: "Relaxed dinner party", underlyingValue: "low stress" },
      { personLabel: "Ozan", preferenceLabel: "Relaxed, not too formal", underlyingValue: "low stress" },
    ],
  });

  assert.equal(state.status, "aligned");
  assert.equal(state.conflictObject, null);
  assert.deepEqual(state.compromiseOptions, []);
});
