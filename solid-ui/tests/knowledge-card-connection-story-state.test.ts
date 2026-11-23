import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeCardConnectionStoryState } from "../src/lib/knowledgeCardConnectionStoryState.ts";
import type { KnowledgeCard } from "../src/lib/knowledgeGraphTypes.ts";

function makeCard(overrides: Partial<KnowledgeCard> = {}): KnowledgeCard {
  return {
    id: "card-1",
    title: "Market failures note",
    summary: "Summary",
    supertags: ["topic:market_failures"],
    canonicalSupertags: ["topic:market_failures"],
    knowledgeMode: "connected_notes",
    reviewPending: false,
    sourceNote: false,
    permanentNote: false,
    backlinks: [],
    timestamp: "2026-09-05T00:00:00.000Z",
    connectionStrength: "low",
    relatedCardCount: 0,
    sourceDiversityCount: 0,
    topicalConnectionCount: 0,
    contradictionLinkCount: 0,
    corroboratedSourceCount: 0,
    ...overrides,
  };
}

test("buildKnowledgeCardConnectionStoryState stays hidden for isolated cards", () => {
  const state = buildKnowledgeCardConnectionStoryState(makeCard());
  assert.equal(state, null);
});

test("buildKnowledgeCardConnectionStoryState explains strong cards in study terms", () => {
  const state = buildKnowledgeCardConnectionStoryState(makeCard({
    connectionStrength: "high",
    relatedCardCount: 2,
    backlinks: [{ targetId: "b", targetTitle: "Lecture link", relationLabel: "supports" }],
    corroboratedSourceCount: 2,
    sourceDiversityCount: 2,
    topicalConnectionCount: 1,
  }));

  assert.equal(state?.grade, "strong");
  assert.match(state?.headline ?? "", /revise from directly/i);
  assert.equal(state?.signals[0]?.label, "Corroboration");
});

test("buildKnowledgeCardConnectionStoryState explains developing cards and next step", () => {
  const state = buildKnowledgeCardConnectionStoryState(makeCard({
    connectionStrength: "medium",
    relatedCardCount: 1,
    sourceDiversityCount: 1,
    topicalConnectionCount: 1,
  }));

  assert.equal(state?.grade, "developing");
  assert.match(state?.nextStep ?? "", /adjacent lecture, reading, or rough note/i);
});

test("buildKnowledgeCardConnectionStoryState highlights contradictions as useful tension", () => {
  const state = buildKnowledgeCardConnectionStoryState(makeCard({
    relatedCardCount: 1,
    contradictionLinkCount: 2,
  }));

  assert.equal(state?.grade, "developing");
  assert.ok(state?.signals.some((signal) => signal.label === "Useful tension"));
});
