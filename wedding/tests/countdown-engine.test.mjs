import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/countdown-engine.js', import.meta.url), 'utf8');
const catalogue = JSON.parse(await readFile(new URL('../assets/data/wedding-catalogue.v1.json', import.meta.url), 'utf8'));

function engine() {
  const context = { URLSearchParams };
  vm.runInNewContext(source, context);
  return context.OmnyWeddingCountdown;
}

test('public catalogue exposes the shared complete planner authority', () => {
  assert.equal(catalogue.schema, 'wedding-catalogue.v1');
  assert.equal(catalogue.publicationReady, true);
  assert.equal(catalogue.tasks.length, 65);
  assert.equal(catalogue.vendorLeadTimeRules.length, 31);
  assert.equal(catalogue.stages.length, 6);
});

test('exact dates produce deterministic next actions across leap days and month ends', () => {
  const api = engine();
  const first = api.buildPlan(catalogue, { weddingDate: '2028-02-29', today: '2027-02-28', doneIds: [] });
  const second = api.buildPlan(catalogue, { weddingDate: '2028-02-29', today: '2027-02-28', doneIds: [] });
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(first.tasks.length, 65);
  assert.equal(first.noim.originalTargetDate, '2027-12-01');
  assert.ok(first.nextTasks.length <= 5);
});

test('short plans keep every item and never display an incomplete task in the past', () => {
  const plan = engine().buildPlan(catalogue, { weddingDate: '2027-01-31', today: '2026-11-04', doneIds: ['set-budget'] });
  assert.equal(plan.compressedPlan, true);
  assert.equal(plan.tasks.length, 65);
  assert.ok(plan.catchUpTasks.length > 0);
  assert.ok(plan.tasks.filter((task) => !task.completed).every((task) => task.targetDate >= '2026-11-04'));
  assert.equal(plan.tasks.find((task) => task.id === 'set-budget').status, 'completed');
});

test('calendar and share outputs carry tasks without couple names or other profile data', () => {
  const api = engine();
  const plan = api.buildPlan(catalogue, { weddingDate: '2027-11-20', today: '2026-11-04', doneIds: ['set-budget'] });
  const ics = api.buildIcs(plan);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /TRIGGER:-P7D/);
  assert.doesNotMatch(ics, /ATTENDEE|ORGANIZER|MAILTO|casper|alice@example/i);
  const hash = api.buildShareHash('2027-11-20', ['set-budget', 'estimate-guests']);
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseShareHash(hash))), { weddingDate: '2027-11-20', doneIds: ['set-budget', 'estimate-guests'] });
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseShareHash('#date=bad&done=ok,%3Cscript%3E'))), { weddingDate: '', doneIds: ['ok'] });
});
