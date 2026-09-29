// @locs-version: 2.0
import type { WeddingTemplateFollowUpDraftInput } from "@/lib/weddingTemplateFollowUpLocalState";

export type WeddingNeedToKnowExtractedSlot =
  | "date_or_season"
  | "location"
  | "guest_count"
  | "budget_comfort"
  | "priorities"
  | "atmosphere"
  | "image_links"
  | "couple_names"
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

function yearForRelativeLabel(label: string, nowIso?: string | null): string | null {
  const cleaned = clean(label).toLowerCase();
  const currentYear = (() => {
    const raw = clean(nowIso);
    const parsed = raw ? new Date(raw) : new Date();
    return Number.isFinite(parsed.getTime()) ? parsed.getFullYear() : new Date().getFullYear();
  })();
  if (/\bnext year\b/.test(cleaned)) return String(currentYear + 1);
  if (/\bthis year\b/.test(cleaned)) return String(currentYear);
  return null;
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
    atmosphereDescription: clean(existing.atmosphereDescription),
    inspirationImageUrlsText: clean(existing.inspirationImageUrlsText),
    coupleNames: clean(existing.coupleNames),
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

function extractDateOrSeason(text: string, nowIso?: string | null): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];

  const dayMonthYear = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})\\s+(20\\d{2})\\b`, "i"));
  if (dayMonthYear?.[1] && dayMonthYear[2] && dayMonthYear[3]) {
    return `${dayMonthYear[1]} ${titleCase(dayMonthYear[2])} ${dayMonthYear[3]}`;
  }

  const monthYear = text.match(new RegExp(`\\b(${MONTHS})\\s+(20\\d{2})\\b`, "i"));
  if (monthYear?.[1] && monthYear[2]) return `${titleCase(monthYear[1])} ${monthYear[2]}`;

  const relativeMonth = text.match(new RegExp(`\\b(${MONTHS})\\s+((?:next|this)\\s+year)\\b`, "i"));
  if (relativeMonth?.[1] && relativeMonth[2]) {
    const year = yearForRelativeLabel(relativeMonth[2], nowIso);
    if (year) return `${titleCase(relativeMonth[1])} ${year}`;
  }

  const season = text.match(new RegExp(`\\b(${SEASONS})\\s+(20\\d{2})\\b`, "i"));
  if (season?.[1] && season[2]) return `${titleCase(season[1] === "fall" ? "autumn" : season[1])} ${season[2]}`;

  const relativeSeason = text.match(new RegExp(`\\b(${SEASONS})\\s+((?:next|this)\\s+year)\\b`, "i"));
  if (relativeSeason?.[1] && relativeSeason[2]) {
    const year = yearForRelativeLabel(relativeSeason[2], nowIso);
    if (year) return `${titleCase(relativeSeason[1] === "fall" ? "autumn" : relativeSeason[1])} ${year}`;
  }

  return null;
}

function extractLocation(text: string): string | null {
  const matches = [...text.matchAll(/\b(?:in|at|around|near|location is|venue is)\s+([A-Z][A-Za-z .'-]+(?:\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia))?)\b/g)];
  for (const match of matches.reverse()) {
    if (!match[1]) continue;
    const nested = match[1].split(/\s+\b(?:in|at|around|near)\s+(?=[A-Z])/i).at(-1) ?? match[1];
    const value = clean(nested
      .replace(/\s+\b(?:for|with|and|on|from|expect|budget|priorities|guests?|people|attendees)\b.*$/i, "")
      .replace(/\b(?:for|with|and|on|in|at)$/i, "")
      .replace(/[.,;:]+$/g, ""));
    if (value.length < 3) continue;
    if (/\b(?:style|vibe|atmosphere|feeling|mood|theme|aesthetic)\b/i.test(value)) continue;
    return value;
  }
  return null;
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
  const amount = text.match(/\b(?:budget|spend)\b[^.\n$\d]{0,20}(\$?\d[\d,]*(?:\.\d+)?(?:\s*[kK])?)\b/i);
  if (amount?.[1]) return amount[1].startsWith("$") ? amount[1] : `Budget ${amount[1]}`;
  const comfort = text.match(/\b(keep it lean|low budget|tight budget|mid[- ]range|moderate budget|flexible budget|premium|luxury)\b/i);
  return comfort?.[1] ? comfort[1] : null;
}

// Other slot markers that may appear later in the same sentence as the priorities
// clause (e.g. "priorities are food and photos, NOIM not downloaded, need celebrant
// options"): capture stops at the first one so it doesn't swallow unrelated slots.
const PRIORITIES_STOP_MARKERS = /,?\s*\b(?:NOIM|celebrant|budget|guests?|venue is|location is)\b/i;

function extractPriorities(text: string): string | null {
  const match = text.match(/\b(?:priorities are|top priorities are|top priorities:|priority is|we care most about)\s+([^.;\n]+)/i);
  if (!match?.[1]) return null;
  const stopIndex = match[1].search(PRIORITIES_STOP_MARKERS);
  const scoped = stopIndex >= 0 ? match[1].slice(0, stopIndex) : match[1];
  const values = scoped
    .split(/,|\band\b/i)
    .map(clean)
    .filter(Boolean)
    .slice(0, 6);
  return values.length ? values.join(", ") : null;
}

function extractAtmosphere(text: string): string | null {
  const labelled = text.match(/\b(?:feels like|feel like|vibe is|atmosphere is|style is|vision is|we want|we would like)\s+([^.\n;]+)/i);
  if (labelled?.[1]) return clean(labelled[1]).slice(0, 280);
  if (!/\b(?:wedding|ceremony|reception|day|celebration|dinner)\b/i.test(text)) return null;
  const sentence = text.match(/\b(?:romantic|intimate|relaxed|modern|classic|garden|coastal|formal|casual|joyful|elegant|minimal|colourful|colorful|bohemian|rustic)[^.\n;]{0,220}/i);
  return sentence?.[0] ? clean(sentence[0]) : null;
}

function extractImageLinks(text: string): string[] {
  const links = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  return unique(links.map((link) => clean(link.replace(/[.,;]+$/g, ""))).filter(Boolean)).slice(0, 10);
}

function extractCoupleNames(text: string): string | null {
  const labelled = text.match(/\b(?:couple|partners?|bride and groom|bride\/groom)\s*(?:are|:|-)\s*([A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})?)\s+(?:and|&)\s+([A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})?)\b/i);
  if (labelled?.[1] && labelled[2]) return `${clean(labelled[1])} and ${clean(labelled[2])}`;
  const firstPerson = text.match(/\b(?:we are|we're|for)\s+([A-Z][a-z]{1,30})\s+(?:and|&)\s+([A-Z][a-z]{1,30})\b/i);
  if (firstPerson?.[1] && firstPerson[2]) return `${clean(firstPerson[1])} and ${clean(firstPerson[2])}`;
  return null;
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

  const dateOrSeason = extractDateOrSeason(text, input.nowIso);
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

  const atmosphere = extractAtmosphere(text);
  if (atmosphere) {
    draft.atmosphereDescription = atmosphere;
    capturedSlots.push("atmosphere");
  }

  const imageLinks = extractImageLinks(text);
  if (imageLinks.length > 0) {
    draft.inspirationImageUrlsText = imageLinks.join("\n");
    capturedSlots.push("image_links");
    needsReviewLabels.push("Inspiration links are saved as user-provided references; an approved agent should fetch or inspect them before using visual details.");
  }

  const coupleNames = extractCoupleNames(text);
  if (coupleNames) {
    draft.coupleNames = coupleNames;
    capturedSlots.push("couple_names");
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
