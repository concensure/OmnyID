import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMedicalFactVerificationExportState,
  buildMedicalFactVerificationFileLibraryIntent,
  buildMedicalFactVerificationKnowledgeGraphIntent,
  buildMedicalFactVerificationReportIntent,
  buildMedicalFactVerificationResults,
  isMedicalFactVerificationPlannedAction,
  medicalFactVerificationActionLabel,
  medicalFactVerificationActionTone,
} from "../src/lib/medicalFactVerificationResultState.ts";
import type { MedicalFactVerificationRecord } from "../src/lib/medicalFactVerificationState.ts";

function record(overrides: Partial<MedicalFactVerificationRecord> = {}): MedicalFactVerificationRecord {
  return {
    id: "medical_fact:heart-failure",
    targetKind: "passage",
    targetText: "ACE inhibitors reduce afterload and improve outcomes in HFrEF.",
    targetHash: "heart-failure",
    status: "verified",
    confidenceScore: 82,
    confidenceLabel: "high",
    summary: "Supported by cardiology lecture and trusted reference.",
    sourceEvidence: [
      {
        label: "Cardiology lecture",
        tier: "student_source",
        locator: "slide 21",
        year: 2026,
        supportsClaim: true,
      },
      {
        label: "Heart failure review",
        tier: "peer_reviewed_review",
        locator: "therapy table",
        year: 2024,
        supportsClaim: true,
      },
      {
        label: "Guideline ontology",
        tier: "ontology",
        locator: "HFrEF therapy",
        year: 2026,
        supportsClaim: true,
      },
    ],
    flags: ["probabilistic outcomes wording retained"],
    scopeLabels: ["course:med101", "unit:cardiology", "chapter:heart-failure"],
    verificationDepth: "standard",
    verifiedAt: 1_000,
    manualReviewer: null,
    ...overrides,
  };
}

test("buildMedicalFactVerificationResults creates source-aware result cards", () => {
  const [result] = buildMedicalFactVerificationResults([record()], "afterload heart-failure slide 21 peer_reviewed_review");

  assert.match(result?.id ?? "", /^medical_fact:/);
  assert.equal(result?.id, result?.record.id);
  assert.match(result?.subtitle ?? "", /verified - high confidence - 3 sources/i);
  assert.match(result?.description ?? "", /3 supporting sources saved/i);
  assert.match(result?.description ?? "", /not patient-specific advice/i);
  assert.ok(result?.badges.includes("medical fact verification"));
  assert.ok(result?.badges.includes("verified"));
  assert.ok(result?.badges.includes("high confidence"));
  assert.ok(result?.badges.some((badge) => /^\d+\/100$/.test(badge)));
  assert.ok(result?.badges.includes("depth:standard"));
  assert.ok(result?.badges.includes("chapter:heart-failure"));
  assert.ok(result?.badges.includes("source:peer reviewed review"));
  assert.ok(result?.badges.includes("locator:slide 21"));
  assert.ok(result?.matchedFields.includes("claim"));
  assert.ok(result?.matchedFields.includes("scope"));
  assert.ok(result?.matchedFields.includes("sources"));
  assert.deepEqual(result?.actions, [
    "reuse_in_report",
    "verify_again",
    "show_sources",
    "copy_export",
    "download_markdown",
    "download_html",
    "download_word",
    "print_pdf",
    "planned_docx",
    "planned_image",
    "open_graph",
  ]);
  assert.equal(result?.reportIntent.preferredKind, "practice_questions");
  assert.equal(result?.reportIntent.courseTag, "course:med101");
  assert.equal(result?.reportIntent.chapterTag, "chapter:heart-failure");
  assert.ok(result?.reportIntent.knowledgeGraphLinkTags.includes("medical_fact_verification"));
  assert.equal(result?.fileLibraryIntent.courseTag, "course:med101");
  assert.equal(result?.fileLibraryIntent.unitTag, "unit:cardiology");
  assert.equal(result?.fileLibraryIntent.chapterTag, "chapter:heart-failure");
  assert.equal(result?.fileLibraryIntent.knowledgeGraphGroupKey, result?.record.id);
  assert.match(result?.fileLibraryIntent.query ?? "", /Cardiology lecture/);
  assert.match(result?.fileLibraryIntent.query ?? "", /slide 21/);
  assert.ok(result?.fileLibraryIntent.knowledgeGraphLinkTags?.includes("medical_fact_verification"));
  assert.ok(result?.fileLibraryIntent.knowledgeGraphLinkTags?.includes("source_locator:slide 21"));
  assert.match(result?.fileLibraryIntent.notice ?? "", /retained source evidence/i);
  assert.equal(result?.knowledgeGraphIntent.activeLens, "study_materials");
  assert.equal(result?.knowledgeGraphIntent.courseTag, "course:med101");
  assert.equal(result?.knowledgeGraphIntent.chapterTag, "chapter:heart-failure");
  assert.equal(result?.knowledgeGraphIntent.highlightCardId, `afp-medical-fact-verification:${result.record.id}`);
  assert.ok(result?.knowledgeGraphIntent.knowledgeGraphLinkTags?.includes("medical_fact_verification"));
  assert.match(result?.exportState.markdown ?? "", /## Sources checked/);
  assert.match(result?.exportState.markdown ?? "", /ACE inhibitors reduce afterload/);
  assert.ok(result?.exportState.readyExportTargets.includes("browser_pdf"));
});

test("buildMedicalFactVerificationResults surfaces needs-review actions and conflicts", () => {
  const [result] = buildMedicalFactVerificationResults([
    record({
      id: "medical_fact:conflict",
      targetText: "Metformin-associated lactic acidosis is common in all patients.",
      targetHash: "conflict",
      status: "needs_review",
      confidenceScore: 18,
      confidenceLabel: "low",
      sourceEvidence: [
        {
          label: "Conflicting endocrine source",
          tier: "trusted_reference",
          locator: "adverse effects",
          year: 2024,
          supportsClaim: false,
        },
      ],
      flags: ["conflicting source"],
    }),
  ], "needs_review low conflicting adverse");

  assert.match(result?.id ?? "", /^medical_fact:/);
  assert.equal(result?.id, result?.record.id);
  assert.match(result?.description ?? "", /0 supporting and 1 conflicting source saved/i);
  assert.ok(result?.badges.includes("needs review"));
  assert.ok(result?.badges.includes("low confidence"));
  assert.ok(result?.badges.includes("conflicting source"));
  assert.ok(result?.matchedFields.includes("status"));
  assert.ok(result?.matchedFields.includes("confidence"));
  assert.ok(result?.matchedFields.includes("flags"));
  assert.ok(result?.matchedFields.includes("sources"));
  assert.deepEqual(result?.actions, [
    "reuse_in_report",
    "verify_again",
    "manual_review",
    "show_sources",
    "copy_export",
    "download_markdown",
    "download_html",
    "download_word",
    "print_pdf",
    "planned_docx",
    "planned_image",
    "open_graph",
  ]);
  assert.equal(result?.reportIntent.preferredKind, "exam_preparation");
  assert.ok(result?.reportIntent.knowledgeGraphLinkTags.includes("verification_action:manual_review"));
  assert.equal(result?.knowledgeGraphIntent.activeLens, "review_queue");
  assert.ok(result?.knowledgeGraphIntent.knowledgeGraphLinkTags?.includes("verification_action:manual_review"));
  assert.match(result?.exportState.markdown ?? "", /Status: needs review/);
});

test("medical fact verification action labels and tones are stable", () => {
  assert.equal(medicalFactVerificationActionLabel("reuse_in_report"), "Reuse in report");
  assert.equal(medicalFactVerificationActionLabel("manual_review"), "Manual review");
  assert.equal(medicalFactVerificationActionLabel("copy_export"), "Copy evidence");
  assert.equal(medicalFactVerificationActionLabel("download_markdown"), "Markdown");
  assert.equal(medicalFactVerificationActionLabel("download_html"), "HTML");
  assert.equal(medicalFactVerificationActionLabel("download_word"), "Word");
  assert.equal(medicalFactVerificationActionLabel("print_pdf"), "Print/PDF");
  assert.equal(medicalFactVerificationActionLabel("planned_docx"), "DOCX planned");
  assert.equal(medicalFactVerificationActionLabel("planned_image"), "Image planned");
  assert.equal(medicalFactVerificationActionTone("reuse_in_report"), "primary");
  assert.equal(medicalFactVerificationActionTone("manual_review"), "warning");
  assert.equal(medicalFactVerificationActionTone("show_sources"), "source");
  assert.equal(medicalFactVerificationActionTone("open_graph"), "graph");
  assert.equal(medicalFactVerificationActionTone("download_markdown"), "markdown");
  assert.equal(medicalFactVerificationActionTone("download_html"), "html");
  assert.equal(medicalFactVerificationActionTone("download_word"), "word");
  assert.equal(medicalFactVerificationActionTone("print_pdf"), "pdf");
  assert.equal(medicalFactVerificationActionTone("planned_docx"), "planned");
  assert.equal(medicalFactVerificationActionTone("planned_image"), "planned");
  assert.equal(medicalFactVerificationActionTone("verify_again"), "neutral");
  assert.equal(isMedicalFactVerificationPlannedAction("planned_docx"), true);
  assert.equal(isMedicalFactVerificationPlannedAction("planned_image"), true);
  assert.equal(isMedicalFactVerificationPlannedAction("download_markdown"), false);
});

test("buildMedicalFactVerificationReportIntent carries verified fact evidence into Reports", () => {
  const intent = buildMedicalFactVerificationReportIntent({
    record: record(),
    preferredKind: "practice_questions",
    source: "object_search",
  });

  assert.equal(intent.source, "object_search");
  assert.equal(intent.preferredKind, "practice_questions");
  assert.equal(intent.academicKind, "medical_cloze_vignette");
  assert.equal(intent.courseTag, "course:med101");
  assert.equal(intent.unitTag, "unit:cardiology");
  assert.equal(intent.chapterTag, "chapter:heart-failure");
  assert.equal(intent.activeTag, intent.knowledgeGraphGroupKey);
  assert.ok(intent.knowledgeGraphLinkTags.includes("medical_fact_verification"));
  assert.ok(intent.knowledgeGraphLinkTags.includes("medical_trusted_grounding"));
  assert.ok(intent.knowledgeGraphLinkTags.includes("verification_status:verified"));
  assert.ok(intent.knowledgeGraphLinkTags.includes("confidence:high"));
  assert.ok(intent.knowledgeGraphLinkTags.includes("source_tier:student_source"));
  assert.ok(intent.knowledgeGraphLinkTags.includes("source_locator:slide 21"));
  assert.match(intent.searchQuery, /medical fact verification/i);
  assert.match(intent.zettelkastenNextAction ?? "", /ACE inhibitors reduce afterload/i);
  assert.match(intent.zettelkastenNextAction ?? "", /Sources already checked/i);
  assert.match(intent.zettelkastenNextAction ?? "", /do not invent additional citations/i);
});

test("buildMedicalFactVerificationKnowledgeGraphIntent focuses verified fact evidence in graph", () => {
  const intent = buildMedicalFactVerificationKnowledgeGraphIntent(record());

  assert.equal(intent.activeLens, "study_materials");
  assert.equal(intent.preferredConnectionStrength, "high");
  assert.equal(intent.activeTag, "course:med101");
  assert.equal(intent.academicKind, "medical_cloze_vignette");
  assert.equal(intent.courseTag, "course:med101");
  assert.equal(intent.unitTag, "unit:cardiology");
  assert.equal(intent.chapterTag, "chapter:heart-failure");
  assert.match(intent.searchQuery, /medical fact verification/i);
  assert.match(intent.searchQuery, /ACE inhibitors reduce afterload/i);
  assert.ok(intent.knowledgeGraphGroupKey?.startsWith("medical_fact:"));
  assert.equal(intent.highlightCardId, `afp-medical-fact-verification:${intent.knowledgeGraphGroupKey}`);
  assert.ok(intent.knowledgeGraphLinkTags?.includes("medical_fact_verification"));
  assert.ok(intent.knowledgeGraphLinkTags?.includes("verification_status:verified"));
  assert.ok(intent.knowledgeGraphLinkTags?.includes("source_tier:student_source"));
  assert.ok(intent.knowledgeGraphLinkTags?.includes("source_locator:slide 21"));
  assert.match(intent.zettelkastenNextAction ?? "", /verified medical fact evidence/i);
  assert.match(intent.notice ?? "", /verified medical fact evidence/i);
});

test("buildMedicalFactVerificationKnowledgeGraphIntent routes needs-review facts to graph review queue", () => {
  const intent = buildMedicalFactVerificationKnowledgeGraphIntent(record({
    status: "needs_review",
    confidenceScore: 18,
    confidenceLabel: "low",
    sourceEvidence: [
      {
        label: "Conflicting source",
        tier: "trusted_reference",
        locator: "warning",
        year: 2024,
        supportsClaim: false,
      },
    ],
    flags: ["conflicting source"],
  }));

  assert.equal(intent.activeLens, "review_queue");
  assert.equal(intent.preferredConnectionStrength, "medium");
  assert.ok(intent.knowledgeGraphLinkTags?.includes("verification_action:manual_review"));
  assert.ok(intent.knowledgeGraphLinkTags?.includes("source_support:conflicts_with_claim"));
  assert.match(intent.zettelkastenNextAction ?? "", /unresolved medical fact verification/i);
  assert.match(intent.notice ?? "", /needs review/i);
});

test("buildMedicalFactVerificationReportIntent defaults needs-review facts to exam prep with manual review instruction", () => {
  const intent = buildMedicalFactVerificationReportIntent({
    record: record({
      status: "needs_review",
      confidenceScore: 18,
      confidenceLabel: "low",
      sourceEvidence: [
        {
          label: "Conflicting reference",
          tier: "trusted_reference",
          locator: "adverse effects",
          year: 2024,
          supportsClaim: false,
        },
      ],
      flags: ["conflicting source"],
    }),
  });

  assert.equal(intent.source, "study_lens");
  assert.equal(intent.preferredKind, "exam_preparation");
  assert.ok(intent.knowledgeGraphLinkTags.includes("verification_status:needs_review"));
  assert.ok(intent.knowledgeGraphLinkTags.includes("verification_action:manual_review"));
  assert.ok(intent.knowledgeGraphLinkTags.includes("source_support:conflicts_with_claim"));
  assert.match(intent.zettelkastenNextAction ?? "", /manual review/i);
  assert.match(intent.zettelkastenNextAction ?? "", /Do not turn this into exam-critical cards/i);
});

test("buildMedicalFactVerificationFileLibraryIntent opens retained verification evidence in Files", () => {
  const intent = buildMedicalFactVerificationFileLibraryIntent(record());

  assert.equal(intent.knowledgeMode, "connected_notes");
  assert.equal(intent.studyReadiness, "ready_now");
  assert.equal(intent.sourceKind, "parsed_document");
  assert.equal(intent.academicKind, "medical_cloze_vignette");
  assert.equal(intent.tag, "course:med101");
  assert.equal(intent.courseTag, "course:med101");
  assert.equal(intent.unitTag, "unit:cardiology");
  assert.equal(intent.chapterTag, "chapter:heart-failure");
  assert.equal(intent.knowledgeGraphGroupKey, "medical_fact:heart-failure");
  assert.match(intent.query ?? "", /Cardiology lecture/);
  assert.match(intent.query ?? "", /therapy table/);
  assert.ok(intent.knowledgeGraphLinkTags?.includes("medical_fact_verification"));
  assert.ok(intent.knowledgeGraphLinkTags?.includes("source_tier:peer_reviewed_review"));
  assert.ok(intent.knowledgeGraphLinkTags?.includes("source_locator:slide 21"));
  assert.match(intent.zettelkastenNextAction ?? "", /retained source evidence/i);
  assert.match(intent.notice ?? "", /retained source evidence/i);
});

test("buildMedicalFactVerificationFileLibraryIntent routes sparse facts to Files without pretending sources exist", () => {
  const intent = buildMedicalFactVerificationFileLibraryIntent(record({
    id: "medical_fact:unsourced",
    targetText: "Unsourced claim needing trusted medical verification.",
    targetHash: "unsourced",
    sourceEvidence: [],
    scopeLabels: ["unit:renal"],
    status: "needs_review",
    confidenceScore: 0,
    confidenceLabel: "not checked",
    summary: "Needs verification evidence.",
  }));

  assert.equal(intent.tag, "unit:renal");
  assert.equal(intent.courseTag, null);
  assert.equal(intent.unitTag, "unit:renal");
  assert.equal(intent.chapterTag, null);
  assert.equal(intent.knowledgeGraphGroupKey, "medical_fact:unsourced");
  assert.match(intent.query ?? "", /medical fact verification/i);
  assert.match(intent.query ?? "", /Unsourced claim/i);
  assert.ok(intent.knowledgeGraphLinkTags?.includes("verification_status:needs_review"));
  assert.match(intent.zettelkastenNextAction ?? "", /attach retained trusted sources/i);
  assert.match(intent.notice ?? "", /add retained sources/i);
});

test("buildMedicalFactVerificationExportState creates reusable verified-fact evidence files", () => {
  const state = buildMedicalFactVerificationExportState(record());

  assert.equal(state.title, "Medical fact verification");
  assert.match(state.filename, /^chapter-heart-failure-ace-inhibitors-reduce-afterload/);
  assert.equal(state.htmlFilename, state.filename.replace(/\.md$/, ".html"));
  assert.equal(state.wordFilename, state.filename.replace(/\.md$/, ".doc"));
  assert.deepEqual(state.readyExportTargets, ["markdown", "html", "word_doc", "browser_pdf"]);
  assert.deepEqual(state.plannedExportTargets, ["native_docx_planned", "image_export_planned"]);
  assert.equal(state.mimeType, "text/markdown;charset=utf-8");
  assert.equal(state.htmlMimeType, "text/html;charset=utf-8");
  assert.equal(state.wordMimeType, "application/msword;charset=utf-8");
  assert.match(state.markdown, /## Claim/);
  assert.match(state.markdown, /ACE inhibitors reduce afterload/);
  assert.match(state.markdown, /Status: verified/);
  assert.match(state.markdown, /Confidence: high/);
  assert.match(state.markdown, /course:med101/);
  assert.match(state.markdown, /chapter:heart-failure/);
  assert.match(state.markdown, /Cardiology lecture \(slide 21\): student source, supports claim, 2026/);
  assert.match(state.markdown, /not patient-specific medical advice/i);
  assert.match(state.html, /Medical fact verification/);
  assert.ok(state.metadataLabels.includes("medical fact verification"));
  assert.ok(state.metadataLabels.includes("verified"));
  assert.ok(state.metadataLabels.includes("high confidence"));
  assert.ok(state.metadataLabels.includes("student_source"));
});

test("buildMedicalFactVerificationExportState handles sparse needs-review facts conservatively", () => {
  const state = buildMedicalFactVerificationExportState(record({
    sourceEvidence: [],
    flags: [],
    scopeLabels: [],
    status: "needs_review",
    confidenceScore: 0,
    confidenceLabel: "not checked",
    summary: "Needs verification evidence.",
  }));

  assert.equal(state.filename.endsWith(".md"), true);
  assert.match(state.markdown, /No course, unit, or chapter scope saved/);
  assert.match(state.markdown, /No verification source evidence saved yet/);
  assert.match(state.markdown, /No caveat flags saved/);
  assert.match(state.markdown, /Re-run verification if source material, guidelines, or local curriculum expectations change/);
  assert.ok(state.metadataLabels.includes("needs review"));
  assert.ok(state.metadataLabels.includes("not checked confidence"));
});
