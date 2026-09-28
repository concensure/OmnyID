import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudySearchContinuationSeed,
  consumeStudySearchContinuationSeed,
  saveStudySearchContinuationSeed,
} from "../src/lib/studySearchContinuationState.ts";
import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";
import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";

function buildEvidence(
  overrides: Partial<AttachmentGroundingEvidence> = {},
): AttachmentGroundingEvidence {
  return {
    sourceCount: 2,
    selectedFileCount: 2,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 Slides.pdf", "Week 3 Reading.pdf"],
    footerLabel: "Based on 2 uploaded sources",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 2 uploaded files",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keeps extracted notes only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes organization",
    policyLabel: "Keeps extracted notes only - Connected notes organization",
    policyOutcome: "Only extracted notes remain available for future study sessions.",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [
      {
        title: "Week 3 Slides.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "lecture_slides",
        academicSummary: "Week 3 slides",
        courseTag: "course:econ101",
        weekTag: "week:3",
        lectureTag: "lecture:3",
        zettelkastenStage: null,
        knowledgeGraphGroupKey: "course:econ101",
        knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market-failures"],
      },
      {
        title: "Week 3 Reading.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "lecture_slides",
        academicSummary: "Week 3 reading",
        courseTag: "course:econ101",
        weekTag: "week:3",
        lectureTag: "lecture:3",
        zettelkastenStage: null,
        knowledgeGraphGroupKey: "course:econ101",
        knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market-failures"],
      },
    ],
    ...overrides,
  };
}

test("buildStudySearchContinuationSeed creates linked-source follow-up for connected notes", () => {
  const seed = buildStudySearchContinuationSeed({
    evidence: buildEvidence(),
    query: "market failures",
    sections: [
      { id: "concepts", title: "Main concepts", items: ["Opportunity cost frames trade-offs across the lecture and reading."] },
      { id: "risks", title: "Exam risk and gaps", items: ["Students may confuse externalities with public goods in short answers."] },
      { id: "actions", title: "Next revision actions", items: ["Practice one short-answer comparison on market failure and incentives."] },
    ],
  });

  assert.equal(seed?.knowledgeMode, "connected_notes");
  assert.equal(seed?.originLabel, "From grounded result");
  assert.match(seed?.query ?? "", /compare the main concepts/i);
  assert.match(seed?.query ?? "", /market failures/i);
  assert.match(seed?.query ?? "", /Opportunity cost frames trade-offs/i);
  assert.match(seed?.query ?? "", /confuse externalities with public goods/i);
  assert.match(seed?.query ?? "", /Practice one short-answer comparison/i);
  assert.match(seed?.query ?? "", /graph anchor: course:econ101/i);
  assert.match(seed?.query ?? "", /supertag links/i);
  assert.ok(seed?.focusBadges?.includes("course:econ101"));
  assert.ok(seed?.focusBadges?.includes("week:3"));
  assert.ok(seed?.focusBadges?.includes("topic:market-failures"));
  assert.match(seed?.recommendedUpload ?? "", /course:econ101/i);
  assert.match(seed?.helper ?? "", /course:econ101/i);
});

test("buildStudySearchContinuationSeed upgrades keep-nothing results into retention-ready reruns", () => {
  const seed = buildStudySearchContinuationSeed({
    evidence: buildEvidence({
      retentionMode: "keep_nothing",
      cleanupStatus: "pending",
      cleanupLabel: "Temporary cleanup pending",
    }),
  });

  assert.equal(seed?.retentionMode, "keep_extracted_only");
  assert.equal(seed?.label, "Rerun this with memory");
  assert.match(seed?.helper ?? "", /Keep extracted notes on/i);
  assert.match(seed?.recommendedUpload ?? "", /rerun with kept extracted notes/i);
});

test("buildStudySearchContinuationSeed preserves zettelkasten development prompts", () => {
  const seed = buildStudySearchContinuationSeed({
    evidence: buildEvidence({
      knowledgeMode: "zettelkasten",
      sourceDescriptors: [
        {
          title: "Phil 201 source note",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "reading_notes",
          academicSummary: "Source note",
          courseTag: "course:phil201",
          weekTag: null,
          lectureTag: null,
          zettelkastenStage: "review_pending",
          zettelkastenEntryType: "source_note",
          zettelkastenNextAction: "Promote the strongest contrast into a permanent note.",
          knowledgeGraphGroupKey: "course:phil201",
          knowledgeGraphLinkTags: ["course:phil201", "topic:duty-vs-utility"],
        },
      ],
      sourceCount: 1,
      sourceLabels: ["Phil 201 source note"],
    }),
    sections: [
      { id: "concepts", title: "Main concepts", items: ["The source note argues that duty and utility diverge in this case."] },
      { id: "actions", title: "Next revision actions", items: ["Promote the strongest contrast into a permanent note."] },
    ],
  });

  assert.equal(seed?.knowledgeMode, "zettelkasten");
  assert.match(seed?.query ?? "", /permanent notes/i);
  assert.match(seed?.query ?? "", /review pending/i);
  assert.match(seed?.query ?? "", /duty and utility diverge/i);
  assert.match(seed?.query ?? "", /Promote the strongest contrast/i);
  assert.match(seed?.query ?? "", /topic:duty-vs-utility/i);
  assert.ok(seed?.focusBadges?.includes("stage review pending"));
  assert.ok(seed?.focusBadges?.includes("course:phil201"));
});

test("buildStudySearchContinuationSeed preserves report metadata after a report run", () => {
  const reportSeed = buildReportQuickStartSeed({
    kind: "assignment_plan",
    goal: "Plan my essay around the marking criteria.",
    messages: [],
  });
  const seed = buildStudySearchContinuationSeed({
    evidence: buildEvidence({
      sourceCount: 2,
      sourceLabels: ["Assignment Brief.pdf", "Rubric.pdf"],
      sourceDescriptors: [
        {
          ...buildEvidence().sourceDescriptors[0],
          title: "Assignment Brief.pdf",
          academicKind: "assignment_brief",
          knowledgeGraphGroupKey: "topic:essay",
          knowledgeGraphLinkTags: ["course:eng101", "topic:essay"],
        },
        {
          title: "Rubric.pdf",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "rubric",
          academicSummary: "Marking criteria.",
          courseTag: "course:eng101",
          weekTag: null,
          lectureTag: null,
          zettelkastenStage: null,
          knowledgeGraphGroupKey: "topic:essay",
          knowledgeGraphLinkTags: ["course:eng101", "topic:essay"],
        },
      ],
    }),
    query: reportSeed.query,
  });

  assert.ok(seed?.focusBadges?.includes("report_kind:assignment_plan"));
  assert.ok(seed?.focusBadges?.includes("source_need:assignment brief"));
  assert.ok(seed?.focusBadges?.includes("source_need:rubric or marking criteria"));
  assert.equal(seed?.label, "Continue this assignment plan report");
  assert.match(seed?.description ?? "", /same retained sources/i);
  assert.match(seed?.valuePromise ?? "", /same report/i);
  assert.match(seed?.query ?? "", /assignment execution report/i);
});

test("buildStudySearchContinuationSeed labels keep-nothing report reruns clearly", () => {
  const reportSeed = buildReportQuickStartSeed({
    kind: "exam_preparation",
    goal: "Prepare for my biology exam.",
    messages: [],
  });
  const seed = buildStudySearchContinuationSeed({
    evidence: buildEvidence({
      retentionMode: "keep_nothing",
      cleanupStatus: "pending",
      cleanupLabel: "Temporary cleanup pending",
    }),
    query: reportSeed.query,
  });

  assert.equal(seed?.label, "Rerun this exam preparation report with memory");
  assert.ok(seed?.focusBadges?.includes("report_kind:exam_preparation"));
  assert.ok(seed?.focusBadges?.includes("source_need:lecture or tutorial notes"));
  assert.match(seed?.valuePromise ?? "", /exam preparation report/i);
});

test("buildStudySearchContinuationSeed preserves reusable report output format after a report run", () => {
  const seed = buildStudySearchContinuationSeed({
    evidence: buildEvidence({
      sourceCount: 1,
      sourceLabels: ["Biology Terms.pdf"],
    }),
    query: "Create a flashcard deck report. Requested output format: CSV flashcards. Include front, back, source, difficulty, and tag columns.",
  });

  assert.ok(seed?.focusBadges?.includes("report_kind:flashcard_deck"));
  assert.ok(seed?.focusBadges?.includes("output_format:csv_flashcards"));
  assert.equal(seed?.label, "Continue this flashcard deck report");
});

test("consumeStudySearchContinuationSeed clears pending state after one read", () => {
  saveStudySearchContinuationSeed({
    label: "Continue this note chain",
    description: "Continue from the last result",
    query: "Use my retained study notes and continue the thread.",
    notice: "Continuation prompt loaded.",
    helper: "Press Enter.",
    valuePromise: "Continue the same grounded thread.",
    recommendedUpload: "Best with one more note.",
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    checklist: ["Keep extracted notes on."],
    nextSteps: ["Open the graph."],
  });

  assert.deepEqual(consumeStudySearchContinuationSeed(), {
    label: "Continue this note chain",
    description: "Continue from the last result",
    query: "Use my retained study notes and continue the thread.",
    notice: "Continuation prompt loaded.",
    helper: "Press Enter.",
    valuePromise: "Continue the same grounded thread.",
    recommendedUpload: "Best with one more note.",
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    checklist: ["Keep extracted notes on."],
    nextSteps: ["Open the graph."],
  });
  assert.equal(consumeStudySearchContinuationSeed(), null);
});
