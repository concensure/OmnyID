import test from "node:test";
import assert from "node:assert/strict";

import {
  WEDDING_BUDGET_CATEGORY_GUIDANCE,
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

test("budget guidance gives a useful midpoint before the couple enters a total", () => {
  const guidance = buildWeddingBudgetCategoryGuidanceLabel({
    categoryId: "venue_ceremony",
    totalAmount: 0,
    currency: "AUD",
    locationLabel: "Sydney",
  });

  assert.match(guidance.rangeLabel, /Sydney/);
  assert.match(guidance.rangeLabel, /35-50%/);
  assert.match(guidance.averageLabel, /43%/);
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

  assert.match(guidance.rangeLabel, /\$10,000/);
  assert.match(guidance.rangeLabel, /\$16,000/);
  assert.match(guidance.averageLabel, /\$13,000/);
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
