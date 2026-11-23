// @locs-version: 1.0
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import type { ReportKind, ReportOutputFormat } from "@/lib/reportGeneratorState";
import {
  normalizeStudyLaunchMetadata,
  studyAcademicScopeFromStudyLaunchMetadata,
} from "@/lib/studyLaunchMetadataState";

export type ReportSeedMetadata = {
  kind: ReportKind | null;
  label: string | null;
  courseTag: string | null;
  chapterTag: string | null;
  unitTag: string | null;
  moduleLabel: string | null;
  dueLabel: string | null;
  deadlineId: string | null;
  providerId: string | null;
  academicKind: string | null;
  sessionId: string | null;
  routeSource: string | null;
  sourceNeeds: string[];
  readiness: string | null;
  coverage: string | null;
  urgency: string | null;
  stress: string | null;
  outputFormat: string | null;
};

const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  exam_preparation: "exam preparation report",
  day_schedule: "today study schedule report",
  assignment_plan: "assignment plan report",
  weekly_revision: "weekly revision report",
  zettelkasten_synthesis: "Zettelkasten synthesis report",
  course_builder: "AI course builder report",
  quiz_generator: "quiz generator report",
  flashcard_deck: "flashcard deck report",
  cheatsheet: "cheatsheet builder report",
  lecture_summary: "lecture summary report",
  practice_questions: "practice questions report",
  guided_study_session: "guided study session report",
};

export function reportLabelForKind(kind: ReportKind): string {
  return REPORT_KIND_LABELS[kind];
}

export function inferReportKindFromText(value: string | null | undefined): ReportKind | null {
  const text = value?.toLowerCase() ?? "";
  if (!text.trim()) return null;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? text;
  if (/\bassignment execution report\b/.test(firstLine)) return "assignment_plan";
  if (/\b(exam preparation report|exam prep)\b/.test(firstLine)) return "exam_preparation";
  if (/\b(realistic day schedule|today study schedule|day schedule)\b/.test(firstLine)) return "day_schedule";
  if (/\bweekly revision report\b/.test(firstLine)) return "weekly_revision";
  if (/\bzettelkasten synthesis report\b/.test(firstLine)) return "zettelkasten_synthesis";
  if (/\b(ai course builder|course builder report|structured study course)\b/.test(firstLine)) return "course_builder";
  if (/\bquiz generator report\b/.test(firstLine)) return "quiz_generator";
  if (/\bflashcard deck report\b/.test(firstLine)) return "flashcard_deck";
  if (/\bcheatsheet builder report\b/.test(firstLine)) return "cheatsheet";
  if (/\blecture summary report\b/.test(firstLine)) return "lecture_summary";
  if (/\bpractice questions report\b/.test(firstLine)) return "practice_questions";
  if (/\bguided study session report\b/.test(firstLine)) return "guided_study_session";
  if (/\b(ai course builder|course builder report|structured study course|module-by-module course path)\b/.test(text)) {
    return "course_builder";
  }
  if (/\b(quiz generator report|quiz questions|marked quiz|answer key)\b/.test(text)) {
    return "quiz_generator";
  }
  if (/\b(flashcard deck report|flashcards|active[- ]recall cards|recall cards)\b/.test(text)) {
    return "flashcard_deck";
  }
  if (/\b(cheatsheet builder report|cheatsheet|exam cram|printable revision sheet)\b/.test(text)) {
    return "cheatsheet";
  }
  if (/\b(lecture summary report|plain-english summary|catch up quickly|lecture or reading explained)\b/.test(text)) {
    return "lecture_summary";
  }
  if (/\b(practice questions report|exam-style practice questions|worked answers|marking hints)\b/.test(text)) {
    return "practice_questions";
  }
  if (/\b(guided study session report|20-minute session|45-minute session|plan, review, recall, check)\b/.test(text)) {
    return "guided_study_session";
  }
  if (/\b(assignment execution report|assignment plan report|assignment brief|rubric|marking criteria|essay plan)\b/.test(text)) {
    return "assignment_plan";
  }
  if (/\b(exam preparation report|exam prep report|exam prep|prepare for (my|the|an)?\s*exam|upcoming exam)\b/.test(text)) {
    return "exam_preparation";
  }
  if (/\b(today study schedule|day schedule|day plan|time[- ]blocked schedule|next 90 minutes)\b/.test(text)) {
    return "day_schedule";
  }
  if (/\b(weekly revision report|week synthesis|this week'?s class material|course\/week|same course\/week)\b/.test(text)) {
    return "weekly_revision";
  }
  if (/\b(zettelkasten synthesis report|as zettelkasten material|continue this note chain|permanent[- ]note candidates|next permanent[- ]note moves)\b/.test(text)) {
    return "zettelkasten_synthesis";
  }
  return null;
}

export function inferReportOutputFormatFromText(value: string | null | undefined): ReportOutputFormat | null {
  const text = value?.toLowerCase() ?? "";
  if (!text.trim()) return null;
  if (/\b(output format:\s*)?csv flashcards?\b/.test(text) || /\bfront,\s*back,\s*source,\s*difficulty,\s*and tag columns\b/.test(text)) {
    return "csv_flashcards";
  }
  if (/\b(output format:\s*)?print-ready\b/.test(text) || /\bprintable revision sheet\b/.test(text)) {
    return "print_ready";
  }
  if (/\b(output format:\s*)?copyable outline\b/.test(text) || /\baction checkboxes\b/.test(text)) {
    return "copyable_outline";
  }
  if (/\b(output format:\s*)?chat report\b/.test(text) || /\bclean markdown inside chat\b/.test(text)) {
    return "chat_markdown";
  }
  return null;
}

function cleanBadgeList(seed: OnboardingQuickStartSeed | null | undefined): string[] {
  return (seed?.focusBadges ?? [])
    .map((badge) => badge.trim())
    .filter((badge) => badge.length > 0);
}

function badgeValue(badge: string, prefix: string): string | null {
  const normalizedPrefix = prefix.toLowerCase();
  if (!badge.toLowerCase().startsWith(normalizedPrefix)) return null;
  const value = badge.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function normalizeReportKind(value: string | null): ReportKind | null {
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
  return null;
}

export function extractReportSeedMetadata(
  seed: OnboardingQuickStartSeed | null | undefined,
): ReportSeedMetadata {
  const badges = cleanBadgeList(seed);
  const launchMetadata = normalizeStudyLaunchMetadata(seed);
  const scope = studyAcademicScopeFromStudyLaunchMetadata(launchMetadata);
  const kind = normalizeReportKind(
    badges
      .map((badge) => badgeValue(badge, "report_kind:"))
      .find((value): value is string => Boolean(value)) ?? null,
  );

  return {
    kind,
    label: kind ? reportLabelForKind(kind) : null,
    courseTag: scope.courseTag ?? null,
    chapterTag: scope.chapterTag ?? null,
    unitTag: scope.unitTag ?? null,
    moduleLabel: scope.moduleLabel ?? null,
    dueLabel: scope.dueLabel ?? null,
    deadlineId: scope.deadlineId ?? null,
    providerId: scope.providerId ?? null,
    academicKind: scope.academicKind ?? null,
    sessionId: scope.sessionId ?? null,
    routeSource: scope.routeSource ?? null,
    sourceNeeds: badges
      .map((badge) => badgeValue(badge, "source_need:"))
      .filter((value): value is string => Boolean(value))
      .slice(0, 2),
    readiness: badges
      .map((badge) => badgeValue(badge, "readiness:"))
      .find((value): value is string => Boolean(value)) ?? null,
    coverage: badges
      .map((badge) => badgeValue(badge, "coverage:"))
      .find((value): value is string => Boolean(value)) ?? null,
    urgency: badges
      .map((badge) => badgeValue(badge, "urgency:"))
      .find((value): value is string => Boolean(value)) ?? null,
    stress: badges
      .map((badge) => badgeValue(badge, "stress:"))
      .find((value): value is string => Boolean(value)) ?? null,
    outputFormat: badges
      .map((badge) => badgeValue(badge, "output_format:"))
      .find((value): value is string => Boolean(value)) ?? null,
  };
}

export function reportKindFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): ReportKind | null {
  return extractReportSeedMetadata(seed).kind;
}

export function reportLabelFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).label;
}

export function reportSourceNeedsFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string[] {
  return extractReportSeedMetadata(seed).sourceNeeds;
}

export function reportCourseTagFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).courseTag;
}

export function reportChapterTagFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).chapterTag;
}

export function reportUnitTagFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).unitTag;
}

export function reportModuleLabelFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).moduleLabel;
}

export function reportDueLabelFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).dueLabel;
}

export function reportDeadlineIdFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).deadlineId;
}

export function reportProviderIdFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).providerId;
}

export function reportAcademicKindFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).academicKind;
}

export function reportSessionIdFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).sessionId;
}

export function reportRouteSourceFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): string | null {
  return extractReportSeedMetadata(seed).routeSource;
}

export function isReportQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): boolean {
  return Boolean(reportKindFromQuickStartSeed(seed));
}
