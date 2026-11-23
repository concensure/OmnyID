import test from "node:test";
import assert from "node:assert/strict";
import { assessWeddingVendorRankingV2Gate, weddingVendorNdcgAt3 } from "../src/lib/weddingVendorRankingEvaluationState.ts";

test("NDCG@3 gives one to the ideal order and discounts lower positions", () => {
  const grades = { a: 3, b: 2, c: 1, d: 0 };
  assert.equal(weddingVendorNdcgAt3(["a", "b", "c"], grades), 1);
  assert.ok(weddingVendorNdcgAt3(["c", "b", "a"], grades) < 1);
});

test("ranking v2 gate fails closed without 40 real cases and two judges", () => {
  const result = assessWeddingVendorRankingV2Gate([{
    id: "synthetic-only", judges: ["judge-a"], relevanceByCandidate: { a: 3, b: 2, c: 1 },
    v1Order: ["c", "b", "a"], v2Order: ["a", "b", "c"], replayV2Order: ["a", "b", "c"],
    probes: { sparse_echo: true },
  }]);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /1\/40/.test(issue)));
  assert.ok(result.issues.some((issue) => /two independent judges/.test(issue)));
});

test("ranking v2 gate enforces improvement, worst-case regression, probes, and replay", () => {
  const cases = Array.from({ length: 40 }, (_, index) => ({
    id: `case-${index + 1}`, judges: ["judge-a", "judge-b"], relevanceByCandidate: { a: 3, b: 2, c: 1 },
    v1Order: ["c", "b", "a"], v2Order: ["a", "b", "c"], replayV2Order: ["a", "b", "c"],
    probes: { sparse_echo: true, capacity_veto: true, unknown_availability: true, estimate_not_quote: true, placeholder_not_evidence: true },
  }));
  const result = assessWeddingVendorRankingV2Gate(cases);
  assert.equal(result.passed, true);
  assert.ok(result.v2NdcgAt3 >= result.v1NdcgAt3 + 0.05);
});
