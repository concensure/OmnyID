import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_MAGNET_PROFILE_STORAGE_KEY,
  readWeddingMagnetImportFacts,
  weddingMagnetImportFactsFromJsonText,
  weddingMagnetFactsToIntakePrefill,
  weddingMagnetImportConflictKeys,
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

test("a downloaded profile JSON is parsed through the same review contract", () => {
  const facts = weddingMagnetImportFactsFromJsonText(JSON.stringify({
    version: 1,
    facts: {
      guest_count: { key: "guest_count", value: 84, source_label: "Budget Reality Check", result_id: "budget-cross-device" },
    },
  }));
  assert.deepEqual(facts.map((fact) => [fact.key, fact.value, fact.resultId]), [["guest_count", 84, "budget-cross-device"]]);
});

test("the live Budget Reality Check result file maps to shared profile fields", () => {
  const facts = weddingMagnetImportFactsFromJsonText(JSON.stringify({
    schema: "budget_reality_check",
    version: 1,
    result_id: "budget-file-1",
    created_at: "2026-11-03T00:00:00.000Z",
    updated_at: "2026-11-03T00:00:00.000Z",
    inputs: { totalBudget: "42000", guests: "90", state: "NSW", locationType: "metro", setting: "garden", priorities: ["Food", "Photos"] },
    result: { allocation: [{ id: "venue_ceremony", amount: 16_800 }] },
    origin: { page: "/wedding/wedding-cost-calculator.html" },
  }));
  assert.deepEqual(facts.map((fact) => fact.key), [
    "planning_started_at", "state", "area_type", "guest_count", "budget_total_aud", "budget_allocation", "top_priorities", "setting_preference",
  ]);
  assert.equal(facts.every((fact) => fact.resultId === "budget-file-1"), true);
});

test("unsupported and malformed JSON files remain fail closed", () => {
  assert.deepEqual(weddingMagnetImportFactsFromJsonText("not json"), []);
  assert.deepEqual(weddingMagnetImportFactsFromJsonText('{"schema":"other","version":1}'), []);
});

test("confirmed intake remains authoritative until a conflicting import is explicitly selected", () => {
  const facts = weddingMagnetImportFactsFromJsonText(JSON.stringify({
    version: 1,
    facts: {
      guest_count: { key: "guest_count", value: 84, source_label: "Budget Reality Check", result_id: "budget-conflict" },
      location_label: { key: "location_label", value: "Sydney NSW", source_label: "Budget Reality Check", result_id: "budget-conflict" },
    },
  }));
  assert.deepEqual([...weddingMagnetImportConflictKeys(facts, { guestCount: "90", location: "Sydney NSW" })], ["guest_count"]);
});
