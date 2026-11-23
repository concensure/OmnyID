import assert from "node:assert/strict";
import test from "node:test";

import type { FileLibraryItem } from "../src/lib/api.ts";
import type { KnowledgeCard } from "../src/lib/knowledgeGraphTypes.ts";
import {
  summarizeFileStudyPack,
  summarizeKnowledgeGraphStudyPack,
} from "../src/lib/studyPackFocusState.ts";

function fileItem(overrides: Partial<FileLibraryItem> = {}): FileLibraryItem {
  return {
    id: overrides.id ?? "file-1",
    message_id: overrides.message_id ?? "msg-1",
    thread_id: overrides.thread_id ?? "thread-1",
    source_thread_id: overrides.source_thread_id ?? "thread-1",
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
    source_supertags: overrides.source_supertags ?? ["course:bio101", "week:3"],
    download_url: overrides.download_url ?? null,
    derived_message_id: overrides.derived_message_id ?? "msg-derived-1",
    derived_thread_id: overrides.derived_thread_id ?? "thread-derived-1",
    derived_type: overrides.derived_type ?? "parsed_document",
  };
}

function card(overrides: Partial<KnowledgeCard> = {}): KnowledgeCard {
  return {
    id: overrides.id ?? "card-1",
    title: overrides.title ?? "Opportunity cost",
    summary: overrides.summary ?? "A retained study note.",
    timestamp: overrides.timestamp ?? "2026-09-01T00:00:00.000Z",
    type: overrides.type ?? "knowledge_card",
    sourceThreadId: overrides.sourceThreadId ?? "thread-1",
    sourceMessageId: overrides.sourceMessageId ?? "msg-1",
    sourceKind: overrides.sourceKind ?? "parsed_document",
    sourceTitle: overrides.sourceTitle ?? "Week 3 Lecture.pdf",
    sourceFileName: overrides.sourceFileName ?? "Week 3 Lecture.pdf",
    sourceFileId: overrides.sourceFileId ?? "file-1",
    academicKind: overrides.academicKind ?? "lecture_slides",
    academicCourseTag: overrides.academicCourseTag ?? "course:bio101",
    academicWeekTag: overrides.academicWeekTag ?? "week:3",
    academicLectureTag: overrides.academicLectureTag ?? "lecture:3",
    academicChapterTag: overrides.academicChapterTag ?? null,
    academicUnitTag: overrides.academicUnitTag ?? null,
    academicSummary: overrides.academicSummary ?? "lecture slides for week 3",
    retentionLabel: overrides.retentionLabel ?? "Keep extracted notes only",
    storageSummary: overrides.storageSummary ?? "Retained as extracted notes",
    provenanceSummary: overrides.provenanceSummary ?? "Grounded to uploaded study material",
    knowledgeMode: overrides.knowledgeMode ?? "connected_notes",
    supertags: overrides.supertags ?? ["course:bio101", "week:3"],
    backlinks: overrides.backlinks ?? [],
    relatedCardCount: overrides.relatedCardCount ?? 2,
    referenceTargetIds: overrides.referenceTargetIds ?? [],
    reviewPending: overrides.reviewPending ?? false,
    permanentNote: overrides.permanentNote ?? false,
    sourceNote: overrides.sourceNote ?? false,
    connectionStrength: overrides.connectionStrength ?? "high",
    connectionReasons: overrides.connectionReasons ?? ["Shared course and week context."],
    zettelkastenStage: overrides.zettelkastenStage ?? null,
  };
}

test("summarizeFileStudyPack describes a focused retained study pack", () => {
  const summary = summarizeFileStudyPack([
    fileItem({
      source_metadata: {
        knowledge_mode: "connected_notes",
        academic_kind: "lecture_slides",
        academic_course_tag: "course:bio101",
        academic_week_tag: "week:3",
        academic_lecture_tag: "lecture:3",
      },
      source_supertags: ["course:bio101", "week:3", "resource:study_material", "topic:cells"],
    }),
    fileItem({
      id: "file-2",
      name: "Tutorial Reading.pdf",
      source_metadata: {
        knowledge_mode: "connected_notes",
        academic_kind: "reading",
        academic_course_tag: "course:bio101",
        academic_week_tag: "week:3",
      },
      source_supertags: ["course:bio101", "week:3", "resource:study_material", "topic:cells"],
    }),
  ]);

  assert.ok(summary);
  assert.match(summary!.headline, /study pack/i);
  assert.equal(summary!.contextLabel, "course:bio101 · week:3 · lecture:3");
  assert.equal(summary!.stats[0]?.value, "2");
});

test("summarizeFileStudyPack uses chapter and unit metadata as study scope", () => {
  const summary = summarizeFileStudyPack([
    fileItem({
      source_kind: "note",
      source_metadata: {
        academic_course_tag: "course:bio101",
        academic_unit_tag: "unit:2",
        academic_chapter_tag: "chapter:4",
      },
      source_supertags: ["chapter:4"],
    }),
  ]);

  assert.ok(summary);
  assert.equal(summary!.contextLabel, "course:bio101 / unit:2 / chapter:4");
});

test("summarizeKnowledgeGraphStudyPack describes focused graph continuity", () => {
  const summary = summarizeKnowledgeGraphStudyPack([
    card(),
    card({
      id: "card-2",
      title: "Decision fatigue",
      academicLectureTag: null,
      connectionStrength: "medium",
      knowledgeMode: "zettelkasten",
      zettelkastenStage: "source_note",
    }),
  ]);

  assert.ok(summary);
  assert.match(summary!.headline, /study graph/i);
  assert.equal(summary!.contextLabel, "course:bio101 · week:3 · lecture:3");
  assert.equal(summary!.stats[1]?.label, "Strong links");
});

test("summarizeKnowledgeGraphStudyPack uses chapter and unit graph metadata as study scope", () => {
  const summary = summarizeKnowledgeGraphStudyPack([
    card({
      academicWeekTag: null,
      academicLectureTag: null,
      academicChapterTag: "chapter:7",
      academicUnitTag: "unit:3",
    }),
  ]);

  assert.ok(summary);
  assert.equal(summary!.contextLabel, "course:bio101 / unit:3 / chapter:7");
});
