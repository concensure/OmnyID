import assert from "node:assert/strict";
import test from "node:test";

import type { FileLibraryItem } from "../src/lib/api.ts";
import {
  buildKnowledgeGraphIntentFromAttachmentGrounding,
  buildKnowledgeGraphIntentFromFileLibraryFocus,
  consumeKnowledgeGraphNavigationIntent,
  deriveKnowledgeGraphNavigationIntentFromFile,
  KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY,
  saveKnowledgeGraphNavigationIntent,
} from "../src/lib/knowledgeGraphNavigationState.ts";

const sessionStorageState = new Map<string, string>();

Object.assign(globalThis, {
  sessionStorage: {
    getItem(key: string) {
      return sessionStorageState.has(key) ? sessionStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      sessionStorageState.set(key, value);
    },
    removeItem(key: string) {
      sessionStorageState.delete(key);
    },
  },
});

function fileItem(overrides: Partial<FileLibraryItem> = {}): FileLibraryItem {
  return {
    id: overrides.id ?? "file-1",
    message_id: overrides.message_id ?? "msg-source-1",
    thread_id: overrides.thread_id ?? "thread-1",
    source_thread_id: overrides.source_thread_id ?? "thread-source-1",
    name: overrides.name ?? "Week 3 Lecture.pdf",
    mime_type: overrides.mime_type ?? "application/pdf",
    size_bytes: overrides.size_bytes ?? 1024,
    storage: overrides.storage ?? {},
    encryption: overrides.encryption ?? {},
    sha256: overrides.sha256 ?? null,
    created_at: overrides.created_at ?? "2026-09-01T00:00:00.000Z",
    source_timestamp: overrides.source_timestamp ?? "2026-09-01T00:00:00.000Z",
    source_type: overrides.source_type ?? "attachment",
    source_kind: overrides.source_kind ?? "parsed_document",
    source_summary: overrides.source_summary ?? null,
    source_metadata: overrides.source_metadata ?? {},
    source_supertags: overrides.source_supertags ?? [],
    download_url: overrides.download_url ?? null,
    derived_message_id: overrides.derived_message_id ?? "msg-derived-1",
    derived_thread_id: overrides.derived_thread_id ?? "thread-derived-1",
    derived_type: overrides.derived_type ?? "parsed_document",
  };
}

test("deriveKnowledgeGraphNavigationIntentFromFile prefers zettelkasten lens and contextual tags", () => {
  const intent = deriveKnowledgeGraphNavigationIntentFromFile(fileItem({
    name: "Seminar reflection.md",
    source_kind: "attachment",
    source_metadata: { knowledge_mode: "zettelkasten" },
    source_supertags: [
      "knowledge_mode:zettelkasten",
      "topic:market-failures",
      "academic:week3",
    ],
  }));

  assert.equal(intent.activeLens, "zettelkasten");
  assert.equal(intent.preferredConnectionStrength, "medium");
  assert.equal(intent.activeTag, "academic:week3");
  assert.equal(intent.academicKind, null);
  assert.equal(intent.courseTag, null);
  assert.equal(intent.weekTag, null);
  assert.equal(intent.lectureTag, null);
  assert.equal(intent.zettelkastenStage, null);
  assert.equal(intent.highlightCardId, "msg-derived-1");
  assert.equal(intent.highlightSourceMessageId, "msg-source-1");
  assert.equal(intent.fileName, "Seminar reflection.md");
  assert.match(intent.notice ?? "", /focused from files/i);
});

test("deriveKnowledgeGraphNavigationIntentFromFile falls back to study materials for parsed academic sources", () => {
  const intent = deriveKnowledgeGraphNavigationIntentFromFile(fileItem({
    source_kind: "parsed_document",
    source_metadata: {
      academic_kind: "lecture_slides",
      academic_course_tag: "course:econ101",
      academic_week_tag: "week:3",
      academic_lecture_tag: "lecture:3",
      zettelkasten_stage: "source_note",
    },
    source_supertags: [
      "pipeline:connected_notes_ingest",
      "resource:study_material",
      "course:econ101",
      "topic:opportunity-cost",
    ],
  }));

  assert.equal(intent.activeLens, "study_materials");
  assert.equal(intent.preferredConnectionStrength, null);
  assert.equal(intent.activeTag, "course:econ101");
  assert.equal(intent.academicKind, "lecture_slides");
  assert.equal(intent.courseTag, "course:econ101");
  assert.equal(intent.weekTag, "week:3");
  assert.equal(intent.lectureTag, "lecture:3");
  assert.equal(intent.zettelkastenStage, "source_note");
});

test("knowledge graph navigation intent is consumed once and stale or invalid records are discarded", () => {
  sessionStorageState.clear();

  const now = Date.now();
  saveKnowledgeGraphNavigationIntent({
    activeLens: "connected_notes",
    preferredConnectionStrength: null,
    activeTag: "topic:biology",
    searchQuery: "",
    academicKind: "lecture_slides",
    courseTag: "course:bio101",
    weekTag: "week:3",
    lectureTag: "lecture:3",
    zettelkastenStage: null,
    highlightCardId: "card-1",
    highlightSourceMessageId: "source-1",
    fileName: "Biology notes.pdf",
    notice: "Focused from Files on the retained source you opened most recently.",
    origin: "files",
    createdAt: now,
  });

  const consumed = consumeKnowledgeGraphNavigationIntent();
  assert.equal(consumed?.activeLens, "connected_notes");
  assert.equal(consumed?.preferredConnectionStrength, null);
  assert.equal(consumed?.activeTag, "topic:biology");
  assert.equal(consumed?.courseTag, "course:bio101");
  assert.equal(consumed?.weekTag, "week:3");
  assert.equal(consumed?.lectureTag, "lecture:3");
  assert.match(consumed?.notice ?? "", /retained source/i);
  assert.equal(sessionStorageState.has(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY), false);
  assert.equal(consumeKnowledgeGraphNavigationIntent(), null);

  sessionStorageState.set(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY, "{bad-json");
  assert.equal(consumeKnowledgeGraphNavigationIntent(), null);
  assert.equal(sessionStorageState.has(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY), false);

  sessionStorageState.set(
    KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY,
    JSON.stringify({
      activeLens: "zettelkasten",
      preferredConnectionStrength: "medium",
      activeTag: "topic:old",
      searchQuery: "",
      academicKind: null,
      courseTag: null,
      weekTag: null,
      lectureTag: null,
      zettelkastenStage: null,
      highlightCardId: "card-old",
      highlightSourceMessageId: "source-old",
      fileName: "Old.pdf",
      notice: "Old focus",
      origin: "files",
      createdAt: now - (6 * 60 * 1000),
    }),
  );
  assert.equal(consumeKnowledgeGraphNavigationIntent(), null);
  assert.equal(sessionStorageState.has(KNOWLEDGE_GRAPH_NAVIGATION_STATE_KEY), false);
});

test("knowledge graph navigation intent preserves the linked ideas lens", () => {
  sessionStorageState.clear();
  const now = Date.now();

  saveKnowledgeGraphNavigationIntent({
    activeLens: "linked_ideas",
    preferredConnectionStrength: "high",
    activeTag: "topic:biology",
    searchQuery: "lecture",
    academicKind: null,
    courseTag: "course:bio101",
    weekTag: "week:3",
    lectureTag: "lecture:3",
    zettelkastenStage: null,
    highlightCardId: "card-2",
    highlightSourceMessageId: "source-2",
    fileName: "Week 3 Lecture.pdf",
    notice: "Focused on the newest retained study pack, with the strongest cross-source links shown first.",
    origin: "files",
    createdAt: now,
  });

  const consumed = consumeKnowledgeGraphNavigationIntent();
  assert.equal(consumed?.activeLens, "linked_ideas");
  assert.equal(consumed?.preferredConnectionStrength, "high");
  assert.equal(consumed?.searchQuery, "lecture");
  assert.equal(consumed?.courseTag, "course:bio101");
  assert.equal(consumed?.lectureTag, "lecture:3");
  assert.match(consumed?.notice ?? "", /strongest cross-source links/i);
});

test("buildKnowledgeGraphIntentFromAttachmentGrounding prefers linked ideas for multi-source study runs", () => {
  const intent = buildKnowledgeGraphIntentFromAttachmentGrounding({
    sourceCount: 2,
    selectedFileCount: 2,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 Lecture.pdf", "Tutorial Reading.pdf"],
    footerLabel: "Based on 2 uploaded sources",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 2 uploaded files",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keep extracted notes only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes",
    policyLabel: "Connected notes + keep extracted notes only",
    policyOutcome: "Only extracted notes remain available for future study sessions.",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [
      {
        title: "Week 3 Lecture.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "lecture_slides",
        academicSummary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
        courseTag: "course:bio101",
        weekTag: "week:3",
        lectureTag: "lecture:3",
        zettelkastenStage: null,
      },
      {
        title: "Tutorial Reading.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "reading",
        academicSummary: "reading · course bio101 · week 3 organized for study retrieval.",
        courseTag: "course:bio101",
        weekTag: "week:3",
        lectureTag: null,
        zettelkastenStage: null,
      },
    ],
  });

  assert.equal(intent?.activeLens, "linked_ideas");
  assert.equal(intent?.preferredConnectionStrength, "high");
  assert.equal(intent?.searchQuery, "course:bio101");
  assert.equal(intent?.activeTag, "course:bio101");
  assert.equal(intent?.courseTag, "course:bio101");
  assert.equal(intent?.weekTag, "week:3");
  assert.equal(intent?.lectureTag, "lecture:3");
  assert.equal(intent?.fileName, "Week 3 Lecture.pdf and 1 more");
  assert.match(intent?.notice ?? "", /strongest cross-source links shown first/i);
});

test("buildKnowledgeGraphIntentFromAttachmentGrounding uses graph metadata when course tags are missing", () => {
  const intent = buildKnowledgeGraphIntentFromAttachmentGrounding({
    sourceCount: 2,
    selectedFileCount: 2,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Research notes.md", "Audio reflection.m4a"],
    footerLabel: "Based on 2 uploaded sources",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 2 uploaded files",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keep extracted notes only",
    knowledgeMode: "zettelkasten",
    knowledgeLabel: "Zettelkasten organization",
    policyLabel: "Zettelkasten + keep extracted notes only",
    policyOutcome: "Only extracted notes remain available for future study sessions.",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [
      {
        title: "Research notes.md",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: null,
        academicSummary: "rough source note",
        courseTag: null,
        weekTag: null,
        lectureTag: null,
        zettelkastenStage: "source_note_review_pending",
        zettelkastenEntryType: "source_note",
        zettelkastenNextAction: "Write one permanent note that challenges the earlier exam strategy note.",
        knowledgeGraphGroupKey: "topic:exam-strategy",
        knowledgeGraphLinkTags: ["topic:exam-strategy", "resource:study_material"],
      },
      {
        title: "Audio reflection.m4a",
        kindLabel: "Uploaded study source - transcript",
        academicKind: null,
        academicSummary: "voice memo source note",
        courseTag: null,
        weekTag: null,
        lectureTag: null,
        zettelkastenStage: "source_note_review_pending",
        zettelkastenEntryType: "source_note",
        zettelkastenNextAction: "Write one permanent note that challenges the earlier exam strategy note.",
        knowledgeGraphGroupKey: "topic:exam-strategy",
        knowledgeGraphLinkTags: ["topic:exam-strategy", "resource:study_material"],
      },
    ],
  });

  assert.equal(intent?.activeLens, "zettelkasten");
  assert.equal(intent?.activeTag, "topic:exam-strategy");
  assert.equal(intent?.searchQuery, "topic:exam-strategy");
  assert.equal(intent?.zettelkastenEntryType, "source_note");
  assert.match(intent?.zettelkastenNextAction ?? "", /permanent note/i);
  assert.equal(intent?.knowledgeGraphGroupKey, "topic:exam-strategy");
  assert.deepEqual(intent?.knowledgeGraphLinkTags, ["topic:exam-strategy", "resource:study_material"]);
});

test("buildKnowledgeGraphIntentFromFileLibraryFocus preserves library study filters", () => {
  const intent = buildKnowledgeGraphIntentFromFileLibraryFocus({
    searchQuery: "market failures",
    activeTag: "topic:market-failures",
    knowledgeMode: "connected_notes",
    academicKind: "lecture_slides",
    courseTag: "course:econ101",
    weekTag: "week:3",
    lectureTag: "lecture:3",
    fallbackItem: fileItem({
      name: "Week 3 Lecture.pdf",
      source_kind: "parsed_document",
      source_metadata: {
        academic_kind: "lecture_slides",
        academic_course_tag: "course:econ101",
        academic_week_tag: "week:3",
        academic_lecture_tag: "lecture:3",
      },
      source_supertags: ["course:econ101", "topic:market-failures"],
    }),
  });

  assert.equal(intent?.activeLens, "connected_notes");
  assert.equal(intent?.preferredConnectionStrength, null);
  assert.equal(intent?.activeTag, "topic:market-failures");
  assert.equal(intent?.searchQuery, "market failures");
  assert.equal(intent?.academicKind, "lecture_slides");
  assert.equal(intent?.courseTag, "course:econ101");
  assert.equal(intent?.weekTag, "week:3");
  assert.equal(intent?.lectureTag, "lecture:3");
  assert.equal(intent?.fileName, "Week 3 Lecture.pdf");
  assert.match(intent?.notice ?? "", /matches the current library view/i);
});

test("buildKnowledgeGraphIntentFromFileLibraryFocus upgrades zettelkasten-oriented library focus", () => {
  const intent = buildKnowledgeGraphIntentFromFileLibraryFocus({
    knowledgeMode: "all",
    zettelkastenStage: "review_pending",
    activeTag: "topic:memory",
  });

  assert.equal(intent?.activeLens, "zettelkasten");
  assert.equal(intent?.preferredConnectionStrength, "medium");
  assert.equal(intent?.zettelkastenStage, "review_pending");
  assert.equal(intent?.activeTag, "topic:memory");
});
