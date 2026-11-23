import test from "node:test";
import assert from "node:assert/strict";

import {
  WEDDING_BUDGET_CATEGORY_GUIDANCE,
  WEDDING_BUDGET_MODEL_VERSION,
  WEDDING_BUDGET_TARGET_TOTAL,
  buildWeddingBudgetSuggestedAllocation,
  buildWeddingBudgetCategoryGuidanceLabel,
  weddingBudgetLocationMarketNote,
} from "../src/lib/weddingBudgetGuidanceState.ts";
import { WEDDING_BUDGET_CATEGORIES } from "../src/lib/weddingBudgetAllocationState.ts";

test("budget guidance covers every wedding budget category", () => {
  assert.deepEqual(
    Object.keys(WEDDING_BUDGET_CATEGORY_GUIDANCE).sort(),
    WEDDING_BUDGET_CATEGORIES.map((category) => category.id).sort(),
  );
});

test("budget model v1 has one balanced target allocation instead of additive overlapping midpoints", () => {
  assert.equal(WEDDING_BUDGET_MODEL_VERSION, 1);
  assert.equal(WEDDING_BUDGET_TARGET_TOTAL, 100);
  assert.equal(
    Object.values(WEDDING_BUDGET_CATEGORY_GUIDANCE)
      .reduce((sum, category) => sum + (category.lowShare + category.highShare) / 2, 0),
    100,
  );
});

test("budget guidance gives a useful midpoint before the couple enters a total", () => {
  const guidance = buildWeddingBudgetCategoryGuidanceLabel({
    categoryId: "venue_ceremony",
    totalAmount: 0,
    currency: "AUD",
    locationLabel: "Sydney",
  });

  assert.match(guidance.rangeLabel, /Sydney/);
  assert.match(guidance.rangeLabel, /26-30%/);
  assert.match(guidance.averageLabel, /28%/);
  assert.match(guidance.averageLabel, /total 100%/);
  assert.match(guidance.locationNote, /higher venue minimums/i);
  assert.match(guidance.practicalTip, /minimum spend/i);
});

test("budget guidance converts planning norms into dollar ranges once total budget is known", () => {
  const guidance = buildWeddingBudgetCategoryGuidanceLabel({
    categoryId: "catering_drinks",
    totalAmount: 40_000,
    currency: "AUD",
    locationLabel: "Brisbane",
  });

  assert.match(guidance.rangeLabel, /\$7,600/);
  assert.match(guidance.rangeLabel, /\$10,000/);
  assert.match(guidance.averageLabel, /\$8,800/);
  assert.match(guidance.locationNote, /season/i);
  assert.match(guidance.practicalTip, /service charge/i);
});

test("budget location notes fall back calmly when no exact region is known", () => {
  assert.match(
    weddingBudgetLocationMarketNote(""),
    /your wedding location/i,
  );
  assert.match(
    weddingBudgetLocationMarketNote("Central Coast"),
    /guest count/i,
  );
});

test("suggested budget items always reconcile to the couple's total", () => {
  const allocation = buildWeddingBudgetSuggestedAllocation({ totalAmount: 40_000 });

  assert.equal(allocation.length, WEDDING_BUDGET_CATEGORIES.length);
  assert.equal(allocation.reduce((sum, category) => sum + category.amount, 0), 40_000);
  assert.ok(Math.abs(allocation.reduce((sum, category) => sum + category.share, 0) - 100) < 0.2);
  assert.ok(allocation.every((category) => category.amount >= 0));
  assert.ok(allocation.every((category) => !category.personalized));
});

test("known style priorities gently personalise the split without inventing a quote", () => {
  const baseline = buildWeddingBudgetSuggestedAllocation({ totalAmount: 40_000 });
  const personalised = buildWeddingBudgetSuggestedAllocation({
    totalAmount: 40_000,
    preferenceSignals: ["A long-table feast with great wine", "Documentary photography and after-dark energy"],
  });
  const share = (items: typeof personalised, categoryId: string) =>
    items.find((item) => item.categoryId === categoryId)?.share ?? 0;

  assert.ok(share(personalised, "catering_drinks") > share(baseline, "catering_drinks"));
  assert.ok(share(personalised, "photo_video") > share(baseline, "photo_video"));
  assert.ok(share(personalised, "entertainment_music") > share(baseline, "entertainment_music"));
  assert.equal(personalised.reduce((sum, category) => sum + category.amount, 0), 40_000);
  assert.match(
    personalised.find((category) => category.categoryId === "catering_drinks")?.reasonLabel ?? "",
    /Adjusted from the usual split/i,
  );
});
