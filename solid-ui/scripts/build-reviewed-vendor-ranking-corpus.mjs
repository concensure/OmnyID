#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REVIEWERS = ["Casper", "Iris"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normaliseTitle(value) {
  return value.replace(/\\([&_])/g, "$1").replace(/\s+/g, " ").trim();
}

function parseProfile(section, id) {
  const couple = section.match(/^Couple:\s*(\d+) guests\s*·\s*\$(\d+)k\s*·\s*([^\r\n·]+)\s*·\s*([^\r\n]+)$/m);
  const priority = section.match(/^Priorities:\s*([^\r\n]+)$/m);
  if (!couple || !priority) throw new Error(`${id}: couple or priority profile is malformed`);
  return {
    guest_count: Number(couple[1]),
    budget_aud: Number(couple[2]) * 1_000,
    date_or_season: couple[3].trim(),
    location: couple[4].trim(),
    priorities: priority[1].split(",").map((item) => item.trim()).filter(Boolean),
  };
}

function parseIdealOrder(section) {
  const match = section.match(/^Ideal top 3 \(candidate ids, ordered\):\s*(.*)$/m);
  if (!match) return [];
  const value = match[1].replace(/`/g, "").trim();
  return value ? value.split(",").map(normaliseTitle).filter(Boolean) : [];
}

export function parseRankingWorkbook(input, reviewer) {
  const text = Buffer.isBuffer(input) ? input.toString("utf8") : String(input);
  const headers = [...text.matchAll(/^## (eval-\d+)\s*$/gm)];
  const cases = [];
  for (let index = 0; index < headers.length; index++) {
    const match = headers[index];
    const id = match[1];
    const sectionStart = (match.index ?? 0) + match[0].length;
    const section = text.slice(sectionStart, headers[index + 1]?.index ?? text.length);
    const candidates = [];
    for (const line of section.split(/\r?\n/)) {
      if (!line.startsWith("|") || /^\|\s*(?:Candidate|-+)/.test(line)) continue;
      const row = line.match(/^\|\s*(.*?)\s*\|\s*(\{.*\})\s*\|\s*(.*?)\s*\|\s*$/);
      if (!row) throw new Error(`${id}: unparseable candidate row`);
      const score = row[3].match(/^([0-3])(?:\.|\s|$)/);
      if (!score) throw new Error(`${id}/${normaliseTitle(row[1])}: relevance score is missing`);
      candidates.push({ title: normaliseTitle(row[1]), relevance: Number(score[1]) });
    }
    if (!candidates.length) throw new Error(`${id}: no scored candidate rows`);
    cases.push({ id, profile: parseProfile(section, id), candidates, ideal_order: parseIdealOrder(section) });
  }
  if (!cases.length) throw new Error(`${reviewer}: no evaluation cases found`);
  return { reviewer, cases };
}

function scoreDistribution(cases) {
  const result = { "0": 0, "1": 0, "2": 0, "3": 0 };
  for (const item of cases) for (const candidate of item.candidates) result[String(candidate.relevance)]++;
  return result;
}

export function buildReviewedCorpus(workbooks, sourceDigests = {}) {
  if (workbooks.length !== REVIEWERS.length) throw new Error("Exactly the Casper and Iris workbooks are required");
  const byReviewer = Object.fromEntries(workbooks.map((item) => [item.reviewer, item]));
  for (const reviewer of REVIEWERS) if (!byReviewer[reviewer]) throw new Error(`${reviewer}: workbook is missing`);
  const reference = byReviewer.Casper.cases;
  const records = [];
  let compared = 0;
  let agreements = 0;
  const disagreements = [];
  const idealOrderReferenceIssues = [];

  for (const left of reference) {
    const right = byReviewer.Iris.cases.find((item) => item.id === left.id);
    if (!right) throw new Error(`${left.id}: Iris case is missing`);
    if (JSON.stringify(left.profile) !== JSON.stringify(right.profile)) throw new Error(`${left.id}: judge profiles differ`);
    const rightScores = new Map(right.candidates.map((candidate) => [candidate.title, candidate.relevance]));
    if (left.candidates.length !== right.candidates.length) throw new Error(`${left.id}: judge candidate counts differ`);
    const candidates = left.candidates.map((candidate) => {
      if (!rightScores.has(candidate.title)) throw new Error(`${left.id}/${candidate.title}: Iris candidate is missing`);
      const iris = rightScores.get(candidate.title);
      const agreed = candidate.relevance === iris;
      compared++;
      if (agreed) agreements++;
      else disagreements.push({ case_id: left.id, candidate: candidate.title, casper: candidate.relevance, iris });
      return {
        id: `vendor-${sha256(candidate.title.toLocaleLowerCase("en-AU")).slice(0, 16)}`,
        title: candidate.title,
        relevance: { Casper: candidate.relevance, Iris: iris },
        consensus_relevance: agreed ? iris : null,
        disagreement: !agreed,
      };
    });
    const candidateTitles = new Set(candidates.map((candidate) => candidate.title));
    const orderReferenceIssues = Object.fromEntries(REVIEWERS.map((reviewer) => {
      const order = reviewer === "Casper" ? left.ideal_order : right.ideal_order;
      const unknown = order.filter((title) => !candidateTitles.has(title));
      for (const title of unknown) idealOrderReferenceIssues.push({ case_id: left.id, reviewer, candidate: title });
      return [reviewer, unknown];
    }));
    records.push({
      kind: "case",
      id: left.id,
      profile: left.profile,
      candidates,
      ideal_order: { Casper: left.ideal_order, Iris: right.ideal_order },
      ideal_order_reference_issues: orderReferenceIssues,
      ordering_complete: left.ideal_order.length === 3 && right.ideal_order.length === 3,
    });
  }

  for (const reviewer of REVIEWERS) {
    if (byReviewer[reviewer].cases.length !== reference.length) throw new Error(`${reviewer}: case count differs`);
  }
  const candidateCount = records.reduce((sum, item) => sum + item.candidates.length, 0);
  const completeOrderCounts = Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer,
    byReviewer[reviewer].cases.filter((item) => item.ideal_order.length === 3).length]));
  const manifest = {
    kind: "manifest",
    schema_version: "wedding.vendor_ranking.reviewed_corpus.v1",
    source_workbooks: REVIEWERS.map((reviewer) => ({ reviewer, sha256: sourceDigests[reviewer] ?? null })),
    privacy: { source_facts_copied: false, free_text_comments_copied: false },
    review_provenance: { reviewer_labels: REVIEWERS, independence_attested_in_sources: false },
    coverage: { cases: records.length, candidates_per_reviewer: candidateCount, scores_compared: compared },
    agreement: {
      exact_count: agreements,
      exact_rate: compared ? agreements / compared : 0,
      disagreement_count: disagreements.length,
      disagreements,
    },
    score_distribution: Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer, scoreDistribution(byReviewer[reviewer].cases)])),
    ideal_order_cases: completeOrderCounts,
    ideal_order_reference_issues: idealOrderReferenceIssues,
    status: {
      relevance_labels: disagreements.length ? "needs_disagreement_resolution" : "reviewed",
      ranking_orders: Object.values(completeOrderCounts).every((count) => count === records.length) ? "reviewed" : "incomplete",
      ranking_policy_v2_gate_eligible: false,
      quotation_accuracy_corpus_gate_eligible: false,
    },
  };
  return { manifest, records };
}

export function corpusJsonLines(corpus) {
  return [corpus.manifest, ...corpus.records].map((item) => JSON.stringify(item)).join("\n") + "\n";
}

function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function runCli() {
  const args = process.argv.slice(2);
  const casperPath = readArg(args, "--casper");
  const irisPath = readArg(args, "--iris");
  const outputPath = readArg(args, "--output");
  if (!casperPath || !irisPath || !outputPath || args.includes("--help")) {
    console.log("Usage: node build-reviewed-vendor-ranking-corpus.mjs --casper <eval.md> --iris <eval.md> --output <corpus.jsonl>");
    process.exit(args.includes("--help") ? 0 : 1);
  }
  const sources = { Casper: readFileSync(resolve(casperPath)), Iris: readFileSync(resolve(irisPath)) };
  const corpus = buildReviewedCorpus(
    REVIEWERS.map((reviewer) => parseRankingWorkbook(sources[reviewer], reviewer)),
    Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer, sha256(sources[reviewer])])),
  );
  if (corpus.manifest.coverage.cases !== 40 || corpus.manifest.coverage.candidates_per_reviewer !== 480) {
    throw new Error("Expected 40 cases and 480 candidate scores per reviewer");
  }
  writeFileSync(resolve(outputPath), corpusJsonLines(corpus), "utf8");
  console.log(`Wrote ${corpus.manifest.coverage.cases} cases; ${corpus.manifest.agreement.exact_count}/${corpus.manifest.coverage.scores_compared} scores agree.`);
  console.log(`Unresolved score disagreements: ${corpus.manifest.agreement.disagreement_count}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) runCli();
