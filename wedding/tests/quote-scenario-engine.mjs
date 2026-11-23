import assert from 'node:assert/strict';

globalThis.window = globalThis;
await import('../assets/js/quote-decoder-engine.js');

const engine = globalThis.OmnyVenueQuoteEngine;
const ready = (prefix, label, rate, minimumSpend = null) => ({
  ...engine.blankProposal(prefix),
  label,
  pricingModel: minimumSpend == null ? 'per_head' : 'minimum_spend',
  perHeadRate: rate,
  minimumSpend,
  gst: 'included',
  includedHours: 6,
  paymentSchedule: 'Deposit due on acceptance',
  depositAmount: 500,
  cancellationTerms: 'Stated',
  dateStatus: 'available',
});

const venueA = ready('a', 'Venue A', 120, 5000);
const venueB = ready('b', 'Venue B', 150);
assert.equal(engine.calculate(venueA, 30, 6).estimatedTotal, 5000);
assert.equal(engine.calculate(venueB, 30, 6).estimatedTotal, 4500);
assert.equal(engine.calculate(venueA, 40, 6).estimatedTotal, 5000);
assert.equal(engine.calculate(venueB, 40, 6).estimatedTotal, 6000);
assert.match(engine.decisionSupport([venueA, venueB], { a: engine.calculate(venueA, 40, 6), b: engine.calculate(venueB, 40, 6) }, 35000).tradeOff, /Venue A/);

const floorQuote = ready('a', 'Floor venue', 48, 5000);
floorQuote.lineItems = [{
  label: 'Optional drinks upgrade', unit: 'fixed', amount: 400,
  counted: true, originalCounted: true, scenarioIncluded: false,
  originalQuantity: 1, scenarioQuantity: 1, changeability: 'optional',
  minimumEligible: true,
}];
assert.equal(engine.calculate(floorQuote, 100, 6, { original: true }).estimatedTotal, 5200);
const scenario = engine.calculate(floorQuote, 100, 6);
assert.equal(scenario.estimatedTotal, 5000);
assert.equal(scenario.scenarioChanged, true);
assert.deepEqual(scenario.lines.find((line) => line.label === 'Minimum-spend adjustment')?.amount, 200);

const mandatory = ready('a', 'Mandatory venue', 100);
mandatory.lineItems = [{ label: 'Required staffing', unit: 'fixed', amount: 600, counted: true, originalCounted: true, scenarioIncluded: false, originalQuantity: 1, scenarioQuantity: 0, changeability: 'mandatory', minimumEligible: false }];
assert.equal(engine.calculate(mandatory, 30, 6).estimatedTotal, 3600);
assert.match(engine.calculate(mandatory, 30, 6).assumptions.join(' '), /cannot be removed/);

const outOfRange = ready('a', 'Capacity venue', 100);
outOfRange.maximumGuests = 50;
assert.equal(engine.calculate(outOfRange, 60, 6).viability, 'does_not_meet');
assert.match(engine.calculate(outOfRange, 60, 6).confirmationReasons.join(' '), /exceeds/);
const viableAlternative = ready('b', 'Viable venue', 120);
const capacityDecision = engine.decisionSupport(
  [outOfRange, viableAlternative],
  { a: engine.calculate(outOfRange, 60, 6), b: engine.calculate(viableAlternative, 60, 6) },
  35_000,
);
assert.equal(capacityDecision.lowerPrefix, 'b');
assert.match(capacityDecision.recommendation, /Viable venue/);

console.log(JSON.stringify({ crossover: true, minimumSpendFloor: true, originalPreserved: true, mandatoryProtected: true, viabilityChecked: true }));
