import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('../assets/js/quiz-data.js');
const engine = require('../assets/js/quiz-engine.js');

assert.equal(data.VERSION, 2);
assert.equal(data.DIMENSIONS.length, 6);
assert.equal(data.QUESTIONS.length, 12);
assert.equal(data.QUESTIONS.every((question) => question.opts.length === 4), true);
assert.equal(data.QUESTIONS.flatMap((question) => question.opts).every((option) => option.art && option.img), true);

const answers = Object.fromEntries(data.QUESTIONS.map((question) => [question.id, question.opts[0].id]));
const result = engine.buildResult(answers);
assert.deepEqual(result.dimension_scores.map((score) => score.score), [0, 0, 0, 0, 0, 0]);
assert.deepEqual(result.dimension_scores.map((score) => score.count), [2, 2, 2, 2, 2, 2]);
assert.equal(result.evidence_answer_ids.length, 12);
assert.ok(result.animal_id);

const revised = { ...answers, Q01: 'D', Q07: 'D' };
assert.equal(engine.buildResult(revised).dimension_scores[0].score, 100);
const incomplete = engine.buildResult({ Q01: 'A', Q02: 'A', Q03: 'A' });
assert.equal(incomplete.animal_id, null);
assert.equal(incomplete.dimension_scores[3].score, null);

const partner = engine.partnerHash(answers);
assert.equal(partner.includes('Private'), false);
assert.equal(partner.length < 100, true);
assert.deepEqual(engine.parseHash(partner)?.answers, answers);
assert.equal(engine.parseHash(`#p2=${'0'.repeat(100)}`), null);

const comparison = engine.comparison(answers, revised);
assert.equal('alignment' in comparison, false);
assert.equal(comparison.discussions.length <= 2, true);

const handoff = engine.buildHandoff(result, new Date('2026-11-01T00:00:00.000Z'));
assert.equal(handoff.version, 2);
assert.equal(handoff.requires_confirmation, true);
assert.equal('guest_range' in handoff, false);
assert.equal('budget_comfort' in handoff, false);
assert.equal(handoff.expires_at, '2026-12-01T00:00:00.000Z');

console.log('Wedding animal quiz v2 engine smoke test passed.');
