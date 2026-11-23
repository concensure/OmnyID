import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  QuotationVendorResponseSchema,
  canonicalVendorResponseMaterial,
  vendorResponseFingerprint,
  vendorResponseStatusTransitionAllowed,
} from 'afp-ts/quotation';

const fixtureUrl = new URL(
  '../../tests/fixtures/quotation/vendor_response_v1.json',
  import.meta.url,
);
const schemaUrl = new URL(
  '../../schemas/quotation/vendor-response.v1.json',
  import.meta.url,
);

async function fixture() {
  return JSON.parse(await readFile(fileURLToPath(fixtureUrl), 'utf8'));
}

test('TypeScript and JSON Schema accept the shared template-neutral response', async () => {
  const payload = await fixture();
  const response = QuotationVendorResponseSchema.parse(payload);
  assert.equal(response.schema_version, 'quotation.vendor_response.v1');
  assert.equal(response.status, 'submitted');
  assert.equal(response.commercial_facts[0]?.value?.kind, 'money');
  assert.equal(Object.hasOwn(response, 'wedding_plan_id'), false);
  assert.equal(
    await vendorResponseFingerprint(response),
    'b25879e08c13c2b2286a53808915d4e126d5e814886b99d73b17f8727c03ea55',
  );

  const schema = JSON.parse(await readFile(fileURLToPath(schemaUrl), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.commercial_fact.additionalProperties, false);
  assert.equal(JSON.stringify(schema).includes('wedding_plan_id'), false);
});

test('unknown fields and unsupported confirmed facts fail closed', async () => {
  const unknown = await fixture();
  unknown.wedding_plan_id = 'not-allowed';
  assert.equal(QuotationVendorResponseSchema.safeParse(unknown).success, false);

  const unsupported = await fixture();
  unsupported.commercial_facts[0].anchors = [];
  assert.equal(QuotationVendorResponseSchema.safeParse(unsupported).success, false);

  const proposed = await fixture();
  proposed.commercial_facts[0].state = 'proposed';
  proposed.commercial_facts[0].anchors = [];
  assert.equal(QuotationVendorResponseSchema.safeParse(proposed).success, true);
});

test('verified vendor sender identities are optional, strict, and not commercial material', async () => {
  const original = QuotationVendorResponseSchema.parse(await fixture());
  const masked = QuotationVendorResponseSchema.parse({
    ...original,
    sender_identity: {
      identity_id: 'identity-random-internal',
      kind: 'omnyid_mask',
      address: 'bejewelled_jewellery_mosman@omnyid.com',
      display_name: 'Bejewelled Jewellery',
    },
  });
  assert.equal(masked.sender_identity.address, 'bejewelled_jewellery_mosman@omnyid.com');
  assert.equal(
    await vendorResponseFingerprint(original),
    await vendorResponseFingerprint(masked),
  );

  const wrongDomain = structuredClone(masked);
  wrongDomain.sender_identity.address = 'bejewelled_jewellery_mosman@example.com';
  assert.equal(QuotationVendorResponseSchema.safeParse(wrongDomain).success, false);
  const extra = structuredClone(masked);
  extra.sender_identity.account_id = 'must-not-leak';
  assert.equal(QuotationVendorResponseSchema.safeParse(extra).success, false);
});

test('equivalent channels and shuffled collections share canonical material and fingerprint', async () => {
  const first = QuotationVendorResponseSchema.parse(await fixture());
  const equivalent = structuredClone(first);
  equivalent.response_id = 'email-response-9';
  equivalent.channel = 'email';
  equivalent.channel_receipt = {
    receipt_id: 'gmail-message-9',
    received_at: '2026-10-18T02:00:00Z',
    transport_message_id: 'provider-message-9',
  };
  equivalent.submitted_at = '2026-10-18T01:59:00Z';
  equivalent.attestation.attested_by = 'claimed-agent-9';
  equivalent.attestation.authority = 'claimed_agent';
  equivalent.sources[0].source_id = 'email-source-9';
  equivalent.sources[0].source_version_id = 'email-source-9-v1';
  equivalent.commercial_facts[0].anchors[0].source_id = 'email-source-9';
  equivalent.commercial_facts[0].anchors[0].source_version_id = 'email-source-9-v1';
  equivalent.attachments[0].source_id = 'email-source-9';
  equivalent.attachments[0].source_version_id = 'email-source-9-v1';
  equivalent.sources[0].media_type = 'APPLICATION/PDF';
  equivalent.sources[0].content_hash = 'SHA256:VENDOR-RESPONSE-FIXTURE';
  equivalent.attachments[0].media_type = 'APPLICATION/PDF';
  equivalent.attachments[0].content_hash = 'SHA256:VENDOR-RESPONSE-FIXTURE';
  equivalent.availability.starts_at = '2027-02-19T21:00:00Z';
  equivalent.availability.ends_at = '2027-02-20T12:00:00Z';
  equivalent.question_answers.reverse();
  equivalent.commercial_facts.reverse();
  equivalent.sources.reverse();
  equivalent.attachments.reverse();

  assert.deepEqual(
    canonicalVendorResponseMaterial(first),
    canonicalVendorResponseMaterial(equivalent),
  );
  assert.equal(
    await vendorResponseFingerprint(first),
    await vendorResponseFingerprint(equivalent),
  );
});

test('submitted remains a response state and never implies acceptance or booking', async () => {
  const response = QuotationVendorResponseSchema.parse(await fixture());
  const encoded = JSON.stringify(response);
  assert.equal(encoded.includes('booking_confirmed'), false);
  assert.equal(encoded.includes('payment_execution'), false);
  assert.equal(encoded.includes('user_accepted'), false);
  assert.equal(vendorResponseStatusTransitionAllowed('draft', 'submitted'), true);
  assert.equal(vendorResponseStatusTransitionAllowed('submitted', 'received'), true);
  assert.equal(vendorResponseStatusTransitionAllowed('received', 'reviewed'), true);
  assert.equal(vendorResponseStatusTransitionAllowed('submitted', 'reviewed'), false);
});
