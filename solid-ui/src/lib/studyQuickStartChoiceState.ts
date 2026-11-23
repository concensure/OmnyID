// @locs-version: 1.0
import {
  DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  studentQuickStartForIntent,
  type OnboardingQuickStartSeed,
  type StudentQuickStartIntent,
} from "@/lib/onboardingQuickStart";
import { reportKindFromQuickStartSeed } from "@/lib/reportSeedMetadata";

export type StudyQuickStartChoiceCard = {
  intent: StudentQuickStartIntent;
  badge: string;
  title: string;
  detail: string;
  emphasis: string;
  timeToValueLabel: string;
  recommendedUpload: string;
  retentionLabel: string;
  knowledgeModeLabel: string;
  tone: "violet" | "sky" | "emerald" | "amber";
  selected: boolean;
  recommended: boolean;
};

export type StudyQuickStartChoiceState = {
  headline: string;
  detail: string;
  cards: StudyQuickStartChoiceCard[];
};

function retentionLabel(seed: OnboardingQuickStartSeed): string {
  if (seed.retentionMode === "keep_file") return "Keep files";
  if (seed.retentionMode === "keep_nothing") return "Keep nothing";
  return "Keep extracted notes";
}

function knowledgeModeLabel(seed: OnboardingQuickStartSeed): string {
  return seed.knowledgeMode === "zettelkasten" ? "Zettelkasten" : "Connected notes";
}

function choiceCard(
  intent: StudentQuickStartIntent,
  options: {
    badge: string;
    emphasis: string;
    tone: "violet" | "sky" | "emerald" | "amber";
    selectedIntent: StudentQuickStartIntent;
    recommended?: boolean;
  },
): StudyQuickStartChoiceCard {
  const seed = studentQuickStartForIntent(intent);
  return {
    intent,
    badge: options.badge,
    title: seed.label,
    detail: seed.description,
    emphasis: options.emphasis,
    timeToValueLabel: seed.timeToValueLabel ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START.timeToValueLabel ?? "Useful answer in the first run",
    recommendedUpload: seed.recommendedUpload,
    retentionLabel: retentionLabel(seed),
    knowledgeModeLabel: knowledgeModeLabel(seed),
    tone: options.tone,
    selected: options.selectedIntent === intent,
    recommended: options.recommended ?? false,
  };
}

function selectedIntentForSeed(seed: OnboardingQuickStartSeed | null | undefined): StudentQuickStartIntent {
  const active = seed ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START;
  const reportKind = reportKindFromQuickStartSeed(active);
  if (reportKind === "assignment_plan") return "assignment_plan";
  if (
    reportKind === "weekly_revision"
    || reportKind === "day_schedule"
    || reportKind === "course_builder"
    || reportKind === "cheatsheet"
    || reportKind === "lecture_summary"
    || reportKind === "guided_study_session"
  ) return "week_summary";
  if (reportKind === "quiz_generator" || reportKind === "flashcard_deck" || reportKind === "practice_questions") {
    return "compare_sources";
  }
  if (reportKind === "zettelkasten_synthesis") return "zettelkasten_chain";
  if (reportKind === "exam_preparation") return "first_upload";
  if (active.label === studentQuickStartForIntent("assignment_plan").label) {
    return "assignment_plan";
  }
  if (active.label === studentQuickStartForIntent("lecture_audio").label) {
    return "lecture_audio";
  }
  if (active.label === studentQuickStartForIntent("compare_sources").label) {
    return "compare_sources";
  }
  if (active.label === studentQuickStartForIntent("week_summary").label) {
    return "week_summary";
  }
  if (active.label === studentQuickStartForIntent("zettelkasten_chain").label) {
    return "zettelkasten_chain";
  }
  if (active.label === studentQuickStartForIntent("first_upload").label) {
    return "first_upload";
  }
  if (active.knowledgeMode === "zettelkasten") return "zettelkasten_chain";
  if (/assignment brief|rubric|task sheet/i.test(active.label) || /assignment brief|rubric|task sheet/i.test(active.query)) {
    return "assignment_plan";
  }
  if (/lecture recording/i.test(active.label) || /lecture recording|voice memo/i.test(active.query)) {
    return "lecture_audio";
  }
  if (/compare/i.test(active.label) || /overlap/i.test(active.query)) {
    return "compare_sources";
  }
  if (/week 3/i.test(active.label) || /week 3/i.test(active.query)) {
    return "week_summary";
  }
  return "first_upload";
}

export function buildStudyQuickStartChoiceState(input?: {
  activeQuickStart?: OnboardingQuickStartSeed | null;
}): StudyQuickStartChoiceState {
  const selectedIntent = selectedIntentForSeed(input?.activeQuickStart);
  return {
    headline: "Choose the fastest first run for the kind of pressure you are under.",
    detail:
      "Start with the lowest-friction path that matches the student’s immediate problem. OmnyID should return a useful grounded result first, then retain enough structure for Files, supertags, and linked ideas to stay useful afterward.",
    cards: [
      choiceCard("first_upload", {
        badge: "Best first win",
        emphasis: "Fastest path to immediate grounded value from real class material.",
        tone: "violet",
        selectedIntent,
        recommended: true,
      }),
      choiceCard("week_summary", {
        badge: "Lowest effort",
        emphasis: "Best when the student only has one lecture pack, tutorial sheet, or reading ready.",
        tone: "sky",
        selectedIntent,
      }),
      choiceCard("assignment_plan", {
        badge: "Stress relief",
        emphasis: "Best when the real pain is not understanding what to do first on an assignment.",
        tone: "emerald",
        selectedIntent,
      }),
      choiceCard("compare_sources", {
        badge: "Test understanding",
        emphasis: "Best when the student needs quizzes, flashcards, practice questions, or source overlaps from more than one item.",
        tone: "sky",
        selectedIntent,
      }),
      choiceCard("zettelkasten_chain", {
        badge: "Build longer memory",
        emphasis: "Best when the student wants note development and durable idea chains, not just a one-off answer.",
        tone: "amber",
        selectedIntent,
      }),
    ],
  };
}
