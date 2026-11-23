import assert from "node:assert/strict";
import test from "node:test";

import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";
import { DEFAULT_STUDENT_ONBOARDING_QUICK_START, studentQuickStartForIntent } from "../src/lib/onboardingQuickStart.ts";
import { buildStudyUploadReadinessState } from "../src/lib/studyUploadReadinessState.ts";

test("buildStudyUploadReadinessState stays hidden when no launch seed is active", () => {
  const state = buildStudyUploadReadinessState({
    quickStartSeed: null,
    attachedCount: 0,
    capabilities: null,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state, null);
});

test("buildStudyUploadReadinessState explains first-session upload formats for onboarding launches", () => {
  const state = buildStudyUploadReadinessState({
    quickStartSeed: {
      ...DEFAULT_STUDENT_ONBOARDING_QUICK_START,
      entryPoint: "onboarding",
    },
    attachedCount: 0,
    capabilities: {
      image_ocr_supported: false,
      pdf_server_processing_supported: true,
      legacy_office_supported: false,
    },
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state?.tone, "sky");
  assert.match(state?.headline ?? "", /upload right now/i);
  assert.equal(state?.recommendedSourceLabel, "Best source for this run");
  assert.match(state?.recommendedSourceDetail ?? "", /one lecture source/i);
  assert.match(state?.instantFormatsDetail ?? "", /DOCX|Markdown|PPTX/i);
  assert.match(state?.serverFormatsDetail ?? "", /scanned PDFs/i);
  assert.match(state?.gapsDetail ?? "", /legacy DOC, XLS, and PPT files/i);
  assert.match(state?.retentionLabel ?? "", /safest default/i);
});

test("buildStudyUploadReadinessState preserves zettelkasten-specific retention guidance", () => {
  const state = buildStudyUploadReadinessState({
    quickStartSeed: {
      ...studentQuickStartForIntent("zettelkasten_chain"),
      entryPoint: "onboarding",
    },
    attachedCount: 0,
    capabilities: {
      image_ocr_supported: true,
      pdf_server_processing_supported: false,
      legacy_office_supported: true,
    },
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
  });

  assert.match(state?.detail ?? "", /note-chain/i);
  assert.match(state?.retentionLabel ?? "", /source notes, review stages, and links/i);
});

test("buildStudyUploadReadinessState carries report-specific source guidance", () => {
  const state = buildStudyUploadReadinessState({
    quickStartSeed: buildReportQuickStartSeed({
      kind: "assignment_plan",
      goal: "Plan my assignment from the brief and rubric.",
      messages: [],
    }),
    attachedCount: 0,
    capabilities: null,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.match(state?.recommendedSourceDetail ?? "", /assignment brief/i);
  assert.match(state?.recommendedSourceDetail ?? "", /rubric/i);
  assert.doesNotMatch(state?.recommendedSourceDetail ?? "", /^Best with/i);
});
