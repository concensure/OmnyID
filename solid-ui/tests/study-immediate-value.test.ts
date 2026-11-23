import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyImmediateValuePlan } from "../src/lib/studyImmediateValue.ts";
import { buildFilesAdjacentSourceSeed, buildFilesStudyContinuationSeed } from "../src/lib/studyWorkspaceContinuationSeed.ts";

test("buildStudyImmediateValuePlan emphasizes connected-note retrieval for retained study uploads", () => {
  const plan = buildStudyImmediateValuePlan({
    attachedCount: 2,
    supportedCount: 2,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    valuePromise: "See the main concepts, overlaps, and first revision priorities from your own study material in one run.",
  });

  assert.equal(
    plan.firstResultLabel,
    "See the main concepts, overlaps, and first revision priorities from your own study material in one run.",
  );
  assert.match(plan.retentionLabel, /searchable in Files and linked by supertags/i);
  assert.match(plan.retrievalLabel, /later searches and Linked ideas/i);
  assert.match(plan.readinessLabel, /study-ready retained sources plus cross-source overlap/i);
  assert.match(plan.readinessDetail, /surface overlaps, revision gaps, and linked material right away/i);
  assert.match(plan.nextSurfaceLabel, /review the retained source in Files/i);
});

test("buildStudyImmediateValuePlan explains zettelkasten preservation without keeping the file", () => {
  const plan = buildStudyImmediateValuePlan({
    attachedCount: 1,
    supportedCount: 1,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
  });

  assert.match(plan.firstResultLabel, /source notes, emerging links, and a review-ready note chain/i);
  assert.match(plan.retrievalLabel, /Zettelkasten-style chain/i);
  assert.match(plan.readinessLabel, /one retained source note that is ready to begin a Zettelkasten chain/i);
  assert.match(plan.readinessDetail, /first retained source note should be available right away in Files/i);
  assert.match(plan.nextSurfaceLabel, /open the Zettelkasten lens/i);
});

test("buildStudyImmediateValuePlan warns when nothing will be retained", () => {
  const plan = buildStudyImmediateValuePlan({
    attachedCount: 1,
    supportedCount: 0,
    knowledgeMode: "standard",
    retentionMode: "keep_nothing",
  });

  assert.match(plan.retentionLabel, /Nothing is retained after this answer/i);
  assert.match(plan.readinessLabel, /will not produce a retained study-ready source/i);
  assert.match(plan.readinessDetail, /Switch to keeping extracted notes/i);
  assert.match(plan.nextSurfaceLabel, /keep extracted notes on the next run/i);
});

test("buildStudyImmediateValuePlan explains when attachments are present but not readable yet", () => {
  const plan = buildStudyImmediateValuePlan({
    attachedCount: 2,
    supportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.match(plan.readinessLabel, /none of the current files can be read/i);
  assert.match(plan.readinessDetail, /Use a readable format such as PDF, DOCX, TXT, Markdown, CSV, or common audio/i);
});

test("buildStudyImmediateValuePlan treats retained-context follow-up as ready without new uploads", () => {
  const seed = buildFilesStudyContinuationSeed({
    courseTag: "course:econ101",
    weekTag: "week:3",
  });
  const plan = buildStudyImmediateValuePlan({
    attachedCount: 0,
    supportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    valuePromise: seed.valuePromise,
    flowKind: seed.flowKind,
  });

  assert.match(plan.firstResultLabel, /stay inside the same study topic/i);
  assert.match(plan.readinessLabel, /retained study context/i);
  assert.match(plan.readinessDetail, /grounded follow-up/i);
});

test("buildStudyImmediateValuePlan gives adjacent-source planning a dedicated next step", () => {
  const seed = buildFilesAdjacentSourceSeed({
    courseTag: "course:phil201",
    knowledgeMode: "zettelkasten",
    zettelkastenStage: "source_note",
  });
  const plan = buildStudyImmediateValuePlan({
    attachedCount: 0,
    supportedCount: 0,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    valuePromise: seed.valuePromise,
    flowKind: seed.flowKind,
  });

  assert.match(plan.readinessLabel, /single best next source/i);
  assert.match(plan.nextSurfaceLabel, /attach the recommended adjacent source/i);
});
