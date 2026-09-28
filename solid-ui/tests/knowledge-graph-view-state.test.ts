import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import type { InsightMsg, KnowledgeCard, MergeSuggestion } from "../src/lib/knowledgeGraphTypes.ts";
import {
  collectKnowledgeGraphTags,
  filterKnowledgeGraphCards,
  hasKnowledgeGraphSampleData,
  isVisibleKnowledgeGraphTag,
  isKnowledgeGraphEmpty,
  knowledgeGraphCardMatchesLens,
  rankKnowledgeGraphCardsForFocus,
} from "../src/lib/knowledgeGraphViewState.ts";

function message(overrides: Partial<AfpMessage> & Pick<AfpMessage, "id" | "type" | "timestamp">): AfpMessage {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id ?? null,
    sender: overrides.sender ?? "test@omnyid.local",
    recipients: overrides.recipients ?? [],
    cc: overrides.cc ?? [],
    bcc: overrides.bcc ?? [],
    timestamp: overrides.timestamp,
    type: overrides.type,
    content: overrides.content ?? {},
    entities: overrides.entities ?? [],
    views: overrides.views ?? [],
    metadata: overrides.metadata ?? {},
    attachments: overrides.attachments ?? [],
    references: overrides.references ?? [],
  };
}

function card(overrides: Partial<KnowledgeCard> & Pick<KnowledgeCard, "id" | "title" | "summary" | "timestamp">): KnowledgeCard {
  return {
    id: overrides.id,
    title: overrides.title,
    summary: overrides.summary,
    supertags: overrides.supertags ?? [],
    knowledgeMode: overrides.knowledgeMode ?? "standard",
    sourceKind: overrides.sourceKind,
    sourceMessageId: overrides.sourceMessageId,
    sourceTitle: overrides.sourceTitle,
    sourceFileName: overrides.sourceFileName,
    academicKind: overrides.academicKind,
    academicCourseTag: overrides.academicCourseTag,
    academicUnitTag: overrides.academicUnitTag,
    academicChapterTag: overrides.academicChapterTag,
    academicWeekTag: overrides.academicWeekTag,
    academicLectureTag: overrides.academicLectureTag,
    academicSummary: overrides.academicSummary,
    retentionMode: overrides.retentionMode,
    retentionLabel: overrides.retentionLabel,
    zettelkastenStage: overrides.zettelkastenStage,
    policyOutcome: overrides.policyOutcome,
    storageSummary: overrides.storageSummary,
    provenanceSummary: overrides.provenanceSummary,
    referenceTargetIds: overrides.referenceTargetIds,
    relatedCardCount: overrides.relatedCardCount,
    connectionStrength: overrides.connectionStrength,
    connectionReasons: overrides.connectionReasons,
    reviewPending: overrides.reviewPending ?? false,
    sourceNote: overrides.sourceNote ?? false,
    permanentNote: overrides.permanentNote ?? false,
    backlinks: overrides.backlinks ?? [],
    timestamp: overrides.timestamp,
    sourceThreadId: overrides.sourceThreadId,
  };
}

test("hasKnowledgeGraphSampleData detects sample bootstrap messages", () => {
  assert.equal(
    hasKnowledgeGraphSampleData([
      message({ id: "a", type: "knowledge_card", timestamp: "2026-07-20T10:00:00.000Z", metadata: {} }),
      message({ id: "b", type: "insight", timestamp: "2026-07-20T11:00:00.000Z", metadata: { source: "sample_bootstrap" } }),
    ]),
    true,
  );
  assert.equal(
    hasKnowledgeGraphSampleData([
      message({ id: "a", type: "knowledge_card", timestamp: "2026-07-20T10:00:00.000Z", metadata: {} }),
    ]),
    false,
  );
});

test("collectKnowledgeGraphTags deduplicates and sorts supertags", () => {
  assert.deepEqual(
    collectKnowledgeGraphTags([
      card({ id: "1", title: "One", summary: "", timestamp: "2026-07-20T10:00:00.000Z", supertags: ["zeta", "alpha", "knowledge_mode:connected_notes"] }),
      card({ id: "2", title: "Two", summary: "", timestamp: "2026-07-20T11:00:00.000Z", supertags: ["alpha", "beta", "source:attachment"] }),
    ]),
    ["alpha", "beta", "zeta"],
  );
});

test("isVisibleKnowledgeGraphTag hides infrastructure tags but keeps study context tags", () => {
  assert.equal(isVisibleKnowledgeGraphTag("knowledge_mode:connected_notes"), false);
  assert.equal(isVisibleKnowledgeGraphTag("pipeline:inline_extract"), false);
  assert.equal(isVisibleKnowledgeGraphTag("source:attachment"), false);
  assert.equal(isVisibleKnowledgeGraphTag("resource:study_material"), true);
  assert.equal(isVisibleKnowledgeGraphTag("academic:lecture"), true);
  assert.equal(isVisibleKnowledgeGraphTag("topic:biology"), true);
});

test("filterKnowledgeGraphCards respects tag and text filters", () => {
  const cards = [
    card({
      id: "1",
      title: "Project Atlas",
      summary: "Research notes",
      timestamp: "2026-07-20T10:00:00.000Z",
      supertags: ["work"],
      sourceThreadId: "thread-atlas",
      referenceTargetIds: ["msg-atlas-1"],
    }),
    card({
      id: "2",
      title: "Travel ideas",
      summary: "Atlas mountains",
      timestamp: "2026-07-20T11:00:00.000Z",
      supertags: ["personal"],
      referenceTargetIds: ["msg-travel-1"],
    }),
  ];

  assert.deepEqual(filterKnowledgeGraphCards(cards, "atlas", null).map((entry) => entry.id), ["1", "2"]);
  assert.deepEqual(filterKnowledgeGraphCards(cards, "research", "work").map((entry) => entry.id), ["1"]);
  assert.deepEqual(filterKnowledgeGraphCards(cards, "research", "personal").map((entry) => entry.id), []);
  assert.deepEqual(filterKnowledgeGraphCards(cards, "thread-atlas", null).map((entry) => entry.id), ["1"]);
  assert.deepEqual(filterKnowledgeGraphCards(cards, "msg-travel-1", null).map((entry) => entry.id), ["2"]);

  const sourcedCards = [
    card({
      id: "3",
      title: "Metabolism note",
      summary: "Connected synthesis",
      timestamp: "2026-07-20T12:00:00.000Z",
      supertags: ["topic:biology"],
      sourceTitle: "Week 3 Lecture.pdf",
      academicKind: "lecture_slides",
      academicCourseTag: "course:bio101",
      academicUnitTag: "unit:2",
      academicChapterTag: "chapter:4",
      academicWeekTag: "week:3",
      academicSummary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
      storageSummary: "Only extracted notes retained for future retrieval",
      provenanceSummary: "Week 3 Lecture.pdf was ingested and linked into connected notes.",
      retentionLabel: "Keep extracted notes only",
    }),
  ];
  assert.deepEqual(filterKnowledgeGraphCards(sourcedCards, "week 3 lecture", null).map((entry) => entry.id), ["3"]);
  assert.deepEqual(filterKnowledgeGraphCards(sourcedCards, "future retrieval", null).map((entry) => entry.id), ["3"]);
  assert.deepEqual(filterKnowledgeGraphCards(sourcedCards, "course bio101", null).map((entry) => entry.id), ["3"]);
  assert.deepEqual(filterKnowledgeGraphCards(sourcedCards, "lecture_slides", null).map((entry) => entry.id), ["3"]);
  assert.deepEqual(filterKnowledgeGraphCards(sourcedCards, "unit:2", null).map((entry) => entry.id), ["3"]);
  assert.deepEqual(filterKnowledgeGraphCards(sourcedCards, "chapter:4", null).map((entry) => entry.id), ["3"]);
  assert.deepEqual(filterKnowledgeGraphCards(sourcedCards, "week:3", null).map((entry) => entry.id), ["3"]);
  assert.deepEqual(
    filterKnowledgeGraphCards([
      card({
        id: "4",
        title: "ATP note",
        summary: "Cross-source synthesis",
        timestamp: "2026-07-20T13:00:00.000Z",
        supertags: ["topic:biology"],
        connectionStrength: "high",
        connectionReasons: ["Shared course context: course:bio101", "Connected cluster across 4 related notes."],
      }),
    ], "shared course context", null).map((entry) => entry.id),
    ["4"],
  );
});

test("knowledgeGraphCardMatchesLens distinguishes connected notes and zettelkasten overlays", () => {
  const connectedCard = card({
    id: "1",
    title: "Connected",
    summary: "",
    timestamp: "2026-07-20T10:00:00.000Z",
    supertags: ["knowledge:connected_notes", "knowledge_mode:connected_notes"],
    knowledgeMode: "connected_notes",
  });
  const zettelkastenCard = card({
    id: "2",
    title: "ZK",
    summary: "",
    timestamp: "2026-07-20T11:00:00.000Z",
    supertags: ["knowledge_mode:zettelkasten", "zk:review_pending"],
    knowledgeMode: "zettelkasten",
    reviewPending: true,
    sourceNote: true,
    zettelkastenStage: "review_pending",
  });
  const permanentCard = card({
    id: "3",
    title: "Permanent",
    summary: "",
    timestamp: "2026-07-20T12:00:00.000Z",
    supertags: ["knowledge_mode:zettelkasten", "zk:permanent_note"],
    knowledgeMode: "zettelkasten",
    permanentNote: true,
    zettelkastenStage: "permanent_note",
  });

  assert.equal(knowledgeGraphCardMatchesLens(connectedCard, "all"), true);
  assert.equal(knowledgeGraphCardMatchesLens(connectedCard, "connected_notes"), true);
  assert.equal(knowledgeGraphCardMatchesLens(connectedCard, "zettelkasten"), false);
  assert.equal(knowledgeGraphCardMatchesLens(connectedCard, "study_materials"), false);
  assert.equal(knowledgeGraphCardMatchesLens(connectedCard, "linked_ideas"), false);
  assert.equal(knowledgeGraphCardMatchesLens(zettelkastenCard, "connected_notes"), false);
  assert.equal(knowledgeGraphCardMatchesLens(zettelkastenCard, "zettelkasten"), true);
  assert.equal(knowledgeGraphCardMatchesLens(zettelkastenCard, "source_notes"), true);
  assert.equal(knowledgeGraphCardMatchesLens(permanentCard, "permanent_notes"), true);
});

test("filterKnowledgeGraphCards respects knowledge graph lenses", () => {
  const cards = [
    card({
      id: "1",
      title: "Connected note",
      summary: "Linked study summary",
      timestamp: "2026-07-20T10:00:00.000Z",
      supertags: ["knowledge_mode:connected_notes", "academic:lecture"],
      knowledgeMode: "connected_notes",
      sourceKind: "parsed_document",
      referenceTargetIds: ["lecture-1"],
    }),
    card({
      id: "2",
      title: "Permanent note",
      summary: "Zettelkasten chain",
      timestamp: "2026-07-20T11:00:00.000Z",
      supertags: ["resource:zettelkasten", "resource:study_material", "zk:permanent_note"],
      knowledgeMode: "zettelkasten",
      permanentNote: true,
      relatedCardCount: 2,
    }),
    card({
      id: "3",
      title: "Review note",
      summary: "Needs promotion",
      timestamp: "2026-07-20T12:00:00.000Z",
      supertags: ["resource:zettelkasten", "academic:reading", "zk:review_pending"],
      knowledgeMode: "zettelkasten",
      reviewPending: true,
      sourceNote: true,
      sourceKind: "transcript",
      backlinks: [{ targetId: "2", targetTitle: "Permanent note", relationLabel: "supports" }],
    }),
    card({
      id: "4",
      title: "General resource",
      summary: "Reference material",
      timestamp: "2026-07-20T13:00:00.000Z",
      supertags: ["resource:reference"],
    }),
  ];

  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "", null, "connected_notes").map((entry) => entry.id),
    ["1"],
  );
  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "", null, "zettelkasten").map((entry) => entry.id),
    ["2", "3"],
  );
  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "", null, "linked_ideas").map((entry) => entry.id),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "", null, "study_materials").map((entry) => entry.id),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "", null, "source_notes").map((entry) => entry.id),
    ["3"],
  );
  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "", null, "review_queue").map((entry) => entry.id),
    ["3"],
  );
  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "", null, "permanent_notes").map((entry) => entry.id),
    ["2"],
  );
  assert.deepEqual(
    filterKnowledgeGraphCards(cards, "reference", null, "all").map((entry) => entry.id),
    ["4"],
  );
});

test("isKnowledgeGraphEmpty only returns true when all sections are empty", () => {
  const insight: InsightMsg = { id: "i1", body: "Body", timestamp: "2026-07-20T10:00:00.000Z" };
  const mergeSuggestion: MergeSuggestion = {
    id: "m1",
    sourceId: "a",
    targetId: "b",
    sourceTitle: "A",
    targetTitle: "B",
    timestamp: "2026-07-20T11:00:00.000Z",
  };

  assert.equal(isKnowledgeGraphEmpty([], [], []), true);
  assert.equal(isKnowledgeGraphEmpty([card({ id: "1", title: "One", summary: "", timestamp: "2026-07-20T10:00:00.000Z" })], [], []), false);
  assert.equal(isKnowledgeGraphEmpty([], [insight], []), false);
  assert.equal(isKnowledgeGraphEmpty([], [], [mergeSuggestion]), false);
});

test("rankKnowledgeGraphCardsForFocus prioritizes highlighted and context-matching cards", () => {
  const ranked = rankKnowledgeGraphCardsForFocus([
    card({
      id: "1",
      title: "Later note",
      summary: "",
      timestamp: "2026-07-20T10:00:00.000Z",
      supertags: ["topic:biology"],
      academicCourseTag: "course:bio101",
      academicWeekTag: "week:3",
    }),
    card({
      id: "2",
      title: "Highlighted source",
      summary: "",
      timestamp: "2026-07-20T09:00:00.000Z",
      supertags: ["topic:biology"],
      sourceMessageId: "msg-2",
      sourceNote: true,
      academicCourseTag: "course:bio101",
      academicWeekTag: "week:3",
      zettelkastenStage: "review_pending",
    }),
    card({
      id: "3",
      title: "Newest unrelated",
      summary: "",
      timestamp: "2026-07-20T12:00:00.000Z",
      supertags: ["topic:history"],
    }),
  ], {
    activeTag: "topic:biology",
    searchQuery: "bio101",
    activeLens: "study_materials",
    highlightedCardIds: new Set(["2"]),
    highlightedSourceMessageId: "msg-2",
  });

  assert.deepEqual(ranked.map((entry) => entry.id), ["2", "1", "3"]);

  const strengthRanked = rankKnowledgeGraphCardsForFocus([
    card({
      id: "low",
      title: "Light link",
      summary: "",
      timestamp: "2026-07-20T10:00:00.000Z",
      supertags: ["topic:biology"],
      backlinks: [{ targetId: "x", targetTitle: "X", relationLabel: "related" }],
      relatedCardCount: 1,
      connectionStrength: "low",
    }),
    card({
      id: "medium",
      title: "Moderate link",
      summary: "",
      timestamp: "2026-07-20T09:00:00.000Z",
      supertags: ["topic:biology"],
      backlinks: [{ targetId: "y", targetTitle: "Y", relationLabel: "shared topic:biology" }],
      relatedCardCount: 2,
      connectionStrength: "medium",
    }),
    card({
      id: "high",
      title: "Strong link",
      summary: "",
      timestamp: "2026-07-20T08:00:00.000Z",
      supertags: ["topic:biology"],
      backlinks: [
        { targetId: "z", targetTitle: "Z", relationLabel: "supports" },
        { targetId: "w", targetTitle: "W", relationLabel: "shared course:bio101" },
      ],
      relatedCardCount: 4,
      connectionStrength: "high",
    }),
  ], {
    activeLens: "linked_ideas",
  });

  assert.deepEqual(strengthRanked.map((entry) => entry.id), ["high", "medium", "low"]);
});
