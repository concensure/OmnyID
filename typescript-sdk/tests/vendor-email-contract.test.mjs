import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EmailReadEnvelopeSchema,
  WeddingVendorEmailEnvelopeSchema,
  buildWeddingVendorEmailEnvelope,
  weddingVendorEmailIdempotencyKey,
} from '../dist/index.js';

const metadata = {
  schema: 'wedding_vendor_email/v1',
  vendor_id: 'vendor_opaque_1',
  relay_thread_id: 'relay_thread_opaque_1',
  idempotency_key: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

function relayEnvelope() {
  return buildWeddingVendorEmailEnvelope({
    id: '01JQ0YQ2X3E2G7M8N9P0QRSTUV',
    thread_id: '01JQ0YQ2X3E2G7M8N9P0QRSTUV',
    from: 'agent:planner@omnyid.com',
    to: ['agent:planner@omnyid.com'],
    timestamp: '2026-10-14T00:00:00.000Z',
    subtype: 'incoming',
    metadata,
    encryption: { scheme: 'omnyid-envelope-v1', ciphertext_b64: 'opaque' },
  });
}

test('relay envelope rejects plaintext content and address metadata', () => {
  const envelope = relayEnvelope();
  assert.equal(WeddingVendorEmailEnvelopeSchema.safeParse(envelope).success, true);
  assert.equal(WeddingVendorEmailEnvelopeSchema.safeParse({
    ...envelope,
    content: { subject: 'do not persist me' },
  }).success, false);
  assert.equal(WeddingVendorEmailEnvelopeSchema.safeParse({
    ...envelope,
    metadata: { ...metadata, vendor_address: 'vendor@example.test' },
  }).success, false);
});

test('read events must reference the parent message in the same thread', () => {
  const event = {
    ...relayEnvelope(),
    subtype: 'read',
    parent_id: '01JQ0YQ2X3E2G7M8N9P0QRSTUV',
    supertags: ['wedding_vendor_email', 'user_read_event'],
    metadata: {
      schema: 'email_read/v1',
      idempotency_key: metadata.idempotency_key,
    },
    references: [{
      type: 'message',
      target: '01JQ0YQ2X3E2G7M8N9P0QRSTUV',
      metadata: { relation: 'read' },
    }],
  };
  assert.equal(EmailReadEnvelopeSchema.safeParse(event).success, true);
  assert.equal(EmailReadEnvelopeSchema.safeParse({
    ...event,
    references: [{ type: 'message', target: 'different', metadata: { relation: 'read' } }],
  }).success, false);
});

test('idempotency keys are deterministic and namespaced', async () => {
  const first = await weddingVendorEmailIdempotencyKey('wedding-email', ['message', 'vendor']);
  const second = await weddingVendorEmailIdempotencyKey('wedding-email', ['message', 'vendor']);
  const different = await weddingVendorEmailIdempotencyKey('wedding-email', ['message', 'other']);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, different);
});
