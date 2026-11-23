import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVendorQuotePreview,
  parseMoneyMinor,
} from "../src/lib/vendorQuoteDraftState";

test("vendor quote draft computes deterministic itemised totals", () => {
  const preview = buildVendorQuotePreview({
    currency: "AUD",
    taxTreatment: "exclusive",
    taxAmount: "150.00",
    expiresOn: "2099-12-31",
    guestBasis: 90,
    conditions: "Subject to the stated wedding date and final guest count.",
    lines: [
      { id: "one", description: "Venue hire", quantity: 1, unitAmount: "5000" },
      { id: "two", description: "Guest package", quantity: 90, unitAmount: "125.50" },
    ],
  });
  assert.equal(preview.subtotalMinor, 1_629_500);
  assert.equal(preview.taxMinor, 15_000);
  assert.equal(preview.totalMinor, 1_644_500);
  assert.equal(preview.facts.find((fact) => fact.key === "quote.total")?.value?.kind, "money");
  assert.equal(preview.facts.find((fact) => fact.key === "quote.guest_basis")?.value?.kind, "integer");
});

test("vendor quote draft rejects ambiguous money and invalid expiry", () => {
  assert.equal(parseMoneyMinor("1,250.50"), 125_050);
  assert.equal(parseMoneyMinor("12.345"), null);
  assert.throws(() => buildVendorQuotePreview({
    currency: "AUD",
    taxTreatment: "inclusive",
    taxAmount: "0",
    expiresOn: "2020-01-01",
    lines: [{ id: "one", description: "Package", quantity: 1, unitAmount: "100" }],
  }), /future/);
});

test("vendor quote facts stay within the AFP response limit", () => {
  const preview = buildVendorQuotePreview({
    currency: "AUD",
    taxTreatment: "exempt",
    taxAmount: "",
    expiresOn: "2099-12-31",
    lines: Array.from({ length: 20 }, (_, index) => ({
      id: String(index), description: `Line ${index + 1}`, quantity: 1, unitAmount: "1.00",
    })),
  });
  assert.equal(preview.facts.length, 85);
  assert.ok(preview.facts.length <= 100);
});
