import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingNeedToKnowExtractionState } from "@/lib/weddingNeedToKnowExtractionState";

test("wedding need-to-know extraction captures a rich planning message", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:harbour",
    text: "We are Alex and Sam planning a wedding on 2027-10-03 in Sydney NSW for about 90 guests. Budget is mid-range. Priorities are food, photos, and low stress. The day should feel relaxed, garden-like, and candlelit. Inspiration: https://example.com/wedding.jpg. We have not downloaded NOIM and need celebrant options.",
  });

  assert.equal(state.draft.dateOrSeason, "2027-10-03");
  assert.equal(state.draft.location, "Sydney NSW");
  assert.equal(state.draft.guestCount, "90");
  assert.equal(state.draft.budgetComfort, "mid-range");
  assert.equal(state.draft.prioritiesCsv, "food, photos, low stress");
  assert.equal(state.draft.atmosphereDescription, "relaxed, garden-like, and candlelit");
  assert.equal(state.draft.inspirationImageUrlsText, "https://example.com/wedding.jpg");
  assert.equal(state.draft.coupleNames, "Alex and Sam");
  assert.equal(state.draft.noimDownloaded, "no");
  assert.equal(state.draft.celebrantPath, "need_options");
  assert.equal(state.canGenerateFollowUp, true);
  assert.deepEqual(state.capturedSlots, [
    "date_or_season",
    "location",
    "guest_count",
    "budget_comfort",
    "priorities",
    "atmosphere",
    "image_links",
    "couple_names",
    "noim_status",
    "celebrant_path",
  ]);
});

test("wedding need-to-know extraction captures season, range, and budget comfort conservatively", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:valley",
    text: "Maybe spring 2028 around Hunter Valley, 100-120 guests, keep it lean.",
  });

  assert.equal(state.draft.dateOrSeason, "Spring 2028");
  assert.equal(state.draft.location, "Hunter Valley");
  assert.equal(state.draft.guestCount, "100-120");
  assert.equal(state.draft.budgetComfort, "keep it lean");
  assert.equal(state.canGenerateFollowUp, true);
  assert.ok(state.needsReviewLabels.some((label) => label.includes("exact calendar reminders")));
  assert.ok(state.needsReviewLabels.some((label) => label.includes("approximate")));
});

test("wedding need-to-know extraction handles relative month without leaking it into location", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:relative-date",
    nowIso: "2026-09-29T00:00:00.000Z",
    text: "October next year. Expect about 60 people in Sydney with a relaxed intimate feeling and budget 30000.",
  });

  assert.equal(state.draft.dateOrSeason, "October 2027");
  assert.equal(state.draft.location, "Sydney");
  assert.equal(state.draft.guestCount, "60");
  assert.equal(state.draft.budgetComfort, "Budget 30000");
  assert.notEqual(state.draft.location, "October next year. expect");
});

test("wedding need-to-know extraction handles relative season labels", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:relative-season",
    nowIso: "2026-09-29T00:00:00.000Z",
    text: "We are thinking autumn next year around Melbourne for 70 guests.",
  });

  assert.equal(state.draft.dateOrSeason, "Autumn 2027");
  assert.equal(state.draft.location, "Melbourne");
});

test("wedding need-to-know extraction keeps style phrases out of location", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:gothic-beachfront",
    text: "We want a 60 people wedding at a beachfront location, in Gothic style in Sydney. Budget 30000 and relaxed but dramatic.",
  });

  assert.equal(state.draft.location, "Sydney");
  assert.equal(state.draft.guestCount, "60");
  assert.equal(state.draft.budgetComfort, "Budget 30000");
  assert.notEqual(state.draft.location, "Gothic style in Sydney");
});

test("wedding need-to-know extraction merges existing draft and does not blank missing fields", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:merge",
    existingDraft: {
      responseWorkspaceId: "response_workspace:merge",
      dateOrSeason: "October 2027",
      location: "Sydney NSW",
      guestCount: "80",
      budgetComfort: "Flexible budget",
      prioritiesCsv: "food, family",
      noimDownloaded: "unknown",
      celebrantPath: "",
    },
    text: "We have our own authorised celebrant.",
  });

  assert.equal(state.draft.dateOrSeason, "October 2027");
  assert.equal(state.draft.location, "Sydney NSW");
  assert.equal(state.draft.guestCount, "80");
  assert.equal(state.draft.budgetComfort, "Flexible budget");
  assert.equal(state.draft.prioritiesCsv, "food, family");
  assert.equal(state.draft.noimDownloaded, "unknown");
  assert.equal(state.draft.celebrantPath, "own_celebrant");
  assert.deepEqual(state.capturedSlots, ["celebrant_path"]);
});

test("wedding need-to-know extraction captures downloaded NOIM and public celebrant path", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:legal",
    text: "We already downloaded the NOIM and want a registry celebrant option.",
  });

  assert.equal(state.draft.noimDownloaded, "yes");
  assert.equal(state.draft.celebrantPath, "public_or_registry_celebrant");
});

test("wedding need-to-know extraction does not let a later slot bleed into priorities when there is no sentence break", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:placeholder",
    text: "We are planning for October 2027 in Sydney NSW, about 90 guests, mid-range budget, priorities are food and photos, NOIM not downloaded, need celebrant options.",
  });

  assert.equal(state.draft.prioritiesCsv, "food, photos");
  assert.equal(state.draft.noimDownloaded, "no");
  assert.equal(state.draft.celebrantPath, "need_options");
});

test("wedding need-to-know extraction captures a budget phrased with 'of' rather than 'is'", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:budget-of",
    text: "Our wedding budget of $20,000 needs to cover everything.",
  });

  assert.equal(state.draft.budgetComfort, "$20,000");
});

test("wedding need-to-know extraction stays empty for unrelated conversation", () => {
  const state = buildWeddingNeedToKnowExtractionState({
    responseWorkspaceId: "response_workspace:empty",
    text: "Can you make the planning output feel less formal?",
  });

  assert.equal(state.draft.dateOrSeason, "");
  assert.equal(state.draft.location, "");
  assert.equal(state.draft.guestCount, "");
  assert.equal(state.canGenerateFollowUp, false);
  assert.deepEqual(state.capturedSlots, []);
});
