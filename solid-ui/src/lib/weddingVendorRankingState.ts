// @locs-version: 2.0
// Wedding vendor ranking funnel: Eligibility -> Availability -> Personal Utility -> Evidence
// Confidence -> Actionability. Pure: no DOM, no API access.
//
// Two rules shape every stage. Unknown is never treated as bad (it lowers confidence and
// raises a next action, never a penalty), and fit is never multiplied by confidence, so a
// strong match with thin evidence is still surfaced and shown with its confidence.

export type WeddingVendorAttributeStatus = "known" | "estimated" | "unknown" | "not_applicable";

export type WeddingVendorAttributeEvidence = {
  status: WeddingVendorAttributeStatus;
  value: unknown;
  confidence: number | null;
  authority: string | null;
  source_url?: string | null;
  retrieved_at?: string | null;
  valid_until?: string | null;
};

export const WEDDING_VENDOR_AVAILABILITY_STATES = [
  "confirmed_available",
  "likely_available",
  "unknown",
  "enquiry_sent",
  "awaiting_response",
  "temporary_hold",
  "confirmed_unavailable",
  "booked",
] as const;
export type WeddingVendorAvailabilityState = (typeof WEDDING_VENDOR_AVAILABILITY_STATES)[number];

export type WeddingVendorAvailabilityEvidence = {
  state: WeddingVendorAvailabilityState;
  date_from?: string | null;
  date_to?: string | null;
  confidence?: number | null;
  checked_at?: string | null;
  valid_until?: string | null;
  source?: string | null;
  notes?: string | null;
};

/** Optional, additive evidence the server attaches to a vendor-search source. */
export type WeddingVendorSourceEvidence = {
  vendor_id?: string | null;
  source_kind?: string | null;
  category?: string | null;
  official_site_confidence?: number | null;
  rating?: number | null;
  review_count?: number | null;
  place_id?: string | null;
  attributes?: Record<string, WeddingVendorAttributeEvidence> | null;
  availability?: WeddingVendorAvailabilityEvidence | null;
};

export type WeddingVendorRankingSource = WeddingVendorSourceEvidence & {
  id: string;
  title: string;
  provider: string;
  url: string;
  websiteUrl: string | null;
  mapUrl: string | null;
  imageUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  instagramUrl: string | null;
  snippet: string;
};

export type WeddingVendorRankingRequirements = {
  guestCount?: string | null;
  budgetComfort?: string | null;
  dateOrSeason?: string | null;
  location?: string | null;
  preferences?: string | null;
  topPriorities?: readonly string[] | null;
  atmosphereDescription?: string | null;
  vendorCategories?: readonly string[] | null;
};

export type WeddingVendorRankingGroup = "booked" | "bookable" | "verify" | "excluded";
export type WeddingVendorConfidenceBucket = "high" | "medium" | "low";

export type WeddingVendorUtilityComponent = {
  id: string;
  label: string;
  weight: number;
  value: number;
  confidence: number;
  known: boolean;
  authority: string | null;
  retrievedAt: string | null;
};

export type WeddingVendorRankedCandidate = {
  id: string;
  rank: number;
  title: string;
  provider: string;
  url: string;
  websiteUrl: string | null;
  mapUrl: string | null;
  imageUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  instagramUrl: string | null;
  snippet: string;
  score: number;
  preferenceMatchLabel: string;
  situationFitLabel: string;
  verificationLabel: string;
  rationaleLabels: string[];
  group: WeddingVendorRankingGroup;
  fit: number | null;
  fitLabel: string;
  confidence: number;
  confidenceBucket: WeddingVendorConfidenceBucket;
  confidenceLabel: string;
  priorityMatchLabel: string;
  availabilityState: WeddingVendorAvailabilityState;
  availabilityLabel: string;
  vendorId: string | null;
  riskFlags: string[];
  unknownHardConstraints: string[];
  components: WeddingVendorUtilityComponent[];
  evoi: number | null;
  exclusionReason: string | null;
  hasOfficialWebsite: boolean;
};

export type WeddingVendorNextAction = {
  kind: "check_availability" | "confirm_attribute" | "resolve_official_site";
  vendorId: string | null;
  choiceId: string;
  label: string;
  reason: string;
};

export type WeddingVendorRankingResult = {
  booked: WeddingVendorRankedCandidate[];
  bookable: WeddingVendorRankedCandidate[];
  verify: WeddingVendorRankedCandidate[];
  excluded: Array<WeddingVendorRankedCandidate & { exclusionReason: string }>;
  nextActions: WeddingVendorNextAction[];
};

/** The extra fields a comparison card carries beyond the base vendor card. */
export type WeddingVendorRankingCardFields = {
  group: WeddingVendorRankingGroup;
  availabilityState: WeddingVendorAvailabilityState;
  availabilityLabel: string;
  confidenceLabel: string;
  vendorId: string | null;
  unknownConstraints: string[];
  weddingPlanId: string | null;
};

export type WeddingVendorAvailabilityUpdate = {
  wedding_plan_id: string;
  state: WeddingVendorAvailabilityState;
  date_from?: string | null;
  date_to?: string | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------------------------------
// Normalisation of server evidence
// ---------------------------------------------------------------------------------------------

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanNullable(value: unknown): string | null {
  return clean(value) || null;
}

const ATTRIBUTE_STATUSES = new Set<string>(["known", "estimated", "unknown", "not_applicable"]);

function normalizeAttributes(value: unknown): Record<string, WeddingVendorAttributeEvidence> | null {
  const raw = asRecord(value);
  const entries = Object.entries(raw).flatMap(([key, item]): Array<[string, WeddingVendorAttributeEvidence]> => {
    const attribute = asRecord(item);
    const status = clean(attribute.status);
    if (!key || !ATTRIBUTE_STATUSES.has(status)) return [];
    return [[key, {
      status: status as WeddingVendorAttributeStatus,
      value: attribute.value ?? null,
      confidence: finiteNumber(attribute.confidence),
      authority: cleanNullable(attribute.authority),
      source_url: cleanNullable(attribute.source_url),
      retrieved_at: cleanNullable(attribute.retrieved_at),
      valid_until: cleanNullable(attribute.valid_until),
    }]];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeAvailability(value: unknown): WeddingVendorAvailabilityEvidence | null {
  const raw = asRecord(value);
  const state = clean(raw.state);
  if (!(WEDDING_VENDOR_AVAILABILITY_STATES as readonly string[]).includes(state)) return null;
  return {
    state: state as WeddingVendorAvailabilityState,
    date_from: cleanNullable(raw.date_from),
    date_to: cleanNullable(raw.date_to),
    confidence: finiteNumber(raw.confidence),
    checked_at: cleanNullable(raw.checked_at),
    valid_until: cleanNullable(raw.valid_until),
    source: cleanNullable(raw.source),
    notes: cleanNullable(raw.notes),
  };
}

/** Returns only the evidence keys actually present, so sources without evidence stay unchanged. */
export function normalizeWeddingVendorSourceEvidence(record: Record<string, unknown>): WeddingVendorSourceEvidence {
  const evidence: WeddingVendorSourceEvidence = {};
  const vendorId = clean(record.vendor_id);
  const sourceKind = clean(record.source_kind);
  const category = clean(record.category);
  const placeId = clean(record.place_id);
  const siteConfidence = finiteNumber(record.official_site_confidence);
  const rating = finiteNumber(record.rating);
  const reviewCount = finiteNumber(record.review_count);
  const attributes = normalizeAttributes(record.attributes);
  const availability = normalizeAvailability(record.availability);
  if (vendorId) evidence.vendor_id = vendorId;
  if (sourceKind) evidence.source_kind = sourceKind;
  if (category) evidence.category = category;
  if (placeId) evidence.place_id = placeId;
  if (siteConfidence !== null) evidence.official_site_confidence = siteConfidence;
  if (rating !== null) evidence.rating = rating;
  if (reviewCount !== null) evidence.review_count = reviewCount;
  if (attributes) evidence.attributes = attributes;
  if (availability) evidence.availability = availability;
  return evidence;
}

const RANKING_GROUPS: readonly string[] = ["booked", "bookable", "verify", "excluded"];

/** Legacy artifacts carry none of these fields; they read as "verify" because their availability was never recorded. */
export function weddingVendorRankingCardFieldsFromRecord(record: Record<string, unknown>): WeddingVendorRankingCardFields {
  const group = clean(record.group);
  const state = clean(record.availability_state);
  const knownState = (WEDDING_VENDOR_AVAILABILITY_STATES as readonly string[]).includes(state);
  return {
    group: (RANKING_GROUPS.includes(group) ? group : "verify") as WeddingVendorRankingGroup,
    availabilityState: (knownState ? state : "unknown") as WeddingVendorAvailabilityState,
    availabilityLabel: clean(record.availability_label) || weddingVendorAvailabilityLabel(knownState ? state as WeddingVendorAvailabilityState : "unknown"),
    confidenceLabel: clean(record.confidence_label),
    vendorId: clean(record.vendor_id) || null,
    unknownConstraints: Array.isArray(record.unknown_constraints)
      ? record.unknown_constraints.map(clean).filter(Boolean).slice(0, 6)
      : [],
    weddingPlanId: clean(record.wedding_plan_id) || null,
  };
}

// ---------------------------------------------------------------------------------------------
// Requirement parsing
// ---------------------------------------------------------------------------------------------

function numbersIn(text: string): Array<{ value: number; index: number }> {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => ({
    value: Number(match[0].replace(/,/g, "")),
    index: match.index ?? 0,
  }));
}

const isYearLike = (value: number) => Number.isInteger(value) && value >= 1900 && value <= 2100;

/** "about 60" -> 60, "50-80" -> 80 (upper bound, so capacity checks are not under-called), "120 guests" -> 120. */
export function parseGuestCount(text: string | null | undefined): number | null {
  const source = clean(text);
  if (!source) return null;
  const range = source.match(/(\d{1,4})\s*(?:-|–|—|to|and)\s*(\d{1,4})/i);
  const candidates = range
    ? [Number(range[1]), Number(range[2])]
    : numbersIn(source).map((item) => item.value);
  const usable = candidates.filter((value) => Number.isFinite(value) && value >= 1 && value <= 5000 && !isYearLike(value));
  if (usable.length === 0) return null;
  return range ? Math.max(...usable) : usable[0] ?? null;
}

/** "$30k" -> 30000, "30,000" -> 30000, "under 25k" -> 25000, "25-30k" -> 30000. null means unknown. */
export function parseBudgetAud(text: string | null | undefined): number | null {
  const source = clean(text);
  if (!source) return null;
  const tokens = [...source.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?(?![a-zA-Z])/g)].map((match) => ({
    value: Number(match[1].replace(/,/g, "")),
    suffix: (match[2] ?? "").toLowerCase(),
  }));
  if (tokens.length === 0) return null;
  const lastSuffix = tokens[tokens.length - 1]?.suffix ?? "";
  const multiplier = (suffix: string) => (suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1);
  const values = tokens.map((token) => {
    // "25-30k": the trailing suffix covers the whole range.
    const suffix = token.suffix || (lastSuffix && token.value < 1000 ? lastSuffix : "");
    return token.value * multiplier(suffix);
  }).filter((value) => Number.isFinite(value) && value >= 100);
  return values.length > 0 ? Math.max(...values) : null;
}

type HardRequirement = { key: string; label: string; pattern: RegExp; venueOnly: boolean };

const HARD_REQUIREMENTS: readonly HardRequirement[] = [
  { key: "wheelchair_accessible", label: "wheelchair access", pattern: /wheelchair|accessib|mobility/i, venueOnly: false },
  { key: "pets_allowed", label: "pets allowed", pattern: /\bdogs?\b|\bpets?\b/i, venueOnly: true },
  { key: "byo_alcohol_allowed", label: "BYO alcohol", pattern: /\bbyo\b/i, venueOnly: true },
  { key: "ceremony_on_site", label: "ceremony on site", pattern: /ceremony and reception|same venue|on.?site ceremony/i, venueOnly: true },
  { key: "accommodation_on_site", label: "accommodation on site", pattern: /accommodation on.?site|stay on.?site/i, venueOnly: true },
];

export function declaredHardRequirementKeys(requirementText: string): string[] {
  return HARD_REQUIREMENTS.filter((requirement) => requirement.pattern.test(requirementText)).map((requirement) => requirement.key);
}

// ---------------------------------------------------------------------------------------------
// Utility curves
// ---------------------------------------------------------------------------------------------

/** Keeney-style utility over price/budget: cheaper is better only up to a point, and over-budget falls off a cliff. */
export function weddingBudgetUtility(price: number, budget: number): number {
  if (!(budget > 0) || !(price >= 0)) return 0;
  const ratio = price / budget;
  if (ratio <= 0.7) return 1;
  if (ratio <= 0.8) return 0.85;
  if (ratio <= 0.95) return 0.6;
  if (ratio <= 1.05) return 0.3;
  if (ratio <= 1.2) return 0.1;
  return 0;
}

const RATING_PRIOR_MEAN = 4.3;
const RATING_PRIOR_WEIGHT = 20;

/** Bayesian shrinkage: a 5.0 from 9 reviews is pulled toward the prior far more than 4.8 from 1,100. */
export function weddingQualityUtility(rating: number, reviewCount: number): { value: number; confidence: number } {
  const n = Math.max(0, reviewCount);
  const shrunk = (RATING_PRIOR_WEIGHT * RATING_PRIOR_MEAN + n * rating) / (RATING_PRIOR_WEIGHT + n);
  return {
    value: Math.min(1, Math.max(0, (shrunk - 3.5) / 1.5)),
    confidence: n / (n + 50),
  };
}

// ---------------------------------------------------------------------------------------------
// Evidence access
// ---------------------------------------------------------------------------------------------

type AttributeView = {
  present: boolean;
  status: WeddingVendorAttributeStatus;
  value: unknown;
  confidence: number;
  authority: string | null;
  retrievedAt: string | null;
};

const ABSENT: AttributeView = { present: false, status: "unknown", value: null, confidence: 0, authority: null, retrievedAt: null };

function attributeOf(source: WeddingVendorRankingSource, key: string): AttributeView {
  const attribute = source.attributes?.[key];
  if (!attribute || (attribute.status !== "known" && attribute.status !== "estimated")) return ABSENT;
  if (attribute.value === null || attribute.value === undefined) return ABSENT;
  return {
    present: true,
    status: attribute.status,
    value: attribute.value,
    confidence: attribute.confidence ?? (attribute.status === "known" ? 0.8 : 0.4),
    authority: attribute.authority,
    retrievedAt: attribute.retrieved_at ?? null,
  };
}

/** Strong enough to base a hard decision on: stated as known, or estimated with solid confidence. */
function decisive(view: AttributeView): boolean {
  return view.present && (view.status === "known" || view.confidence >= 0.7);
}

const AUTHORITY_FACTOR: Record<string, number> = {
  operator: 1,
  vendor_reply: 1,
  primary_official: 0.9,
  independent_aggregate: 0.8,
  directory: 0.5,
  editorial: 0.4,
  inferred: 0.3,
};

const STALE_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

function recencyFactor(retrievedAt: string | null, now: Date): number {
  if (!retrievedAt) return 1;
  const retrieved = Date.parse(retrievedAt.replace(" ", "T"));
  return Number.isFinite(retrieved) && now.getTime() - retrieved > STALE_AFTER_MS ? 0.5 : 1;
}

// ---------------------------------------------------------------------------------------------
// Context shared by all candidates
// ---------------------------------------------------------------------------------------------

const TOKEN_STOPWORDS = new Set([
  "wedding", "weddings", "vendor", "vendors", "with", "from", "that", "this", "have", "need", "needs",
  "style", "venue", "venues", "guests", "about", "around", "love", "want", "would", "like", "really",
  "something", "also", "very", "some", "ideas", "your", "their", "them", "they",
]);

function tokens(text: string, minLength = 4): string[] {
  const seen = new Set<string>();
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= minLength && !TOKEN_STOPWORDS.has(token)) seen.add(token);
    if (seen.size >= 32) break;
  }
  return [...seen];
}

const LOCATION_STOPWORDS = new Set([
  "australia", "nsw", "vic", "qld", "tas", "act", "new", "south", "wales", "the", "near", "area", "city", "and",
]);

type RankingContext = {
  now: Date;
  guests: number | null;
  budget: number | null;
  standingReception: boolean;
  preferenceTokens: string[];
  locationTokens: string[];
  requirementKeys: string[];
  singleVenueSearch: boolean;
};

function buildContext(requirements: WeddingVendorRankingRequirements, now: Date): RankingContext {
  const priorities = (requirements.topPriorities ?? []).map(clean).filter(Boolean);
  const requirementText = [requirements.preferences, requirements.atmosphereDescription, ...priorities].map(clean).join(" ");
  const categories = (requirements.vendorCategories ?? []).map((category) => clean(category).toLowerCase()).filter(Boolean);
  return {
    now,
    guests: parseGuestCount(requirements.guestCount),
    budget: parseBudgetAud(requirements.budgetComfort),
    standingReception: /cocktail|standing/i.test(requirementText),
    preferenceTokens: tokens(requirementText),
    locationTokens: tokens(clean(requirements.location), 3).filter((token) => !LOCATION_STOPWORDS.has(token)),
    requirementKeys: declaredHardRequirementKeys(requirementText),
    singleVenueSearch: categories.length > 0 && categories.every((category) => category === "venue"),
  };
}

function isVenue(source: WeddingVendorRankingSource, context: RankingContext): boolean {
  const category = clean(source.category).toLowerCase();
  if (category) return category === "venue";
  if (source.attributes && "capacity_seated_max" in source.attributes) return true;
  return context.singleVenueSearch;
}

// ---------------------------------------------------------------------------------------------
// Stage 1: eligibility
// ---------------------------------------------------------------------------------------------

type HardConstraint = { key: string; label: string; detail: string };

type Eligibility = {
  failReasons: string[];
  unknownConstraints: HardConstraint[];
  riskFlags: string[];
};

const formatAud = (value: number) => `$${Math.round(value).toLocaleString("en-AU")}`;

function evaluateEligibility(source: WeddingVendorRankingSource, venue: boolean, context: RankingContext): Eligibility {
  const failReasons: string[] = [];
  const unknownConstraints: HardConstraint[] = [];
  const riskFlags: string[] = [];

  if (source.source_kind === "listicle" || source.source_kind === "editorial") {
    failReasons.push("not a vendor page (directory or article)");
  }
  const businessStatus = attributeOf(source, "business_status");
  if (businessStatus.present && businessStatus.value === "CLOSED_PERMANENTLY") {
    failReasons.push("permanently closed");
  } else if (businessStatus.present && businessStatus.value === "CLOSED_TEMPORARILY") {
    riskFlags.push("Reported as temporarily closed");
  }

  if (venue && context.guests !== null) {
    const capacityKey = context.standingReception ? "capacity_standing_max" : "capacity_seated_max";
    const capacity = attributeOf(source, capacityKey);
    const capacityValue = finiteNumber(capacity.value);
    if (capacity.present && capacityValue !== null) {
      if (capacityValue < context.guests) {
        const detail = `${context.standingReception ? "standing" : "seated"} capacity ${capacityValue} is below your ${context.guests} guests`;
        if (decisive(capacity)) failReasons.push(detail);
        else riskFlags.push(`Possible capacity shortfall: ${detail} (unconfirmed)`);
      }
    } else {
      unknownConstraints.push({
        key: capacityKey,
        label: "capacity",
        detail: `Confirm ${context.standingReception ? "standing" : "seated"} capacity for ${source.title} (you have ${context.guests} guests)`,
      });
    }
  }

  if (context.budget !== null) {
    const price = attributeOf(source, "price_estimate_total_aud");
    const priceValue = finiteNumber(price.value);
    if (price.present && priceValue !== null) {
      if (price.status === "known" && price.confidence >= 0.7 && priceValue > context.budget * 1.2) {
        failReasons.push(`quoted price ${formatAud(priceValue)} is more than 20% over your ${formatAud(context.budget)} budget`);
      } else if (priceValue > context.budget) {
        riskFlags.push(`Estimated price ${formatAud(priceValue)} is above your ${formatAud(context.budget)} budget (low confidence)`);
      }
    } else {
      unknownConstraints.push({
        key: "price_estimate_total_aud",
        label: "price",
        detail: `Request a quote from ${source.title} (your budget is about ${formatAud(context.budget)})`,
      });
    }
  }

  for (const requirement of HARD_REQUIREMENTS) {
    if (!context.requirementKeys.includes(requirement.key) || (requirement.venueOnly && !venue)) continue;
    const attribute = attributeOf(source, requirement.key);
    if (attribute.present && decisive(attribute) && attribute.value === false) {
      failReasons.push(`${requirement.label} is required but the vendor reports it is not available`);
    } else if (!attribute.present || attribute.value === null) {
      unknownConstraints.push({
        key: requirement.key,
        label: requirement.label,
        detail: `Confirm ${requirement.label} with ${source.title}`,
      });
    }
  }
  return { failReasons, unknownConstraints, riskFlags };
}

// ---------------------------------------------------------------------------------------------
// Stage 2: availability
// ---------------------------------------------------------------------------------------------

const AVAILABILITY_LABELS: Record<WeddingVendorAvailabilityState, string> = {
  confirmed_available: "Available on your date",
  likely_available: "Likely available",
  unknown: "Availability unknown",
  enquiry_sent: "Enquiry sent",
  awaiting_response: "Awaiting reply",
  temporary_hold: "On hold for you",
  confirmed_unavailable: "Unavailable on your date",
  booked: "Booked",
};

export function weddingVendorAvailabilityLabel(state: WeddingVendorAvailabilityState): string {
  return AVAILABILITY_LABELS[state];
}

function effectiveAvailability(source: WeddingVendorRankingSource, now: Date): { state: WeddingVendorAvailabilityState; label: string } {
  const availability = source.availability;
  if (!availability) return { state: "unknown", label: AVAILABILITY_LABELS.unknown };
  const validUntil = availability.valid_until ? Date.parse(availability.valid_until.replace(" ", "T")) : NaN;
  if (Number.isFinite(validUntil) && validUntil < now.getTime()) {
    return { state: "unknown", label: "Availability needs re-checking" };
  }
  return { state: availability.state, label: AVAILABILITY_LABELS[availability.state] };
}

// ---------------------------------------------------------------------------------------------
// Stage 3: personal utility
// ---------------------------------------------------------------------------------------------

const VENUE_WEIGHTS = { style: 0.25, cost: 0.2, location: 0.15, capacity: 0.12, quality: 0.13, planning: 0.08, risk: 0.07 };
// Non-venue vendors carry execution risk (you cannot reshoot a wedding), taken out of style weight.
const VENDOR_WEIGHTS = { style: 0.12, cost: 0.2, location: 0.15, capacity: 0, quality: 0.13, planning: 0, risk: 0.2 };

const PLANNING_INCLUSIONS = ["coordinator", "furniture", "linen", "av", "ceremony_setup", "wet_weather_setup", "catering"];

function component(
  id: string,
  label: string,
  weight: number,
  evidence: { value: number; confidence: number; authority: string | null; retrievedAt?: string | null } | null,
): WeddingVendorUtilityComponent {
  return {
    id,
    label,
    weight,
    value: evidence?.value ?? 0,
    confidence: evidence?.confidence ?? 0,
    known: evidence !== null,
    authority: evidence?.authority ?? null,
    retrievedAt: evidence?.retrievedAt ?? null,
  };
}

function textOf(source: WeddingVendorRankingSource): string {
  const summary = attributeOf(source, "editorial_summary");
  const styleTags = attributeOf(source, "style_tags");
  return [
    source.title,
    source.snippet,
    typeof summary.value === "string" ? summary.value : "",
    Array.isArray(styleTags.value) ? styleTags.value.join(" ") : "",
  ].join(" ").toLowerCase();
}

function styleEvidence(source: WeddingVendorRankingSource, context: RankingContext) {
  if (context.preferenceTokens.length === 0) return { evidence: null, matched: [] as string[] };
  const text = textOf(source);
  if (text.replace(/\s+/g, " ").trim().length < 20) return { evidence: null, matched: [] as string[] };
  const matched = context.preferenceTokens.filter((token) => text.includes(token));
  const tags = attributeOf(source, "style_tags");
  const summary = attributeOf(source, "editorial_summary");
  const structured = tags.present ? tags : summary;
  return {
    matched,
    evidence: {
      value: Math.min(1, matched.length / Math.min(context.preferenceTokens.length, 5)),
      confidence: structured.present ? structured.confidence : 0.5,
      authority: structured.present ? structured.authority : "directory",
      retrievedAt: structured.retrievedAt,
    },
  };
}

function costEvidence(source: WeddingVendorRankingSource, context: RankingContext) {
  if (context.budget === null) return null;
  const total = attributeOf(source, "price_estimate_total_aud");
  const totalValue = finiteNumber(total.value);
  if (total.present && totalValue !== null) {
    return total.confidence >= 0.5
      ? { value: weddingBudgetUtility(totalValue, context.budget), confidence: total.confidence, authority: total.authority, retrievedAt: total.retrievedAt }
      : null;
  }
  const perHead = attributeOf(source, "price_per_head_aud");
  const perHeadValue = finiteNumber(perHead.value);
  if (perHead.present && perHeadValue !== null && context.guests !== null && perHead.confidence >= 0.5) {
    return {
      value: weddingBudgetUtility(perHeadValue * context.guests, context.budget),
      confidence: perHead.confidence * 0.8,
      authority: perHead.authority,
      retrievedAt: perHead.retrievedAt,
    };
  }
  return null;
}

function locationEvidence(source: WeddingVendorRankingSource, context: RankingContext) {
  const address = clean(source.address);
  if (context.locationTokens.length === 0 || !address) return null;
  const haystack = `${address} ${textOf(source)}`.toLowerCase();
  const matches = context.locationTokens.some((token) => haystack.includes(token));
  return {
    value: matches ? 1 : 0.3,
    confidence: 0.8,
    authority: /google/i.test(source.provider) ? "independent_aggregate" : "directory",
    retrievedAt: null,
  };
}

function capacityEvidence(source: WeddingVendorRankingSource, context: RankingContext) {
  if (context.guests === null) return null;
  const capacity = attributeOf(source, context.standingReception ? "capacity_standing_max" : "capacity_seated_max");
  const capacityValue = finiteNumber(capacity.value);
  if (!capacity.present || capacityValue === null || capacityValue <= 0) return null;
  const ratio = context.guests / capacityValue;
  const value = ratio > 0.9 ? 0.6 : ratio < 0.33 ? 0.7 : 1;
  return { value, confidence: capacity.confidence, authority: capacity.authority, retrievedAt: capacity.retrievedAt };
}

function qualityEvidence(source: WeddingVendorRankingSource) {
  const rating = attributeOf(source, "rating_google");
  const count = attributeOf(source, "review_count_google");
  const ratingValue = finiteNumber(rating.value) ?? finiteNumber(source.rating);
  const countValue = finiteNumber(count.value) ?? finiteNumber(source.review_count);
  if (ratingValue === null || countValue === null) return null;
  const quality = weddingQualityUtility(ratingValue, countValue);
  return {
    ...quality,
    authority: rating.present ? rating.authority : "independent_aggregate",
    retrievedAt: rating.retrievedAt,
  };
}

function planningEvidence(source: WeddingVendorRankingSource) {
  const inclusions = attributeOf(source, "inclusions");
  if (!inclusions.present || !Array.isArray(inclusions.value)) return null;
  const present = inclusions.value.map((item) => clean(item).toLowerCase().replace(/[\s-]+/g, "_"));
  const covered = PLANNING_INCLUSIONS.filter((item) => present.some((entry) => entry.includes(item))).length;
  return {
    value: covered / PLANNING_INCLUSIONS.length,
    confidence: inclusions.confidence,
    authority: inclusions.authority,
    retrievedAt: inclusions.retrievedAt,
  };
}

function riskEvidence(source: WeddingVendorRankingSource) {
  const views = ["public_liability_insurance", "contract_provided", "backup_shooter", "equipment_redundancy"]
    .map((key) => attributeOf(source, key))
    .filter((view) => view.present && typeof view.value === "boolean");
  const scores: number[] = views.map((view) => (view.value === true ? 1 : 0));
  const response = attributeOf(source, "response_time_hours");
  const hours = finiteNumber(response.value);
  if (response.present && hours !== null) scores.push(hours <= 48 ? 1 : hours <= 96 ? 0.5 : 0);
  const all = [...views, ...(response.present && hours !== null ? [response] : [])];
  if (scores.length === 0) return null;
  const meanConfidence = all.reduce((sum, view) => sum + view.confidence, 0) / all.length;
  return {
    value: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    confidence: meanConfidence,
    authority: all[0]?.authority ?? null,
    retrievedAt: all[0]?.retrievedAt ?? null,
  };
}

function buildComponents(source: WeddingVendorRankingSource, venue: boolean, context: RankingContext) {
  const weights = venue ? VENUE_WEIGHTS : VENDOR_WEIGHTS;
  const style = styleEvidence(source, context);
  const components = [
    component("style", "Style and preferences", weights.style, style.evidence),
    component("cost", "Cost against budget", weights.cost, costEvidence(source, context)),
    component("location", "Location", weights.location, locationEvidence(source, context)),
    ...(venue ? [component("capacity", "Capacity comfort", weights.capacity, capacityEvidence(source, context))] : []),
    component("quality", "Reviews and reputation", weights.quality, qualityEvidence(source)),
    ...(venue ? [component("planning", "Planning burden", weights.planning, planningEvidence(source))] : []),
    component("risk", "Execution risk", weights.risk, riskEvidence(source)),
  ];
  return { components, matchedPreferenceTokens: style.matched };
}

function computeFit(components: readonly WeddingVendorUtilityComponent[]): number | null {
  const known = components.filter((item) => item.known);
  const weight = known.reduce((sum, item) => sum + item.weight, 0);
  if (known.length === 0 || weight <= 0) return null;
  return Math.round(100 * known.reduce((sum, item) => sum + item.weight * item.value, 0) / weight);
}

// ---------------------------------------------------------------------------------------------
// Stage 4: evidence confidence (kept separate from fit)
// ---------------------------------------------------------------------------------------------

function computeConfidence(components: readonly WeddingVendorUtilityComponent[], now: Date): number {
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const known = components.filter((item) => item.known);
  if (totalWeight <= 0 || known.length === 0) return 0;
  const coverage = known.reduce((sum, item) => sum + item.weight, 0) / totalWeight;
  const authority = known.reduce((sum, item) => sum + (AUTHORITY_FACTOR[item.authority ?? ""] ?? 0.5), 0) / known.length;
  const recency = known.reduce((sum, item) => sum + recencyFactor(item.retrievedAt, now), 0) / known.length;
  return coverage * authority * recency;
}

function confidenceBucket(confidence: number): WeddingVendorConfidenceBucket {
  return confidence >= 0.6 ? "high" : confidence >= 0.35 ? "medium" : "low";
}

// ---------------------------------------------------------------------------------------------
// Stage 5: actionability
// ---------------------------------------------------------------------------------------------

const AVAILABILITY_PROBABILITY: Partial<Record<WeddingVendorAvailabilityState, number>> = {
  unknown: 0.5,
  enquiry_sent: 0.5,
  awaiting_response: 0.5,
  likely_available: 0.8,
};

function verifyCost(source: WeddingVendorRankingSource): number {
  if (clean(source.email)) return 5;
  if (clean(source.phone)) return 10;
  if (clean(source.websiteUrl)) return 15;
  return 30;
}

/** Expected value of information: how much asking is worth, on the same scale as fit. */
export function weddingVendorEvoi(fit: number | null, state: WeddingVendorAvailabilityState, cost: number): number {
  return (AVAILABILITY_PROBABILITY[state] ?? 0.5) * (fit ?? 40) - cost;
}

function hasOfficialWebsite(source: WeddingVendorRankingSource): boolean {
  return Boolean(clean(source.websiteUrl)) || attributeOf(source, "official_website").present;
}

function priorityMatchLabel(components: readonly WeddingVendorUtilityComponent[]): string {
  const known = components.filter((item) => item.known);
  if (known.length === 0) return "Priorities not yet assessable";
  return `Matches ${known.filter((item) => item.value >= 0.6).length}/${known.length} of your priorities`;
}

function situationFitLabel(components: readonly WeddingVendorUtilityComponent[]): string {
  const strong = components.filter((item) => item.known && item.value >= 0.6).map((item) => item.label);
  return strong.length > 0 ? `Strong on: ${strong.join(", ")}` : "Fit requires source-page review.";
}

const VERIFICATION_LABEL =
  "Confirm service area, date availability, package inclusions, travel, overtime, cancellation, and final quote before outreach.";

function rankCandidate(
  source: WeddingVendorRankingSource,
  context: RankingContext,
): { candidate: WeddingVendorRankedCandidate; constraints: HardConstraint[] } {
  const venue = isVenue(source, context);
  const eligibility = evaluateEligibility(source, venue, context);
  const availability = effectiveAvailability(source, context.now);
  const { components, matchedPreferenceTokens } = buildComponents(source, venue, context);
  const fit = computeFit(components);
  const confidence = computeConfidence(components, context.now);
  const bucket = confidenceBucket(confidence);

  let group: WeddingVendorRankingGroup;
  let exclusionReason: string | null = null;
  if (eligibility.failReasons.length > 0) {
    group = "excluded";
    exclusionReason = eligibility.failReasons.join("; ");
  } else if (availability.state === "confirmed_unavailable") {
    group = "excluded";
    exclusionReason = "unavailable on requested date";
  } else if (availability.state === "booked") {
    group = "booked";
  } else if (["confirmed_available", "likely_available", "temporary_hold"].includes(availability.state)) {
    group = "bookable";
  } else {
    group = "verify";
  }

  const fitText = fit === null ? "Fit not yet assessable" : `${fit} fit`;
  const evoi = group === "verify" ? weddingVendorEvoi(fit, availability.state, verifyCost(source)) : null;
  const candidate: WeddingVendorRankedCandidate = {
    id: source.id,
    rank: 0,
    title: source.title,
    provider: source.provider,
    url: source.url,
    websiteUrl: source.websiteUrl,
    mapUrl: source.mapUrl,
    imageUrl: source.imageUrl,
    address: source.address,
    phone: source.phone,
    email: source.email,
    instagramUrl: source.instagramUrl,
    snippet: source.snippet,
    score: fit ?? 0,
    preferenceMatchLabel: matchedPreferenceTokens.length > 0
      ? matchedPreferenceTokens.slice(0, 4).join(", ")
      : "No direct preference keyword match; review manually.",
    situationFitLabel: situationFitLabel(components),
    verificationLabel: VERIFICATION_LABEL,
    rationaleLabels: [
      ...components.filter((item) => item.known && item.value >= 0.6).map((item) => `${item.label} looks strong`),
      `Source provider: ${source.provider}`,
    ],
    group,
    fit,
    fitLabel: fitText,
    confidence,
    confidenceBucket: bucket,
    confidenceLabel: `${bucket} confidence`,
    priorityMatchLabel: priorityMatchLabel(components),
    availabilityState: availability.state,
    availabilityLabel: availability.label,
    vendorId: clean(source.vendor_id) || null,
    riskFlags: eligibility.riskFlags,
    unknownHardConstraints: eligibility.unknownConstraints.map((constraint) => constraint.label),
    components,
    evoi,
    exclusionReason,
    hasOfficialWebsite: hasOfficialWebsite(source),
  };
  return { candidate, constraints: eligibility.unknownConstraints };
}

function byFitThenConfidence(left: WeddingVendorRankedCandidate, right: WeddingVendorRankedCandidate): number {
  return (right.fit ?? -1) - (left.fit ?? -1) || right.confidence - left.confidence || left.title.localeCompare(right.title);
}

const MAX_NEXT_ACTIONS = 5;

function buildNextActions(
  ranked: ReadonlyArray<{ candidate: WeddingVendorRankedCandidate; constraints: HardConstraint[] }>,
): WeddingVendorNextAction[] {
  const live = ranked.filter(({ candidate }) => candidate.group === "verify" || candidate.group === "bookable");
  const check = live
    .filter(({ candidate }) => candidate.group === "verify")
    .sort((left, right) => (right.candidate.evoi ?? -Infinity) - (left.candidate.evoi ?? -Infinity))
    .slice(0, 2)
    .map(({ candidate }): WeddingVendorNextAction => ({
      kind: "check_availability",
      vendorId: candidate.vendorId,
      choiceId: candidate.id,
      label: `Check availability with ${candidate.title}`,
      reason: `${candidate.fitLabel}; ${candidate.availabilityLabel.toLowerCase()}`,
    }));
  const confirm = live
    .filter(({ constraints }) => constraints.length > 0)
    .sort((left, right) => byFitThenConfidence(left.candidate, right.candidate))
    .slice(0, 2)
    .map(({ candidate, constraints }): WeddingVendorNextAction => ({
      kind: "confirm_attribute",
      vendorId: candidate.vendorId,
      choiceId: candidate.id,
      label: constraints[0]?.detail ?? `Confirm details with ${candidate.title}`,
      reason: `Unconfirmed: ${constraints.map((constraint) => constraint.label).join(", ")}`,
    }));
  const resolve = live
    .filter(({ candidate }) => !candidate.hasOfficialWebsite)
    .slice(0, 1)
    .map(({ candidate }): WeddingVendorNextAction => ({
      kind: "resolve_official_site",
      vendorId: candidate.vendorId,
      choiceId: candidate.id,
      label: `Find the official website for ${candidate.title}`,
      reason: "Official site not confirmed",
    }));
  const lists = [check, confirm, resolve];
  const actions = lists.flatMap((list) => list.slice(0, 2));
  for (const action of lists.flat()) {
    if (actions.length >= MAX_NEXT_ACTIONS) break;
    if (!actions.includes(action)) actions.push(action);
  }
  return actions.slice(0, MAX_NEXT_ACTIONS);
}

export function rankWeddingVendorCandidates(input: {
  sources: readonly WeddingVendorRankingSource[];
  requirements: WeddingVendorRankingRequirements;
  now?: Date;
}): WeddingVendorRankingResult {
  const context = buildContext(input.requirements, input.now ?? new Date());
  const ranked = input.sources.map((source) => rankCandidate(source, context));
  const inGroup = (group: WeddingVendorRankingGroup) =>
    ranked.map(({ candidate }) => candidate).filter((candidate) => candidate.group === group);
  const verify = inGroup("verify").sort((left, right) =>
    (right.evoi ?? -Infinity) - (left.evoi ?? -Infinity) || byFitThenConfidence(left, right));
  return {
    booked: inGroup("booked").sort(byFitThenConfidence),
    bookable: inGroup("bookable").sort(byFitThenConfidence),
    verify,
    excluded: inGroup("excluded")
      .sort(byFitThenConfidence)
      .map((candidate) => ({ ...candidate, exclusionReason: candidate.exclusionReason ?? "excluded" })),
    nextActions: buildNextActions(ranked),
  };
}
