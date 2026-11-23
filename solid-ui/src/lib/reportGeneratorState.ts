// @locs-version: 1.0
import type { AfpMessage, AttachmentRetentionMode, KnowledgeOrganizationMode } from "@/lib/api";
import { attachKnowledgeGraphBacklinks, extractKnowledgeCards } from "@/lib/knowledgeGraphData";
import type { KnowledgeCard } from "@/lib/knowledgeGraphTypes";
import {
  medicalAnkiContractPromptLines,
  medicalAnkiFocusPromptLines,
} from "@/lib/medicalAnkiStudyState";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import { studyOutputContractPromptLines } from "@/lib/studyOutputTemplateContractState";
import {
  buildStudyAcademicScopePromptValues,
} from "@/lib/studyAcademicScopeState";

export type ReportKind =
  | "exam_preparation"
  | "day_schedule"
  | "assignment_plan"
  | "weekly_revision"
  | "zettelkasten_synthesis"
  | "course_builder"
  | "quiz_generator"
  | "flashcard_deck"
  | "cheatsheet"
  | "lecture_summary"
  | "practice_questions"
  | "guided_study_session";

export type ReportTemplate = {
  kind: ReportKind;
  label: string;
  description: string;
  outputPromise: string;
  recommendedGoal: string;
};

export type ReadyReportLauncherGroupId = "start_now" | "study_materials" | "planning" | "thinking";

export type ReadyReportLauncherOption = {
  kind: ReportKind;
  label: string;
  description: string;
  outputPromise: string;
  recommendedOutputFormat: ReportOutputFormat;
  selected: boolean;
  contextHint: string;
};

export type ReadyReportLauncherGroup = {
  id: ReadyReportLauncherGroupId;
  label: string;
  description: string;
  options: ReadyReportLauncherOption[];
};

export type ReadyReportLauncherState = {
  summaryLabel: string;
  selectedLabel: string;
  groups: ReadyReportLauncherGroup[];
};

export type ReportOutputSection = {
  title: string;
  detail: string;
};

export type ReportSourceRequirement = {
  label: string;
  examples: string;
};

export type ReportUrgencyLevel = "normal" | "soon" | "urgent";
export type ReportStressLevel = "steady" | "stressed" | "overwhelmed";
export type ReportOutputFormat = "chat_markdown" | "print_ready" | "copyable_outline" | "csv_flashcards";

export type ReportStudentState = {
  urgency: ReportUrgencyLevel;
  stress: ReportStressLevel;
};

export type ReportOutputFormatOption = {
  value: ReportOutputFormat;
  label: string;
  promptHint: string;
};

export type ReportReadinessLevel = "needs_source" | "needs_scope" | "draft_ready" | "grounded_ready";
export type ReportSourceCoverageLevel = "none" | "single_source" | "multi_source" | "connected_multi_source";

export type ReportKnowledgeContext = {
  cardCount: number;
  focusedCardCount: number;
  linkedCardCount: number;
  zettelkastenCardCount: number;
  sourceCount: number;
  sourceCoverageLevel: ReportSourceCoverageLevel;
  sourceCoverageSummary: string;
  topSupertags: string[];
  graphAnchors: string[];
  evidenceSources: string[];
  missingInputs: string[];
  zettelkastenNextActions: string[];
  courseTags: string[];
  weekTags: string[];
  chapterTags: string[];
  unitTags: string[];
  topologySummary: string;
  readinessLevel: ReportReadinessLevel;
  readinessLabel: string;
};

export type ReportImmediateAction = {
  label: string;
  detail: string;
};

export const REPORT_ACADEMIC_INTEGRITY_GUARDRAILS: readonly string[] = [
  "Use reports as study planning, revision, outlining, and source synthesis support; do not present unsourced claims as final academic work.",
  "For assignments, provide structure, risks, and evidence gaps instead of writing a submission-ready answer to hand in unchanged.",
  "Mark uncertain conclusions and tell the student which source, note, or card would strengthen the claim.",
] as const;

export type ReportPromptFocus = {
  source?: "files" | "knowledge_graph" | "onboarding" | "study_lens" | "object_search" | null;
  searchQuery?: string | null;
  activeTag?: string | null;
  knowledgeMode?: KnowledgeOrganizationMode | null;
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

export type ReportQuickStartInput = {
  kind: ReportKind;
  goal: string;
  upcomingExam?: string;
  studentState?: Partial<ReportStudentState> | null;
  outputFormat?: ReportOutputFormat | null;
  messages: AfpMessage[];
  focus?: ReportPromptFocus | null;
};

export const REPORT_TEMPLATES: readonly ReportTemplate[] = [
  {
    kind: "exam_preparation",
    label: "Exam preparation report",
    description: "Prioritize topics, weak areas, and the next study blocks before an upcoming exam.",
    outputPromise: "A ranked revision plan, concept map, practice prompts, and next 48-hour schedule.",
    recommendedGoal: "I have an exam coming up and need to know what to revise first.",
  },
  {
    kind: "day_schedule",
    label: "Today study schedule",
    description: "Turn the student's academic pressure into a realistic day plan.",
    outputPromise: "A time-blocked schedule with breaks, must-do work, and lower-pressure fallback tasks.",
    recommendedGoal: "I feel behind today and need a realistic plan I can actually follow.",
  },
  {
    kind: "assignment_plan",
    label: "Assignment execution report",
    description: "Use briefs, rubrics, notes, and related concepts to produce a concrete assignment plan.",
    outputPromise: "A task breakdown, marking-risk checklist, source gaps, and first writing step.",
    recommendedGoal: "I need to turn an assignment brief into clear next actions.",
  },
  {
    kind: "weekly_revision",
    label: "Weekly revision report",
    description: "Connect this week's lectures, readings, notes, and tutorial material.",
    outputPromise: "A study summary, overlaps across sources, likely exam cues, and what to revisit.",
    recommendedGoal: "I need to understand what mattered this week and how it connects.",
  },
  {
    kind: "zettelkasten_synthesis",
    label: "Zettelkasten synthesis report",
    description: "Convert source notes and linked permanent notes into a coherent argument trail.",
    outputPromise: "A linked thought sequence, tensions, contribution notes, and manuscript-ready outline.",
    recommendedGoal: "I want to develop these notes into connected arguments, not just store them.",
  },
  {
    kind: "course_builder",
    label: "AI course builder",
    description: "Turn a subject goal, source coverage, and deadline into a structured study course.",
    outputPromise: "A module-by-module course path, weekly rhythm, checkpoints, and missing-source list.",
    recommendedGoal: "I need a structured course plan from my files, goals, and exam timeline.",
  },
  {
    kind: "quiz_generator",
    label: "Quiz generator",
    description: "Create source-grounded quiz questions from retained notes, files, and graph clusters.",
    outputPromise: "A marked quiz with answer key, source references, and weak-topic follow-ups.",
    recommendedGoal: "I need a quiz to test what I actually understand from this material.",
  },
  {
    kind: "flashcard_deck",
    label: "Flashcard deck",
    description: "Convert lecture and reading knowledge into fast active-recall cards.",
    outputPromise: "A deck of question/answer cards grouped by concept, source, and priority.",
    recommendedGoal: "I need flashcards for the key definitions, examples, and exam traps.",
  },
  {
    kind: "cheatsheet",
    label: "Cheatsheet builder",
    description: "Compress linked course material into a printable, exam-cram study sheet.",
    outputPromise: "A one-page or cram-style sheet with definitions, examples, formulas, and traps.",
    recommendedGoal: "I need a cheatsheet that shows the highest-value material for revision.",
  },
  {
    kind: "lecture_summary",
    label: "Lecture summary",
    description: "Summarize one lecture, tutorial, reading, or source cluster without losing source links.",
    outputPromise: "A clear summary, key concepts, confusing points, and follow-up questions.",
    recommendedGoal: "I need this lecture or reading explained clearly so I can catch up quickly.",
  },
  {
    kind: "practice_questions",
    label: "Practice questions",
    description: "Generate exam-style practice questions from source material and graph-linked concepts.",
    outputPromise: "Short-answer, multiple-choice, and applied questions with answer guidance.",
    recommendedGoal: "I need exam-style practice questions for the topics I am weakest on.",
  },
  {
    kind: "guided_study_session",
    label: "Guided study session",
    description: "Run a focused study session using deadlines, weak concepts, graph links, and energy level.",
    outputPromise: "A 20- or 45-minute session plan with recall prompts, checks, and next action.",
    recommendedGoal: "I need OmnyID to guide my next study session so I can start now.",
  },
] as const;

const READY_REPORT_GROUPS: readonly Omit<ReadyReportLauncherGroup, "options">[] = [
  {
    id: "start_now",
    label: "Start now",
    description: "Exam prep, day planning, and guided sessions for students who need a useful next action immediately.",
  },
  {
    id: "study_materials",
    label: "Generate study material",
    description: "Quizzes, flashcards, cheatsheets, summaries, and practice questions from retained academic context.",
  },
  {
    id: "planning",
    label: "Plan the workload",
    description: "Course paths, assignment execution plans, and weekly revision reports tied to deadlines and source coverage.",
  },
  {
    id: "thinking",
    label: "Develop connected thinking",
    description: "Zettelkasten synthesis that turns source notes and graph links into durable argument trails.",
  },
] as const;

const READY_REPORT_GROUP_KINDS: Record<ReadyReportLauncherGroupId, readonly ReportKind[]> = {
  start_now: ["exam_preparation", "day_schedule", "guided_study_session"],
  study_materials: ["quiz_generator", "flashcard_deck", "cheatsheet", "lecture_summary", "practice_questions"],
  planning: ["course_builder", "assignment_plan", "weekly_revision"],
  thinking: ["zettelkasten_synthesis"],
};

const DEFAULT_REPORT_TEMPLATE = REPORT_TEMPLATES[0];
const DEFAULT_STUDENT_STATE: ReportStudentState = {
  urgency: "soon",
  stress: "stressed",
};

const REPORT_OUTPUT_SECTIONS: Record<ReportKind, ReportOutputSection[]> = {
  exam_preparation: [
    { title: "Priority map", detail: "Rank examinable concepts by confidence, source coverage, and likely assessment value." },
    { title: "Weak-area drills", detail: "Generate practice questions and active-recall prompts for the weakest topics." },
    { title: "Next 48 hours", detail: "Turn the priority map into realistic study blocks, breaks, and fallback work." },
  ],
  day_schedule: [
    { title: "Today plan", detail: "Build a time-blocked schedule that fits energy, deadlines, and realistic breaks." },
    { title: "Triage list", detail: "Separate must-do work from lower-value tasks the student can ignore today." },
    { title: "Recovery path", detail: "Provide a smaller fallback plan if the student starts late or gets overwhelmed." },
  ],
  assignment_plan: [
    { title: "Brief breakdown", detail: "Extract requirements, marking risks, missing sources, and submission constraints." },
    { title: "Execution plan", detail: "Create milestones, first writing steps, and a draft structure." },
    { title: "Evidence checklist", detail: "Map retained sources and graph concepts to claims the student can support." },
  ],
  weekly_revision: [
    { title: "Week synthesis", detail: "Summarize lectures, readings, notes, and tutorial material without losing source links." },
    { title: "Concept connections", detail: "Show overlaps, contradictions, and repeated ideas across retained material." },
    { title: "Revision queue", detail: "List what to revisit, what to practice, and what can wait." },
  ],
  zettelkasten_synthesis: [
    { title: "Argument trail", detail: "Convert linked source and permanent notes into a full-sentence thought sequence." },
    { title: "Connection audit", detail: "Identify contributions, challenges, alterations, and missing links in the note chain." },
    { title: "Next note moves", detail: "Suggest permanent-note edits, branches, and manuscript-ready outline steps." },
  ],
  course_builder: [
    { title: "Course path", detail: "Break the student's goal into modules ordered by deadline, prerequisite concepts, and source coverage." },
    { title: "Weekly rhythm", detail: "Convert the path into realistic weekly study blocks, revision loops, and checkpoint tasks." },
    { title: "Coverage gaps", detail: "Show missing lectures, readings, deadlines, or weak graph areas before the course plan is trusted." },
  ],
  quiz_generator: [
    { title: "Question set", detail: "Generate source-grounded quiz questions across definitions, applications, and common exam traps." },
    { title: "Answer key", detail: "Provide concise answers with source references and confidence caveats." },
    { title: "Weak-topic follow-up", detail: "Map missed or hard questions back to graph concepts and next review actions." },
  ],
  flashcard_deck: [
    { title: "Recall cards", detail: "Create question/answer cards for key terms, contrasts, examples, and formula-style facts." },
    { title: "Priority groups", detail: "Group cards by course, week, graph cluster, and exam relevance." },
    { title: "Review order", detail: "Suggest which cards to drill first based on weak links and upcoming deadlines." },
  ],
  cheatsheet: [
    { title: "Compressed sheet", detail: "Condense high-value concepts into a one-page or exam-cram structure." },
    { title: "Definitions and traps", detail: "Include key definitions, formulas, examples, contrasts, and common mistakes." },
    { title: "Source caveats", detail: "Mark which sections are grounded in uploaded material and which need more evidence." },
  ],
  lecture_summary: [
    { title: "Plain-English summary", detail: "Explain the source in simple language without removing academic precision." },
    { title: "Key concepts", detail: "Extract terms, people, examples, and links to prior notes or graph clusters." },
    { title: "Catch-up actions", detail: "Give the student the next questions, flashcards, or review tasks to close gaps." },
  ],
  practice_questions: [
    { title: "Exam-style questions", detail: "Generate short-answer, applied, multiple-choice, and compare/contrast questions." },
    { title: "Worked answers", detail: "Include answer guidance, marking hints, and source-backed explanation." },
    { title: "Practice schedule", detail: "Turn questions into a manageable sequence for the next study block." },
  ],
  guided_study_session: [
    { title: "Session plan", detail: "Create a 20- or 45-minute flow with one start action, review, recall, and check phases." },
    { title: "Active recall", detail: "Ask focused prompts from the student's linked notes instead of passive rereading." },
    { title: "Session closeout", detail: "Summarize progress, unresolved confusion, and the next retained study action." },
  ],
};

const REPORT_SOURCE_REQUIREMENTS: Record<ReportKind, ReportSourceRequirement[]> = {
  exam_preparation: [
    { label: "Lecture or tutorial notes", examples: "typed notes, rough screenshots, voice memo transcript, or slide export" },
    { label: "Assessment scope", examples: "syllabus, topic list, learning outcomes, or exam announcement" },
    { label: "Practice material", examples: "past paper, quiz mistakes, revision questions, or marked feedback" },
  ],
  day_schedule: [
    { label: "Deadline context", examples: "exam date, assignment due date, class timetable, or task list" },
    { label: "Current workload", examples: "rough notes, TODO list, calendar screenshot, or pasted brain dump" },
    { label: "Energy constraints", examples: "work shifts, commute, sleep limit, or blocked study times" },
  ],
  assignment_plan: [
    { label: "Assignment brief", examples: "question sheet, LMS task page, or copied instructions" },
    { label: "Rubric or marking criteria", examples: "rubric PDF, marking guide, learning outcomes, or feedback sheet" },
    { label: "Relevant sources", examples: "readings, lecture notes, source notes, or annotated bibliography" },
  ],
  weekly_revision: [
    { label: "This week's class material", examples: "lecture slides, tutorial notes, lab notes, or reading notes" },
    { label: "Previous related material", examples: "last week's notes, linked concepts, or earlier quiz mistakes" },
    { label: "Course signal", examples: "course tag, week number, lecture title, or topic name" },
  ],
  zettelkasten_synthesis: [
    { label: "Source notes", examples: "reading notes, page references, lecture extracts, or quote summaries" },
    { label: "Permanent notes", examples: "full-sentence ideas, claims, tensions, or concept explanations" },
    { label: "Linking intent", examples: "what this note contributes to, challenges, alters, or branches from" },
  ],
  course_builder: [
    { label: "Course outline", examples: "syllabus, weekly topic list, LMS overview, or subject guide" },
    { label: "Assessment timeline", examples: "exam date, assignment deadlines, quiz dates, or calendar notes" },
    { label: "Existing source coverage", examples: "lecture slides, readings, rough notes, or prior summaries" },
  ],
  quiz_generator: [
    { label: "Testable source material", examples: "lecture notes, readings, slides, tutorial questions, or textbook extracts" },
    { label: "Scope signal", examples: "course tag, week tag, topic list, learning outcomes, or exam announcement" },
    { label: "Difficulty target", examples: "easy recall, mixed practice, final-exam level, or weak topics" },
  ],
  flashcard_deck: [
    { label: "Definition-heavy material", examples: "lecture notes, glossaries, readings, formulas, or concept lists" },
    { label: "Exam scope", examples: "week range, topic tag, lecture title, or assessment scope" },
    { label: "Known weak areas", examples: "quiz mistakes, confusing concepts, or low-confidence notes" },
  ],
  cheatsheet: [
    { label: "High-value revision material", examples: "lecture slides, summary notes, formula sheets, or readings" },
    { label: "Assessment scope", examples: "exam announcement, week range, topic list, or learning outcomes" },
    { label: "Format preference", examples: "one-page, exam cram, formulas only, or deep explanation" },
  ],
  lecture_summary: [
    { label: "Lecture or reading source", examples: "slides, transcript, voice memo, PDF reading, or pasted rough notes" },
    { label: "Course context", examples: "course code, week number, lecture title, or tutorial topic" },
    { label: "Confusing point", examples: "what the student missed, did not understand, or needs explained first" },
  ],
  practice_questions: [
    { label: "Exam scope", examples: "topic range, learning outcomes, past paper, or lecturer hint" },
    { label: "Source material", examples: "lecture notes, readings, slides, source cards, or Zettelkasten notes" },
    { label: "Question style", examples: "short answer, MCQ, applied scenario, essay outline, or calculations" },
  ],
  guided_study_session: [
    { label: "Study target", examples: "exam, assignment, weak topic, course tag, or graph cluster" },
    { label: "Available time", examples: "20 minutes, 45 minutes, tonight only, or between classes" },
    { label: "Student constraint", examples: "stress level, work shift, commute, fatigue, or deadline pressure" },
  ],
};

export const REPORT_URGENCY_OPTIONS: ReadonlyArray<{
  value: ReportUrgencyLevel;
  label: string;
  promptHint: string;
}> = [
  { value: "normal", label: "Not immediate", promptHint: "The student has time to build momentum without compressing everything into today." },
  { value: "soon", label: "Due soon", promptHint: "The student needs a clear short-term plan and should prioritize the next two days." },
  { value: "urgent", label: "Very urgent", promptHint: "The student needs triage, the smallest useful next step, and a realistic emergency plan." },
] as const;

export const REPORT_STRESS_OPTIONS: ReadonlyArray<{
  value: ReportStressLevel;
  label: string;
  promptHint: string;
}> = [
  { value: "steady", label: "Steady", promptHint: "Keep the report concise and action-oriented without over-explaining." },
  { value: "stressed", label: "Stressed", promptHint: "Use calm language, reduce choices, and make the first action easy to start." },
  { value: "overwhelmed", label: "Overwhelmed", promptHint: "Avoid long task lists; give only the highest-value priorities and one tiny first step." },
] as const;

export const REPORT_OUTPUT_FORMAT_OPTIONS: readonly ReportOutputFormatOption[] = [
  {
    value: "chat_markdown",
    label: "Chat report",
    promptHint: "Format the answer as clean Markdown inside chat with headings, bullets, source caveats, and next actions.",
  },
  {
    value: "print_ready",
    label: "Print-ready",
    promptHint: "Format the answer as a compact print-ready study sheet with concise sections and minimal conversational framing.",
  },
  {
    value: "copyable_outline",
    label: "Copyable outline",
    promptHint: "Format the answer as a copyable outline the student can paste into notes, with numbered sections and action checkboxes.",
  },
  {
    value: "csv_flashcards",
    label: "CSV flashcards",
    promptHint: "If generating cards or questions, include a CSV-style table with front, back, source, difficulty, and tag columns.",
  },
] as const;

export function reportOutputFormatOption(value?: ReportOutputFormat | null): ReportOutputFormatOption {
  return REPORT_OUTPUT_FORMAT_OPTIONS.find((option) => option.value === value)
    ?? REPORT_OUTPUT_FORMAT_OPTIONS[0];
}

export function recommendedReportOutputFormat(kind: ReportKind): ReportOutputFormat {
  if (kind === "cheatsheet") return "print_ready";
  if (kind === "flashcard_deck") return "csv_flashcards";
  if (kind === "course_builder" || kind === "assignment_plan" || kind === "guided_study_session") {
    return "copyable_outline";
  }
  return "chat_markdown";
}

function readyReportContextHint(template: ReportTemplate, context: ReportKnowledgeContext): string {
  if (context.cardCount === 0) {
    return "Attach or paste one lecture, reading, syllabus, or note first so this output is source-grounded.";
  }
  if (template.kind === "zettelkasten_synthesis" && context.zettelkastenCardCount === 0) {
    return "Available now, but stronger after one source is converted into Zettelkasten-style notes.";
  }
  if (context.sourceCoverageLevel === "connected_multi_source") {
    return "Ready to use retained files, supertags, graph links, and source evidence.";
  }
  if (context.sourceCoverageLevel === "multi_source") {
    return "Ready from multiple retained sources; graph links will improve the next pass.";
  }
  return "Works from the current source; add one related lecture, reading, or rubric for stronger synthesis.";
}

export function buildReadyReportLauncherState(input: {
  selectedKind: ReportKind;
  context: ReportKnowledgeContext;
}): ReadyReportLauncherState {
  const selectedTemplate = reportTemplateForKind(input.selectedKind);
  const groups = READY_REPORT_GROUPS.map((group) => ({
    ...group,
    options: READY_REPORT_GROUP_KINDS[group.id].map((kind) => {
      const template = reportTemplateForKind(kind);
      return {
        kind,
        label: template.label,
        description: template.description,
        outputPromise: template.outputPromise,
        recommendedOutputFormat: recommendedReportOutputFormat(kind),
        selected: kind === input.selectedKind,
        contextHint: readyReportContextHint(template, input.context),
      };
    }),
  }));

  return {
    summaryLabel: `${REPORT_TEMPLATES.length} ready report types`,
    selectedLabel: selectedTemplate.label,
    groups,
  };
}

function dedupe(values: readonly string[], limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function compactLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/^([a-z]+):/i, "$1: ");
}

function compactListItem(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

function normalizeStudentState(value?: Partial<ReportStudentState> | null): ReportStudentState {
  const urgency = value?.urgency === "normal" || value?.urgency === "soon" || value?.urgency === "urgent"
    ? value.urgency
    : DEFAULT_STUDENT_STATE.urgency;
  const stress = value?.stress === "steady" || value?.stress === "stressed" || value?.stress === "overwhelmed"
    ? value.stress
    : DEFAULT_STUDENT_STATE.stress;
  return { urgency, stress };
}

function studentStateInstruction(value?: Partial<ReportStudentState> | null): string {
  const state = normalizeStudentState(value);
  const urgencyHint = REPORT_URGENCY_OPTIONS.find((option) => option.value === state.urgency)?.promptHint;
  const stressHint = REPORT_STRESS_OPTIONS.find((option) => option.value === state.stress)?.promptHint;
  return `Student state: urgency=${state.urgency}; stress=${state.stress}. ${urgencyHint ?? ""} ${stressHint ?? ""}`.trim();
}

function normalizedFocusValues(focus?: ReportPromptFocus | null): string[] {
  if (!focus) return [];
  return dedupe([
    focus.source ? `source:${focus.source}` : "",
    focus.searchQuery ? `search:${focus.searchQuery}` : "",
    focus.activeTag ?? "",
    focus.knowledgeMode ? `knowledge_mode:${focus.knowledgeMode}` : "",
    ...buildStudyAcademicScopePromptValues(focus),
    focus.weekTag ?? "",
    focus.lectureTag ?? "",
    focus.zettelkastenStage ? `zettelkasten_stage:${focus.zettelkastenStage}` : "",
    focus.zettelkastenNextAction ? `zettelkasten_next_action:${focus.zettelkastenNextAction}` : "",
    focus.knowledgeGraphGroupKey ?? "",
    ...(focus.knowledgeGraphLinkTags ?? []),
  ], 24);
}

function focusInstruction(focus?: ReportPromptFocus | null): string | null {
  const values = normalizedFocusValues(focus);
  if (values.length === 0) return null;
  return `Current report focus to prioritize: ${values.join(", ")}.`;
}

function normalizedSearchTokens(value?: string | null): string[] {
  if (!value) return [];
  return dedupe(
    value
      .toLowerCase()
      .split(/[^a-z0-9:_-]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
    8,
  );
}

function normalizedCardSearchText(card: KnowledgeCard): string {
  return [
    card.title,
    card.summary,
    card.sourceTitle ?? "",
    card.sourceFileName ?? "",
    card.academicKind ?? "",
    card.academicCourseTag ?? "",
    card.academicWeekTag ?? "",
    card.academicLectureTag ?? "",
    card.academicChapterTag ?? "",
    card.academicUnitTag ?? "",
    card.zettelkastenStage ?? "",
    card.zettelkastenNextAction ?? "",
    card.knowledgeGraphGroupKey ?? "",
    ...card.supertags,
    ...(card.canonicalSupertags ?? []),
    ...(card.knowledgeGraphLinkTags ?? []),
  ].join(" ").toLowerCase();
}

function cardMatchesFocus(card: KnowledgeCard, focus?: ReportPromptFocus | null): boolean {
  if (!focus) return false;
  const checks = [
    focus.activeTag && (card.supertags.includes(focus.activeTag) || card.canonicalSupertags?.includes(focus.activeTag)),
    focus.knowledgeMode === "zettelkasten" && card.knowledgeMode === "zettelkasten",
    focus.academicKind && card.academicKind === focus.academicKind,
    focus.courseTag && card.academicCourseTag === focus.courseTag,
    focus.weekTag && card.academicWeekTag === focus.weekTag,
    focus.lectureTag && card.academicLectureTag === focus.lectureTag,
    focus.chapterTag && card.academicChapterTag === focus.chapterTag,
    focus.unitTag && card.academicUnitTag === focus.unitTag,
    focus.zettelkastenStage && card.zettelkastenStage === focus.zettelkastenStage,
    focus.zettelkastenNextAction && card.zettelkastenNextAction === focus.zettelkastenNextAction,
    focus.knowledgeGraphGroupKey && card.knowledgeGraphGroupKey === focus.knowledgeGraphGroupKey,
    ...(focus.knowledgeGraphLinkTags ?? []).map((tag) =>
      card.knowledgeGraphLinkTags?.includes(tag)
      || card.supertags.includes(tag)
      || card.canonicalSupertags?.includes(tag),
    ),
  ];
  if (checks.some(Boolean)) return true;

  const searchTokens = normalizedSearchTokens(focus.searchQuery);
  if (searchTokens.length === 0) return false;
  const searchText = normalizedCardSearchText(card);
  return searchTokens.some((token) => searchText.includes(token));
}

function cardsForReportContext(cards: KnowledgeCard[], focus?: ReportPromptFocus | null): {
  cards: KnowledgeCard[];
  focusedCardCount: number;
  totalCardCount: number;
} {
  const focusedCards = focus ? cards.filter((card) => cardMatchesFocus(card, focus)) : [];
  return {
    cards: focusedCards.length > 0 ? focusedCards : cards,
    focusedCardCount: focusedCards.length,
    totalCardCount: cards.length,
  };
}

function evidenceSourceLabel(card: KnowledgeCard): string {
  return card.sourceFileName
    || card.sourceTitle
    || card.title
    || card.sourceMessageId
    || card.id;
}

function topTags(cards: readonly KnowledgeCard[]): string[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const tag of [...card.supertags, ...(card.knowledgeGraphLinkTags ?? [])]) {
      if (tag.startsWith("knowledge_mode:") || tag.startsWith("retention:")) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([tag]) => tag)
    .slice(0, 8);
}

function reportMissingInputs(
  template: ReportTemplate,
  context: ReportKnowledgeContext,
  upcomingExam?: string,
): string[] {
  const missing: string[] = [];
  const sourceRequirements = reportSourceRequirementsForKind(template.kind);
  if (context.cardCount === 0) {
    missing.push(`Attach or paste one source before treating this as grounded. Best options: ${
      sourceRequirements.map((source) => source.label.toLowerCase()).join(", ")
    }.`);
  }
  if (template.kind === "exam_preparation" && !upcomingExam?.trim()) {
    missing.push("Add the exam date, topic range, or assessment scope.");
  }
  if (template.kind === "assignment_plan" && context.evidenceSources.length === 0) {
    missing.push("Attach the assignment brief, rubric, or marking criteria.");
  }
  if (template.kind === "weekly_revision" && context.weekTags.length === 0) {
    missing.push("Add or select the week, lecture, or tutorial focus.");
  }
  if (template.kind === "zettelkasten_synthesis" && context.zettelkastenCardCount === 0) {
    missing.push("Choose Zettelkasten mode or promote at least one source note into a permanent-note chain.");
  }
  if (template.kind === "course_builder" && !upcomingExam?.trim() && context.courseTags.length === 0) {
    missing.push("Add the course name, syllabus, weekly topic list, or main exam timeline.");
  }
  if (
    (template.kind === "quiz_generator"
      || template.kind === "flashcard_deck"
      || template.kind === "cheatsheet"
      || template.kind === "practice_questions")
    && context.cardCount > 0
    && context.sourceCount === 0
  ) {
    missing.push("Add one source-backed note or file so generated study material can cite what it is testing.");
  }
  if (template.kind === "guided_study_session" && !upcomingExam?.trim() && context.topSupertags.length === 0) {
    missing.push("Add the exam, assignment, topic, or available study time so the session can start with the right target.");
  }
  if (context.cardCount > 0 && context.linkedCardCount === 0) {
    missing.push("Add one related note or source so the report can compare and connect ideas instead of summarizing one item.");
  }
  return dedupe(missing, 5);
}

function reportReadinessLevel(context: ReportKnowledgeContext, missingInputs: readonly string[]): ReportReadinessLevel {
  if (context.cardCount === 0) return "needs_source";
  if (missingInputs.length > 0) return "needs_scope";
  if (context.linkedCardCount >= 3 && context.sourceCount >= 2) return "grounded_ready";
  return "draft_ready";
}

function reportReadinessLabel(level: ReportReadinessLevel, baseLabel: string): string {
  switch (level) {
    case "needs_source":
      return "Needs one study source";
    case "needs_scope":
      return "Needs one detail to improve";
    case "grounded_ready":
      return "Grounded report ready";
    case "draft_ready":
      return baseLabel;
  }
}

function reportSourceCoverageLevel(sourceCount: number, linkedCardCount: number): ReportSourceCoverageLevel {
  if (sourceCount === 0) return "none";
  if (sourceCount === 1) return "single_source";
  if (linkedCardCount >= 2) return "connected_multi_source";
  return "multi_source";
}

function reportSourceCoverageSummary(level: ReportSourceCoverageLevel, sourceCount: number): string {
  switch (level) {
    case "none":
      return "No retained source evidence is available yet.";
    case "single_source":
      return "Grounded in one retained source; useful as a draft, but weak for comparison or synthesis.";
    case "multi_source":
      return `Uses ${sourceCount} retained sources, but graph links are still limited.`;
    case "connected_multi_source":
      return `Uses ${sourceCount} retained sources with enough graph links for stronger synthesis.`;
  }
}

function medicalConceptEdgeTopologySummary(cards: readonly KnowledgeCard[]): string | null {
  const edgeCards = cards.filter((card) =>
    card.supertags.includes("medical_concept_relationship")
    || card.supertags.includes("medical_concept_edge_review")
    || card.academicKind === "medical_cloze_vignette" && card.supertags.some((tag) => tag.startsWith("relationship:"))
  );
  if (edgeCards.length === 0) return null;
  const relationshipKinds = dedupe(
    edgeCards.flatMap((card) => card.supertags)
      .filter((tag) => tag.startsWith("relationship:"))
      .map((tag) => tag.replace(/^relationship:/, "").replace(/_to_/g, " -> ").replace(/_/g, " ")),
    3,
  );
  const relationshipLabel = relationshipKinds.length > 0
    ? ` (${relationshipKinds.join(", ")})`
    : "";
  return `${edgeCards.length} medical concept-edge card${edgeCards.length === 1 ? "" : "s"} available for regenerated recall${relationshipLabel}.`;
}

export function reportTemplateForKind(kind: ReportKind): ReportTemplate {
  return REPORT_TEMPLATES.find((template) => template.kind === kind) ?? DEFAULT_REPORT_TEMPLATE;
}

export function reportOutputSectionsForKind(kind: ReportKind): ReportOutputSection[] {
  return REPORT_OUTPUT_SECTIONS[kind] ?? REPORT_OUTPUT_SECTIONS.exam_preparation;
}

export function reportSourceRequirementsForKind(kind: ReportKind): ReportSourceRequirement[] {
  return REPORT_SOURCE_REQUIREMENTS[kind] ?? REPORT_SOURCE_REQUIREMENTS.exam_preparation;
}

export function extractReportKnowledgeContext(
  messages: AfpMessage[],
  focus?: ReportPromptFocus | null,
): ReportKnowledgeContext {
  const allCards = attachKnowledgeGraphBacklinks(extractKnowledgeCards(messages), messages);
  const { cards, focusedCardCount, totalCardCount } = cardsForReportContext(allCards, focus);
  const linkedCards = cards.filter((card) =>
    (card.relatedCardCount ?? 0) > 0
    || card.backlinks.length > 0
    || Boolean(card.knowledgeGraphGroupKey)
    || (card.knowledgeGraphLinkTags?.length ?? 0) > 0
  );
  const sourceIds = new Set(
    cards
      .map((card) => card.sourceMessageId || card.sourceFileName || card.sourceTitle || card.id)
      .filter((value): value is string => Boolean(value)),
  );
  const sourceCoverageLevel = reportSourceCoverageLevel(sourceIds.size, linkedCards.length);
  const graphAnchors = dedupe(cards.flatMap((card) => [
    card.knowledgeGraphGroupKey ?? "",
    ...(card.knowledgeGraphLinkTags ?? []),
  ]), 6);
  const evidenceSources = dedupe(cards.map(evidenceSourceLabel), 6);
  const zettelkastenNextActions = dedupe(
    cards
      .filter((card) => card.knowledgeMode === "zettelkasten" || card.zettelkastenNextAction)
      .map((card) => card.zettelkastenNextAction ?? `Continue note chain from ${card.title}`),
    5,
  );
  const courseTags = dedupe(cards.map((card) => card.academicCourseTag ?? ""), 5);
  const weekTags = dedupe(cards.map((card) => card.academicWeekTag ?? ""), 5);
  const chapterTags = dedupe(cards.map((card) => card.academicChapterTag ?? ""), 5);
  const unitTags = dedupe(cards.map((card) => card.academicUnitTag ?? ""), 5);
  const zettelkastenCardCount = cards.filter((card) => card.knowledgeMode === "zettelkasten").length;
  const readinessLabel = cards.length === 0
    ? "No retained study context yet"
    : linkedCards.length >= 3
      ? "Ready for linked synthesis"
      : "Enough for a first grounded report";
  const medicalEdgeSummary = medicalConceptEdgeTopologySummary(cards);

  return {
    cardCount: totalCardCount,
    focusedCardCount,
    linkedCardCount: linkedCards.length,
    zettelkastenCardCount,
    sourceCount: sourceIds.size,
    sourceCoverageLevel,
    sourceCoverageSummary: reportSourceCoverageSummary(sourceCoverageLevel, sourceIds.size),
    topSupertags: topTags(cards),
    graphAnchors,
    evidenceSources,
    missingInputs: [],
    zettelkastenNextActions,
    courseTags,
    weekTags,
    chapterTags,
    unitTags,
    topologySummary: totalCardCount === 0
      ? "No retained knowledge graph is available yet. Ask the student to attach or paste one source before finalizing."
      : focusedCardCount > 0
        ? `${focusedCardCount} focused knowledge cards from ${totalCardCount} retained cards, ${linkedCards.length} linked cards, ${sourceIds.size} source anchors, ${zettelkastenCardCount} Zettelkasten cards.${medicalEdgeSummary ? ` ${medicalEdgeSummary}` : ""}`
        : `${totalCardCount} knowledge cards, ${linkedCards.length} linked cards, ${sourceIds.size} source anchors, ${zettelkastenCardCount} Zettelkasten cards.${medicalEdgeSummary ? ` ${medicalEdgeSummary}` : ""}`,
    readinessLevel: totalCardCount === 0 ? "needs_source" : linkedCards.length >= 3 && sourceIds.size >= 2 ? "grounded_ready" : "draft_ready",
    readinessLabel,
  };
}

export function buildReportKnowledgeContext(input: {
  kind: ReportKind;
  messages: AfpMessage[];
  upcomingExam?: string;
  focus?: ReportPromptFocus | null;
}): ReportKnowledgeContext {
  const template = reportTemplateForKind(input.kind);
  const context = extractReportKnowledgeContext(input.messages, input.focus);
  const missingInputs = reportMissingInputs(template, context, input.upcomingExam);
  const readinessLevel = reportReadinessLevel(context, missingInputs);
  return {
    ...context,
    missingInputs,
    readinessLevel,
    readinessLabel: reportReadinessLabel(readinessLevel, context.readinessLabel),
  };
}

export function buildReportImmediateAction(input: {
  kind: ReportKind;
  context: ReportKnowledgeContext;
  studentState?: Partial<ReportStudentState> | null;
}): ReportImmediateAction {
  const state = normalizeStudentState(input.studentState);
  if (input.context.cardCount === 0) {
    return {
      label: "Attach one source",
      detail: "Start with one lecture slide deck, assignment brief, reading, or rough note so the report can be grounded.",
    };
  }
  if (state.stress === "overwhelmed" || state.urgency === "urgent") {
    return {
      label: "Do the smallest useful step",
      detail: "Spend 15 minutes on the highest-risk topic or task, then let the report decide what can wait.",
    };
  }
  switch (input.kind) {
    case "exam_preparation":
      return { label: "Pick the weakest topic", detail: "Start with the lowest-confidence concept from the retained course/week material." };
    case "day_schedule":
      return { label: "Block the next 90 minutes", detail: "Create one work block, one break, and one fallback task before planning the full day." };
    case "assignment_plan":
      return { label: "Find the marking risk", detail: "Open the brief or rubric first and identify the one criterion most likely to cost marks." };
    case "weekly_revision":
      return { label: "Review the week anchor", detail: "Start from the lecture or tutorial tag with the strongest graph connections." };
    case "zettelkasten_synthesis":
      return { label: "Write one link sentence", detail: "Choose one source note and write how it contributes to, challenges, or alters an existing note." };
    case "course_builder":
      return { label: "Name the course outcome", detail: "Write the subject, target mark, exam date, or week range so the course path has a real destination." };
    case "quiz_generator":
      return { label: "Answer five questions first", detail: "Use a short quiz to expose weak concepts before generating a longer drill set." };
    case "flashcard_deck":
      return { label: "Drill the first ten cards", detail: "Start with definitions and confusing contrasts from the highest-priority graph cluster." };
    case "cheatsheet":
      return { label: "Pick the sheet density", detail: "Choose one-page, exam cram, formulas only, or deep explanation before compressing the material." };
    case "lecture_summary":
      return { label: "Find the confusing point", detail: "Start with the concept, slide, or reading section the student least understands." };
    case "practice_questions":
      return { label: "Try one applied question", detail: "Begin with a realistic exam-style prompt, then use the answer key to identify what to revise." };
    case "guided_study_session":
      return { label: "Start a 20-minute session", detail: "Begin with one review target, two recall prompts, and a final check before planning more." };
  }
}

function reportInstruction(template: ReportTemplate): string {
  switch (template.kind) {
    case "exam_preparation":
      return "Create an exam preparation report with ranked examinable concepts, weak areas, practice questions, and a practical study plan.";
    case "day_schedule":
      return "Create a realistic day schedule for a stressed student with time blocks, breaks, fallback tasks, and one smallest useful first action.";
    case "assignment_plan":
      return "Create an assignment execution report with requirements, rubric risks, source gaps, milestones, and the next writing step.";
    case "weekly_revision":
      return "Create a weekly revision report that connects lectures, readings, rough notes, and tutorial material into what to revise next.";
    case "zettelkasten_synthesis":
      return "Create a Zettelkasten synthesis report that turns linked source notes into a full-sentence argument trail and next permanent-note moves.";
    case "course_builder":
      return "Create an AI course builder report that turns the student's goal, course sources, deadlines, and retained knowledge graph into a structured study course.";
    case "quiz_generator":
      return "Create a quiz generator report with source-grounded questions, answer key, difficulty mix, and weak-topic follow-up.";
    case "flashcard_deck":
      return "Create a flashcard deck report with active-recall cards grouped by course, week, graph cluster, and exam priority.";
    case "cheatsheet":
      return "Create a cheatsheet builder report with a compact printable revision sheet, key definitions, examples, formulas, traps, and source caveats.";
    case "lecture_summary":
      return "Create a lecture summary report that helps the student catch up quickly from a lecture, reading, transcript, or source cluster.";
    case "practice_questions":
      return "Create a practice questions report with exam-style prompts, worked answer guidance, marking hints, and a manageable practice schedule.";
    case "guided_study_session":
      return "Create a guided study session report that leads a stressed student through plan, review, recall, check, and next action phases.";
  }
}

export function buildReportPrompt(input: {
  template: ReportTemplate;
  goal: string;
  upcomingExam?: string;
  studentState?: Partial<ReportStudentState> | null;
  outputFormat?: ReportOutputFormat | null;
  context: ReportKnowledgeContext;
  focus?: ReportPromptFocus | null;
}): string {
  const goal = input.goal.trim() || input.template.recommendedGoal;
  const exam = input.upcomingExam?.trim();
  const outputSections = reportOutputSectionsForKind(input.template.kind);
  const sourceRequirements = reportSourceRequirementsForKind(input.template.kind);
  const context = {
    ...input.context,
    missingInputs: input.context.missingInputs.length
      ? input.context.missingInputs
      : reportMissingInputs(input.template, input.context, input.upcomingExam),
  };
  const immediateAction = buildReportImmediateAction({
    kind: input.template.kind,
    context,
    studentState: input.studentState,
  });
  const outputFormat = reportOutputFormatOption(input.outputFormat ?? recommendedReportOutputFormat(input.template.kind));
  return [
    reportInstruction(input.template),
    "",
    `Student goal: ${goal}`,
    exam ? `Upcoming exam or deadline: ${exam}` : "Upcoming exam or deadline: not provided; ask one concise clarifying question only if needed.",
    studentStateInstruction(input.studentState),
    focusInstruction(input.focus) ?? "Current report focus to prioritize: none supplied; use the strongest retained study context.",
    `Report readiness: ${context.readinessLevel} - ${context.readinessLabel}.`,
    `Source coverage: ${context.sourceCoverageLevel} - ${context.sourceCoverageSummary}`,
    `Available context: ${context.topologySummary}`,
    context.courseTags.length ? `Course tags: ${context.courseTags.join(", ")}` : "Course tags: not yet detected.",
    context.weekTags.length ? `Week tags: ${context.weekTags.join(", ")}` : "Week tags: not yet detected.",
    context.chapterTags.length ? `Chapter tags: ${context.chapterTags.join(", ")}` : "Chapter tags: not yet detected.",
    context.unitTags.length ? `Unit tags: ${context.unitTags.join(", ")}` : "Unit tags: not yet detected.",
    context.topSupertags.length ? `Supertags to use: ${context.topSupertags.join(", ")}` : "Supertags to use: none yet.",
    context.graphAnchors.length ? `Knowledge graph anchors: ${context.graphAnchors.join(", ")}` : "Knowledge graph anchors: none yet.",
    context.evidenceSources.length ? `Likely source evidence: ${context.evidenceSources.join(", ")}` : "Likely source evidence: none yet.",
    `Best source inputs for this report: ${sourceRequirements.map((source) => `${source.label} (${source.examples})`).join(" | ")}`,
    context.missingInputs.length ? `Known gaps before relying on this report: ${context.missingInputs.join(" | ")}` : "Known gaps before relying on this report: none obvious from retained context.",
    context.zettelkastenNextActions.length
      ? `Zettelkasten next-note moves: ${context.zettelkastenNextActions.join(" | ")}`
      : "Zettelkasten next-note moves: none yet.",
    `Immediate first action: ${immediateAction.label} - ${immediateAction.detail}`,
    `Requested output format: ${outputFormat.label}. ${outputFormat.promptHint}`,
    ...studyOutputContractPromptLines(input.template.kind),
    ...medicalAnkiContractPromptLines({
      academicKind: input.focus?.academicKind,
      reportKind: input.template.kind,
    }),
    ...medicalAnkiFocusPromptLines({
      academicKind: input.focus?.academicKind,
      reportKind: input.template.kind,
      searchQuery: input.focus?.searchQuery,
      activeTag: input.focus?.activeTag,
      courseTag: input.focus?.courseTag,
      unitTag: input.focus?.unitTag,
      chapterTag: input.focus?.chapterTag,
      knowledgeGraphGroupKey: input.focus?.knowledgeGraphGroupKey,
      knowledgeGraphLinkTags: input.focus?.knowledgeGraphLinkTags,
      zettelkastenNextAction: input.focus?.zettelkastenNextAction,
    }),
    `Required output sections: ${outputSections.map((section) => `${section.title} - ${section.detail}`).join(" | ")}`,
    `Academic integrity guardrails: ${REPORT_ACADEMIC_INTEGRITY_GUARDRAILS.join(" | ")}`,
    "",
    "Use retained linked data, supertags, graph topology, and Zettelkasten note-chain signals before generic advice.",
    "If a current report focus is supplied, prioritize that course, unit, chapter, week, graph cluster, or note chain before broader retained material.",
    "If attached files are present, ground claims in those files and tell the student what was used.",
    "If known gaps remain, proceed with a clearly marked draft and ask for only the highest-impact missing input.",
    "Keep the tone calm and practical for a stressed university student.",
    "Make the report ready to act on immediately: include a first 15-minute step, next 48 hours, and what to ignore for now.",
    "Make the output reusable: preserve headings, source labels, and checklist structure so the student can copy, print, or revise it later.",
  ].join("\n");
}

export function buildReportQuickStartSeed(input: ReportQuickStartInput): OnboardingQuickStartSeed {
  const template = reportTemplateForKind(input.kind);
  const context = buildReportKnowledgeContext(input);
  const sourceRequirements = reportSourceRequirementsForKind(template.kind);
  const sourceRequirementLabels = sourceRequirements.map((source) => source.label.toLowerCase());
  const immediateAction = buildReportImmediateAction({
    kind: template.kind,
    context,
    studentState: input.studentState,
  });
  const knowledgeMode: KnowledgeOrganizationMode =
    input.kind === "zettelkasten_synthesis" || context.zettelkastenCardCount > 0
      ? "zettelkasten"
      : "connected_notes";
  const retentionMode: AttachmentRetentionMode = "keep_extracted_only";
  const studentState = normalizeStudentState(input.studentState);
  const outputFormat = reportOutputFormatOption(input.outputFormat ?? recommendedReportOutputFormat(template.kind));
  const firstMissingInput = context.missingInputs[0]
    ? compactListItem(context.missingInputs[0])
    : null;
  const focusBadges = dedupe([
    template.label,
    `report_kind:${template.kind}`,
    `urgency:${studentState.urgency}`,
    `stress:${studentState.stress}`,
    `output_format:${outputFormat.value}`,
    `readiness:${context.readinessLevel}`,
    `coverage:${context.sourceCoverageLevel}`,
    ...sourceRequirementLabels.slice(0, 2).map((label) => `source_need:${label}`),
    ...normalizedFocusValues(input.focus).slice(0, 16),
    ...context.courseTags,
    ...context.weekTags,
    ...context.chapterTags,
    ...context.unitTags,
    ...context.evidenceSources.slice(0, 2),
    ...context.graphAnchors.slice(0, 3),
    ...context.topSupertags.slice(0, 3),
  ], 32);

  return {
    label: template.label,
    description: template.description,
    flowKind: context.cardCount > 0 ? "grounded_followup" : "initial_upload",
    entryPoint: "workspace",
    timeToValueLabel: "Report draft from your study graph",
    query: buildReportPrompt({
      template,
      goal: input.goal,
      upcomingExam: input.upcomingExam,
      studentState: input.studentState,
      outputFormat: input.outputFormat,
      context,
      focus: input.focus,
    }),
    notice: `${template.label} loaded. OmnyID will use retained files, supertags, graph links, and Zettelkasten signals where available.`,
    helper: context.cardCount > 0
      ? [
          `Ask for the report now, or attach a missing source first.`,
          `Readiness: ${compactLabel(context.readinessLabel)}.`,
          `Coverage: ${compactLabel(context.sourceCoverageLevel)}.`,
          firstMissingInput ? `Best gap to fill: ${firstMissingInput}.` : null,
        ].filter((value): value is string => Boolean(value)).join(" ")
      : [
          `Attach or paste ${sourceRequirementLabels.slice(0, 2).join(" and ")} to ground the report.`,
          `Readiness: ${compactLabel(context.readinessLabel)}.`,
          `Coverage: ${compactLabel(context.sourceCoverageLevel)}.`,
          firstMissingInput ? `Best gap to fill: ${firstMissingInput}.` : null,
        ].filter((value): value is string => Boolean(value)).join(" "),
    valuePromise: template.outputPromise,
    recommendedUpload: context.cardCount > 0
      ? `Optional: add missing ${sourceRequirementLabels.slice(0, 2).join(" or ")} if it is not yet in the graph.`
      : `Best with ${sourceRequirements.map((source) => `${source.label.toLowerCase()}: ${source.examples}`).join("; ")}.`,
    firstOutputs: [
      immediateAction.label,
      ...reportOutputSectionsForKind(template.kind).map((section) => section.title),
      "Source, supertag, graph, and Zettelkasten context used",
      "A first 15-minute step so the student can start immediately",
    ].slice(0, 5),
    knowledgeMode,
    retentionMode,
    checklist: [
      "Confirm the exam, deadline, or study goal.",
      `Check readiness: ${context.readinessLabel}.`,
      `Check source coverage: ${context.sourceCoverageSummary}`,
      ...(firstMissingInput ? [`Fill this gap first if possible: ${firstMissingInput}.`] : []),
      "Use linked retained knowledge before generic study advice.",
      "Produce a report with priorities, next actions, and source-backed caveats.",
    ].slice(0, 6),
    nextSteps: [
      "Open Files to inspect the source material used.",
      "Open Knowledge Graph to follow linked concepts and note chains.",
      "Attach the next missing source to strengthen future reports.",
    ],
    originLabel: "From Reports",
    focusBadges,
  };
}
