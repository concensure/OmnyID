import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('../assets/js/quiz-data.js');
const engine = require('../assets/js/quiz-engine.js');
const quizUi = readFileSync(new URL('../assets/js/quiz.js', import.meta.url), 'utf8');
const imageManifest = JSON.parse(readFileSync(new URL('../assets/images/quiz/quiz-images.json', import.meta.url), 'utf8'));

assert.equal(data.VERSION, 2);
assert.equal(data.VERSION_LABEL, 'wedding-animal-v2.0.0');
assert.equal(data.DIMENSIONS.length, 6);
assert.equal(data.QUESTIONS.length, 12);
assert.equal(data.QUESTIONS.every((question) => question.opts.length === 4), true);
assert.equal(data.QUESTIONS.flatMap((question) => question.opts).every((option) => option.art && option.img), true);
assert.deepEqual(
  data.QUESTIONS.flatMap((question) => question.opts).map((option) => option.weight).sort(),
  Array.from({ length: 12 }, () => [-2, -1, 1, 2]).flat().sort(),
);
assert.equal(Object.keys(data.COMPARISON_PROMPTS).length, 6);
assert.match(data.RESULT_TEMPLATE.playfulNote, /not a psychological or compatibility test/);

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
assert.equal(engine.nextQuestion({}, []).id, 'Q01');
assert.equal(engine.nextQuestion({ Q01: 'A' }, ['Q02']).id, 'Q03');
assert.equal(engine.nextQuestion(
  { Q01: 'A', Q02: 'A', Q03: 'A', Q04: 'A', Q05: 'A', Q06: 'A' },
  [],
).id, 'Q07');

const partner = engine.partnerHash(answers);
assert.equal(partner.includes('Private'), false);
assert.equal(partner.length < 100, true);
assert.deepEqual(engine.parseHash(partner)?.answers, answers);
assert.equal(engine.parseHash(`#p2=${'0'.repeat(100)}`), null);

const comparison = engine.comparison(answers, revised);
assert.equal('alignment' in comparison, false);
assert.equal(comparison.discussions.length <= 2, true);
assert.equal(comparison.discussions.every((item) => data.COMPARISON_PROMPTS[item.code] === item.prompt), true);
assert.doesNotMatch(JSON.stringify(comparison), /%|compatibility/i);

const balanced = Object.fromEntries(data.QUESTIONS.map((question, index) => [
  question.id,
  index < 6 ? 'A' : 'D',
]));
assert.equal(engine.buildResult(balanced).animal_id, 'otter');
assert.equal(engine.buildResult({ ...balanced }).animal_id, 'otter');

const handoff = engine.buildHandoff(result, new Date('2026-11-01T00:00:00.000Z'));
assert.equal(handoff.version, 2);
assert.equal(handoff.quiz_version, 2);
assert.equal(handoff.answers.length, 12);
assert.deepEqual(handoff.consent, { account_import: false, partner_comparison: false });
assert.equal(handoff.requires_confirmation, true);
assert.equal('guest_range' in handoff, false);
assert.equal('budget_comfort' in handoff, false);
assert.equal(handoff.expires_at, '2026-12-01T00:00:00.000Z');
assert.doesNotMatch(quizUi, /E\.result\(/);
assert.match(quizUi, /E\.buildResult\(state\.answers\)/);
assert.match(quizUi, /omnyid\.wedding\.quizResult\.v2/);
assert.match(quizUi, /source=wedding&amp;from=quiz/);
assert.equal(imageManifest.choices.length, 48);
assert.equal(new Set(imageManifest.choices.map((choice) => choice.id)).size, 48);
for (const question of data.QUESTIONS) {
  for (const option of question.opts) {
    const choice = imageManifest.choices.find((item) => item.id === `${question.id}:${option.id}`);
    assert.equal(choice?.asset, option.img);
    assert.equal(choice?.alt, option.art);
    const asset = imageManifest.assets[option.img];
    assert.ok(asset?.author && asset?.source && asset?.licence);
    assert.ok(asset.width <= 480 && asset.height <= 480);
    assert.ok(asset.bytes <= 60 * 1024);
    const path = new URL(`../assets/images/quiz/${option.img}.webp`, import.meta.url);
    assert.equal(existsSync(path), true);
    assert.equal(statSync(path).size, asset.bytes);
  }
}
for (const animal of data.ARCHETYPES) {
  assert.ok(imageManifest.assets[animal.photo]);
  assert.equal(existsSync(new URL(`../assets/images/quiz/${animal.photo}.webp`, import.meta.url)), true);
}
assert.equal(existsSync(new URL('../assets/images/quiz/an-bear.webp', import.meta.url)), false);
assert.equal(existsSync(new URL('../assets/images/quiz/an-flamingo.webp', import.meta.url)), false);
assert.match(quizUi, /E\.nextQuestion\(state\.answers, state\.skipped\)/);

console.log('Wedding animal quiz v2 engine smoke test passed.');
