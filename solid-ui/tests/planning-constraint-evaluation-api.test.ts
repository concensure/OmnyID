import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePlanningConstraintEvaluationResponse,
  planningConstraintEvaluationRequest,
  planningConstraintEvaluationUiEnabled,
  planningConstraintEvaluationUserMessage,
} from "../src/lib/planningConstraintEvaluationApi.ts";

test("evaluation UI is default off and requires an explicit truthy flag", () => {
  assert.equal(planningConstraintEvaluationUiEnabled({}), false);
  assert.equal(planningConstraintEvaluationUiEnabled({ VITE_PLANNING_CONSTRAINT_EVALUATION_ENABLED: "true" }), true);
  assert.equal(planningConstraintEvaluationUiEnabled({ VITE_PLANNING_CONSTRAINT_EVALUATION_ENABLED: "off" }), false);
});

test("evaluation requests use the bounded quotation and directory routes", () => {
  assert.deepEqual(planningConstraintEvaluationRequest({
    kind: "quotation",
    threadId: "thread:one",
    planId: "plan:one",
    comparisonId: "comparison:one",
    quotationVersionId: "quotation:one:v2",
  }), {
    path: "/planning/constraint-evaluations",
    body: {
      thread_id: "thread:one",
      plan_id: "plan:one",
      comparison_id: "comparison:one",
      quotation_version_id: "quotation:one:v2",
    },
  });
  assert.equal(planningConstraintEvaluationRequest({
    kind: "directory",
    threadId: "thread:one",
    planId: "plan:one",
    vendorId: "vendor:one",
  }).path, "/planning/directory-constraint-evaluations");
});

test("evaluation responses keep closed revision-bound presentation values", () => {
  const result = normalizePlanningConstraintEvaluationResponse({
    candidate_revision_ref: "directory:vendor-one:revision:abc",
    evaluations: [{
      evaluation: {
        evaluation_id: "evaluation:one",
        constraint_ref: "constraint:one",
        candidate_ref: "directory:vendor-one:revision:abc",
        result: "conflict",
        severity: "blocking",
      },
      presentation: {
        title: "Ceremony service conflicts with this option",
        evidence_label: "Checked service requirement evidence",
      },
    }, {
      evaluation: {
        evaluation_id: "evaluation:forged",
        constraint_ref: "constraint:one",
        candidate_ref: "directory:other:revision:def",
        result: "conflict",
        severity: "blocking",
      },
      presentation: { title: "Forged", evidence_label: "Forged" },
    }],
  });

  assert.equal(result.evaluations.length, 1);
  assert.equal(result.evaluations[0]?.result, "conflict");
  assert.equal(result.evaluations[0]?.candidateRevisionRef, result.candidateRevisionRef);
});

test("evaluation responses and failures suppress technical transport copy", () => {
  const result = normalizePlanningConstraintEvaluationResponse({
    candidate_revision_ref: "quotation:one:v2",
    evaluations: [{
      evaluation: {
        evaluation_id: "evaluation:one",
        constraint_ref: "constraint:one",
        candidate_ref: "quotation:one:v2",
        result: "unknown",
        severity: "decision_relevant",
      },
      presentation: {
        title: "API payload error 500",
        evidence_label: "postgres_status_code 500",
      },
    }],
  });
  assert.equal(result.evaluations[0]?.title, "Planning requirement needs review");
  assert.equal(result.evaluations[0]?.evidenceLabel, "Current option evidence needs checking.");
  assert.equal(planningConstraintEvaluationUserMessage(new Error("HTTP 409 revision stale")), "This option changed. Refresh it before comparing.");
  assert.equal(planningConstraintEvaluationUserMessage(new Error("postgres provider failed")), "We could not check this option just now. Try again in a moment.");
});
