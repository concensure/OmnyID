import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingDecisionSelectionState,
  loadWeddingDecisionSelection,
  toggleWeddingDecisionSelection,
} from "../src/lib/weddingDecisionSelectionState.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  } as Storage;
}

const table = {
  kind: "table" as const,
  headers: ["Name", "Category", "Fit"],
  rows: [
    ["Harbour House", "Venue", "Water view and indoor backup"],
    ["Garden Hall", "Venue", "Lower cost but weather exposed"],
    ["Registry option", "Celebrant", "Public ceremony pathway"],
  ],
  rowCountLabel: "3 rows",
};

test("buildWeddingDecisionSelectionState exposes shortlist options and selected scope", () => {
  const state = buildWeddingDecisionSelectionState({
    artifactId: "artifact:venues",
    artifactKind: "vendor_table",
    table,
    selectedOptionId: "1:garden-hall",
  });

  assert.equal(state.eligible, true);
  assert.equal(state.options.length, 3);
  assert.equal(state.selectedOption?.label, "Garden Hall");
  assert.deepEqual(state.visibleOptions.map((option) => option.label), ["Garden Hall"]);
  assert.equal(state.collapsedOptionCount, 2);
  assert.ok(state.scopeLabels.includes("Selected: Garden Hall"));
  assert.match(state.instructionLabel, /follow-up reports/i);
});

test("toggleWeddingDecisionSelection is single-choice and reversible", () => {
  const storage = memoryStorage();

  assert.equal(toggleWeddingDecisionSelection("artifact:venues", "0:harbour-house", storage), "0:harbour-house");
  assert.equal(loadWeddingDecisionSelection("artifact:venues", storage), "0:harbour-house");
  assert.equal(toggleWeddingDecisionSelection("artifact:venues", "1:garden-hall", storage), "1:garden-hall");
  assert.equal(loadWeddingDecisionSelection("artifact:venues", storage), "1:garden-hall");
  assert.equal(toggleWeddingDecisionSelection("artifact:venues", "1:garden-hall", storage), null);
  assert.equal(loadWeddingDecisionSelection("artifact:venues", storage), null);
});

test("buildWeddingDecisionSelectionState ignores non-shortlist artifact kinds", () => {
  const state = buildWeddingDecisionSelectionState({
    artifactId: "artifact:budget",
    artifactKind: "budget_sheet",
    table,
    selectedOptionId: "0:harbour-house",
  });

  assert.equal(state.eligible, false);
  assert.equal(state.options.length, 0);
  assert.deepEqual(state.scopeLabels, []);
});

test("buildWeddingDecisionSelectionState adds conservative preference-fit labels", () => {
  const state = buildWeddingDecisionSelectionState({
    artifactId: "artifact:venues",
    artifactKind: "vendor_table",
    table,
    preferenceText: "The couple prefers a waterfront feel, wet-weather backup, accessibility, and budget control.",
  });

  const harbour = state.options.find((option) => option.label === "Harbour House");
  const garden = state.options.find((option) => option.label === "Garden Hall");

  assert.ok(harbour?.preferenceFitLabels.includes("waterfront/harbour feel"));
  assert.ok(harbour?.preferenceFitLabels.includes("wet-weather backup"));
  assert.match(harbour?.preferenceSummaryLabel ?? "", /preference fit signal/i);
  assert.ok(garden?.tradeoffLabels.includes("wet-weather backup"));
  assert.ok(garden?.preferenceFitLabels.includes("budget control"));
});
