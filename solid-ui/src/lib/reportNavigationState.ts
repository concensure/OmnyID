// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";
import type { ReportKind } from "@/lib/reportGeneratorState";
import {
  buildStudyAcademicScopeLabels,
} from "@/lib/studyAcademicScopeState";

export const REPORT_NAVIGATION_STATE_KEY = "omnyid.reports.navigation";
const REPORT_NAVIGATION_STATE_TTL_MS = 5 * 60 * 1000;

export type ReportNavigationIntent = {
  preferredKind: ReportKind;
  goalHint: string;
  source: "files" | "knowledge_graph" | "onboarding" | "study_lens" | "object_search";
  searchQuery: string;
  activeTag: string | null;
  knowledgeMode?: "connected_notes" | "zettelkasten" | "standard";
  academicKind: string | null;
  courseTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
  chapterTag: string | null;
  unitTag: string | null;
  moduleLabel: string | null;
  dueLabel: string | null;
  deadlineId: string | null;
  providerId: string | null;
  zettelkastenStage: string | null;
  zettelkastenNextAction: string | null;
  knowledgeGraphGroupKey: string | null;
  knowledgeGraphLinkTags: string[];
  notice: string | null;
  createdAt: number;
};

export type ReportFocusInput = {
  source: "files" | "knowledge_graph" | "onboarding" | "study_lens" | "object_search";
  preferredKind?: ReportKind | null;
  searchQuery?: string | null;
  activeTag?: string | null;
  activeLens?: KnowledgeGraphLens | "all" | null;
  knowledgeMode?: "connected_notes" | "zettelkasten" | "standard" | null;
  academicKind?: string | null;
  courseTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  moduleLabel?: string | null;
  dueLabel?: string | null;
  deadlineId?: string | null;
  providerId?: string | null;
  zettelkastenStage?: string | null;
  zettelkastenNextAction?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: string[] | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim()),
  )].slice(0, 16);
}

function normalizeReportKind(value: unknown): ReportKind {
  if (
    value === "exam_preparation"
    || value === "day_schedule"
    || value === "assignment_plan"
    || value === "weekly_revision"
    || value === "zettelkasten_synthesis"
    || value === "course_builder"
    || value === "quiz_generator"
    || value === "flashcard_deck"
    || value === "cheatsheet"
    || value === "lecture_summary"
    || value === "practice_questions"
    || value === "guided_study_session"
  ) {
    return value;
  }
  return "exam_preparation";
}

function inferReportKind(input: ReportFocusInput): ReportKind {
  const lens = input.activeLens ?? "all";
  const academicKind = input.academicKind?.trim().toLowerCase() ?? "";
  const query = input.searchQuery?.trim().toLowerCase() ?? "";
  const tagText = [
    input.activeTag,
    input.courseTag,
    input.weekTag,
    input.lectureTag,
    input.chapterTag,
    input.unitTag,
    input.knowledgeGraphGroupKey,
    ...(input.knowledgeGraphLinkTags ?? []),
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const medicalFocusText = `${academicKind} ${query} ${tagText}`;
  const medicalClozeFocus = /\bmedical_cloze_vignette\b|\bmedical[_ -]?(cloze|vignette)\b|\bmedical_topology_coverage\b|\bmedical_gap_cloze_deck\b|\bmedical_vignette_block\b/i.test(medicalFocusText);
  if (
    medicalClozeFocus
    && /\b(vignette block|medical_vignette_block|ready for timed block|attempt evidence|review overload|quality_action:upgrade_first_order|shallow|review[-_ ]?load)\b/i.test(medicalFocusText)
  ) {
    return "practice_questions";
  }
  if (
    medicalClozeFocus
    && /\b(cloze|deck|flashcard|medical_gap_cloze_deck|medical_topology_coverage|topology_gap:source_only|source only|needs locator)\b/i.test(medicalFocusText)
  ) {
    return "flashcard_deck";
  }
  if (
    input.knowledgeMode === "zettelkasten"
    || lens === "zettelkasten"
    || lens === "source_notes"
    || lens === "permanent_notes"
    || Boolean(input.zettelkastenStage)
    || Boolean(input.zettelkastenNextAction)
  ) {
    return "zettelkasten_synthesis";
  }
  if (
    /\b(course builder|course plan|study course|module|syllabus)\b/.test(query)
    || /\b(syllabus|module)\b/.test(academicKind)
    || /\b(syllabus|module)\b/.test(tagText)
  ) {
    return "course_builder";
  }
  if (/\b(quiz|test me|answer key)\b/.test(query)) {
    return "quiz_generator";
  }
  if (/\b(flashcards?|flash cards?|active recall cards?|recall deck)\b/.test(query)) {
    return "flashcard_deck";
  }
  if (/\b(cheatsheet|cheat sheet|exam cram|one[- ]page)\b/.test(query)) {
    return "cheatsheet";
  }
  if (/\b(lecture summary|summarize lecture|catch up|missed class)\b/.test(query)) {
    return "lecture_summary";
  }
  if (/\b(practice question|exam-style|past paper|worked answer)\b/.test(query)) {
    return "practice_questions";
  }
  if (/\b(guided study session|study session|20 minutes|45 minutes|focus session)\b/.test(query)) {
    return "guided_study_session";
  }
  if (
    /\b(assignment|assessment|brief|rubric|marking|criteria|essay|report)\b/.test(academicKind)
    || /\b(assignment|assessment|brief|rubric|marking criteria|essay plan)\b/.test(query)
    || /\b(assignment|assessment|brief|rubric|marking|criteria)\b/.test(tagText)
  ) {
    return "assignment_plan";
  }
  if (/\b(today|tonight|schedule|timetable|time block|time-block|day plan|what should i do first)\b/.test(query)) {
    return "day_schedule";
  }
  if (input.weekTag || input.lectureTag || input.chapterTag || input.unitTag || lens === "study_materials" || lens === "linked_ideas") {
    return "weekly_revision";
  }
  return "exam_preparation";
}

function focusLabel(input: ReportFocusInput): string {
  return [
    ...buildStudyAcademicScopeLabels(input),
    input.weekTag,
    input.lectureTag,
    input.activeTag,
    input.knowledgeGraphGroupKey,
    ...(input.knowledgeGraphLinkTags ?? []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 6)
    .join(", ");
}

function buildGoalHint(input: ReportFocusInput, preferredKind: ReportKind): string {
  const focus = focusLabel(input);
  const suffix = focus ? ` Current focus: ${focus}.` : "";
  const focusText = [
    input.academicKind,
    input.searchQuery,
    input.activeTag,
    input.knowledgeGraphGroupKey,
    ...(input.knowledgeGraphLinkTags ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ");
  const medicalClozeFocus = /\bmedical_cloze_vignette\b|\bmedical[_ -]?(cloze|vignette)\b|\bmedical_topology_coverage\b|\bmedical_gap_cloze_deck\b|\bmedical_vignette_block\b/i.test(focusText);
  switch (preferredKind) {
    case "zettelkasten_synthesis":
      return `Turn my current Zettelkasten and linked study notes into a clear argument trail and next revision actions.${suffix}`;
    case "assignment_plan":
      return `Turn my current assignment material into a step-by-step execution plan with risks and first writing actions.${suffix}`;
    case "weekly_revision":
      return `Create a weekly revision report from my current linked study focus.${suffix}`;
    case "day_schedule":
      return `Create a realistic study schedule for today using my current academic priorities.${suffix}`;
    case "exam_preparation":
      return `Create an exam preparation report using my current connected study memory.${suffix}`;
    case "course_builder":
      return `Turn my current course sources, deadlines, and study goal into a structured AI course plan.${suffix}`;
    case "quiz_generator":
      return `Generate a source-grounded quiz from my current linked study material, with answers and weak-topic follow-ups.${suffix}`;
    case "flashcard_deck":
      if (medicalClozeFocus) {
        return `Generate source-grounded medical cloze/vignette cards from my current concept graph, preserving source locators, chapter/unit tags, and concept supertags.${suffix}`;
      }
      return `Generate flashcards from my current linked study material, grouped by concept and revision priority.${suffix}`;
    case "cheatsheet":
      return `Create a compact cheatsheet from my current linked study material, with source caveats and exam traps.${suffix}`;
    case "lecture_summary":
      return `Summarize the current lecture or reading focus so I can catch up quickly and know what to do next.${suffix}`;
    case "practice_questions":
      if (medicalClozeFocus) {
        return `Generate freshly phrased medical vignette/application questions from my current concept graph, with answers, rationales, source locators, and no copied proprietary QBank text.${suffix}`;
      }
      return `Generate exam-style practice questions from my current study focus, with worked answer guidance.${suffix}`;
    case "guided_study_session":
      return `Guide my next study session using my current deadline, weak concepts, and linked study memory.${suffix}`;
  }
}

export function buildReportIntentFromFocus(input: ReportFocusInput): ReportNavigationIntent {
  const preferredKind = input.preferredKind ? normalizeReportKind(input.preferredKind) : inferReportKind(input);
  return {
    preferredKind,
    goalHint: buildGoalHint(input, preferredKind),
    source: input.source,
    searchQuery: normalizeString(input.searchQuery) ?? "",
    activeTag: normalizeString(input.activeTag),
    knowledgeMode:
      input.knowledgeMode === "connected_notes" || input.knowledgeMode === "zettelkasten" || input.knowledgeMode === "standard"
        ? input.knowledgeMode
        : undefined,
    academicKind: normalizeString(input.academicKind),
    courseTag: normalizeString(input.courseTag),
    weekTag: normalizeString(input.weekTag),
    lectureTag: normalizeString(input.lectureTag),
    chapterTag: normalizeString(input.chapterTag),
    unitTag: normalizeString(input.unitTag),
    moduleLabel: normalizeString(input.moduleLabel),
    dueLabel: normalizeString(input.dueLabel),
    deadlineId: normalizeString(input.deadlineId),
    providerId: normalizeString(input.providerId),
    zettelkastenStage: normalizeString(input.zettelkastenStage),
    zettelkastenNextAction: normalizeString(input.zettelkastenNextAction),
    knowledgeGraphGroupKey: normalizeString(input.knowledgeGraphGroupKey),
    knowledgeGraphLinkTags: normalizeStringList(input.knowledgeGraphLinkTags),
    notice:
      input.source === "files"
        ? "Reports opened from your current Files focus."
        : input.source === "knowledge_graph"
          ? "Reports opened from your current Knowledge Graph focus."
          : input.source === "study_lens"
            ? "Reports opened from Study Lens."
            : input.source === "object_search"
              ? "Reports opened from object search."
              : "Reports opened from onboarding.",
    createdAt: Date.now(),
  };
}

export function normalizeReportNavigationIntent(value: unknown): ReportNavigationIntent | null {
  if (!isRecord(value)) return null;
  const source = value.source === "files"
    || value.source === "knowledge_graph"
    || value.source === "onboarding"
    || value.source === "study_lens"
    || value.source === "object_search"
    ? value.source
    : "onboarding";
  const base: ReportNavigationIntent = {
    preferredKind: normalizeReportKind(value.preferredKind),
    goalHint: normalizeString(value.goalHint) ?? "Create a useful study report from my connected academic memory.",
    source,
    searchQuery: normalizeString(value.searchQuery) ?? "",
    activeTag: normalizeString(value.activeTag),
    knowledgeMode:
      value.knowledgeMode === "connected_notes" || value.knowledgeMode === "zettelkasten" || value.knowledgeMode === "standard"
        ? value.knowledgeMode
        : undefined,
    academicKind: normalizeString(value.academicKind),
    courseTag: normalizeString(value.courseTag),
    weekTag: normalizeString(value.weekTag),
    lectureTag: normalizeString(value.lectureTag),
    chapterTag: normalizeString(value.chapterTag),
    unitTag: normalizeString(value.unitTag),
    moduleLabel: normalizeString(value.moduleLabel),
    dueLabel: normalizeString(value.dueLabel),
    deadlineId: normalizeString(value.deadlineId),
    providerId: normalizeString(value.providerId),
    zettelkastenStage: normalizeString(value.zettelkastenStage),
    zettelkastenNextAction: normalizeString(value.zettelkastenNextAction),
    knowledgeGraphGroupKey: normalizeString(value.knowledgeGraphGroupKey),
    knowledgeGraphLinkTags: normalizeStringList(value.knowledgeGraphLinkTags),
    notice: normalizeString(value.notice),
    createdAt:
      typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
        ? value.createdAt
        : Date.now(),
  };
  return base;
}

export function saveReportNavigationIntent(value: ReportNavigationIntent): ReportNavigationIntent | null {
  const normalized = normalizeReportNavigationIntent(value);
  if (!normalized) return null;
  try {
    sessionStorage.setItem(REPORT_NAVIGATION_STATE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore session storage failures
  }
  return normalized;
}

export function consumeReportNavigationIntent(
  maxAgeMs = REPORT_NAVIGATION_STATE_TTL_MS,
): ReportNavigationIntent | null {
  try {
    const raw = sessionStorage.getItem(REPORT_NAVIGATION_STATE_KEY);
    if (!raw) return null;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      sessionStorage.removeItem(REPORT_NAVIGATION_STATE_KEY);
      return null;
    }
    const normalized = normalizeReportNavigationIntent(parsed.value);
    if (!normalized || Date.now() - normalized.createdAt > maxAgeMs) {
      sessionStorage.removeItem(REPORT_NAVIGATION_STATE_KEY);
      return null;
    }
    sessionStorage.removeItem(REPORT_NAVIGATION_STATE_KEY);
    return normalized;
  } catch {
    try {
      sessionStorage.removeItem(REPORT_NAVIGATION_STATE_KEY);
    } catch {
      // ignore session storage failures
    }
    return null;
  }
}
