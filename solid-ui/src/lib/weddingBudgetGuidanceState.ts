// @locs-version: 1.0
import type { WeddingBudgetCategoryId } from "@/lib/weddingBudgetAllocationState";

export type WeddingBudgetCategoryGuidance = {
  lowShare: number;
  highShare: number;
  practicalTip: string;
};

export type WeddingBudgetCategoryGuidanceLabel = {
  rangeLabel: string;
  averageLabel: string;
  locationNote: string;
  practicalTip: string;
};

export const WEDDING_BUDGET_CATEGORY_GUIDANCE: Record<WeddingBudgetCategoryId, WeddingBudgetCategoryGuidance> = {
  venue_ceremony: {
    lowShare: 35,
    highShare: 50,
    practicalTip: "Check minimum spend, ceremony fee, furniture, cleaning, security, wet-weather backup, and what time you can access the space.",
  },
  catering_drinks: {
    lowShare: 25,
    highShare: 40,
    practicalTip: "Ask whether tax, service charge, staff meals, cake cutting, late-night snacks, and bar minimums are already included.",
  },
  photo_video: {
    lowShare: 8,
    highShare: 15,
    practicalTip: "Compare hours, second shooter, travel, editing time, album costs, raw-file policy, and overtime before choosing.",
  },
  attire_beauty: {
    lowShare: 5,
    highShare: 10,
    practicalTip: "Leave room for alterations, accessories, trials, touch-ups, travel fees, and outfits for pre-wedding events.",
  },
  flowers_decor: {
    lowShare: 5,
    highShare: 12,
    practicalTip: "Reusable ceremony flowers, venue-provided decor, candle rules, setup labour, and pack-down fees can change this quickly.",
  },
  entertainment_music: {
    lowShare: 5,
    highShare: 10,
    practicalTip: "Check ceremony audio, reception sound, MC duties, travel, overtime, meals, and whether lighting is included.",
  },
  other_misc: {
    lowShare: 5,
    highShare: 15,
    practicalTip: "Keep a buffer for stationery, transport, gifts, insurance, legal paperwork, tips, delivery, and last-minute fixes.",
  },
};

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
  const midpointShare = Math.round((guidance.lowShare + guidance.highShare) / 2);
  if (input.totalAmount <= 0) {
    return {
      rangeLabel: `For ${place}, start with ${shareLabel} of the total budget as a planning range.`,
      averageLabel: `A useful starting midpoint is about ${midpointShare}% once you enter a total budget.`,
      locationNote: weddingBudgetLocationMarketNote(input.locationLabel),
      practicalTip: guidance.practicalTip,
    };
  }
  const lowAmount = Math.round(input.totalAmount * guidance.lowShare / 100);
  const highAmount = Math.round(input.totalAmount * guidance.highShare / 100);
  const midpointAmount = Math.round(input.totalAmount * (guidance.lowShare + guidance.highShare) / 200);
  return {
    rangeLabel: `For ${place}, a practical planning range is ${shareLabel}: ${moneyLabel(lowAmount, input.currency)}-${moneyLabel(highAmount, input.currency)} from your total.`,
    averageLabel: `A simple midpoint to compare against is about ${moneyLabel(midpointAmount, input.currency)}.`,
    locationNote: weddingBudgetLocationMarketNote(input.locationLabel),
    practicalTip: guidance.practicalTip,
  };
}
