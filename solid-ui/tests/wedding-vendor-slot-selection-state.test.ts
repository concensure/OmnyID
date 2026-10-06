import test from "node:test";
import assert from "node:assert/strict";
import { selectWeddingVendorSlots } from "../src/lib/weddingVendorSlotSelectionState.ts";

test("slot selector interleaves bookable and verify while keeping slot one fixed", () => {
  const selected = selectWeddingVendorSlots([
    { id: "bookable", group: "bookable", fit: 80, styleTags: ["harbour"] },
    { id: "verify", group: "verify", fit: 90, fitUpper: 95, availabilityProbability: 0.7, styleTags: ["garden"] },
    { id: "bookable-2", group: "bookable", fit: 78, styleTags: ["harbour"] },
  ]);
  assert.deepEqual(selected.map((candidate) => candidate.id), ["bookable", "verify", "bookable-2"]);
});
test("slot selector is deterministic and applies MMR diversity after slot one", () => {
  const input = [
    { id: "a", group: "bookable" as const, fit: 90, styleTags: ["harbour"], suburb: "Mosman" },
    { id: "b", group: "bookable" as const, fit: 89, styleTags: ["harbour"], suburb: "Mosman" },
    { id: "c", group: "bookable" as const, fit: 87, styleTags: ["garden"], suburb: "Parramatta" },
  ];
  const first = selectWeddingVendorSlots(input).map((candidate) => candidate.id);
  assert.deepEqual(first, selectWeddingVendorSlots(input).map((candidate) => candidate.id));
  assert.deepEqual(first.slice(0, 2), ["a", "c"]);
});
