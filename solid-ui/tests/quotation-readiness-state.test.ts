import assert from "node:assert/strict";
import test from "node:test";

import { disabledQuotationFeatures, effectiveQuotationFeatures, readinessPresentation, type QuotationFeatureFlags, type QuotationReadinessReport } from "@/lib/quotationReadinessState";

const requested: QuotationFeatureFlags = {
  extraction: true,
  recommendation: true,
  clarificationDraft: true,
  clarificationSend: true,
  closure: true,
  vendorContextGrants: true,
};

function report(status: QuotationReadinessReport["status"]): QuotationReadinessReport {
  return { status, unsupported_confirmed_material_fields: 0, blocking_reasons: [] };
}

test("untested, blocked, and failed evidence disables every feature", () => {
  for (const status of ["untested", "blocked", "failed"] as const) {
    assert.deepEqual(effectiveQuotationFeatures(requested, report(status)), disabledQuotationFeatures);
    assert.equal(readinessPresentation(report(status)).canExpandCohort, false);
  }
});

test("only verified evidence preserves independently requested flags", () => {
  const partial = { ...requested, clarificationSend: false };
  assert.deepEqual(effectiveQuotationFeatures(partial, report("verified")), partial);
  assert.equal(readinessPresentation(report("verified")).tone, "success");
});
