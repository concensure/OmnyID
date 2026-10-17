import assert from "node:assert/strict";
import test from "node:test";

import {
  projectDecryptedVendorTransaction,
  vendorResponseA2ui,
  type VendorTransactionInboxItem,
} from "../src/lib/vendorQuotationResponseState.ts";

const item = (): VendorTransactionInboxItem => ({
  invitation_message_id: "invite-1",
  vendor_id: "vendor-1",
  grant_id: "grant-1",
  quotation_id: "quote-1",
  quotation_version_id: "quote-1-v2",
  projection_fingerprint: "a".repeat(64),
  expires_at: "2026-10-19T03:00:00Z",
  envelope: {
    protocol: "afp-v1",
    id: "invite-1",
    thread_id: "thread-1",
    from: "agent:couple@example.com",
    to: ["agent:vendor@example.com"],
    timestamp: "2026-10-18T03:00:00Z",
    type: "wedding_enquiry",
    content: null,
    views: [],
    references: [],
    attachments: [],
    signature: "signature",
  },
});

const payload = () => ({
  projection: {
    grant_id: "grant-1",
    recipient_vendor_id: "vendor-1",
    thread_id: "thread-1",
    quotation_id: "quote-1",
    quotation_version_id: "quote-1-v2",
    projection_fingerprint: "a".repeat(64),
    response_recipient_id: "agent:couple@example.com",
    question_ids: ["availability", "package_changes"],
    fields: {
      "question.availability": "Are you available on the requested date?",
      "question.package_changes": "Please describe package changes.",
      guest_count: 85,
      "competitor.price": 100,
      private_note: "never expose",
    },
  },
  response_recipient_encryption_public_key: "b".repeat(64),
});

test("projects only exact transaction context and removes prohibited fields", () => {
  const projection = projectDecryptedVendorTransaction(item(), payload());
  assert.equal(projection.vendorId, "vendor-1");
  assert.deepEqual(projection.questions.map(({ id }) => id), ["availability", "package_changes"]);
  assert.deepEqual(projection.approvedFields, [{ key: "guest_count", value: 85 }]);
});

test("fails closed when decrypted projection does not match the addressed invitation", () => {
  const wrong = payload();
  wrong.projection.quotation_version_id = "quote-1-v3";
  assert.throws(
    () => projectDecryptedVendorTransaction(item(), wrong),
    /no longer matches/,
  );
});

test("builds a bounded A2UI-compatible response form without booking or payment actions", () => {
  const form = vendorResponseA2ui(projectDecryptedVendorTransaction(item(), payload()));
  assert.equal(form.schema_version, "a2ui.v1");
  assert.equal(form.kind, "form");
  const encoded = JSON.stringify(form);
  assert.match(encoded, /submit_vendor_response/);
  assert.doesNotMatch(encoded, /booking|payment|accept_contract/);
});
