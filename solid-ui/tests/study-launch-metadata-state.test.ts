import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  academicKindFromStudyLaunchMetadata,
  chapterTagFromStudyLaunchMetadata,
  courseTagFromStudyLaunchMetadata,
  deadlineIdFromStudyLaunchMetadata,
  dueLabelFromStudyLaunchMetadata,
  moduleLabelFromStudyLaunchMetadata,
  providerIdFromStudyLaunchMetadata,
  decoratePreviewMessageWithStudyLaunchMetadata,
  normalizeStudyLaunchMetadata,
  routeSourceFromStudyLaunchMetadata,
  sessionIdFromStudyLaunchMetadata,
  studyAcademicScopeFromStudyLaunchMetadata,
  studyLaunchMetadataFromQuickStartSeed,
  studyLaunchMetadataFromMessageMetadata,
  unitTagFromStudyLaunchMetadata,
} from "../src/lib/studyLaunchMetadataState.ts";

function message(): AfpMessage {
  return {
    id: "preview",
    thread_id: "thread",
    from: "assistant",
    timestamp: "2026-09-09T00:00:00.000Z",
    type: "message",
    content: {},
    views: [],
    attachments: [],
  };
}

test("normalizeStudyLaunchMetadata trims and dedupes launch fields", () => {
  const metadata = normalizeStudyLaunchMetadata({
    originLabel: " From Reports ",
    entryPoint: " search_result ",
    flowKind: " grounded_followup ",
    focusBadges: [" course:econ101 ", "course:econ101", "", "academic_kind:study_course"],
  });

  assert.equal(metadata.originLabel, "From Reports");
  assert.equal(metadata.entryPoint, "search_result");
  assert.equal(metadata.flowKind, "grounded_followup");
  assert.deepEqual(metadata.focusBadges, ["course:econ101", "academic_kind:study_course"]);
});

test("decoratePreviewMessageWithStudyLaunchMetadata writes local preview metadata", () => {
  const decorated = decoratePreviewMessageWithStudyLaunchMetadata(message(), {
    originLabel: "From saved report",
    entryPoint: "workspace",
    flowKind: "grounded_followup",
    focusBadges: ["course_tag:course:bio101", "session:guided-1"],
  });

  assert.equal(decorated.metadata?.study_launch_origin_label, "From saved report");
  assert.equal(decorated.metadata?.study_launch_entry_point, "workspace");
  assert.equal(decorated.metadata?.study_launch_flow_kind, "grounded_followup");
  assert.deepEqual(decorated.metadata?.study_launch_focus_badges, ["course_tag:course:bio101", "session:guided-1"]);
});

test("studyLaunchMetadataFromQuickStartSeed builds submit-safe launch metadata", () => {
  const metadata = studyLaunchMetadataFromQuickStartSeed({
    label: "Quick quiz",
    description: "Generate a short quiz",
    query: "Quiz me on this course",
    notice: "Loaded",
    helper: "Send to start",
    valuePromise: "Practice recall",
    recommendedUpload: "One lecture",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [],
    nextSteps: [],
    originLabel: " From Study Lens ",
    entryPoint: "workspace",
    flowKind: "grounded_followup",
    focusBadges: [" course_tag:course:bio101 ", "course_tag:course:bio101", "session:guided-1"],
  });

  assert.deepEqual(metadata, {
    originLabel: "From Study Lens",
    entryPoint: "workspace",
    flowKind: "grounded_followup",
    focusBadges: ["course_tag:course:bio101", "session:guided-1"],
  });
});

test("studyLaunchMetadataFromQuickStartSeed omits empty metadata", () => {
  const metadata = studyLaunchMetadataFromQuickStartSeed({
    label: "Plain",
    description: "No metadata",
    query: "Summarize",
    notice: "Loaded",
    helper: "Send to start",
    valuePromise: "Output",
    recommendedUpload: "One source",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [],
    nextSteps: [],
  });

  assert.equal(metadata, undefined);
});

test("study launch metadata can be read back from preview metadata", () => {
  const parsed = studyLaunchMetadataFromMessageMetadata({
    study_launch_origin_label: "From grounded result",
    study_launch_entry_point: "search_result",
    study_launch_flow_kind: "grounded_followup",
    study_launch_focus_badges: ["route_source:study_lens", "session:guided-1"],
  });

  assert.equal(parsed.originLabel, "From grounded result");
  assert.equal(parsed.entryPoint, "search_result");
  assert.equal(parsed.flowKind, "grounded_followup");
  assert.deepEqual(parsed.focusBadges, ["route_source:study_lens", "session:guided-1"]);
});

test("study launch metadata extracts course, academic, session, and route identity", () => {
  const metadata = normalizeStudyLaunchMetadata({
    originLabel: "From Reports",
    focusBadges: [
      "course:econ101",
      "chapter:4",
      "unit:market-failures",
      "module:Module 2",
      "due:2026-10-03T22:00:00.000Z",
      "deadline:deadline-42",
      "provider:gcal",
      "academic_kind:study_course",
      "session:guided-1",
      "route_source:study_lens",
    ],
  });

  assert.equal(courseTagFromStudyLaunchMetadata(metadata), "course:econ101");
  assert.equal(chapterTagFromStudyLaunchMetadata(metadata), "chapter:4");
  assert.equal(unitTagFromStudyLaunchMetadata(metadata), "unit:market-failures");
  assert.equal(moduleLabelFromStudyLaunchMetadata(metadata), "Module 2");
  assert.equal(dueLabelFromStudyLaunchMetadata(metadata), "2026-10-03T22:00:00.000Z");
  assert.equal(deadlineIdFromStudyLaunchMetadata(metadata), "deadline-42");
  assert.equal(providerIdFromStudyLaunchMetadata(metadata), "gcal");
  assert.equal(academicKindFromStudyLaunchMetadata(metadata), "study_course");
  assert.equal(sessionIdFromStudyLaunchMetadata(metadata), "guided-1");
  assert.equal(routeSourceFromStudyLaunchMetadata(metadata), "study_lens");
  assert.deepEqual(studyAcademicScopeFromStudyLaunchMetadata(metadata), {
    courseTag: "course:econ101",
    chapterTag: "chapter:4",
    unitTag: "unit:market-failures",
    moduleLabel: "Module 2",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "deadline-42",
    providerId: "gcal",
    academicKind: "study_course",
    sessionId: "guided-1",
    routeSource: "study_lens",
  });
});

test("study launch route source falls back to entry point and origin label", () => {
  assert.equal(routeSourceFromStudyLaunchMetadata(normalizeStudyLaunchMetadata({
    entryPoint: "knowledge_graph",
  })), "knowledge_graph");
  assert.equal(routeSourceFromStudyLaunchMetadata(normalizeStudyLaunchMetadata({
    originLabel: "From saved report",
  })), "saved_report");
});

test("study launch route source ignores human source labels", () => {
  const metadata = normalizeStudyLaunchMetadata({
    focusBadges: ["source:Week 3 slides.pdf"],
  });

  assert.equal(routeSourceFromStudyLaunchMetadata(metadata), null);
});

test("study launch route source accepts known source route badges", () => {
  const metadata = normalizeStudyLaunchMetadata({
    focusBadges: ["source:Knowledge Graph"],
  });

  assert.equal(routeSourceFromStudyLaunchMetadata(metadata), "knowledge_graph");

  const objectSearch = normalizeStudyLaunchMetadata({
    focusBadges: ["source:object_search"],
  });

  assert.equal(routeSourceFromStudyLaunchMetadata(objectSearch), "object_search");
});

test("study launch metadata parses badge prefixes case-insensitively", () => {
  const metadata = normalizeStudyLaunchMetadata({
    focusBadges: [
      "COURSE_TAG:course:law101",
      "CHAPTER_TAG:chapter:3",
      "UNIT_TAG:unit:contract-law",
      "ACADEMIC_KIND:study_course",
      "SESSION:guided-2",
      "ROUTE_SOURCE:Study Lens",
    ],
  });

  assert.equal(courseTagFromStudyLaunchMetadata(metadata), "course:law101");
  assert.equal(chapterTagFromStudyLaunchMetadata(metadata), "chapter:3");
  assert.equal(unitTagFromStudyLaunchMetadata(metadata), "unit:contract-law");
  assert.equal(academicKindFromStudyLaunchMetadata(metadata), "study_course");
  assert.equal(sessionIdFromStudyLaunchMetadata(metadata), "guided-2");
  assert.equal(routeSourceFromStudyLaunchMetadata(metadata), "study_lens");
});

test("study launch route source ignores unknown explicit route badges", () => {
  const metadata = normalizeStudyLaunchMetadata({
    focusBadges: ["route_source:Week 3 slides.pdf"],
  });

  assert.equal(routeSourceFromStudyLaunchMetadata(metadata), null);
});
