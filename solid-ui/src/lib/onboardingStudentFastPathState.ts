// @locs-version: 1.0
export type OnboardingStudentFastPathState = {
  eyebrow: string;
  headline: string;
  detail: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  chips: string[];
};

export function buildOnboardingStudentFastPathState(input: {
  currentStep: number;
  totalSteps: number;
}): OnboardingStudentFastPathState {
  const remainingSteps = Math.max(0, input.totalSteps - input.currentStep);
  const stepLabel = remainingSteps <= 1
    ? "You can finish preferences later."
    : `Skip ${remainingSteps} setup steps and get to study value now.`;

  return {
    eyebrow: "Student fast path",
    headline: "Have class material ready? Start with connected notes instead.",
    detail:
      `${stepLabel} OmnyID can open the study workspace with a prompt already loaded, extracted-note retention selected, and supertag/graph reuse explained before Gmail or advanced preferences.`,
    primaryActionLabel: "Skip to study quick start",
    secondaryActionLabel: "Continue setup",
    chips: [
      "lecture slides",
      "readings",
      "assignment briefs",
      "voice memos",
    ],
  };
}
