// @locs-version: 2.0
import type { WeddingTemplateFollowUpDraftInput } from "@/lib/weddingTemplateFollowUpLocalState";

export type WeddingNeedToKnowExtractedSlot =
  | "date_or_season"
  | "location"
  | "guest_count"
  | "budget_comfort"
  | "priorities"
  | "noim_status"
  | "celebrant_path";

export type WeddingNeedToKnowExtractionState = {
  draft: WeddingTemplateFollowUpDraftInput;
  capturedSlots: WeddingNeedToKnowExtractedSlot[];
  confidenceLabels: string[];
  needsReviewLabels: string[];
  canGenerateFollowUp: boolean;
  source: "conversation";
};

export type WeddingNeedToKnowExtractionInput = {
  text?: string | null;
  responseWorkspaceId: string;
  existingDraft?: WeddingTemplateFollowUpDraftInput | null;
  nowIso?: string | null;
};

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const SEASONS = "spring|summer|autumn|fall|winter";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : "")
    .join(" ");
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function baseDraft(input: WeddingNeedToKnowExtractionInput): WeddingTemplateFollowUpDraftInput {
  const existing: Partial<WeddingTemplateFollowUpDraftInput> = input.existingDraft ?? {};
  return {
    responseWorkspaceId: input.responseWorkspaceId,
    dateOrSeason: clean(existing.dateOrSeason),
    location: clean(existing.location),
    guestCount: clean(existing.guestCount),
    budgetComfort: clean(existing.budgetComfort),
    prioritiesCsv: clean(existing.prioritiesCsv),
    vendorCategoryIds: existing.vendorCategoryIds ?? [],
    vowPreference: existing.vowPreference === "standard" || existing.vowPreference === "create" || existing.vowPreference === "undecided"
      ? existing.vowPreference
      : "",
    vowStyle: clean(existing.vowStyle),
    relationshipFactsCsv: clean(existing.relationshipFactsCsv),
    vowChecklistCsv: clean(existing.vowChecklistCsv),
    noimDownloaded: existing.noimDownloaded === "yes" || existing.noimDownloaded === "no" || existing.noimDownloaded === "unknown"
      ? existing.noimDownloaded
      : "",
    celebrantPath: clean(existing.celebrantPath),
    requested: existing.requested === true,
    nowIso: clean(input.nowIso) || existing.nowIso,
  };
}

function extractDateOrSeason(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];

  const dayMonthYear = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})\\s+(20\\d{2})\\b`, "i"));
  if (dayMonthYear?.[1] && dayMonthYear[2] && dayMonthYear[3]) {
    return `${dayMonthYear[1]} ${titleCase(dayMonthYear[2])} ${dayMonthYear[3]}`;
  }

  const monthYear = text.match(new RegExp(`\\b(${MONTHS})\\s+(20\\d{2})\\b`, "i"));
  if (monthYear?.[1] && monthYear[2]) return `${titleCase(monthYear[1])} ${monthYear[2]}`;

  const season = text.match(new RegExp(`\\b(${SEASONS})\\s+(20\\d{2})\\b`, "i"));
  if (season?.[1] && season[2]) return `${titleCase(season[1] === "fall" ? "autumn" : season[1])} ${season[2]}`;

  return null;
}

function extractLocation(text: string): string | null {
  const match = text.match(/\b(?:in|at|around|near|location is|venue is)\s+([A-Z][A-Za-z .'-]+(?:\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia))?)\b/);
  if (!match?.[1]) return null;
  const value = clean(match[1]
    .replace(/\s+\b(?:for|with|and|on|from|budget|priorities)\b.*$/i, "")
    .replace(/\b(?:for|with|and|on|in|at)$/i, ""));
  return value.length >= 3 ? value : null;
}

function extractGuestCount(text: string): string | null {
  const range = text.match(/\b(?:about|around|roughly|approx(?:imately)?\s+)?(\d{1,4}\s*-\s*\d{1,4})\s+(?:guests|people|attendees)\b/i);
  if (range?.[1]) return range[1].replace(/\s+/g, "");
  const count = text.match(/\b(?:about|around|roughly|approx(?:imately)?\s+|under\s+|less than\s+|up to\s+)?(\d{1,4})\s+(?:guests|people|attendees)\b/i);
  if (!count?.[1]) return null;
  const prefix = text.slice(Math.max(0, count.index ?? 0), (count.index ?? 0) + 18).toLowerCase();
  if (prefix.includes("under")) return `under ${count[1]}`;
  if (prefix.includes("less than")) return `less than ${count[1]}`;
  if (prefix.includes("up to")) return `up to ${count[1]}`;
  return count[1];
}

function extractBudget(text: string): string | null {
  const amount = text.match(/\b(?:budget(?: is| around| approx(?:imately)?)?|spend)\s*(?:is|around|approx(?:imately)?)?\s*(\$?\d[\d,]*(?:k|K)?)\b/i);
  if (amount?.[1]) return amount[1].startsWith("$") ? amount[1] : `Budget ${amount[1]}`;
  const comfort = text.match(/\b(keep it lean|low budget|tight budget|mid[- ]range|moderate budget|flexible budget|premium|luxury)\b/i);
  return comfort?.[1] ? comfort[1] : null;
}

function extractPriorities(text: string): string | null {
  const match = text.match(/\b(?:priorities are|top priorities are|top priorities:|priority is|we care most about)\s+([^.;\n]+)/i);
  if (!match?.[1]) return null;
  const values = match[1]
    .split(/,|\band\b/i)
    .map(clean)
    .filter(Boolean)
    .slice(0, 6);
  return values.length ? values.join(", ") : null;
}

function extractNoim(text: string): "" | "yes" | "no" | "unknown" {
  if (!/\bNOIM\b|Notice of Intended Marriage/i.test(text)) return "";
  if (/\b(?:not sure|unsure|don't know|do not know|unknown)\b/i.test(text)) return "unknown";
  if (/\b(?:haven't|have not|not downloaded|need to download|still need)\b/i.test(text)) return "no";
  if (/\b(?:downloaded|have the|already have|completed)\b/i.test(text)) return "yes";
  return "unknown";
}

function extractCelebrantPath(text: string): string | null {
  if (/\b(?:own|our|my)\s+(?:authorised\s+)?(?:marriage\s+)?celebrant\b/i.test(text)) return "own_celebrant";
  if (/\b(?:registry|public)\s+(?:style\s+)?(?:celebrant|ceremony|option)/i.test(text)) return "public_or_registry_celebrant";
  if (/\b(?:compare|need|find|choose|options for)\s+(?:both\s+)?(?:celebrants?|registry)/i.test(text)) return "need_options";
  return null;
}

function hasMinimumPlanningContext(draft: WeddingTemplateFollowUpDraftInput): boolean {
  return Boolean(clean(draft.dateOrSeason) && clean(draft.location) && clean(draft.guestCount));
}

export function buildWeddingNeedToKnowExtractionState(
  input: WeddingNeedToKnowExtractionInput,
): WeddingNeedToKnowExtractionState {
  const text = clean(input.text);
  const draft = baseDraft(input);
  const capturedSlots: WeddingNeedToKnowExtractedSlot[] = [];
  const needsReviewLabels: string[] = [];

  const dateOrSeason = extractDateOrSeason(text);
  if (dateOrSeason) {
    draft.dateOrSeason = dateOrSeason;
    capturedSlots.push("date_or_season");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOrSeason)) {
      needsReviewLabels.push("Date or season is useful for planning, but exact calendar reminders still need a confirmed date.");
    }
  }

  const location = extractLocation(text);
  if (location) {
    draft.location = location;
    capturedSlots.push("location");
  }

  const guestCount = extractGuestCount(text);
  if (guestCount) {
    draft.guestCount = guestCount;
    capturedSlots.push("guest_count");
    if (/\b(?:under|less than|up to|-)\b/i.test(guestCount)) {
      needsReviewLabels.push("Guest count is approximate, so capacity and catering recommendations should stay flexible.");
    }
  }

  const budget = extractBudget(text);
  if (budget) {
    draft.budgetComfort = budget;
    capturedSlots.push("budget_comfort");
  }

  const priorities = extractPriorities(text);
  if (priorities) {
    draft.prioritiesCsv = priorities;
    capturedSlots.push("priorities");
  }

  const noim = extractNoim(text);
  if (noim) {
    draft.noimDownloaded = noim;
    capturedSlots.push("noim_status");
  }

  const celebrantPath = extractCelebrantPath(text);
  if (celebrantPath) {
    draft.celebrantPath = celebrantPath;
    capturedSlots.push("celebrant_path");
  }

  return {
    draft,
    capturedSlots: unique(capturedSlots),
    confidenceLabels: unique(capturedSlots).map((slot) => `Captured ${slot.replace(/_/g, " ")} from conversation text.`),
    needsReviewLabels,
    canGenerateFollowUp: hasMinimumPlanningContext(draft),
    source: "conversation",
  };
}
