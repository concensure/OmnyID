import assert from "node:assert/strict";
import test from "node:test";

import {
  exchangeQuotationResponseToken, submitQuotationResponse, takeQuotationResponseToken,
  uploadQuotationRevision,
  type QuotationResponseSession,
} from "../src/lib/quotationResponseSessionApi.ts";

const projection = {
  projection_version: "quotation.vendor_context.v1", projection_fingerprint: "a".repeat(64),
  grant_id: "grant-1", recipient_vendor_id: "vendor-1", quotation_id: "quote-1",
  quotation_version_id: "quote-1-v1", thread_id: "thread-1", response_recipient_id: "recipient-1",
  purpose: "resolve_quote_gaps", allowed_actions: ["answer_questions"], question_ids: ["availability"],
  fields: { "own_quote.total": { amount_minor: 400000, currency: "AUD" } },
  fact_ids: ["fact-total"], provenance_refs: ["quote-1-v1"],
} as const;

test("takes only a fragment token and strips all token-shaped URL data synchronously", () => {
  let replaced = "";
  const token = takeQuotationResponseToken(
    { pathname: "/workspace/quotation-response.html", search: "?token=leaked&campaign=invite", hash: "#token=fragment-secret" } as Location,
    { replaceState: (_state, _unused, url) => { replaced = String(url); } } as History,
  );
  assert.equal(token, "fragment-secret");
  assert.equal(replaced, "/workspace/quotation-response.html?campaign=invite");
  assert.doesNotMatch(replaced, /fragment-secret|leaked/);
});

test("exchanges only the opaque token with no-store no-referrer credentialed fetch", async () => {
  let request: RequestInit | undefined;
  const session = await exchangeQuotationResponseToken("secret-token", async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({
      session_id: "session-1", expires_at: "2026-10-18T01:15:00Z",
      capability_expires_at: "2026-10-19T01:00:00Z", csrf_token: "csrf-1",
      submission_nonce: "nonce-1", account_access: false, projection,
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(session.projection.grant_id, "grant-1");
  assert.equal(request?.credentials, "include");
  assert.equal(request?.cache, "no-store");
  assert.equal(request?.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(String(request?.body)), { response_token: "secret-token" });
});

test("submits CSRF-bound canonical inputs and accepts only a non-booking review receipt", async () => {
  const session: QuotationResponseSession = {
    sessionId: "session-1", expiresAt: "2026-10-18T01:15:00Z",
    capabilityExpiresAt: "2026-10-19T01:00:00Z", csrfToken: "csrf-1",
    submissionNonce: "nonce-1", projection: projection as QuotationResponseSession["projection"],
  };
  let request: RequestInit | undefined;
  const receipt = await submitQuotationResponse(session, {
    action: "answer_questions",
    question_answers: [{ question_id: "availability", state: "confirmed", answer: "Yes", anchors: [] }],
    commercial_facts: [], availability: { state: "available", anchors: [] }, affirmed: true,
  }, async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({
      status: "received", receipt_id: "receipt-1", requires_user_review: true,
      accepted: false, booking: false, payment_execution: false,
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(receipt.receiptId, "receipt-1");
  assert.equal((request?.headers as Record<string, string>)["x-csrf-token"], "csrf-1");
  const body = JSON.parse(String(request?.body));
  assert.equal(body.submission_nonce, "nonce-1");
  assert.equal(body.vendor_id, undefined);
  assert.equal(body.booking, undefined);
});

test("uploads a CSRF-bound revision without client-supplied quotation bindings", async () => {
  const session: QuotationResponseSession = {
    sessionId: "session-1", expiresAt: "2026-10-18T01:15:00Z",
    capabilityExpiresAt: "2026-10-19T01:00:00Z", csrfToken: "csrf-1",
    submissionNonce: "nonce-1", projection: {
      ...projection, allowed_actions: ["submit_revision"],
    } as QuotationResponseSession["projection"],
  };
  let request: RequestInit | undefined;
  const receipt = await uploadQuotationRevision(
    session,
    new File(["total AUD 4,200"], "quote.txt", { type: "text/plain" }),
    undefined,
    async (_url, init) => {
      request = init;
      return new Response(JSON.stringify({
        status: "prepared", source_id: "source-1", source_version_id: "source-1:1",
        attachment_id: "attachment-1", file_name: "quote.txt", media_type: "text/plain",
        parser: "readability", requires_user_review: true, accepted: false,
        booking: false, payment_execution: false,
      }), { status: 200 });
    },
  );
  assert.equal(receipt.attachmentId, "attachment-1");
  assert.equal((request?.headers as Record<string, string>)["x-csrf-token"], "csrf-1");
  assert.equal(request?.credentials, "include");
  const form = request?.body as FormData;
  assert.equal(form.get("extracted_text"), null);
  assert.equal(form.has("vendor_id"), false);
  assert.equal(form.has("quotation_id"), false);
});
