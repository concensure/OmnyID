import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentMedicalAnkiWorkflowAfpProjection,
  loadMedicalAnkiWorkflowAfpProjectionIds,
  markMedicalAnkiWorkflowAfpProjectionSent,
  MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY,
  medicalAnkiWorkflowArtifactToAfpMessage,
  medicalAnkiWorkflowArtifactToAfpSendInput,
  unmarkMedicalAnkiWorkflowAfpProjectionSent,
} from "../src/lib/medicalAnkiWorkflowAfpProjectionState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";

function storageFixture(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return [...state.keys()][index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "medical-gap-deck",
    title: "Cardiology graph-gap cloze deck",
    filename: "cardiology-gap-deck.md",
    markdown: "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows for graph gaps.",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: "flashcard deck report",
    outputFormat: "csv_flashcards",
    sourceLabels: ["Heart failure lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    chapterTag: "chapter:heart-failure",
    unitTag: "unit:cardiology",
    academicKind: "medical_cloze_vignette",
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("medicalAnkiWorkflowArtifactToAfpMessage projects graph-gap workflows as knowledge cards", () => {
  const report = artifact();
  const message = medicalAnkiWorkflowArtifactToAfpMessage(report, "2026-09-11T00:00:00.000Z");

  assert.equal(message?.id, "afp-medical-anki-workflow:medical-gap-deck");
  assert.equal(message?.type, "knowledge_card");
  assert.equal(message?.kind, "knowledge_card");
  assert.equal(message?.subtype, "medical_anki_workflow");
  assert.deepEqual(message?.to, ["agent://study", "agent://knowledge-graph"]);
  assert.ok(message?.supertags?.includes("medical_anki_workflow"));
  assert.ok(message?.supertags?.includes("medical_gap_cloze_deck"));
  assert.ok(message?.supertags?.includes("medical_cloze_vignette"));
  assert.ok(message?.supertags?.includes("course:med101"));
  assert.equal(message?.metadata?.medical_anki_workflow_kind, "graph_gap_cloze_deck");
  assert.equal(message?.metadata?.knowledge_graph_seed, true);
  assert.equal(message?.metadata?.academic_course_tag, "course:med101");
  assert.ok((message?.metadata?.knowledge_graph_link_tags as string[]).includes("medical_gap_cloze_deck"));
  assert.match(String(message?.content.summary), /without duplicating covered cards/i);
  assert.equal(message?.references?.[0]?.metadata?.proprietary_text_stored, false);

  const sendInput = medicalAnkiWorkflowArtifactToAfpSendInput(report, "2026-09-11T00:00:00.000Z");
  assert.equal(sendInput?.type, "knowledge_card");
  assert.equal(sendInput?.subtype, "medical_anki_workflow");
  assert.equal(sendInput?.store_in_relational, true);
});

test("medicalAnkiWorkflowArtifactToAfpMessage projects trusted grounding metadata", () => {
  const report = artifact({
    markdown: [
      "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows for graph gaps.",
      "Medical detail zoom: fine detail.",
      "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
      "Source integrity: never treat LLM internal knowledge as source evidence.",
      "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation.",
    ].join("\n"),
  });
  const message = medicalAnkiWorkflowArtifactToAfpMessage(report, "2026-09-11T00:00:00.000Z");

  assert.ok(message?.supertags?.includes("medical_trusted_grounding"));
  assert.ok(message?.supertags?.includes("detail_zoom:fine_detail"));
  assert.ok(message?.supertags?.includes("trusted_reference:supported"));
  assert.ok(message?.supertags?.includes("trusted_reference:student_source_primary"));
  assert.ok(message?.supertags?.includes("trusted_reference:clinical_dataset_restricted"));
  assert.equal(message?.metadata?.medical_detail_zoom, "fine_detail");
  assert.equal(message?.metadata?.medical_detail_zoom_label, "fine detail");
  assert.equal(message?.metadata?.medical_trusted_grounding, true);
  assert.equal(message?.metadata?.medical_trusted_reference_supported, true);
  assert.equal(message?.metadata?.medical_student_source_primary, true);
  assert.equal(message?.metadata?.medical_clinical_dataset_restricted, true);
  assert.ok((message?.metadata?.knowledge_graph_link_tags as string[]).includes("detail_zoom:fine_detail"));
  assert.ok((message?.metadata?.searchable_terms as string[]).includes("clinical dataset restricted"));
  assert.match(String(message?.content.summary), /Trusted grounding: fine detail detail zoom/i);
  assert.equal(message?.content.medical_detail_zoom, "fine_detail");
  assert.equal(message?.views?.[0]?.content.medical_detail_zoom, "fine detail");
  assert.equal(message?.references?.[0]?.metadata?.medical_trusted_grounding, true);
});

test("medicalAnkiWorkflowArtifactToAfpMessage projects vignette workflows and ignores ordinary reports", () => {
  const vignette = medicalAnkiWorkflowArtifactToAfpMessage(artifact({
    id: "medical-vignette-block",
    title: "Cardiology vignette block",
    filename: "cardiology-vignette-block.md",
    markdown: "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph.",
    reportKind: "practice_questions",
    outputFormat: "chat_markdown",
  }));

  assert.equal(vignette?.metadata?.medical_anki_workflow_kind, "vignette_block");
  assert.ok(vignette?.supertags?.includes("medical_vignette_block"));
  assert.match(String(vignette?.views?.[0]?.content.next_action), /freshly phrased vignette block/i);

  assert.equal(medicalAnkiWorkflowArtifactToAfpMessage(artifact({
    id: "ordinary",
    title: "Ordinary summary",
    filename: "ordinary.md",
    markdown: "Lecture summary.",
    academicKind: "study_course",
  })), null);
});

test("medical Anki workflow AFP sent markers are storage-safe and deduped", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalAnkiWorkflowAfpProjectionIds(storage), []);
  assert.equal(storage.getItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY), null);

  markMedicalAnkiWorkflowAfpProjectionSent("artifact-1", storage);
  markMedicalAnkiWorkflowAfpProjectionSent("artifact-1", storage);

  assert.equal(hasSentMedicalAnkiWorkflowAfpProjection("artifact-1", storage), true);
  assert.deepEqual(loadMedicalAnkiWorkflowAfpProjectionIds(storage), ["artifact-1"]);

  unmarkMedicalAnkiWorkflowAfpProjectionSent("artifact-1", storage);
  assert.equal(hasSentMedicalAnkiWorkflowAfpProjection("artifact-1", storage), false);
  assert.equal(storage.getItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY), null);
});
