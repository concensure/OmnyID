// @locs-version: 1.0
import type { ReportKind } from "@/lib/reportGeneratorState";
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import type { StudySession } from "@/lib/studySessionLocalState";
import { medicalTrustedReferencePromptLines } from "@/lib/medicalTrustedReferenceState";

export const MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND = "medical_cloze_vignette";

export type MedicalAnkiRecallItemField =
  | "cloze_text"
  | "plain_question"
  | "vignette_stem"
  | "answer"
  | "extra"
  | "wrong_answer_rationale"
  | "source_label"
  | "source_locator"
  | "course_tag"
  | "system_tag"
  | "unit_tag"
  | "chapter_tag"
  | "lecture_tag"
  | "concept_tags"
  | "difficulty"
  | "review_priority"
  | "quality_flag"
  | "reasoning_order";

export type MedicalAnkiReadinessState = {
  headline: string;
  readinessLabel: "Not measured" | "Inventory ready" | "Practice started" | "Ready for timed block";
  evidenceLabels: string[];
  gapLabels: string[];
  topologyLabels: string[];
  nextActionLabel: string;
  sourceCount: number;
  clozeDeckCount: number;
  vignettePromptCount: number;
  attemptCount: number;
  deadlineCount: number;
  scheduledSessionCount: number;
  reviewLoadLabel: string;
  reviewLoadInterventionLabel: string;
  shallowRecallCount: number;
  topologyActionFocus: MedicalTopologyActionFocus | null;
};

export type MedicalStudentEligibilityInput = {
  accountMedicalStudentVerified?: boolean | null;
  profileMedicalStudent?: boolean | null;
  profileText?: string | null;
  masterAgentMedicalStudentDeclared?: boolean | null;
  artifacts?: readonly StudyReportArtifact[] | null;
};

export type MedicalStudentEligibilityState = {
  eligible: boolean;
  source:
    | "account_verification"
    | "profile"
    | "master_agent"
    | "repeated_medical_study_uploads"
    | "not_detected";
  evidenceLabel: string;
  medicalStudyArtifactCount: number;
};

export type MedicalTopologyReadinessLabel =
  | "No retained source"
  | "Source only"
  | "Deck generated"
  | "Attempt evidence"
  | "Review overload"
  | "Ready for timed block";

export type MedicalTopologyCoverageNode = {
  id: string;
  scopeLabel: string;
  courseTag: string | null;
  systemTag: string | null;
  unitTag: string | null;
  chapterTag: string | null;
  conceptTags: string[];
  sourceCount: number;
  cardCount: number;
  questionCount: number;
  attemptCount: number;
  totalAttemptItems: number;
  correctAttemptItems: number;
  deadlineCount: number;
  scheduledStudyMinutes: number;
  sourceLocatorCount: number;
  shallowRecallCount: number;
  topologyGrade: "empty" | "sparse" | "inventory" | "practice" | "overloaded" | "ready";
  readinessLabel: MedicalTopologyReadinessLabel;
  nextAction: string;
};

export type MedicalTopologyCoverageState = {
  nodes: MedicalTopologyCoverageNode[];
  summaryLabel: string;
  topGapLabel: string | null;
};

export type MedicalTopologyActionFocus = {
  scopeLabel: string;
  courseTag: string | null;
  systemTag: string | null;
  unitTag: string | null;
  chapterTag: string | null;
  conceptTags: string[];
  readinessLabel: MedicalTopologyReadinessLabel;
  nextAction: string;
};

export type MedicalTopologySearchState = {
  labels: string[];
  searchTerms: string[];
};

function clean(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function artifactMatchesMedicalRecall(artifact: StudyReportArtifact): boolean {
  const academicKind = clean(artifact.academicKind);
  if (academicKind === MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND) return true;
  if (artifact.reportKind !== "flashcard_deck" && artifact.reportKind !== "practice_questions") return false;
  return /\b(cloze|vignette|qbank|pathophys|pharm|presentation|management|contraindication)\b/i.test(
    `${artifact.title}\n${artifact.markdown}`,
  );
}

function artifactMentionsVignette(artifact: StudyReportArtifact): boolean {
  return /\b(vignette|stem|patient presents|next best step|wrong answer rationale|contraindication)\b/i.test(
    `${artifact.title}\n${artifact.markdown}`,
  );
}

function shallowRecallSignalCount(artifact: StudyReportArtifact): number {
  const text = `${artifact.title}\n${artifact.markdown}`;
  const explicitFirstOrder = text.match(/\breasoning_order\s*[:=]\s*first_order\b/gi)?.length ?? 0;
  const qualityFlags = text.match(/\bquality_flag\s*[:=]\s*(?:shallow|first_order|needs_application|needs_vignette)\b/gi)?.length ?? 0;
  const definitionPrompts = text.match(/\b(?:define|what is|what are|name the|list the)\b/gi)?.length ?? 0;
  if (explicitFirstOrder > 0 || qualityFlags > 0) return explicitFirstOrder + qualityFlags;
  return Math.min(definitionPrompts, artifact.structuredItemCount ?? definitionPrompts);
}

function uniqueClean(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function extractMedicalInlineTags(markdown: string, field: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`\\b${field}\\s*[:=]\\s*([^|\\n]+)`, "gi");
  for (const match of markdown.matchAll(pattern)) {
    values.push(...(match[1] ?? "").split(/[;,]/g));
  }
  return uniqueClean(values, 12);
}

function extractMedicalSupertags(markdown: string, prefixes: readonly string[]): string[] {
  const matches = markdown.match(/\b(?:system|condition|pathophys|pharm|presentation|investigation|management|complication|contraindication):[a-z0-9_-]+\b/gi) ?? [];
  return uniqueClean(matches.filter((tag) => prefixes.some((prefix) => tag.toLowerCase().startsWith(`${prefix}:`))), 12);
}

function medicalArtifactSystemTag(artifact: StudyReportArtifact): string | null {
  return uniqueClean([
    ...extractMedicalInlineTags(artifact.markdown, "system_tag"),
    ...extractMedicalSupertags(artifact.markdown, ["system"]),
  ], 1)[0] ?? null;
}

function medicalArtifactConceptTags(artifact: StudyReportArtifact): string[] {
  return uniqueClean([
    ...extractMedicalInlineTags(artifact.markdown, "concept_tags"),
    ...extractMedicalSupertags(artifact.markdown, [
      "condition",
      "pathophys",
      "pharm",
      "presentation",
      "investigation",
      "management",
      "complication",
      "contraindication",
    ]),
  ], 12);
}

function sourceLocatorCount(markdown: string): number {
  return markdown.match(/\bsource_locator\s*[:=]\s*[^|\n]+/gi)?.length ?? 0;
}

function hasSourceOnlyTopologySignal(markdown: string): boolean {
  return /\breadiness\s*:\s*source only\b|\bsource only\b|\btopology_gap:source_only\b/i.test(markdown);
}

function sessionMinutes(session: StudySession): number {
  if (session.duration === "45_min") return 45;
  if (session.duration === "20_min") return 20;
  return 0;
}

export function buildMedicalTopologySearchState(artifact: StudyReportArtifact): MedicalTopologySearchState {
  if (!artifactMatchesMedicalRecall(artifact)) {
    return {
      labels: [],
      searchTerms: [],
    };
  }
  const systemTag = medicalArtifactSystemTag(artifact);
  const conceptTags = medicalArtifactConceptTags(artifact);
  const locatorCount = sourceLocatorCount(artifact.markdown);
  const shallowCount = shallowRecallSignalCount(artifact);
  const sourceOnly = hasSourceOnlyTopologySignal(artifact.markdown);
  const overload = shallowCount > 0 || /\btopology_gap:overload\b|\breview overload\b/i.test(artifact.markdown);
  const labels = uniqueClean([
    "Medical topology coverage",
    systemTag,
    ...conceptTags.slice(0, 6),
    locatorCount > 0 ? `${locatorCount} source locator${locatorCount === 1 ? "" : "s"}` : "Needs source locator",
    sourceOnly ? "Source-only topology gap" : null,
    overload ? "Review overload topology gap" : null,
    shallowCount > 0 ? `${shallowCount} shallow first-order signal${shallowCount === 1 ? "" : "s"}` : null,
  ], 12);
  const searchTerms = uniqueClean([
    "medical topology",
    "medical coverage",
    "readiness coverage",
    "concept graph coverage",
    "source locator",
    locatorCount > 0 ? "source located" : "needs locator",
    sourceOnly ? "topology_gap:source_only" : null,
    sourceOnly ? "source-only topology gap" : null,
    overload ? "topology_gap:overload" : null,
    overload ? "review overload topology gap" : null,
    shallowCount > 0 ? "shallow first order" : null,
    systemTag,
    ...conceptTags,
  ], 20);
  return {
    labels,
    searchTerms,
  };
}

function artifactStudyText(artifact: StudyReportArtifact): string {
  return [
    artifact.title,
    artifact.filename,
    artifact.markdown,
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
    artifact.academicKind,
    ...artifact.sourceLabels,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function hasMedicalStudyTerms(value: string): boolean {
  return /\b(anatomy|physiology|pathophys|pathophysiology|pharmacology|pharm|pathology|microbiology|immunology|histology|embryology|cardiology|neurology|renal|respiratory|gastro|endocrine|hematology|oncology|psychiatry|obgyn|paediatrics|pediatrics|surgery|clinical presentation|diagnosis|differential|management|treatment|contraindication|mechanism of action|receptor|antibiotic|osce|shelf exam|step 1|step 2|usmle|nbme|uworld|amboss|qbank|medical school|med school)\b/i.test(value);
}

function hasAcademicStudyTerms(value: string): boolean {
  return /\b(lecture|slides?|tutorial|seminar|exam|block|module|chapter|unit|syllabus|notes?|deck|flashcards?|cloze|vignette|qbank|question bank|practice questions?|curriculum|course|rotation|clerkship)\b/i.test(value);
}

function looksPersonalMedicalHistory(value: string): boolean {
  return /\b(my|me|i|patient portal|appointment|gp|doctor|specialist|prescription|blood test|scan result|x[- ]?ray|mri|ct scan|diagnosis|symptoms?|medical history|family history|discharge summary|referral|pathology result)\b/i.test(value)
    && /\b(my|me|i|patient portal|appointment|prescription|blood test|scan result|medical history|symptoms?|discharge summary|referral)\b/i.test(value);
}

function isMedicalStudyArtifact(artifact: StudyReportArtifact): boolean {
  const text = artifactStudyText(artifact);
  if (!hasMedicalStudyTerms(text)) return false;
  if (looksPersonalMedicalHistory(text) && !hasAcademicStudyTerms(text)) return false;
  return hasAcademicStudyTerms(text)
    || artifact.academicKind === MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND
    || /\b(course:med|medicine|medical|mbbs|md)\b/i.test(`${artifact.courseTag ?? ""} ${artifact.unitTag ?? ""}`);
}

export function buildMedicalStudentEligibilityState(
  input: MedicalStudentEligibilityInput = {},
): MedicalStudentEligibilityState {
  if (input.accountMedicalStudentVerified) {
    return {
      eligible: true,
      source: "account_verification",
      evidenceLabel: "Medical student verified during account setup",
      medicalStudyArtifactCount: 0,
    };
  }
  if (input.profileMedicalStudent || /\b(medical student|med student|medicine student|mbbs|md student|medical school|med school)\b/i.test(input.profileText ?? "")) {
    return {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    };
  }
  if (input.masterAgentMedicalStudentDeclared) {
    return {
      eligible: true,
      source: "master_agent",
      evidenceLabel: "Medical student status declared to the master agent",
      medicalStudyArtifactCount: 0,
    };
  }

  const medicalStudyArtifactCount = (input.artifacts ?? []).filter(isMedicalStudyArtifact).length;
  if (medicalStudyArtifactCount >= 3) {
    return {
      eligible: true,
      source: "repeated_medical_study_uploads",
      evidenceLabel: `${medicalStudyArtifactCount} medical study uploads detected`,
      medicalStudyArtifactCount,
    };
  }

  return {
    eligible: false,
    source: "not_detected",
    evidenceLabel: medicalStudyArtifactCount > 0
      ? `${medicalStudyArtifactCount}/3 medical study uploads detected; keep medical tools hidden`
      : "No medical student evidence detected",
    medicalStudyArtifactCount,
  };
}

export function medicalAnkiContractPromptLines(input: {
  academicKind?: string | null;
  reportKind: ReportKind;
}): string[] {
  if (clean(input.academicKind) !== MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND) return [];
  if (input.reportKind !== "flashcard_deck" && input.reportKind !== "practice_questions") return [];
  return [
    "Medical Anki contract: generate source-grounded cloze and short clinical-vignette recall items, not only first-order definition cards.",
    "Required medical recall fields: cloze_text, plain_question, vignette_stem, answer, extra, wrong_answer_rationale, source_label, source_locator, course_tag, system_tag, unit_tag, chapter_tag, lecture_tag, concept_tags, difficulty, review_priority, quality_flag, reasoning_order.",
    "Reasoning order: label each item first_order, second_order, or third_order; flag shallow first_order cards that should be upgraded into vignette or management prompts.",
    "QBank safety: use only missed-question topics, optional user-supplied IDs, and the student's own notes; do not reproduce proprietary UWorld, AMBOSS, or third-party question text or explanations unless licensed.",
    "Anki compatibility: make cloze rows exportable while preserving source locators, chapter/unit tags, and concept supertags for search and later review-load analysis.",
  ];
}

export function medicalAnkiFocusPromptLines(input: {
  academicKind?: string | null;
  reportKind: ReportKind;
  searchQuery?: string | null;
  activeTag?: string | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: readonly string[] | null;
  zettelkastenNextAction?: string | null;
}): string[] {
  if (clean(input.academicKind) !== MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND) return [];
  if (
    input.reportKind !== "flashcard_deck"
    && input.reportKind !== "practice_questions"
    && input.reportKind !== "quiz_generator"
    && input.reportKind !== "exam_preparation"
  ) return [];

  const focusValues = uniqueClean([
    input.courseTag,
    input.unitTag,
    input.chapterTag,
    input.knowledgeGraphGroupKey,
    ...(input.knowledgeGraphLinkTags ?? []),
  ], 10);
  const missedTopicFocus = /\bmedical missed topics?:|\bmissed_topic:/i.test(
    `${input.searchQuery ?? ""} ${input.activeTag ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""}`,
  );
  const shallowUpgradeFocus = /\bmedical shallow first-order card upgrade\b|\bquality_action:upgrade_first_order\b/i.test(
    `${input.searchQuery ?? ""} ${input.activeTag ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""} ${input.zettelkastenNextAction ?? ""}`,
  );
  const gapClozeDeckFocus = /\bmedical_gap_cloze_deck\b|\bmedical cloze vignette deck from graph gaps\b/i.test(
    `${input.searchQuery ?? ""} ${input.activeTag ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""} ${input.zettelkastenNextAction ?? ""}`,
  );
  const vignetteBlockFocus = /\bmedical_vignette_block\b|\bmedical vignette block from concept graph\b/i.test(
    `${input.searchQuery ?? ""} ${input.activeTag ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""} ${input.zettelkastenNextAction ?? ""}`,
  );
  const pendingEdgeAttemptFocus = /\bmedical concept-edge attempt evidence\b|\brepair_status:pending_attempt\b|\brecord edge attempt\b/i.test(
    `${input.searchQuery ?? ""} ${input.activeTag ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""} ${input.zettelkastenNextAction ?? ""}`,
  );
  const conceptEdgeRepairFocus = /\bmedical concept-edge review\b|\bmedical_edge:|\bmedical_concept_edge_review\b|\bscore_band:(weak|unattempted)\b/i.test(
    `${input.searchQuery ?? ""} ${input.activeTag ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""}`,
  );
  const topologyCoverageFocus = /\bmedical topology coverage\b|\bmedical_topology_coverage\b/i.test(
    `${input.searchQuery ?? ""} ${input.activeTag ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""} ${input.zettelkastenNextAction ?? ""}`,
  );
  const topologyReadinessText = `${input.searchQuery ?? ""} ${input.knowledgeGraphLinkTags?.join(" ") ?? ""}`;
  const topologySourceOnly = /\breadiness:Source only\b|\bSource only\b|\btopology_gap:source_only\b|\bneeds locator\b/i.test(topologyReadinessText);
  const topologyDeckGenerated = /\breadiness:Deck generated\b|\bDeck generated\b/i.test(topologyReadinessText);
  const topologyAttemptEvidence = /\breadiness:Attempt evidence\b|\bAttempt evidence\b|\btopology_practice_ready\b/i.test(topologyReadinessText);
  const topologyOverload = /\breadiness:Review overload\b|\bReview overload\b|\btopology_gap:overload\b/i.test(topologyReadinessText);
  const topologyTimedBlock = /\breadiness:Ready for timed block\b|\bReady for timed block\b|\btopology_timed_block\b/i.test(topologyReadinessText);
  return [
    missedTopicFocus
      ? "Medical missed-topic repair queue: use the supplied missed-topic labels as safe metadata only; generate new wording from the student's retained notes and concept graph, not from remembered QBank text."
      : shallowUpgradeFocus
        ? "Medical shallow-card upgrade queue: convert first-order definition cards into source-grounded application prompts, cloze variants, and short clinical vignettes without expanding deck volume unnecessarily."
      : gapClozeDeckFocus
        ? "Medical graph-gap cloze deck queue: generate Anki-compatible cloze rows and short vignette prompts only for the current graph gaps, preserving source locators, chapter/unit tags, and concept supertags."
      : vignetteBlockFocus
        ? "Medical vignette block queue: generate freshly phrased clinical application questions from the current concept graph so the student practices reasoning rather than memorized static card wording."
      : pendingEdgeAttemptFocus
        ? "Medical concept-edge attempt capture: a repair output already exists; ask the student to answer the repaired items or enter their result before generating more variants."
      : conceptEdgeRepairFocus
        ? "Medical concept-edge repair queue: use the supplied relationship ID, score band, and graph tags to regenerate fresh questions for the weak or unattempted concept edge."
      : topologyCoverageFocus
        ? "Medical topology coverage queue: use the carried source/card/attempt coverage state to choose the next action for this scoped course, system, unit, chapter, and concept set."
        : "Medical concept-graph recall rule: regenerate freshly phrased questions from source-backed concept relationships instead of relying on one static front/back card.",
    focusValues.length
      ? `Medical graph scope to preserve: ${focusValues.join(", ")}.`
      : "Medical graph scope to preserve: use detected course, system, unit, chapter, source locator, and concept supertags if available.",
    pendingEdgeAttemptFocus
      ? "Attempt-capture requirement: do not generate additional variants by default; preserve the relationship ID and score-band context, then request or record the student's attempt result."
      : shallowUpgradeFocus
      ? "Upgrade requirement: preserve source locators, chapter/unit tags, and tested concepts while replacing shallow first-order wording with second- or third-order clinical reasoning prompts."
      : topologyCoverageFocus && topologySourceOnly
      ? "Topology coverage requirement: source exists but card inventory is missing; generate cited cloze/vignette rows for this exact scope and preserve source locators where available."
      : topologyCoverageFocus && topologyDeckGenerated
      ? "Topology coverage requirement: deck inventory exists but mastery is not measured; create a short attempt set or ask for attempt evidence before generating more cards."
      : topologyCoverageFocus && topologyAttemptEvidence
      ? "Topology coverage requirement: use existing attempt evidence to target weak edges or phrasing variants, not a broad duplicate deck."
      : topologyCoverageFocus && topologyOverload
      ? "Topology coverage requirement: reduce review load by upgrading, consolidating, or targeting shallow duplicate cards; do not expand card count unless the new item tests an uncovered relationship."
      : topologyCoverageFocus && topologyTimedBlock
      ? "Topology coverage requirement: create a timed vignette block from the scoped concept graph; do not present generated inventory as mastery evidence."
      : gapClozeDeckFocus
      ? "Gap-deck requirement: add only source-backed cloze or vignette rows for missing or weak graph areas; avoid duplicating already-covered cards unless the new item tests a different relationship."
      : vignetteBlockFocus
      ? "Vignette requirement: vary patient age, presentation, distractor framing, and management step while preserving the same source-backed concept relationships and answer rationale."
      : conceptEdgeRepairFocus
      ? "Regeneration requirement: preserve the same tested relationship but vary surface form across cloze, plain recall, and short vignette stems so the student cannot memorize one static card."
      : "Regeneration requirement: vary phrasing across cloze, plain recall, and short vignette stems while testing the same underlying concept relationship.",
    "Relationship requirement: where source evidence supports it, link pathophys, pharmacology, clinical presentation, investigations, management, contraindications, and complications.",
    pendingEdgeAttemptFocus
      ? "Attempt evidence requirement: include parseable rows formatted as medical_edge_attempt | relationship_id: ... | total_items: ... | correct_items: ... | course_tag: ... only after the student answers or explicitly enters their result; never infer correctness from a repair artifact."
      : "Attempt evidence requirement: only after the student has answered regenerated edge questions, include parseable rows formatted as medical_edge_attempt | relationship_id: ... | total_items: ... | correct_items: ... | course_tag: ...; never infer correctness from generated questions alone.",
    input.zettelkastenNextAction
      ? `Medical workflow instruction: ${input.zettelkastenNextAction}`
      : "Medical workflow instruction: prefer high-yield concept gaps and avoid adding cards when the topic is already covered by a cited deck.",
    ...medicalTrustedReferencePromptLines({
      searchQuery: input.searchQuery,
      activeTag: input.activeTag,
      courseTag: input.courseTag,
      unitTag: input.unitTag,
      chapterTag: input.chapterTag,
      knowledgeGraphGroupKey: input.knowledgeGraphGroupKey,
      knowledgeGraphLinkTags: input.knowledgeGraphLinkTags,
      zettelkastenNextAction: input.zettelkastenNextAction,
    }),
  ];
}

export function buildMedicalTopologyCoverageState(input: {
  artifacts: readonly StudyReportArtifact[];
  attempts: readonly StudyAttempt[];
  deadlines: readonly StudyDeadline[];
  sessions: readonly StudySession[];
  courseTag?: string | null;
}): MedicalTopologyCoverageState {
  const courseTag = clean(input.courseTag);
  const scopedArtifacts = courseTag
    ? input.artifacts.filter((artifact) => artifact.courseTag === courseTag || !artifact.courseTag)
    : [...input.artifacts];
  const medicalArtifacts = scopedArtifacts.filter(artifactMatchesMedicalRecall);
  const nodes = new Map<string, {
    artifactIds: Set<string>;
    sourceLabels: Set<string>;
    conceptTags: Set<string>;
    courseTag: string | null;
    systemTag: string | null;
    unitTag: string | null;
    chapterTag: string | null;
    cardCount: number;
    questionCount: number;
    sourceLocatorCount: number;
    shallowRecallCount: number;
  }>();

  for (const artifact of medicalArtifacts) {
    const systemTag = medicalArtifactSystemTag(artifact);
    const keyParts = [
      artifact.courseTag ?? "course:any",
      systemTag ?? "system:any",
      artifact.unitTag ?? "unit:any",
      artifact.chapterTag ?? "chapter:any",
    ];
    const id = keyParts.join("|");
    const existing = nodes.get(id) ?? {
      artifactIds: new Set<string>(),
      sourceLabels: new Set<string>(),
      conceptTags: new Set<string>(),
      courseTag: artifact.courseTag ?? null,
      systemTag,
      unitTag: artifact.unitTag ?? null,
      chapterTag: artifact.chapterTag ?? null,
      cardCount: 0,
      questionCount: 0,
      sourceLocatorCount: 0,
      shallowRecallCount: 0,
    };
    existing.artifactIds.add(artifact.id);
    for (const source of artifact.sourceLabels) existing.sourceLabels.add(source);
    for (const concept of medicalArtifactConceptTags(artifact)) existing.conceptTags.add(concept);
    const itemCount = artifact.structuredItemCount ?? 0;
    if (artifact.reportKind === "flashcard_deck") existing.cardCount += itemCount || 1;
    if (artifact.reportKind === "practice_questions" || artifact.reportKind === "quiz_generator" || artifact.reportKind === "exam_preparation") {
      existing.questionCount += itemCount || 1;
    }
    existing.sourceLocatorCount += sourceLocatorCount(artifact.markdown);
    existing.shallowRecallCount += shallowRecallSignalCount(artifact);
    nodes.set(id, existing);
  }

  const coverageNodes = [...nodes.entries()].map(([id, node]): MedicalTopologyCoverageNode => {
    const attempts = input.attempts.filter((attempt) =>
      node.artifactIds.has(attempt.artifactId ?? "")
      || (!!node.courseTag && attempt.courseTag === node.courseTag)
      || (!node.courseTag && !attempt.courseTag)
    );
    const deadlines = input.deadlines.filter((deadline) =>
      !node.courseTag || deadline.courseTag === node.courseTag || !deadline.courseTag
    );
    const sessions = input.sessions.filter((session) =>
      !node.courseTag || session.courseTag === node.courseTag || !session.courseTag
    );
    const totalAttemptItems = attempts.reduce((sum, attempt) => sum + attempt.totalItems, 0);
    const correctAttemptItems = attempts.reduce((sum, attempt) => sum + attempt.correctItems, 0);
    const scheduledStudyMinutes = sessions.reduce((sum, session) => sum + sessionMinutes(session), 0);
    const sourceCount = node.sourceLabels.size;
    const hasDeck = node.cardCount > 0 || node.questionCount > 0;
    const overloaded = node.cardCount + node.questionCount >= 120 || node.shallowRecallCount >= 20;
    const ready = attempts.length >= 2 && totalAttemptItems >= 20;
    const topologyGrade: MedicalTopologyCoverageNode["topologyGrade"] = ready
      ? "ready"
      : overloaded
        ? "overloaded"
        : attempts.length > 0
          ? "practice"
          : hasDeck
            ? "inventory"
            : sourceCount > 0
              ? "sparse"
              : "empty";
    const readinessLabel: MedicalTopologyReadinessLabel = topologyGrade === "ready"
      ? "Ready for timed block"
      : topologyGrade === "overloaded"
        ? "Review overload"
        : topologyGrade === "practice"
          ? "Attempt evidence"
          : topologyGrade === "inventory"
            ? "Deck generated"
            : topologyGrade === "sparse"
              ? "Source only"
              : "No retained source";
    const scopeLabel = uniqueClean([
      node.courseTag,
      node.systemTag,
      node.unitTag,
      node.chapterTag,
    ], 4).join(" - ") || "medical scope";
    const nextAction = readinessLabel === "No retained source"
      ? "Add retained source material"
      : readinessLabel === "Source only"
        ? "Make cited cloze/vignette cards"
        : readinessLabel === "Deck generated"
          ? "Record attempt evidence"
          : readinessLabel === "Attempt evidence"
            ? "Generate weak-edge variations"
            : readinessLabel === "Review overload"
              ? "Reduce shallow or duplicate card load"
              : "Run timed vignette block";

    return {
      id,
      scopeLabel,
      courseTag: node.courseTag,
      systemTag: node.systemTag,
      unitTag: node.unitTag,
      chapterTag: node.chapterTag,
      conceptTags: [...node.conceptTags].slice(0, 12),
      sourceCount,
      cardCount: node.cardCount,
      questionCount: node.questionCount,
      attemptCount: attempts.length,
      totalAttemptItems,
      correctAttemptItems,
      deadlineCount: deadlines.length,
      scheduledStudyMinutes,
      sourceLocatorCount: node.sourceLocatorCount,
      shallowRecallCount: node.shallowRecallCount,
      topologyGrade,
      readinessLabel,
      nextAction,
    };
  }).sort((left, right) =>
    gradePriority(right.topologyGrade) - gradePriority(left.topologyGrade)
    || right.sourceCount + right.cardCount + right.questionCount + right.attemptCount
      - (left.sourceCount + left.cardCount + left.questionCount + left.attemptCount)
    || left.scopeLabel.localeCompare(right.scopeLabel)
  );

  const topGap = coverageNodes.find((node) =>
    node.readinessLabel === "Source only"
    || node.readinessLabel === "Deck generated"
    || node.readinessLabel === "Review overload"
  );

  return {
    nodes: coverageNodes,
    summaryLabel: coverageNodes.length === 0
      ? "No medical topology coverage nodes yet"
      : `${coverageNodes.length} medical topology coverage node${coverageNodes.length === 1 ? "" : "s"} tracked`,
    topGapLabel: topGap
      ? `${topGap.scopeLabel}: ${topGap.readinessLabel}; ${topGap.nextAction}`
      : null,
  };
}

function gradePriority(grade: MedicalTopologyCoverageNode["topologyGrade"]): number {
  if (grade === "ready") return 5;
  if (grade === "overloaded") return 4;
  if (grade === "practice") return 3;
  if (grade === "inventory") return 2;
  if (grade === "sparse") return 1;
  return 0;
}

export function buildMedicalAnkiReadinessState(input: {
  artifacts: readonly StudyReportArtifact[];
  attempts: readonly StudyAttempt[];
  deadlines: readonly StudyDeadline[];
  sessions: readonly StudySession[];
  courseTag?: string | null;
}): MedicalAnkiReadinessState {
  const courseTag = clean(input.courseTag);
  const scopedArtifacts = courseTag
    ? input.artifacts.filter((artifact) => artifact.courseTag === courseTag || !artifact.courseTag)
    : [...input.artifacts];
  const medicalArtifacts = scopedArtifacts.filter(artifactMatchesMedicalRecall);
  const sourceLabels = uniqueClean(scopedArtifacts.flatMap((artifact) => artifact.sourceLabels), 6);
  const clozeDecks = medicalArtifacts.filter((artifact) => artifact.reportKind === "flashcard_deck");
  const vignettePrompts = medicalArtifacts.filter(artifactMentionsVignette);
  const attempts = courseTag
    ? input.attempts.filter((attempt) => attempt.courseTag === courseTag || !attempt.courseTag)
    : [...input.attempts];
  const deadlines = courseTag
    ? input.deadlines.filter((deadline) => deadline.courseTag === courseTag || !deadline.courseTag)
    : [...input.deadlines];
  const sessions = courseTag
    ? input.sessions.filter((session) => session.courseTag === courseTag || !session.courseTag)
    : [...input.sessions];
  const structuredRows = medicalArtifacts.reduce((sum, artifact) => sum + (artifact.structuredItemCount ?? 0), 0);
  const shallowRecallCount = medicalArtifacts.reduce((sum, artifact) => sum + shallowRecallSignalCount(artifact), 0);
  const totalAttemptItems = attempts.reduce((sum, attempt) => sum + attempt.totalItems, 0);
  const totalCorrectItems = attempts.reduce((sum, attempt) => sum + attempt.correctItems, 0);
  const topologyCoverage = buildMedicalTopologyCoverageState(input);

  const readinessLabel: MedicalAnkiReadinessState["readinessLabel"] =
    attempts.length >= 2 && totalAttemptItems >= 20
      ? "Ready for timed block"
      : attempts.length > 0
        ? "Practice started"
        : medicalArtifacts.length > 0
          ? "Inventory ready"
          : "Not measured";

  const gapLabels = [
    sourceLabels.length === 0 ? "Needs retained lecture/source material" : null,
    clozeDecks.length === 0 ? "Needs cited cloze deck" : null,
    vignettePrompts.length === 0 ? "Needs QBank-style application prompts" : null,
    attempts.length === 0 ? "Needs attempt evidence before mastery claims" : null,
    deadlines.length === 0 ? "Needs exam/deadline context for urgency" : null,
  ].filter((value): value is string => Boolean(value));

  const reviewLoadLabel = structuredRows >= 120
    ? "Review overload risk: many generated rows; prioritize gaps before adding more cards"
    : structuredRows >= 40
      ? "Moderate deck load: use attempts to target weak cards"
      : "Deck load not heavy yet";
  const shallowRecallRatio = structuredRows > 0 ? shallowRecallCount / structuredRows : 0;
  const reviewLoadInterventionLabel = structuredRows >= 120
    ? "Bloat control: repair weak concept edges before adding another broad deck"
    : shallowRecallCount >= 20 || shallowRecallRatio >= 0.35
      ? "Card quality action: upgrade shallow first-order cards into vignette/application prompts"
      : attempts.length > 0 && totalAttemptItems >= 10
        ? "Review targeting: use attempt evidence before expanding the deck"
        : "Review targeting not measured yet";

  const evidenceLabels = [
    sourceLabels.length > 0 ? `${sourceLabels.length} retained source label${sourceLabels.length === 1 ? "" : "s"}` : null,
    clozeDecks.length > 0 ? `${clozeDecks.length} medical cloze deck${clozeDecks.length === 1 ? "" : "s"}` : null,
    vignettePrompts.length > 0 ? `${vignettePrompts.length} vignette-linked output${vignettePrompts.length === 1 ? "" : "s"}` : null,
    structuredRows > 0 ? `${structuredRows} structured recall row${structuredRows === 1 ? "" : "s"}` : null,
    attempts.length > 0 ? `${attempts.length} attempt${attempts.length === 1 ? "" : "s"} (${totalCorrectItems}/${totalAttemptItems} correct)` : null,
    deadlines.length > 0 ? `${deadlines.length} deadline${deadlines.length === 1 ? "" : "s"}` : null,
    sessions.length > 0 ? `${sessions.length} scheduled/planned study session${sessions.length === 1 ? "" : "s"}` : null,
  ].filter((value): value is string => Boolean(value));
  const topologyLabels = [
    topologyCoverage.summaryLabel,
    topologyCoverage.topGapLabel,
  ].filter((value): value is string => Boolean(value));
  const topologyActionNode = topologyCoverage.nodes.find((node) =>
    node.readinessLabel === "Source only"
    || node.readinessLabel === "Deck generated"
    || node.readinessLabel === "Attempt evidence"
    || node.readinessLabel === "Review overload"
    || node.readinessLabel === "Ready for timed block"
  ) ?? null;

  return {
    headline: readinessLabel === "Ready for timed block"
      ? "Medical recall evidence is ready for timed practice."
      : readinessLabel === "Practice started"
        ? "Medical recall practice has started; target weak concepts next."
        : readinessLabel === "Inventory ready"
          ? "Medical recall inventory exists, but mastery is not measured yet."
          : "Medical recall readiness is not measured yet.",
    readinessLabel,
    evidenceLabels,
    gapLabels,
    topologyLabels,
    nextActionLabel: shallowRecallCount >= 20 || shallowRecallRatio >= 0.35
      ? "Upgrade shallow cards"
      : gapLabels.find((gap) => /vignette|cloze/i.test(gap))
        ? "Make cloze/vignette cards for gaps"
      : readinessLabel === "Ready for timed block"
        ? "Run timed vignette block"
        : "Record a short attempt",
    sourceCount: sourceLabels.length,
    clozeDeckCount: clozeDecks.length,
    vignettePromptCount: vignettePrompts.length,
    attemptCount: attempts.length,
    deadlineCount: deadlines.length,
    scheduledSessionCount: sessions.length,
    reviewLoadLabel,
    reviewLoadInterventionLabel,
    shallowRecallCount,
    topologyActionFocus: topologyActionNode
      ? {
        scopeLabel: topologyActionNode.scopeLabel,
        courseTag: topologyActionNode.courseTag,
        systemTag: topologyActionNode.systemTag,
        unitTag: topologyActionNode.unitTag,
        chapterTag: topologyActionNode.chapterTag,
        conceptTags: topologyActionNode.conceptTags,
        readinessLabel: topologyActionNode.readinessLabel,
        nextAction: topologyActionNode.nextAction,
      }
      : null,
  };
}
