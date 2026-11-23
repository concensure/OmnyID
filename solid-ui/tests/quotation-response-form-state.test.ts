import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuotationResponseSubmission, initialQuotationResponseForm,
  validateQuotationResponseForm,
} from "../src/lib/quotationResponseFormState.ts";
import type { VendorContextProjection } from "../src/lib/quotationResponseSessionApi.ts";

const projection: VendorContextProjection = {
  projection_version: "quotation.vendor_context.v1", projection_fingerprint: "a".repeat(64),
  grant_id: "grant-1", recipient_vendor_id: "vendor-1", quotation_id: "quote-1",
  quotation_version_id: "quote-1-v1", thread_id: "thread-1", response_recipient_id: "recipient-1",
  purpose: "refine_vendor_package", allowed_actions: ["answer_questions", "submit_revision"],
  question_ids: ["availability"], fields: { "own_quote.total": { amount_minor: 400000, currency: "AUD" } },
  fact_ids: ["fact-total"], provenance_refs: ["quote-1-v1"],
};

test("builds bounded proposed facts and never adds booking or payment authority", () => {
  const initial = initialQuotationResponseForm(projection);
  const state = {
    ...initial,
    answers: { availability: { state: "confirmed" as const, answer: "Yes" } },
    availability: "available" as const,
    commercialEnabled: true, commercialValue: "4200", currency: "AUD",
    explanation: "Updated package", affirmed: true,
  };
  assert.deepEqual(validateQuotationResponseForm(state, projection), []);
  const submission = buildQuotationResponseSubmission(state, projection);
  assert.equal(submission.action, "submit_revision");
  assert.deepEqual(submission.commercial_facts[0]?.value, {
    kind: "money", value: { amount_minor: 420000, currency: "AUD" },
  });
  assert.equal(submission.commercial_facts[0]?.state, "proposed");
  assert.doesNotMatch(JSON.stringify(submission), /booking|payment|accept/);
});

test("requires attestation and rejects out-of-projection structured changes", () => {
  const tampered = { ...projection, fields: { ...projection.fields, private_note: "never show" } };
  const initial = initialQuotationResponseForm(tampered);
  assert.equal(initial.commercialKey, "own_quote.total");
  const state = { ...initial, commercialEnabled: true, commercialFactId: "competitor", commercialKey: "private_note" };
  const issues = validateQuotationResponseForm(state, tampered);
  assert.ok(issues.some(({ field }) => field === "affirmed"));
  assert.ok(issues.some(({ field }) => field === "commercial-fact"));
  assert.ok(issues.some(({ field }) => field === "commercial-key"));
});
