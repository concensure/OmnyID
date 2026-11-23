import assert from "node:assert/strict";
import test from "node:test";

import { weddingVendorResponseGrant } from "@/lib/weddingVendorResponseGrantState";

test("unclaimed vendor response access comes only from an active scoped grant", () => {
  const messages = [{
    id: "grant-message-1", thread_id: "thread-1", from: "user", to: [], timestamp: "2026-11-05T00:00:00Z",
    type: "quotation_context_grant", kind: "quotation_context_grant",
    content: { grant: { grant_id: "grant-1", target_vendor_id: "vendor-1", thread_id: "thread-1", expires_at: "2026-11-12T00:00:00Z" } },
  }];
  assert.equal(weddingVendorResponseGrant(messages, "vendor-1", new Date("2026-11-06T00:00:00Z"))?.grantMessageId, "grant-message-1");
  assert.equal(weddingVendorResponseGrant(messages, "vendor-2", new Date("2026-11-06T00:00:00Z")), null);
  assert.equal(weddingVendorResponseGrant(messages, "vendor-1", new Date("2026-11-13T00:00:00Z")), null);
});

test("revocation removes the response-link authority", () => {
  const messages = [
    { id: "grant-message-1", thread_id: "thread-1", from: "user", to: [], timestamp: "2026-11-05T00:00:00Z", type: "quotation_context_grant", kind: "quotation_context_grant", content: { grant: { grant_id: "grant-1", target_vendor_id: "vendor-1", thread_id: "thread-1", expires_at: "2026-11-12T00:00:00Z" } } },
    { id: "revoke-1", thread_id: "thread-1", from: "user", to: [], timestamp: "2026-11-06T00:00:00Z", type: "quotation_context_grant_revoked", kind: "quotation_context_grant_revoked", content: { revocation: { grant_id: "grant-1" } } },
  ];
  assert.equal(weddingVendorResponseGrant(messages, "vendor-1", new Date("2026-11-07T00:00:00Z")), null);
});
