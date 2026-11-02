// @locs-version: 1.0
import type { WeddingBudgetCategoryId } from "@/lib/weddingBudgetAllocationState";
import budgetModel from "@/lib/wedding-budget-model.v1.json" with { type: "json" };

export type WeddingBudgetCategoryGuidance = {
  lowShare: number;
  targetShare: number;
  highShare: number;
  practicalTip: string;
};

export type WeddingBudgetCategoryGuidanceLabel = {
  rangeLabel: string;
  averageLabel: string;
  locationNote: string;
  practicalTip: string;
};

const PRACTICAL_TIPS: Record<WeddingBudgetCategoryId, string> = {
  venue_ceremony: "Check minimum spend, ceremony fee, furniture, cleaning, security, wet-weather backup, and what time you can access the space.",
  catering_drinks: "Ask whether tax, service charge, staff meals, cake cutting, late-night snacks, and bar minimums are already included.",
  photo_video: "Compare hours, second shooter, travel, editing time, album costs, raw-file policy, and overtime before choosing.",
  attire_beauty: "Leave room for alterations, accessories, trials, touch-ups, travel fees, and outfits for pre-wedding events.",
  flowers_decor: "Reusable ceremony flowers, venue-provided decor, candle rules, setup labour, and pack-down fees can change this quickly.",
  entertainment_music: "Check ceremony audio, reception sound, MC duties, travel, overtime, meals, and whether lighting is included.",
  other_misc: "Keep a buffer for stationery, transport, gifts, insurance, legal paperwork, tips, delivery, and last-minute fixes.",
};

type BudgetModelCategory = {
  id: string;
  lowShare: number;
  targetShare: number;
  highShare: number;
};

export const WEDDING_BUDGET_CATEGORY_GUIDANCE = Object.fromEntries(
  (budgetModel.categories as BudgetModelCategory[]).map((category) => [
    category.id,
    {
      lowShare: category.lowShare,
      targetShare: category.targetShare,
      highShare: category.highShare,
      practicalTip: PRACTICAL_TIPS[category.id as WeddingBudgetCategoryId],
    },
  ]),
) as Record<WeddingBudgetCategoryId, WeddingBudgetCategoryGuidance>;

export const WEDDING_BUDGET_MODEL_VERSION = budgetModel.version;
export const WEDDING_BUDGET_TARGET_TOTAL = Object.values(WEDDING_BUDGET_CATEGORY_GUIDANCE)
  .reduce((sum, category) => sum + category.targetShare, 0);

function moneyLabel(amount: number, currency: string): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function cleanLocationLabel(locationLabel?: string | null): string {
  const cleaned = locationLabel?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : "your wedding location";
}

export function weddingBudgetLocationMarketNote(locationLabel?: string | null): string {
  const place = cleanLocationLabel(locationLabel);
  const normalized = place.toLowerCase();
  if (/\b(sydney|melbourne|canberra)\b/.test(normalized)) {
    return `${place} can have higher venue minimums, labour costs, and peak-season pressure, so confirm inclusions before treating a quote as comparable.`;
  }
  if (/\b(brisbane|gold coast|sunshine coast|perth|adelaide)\b/.test(normalized)) {
    return `${place} pricing can vary sharply by season, travel time, and waterfront or destination-style locations.`;
  }
  if (/\b(hobart|darwin|regional|hunter|byron|blue mountains|yarra|barossa)\b/.test(normalized)) {
    return `${place} may need extra attention to travel fees, delivery windows, accommodation, and vendor availability.`;
  }
  return `Use ${place} as your planning baseline, then confirm quotes against guest count, date, travel, and inclusions.`;
}

export function buildWeddingBudgetCategoryGuidanceLabel(input: {
  categoryId: WeddingBudgetCategoryId;
  totalAmount: number;
  currency: string;
  locationLabel?: string | null;
}): WeddingBudgetCategoryGuidanceLabel {
  const guidance = WEDDING_BUDGET_CATEGORY_GUIDANCE[input.categoryId];
  const place = cleanLocationLabel(input.locationLabel);
  const shareLabel = `${guidance.lowShare}-${guidance.highShare}%`;
  const targetShare = guidance.targetShare;
  if (input.totalAmount <= 0) {
    return {
      rangeLabel: `For ${place}, start with ${shareLabel} of the total budget as a planning range.`,
      averageLabel: `The balanced starting target is ${targetShare}%; all category targets total 100%.`,
      locationNote: weddingBudgetLocationMarketNote(input.locationLabel),
      practicalTip: guidance.practicalTip,
    };
  }
  const lowAmount = Math.round(input.totalAmount * guidance.lowShare / 100);
  const highAmount = Math.round(input.totalAmount * guidance.highShare / 100);
  const targetAmount = Math.round(input.totalAmount * targetShare / 100);
  return {
    rangeLabel: `For ${place}, a practical planning range is ${shareLabel}: ${moneyLabel(lowAmount, input.currency)}-${moneyLabel(highAmount, input.currency)} from your total.`,
    averageLabel: `The balanced starting target is ${moneyLabel(targetAmount, input.currency)} (${targetShare}%); all category targets total 100%.`,
    locationNote: weddingBudgetLocationMarketNote(input.locationLabel),
    practicalTip: guidance.practicalTip,
  };
}
