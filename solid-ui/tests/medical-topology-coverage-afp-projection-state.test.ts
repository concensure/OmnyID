import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentMedicalTopologyCoverageAfpProjection,
  loadMedicalTopologyCoverageAfpProjectionIds,
  markMedicalTopologyCoverageAfpProjectionSent,
  MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY,
  medicalTopologyCoverageArtifactToAfpMessage,
  medicalTopologyCoverageArtifactToAfpSendInput,
  unmarkMedicalTopologyCoverageAfpProjectionSent,
} from "../src/lib/medicalTopologyCoverageAfpProjectionState.ts";
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
    id: "medical-topology",
    title: "Cardiology topology coverage",
    filename: "cardiology-topology.md",
    markdown: [
      "- cloze_text: ACE inhibitors reduce afterload | source_locator: slide 21 | system_tag: system:cardiovascular | concept_tags: pharm; management | reasoning_order: second_order",
      "- vignette_stem: A patient with HFrEF needs therapy | answer: ACE inhibitor | source_locator: slide 22 | concept_tags: condition:heart-failure; management:afterload",
    ].join("\n"),
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
    structuredItemCount: 2,
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("medicalTopologyCoverageArtifactToAfpMessage projects coverage as a graph seed", () => {
  const report = artifact();
  const message = medicalTopologyCoverageArtifactToAfpMessage(report, "2026-09-11T00:00:00.000Z");

  assert.equal(message?.id, "afp-medical-topology-coverage:medical-topology");
  assert.equal(message?.type, "knowledge_card");
  assert.equal(message?.subtype, "medical_topology_coverage");
  assert.deepEqual(message?.to, ["agent://study", "agent://knowledge-graph"]);
  assert.ok(message?.supertags?.includes("medical_topology_coverage"));
  assert.ok(message?.supertags?.includes("system:cardiovascular"));
  assert.ok(message?.supertags?.includes("pharm"));
  assert.equal(message?.metadata?.knowledge_graph_seed, true);
  assert.equal(message?.metadata?.academic_course_tag, "course:med101");
  assert.equal(message?.metadata?.needs_source_locator, false);
  assert.ok((message?.metadata?.knowledge_graph_link_tags as string[]).includes("system:cardiovascular"));
  assert.match(String(message?.content.summary), /Source-locator evidence is present/i);

  const sendInput = medicalTopologyCoverageArtifactToAfpSendInput(report, "2026-09-11T00:00:00.000Z");
  assert.equal(sendInput?.type, "knowledge_card");
  assert.equal(sendInput?.subtype, "medical_topology_coverage");
  assert.equal(sendInput?.store_in_relational, true);
});

test("medicalTopologyCoverageArtifactToAfpMessage preserves missing locator warnings and ignores ordinary outputs", () => {
  const missingLocator = medicalTopologyCoverageArtifactToAfpMessage(artifact({
    id: "medical-needs-locator",
    markdown: "Medical cloze row without locator. system_tag: system:renal | concept_tags: pathophys; complication",
  }));

  assert.equal(missingLocator?.metadata?.needs_source_locator, true);
  assert.ok(missingLocator?.supertags?.includes("Needs source locator"));
  assert.match(String(missingLocator?.content.summary), /Source-locator gap is visible/i);
  const viewContent = missingLocator?.views?.[0]?.content as Record<string, unknown> | undefined;
  assert.match(String(viewContent?.next_action), /Add or preserve page, slide, heading/i);

  assert.equal(medicalTopologyCoverageArtifactToAfpMessage(artifact({
    id: "ordinary",
    title: "Ordinary summary",
    filename: "ordinary.md",
    markdown: "Lecture summary.",
    academicKind: "study_course",
    reportKind: "lecture_summary",
  })), null);
});

test("medicalTopologyCoverageArtifactToAfpMessage projects source-only and overload topology gaps", () => {
  const sourceOnly = medicalTopologyCoverageArtifactToAfpMessage(artifact({
    id: "medical-source-only",
    markdown: [
      "Medical topology coverage readiness:Source only.",
      "- source_label: Heart failure lecture | source_locator: slide 12 | system_tag: system:cardiovascular | concept_tags: pharm; management",
    ].join("\n"),
  }));
  const overload = medicalTopologyCoverageArtifactToAfpMessage(artifact({
    id: "medical-overload",
    markdown: [
      "Medical topology coverage topology_gap:overload.",
      "- cloze_text: Definition | source_locator: slide 12 | system_tag: system:cardiovascular | concept_tags: pharm; management",
    ].join("\n"),
  }));

  assert.ok(sourceOnly?.supertags?.includes("Source-only topology gap"));
  assert.ok((sourceOnly?.metadata?.topology_labels as string[]).includes("Source-only topology gap"));
  assert.ok((sourceOnly?.metadata?.searchable_terms as string[]).includes("topology_gap:source_only"));
  assert.ok(overload?.supertags?.includes("Review overload topology gap"));
  assert.ok((overload?.metadata?.topology_labels as string[]).includes("Review overload topology gap"));
  assert.ok((overload?.metadata?.searchable_terms as string[]).includes("topology_gap:overload"));
});

test("medical topology coverage AFP sent markers are storage-safe and deduped", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalTopologyCoverageAfpProjectionIds(storage), []);
  assert.equal(storage.getItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY), null);

  markMedicalTopologyCoverageAfpProjectionSent("artifact-1", storage);
  markMedicalTopologyCoverageAfpProjectionSent("artifact-1", storage);

  assert.equal(hasSentMedicalTopologyCoverageAfpProjection("artifact-1", storage), true);
  assert.deepEqual(loadMedicalTopologyCoverageAfpProjectionIds(storage), ["artifact-1"]);

  unmarkMedicalTopologyCoverageAfpProjectionSent("artifact-1", storage);
  assert.equal(hasSentMedicalTopologyCoverageAfpProjection("artifact-1", storage), false);
  assert.equal(storage.getItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY), null);
});
