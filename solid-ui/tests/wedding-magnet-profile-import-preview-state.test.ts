import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_MAGNET_PROFILE_STORAGE_KEY,
  readWeddingMagnetImportFacts,
  weddingMagnetFactsToIntakePrefill,
} from "../src/lib/weddingMagnetProfileImportPreviewState.ts";

function storage(value: unknown): Storage {
  const values = new Map<string, string>([[WEDDING_MAGNET_PROFILE_STORAGE_KEY, JSON.stringify(value)]]);
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, next) => { values.set(key, next); },
  };
}

test("shared magnet facts become reviewable intake prefill without a second store", () => {
  const facts = readWeddingMagnetImportFacts(storage({
    version: 1,
    facts: {
      wedding_date: { key: "wedding_date", value: "2027-11-20", source_label: "Wedding Countdown", result_id: "countdown-1" },
      location_label: { key: "location_label", value: "Sydney NSW", source_label: "Budget Reality Check", result_id: "budget-1" },
      guest_count: { key: "guest_count", value: 90, source_label: "Budget Reality Check", result_id: "budget-1" },
      budget_total_aud: { key: "budget_total_aud", value: 35000, source_label: "Budget Reality Check", result_id: "budget-1" },
      top_priorities: { key: "top_priorities", value: ["Food", "Photos"], source_label: "Budget Reality Check", result_id: "budget-1" },
      accessibility_requirements: { key: "accessibility_requirements", value: "Step-free entry", source_label: "Invitation Wording Generator", result_id: "inv-1" },
    },
  }));
  assert.deepEqual(facts.map((fact) => fact.key), [
    "wedding_date", "location_label", "guest_count", "budget_total_aud", "top_priorities", "accessibility_requirements",
  ]);
  assert.equal(facts.at(-1)?.tier, "S");
  assert.deepEqual(weddingMagnetFactsToIntakePrefill(facts), {
    weddingDate: "2027-11-20",
    location: "Sydney NSW",
    guestCount: "90",
    budgetTotal: "35000",
    priorities: "Food, Photos",
    atmosphere: undefined,
    coupleNames: undefined,
    vendorCategories: [],
  });
});

test("malformed or unproven profile entries are ignored", () => {
  assert.deepEqual(readWeddingMagnetImportFacts(storage({ version: 2, facts: {} })), []);
  assert.deepEqual(readWeddingMagnetImportFacts(storage({
    version: 1,
    facts: {
      guest_count: { key: "guest_count", value: 90, source_label: "", result_id: "missing-source" },
      budget_total_aud: { key: "budget_total_aud", value: -1, source_label: "Budget Reality Check", result_id: "bad-budget" },
    },
  })), []);
});
