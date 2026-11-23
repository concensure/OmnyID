// @locs-version: 1.0
import { buildStudyAcademicScopeCsvTags } from "@/lib/studyAcademicScopeState";

export type StudyResultCsvRow = {
  kind: "flashcard" | "quiz" | "practice" | "study_item";
  prompt: string;
  answer: string;
  source: string;
  difficulty: string;
  tags: string;
  clozeText?: string;
  plainQuestion?: string;
  vignetteStem?: string;
  extra?: string;
  wrongAnswerRationale?: string;
  sourceLocator?: string;
  courseTag?: string;
  systemTag?: string;
  unitTag?: string;
  chapterTag?: string;
  lectureTag?: string;
  conceptTags?: string;
  reviewPriority?: string;
  qualityFlag?: string;
  reasoningOrder?: string;
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueTagList(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.flatMap((item) => clean(item).split(";"))) {
    const tag = value.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function joinTags(values: readonly (string | null | undefined)[]): string {
  return uniqueTagList(values).join("; ");
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function csvForStudyRows(rows: readonly StudyResultCsvRow[]): string {
  const header = [
    "kind",
    "prompt",
    "answer",
    "source",
    "difficulty",
    "tags",
    "cloze_text",
    "plain_question",
    "vignette_stem",
    "extra",
    "wrong_answer_rationale",
    "source_locator",
    "course_tag",
    "system_tag",
    "unit_tag",
    "chapter_tag",
    "lecture_tag",
    "concept_tags",
    "review_priority",
    "quality_flag",
    "reasoning_order",
  ];
  return [
    header.map(csvCell).join(","),
    ...rows.map((row) => [
      row.kind,
      row.prompt,
      row.answer,
      row.source,
      row.difficulty,
      row.tags,
      row.clozeText ?? "",
      row.plainQuestion ?? "",
      row.vignetteStem ?? "",
      row.extra ?? "",
      row.wrongAnswerRationale ?? "",
      row.sourceLocator ?? "",
      row.courseTag ?? "",
      row.systemTag ?? "",
      row.unitTag ?? "",
      row.chapterTag ?? "",
      row.lectureTag ?? "",
      row.conceptTags ?? "",
      row.reviewPriority ?? "",
      row.qualityFlag ?? "",
      row.reasoningOrder ?? "",
    ].map(csvCell).join(",")),
  ].join("\n") + "\n";
}

function stripMarkdownPrefix(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .trim();
}

function rowKindForLine(line: string): StudyResultCsvRow["kind"] {
  if (/\bflash\s*card\b|\bflashcard\b|\bfront\s*:/i.test(line)) return "flashcard";
  if (/\bpractice\b/i.test(line)) return "practice";
  if (/\bq(?:uestion)?\s*\d*[:.)]/i.test(line) || /\bquiz\b/i.test(line)) return "quiz";
  return "study_item";
}

function sourceFromLine(line: string): string {
  const match = line.match(/\bsource\s*:\s*([^;|\]]+)/i);
  return match?.[1]?.trim() ?? "";
}

function difficultyFromLine(line: string): string {
  const match = line.match(/\bdifficulty\s*:\s*([^;|\]]+)/i);
  return match?.[1]?.trim() ?? "";
}

function tagsFromLine(line: string): string {
  const matches = [...line.matchAll(/\b(?:course|week|lecture|chapter|unit|system|tag)_?tag\s*:\s*([^;|\]]+)|\b(?:module|due|deadline|provider|concept_tags|review_priority|quality_flag|reasoning_order|detail_zoom|trusted_reference|source_tier)\s*:\s*([^;|\]]+)/gi)];
  return matches.map((match) => (match[1] ?? match[2])?.trim()).filter(Boolean).join("; ");
}

function detailZoomTagFromText(text: string): string | null {
  if (/\bdetail zoom\s*:\s*fine detail\b|\bdetail_zoom\s*:\s*fine_detail\b/i.test(text)) return "detail_zoom:fine_detail";
  if (/\bdetail zoom\s*:\s*clinical reasoning\b|\bdetail_zoom\s*:\s*clinical_reasoning\b/i.test(text)) return "detail_zoom:clinical_reasoning";
  if (/\bdetail zoom\s*:\s*exam prep\b|\bdetail_zoom\s*:\s*exam_prep\b/i.test(text)) return "detail_zoom:exam_prep";
  if (/\bdetail zoom\s*:\s*survey\b|\bdetail_zoom\s*:\s*survey\b/i.test(text)) return "detail_zoom:survey";
  if (/\bdetail zoom\s*:\s*course level\b|\bdetail_zoom\s*:\s*course_level\b/i.test(text)) return "detail_zoom:course_level";
  return null;
}

function medicalReferenceTagsFromMarkdown(markdown: string): string[] {
  return uniqueTagList([
    /\bMedical trusted grounding\b|\bTrusted medical grounding\b|\bmedical_trusted_grounding\b/i.test(markdown)
      ? "medical_trusted_grounding"
      : null,
    detailZoomTagFromText(markdown),
    /\bTrusted reference supported\b|\btrusted open-reference snippets\b|\btrusted_reference:supported\b/i.test(markdown)
      ? "trusted_reference:supported"
      : null,
    /\bStudent-source primary\b|\bretained student uploads\b|\bstudent uploads and source locators first\b|\btrusted_reference:student_source_primary\b/i.test(markdown)
      ? "trusted_reference:student_source_primary"
      : null,
    /\bNo internal-knowledge citations\b|\bnever treat LLM internal knowledge as source evidence\b|\bdo not invent external citations\b/i.test(markdown)
      ? "trusted_reference:no_internal_knowledge_citations"
      : null,
    /\bClinical dataset restricted\b|\bClinical dataset boundary\b|\bMIMIC\b|\bpatient-level datasets\b/i.test(markdown)
      ? "trusted_reference:clinical_dataset_restricted"
      : null,
  ]);
}

function stripTrailingMetadata(value: string): string {
  return value
    .replace(/\s+\bsource\s*:\s*.+$/i, "")
    .replace(/\s+\bdifficulty\s*:\s*.+$/i, "")
    .replace(/\s+\b(?:course|week|lecture|chapter|unit|tag)_?tag\s*:\s*.+$/i, "")
    .trim();
}

function parsePromptAnswer(line: string): { prompt: string; answer: string } | null {
  const cleanLine = stripMarkdownPrefix(line)
    .replace(/\s+\[(?:source|difficulty|tag)[^\]]+\]/gi, "")
    .trim();
  if (!cleanLine) return null;

  const frontBack = cleanLine.match(/(?:front|prompt|question)\s*:\s*(.+?)\s*(?:\|\s*)?(?:back|answer)\s*:\s*(.+)$/i);
  if (frontBack?.[1] && frontBack[2]) {
    return { prompt: stripTrailingMetadata(frontBack[1]), answer: stripTrailingMetadata(frontBack[2]) };
  }

  const questionAnswer = cleanLine.match(/(?:q(?:uestion)?\s*\d*[:.)]\s*)?(.+?)\s+(?:answer|a)\s*:\s*(.+)$/i);
  if (questionAnswer?.[1] && questionAnswer[2]) {
    return {
      prompt: questionAnswer[1].replace(/^[-\s:]*/, "").trim(),
      answer: stripTrailingMetadata(questionAnswer[2]),
    };
  }

  if (/^(?:q(?:uestion)?\s*\d*[:.)]|front\s*:|prompt\s*:|practice\s*:)/i.test(cleanLine)) {
    return {
      prompt: cleanLine.replace(/^(?:q(?:uestion)?\s*\d*[:.)]|front\s*:|prompt\s*:|practice\s*:)\s*/i, "").trim(),
      answer: "",
    };
  }

  return null;
}

function fieldFromLine(line: string, field: string): string {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`(?:^|[|;\\[]|\\s)${escaped}\\s*:\\s*([^|;\\]]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function firstClean(values: readonly string[]): string {
  return values.map(clean).find(Boolean) ?? "";
}

function parseMedicalRecallRow(line: string, answersIncluded?: boolean | null): StudyResultCsvRow | null {
  const clozeText = fieldFromLine(line, "cloze_text");
  const plainQuestion = fieldFromLine(line, "plain_question");
  const vignetteStem = fieldFromLine(line, "vignette_stem");
  const answer = fieldFromLine(line, "answer");
  const extra = fieldFromLine(line, "extra");
  const wrongAnswerRationale = fieldFromLine(line, "wrong_answer_rationale");
  const sourceLabel = fieldFromLine(line, "source_label") || fieldFromLine(line, "source");
  const sourceLocator = fieldFromLine(line, "source_locator");
  const courseTag = fieldFromLine(line, "course_tag");
  const systemTag = fieldFromLine(line, "system_tag");
  const unitTag = fieldFromLine(line, "unit_tag");
  const chapterTag = fieldFromLine(line, "chapter_tag");
  const lectureTag = fieldFromLine(line, "lecture_tag");
  const conceptTags = fieldFromLine(line, "concept_tags");
  const difficulty = fieldFromLine(line, "difficulty");
  const reviewPriority = fieldFromLine(line, "review_priority");
  const qualityFlag = fieldFromLine(line, "quality_flag");
  const reasoningOrder = fieldFromLine(line, "reasoning_order");
  const prompt = firstClean([clozeText, plainQuestion, vignetteStem]);
  if (!prompt || (!clozeText && !plainQuestion && !vignetteStem && !reasoningOrder)) return null;

  return {
    kind: vignetteStem ? "practice" : "flashcard",
    prompt,
    answer: answersIncluded === false ? "" : answer,
    source: firstClean([sourceLabel, sourceLocator]),
    difficulty,
    tags: joinTags([tagsFromLine(line), courseTag, systemTag, unitTag, chapterTag, lectureTag, conceptTags, reviewPriority, qualityFlag, reasoningOrder]),
    clozeText,
    plainQuestion,
    vignetteStem,
    extra: answersIncluded === false ? "" : extra,
    wrongAnswerRationale: answersIncluded === false ? "" : wrongAnswerRationale,
    sourceLocator,
    courseTag,
    systemTag,
    unitTag,
    chapterTag,
    lectureTag,
    conceptTags,
    reviewPriority,
    qualityFlag,
    reasoningOrder,
  };
}

export function extractStudyCsvRowsFromMarkdown(markdown: string, input?: {
  answersIncluded?: boolean | null;
  sourceLabels?: readonly string[] | null;
  courseTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  moduleLabel?: string | null;
  dueLabel?: string | null;
  deadlineId?: string | null;
  providerId?: string | null;
  extraTags?: readonly string[] | null;
}): StudyResultCsvRow[] {
  const fallbackSource = (input?.sourceLabels ?? []).map(clean).filter(Boolean).join("; ");
  const fallbackTags = joinTags([
    buildStudyAcademicScopeCsvTags(input ?? {}),
    ...medicalReferenceTagsFromMarkdown(markdown),
    ...(input?.extraTags ?? []),
  ]);
  const rows: StudyResultCsvRow[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^(\s*[-*]|\s*\d+[.)])\s+/.test(rawLine) && !/^(?:q(?:uestion)?\s*\d*[:.)]|front\s*:|prompt\s*:|practice\s*:)/i.test(line)) continue;
    const medicalRow = parseMedicalRecallRow(stripMarkdownPrefix(line), input?.answersIncluded);
    if (medicalRow) {
      rows.push({
        ...medicalRow,
        source: medicalRow.source || fallbackSource,
        tags: joinTags([medicalRow.tags, fallbackTags]),
      });
      if (rows.length >= 200) break;
      continue;
    }
    const parsed = parsePromptAnswer(line);
    if (!parsed?.prompt) continue;
    rows.push({
      kind: rowKindForLine(line),
      prompt: parsed.prompt,
      answer: input?.answersIncluded === false ? "" : parsed.answer,
      source: sourceFromLine(line) || fallbackSource,
      difficulty: difficultyFromLine(line),
      tags: joinTags([tagsFromLine(line), fallbackTags]),
    });
    if (rows.length >= 200) break;
  }
  return rows;
}
