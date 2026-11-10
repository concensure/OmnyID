// @locs-version: 1.0
import type {
  WeddingDecisionLoadReliefState,
  WeddingPersonalOsRankedItem,
} from "@/lib/weddingPersonalOsProjectionState";

/** Only one card is presented, while the complete ranked queue remains available behind it. */
export const WEDDING_VISIBLE_DECISION_LIMIT = 1;

export type WeddingDecisionFocusDisplayState = {
  visibleFocusItems: WeddingPersonalOsRankedItem[];
  itemCards: WeddingDecisionFocusItemCard[];
  queuedFocusItems: WeddingPersonalOsRankedItem[];
  queuedItemCards: WeddingDecisionFocusItemCard[];
  remainingCount: number;
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
  const comparisonLabels = Array.isArray(item.actionMetadata?.vendor_comparison_top_choice_labels)
    ? item.actionMetadata.vendor_comparison_top_choice_labels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (comparisonLabels.length > 0) {
    const category = Array.isArray(item.actionMetadata?.vendor_search_categories)
      ? item.actionMetadata.vendor_search_categories.find((value): value is string => typeof value === "string" && value.trim().length > 0)
      : null;
    return `${comparisonLabels[0]} is the current recommended ${category?.replace(/_/g, " ") || "vendor"}; open the comparison to check the fit and alternatives.`;
  }
  if (/pending RSVP/i.test(item.title)) return "Send a warm, contextual RSVP reminder to the guest";
  if (/hen'?s night|hen party/i.test(item.title)) return "Use a preference-matched activity brief to choose the format before collecting money";
  if (/transport|access|guest logistics/i.test(item.title)) return "Review the saved route, access and transport findings before finalising guest logistics";
  const vendorResearchQuery = weddingVendorResearchQueryForDecision(item);
  if (vendorResearchQuery) return "Preparing a source-backed shortlist from your saved wedding preferences…";
  if (item.sourceSurface === "approval_queue") return "Review and approve only if it looks right";
  if (item.sourceSurface === "decision_queue") return "Compare the options and choose one";
  if (item.sourceSurface === "calendar") return "Open the date and confirm the next step";
  if (item.evidenceLabels.some((label) => /payment|budget/i.test(label))) return "Open Budget and check the money detail";
  if (item.evidenceLabels.some((label) => /guest|seating/i.test(label))) return "Open the related guest or seating task";
  return "Open the task and decide the next step";
}

function compareLabel(item: WeddingPersonalOsRankedItem): string {
  if (/pending RSVP/i.test(item.title)) return "Message guest";
  if (/hen'?s night|hen party/i.test(item.title)) return "View research";
  if (/transport|access|guest logistics/i.test(item.title)) return "Review findings";
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
  const isSupplierAction = /\b(choose|find|research|search|shortlist|compare|select|book)\b/.test(text)
    || (/\b(schedule|arrange|trial)\b/.test(text) && /\b(hair|makeup|make-up|beauty|stylist|artist)\b/.test(text));
  if (!isSupplierAction
    && !/vendor research timing|vendor search freshness/.test(text)) return null;
  if (/\b(photo|photographers?|photography)\b/.test(text)) return "wedding photographers";
  if (/\b(video|videographers?|videography)\b/.test(text)) return "wedding videographers";
  if (/\b(florists?|floral|flowers?)\b/.test(text)) return "wedding florists";
  if (/\b(caterers?|catering|menus?)\b/.test(text)) return "wedding caterers";
  if (/\b(hair|hairdressers?|hair stylists?|hairstylists?)\b/.test(text)) return "wedding hair stylists";
  if (/\b(makeup|make-up|beauty|makeup artists?)\b/.test(text)) return "wedding makeup artists";
  if (/\b(celebrants?|officiants?)\b/.test(text)) return "authorised wedding celebrants";
  if (/\b(djs?|bands?|live music|musicians?)\b/.test(text)) return "wedding music vendors";
  if (/\b(cakes?|bakers?|bakery)\b/.test(text)) return "wedding cake bakers";
  if (/\b(planners?|coordinators?)\b/.test(text)) return "wedding planners";
  if (/\b(transport|cars?|limousines?|shuttles?)\b/.test(text)) return "wedding transport vendors";
  if (/\b(stationery|invitations?|signage|calligraphers?)\b/.test(text)) return "wedding stationery vendors";
  if (/\b(venues?|reception)\b/.test(text)) return "wedding venues";
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
  locallyHiddenIds?: ReadonlySet<string> | null;
}): WeddingDecisionFocusDisplayState {
  const locallyDeferredIds = input.locallyDeferredIds ?? new Set<string>();
  const locallyHiddenIds = input.locallyHiddenIds ?? new Set<string>();
  const queuedFocusItems = input.relief.focusItems.filter((item) => !locallyDeferredIds.has(item.id) && !locallyHiddenIds.has(item.id));
  const visibleFocusItems = queuedFocusItems.slice(0, WEDDING_VISIBLE_DECISION_LIMIT);
  return {
    visibleFocusItems,
    itemCards: visibleFocusItems.map(buildWeddingDecisionFocusItemCard),
    queuedFocusItems,
    queuedItemCards: queuedFocusItems.map(buildWeddingDecisionFocusItemCard),
    remainingCount: Math.max(0, queuedFocusItems.length - visibleFocusItems.length),
    visibleCount: visibleFocusItems.length,
    summaryLabel: visibleFocusItems.length > 0
      ? queuedFocusItems.length === 1
        ? "One wedding action needs you now."
        : `One wedding action needs you now; ${queuedFocusItems.length - 1} ${queuedFocusItems.length === 2 ? "is" : "are"} ready next.`
      : "No decision-heavy wedding items need focus right now.",
    savedForLaterLabel: locallyDeferredIds.size > 0
      ? "Saved for later. OmnyID will bring it back when the date gets close or something changes."
      : null,
    reviewDisabled: visibleFocusItems.length === 0,
  };
}
