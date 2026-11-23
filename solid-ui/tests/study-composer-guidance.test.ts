import test from "node:test";
import assert from "node:assert/strict";

import { buildStudyComposerGuidance } from "../src/lib/studyComposerGuidance.ts";
import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";

test("study composer guidance recommends connected notes plus extracted retention by default", () => {
  const guidance = buildStudyComposerGuidance({
    attachedCount: 2,
    supportedCount: 2,
    unsupportedCount: 0,
    knowledgeMode: "standard",
    retentionMode: "keep_file",
  });

  assert.equal(guidance.recommendedKnowledgeMode, "connected_notes");
  assert.equal(guidance.recommendedRetentionMode, "keep_extracted_only");
  assert.equal(guidance.recommendationMatchesCurrent, false);
  assert.match(guidance.recommendationBody, /Connected notes/i);
  assert.match(guidance.recommendationBody, /Keep extracted notes only/i);
  assert.equal(guidance.suggestionHeading, "Ask this now");
  assert.equal(guidance.suggestedPrompts.length, 3);
  assert.match(guidance.suggestedPrompts[0] ?? "", /Compare these sources/i);
});

test("study composer guidance confirms when the recommended first-study setup is already active", () => {
  const guidance = buildStudyComposerGuidance({
    attachedCount: 1,
    supportedCount: 1,
    unsupportedCount: 1,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(guidance.recommendationMatchesCurrent, true);
  assert.match(guidance.recommendationTitle, /active/i);
  assert.match(guidance.recommendationBody, /stressed uni students/i);
  assert.match(guidance.recommendationBody, /not readable yet/i);
  assert.equal(guidance.suggestionHeading, "Ask this now");
  assert.match(guidance.suggestedPrompts[0] ?? "", /Summarize this study material/i);
});

test("study composer guidance switches prompts when zettelkasten mode is selected", () => {
  const guidance = buildStudyComposerGuidance({
    attachedCount: 2,
    supportedCount: 2,
    unsupportedCount: 0,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(guidance.recommendationMatchesCurrent, false);
  assert.match(guidance.suggestedPrompts[0] ?? "", /source notes/i);
  assert.match(guidance.suggestedPrompts[1] ?? "", /Zettelkasten chain/i);
});

test("study composer guidance keeps prompt suggestions aligned with the carried study focus", () => {
  const guidance = buildStudyComposerGuidance({
    attachedCount: 2,
    supportedCount: 2,
    unsupportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    quickStartSeed: {
      label: "Ask from linked ideas",
      description: "Use the strongest current cross-source graph links as the basis for the next study run.",
      query: "Using topic:market_failures...",
      notice: "Linked-ideas follow-up prompt loaded from your current graph focus.",
      helper: "This works best when the graph already has at least two related study sources.",
      valuePromise: "Turn the strongest graph connections into a grounded comparison without manually restating the sources.",
      recommendedUpload: "Best with one lecture source plus one reading.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From Knowledge Graph focus",
      focusBadges: ["topic:market_failures", "lens linked ideas", "high links"],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.equal(guidance.suggestionHeading, "Ask from the current study focus");
  assert.match(guidance.suggestionDetail, /topic:market_failures/i);
  assert.match(guidance.suggestedPrompts[0] ?? "", /topic:market_failures/i);
  assert.match(guidance.suggestedPrompts[0] ?? "", /compare the strongest overlaps/i);
});

test("study composer guidance keeps zettelkasten prompts aligned with the carried note chain", () => {
  const guidance = buildStudyComposerGuidance({
    attachedCount: 1,
    supportedCount: 1,
    unsupportedCount: 0,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    quickStartSeed: {
      label: "Continue this note chain",
      description: "Use the current graph focus to develop permanent notes and review links.",
      query: "Use course:phil201...",
      notice: "Zettelkasten follow-up prompt loaded from your current graph focus.",
      helper: "Keep extracted notes on.",
      valuePromise: "Move from source notes toward clearer permanent notes and stronger graph links.",
      recommendedUpload: "Best with an existing note chain plus one more related source.",
      knowledgeMode: "zettelkasten",
      retentionMode: "keep_extracted_only",
      originLabel: "From Knowledge Graph focus",
      focusBadges: ["course:phil201", "stage source note"],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.equal(guidance.suggestionHeading, "Ask from the current study focus");
  assert.match(guidance.suggestedPrompts[0] ?? "", /course:phil201/i);
  assert.match(guidance.suggestedPrompts[1] ?? "", /Zettelkasten chain/i);
});

test("study composer guidance preserves report seeds as report-generation prompts", () => {
  const reportSeed = buildReportQuickStartSeed({
    kind: "assignment_plan",
    goal: "Plan my essay without missing rubric requirements.",
    messages: [],
  });
  const guidance = buildStudyComposerGuidance({
    attachedCount: 0,
    supportedCount: 0,
    unsupportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    quickStartSeed: reportSeed,
  });

  assert.match(guidance.suggestedPrompts[0] ?? "", /assignment plan report/i);
  assert.match(guidance.suggestedPrompts[0] ?? "", /assignment brief or rubric/i);
  assert.match(guidance.suggestedPrompts[1] ?? "", /first 15-minute step/i);
  assert.match(guidance.suggestedPrompts[2] ?? "", /sources or graph cards/i);
});

test("study composer guidance uses normalized report focus metadata", () => {
  const guidance = buildStudyComposerGuidance({
    attachedCount: 0,
    supportedCount: 0,
    unsupportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    quickStartSeed: {
      label: "Saved flashcards",
      description: "Continue saved deck.",
      query: "Continue the deck.",
      notice: "Loaded.",
      helper: "Run.",
      valuePromise: "Better recall.",
      recommendedUpload: "Optional lecture.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From saved report",
      focusBadges: [
        "report_kind:flashcard_deck",
        "course_tag:course:bio101",
        "session:guided-1",
        "route_source:study_lens",
        "source_need:lecture notes",
        "source:Week 3 slides.pdf",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.equal(guidance.suggestionHeading, "Ask from the current study focus");
  assert.match(guidance.suggestionDetail, /flashcard deck report, course:bio101, guided session guided-1, from study lens/i);
  assert.doesNotMatch(guidance.suggestionDetail, /report_kind:/i);
  assert.match(guidance.suggestedPrompts[0] ?? "", /scoped to course:bio101/i);
  assert.match(guidance.suggestedPrompts[0] ?? "", /guided session guided-1 as carryover evidence, not mastery proof/i);
  assert.match(guidance.suggestedPrompts[0] ?? "", /ask only for lecture notes/i);
  assert.doesNotMatch(guidance.suggestedPrompts[0] ?? "", /report report/i);
  assert.doesNotMatch(guidance.suggestedPrompts[0] ?? "", /Week 3 slides\.pdf as carryover/i);
});

test("study composer guidance uses medical topology carryover prompts", () => {
  const guidance = buildStudyComposerGuidance({
    attachedCount: 0,
    supportedCount: 0,
    unsupportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    quickStartSeed: {
      label: "Saved medical topology deck",
      description: "Continue saved deck.",
      query: "Continue.",
      notice: "Loaded.",
      helper: "Run.",
      valuePromise: "Continue medical topology coverage.",
      recommendedUpload: "Optional source.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From saved report",
      focusBadges: [
        "report_kind:flashcard_deck",
        "academic_kind:medical_cloze_vignette",
        "course_tag:course:med101",
        "medical_topology_coverage",
        "topology_gap:overload",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.equal(guidance.suggestionHeading, "Ask from the current study focus");
  assert.match(guidance.suggestedPrompts[0] ?? "", /medical topology coverage/i);
  assert.match(guidance.suggestedPrompts[0] ?? "", /reducing review load/i);
  assert.match(guidance.suggestedPrompts[1] ?? "", /no copied proprietary QBank wording/i);
  assert.match(guidance.suggestedPrompts[2] ?? "", /cards, attempt evidence, overload reduction, or a timed vignette block/i);
});
