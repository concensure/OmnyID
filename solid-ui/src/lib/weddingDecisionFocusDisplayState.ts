// @locs-version: 1.0
import type {
  WeddingDecisionLoadReliefState,
  WeddingPersonalOsRankedItem,
} from "@/lib/weddingPersonalOsProjectionState";

/** The wedding home is a daily focus, not an endless decision queue. */
export const WEDDING_DAILY_DECISION_LIMIT = 3;

export type WeddingDecisionFocusDisplayState = {
  visibleFocusItems: WeddingPersonalOsRankedItem[];
  itemCards: WeddingDecisionFocusItemCard[];
  visibleCount: number;
  summaryLabel: string;
  savedForLaterLabel: string | null;
  reviewDisabled: boolean;
};

export type WeddingDecisionFocusItemCard = {
  id: string;
  item: WeddingPersonalOsRankedItem;
  title: string;
  neededByLabel: string;
  whyNowLabel: string;
  checkedLabel: string;
  recommendedActionLabel: string;
  compareLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compactSentence(value: unknown, fallback: string): string {
  const text = clean(value).replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function neededByLabel(item: WeddingPersonalOsRankedItem): string {
  const due = clean(item.dueLabel);
  if (due) return due;
  if (item.sourceSurface === "decision_queue") return "When you are ready to choose";
  if (item.sourceSurface === "approval_queue") return "Before anything is sent or changed";
  return "No date set yet";
}

function checkedLabel(item: WeddingPersonalOsRankedItem): string {
  const labels = item.evidenceLabels.map(clean).filter(Boolean).slice(0, 3);
  if (labels.length === 0) return "OmnyID has not attached evidence yet.";
  return `OmnyID checked ${labels.join(", ")}.`;
}

function recommendedActionLabel(item: WeddingPersonalOsRankedItem): string {
  const vendorResearchQuery = weddingVendorResearchQueryForDecision(item);
  if (vendorResearchQuery) return `Research ${vendorResearchQuery} before choosing`;
  if (item.sourceSurface === "approval_queue") return "Review and approve only if it looks right";
  if (item.sourceSurface === "decision_queue") return "Compare the options and choose one";
  if (item.sourceSurface === "calendar") return "Open the date and confirm the next step";
  if (item.evidenceLabels.some((label) => /payment|budget/i.test(label))) return "Open Budget and check the money detail";
  if (item.evidenceLabels.some((label) => /guest|seating/i.test(label))) return "Open the related guest or seating task";
  return "Open the task and decide the next step";
}

function compareLabel(item: WeddingPersonalOsRankedItem): string {
  if (weddingVendorResearchQueryForDecision(item)) return "Research vendors";
  if (item.sourceSurface === "approval_queue") return "Review approval";
  if (item.sourceSurface === "calendar") return "View date";
  if (item.sourceSurface === "tasks") return "Open task";
  return "Compare";
}

/**
 * Small, deterministic routing for decisions that cannot sensibly be made
 * until a vendor category has been researched.  This deliberately stays
 * separate from recommendations: it creates a search surface, never a
 * vendor choice or an enquiry.
 */
export function weddingVendorResearchQueryForDecision(item: Pick<WeddingPersonalOsRankedItem, "title" | "evidenceLabels">): string | null {
  const text = `${item.title} ${(item.evidenceLabels ?? []).join(" ")}`.toLowerCase();
  if (/\b(ring|rings|jewell?er|jewell?ry|wedding band)\b/.test(text)) return "wedding ring jewellers";
  // Do not hijack a payment, contract, or calendar decision merely because it
  // mentions a venue or caterer. Other categories become research work only
  // when the decision itself is about finding or choosing that supplier.
  if (!/\b(choose|find|research|search|shortlist|compare|select|book)\b/.test(text)
    && !/vendor research timing|vendor search freshness/.test(text)) return null;
  if (/\b(photo|photographer|photography)\b/.test(text)) return "wedding photographers";
  if (/\b(florist|floral|flowers?)\b/.test(text)) return "wedding florists";
  if (/\b(caterer|catering|menu)\b/.test(text)) return "wedding caterers";
  if (/\b(venue|reception)\b/.test(text)) return "wedding venues";
  return null;
}

export function buildWeddingDecisionFocusItemCard(item: WeddingPersonalOsRankedItem): WeddingDecisionFocusItemCard {
  return {
    id: item.id,
    item,
    title: item.title,
    neededByLabel: neededByLabel(item),
    whyNowLabel: compactSentence(item.explanation, "This is worth checking before the planner narrows the next step."),
    checkedLabel: checkedLabel(item),
    recommendedActionLabel: recommendedActionLabel(item),
    compareLabel: compareLabel(item),
  };
}

export function buildWeddingDecisionFocusDisplayState(input: {
  relief: WeddingDecisionLoadReliefState;
  locallyDeferredIds?: ReadonlySet<string> | null;
}): WeddingDecisionFocusDisplayState {
  const locallyDeferredIds = input.locallyDeferredIds ?? new Set<string>();
  // Older saved projections could contain a larger focus limit.  Enforce the
  // product limit at the presentation boundary too, so a refresh cannot turn
  // the daily focus back into an endless stack of cards.
  const visibleFocusItems = input.relief.focusItems
    .filter((item) => !locallyDeferredIds.has(item.id))
    .slice(0, WEDDING_DAILY_DECISION_LIMIT);
  return {
    visibleFocusItems,
    itemCards: visibleFocusItems.map(buildWeddingDecisionFocusItemCard),
    visibleCount: visibleFocusItems.length,
    summaryLabel: visibleFocusItems.length > 0
      ? input.relief.summaryLabel
      : "No decision-heavy wedding items need focus right now.",
    savedForLaterLabel: locallyDeferredIds.size > 0
      ? "Saved for later. OmnyID will bring it back when the date gets close or something changes."
      : null,
    reviewDisabled: visibleFocusItems.length === 0,
  };
}
