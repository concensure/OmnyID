import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PlanningContractSchema,
  assertPlanningConstraintIngress,
  assertPlanningConstraintSuccessor,
  planningContractFingerprint,
} from '../dist/planning-intelligence.js';

const fixtureUrl = new URL('../../tests/fixtures/planning/contract-cases.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

test('shared planning contract fixtures fail closed and keep Rust fingerprints', async () => {
  assert.equal(fixture.schema_version, 'planning.contract_fixture.v1');
  for (const entry of fixture.cases) {
    const parsed = PlanningContractSchema.safeParse(entry.payload);
    assert.equal(parsed.success, entry.valid, entry.name);
    if (parsed.success) {
      assert.equal(await planningContractFingerprint(parsed.data), entry.fingerprint, entry.name);
    }
  }
});

test('generic contracts do not require wedding-specific fields', () => {
  const source = JSON.stringify(fixture);
  for (const forbidden of ['wedding_id', 'guest_id', 'venue_id', 'couple_name']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes('home_renovation'), true);
});

test('constraint ingress and successor checks preserve authority and privacy', () => {
  const previous = structuredClone(fixture.cases.find((entry) => entry.name === 'renovation_step_free_constraint').payload);
  assert.throws(() => assertPlanningConstraintIngress(previous, previous.plan_id, false), /confirmation authority/);
  assert.throws(() => assertPlanningConstraintIngress(previous, 'plan:other', true), /plan authority/);
  assert.doesNotThrow(() => assertPlanningConstraintIngress(previous, previous.plan_id, true));

  const successor = structuredClone(previous);
  successor.constraint_id = 'constraint:renovation:step-free:v2';
  successor.supersedes = previous.constraint_id;
  successor.status = 'confirmed';
  successor.privacy = 'shareable_with_approval';
  assert.throws(() => assertPlanningConstraintSuccessor(previous, successor, false), /relax privacy/);
  assert.doesNotThrow(() => assertPlanningConstraintSuccessor(previous, successor, true));
});
