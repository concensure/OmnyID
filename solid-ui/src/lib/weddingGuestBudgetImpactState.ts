// @locs-version: 1.0
import type { WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";

function positiveAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function guestDivisor(guestTracking: Pick<WeddingGuestTrackingState, "guestRowCount" | "attendingCount" | "pendingCount">): number | null {
  const count = guestTracking.guestRowCount || guestTracking.attendingCount + guestTracking.pendingCount;
  return count > 0 ? count : null;
}

function cateringAmountFromAllocation(budgetTracking: WeddingBudgetTrackingState): number | null {
  const allocation = budgetTracking.budgetAllocation.find((item) => item.categoryId === "catering_drinks");
  return positiveAmount(allocation?.amount);
}

function cateringAmountFromSelectedSpend(budgetTracking: WeddingBudgetTrackingState): number | null {
  const rollup = budgetTracking.categoryRollups.find((item) =>
    /\b(caterer|catering|catered|drink|drinks|bar|beverage|food|menu)\b/i.test(item.categoryLabel)
  );
  return positiveAmount(rollup?.amount);
}

export function weddingEstimatedCostPerGuest(input: {
  budgetTracking: WeddingBudgetTrackingState;
  guestTracking: Pick<WeddingGuestTrackingState, "guestRowCount" | "attendingCount" | "pendingCount">;
}): number | null {
  const divisor = guestDivisor(input.guestTracking);
  if (divisor === null) return null;

  const amount = cateringAmountFromAllocation(input.budgetTracking)
    ?? cateringAmountFromSelectedSpend(input.budgetTracking);
  if (amount === null) return null;

  const estimate = Math.round(amount / divisor);
  return estimate > 0 ? estimate : null;
}
