import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { buildWeddingNormalizedQuoteState } from "@/lib/weddingNormalizedQuoteState";

const base: WeddingArtifactQuotePreview = {
  kind: "quote", vendorName: "Harbour House", amount: 18_000, amountLabel: "AUD $18,000", currency: "AUD",
  budgetDeltaAmount: -2_000, budgetDeltaLabel: "AUD $2,000 under budget", inclusions: ["Venue hire", "Dinner"],
  validUntil: "2027-03-01", attachmentUrl: "https://example.com/quote.pdf", attachmentTextStatus: "extracted",
};

test("normalized quote remains conditional without the couple's event basis", () => {
  const state = buildWeddingNormalizedQuoteState(base);
  assert.equal(state.recommendationReady, false);
  assert.equal(state.recommendationLabel, "Confirm the event basis before comparing");
  assert.match(state.recommendationDetail, /date and guest count/i);
});

test("normalized quote becomes comparable only with date, guests, availability and payment terms", () => {
  const state = buildWeddingNormalizedQuoteState({
    ...base,
    eventDate: "20 November 2027",
    guestCount: 90,
    availabilityLabel: "Available for the date",
    depositLabel: "25% on acceptance",
    paymentSchedule: ["Balance due 30 days before the wedding"],
    exclusions: ["Transport"],
  });
  assert.equal(state.recommendationReady, true);
  assert.equal(state.completenessLabel, "Ready to compare");
  assert.equal(state.recommendationLabel, "Shortlist for contract review");
});
