import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingNeedToKnowProbingState,
} from "../src/lib/weddingNeedToKnowProbingState.ts";

test("buildWeddingNeedToKnowProbingState starts sparse plans with one date question", () => {
  const state = buildWeddingNeedToKnowProbingState({});

  assert.equal(state.isReadyForFirstRecommendations, false);
  assert.equal(state.nextQuestion?.slot, "date_or_season");
  assert.match(state.nextQuestion?.question ?? "", /date, month, or season/i);
  assert.deepEqual(state.missingSlots.slice(0, 3), ["date_or_season", "location", "guest_count"]);
  assert.ok(state.deferredSensitiveSlots.includes("cultural_or_religious_requirements"));
  assert.ok(state.deferredSensitiveSlots.includes("accessibility_requirements"));
  assert.match(state.progressLabel, /Needs date or season/i);
});

test("buildWeddingNeedToKnowProbingState asks for location after date is known", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Spring 2027",
  });

  assert.equal(state.nextQuestion?.slot, "location");
  assert.match(state.nextQuestion?.improves ?? "", /maps/i);
  assert.ok(state.answeredSlots.includes("date_or_season"));
});

test("buildWeddingNeedToKnowProbingState asks budget and priorities before first recommendations", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "2027-10-03",
    location: "Sydney",
    guestCount: 120,
    decisionContext: "first_plan",
  });

  assert.equal(state.nextQuestion?.slot, "budget_comfort");
  assert.equal(state.nextQuestion?.sensitivity, "medium");
  assert.ok(state.missingSlots.includes("top_priorities"));
  assert.equal(state.isReadyForFirstRecommendations, false);
});

test("buildWeddingNeedToKnowProbingState is ready when core and preference context exists", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "2027-10-03",
    location: "Sydney",
    guestCount: 120,
    budgetComfort: "mid-range",
    topPriorities: ["food", "photos", "low stress"],
    decisionContext: "first_plan",
  });

  assert.equal(state.nextQuestion, null);
  assert.equal(state.isReadyForFirstRecommendations, true);
  assert.equal(state.progressLabel, "Ready for first recommendations");
});

test("buildWeddingNeedToKnowProbingState asks Australian couples whether NOIM is downloaded", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "2027-10-03",
    location: "Hunter Valley, NSW",
    guestCount: 120,
    budgetComfort: "mid-range",
    topPriorities: ["food", "photos", "low stress"],
    decisionContext: "first_plan",
  });

  assert.equal(state.nextQuestion?.slot, "noim_downloaded");
  assert.equal(state.nextQuestion?.sensitivity, "medium");
  assert.match(state.nextQuestion?.reason ?? "", /official form/i);
  assert.ok(state.nextQuestion?.sourceLabels.some((label) => /Attorney-General/i.test(label)));
});

test("buildWeddingNeedToKnowProbingState asks Australian couples for celebrant path after NOIM status", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "2027-10-03",
    location: "Sydney, Australia",
    guestCount: 120,
    budgetComfort: "mid-range",
    topPriorities: ["ceremony", "low stress"],
    noimDownloaded: "yes",
    decisionContext: "australian_legal_setup",
  });

  assert.equal(state.nextQuestion?.slot, "celebrant_path");
  assert.match(state.nextQuestion?.question ?? "", /own authorised marriage celebrant/i);
  assert.match(state.nextQuestion?.reason ?? "", /how, when, where/i);
});

test("buildWeddingNeedToKnowProbingState is ready for Australian first recommendations after legal setup answers", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "2027-10-03",
    countryCode: "AU",
    location: "Sydney",
    guestCount: 120,
    budgetComfort: "mid-range",
    topPriorities: ["ceremony", "low stress"],
    noimDownloaded: false,
    celebrantPath: "need_options",
    decisionContext: "first_plan",
  });

  assert.equal(state.nextQuestion, null);
  assert.equal(state.isReadyForFirstRecommendations, true);
  assert.ok(state.answeredSlots.includes("noim_downloaded"));
  assert.ok(state.answeredSlots.includes("celebrant_path"));
});

test("buildWeddingNeedToKnowProbingState asks cultural requirements only when ceremony or vendor decisions need them", () => {
  const ordinary = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Autumn 2027",
    location: "Melbourne",
    guestCount: "80",
    budgetComfort: "flexible",
    topPriorities: ["ceremony"],
    decisionContext: "first_plan",
  });
  const ceremony = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Autumn 2027",
    location: "Melbourne",
    guestCount: "80",
    budgetComfort: "flexible",
    topPriorities: ["ceremony"],
    vowPreference: "standard",
    decisionContext: "ceremony_structure",
  });

  assert.equal(ordinary.nextQuestion, null);
  assert.ok(ordinary.deferredSensitiveSlots.includes("cultural_or_religious_requirements"));
  assert.equal(ceremony.nextQuestion?.slot, "cultural_or_religious_requirements");
  assert.equal(ceremony.nextQuestion?.sensitivity, "high");
});

test("buildWeddingNeedToKnowProbingState asks vow choice during ceremony preparation", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Autumn 2027",
    location: "Melbourne",
    guestCount: "80",
    budgetComfort: "flexible",
    topPriorities: ["ceremony"],
    decisionContext: "ceremony_structure",
  });

  assert.equal(state.nextQuestion?.slot, "vow_preference");
  assert.match(state.nextQuestion?.question ?? "", /personal vows/i);
  assert.match(state.nextQuestion?.reason ?? "", /early enough/i);
});

test("buildWeddingNeedToKnowProbingState asks vow style only after personal vows are chosen", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Autumn 2027",
    location: "Melbourne",
    guestCount: "80",
    budgetComfort: "flexible",
    topPriorities: ["ceremony"],
    vowPreference: "create",
    decisionContext: "ceremony_structure",
  });

  assert.equal(state.nextQuestion?.slot, "vow_style");
  assert.match(state.nextQuestion?.suggestedAnswers.join(" "), /Story-based/i);
});

test("buildWeddingNeedToKnowProbingState asks dietary requirements for catering decisions", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Summer",
    location: "Brisbane",
    guestCount: 60,
    budgetComfort: "lean",
    topPriorities: ["food"],
    decisionContext: "catering",
  });

  assert.equal(state.nextQuestion?.slot, "dietary_requirements");
  assert.match(state.nextQuestion?.reason ?? "", /not needed for unrelated planning/i);
});

test("buildWeddingNeedToKnowProbingState asks vendor categories before vendor search", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Autumn 2027",
    location: "Sydney",
    guestCount: 80,
    budgetComfort: "mid-range",
    topPriorities: ["photos", "music"],
    decisionContext: "vendor_shortlist",
  });

  assert.equal(state.nextQuestion?.slot, "vendor_categories");
  assert.match(state.nextQuestion?.reason ?? "", /bands, DJs/i);
});

test("buildWeddingNeedToKnowProbingState asks vendor preferences after categories", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Autumn 2027",
    location: "Sydney",
    guestCount: 80,
    budgetComfort: "mid-range",
    topPriorities: ["photos", "music"],
    vendorCategories: ["band"],
    decisionContext: "vendor_shortlist",
  });

  assert.equal(state.nextQuestion?.slot, "vendor_preferences");
  assert.match(state.nextQuestion?.question ?? "", /narrow those vendors/i);
});

test("buildWeddingNeedToKnowProbingState separates photography style from day-of coverage", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Autumn 2027",
    location: "Sydney",
    guestCount: 80,
    budgetComfort: "mid-range",
    topPriorities: ["photos"],
    vendorCategories: ["photographer"],
    vendorPreferences: "natural photos, calm communication",
    decisionContext: "vendor_shortlist",
  });

  assert.equal(state.nextQuestion?.slot, "photography_scope");
  assert.match(state.nextQuestion?.reason ?? "", /different searches/i);
});

test("buildWeddingNeedToKnowProbingState asks accessibility needs for venue logistics only", () => {
  const state = buildWeddingNeedToKnowProbingState({
    dateOrSeason: "Winter",
    location: "Canberra",
    guestCount: 40,
    budgetComfort: "mid-range",
    topPriorities: ["easy for guests"],
    decisionContext: "venue_shortlist",
  });

  assert.equal(state.nextQuestion?.slot, "accessibility_requirements");
  assert.equal(state.nextQuestion?.sensitivity, "high");
  assert.match(state.nextQuestion?.improves ?? "", /venue shortlist/i);
});
