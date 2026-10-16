import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { NormalisedQuotationSchema } from 'afp-ts/quotation';

const fixtureUrl = new URL(
  '../../tests/fixtures/quotation/generic_normalised_quote.json',
  import.meta.url,
);

test('TypeScript parses the shared template-neutral quotation fixture', async () => {
  const payload = JSON.parse(await readFile(fileURLToPath(fixtureUrl), 'utf8'));
  const quotation = NormalisedQuotationSchema.parse(payload);
  assert.equal(quotation.identity.context_namespace, 'production_planner');
  assert.equal(quotation.line_items[0]?.unit_price?.amount_minor, 400000);
  assert.equal(quotation.commercial_terms[0]?.refundable, true);
  assert.equal(quotation.unmapped_items[0]?.evidence.state, 'unknown');
});

test('TypeScript distinguishes zero, excluded, false, and unknown', async () => {
  const payload = JSON.parse(await readFile(fileURLToPath(fixtureUrl), 'utf8'));
  payload.line_items[0].unit_price.amount_minor = 0;
  payload.line_items[0].inclusion = 'excluded';
  payload.commercial_terms[0].refundable = false;
  payload.unmapped_items[0].evidence.state = 'unknown';
  const quotation = NormalisedQuotationSchema.parse(payload);
  assert.equal(quotation.line_items[0]?.unit_price?.amount_minor, 0);
  assert.equal(quotation.line_items[0]?.inclusion, 'excluded');
  assert.equal(quotation.commercial_terms[0]?.refundable, false);
  assert.equal(quotation.unmapped_items[0]?.evidence.state, 'unknown');
});
