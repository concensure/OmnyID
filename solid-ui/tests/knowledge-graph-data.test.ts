import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  attachKnowledgeGraphBacklinks,
  extractKnowledgeCards,
  extractKnowledgeGraphInsights,
  extractKnowledgeGraphMergeSuggestions,
  inferKnowledgeCardMode,
  knowledgeCardHasPermanentNote,
  knowledgeCardHasReviewPending,
  knowledgeCardHasSourceNote,
} from "../src/lib/knowledgeGraphData.ts";

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
    supertags: overrides.supertags ?? [],
    content: overrides.content ?? {},
    entities: overrides.entities ?? [],
    views: overrides.views ?? [],
    metadata: overrides.metadata ?? {},
    attachments: overrides.attachments ?? [],
    references: overrides.references ?? [],
    encryption: overrides.encryption,
  };
}

const emptyEvidenceFields = {
  linkEvidenceScore: 0,
  sourceDiversityCount: 0,
  topicalConnectionCount: 0,
  contradictionLinkCount: 0,
  corroboratedSourceCount: 0,
  academicChapterTag: null,
  academicUnitTag: null,
};

test("extractKnowledgeCards normalizes and sorts knowledge cards", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "card-2",
      type: "knowledge_card",
      timestamp: "2026-07-19T10:00:00.000Z",
      thread_id: "thread-2",
      supertags: ["knowledge_mode:connected_notes", "work"],
      content: { title: "Later", summary: 123, supertags: ["work", 4, "notes"] },
    }),
    message({
      id: "card-1",
      type: "knowledge_card",
      timestamp: "2026-07-18T10:00:00.000Z",
      content: {},
    }),
  ]);

  assert.deepEqual(cards, [
    {
      id: "card-2",
      title: "Later",
      summary: "",
      supertags: ["knowledge_mode:connected_notes", "work", "notes"],
      canonicalSupertags: [],
      ...emptyEvidenceFields,
      knowledgeMode: "connected_notes",
      sourceKind: "knowledge_card",
      sourceMessageId: null,
      sourceTitle: null,
      sourceFileName: null,
      academicKind: null,
      academicCourseTag: null,
      academicWeekTag: null,
      academicLectureTag: null,
      academicSummary: null,
      retentionMode: null,
      retentionLabel: null,
      zettelkastenStage: null,
      policyOutcome: null,
      storageSummary: null,
      provenanceSummary: null,
      referenceTargetIds: [],
      relatedCardCount: 0,
      connectionStrength: "low",
      connectionReasons: [],
      reviewPending: false,
      sourceNote: false,
      permanentNote: false,
      backlinks: [],
      timestamp: "2026-07-19T10:00:00.000Z",
      sourceThreadId: "thread-2",
    },
    {
      id: "card-1",
      title: "card-1",
      summary: "",
      supertags: [],
      canonicalSupertags: [],
      ...emptyEvidenceFields,
      knowledgeMode: "standard",
      sourceKind: "knowledge_card",
      sourceMessageId: null,
      sourceTitle: null,
      sourceFileName: null,
      academicKind: null,
      academicCourseTag: null,
      academicWeekTag: null,
      academicLectureTag: null,
      academicSummary: null,
      retentionMode: null,
      retentionLabel: null,
      zettelkastenStage: null,
      policyOutcome: null,
      storageSummary: null,
      provenanceSummary: null,
      referenceTargetIds: [],
      relatedCardCount: 0,
      connectionStrength: "low",
      connectionReasons: [],
      reviewPending: false,
      sourceNote: false,
      permanentNote: false,
      backlinks: [],
      timestamp: "2026-07-18T10:00:00.000Z",
      sourceThreadId: null,
    },
  ]);
});

test("extractKnowledgeCards tolerates malformed content records", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "malformed-card-id",
      type: "knowledge_card",
      timestamp: "2026-07-20T10:00:00.000Z",
      content: "not an object" as unknown as Record<string, unknown>,
    }),
  ]);

  assert.deepEqual(cards, [
    {
      id: "malformed-card-id",
      title: "malformed-ca",
      summary: "",
      supertags: [],
      canonicalSupertags: [],
      ...emptyEvidenceFields,
      knowledgeMode: "standard",
      sourceKind: "knowledge_card",
      sourceMessageId: null,
      sourceTitle: null,
      sourceFileName: null,
      academicKind: null,
      academicCourseTag: null,
      academicWeekTag: null,
      academicLectureTag: null,
      academicSummary: null,
      retentionMode: null,
      retentionLabel: null,
      zettelkastenStage: null,
      policyOutcome: null,
      storageSummary: null,
      provenanceSummary: null,
      referenceTargetIds: [],
      relatedCardCount: 0,
      connectionStrength: "low",
      connectionReasons: [],
      reviewPending: false,
      sourceNote: false,
      permanentNote: false,
      backlinks: [],
      timestamp: "2026-07-20T10:00:00.000Z",
      sourceThreadId: null,
    },
  ]);
});

test("knowledge graph extractors hide encrypted message payloads until local decryption is available", () => {
  const encryptedCard = message({
    id: "encrypted-card",
    type: "knowledge_card",
    timestamp: "2026-07-20T10:00:00.000Z",
    content: {
      title: "Hidden relationship note",
      summary: "Private wedding detail",
      supertags: ["private"],
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
  });
  const encryptedBacklink = message({
    id: "encrypted-backlink",
    type: "backlink_update",
    timestamp: "2026-07-20T10:05:00.000Z",
    content: {
      source_id: "encrypted-card",
      target_id: "hidden-target",
      relation: "supports",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
  });
  const encryptedInsight = message({
    id: "encrypted-insight",
    type: "insight",
    timestamp: "2026-07-20T10:10:00.000Z",
    content: {
      body: "Hidden insight",
      topic: "Secret topic",
      count: 3,
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
  });
  const encryptedMerge = message({
    id: "encrypted-merge",
    type: "merge_suggestion",
    timestamp: "2026-07-20T10:15:00.000Z",
    content: {
      source_id: "hidden-a",
      target_id: "hidden-b",
      source_title: "Hidden A",
      target_title: "Hidden B",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
  });

  const cards = extractKnowledgeCards([encryptedCard]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.title, "encrypted-ca");
  assert.equal(cards[0]?.summary, "");
  assert.deepEqual(cards[0]?.supertags, []);

  const linked = attachKnowledgeGraphBacklinks(cards, [encryptedBacklink]);
  assert.deepEqual(linked[0]?.backlinks, []);

  assert.deepEqual(extractKnowledgeGraphInsights([encryptedInsight]), [
    {
      id: "encrypted-insight",
      body: "",
      topic: undefined,
      count: undefined,
      timestamp: "2026-07-20T10:10:00.000Z",
    },
  ]);
  assert.deepEqual(extractKnowledgeGraphMergeSuggestions([encryptedMerge]), [
    {
      id: "encrypted-merge",
      sourceId: "",
      targetId: "",
      sourceTitle: "Message A",
      targetTitle: "Message B",
      similarityScore: undefined,
      timestamp: "2026-07-20T10:15:00.000Z",
    },
  ]);
});

test("attachKnowledgeGraphBacklinks attaches normalized backlinks to matching cards", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "source-card",
      type: "knowledge_card",
      timestamp: "2026-07-19T10:00:00.000Z",
      content: { title: "Source" },
    }),
  ]);

  const updated = attachKnowledgeGraphBacklinks(cards, [
    message({
      id: "backlink-1",
      type: "backlink_update",
      timestamp: "2026-07-19T11:00:00.000Z",
      content: { source_id: "source-card", target_id: "target-card", relation: 3 },
    }),
  ]);

  assert.deepEqual(updated[0]?.backlinks, [
    {
      targetId: "target-card",
      targetTitle: "target-card",
      relationLabel: "related",
    },
  ]);
});

test("inferKnowledgeCardMode falls back from metadata to supertags", () => {
  const metadataMode = inferKnowledgeCardMode(
    message({
      id: "a",
      type: "knowledge_card",
      timestamp: "2026-07-20T10:00:00.000Z",
      metadata: { knowledge_mode: "zettelkasten" },
    }),
    [],
  );
  const tagMode = inferKnowledgeCardMode(
    message({
      id: "b",
      type: "knowledge_card",
      timestamp: "2026-07-20T10:00:00.000Z",
    }),
    ["knowledge:connected_notes"],
  );

  assert.equal(metadataMode, "zettelkasten");
  assert.equal(tagMode, "connected_notes");
  assert.equal(knowledgeCardHasReviewPending(["zk:review_pending"]), true);
  assert.equal(knowledgeCardHasSourceNote(["zk:source_note"]), true);
  assert.equal(knowledgeCardHasPermanentNote(["zk:permanent_note"]), true);
});

test("extractKnowledgeCards applies tag_update supertag deltas", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "zk-card",
      type: "knowledge_card",
      timestamp: "2026-09-02T10:00:00.000Z",
      supertags: ["resource:zettelkasten", "zk:source_note", "zk:review_pending"],
      content: { title: "Week 3 permanent note draft" },
    }),
    message({
      id: "tag-update-1",
      type: "tag_update",
      timestamp: "2026-09-02T10:05:00.000Z",
      references: [{ id: "zk-card" }],
      content: {
        remove_supertags: ["zk:review_pending", "zk:source_note"],
        add_supertags: ["zk:reviewed", "zk:permanent_note"],
      },
    }),
  ]);

  assert.deepEqual(cards, [
    {
      id: "zk-card",
      title: "Week 3 permanent note draft",
      summary: "",
      supertags: ["resource:zettelkasten", "zk:reviewed", "zk:permanent_note"],
      canonicalSupertags: ["resource:zettelkasten"],
      ...emptyEvidenceFields,
      knowledgeMode: "zettelkasten",
      sourceKind: "knowledge_card",
      sourceMessageId: null,
      sourceTitle: null,
      sourceFileName: null,
      academicKind: null,
      academicCourseTag: null,
      academicWeekTag: null,
      academicLectureTag: null,
      academicSummary: null,
      retentionMode: null,
      retentionLabel: null,
      zettelkastenStage: null,
      policyOutcome: null,
      storageSummary: null,
      provenanceSummary: null,
      referenceTargetIds: [],
      relatedCardCount: 0,
      connectionStrength: "low",
      connectionReasons: [],
      reviewPending: false,
      sourceNote: false,
      permanentNote: true,
      backlinks: [],
      timestamp: "2026-09-02T10:00:00.000Z",
      sourceThreadId: null,
    },
  ]);
});

test("extractKnowledgeCards promotes retained parsed documents and transcripts into graph cards", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "doc-1",
      type: "parsed_document",
      timestamp: "2026-09-02T10:00:00.000Z",
      thread_id: "thread-study",
      supertags: ["topic:biology", "resource:study_material"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "connected_notes",
        source_message_id: "upload-1",
        source_file_name: "Week 3 Lecture.pdf",
        academic_kind: "lecture_slides",
        academic_course_tag: "course:bio101",
        academic_week_tag: "week:3",
        academic_lecture_tag: "lecture:week_3",
        academic_summary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
        attachment_retention_mode: "keep_extracted_only",
        attachment_retention_label: "Keep extracted notes only",
        attachment_policy_outcome: "Only extracted notes remain available for future study sessions.",
      },
      content: {
        content_text: "Cell respiration links ATP production to metabolism in week three lecture notes.",
      },
      references: [{ target: "transcript-1" }],
    }),
    message({
      id: "transcript-1",
      type: "transcript",
      timestamp: "2026-09-02T09:00:00.000Z",
      thread_id: "thread-study",
      supertags: ["topic:biology"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "zettelkasten",
      },
      content: {
        text: "Professor explains how respiration overlaps with biochemistry.",
      },
    }),
  ]);

  assert.deepEqual(cards, [
    {
      id: "doc-1",
      title: "Week 3 Lecture.pdf",
      summary: "Cell respiration links ATP production to metabolism in week three lecture notes.",
      supertags: ["topic:biology", "resource:study_material", "knowledge_mode:connected_notes"],
      canonicalSupertags: ["topic:biology", "resource:study-material", "resource:studymaterial"],
      ...emptyEvidenceFields,
      knowledgeMode: "connected_notes",
      sourceKind: "parsed_document",
      sourceMessageId: "upload-1",
      sourceTitle: "Week 3 Lecture.pdf",
      sourceFileName: "Week 3 Lecture.pdf",
      academicKind: "lecture_slides",
      academicCourseTag: "course:bio101",
      academicWeekTag: "week:3",
      academicLectureTag: "lecture:week_3",
      academicSummary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
      retentionMode: "keep_extracted_only",
      retentionLabel: "Keep extracted notes only",
      zettelkastenStage: null,
      policyOutcome: "Only extracted notes remain available for future study sessions.",
      storageSummary: "Only extracted notes retained for future retrieval",
      provenanceSummary: "Week 3 Lecture.pdf was ingested and linked into connected notes. lecture slides · course bio101 · week 3 organized for study retrieval. Only extracted notes remain available for future study sessions.",
      referenceTargetIds: ["transcript-1"],
      relatedCardCount: 0,
      connectionStrength: "low",
      connectionReasons: [],
      reviewPending: false,
      sourceNote: false,
      permanentNote: false,
      backlinks: [],
      timestamp: "2026-09-02T10:00:00.000Z",
      sourceThreadId: "thread-study",
    },
    {
      id: "transcript-1",
      title: "Transcript transcri",
      summary: "Professor explains how respiration overlaps with biochemistry.",
      supertags: ["topic:biology", "knowledge_mode:zettelkasten"],
      canonicalSupertags: ["topic:biology"],
      ...emptyEvidenceFields,
      knowledgeMode: "zettelkasten",
      sourceKind: "transcript",
      sourceMessageId: null,
      sourceTitle: null,
      sourceFileName: null,
      academicKind: null,
      academicCourseTag: null,
      academicWeekTag: null,
      academicLectureTag: null,
      academicSummary: null,
      retentionMode: null,
      retentionLabel: null,
      zettelkastenStage: null,
      policyOutcome: null,
      storageSummary: "Derived from study material in the knowledge pipeline",
      provenanceSummary: "Uploaded study material was ingested and organized as Zettelkasten.",
      referenceTargetIds: [],
      relatedCardCount: 0,
      connectionStrength: "low",
      connectionReasons: [],
      reviewPending: false,
      sourceNote: false,
      permanentNote: false,
      backlinks: [],
      timestamp: "2026-09-02T09:00:00.000Z",
      sourceThreadId: "thread-study",
    },
  ]);
});

test("attachKnowledgeGraphBacklinks infers source-material, reference, and shared-tag links", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "root-card",
      type: "knowledge_card",
      timestamp: "2026-09-02T08:00:00.000Z",
      supertags: ["project:bio101", "topic:respiration"],
      content: { title: "Root card" },
    }),
    message({
      id: "doc-card",
      type: "parsed_document",
      timestamp: "2026-09-02T09:00:00.000Z",
      supertags: ["project:bio101", "topic:respiration"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "connected_notes",
        source_message_id: "root-card",
      },
      content: { title: "Lecture notes", content_text: "Week 3 notes" },
      references: [{ target: "root-card" }],
    }),
  ]);

  const updated = attachKnowledgeGraphBacklinks(cards, []);
  assert.deepEqual(updated.find((card) => card.id === "doc-card")?.backlinks, [
    {
      targetId: "root-card",
      targetTitle: "Root card",
      relationLabel: "references",
    },
    {
      targetId: "root-card",
      targetTitle: "Root card",
      relationLabel: "shared project:bio101",
    },
    {
      targetId: "root-card",
      targetTitle: "Root card",
      relationLabel: "shared topic:respiration",
    },
    {
      targetId: "root-card",
      targetTitle: "Root card",
      relationLabel: "source material",
    },
  ]);
  assert.equal(updated.find((card) => card.id === "doc-card")?.relatedCardCount, 4);
  assert.equal(updated.find((card) => card.id === "doc-card")?.connectionStrength, "high");
  const docCard = updated.find((card) => card.id === "doc-card");
  assert.deepEqual(docCard?.connectionReasons, [
    "Direct references to other notes are present.",
    "Grounded in retained source material.",
    "Shared context spans 2 dimensions: project, topic.",
    "Concept-level context is present across 1 topical tag.",
    "Connected cluster across 4 related notes.",
    "Cross-source study overlap is grounded by retained source material.",
  ]);
  assert.equal(docCard?.topicalConnectionCount, 1);
});

test("attachKnowledgeGraphBacklinks links cards across normalized contextual tag variants", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "a",
      type: "knowledge_card",
      timestamp: "2026-09-02T08:00:00.000Z",
      supertags: ["course:Econ 101", "topic:Market Failures"],
      content: { title: "Lecture note A" },
    }),
    message({
      id: "b",
      type: "knowledge_card",
      timestamp: "2026-09-02T09:00:00.000Z",
      supertags: ["course:econ-101", "topic:market_failures"],
      content: { title: "Lecture note B" },
    }),
  ]);

  const updated = attachKnowledgeGraphBacklinks(cards, []);
  assert.deepEqual(updated.find((card) => card.id === "a")?.backlinks, [
    {
      targetId: "b",
      targetTitle: "Lecture note B",
      relationLabel: "shared course:econ-101",
    },
    {
      targetId: "b",
      targetTitle: "Lecture note B",
      relationLabel: "shared topic:market_failures",
    },
  ]);
  assert.equal(updated.find((card) => card.id === "a")?.relatedCardCount, 2);
  const cardA = updated.find((card) => card.id === "a");
  assert.equal(cardA?.connectionStrength, "medium");
  assert.deepEqual(cardA?.connectionReasons, [
    "Shared context spans 2 dimensions: course, topic.",
    "Concept-level context is present across 1 topical tag.",
    "Connected to 2 related notes.",
  ]);
});

test("attachKnowledgeGraphBacklinks keeps grounded metadata weaker than real overlap unless reinforced", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "grounded-only",
      type: "parsed_document",
      timestamp: "2026-09-02T08:00:00.000Z",
      supertags: ["resource:study_material"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "connected_notes",
        academic_course_tag: "course:chem101",
        academic_week_tag: "week:4",
        academic_lecture_tag: "lecture:4",
      },
      content: { title: "Week 4 Slides", content_text: "Reaction kinetics overview." },
    }),
  ]);

  const updated = attachKnowledgeGraphBacklinks(cards, []);
  assert.equal(updated[0]?.connectionStrength, "low");
  assert.deepEqual(updated[0]?.connectionReasons, [
    "Grounded course context: course:chem101",
    "Grounded week context: week:4",
    "Grounded lecture context: lecture:4",
  ]);
});

test("attachKnowledgeGraphBacklinks links cards through academic metadata even when contextual supertags are sparse", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "doc-a",
      type: "parsed_document",
      timestamp: "2026-09-02T08:00:00.000Z",
      supertags: ["resource:study_material"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "connected_notes",
        academic_course_tag: "course:chem101",
        academic_week_tag: "week:4",
        academic_lecture_tag: "lecture:4",
      },
      content: { title: "Week 4 lecture slides", content_text: "Reaction kinetics." },
    }),
    message({
      id: "doc-b",
      type: "parsed_document",
      timestamp: "2026-09-02T09:00:00.000Z",
      supertags: ["resource:study_material"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "connected_notes",
        academic_course_tag: "course:chem101",
        academic_week_tag: "week:4",
        academic_lecture_tag: "lecture:4",
      },
      content: { title: "Week 4 reading notes", content_text: "Catalyst review." },
    }),
  ]);

  const updated = attachKnowledgeGraphBacklinks(cards, []);
  const cardA = updated.find((card) => card.id === "doc-a");

  assert.deepEqual(cardA?.backlinks, [
    {
      targetId: "doc-b",
      targetTitle: "Week 4 reading notes",
      relationLabel: "shared course:chem101",
    },
    {
      targetId: "doc-b",
      targetTitle: "Week 4 reading notes",
      relationLabel: "shared lecture:4",
    },
    {
      targetId: "doc-b",
      targetTitle: "Week 4 reading notes",
      relationLabel: "shared week:4",
    },
  ]);
  assert.equal(cardA?.connectionStrength, "high");
  assert.deepEqual(cardA?.connectionReasons, [
    "Grounded course context: course:chem101",
    "Grounded week context: week:4",
    "Grounded lecture context: lecture:4",
    "Shared context spans 3 dimensions: course, lecture, week.",
    "Connected cluster across 3 related notes.",
  ]);
});

test("attachKnowledgeGraphBacklinks links cards through backend graph metadata tags", () => {
  const cards = extractKnowledgeCards([
    message({
      id: "doc-a",
      type: "parsed_document",
      timestamp: "2026-09-02T08:00:00.000Z",
      supertags: ["resource:study_material"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "zettelkasten",
        knowledge_graph_seed: true,
        knowledge_graph_group_key: "course:law101",
        knowledge_graph_link_tags: ["course:law101", "week:5", "topic:negligence"],
        zettelkasten_entry_type: "source_note",
        zettelkasten_next_action: "Write a permanent note about duty of care.",
      },
      content: { title: "Week 5 torts slides", content_text: "Duty of care and breach." },
    }),
    message({
      id: "doc-b",
      type: "parsed_document",
      timestamp: "2026-09-02T09:00:00.000Z",
      supertags: ["resource:study_material"],
      metadata: {
        knowledge_pipeline: "connected_notes_ingest",
        knowledge_mode: "connected_notes",
        knowledge_graph_group_key: "course:law101",
        knowledge_graph_link_tags: ["course:law101", "topic:negligence"],
      },
      content: { title: "Negligence reading", content_text: "Reasonable foreseeability." },
    }),
  ]);

  const updated = attachKnowledgeGraphBacklinks(cards, []);
  const source = updated.find((card) => card.id === "doc-a");

  assert.equal(source?.knowledgeGraphSeed, true);
  assert.equal(source?.knowledgeGraphGroupKey, "course:law101");
  assert.deepEqual(source?.knowledgeGraphLinkTags, ["course:law101", "week:5", "topic:negligence"]);
  assert.equal(source?.zettelkastenEntryType, "source_note");
  assert.equal(source?.zettelkastenNextAction, "Write a permanent note about duty of care.");
  assert.deepEqual(source?.backlinks, [
    {
      targetId: "doc-b",
      targetTitle: "Negligence reading",
      relationLabel: "shared course:law101",
    },
    {
      targetId: "doc-b",
      targetTitle: "Negligence reading",
      relationLabel: "shared topic:negligence",
    },
  ]);
  assert.deepEqual(source?.connectionReasons, [
    "Graph group anchor: course:law101",
    "Supertag graph hints: course:law101, week:5, topic:negligence.",
    "Zettelkasten next action is ready for note promotion.",
    "Shared context spans 2 dimensions: course, topic.",
    "Concept-level context is present across 1 topical tag.",
    "Connected to 2 related notes.",
  ]);
});

test("attachKnowledgeGraphBacklinks strengthens zettelkasten cards when semantic links and promotion signals align", () => {
  const messages = [
    message({
      id: "zk-source",
      type: "knowledge_card",
      timestamp: "2026-09-02T08:00:00.000Z",
      supertags: ["resource:zettelkasten", "topic:memory", "zk:source_note"],
      content: { title: "Source note" },
    }),
    message({
      id: "zk-permanent",
      type: "knowledge_card",
      timestamp: "2026-09-02T09:00:00.000Z",
      supertags: ["resource:zettelkasten", "topic:memory", "zk:permanent_note"],
      references: [{ target: "zk-source" }],
      content: { title: "Permanent note" },
    }),
    message({
      id: "backlink-1",
      type: "backlink_update",
      timestamp: "2026-09-02T10:00:00.000Z",
      content: { source_id: "zk-permanent", target_id: "zk-source", relation: "supports" },
    }),
  ];
  const cards = extractKnowledgeCards(messages);

  const updated = attachKnowledgeGraphBacklinks(cards, messages);
  const permanent = updated.find((card) => card.id === "zk-permanent");

  assert.equal(permanent?.connectionStrength, "high");
  assert.deepEqual(permanent?.connectionReasons, [
    "Direct references to other notes are present.",
    "Shared context spans 2 dimensions: resource, topic.",
    "Concept-level context is present across 1 topical tag.",
    "Explicit semantic links: supports.",
    "Connected cluster across 4 related notes.",
    "Promoted into a longer-term permanent note.",
  ]);
});

test("extractKnowledgeGraphInsights limits to the newest eight insights", () => {
  const messages = Array.from({ length: 10 }, (_, index) =>
    message({
      id: `insight-${index}`,
      type: "insight",
      timestamp: `2026-07-${String(10 + index).padStart(2, "0")}T10:00:00.000Z`,
      content: { body: `Insight ${index}`, count: index, topic: index % 2 === 0 ? `Topic ${index}` : undefined },
    }),
  );

  const insights = extractKnowledgeGraphInsights(messages);

  assert.equal(insights.length, 8);
  assert.equal(insights[0]?.id, "insight-9");
  assert.equal(insights.at(-1)?.id, "insight-2");
});

test("extractKnowledgeGraphMergeSuggestions normalizes merge suggestion fallbacks", () => {
  const suggestions = extractKnowledgeGraphMergeSuggestions([
    message({
      id: "merge-1",
      type: "merge_suggestion",
      timestamp: "2026-07-19T10:00:00.000Z",
      content: { source_id: "a", similarity_score: "bad" },
    }),
  ]);

  assert.deepEqual(suggestions, [
    {
      id: "merge-1",
      sourceId: "a",
      targetId: "",
      sourceTitle: "Message A",
      targetTitle: "Message B",
      similarityScore: undefined,
      timestamp: "2026-07-19T10:00:00.000Z",
    },
  ]);
});
