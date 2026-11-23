import assert from "node:assert/strict";
import test from "node:test";

import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import {
  buildStudyLensConnectedAppsAction,
  buildStudyLensFileAction,
  buildStudyLensGraphAction,
  buildStudyLensMedicalClozeAction,
  buildStudyLensReportAction,
} from "../src/lib/studyLensDashboardActionState.ts";

function course(overrides: Partial<StudyCourse> = {}): StudyCourse {
  return {
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    institutionLabel: null,
    source: "manual",
    createdAt: 1,
    ...overrides,
  };
}

test("buildStudyLensReportAction keeps generic report actions lightweight without course context", () => {
  assert.deepEqual(buildStudyLensReportAction("Start quiz", "quiz_generator", null), {
    label: "Start quiz",
    reportKind: "quiz_generator",
    view: "reports",
  });
});

test("buildStudyLensReportAction carries course context when available", () => {
  const action = buildStudyLensReportAction("Plan course", "course_builder", course());

  assert.equal(action.label, "Plan course");
  assert.equal(action.view, "reports");
  assert.equal(action.reportKind, undefined);
  assert.equal(action.reportIntent?.preferredKind, "course_builder");
  assert.equal(action.reportIntent?.courseTag, "course:bio101");
  assert.equal(action.reportIntent?.activeTag, "course:bio101");
});

test("source and graph actions degrade cleanly without course context", () => {
  assert.deepEqual(buildStudyLensFileAction("Open Files", null), {
    label: "Open Files",
    view: "files",
  });
  assert.deepEqual(buildStudyLensGraphAction("Show graph", null), {
    label: "Show graph",
    view: "knowledge_graph",
  });
});

test("source, graph, and connected-app actions expose concrete destination state", () => {
  const activeCourse = course();
  const fileAction = buildStudyLensFileAction("Open Files", activeCourse);
  const graphAction = buildStudyLensGraphAction("Show graph", activeCourse);
  const connectedAppsAction = buildStudyLensConnectedAppsAction("Open Connected Apps");

  assert.equal(fileAction.view, "files");
  assert.equal(fileAction.fileLibraryIntent?.courseTag, "course:bio101");
  assert.equal(graphAction.view, "knowledge_graph");
  assert.equal(graphAction.knowledgeGraphIntent?.courseTag, "course:bio101");
  assert.deepEqual(connectedAppsAction, {
    label: "Open Connected Apps",
    view: "connected_apps",
  });
});

test("buildStudyLensMedicalClozeAction carries topology coverage scope into Reports", () => {
  const action = buildStudyLensMedicalClozeAction("Make cloze/vignette cards for gaps", course(), {
    scopeLabel: "course:bio101 - system:cardiovascular - unit:cardiology - chapter:heart-failure",
    courseTag: "course:bio101",
    systemTag: "system:cardiovascular",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    conceptTags: ["pharm", "management"],
    readinessLabel: "Source only",
    nextAction: "Make cited cloze/vignette cards",
  });

  assert.equal(action.view, "reports");
  assert.equal(action.reportIntent?.preferredKind, "flashcard_deck");
  assert.equal(action.reportIntent?.academicKind, "medical_cloze_vignette");
  assert.equal(action.reportIntent?.courseTag, "course:bio101");
  assert.equal(action.reportIntent?.unitTag, "unit:cardiology");
  assert.equal(action.reportIntent?.chapterTag, "chapter:heart-failure");
  assert.match(action.reportIntent?.searchQuery ?? "", /medical topology coverage/i);
  assert.match(action.reportIntent?.searchQuery ?? "", /system:cardiovascular/i);
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("medical_topology_coverage"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("medical_trusted_grounding"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("trusted_reference:student_source_primary"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("detail_zoom:course_level"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("readiness:Source only"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("topology_gap:source_only"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("pharm"));
  assert.match(action.reportIntent?.zettelkastenNextAction ?? "", /Use medical topology coverage/i);
  assert.match(action.reportIntent?.zettelkastenNextAction ?? "", /Preserve source locators/i);
  assert.match(action.reportIntent?.zettelkastenNextAction ?? "", /medical trusted-grounding/i);
  assert.match(action.reportIntent?.zettelkastenNextAction ?? "", /do not invent external citations/i);
});

test("buildStudyLensMedicalClozeAction routes topology overload and practice states to practice questions", () => {
  const action = buildStudyLensMedicalClozeAction("Reduce review load", course(), {
    scopeLabel: "course:bio101 - system:cardiovascular",
    courseTag: "course:bio101",
    systemTag: "system:cardiovascular",
    unitTag: null,
    chapterTag: null,
    conceptTags: ["pathophys"],
    readinessLabel: "Review overload",
    nextAction: "Reduce shallow or duplicate card load",
  });

  assert.equal(action.reportIntent?.preferredKind, "practice_questions");
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("readiness:Review overload"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("topology_gap:overload"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("quality_action:reduce_review_load"));
});

test("buildStudyLensMedicalClozeAction marks attempt and timed-block topology handoffs", () => {
  const attemptEvidence = buildStudyLensMedicalClozeAction("Generate weak-edge variations", course(), {
    scopeLabel: "course:bio101 - system:cardiovascular",
    courseTag: "course:bio101",
    systemTag: "system:cardiovascular",
    unitTag: null,
    chapterTag: null,
    conceptTags: ["pathophys"],
    readinessLabel: "Attempt evidence",
    nextAction: "Generate weak-edge variations",
  });
  const timedBlock = buildStudyLensMedicalClozeAction("Run timed vignette block", course(), {
    scopeLabel: "course:bio101 - system:cardiovascular",
    courseTag: "course:bio101",
    systemTag: "system:cardiovascular",
    unitTag: null,
    chapterTag: null,
    conceptTags: ["pathophys"],
    readinessLabel: "Ready for timed block",
    nextAction: "Run timed vignette block",
  });

  assert.equal(attemptEvidence.reportIntent?.preferredKind, "practice_questions");
  assert.ok(attemptEvidence.reportIntent?.knowledgeGraphLinkTags.includes("topology_practice_ready"));
  assert.equal(timedBlock.reportIntent?.preferredKind, "practice_questions");
  assert.ok(timedBlock.reportIntent?.knowledgeGraphLinkTags.includes("topology_timed_block"));
  assert.ok(timedBlock.reportIntent?.knowledgeGraphLinkTags.includes("medical_vignette_block"));
});

test("buildStudyLensMedicalClozeAction gives generic medical cloze launches trusted grounding", () => {
  const action = buildStudyLensMedicalClozeAction("Build medical cloze deck", course({
    name: "Medicine 1",
    courseTag: "course:med101",
  }));

  assert.equal(action.reportIntent?.preferredKind, "flashcard_deck");
  assert.equal(action.reportIntent?.academicKind, "medical_cloze_vignette");
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("medical_cloze_vignette"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("medical_trusted_grounding"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("trusted_reference:student_source_primary"));
  assert.ok(action.reportIntent?.knowledgeGraphLinkTags.includes("detail_zoom:course_level"));
  assert.match(action.reportIntent?.zettelkastenNextAction ?? "", /retained student uploads/i);
  assert.match(action.reportIntent?.zettelkastenNextAction ?? "", /course level/i);
  assert.match(action.reportIntent?.zettelkastenNextAction ?? "", /LLM internal knowledge/i);
});
