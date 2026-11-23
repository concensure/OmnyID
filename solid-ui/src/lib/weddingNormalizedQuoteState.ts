import type { WeddingArtifactPreviewState, WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";

export type WeddingNormalizedQuoteCompleteness = "complete" | "needs_clarification" | "incomplete";

export type WeddingNormalizedQuoteState = {
  vendorName: string;
  comparableTotalLabel: string;
  totalBasisLabel: string;
  completeness: WeddingNormalizedQuoteCompleteness;
  completenessLabel: string;
  eventBasis: Array<{ label: string; value: string; confirmed: boolean }>;
  inclusions: string[];
  adjustments: string[];
  exclusions: string[];
  paymentTerms: string[];
  recommendationLabel: string;
  recommendationDetail: string;
  recommendationReady: boolean;
  questions: string[];
};

export function bindWeddingQuoteContext<T extends { preview: WeddingArtifactPreviewState | null }>(
  item: T | null,
  context: { eventDate?: unknown; guestCount?: unknown },
): T | null {
  if (!item || item.preview?.kind !== "quote") return item;
  const guestCount = typeof context.guestCount === "number" ? context.guestCount : Number.parseInt(clean(context.guestCount), 10);
  return { ...item, preview: { ...item.preview, eventDate: item.preview.eventDate || clean(context.eventDate) || null, guestCount: item.preview.guestCount ?? (Number.isFinite(guestCount) ? guestCount : null) } };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: readonly unknown[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function contextDate(quote: WeddingArtifactQuotePreview): string {
  return clean(quote.eventDate);
}

function contextGuests(quote: WeddingArtifactQuotePreview): string {
  return typeof quote.guestCount === "number" && quote.guestCount > 0
    ? `${Math.round(quote.guestCount)} guests`
    : "Not confirmed";
}

export function buildWeddingNormalizedQuoteState(quote: WeddingArtifactQuotePreview): WeddingNormalizedQuoteState {
  const date = contextDate(quote);
  const guestLabel = contextGuests(quote);
  const hasDate = Boolean(date);
  const hasGuests = guestLabel !== "Not confirmed";
  const availability = clean(quote.availabilityLabel);
  const hasAvailability = /available|held|reserved/i.test(availability) && !/not|unknown|unconfirmed/i.test(availability);
  const hasTotal = typeof quote.amount === "number" && Number.isFinite(quote.amount);
  const sourceExtracted = quote.attachmentTextStatus === "extracted" || !quote.attachmentUrl;
  const adjustments = unique([
    ...(quote.mandatoryFees ?? []),
    quote.taxLabel,
    quote.budgetDeltaLabel ? `Budget impact: ${quote.budgetDeltaLabel}` : null,
  ]);
  const exclusions = unique(quote.exclusions ?? []);
  const paymentTerms = unique([
    quote.depositLabel ? `Deposit: ${quote.depositLabel}` : null,
    ...(quote.paymentSchedule ?? []),
    quote.validUntil ? `Quote valid until: ${quote.validUntil}` : null,
  ]);
  const missing = [
    !hasDate ? "the wedding date" : null,
    !hasGuests ? "the guest count" : null,
    !hasAvailability ? "availability for that date" : null,
    !hasTotal ? "a comparable total" : null,
    quote.inclusions.length === 0 ? "included services" : null,
    paymentTerms.length === 0 ? "deposit and payment terms" : null,
    !sourceExtracted ? "verified extraction from the original file" : null,
  ].filter((value): value is string => Boolean(value));
  const contextReady = hasDate && hasGuests;
  const materialReady = hasTotal && quote.inclusions.length > 0 && paymentTerms.length > 0;
  const recommendationReady = contextReady && materialReady && hasAvailability && sourceExtracted;
  const completeness: WeddingNormalizedQuoteCompleteness = recommendationReady
    ? "complete"
    : contextReady && hasTotal
      ? "needs_clarification"
      : "incomplete";
  const appearsOverBudget = /over budget|above budget|exceeds budget/i.test(clean(quote.budgetDeltaLabel))
    || (typeof quote.budgetDeltaAmount === "number" && quote.budgetDeltaAmount > 0);
  const appearsWithinBudget = /under budget|below budget|within budget|on budget/i.test(clean(quote.budgetDeltaLabel))
    || (typeof quote.budgetDeltaAmount === "number" && quote.budgetDeltaAmount <= 0);
  const recommendationLabel = !contextReady
    ? "Confirm the event basis before comparing"
    : !materialReady || !hasAvailability || !sourceExtracted
      ? "Clarify the missing terms before deciding"
      : appearsOverBudget
        ? "Ask for a revised package before shortlisting"
        : appearsWithinBudget
          ? "Shortlist for contract review"
          : "Compare against the other complete quotes";
  const recommendationDetail = !contextReady
    ? "A vendor quote is only comparable when it is tied to the couple's date and guest count. The current amount remains visible, but OmnyID will not treat it as decision-ready."
    : recommendationReady
      ? `This quote is tied to ${date} and ${guestLabel.toLowerCase()}, with availability and material price terms present. Review the original file before accepting or paying.`
      : `The quote is tied to ${date} and ${guestLabel.toLowerCase()}, but ${missing.join(", ")} ${missing.length === 1 ? "still needs" : "still need"} confirmation.`;
  return {
    vendorName: quote.vendorName,
    comparableTotalLabel: quote.amountLabel,
    totalBasisLabel: clean(quote.packageLabel) || (quote.assumptions?.length ? quote.assumptions.join("; ") : "Quoted total"),
    completeness,
    completenessLabel: completeness === "complete" ? "Ready to compare" : completeness === "needs_clarification" ? "Needs clarification" : "Incomplete basis",
    eventBasis: [
      { label: "Wedding date", value: date || "Not confirmed", confirmed: hasDate },
      { label: "Guest count", value: guestLabel, confirmed: hasGuests },
      { label: "Availability", value: availability || "Not confirmed", confirmed: hasAvailability },
    ],
    inclusions: unique(quote.inclusions),
    adjustments,
    exclusions,
    paymentTerms,
    recommendationLabel,
    recommendationDetail,
    recommendationReady,
    questions: missing.map((item) => `Confirm ${item}`),
  };
}
