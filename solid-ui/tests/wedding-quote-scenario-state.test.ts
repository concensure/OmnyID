import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingArtifactQuotePreview, WeddingArtifactQuoteScenarioItem } from "@/lib/weddingArtifactPreviewState";
import { calculateWeddingQuoteScenario, weddingQuoteScenarioDecision } from "@/lib/weddingQuoteScenarioState";

function quote(vendorName: string, amount: number, guestCount: number, items: WeddingArtifactQuoteScenarioItem[] = []): WeddingArtifactQuotePreview {
  return {
    kind: "quote", vendorName, amount, amountLabel: `AUD $${amount}`, currency: "AUD",
    budgetDeltaAmount: null, budgetDeltaLabel: null, inclusions: items.map((item) => item.label),
    validUntil: null, attachmentUrl: null, guestCount, scenarioItems: items,
  };
}

const context = { eventDate: "2027-11-20", guestCount: 30, durationHours: 6, weddingBudget: 30_000 };

test("minimum-spend comparison flips at the documented headcounts", () => {
  const perHead = (id: string, rate: number): WeddingArtifactQuoteScenarioItem => ({
    id, label: "Food and beverage", inclusion: "included", priceBasis: "per_person", unitAmount: rate,
    quantity: 1, includedInQuotedTotal: true, minimumSpendEligible: true, sourceSnippet: `AUD $${rate} per guest`,
  });
  const venueA = { ...quote("Venue A", 5_000, 30, [perHead("a-food", 120)]), minimumSpendAmount: 5_000 };
  const venueB = quote("Venue B", 4_500, 30, [perHead("b-food", 150)]);
  assert.equal(calculateWeddingQuoteScenario({ quote: venueA, context }).scenarioTotal, 5_000);
  assert.equal(calculateWeddingQuoteScenario({ quote: venueB, context }).scenarioTotal, 4_500);
  assert.equal(calculateWeddingQuoteScenario({ quote: venueA, context: { ...context, guestCount: 40 } }).scenarioTotal, 5_000);
  assert.equal(calculateWeddingQuoteScenario({ quote: venueB, context: { ...context, guestCount: 40 } }).scenarioTotal, 6_000);
});

test("removing an eligible optional upgrade cannot reduce the scenario below minimum spend", () => {
  const items: WeddingArtifactQuoteScenarioItem[] = [
    { id: "base", label: "Food and beverage", inclusion: "included", priceBasis: "fixed", unitAmount: 4_800, quantity: 1, includedInQuotedTotal: true, minimumSpendEligible: true, sourceSnippet: "Food and beverage AUD $4,800" },
    { id: "upgrade", label: "Drinks upgrade", inclusion: "optional", priceBasis: "fixed", unitAmount: 400, quantity: 1, includedInQuotedTotal: true, minimumSpendEligible: true, sourceSnippet: "Optional drinks upgrade AUD $400" },
  ];
  const original = { ...quote("Venue A", 5_200, 30, items), minimumSpendAmount: 5_000 };
  const result = calculateWeddingQuoteScenario({ quote: original, context, edits: { upgrade: { included: false, quantity: 1 } } });
  assert.equal(result.originalTotal, 5_200);
  assert.equal(result.scenarioTotal, 5_000);
  assert.equal(result.differenceFromOriginal, -200);
  assert.equal(result.label, "Scenario estimate");
});

test("mandatory inclusions cannot be silently removed or resized and source uncertainty remains visible", () => {
  const mandatory: WeddingArtifactQuoteScenarioItem = { id: "security", label: "Required security", inclusion: "required", priceBasis: "fixed", unitAmount: 300, quantity: 1, includedInQuotedTotal: true, minimumSpendEligible: false, sourceSnippet: "Required security AUD $300" };
  const result = calculateWeddingQuoteScenario({ quote: quote("Venue A", 5_300, 30, [mandatory]), context, edits: { security: { included: false, quantity: 0 } } });
  assert.equal(result.scenarioTotal, 5_300);
  assert.match(result.confirmationReasons.join(" "), /cannot simply be deducted or resized/i);
});

test("a couple-added optional item changes only the scenario and can be omitted again", () => {
  const extra: WeddingArtifactQuoteScenarioItem = { id: "scenario-extra", label: "Extra welcome drinks", inclusion: "optional", priceBasis: "per_item", unitAmount: 20, quantity: 3, includedInQuotedTotal: false, minimumSpendEligible: false, sourceSnippet: "Couple-added scenario item" };
  const original = quote("Venue A", 5_000, 30);
  const added = calculateWeddingQuoteScenario({ quote: original, context, extraItems: [extra], edits: { [extra.id]: { included: true, quantity: 3 } } });
  assert.equal(added.originalTotal, 5_000);
  assert.equal(added.scenarioTotal, 5_060);
  assert.equal(added.remainingBudget, 24_940);
  assert.equal(added.label, "Scenario estimate");
  const removed = calculateWeddingQuoteScenario({ quote: original, context, extraItems: [] });
  assert.equal(removed.originalTotal, 5_000);
  assert.equal(removed.scenarioTotal, 5_000);
});

test("decision support does not recommend a cheaper option that fails capacity", () => {
  const a = calculateWeddingQuoteScenario({ quote: { ...quote("Venue A", 5_000, 30), maxGuestCount: 25 }, context });
  const b = calculateWeddingQuoteScenario({ quote: quote("Venue B", 6_000, 30), context });
  const decision = weddingQuoteScenarioDecision([{ vendorName: "Venue A", result: a }, { vendorName: "Venue B", result: b }]);
  assert.match(decision.tradeoff, /Venue B is the only priced option/i);
  assert.match(decision.recommendation, /Venue B/i);
  assert.match(decision.missingFact ?? "", /maximum of 25 guests/);
});
