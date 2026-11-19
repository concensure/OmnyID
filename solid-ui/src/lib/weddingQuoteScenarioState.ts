import type {
  WeddingArtifactQuotePreview,
  WeddingArtifactQuoteScenarioItem,
} from "@/lib/weddingArtifactPreviewState";

export type WeddingQuoteScenarioContext = {
  eventDate: string;
  guestCount: number;
  durationHours: number;
  weddingBudget: number | null;
};

export type WeddingQuoteScenarioItemEdit = {
  included: boolean;
  quantity: number;
};

export type WeddingQuoteScenarioResult = {
  originalTotal: number | null;
  scenarioTotal: number | null;
  remainingBudget: number | null;
  differenceFromOriginal: number | null;
  label: "Original quote" | "Scenario estimate";
  viable: boolean | null;
  confirmationReasons: string[];
  calculationLines: string[];
};

function boundedNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function itemAmount(item: WeddingArtifactQuoteScenarioItem, context: WeddingQuoteScenarioContext, quantity: number): number | null {
  if (item.unitAmount === null || !Number.isFinite(item.unitAmount)) return null;
  if (item.priceBasis === "per_person") return item.unitAmount * context.guestCount * quantity;
  if (item.priceBasis === "per_hour") return item.unitAmount * context.durationHours * quantity;
  if (item.priceBasis === "percentage") return null;
  return item.unitAmount * quantity;
}

function originalItemAmount(item: WeddingArtifactQuoteScenarioItem, quote: WeddingArtifactQuotePreview, context: WeddingQuoteScenarioContext): number | null {
  const originalContext = {
    ...context,
    guestCount: boundedNumber(quote.guestCount, context.guestCount),
    durationHours: boundedNumber(quote.quotedDurationHours, context.durationHours),
  };
  return itemAmount(item, originalContext, boundedNumber(item.quantity, 1));
}

function canRemove(item: WeddingArtifactQuoteScenarioItem): boolean {
  return item.inclusion === "optional" || item.inclusion === "conditional" || item.inclusion === "excluded";
}

export function calculateWeddingQuoteScenario(input: {
  quote: WeddingArtifactQuotePreview;
  context: WeddingQuoteScenarioContext;
  edits?: Readonly<Record<string, WeddingQuoteScenarioItemEdit>>;
  extraItems?: readonly WeddingArtifactQuoteScenarioItem[];
}): WeddingQuoteScenarioResult {
  const quote = input.quote;
  const originalTotal = typeof quote.amount === "number" && Number.isFinite(quote.amount) ? Math.max(0, quote.amount) : null;
  const items = [...(quote.scenarioItems ?? []), ...(input.extraItems ?? [])];
  let knownDelta = 0;
  let eligibleOriginal = 0;
  let eligibleScenario = 0;
  let ineligibleDelta = 0;
  let changed = false;
  const confirmationReasons: string[] = [];
  const calculationLines: string[] = [];

  for (const item of items) {
    const edit = input.edits?.[item.id];
    const requestedIncluded = edit?.included ?? item.includedInQuotedTotal;
    const included = requestedIncluded || (!canRemove(item) && item.includedInQuotedTotal);
    const quantity = boundedNumber(edit?.quantity, boundedNumber(item.quantity, 1));
    const originalAmount = item.includedInQuotedTotal ? originalItemAmount(item, quote, input.context) : 0;
    const scenarioAmount = included ? itemAmount(item, input.context, quantity) : 0;
    const itemChanged = included !== item.includedInQuotedTotal || quantity !== boundedNumber(item.quantity, 1)
      || (item.priceBasis === "per_person" && input.context.guestCount !== boundedNumber(quote.guestCount, input.context.guestCount))
      || (item.priceBasis === "per_hour" && input.context.durationHours !== boundedNumber(quote.quotedDurationHours, input.context.durationHours));
    changed ||= itemChanged;
    if (requestedIncluded !== included) {
      confirmationReasons.push(`${item.label} is ${item.inclusion} and cannot simply be deducted.`);
    }
    if (originalAmount === null || scenarioAmount === null) {
      if (itemChanged) confirmationReasons.push(`${item.label} has no reliable amount for this scenario.`);
      continue;
    }
    const delta = scenarioAmount - originalAmount;
    knownDelta += delta;
    if (item.minimumSpendEligible) {
      eligibleOriginal += originalAmount;
      eligibleScenario += scenarioAmount;
    } else {
      ineligibleDelta += delta;
    }
    if (itemChanged) {
      calculationLines.push(`${item.label}: ${included ? `$${scenarioAmount.toFixed(2)}` : "removed"} (${delta >= 0 ? "+" : "−"}$${Math.abs(delta).toFixed(2)})`);
    }
  }

  const minSpend = boundedNumber(quote.minimumSpendAmount, 0);
  let scenarioTotal = originalTotal === null ? null : Math.max(0, originalTotal + knownDelta);
  if (scenarioTotal !== null && minSpend > 0) {
    if (eligibleOriginal > 0 || eligibleScenario > 0) {
      // The quoted total may already be the minimum-spend floor. Only treat
      // the amount above both the eligible subtotal and the floor as spend
      // outside that minimum, otherwise the floor gets counted twice.
      const outsideEligible = Math.max(0, originalTotal! - Math.max(minSpend, eligibleOriginal));
      scenarioTotal = Math.max(minSpend, eligibleScenario) + outsideEligible + ineligibleDelta;
    } else {
      scenarioTotal = Math.max(minSpend, scenarioTotal);
    }
    calculationLines.push(`Minimum-spend floor: $${minSpend.toFixed(2)}`);
  }

  if (quote.minGuestCount !== null && quote.minGuestCount !== undefined && input.context.guestCount < quote.minGuestCount) {
    confirmationReasons.push(`The scenario is below the quoted minimum of ${quote.minGuestCount} guests.`);
  }
  if (quote.maxGuestCount !== null && quote.maxGuestCount !== undefined && input.context.guestCount > quote.maxGuestCount) {
    confirmationReasons.push(`The scenario is above the quoted maximum of ${quote.maxGuestCount} guests.`);
  }
  if (quote.eventDate && input.context.eventDate && quote.eventDate !== input.context.eventDate) {
    confirmationReasons.push("The scenario date differs from the quoted date; vendor confirmation is needed.");
    changed = true;
  }
  if (quote.guestCount && input.context.guestCount !== quote.guestCount) changed = true;
  if (quote.quotedDurationHours && input.context.durationHours !== quote.quotedDurationHours) changed = true;
  if (scenarioTotal === null) confirmationReasons.push("The original quote does not establish a comparable total.");
  if ((quote.scenarioItems ?? []).some((item) => item.unitAmount === null)) {
    confirmationReasons.push("One or more quoted items have an unknown price; the total may be incomplete.");
  }

  const uniqueReasons = [...new Set(confirmationReasons)];
  const differenceFromOriginal = originalTotal === null || scenarioTotal === null ? null : scenarioTotal - originalTotal;
  return {
    originalTotal,
    scenarioTotal,
    remainingBudget: input.context.weddingBudget === null || scenarioTotal === null
      ? null
      : input.context.weddingBudget - scenarioTotal,
    differenceFromOriginal,
    label: changed || Math.abs(differenceFromOriginal ?? 0) > 0.005 ? "Scenario estimate" : "Original quote",
    viable: uniqueReasons.some((reason) => /below|above|differs|does not establish/i.test(reason)) ? false : scenarioTotal === null ? null : true,
    confirmationReasons: uniqueReasons,
    calculationLines,
  };
}

export function weddingQuoteScenarioDecision(results: readonly { vendorName: string; result: WeddingQuoteScenarioResult }[]): {
  tradeoff: string;
  recommendation: string;
  missingFact: string | null;
} {
  const priced = results.filter((entry) => entry.result.scenarioTotal !== null)
    .sort((a, b) => a.result.scenarioTotal! - b.result.scenarioTotal!);
  if (priced.length === 0) return {
    tradeoff: "The quotes do not yet establish comparable totals.",
    recommendation: "Keep the choice open until at least one complete total is source-backed.",
    missingFact: results.flatMap((entry) => entry.result.confirmationReasons)[0] ?? "Comparable total",
  };
  const viable = priced.filter((entry) => entry.result.viable === true);
  if (viable.length === 0) return {
    tradeoff: "The priced options do not currently meet the common date, capacity or guest-count basis.",
    recommendation: "Keep the choice open until a vendor confirms a viable scenario.",
    missingFact: results.flatMap((entry) => entry.result.confirmationReasons)[0] ?? "Vendor confirmation",
  };
  const best = viable[0];
  const next = viable[1];
  const difference = next ? next.result.scenarioTotal! - best.result.scenarioTotal! : null;
  const missingFact = results.flatMap((entry) => entry.result.confirmationReasons)[0] ?? null;
  return {
    tradeoff: next
      ? `${best.vendorName} is $${difference!.toFixed(2)} lower on the current common scenario, before unknown fees.`
      : priced.length > 1
        ? `${best.vendorName} is the only priced option that currently meets the common comparison basis.`
        : `${best.vendorName} is the only quote with a current comparable total.`,
    recommendation: missingFact
      ? `${best.vendorName} is conditionally lower, but confirm ${missingFact.charAt(0).toLowerCase()}${missingFact.slice(1)}`
      : `${best.vendorName} is lower for this scenario on the stated scope. Review inclusions before confirming a preference.`,
    missingFact,
  };
}
