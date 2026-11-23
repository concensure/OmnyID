import assert from "node:assert/strict";
import test from "node:test";

import type { SupertagDefinitionRecord } from "../src/lib/api.ts";
import type { KnowledgeCard } from "../src/lib/knowledgeGraphTypes.ts";
import {
  applyKnowledgeGraphSupertagDefinitions,
  buildKnowledgeGraphSupertagDefinitionIndex,
} from "../src/lib/knowledgeGraphSupertagDefinitions.ts";

function definition(overrides: Partial<SupertagDefinitionRecord> & Pick<SupertagDefinitionRecord, "definition_id" | "tag_name">): SupertagDefinitionRecord {
  return {
    definition_id: overrides.definition_id,
    tag_name: overrides.tag_name,
    keywords: overrides.keywords ?? [],
    folder_scope: overrides.folder_scope ?? [],
    parent_tags: overrides.parent_tags ?? [],
    alias_tags: overrides.alias_tags ?? [],
    hierarchy_mode: overrides.hierarchy_mode ?? "",
    afp_message_id: overrides.afp_message_id ?? "",
    created_at: overrides.created_at ?? "2026-09-02T00:00:00.000Z",
  };
}

function card(overrides: Partial<KnowledgeCard> & Pick<KnowledgeCard, "id" | "title" | "summary" | "timestamp">): KnowledgeCard {
  return {
    id: overrides.id,
    title: overrides.title,
    summary: overrides.summary,
    supertags: overrides.supertags ?? [],
    canonicalSupertags: overrides.canonicalSupertags ?? [],
    knowledgeMode: overrides.knowledgeMode ?? "standard",
    sourceKind: overrides.sourceKind,
    sourceMessageId: overrides.sourceMessageId,
    referenceTargetIds: overrides.referenceTargetIds,
    relatedCardCount: overrides.relatedCardCount ?? 0,
    reviewPending: overrides.reviewPending ?? false,
    sourceNote: overrides.sourceNote ?? false,
    permanentNote: overrides.permanentNote ?? false,
    backlinks: overrides.backlinks ?? [],
    timestamp: overrides.timestamp,
    sourceThreadId: overrides.sourceThreadId,
  };
}

test("buildKnowledgeGraphSupertagDefinitionIndex maps aliases to canonical tag names", () => {
  const index = buildKnowledgeGraphSupertagDefinitionIndex([
    definition({
      definition_id: "def-1",
      tag_name: "course:Econ 101",
      alias_tags: ["course:econ-101", "course:econ_101"],
    }),
  ]);

  assert.equal(index.aliasToCanonical.get("course:econ 101"), "course:Econ 101");
  assert.equal(index.aliasToCanonical.get("course:econ-101"), "course:Econ 101");
  assert.equal(index.aliasToCanonical.get("course:econ_101"), "course:Econ 101");
});

test("applyKnowledgeGraphSupertagDefinitions canonicalizes aliases and adds canonical shared links", () => {
  const cards = applyKnowledgeGraphSupertagDefinitions([
    card({
      id: "a",
      title: "A",
      summary: "",
      timestamp: "2026-09-02T10:00:00.000Z",
      supertags: ["course:Econ 101", "topic:Market Failures"],
      backlinks: [
        { targetId: "b", targetTitle: "B", relationLabel: "shared course:econ-101" },
      ],
    }),
    card({
      id: "b",
      title: "B",
      summary: "",
      timestamp: "2026-09-02T09:00:00.000Z",
      supertags: ["course:econ-101", "topic:market_failures"],
    }),
  ], [
    definition({
      definition_id: "def-course",
      tag_name: "course:Econ 101",
      alias_tags: ["course:econ-101"],
    }),
    definition({
      definition_id: "def-topic",
      tag_name: "topic:Market Failures",
      alias_tags: ["topic:market_failures"],
    }),
  ]);

  assert.deepEqual(cards[0]?.backlinks, [
    { targetId: "b", targetTitle: "B", relationLabel: "shared course:Econ 101" },
    { targetId: "b", targetTitle: "B", relationLabel: "shared topic:Market Failures" },
  ]);
  assert.ok(cards[0]?.canonicalSupertags?.includes("course:Econ 101"));
  assert.ok(cards[1]?.canonicalSupertags?.includes("topic:Market Failures"));
  assert.equal(cards[0]?.relatedCardCount, 2);
});
