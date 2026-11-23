import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_VENDOR_CHECKLIST,
  normalizeWeddingVendorSelections,
  weddingVendorSearchTerms,
  weddingVendorSelectionLabels,
} from "../src/lib/weddingVendorChecklistState.ts";

test("wedding vendor checklist includes the requested selectable vendor types", () => {
  const labels = WEDDING_VENDOR_CHECKLIST.map((item) => item.label);

  assert.ok(labels.includes("Venue"));
  assert.ok(labels.includes("Photographer"));
  assert.ok(labels.includes("Travel / Honeymoon Advisor"));
  assert.ok(labels.includes("Trendy and Emerging Wedding Vendors"));
  assert.equal(new Set(WEDDING_VENDOR_CHECKLIST.map((item) => item.id)).size, WEDDING_VENDOR_CHECKLIST.length);
});

test("vendor checklist helpers normalize ids and labels into stable selections", () => {
  const selections = normalizeWeddingVendorSelections([
    " Venue ",
    "Photographer",
    "Travel/ Honeymoon Advisor",
    "bad",
    "venue",
  ]);

  assert.deepEqual(selections, ["venue", "photographer", "travel_honeymoon_advisor"]);
  assert.deepEqual(weddingVendorSelectionLabels(selections), ["Venue", "Photographer", "Travel / Honeymoon Advisor"]);
  assert.ok(weddingVendorSearchTerms(selections).some((term) => /wedding photographer/i.test(term)));
});
