import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphCoverageState } from "../src/lib/knowledgeGraphCoverageState.ts";
import type { KnowledgeCard } from "../src/lib/knowledgeGraphTypes.ts";

function makeCard(partial: Partial<KnowledgeCard>): KnowledgeCard {
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title ?? "Card",
    summary: partial.summary ?? "Summary",
    supertags: partial.supertags ?? [],
    knowledgeMode: partial.knowledgeMode ?? "connected_notes",
    reviewPending: partial.reviewPending ?? false,
    sourceNote: partial.sourceNote ?? false,
    permanentNote: partial.permanentNote ?? false,
    backlinks: partial.backlinks ?? [],
    timestamp: partial.timestamp ?? "2026-09-04T10:00:00.000Z",
    ...partial,
  };
}

test("buildKnowledgeGraphCoverageState finds dense supertag clusters", () => {
  const state = buildKnowledgeGraphCoverageState({
    cards: [
      makeCard({ supertags: ["topic:photosynthesis"], canonicalSupertags: ["topic:photosynthesis"], connectionStrength: "high", corroboratedSourceCount: 2, sourceDiversityCount: 2 }),
      makeCard({ supertags: ["topic:photosynthesis"], canonicalSupertags: ["topic:photosynthesis"], connectionStrength: "medium", corroboratedSourceCount: 2 }),
      makeCard({ supertags: ["topic:photosynthesis", "topic:chloroplast"], canonicalSupertags: ["topic:photosynthesis"], connectionStrength: "medium", permanentNote: true }),
      makeCard({ supertags: ["topic:chloroplast"], canonicalSupertags: ["topic:chloroplast"], connectionStrength: "low", reviewPending: true }),
    ],
    activeLens: "connected_notes",
    activeTag: null,
  });

  assert.equal(state?.grade, "dense");
  assert.equal(state?.recommendedTag, "topic:photosynthesis");
  assert.match(state?.headline ?? "", /dense enough/i);
  assert.equal(state?.clusters[0]?.count, 3);
});

test("buildKnowledgeGraphCoverageState marks shallow clusters as developing", () => {
  const state = buildKnowledgeGraphCoverageState({
    cards: [
      makeCard({ supertags: ["topic:market_failure"], canonicalSupertags: ["topic:market_failure"], connectionStrength: "low", reviewPending: true }),
      makeCard({ supertags: ["topic:market_failure"], canonicalSupertags: ["topic:market_failure"], connectionStrength: "low" }),
      makeCard({ supertags: ["topic:externalities"], canonicalSupertags: ["topic:externalities"], connectionStrength: "low" }),
    ],
    activeLens: "study_materials",
    activeTag: null,
  });

  assert.equal(state?.grade, "developing");
  assert.match(state?.detail ?? "", /emerging thread/i);
  assert.match(state?.noteProgressLabel ?? "", /review/i);
});
