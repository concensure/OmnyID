// @locs-version: 1.0
import {
  buildReportImmediateAction,
  buildReportKnowledgeContext,
  REPORT_TEMPLATES,
  reportOutputSectionsForKind,
  reportSourceRequirementsForKind,
  type ReportImmediateAction,
  type ReportKind,
  type ReportKnowledgeContext,
  type ReportOutputSection,
  type ReportSourceRequirement,
  type ReportStressLevel,
  type ReportTemplate,
  type ReportUrgencyLevel,
} from "@/lib/reportGeneratorState";
import type { AfpMessage } from "@/lib/api";
import type { ReportNavigationIntent } from "@/lib/reportNavigationState";
import {
  buildStudyAcademicScopeLabels,
} from "@/lib/studyAcademicScopeState";

export type ReportWorkspaceState = {
  template: ReportTemplate;
  outputSections: ReportOutputSection[];
  sourceRequirements: ReportSourceRequirement[];
  context: ReportKnowledgeContext;
  immediateAction: ReportImmediateAction;
  intake: ReportIntakeState;
  hasRetainedContext: boolean;
  canGenerate: boolean;
  primaryActionLabel: string;
  noSourceNotice: string | null;
  carriedFocusLabel: string | null;
  carriedFocusDetail: string | null;
};

export type ReportIntakeTurn = {
  speaker: "assistant" | "student";
  text: string;
};

export type ReportIntakeQuickReply = {
  label: string;
  target: "goal" | "upcoming_exam";
  value: string;
};

export type ReportIntakeState = {
  turns: ReportIntakeTurn[];
  quickReplies: ReportIntakeQuickReply[];
  completionLabel: string;
  sourcePrompt: string;
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function defaultReportGoal(kind: ReportKind): string {
  return (REPORT_TEMPLATES.find((item) => item.kind === kind) ?? REPORT_TEMPLATES[0]).recommendedGoal;
}

export function shouldReplaceReportGoal(value: string | null | undefined): boolean {
  const goal = clean(value);
  if (!goal) return true;
  return REPORT_TEMPLATES.some((template) => template.recommendedGoal === goal);
}

export function nextReportGoal(input: {
  currentGoal: string | null | undefined;
  nextKind: ReportKind;
}): string {
  return shouldReplaceReportGoal(input.currentGoal)
    ? defaultReportGoal(input.nextKind)
    : clean(input.currentGoal);
}

function carriedFocusLabel(intent: ReportNavigationIntent | null | undefined): string | null {
  if (!intent) return null;
  const label = [...new Set([
    ...buildStudyAcademicScopeLabels(intent),
    intent.weekTag,
    intent.lectureTag,
    intent.activeTag,
    intent.knowledgeGraphGroupKey,
  ]
    .map((value) => clean(value))
    .filter((value): value is string => Boolean(value)))]
    .slice(0, 5)
    .join(", ");
  return label || "current retained study context";
}

function reportFocusSourceLabel(source: ReportNavigationIntent["source"]): string {
  if (source === "files") return "Files";
  if (source === "knowledge_graph") return "Knowledge Graph";
  if (source === "study_lens") return "Study Lens";
  if (source === "object_search") return "object search";
  return "onboarding";
}

function carriedFocusDetail(intent: ReportNavigationIntent | null | undefined): string | null {
  if (!intent) return null;
  const details = [
    `from ${reportFocusSourceLabel(intent.source)}`,
    intent.academicKind ? `academic kind: ${intent.academicKind.replace(/_/g, " ")}` : null,
    ...buildStudyAcademicScopeLabels(intent, {
      includeDeadlineId: true,
      includeProviderId: true,
      limit: 7,
    }).map((label) => `scope: ${label}`),
    intent.zettelkastenNextAction,
    ...(intent.knowledgeGraphLinkTags ?? []),
  ]
    .filter((value): value is string => Boolean(clean(value)))
    .slice(0, 9);
  return details.length > 0 ? details.join(" | ") : null;
}

function intakeOpeningForKind(kind: ReportKind): string {
  switch (kind) {
    case "exam_preparation":
      return "Tell me the exam, topic range, and how much time you have. I will turn retained course material into revision priorities.";
    case "day_schedule":
      return "Tell me what must get done today, fixed commitments, and your energy level. I will produce a realistic study day.";
    case "assignment_plan":
      return "Tell me the assignment brief, due date, and marking pressure. I will turn sources and rubric evidence into an execution plan.";
    case "weekly_revision":
      return "Tell me the course week or lecture cluster. I will connect retained lectures, readings, and notes into a revision report.";
    case "zettelkasten_synthesis":
      return "Tell me the idea, note chain, or argument you want to develop. I will use source notes and graph links before generic synthesis.";
    case "course_builder":
      return "Tell me the course goal, exam timeline, and weekly availability. I will build a module-by-module study path.";
    case "quiz_generator":
      return "Tell me the topic scope and difficulty target. I will generate source-grounded questions with answers.";
    case "flashcard_deck":
      return "Tell me the course, week, or weak concepts. I will create active-recall cards grouped by source and priority.";
    case "cheatsheet":
      return "Tell me the sheet density and exam scope. I will compress the highest-value material into a reusable revision sheet.";
    case "lecture_summary":
      return "Tell me which lecture, reading, transcript, or confusing point to explain. I will summarize it without losing source links.";
    case "practice_questions":
      return "Tell me the exam scope and preferred question style. I will produce exam-style prompts with worked guidance.";
    case "guided_study_session":
      return "Tell me the target and available time. I will guide a Plan, Review, Recall, Check, Next action session.";
  }
}

function quickReplyForKind(kind: ReportKind): ReportIntakeQuickReply {
  switch (kind) {
    case "exam_preparation":
      return { label: "Use exam prep goal", target: "goal", value: "I have an upcoming exam and need ranked revision priorities, weak-topic practice, and a realistic study plan." };
    case "day_schedule":
      return { label: "Use day plan goal", target: "goal", value: "I need a realistic study schedule for today that fits my deadlines, breaks, and energy." };
    case "assignment_plan":
      return { label: "Use assignment goal", target: "goal", value: "I need to turn my assignment brief, rubric, and sources into concrete next actions." };
    case "weekly_revision":
      return { label: "Use weekly revision goal", target: "goal", value: "I need to understand what mattered this week and how the lectures, readings, and notes connect." };
    case "zettelkasten_synthesis":
      return { label: "Use ZK synthesis goal", target: "goal", value: "I want to turn these source notes into connected permanent-note candidates and an argument trail." };
    case "course_builder":
      return { label: "Use course path goal", target: "goal", value: "I need a structured course plan from my retained files, goals, source coverage, and exam timeline." };
    case "quiz_generator":
      return { label: "Use quiz goal", target: "goal", value: "I need a quiz to test what I understand from this course material, with answers and source references." };
    case "flashcard_deck":
      return { label: "Use flashcard goal", target: "goal", value: "I need active-recall flashcards for key definitions, examples, contrasts, and exam traps." };
    case "cheatsheet":
      return { label: "Use cheatsheet goal", target: "goal", value: "I need a compact cheatsheet for the highest-value exam material, definitions, examples, and traps." };
    case "lecture_summary":
      return { label: "Use summary goal", target: "goal", value: "I need this lecture or reading explained clearly so I can catch up quickly." };
    case "practice_questions":
      return { label: "Use practice goal", target: "goal", value: "I need exam-style practice questions for my weakest topics, with worked answers and marking hints." };
    case "guided_study_session":
      return { label: "Use session goal", target: "goal", value: "I need a guided study session that tells me exactly what to review, recall, check, and do next." };
  }
}

export function buildReportIntakeState(input: {
  kind: ReportKind;
  goal: string | null | undefined;
  upcomingExam?: string | null;
  context: ReportKnowledgeContext;
  focusDetail?: string | null;
}): ReportIntakeState {
  const goal = clean(input.goal);
  const upcomingExam = clean(input.upcomingExam);
  const hasContext = input.context.cardCount > 0;
  const turns: ReportIntakeTurn[] = [
    { speaker: "assistant", text: intakeOpeningForKind(input.kind) },
  ];
  const quickReplies: ReportIntakeQuickReply[] = [];

  if (goal) {
    turns.push({ speaker: "student", text: goal });
  } else {
    turns.push({ speaker: "assistant", text: "Start with the learning goal, pressure point, or output you need. One sentence is enough." });
    quickReplies.push(quickReplyForKind(input.kind));
  }

  if (upcomingExam) {
    turns.push({ speaker: "student", text: `Deadline or scope: ${upcomingExam}` });
  } else {
    turns.push({ speaker: "assistant", text: "Add an exam date, deadline, topic range, available time, or course week if it matters for this report." });
    quickReplies.push({
      label: input.kind === "guided_study_session" ? "20 minutes now" : "Add timeline placeholder",
      target: "upcoming_exam",
      value: input.kind === "guided_study_session"
        ? "20 minutes available now; choose the highest-value review target from my retained study context."
        : "Timeline not confirmed yet; proceed as a clearly marked draft and ask only for the highest-impact missing detail.",
    });
  }

  const focusDetail = clean(input.focusDetail);
  if (focusDetail) {
    turns.push({ speaker: "assistant", text: `Carried focus: ${focusDetail}` });
  }

  const sourcePrompt = hasContext
    ? `Use ${input.context.sourceCoverageSummary.toLowerCase()}`
    : "Ask me to attach or paste one readable lecture, reading, syllabus, brief, or rough note before presenting this as grounded.";
  turns.push({
    speaker: "assistant",
    text: hasContext
      ? `${sourcePrompt} Also use supertags, graph anchors, and Zettelkasten signals where available.`
      : sourcePrompt,
  });

  return {
    turns,
    quickReplies,
    completionLabel: goal && (hasContext || upcomingExam)
      ? "Ready to generate"
      : hasContext
        ? "Needs goal or deadline"
        : "Needs source grounding",
    sourcePrompt,
  };
}

export function buildReportWorkspaceState(input: {
  kind: ReportKind;
  goal: string;
  upcomingExam?: string | null;
  urgency: ReportUrgencyLevel;
  stress: ReportStressLevel;
  messages: AfpMessage[];
  focus?: ReportNavigationIntent | null;
}): ReportWorkspaceState {
  const template = REPORT_TEMPLATES.find((item) => item.kind === input.kind) ?? REPORT_TEMPLATES[0];
  const context = buildReportKnowledgeContext({
    kind: template.kind,
    messages: input.messages,
    upcomingExam: input.upcomingExam ?? "",
    focus: input.focus,
  });
  const hasRetainedContext = context.cardCount > 0;
  const immediateAction = buildReportImmediateAction({
    kind: template.kind,
    context,
    studentState: {
      urgency: input.urgency,
      stress: input.stress,
    },
  });

  return {
    template,
    outputSections: reportOutputSectionsForKind(template.kind),
    sourceRequirements: reportSourceRequirementsForKind(template.kind),
    context,
    immediateAction,
    intake: buildReportIntakeState({
      kind: template.kind,
      goal: input.goal,
      upcomingExam: input.upcomingExam,
      context,
      focusDetail: carriedFocusDetail(input.focus),
    }),
    hasRetainedContext,
    canGenerate: clean(input.goal).length > 0 || clean(input.upcomingExam).length > 0,
    primaryActionLabel: hasRetainedContext ? "Generate report in Chat" : "Start with one source",
    noSourceNotice: hasRetainedContext
      ? null
      : "No retained study source is available yet. The next step will open the existing study assistant so the student can attach or paste one lecture, brief, reading, or rough note before OmnyID presents the report as grounded.",
    carriedFocusLabel: carriedFocusLabel(input.focus),
    carriedFocusDetail: carriedFocusDetail(input.focus),
  };
}
