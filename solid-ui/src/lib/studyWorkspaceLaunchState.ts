// @locs-version: 1.0
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";

export type StudyWorkspaceLaunchActionId =
  | "pick_files"
  | "use_recommended_setup"
  | "load_prompt"
  | "run_now";

export type StudyWorkspaceLaunchState = {
  headline: string;
  detail: string;
  tone: "sky" | "emerald" | "amber";
  primaryActionId: StudyWorkspaceLaunchActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyWorkspaceLaunchActionId | null;
  secondaryActionLabel: string | null;
  checklist: string[];
};

export function buildStudyWorkspaceLaunchState(input: {
  quickStartSeed: OnboardingQuickStartSeed | null | undefined;
  attachedCount: number;
  supportedCount: number;
  recommendedSetupReady: boolean;
  queryReady: boolean;
}): StudyWorkspaceLaunchState | null {
  const seed = input.quickStartSeed;
  if (!seed || seed.entryPoint !== "onboarding") return null;

  const checklist = seed.checklist.slice(0, 3);

  if (!input.recommendedSetupReady) {
    return {
      headline: "This student launch is almost ready, but the memory setup needs one fix.",
      detail:
        seed.knowledgeMode === "zettelkasten"
          ? "Switch back to the recommended Zettelkasten plus kept extracted notes setup so the first run creates durable note-chain memory instead of a one-off answer."
          : "Switch back to the recommended connected-notes plus kept extracted notes setup so the first run becomes reusable study memory.",
      tone: "amber",
      primaryActionId: "use_recommended_setup",
      primaryActionLabel: "Use recommended setup",
      secondaryActionId: input.supportedCount > 0 && input.queryReady ? "run_now" : "pick_files",
      secondaryActionLabel: input.supportedCount > 0 && input.queryReady ? "Run anyway" : "Choose study files",
      checklist,
    };
  }

  if (input.supportedCount > 0 && input.queryReady) {
    return {
      headline:
        seed.knowledgeMode === "zettelkasten"
          ? "Your first note-chain run is ready."
          : "Your first study run is ready.",
      detail:
        input.supportedCount > 1
          ? "You already have enough readable material to get a grounded result immediately and keep it searchable through Files, supertags, and linked ideas."
          : "One readable source is enough to land a grounded first result now. Add a second related source later if you want stronger overlap and graph density.",
      tone: "emerald",
      primaryActionId: "run_now",
      primaryActionLabel:
        seed.knowledgeMode === "zettelkasten" ? "Start first note chain" : "Run first study pass",
      secondaryActionId: "pick_files",
      secondaryActionLabel: "Add another source",
      checklist,
    };
  }

  if (input.attachedCount > 0 && input.supportedCount === 0) {
    return {
      headline: "Your files are attached, but OmnyID still needs one readable study source.",
      detail: "Use PDF, DOCX, Markdown, TXT, CSV, image, or common audio so the first study run can extract concepts, apply supertags, and keep the result searchable.",
      tone: "amber",
      primaryActionId: "pick_files",
      primaryActionLabel: "Add readable file",
      secondaryActionId: "load_prompt",
      secondaryActionLabel: "Keep prompt ready",
      checklist,
    };
  }

  return {
    headline: "Start with one real class source and OmnyID will handle the organisation layer.",
    detail:
      seed.knowledgeMode === "zettelkasten"
        ? "Attach one lecture, reading, or rough note with a strong idea, then run the loaded prompt so the first result becomes the start of a reusable note chain."
        : "Attach one lecture PDF, reading, rough note, or recording, then run the loaded prompt so the first result becomes connected notes instead of another disconnected file.",
    tone: "sky",
    primaryActionId: "pick_files",
    primaryActionLabel: "Choose study files",
    secondaryActionId: input.queryReady ? "run_now" : "load_prompt",
    secondaryActionLabel: input.queryReady ? "Run when ready" : "Review prompt",
    checklist,
  };
}
