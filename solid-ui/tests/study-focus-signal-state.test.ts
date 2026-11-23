import assert from "node:assert/strict";
import test from "node:test";

import type { FileLibraryItem } from "../src/lib/api.ts";
import type { KnowledgeCard } from "../src/lib/knowledgeGraphTypes.ts";
import {
  buildFileStudyFocusSignals,
  buildKnowledgeGraphStudyFocusSignals,
} from "../src/lib/studyFocusSignalState.ts";

function fileItem(overrides: Partial<FileLibraryItem> = {}): FileLibraryItem {
  return {
    id: overrides.id ?? "file-1",
    message_id: overrides.message_id ?? "msg-1",
    thread_id: overrides.thread_id ?? "thread-1",
    source_thread_id: overrides.source_thread_id ?? "thread-1",
    name: overrides.name ?? "Week 4 Lecture.pdf",
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
    source_supertags: overrides.source_supertags ?? ["course:bio101", "week:4", "topic:cell respiration"],
    download_url: overrides.download_url ?? null,
    derived_message_id: overrides.derived_message_id ?? "msg-derived-1",
    derived_thread_id: overrides.derived_thread_id ?? "thread-derived-1",
    derived_type: overrides.derived_type ?? "parsed_document",
  };
}

function card(overrides: Partial<KnowledgeCard> = {}): KnowledgeCard {
  return {
    id: overrides.id ?? "card-1",
    title: overrides.title ?? "Cellular respiration",
    summary: overrides.summary ?? "A retained study note.",
    supertags: overrides.supertags ?? ["course:bio101", "week:4", "concept:atp"],
    knowledgeMode: overrides.knowledgeMode ?? "connected_notes",
    sourceKind: overrides.sourceKind ?? "parsed_document",
    sourceMessageId: overrides.sourceMessageId ?? "msg-1",
    sourceTitle: overrides.sourceTitle ?? "Week 4 Lecture",
    sourceFileName: overrides.sourceFileName ?? "week4.pdf",
    academicKind: overrides.academicKind ?? "lecture_slides",
    academicCourseTag: overrides.academicCourseTag ?? "course:bio101",
    academicWeekTag: overrides.academicWeekTag ?? "week:4",
    academicLectureTag: overrides.academicLectureTag ?? "lecture:4",
    academicSummary: overrides.academicSummary ?? "Lecture summary for week 4.",
    retentionMode: overrides.retentionMode ?? "keep_extracted_only",
    retentionLabel: overrides.retentionLabel ?? "Keep extracted content only",
    reviewPending: overrides.reviewPending ?? false,
    sourceNote: overrides.sourceNote ?? false,
    permanentNote: overrides.permanentNote ?? false,
    backlinks: overrides.backlinks ?? [],
    timestamp: overrides.timestamp ?? "2026-09-01T00:00:00.000Z",
    sourceThreadId: overrides.sourceThreadId ?? "thread-1",
    referenceTargetIds: overrides.referenceTargetIds ?? [],
    relatedCardCount: overrides.relatedCardCount ?? 1,
    connectionStrength: overrides.connectionStrength ?? "medium",
    connectionReasons: overrides.connectionReasons ?? ["Shared ATP concept across lecture and tutorial notes."],
    zettelkastenStage: overrides.zettelkastenStage ?? null,
    policyOutcome: overrides.policyOutcome ?? null,
    storageSummary: overrides.storageSummary ?? null,
    provenanceSummary: overrides.provenanceSummary ?? null,
    canonicalSupertags: overrides.canonicalSupertags,
  };
}

test("buildFileStudyFocusSignals extracts focus, risk, and next step from retained study files", () => {
  const signals = buildFileStudyFocusSignals([
    fileItem({
      source_summary:
        "Key concept: cellular respiration explains how glucose becomes ATP. Review the contrast with photosynthesis before the exam.",
      source_metadata: {
        knowledge_mode: "connected_notes",
        academic_summary: "Practice short-answer comparisons after reviewing the lecture.",
        academic_kind: "lecture_slides",
      },
    }),
    fileItem({
      id: "file-2",
      name: "Tutorial note.md",
      source_summary:
        "This note is useful, but the difference between glycolysis and the Krebs cycle is still unclear.",
      source_metadata: {
        knowledge_mode: "connected_notes",
        academic_summary: "Turn the strongest overlap into a revision card.",
        academic_kind: "study_notes",
      },
      source_supertags: ["course:bio101", "week:4", "concept:atp"],
    }),
  ]);

  assert.ok(signals);
  assert.match(signals!.focus.value, /cellular respiration|key concept/i);
  assert.match(signals!.weakSpot.value, /contrast|unclear|difference|exam/i);
  assert.match(signals!.nextStep.value, /review|practice|turn/i);
});

test("buildKnowledgeGraphStudyFocusSignals uses graph summaries and link reasons", () => {
  const signals = buildKnowledgeGraphStudyFocusSignals([
    card({
      summary:
        "Core concept: ATP production links glycolysis, Krebs cycle, and electron transport. Compare how each stage contributes to energy yield.",
      academicSummary: "Review how the stages fit together before moving to exceptions.",
      connectionReasons: [
        "Shared ATP concept across lecture and reading.",
        "The weak spot is that exam answers often confuse stage order.",
      ],
      connectionStrength: "high",
    }),
  ]);

  assert.ok(signals);
  assert.match(signals!.focus.value, /ATP|core concept/i);
  assert.match(signals!.weakSpot.value, /weak spot|confuse|exam/i);
  assert.match(signals!.nextStep.value, /compare|review/i);
});

test("buildFileStudyFocusSignals falls back to supertags when summaries are thin", () => {
  const signals = buildFileStudyFocusSignals([
    fileItem({
      source_summary: null,
      source_metadata: {
        knowledge_mode: "zettelkasten",
      },
      source_supertags: ["course:law101", "topic:contract law", "week:2"],
    }),
  ]);

  assert.ok(signals);
  assert.match(signals!.focus.value, /contract law|week 2|law101/i);
  assert.match(signals!.nextStep.value, /permanent-note candidate|link/i);
});
