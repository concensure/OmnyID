// @locs-version: 1.0
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type MedicalDetailZoom =
  | "survey"
  | "course_level"
  | "exam_prep"
  | "clinical_reasoning"
  | "fine_detail";

export type MedicalTrustedReferenceInput = {
  searchQuery?: string | null;
  activeTag?: string | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: readonly string[] | null;
  zettelkastenNextAction?: string | null;
};

export type MedicalTrustedReferenceArtifactState = {
  hasMedicalTrustedReferenceSignal: boolean;
  detailZoom: MedicalDetailZoom;
  usesTrustedReferenceSupport: boolean;
  usesStudentSourcePrimaryRule: boolean;
  restrictsClinicalDatasetUse: boolean;
  labels: string[];
  searchTerms: string[];
};

function clean(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item?.toLowerCase() ?? "";
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function combinedMedicalReferenceText(input: MedicalTrustedReferenceInput): string {
  return [
    input.searchQuery,
    input.activeTag,
    input.courseTag,
    input.unitTag,
    input.chapterTag,
    input.knowledgeGraphGroupKey,
    ...(input.knowledgeGraphLinkTags ?? []),
    input.zettelkastenNextAction,
  ].map((value) => clean(value)).filter(Boolean).join(" ");
}

export function inferMedicalDetailZoom(input: MedicalTrustedReferenceInput): MedicalDetailZoom {
  const text = combinedMedicalReferenceText(input);
  if (/\b(?:detail_zoom|zoom):fine_detail\b|\bfine detail\b|\bfinite motor muscles\b|\binnervation\b|\breceptor subtype\b|\benzyme step\b/i.test(text)) {
    return "fine_detail";
  }
  if (/\b(?:detail_zoom|zoom):clinical_reasoning\b|\bclinical reasoning\b|\bvignette\b|\bpathophys\b.*\bpresentation\b|\bpresentation\b.*\bmanagement\b|\bnext best step\b/i.test(text)) {
    return "clinical_reasoning";
  }
  if (/\b(?:detail_zoom|zoom):exam_prep\b|\bhigh[- ]yield\b|\bexam prep\b|\bexam[-_ ]readiness\b|\bboards?\b|\bosce\b/i.test(text)) {
    return "exam_prep";
  }
  if (/\b(?:detail_zoom|zoom):survey\b|\bbig picture\b|\blarger anatomy\b|\bbroad anatomy\b|\boverview\b|\bsurvey level\b/i.test(text)) {
    return "survey";
  }
  return "course_level";
}

export function medicalDetailZoomLabel(zoom: MedicalDetailZoom): string {
  if (zoom === "survey") return "survey";
  if (zoom === "exam_prep") return "exam prep";
  if (zoom === "clinical_reasoning") return "clinical reasoning";
  if (zoom === "fine_detail") return "fine detail";
  return "course level";
}

export function medicalTrustedReferencePromptLines(input: MedicalTrustedReferenceInput): string[] {
  const text = combinedMedicalReferenceText(input);
  const zoom = inferMedicalDetailZoom(input);
  const zoomLabel = medicalDetailZoomLabel(zoom);
  const wantsTrustedReference = /\btrusted_medical_reference\b|\btrusted medical\b|\bopen[- ]source medical\b|\bopen reference\b|\bRAG\b|\bPubMed\b|\bPMC\b|\bUMLS\b|\bMedQA\b|\bWikidata\b|\bWikipedia medical\b|\bOpenMD\b/i.test(text);
  const terminologyFocus = /\bUMLS\b|\bontology\b|\bSNOMED\b|\bMeSH\b|\bterminology\b|\bconcept graph\b/i.test(text);
  const researchFocus = /\bPubMed\b|\bPMC\b|\bresearch literature\b|\bpeer[- ]reviewed\b|\bsystematic review\b/i.test(text);
  const clinicalDatasetFocus = /\bMIMIC\b|\bclinical dataset\b|\bpatient[- ]level\b|\bICU\b|\bde[- ]identified clinical data\b/i.test(text);

  return [
    `Medical detail zoom: ${zoomLabel}; match the student's requested depth and allow explicit zoom-in or zoom-out without adding unnecessary detail.`,
    zoom === "survey"
      ? "Detail boundary: prefer larger structures, systems, and high-level relationships; avoid finite muscle, receptor, enzyme, or rare-exception detail unless the student asks."
      : zoom === "fine_detail"
      ? "Detail boundary: include fine-grained anatomy, mechanism, receptor, innervation, or exception detail only when source-backed and relevant to the current course/unit/chapter."
      : zoom === "clinical_reasoning"
      ? "Detail boundary: emphasize pathophysiology -> presentation -> investigation -> management links and generate fresh vignette phrasing from the concept graph."
      : zoom === "exam_prep"
      ? "Detail boundary: prioritize high-yield discriminators, common traps, contraindications, and exam-style reasoning while preserving source locators."
      : "Detail boundary: stay near the student's lecture/textbook level; do not silently escalate to specialist detail or oversimplify to broad survey notes.",
    wantsTrustedReference || terminologyFocus || researchFocus
      ? "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them as supporting evidence and distinguish them from course material."
      : "Trusted medical grounding: retained student uploads, notes, and source locators are the primary evidence; do not invent external citations when trusted reference snippets were not retrieved.",
    "Source integrity: never treat LLM internal knowledge as source evidence; mark unsupported medical claims as needing verification instead of presenting them as grounded facts.",
    "Scope metadata: preserve course_tag, unit_tag, chapter_tag, source_locator, and medical concept supertags so future review can filter by chapter, unit, system, and relationship.",
    terminologyFocus
      ? "Ontology use: terminology sources such as UMLS/MeSH may normalize synonyms and concept edges, but they do not replace the student's course source or clinical guideline evidence."
      : "Ontology use: use medical concept supertags and source-backed relationships for graph traversal; do not add unsupported ontology edges.",
    researchFocus
      ? "Research-literature use: PubMed/PMC snippets may support mechanisms or evidence context, but keep generated recall aligned to the student's year, exam scope, and supplied textbook or lecture depth."
      : "Reference-depth use: align outputs to the user's declared year, course scope, and requested zoom; expose when the answer is broader, narrower, or more advanced than the retained material.",
    clinicalDatasetFocus
      ? "Clinical dataset boundary: do not use patient-level datasets such as MIMIC for ordinary card generation unless access, task purpose, and de-identification constraints are explicit; never produce patient-specific advice."
      : "Clinical safety boundary: this is study support, not diagnosis or patient-specific medical advice; keep cards and exam prep framed as educational recall.",
  ];
}

function artifactReferenceText(artifact: StudyReportArtifact): string {
  return [
    artifact.title,
    artifact.filename,
    artifact.markdown,
    artifact.academicKind,
    artifact.reportKind,
    artifact.outputFormat,
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
    ...artifact.sourceLabels,
  ].map((value) => clean(value)).filter(Boolean).join("\n");
}

export function buildMedicalTrustedReferenceArtifactState(
  artifact: StudyReportArtifact,
): MedicalTrustedReferenceArtifactState {
  const text = artifactReferenceText(artifact);
  const isMedicalRecall = artifact.academicKind === "medical_cloze_vignette"
    || /\bmedical\b/i.test(text) && /\b(cloze|vignette|anki|qbank|pathophys|pharm|clinical)\b/i.test(text);
  const detailZoom = inferMedicalDetailZoom({
    searchQuery: text,
    courseTag: artifact.courseTag,
    unitTag: artifact.unitTag,
    chapterTag: artifact.chapterTag,
  });
  if (!isMedicalRecall) {
    return {
      hasMedicalTrustedReferenceSignal: false,
      detailZoom,
      usesTrustedReferenceSupport: false,
      usesStudentSourcePrimaryRule: false,
      restrictsClinicalDatasetUse: false,
      labels: [],
      searchTerms: [],
    };
  }

  const usesTrustedReferenceSupport = /\bTrusted medical grounding\b|\btrusted open-reference snippets\b|\btrusted_medical_reference\b|\bPubMed\b|\bPMC\b|\bUMLS\b|\bMeSH\b|\bopen[- ]reference\b|\bsource_tier:open_reference\b/i.test(text);
  const usesStudentSourcePrimaryRule = /\bretained student uploads\b|\bstudent uploads and source locators first\b|\bsource locators first\b|\bstudent-source primary\b/i.test(text);
  const restrictsClinicalDatasetUse = /\bClinical dataset boundary\b|\bMIMIC\b|\bpatient-level datasets\b|\bclinical dataset restricted\b/i.test(text);
  const noInternalKnowledgeSource = /\bnever treat LLM internal knowledge as source evidence\b|\bdo not invent external citations\b|\bunsupported medical claims\b/i.test(text);
  const zoomLabel = medicalDetailZoomLabel(detailZoom);

  const labels = uniqueStrings([
    "Medical trusted grounding",
    `Detail zoom: ${zoomLabel}`,
    usesTrustedReferenceSupport ? "Trusted reference supported" : null,
    usesStudentSourcePrimaryRule ? "Student-source primary" : null,
    noInternalKnowledgeSource ? "No internal-knowledge citations" : null,
    restrictsClinicalDatasetUse ? "Clinical dataset restricted" : null,
  ]);
  const searchTerms = uniqueStrings([
    ...labels,
    "medical trusted reference",
    `detail_zoom:${detailZoom}`,
    `medical detail zoom ${zoomLabel}`,
    usesTrustedReferenceSupport ? "trusted_medical_reference open_reference PubMed PMC UMLS MeSH" : null,
    usesStudentSourcePrimaryRule ? "student source primary retained uploads source locators first" : null,
    noInternalKnowledgeSource ? "no llm internal knowledge citations unsupported claims verification" : null,
    restrictsClinicalDatasetUse ? "clinical dataset restricted MIMIC patient-level ordinary card generation" : null,
  ]);

  return {
    hasMedicalTrustedReferenceSignal: labels.length > 0,
    detailZoom,
    usesTrustedReferenceSupport,
    usesStudentSourcePrimaryRule,
    restrictsClinicalDatasetUse,
    labels,
    searchTerms,
  };
}
