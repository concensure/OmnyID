import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('../assets/js/quiz-data.js');
const engine = require('../assets/js/quiz-engine.js');

const answers = {};
for (const question of data.SOLO) {
  answers[question.id] = question.kind === 'top3' ? [0, 1, 2] : 0;
}

const partner = engine.partnerHash(answers, 'Private Name');
assert.equal(partner.includes('Private'), false);
assert.equal(partner.length < 512, true);
assert.equal(engine.parseHash(partner)?.name, '');
assert.deepEqual(engine.parseHash(partner)?.answers, answers);

const zoo = engine.zooHash({ pair: [1, 2], alignment: 84, names: ['Private', 'Names'] }, [
  { animal: 3, name: 'Guest Name' },
]);
assert.equal(zoo, '#z=1.12.84');
assert.deepEqual(engine.parseHash(zoo), {
  kind: 'z', pair: [1, 2], alignment: 84, names: ['', ''], members: [],
});
assert.equal(engine.parseHash(`#p=${'x'.repeat(600)}`), null);
assert.equal(engine.parseHash('#z=1.99.80'), null);

console.log('Wedding animal quiz engine smoke test passed.');
