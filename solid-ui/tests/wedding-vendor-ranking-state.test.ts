import assert from "node:assert/strict";
import test from "node:test";

import {
  declaredHardRequirementKeys,
  normalizeWeddingVendorSourceEvidence,
  parseBudgetAud,
  parseGuestCount,
  rankWeddingVendorCandidates,
  weddingBudgetUtility,
  weddingQualityUtility,
  weddingVendorEvoi,
  weddingVendorRankingCardFieldsFromRecord,
  type WeddingVendorAttributeEvidence,
  type WeddingVendorAvailabilityState,
  type WeddingVendorRankingRequirements,
  type WeddingVendorRankingSource,
} from "../src/lib/weddingVendorRankingState.ts";

const NOW = new Date("2026-10-01T00:00:00Z");

function attr(
  value: unknown,
  overrides: Partial<WeddingVendorAttributeEvidence> = {},
): WeddingVendorAttributeEvidence {
  return { status: "known", value, confidence: 0.9, authority: "primary_official", ...overrides };
}

function source(id: string, extra: Partial<WeddingVendorRankingSource> = {}): WeddingVendorRankingSource {
  return {
    id,
    title: `Venue ${id}`,
    provider: "Google Places API",
    url: `https://${id}.example.com/`,
    websiteUrl: `https://${id}.example.com/`,
    mapUrl: null,
    imageUrl: null,
    address: null,
    phone: null,
    email: null,
    instagramUrl: null,
    snippet: "",
    category: "venue",
    ...extra,
  };
}

function availability(state: WeddingVendorAvailabilityState, validUntil: string | null = null) {
  return { state, valid_until: validUntil };
}

const venueSearch: WeddingVendorRankingRequirements = { vendorCategories: ["venue"] };

function ids(list: ReadonlyArray<{ id: string }>): string[] {
  return list.map((item) => item.id);
}

test("a venue that cannot seat the guests is excluded even when it is beautiful and highly rated", () => {
  const small = source("a", {
    attributes: { capacity_seated_max: attr(90), rating_google: attr(4.9), review_count_google: attr(800) },
  });
  const large = source("b", {
    attributes: { capacity_seated_max: attr(180), rating_google: attr(4.7), review_count_google: attr(400) },
  });
  const result = rankWeddingVendorCandidates({
    sources: [small, large],
    requirements: { ...venueSearch, guestCount: "about 140", budgetComfort: "$30k" },
    now: NOW,
  });
  assert.deepEqual(ids(result.excluded), ["a"]);
  assert.match(result.excluded[0]?.exclusionReason ?? "", /capacity 90 is below your 140 guests/);
  assert.deepEqual(ids(result.verify), ["b"]);
  assert.equal(result.bookable.length, 0);
});

const STYLE_WORDS = "garden rustic barn vineyard lakeside";

test("availability buckets bookable, verify and excluded without penalising unknown", () => {
  const requirements = { ...venueSearch, preferences: STYLE_WORDS };
  const result = rankWeddingVendorCandidates({
    sources: [
      source("a", { snippet: "garden rustic barn vineyard lakeside estate", availability: availability("confirmed_unavailable") }),
      source("b", { snippet: "garden rustic barn vineyard estate", availability: availability("unknown") }),
      source("c", { snippet: "garden rustic barn estate ceremony", availability: availability("confirmed_available") }),
    ],
    requirements,
    now: NOW,
  });
  assert.deepEqual(ids(result.bookable), ["c"]);
  assert.deepEqual(ids(result.verify), ["b"]);
  assert.deepEqual(ids(result.excluded), ["a"]);
  assert.equal(result.excluded[0]?.exclusionReason, "unavailable on requested date");
  assert.ok((result.excluded[0]?.fit ?? 0) > (result.verify[0]?.fit ?? 100), "excluded vendor keeps its fit");
  assert.ok((result.verify[0]?.fit ?? 0) > (result.bookable[0]?.fit ?? 100), "unknown availability keeps its higher fit");
});

test("booked vendors are listed separately and temporary holds count as bookable", () => {
  const result = rankWeddingVendorCandidates({
    sources: [
      source("booked", { availability: availability("booked") }),
      source("hold", { availability: availability("temporary_hold") }),
      source("likely", { availability: availability("likely_available") }),
      source("asked", { availability: availability("awaiting_response") }),
    ],
    requirements: venueSearch,
    now: NOW,
  });
  assert.deepEqual(ids(result.booked), ["booked"]);
  assert.deepEqual(ids(result.bookable).sort(), ["hold", "likely"]);
  assert.deepEqual(ids(result.verify), ["asked"]);
});

test("expired availability is treated as unknown rather than trusted", () => {
  const result = rankWeddingVendorCandidates({
    sources: [source("old", { availability: availability("confirmed_available", "2026-09-01T00:00:00Z") })],
    requirements: venueSearch,
    now: NOW,
  });
  assert.deepEqual(ids(result.verify), ["old"]);
  assert.equal(result.verify[0]?.availabilityState, "unknown");
});

test("review volume raises both quality utility and quality confidence", () => {
  const few = weddingQualityUtility(5.0, 9);
  const many = weddingQualityUtility(4.8, 1100);
  assert.ok(many.value > few.value);
  assert.ok(many.confidence > few.confidence);

  const result = rankWeddingVendorCandidates({
    sources: [
      source("few", { attributes: { rating_google: attr(5.0), review_count_google: attr(9) } }),
      source("many", { attributes: { rating_google: attr(4.8), review_count_google: attr(1100) } }),
    ],
    requirements: venueSearch,
    now: NOW,
  });
  const quality = (id: string) => result.verify.find((item) => item.id === id)?.components.find((item) => item.id === "quality");
  assert.ok((quality("many")?.value ?? 0) > (quality("few")?.value ?? 1));
  assert.ok((quality("many")?.confidence ?? 0) > (quality("few")?.confidence ?? 1));
  assert.deepEqual(ids(result.verify), ["many", "few"]);
});

test("unknown capacity never excludes and asks for the missing fact", () => {
  const result = rankWeddingVendorCandidates({
    sources: [source("a", { title: "Redleaf Estate", vendor_id: "v-a" })],
    requirements: { ...venueSearch, guestCount: "140" },
    now: NOW,
  });
  assert.equal(result.excluded.length, 0);
  assert.deepEqual(result.verify[0]?.unknownHardConstraints, ["capacity"]);
  const confirm = result.nextActions.find((action) => action.kind === "confirm_attribute");
  assert.ok(confirm);
  assert.equal(confirm.vendorId, "v-a");
  assert.match(confirm.label, /Confirm seated capacity for Redleaf Estate \(you have 140 guests\)/);
});

test("an uncertain price estimate is a risk flag while a confident quote over budget is a veto", () => {
  const estimate = source("estimate", {
    attributes: { price_estimate_total_aud: attr(39_000, { status: "estimated", confidence: 0.3, authority: "inferred" }) },
  });
  const quote = source("quote", {
    attributes: { price_estimate_total_aud: attr(39_000, { confidence: 0.97, authority: "vendor_reply" }) },
  });
  const result = rankWeddingVendorCandidates({
    sources: [estimate, quote],
    requirements: { ...venueSearch, budgetComfort: "$30,000" },
    now: NOW,
  });
  assert.deepEqual(ids(result.verify), ["estimate"]);
  assert.ok(result.verify[0]?.riskFlags.some((flag) => /above your/.test(flag)));
  assert.deepEqual(ids(result.excluded), ["quote"]);
  assert.match(result.excluded[0]?.exclusionReason ?? "", /more than 20% over/);
  const withoutBudgetKnowledge = result.verify[0]?.components.find((item) => item.id === "cost");
  assert.equal(withoutBudgetKnowledge?.known, false, "a 0.3-confidence estimate must not drive the cost score");
});

test("budget utility follows the $30k table including its boundaries", () => {
  const budget = 30_000;
  const expectations: Array<[number, number]> = [
    [18_000, 1],
    [21_000, 1],
    [24_000, 0.85],
    [28_000, 0.6],
    [31_000, 0.3],
    [36_000, 0.1],
    [38_000, 0],
    [0.8 * budget, 0.85],
    [0.95 * budget, 0.6],
    [1.05 * budget, 0.3],
    [1.2 * budget, 0.1],
  ];
  for (const [price, utility] of expectations) {
    assert.equal(weddingBudgetUtility(price, budget), utility, `price ${price}`);
  }
});

test("a declared wheelchair requirement excludes a vendor that reports no access and chases unknowns", () => {
  const requirements = { ...venueSearch, topPriorities: ["Step-free wheelchair access for my grandmother"] };
  const result = rankWeddingVendorCandidates({
    sources: [
      source("no", { attributes: { wheelchair_accessible: attr(false) } }),
      source("yes", { attributes: { wheelchair_accessible: attr(true) } }),
      source("unknown"),
    ],
    requirements,
    now: NOW,
  });
  assert.deepEqual(ids(result.excluded), ["no"]);
  assert.match(result.excluded[0]?.exclusionReason ?? "", /wheelchair access is required/);
  assert.deepEqual(ids(result.verify).sort(), ["unknown", "yes"]);
  const unknown = result.verify.find((item) => item.id === "unknown");
  assert.deepEqual(unknown?.unknownHardConstraints, ["wheelchair access"]);
  assert.ok(result.nextActions.some((action) => action.kind === "confirm_attribute" && action.choiceId === "unknown"));
});

test("requirements are only enforced when the couple declared them", () => {
  const result = rankWeddingVendorCandidates({
    sources: [source("no", { attributes: { wheelchair_accessible: attr(false), pets_allowed: attr(false) } })],
    requirements: venueSearch,
    now: NOW,
  });
  assert.equal(result.excluded.length, 0);
  assert.deepEqual(declaredHardRequirementKeys("we want our dog there and BYO drinks"), ["pets_allowed", "byo_alcohol_allowed"]);
  assert.deepEqual(declaredHardRequirementKeys("ceremony and reception in the same venue"), ["ceremony_on_site"]);
});

test("expected value of information ranks a high-fit reachable venue above a low-fit unreachable one", () => {
  assert.equal(weddingVendorEvoi(94, "unknown", 5), 42);
  assert.equal(weddingVendorEvoi(80, "unknown", 30), 10);

  const result = rankWeddingVendorCandidates({
    sources: [
      source("hard", { snippet: "garden rustic barn vineyard estate", websiteUrl: null }),
      source("easy", { snippet: "garden rustic barn vineyard lakeside", email: "events@easy.example.com" }),
    ],
    requirements: { ...venueSearch, preferences: STYLE_WORDS },
    now: NOW,
  });
  assert.deepEqual(ids(result.verify), ["easy", "hard"]);
  assert.ok((result.verify[0]?.evoi ?? 0) > (result.verify[1]?.evoi ?? 99));
  assert.equal(result.nextActions[0]?.kind, "check_availability");
  assert.equal(result.nextActions[0]?.choiceId, "easy");
});

test("fit is not multiplied by confidence and an unassessable vendor says so", () => {
  const thin = source("thin", { snippet: "garden rustic barn vineyard lakeside estate" });
  const result = rankWeddingVendorCandidates({
    sources: [thin, source("blank")],
    requirements: { ...venueSearch, preferences: STYLE_WORDS },
    now: NOW,
  });
  const candidate = result.verify.find((item) => item.id === "thin");
  assert.equal(candidate?.fit, 100);
  assert.equal(candidate?.confidenceBucket, "low");
  const blank = result.verify.find((item) => item.id === "blank");
  assert.equal(blank?.fit, null);
  assert.equal(blank?.fitLabel, "Fit not yet assessable");
});

test("non-venue vendors carry execution risk and ignore venue-only components", () => {
  const result = rankWeddingVendorCandidates({
    sources: [
      source("cautious", {
        category: "photographer",
        attributes: {
          backup_shooter: attr(true),
          equipment_redundancy: attr(true),
          contract_provided: attr(true),
        },
      }),
      source("risky", {
        category: "photographer",
        attributes: { backup_shooter: attr(false), equipment_redundancy: attr(false) },
      }),
    ],
    requirements: { vendorCategories: ["photographer"], guestCount: "140" },
    now: NOW,
  });
  assert.deepEqual(ids(result.verify), ["cautious", "risky"]);
  const cautious = result.verify[0];
  assert.ok(!cautious?.components.some((item) => item.id === "capacity" || item.id === "planning"));
  assert.equal(cautious?.unknownHardConstraints.includes("capacity"), false);
});

test("listicles, editorial pages and permanently closed businesses are defensively excluded", () => {
  const result = rankWeddingVendorCandidates({
    sources: [
      source("list", { source_kind: "listicle" }),
      source("closed", { attributes: { business_status: attr("CLOSED_PERMANENTLY") } }),
      source("open", { attributes: { business_status: attr("OPERATIONAL") } }),
    ],
    requirements: venueSearch,
    now: NOW,
  });
  assert.deepEqual(ids(result.excluded).sort(), ["closed", "list"]);
  assert.deepEqual(ids(result.verify), ["open"]);
});

test("official-site resolution is suggested only for vendors without a website", () => {
  const result = rankWeddingVendorCandidates({
    sources: [source("nosite", { websiteUrl: null }), source("site")],
    requirements: venueSearch,
    now: NOW,
  });
  const resolve = result.nextActions.filter((action) => action.kind === "resolve_official_site");
  assert.deepEqual(resolve.map((action) => action.choiceId), ["nosite"]);
  assert.ok(result.nextActions.length <= 5);
});

test("guest count parsing handles prose, ranges and years", () => {
  assert.equal(parseGuestCount("about 60"), 60);
  assert.equal(parseGuestCount("50-80"), 80);
  assert.equal(parseGuestCount("between 50 and 80 people"), 80);
  assert.equal(parseGuestCount("120 guests"), 120);
  assert.equal(parseGuestCount("March 2027, 90 guests"), 90);
  assert.equal(parseGuestCount("not sure yet"), null);
  assert.equal(parseGuestCount(null), null);
});

test("budget parsing handles shorthand, separators, ranges and unknowns", () => {
  assert.equal(parseBudgetAud("$30k"), 30_000);
  assert.equal(parseBudgetAud("30,000"), 30_000);
  assert.equal(parseBudgetAud("under 25k"), 25_000);
  assert.equal(parseBudgetAud("25-30k"), 30_000);
  assert.equal(parseBudgetAud("$25,000 - $35,000"), 35_000);
  assert.equal(parseBudgetAud("1.5k"), 1_500);
  assert.equal(parseBudgetAud("flexible"), null);
  assert.equal(parseBudgetAud(""), null);
});

test("server evidence normalises to only the keys that are present", () => {
  assert.deepEqual(normalizeWeddingVendorSourceEvidence({ title: "x", url: "https://x.test" }), {});
  const evidence = normalizeWeddingVendorSourceEvidence({
    vendor_id: " v1 ",
    source_kind: "official",
    rating: 4.6,
    review_count: 120,
    attributes: {
      capacity_seated_max: { status: "known", value: 140, confidence: 0.9, authority: "primary_official" },
      pets_allowed: { status: "unknown", value: null, confidence: null, authority: null },
      broken: { status: "bogus" },
    },
    availability: { state: "enquiry_sent", checked_at: "2026-09-30T00:00:00Z" },
    limited_special: { available_on_date: "2027-07-12", last_confirmed_at: "2026-09-30T00:00:00Z", confirmation_expires_at: "2026-10-14T00:00:00Z", indicative_only: true },
  });
  assert.equal(evidence.vendor_id, "v1");
  assert.equal(evidence.attributes?.capacity_seated_max?.value, 140);
  assert.equal(evidence.attributes?.pets_allowed?.status, "unknown");
  assert.equal(evidence.attributes?.broken, undefined);
  assert.equal(evidence.availability?.state, "enquiry_sent");
  assert.equal(evidence.limited_special?.available_on_date, "2027-07-12");
  assert.equal(normalizeWeddingVendorSourceEvidence({ availability: { state: "maybe" } }).availability, undefined);
  assert.equal(normalizeWeddingVendorSourceEvidence({ limited_special: { available_on_date: "soon" } }).limited_special, undefined);
});

test("fresh limited-date evidence makes availability actionable without exposing package terms", () => {
  const result = rankWeddingVendorCandidates({ sources: [source("special", {
    availability: availability("confirmed_available", "2026-10-14T00:00:00Z"),
    limited_special: { available_on_date: "2027-07-12", last_confirmed_at: "2026-09-30T00:00:00Z", confirmation_expires_at: "2026-10-14T00:00:00Z", indicative_only: true },
  })], requirements: venueSearch, rankingPolicy: "2", now: NOW });
  assert.equal(result.bookable[0]?.availabilityLabel, "Vendor-confirmed opening · details available if shortlisted");
  assert.ok(result.bookable[0]?.rationaleLabels.includes("Vendor recently confirmed an opening on your selected date"));
});

test("card fields default legacy cards to an unrecorded availability and read saved ones", () => {
  const legacy = weddingVendorRankingCardFieldsFromRecord({});
  assert.equal(legacy.group, "verify");
  assert.equal(legacy.availabilityState, "unknown");
  assert.equal(legacy.availabilityLabel, "Availability unknown");
  assert.deepEqual(legacy.unknownConstraints, []);
  assert.equal(legacy.vendorId, null);

  const saved = weddingVendorRankingCardFieldsFromRecord({
    group: "bookable",
    availability_state: "temporary_hold",
    confidence_label: "medium confidence",
    vendor_id: "v1",
    wedding_plan_id: "wp1",
    unknown_constraints: ["capacity", " ", "price"],
  });
  assert.equal(saved.group, "bookable");
  assert.equal(saved.availabilityLabel, "On hold for you");
  assert.equal(saved.vendorId, "v1");
  assert.equal(saved.weddingPlanId, "wp1");
  assert.deepEqual(saved.unknownConstraints, ["capacity", "price"]);
  assert.equal(weddingVendorRankingCardFieldsFromRecord({ group: "nonsense" }).group, "verify");
});
