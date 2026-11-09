import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/quote-decoder-engine.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const engine = window.OmnyVenueQuoteEngine;

const perHead = engine.blankProposal('a');
Object.assign(perHead, {
  pricingModel: 'per_head',
  perHeadRate: 275,
  quoteGuests: 120,
  gst: 'included',
  includedHours: 5,
  paymentSchedule: '20% deposit, balance 30 days before',
  inclusions: ['Dinner', 'Beverage package'],
});
const perHeadResult = engine.calculate(perHead, 120, 5);
assert.equal(perHeadResult.estimatedTotal, 33_000);
assert.equal(perHead.packageTotal, null, 'component subtotal must not become a package total');
assert.match(perHeadResult.lines[0].basis, /120 × 275/);

const excludedGst = engine.blankProposal('b');
Object.assign(excludedGst, {
  pricingModel: 'fixed',
  packageTotal: 10_000,
  gst: 'excluded',
  includedHours: 6,
  paymentSchedule: 'Paid in full before the event',
  inclusions: ['Drinks'],
});
assert.equal(engine.calculate(excludedGst, 80, 6).estimatedTotal, 11_000);

const unknownGst = { ...excludedGst, gst: 'not_stated' };
const unknownResult = engine.calculate(unknownGst, 80, 6);
assert.equal(unknownResult.estimatedTotal, 10_000, 'unknown GST must not be silently added');
assert.ok(unknownResult.unknowns.includes('GST treatment'));

const noCorePrice = engine.blankProposal('c');
const noCoreResult = engine.calculate(noCorePrice, 100, 6);
assert.equal(noCoreResult.estimatedTotal, null, 'missing pricing must remain unknown rather than becoming zero');

const changed = engine.compareFields(
  { fields: { per_head_rate: { value: 98 } }, line_items: [] },
  { fields: { per_head_rate: { value: 88 } }, line_items: [] },
);
assert.deepEqual(Array.from(changed), ['Per-head package rate: 98 → 88']);

console.log(JSON.stringify({ deterministicTotals: true, componentSubtotalProtected: true, unknownsPreserved: true, diff: true }));
