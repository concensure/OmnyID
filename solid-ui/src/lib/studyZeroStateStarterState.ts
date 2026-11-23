// @locs-version: 1.0
import {
  DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  studentQuickStartForIntent,
  type StudentQuickStartIntent,
} from "@/lib/onboardingQuickStart";

export type StudyZeroStateStarterAction = {
  intent: StudentQuickStartIntent;
  label: string;
  title: string;
  detail: string;
  recommended: boolean;
  tone: "violet" | "sky" | "emerald" | "amber";
};

export type StudyZeroStateStarterState = {
  eyebrow: string;
  headline: string;
  detail: string;
  recommendedRetentionLabel: string;
  recommendedRetentionDetail: string;
  timeToValueLabel: string;
  firstOutputs: string[];
  starterActions: StudyZeroStateStarterAction[];
};

export function buildStudyZeroStateStarterState(input: {
  surface: "files" | "graph";
}): StudyZeroStateStarterState {
  const recommendedIntent: StudentQuickStartIntent =
    input.surface === "graph" ? "compare_sources" : "first_upload";
  const recommendedSeed = studentQuickStartForIntent(recommendedIntent);

  return {
    eyebrow: input.surface === "graph" ? "Build linked study memory" : "Build searchable study memory",
    headline:
      input.surface === "graph"
        ? "Start one grounded study run so linked ideas can form automatically."
        : "Start one grounded study run so retained study files appear here automatically.",
    detail:
      input.surface === "graph"
        ? "The graph becomes useful when OmnyID can connect at least one lecture source with a nearby reading, note, or voice memo. The first run should give immediate revision value and also leave reusable links behind."
        : "The file library becomes useful after the first grounded study run keeps extracted notes or the original file. The fastest path is to upload one lecture source, keep extracted notes only, and ask for what matters most.",
    recommendedRetentionLabel: "Recommended default: Keep extracted notes only",
    recommendedRetentionDetail:
      "This preserves searchable study value, supertags, and graph reuse without forcing raw-file storage by default.",
    timeToValueLabel: recommendedSeed.timeToValueLabel ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START.timeToValueLabel ?? "Useful answer in the first run",
    firstOutputs:
      recommendedSeed.firstOutputs
      ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START.firstOutputs
      ?? [
        "Grounded concepts from the uploaded study material",
        "A clear next study step",
        "Retained notes that stay searchable afterward",
      ],
    starterActions: [
      {
        intent: recommendedIntent,
        label: input.surface === "graph" ? "Best graph starter" : "Fastest first run",
        title: recommendedSeed.label,
        detail: recommendedSeed.description,
        recommended: true,
        tone: "violet",
      },
      {
        intent: "week_summary",
        label: "Lecture triage",
        title: studentQuickStartForIntent("week_summary").label,
        detail: studentQuickStartForIntent("week_summary").description,
        recommended: false,
        tone: "sky",
      },
      {
        intent: "zettelkasten_chain",
        label: "Long-term notes",
        title: studentQuickStartForIntent("zettelkasten_chain").label,
        detail: studentQuickStartForIntent("zettelkasten_chain").description,
        recommended: false,
        tone: "violet",
      },
      {
        intent: "assignment_plan",
        label: "Stress relief",
        title: studentQuickStartForIntent("assignment_plan").label,
        detail: studentQuickStartForIntent("assignment_plan").description,
        recommended: false,
        tone: "emerald",
      },
      {
        intent: "lecture_audio",
        label: "Missed lecture",
        title: studentQuickStartForIntent("lecture_audio").label,
        detail: studentQuickStartForIntent("lecture_audio").description,
        recommended: false,
        tone: "amber",
      },
    ],
  };
}
