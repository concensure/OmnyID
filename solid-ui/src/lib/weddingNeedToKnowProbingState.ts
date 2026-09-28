// @locs-version: 2.0
export type WeddingProbeSlot =
  | "date_or_season"
  | "location"
  | "guest_count"
  | "budget_comfort"
  | "top_priorities"
  | "noim_downloaded"
  | "celebrant_path"
  | "vendor_categories"
  | "vendor_preferences"
  | "photography_scope"
  | "vow_preference"
  | "vow_style"
  | "cultural_or_religious_requirements"
  | "accessibility_requirements"
  | "dietary_requirements"
  | "family_or_stakeholder_roles";

export type WeddingProbeSensitivity = "low" | "medium" | "high";

export type WeddingDecisionContext =
  | "first_plan"
  | "venue_shortlist"
  | "vendor_shortlist"
  | "australian_legal_setup"
  | "ceremony_structure"
  | "catering"
  | "guest_logistics"
  | "budget_tradeoff"
  | "run_sheet";

export type WeddingPlanningContext = {
  dateOrSeason?: string | null;
  location?: string | null;
  guestCount?: number | string | null;
  budgetComfort?: string | null;
  topPriorities?: readonly string[] | null;
  atmosphereDescription?: string | null;
  inspirationImageUrls?: readonly string[] | null;
  countryCode?: string | null;
  legalJurisdiction?: string | null;
  noimDownloaded?: boolean | "yes" | "no" | "unknown" | null;
  celebrantPath?: "own_celebrant" | "public_or_registry_celebrant" | "need_options" | string | null;
  vendorCategories?: readonly string[] | null;
  vendorPreferences?: string | null;
  photographyScope?: string | null;
  vowPreference?: "undecided" | "standard" | "create" | string | null;
  vowStyle?: string | null;
  relationshipFactLabels?: readonly string[] | null;
  vowChecklistItems?: readonly string[] | null;
  culturalOrReligiousRequirements?: string | null;
  accessibilityRequirements?: string | null;
  dietaryRequirements?: string | null;
  familyOrStakeholderRoles?: string | null;
  decisionContext?: WeddingDecisionContext | null;
};

export type WeddingProbeQuestion = {
  slot: WeddingProbeSlot;
  question: string;
  reason: string;
  improves: string;
  sensitivity: WeddingProbeSensitivity;
  suggestedAnswers: string[];
  sourceLabels: string[];
};

export type WeddingNeedToKnowProbingState = {
  isReadyForFirstRecommendations: boolean;
  nextQuestion: WeddingProbeQuestion | null;
  missingSlots: WeddingProbeSlot[];
  answeredSlots: WeddingProbeSlot[];
  deferredSensitiveSlots: WeddingProbeSlot[];
  progressLabel: string;
};

type WeddingProbeRule = {
  slot: WeddingProbeSlot;
  sensitivity: WeddingProbeSensitivity;
  isAnswered: (context: WeddingPlanningContext) => boolean;
  shouldAsk: (context: WeddingPlanningContext) => boolean;
  question: string;
  reason: string;
  improves: string;
  suggestedAnswers: string[];
  sourceLabels?: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasText(value: unknown): boolean {
  return clean(value).length > 0;
}

function hasListValue(value: readonly string[] | null | undefined): boolean {
  return Array.isArray(value) && value.some(hasText);
}

function needsPhotographyScope(context: WeddingPlanningContext): boolean {
  return (context.vendorCategories ?? []).some((category) => /photo|photograph|videograph/i.test(category));
}

function hasGuestCount(value: WeddingPlanningContext["guestCount"]): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return hasText(value);
}

function contextIs(context: WeddingPlanningContext, values: readonly WeddingDecisionContext[]): boolean {
  return values.includes(context.decisionContext ?? "first_plan");
}

function isAustralianWeddingContext(context: WeddingPlanningContext): boolean {
  const country = clean(context.countryCode).toUpperCase();
  const jurisdiction = clean(context.legalJurisdiction).toLowerCase();
  const location = clean(context.location).toLowerCase();
  return country === "AU"
    || jurisdiction.includes("australia")
    || location.includes("australia")
    || /\b(nsw|vic|qld|wa|sa|tas|act|nt)\b/i.test(location);
}

function hasNoimAnswer(value: WeddingPlanningContext["noimDownloaded"]): boolean {
  if (typeof value === "boolean") return true;
  const cleaned = clean(value).toLowerCase();
  return cleaned === "yes" || cleaned === "no" || cleaned === "unknown";
}

const AU_MARRIAGE_SOURCE_LABELS = [
  "Attorney-General's Department: Notice of Intended Marriage form",
  "Attorney-General's Department: Register of Marriage Celebrants",
];

const PROBE_RULES: WeddingProbeRule[] = [
  {
    slot: "date_or_season",
    sensitivity: "low",
    isAnswered: (context) => hasText(context.dateOrSeason),
    shouldAsk: () => true,
    question: "Do you have a wedding date, month, or season in mind?",
    reason: "The date controls legal reminders, vendor availability assumptions, weather risk, and the planning timeline.",
    improves: "timeline, calendar events, venue/vendor shortlist, run sheet",
    suggestedAnswers: ["Exact date", "Target month", "Just a season"],
  },
  {
    slot: "location",
    sensitivity: "low",
    isAnswered: (context) => hasText(context.location),
    shouldAsk: () => true,
    question: "Which city, region, or venue area should I plan around?",
    reason: "Location is needed before map cards, venue comparisons, transport, accommodation, and vendor research are useful.",
    improves: "maps, venues, vendors, guest logistics",
    suggestedAnswers: ["City/region", "Specific venue", "Still deciding"],
  },
  {
    slot: "guest_count",
    sensitivity: "low",
    isAnswered: (context) => hasGuestCount(context.guestCount),
    shouldAsk: () => true,
    question: "Roughly how many guests should I plan for?",
    reason: "Guest count constrains venue capacity, catering, seating, transport, budget, and run-sheet timing.",
    improves: "budget, venues, catering, seating, run sheet",
    suggestedAnswers: ["Under 50", "50-100", "100-180"],
  },
  {
    slot: "budget_comfort",
    sensitivity: "medium",
    isAnswered: (context) => hasText(context.budgetComfort),
    shouldAsk: (context) => contextIs(context, ["first_plan", "venue_shortlist", "vendor_shortlist", "budget_tradeoff"]),
    question: "What budget range or comfort level should I stay within?",
    reason: "Budget helps rank options and avoid recommending vendors that create stress or unrealistic tradeoffs.",
    improves: "budget, vendor ranking, tradeoffs",
    suggestedAnswers: ["Keep it lean", "Mid-range", "Flexible for priorities"],
  },
  {
    slot: "top_priorities",
    sensitivity: "medium",
    isAnswered: (context) => hasListValue(context.topPriorities),
    shouldAsk: (context) => contextIs(context, ["first_plan", "venue_shortlist", "vendor_shortlist", "budget_tradeoff"]),
    question: "What are your top three priorities for the wedding?",
    reason: "Priorities let the agent explain tradeoffs instead of optimizing for a generic wedding checklist.",
    improves: "recommendations, budget tradeoffs, decision cards",
    suggestedAnswers: ["Food", "Photos", "Venue", "Music", "Low stress"],
  },
  {
    slot: "noim_downloaded",
    sensitivity: "medium",
    isAnswered: (context) => hasNoimAnswer(context.noimDownloaded),
    shouldAsk: (context) => isAustralianWeddingContext(context)
      && contextIs(context, ["first_plan", "australian_legal_setup", "ceremony_structure", "run_sheet"]),
    question: "Have you downloaded the Notice of Intended Marriage form yet?",
    reason: "For Australian weddings, the planner should track whether the NOIM exists before creating legal reminder tasks. The agent can point to the official form, but must not claim to lodge it for the couple.",
    improves: "legal checklist, celebrant coordination, calendar reminders, task queue",
    suggestedAnswers: ["Yes, downloaded", "No, show official form", "Not sure"],
    sourceLabels: AU_MARRIAGE_SOURCE_LABELS,
  },
  {
    slot: "celebrant_path",
    sensitivity: "medium",
    isAnswered: (context) => hasText(context.celebrantPath),
    shouldAsk: (context) => isAustralianWeddingContext(context)
      && contextIs(context, ["first_plan", "australian_legal_setup", "ceremony_structure", "vendor_shortlist", "run_sheet"]),
    question: "Will you use your own authorised marriage celebrant, or should I help compare public/registry-style celebrant options?",
    reason: "Australian marriage planning depends on an authorised celebrant path. The planner should surface how, when, where, and likely fee/cost questions without pretending to book or verify availability.",
    improves: "celebrant shortlist, legal reminders, ceremony plan, email drafts",
    suggestedAnswers: ["We have our own celebrant", "Help find public/registry options", "Compare both"],
    sourceLabels: AU_MARRIAGE_SOURCE_LABELS,
  },
  {
    slot: "vendor_categories",
    sensitivity: "low",
    isAnswered: (context) => hasListValue(context.vendorCategories),
    shouldAsk: (context) => contextIs(context, ["vendor_shortlist"]),
    question: "Which vendor types should I search for now?",
    reason: "Vendor search is weak without explicit categories. The planner needs to know whether to search celebrants, venues, catering, bands, DJs, florists, hair and makeup, transport, photography, videography, or other vendors.",
    improves: "vendor search, shortlist relevance, budget tradeoffs",
    suggestedAnswers: ["Photographer", "Band or DJ", "Caterer", "Florist", "Hair and makeup"],
  },
  {
    slot: "vendor_preferences",
    sensitivity: "medium",
    isAnswered: (context) => hasText(context.vendorPreferences),
    shouldAsk: (context) => contextIs(context, ["vendor_shortlist"]),
    question: "What preferences should I use to narrow those vendors?",
    reason: "The agent needs style, budget comfort, inclusions, communication preferences, travel radius, cultural fit, accessibility, and deal-breakers before ranking vendors.",
    improves: "vendor fit, ranking, email drafts, decision cards",
    suggestedAnswers: ["Natural/editorial style", "Low-stress communication", "Within 1 hour of venue", "Transparent package pricing"],
  },
  {
    slot: "photography_scope",
    sensitivity: "medium",
    isAnswered: (context) => hasText(context.photographyScope),
    shouldAsk: (context) => contextIs(context, ["vendor_shortlist"]) && needsPhotographyScope(context),
    question: "For photography, do you mean wedding-photo style inspiration, day-of photography coverage, or both?",
    reason: "Wedding photo style and wedding-day photography service are different searches. The planner should not mix inspiration, shot-list planning, package coverage, second shooter needs, and vendor booking into one generic photography result.",
    improves: "photography search, shot list, package comparison, vendor emails",
    suggestedAnswers: ["Style inspiration", "Day-of coverage", "Both"],
  },
  {
    slot: "vow_preference",
    sensitivity: "medium",
    isAnswered: (context) => hasText(context.vowPreference) && clean(context.vowPreference).toLowerCase() !== "undecided",
    shouldAsk: (context) => contextIs(context, ["ceremony_structure", "run_sheet"]),
    question: "Do you want to create personal vows, or use a standard vow?",
    reason: "Vows affect ceremony scripting and should be raised early enough to avoid last-minute generic copy.",
    improves: "ceremony structure, vow checklist, run sheet, task queue",
    suggestedAnswers: ["Create personal vows", "Use a standard vow", "Decide later"],
  },
  {
    slot: "vow_style",
    sensitivity: "medium",
    isAnswered: (context) => clean(context.vowPreference).toLowerCase() !== "create" || hasText(context.vowStyle),
    shouldAsk: (context) => clean(context.vowPreference).toLowerCase() === "create"
      && contextIs(context, ["ceremony_structure", "run_sheet"]),
    question: "Which vow style should I use for inspiration?",
    reason: "A selected style lets the agent provide a useful inspiration vow without pretending to know private relationship details.",
    improves: "vow draft, ceremony tone, checklist",
    suggestedAnswers: ["Warm and personal", "Light and funny", "Classic and formal", "Short and modern", "Story-based"],
  },
  {
    slot: "cultural_or_religious_requirements",
    sensitivity: "high",
    isAnswered: (context) => hasText(context.culturalOrReligiousRequirements),
    shouldAsk: (context) => contextIs(context, ["ceremony_structure", "vendor_shortlist", "run_sheet"]),
    question: "Are there cultural or religious requirements I should respect for this ceremony or vendor choice?",
    reason: "This is only needed when ceremony structure, specialist vendors, timing, outfits, food, or family rituals are being planned.",
    improves: "ceremony structure, vendor fit, run sheet, family coordination",
    suggestedAnswers: ["Yes, I will describe them", "No special requirements", "Ask later"],
  },
  {
    slot: "accessibility_requirements",
    sensitivity: "high",
    isAnswered: (context) => hasText(context.accessibilityRequirements),
    shouldAsk: (context) => contextIs(context, ["venue_shortlist", "guest_logistics", "run_sheet"]),
    question: "Are there accessibility needs I should account for before recommending this venue or logistics plan?",
    reason: "Accessibility details are sensitive, so they should be requested only when they affect venue, transport, seating, or timing.",
    improves: "venue shortlist, transport, seating, guest logistics",
    suggestedAnswers: ["Mobility access", "Hearing/vision support", "Not sure yet"],
  },
  {
    slot: "dietary_requirements",
    sensitivity: "medium",
    isAnswered: (context) => hasText(context.dietaryRequirements),
    shouldAsk: (context) => contextIs(context, ["catering", "vendor_shortlist", "guest_logistics"]),
    question: "Are there dietary requirements I should use when evaluating catering or menu options?",
    reason: "Dietary details matter for caterer fit and guest safety, but are not needed for unrelated planning steps.",
    improves: "catering, vendor fit, guest list",
    suggestedAnswers: ["Vegetarian/vegan", "Halal/kosher", "Allergies", "Unknown"],
  },
  {
    slot: "family_or_stakeholder_roles",
    sensitivity: "high",
    isAnswered: (context) => hasText(context.familyOrStakeholderRoles),
    shouldAsk: (context) => contextIs(context, ["run_sheet", "ceremony_structure", "guest_logistics"]),
    question: "Who needs to be involved or kept informed for this part of the plan?",
    reason: "Stakeholder roles should be requested only when coordination, approvals, speeches, family rituals, or day-of tasks depend on them.",
    improves: "approvals, run sheet, communication drafts",
    suggestedAnswers: ["Partner", "Planner", "Family", "Vendors"],
  },
];

export function buildWeddingNeedToKnowProbingState(
  context: WeddingPlanningContext,
): WeddingNeedToKnowProbingState {
  const answeredSlots = PROBE_RULES
    .filter((rule) => rule.isAnswered(context))
    .map((rule) => rule.slot);
  const candidates = PROBE_RULES.filter((rule) => !rule.isAnswered(context));
  const askable = candidates.filter((rule) => rule.shouldAsk(context));
  const nextRule = askable[0] ?? null;
  const deferredSensitiveSlots = candidates
    .filter((rule) => rule.sensitivity === "high" && !rule.shouldAsk(context))
    .map((rule) => rule.slot);
  const missingSlots = askable.map((rule) => rule.slot);
  const nextQuestion = nextRule
    ? {
      slot: nextRule.slot,
      question: nextRule.question,
      reason: nextRule.reason,
      improves: nextRule.improves,
      sensitivity: nextRule.sensitivity,
      suggestedAnswers: nextRule.suggestedAnswers,
      sourceLabels: nextRule.sourceLabels ?? [],
    }
    : null;
  const coreAnswered = ["date_or_season", "location", "guest_count"].every((slot) =>
    answeredSlots.includes(slot as WeddingProbeSlot)
  );
  const isReadyForFirstRecommendations = coreAnswered && !nextQuestion;

  return {
    isReadyForFirstRecommendations,
    nextQuestion,
    missingSlots,
    answeredSlots,
    deferredSensitiveSlots,
    progressLabel: nextQuestion
      ? `Needs ${nextQuestion.slot.replace(/_/g, " ")}`
      : isReadyForFirstRecommendations ? "Ready for first recommendations" : "No blocking question for this step",
  };
}
