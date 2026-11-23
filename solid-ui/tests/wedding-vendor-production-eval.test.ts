import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  rankWeddingVendorCandidates,
  type WeddingVendorRankingRequirements,
  type WeddingVendorRankingSource,
} from "@/lib/weddingVendorRankingState";

type EvalCandidate = Partial<WeddingVendorRankingSource> & Pick<WeddingVendorRankingSource, "id" | "title">;
type EvalCase = {
  id: string;
  geography: string;
  requirements: WeddingVendorRankingRequirements;
  candidates: EvalCandidate[];
  groundTruth: {
    hardEligibleIds: string[];
    topRelevantIds: string[];
    unknownIds: string[];
    photoIdentityVerifiedIds: string[];
  };
};

const fixture = JSON.parse(readFileSync(new URL("./fixtures/wedding-vendor-ranking-eval-v1.json", import.meta.url), "utf8")) as {
  schemaVersion: number;
  consentSafe: boolean;
  synthetic: boolean;
  cases: EvalCase[];
};
const policy = JSON.parse(readFileSync(new URL("../../config/wedding_vendor_production_v1.json", import.meta.url), "utf8")) as {
  ranking_policy: Record<string, number>;
};

function source(candidate: EvalCandidate): WeddingVendorRankingSource {
  return {
    provider: "synthetic_eval",
    url: `https://${candidate.id}.example.test/`,
    websiteUrl: `https://${candidate.id}.example.test/`,
    mapUrl: null,
    imageUrl: null,
    address: null,
    phone: null,
    email: null,
    instagramUrl: null,
    snippet: "",
    ...candidate,
  };
}

test("consent-safe production corpus meets the declared deterministic ranking thresholds", () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.consentSafe, true);
  assert.equal(fixture.synthetic, true);
  assert.ok(new Set(fixture.cases.map((item) => item.geography)).size >= 3);
  assert.ok(new Set(fixture.cases.flatMap((item) => item.requirements.vendorCategories ?? [])).size >= 3);

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let relevantTopThree = 0;
  let topThreeCount = 0;
  let photoValid = 0;
  let photoCount = 0;
  let unknownCorrect = 0;
  let unknownPredicted = 0;
  const unexpectedUnknownIds: string[] = [];

  for (const item of fixture.cases) {
    const result = rankWeddingVendorCandidates({
      sources: item.candidates.map(source),
      requirements: item.requirements,
      now: new Date("2026-10-06T00:00:00Z"),
    });
    const predictedEligible = new Set([...result.booked, ...result.bookable, ...result.verify].map((candidate) => candidate.id));
    const expectedEligible = new Set(item.groundTruth.hardEligibleIds);
    for (const candidate of item.candidates) {
      const predicted = predictedEligible.has(candidate.id);
      const expected = expectedEligible.has(candidate.id);
      if (predicted && expected) truePositive += 1;
      else if (predicted) falsePositive += 1;
      else if (expected) falseNegative += 1;
    }

    const ranked = [...result.booked, ...result.bookable, ...result.verify].slice(0, 3);
    const relevant = new Set(item.groundTruth.topRelevantIds);
    relevantTopThree += ranked.filter((candidate) => relevant.has(candidate.id)).length;
    topThreeCount += ranked.length;

    const verifiedPhotos = new Set(item.groundTruth.photoIdentityVerifiedIds);
    for (const candidate of item.candidates.filter((candidate) => Boolean(candidate.imageUrl))) {
      photoCount += 1;
      if (verifiedPhotos.has(candidate.id)) photoValid += 1;
    }

    const expectedUnknown = new Set(item.groundTruth.unknownIds);
    const predictedUnknown = [...result.verify].filter((candidate) => candidate.unknownHardConstraints.length > 0);
    unknownPredicted += predictedUnknown.length;
    unknownCorrect += predictedUnknown.filter((candidate) => expectedUnknown.has(candidate.id)).length;
    unexpectedUnknownIds.push(...predictedUnknown.filter((candidate) => !expectedUnknown.has(candidate.id)).map((candidate) => candidate.id));

    const outputIds = [...result.booked, ...result.bookable, ...result.verify, ...result.excluded].map((candidate) => candidate.id);
    assert.equal(new Set(outputIds).size, outputIds.length, `${item.id} emitted duplicate candidates`);
  }

  const precision = truePositive / (truePositive + falsePositive);
  const recall = truePositive / (truePositive + falseNegative);
  const topThreeRelevance = relevantTopThree / topThreeCount;
  const photoIdentityRate = photoValid / photoCount;
  const unknownPrecision = unknownPredicted === 0 ? 1 : unknownCorrect / unknownPredicted;
  const thresholds = policy.ranking_policy;

  assert.deepEqual(
    { precision, recall, topThreeRelevance, photoIdentityRate, unknownPrecision },
    { precision: 1, recall: 1, topThreeRelevance: 1, photoIdentityRate: 1, unknownPrecision: 1 },
  );

  assert.ok(precision >= thresholds.hard_constraint_precision_min, { precision, thresholds });
  assert.ok(recall >= thresholds.hard_constraint_recall_min, { recall, thresholds });
  assert.ok(topThreeRelevance >= thresholds.top_three_relevance_min, { topThreeRelevance, thresholds });
  assert.ok(photoIdentityRate >= thresholds.photo_identity_rate_min, { photoIdentityRate, thresholds });
  assert.ok(unknownPrecision >= thresholds.unknown_conflict_label_precision_min, JSON.stringify({ unknownPrecision, unexpectedUnknownIds, thresholds }));
});
