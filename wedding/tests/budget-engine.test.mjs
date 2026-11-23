import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const context = { window: {} };
vm.createContext(context);
for (const file of ['budget-model.v1.js', 'budget-costs.v1.js', 'budget-engine.js']) {
  vm.runInContext(await readFile(new URL(`../assets/js/${file}`, import.meta.url), 'utf8'), context);
}
const model = context.window.OMNYID_WEDDING_BUDGET_MODEL_V1;
const costs = context.window.OMNYID_WEDDING_BUDGET_COSTS_V1;
const engine = context.window.OmnyWeddingBudgetEngine;

test('budget allocation totals exactly one hundred percent and the entered amount', () => {
  const result = engine.calculate({ totalBudget: 35003, guests: 90, priorities: ['photo_video'] }, model, costs);
  assert.equal(result.ok, true);
  assert.equal(result.targetTotal, 100);
  assert.equal(result.amountTotal, 35003);
  assert.ok(result.allocation.find((row) => row.id === 'photo_video').share > 12);
});

test('priority boosts never move another category below its planning floor', () => {
  const result = engine.calculate({ totalBudget: 50000, guests: 100, priorities: ['venue_ceremony', 'photo_video', 'flowers_decor'] }, model, costs);
  for (const row of result.allocation) assert.ok(row.share >= row.lowShare, `${row.id} dropped below its low share`);
});

test('conditional costs respond to the visitor inputs without invented amounts', () => {
  const result = engine.calculate({ totalBudget: 50000, guests: 120, setting: 'outdoor', locationType: 'regional', drinks: 'byo', day: 'sunday' }, model, costs);
  const ids = result.missingCosts.map((item) => item.id);
  for (const expected of ['wet-weather', 'travel-delivery', 'corkage', 'sunday-surcharge', 'staffing']) assert.ok(ids.includes(expected));
  assert.ok(result.missingCosts.every((item) => !Object.hasOwn(item, 'amount')));
});

test('invalid totals and guest counts fail before an allocation is produced', () => {
  assert.equal(engine.calculate({ totalBudget: 999, guests: 80 }, model, costs).ok, false);
  assert.equal(engine.calculate({ totalBudget: 50000, guests: 0 }, model, costs).ok, false);
});
