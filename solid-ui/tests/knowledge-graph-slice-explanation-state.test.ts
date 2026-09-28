import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeGraphSliceExplanationState } from "../src/lib/knowledgeGraphSliceExplanationState.ts";
import type { KnowledgeCard } from "../src/lib/knowledgeGraphTypes.ts";

function card(overrides: Partial<KnowledgeCard>): KnowledgeCard {
  return {
    id: overrides.id ?? "card-1",
    title: overrides.title ?? "Opportunity cost",
    summary: overrides.summary ?? "A retained study note.",
    supertags: overrides.supertags ?? ["topic:opportunity-cost"],
    knowledgeMode: overrides.knowledgeMode ?? "connected_notes",
    reviewPending: overrides.reviewPending ?? false,
    sourceNote: overrides.sourceNote ?? false,
    permanentNote: overrides.permanentNote ?? false,
    backlinks: overrides.backlinks ?? [],
    timestamp: overrides.timestamp ?? "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

test("buildKnowledgeGraphSliceExplanationState explains connected-note evidence", () => {
  const state = buildKnowledgeGraphSliceExplanationState({
    cards: [
      card({
        id: "a",
        relatedCardCount: 2,
        connectionStrength: "high",
        corroboratedSourceCount: 2,
        supertags: ["topic:opportunity-cost", "course:econ101"],
      }),
      card({
        id: "b",
        backlinks: [{ targetId: "a", targetTitle: "Opportunity cost", relationLabel: "supports" }],
        connectionStrength: "medium",
        supertags: ["topic:opportunity-cost", "week:3"],
      }),
    ],
    activeLens: "connected_notes",
    activeTag: "topic:opportunity-cost",
    activeConnectionStrength: null,
    courseTag: null,
    weekTag: null,
    zettelkastenStage: null,
  });

  assert.match(state?.headline ?? "", /why topic:opportunity-cost is connected/i);
  assert.equal(state?.badge, "2 linked");
  assert.match(state?.detail ?? "", /supertags, backlinks, and cross-source signals/i);
  assert.ok(state?.signals.some((signal) => signal.label === "Cross-source evidence"));
  assert.match(state?.nextStep ?? "", /matching Files view/i);
});

test("buildKnowledgeGraphSliceExplanationState prioritizes Zettelkasten branch review", () => {
  const state = buildKnowledgeGraphSliceExplanationState({
    cards: [
      card({
        id: "source-note",
        knowledgeMode: "zettelkasten",
        zettelkastenStage: "source_note",
        reviewPending: true,
        sourceNote: true,
        relatedCardCount: 1,
        supertags: ["topic:scarcity", "zettel:source-note"],
      }),
      card({
        id: "permanent-note",
        knowledgeMode: "zettelkasten",
        zettelkastenStage: "permanent_note",
        permanentNote: true,
        connectionStrength: "high",
        corroboratedSourceCount: 2,
        supertags: ["topic:scarcity", "zettel:permanent-note"],
      }),
    ],
    activeLens: "zettelkasten",
    activeTag: null,
    activeConnectionStrength: null,
    courseTag: "course:econ101",
    weekTag: "week:3",
    zettelkastenStage: "source_note",
  });

  assert.match(state?.headline ?? "", /Zettelkasten path/i);
  assert.equal(state?.badge, "2 note-chain cards");
  assert.ok(state?.signals.some((signal) => signal.label === "Note-chain progress"));
  assert.match(state?.nextStep ?? "", /pending source note/i);
});

test("buildKnowledgeGraphSliceExplanationState returns null for empty slices", () => {
  const state = buildKnowledgeGraphSliceExplanationState({
    cards: [],
    activeLens: "all",
    activeTag: null,
    activeConnectionStrength: null,
    courseTag: null,
    weekTag: null,
    zettelkastenStage: null,
  });

  assert.equal(state, null);
});
