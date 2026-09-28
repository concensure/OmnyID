import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingDecisionSelectionState,
  loadWeddingDecisionSelection,
  loadWeddingDecisionSelections,
  toggleWeddingDecisionSelection,
  toggleWeddingDecisionSelectionValue,
} from "../src/lib/weddingDecisionSelectionState.ts";
import { buildWeddingComparisonColumns } from "../src/lib/weddingComparisonColumnState.ts";
import { buildWeddingExperienceModelState } from "../src/lib/weddingExperienceModelState.ts";
import {
  buildWeddingInspirationItem,
  buildWeddingInspirationState,
} from "../src/lib/weddingInspirationState.ts";

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

test("toggleWeddingDecisionSelectionValue supports multiple selected vendors", () => {
  const storage = memoryStorage();

  assert.deepEqual(toggleWeddingDecisionSelectionValue("artifact:venues", "0:harbour-house", storage), ["0:harbour-house"]);
  assert.deepEqual(toggleWeddingDecisionSelectionValue("artifact:venues", "1:garden-hall", storage), ["0:harbour-house", "1:garden-hall"]);
  assert.deepEqual(loadWeddingDecisionSelections("artifact:venues", storage), ["0:harbour-house", "1:garden-hall"]);
  assert.equal(loadWeddingDecisionSelection("artifact:venues", storage), "0:harbour-house");
  assert.deepEqual(toggleWeddingDecisionSelectionValue("artifact:venues", "0:harbour-house", storage), ["1:garden-hall"]);
});

test("buildWeddingDecisionSelectionState accepts vendor comparison choice ids", () => {
  const state = buildWeddingDecisionSelectionState({
    artifactId: "artifact:venues",
    artifactKind: "vendor_table",
    table,
    selectedOptionIds: ["vendor_choice:harbour_house:1", "vendor_choice:garden_hall:2"],
  });

  assert.deepEqual(state.selectedOptions.map((option) => option.label), ["Harbour House", "Garden Hall"]);
  assert.deepEqual(state.selectedOptionIds, ["0:harbour-house", "1:garden-hall"]);
  assert.equal(state.selectedOption?.label, "Harbour House");
  assert.equal(state.collapsedOptionCount, 1);
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

test("buildWeddingDecisionSelectionState uses typed option columns when table columns are reordered", () => {
  const headers = ["Category", "Supplier", "Quoted total", "Availability"];
  const state = buildWeddingDecisionSelectionState({
    artifactId: "artifact:photo-options",
    artifactKind: "vendor_table",
    table: {
      kind: "table",
      headers,
      columns: buildWeddingComparisonColumns(headers),
      rows: [
        ["Photography", "Aurora Weddings", "$4,800", "Available"],
        ["Photography", "Northlight Studio", "$5,400", "Hold only"],
      ],
      rowCountLabel: "2 rows",
    },
    selectedOptionId: "0:aurora-weddings",
  });

  assert.equal(state.selectedOption?.label, "Aurora Weddings");
  assert.equal(state.selectedOption?.id, "0:aurora-weddings");
  assert.match(state.selectedOption?.detail ?? "", /Photography - \$4,800 - Available/);
  assert.equal(state.selectedOption?.detail.includes("Aurora Weddings"), false);
  assert.deepEqual(state.visibleOptions.map((option) => option.label), ["Aurora Weddings"]);
});

test("buildWeddingDecisionSelectionState keeps first-column IDs for legacy untyped tables", () => {
  const state = buildWeddingDecisionSelectionState({
    artifactId: "artifact:venues",
    artifactKind: "vendor_table",
    table,
    selectedOptionId: "0:harbour-house",
  });

  assert.equal(state.selectedOption?.label, "Harbour House");
  assert.equal(state.selectedOption?.id, "0:harbour-house");
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

test("buildWeddingDecisionSelectionState carries wedding experience fit into option tradeoffs", () => {
  const experienceModel = buildWeddingExperienceModelState(buildWeddingInspirationState([
    buildWeddingInspirationItem({ title: "Reception 1", note: "warm lighting and long table", createdAt: "2026-09-26T00:00:00.000Z" }),
    buildWeddingInspirationItem({ title: "Reception 2", note: "warm candles and relaxed dinner", createdAt: "2026-09-26T00:01:00.000Z" }),
    buildWeddingInspirationItem({ title: "Flowers", note: "low floral arrangements for conversation", createdAt: "2026-09-26T00:02:00.000Z" }),
  ]));
  const state = buildWeddingDecisionSelectionState({
    artifactId: "artifact:venues",
    artifactKind: "vendor_table",
    table: {
      ...table,
      rows: [
        ["Warm Loft", "Venue", "Warm candle lighting, long table, low florals"],
        ["Grand Ballroom", "Venue", "Large bright white ballroom with tall floral centerpieces and loud music"],
      ],
    },
    experienceModel,
  });

  const loft = state.options.find((option) => option.label === "Warm Loft");
  const ballroom = state.options.find((option) => option.label === "Grand Ballroom");

  assert.ok(loft?.preferenceFitLabels.some((label) => /warm/i.test(label)));
  assert.ok(ballroom?.tradeoffLabels.some((label) => /conversation/i.test(label)));
  assert.match(ballroom?.preferenceSummaryLabel ?? "", /style tradeoff/i);
});
