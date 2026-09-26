import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import { weddingEstimatedCostPerGuest } from "@/lib/weddingGuestBudgetImpactState";

const baseBudget = {
  lineItems: [],
  categoryRollups: [],
  quoteTaskCandidates: [],
  paymentTaskCandidates: [],
  budgetAllocation: [],
  budgetTargetAmount: null,
  remainingAmount: null,
  overBudgetAmount: 0,
  budgetUtilizationPercent: null,
  budgetStatusLabel: "",
  totalProjectedAmount: 0,
  totalQuotedAmount: 0,
  totalKnownAmount: 0,
  unknownCount: 0,
  projectedCount: 0,
  quotedCount: 0,
  summaryLabel: "",
  warningLabels: [],
  insights: {} as WeddingBudgetTrackingState["insights"],
} satisfies WeddingBudgetTrackingState;

test("weddingEstimatedCostPerGuest prefers the couple's catering allocation", () => {
  const estimate = weddingEstimatedCostPerGuest({
    budgetTracking: {
      ...baseBudget,
      budgetAllocation: [
        { categoryId: "venue_ceremony", categoryLabel: "Venue & Ceremony", amount: 10000 },
        { categoryId: "catering_drinks", categoryLabel: "Catering & Drinks", amount: 9000 },
      ],
      categoryRollups: [{ categoryLabel: "Catering", amount: 5000, itemCount: 1, projectedCount: 1, quotedCount: 0, unknownCount: 0, currency: "AUD" }],
    },
    guestTracking: { guestRowCount: 60, attendingCount: 40, pendingCount: 10 },
  });

  assert.equal(estimate, 150);
});

test("weddingEstimatedCostPerGuest falls back to selected catering spend", () => {
  const estimate = weddingEstimatedCostPerGuest({
    budgetTracking: {
      ...baseBudget,
      categoryRollups: [{ categoryLabel: "Caterer", amount: 7200, itemCount: 1, projectedCount: 0, quotedCount: 1, unknownCount: 0, currency: "AUD" }],
    },
    guestTracking: { guestRowCount: 0, attendingCount: 30, pendingCount: 10 },
  });

  assert.equal(estimate, 180);
});

test("weddingEstimatedCostPerGuest does not invent a number without guests or catering evidence", () => {
  assert.equal(weddingEstimatedCostPerGuest({
    budgetTracking: {
      ...baseBudget,
      budgetAllocation: [{ categoryId: "catering_drinks", categoryLabel: "Catering & Drinks", amount: 9000 }],
    },
    guestTracking: { guestRowCount: 0, attendingCount: 0, pendingCount: 0 },
  }), null);

  assert.equal(weddingEstimatedCostPerGuest({
    budgetTracking: {
      ...baseBudget,
      categoryRollups: [{ categoryLabel: "Photography", amount: 4000, itemCount: 1, projectedCount: 0, quotedCount: 1, unknownCount: 0, currency: "AUD" }],
    },
    guestTracking: { guestRowCount: 20, attendingCount: 20, pendingCount: 0 },
  }), null);
});
