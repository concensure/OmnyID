// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "@/lib/api";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";

export type StudyFirstSessionFastLaneActionId =
  | "pick_files"
  | "use_recommended_setup"
  | "load_prompt"
  | "run_now";

export type StudyFirstSessionFastLaneCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyFirstSessionFastLaneState = {
  headline: string;
  detail: string;
  badge: string;
  cards: StudyFirstSessionFastLaneCard[];
  primaryActionId: StudyFirstSessionFastLaneActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyFirstSessionFastLaneActionId | null;
  secondaryActionLabel: string | null;
};

function usesRetainedContext(seed: OnboardingQuickStartSeed): boolean {
  return seed.flowKind === "grounded_followup" || seed.flowKind === "adjacent_source_planning";
}

function retentionDetail(mode: AttachmentRetentionMode): string {
  if (mode === "keep_file") {
    return "Original files and extracted notes stay available after the answer, which is useful when exact file recall matters.";
  }
  if (mode === "keep_nothing") {
    return "Nothing stays after the answer, so the student gets help now but has to restart later.";
  }
  return "Extracted notes stay searchable after the answer without forcing full-file storage by default.";
}

export function buildStudyFirstSessionFastLaneState(input: {
  quickStartSeed: OnboardingQuickStartSeed;
  attachedCount: number;
  supportedCount: number;
  queryReady: boolean;
  recommendedSetupReady: boolean;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
}): StudyFirstSessionFastLaneState {
  const retainedContext = usesRetainedContext(input.quickStartSeed);
  const readyToRun = (input.supportedCount > 0 || retainedContext)
    && input.queryReady
    && input.recommendedSetupReady;
  const nextSurface =
    input.quickStartSeed.knowledgeMode === "zettelkasten"
      ? "After the answer, Files and the Zettelkasten view should hold the same branch so the student can keep moving without rebuilding context."
      : "After the answer, Files and Linked ideas should hold the same topic so the student can keep studying without folder work.";

  if (!readyToRun) {
    if (!input.recommendedSetupReady) {
      return {
        headline: "One setup fix stands between this student and reusable first-session value.",
        detail: input.retentionMode === "keep_nothing"
          ? "The run can still answer now, but it will not leave behind searchable study memory in Files, supertags, or the graph."
          : "The safest first-session path is still the recommended setup: durable study memory without extra file maintenance.",
        badge: "Fix setup first",
        cards: [
          {
            label: "Immediate outcome",
            detail: input.quickStartSeed.valuePromise,
            tone: "sky",
          },
          {
            label: "What stays after the answer",
            detail: retentionDetail(input.retentionMode),
            tone: input.retentionMode === "keep_nothing" ? "amber" : "emerald",
          },
          {
            label: "Why the setup matters",
            detail: "Students under pressure need the first answer to compound into reusable context, not disappear after one run.",
            tone: "violet",
          },
        ],
        primaryActionId: "use_recommended_setup",
        primaryActionLabel: "Use recommended setup",
        secondaryActionId: input.queryReady ? "run_now" : "load_prompt",
        secondaryActionLabel: input.queryReady ? "Run anyway" : "Load study prompt",
      };
    }

    if (!input.queryReady) {
      return {
        headline: retainedContext
          ? "This study focus is ready; the next grounded prompt is the only missing step."
          : input.supportedCount > 0
            ? "The sources are ready; the grounded prompt is the only missing step."
            : "The first fast path still needs one readable source and one grounded prompt.",
        detail: retainedContext
          ? "Keep the momentum inside the same retained context so the student does not have to restate course material."
          : input.supportedCount > 0
            ? "A loaded grounded prompt should turn the current source set into a useful first answer immediately."
            : "Attach one readable class source and load the suggested prompt so the first answer is based on real material, not generic model output.",
        badge: retainedContext || input.supportedCount > 0 ? "Load prompt next" : "One source needed",
        cards: [
          {
            label: "Immediate outcome",
            detail: input.quickStartSeed.valuePromise,
            tone: "sky",
          },
          {
            label: "What stays after the answer",
            detail: retentionDetail(input.retentionMode),
            tone: "emerald",
          },
          {
            label: "Next surface",
            detail: nextSurface,
            tone: input.knowledgeMode === "zettelkasten" ? "violet" : "emerald",
          },
        ],
        primaryActionId: input.supportedCount > 0 || retainedContext ? "load_prompt" : "pick_files",
        primaryActionLabel: input.supportedCount > 0 || retainedContext ? "Load grounded prompt" : "Choose study files",
        secondaryActionId: input.supportedCount > 0 || retainedContext ? "run_now" : "load_prompt",
        secondaryActionLabel: input.supportedCount > 0 || retainedContext ? "Run if ready" : "Review loaded prompt",
      };
    }
  }

  return {
    headline: retainedContext
      ? "This retained study focus is ready for immediate value."
      : input.knowledgeMode === "zettelkasten"
        ? "This first session is ready to create a durable note chain."
        : "This first session is ready to produce immediate study value.",
    detail: retainedContext
      ? "Run now from the current retained context, then deepen the same thread instead of widening into unrelated material."
      : input.supportedCount >= 2
        ? "The current sources are strong enough for grounded comparison now and stronger retrieval later."
        : "One grounded source is enough to create value now, and the next related source will strengthen the same topic later.",
    badge: retainedContext
      ? "Retained context ready"
      : input.knowledgeMode === "zettelkasten"
        ? "Note chain ready"
        : "Study answer ready",
    cards: [
      {
        label: "Immediate outcome",
        detail: input.quickStartSeed.valuePromise,
        tone: "sky",
      },
      {
        label: "What stays after the answer",
        detail: retentionDetail(input.retentionMode),
        tone: "emerald",
      },
      {
        label: "Next surface",
        detail: nextSurface,
        tone: input.knowledgeMode === "zettelkasten" ? "violet" : "emerald",
      },
    ],
    primaryActionId: "run_now",
    primaryActionLabel: retainedContext
      ? input.quickStartSeed.flowKind === "adjacent_source_planning"
        ? "Plan next source"
        : "Run grounded follow-up"
      : input.knowledgeMode === "zettelkasten"
        ? "Start first source note"
        : "Run first study answer",
    secondaryActionId: input.supportedCount === 1 && !retainedContext ? "pick_files" : "load_prompt",
    secondaryActionLabel: input.supportedCount === 1 && !retainedContext ? "Add one more source" : "Review prompt",
  };
}
