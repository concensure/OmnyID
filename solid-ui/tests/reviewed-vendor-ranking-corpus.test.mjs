import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildReviewedCorpus,
  corpusJsonLines,
  parseRankingWorkbook,
} from "../scripts/build-reviewed-vendor-ranking-corpus.mjs";

function workbook(score, top = "") {
  return `# Review

## eval-01

Couple: 30 guests · $20k · February · Sydney CBD
Priorities: Intimacy

| Candidate | Facts and links | Relevance 0–3 |
| --- | --- | --- |
| A \\& B | {"private":"facts are not copied"} | ${score}. reviewer comment stays private |

Ideal top 3 (candidate ids, ordered): ${top}
Notes for disagreement resolution: private note
`;
}

test("workbook parser extracts only profile, title, score and ordering", () => {
  const result = parseRankingWorkbook(workbook(2, "A & B, C, D"), "Casper");
  assert.deepEqual(result.cases[0], {
    id: "eval-01",
    profile: {
      guest_count: 30,
      budget_aud: 20_000,
      date_or_season: "February",
      location: "Sydney CBD",
      priorities: ["Intimacy"],
    },
    candidates: [{ title: "A & B", relevance: 2 }],
    ideal_order: ["A & B", "C", "D"],
  });
  assert.doesNotMatch(JSON.stringify(result), /private|reviewer comment|disagreement resolution/);
});

test("corpus preserves disagreement and fails closed for missing provenance and ordering", () => {
  const corpus = buildReviewedCorpus([
    parseRankingWorkbook(workbook(0, "A & B, C, D"), "Casper"),
    parseRankingWorkbook(workbook(1), "Iris"),
  ], { Casper: "a".repeat(64), Iris: "b".repeat(64) });

  assert.equal(corpus.manifest.agreement.exact_count, 0);
  assert.equal(corpus.manifest.agreement.disagreement_count, 1);
  assert.equal(corpus.records[0].candidates[0].consensus_relevance, null);
  assert.equal(corpus.records[0].ordering_complete, false);
  assert.deepEqual(corpus.records[0].ideal_order_reference_issues.Casper, ["C", "D"]);
  assert.equal(corpus.manifest.review_provenance.independence_attested_in_sources, false);
  assert.equal(corpus.manifest.status.ranking_policy_v2_gate_eligible, false);
  assert.equal(corpus.manifest.status.quotation_accuracy_corpus_gate_eligible, false);
  assert.equal(corpusJsonLines(corpus).trim().split("\n").length, 2);
});

test("checked-in corpus is complete, private-data-minimised, and rollout-ineligible", () => {
  const corpusPath = resolve(
    import.meta.dirname,
    "../../Documents/verification/wedding-vendor-ranking-reviewed-corpus-v1.jsonl",
  );
  const [manifest, ...records] = readFileSync(corpusPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(records.length, 40);
  assert.equal(manifest.coverage.candidates_per_reviewer, 480);
  assert.equal(manifest.agreement.exact_count, 477);
  assert.equal(manifest.agreement.disagreement_count, 3);
  assert.equal(manifest.ideal_order_reference_issues.length, 1);
  assert.equal(manifest.review_provenance.independence_attested_in_sources, false);
  assert.equal(manifest.status.ranking_policy_v2_gate_eligible, false);
  assert.equal(manifest.status.quotation_accuracy_corpus_gate_eligible, false);
  assert.deepEqual(manifest.privacy, {
    source_facts_copied: false,
    free_text_comments_copied: false,
  });
  assert.doesNotMatch(JSON.stringify(records), /facts_and_links|source_links|private note|reviewer comment/i);
});
