import assert from "node:assert/strict";
import test from "node:test";

import {
  applyQuotationClosureTemplate,
  quotationClosureDeadlineProjection,
} from "@/lib/quotationClosureTemplateProjection";
import type { QuotationClosureState } from "@/lib/quotationClosureState";

function closure(status: QuotationClosureState["status"], revision: string): QuotationClosureState {
  return {
    quotationId: "production-hire-1",
    quotationVersionId: "production-hire-1-v2",
    status,
    revision,
    changedTerms: [],
    changedTermsReviewed: true,
    evidenceRefs: ["evidence-b", "evidence-a", "evidence-a"],
    deadlineAt: "2026-11-01T00:00:00Z",
  };
}

test("a non-wedding adapter consumes deterministic generic deadline output", () => {
  const projected = applyQuotationClosureTemplate(closure("contract_received", "closure-2"), {
    deadline: (deadline) => ({
      externalTaskKey: deadline.taskId,
      eventKey: deadline.projectionId,
      status: deadline.lifecycle,
      sources: deadline.evidenceRefs,
    }),
  });
  assert.deepEqual(projected, {
    externalTaskKey: "quotation-closure-deadline:production-hire-1:production-hire-1-v2",
    eventKey: "quotation-closure-deadline:production-hire-1:production-hire-1-v2:closure-2",
    status: "open",
    sources: ["evidence-a", "evidence-b"],
  });
});

test("terminal output closes the stable task without erasing its successor history", () => {
  const open = quotationClosureDeadlineProjection(closure("deposit_requested", "closure-3"));
  const closed = quotationClosureDeadlineProjection(closure("cancelled", "closure-4"));
  assert.equal(open?.taskId, closed?.taskId);
  assert.equal(open?.lifecycle, "open");
  assert.equal(closed?.lifecycle, "closed");
  assert.equal(closed?.dueAt, null);
  assert.notEqual(open?.projectionId, closed?.projectionId);
  assert.equal(closed?.paymentExecution, false);
});
